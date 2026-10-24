import * as THREE from 'three/webgpu';
import {
  builtinAOContext,
  diffuseColor,
  float,
  int,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  sample,
  screenUV,
  smoothstep,
  uniform,
  unpackRGBToNormal,
  vec2,
  vec4,
  velocity,
} from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { godrays } from 'three/addons/tsl/display/GodraysNode.js';
import { bilateralBlur } from 'three/addons/tsl/display/BilateralBlurNode.js';
import { depthAwareBlend } from 'three/addons/tsl/display/depthAwareBlend.js';
import type { Quality } from './quality';

// Постобработка на TSL (RenderPipeline, r186). Граф собирается под пресет качества и локацию.

export interface PostOptions {
  bloom?: { strength: number; radius: number; threshold: number };
  /** Объёмные лучи от направленного или точечного света с тенью */
  godrays?: {
    light: THREE.DirectionalLight | THREE.PointLight;
    color: THREE.ColorRepresentation;
    density?: number;
    maxDensity?: number;
  };
  vignette?: number;
  ao?: { radius?: number; intensity?: number };
}

export class PostFX {
  readonly pipeline: THREE.RenderPipeline;
  /** Сила виньетки — меняется на лету (затемнения, крупные планы) */
  readonly vignette = uniform(0.35);
  private disposables: { dispose(): void }[] = [];

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, q: Quality, opts: PostOptions = {}) {
    this.pipeline = new THREE.RenderPipeline(renderer);
    this.vignette.value = opts.vignette ?? 0.35;

    let color: THREE.Node<'vec4'>;
    let depth: THREE.TextureNode;
    let vel: THREE.TextureNode | null = null;

    if (q.ao === 'gtao') {
      // Предпроход: нормали и скорости; AO подмешивается только в непрямой свет сцены
      const pre = pass(scene, camera);
      pre.transparent = false;
      pre.setMRT(mrt({ output: packNormalToRGB(normalView), velocity }));
      pre.getTexture('output').type = THREE.UnsignedByteType;
      const normal = sample((uv) => unpackRGBToNormal(pre.getTextureNode().sample(uv)));
      depth = pre.getTextureNode('depth');
      vel = pre.getTextureNode('velocity');
      const aoPass = ao(depth, normal, camera);
      aoPass.resolutionScale = 0.5;
      if (opts.ao?.radius) aoPass.radius.value = opts.ao.radius;
      const scenePass = pass(scene, camera, q.traa ? {} : { samples: 4 });
      scenePass.contextNode = builtinAOContext(aoPass.getTextureNode().sample(screenUV).r);
      color = scenePass as unknown as THREE.Node<'vec4'>;
      this.disposables.push(pre, aoPass, scenePass);
    } else if (q.ao === 'ssgi') {
      const scenePass = pass(scene, camera);
      scenePass.setMRT(mrt({ output, diffuseColor, normal: packNormalToRGB(normalView), velocity }));
      scenePass.getTexture('diffuseColor').type = THREE.UnsignedByteType;
      scenePass.getTexture('normal').type = THREE.UnsignedByteType;
      const sceneColor = scenePass.getTextureNode('output');
      const diffuse = scenePass.getTextureNode('diffuseColor');
      const normalTex = scenePass.getTextureNode('normal');
      const normal = sample((uv) => unpackRGBToNormal(normalTex.sample(uv)));
      depth = scenePass.getTextureNode('depth');
      vel = scenePass.getTextureNode('velocity');
      const gi = ssgi(sceneColor, depth, normal, camera as THREE.PerspectiveCamera);
      gi.sliceCount.value = 2;
      gi.stepCount.value = 10;
      gi.aoIntensity.value = opts.ao?.intensity ?? 1;
      gi.giIntensity.value = 6;
      if (opts.ao?.radius) gi.radius.value = opts.ao.radius;
      color = vec4(sceneColor.rgb.mul(gi.getAONode()).add(diffuse.rgb.mul(gi.getGINode().rgb)), sceneColor.a);
      this.disposables.push(scenePass, gi);
    } else {
      const scenePass = pass(scene, camera, q.traa ? {} : { samples: 4 });
      if (q.traa) scenePass.setMRT(mrt({ output, velocity }));
      color = (q.traa ? scenePass.getTextureNode('output') : scenePass) as unknown as THREE.Node<'vec4'>;
      depth = scenePass.getTextureNode('depth');
      if (q.traa) vel = scenePass.getTextureNode('velocity');
      this.disposables.push(scenePass);
    }

    if (q.godrays && opts.godrays) {
      const g = godrays(depth, camera, opts.godrays.light);
      g.density.value = opts.godrays.density ?? 0.006;
      g.maxDensity.value = opts.godrays.maxDensity ?? 0.6;
      const blur = bilateralBlur(g.getTextureNode());
      color = depthAwareBlend(color, blur.getTextureNode(), depth, camera, {
        blendColor: uniform(new THREE.Color(opts.godrays.color)),
        edgeRadius: uniform(int(2)),
        edgeStrength: uniform(2),
      });
      this.disposables.push(g, blur);
    }

    if (q.traa && vel) {
      const t = traa(color, depth, vel, camera);
      // GTAO шумит по кадрам — субпиксельная коррекция мешает его усреднять
      if (q.ao !== 'off') t.useSubpixelCorrection = false;
      color = t as unknown as THREE.Node<'vec4'>;
      this.disposables.push(t);
    }

    if (q.bloom && opts.bloom) {
      const b = bloom(color, opts.bloom.strength, opts.bloom.radius, opts.bloom.threshold);
      color = color.add(b);
      this.disposables.push(b);
    }

    // Мягкая виньетка до тональной коррекции
    const vig = smoothstep(float(0.95), float(0.2), screenUV.sub(vec2(0.5)).length().mul(1.25));
    const shade = float(1).sub(this.vignette).add(this.vignette.mul(vig));
    this.pipeline.outputNode = vec4(color.rgb.mul(shade), float(1));
  }

  render() {
    this.pipeline.render();
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.pipeline.dispose();
  }
}

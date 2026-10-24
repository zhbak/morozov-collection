import * as THREE from 'three/webgpu';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js';
import type { Quality } from './quality';

export async function createRenderer(canvas: HTMLCanvasElement, q: Quality, forceWebGL: boolean) {
  // antialias не нужен: края сглаживает TRAA или MSAA в проходе сцены
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL });
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.library.addLight(SunLightNode, SunLight);
  // Прямоугольные источники (световой фонарь в потолке) требуют LTC-таблиц
  THREE.RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init());
  await renderer.init();
  return renderer;
}

/** 'webgpu' или 'webgl2' — WebGPURenderer сам откатывается, если WebGPU нет */
export function backendName(renderer: THREE.WebGPURenderer) {
  return (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl2';
}

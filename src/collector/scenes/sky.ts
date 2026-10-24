import * as THREE from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { SunLight } from 'three/addons/lights/SunLight.js';

// Процедурное небо и солнце с каскадными тенями; окружение для PBR снимается с того же неба.

export interface SunOptions {
  /** Высота солнца над горизонтом, градусы */
  elevation: number;
  /** Азимут, градусы */
  azimuth: number;
  intensity: number;
  color: THREE.ColorRepresentation;
  shadowFar: number;
  shadowMapSize: number;
}

export function addSkyAndSun(scene: THREE.Scene, renderer: THREE.WebGPURenderer, o: SunOptions) {
  const sky = new SkyMesh();
  sky.scale.setScalar(2500);
  sky.turbidity.value = 5;
  sky.rayleigh.value = 2.6;
  sky.mieCoefficient.value = 0.0035;
  sky.mieDirectionalG.value = 0.82;
  sky.cloudCoverage.value = 0.32;
  sky.cloudDensity.value = 0.35;
  sky.cloudSpeed.value = 0.000004;

  const sun = new SunLight(o.color, o.intensity);
  sun.position.setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - o.elevation),
    THREE.MathUtils.degToRad(o.azimuth),
  );
  sun.castShadow = true;
  sun.shadow.camera.far = o.shadowFar;
  sun.shadow.mapSize.setScalar(o.shadowMapSize);
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  sky.sunPosition.value.copy(sun.position);
  scene.add(sky, sun);

  // Окружение — с неба без облачного шума; пересчитывать только при смене солнца
  const envScene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  envScene.add(sky);
  const env = pmrem.fromScene(envScene, 0.02);
  scene.add(sky);
  scene.environment = env.texture;
  pmrem.dispose();

  return {
    sky,
    sun,
    dispose() {
      env.dispose();
    },
  };
}

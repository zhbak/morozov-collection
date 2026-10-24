import * as THREE from 'three/webgpu';
import { SPZLoader } from 'three/addons/loaders/SPZLoader.js';
import { GaussianSplat } from 'three/addons/objects/GaussianSplat.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Level, LevelContext } from './level';

// Спайк B: улица из мира World Labs (гауссовы сплаты) поверх нашего движка. Только dev-сервер:
// файлы лежат в assets/cache/worlds/<id>/ (в git и сборку не идут). ?loc=splat&world=<id>

export async function buildSplatStreet(ctx: LevelContext): Promise<Level> {
  const id = new URLSearchParams(location.search).get('world') ?? 'street-draft';
  const base = `/assets/cache/worlds/${id}/`;
  const meta = await fetch(`${base}world.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const world = meta?.response?.world ?? meta?.response ?? {};
  const sem = world.assets?.splats?.semantics_metadata ?? { metric_scale_factor: 1, ground_plane_offset: 0 };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb2c8);

  // Оси World Labs (OpenCV: y вниз) → three: поворот на π по X, масштаб в метры, земля в y = 0
  const root = new THREE.Group();
  root.rotation.x = Math.PI;
  root.scale.setScalar(sem.metric_scale_factor ?? 1);
  root.position.y = sem.ground_plane_offset ?? 0;
  scene.add(root);

  const quality = new URLSearchParams(location.search).get('splat') ?? '500k';
  const data = await new SPZLoader().loadAsync(`${base}splat-${quality}.spz`);
  const splat = new GaussianSplat(data, { autoSort: true });
  root.add(splat);

  // Коллайдер-меш — только для физики, невидим
  const col = await new GLTFLoader().loadAsync(`${base}collider.glb`).catch(() => null);
  if (col) {
    col.scene.visible = false;
    root.add(col.scene);
    root.updateMatrixWorld(true);
    ctx.physics.addTrimesh(col.scene);
  } else ctx.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 100, y: 0.5, z: 100 });

  // Персонаж освещается обычным светом: тёплое солнце и небо, сплаты свой свет уже «запекли»
  const sun = new THREE.DirectionalLight(0xffb070, 4);
  sun.position.set(-10, 12, -20);
  sun.castShadow = true;
  scene.add(sun, new THREE.HemisphereLight(0xbcd0ee, 0x6a5440, 1.2));

  return {
    id: 'street',
    scene,
    spawn: { position: new THREE.Vector3(0, 0.05, 0), facing: 0 },
    toneMapping: THREE.NeutralToneMapping,
    exposure: 1,
    post: { bloom: { strength: 0.08, radius: 0.4, threshold: 1.5 }, vignette: 0.3 },
    interactables: [],
    dispose() {
      splat.geometry.dispose();
    },
  };
}

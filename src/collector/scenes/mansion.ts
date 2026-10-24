import * as THREE from 'three/webgpu';
import type { Interactable, Level, LevelContext } from './level';
import { GeoBuilder } from './kit/geo';
import { Kit, placeModel } from './kit/materials';
import { framedPainting } from './kit/painting';
import { PAINTINGS } from '../content/paintings';

// Зал особняка Морозова на Пречистенке. Стилизация: размеры, цвета и мебель условны.
// По фактам (facts.md, v2): Кекушев встроил в крышу стеклянный фонарь и сделал отделку нейтральной —
// поэтому зал с верхним светом и спокойными стенами. Комната: x ∈ [−8, 8], z ∈ [−6, 6], высота 5.6.

const W = 6.5;
const D = 5.2;
const H = 5.2;
const HANG_Y = 2.05;
const TO_SUN = new THREE.Vector3(-0.45, 0.32, 0.83).normalize();

export const SLOTS: { id: string; pos: THREE.Vector3; rotY: number }[] = [
  { id: 'back-left', pos: new THREE.Vector3(-3.7, HANG_Y, -D + 0.07), rotY: 0 },
  { id: 'back-center', pos: new THREE.Vector3(0, HANG_Y + 0.1, -D + 0.07), rotY: 0 },
  { id: 'back-right', pos: new THREE.Vector3(3.7, HANG_Y, -D + 0.07), rotY: 0 },
  { id: 'left', pos: new THREE.Vector3(-W + 0.07, HANG_Y, -1.0), rotY: Math.PI / 2 },
  { id: 'right', pos: new THREE.Vector3(W - 0.07, HANG_Y, -1.0), rotY: -Math.PI / 2 },
];

export async function buildMansion(ctx: LevelContext): Promise<Level> {
  const { physics, renderer, quality, actions, session } = ctx;
  const kit = new Kit(ctx.assets, 12);
  const scene = new THREE.Scene();
  const b = new GeoBuilder();

  const wallC = new THREE.Color(0.9, 0.88, 0.82);
  const cream = new THREE.Color(1, 0.98, 0.93);
  b.boxMinMax('floor', -W - 0.5, -0.2, -D - 0.5, W + 0.5, 0, D + 0.5);
  // Потолок со стеклянным фонарём
  const LX = 4.2;
  const LZ = 3.0;
  b.boxMinMax('ceiling', -W - 0.5, H, -D - 0.5, W + 0.5, H + 0.3, -LZ, undefined, cream);
  b.boxMinMax('ceiling', -W - 0.5, H, LZ, W + 0.5, H + 0.3, D + 0.5, undefined, cream);
  b.boxMinMax('ceiling', -W - 0.5, H, -LZ, -LX, H + 0.3, LZ, undefined, cream);
  b.boxMinMax('ceiling', LX, H, -LZ, W + 0.5, H + 0.3, LZ, undefined, cream);
  for (const [x0, z0, x1, z1] of [
    [-LX, -LZ, LX, -LZ + 0.25],
    [-LX, LZ - 0.25, LX, LZ],
    [-LX, -LZ, -LX + 0.25, LZ],
    [LX - 0.25, -LZ, LX, LZ],
  ])
    b.boxMinMax('trim', x0, H - 0.3, z0, x1, H, z1, undefined, cream);
  for (let x = -LX + 1.05; x < LX - 0.5; x += 1.04) b.boxMinMax('iron', x - 0.025, H + 0.25, -LZ, x + 0.025, H + 0.32, LZ);
  for (let z = -LZ + 1.2; z < LZ - 0.5; z += 1.2) b.boxMinMax('iron', -LX, H + 0.25, z - 0.025, LX, H + 0.32, z + 0.025);
  b.boxMinMax('skyglass', -LX, H + 0.7, -LZ, LX, H + 0.72, LZ);
  // Стены с пилястрами, высоким цоколем и карнизом
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    b.boxMinMax('wall', x0, 0, z0, x1, H, z1, undefined, wallC);
  };
  wall(-W - 0.3, -D - 0.3, W + 0.3, -D);
  wall(-W - 0.3, -D, -W, D);
  wall(W, -D, W + 0.3, D);
  for (const [x0, z0, x1, z1, axis] of [
    [-W, -D, W, -D + 0.06, 'x'],
    [-W, -D, -W + 0.06, D, 'z'],
    [W - 0.06, -D, W, D, 'z'],
  ] as const) {
    b.boxMinMax('trim', x0, 0, z0, x1, 0.28, z1, undefined, cream);
    b.boxMinMax('trim', x0, 0.85, z0, x1, 0.92, z1, undefined, cream);
    b.boxMinMax('trim', x0, H - 0.5, z0, x1, H, z1, undefined, cream);
    b.boxMinMax('trim', x0, H - 0.62, z0, x1, H - 0.56, z1, undefined, cream);
    // Пилястры между местами для картин
    for (const k of axis === 'x' ? [-5.6, -1.85, 1.85, 5.6] : [-3.6, 1.6]) {
      const [px0, pz0, px1, pz1] =
        axis === 'x' ? [k - 0.28, z0, k + 0.28, z1 + 0.1] : [x0 < 0 ? x0 : x1 - 0.1, k - 0.28, x0 < 0 ? x0 + 0.1 : x1, k + 0.28];
      b.boxMinMax('trim', px0, 0.28, pz0, px1, H - 0.62, pz1, undefined, cream);
    }
  }
  // Оконная стена
  const zs = D;
  const wins = [-4.4, -1.45, 1.45, 4.4].map((c) => ({ x0: c - 0.75, x1: c + 0.75, y0: 0.8, y1: 4.1 }));
  let x = -W - 0.3;
  for (const o of wins) {
    b.boxMinMax('wall', x, 0, zs, o.x0, H, zs + 0.5, undefined, wallC);
    b.boxMinMax('wall', o.x0, 0, zs, o.x1, o.y0, zs + 0.5, undefined, wallC);
    b.boxMinMax('wall', o.x0, o.y1, zs, o.x1, H, zs + 0.5, undefined, wallC);
    x = o.x1;
    const fz = zs + 0.2;
    for (const [a0, a1, c0, c1] of [
      [o.x0, o.x0 + 0.08, o.y0, o.y1],
      [o.x1 - 0.08, o.x1, o.y0, o.y1],
      [(o.x0 + o.x1) / 2 - 0.035, (o.x0 + o.x1) / 2 + 0.035, o.y0, o.y1],
    ])
      b.boxMinMax('frame', a0, c0, fz, a1, c1, fz + 0.08);
    for (const yy of [o.y0, o.y0 + 1.2, o.y0 + 2.4, o.y1 - 0.08]) b.boxMinMax('frame', o.x0, yy, fz, o.x1, yy + 0.06, fz + 0.07);
    b.boxMinMax('glass', o.x0, o.y0, fz + 0.03, o.x1, o.y1, fz + 0.035);
    b.boxMinMax('trim', o.x0 - 0.12, o.y0 - 0.06, zs - 0.12, o.x1 + 0.12, o.y0, zs + 0.05, undefined, cream);
    // Портьеры
    b.boxMinMax('drape', o.x0 - 0.45, 0.05, zs - 0.18, o.x0 + 0.05, H - 0.65, zs - 0.08, undefined, new THREE.Color(0.42, 0.12, 0.1));
    b.boxMinMax('drape', o.x1 - 0.05, 0.05, zs - 0.18, o.x1 + 0.45, H - 0.65, zs - 0.08, undefined, new THREE.Color(0.42, 0.12, 0.1));
  }
  b.boxMinMax('wall', x, 0, zs, W + 0.3, H, zs + 0.5, undefined, wallC);
  b.boxMinMax('outside', -W - 6, -2, D + 12, W + 6, H + 8, D + 12.2, undefined, new THREE.Color(1.5, 1.6, 1.75));

  const [floorM, wallM, trimM] = await Promise.all([
    kit.pbr('herringbone_parquet', { color: 0xd9c3a5, normalStrength: 0.7 }),
    kit.pbr('plastered_wall_02', { vertexColors: true, color: 0xffffff, normalStrength: 0.4 }),
    kit.pbr('beige_wall_001', { vertexColors: true, color: 0xffffff, normalStrength: 0.5 }),
  ]);
  const shell = b.build(
    {
      floor: floorM,
      wall: wallM,
      trim: trimM,
      ceiling: trimM,
      frame: new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.5 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xe6eef4, roughness: 0.02, transparent: true, opacity: 0.08, depthWrite: false }),
      drape: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.5, roughness: 0.6 }),
      skyglass: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.78, 1.9) }),
      outside: new THREE.MeshBasicMaterial({ vertexColors: true }),
    },
    { floor: 0.55, wall: 0.4, trim: 0.5, ceiling: 0.3 },
    ['glass', 'outside', 'skyglass'],
  );
  scene.add(shell);

  // --- Свет: холодный дневной из окон, тёплая люстра
  const sun = new THREE.DirectionalLight(0xdfe8ff, 3.5);
  sun.position.copy(TO_SUN).multiplyScalar(30);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(Math.max(2048, quality.shadowMapSize));
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  Object.assign(sc, { left: -12, right: 12, top: 10, bottom: -10, near: 5, far: 60 });
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  // Верхний свет из фонаря — ровный, рассеянный, как в галерее
  const top = new THREE.RectAreaLight(0xf4f1ea, 5.5, LX * 2, LZ * 2);
  top.position.set(0, H + 0.6, 0);
  top.lookAt(0, 0, 0);
  scene.add(top);
  const fill = new THREE.HemisphereLight(0xf2efe8, 0x6a5440, 0.55);
  scene.add(fill);
  const lamp = new THREE.PointLight(0xffc27a, 8, 12, 2);
  lamp.position.set(0, H - 1.6, -0.5);
  scene.add(lamp);

  await Promise.all([
    placeModel(kit, scene, null, 'Chandelier_03', { fit: { height: 1.5 }, at: [0, H - 1.55, -0.5] }),
    placeModel(kit, scene, physics, 'sofa_03', { fit: { width: 2.0 }, at: [0, 0, 1.3], rotY: Math.PI }),
    placeModel(kit, scene, physics, 'ArmChair_01', { fit: { height: 1.0 }, at: [-2.2, 0, 0.9], rotY: Math.PI - 0.5 }),
    placeModel(kit, scene, physics, 'ArmChair_01', { fit: { height: 1.0 }, at: [2.2, 0, 0.9], rotY: Math.PI + 0.5 }),
    placeModel(kit, scene, physics, 'ClassicConsole_01', { fit: { width: 1.3 }, at: [W - 0.42, 0, 2.9], rotY: -Math.PI / 2 }),
    placeModel(kit, scene, physics, 'crates', { fit: { height: 1.1 }, at: [-5.2, 0, 3.5], rotY: 0.6 }),
  ]);

  // --- Места для картин: светлый след на стене и латунный крюк
  const texLoader = new THREE.TextureLoader();
  const hungObjects = new Map<string, THREE.Object3D>();
  const marks = new Map<string, THREE.Object3D>();
  for (const s of SLOTS) {
    const g = new THREE.Group();
    // Чуть светлее стены — как след от снятой картины
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, transparent: true, opacity: 0.12 }));
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 6, 12), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 }));
    hook.position.set(0, 0.62, 0.02);
    mark.position.z = 0.005;
    g.add(mark, hook);
    g.position.copy(s.pos);
    g.rotation.y = s.rotY;
    scene.add(g);
    marks.set(s.id, g);
  }

  const showHung = async () => {
    for (const s of SLOTS) {
      const id = session.state.hung[s.id];
      const prev = hungObjects.get(s.id);
      if (prev && prev.userData.painting === id) continue;
      if (prev) scene.remove(prev), hungObjects.delete(s.id);
      marks.get(s.id)!.visible = !id;
      if (!id) continue;
      const p = PAINTINGS.find((pp) => pp.id === id);
      if (!p) continue;
      const tex = await texLoader.loadAsync(`${ctx.assets}paintings/${p.file}-2048.webp`).catch(() => null);
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 16;
      }
      const f = framedPainting(tex, p.size[0] / 100, p.size[1] / 100);
      f.group.position.copy(s.pos);
      f.group.rotation.y = s.rotY;
      f.group.userData.painting = id;
      scene.add(f.group);
      hungObjects.set(s.id, f.group);
    }
  };
  await showHung();
  const off = session.onChange(() => void showHung());

  // --- Коллизии
  physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: W + 1, y: 0.5, z: D + 1 });
  physics.addBox({ x: 0, y: H / 2, z: -D - 0.5 }, { x: W + 1, y: H / 2, z: 0.5 });
  physics.addBox({ x: 0, y: H / 2, z: D + 0.5 }, { x: W + 1, y: H / 2, z: 0.5 });
  physics.addBox({ x: -W - 0.5, y: H / 2, z: 0 }, { x: 0.5, y: H / 2, z: D + 1 });
  physics.addBox({ x: W + 0.5, y: H / 2, z: 0 }, { x: 0.5, y: H / 2, z: D + 1 });

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.04, 0.1, 40, { position: new THREE.Vector3(0, 1.7, 0), size: 256 });
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.8;

  const interactables: Interactable[] = SLOTS.map((s) => {
    const n = new THREE.Vector3(Math.sin(s.rotY), 0, Math.cos(s.rotY));
    const stand = s.pos.clone().addScaledVector(n, 1.7);
    stand.y = 0;
    return {
      id: `slot:${s.id}`,
      position: stand,
      target: s.pos,
      radius: 1.9,
      enabled: () => session.state.owned.length > 0,
      get label() {
        return session.state.hung[s.id] ? 'E — перевесить картину' : 'E — повесить картину сюда';
      },
      action: () =>
        actions.chooseHanging(s.id, {
          position: s.pos.clone().addScaledVector(n, 3.4).add(new THREE.Vector3(0, -0.05, 0)),
          target: s.pos.clone(),
          fov: 45,
        }),
    };
  });

  return {
    id: 'mansion',
    scene,
    spawn: { position: new THREE.Vector3(0.8, 0, 2.7), facing: 0 },
    toneMapping: THREE.NeutralToneMapping,
    exposure: 0.9,
    post: {
      bloom: { strength: 0.12, radius: 0.5, threshold: 1.3 },
      godrays: { light: sun, color: 0xdde8ff, density: 0.5, maxDensity: 0.3, attenuation: 1 },
      vignette: 0.34,
      ao: { radius: 0.5 },
    },
    interactables,
    dispose() {
      off();
      env.dispose();
    },
  };
}

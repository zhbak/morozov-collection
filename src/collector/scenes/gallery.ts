import * as THREE from 'three/webgpu';
import type { Interactable, Level, LevelContext } from './level';
import { GeoBuilder } from './kit/geo';
import { fitModel, Kit } from './kit/materials';
import { framedPainting } from './kit/painting';
import { PAINTINGS } from '../content/paintings';
import type { PaintingInfo } from '../content/types';

// Зал торговца картинами в Париже. Стилизация: устройство зала, мебель и развеска условны.
// Комната: x ∈ [−5.5, 5.5], z ∈ [−4.5, 4.5], высота 4.6. Улица — за стеной z = +4.5.
// Зал небольшой: картины натурального размера (≈ 0.7–0.9 м) в огромном зале терялись.

const W = 5.5;
const D = 4.5;
const H = 4.6;
const DADO = 1.1;
/** Солнце снаружи, справа от улицы: пятна ложатся на пол и панели, а не на картины */
const TO_SUN = new THREE.Vector3(0.5, 0.62, 0.6).normalize();

interface Spot {
  /** Центр холста */
  pos: THREE.Vector3;
  /** Поворот вокруг Y: 0 — картина смотрит в +z */
  rotY: number;
  easel?: boolean;
}

const SPOTS: Spot[] = [
  { pos: new THREE.Vector3(-3.0, 1.78, -D + 0.06), rotY: 0 },
  { pos: new THREE.Vector3(3.0, 1.78, -D + 0.06), rotY: 0 },
  { pos: new THREE.Vector3(-W + 0.06, 1.75, -0.9), rotY: Math.PI / 2 },
  { pos: new THREE.Vector3(W - 0.06, 1.75, -0.9), rotY: -Math.PI / 2 },
  { pos: new THREE.Vector3(-1.7, 1.55, 1.0), rotY: 0.55, easel: true },
];

export async function buildGallery(ctx: LevelContext): Promise<Level> {
  const { physics, renderer, quality, actions, session } = ctx;
  const kit = new Kit(ctx.assets, 12);
  const scene = new THREE.Scene();
  const b = new GeoBuilder();

  // --- Оболочка зала
  const wood = new THREE.Color(0.24, 0.14, 0.08);
  const cream = new THREE.Color(1, 1, 1);
  const fabric = new THREE.Color(0.55, 0.22, 0.2);
  b.boxMinMax('floor', -W - 0.5, -0.2, -D - 0.5, W + 0.5, 0, D + 0.5);
  const SX = 2.4;
  const SZ = 1.9;
  b.boxMinMax('ceiling', -W - 0.5, H, -D - 0.5, W + 0.5, H + 0.3, -SZ);
  b.boxMinMax('ceiling', -W - 0.5, H, SZ, W + 0.5, H + 0.3, D + 0.5);
  b.boxMinMax('ceiling', -W - 0.5, H, -SZ, -SX, H + 0.3, SZ);
  b.boxMinMax('ceiling', SX, H, -SZ, W + 0.5, H + 0.3, SZ);
  // Световой фонарь в потолке
  b.boxMinMax('trim', -SX, H - 0.25, -SZ, SX, H, -SZ + 0.2, undefined, cream);
  b.boxMinMax('trim', -SX, H - 0.25, SZ - 0.2, SX, H, SZ, undefined, cream);
  b.boxMinMax('trim', -SX, H - 0.25, -SZ, -SX + 0.2, H, SZ, undefined, cream);
  b.boxMinMax('trim', SX - 0.2, H - 0.25, -SZ, SX, H, SZ, undefined, cream);
  for (let x = -SX + 0.6; x <= SX - 0.5; x += 0.8) b.boxMinMax('iron', x - 0.02, H + 0.2, -SZ, x + 0.02, H + 0.26, SZ);
  b.boxMinMax('skyglass', -SX, H + 0.6, -SZ, SX, H + 0.62, SZ);
  // Стены: панели до 1.1 м, ткань выше, фриз под потолком
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    b.boxMinMax('panel', x0, 0, z0, x1, DADO, z1, undefined, wood);
    b.boxMinMax('fabric', x0, DADO, z0, x1, H - 0.55, z1, undefined, fabric);
    b.boxMinMax('trim', x0, H - 0.55, z0, x1, H, z1, undefined, cream);
  };
  wall(-W - 0.3, -D - 0.3, W + 0.3, -D);
  wall(-W - 0.3, -D, -W, D);
  wall(W, -D, W + 0.3, D);
  // Карнизы и поручень панелей — чуть выступают
  for (const [x0, z0, x1, z1] of [
    [-W, -D, W, -D + 0.05],
    [-W, -D, -W + 0.05, D],
    [W - 0.05, -D, W, D],
  ] as const) {
    b.boxMinMax('panel', x0, DADO - 0.04, z0, x1, DADO + 0.06, z1, undefined, wood);
    b.boxMinMax('trim', x0, H - 0.62, z0, x1, H - 0.55, z1, undefined, cream);
    b.boxMinMax('panel', x0, 0, z0, x1, 0.18, z1, undefined, wood.clone().multiplyScalar(0.7));
  }

  // Уличная стена с дверью и двумя высокими окнами
  const zs = D;
  const openings = [
    { x0: -4.3, x1: -2.5, y0: 0.85, y1: 3.9 },
    { x0: -0.75, x1: 0.75, y0: 0, y1: 3.0 },
    { x0: 2.5, x1: 4.3, y0: 0.85, y1: 3.9 },
  ];
  const t = 0.45;
  let x = -W - 0.3;
  for (const o of openings) {
    b.boxMinMax('plaster', x, 0, zs, o.x0, H, zs + t, undefined, cream);
    b.boxMinMax('plaster', o.x0, 0, zs, o.x1, o.y0, zs + t, undefined, cream);
    b.boxMinMax('plaster', o.x0, o.y1, zs, o.x1, H, zs + t, undefined, cream);
    x = o.x1;
    // Рама и переплёт
    const fz = zs + 0.18;
    b.boxMinMax('frame', o.x0, o.y0, fz, o.x0 + 0.08, o.y1, fz + 0.08);
    b.boxMinMax('frame', o.x1 - 0.08, o.y0, fz, o.x1, o.y1, fz + 0.08);
    b.boxMinMax('frame', o.x0, o.y1 - 0.08, fz, o.x1, o.y1, fz + 0.08);
    if (o.y0 > 0) {
      b.boxMinMax('frame', o.x0, o.y0, fz, o.x1, o.y0 + 0.08, fz + 0.08);
      b.boxMinMax('frame', (o.x0 + o.x1) / 2 - 0.035, o.y0, fz, (o.x0 + o.x1) / 2 + 0.035, o.y1, fz + 0.08);
      for (const k of [0.33, 0.66]) {
        const yy = o.y0 + (o.y1 - o.y0) * k;
        b.boxMinMax('frame', o.x0, yy - 0.025, fz, o.x1, yy + 0.025, fz + 0.06);
      }
    } else {
      b.boxMinMax('frame', o.x0, 2.45, fz, o.x1, 2.53, fz + 0.08);
    }
    b.boxMinMax('glass', o.x0, o.y0, fz + 0.03, o.x1, o.y1, fz + 0.035);
  }
  b.boxMinMax('plaster', x, 0, zs, W + 0.3, H, zs + t, undefined, cream);
  // Подоконники
  for (const o of openings) if (o.y0 > 0) b.boxMinMax('trim', o.x0 - 0.1, o.y0 - 0.06, zs - 0.12, o.x1 + 0.1, o.y0, zs + 0.05, undefined, cream);
  // Улица за окнами — яркая освещённая стена напротив
  b.boxMinMax('outside', -W - 4, -1, D + 9, W + 4, H + 6, D + 9.2, undefined, new THREE.Color(2.2, 1.55, 1.0));
  b.boxMinMax('floor', -W - 4, -0.25, D + 0.4, W + 4, -0.05, D + 9);

  const [floorM, fabricM, panelM, plasterM, trimM] = await Promise.all([
    kit.pbr('old_wooden_floor_01', { color: 0xc8b8a4, normalStrength: 0.8 }),
    kit.pbr('velour_velvet', { vertexColors: true, map: null, color: 0xffffff, normalStrength: 0.5 }),
    kit.pbr('black_painted_planks', { map: null, vertexColors: true, color: 0xffffff, roughness: 0.6 }),
    kit.pbr('plastered_wall_02', { vertexColors: true, color: 0xe9dfcc }),
    kit.pbr('beige_wall_001', { vertexColors: true, color: 0xf1e7d4 }),
  ]);
  const shell = b.build(
    {
      floor: floorM,
      fabric: fabricM,
      panel: panelM,
      plaster: plasterM,
      trim: trimM,
      ceiling: plasterM,
      iron: new THREE.MeshStandardMaterial({ color: 0x1d1d1d, metalness: 0.5, roughness: 0.6 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xe8e1d2, roughness: 0.55 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.02, transparent: true, opacity: 0.08, depthWrite: false }),
      skyglass: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.75, 1.95) }),
      outside: new THREE.MeshBasicMaterial({ vertexColors: true }),
    },
    { floor: 0.5, fabric: 0.8, panel: 0.6, plaster: 0.5, trim: 0.5, ceiling: 0.4 },
    ['glass', 'skyglass', 'outside'],
  );
  scene.add(shell);

  // --- Свет: солнце через окна, холодный верхний свет, тёплые бра
  const sun = new THREE.DirectionalLight(0xffb070, 12);
  sun.position.copy(TO_SUN).multiplyScalar(30);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(Math.max(2048, quality.shadowMapSize));
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -11;
  sc.right = 11;
  sc.top = 9;
  sc.bottom = -9;
  sc.near = 5;
  sc.far = 60;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);

  const sky = new THREE.RectAreaLight(0xcfe0ff, 3.2, SX * 2, SZ * 2);
  sky.position.set(0, H + 0.55, 0);
  sky.lookAt(0, 0, 0);
  scene.add(sky);
  const fill = new THREE.HemisphereLight(0xf2e2c8, 0x3a2418, 0.35);
  scene.add(fill);

  // --- Картины
  const paintings = PAINTINGS.slice(0, SPOTS.length);
  const framed = new Map<string, { group: THREE.Group; sold: THREE.Mesh; spot: Spot; info: PaintingInfo }>();
  const texLoader = new THREE.TextureLoader();
  await Promise.all(
    paintings.map(async (p, i) => {
      const spot = SPOTS[i];
      const tex = await texLoader.loadAsync(`${ctx.assets}paintings/${p.file}-2048.webp`).catch(() => null);
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 16;
      }
      // На мольберте — чуть меньше натурального, чтобы не перевешивал
      const [wcm, hcm] = p.size;
      const f = framedPainting(tex, wcm / 100, hcm / 100);
      f.group.position.copy(spot.pos);
      f.group.rotation.y = spot.rotY;
      if (spot.easel) f.group.rotation.x = -0.08;
      scene.add(f.group);
      // Ярлычок «продано» — красный кружок на раме
      const sold = new THREE.Mesh(new THREE.CircleGeometry(0.035, 24), new THREE.MeshStandardMaterial({ color: 0xb3161b, roughness: 0.5 }));
      sold.position.set(f.outer.width / 2 - 0.09, -f.outer.height / 2 + 0.09, 0.09);
      sold.visible = false;
      f.group.add(sold);
      framed.set(p.id, { group: f.group, sold, spot, info: p });
      if (!spot.easel) return;
      const easel = await kit.model('easel').catch(() => null);
      if (easel) {
        const { group } = fitModel(easel, { height: 2.3 });
        group.position.set(spot.pos.x, 0, spot.pos.z - 0.12);
        group.rotation.y = spot.rotY;
        scene.add(group);
      }
      physics.addBox({ x: spot.pos.x, y: 1, z: spot.pos.z - 0.2 }, { x: 0.45, y: 1, z: 0.35 }, spot.rotY);
    }),
  );

  // --- Мебель
  const place = async (id: string, fit: Parameters<typeof fitModel>[1], x: number, z: number, rotY: number, col?: [number, number]) => {
    const m = await kit.model(id).catch(() => null);
    if (!m) return;
    const { group, size } = fitModel(m, fit);
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);
    const [hx, hz] = col ?? [size.x / 2, size.z / 2];
    physics.addBox({ x, y: size.y / 2, z }, { x: hx, y: size.y / 2, z: hz }, rotY);
  };
  await Promise.all([
    place('dealer_desk', { width: 1.6 }, 3.6, 1.7, -Math.PI / 2 - 0.25),
    place('ArmChair_01', { height: 1.0 }, 4.6, 2.9, -Math.PI / 2 - 0.5),
    place('sofa_03', { width: 1.9 }, 0, -1.6, Math.PI),
    place('ClassicConsole_01', { width: 1.2 }, -W + 0.35, 2.8, Math.PI / 2),
    place('crates', { height: 1.1 }, -4.6, -3.6, 0.4),
    place('passerby_man', { height: 1.74 }, 4.6, 1.0, -Math.PI / 2 - 0.6, [0.3, 0.3]),
  ]);

  // --- Пыль в лучах: мелкие частицы освещаются, только когда попадают в солнце
  const dustCount = quality.level === 'low' ? 0 : 500;
  const dust = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.004, 0),
    new THREE.MeshStandardMaterial({ color: 0xfff1d8, roughness: 1 }),
    dustCount,
  );
  // Пылинки рождаются в лучах: случайная точка окна, сдвинутая внутрь вдоль направления света
  const seeds = new Float32Array(dustCount * 4);
  const lightDir = TO_SUN.clone().negate();
  const p = new THREE.Vector3();
  for (let i = 0; i < dustCount; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const o = openings[Math.floor(Math.random() * openings.length)];
      p.set(o.x0 + Math.random() * (o.x1 - o.x0), o.y0 + Math.random() * (o.y1 - o.y0), D).addScaledVector(lightDir, 0.3 + Math.random() * 7);
      if (Math.abs(p.x) < W - 0.3 && p.y > 0.1 && p.y < H - 0.3 && Math.abs(p.z) < D - 0.3) break;
    }
    seeds.set([p.x, p.y, p.z, Math.random() * 100], i * 4);
  }
  dust.frustumCulled = false;
  scene.add(dust);
  const mtx = new THREE.Matrix4();

  // --- Коллизии
  physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: W + 1, y: 0.5, z: D + 1 });
  physics.addBox({ x: 0, y: H / 2, z: -D - 0.5 }, { x: W + 1, y: H / 2, z: 0.5 });
  physics.addBox({ x: 0, y: H / 2, z: D + 0.5 }, { x: W + 1, y: H / 2, z: 0.5 });
  physics.addBox({ x: -W - 0.5, y: H / 2, z: 0 }, { x: 0.5, y: H / 2, z: D + 1 });
  physics.addBox({ x: W + 0.5, y: H / 2, z: 0 }, { x: 0.5, y: H / 2, z: D + 1 });

  // --- Отражения: окружение снимается с самого зала
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.04, 0.1, 40, { position: new THREE.Vector3(0, 1.7, 0), size: 256 });
  pmrem.dispose();
  scene.environment = env.texture;
  scene.environmentIntensity = 0.9;

  // --- Взаимодействие
  const interactables: Interactable[] = [];
  for (const [id, f] of framed) {
    const n = new THREE.Vector3(Math.sin(f.spot.rotY), 0, Math.cos(f.spot.rotY));
    const stand = f.spot.pos.clone().addScaledVector(n, 1.6);
    stand.y = 0;
    interactables.push({
      id: `painting:${id}`,
      position: stand,
      target: f.spot.pos,
      radius: 1.9,
      label: `E — рассмотреть «${f.info.title}»`,
      action: () => {
        const box = new THREE.Box3().setFromObject(f.group);
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(size.y * 1.25, Math.max(size.x, size.z) * 0.95) + 0.4;
        // Камера смещена вправо от картины: справа на экране — панель справки
        const right = new THREE.Vector3(n.z, 0, -n.x);
        const center = f.spot.pos.clone().addScaledVector(right, size.x > size.z ? size.x * 0.42 : size.z * 0.42);
        actions.inspect(id, { position: center.clone().addScaledVector(n, dist * 1.08).add(new THREE.Vector3(0, 0.02, 0)), target: center, fov: 40 });
      },
    });
  }
  interactables.push({
    id: 'gallery-exit',
    position: new THREE.Vector3(0, 0, D - 0.6),
    radius: 1.4,
    get label() {
      return session.state.owned.length ? 'E — отправить покупки в Москву' : 'E — выйти на улицу';
    },
    action: () => (session.state.owned.length ? actions.travel() : actions.goto('street')),
  });

  const sync = () => {
    for (const [id, f] of framed) f.sold.visible = session.state.owned.includes(id);
  };
  sync();
  const off = session.onChange(sync);

  return {
    id: 'gallery',
    scene,
    spawn: { position: new THREE.Vector3(0.3, 0, D - 2.2), facing: 0 },
    toneMapping: THREE.NeutralToneMapping,
    exposure: 0.75,
    post: {
      bloom: { strength: 0.12, radius: 0.5, threshold: 1.3 },
      godrays: { light: sun, color: 0xffcf9a, density: 20, maxDensity: 0.5, attenuation: 1 },
      vignette: 0.38,
      ao: { radius: 0.5 },
    },
    interactables,
    update(_dt, time) {
      for (let i = 0; i < dustCount; i++) {
        const [x0, y0, z0, s] = seeds.subarray(i * 4, i * 4 + 4);
        const tt = time * 0.05 + s;
        mtx.makeTranslation(x0 + Math.sin(tt * 1.3) * 0.12, y0 + Math.sin(tt * 0.7 + s) * 0.1, z0 + Math.cos(tt * 1.1) * 0.12);
        dust.setMatrixAt(i, mtx);
      }
      dust.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      off();
      env.dispose();
    },
  };
}

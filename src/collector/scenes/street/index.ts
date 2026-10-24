import * as THREE from 'three/webgpu';
import { color, densityFogFactor, dot, fog, max, mix, normalize, positionWorld, cameraPosition, pow, uniform } from 'three/tsl';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { Interactable, Level, LevelContext } from '../level';
import { GeoBuilder, placeY } from '../kit/geo';
import { fitModel, Kit, placeModel, signTexture } from '../kit/materials';
import { buildFacade, type BuildingSpec } from './facade';

// Парижская улица торговцев картинами, золотой час. Стилизация, не реконструкция:
// дома, вывески и расстановка условны. Солнце низко в дальнем конце улицы, чуть левее оси.

const HALF = 7; // от оси до фасада
const ROAD = 4.5; // от оси до бордюра
const CURB = 0.15;
const Z_NEAR = 26;
const Z_FAR = -66;
/**
 * Направление на солнце: ≈25° над горизонтом, впереди-слева. Ниже 20° левый ряд домов закрывает
 * правые фасады почти целиком (выносы балконов и карнизов поднимают границу тени ещё на 2–3 м).
 */
const TO_SUN = new THREE.Vector3(-0.3, 0.42, -0.86).normalize();

const SIGNS: Record<string, string> = {
  gallery: 'TABLEAUX MODERNES',
  estampes: 'ESTAMPES · DESSINS',
  cadres: 'ENCADREMENTS · DORURE',
  antiques: "OBJETS D'ART · CURIOSITÉS",
  cafe: 'CAFÉ · BRASSERIE',
  librairie: 'LIBRAIRIE · ÉDITIONS',
};

export async function buildStreet(ctx: LevelContext): Promise<Level> {
  const { physics, renderer, quality, actions } = ctx;
  const kit = new Kit(ctx.assets, 12);
  const scene = new THREE.Scene();
  const b = new GeoBuilder();

  // --- Дома. Левый ряд (x = −7, фасад смотрит в +x), правый (x = +7, повернут на π)
  const warm = (r: number, g: number, bl: number) => new THREE.Color(r, g, bl);
  const left: (Omit<BuildingSpec, 'seed'> & { z0: number })[] = [
    { z0: 12, width: 14, bays: 5, upper: 3, tint: warm(1, 0.97, 0.92), endWalls: [false, true] },
    { z0: -6, width: 18, bays: 6, upper: 4, tint: warm(0.96, 0.93, 0.86), shop: { id: 'cafe', color: warm(0.32, 0.07, 0.06), doorBay: 2, lit: true } },
    { z0: -24, width: 18, bays: 6, upper: 3, tint: warm(1, 0.95, 0.88), shop: { id: 'cadres', color: warm(0.05, 0.13, 0.1), doorBay: 1 } },
    { z0: -44, width: 20, bays: 7, upper: 4, tint: warm(0.97, 0.95, 0.9), shop: { id: 'antiques', color: warm(0.06, 0.06, 0.08), doorBay: 3 } },
    { z0: -66, width: 22, bays: 8, upper: 3, tint: warm(0.98, 0.94, 0.86), shop: { id: 'librairie', color: warm(0.05, 0.1, 0.18), doorBay: 5 }, endWalls: [true, false] },
  ];
  const right: (Omit<BuildingSpec, 'seed'> & { z1: number })[] = [
    { z1: 26, width: 12, bays: 4, upper: 4, tint: warm(0.97, 0.94, 0.88), endWalls: [true, false] },
    { z1: 14, width: 14, bays: 5, upper: 4, tint: warm(1, 0.96, 0.9), shop: { id: 'estampes', color: warm(0.2, 0.05, 0.07), doorBay: 3 } },
    // Галерея: витрина в золотом скользящем свете
    { z1: 0, width: 15, bays: 5, upper: 4, tint: warm(0.99, 0.95, 0.88), shop: { id: 'gallery', color: warm(0.04, 0.12, 0.09), doorBay: 2, lit: true } },
    { z1: -15, width: 18, bays: 6, upper: 4, tint: warm(0.95, 0.92, 0.86), shop: { id: 'cadres', color: warm(0.12, 0.1, 0.07), doorBay: 4 } },
    { z1: -33, width: 16, bays: 6, upper: 4, tint: warm(1, 0.97, 0.9) },
    { z1: -49, width: 17, bays: 6, upper: 3, tint: warm(0.97, 0.93, 0.85), shop: { id: 'estampes', color: warm(0.18, 0.06, 0.05), doorBay: 1 }, endWalls: [false, true] },
  ];

  const signs: { id: string; m: THREE.Matrix4; s: { center: THREE.Vector3; width: number; height: number } }[] = [];
  const windows: { m: THREE.Matrix4; w: { center: THREE.Vector3; width: number; height: number; lit: boolean; id: string } }[] = [];
  const doors: { id: string; world: THREE.Vector3; facing: number }[] = [];
  let seed = 1;
  const add = (spec: Omit<BuildingSpec, 'seed'>, m: THREE.Matrix4, facing: number) => {
    const out = buildFacade(b, { ...spec, seed: seed++ }, m);
    for (const s of out.signs) signs.push({ id: s.id, m, s });
    for (const w of out.windows) windows.push({ m, w });
    for (const d of out.doors) doors.push({ id: d.id, world: d.center.clone().applyMatrix4(m), facing });
  };
  for (const s of left) add(s, placeY(-HALF, 0, s.z0), 0);
  for (const s of right) add(s, placeY(HALF, 0, s.z1, Math.PI), Math.PI);
  // Позади старта — поперечный дом за перекрёстком; впереди улица выходит на площадь
  for (let i = 0; i < 3; i++) {
    add({ width: 20, bays: 7, upper: 4, tint: warm(0.96, 0.93, 0.87) }, placeY(-30 + i * 20, 0, Z_NEAR + 8, Math.PI / 2), 0);
  }
  // Дальний край площади — силуэты в дымке
  for (let i = 0; i < 6; i++) {
    add({ width: 22, bays: 7, upper: i % 2 ? 4 : 3, tint: warm(0.95, 0.92, 0.86) }, placeY(66 - i * 22, 0, -150, -Math.PI / 2), 0);
  }

  // --- Мостовая, тротуары, бордюры
  b.boxMinMax('cobble', -60, -0.3, -170, 60, 0, Z_FAR, undefined);
  b.boxMinMax('cobble', -ROAD, -0.3, Z_FAR, ROAD, 0, Z_NEAR + 14, undefined);
  for (const s of [-1, 1]) {
    const x0 = s * ROAD;
    const x1 = s * HALF;
    b.boxMinMax('asphalt', Math.min(x0, x1), 0, Z_FAR, Math.max(x0, x1), CURB, Z_NEAR + 2, undefined);
    b.boxMinMax('curb', x0 - s * 0.0, 0, Z_FAR, x0 + s * 0.22, CURB + 0.005, Z_NEAR + 2, undefined);
  }
  // Перекрёсток позади старта
  b.boxMinMax('cobble', -40, -0.3, Z_NEAR, 40, 0, Z_NEAR + 8, undefined);

  const [stone, trim, plaster, slate, cobble, asphalt, shopwood] = await Promise.all([
    kit.pbr('marble_01', { vertexColors: true, color: 0xf0e2c8, normalStrength: 0.7 }),
    kit.pbr('beige_wall_001', { vertexColors: true, color: 0xf3e6cd, normalStrength: 0.6 }),
    kit.pbr('beige_wall_001', { vertexColors: true, color: 0xd9c9ad }),
    kit.pbr('roof_slates_03', { color: 0x9a9ca6, normalStrength: 1.2 }),
    kit.pbr('cobblestone_floor_02', { color: 0xc9c2b8, normalStrength: 1.4 }),
    kit.pbr('worn_asphalt', { color: 0x9b958c }),
    kit.pbr('black_painted_planks', { map: null, vertexColors: true, color: 0xffffff, normalStrength: 0.8 }),
  ]);
  const materials: Record<string, THREE.Material> = {
    stone,
    trim,
    plaster,
    slate,
    cobble,
    asphalt,
    shopwood,
    curb: trim,
    zinc: new THREE.MeshStandardMaterial({ color: 0x8d949c, metalness: 0.85, roughness: 0.42 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.55, roughness: 0.5 }),
    // Старое стекло: тонкое, полупрозрачное — за ним видны комнаты и лавки
    glass: new THREE.MeshStandardMaterial({ color: 0x20282c, roughness: 0.05, transparent: true, opacity: 0.38, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0xe6dfd0, roughness: 0.55 }),
    interior: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
    interiorLit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    gold: new THREE.MeshStandardMaterial({ color: 0x6e5329, metalness: 0.9, roughness: 0.5 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0xa25236, roughness: 0.85 }),
  };
  const city = b.build(
    materials,
    { stone: 0.5, trim: 0.5, plaster: 0.35, slate: 0.38, cobble: 0.7, asphalt: 0.3, curb: 0.5, shopwood: 0.6 },
    ['glass', 'interior', 'interiorLit', 'cloth', 'cobble', 'asphalt'],
  );
  scene.add(city);

  // --- Вывески и витрины
  for (const { id, m, s } of signs) {
    const tex = await signTexture(SIGNS[id] ?? id.toUpperCase(), { bg: '#141a16' });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(s.width, s.height),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.15 }),
    );
    mesh.position.copy(s.center);
    mesh.position.x += 0.012;
    mesh.rotation.y = Math.PI / 2;
    mesh.applyMatrix4(m);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const { m, w } of windows) {
    // Глубина лавки: задник с тёплым светом и силуэтами рам
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(w.width, w.height + 0.4),
      w.lit
        ? new THREE.MeshBasicMaterial({ map: shopInterior(w.id, true), color: new THREE.Color(1.5, 1.25, 1) })
        : new THREE.MeshStandardMaterial({ map: shopInterior(w.id, false), roughness: 1 }),
    );
    back.position.set(-0.36, w.center.y, w.center.z);
    back.rotation.y = Math.PI / 2;
    back.applyMatrix4(m);
    scene.add(back);
  }

  // --- Небо, солнце, дымка
  const sky = new SkyMesh();
  sky.scale.setScalar(2500);
  sky.turbidity.value = 4;
  sky.rayleigh.value = 2.2;
  sky.mieCoefficient.value = 0.0038;
  sky.mieDirectionalG.value = 0.8;
  sky.cloudCoverage.value = 0.28;
  sky.cloudDensity.value = 0.3;
  sky.cloudElevation.value = 0.55;
  sky.cloudSpeed.value = 0.000003;
  sky.sunPosition.value.copy(TO_SUN);
  scene.add(sky);

  const envScene = new THREE.Scene();
  envScene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(envScene, 0.03);
  pmrem.dispose();
  scene.add(sky);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.3;

  const sun = new THREE.DirectionalLight(0xffa25a, 20);
  const target = new THREE.Vector3(0, 0, -18);
  sun.target.position.copy(target);
  sun.position.copy(target).addScaledVector(TO_SUN, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(quality.shadowMapSize >= 4096 ? 4096 : Math.max(2048, quality.shadowMapSize * 2));
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -24;
  sc.right = 24;
  sc.top = 36;
  sc.bottom = -28;
  sc.near = 20;
  sc.far = 260;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // Холодный подсвет из теневой стороны неба
  const hemi = new THREE.HemisphereLight(0x9fb4d6, 0x5a4a3a, 0.2);
  scene.add(hemi);

  // Дымка: к солнцу — тёплая, в тени — голубоватая
  const sunDir = uniform(TO_SUN.clone());
  const viewDir = normalize(positionWorld.sub(cameraPosition));
  const glow = pow(max(dot(viewDir, sunDir), 0), 5);
  scene.fogNode = fog(mix(color(0x6f7a8e), color(0xf0a868), glow), densityFogFactor(uniform(0.0085)));

  // --- Фонари
  const lampProto = await kit.model('street_lamp_01').catch(() => null);
  if (lampProto) {
    for (const z of [18, 2, -14, -30, -46, -62]) {
      for (const s of [-1, 1]) {
        const zz = z + (s > 0 ? 8 : 0);
        if (s === 1 && Math.abs(zz - -7.5) < 4) continue; // не загораживать вход в галерею
        const { group } = fitModel(lampProto.clone(), { height: 4.1 });
        group.position.set(s * (ROAD + 0.55), CURB, zz);
        group.rotation.y = s > 0 ? Math.PI : 0;
        glowLamp(group);
        scene.add(group);
        physics.addCylinder({ x: s * (ROAD + 0.55), y: 1.5, z: zz }, 0.16, 1.5);
      }
    }
  }

  // --- Жизнь улицы: фиакр, тумба, терраса кафе, прохожие (модели Meshy)
  const S = CURB;
  await Promise.all([
    // Длинная ось модели — X, лошадь смотрит в −X: поворот −π/2 ставит её мордой вдоль улицы
    placeModel(kit, scene, physics, 'fiacre', { fit: { width: 4.6 }, at: [2.8, 0, 5], rotY: -Math.PI / 2, collider: [2.3, 0.85] }),
    placeModel(kit, scene, physics, 'morris_column', { fit: { height: 3.6 }, at: [-5.75, S, -19], collider: [0.55, 0.55] }),
    placeModel(kit, scene, physics, 'bistro_set', { fit: { width: 1.5 }, at: [-5.6, S, 2.5], rotY: 0.3 }),
    placeModel(kit, scene, physics, 'bistro_set', { fit: { width: 1.5 }, at: [-5.7, S, 6.2], rotY: -0.4 }),
    placeModel(kit, scene, physics, 'bench', { fit: { width: 1.8 }, at: [5.95, S, -26], rotY: -Math.PI / 2 }),
    placeModel(kit, scene, physics, 'flower_cart', { fit: { length: 1.8 }, at: [5.4, S, -13], rotY: 0.2 }),
    placeModel(kit, scene, physics, 'passerby_woman', { fit: { height: 1.68 }, at: [-5.2, S, -3], rotY: 1.2, collider: [0.3, 0.3] }),
    placeModel(kit, scene, physics, 'passerby_man', { fit: { height: 1.76 }, at: [-5.0, S, -16.6], rotY: 2.4, collider: [0.3, 0.3] }),
    placeModel(kit, scene, physics, 'porter', { fit: { height: 1.7 }, at: [5.6, S, -4.2], rotY: -2.2, collider: [0.3, 0.3] }),
  ]);

  // --- Коллизии: земля, тротуары, стены, концы улицы
  physics.addBox({ x: 0, y: -0.5, z: -70 }, { x: 80, y: 0.5, z: 110 });
  for (const s of [-1, 1]) {
    physics.addBox({ x: s * ((ROAD + HALF) / 2), y: CURB / 2, z: (Z_NEAR + Z_FAR) / 2 }, { x: (HALF - ROAD) / 2, y: CURB / 2, z: (Z_NEAR - Z_FAR) / 2 });
    // Стена по выносу витрин (0.3 м от фасада)
    physics.addBox({ x: s * (HALF - 0.35 + 0.5), y: 6, z: (Z_NEAR + Z_FAR) / 2 }, { x: 0.5, y: 6, z: (Z_NEAR - Z_FAR) / 2 + 0.5 });
  }
  physics.addBox({ x: 0, y: 3, z: Z_NEAR + 1.5 }, { x: 10, y: 3, z: 0.5 });
  physics.addBox({ x: 0, y: 3, z: Z_FAR - 6 }, { x: 10, y: 3, z: 0.5 });

  // --- Вход в галерею
  const interactables: Interactable[] = [];
  const galleryDoor = doors.find((d) => d.id === 'gallery');
  if (galleryDoor) {
    interactables.push({
      id: 'gallery-door',
      position: galleryDoor.world.clone(),
      radius: 2.4,
      label: 'E — войти в галерею',
      action: () => actions.goto('gallery'),
    });
  }

  return {
    id: 'street',
    scene,
    spawn: { position: new THREE.Vector3(1.2, 0, 21), facing: 0.05 },
    // Neutral держит насыщенность закатного света; AgX его обесцвечивал
    toneMapping: THREE.NeutralToneMapping,
    exposure: 0.62,
    post: {
      bloom: { strength: 0.1, radius: 0.5, threshold: 1.4 },
      // Без godrays: в открытой улице лучи копятся в небе, а при малой плотности невидимы и стоят ~60 шагов на пиксель
      vignette: 0.32,
      ao: { radius: 0.6 },
    },
    interactables,
    dispose() {
      env.dispose();
      city.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}

/** Стекло фонаря светится: тёплый газовый свет */
function glowLamp(group: THREE.Object3D) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const n = `${mesh.name} ${mat.name}`.toLowerCase();
    if (/glass|light|bulb|lamp_?glass/.test(n)) {
      const m = mat.clone();
      m.emissive = new THREE.Color(0xffb35c);
      m.emissiveIntensity = 2.2;
      mesh.material = m;
    }
  });
}

/** Задник лавки: тёплая стена и силуэты рам. Без настоящих картин — только условные прямоугольники */
function shopInterior(id: string, lit: boolean) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, lit ? '#6b4a2c' : '#2b231c');
  grad.addColorStop(1, lit ? '#3a2616' : '#16110d');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  let s = [...id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 7; i++) {
    const w = 40 + r() * 70;
    const h = 30 + r() * 60;
    const x = 20 + r() * (512 - w - 40);
    const y = 40 + r() * 120;
    g.fillStyle = lit ? '#c99a4e' : '#5d4a2e';
    g.fillRect(x - 5, y - 5, w + 10, h + 10);
    g.fillStyle = lit ? `hsl(${20 + r() * 40}, 30%, ${30 + r() * 20}%)` : '#2a241e';
    g.fillRect(x, y, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

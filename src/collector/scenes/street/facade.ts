import * as THREE from 'three/webgpu';
import type { GeoBuilder } from '../kit/geo';

// Процедурный парижский доходный дом в духе застройки Османа (стилизация, не реконструкция).
// Локальная система: фасад в плоскости x = 0, улица — в сторону +x, дом тянется по z от 0 до width.

export interface ShopSpec {
  /** Цвет крашеного дерева витрины */
  color: THREE.Color;
  /** Номер пролёта с дверью */
  doorBay: number;
  /** Ключ для вывески и интерьера за стеклом */
  id: string;
  lit?: boolean;
}

export interface BuildingSpec {
  width: number;
  bays: number;
  /** Этажей над антресолью: 3 или 4 */
  upper: 3 | 4;
  tint: THREE.Color;
  shop?: ShopSpec;
  /** Глухая торцевая стена слева/справа (край квартала) */
  endWalls?: [boolean, boolean];
  seed: number;
}

export interface BuildingOut {
  /** Прямоугольники вывесок в локальных координатах: центр и размер */
  signs: { id: string; center: THREE.Vector3; width: number; height: number }[];
  /** Проём витрины: интерьер за стеклом */
  windows: { id: string; center: THREE.Vector3; width: number; height: number; lit: boolean }[];
  /** Дверь лавки — центр проёма на уровне земли */
  doors: { id: string; center: THREE.Vector3 }[];
  height: number;
}

const GF = 4.4;
const DEPTH = 0.55;
const RECESS = 0.24;

interface Floor {
  h: number;
  win: [number, number];
  sill: number;
  balcony: 'continuous' | 'single' | 'rail';
  pediment: boolean;
}

export function buildFacade(b: GeoBuilder, s: BuildingSpec, m: THREE.Matrix4): BuildingOut {
  const out: BuildingOut = { signs: [], windows: [], doors: [], height: 0 };
  const W = s.width;
  const bay = W / s.bays;
  const rnd = mulberry(s.seed);
  const stone = s.tint;
  const trim = stone.clone().multiplyScalar(1.04);

  const floors: Floor[] = [
    { h: 2.5, win: [1.05, 1.45], sill: 0.55, balcony: 'rail', pediment: false },
    { h: 3.4, win: [1.3, 2.55], sill: 0.25, balcony: 'continuous', pediment: true },
    { h: 3.1, win: [1.3, 2.35], sill: 0.3, balcony: 'single', pediment: false },
  ];
  if (s.upper === 4) floors.push({ h: 3.0, win: [1.25, 2.25], sill: 0.32, balcony: 'rail', pediment: false });
  floors.push({ h: 2.8, win: [1.2, 2.05], sill: 0.32, balcony: 'continuous', pediment: false });

  // --- Первый этаж: рустованные опоры по краям и витрина лавки
  rusticated(b, 0, 0.62, 0, GF, m, stone);
  rusticated(b, W - 0.62, W, 0, GF, m, stone);
  if (s.shop) shopfront(b, s.shop, 0.62, W - 0.62, bay, m, out);
  else {
    // Ворота-проезд и рустовка вместо лавки
    rusticated(b, 0.62, W - 0.62, 0, GF, m, stone);
  }
  // Пояс над первым этажом
  b.boxMinMax('trim', 0, GF - 0.05, -0.02, 0.18, GF + 0.3, W + 0.02, m, trim);

  // --- Жилые этажи
  let y = GF + 0.3;
  floors.forEach((f) => {
    const [ww, wh] = f.win;
    const yb = y + f.sill;
    const yt = yb + wh;
    // Стена: под окнами, над окнами, простенки
    b.boxMinMax('stone', -DEPTH, y, 0, 0, yb, W, m, stone);
    b.boxMinMax('stone', -DEPTH, yt, 0, 0, y + f.h, W, m, stone);
    let z = 0;
    for (let i = 0; i < s.bays; i++) {
      const zc = (i + 0.5) * bay;
      b.boxMinMax('stone', -DEPTH, yb, z, 0, yt, zc - ww / 2, m, stone);
      z = zc + ww / 2;
      windowUnit(b, zc, yb, ww, wh, f, m, trim, rnd);
    }
    b.boxMinMax('stone', -DEPTH, yb, z, 0, yt, W, m, stone);

    if (f.balcony === 'continuous') balcony(b, 0.2, W - 0.2, y, 0.82, m, stone, bay);
    // Межэтажный пояс
    b.boxMinMax('trim', 0, y + f.h - 0.08, 0, 0.07, y + f.h + 0.1, W, m, trim);
    y += f.h + 0.02;
  });

  // --- Главный карниз: профиль «гусёк»
  const cy = y;
  b.extrude(
    'trim',
    [
      [-0.05, 0],
      [0.1, 0],
      [0.1, 0.1],
      [0.22, 0.14],
      [0.26, 0.26],
      [0.42, 0.32],
      [0.58, 0.44],
      [0.62, 0.62],
      [-0.05, 0.62],
    ],
    W,
    m.clone().multiply(new THREE.Matrix4().makeTranslation(0, cy, 0)),
    trim,
  );
  // Модульоны под карнизом
  for (let z = 0.25; z < W - 0.1; z += 0.62) b.boxMinMax('trim', 0, cy - 0.28, z, 0.24, cy, z + 0.12, m, trim);

  // --- Мансарда: крутой скат из шифера, верх из цинка, люкарны и трубы
  const my = cy + 0.62;
  const mm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, my, 0));
  b.extrude('slate', [[-0.35, 0], [-1.45, 3.5], [-9, 3.5], [-9, 0]], W, mm);
  b.extrude('zinc', [[-1.45, 3.5], [-4.6, 4.3], [-9, 4.3], [-9, 3.5]], W, mm);
  b.boxMinMax('zinc', -1.55, my + 3.45, 0, -1.3, my + 3.62, W, m);
  // Балюстрада-ограждение по краю карниза
  rail(b, 0.45, 0, W, my, 0.55, 0.14, m);
  for (let i = 0; i < s.bays; i++) {
    const zc = (i + 0.5) * bay;
    dormer(b, zc, my, m, trim);
  }
  // Трубы на границах дома
  for (const zc of [0.6, W - 0.6]) {
    b.boxMinMax('plaster', -4.2, my + 3.6, zc - 0.5, -3.0, my + 5.6, zc + 0.5, m, stone);
    b.boxMinMax('trim', -4.3, my + 5.5, zc - 0.58, -2.9, my + 5.7, zc + 0.58, m, trim);
    for (let k = 0; k < 3; k++) {
      const pot = new THREE.CylinderGeometry(0.11, 0.13, 0.55, 10);
      pot.translate(-3.6, my + 5.97, zc - 0.32 + k * 0.32);
      b.add('terracotta', pot, m);
    }
  }
  // Торцы и задняя масса дома (чтобы сбоку и сверху не было пустоты)
  const [endL, endR] = s.endWalls ?? [false, false];
  if (endL) b.boxMinMax('plaster', -9, 0, -0.3, -DEPTH, my + 3.5, 0, m, stone.clone().multiplyScalar(0.92));
  if (endR) b.boxMinMax('plaster', -9, 0, W, -DEPTH, my + 3.5, W + 0.3, m, stone.clone().multiplyScalar(0.92));
  b.boxMinMax('plaster', -9.2, 0, 0, -9, my + 3.5, W, m, stone);
  out.height = my + 4.3;
  return out;
}

/** Рустованная кладка: ряды блоков с углублёнными швами */
function rusticated(b: GeoBuilder, z0: number, z1: number, y0: number, y1: number, m: THREE.Matrix4, tint: THREE.Color) {
  const course = 0.46;
  b.boxMinMax('stone', -DEPTH, y0, z0, -0.03, y1, z1, m, tint);
  for (let y = y0; y < y1 - 0.01; y += course) b.boxMinMax('stone', -0.03, y + 0.025, z0 + 0.012, 0.04, Math.min(y + course, y1) - 0.025, z1 - 0.012, m, tint);
}

function windowUnit(
  b: GeoBuilder,
  zc: number,
  yb: number,
  ww: number,
  wh: number,
  f: Floor,
  m: THREE.Matrix4,
  trim: THREE.Color,
  rnd: () => number,
) {
  const z0 = zc - ww / 2;
  const z1 = zc + ww / 2;
  const yt = yb + wh;
  // Откосы проёма видны за счёт стены; окно утоплено
  const xf = -RECESS;
  const t = 0.07;
  // Коробка и створки (французское окно: две створки по три стекла)
  b.boxMinMax('frame', xf - 0.08, yb, z0, xf, yb + t, z1, m);
  b.boxMinMax('frame', xf - 0.08, yt - t, z0, xf, yt, z1, m);
  b.boxMinMax('frame', xf - 0.08, yb, z0, xf, yt, z0 + t, m);
  b.boxMinMax('frame', xf - 0.08, yb, z1 - t, xf, yt, z1, m);
  b.boxMinMax('frame', xf - 0.07, yb, zc - 0.03, xf + 0.01, yt, zc + 0.03, m);
  for (const k of [1 / 3, 2 / 3]) {
    const yy = yb + wh * k;
    b.boxMinMax('frame', xf - 0.06, yy - 0.018, z0, xf, yy + 0.018, z1, m);
  }
  b.boxMinMax('glass', xf - 0.05, yb, z0, xf - 0.045, yt, z1, m);
  // Комната за стеклом: тёмная, иногда с тёплым светом
  const lit = rnd() < 0.12;
  const room = lit ? new THREE.Color(1.6, 1.05, 0.55) : new THREE.Color(0.32 + rnd() * 0.2, 0.28 + rnd() * 0.15, 0.24 + rnd() * 0.1);
  b.boxMinMax(lit ? 'interiorLit' : 'interior', -2.2, yb - 0.3, z0 - 0.4, -2.1, yt + 0.3, z1 + 0.4, m, room);
  // Шторы: светлые полотна по краям
  if (rnd() < 0.7) {
    const c = new THREE.Color(0.85, 0.8, 0.7).multiplyScalar(0.6 + rnd() * 0.4);
    b.boxMinMax('cloth', xf - 0.4, yb + 0.05, z0 + 0.02, xf - 0.36, yt - 0.05, z0 + 0.22 + rnd() * 0.2, m, c);
    b.boxMinMax('cloth', xf - 0.4, yb + 0.05, z1 - 0.22 - rnd() * 0.2, xf - 0.36, yt - 0.05, z1 - 0.02, m, c);
  }
  // Наличник и подоконник
  b.boxMinMax('trim', 0, yb - 0.02, z0 - 0.16, 0.05, yt + 0.16, z0, m, trim);
  b.boxMinMax('trim', 0, yb - 0.02, z1, 0.05, yt + 0.16, z1 + 0.16, m, trim);
  b.boxMinMax('trim', 0, yt, z0 - 0.16, 0.05, yt + 0.16, z1 + 0.16, m, trim);
  b.boxMinMax('trim', -0.02, yb - 0.1, z0 - 0.2, 0.1, yb, z1 + 0.2, m, trim);
  // Замковый камень и сандрик на бельэтаже
  b.boxMinMax('trim', 0, yt - 0.06, zc - 0.11, 0.09, yt + 0.24, zc + 0.11, m, trim);
  if (f.pediment) {
    b.boxMinMax('trim', 0, yt + 0.22, z0 - 0.26, 0.2, yt + 0.34, z1 + 0.26, m, trim);
    // Треугольный сандрик: треугольник в плоскости (z, y), вытянутый по x на 0.19
    const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, yt + 0.34, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    b.extrude(
      'trim',
      [
        [-(z0 - 0.26), 0],
        [-(z1 + 0.26), 0],
        [-zc, 0.42],
      ],
      0.19,
      pm,
      trim,
    );
  }
  // Ограждения
  if (f.balcony === 'single') balcony(b, z0 - 0.25, z1 + 0.25, yb - 0.12, 0.45, m, trim, 0);
  if (f.balcony === 'rail') rail(b, -RECESS + 0.02, z0 + 0.04, z1 - 0.04, yb, 0.62, 0.11, m);
}

/** Каменная плита на консолях и кованая решётка */
function balcony(b: GeoBuilder, z0: number, z1: number, y: number, depth: number, m: THREE.Matrix4, tint: THREE.Color, bay: number) {
  b.boxMinMax('trim', 0, y - 0.14, z0, depth, y, z1, m, tint);
  b.boxMinMax('trim', 0, y - 0.2, z0 + 0.03, depth - 0.04, y - 0.14, z1 - 0.03, m, tint);
  const step = bay > 0 ? bay / 2 : (z1 - z0) - 0.2;
  for (let z = z0 + 0.12; z <= z1 - 0.1; z += step) {
    // Консоль-кронштейн: ступенчатый клин
    b.boxMinMax('trim', 0, y - 0.55, z, depth * 0.55, y - 0.2, z + 0.16, m, tint);
    b.boxMinMax('trim', 0, y - 0.75, z + 0.02, depth * 0.3, y - 0.55, z + 0.14, m, tint);
  }
  rail(b, depth - 0.06, z0 + 0.04, z1 - 0.04, y, 1.0, 0.115, m);
}

/** Решётка: поручень, низ, стойки и кольца-завитки */
function rail(b: GeoBuilder, x: number, z0: number, z1: number, y: number, h: number, pitch: number, m: THREE.Matrix4) {
  b.boxMinMax('iron', x - 0.03, y + h - 0.05, z0, x + 0.03, y + h, z1, m);
  b.boxMinMax('iron', x - 0.02, y + 0.05, z0, x + 0.02, y + 0.09, z1, m);
  b.boxMinMax('iron', x - 0.012, y + h * 0.78, z0, x + 0.012, y + h * 0.78 + 0.025, z1, m);
  for (let z = z0; z <= z1 + 1e-3; z += pitch) b.boxMinMax('iron', x - 0.009, y + 0.05, z - 0.009, x + 0.009, y + h, z + 0.009, m);
  // Кольца в верхнем фризе
  const r = Math.min(0.09, h * 0.09);
  for (let z = z0 + pitch / 2; z < z1 - pitch / 2; z += pitch * 2) {
    const ring = new THREE.TorusGeometry(r, 0.008, 4, 14);
    ring.rotateY(Math.PI / 2);
    ring.translate(x, y + h * 0.78 + r + 0.02, z + pitch / 2);
    b.add('iron', ring, m);
  }
}

/** Люкарна: каменная рамка с окном и цинковой крышей */
function dormer(b: GeoBuilder, zc: number, my: number, m: THREE.Matrix4, trim: THREE.Color) {
  const w = 1.25;
  const z0 = zc - w / 2;
  const z1 = zc + w / 2;
  const y0 = my + 0.35;
  const y1 = my + 2.3;
  b.boxMinMax('trim', -1.4, y0, z0, -0.25, y1, z0 + 0.16, m, trim);
  b.boxMinMax('trim', -1.4, y0, z1 - 0.16, -0.25, y1, z1, m, trim);
  b.boxMinMax('trim', -1.4, y0 - 0.1, z0, -0.2, y0 + 0.05, z1, m, trim);
  b.boxMinMax('trim', -1.4, y1 - 0.12, z0 - 0.05, -0.18, y1 + 0.05, z1 + 0.05, m, trim);
  b.boxMinMax('frame', -0.62, y0 + 0.05, z0 + 0.16, -0.56, y1 - 0.12, z0 + 0.22, m);
  b.boxMinMax('frame', -0.62, y0 + 0.05, z1 - 0.22, -0.56, y1 - 0.12, z1 - 0.16, m);
  b.boxMinMax('frame', -0.62, y0 + 0.05, zc - 0.03, -0.56, y1 - 0.12, zc + 0.03, m);
  b.boxMinMax('frame', -0.62, (y0 + y1) / 2 - 0.02, z0 + 0.16, -0.56, (y0 + y1) / 2 + 0.02, z1 - 0.16, m);
  b.boxMinMax('glass', -0.6, y0 + 0.05, z0 + 0.16, -0.59, y1 - 0.12, z1 - 0.16, m);
  b.boxMinMax('interior', -1.35, y0, z0 + 0.16, -1.3, y1, z1 - 0.16, m, new THREE.Color(0.25, 0.22, 0.2));
  // Двускатная цинковая крыша
  const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(-1.5, y1 + 0.05, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
  b.extrude(
    'zinc',
    [
      [-(z0 - 0.12), 0],
      [-(z1 + 0.12), 0],
      [-zc, 0.55],
    ],
    1.35,
    pm,
  );
}

/** Витрина лавки: пилястры, вывеска, стекло с переплётом, цоколь, дверь */
function shopfront(b: GeoBuilder, shop: ShopSpec, z0: number, z1: number, bay: number, m: THREE.Matrix4, out: BuildingOut) {
  const c = shop.color;
  const gold = new THREE.Color(1, 1, 1);
  const P = 0.3; // вынос от стены
  // Глухая стена за витриной
  b.boxMinMax('stone', -DEPTH, 0, z0, -0.4, GF, z1, m, c.clone().multiplyScalar(0));
  // Пилястры
  for (const [a, bb] of [
    [z0, z0 + 0.38],
    [z1 - 0.38, z1],
  ]) {
    b.boxMinMax('shopwood', 0, 0, a, P, 3.95, bb, m, c);
    b.boxMinMax('shopwood', 0, 3.55, a - 0.04, P + 0.06, 3.95, bb + 0.04, m, c);
    b.boxMinMax('gold', P, 1.0, a + 0.16, P + 0.01, 3.2, a + 0.18, m, gold);
    b.boxMinMax('gold', P, 1.0, bb - 0.18, P + 0.01, 3.2, bb - 0.16, m, gold);
  }
  // Фриз-вывеска и карниз
  b.boxMinMax('shopwood', 0, 3.05, z0, P - 0.02, 3.95, z1, m, c);
  b.boxMinMax('shopwood', 0, 3.95, z0 - 0.06, P + 0.14, 4.12, z1 + 0.06, m, c);
  b.boxMinMax('gold', P + 0.12, 4.02, z0 - 0.04, P + 0.15, 4.06, z1 + 0.04, m, gold);
  out.signs.push({ id: shop.id, center: new THREE.Vector3(P - 0.01, 3.5, (z0 + z1) / 2), width: z1 - z0 - 0.9, height: 0.66 });

  // Цоколь и витринные рамы
  const za = z0 + 0.38;
  const zb = z1 - 0.38;
  const doorW = 1.25;
  const doorC = Math.min(Math.max((shop.doorBay + 0.5) * bay, za + doorW), zb - doorW);
  const d0 = doorC - doorW / 2;
  const d1 = doorC + doorW / 2;
  for (const [a, bb] of [
    [za, d0],
    [d1, zb],
  ]) {
    if (bb - a < 0.3) continue;
    b.boxMinMax('shopwood', 0.02, 0, a, P - 0.04, 0.68, bb, m, c);
    // Золотая филёнка цоколя — тонкими линиями, не плашкой
    b.boxMinMax('gold', P - 0.04, 0.12, a + 0.08, P - 0.03, 0.145, bb - 0.08, m, gold);
    b.boxMinMax('gold', P - 0.04, 0.535, a + 0.08, P - 0.03, 0.56, bb - 0.08, m, gold);
    b.boxMinMax('shopwood', 0.02, 0.68, a, P - 0.02, 0.76, bb, m, c);
    b.boxMinMax('shopwood', 0.04, 2.55, a, P - 0.06, 2.62, bb, m, c);
    const n = Math.max(1, Math.round((bb - a) / 1.15));
    for (let i = 0; i <= n; i++) {
      const z = a + ((bb - a) * i) / n;
      b.boxMinMax('shopwood', 0.04, 0.76, z - 0.035, P - 0.06, 3.05, z + 0.035, m, c);
    }
    b.boxMinMax('glass', 0.12, 0.76, a, 0.13, 3.05, bb, m);
    out.windows.push({ id: shop.id, center: new THREE.Vector3(0.12, 1.9, (a + bb) / 2), width: bb - a, height: 2.3, lit: !!shop.lit });
  }
  // Дверь: утоплена, остеклённая, с фрамугой
  b.boxMinMax('shopwood', -0.42, 0, d0 - 0.06, P, 0.05, d1 + 0.06, m, c.clone().multiplyScalar(0.6));
  b.boxMinMax('shopwood', -0.35, 0, d0, -0.28, 2.75, d0 + 0.09, m, c);
  b.boxMinMax('shopwood', -0.35, 0, d1 - 0.09, -0.28, 2.75, d1, m, c);
  b.boxMinMax('shopwood', -0.35, 2.6, d0, -0.28, 3.05, d1, m, c);
  b.boxMinMax('shopwood', -0.34, 0, d0 + 0.09, -0.3, 0.9, d1 - 0.09, m, c);
  b.boxMinMax('glass', -0.33, 0.9, d0 + 0.09, -0.32, 2.6, d1 - 0.09, m);
  b.boxMinMax('gold', -0.29, 1.3, d1 - 0.22, -0.26, 1.34, d1 - 0.14, m, gold);
  // Откосы проёма двери
  b.boxMinMax('shopwood', -0.4, 0, d0 - 0.06, P - 0.04, 3.05, d0, m, c);
  b.boxMinMax('shopwood', -0.4, 0, d1, P - 0.04, 3.05, d1 + 0.06, m, c);
  out.doors.push({ id: shop.id, center: new THREE.Vector3(0.3, 0, doorC) });
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

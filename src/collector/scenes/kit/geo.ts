import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Сборщик статичной геометрии: детали складываются по ключу материала, потом сливаются
// в один меш на материал. UV — в метрах по мировым координатам (проекция по доминирующей оси нормали),
// поэтому швы кладки сходятся между соседними блоками.

const WHITE = new THREE.Color(1, 1, 1);

export class GeoBuilder {
  private buckets = new Map<string, THREE.BufferGeometry[]>();

  /** geo — в локальных координатах, matrix — в мир. tint — множитель цвета (vertex color) */
  add(key: string, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, tint: THREE.Color = WHITE) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.clearGroups();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.getAttribute('position').count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([tint.r, tint.g, tint.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const list = this.buckets.get(key) ?? [];
    list.push(g);
    this.buckets.set(key, list);
    geo.dispose();
  }

  /** Ящик по центру и размерам */
  box(key: string, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, matrix?: THREE.Matrix4, tint?: THREE.Color) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.translate(cx, cy, cz);
    this.add(key, g, matrix, tint);
  }

  /** Ящик по двум углам */
  boxMinMax(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, matrix?: THREE.Matrix4, tint?: THREE.Color) {
    this.box(key, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), matrix, tint);
  }

  /** Профиль в плоскости XY, вытянутый вдоль Z на depth */
  extrude(key: string, points: [number, number][], depth: number, matrix?: THREE.Matrix4, tint?: THREE.Color) {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    this.add(key, g, matrix, tint);
  }

  has(key: string) {
    return this.buckets.has(key);
  }

  /** uvScale — сколько повторов текстуры на метр для ключа; noShadow — ключи, которые не отбрасывают тень */
  build(materials: Record<string, THREE.Material>, uvScale: Record<string, number> = {}, noShadow: string[] = []) {
    const group = new THREE.Group();
    for (const [key, list] of this.buckets) {
      const mat = materials[key];
      if (!mat) throw new Error(`GeoBuilder: нет материала «${key}»`);
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      worldUV(merged, uvScale[key] ?? 1);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = key;
      mesh.castShadow = !noShadow.includes(key);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

/** UV по мировой позиции: грань с нормалью по X → (z, y), по Z → (x, y), по Y → (x, z) */
export function worldUV(g: THREE.BufferGeometry, scale: number) {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  // Тройки вершин одного треугольника берут общую ось — без разрывов внутри грани
  for (let t = 0; t < pos.count; t += 3) {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let k = 0; k < 3; k++) {
      nx += nor.getX(t + k);
      ny += nor.getY(t + k);
      nz += nor.getZ(t + k);
    }
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    for (let k = 0; k < 3; k++) {
      const i = t + k;
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let u: number;
      let v: number;
      if (ay >= ax && ay >= az) [u, v] = [x, z];
      else if (ax >= az) [u, v] = [nx > 0 ? -z : z, y];
      else [u, v] = [nz > 0 ? x : -x, y];
      uv[i * 2] = u * scale;
      uv[i * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Матрица «позиция + поворот вокруг Y» */
export function placeY(x: number, y: number, z: number, rotY = 0) {
  return new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
}

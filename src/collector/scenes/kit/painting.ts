import * as THREE from 'three/webgpu';

// Картина в золочёной раме: холст по реальным пропорциям (см → м) и рама из нескольких
// профилей со скосами — читается как лепная багетная рама под любой формат.

let goldMat: THREE.MeshStandardMaterial | null = null;
let darkGoldMat: THREE.MeshStandardMaterial | null = null;
function golds() {
  goldMat ??= new THREE.MeshStandardMaterial({ color: 0xc89b4e, metalness: 1, roughness: 0.32, normalMap: patina(), normalScale: new THREE.Vector2(0.35, 0.35) });
  darkGoldMat ??= new THREE.MeshStandardMaterial({ color: 0x7a5a2a, metalness: 1, roughness: 0.5 });
  return [goldMat, darkGoldMat] as const;
}

export interface Framed {
  group: THREE.Group;
  canvas: THREE.Mesh;
  /** Внешний размер с рамой, м */
  outer: { width: number; height: number };
}

/** w, h — размер холста в метрах; рама тем шире, чем больше картина */
export function framedPainting(texture: THREE.Texture | null, w: number, h: number, opts: { frame?: number } = {}): Framed {
  const [gold, dark] = golds();
  const f = opts.frame ?? THREE.MathUtils.clamp(Math.max(w, h) * 0.085, 0.07, 0.16);
  const group = new THREE.Group();

  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ map: texture, color: texture ? 0xffffff : 0x3a332b, roughness: 0.72 }),
  );
  canvas.position.z = 0.012;
  canvas.receiveShadow = true;
  group.add(canvas);

  // Слои рамы: внутренний тёмный «лиф», выпуклый вал, наружный бортик
  const layers: [number, number, number, THREE.Material, number][] = [
    // [отступ внутрь от края холста, ширина, глубина, материал, скос]
    [0.005, f * 0.22, 0.03, dark, 0.006],
    [-f * 0.2, f * 0.55, 0.055, gold, f * 0.18],
    [-f * 0.72, f * 0.3, 0.045, gold, f * 0.08],
  ];
  for (const [inset, width, depth, mat, bevel] of layers) {
    const iw = w / 2 - inset;
    const ih = h / 2 - inset;
    const ow = iw + width;
    const oh = ih + width;
    const shape = new THREE.Shape([new THREE.Vector2(-ow, -oh), new THREE.Vector2(ow, -oh), new THREE.Vector2(ow, oh), new THREE.Vector2(-ow, oh)]);
    shape.holes.push(new THREE.Path([new THREE.Vector2(-iw, -ih), new THREE.Vector2(-iw, ih), new THREE.Vector2(iw, ih), new THREE.Vector2(iw, -ih)]));
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel * 0.8,
      bevelSegments: 4,
      curveSegments: 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  const outerW = w + 2 * (f * 0.72 + f * 0.3);
  const outerH = h + 2 * (f * 0.72 + f * 0.3);
  return { group, canvas, outer: { width: outerW, height: outerH } };
}

/** Шумовая карта нормалей «потёртое золото» */
function patina() {
  const n = 256;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d')!;
  const img = g.createImageData(n, n);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n * n; i++) {
    const v = r();
    img.data[i * 4] = 128 + (v - 0.5) * 50;
    img.data[i * 4 + 1] = 128 + (r() - 0.5) * 50;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}

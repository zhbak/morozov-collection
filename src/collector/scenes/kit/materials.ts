import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Текстуры Poly Haven (public/collector/textures/<id>/{diff,nor,arm}.webp) и GLB-модели.
// Повтор задаётся в UV (метры), поэтому текстуры не клонируются.

export interface PbrOptions extends THREE.MeshStandardMaterialParameters {
  normalStrength?: number;
  /** Взять металличность из синего канала arm */
  metalFromMap?: boolean;
  vertexColors?: boolean;
}

export class Kit {
  private textures = new Map<string, Promise<THREE.Texture>>();
  private models = new Map<string, Promise<THREE.Group>>();
  private loader = new THREE.TextureLoader();
  private gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

  constructor(
    readonly base: string,
    private anisotropy = 8,
  ) {}

  tex(id: string, map: 'diff' | 'nor' | 'arm') {
    const key = `${id}/${map}`;
    let p = this.textures.get(key);
    if (!p) {
      p = this.loader.loadAsync(`${this.base}textures/${key}.webp`).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = this.anisotropy;
        if (map === 'diff') t.colorSpace = THREE.SRGBColorSpace;
        return t;
      });
      this.textures.set(key, p);
    }
    return p;
  }

  async pbr(id: string, opts: PbrOptions = {}) {
    const { normalStrength = 1, metalFromMap = false, ...params } = opts;
    const [map, normalMap, arm] = await Promise.all([this.tex(id, 'diff'), this.tex(id, 'nor'), this.tex(id, 'arm')]);
    const m = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(normalStrength, normalStrength),
      aoMap: arm,
      roughnessMap: arm,
      metalnessMap: metalFromMap ? arm : null,
      roughness: 1,
      metalness: metalFromMap ? 1 : 0,
      ...params,
    });
    return m;
  }

  /** GLB из public/collector/models; каждый вызов — клон (геометрия и материалы общие) */
  async model(id: string) {
    let p = this.models.get(id);
    if (!p) {
      p = this.gltf.loadAsync(`${this.base}models/${id}.glb`).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) m.castShadow = m.receiveShadow = true;
        });
        return g.scene;
      });
      this.models.set(id, p);
    }
    return (await p).clone();
  }
}

/** Модель стоит на полу (min.y = 0), по центру XZ и нужной высоты */
export function fitModel(obj: THREE.Object3D, opts: { height?: number; width?: number; length?: number }) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const k = opts.height ? opts.height / size.y : opts.width ? opts.width / size.x : opts.length ? opts.length / size.z : 1;
  obj.scale.multiplyScalar(k);
  const b = new THREE.Box3().setFromObject(obj);
  const c = b.getCenter(new THREE.Vector3());
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= b.min.y;
  const wrap = new THREE.Group();
  wrap.add(obj);
  return { group: wrap, size: b.getSize(new THREE.Vector3()) };
}

/** Вывеска: золотые буквы с тенью на крашеной доске */
export async function signTexture(text: string, opts: { bg: string; width?: number; height?: number; font?: string }) {
  const font = opts.font ?? '600 {s}px "Cormorant Garamond", "PT Serif", Georgia, serif';
  await document.fonts.load(font.replace('{s}', '80')).catch(() => []);
  const w = opts.width ?? 2048;
  const h = opts.height ?? 192;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = opts.bg;
  g.fillRect(0, 0, w, h);
  // Тонкая рамка-филёнка
  g.strokeStyle = 'rgba(214, 178, 106, 0.55)';
  g.lineWidth = 4;
  g.strokeRect(14, 14, w - 28, h - 28);
  let size = Math.floor(h * 0.56);
  g.font = font.replace('{s}', String(size));
  while (g.measureText(text).width > w * 0.9 && size > 20) {
    size -= 4;
    g.font = font.replace('{s}', String(size));
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.letterSpacing = `${Math.round(size * 0.12)}px`;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillText(text, w / 2 + 3, h / 2 + 5);
  const grad = g.createLinearGradient(0, h * 0.25, 0, h * 0.75);
  grad.addColorStop(0, '#f6dc9a');
  grad.addColorStop(0.5, '#c99a45');
  grad.addColorStop(1, '#8a6224');
  g.fillStyle = grad;
  g.fillText(text, w / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export interface PlaceOptions {
  fit: { height?: number; width?: number; length?: number };
  at: [number, number, number];
  rotY?: number;
  /** Полуразмеры коллайдера по x и z; по умолчанию — по габариту модели. null — без коллайдера */
  collider?: [number, number] | null;
}

/** Поставить модель в сцену с коллайдером-ящиком. Модели нет — тихо пропускаем (ассеты догружаются) */
export async function placeModel(
  kit: Kit,
  scene: THREE.Object3D,
  physics: { addBox(c: THREE.Vector3Like, h: THREE.Vector3Like, rot?: number): unknown } | null,
  id: string,
  o: PlaceOptions,
) {
  const m = await kit.model(id).catch(() => null);
  if (!m) return null;
  const { group, size } = fitModel(m, o.fit);
  const [x, y, z] = o.at;
  group.position.set(x, y, z);
  group.rotation.y = o.rotY ?? 0;
  scene.add(group);
  if (physics && o.collider !== null) {
    const [hx, hz] = o.collider ?? [size.x / 2, size.z / 2];
    physics.addBox({ x, y: y + size.y / 2, z }, { x: hx, y: size.y / 2, z: hz }, o.rotY ?? 0);
  }
  return group;
}

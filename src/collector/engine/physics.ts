import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';

// Коллизии строятся по упрощённым формам (ящики, капсулы, отдельные collider-меши),
// а не по визуальной геометрии.

let ready: Promise<void> | null = null;
export function initPhysics() {
  ready ??= RAPIER.init();
  return ready;
}

/** Группа «камера проходит сквозь»: декор, который не должен поджимать камеру */
export const GROUP_SOLID = 0x0001;
export const GROUP_CAMERA_IGNORE = 0x0002;
const groups = (membership: number, filter: number) => (membership << 16) | filter;

export class Physics {
  readonly world: RAPIER.World;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  /** Неподвижный ящик: center и half — в метрах; rot — угол вокруг Y в радианах или кватернион */
  addBox(
    center: THREE.Vector3Like,
    half: THREE.Vector3Like,
    rot: number | THREE.Quaternion = 0,
    opts: { cameraIgnore?: boolean } = {},
  ) {
    const q = typeof rot === 'number' ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot) : rot;
    const desc = RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z)
      .setTranslation(center.x, center.y, center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (opts.cameraIgnore) desc.setCollisionGroups(groups(GROUP_CAMERA_IGNORE, 0xffff));
    return this.world.createCollider(desc);
  }

  addCylinder(center: THREE.Vector3Like, radius: number, halfHeight: number, opts: { cameraIgnore?: boolean } = {}) {
    const desc = RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(center.x, center.y, center.z);
    if (opts.cameraIgnore) desc.setCollisionGroups(groups(GROUP_CAMERA_IGNORE, 0xffff));
    return this.world.createCollider(desc);
  }

  /** Статичный trimesh из меша в мировых координатах (для collider-мешей, не для визуала) */
  addTrimesh(object: THREE.Object3D) {
    object.updateWorldMatrix(true, true);
    const colliders: RAPIER.Collider[] = [];
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geo = mesh.geometry.index ? mesh.geometry : mesh.geometry.toNonIndexed();
      const pos = geo.getAttribute('position');
      const verts = new Float32Array(pos.count * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        verts.set([v.x, v.y, v.z], i * 3);
      }
      const indices = geo.index
        ? new Uint32Array(geo.index.array)
        : Uint32Array.from({ length: pos.count }, (_, i) => i);
      colliders.push(this.world.createCollider(RAPIER.ColliderDesc.trimesh(verts, indices)));
    });
    return colliders;
  }

  /**
   * Сферический луч от origin к target: расстояние до первого препятствия или null.
   * Используется пружиной камеры, игнорирует GROUP_CAMERA_IGNORE.
   */
  sphereCast(origin: THREE.Vector3, target: THREE.Vector3, radius: number, exclude?: RAPIER.Collider) {
    const dir = target.clone().sub(origin);
    const dist = dir.length();
    if (dist < 1e-4) return null;
    dir.divideScalar(dist);
    const hit = this.world.castShape(
      origin,
      { x: 0, y: 0, z: 0, w: 1 },
      dir,
      new RAPIER.Ball(radius),
      0,
      dist,
      true,
      undefined,
      groups(0xffff, GROUP_SOLID),
      exclude,
    );
    return hit ? hit.time_of_impact : null;
  }

  step(dt: number) {
    this.world.timestep = Math.min(dt, 1 / 30);
    this.world.step();
  }

  dispose() {
    this.world.free();
  }
}

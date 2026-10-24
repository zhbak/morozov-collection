import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three/webgpu';
import type { Physics } from './physics';

// Кинематическая капсула персонажа на Rapier KinematicCharacterController.
// Координаты position — точка между ступнями.

export const WALK_SPEED = 1.7;
export const RUN_SPEED = 4.6;
const ACCEL = 10;
const GRAVITY = 18;

export interface CharacterOptions {
  height?: number;
  radius?: number;
}

export class CharacterBody {
  readonly height: number;
  readonly radius: number;
  readonly collider: RAPIER.Collider;
  /** Текущая горизонтальная скорость, м/с — для выбора анимации */
  speed = 0;
  grounded = true;
  /** Направление взгляда тела (рад), 0 — вдоль −Z */
  facing = 0;

  private body: RAPIER.RigidBody;
  private controller: RAPIER.KinematicCharacterController;
  private velocity = new THREE.Vector3();
  private vy = 0;
  private _pos = new THREE.Vector3();

  constructor(
    private physics: Physics,
    spawn: THREE.Vector3,
    opts: CharacterOptions = {},
  ) {
    this.height = opts.height ?? 1.8;
    this.radius = opts.radius ?? 0.3;
    const world = physics.world;
    const halfCyl = this.height / 2 - this.radius;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + this.height / 2, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(halfCyl, this.radius), this.body);
    this.controller = world.createCharacterController(0.02);
    this.controller.setUp({ x: 0, y: 1, z: 0 });
    this.controller.enableAutostep(0.32, 0.15, false);
    this.controller.enableSnapToGround(0.35);
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(46));
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(50));
    this.controller.setSlideEnabled(true);
  }

  get position() {
    const t = this.body.translation();
    return this._pos.set(t.x, t.y - this.height / 2, t.z);
  }

  teleport(p: THREE.Vector3, facing?: number) {
    this.body.setTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.height / 2, z: p.z });
    this.velocity.set(0, 0, 0);
    this.vy = 0;
    this.speed = 0;
    if (facing !== undefined) this.facing = facing;
  }

  /**
   * wish — желаемое направление в мировых координатах (y игнорируется, длина ≤ 1).
   * faceTo — если задано, тело смотрит туда (вид от первого лица), иначе — по движению.
   */
  update(dt: number, wish: THREE.Vector3, run: boolean, faceTo?: number) {
    const target = new THREE.Vector3(wish.x, 0, wish.z).multiplyScalar(run ? RUN_SPEED : WALK_SPEED);
    const k = 1 - Math.exp(-ACCEL * dt);
    this.velocity.lerp(target, k);
    if (target.lengthSq() === 0 && this.velocity.lengthSq() < 1e-4) this.velocity.set(0, 0, 0);

    this.vy = this.grounded ? -1 : this.vy - GRAVITY * dt;
    const delta = { x: this.velocity.x * dt, y: this.vy * dt, z: this.velocity.z * dt };
    this.controller.computeColliderMovement(this.collider, delta);
    const m = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });

    // Реальная скорость после столкновений — чтобы у стены ноги не «бежали на месте»
    this.speed = dt > 0 ? Math.hypot(m.x, m.z) / dt : 0;

    if (faceTo !== undefined) this.facing = faceTo;
    else if (this.speed > 0.15) {
      const want = Math.atan2(-m.x, -m.z);
      this.facing = dampAngle(this.facing, want, 12, dt);
    }
  }

  dispose() {
    this.physics.world.removeCharacterController(this.controller);
    this.physics.world.removeRigidBody(this.body);
  }
}

export function dampAngle(from: number, to: number, lambda: number, dt: number) {
  let d = to - from;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return from + d * (1 - Math.exp(-lambda * dt));
}

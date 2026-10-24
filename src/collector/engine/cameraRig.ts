import * as THREE from 'three/webgpu';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from './physics';

// Камера от третьего лица на «пружине» (сферический луч не даёт пройти сквозь стену)
// и от первого лица. Переход между режимами и наезды на картины — плавные.

const SENS = 0.0022;
const ARM = 3.1;
const SHOULDER = 0.42;
const PIVOT_Y = 1.62;
const EYE_Y = 1.66;
const PROBE_RADIUS = 0.22;

export type ViewMode = 'third' | 'first';

export interface Shot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

export class CameraRig {
  mode: ViewMode = 'third';
  yaw = 0;
  pitch = -0.12;
  /** 0 — третье лицо, 1 — первое; анимируется к целевому режиму */
  private blend = 0;
  private arm = ARM;
  private shot: Shot | null = null;
  private shotBlend = 0;
  private from = new THREE.Vector3();
  private look = new THREE.Vector3();
  private baseFov = { third: 52, first: 66 };

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private physics: Physics,
  ) {}

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
  get right() {
    return new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
  /** 0..1 — насколько камера близко к телу; персонажа прячем, чтобы не смотреть изнутри */
  get bodyVisibility() {
    if (this.blend > 0.5) return 0;
    return THREE.MathUtils.clamp((this.arm * (1 - this.blend) - 0.35) / 0.5, 0, 1);
  }

  toggle() {
    this.mode = this.mode === 'third' ? 'first' : 'third';
  }

  /** Повернуть камеру за спину персонажа (после телепорта) */
  snapBehind(facing: number) {
    this.yaw = facing;
    this.pitch = -0.12;
  }

  setShot(shot: Shot | null) {
    this.shot = shot;
  }
  get inShot() {
    return this.shot !== null;
  }

  rotate(dx: number, dy: number) {
    this.yaw -= dx * SENS;
    this.pitch -= dy * SENS;
    const [lo, hi] = this.mode === 'first' ? [-1.35, 1.35] : [-1.0, 0.55];
    this.pitch = THREE.MathUtils.clamp(this.pitch, lo, hi);
  }

  update(dt: number, feet: THREE.Vector3, exclude?: RAPIER.Collider) {
    const k = (l: number) => 1 - Math.exp(-l * dt);
    this.blend += ((this.mode === 'first' ? 1 : 0) - this.blend) * k(10);
    this.shotBlend += ((this.shot ? 1 : 0) - this.shotBlend) * k(this.shot ? 3.2 : 5);

    const dir = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    // Третье лицо: от головы к камере за плечом; луч поджимает пружину у стен
    const head = feet.clone().add(new THREE.Vector3(0, PIVOT_Y, 0));
    const pivot = head.clone().addScaledVector(this.right, SHOULDER);
    const desired = pivot.clone().addScaledVector(dir, -ARM);
    const hit = this.physics.sphereCast(head, desired, PROBE_RADIUS, exclude);
    const full = head.distanceTo(desired);
    const allowed = hit === null ? full : Math.max(hit - 0.05, 0.25);
    const want = (allowed / full) * ARM;
    // Внутрь — сразу, наружу — плавно, чтобы камера не дёргалась у колонн
    this.arm = want < this.arm ? want : this.arm + (want - this.arm) * k(3);
    const thirdPos = head.clone().lerp(desired, this.arm / ARM);
    const thirdLook = pivot.clone().addScaledVector(dir, 4);

    const eye = feet.clone().add(new THREE.Vector3(0, EYE_Y, 0)).addScaledVector(this.forward, 0.12);
    const firstLook = eye.clone().addScaledVector(dir, 4);

    const pos = thirdPos.lerp(eye, this.blend);
    const look = thirdLook.lerp(firstLook, this.blend);
    let fov = THREE.MathUtils.lerp(this.baseFov.third, this.baseFov.first, this.blend);

    if (this.shot || this.shotBlend > 0.001) {
      if (this.shot) {
        this.from.copy(this.shot.position);
        this.look.copy(this.shot.target);
      }
      const s = smooth(this.shotBlend);
      pos.lerp(this.from, s);
      look.lerp(this.look, s);
      fov = THREE.MathUtils.lerp(fov, this.shot?.fov ?? fov, s);
    }

    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);

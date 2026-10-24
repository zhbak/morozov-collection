import * as THREE from 'three';
import type { Room } from './room';

const ROOM_POS = new THREE.Vector3(0, 1.6, 1.7);
const YAW_LIMIT = THREE.MathUtils.degToRad(55);
const PITCH_LIMIT = THREE.MathUtils.degToRad(15);

export type CameraMode = 'room' | 'focus';

/** Камера-«взгляд»: в зале крутим головой, у картины — стоим напротив неё. */
export class CameraRig {
  mode: CameraMode = 'room';
  private yaw = 0;
  private pitch = 0;
  private targetPos = ROOM_POS.clone();
  private targetQuat = new THREE.Quaternion();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private room: Room,
  ) {
    camera.position.copy(ROOM_POS);
    this.updateRoomTarget();
    camera.quaternion.copy(this.targetQuat);
  }

  drag(dx: number, dy: number) {
    if (this.mode !== 'room') return;
    this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.004, -YAW_LIMIT, YAW_LIMIT);
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.003, -PITCH_LIMIT, PITCH_LIMIT);
    this.updateRoomTarget();
  }

  focus() {
    this.mode = 'focus';
    this.updateFocusTarget();
  }

  unfocus() {
    this.mode = 'room';
    this.yaw = this.pitch = 0;
    this.targetPos.copy(ROOM_POS);
    this.updateRoomTarget();
  }

  resize() {
    if (this.mode === 'focus') this.updateFocusTarget();
  }

  update(dt: number) {
    const k = 1 - Math.exp(-dt * 6);
    this.camera.position.lerp(this.targetPos, k);
    this.camera.quaternion.slerp(this.targetQuat, k);
  }

  private updateRoomTarget() {
    this.targetQuat.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
  }

  private updateFocusTarget() {
    const { center, normal, width, height } = this.room.focus;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const t = Math.tan(vfov / 2);
    // Расстояние, на котором картина с рамой целиком помещается в кадр с небольшим запасом
    const dist = Math.max(height / 2 / t, width / 2 / (t * this.camera.aspect)) * 1.08;
    this.targetPos.copy(center).addScaledVector(normal, dist);
    this.targetQuat.identity();
  }
}

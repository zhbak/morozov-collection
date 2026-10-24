import type * as THREE from 'three/webgpu';
import type { Physics } from '../engine/physics';
import type { PostOptions } from '../engine/post';
import type { Quality } from '../engine/quality';
import type { Shot } from '../engine/cameraRig';
import type { Session } from '../game/session';

export type LocationId = 'testbed' | 'street' | 'gallery' | 'mansion';

/** Точка, с которой можно взаимодействовать клавишей E */
export interface Interactable {
  id: string;
  position: THREE.Vector3;
  /** Дистанция срабатывания, м */
  radius: number;
  /** Куда надо смотреть (картина на стене); по умолчанию — position */
  target?: THREE.Vector3;
  /** Подсказка: «E — осмотреть картину» */
  label: string;
  enabled?: () => boolean;
  action(): void;
}

export interface Level {
  id: LocationId;
  scene: THREE.Scene;
  spawn: { position: THREE.Vector3; facing: number };
  post: PostOptions;
  exposure?: number;
  toneMapping?: THREE.ToneMapping;
  interactables: Interactable[];
  update?(dt: number, elapsed: number): void;
  dispose(): void;
}

export interface LevelContext {
  renderer: THREE.WebGPURenderer;
  physics: Physics;
  quality: Quality;
  /** import.meta.env.BASE_URL + 'collector/' */
  assets: string;
  /** Связь локации с игрой: переходы, сообщения, экраны */
  actions: LevelActions;
  session: Session;
}

export interface LevelActions {
  goto(id: LocationId): void;
  toast(text: string): void;
  /** Крупный план картины в галерее со справкой и кнопкой «Купить» */
  inspect(paintingId: string, shot: Shot): void;
  /** Из галереи — в особняк, с подписью-переходом */
  travel(): void;
  /** Выбор картины для места на стене особняка */
  chooseHanging(slotId: string, shot: Shot): void;
}

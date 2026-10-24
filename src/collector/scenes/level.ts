import type * as THREE from 'three/webgpu';
import type { Physics } from '../engine/physics';
import type { PostOptions } from '../engine/post';
import type { Quality } from '../engine/quality';

export type LocationId = 'testbed' | 'street' | 'gallery' | 'mansion';

/** Точка, с которой можно взаимодействовать клавишей E */
export interface Interactable {
  id: string;
  position: THREE.Vector3;
  /** Дистанция срабатывания, м */
  radius: number;
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
}

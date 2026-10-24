import * as THREE from 'three/webgpu';
import type { CharacterBody } from './character';

// Визуальное тело персонажа. Капсула — заглушка до модели с ригом.

export interface Avatar {
  object: THREE.Object3D;
  /** visibility 0..1: у камеры вплотную тело прячется */
  update(dt: number, body: CharacterBody, visibility: number): void;
  dispose(): void;
}

export function capsuleAvatar(body: CharacterBody): Avatar {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2c2a33, roughness: 0.55 });
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(body.radius, body.height - body.radius * 2, 8, 24), mat);
  capsule.position.y = body.height / 2;
  capsule.castShadow = true;
  // «Нос» показывает направление тела
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.2), new THREE.MeshStandardMaterial({ color: 0xc9a46a }));
  nose.position.set(0, body.height * 0.82, -body.radius);
  nose.castShadow = true;
  group.add(capsule, nose);
  return {
    object: group,
    update(_dt, b, visibility) {
      group.position.copy(b.position);
      group.rotation.y = b.facing;
      group.visible = visibility > 0.05;
    },
    dispose() {
      capsule.geometry.dispose();
      mat.dispose();
    },
  };
}

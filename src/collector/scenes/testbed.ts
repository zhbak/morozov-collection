import * as THREE from 'three/webgpu';
import type { Level, LevelContext } from './level';
import { addSkyAndSun } from './sky';

// Тестовая площадка для управления и камеры: ступени, пандус, узкий коридор, колонны.

export async function buildTestbed(ctx: LevelContext): Promise<Level> {
  const { physics, renderer, quality } = ctx;
  const scene = new THREE.Scene();
  const sky = addSkyAndSun(scene, renderer, {
    elevation: 11,
    azimuth: 235,
    intensity: 6,
    color: 0xffc58f,
    shadowFar: 140,
    shadowMapSize: quality.shadowMapSize,
  });
  scene.environmentIntensity = 0.45;

  const stone = new THREE.MeshStandardMaterial({ color: 0xb9ab95, roughness: 0.85, map: tileTexture() });
  const plaster = new THREE.MeshStandardMaterial({ color: 0xe2d6c2, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a3f36, roughness: 0.6, metalness: 0.1 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8a85a, roughness: 0.25, metalness: 1 });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), stone);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 40, y: 0.5, z: 40 });

  const block = (x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y + h / 2, z);
    m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    physics.addBox({ x, y: y + h / 2, z }, { x: w / 2, y: h / 2, z: d / 2 }, rotY);
    return m;
  };

  // Ступени к площадке высотой 1.2 м
  for (let i = 0; i < 8; i++) block(-6, 0, -6 - i * 0.32, 3, 0.15 * (i + 1), 0.32, plaster);
  block(-6, 0, -10.2, 3, 1.2, 3, plaster);

  // Пандус ~18°
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 6), plaster);
  ramp.position.set(5, 0.95, -7);
  ramp.rotation.x = THREE.MathUtils.degToRad(18);
  ramp.castShadow = ramp.receiveShadow = true;
  scene.add(ramp);
  physics.addBox(ramp.position, { x: 1.25, y: 0.1, z: 3 }, new THREE.Quaternion().setFromEuler(ramp.rotation));

  // Узкий коридор и арка — проверка пружины камеры
  block(-1.1, 0, -16, 0.4, 3.2, 8, plaster);
  block(1.1, 0, -16, 0.4, 3.2, 8, plaster);
  block(0, 3.2, -16, 2.6, 0.4, 8, plaster);

  // Колоннада с латунными шарами — блики для bloom
  for (let i = 0; i < 6; i++) {
    const x = -10 + i * 4;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4, 24), plaster);
    col.position.set(x, 2, 6);
    col.castShadow = col.receiveShadow = true;
    scene.add(col);
    physics.addCylinder({ x, y: 2, z: 6 }, 0.32, 2);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), brass);
    ball.position.set(x, 4.25, 6);
    ball.castShadow = true;
    scene.add(ball);
  }

  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    block(Math.cos(a) * 14, 0, Math.sin(a) * 14 + 4, 1.2, 0.6 + (i % 3) * 0.7, 1.2, dark, a);
  }

  return {
    id: 'testbed',
    scene,
    spawn: { position: new THREE.Vector3(0, 0, 2), facing: 0 },
    post: { bloom: { strength: 0.12, radius: 0.4, threshold: 0.9 }, vignette: 0.3 },
    exposure: 0.85,
    interactables: [],
    dispose() {
      sky.dispose();
    },
  };
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8d0c2';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#c4b9a6';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if ((x + y) % 2) g.fillRect(x * 64, y * 64, 64, 64);
  g.strokeStyle = '#a99c86';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 40);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

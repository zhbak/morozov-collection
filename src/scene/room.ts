import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Episode } from '../content/episodes';

// Стилизованный зал, а не точная реконструкция особняка: размеры и цвета условные
const ROOM = { w: 5, h: 3.6, d: 5 };
const PAINTING_CENTER_Y = 1.65;
const FRAME_BORDER = 0.11;

export interface Room {
  scene: THREE.Scene;
  painting: THREE.Mesh;
  placeholders: THREE.Object3D[];
  /** Центр картины и нормаль стены — для наезда камеры */
  focus: { center: THREE.Vector3; normal: THREE.Vector3; width: number; height: number };
  addMarker(u: number, v: number, radius: number, color?: number): THREE.Mesh;
}

export async function buildRoom(
  renderer: THREE.WebGLRenderer,
  ep: Episode,
  paintingUrl: string,
  modelBase: string,
): Promise<Room> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1a17);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  addShell(scene);
  addLights(scene);

  const { width, height } = ep.painting!;
  const texture = await new THREE.TextureLoader().loadAsync(paintingUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const wallZ = -ROOM.d / 2;
  const group = new THREE.Group();
  group.position.set(0, PAINTING_CENTER_Y, wallZ + 0.06);
  scene.add(group);

  const painting = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.75 }),
  );
  painting.name = 'painting';
  group.add(painting);
  group.add(makeFrame(width, height));

  const placeholders = [-1, 1].map((side) => {
    const ph = new THREE.Group();
    ph.position.set(side * (ROOM.w / 2 - 0.06), 1.6, -0.4);
    ph.rotation.y = -side * Math.PI / 2;
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(0.8, 0.62),
      new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 1 }),
    );
    canvas.name = 'placeholder';
    ph.add(canvas, makeFrame(0.8, 0.62));
    scene.add(ph);
    return canvas;
  });

  await addArmchair(scene, modelBase);

  return {
    scene,
    painting,
    placeholders,
    focus: {
      center: group.position.clone(),
      normal: new THREE.Vector3(0, 0, 1),
      width: width + FRAME_BORDER * 2,
      height: height + FRAME_BORDER * 2,
    },
    addMarker(u, v, radius, color) {
      const ringMesh = (inner: number, outer: number, c: number) =>
        new THREE.Mesh(
          new THREE.RingGeometry(radius * inner, radius * outer, 48),
          new THREE.MeshBasicMaterial({ color: c, toneMapped: false, depthWrite: false, transparent: true }),
        );
      // Найденная деталь: светлое кольцо с тёмной обводкой — читается и на жёлтом небе, и на тёмной земле
      const ring = color === undefined ? ringMesh(0.74, 1, 0x1d1a17) : ringMesh(0.9, 1, color);
      if (color === undefined) {
        const light = ringMesh(0.8, 0.94, 0xffffff);
        light.position.z = 0.0005;
        ring.add(light);
      }
      ring.position.set((u - 0.5) * width, (0.5 - v) * height, 0.003);
      painting.add(ring);
      return ring;
    },
  };
}

function addShell(scene: THREE.Scene) {
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x3f4b43, roughness: 0.92 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2c3530, roughness: 0.8 });
  const corniceMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.6 });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshStandardMaterial({ map: parquetTexture(), roughness: 0.55 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.w, ROOM.d),
    new THREE.MeshStandardMaterial({ color: 0xe8e1d0, roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM.h;
  scene.add(ceiling);

  // Четыре стены: задняя, левая, правая, передняя
  const walls: [number, number, number, number][] = [
    [0, -ROOM.d / 2, 0, ROOM.w],
    [-ROOM.w / 2, 0, Math.PI / 2, ROOM.d],
    [ROOM.w / 2, 0, -Math.PI / 2, ROOM.d],
    [0, ROOM.d / 2, Math.PI, ROOM.w],
  ];
  for (const [x, z, ry, len] of walls) {
    const wall = new THREE.Group();
    wall.position.set(x, 0, z);
    wall.rotation.y = ry;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(len, ROOM.h), wallMat);
    plane.position.y = ROOM.h / 2;
    plane.receiveShadow = true;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.03), panelMat);
    panel.position.set(0, 0.45, 0.015);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, 0.05), corniceMat);
    rail.position.set(0, 0.92, 0.025);
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(len, 0.22, 0.12), corniceMat);
    cornice.position.set(0, ROOM.h - 0.11, 0.06);
    wall.add(plane, panel, rail, cornice);
    scene.add(wall);
  }
}

function addLights(scene: THREE.Scene) {
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x3a2e24, 0.9));

  const ceilingLamp = new THREE.PointLight(0xffd9a8, 6, 8, 1.6);
  ceilingLamp.position.set(0, ROOM.h - 0.4, 0);
  scene.add(ceilingLamp);

  const spot = new THREE.SpotLight(0xfff4e0, 14, 6, Math.PI / 8, 0.6, 1.4);
  spot.position.set(0, ROOM.h - 0.2, -ROOM.d / 2 + 1.6);
  spot.target.position.set(0, PAINTING_CENTER_Y, -ROOM.d / 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0005;
  scene.add(spot, spot.target);
}

function makeFrame(w: number, h: number): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9c7a35, metalness: 0.9, roughness: 0.42 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0x6e5527, metalness: 0.7, roughness: 0.5 });
  const b = FRAME_BORDER;
  const depth = 0.06;
  const frame = new THREE.Group();
  const bars: [number, number, number, number][] = [
    [0, h / 2 + b / 2, w + b * 2, b],
    [0, -h / 2 - b / 2, w + b * 2, b],
    [-w / 2 - b / 2, 0, b, h],
    [w / 2 + b / 2, 0, b, h],
  ];
  for (const [x, y, bw, bh] of bars) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth), mat);
    bar.position.set(x, y, depth / 2 - 0.02);
    bar.castShadow = true;
    frame.add(bar);
  }
  // Внутренний валик рамы: ступенька в профиле даёт объём под направленным светом
  const m = b * 0.35;
  const mouldMat = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });
  for (const [x, y, bw, bh] of [
    [0, h / 2 + m / 2, w + m * 2, m],
    [0, -h / 2 - m / 2, w + m * 2, m],
    [-w / 2 - m / 2, 0, m, h],
    [w / 2 + m / 2, 0, m, h],
  ] as [number, number, number, number][]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, depth * 0.5), mouldMat);
    bar.position.set(x, y, depth / 2 + 0.005);
    frame.add(bar);
  }
  // Тонкий внутренний кант между рамой и холстом
  const lip = 0.012;
  for (const [x, y, bw, bh] of [
    [0, h / 2 + lip / 2, w + lip * 2, lip],
    [0, -h / 2 - lip / 2, w + lip * 2, lip],
    [-w / 2 - lip / 2, 0, lip, h],
    [w / 2 + lip / 2, 0, lip, h],
  ] as [number, number, number, number][]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), lipMat);
    bar.position.set(x, y, 0.005);
    frame.add(bar);
  }
  return frame;
}

function parquetTexture(): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const plankW = 32;
  const plankH = 128;
  // Ёлочка: доски под 45° чередуют направление по столбцам
  g.fillStyle = '#5a3b22';
  g.fillRect(0, 0, size, size);
  g.save();
  g.translate(size / 2, size / 2);
  g.rotate(Math.PI / 4);
  for (let col = -12; col < 12; col++) {
    for (let row = -12; row < 12; row++) {
      const shade = 40 + ((col * 7 + row * 13) % 5) * 6;
      g.fillStyle = `rgb(${shade + 60}, ${shade + 28}, ${shade - 4})`;
      const x = col * plankW;
      const y = row * plankH + (col % 2 === 0 ? 0 : plankH / 2);
      g.fillRect(x + 1, y + 1, plankW - 2, plankH - 2);
    }
  }
  g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

async function addArmchair(scene: THREE.Scene, modelBase: string) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  try {
    const gltf = await loader.loadAsync(`${modelBase}armchair.glb`);
    const chair = gltf.scene;
    // Масштаб по высоте ~0.95 м и постановка на пол — модели из генератора приходят в произвольных единицах
    const box = new THREE.Box3().setFromObject(chair);
    const size = box.getSize(new THREE.Vector3());
    chair.scale.setScalar(0.85 / size.y);
    box.setFromObject(chair);
    const center = box.getCenter(new THREE.Vector3());
    chair.position.set(-center.x, -box.min.y, -center.z);
    chair.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
    });
    const pivot = new THREE.Group();
    pivot.add(chair);
    pivot.position.set(1.75, 0, -1.85);
    pivot.rotation.y = -Math.PI / 5;
    scene.add(pivot);
  } catch (err) {
    // Кресло — декорация, без него эпизод проходится
    console.warn('armchair not loaded', err);
  }
}

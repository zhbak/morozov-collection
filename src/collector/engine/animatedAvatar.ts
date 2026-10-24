import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Avatar } from './avatar';
import { RUN_SPEED, WALK_SPEED, type CharacterBody } from './character';

// Персонаж с ригом Meshy: один GLB со скином и клипами. Ходьба и бег смешиваются по скорости,
// разовые действия (поклон, разглядывание картины) проигрываются поверх.

export type Clip = 'idle' | 'look' | 'walk' | 'run' | 'bow' | 'view';

/** Имена клипов в GLB от Meshy → роли. Ищем по подстроке, без учёта регистра */
const CLIP_NAMES: Record<Clip, string[]> = {
  idle: ['idle'],
  look: ['look_around', 'look around'],
  walk: ['casual_walk', 'casual walk', 'walk'],
  run: ['run_02', 'run 2', 'run'],
  bow: ['bow'],
  view: ['mirror', 'viewing'],
};

export interface AnimatedAvatar extends Avatar {
  /** Разовое действие; locomotion возвращается после окончания */
  perform(clip: 'bow' | 'view' | 'look', opts?: { loop?: boolean }): void;
  stopAction(): void;
  clips: string[];
}

export async function loadAnimatedAvatar(url: string, animsUrl: string, height: number): Promise<AnimatedAvatar> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, anims] = await Promise.all([loader.loadAsync(url), loader.loadAsync(animsUrl)]);
  const model = gltf.scene;
  const animations = anims.animations;

  // Масштаб по высоте капсулы, ступни — в ноль
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const k = height / size.y;
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      // Скиннинг сдвигает вершины за пределы bind-позы — не отсекать по исходной сфере
      m.frustumCulled = false;
    }
  });

  // Meshy ставит модель лицом к +Z, тело в игре смотрит в −Z
  const root = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI;
  turn.add(model);
  root.add(turn);

  const mixer = new THREE.AnimationMixer(model);
  const found = new Map<Clip, THREE.AnimationAction>();
  const used = new Set<THREE.AnimationClip>();
  for (const role of Object.keys(CLIP_NAMES) as Clip[]) {
    const clip = animations.find(
      (c) => !used.has(c) && CLIP_NAMES[role].some((n) => c.name.toLowerCase().includes(n)),
    );
    if (!clip) continue;
    used.add(clip);
    stripRootMotion(clip);
    found.set(role, mixer.clipAction(clip));
  }
  const loco = (['idle', 'walk', 'run'] as const).map((c) => found.get(c));
  for (const a of loco) {
    if (!a) continue;
    a.play();
    a.setEffectiveWeight(0);
  }
  found.get('idle')?.setEffectiveWeight(1);

  let action: THREE.AnimationAction | null = null;
  let idleTime = 0;
  const weights = { idle: 1, walk: 0, run: 0 };

  const avatar: AnimatedAvatar = {
    object: root,
    clips: animations.map((c) => c.name),
    update(dt, body: CharacterBody, visibility) {
      root.position.copy(body.position);
      root.rotation.y = body.facing;
      root.visible = visibility > 0.05;

      // Целевые веса locomotion по реальной скорости
      const s = body.speed;
      const tWalk = THREE.MathUtils.clamp(s / WALK_SPEED, 0, 1);
      const tRun = THREE.MathUtils.clamp((s - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);
      const target = { idle: 1 - tWalk, walk: tWalk * (1 - tRun), run: tRun };
      const kk = 1 - Math.exp(-10 * dt);
      for (const key of ['idle', 'walk', 'run'] as const) weights[key] += (target[key] - weights[key]) * kk;

      const moving = s > 0.2;
      if (moving && action) avatar.stopAction();
      const actionWeight = action ? action.getEffectiveWeight() : 0;
      const free = 1 - actionWeight;
      found.get('idle')?.setEffectiveWeight(weights.idle * free);
      found.get('walk')?.setEffectiveWeight(weights.walk * free);
      found.get('run')?.setEffectiveWeight(weights.run * free);
      // Темп шага под скорость: на месте клип не «скользит» по земле
      const w = found.get('walk');
      if (w) w.timeScale = THREE.MathUtils.clamp(s / WALK_SPEED, 0.6, 1.4);
      const r = found.get('run');
      if (r) r.timeScale = THREE.MathUtils.clamp(s / RUN_SPEED, 0.7, 1.2);

      // Долго стоит — оглядывается
      idleTime = moving ? 0 : idleTime + dt;
      if (!action && idleTime > 9 && found.has('look')) {
        avatar.perform('look');
        idleTime = 0;
      }
      mixer.update(dt);
    },
    perform(clip, opts = {}) {
      const a = found.get(clip);
      if (!a) return;
      if (action && action !== a) action.fadeOut(0.3);
      a.reset();
      a.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      a.setEffectiveWeight(1);
      a.fadeIn(0.35).play();
      action = a;
      if (!opts.loop) {
        const done = (e: { action: THREE.AnimationAction }) => {
          if (e.action !== a) return;
          mixer.removeEventListener('finished', done);
          if (action === a) avatar.stopAction();
        };
        mixer.addEventListener('finished', done);
      }
    },
    stopAction() {
      action?.fadeOut(0.4);
      action = null;
    },
    dispose() {
      mixer.stopAllAction();
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
  return avatar;
}

/** Убираем горизонтальное смещение корня (Hips): перемещение делает контроллер, клип — только позу */
export function stripRootMotion(clip: THREE.AnimationClip) {
  const track = clip.tracks.find((t) => /hips?\.position$/i.test(t.name)) ?? clip.tracks.find((t) => t.name.endsWith('.position'));
  if (!track) return;
  const v = track.values;
  const x0 = v[0];
  const z0 = v[2];
  for (let i = 0; i < v.length; i += 3) {
    v[i] = x0;
    v[i + 2] = z0;
  }
}

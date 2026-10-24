import * as THREE from 'three/webgpu';
import './collector.css';
import { pickQuality, type QualityLevel } from './engine/quality';
import { backendName, createRenderer } from './engine/renderer';
import { initPhysics, Physics } from './engine/physics';
import { CharacterBody } from './engine/character';
import { CameraRig } from './engine/cameraRig';
import { createInputState, endFrame, KeyboardMouseInput, type Action } from './engine/input';
import { PostFX } from './engine/post';
import { capsuleAvatar, type Avatar } from './engine/avatar';
import { Hud } from './ui/hud';
import type { Interactable, Level, LevelContext, LocationId } from './scenes/level';
import { buildTestbed } from './scenes/testbed';

const params = new URLSearchParams(location.search);
const quality = pickQuality(params.get('q'), { mobile: matchMedia('(pointer: coarse)').matches });
const DEBUG = params.has('debug');
const ASSETS = `${import.meta.env.BASE_URL}collector/`;

type Screen = 'loading' | 'title' | 'play' | 'pause' | 'inspect' | 'transition' | 'chapter' | 'error';

const LEVELS: Partial<Record<LocationId, (ctx: LevelContext) => Promise<Level>>> = {
  testbed: buildTestbed,
};

// Отладочные «ручки» для Playwright и агента: состояние и действия через тот же InputState
const game = {
  ready: false,
  screen: 'loading' as Screen,
  location: null as LocationId | null,
  fps: 0,
  backend: '',
  quality: quality.level as QualityLevel,
  view: 'third' as 'third' | 'first',
  player: { x: 0, y: 0, z: 0, facing: 0 },
  nearby: null as string | null,
  error: null as string | null,
  start: () => {},
  press: (_a: Action) => {},
  /** Идти: x — вправо, y — вперёд относительно камеры, в течение seconds */
  walk: (_x: number, _y: number, _seconds: number, _run = false) => Promise.resolve(),
  look: (_dx: number, _dy: number) => {},
  teleport: (_x: number, _z: number, _facing?: number) => {},
  goto: (_id: LocationId) => Promise.resolve(),
};
(window as unknown as { __game: typeof game }).__game = game;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const hud = new Hud(document.getElementById('ui')!);

boot().catch((e: Error) => {
  console.error(e);
  game.screen = 'error';
  game.error = String(e?.message ?? e);
  hud.showScreen(`<h2>Не удалось запустить</h2><p class="c-lead">${game.error}</p>`, 'c-error');
});

async function boot() {
  hud.fade(true, '', 0);
  const [renderer] = await Promise.all([
    createRenderer(canvas, quality, params.has('webgl')),
    initPhysics(),
  ]);
  game.backend = backendName(renderer);

  const camera = new THREE.PerspectiveCamera(52, 1, 0.08, 3000);
  const input = createInputState();
  const kbm = new KeyboardMouseInput(canvas, input);

  let physics = new Physics();
  let level: Level | null = null;
  let post: PostFX | null = null;
  let body: CharacterBody | null = null;
  let avatar: Avatar | null = null;
  let rig = new CameraRig(camera, physics);
  let nearby: Interactable | null = null;

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  async function load(id: LocationId) {
    const build = LEVELS[id];
    if (!build) throw new Error(`Локация «${id}» ещё не собрана`);
    post?.dispose();
    level?.dispose();
    body?.dispose();
    avatar?.dispose();
    physics.dispose();

    physics = new Physics();
    const view = rig.mode;
    rig = new CameraRig(camera, physics);
    rig.mode = view;
    level = await build({ renderer, physics, quality, assets: ASSETS });
    body = new CharacterBody(physics, level.spawn.position);
    body.teleport(level.spawn.position, level.spawn.facing);
    // Коллайдеры попадают в запросы Rapier только после шага — иначе первый кадр проваливается
    physics.step(1 / 60);
    rig.snapBehind(level.spawn.facing);
    avatar = capsuleAvatar(body);
    level.scene.add(avatar.object);
    renderer.toneMapping = level.toneMapping ?? THREE.AgXToneMapping;
    renderer.toneMappingExposure = level.exposure ?? 1;
    post = new PostFX(renderer, level.scene, camera, quality, level.post);
    // Компиляция шейдеров до первого кадра — без рывка после затемнения
    await renderer.compileAsync(level.scene, camera);
    game.location = id;
  }

  // Скриптовый ввод перекрывает клавиатуру, пока действует
  let script: { x: number; y: number; run: boolean; left: number; done: () => void } | null = null;

  game.press = (a) => input.pressed.add(a);
  game.look = (dx, dy) => {
    input.look.x += dx;
    input.look.y += dy;
  };
  game.walk = (x, y, seconds, run = false) =>
    new Promise<void>((done) => {
      script?.done();
      script = { x, y, run, left: seconds, done };
    });
  game.teleport = (x, z, facing) => body?.teleport(new THREE.Vector3(x, body.position.y, z), facing);
  game.goto = async (id) => {
    const prev = game.screen;
    game.screen = 'transition';
    await hud.fade(true);
    await load(id);
    await hud.fade(false);
    game.screen = prev === 'transition' ? 'play' : prev;
  };

  const startId = (params.get('loc') as LocationId) || 'testbed';
  await load(startId);

  const timer = new THREE.Timer();
  timer.connect(document);
  let frames = 0;
  let acc = 0;
  let lockAcquired = false;

  document.addEventListener('pointerlockchange', () => {
    if (kbm.locked) lockAcquired = true;
    else if (lockAcquired && game.screen === 'play') pause();
  });

  function play() {
    hud.clearScreen();
    game.screen = 'play';
    kbm.enabled = true;
    kbm.requestLock();
  }

  function pause() {
    if (game.screen !== 'play') return;
    game.screen = 'pause';
    kbm.enabled = false;
    kbm.reset();
    kbm.releaseLock();
    const panel = hud.showScreen(
      `<p class="c-eyebrow">Пауза</p>
       <h2>Коллекционер</h2>
       ${controlsHtml()}
       <div class="c-row">
         <button class="c-btn" data-a="resume">Продолжить</button>
         <button class="c-btn c-btn--ghost" data-a="view">${rig.mode === 'third' ? 'Вид от первого лица' : 'Вид от третьего лица'}</button>
       </div>
       <p class="c-note">Качество: ${quality.level} · ${game.backend}</p>`,
      'c-pause',
    );
    panel.querySelector('[data-a="resume"]')!.addEventListener('click', play);
    panel.querySelector('[data-a="view"]')!.addEventListener('click', () => {
      rig.toggle();
      play();
    });
  }

  game.start = play;
  const title = hud.showScreen(
    `<p class="c-eyebrow">Собрание Ивана Морозова</p>
     <h1>Коллекционер</h1>
     <p class="c-lead">Прототип: управление и камера на тестовой площадке.</p>
     ${controlsHtml()}
     <button class="c-btn" data-a="start">Начать</button>`,
    'c-title',
  );
  title.querySelector('[data-a="start"]')!.addEventListener('click', play);
  kbm.enabled = false;
  game.screen = 'title';
  await hud.fade(false, '', 700);
  game.ready = true;

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!level || !body || !post || !avatar) return;

    if (input.pressed.has('pause')) {
      if (game.screen === 'play') pause();
      else if (game.screen === 'pause') play();
    }
    const playing = game.screen === 'play';
    if (playing && input.pressed.has('toggleView')) rig.toggle();
    if (playing) rig.rotate(input.look.x, input.look.y);

    let mx = playing ? input.move.x : 0;
    let my = playing ? input.move.y : 0;
    let run = playing && input.run;
    if (script) {
      mx = script.x;
      my = script.y;
      run = script.run;
      script.left -= dt;
      if (script.left <= 0) {
        script.done();
        script = null;
      }
    }
    const wish = rig.right.multiplyScalar(mx).addScaledVector(rig.forward, my);
    // Подшаги ≤ 1/60 с: на длинном кадре контроллер Rapier проседает в пол
    const steps = Math.max(1, Math.ceil(dt * 60 - 0.01));
    for (let i = 0; i < steps; i++) {
      body.update(dt / steps, wish, run, rig.mode === 'first' ? rig.yaw : undefined);
      physics.step(dt / steps);
    }

    nearby = playing ? findNearby(level.interactables, body.position, rig.forward) : null;
    hud.setPrompt(nearby?.label ?? null);
    game.nearby = nearby?.id ?? null;
    if (nearby && input.pressed.has('interact')) nearby.action();

    rig.update(dt, body.position, body.collider);
    avatar.update(dt, body, rig.bodyVisibility);
    hud.setCrosshair(playing && rig.mode === 'first');
    level.update?.(dt, timer.getElapsed());
    post.render();
    endFrame(input);

    const p = body.position;
    game.player = { x: round(p.x), y: round(p.y), z: round(p.z), facing: round(body.facing) };
    game.view = rig.mode;
    frames++;
    acc += dt;
    if (acc >= 1) {
      game.fps = Math.round(frames / acc);
      frames = 0;
      acc = 0;
      if (DEBUG || params.has('fps'))
        hud.setStats(`${game.fps} fps · ${game.backend} · ${quality.level}\n${innerWidth * renderer.getPixelRatio()}×${innerHeight * renderer.getPixelRatio()}`);
    }
  });
}

function findNearby(list: Interactable[], pos: THREE.Vector3, forward: THREE.Vector3) {
  let best: Interactable | null = null;
  let bestScore = Infinity;
  for (const it of list) {
    if (it.enabled && !it.enabled()) continue;
    const dx = it.position.x - pos.x;
    const dz = it.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > it.radius) continue;
    // Предпочитаем то, что перед камерой
    const facing = d > 0.01 ? (dx * forward.x + dz * forward.z) / d : 1;
    if (facing < -0.2) continue;
    const score = d * (1.5 - facing);
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  return best;
}

function controlsHtml() {
  return `<div class="c-keys">
    <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>идти, мышь — осмотреться</span>
    <span><kbd>Shift</kbd></span><span>бежать</span>
    <span><kbd>E</kbd></span><span>взаимодействовать</span>
    <span><kbd>V</kbd></span><span>вид от первого / третьего лица</span>
    <span><kbd>Esc</kbd></span><span>пауза</span>
  </div>`;
}

const round = (n: number) => Math.round(n * 100) / 100;

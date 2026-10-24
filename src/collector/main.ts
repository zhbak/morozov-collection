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
import { loadAnimatedAvatar } from './engine/animatedAvatar';
import { Hud } from './ui/hud';
import { chapterScreen, francs, hangScreen, inspectScreen } from './ui/screens';
import type { Interactable, Level, LevelContext, LocationId } from './scenes/level';
import { buildTestbed } from './scenes/testbed';
import { buildStreet } from './scenes/street';
import { buildGallery } from './scenes/gallery';
import { buildMansion } from './scenes/mansion';
import { buildSplatStreet } from './scenes/splatStreet';
import { Session } from './game/session';
import { allHung } from './game/collection';
import { BARGAIN, BUDGET, CHAPTER, INTRO, PAINTINGS } from './content/paintings';
import type { Shot } from './engine/cameraRig';

const params = new URLSearchParams(location.search);
const quality = pickQuality(params.get('q'), { mobile: matchMedia('(pointer: coarse)').matches });
const DEBUG = params.has('debug');
const ASSETS = `${import.meta.env.BASE_URL}collector/`;

type Screen = 'loading' | 'title' | 'play' | 'pause' | 'inspect' | 'transition' | 'chapter' | 'error';

const LEVELS: Partial<Record<LocationId, (ctx: LevelContext) => Promise<Level>>> = {
  testbed: buildTestbed,
  street: buildStreet,
  gallery: buildGallery,
  mansion: buildMansion,
  // Спайк B, только dev: ?loc=splat&world=<id>
  ...(import.meta.env.DEV ? { splat: buildSplatStreet } : {}),
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
  goto: (_id: LocationId, _caption?: string) => Promise.resolve(),
  /** Покупки и развеска — без кликов по кнопкам */
  budget: 0,
  owned: [] as string[],
  hung: {} as Record<string, string>,
  buy: (_id: string) => false,
  bargain: (_id: string) => false,
  hang: (_slot: string, _id: string) => {},
  /** Закрыть открытый экран (справка, развеска) */
  close: () => {},
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
  // Персонаж общий для всех локаций; капсула — если модели нет
  const avatarReady = loadAnimatedAvatar(`${ASSETS}models/morozov.glb`, `${ASSETS}models/morozov-anims.glb`, 1.8).catch((e) => {
    console.warn('Модель персонажа не загрузилась, остаётся капсула:', e?.message ?? e);
    return null;
  });
  let avatar: Avatar | null = null;
  let rig = new CameraRig(camera, physics);
  let nearby: Interactable | null = null;

  // Прохождение: бюджет, покупки, торг, развеска
  const session = new Session(BUDGET);
  const bargained = new Set<string>();
  const info = (id: string) => PAINTINGS.find((p) => p.id === id)!;
  const priceOf = (id: string) => (bargained.has(id) ? BARGAIN[id] : info(id).price);
  const syncState = () => {
    game.budget = session.state.budget;
    game.owned = [...session.state.owned];
    game.hung = { ...session.state.hung };
    if (game.location === 'mansion') {
      const n = Object.keys(session.state.hung).length;
      hud.setBudget(`Развешано <b>${n} из ${session.state.owned.length}</b>`);
    } else if (game.location === 'gallery' || session.state.owned.length) {
      hud.setBudget(`Бюджет <b>${francs(session.state.budget)}</b>`);
    } else hud.setBudget(null);
  };
  session.onChange(syncState);
  let closeScreen: (() => void) | null = null;

  // ?res=2560x1440 — фиксированное разрешение рендера для замеров FPS (канвас растягивается по окну)
  const fixed = params.get('res')?.split('x').map(Number);
  const resize = () => {
    if (fixed?.length === 2) {
      renderer.setPixelRatio(1);
      renderer.setSize(fixed[0], fixed[1], false);
      camera.aspect = fixed[0] / fixed[1];
    } else {
      renderer.setSize(innerWidth, innerHeight, false);
      camera.aspect = innerWidth / innerHeight;
    }
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  // Пока локация пересобирается, цикл не трогает физику и сцену: старые объекты уже освобождены
  let loading = false;
  async function load(id: LocationId) {
    const build = LEVELS[id];
    if (!build) throw new Error(`Локация «${id}» ещё не собрана`);
    loading = true;
    post?.dispose();
    if (avatar) level?.scene.remove(avatar.object);
    level?.dispose();
    body?.dispose();
    physics.dispose();

    physics = new Physics();
    const view = rig.mode;
    rig = new CameraRig(camera, physics);
    rig.mode = view;
    level = await build({
      renderer,
      physics,
      quality,
      assets: ASSETS,
      actions: {
        goto: (to) => void game.goto(to),
        toast: (text) => hud.toast(text),
        inspect: (id, shot) => openInspect(id, shot),
        travel: () => void game.goto('mansion', INTRO.travel),
        chooseHanging: (slot, shot) => openHanging(slot, shot),
      },
      session,
    });
    body = new CharacterBody(physics, level.spawn.position);
    body.teleport(level.spawn.position, level.spawn.facing);
    // Коллайдеры попадают в запросы Rapier только после шага — иначе первый кадр проваливается
    physics.step(1 / 60);
    rig.snapBehind(level.spawn.facing);
    avatar = (await avatarReady) ?? avatar ?? capsuleAvatar(body);
    level.scene.add(avatar.object);
    renderer.toneMapping = level.toneMapping ?? THREE.AgXToneMapping;
    renderer.toneMappingExposure = level.exposure ?? 1;
    post = new PostFX(renderer, level.scene, camera, quality, level.post);
    // Компиляция шейдеров до первого кадра — без рывка после затемнения
    await renderer.compileAsync(level.scene, camera);
    game.location = id;
    loading = false;
    syncState();
  }

  /** Экран поверх замершей сцены: камера на крупном плане, курсор свободен */
  function openPanel(shot: Shot, render: () => void, onClose?: () => void) {
    game.screen = 'inspect';
    kbm.enabled = false;
    kbm.reset();
    kbm.releaseLock();
    hud.setPrompt(null);
    rig.setShot(shot);
    render();
    closeScreen = () => {
      closeScreen = null;
      rig.setShot(null);
      play();
      onClose?.();
    };
  }

  function openInspect(id: string, shot: Shot) {
    const p = info(id);
    const render = () => {
      const el = inspectScreen(hud, { ...p, price: priceOf(id) }, session.state, {
        buy: () => game.buy(id),
        close: () => closeScreen?.(),
      });
      // Торг — только там, где он задокументирован
      if (BARGAIN[id] && !bargained.has(id) && !session.state.owned.includes(id)) {
        const b = document.createElement('button');
        b.className = 'c-btn c-btn--ghost';
        b.textContent = 'Торговаться';
        b.addEventListener('click', () => game.bargain(id));
        el.querySelector('.c-row')!.append(b);
      }
      if (bargained.has(id) && !session.state.owned.includes(id)) {
        const n = document.createElement('p');
        n.className = 'c-note';
        n.textContent = `Дрюэ уступил: ${francs(priceOf(id))} вместо ${francs(p.price)} Морозов действительно сбавил цену «Виноградников» примерно на треть.`;
        el.querySelector('.c-row')!.after(n);
      }
    };
    openPanel(shot, render);
    game.buy = (pid) => {
      const r = session.buy({ id: pid, price: priceOf(pid) });
      if (r.ok) hud.toast(`Куплено: «${info(pid).title}». Остаток — ${francs(session.state.budget)}.`);
      if (game.screen === 'inspect') render();
      return r.ok;
    };
    game.bargain = (pid) => {
      if (!BARGAIN[pid] || bargained.has(pid) || session.state.owned.includes(pid)) return false;
      bargained.add(pid);
      if (game.screen === 'inspect') render();
      return true;
    };
  }

  function openHanging(slot: string, shot: Shot) {
    const render = () =>
      hangScreen(hud, PAINTINGS, session.state, slot, ASSETS, {
        pick: (id) => {
          game.hang(slot, id);
          closeScreen?.();
        },
        close: () => closeScreen?.(),
      });
    openPanel(shot, render, () => {
      if (allHung(session.state)) setTimeout(showChapter, 900);
    });
  }

  function showChapter() {
    if (game.screen !== 'play') return;
    game.screen = 'chapter';
    kbm.enabled = false;
    kbm.reset();
    kbm.releaseLock();
    hud.setPrompt(null);
    chapterScreen(
      hud,
      CHAPTER,
      session.state.owned.map(info),
      {
        restart: () => {
          session.reset();
          bargained.clear();
          hud.clearScreen();
          void game.goto('street', INTRO.street).then(play);
        },
        free: play,
      },
    );
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
  game.buy = (id) => session.buy({ id, price: priceOf(id) }).ok;
  game.bargain = (id) => (BARGAIN[id] && !bargained.has(id) ? (bargained.add(id), true) : false);
  game.hang = (slot, id) => {
    session.hang(slot, id);
    if (allHung(session.state) && game.screen === 'play') setTimeout(showChapter, 900);
  };
  game.close = () => closeScreen?.();
  game.goto = async (id, caption = '') => {
    const prev = game.screen;
    game.screen = 'transition';
    kbm.reset();
    await hud.fade(true, caption, caption ? 1400 : 700);
    if (caption) await new Promise((r) => setTimeout(r, 1300));
    try {
      await load(id);
    } catch (e) {
      console.error(e);
      game.screen = 'error';
      game.error = String((e as Error)?.message ?? e);
      hud.showScreen(`<h2>Не удалось открыть локацию</h2><p class="c-lead">${game.error}</p>`, 'c-error');
      return;
    }
    await hud.fade(false, '', 900);
    game.screen = prev === 'transition' || prev === 'inspect' || prev === 'chapter' ? 'play' : prev;
    if (id === 'gallery') {
      hud.toast(INTRO.gallery, 5000);
      setTimeout(() => game.location === 'gallery' && hud.toast(INTRO.serov, 6500), 5600);
    }
    if (id === 'mansion') hud.toast(INTRO.mansion, 5000);
  };

  const startId = (params.get('loc') as LocationId) || 'street';
  await load(startId);
  if (DEBUG)
    Object.assign(window, {
      __dbg: { THREE, renderer, camera, get level() { return level; }, get post() { return post; }, get rig() { return rig; } },
    });

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

  game.start = () => {
    started = true;
    play();
  };
  const title = hud.showScreen(
    `<p class="c-eyebrow">Собрание Ивана Морозова</p>
     <h1>Коллекционер</h1>
     <p class="c-lead">Париж, начало XX века. Пройдите по улице торговцев картинами, выберите покупки в галерее и развесьте их в особняке на Пречистенке.</p>
     ${controlsHtml()}
     <button class="c-btn" data-a="start">Начать</button>`,
    'c-title',
  );
  // Первый старт: затемнение с подписью места, потом — в кадр
  let started = false;
  const begin = async () => {
    if (started) return play();
    started = true;
    hud.clearScreen();
    kbm.requestLock();
    game.screen = 'transition';
    await hud.fade(true, game.location === 'street' ? INTRO.street : '', 600);
    await new Promise((r) => setTimeout(r, 1600));
    await hud.fade(false, '', 1100);
    play();
  };
  title.querySelector('[data-a="start"]')!.addEventListener('click', () => void begin());
  kbm.enabled = false;
  game.screen = 'title';
  await hud.fade(false, '', 700);
  game.ready = true;

  renderer.setAnimationLoop(() => {
    timer.update();
    const dt = Math.min(timer.getDelta(), 0.1);
    if (loading || !level || !body || !post || !avatar) return;

    if (input.pressed.has('pause')) {
      if (game.screen === 'play') pause();
      else if (game.screen === 'pause') play();
      else if (game.screen === 'inspect') closeScreen?.();
    } else if (game.screen === 'inspect' && input.pressed.has('interact')) closeScreen?.();
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
        hud.setStats(`${game.fps} fps · ${game.backend} · ${quality.level}\n${renderer.domElement.width}×${renderer.domElement.height}`);
    }
  });
}

function findNearby(list: Interactable[], pos: THREE.Vector3, forward: THREE.Vector3) {
  let best: Interactable | null = null;
  let bestScore = Infinity;
  for (const it of list) {
    if (it.enabled && !it.enabled()) continue;
    const d = Math.hypot(it.position.x - pos.x, it.position.z - pos.z);
    if (d > it.radius) continue;
    // Предпочитаем то, на что смотрит камера
    const t = it.target ?? it.position;
    const tx = t.x - pos.x;
    const tz = t.z - pos.z;
    const td = Math.hypot(tx, tz);
    const facing = td > 0.01 ? (tx * forward.x + tz * forward.z) / td : 1;
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

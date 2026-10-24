import * as THREE from 'three';
import './style.css';
import { episodes, findEpisode, type Episode } from './content/episodes';
import { createSearch, tap } from './game/hotspots';
import { buildRoom, type Room } from './scene/room';
import { CameraRig } from './scene/camera';
import { loadCollected, saveCollected } from './game/progress';

const BASE = import.meta.env.BASE_URL;
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const ui = document.getElementById('ui')!;

// Отладочные «ручки» для Playwright и агента: состояние и действия без кликов по пикселям
const game = {
  ready: false,
  screen: 'home' as 'home' | 'loading' | 'intro' | 'room' | 'focus' | 'chapter',
  episode: null as string | null,
  found: [] as string[],
  fps: 0,
  tapUV: (_u: number, _v: number) => {},
  focus: () => {},
  unfocus: () => {},
  start: () => {},
};
(window as unknown as { __game: typeof game }).__game = game;

const ep = findEpisode(params.get('ep'));
if (ep) runEpisode(ep);
else showHome();

function showHome() {
  game.screen = 'home';
  const collected = loadCollected();
  ui.innerHTML = `
    <main class="panel home">
      <p class="eyebrow">Собрание Ивана Морозова</p>
      <h1>Коллекция Морозова</h1>
      <p class="lead">Отсканируйте QR-код у картины в зале или выберите эпизод.</p>
      <ul class="episodes">
        ${episodes
          .map(
            (e, i) => `
          <li>
            ${
              e.available
                ? `<a href="?ep=${e.id}" class="ep">`
                : `<div class="ep ep--locked" aria-disabled="true">`
            }
              <span class="ep__num">${i + 1}</span>
              <span class="ep__text"><b>${e.title}</b><small>${e.artist}, ${e.year}</small></span>
              <span class="ep__status">${
                collected.has(e.id) ? '✓ глава получена' : e.available ? 'играть' : 'скоро'
              }</span>
            ${e.available ? '</a>' : '</div>'}
          </li>`,
          )
          .join('')}
      </ul>
    </main>`;
  game.ready = true;
}

async function runEpisode(ep: Episode) {
  game.screen = 'loading';
  game.episode = ep.id;
  ui.innerHTML = `<div class="loading">Загружаем зал…</div>`;

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral сохраняет цвета картины; ACES заметно их выбеливал
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const small = Math.min(innerWidth, innerHeight) * devicePixelRatio < 1100;
  const paintingUrl = `${BASE}paintings/${ep.painting!.file}-${small ? 800 : 1600}.webp`;
  const room = await buildRoom(renderer, ep, paintingUrl, `${BASE}models/`);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 30);
  const rig = new CameraRig(camera, room);
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    rig.resize();
  };
  addEventListener('resize', resize);
  resize();

  if (DEBUG) {
    for (const h of ep.hotspots) room.addMarker(h.u, h.v, h.r * ep.painting!.height, 0xff3344);
  }

  const search = createSearch();
  const hud = renderEpisodeUi(ep, {
    onStart: () => {
      game.screen = 'room';
      hud.setHint('Проведите пальцем, чтобы осмотреться. Нажмите на картину, чтобы подойти.');
    },
    onBack: () => game.unfocus(),
  });

  game.focus = () => {
    rig.focus();
    game.screen = 'focus';
    hud.setFocus(true);
    hud.setHint('Найдите на картине детали из списка.');
  };
  game.unfocus = () => {
    rig.unfocus();
    game.screen = 'room';
    hud.setFocus(false);
    hud.setHint('Нажмите на картину, чтобы подойти.');
  };
  game.start = () => hud.start();
  game.tapUV = (u, v) => {
    const res = tap(ep, search, u, v);
    game.found = [...search.found];
    if (!res.hit) return hud.toast('Здесь нет детали из списка — попробуйте ещё.', 'miss');
    if (!res.isNew) return hud.toast(`«${res.hit.label}» уже найдено.`);
    const marker = room.addMarker(res.hit.u, res.hit.v, res.hit.r * ep.painting!.height * 0.8);
    popIn(marker);
    hud.markFound(res.hit.id);
    hud.toast(res.hit.caption, 'hit');
    if (res.complete) {
      const collected = loadCollected();
      collected.add(ep.id);
      saveCollected(collected);
      setTimeout(() => {
        game.screen = 'chapter';
        hud.showChapter();
      }, 2200);
    }
  };

  bindPointer(canvas, camera, room, rig);

  const clock = new THREE.Clock();
  let frames = 0;
  let acc = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    rig.update(dt);
    tickAnimations(dt);
    renderer.render(room.scene, camera);
    frames++;
    acc += dt;
    if (acc >= 1) {
      game.fps = Math.round(frames / acc);
      frames = 0;
      acc = 0;
    }
  });

  game.screen = 'intro';
  game.ready = true;
}

function bindPointer(canvas: HTMLCanvasElement, camera: THREE.Camera, room: Room, rig: CameraRig) {
  const raycaster = new THREE.Raycaster();
  let down: { x: number; y: number; t: number } | null = null;
  let last = { x: 0, y: 0 };

  canvas.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!down || game.screen === 'intro' || game.screen === 'chapter') return;
    rig.drag(e.clientX - last.x, e.clientY - last.y);
    last = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 500;
    down = null;
    if (moved > 10 || !quick) return;
    if (game.screen !== 'room' && game.screen !== 'focus') return;

    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const [hit] = raycaster.intersectObjects([room.painting, ...room.placeholders], false);
    if (!hit) return;
    if (hit.object.name === 'placeholder') {
      document.dispatchEvent(new CustomEvent('toast', { detail: 'Эта картина появится в следующих эпизодах.' }));
      return;
    }
    if (game.screen === 'room') return game.focus();
    if (hit.uv) game.tapUV(hit.uv.x, 1 - hit.uv.y);
  });
}

// Простые анимации появления маркеров без библиотек твинов
const anims: { obj: THREE.Object3D; t: number }[] = [];
function popIn(obj: THREE.Object3D) {
  obj.scale.setScalar(0.01);
  anims.push({ obj, t: 0 });
}
function tickAnimations(dt: number) {
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    a.t = Math.min(a.t + dt / 0.45, 1);
    const s = 1 + 0.25 * Math.sin(a.t * Math.PI);
    a.obj.scale.setScalar(a.t * s);
    if (a.t >= 1) anims.splice(i, 1);
  }
}

interface EpisodeUi {
  start(): void;
  setHint(text: string): void;
  setFocus(on: boolean): void;
  markFound(id: string): void;
  toast(text: string, kind?: 'hit' | 'miss'): void;
  showChapter(): void;
}

function renderEpisodeUi(ep: Episode, cb: { onStart: () => void; onBack: () => void }): EpisodeUi {
  ui.innerHTML = `
    <a class="home-link" href="./" aria-label="К списку эпизодов">←&nbsp;Эпизоды</a>
    <section class="panel intro" id="intro">
      <p class="eyebrow">Эпизод ${episodes.indexOf(ep) + 1}</p>
      <h1>${ep.title}</h1>
      <p class="meta">${ep.artist}, ${ep.year}</p>
      <p class="lead">${ep.intro}</p>
      <button class="btn" id="start">Начать</button>
    </section>
    <ul class="chips" id="chips" hidden>
      ${ep.hotspots.map((h) => `<li data-id="${h.id}">${h.label}</li>`).join('')}
    </ul>
    <div class="bottom" id="bottom" hidden>
      <p class="hint" id="hint"></p>
      <button class="btn btn--ghost" id="back" hidden>Отойти от картины</button>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <section class="panel chapter" id="chapter" hidden>
      <p class="eyebrow">Глава из истории коллекции</p>
      <h2>${ep.title}</h2>
      ${ep.story.map((p) => `<p>${p}</p>`).join('')}
      <details>
        <summary>Источники</summary>
        <ul>${ep.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`).join('')}</ul>
      </details>
      <a class="btn" href="./">К списку эпизодов</a>
    </section>`;

  const $ = (id: string) => document.getElementById(id)!;
  let toastTimer = 0;
  const api: EpisodeUi = {
    start() {
      $('intro').hidden = true;
      $('chips').hidden = false;
      $('bottom').hidden = false;
      cb.onStart();
    },
    setHint(text) {
      $('hint').textContent = text;
    },
    setFocus(on) {
      $('back').hidden = !on;
    },
    markFound(id) {
      $('chips').querySelector(`[data-id="${id}"]`)?.classList.add('found');
    },
    toast(text, kind) {
      const t = $('toast');
      t.textContent = text;
      t.className = `toast toast--show ${kind ? `toast--${kind}` : ''}`;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => (t.className = 'toast'), kind === 'hit' ? 5000 : 2200);
    },
    showChapter() {
      $('chips').hidden = true;
      $('bottom').hidden = true;
      $('toast').className = 'toast';
      $('chapter').hidden = false;
    },
  };
  $('start').addEventListener('click', () => api.start());
  $('back').addEventListener('click', cb.onBack);
  document.addEventListener('toast', (e) => api.toast((e as CustomEvent<string>).detail));
  return api;
}

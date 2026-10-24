// Слой ввода: логика игры читает только InputState. Клавиатура с мышью — один из источников;
// сенсорный джойстик и скриптовый ввод (window.__game) пишут в то же состояние.

export type Action = 'interact' | 'toggleView' | 'pause';

export interface InputState {
  /** x — вправо, y — вперёд; длина не больше 1 */
  move: { x: number; y: number };
  /** Поворот взгляда за кадр в пикселях мыши */
  look: { x: number; y: number };
  run: boolean;
  /** Нажатия за текущий кадр; очищаются в endFrame */
  pressed: Set<Action>;
}

export function createInputState(): InputState {
  return { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, run: false, pressed: new Set() };
}

export function endFrame(s: InputState) {
  s.look.x = 0;
  s.look.y = 0;
  s.pressed.clear();
}

const KEY_ACTIONS: Record<string, Action> = { KeyE: 'interact', KeyV: 'toggleView', Escape: 'pause' };

/** WASD + мышь через Pointer Lock. Без захвата курсора обзор работает перетаскиванием. */
export class KeyboardMouseInput {
  /** Включён ли ввод с клавиатуры — выключается на паузе и в меню */
  enabled = true;
  private keys = new Set<string>();
  private dragging = false;
  private off: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private state: InputState,
  ) {
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const action = KEY_ACTIONS[e.code];
      // На экранах (пауза, справка) работают только Esc и E — закрыть
      if (action && (this.enabled || action !== 'toggleView')) state.pressed.add(action);
      this.sync();
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      this.sync();
    });
    this.on(window, 'blur', () => {
      this.keys.clear();
      this.sync();
    });
    this.on(document, 'mousemove', (e: MouseEvent) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        state.look.x += e.movementX;
        state.look.y += e.movementY;
      }
    });
    this.on(canvas, 'mousedown', () => {
      if (this.enabled && !this.locked) this.dragging = true;
    });
    this.on(window, 'mouseup', () => (this.dragging = false));
  }

  get locked() {
    return document.pointerLockElement === this.canvas;
  }

  requestLock() {
    // В headless и во фреймах захват может быть запрещён — тогда остаётся перетаскивание
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* без захвата курсора */
    }
  }

  releaseLock() {
    if (this.locked) document.exitPointerLock();
  }

  private sync() {
    const k = (c: string) => (this.enabled && this.keys.has(c) ? 1 : 0);
    let x = k('KeyD') - k('KeyA') + k('ArrowRight') - k('ArrowLeft');
    let y = k('KeyW') - k('KeyS') + k('ArrowUp') - k('ArrowDown');
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.state.move.x = x;
    this.state.move.y = y;
    this.state.run = this.enabled && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'));
  }

  /** Сбросить зажатые клавиши, например при открытии меню */
  reset() {
    this.keys.clear();
    this.sync();
  }

  private on<K extends string>(target: EventTarget, type: K, fn: (e: never) => void) {
    target.addEventListener(type, fn as EventListener);
    this.off.push(() => target.removeEventListener(type, fn as EventListener));
  }

  dispose() {
    for (const f of this.off) f();
  }
}

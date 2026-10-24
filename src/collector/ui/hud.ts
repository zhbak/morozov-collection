// HTML-слой поверх канваса: титул, подсказки, тосты, пауза, затемнения с подписью.

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private toastTimer = 0;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="c-fade" data-k="fade"><p class="c-fade__caption" data-k="caption"></p></div>
      <div class="c-prompt" data-k="prompt" hidden></div>
      <div class="c-toast" data-k="toast" role="status" aria-live="polite"></div>
      <div class="c-stats" data-k="stats" hidden></div>
      <div class="c-crosshair" data-k="crosshair" hidden></div>
      <div class="c-layer" data-k="layer"></div>`;
    for (const n of root.querySelectorAll<HTMLElement>('[data-k]')) this.el[n.dataset.k!] = n;
  }

  /** Слой для экранов (титул, пауза, справка о картине, глава) */
  get layer() {
    return this.el.layer;
  }

  showScreen(html: string, cls: string) {
    this.layer.innerHTML = `<section class="c-panel ${cls}">${html}</section>`;
    return this.layer.firstElementChild as HTMLElement;
  }

  clearScreen() {
    this.layer.innerHTML = '';
  }

  setPrompt(text: string | null) {
    const p = this.el.prompt;
    p.hidden = !text;
    if (text && p.textContent !== text) p.innerHTML = text.replace(/^E\b/, '<kbd>E</kbd>');
  }

  setCrosshair(on: boolean) {
    this.el.crosshair.hidden = !on;
  }

  toast(text: string, ms = 3200) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.add('c-toast--show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('c-toast--show'), ms);
  }

  setStats(text: string | null) {
    this.el.stats.hidden = text === null;
    if (text !== null) this.el.stats.textContent = text;
  }

  /** Затемнение: on — в чёрное (с подписью), off — обратно в кадр */
  fade(on: boolean, caption = '', ms = 900) {
    const f = this.el.fade;
    this.el.caption.textContent = caption;
    f.style.transitionDuration = `${ms}ms`;
    f.classList.toggle('c-fade--on', on);
    f.classList.toggle('c-fade--caption', on && !!caption);
    return new Promise<void>((r) => setTimeout(r, ms));
  }
}

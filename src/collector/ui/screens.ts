import type { Hud } from './hud';
import type { ChapterInfo, PaintingInfo } from '../content/types';
import type { CollectionState } from '../game/collection';

// Экраны поверх сцены. Тексты картин и главы — из content/, факты сверены по content/facts.md.

export const francs = (n: number) => `${n.toLocaleString('ru-RU')} фр.`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function inspectScreen(
  hud: Hud,
  p: PaintingInfo,
  state: CollectionState,
  cb: { buy(): void; close(): void },
) {
  const owned = state.owned.includes(p.id);
  const can = !owned && p.price <= state.budget;
  const why = owned ? 'Уже ваша' : can ? '' : `Не хватает ${francs(p.price - state.budget)}`;
  const el = hud.showScreen(
    `<p class="c-eyebrow">${esc(p.artist)}</p>
     <h2>${esc(p.title)}</h2>
     <p class="c-meta">${esc(p.year)} · холст, масло · ${p.size[1]} × ${p.size[0]} см</p>
     <div class="c-price"><span>Цена в игре</span><b>${francs(p.price)}</b></div>
     <div class="c-row">
       <button class="c-btn" data-a="buy" ${can ? '' : 'disabled'}>${owned ? 'Куплено' : 'Купить'}</button>
       <button class="c-btn c-btn--ghost" data-a="close">Отойти <kbd>Esc</kbd></button>
     </div>
     ${why && !owned ? `<p class="c-note">${why}</p>` : ''}
     <p class="c-text">${esc(p.about)}</p>
     <p class="c-prov"><b>Как попала к Морозову.</b> ${esc(p.provenance)}</p>
     <p class="c-now">${esc(p.now)}</p>
     <p class="c-note">Изображение: <a href="${p.source.url}" target="_blank" rel="noopener">${esc(p.source.title)}</a> (public domain)</p>`,
    'c-side',
  );
  el.querySelector('[data-a="buy"]')!.addEventListener('click', cb.buy);
  el.querySelector('[data-a="close"]')!.addEventListener('click', cb.close);
  return el;
}

export function hangScreen(
  hud: Hud,
  paintings: PaintingInfo[],
  state: CollectionState,
  slot: string,
  base: string,
  cb: { pick(id: string): void; close(): void },
) {
  const current = state.hung[slot];
  const where = new Map(Object.entries(state.hung).map(([s, id]) => [id, s]));
  const list = state.owned
    .map((id) => paintings.find((p) => p.id === id)!)
    .map(
      (p) => `<button class="c-pick ${p.id === current ? 'c-pick--on' : ''}" data-id="${p.id}">
        <img src="${base}paintings/${p.file}-512.webp" alt="" />
        <span><b>${esc(p.title)}</b><small>${esc(p.artist)}, ${esc(p.year)}${where.has(p.id) && p.id !== current ? ' · уже висит' : ''}</small></span>
      </button>`,
    )
    .join('');
  const el = hud.showScreen(
    `<p class="c-eyebrow">Развеска</p>
     <h2>Что повесить здесь?</h2>
     <div class="c-picks">${list}</div>
     <div class="c-row"><button class="c-btn c-btn--ghost" data-a="close">Отойти <kbd>Esc</kbd></button></div>`,
    'c-side',
  );
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-id]')) b.addEventListener('click', () => cb.pick(b.dataset.id!));
  el.querySelector('[data-a="close"]')!.addEventListener('click', cb.close);
  return el;
}

export function chapterScreen(hud: Hud, ch: ChapterInfo, owned: PaintingInfo[], cb: { restart(): void; free(): void }) {
  const el = hud.showScreen(
    `<p class="c-eyebrow">Глава из истории собрания</p>
     <h2>${esc(ch.title)}</h2>
     <p class="c-meta">Ваша коллекция: ${owned.map((p) => `«${esc(p.title)}»`).join(', ')}</p>
     ${ch.paragraphs.map((t) => `<p>${esc(t)}</p>`).join('')}
     <details><summary>Источники</summary><ul>${ch.sources
       .map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`)
       .join('')}</ul></details>
     <p class="c-note">Улица, галерея и зал — стилизация, а не реконструкция.</p>
     <div class="c-row">
       <button class="c-btn" data-a="restart">Пройти заново</button>
       <button class="c-btn c-btn--ghost" data-a="free">Остаться в зале</button>
     </div>`,
    'c-chapter',
  );
  el.querySelector('[data-a="restart"]')!.addEventListener('click', cb.restart);
  el.querySelector('[data-a="free"]')!.addEventListener('click', cb.free);
  return el;
}

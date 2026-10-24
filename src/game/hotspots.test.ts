import { describe, expect, it } from 'vitest';
import { episodes } from '../content/episodes';
import { createSearch, hitTest, tap } from './hotspots';

const ep = episodes[0];

describe('hitTest', () => {
  it('находит каждую деталь по её центру', () => {
    for (const h of ep.hotspots) expect(hitTest(ep, h.u, h.v)?.id).toBe(h.id);
  });

  it('промах в пустом месте', () => {
    expect(hitTest(ep, 0.1, 0.9)).toBeNull();
  });

  it('радиусы деталей не пересекаются', () => {
    const aspect = ep.painting!.width / ep.painting!.height;
    for (const a of ep.hotspots)
      for (const b of ep.hotspots)
        if (a !== b) expect(Math.hypot((a.u - b.u) * aspect, a.v - b.v)).toBeGreaterThan(a.r + b.r);
  });
});

describe('tap', () => {
  it('повторное нажатие не считается новой находкой, эпизод завершается после всех деталей', () => {
    const s = createSearch();
    const [first, ...rest] = ep.hotspots;
    expect(tap(ep, s, first.u, first.v)).toMatchObject({ isNew: true, complete: false });
    expect(tap(ep, s, first.u, first.v)).toMatchObject({ isNew: false, complete: false });
    let last = tap(ep, s, 0.1, 0.9);
    expect(last.hit).toBeNull();
    for (const h of rest) last = tap(ep, s, h.u, h.v);
    expect(last.complete).toBe(true);
  });
});

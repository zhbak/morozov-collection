import type { Episode, Hotspot } from '../content/episodes';

export interface SearchState {
  found: Set<string>;
}

export interface TapResult {
  hit: Hotspot | null;
  isNew: boolean;
  complete: boolean;
}

export function createSearch(): SearchState {
  return { found: new Set() };
}

/** Ближайшая деталь в радиусе попадания. u, v — доли от левого верхнего угла. */
export function hitTest(ep: Episode, u: number, v: number): Hotspot | null {
  if (!ep.painting) return null;
  const aspect = ep.painting.width / ep.painting.height;
  let best: Hotspot | null = null;
  let bestDist = Infinity;
  for (const h of ep.hotspots) {
    // Расстояние в долях высоты, чтобы радиус был круглым на неквадратной картине
    const d = Math.hypot((u - h.u) * aspect, v - h.v);
    if (d <= h.r && d < bestDist) {
      best = h;
      bestDist = d;
    }
  }
  return best;
}

export function tap(ep: Episode, state: SearchState, u: number, v: number): TapResult {
  const hit = hitTest(ep, u, v);
  const isNew = !!hit && !state.found.has(hit.id);
  if (hit) state.found.add(hit.id);
  return { hit, isNew, complete: state.found.size === ep.hotspots.length };
}

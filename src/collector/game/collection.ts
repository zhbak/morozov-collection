// Чистая логика среза: бюджет, покупка картин, развеска в особняке. Без three.js — покрыта vitest.

export interface Offer {
  id: string;
  price: number;
}

export interface CollectionState {
  budget: number;
  /** Купленные, в порядке покупки */
  owned: string[];
  /** Место на стене → картина */
  hung: Record<string, string>;
}

export function createCollection(budget: number): CollectionState {
  return { budget, owned: [], hung: {} };
}

export type BuyResult = { ok: true; state: CollectionState } | { ok: false; reason: 'owned' | 'budget' };

export function canAfford(s: CollectionState, offer: Offer) {
  return offer.price <= s.budget;
}

export function buy(s: CollectionState, offer: Offer): BuyResult {
  if (s.owned.includes(offer.id)) return { ok: false, reason: 'owned' };
  if (!canAfford(s, offer)) return { ok: false, reason: 'budget' };
  return { ok: true, state: { ...s, budget: s.budget - offer.price, owned: [...s.owned, offer.id] } };
}

/** Что ещё можно купить на остаток */
export function affordable(s: CollectionState, offers: Offer[]) {
  return offers.filter((o) => !s.owned.includes(o.id) && canAfford(s, o));
}

/** Повесить картину на место. Если картина уже висит в другом месте — переезжает; место освобождается от прежней */
export function hang(s: CollectionState, slot: string, painting: string): CollectionState {
  if (!s.owned.includes(painting)) return s;
  const hung: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.hung)) if (v !== painting && k !== slot) hung[k] = v;
  hung[slot] = painting;
  return { ...s, hung };
}

export function unhung(s: CollectionState) {
  const placed = new Set(Object.values(s.hung));
  return s.owned.filter((id) => !placed.has(id));
}

/** Все купленные развешаны — можно открывать главу */
export function allHung(s: CollectionState) {
  return s.owned.length > 0 && unhung(s).length === 0;
}

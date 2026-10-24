import { buy, createCollection, hang, type CollectionState, type Offer } from './collection';

// Состояние прохождения, общее для локаций. Изменения — только через методы, подписчики обновляют сцену и HUD.

export class Session {
  state: CollectionState;
  private listeners = new Set<(s: CollectionState) => void>();

  constructor(readonly startBudget: number) {
    this.state = createCollection(startBudget);
  }

  onChange(fn: (s: CollectionState) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  buy(offer: Offer) {
    const r = buy(this.state, offer);
    if (r.ok) this.set(r.state);
    return r;
  }

  hang(slot: string, painting: string) {
    this.set(hang(this.state, slot, painting));
  }

  reset() {
    this.set(createCollection(this.startBudget));
  }

  private set(s: CollectionState) {
    this.state = s;
    for (const fn of this.listeners) fn(s);
  }
}

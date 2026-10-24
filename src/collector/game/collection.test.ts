import { describe, expect, it } from 'vitest';
import { affordable, allHung, buy, createCollection, hang, unhung } from './collection';

const offers = [
  { id: 'a', price: 300 },
  { id: 'b', price: 500 },
  { id: 'c', price: 250 },
];

describe('покупка', () => {
  it('списывает цену и запоминает порядок', () => {
    const r1 = buy(createCollection(1000), offers[0]);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const r2 = buy(r1.state, offers[1]);
    expect(r2.ok && r2.state).toEqual({ budget: 200, owned: ['a', 'b'], hung: {} });
  });

  it('не даёт купить дважды и сверх бюджета', () => {
    const r = buy(createCollection(1000), offers[0]);
    if (!r.ok) throw new Error();
    expect(buy(r.state, offers[0])).toEqual({ ok: false, reason: 'owned' });
    expect(buy(createCollection(100), offers[1])).toEqual({ ok: false, reason: 'budget' });
  });

  it('affordable учитывает остаток и купленное', () => {
    const r = buy(createCollection(750), offers[1]);
    if (!r.ok) throw new Error();
    expect(affordable(r.state, offers).map((o) => o.id)).toEqual(['c']);
  });
});

describe('развеска', () => {
  const owned = { budget: 0, owned: ['a', 'b'], hung: {} };

  it('вешает только купленное', () => {
    expect(hang(owned, 's1', 'z').hung).toEqual({});
    expect(hang(owned, 's1', 'a').hung).toEqual({ s1: 'a' });
  });

  it('картина переезжает, место занимается заново', () => {
    let s = hang(owned, 's1', 'a');
    s = hang(s, 's2', 'a');
    expect(s.hung).toEqual({ s2: 'a' });
    s = hang(s, 's2', 'b');
    expect(s.hung).toEqual({ s2: 'b' });
    expect(unhung(s)).toEqual(['a']);
  });

  it('глава открывается, когда всё развешано', () => {
    expect(allHung(owned)).toBe(false);
    expect(allHung(hang(hang(owned, 's1', 'a'), 's2', 'b'))).toBe(true);
    expect(allHung({ budget: 0, owned: [], hung: {} })).toBe(false);
  });
});

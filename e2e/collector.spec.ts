import { expect, test } from '@playwright/test';

// Смоук v2 «Коллекционер». В headless WebGPU обычно нет — WebGPURenderer уходит в WebGL 2.

interface CollectorGame {
  ready: boolean;
  screen: string;
  location: string | null;
  backend: string;
  player: { x: number; y: number; z: number };
  start(): void;
  walk(x: number, y: number, seconds: number, run?: boolean): Promise<void>;
}
type W = { __game: CollectorGame };

test.skip(({ isMobile }) => isMobile, 'v2 — десктопная версия');

test('коллекционер: загрузка и движение без ошибок консоли', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./collector.html?loc=testbed');
  await page.waitForFunction(() => (window as unknown as Partial<W>).__game?.ready, null, { timeout: 45_000 });
  await page.getByRole('button', { name: 'Начать' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__game.screen)).toBe('play');

  const before = await page.evaluate(() => (window as unknown as W).__game.player);
  await page.evaluate(() => (window as unknown as W).__game.walk(0, 1, 1.5));
  const after = await page.evaluate(() => (window as unknown as W).__game.player);
  // Вперёд — это −Z; персонаж стоит на земле, а не провалился
  expect(before.z - after.z).toBeGreaterThan(1);
  expect(after.y).toBeGreaterThan(-0.02);
  expect(errors).toEqual([]);
});

interface FlowGame extends CollectorGame {
  budget: number;
  owned: string[];
  hung: Record<string, string>;
  goto(id: string, caption?: string): Promise<void>;
  bargain(id: string): boolean;
  buy(id: string): boolean;
  hang(slot: string, id: string): void;
}
type F = { __game: FlowGame };

test('коллекционер: улица → галерея → покупка → особняк → глава', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./collector.html');
  await page.waitForFunction(() => (window as unknown as Partial<F>).__game?.ready, null, { timeout: 90_000 });
  expect(await page.evaluate(() => (window as unknown as F).__game.location)).toBe('street');
  await page.evaluate(() => (window as unknown as F).__game.start());
  const z0 = await page.evaluate(() => (window as unknown as F).__game.player.z);
  await page.evaluate(() => (window as unknown as F).__game.walk(0, 1, 1.2));
  expect(z0 - (await page.evaluate(() => (window as unknown as F).__game.player.z))).toBeGreaterThan(0.8);

  // Галерея: торг за «Виноградники» и три ван Гога — как в 1909 году; на четвёртую не хватает
  await page.evaluate(() => (window as unknown as F).__game.goto('gallery'));
  const bought = await page.evaluate(() => {
    const g = (window as unknown as F).__game;
    return [g.bargain('red-vineyard'), g.buy('red-vineyard'), g.buy('prisoners-round'), g.buy('auvers-after-rain'), g.buy('sainte-victoire')];
  });
  expect(bought).toEqual([true, true, true, true, false]);
  expect(await page.evaluate(() => (window as unknown as F).__game.budget)).toBe(5000);

  await page.evaluate(() => (window as unknown as F).__game.goto('mansion', 'Москва. Пречистенка, 21'));
  expect(await page.evaluate(() => (window as unknown as F).__game.location)).toBe('mansion');
  await page.evaluate(() => {
    const g = (window as unknown as F).__game;
    g.hang('back-left', 'red-vineyard');
    g.hang('back-center', 'auvers-after-rain');
    g.hang('right', 'prisoners-round');
  });
  await expect(page.locator('.c-chapter')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.c-chapter')).toContainText('Дрюэ');
  expect(errors).toEqual([]);
});

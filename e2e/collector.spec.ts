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

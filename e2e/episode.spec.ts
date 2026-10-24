import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __game: {
      ready: boolean;
      screen: string;
      found: string[];
      fps: number;
      start(): void;
      focus(): void;
      tapUV(u: number, v: number): void;
    };
  }
}

test('главная: эпизод 1 доступен, остальные скоро', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('a.ep')).toHaveCount(1);
  await expect(page.locator('.ep--locked')).toHaveCount(2);
});

test('эпизод проходится целиком без ошибок консоли', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?ep=red-vineyards');
  await page.waitForFunction(() => window.__game?.ready);
  await page.getByRole('button', { name: 'Начать' }).click();

  // Нажатие на картину в зале — настоящий клик по центру экрана, без ручек
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height * 0.42);
  await expect.poll(() => page.evaluate(() => window.__game.screen)).toBe('focus');

  await page.evaluate(() => window.__game.tapUV(0.1, 0.9));
  await expect(page.locator('.toast--miss')).toBeVisible();

  for (const [u, v] of [[0.809, 0.046], [0.435, 0.27], [0.625, 0.207]])
    await page.evaluate(([a, b]) => window.__game.tapUV(a, b), [u, v]);
  await expect(page.locator('.chips li.found')).toHaveCount(3);
  await expect(page.locator('#chapter')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#chapter')).toContainText('Анна Бош');

  await page.goto('./');
  await expect(page.locator('a.ep')).toContainText('глава получена');
  expect(errors).toEqual([]);
});

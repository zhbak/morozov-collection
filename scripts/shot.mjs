// Цикл «посмотреть глазами»: открывает страницу, выполняет действия через window.__game,
// сохраняет скриншот и печатает состояние и ошибки консоли.
// node scripts/shot.mjs "?ep=red-vineyards" --mobile --act=start,focus,tap:0.81:0.05 --wait=1500
// v2 на WebGPU: node scripts/shot.mjs collector.html --headed --size=1440x900 --act=start
// (в headless WebGPU может не завестись — тогда WebGPURenderer уходит в WebGL 2 на SwiftShader)
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith('--')) ?? '/';
const flag = (name) => args.find((a) => a.startsWith(`--${name}`));
const mobile = !!flag('mobile');
const headed = !!flag('headed');
const [vw, vh] = (flag('size')?.split('=')[1] ?? '1280x800').split('x').map(Number);
const acts = (flag('act')?.split('=')[1] ?? '').split(',').filter(Boolean);
const wait = Number(flag('wait')?.split('=')[1] ?? 1500);
const base = process.env.URL ?? 'http://localhost:5173';
const name = flag('out')?.split('=')[1] ?? `${mobile ? 'mobile' : 'desktop'}-${Date.now()}`;

const browser = await chromium.launch(
  headed ? { headless: false, args: ['--enable-unsafe-webgpu'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
);
const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: vw, height: vh } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(new URL(path, base + '/').href);
await page.waitForFunction(() => window.__game?.ready, null, { timeout: 20000 });
for (const act of acts) {
  const [cmd, a, b] = act.split(':');
  if (cmd === 'tap') await page.evaluate(([u, v]) => window.__game.tapUV(u, v), [Number(a), Number(b)]);
  else await page.evaluate((c) => window.__game[c](), cmd);
  await page.waitForTimeout(400);
}
await page.waitForTimeout(wait);
mkdirSync('shots', { recursive: true });
const file = `shots/${name}.png`;
await page.screenshot({ path: file });
const state = await page.evaluate(() => {
  const { ready, screen, episode, found, fps, location, backend, player } = window.__game;
  return { ready, screen, episode, found, fps, location, backend, player };
});
console.log(JSON.stringify({ file, state, errors }, null, 2));
await browser.close();

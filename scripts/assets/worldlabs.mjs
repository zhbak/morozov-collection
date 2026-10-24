// Спайк B: мир World Labs (Marble) для улицы. assets/worlds.json -> assets/cache/worlds/<id>/ (в git не идёт).
// Docs: https://docs.worldlabs.ai/api ; ключ WORLDLABS_API_KEY в .env (не печатается).
// Usage: node scripts/assets/worldlabs.mjs --only <id>   (тратит кредиты; повторный запуск берёт кэш)
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://api.worldlabs.ai/marble/v1';

async function loadKey() {
  if (process.env.WORLDLABS_API_KEY) return process.env.WORLDLABS_API_KEY;
  const env = await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => '');
  const m = env.match(/^\s*WORLDLABS_API_KEY\s*=\s*(.+?)\s*$/m);
  if (!m) throw new Error('WORLDLABS_API_KEY not found in env or .env');
  return m[1].replace(/^['"]|['"]$/g, '');
}
const KEY = await loadKey();

async function api(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { 'WLT-Api-Key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`World Labs ${method} ${p} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const credits = async () => (await api('GET', '/credits')).remaining_credits;

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const worlds = JSON.parse(await fs.readFile(path.join(root, 'assets/worlds.json'), 'utf8')).filter((w) => !only || w.id === only);
if (!worlds.length) throw new Error('nothing to do: --only <id> from assets/worlds.json');

console.log(`credits: ${await credits()}`);
for (const w of worlds) {
  const dir = path.join(root, 'assets/cache/worlds', w.id);
  await fs.mkdir(dir, { recursive: true });
  const req = { display_name: w.id, model: w.model, ...(w.seed != null ? { seed: w.seed } : {}), world_prompt: { type: 'text', text_prompt: w.prompt, disable_recaption: true } };
  const hash = crypto.createHash('sha256').update(JSON.stringify(req)).digest('hex');
  const metaPath = path.join(dir, 'world.json');
  let meta = await fs.readFile(metaPath, 'utf8').then(JSON.parse).catch(() => null);
  if (meta?.hash !== hash) {
    // Операция могла начаться в прошлый раз — продолжаем её, а не создаём новую
    let op = await fs.readFile(path.join(dir, 'operation.json'), 'utf8').then(JSON.parse).catch(() => null);
    if (!op || op.hash !== hash) {
      const created = await api('POST', '/worlds:generate', req);
      op = { hash, id: created.operation_id ?? created.name ?? created.id };
      await fs.writeFile(path.join(dir, 'operation.json'), JSON.stringify({ ...op, created }, null, 2));
      console.log(`[${w.id}] operation ${op.id}`);
    }
    const t0 = Date.now();
    let res;
    while (true) {
      res = await api('GET', `/operations/${op.id}`);
      if (res.done) break;
      if (Date.now() - t0 > 30 * 60 * 1000) throw new Error('timeout');
      process.stdout.write('.');
      await sleep(10000);
    }
    if (res.error) throw new Error(`[${w.id}] ${JSON.stringify(res.error)}`);
    let response = res.response ?? res;
    // Ассеты могут прийти только в карточке мира
    const worldId = response.world_id ?? response.id ?? response.world?.world_id ?? response.world?.id;
    if (!(response.assets ?? response.world?.assets) && worldId) response = await api('GET', `/worlds/${worldId}`);
    meta = { hash, request: req, response, date: new Date().toISOString() };
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
    console.log(`\n[${w.id}] done in ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  // Скачиваем сразу: срок жизни ссылок не документирован
  const world = meta.response.world ?? meta.response;
  const a = world.assets ?? {};
  const files = {
    'splat-500k.spz': a.splats?.spz_urls?.['500k'],
    'splat-full.spz': a.splats?.spz_urls?.full_res,
    'collider.glb': a.mesh?.collider_mesh_url,
    'pano.jpg': a.imagery?.pano_url ?? a.pano_url,
    'thumb.jpg': a.thumbnail_url,
  };
  for (const [name, url] of Object.entries(files)) {
    if (!url || (await fs.stat(path.join(dir, name)).catch(() => null))) continue;
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`  ${name}: ${r.status}`);
      continue;
    }
    await fs.writeFile(path.join(dir, name), Buffer.from(await r.arrayBuffer()));
    console.log(`  ${name} ${((await fs.stat(path.join(dir, name))).size / 1024 / 1024).toFixed(1)} MB`);
  }
  console.log(`  semantics: ${JSON.stringify(a.splats?.semantics_metadata ?? null)}`);
}
console.log(`credits: ${await credits()}`);

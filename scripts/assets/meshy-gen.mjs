// Meshy Text-to-3D generator. Docs: https://docs.meshy.ai/en/api/text-to-3d
// Usage: node scripts/assets/meshy-gen.mjs [--only <id>]
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://api.meshy.ai';
const POLL_MS = 5000;
const TIMEOUT_MS = 20 * 60 * 1000;

async function loadKey() {
  if (process.env.MESHY_API_KEY) return process.env.MESHY_API_KEY;
  const env = await fs.readFile(path.join(root, '.env'), 'utf8').catch(() => '');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?MESHY_API_KEY\s*=\s*(.*?)\s*$/);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  throw new Error('MESHY_API_KEY not found in env or .env');
}
const KEY = await loadKey();

async function api(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meshy ${method} ${p} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function balance() {
  try {
    const b = await api('GET', '/openapi/v1/balance');
    return b.balance;
  } catch (e) {
    console.warn('  (balance unavailable:', e.message, ')');
    return null;
  }
}

async function poll(taskId, label) {
  const t0 = Date.now();
  let last = '';
  while (true) {
    const t = await api('GET', `/openapi/v2/text-to-3d/${taskId}`);
    const line = `${t.status} ${t.progress}%`;
    if (line !== last) { console.log(`  [${label}] ${line}`); last = line; }
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED') {
      throw new Error(`Task ${taskId} ${t.status}: ${JSON.stringify(t.task_error)}`);
    }
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error(`Task ${taskId} timed out (last: ${line})`);
    await sleep(POLL_MS);
  }
}

const args = process.argv.slice(2);
const oi = args.indexOf('--only');
const only = oi >= 0 ? args[oi + 1] : null;
if (oi >= 0 && !only) { console.error('--only requires an id'); process.exit(2); }

const models = JSON.parse(await fs.readFile(path.join(root, 'assets/models.json'), 'utf8'));
const todo = models.filter((m) => !only || m.id === only);
if (only && !todo.length) { console.error(`id "${only}" not found in assets/models.json`); process.exit(2); }

const startBalance = await balance();
if (startBalance != null) console.log(`Meshy balance: ${startBalance} credits`);
let spent = 0;

for (const m of todo) {
  const dir = path.join(root, 'assets/cache', m.id);
  const hash = crypto.createHash('sha256').update(m.prompt).digest('hex');
  const metaPath = path.join(dir, 'meta.json');
  const glbPath = path.join(dir, 'raw.glb');
  const cached = await fs.readFile(metaPath, 'utf8').then(JSON.parse).catch(() => null);
  const hasGlb = await fs.stat(glbPath).then(() => true).catch(() => false);
  if (cached && cached.promptHash === hash && hasGlb) {
    console.log(`[${m.id}] cached (prompt hash ${hash.slice(0, 12)}), skipping`);
    continue;
  }
  await fs.mkdir(dir, { recursive: true });
  console.log(`[${m.id}] generating...`);

  // Note: art_style is deprecated and ignored by the API, so it is not sent.
  const previewBody = {
    mode: 'preview',
    prompt: m.prompt,
    should_remesh: true,
    topology: 'triangle',
    target_polycount: m.target_polycount ?? 8000,
    target_formats: ['glb'],
  };
  const { result: previewId } = await api('POST', '/openapi/v2/text-to-3d', previewBody);
  console.log(`  preview task ${previewId}`);
  const preview = await poll(previewId, 'preview');
  console.log(`  preview consumed_credits: ${preview.consumed_credits}`);

  const refineBody = {
    mode: 'refine',
    preview_task_id: previewId,
    enable_pbr: true,
    texture_resolution: '2k',
    target_formats: ['glb'],
  };
  const { result: refineId } = await api('POST', '/openapi/v2/text-to-3d', refineBody);
  console.log(`  refine task ${refineId}`);
  const refine = await poll(refineId, 'refine');
  console.log(`  refine consumed_credits: ${refine.consumed_credits}`);

  const url = refine.model_urls?.glb;
  if (!url) throw new Error(`No glb url in refine result: ${JSON.stringify(refine.model_urls)}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GLB download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(glbPath, buf);

  const credits = (preview.consumed_credits ?? 0) + (refine.consumed_credits ?? 0);
  spent += credits;
  await fs.writeFile(metaPath, JSON.stringify({
    id: m.id,
    prompt: m.prompt,
    promptHash: hash,
    date: new Date().toISOString(),
    previewTaskId: previewId,
    refineTaskId: refineId,
    previewRequest: previewBody,
    refineRequest: refineBody,
    consumedCredits: credits,
    glbBytes: buf.length,
  }, null, 2));
  console.log(`[${m.id}] saved ${glbPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB), credits: ${credits}`);
}

const end = await balance();
if (end != null) console.log(`Meshy balance now: ${end} credits${startBalance != null ? ` (spent ${startBalance - end})` : ''}`);
if (spent) console.log(`Credits reported by tasks: ${spent}`);

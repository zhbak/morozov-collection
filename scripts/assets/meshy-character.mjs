// Персонаж через Meshy: Text-to-3D (A-поза) → refine → Rigging → Animation (несколько клипов в одном GLB).
// Если в записи есть "images" (концепт спереди/сбоку/сзади) — вместо preview+refine один шаг
// Multi-Image-to-3D с текстурой; картинки уходят data URI из assets/raw.
// Docs: https://docs.meshy.ai/en/api/text-to-3d, /api/multi-image-to-3d, /api/rigging, /api/animation, /api/animation-library
// Usage: node scripts/assets/meshy-character.mjs --only morozov [--until preview|refine|rig|anim]
// Каждый шаг кэшируется по хэшу своего запроса в assets/cache/<id>/; файлы Meshy живут 3 дня — качаем сразу.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = 'https://api.meshy.ai';
const POLL_MS = 5000;
const TIMEOUT_MS = 25 * 60 * 1000;
const STEPS = ['preview', 'refine', 'rig', 'anim'];

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
    headers: {
      Authorization: `Bearer ${KEY}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Meshy ${method} ${p} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');

async function poll(endpoint, id, label) {
  const t0 = Date.now();
  let last = '';
  while (true) {
    const t = await api('GET', `${endpoint}/${id}`);
    const line = `${t.status} ${t.progress ?? ''}%`;
    if (line !== last) (console.log(`  [${label}] ${line}`), (last = line));
    if (t.status === 'SUCCEEDED') return t;
    if (t.status === 'FAILED' || t.status === 'CANCELED')
      throw new Error(`${label} ${id} ${t.status}: ${JSON.stringify(t.task_error)}`);
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error(`${label} ${id} timed out (last: ${line})`);
    await sleep(POLL_MS);
  }
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${path.basename(file)} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(file, buf);
  console.log(`  saved ${path.relative(root, file)} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
}

/** Шаг с кэшем: если запрос не менялся и файлы на месте — не тратим кредиты */
async function step(dir, name, request, run) {
  const metaPath = path.join(dir, `${name}.json`);
  const key = hash(request);
  const cached = await fs
    .readFile(metaPath, 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  if (cached?.requestHash === key) {
    const missing = [];
    for (const f of cached.files ?? []) if (!(await fs.stat(path.join(dir, f)).catch(() => null))) missing.push(f);
    if (!missing.length) {
      console.log(`  ${name}: cached (task ${cached.task.id})`);
      return cached.task;
    }
  }
  const { task, files, credits } = await run();
  await fs.writeFile(
    metaPath,
    JSON.stringify(
      {
        requestHash: key,
        request,
        date: new Date().toISOString(),
        credits,
        files,
        task,
      },
      null,
      2,
    ),
  );
  return task;
}

const args = process.argv.slice(2);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : null);
const only = opt('only');
const until = opt('until') ?? 'anim';
if (!STEPS.includes(until)) throw new Error(`--until must be one of ${STEPS.join(', ')}`);
const upto = (s) => STEPS.indexOf(s) <= STEPS.indexOf(until);

const chars = JSON.parse(await fs.readFile(path.join(root, 'assets/characters.json'), 'utf8'));
const todo = chars.filter((c) => !only || c.id === only);
if (!todo.length) throw new Error(`no character "${only}" in assets/characters.json`);

const balance = async () => (await api('GET', '/openapi/v1/balance').catch(() => ({}))).balance;
const startBalance = await balance();
console.log(`Meshy balance: ${startBalance}`);

for (const c of todo) {
  const dir = path.join(root, 'assets/cache', c.id);
  await fs.mkdir(dir, { recursive: true });
  console.log(`[${c.id}]`);

  let refine;
  if (c.images) {
    const image_urls = [];
    for (const f of c.images) {
      const b64 = (await fs.readFile(path.join(root, f))).toString('base64');
      image_urls.push(`data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${b64}`);
    }
    const modelReq = {
      image_urls,
      ai_model: c.ai_model,
      pose_mode: c.pose_mode,
      should_texture: true,
      enable_pbr: true,
      texture_resolution: c.texture_resolution,
      ...(c.texture_prompt ? { texture_prompt: c.texture_prompt } : {}),
      should_remesh: true,
      topology: 'triangle',
      target_polycount: c.target_polycount,
      target_formats: ['glb'],
    };
    refine = await step(dir, 'model', { ...modelReq, image_urls: c.images }, async () => {
      const { result } = await api('POST', '/openapi/v1/multi-image-to-3d', modelReq);
      console.log(`  multi-image task ${result}`);
      const t = await poll('/openapi/v1/multi-image-to-3d', result, 'model');
      await download(t.model_urls.glb, path.join(dir, 'raw.glb'));
      if (t.thumbnail_url) await download(t.thumbnail_url, path.join(dir, 'model.png'));
      return { task: t, files: ['raw.glb'], credits: t.consumed_credits };
    });
  } else {
    const previewReq = {
      mode: 'preview',
      prompt: c.prompt,
      ai_model: c.ai_model,
      pose_mode: c.pose_mode,
      should_remesh: true,
      topology: 'triangle',
      target_polycount: c.target_polycount,
      target_formats: ['glb'],
    };
    const preview = await step(dir, 'preview', previewReq, async () => {
      const { result } = await api('POST', '/openapi/v2/text-to-3d', previewReq);
      console.log(`  preview task ${result}`);
      const t = await poll('/openapi/v2/text-to-3d', result, 'preview');
      await download(t.model_urls.glb, path.join(dir, 'preview.glb'));
      if (t.thumbnail_url) await download(t.thumbnail_url, path.join(dir, 'preview.png'));
      return { task: t, files: ['preview.glb'], credits: t.consumed_credits };
    });
    if (!upto('refine')) continue;

    const refineReq = {
      mode: 'refine',
      preview_task_id: preview.id,
      enable_pbr: true,
      texture_resolution: c.texture_resolution,
      ...(c.texture_prompt ? { texture_prompt: c.texture_prompt } : {}),
      target_formats: ['glb'],
    };
    refine = await step(dir, 'refine', refineReq, async () => {
      const { result } = await api('POST', '/openapi/v2/text-to-3d', refineReq);
      console.log(`  refine task ${result}`);
      const t = await poll('/openapi/v2/text-to-3d', result, 'refine');
      await download(t.model_urls.glb, path.join(dir, 'raw.glb'));
      if (t.thumbnail_url) await download(t.thumbnail_url, path.join(dir, 'refine.png'));
      return { task: t, files: ['raw.glb'], credits: t.consumed_credits };
    });
  }
  if (!upto('rig')) continue;

  const rigReq = { input_task_id: refine.id, height_meters: c.height_meters };
  const rig = await step(dir, 'rig', rigReq, async () => {
    const { result } = await api('POST', '/openapi/v1/rigging', rigReq);
    console.log(`  rig task ${result}`);
    const t = await poll('/openapi/v1/rigging', result, 'rig');
    const r = t.result;
    await download(r.rigged_character_glb_url, path.join(dir, 'rigged.glb'));
    const files = ['rigged.glb'];
    for (const k of ['walking', 'running']) {
      const u = r.basic_animations?.[`${k}_glb_url`];
      if (u) (await download(u, path.join(dir, `${k}.glb`)), files.push(`${k}.glb`));
    }
    return { task: t, files, credits: t.consumed_credits };
  });
  if (!upto('anim') || !c.actions?.length) continue;

  const animReq = { rig_task_id: rig.id, action_ids: c.actions };
  await step(dir, 'anim', animReq, async () => {
    const { result } = await api('POST', '/openapi/v1/animations', animReq);
    console.log(`  anim task ${result}`);
    const t = await poll('/openapi/v1/animations', result, 'anim');
    await download(t.result.animation_glb_url, path.join(dir, 'anims.glb'));
    return { task: t, files: ['anims.glb'], credits: t.consumed_credits };
  });
}

const end = await balance();
console.log(`Meshy balance now: ${end}${startBalance != null && end != null ? ` (spent ${startBalance - end})` : ''}`);

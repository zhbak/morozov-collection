// Картины v2 с Wikimedia Commons (только public domain): assets/collector-paintings.json ->
// assets/raw/collector/<id>.jpg (до 3000 px по длинной стороне) -> public/collector/paintings/<id>-{2048,512}.webp
// Usage: node scripts/assets/commons-paintings.mjs [--only <id>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UA = { 'User-Agent': 'morozov-collection asset script (https://github.com/zhbak/morozov-collection)' };
const list = JSON.parse(await fs.readFile(path.join(root, 'assets/collector-paintings.json'), 'utf8'));
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const rawDir = path.join(root, 'assets/raw/collector');
const outDir = path.join(root, 'public/collector/paintings');
await fs.mkdir(rawDir, { recursive: true });
await fs.mkdir(outDir, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

for (const p of list.filter((p) => !only || p.id === only)) {
  const raw = path.join(rawDir, `${p.id}.jpg`);
  if (!(await fs.stat(raw).catch(() => null))) {
    const q = new URLSearchParams({ action: 'query', titles: `File:${p.commons}`, prop: 'imageinfo', iiprop: 'url|size', iiurlwidth: '3000', format: 'json' });
    const info = Object.values((await (await fetch(`https://commons.wikimedia.org/w/api.php?${q}`, { headers: UA })).json()).query.pages)[0].imageinfo[0];
    // Для вертикальных — 3000 по высоте
    const url = info.height > info.width ? info.thumburl.replace(/\/3000px-/, `/${Math.round((3000 * info.width) / info.height)}px-`) : info.thumburl;
    const res = await fetch(info.width <= 3000 && info.height <= 3000 ? info.url : url, { headers: UA });
    if (!res.ok) throw new Error(`${p.id}: ${res.status}`);
    // Commons отдаёт превью стандартными ступенями (3840 и т. п.) — приводим к 3000 px
    await sharp(Buffer.from(await res.arrayBuffer())).rotate().resize({ width: 3000, height: 3000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toFile(raw);
  }
  const meta = await sharp(raw).metadata();
  for (const [size, q] of [[2048, 88], [512, 80]]) {
    const dst = path.join(outDir, `${p.id}-${size}.webp`);
    const info = await sharp(raw).resize({ width: size, height: size, fit: 'inside' }).webp({ quality: q }).toFile(dst);
    console.log(`${p.id}-${size}.webp ${info.width}x${info.height} ${kb(info.size)} (raw ${meta.width}x${meta.height})`);
  }
}

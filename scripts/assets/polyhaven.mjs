// CC0-ассеты Poly Haven для v2: assets/polyhaven.json -> public/collector/{textures,models}/
// Текстуры: jpg из API -> webp (цвет — sRGB, normal/arm — с высоким качеством). Модели: glTF -> GLB (meshopt + webp).
// API: https://github.com/Poly-Haven/Public-API
// Usage: node scripts/assets/polyhaven.mjs [--only <id>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup, prune, quantize, reorder, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const API = 'https://api.polyhaven.com';
const UA = { 'User-Agent': 'morozov-collection asset script' };
const out = path.join(root, 'public/collector');
const cache = path.join(root, 'assets/cache/polyhaven');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const cfg = JSON.parse(await fs.readFile(path.join(root, 'assets/polyhaven.json'), 'utf8'));
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

async function get(url, file) {
  if (await fs.stat(file).catch(() => null)) return fs.readFile(file);
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, buf);
  return buf;
}
const json = async (p) => (await fetch(API + p, { headers: UA })).json();

// Карты: ключ в API -> имя файла и качество webp
const MAPS = { Diffuse: ['diff', 88], nor_gl: ['nor', 92], arm: ['arm', 90] };

for (const t of cfg.textures.filter((t) => !only || t.id === only)) {
  const files = await json(`/files/${t.id}`);
  const dir = path.join(out, 'textures', t.id);
  await fs.mkdir(dir, { recursive: true });
  for (const key of t.maps ?? Object.keys(MAPS)) {
    const [name, quality] = MAPS[key];
    const src = files[key]?.[t.res]?.jpg?.url;
    if (!src) throw new Error(`${t.id}: no ${key} ${t.res} jpg`);
    const raw = await get(src, path.join(cache, 'textures', t.id, path.basename(src)));
    const dst = path.join(dir, `${name}.webp`);
    const info = await sharp(raw).webp({ quality }).toFile(dst);
    console.log(`${t.id}/${name}.webp ${info.width}x${info.height} ${kb(info.size)}`);
  }
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

for (const m of (cfg.models ?? []).filter((m) => !only || m.id === only)) {
  const files = await json(`/files/${m.id}`);
  const g = files.gltf?.[m.res]?.gltf;
  if (!g) throw new Error(`${m.id}: no gltf ${m.res}`);
  const dir = path.join(cache, 'models', m.id);
  await get(g.url, path.join(dir, path.basename(g.url)));
  for (const [rel, inc] of Object.entries(g.include ?? {})) await get(inc.url, path.join(dir, rel));
  const doc = await io.read(path.join(dir, path.basename(g.url)));
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [m.max_texture ?? 2048, m.max_texture ?? 2048] }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const dst = path.join(out, 'models', `${m.id}.glb`);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  console.log(`${m.id}.glb ${kb((await fs.stat(dst)).size)}`);
}

// assets/cache/<id>/raw.glb -> public/models/<id>.glb (meshopt-compressed, webp textures)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, EXTTextureWebP, ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, textureCompress, reorder, quantize, getBounds } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_BYTES = 1.5 * 1024 * 1024;
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

function triCount(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      n += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
    }
  return Math.round(n);
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const models = JSON.parse(await fs.readFile(path.join(root, 'assets/models.json'), 'utf8').catch(() => '[]'));
const byId = Object.fromEntries(models.map((m) => [m.id, m]));
const cacheDir = path.join(root, 'assets/cache');
const outDir = path.join(root, 'public/models');
await fs.mkdir(outDir, { recursive: true });

const ids = [];
for (const e of await fs.readdir(cacheDir, { withFileTypes: true }).catch(() => []))
  if (e.isDirectory() && (await fs.stat(path.join(cacheDir, e.name, 'raw.glb')).catch(() => null))) ids.push(e.name);
const only = process.argv.indexOf('--only') >= 0 ? process.argv[process.argv.indexOf('--only') + 1] : null;

let failed = false;
for (const id of ids.filter((i) => !only || i === only)) {
  const src = path.join(cacheDir, id, 'raw.glb');
  const dst = path.join(outDir, `${id}.glb`);
  const cfg = byId[id] ?? {};
  const before = (await fs.stat(src)).size;
  const doc = await io.read(src);
  const trisBefore = triCount(doc);

  // ratio: explicit from models.json, else derive from target_polycount (default 8000)
  const target = cfg.target_polycount ?? 8000;
  const ratio = cfg.simplify_ratio ?? Math.min(1, target / Math.max(trisBefore, 1));

  await doc.transform(
    dedup(),
    prune(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 })] : []),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(dst, doc);

  const after = (await fs.stat(dst)).size;
  const trisAfter = triCount(doc);
  console.log(`${id}: ${kb(before)} -> ${kb(after)}, triangles ${trisBefore} -> ${trisAfter} (ratio ${ratio.toFixed(3)})`);
  if (after > MAX_BYTES) { console.error(`  ERROR: ${id}.glb exceeds ${kb(MAX_BYTES)}`); failed = true; }
}
if (!ids.length) console.log('No cached raw.glb files found.');
process.exit(failed ? 1 : 0);

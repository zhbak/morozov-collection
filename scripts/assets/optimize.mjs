// assets/cache/<id>/raw.glb -> public/models/<id>.glb (meshopt-compressed, webp textures)
// v2: записи с "target": "collector" идут в public/collector/models/ со своими лимитами
// (max_texture, max_mb, simplify: false для персонажей со скином, source — какой файл из кэша брать).
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

const readList = async (f) => JSON.parse(await fs.readFile(path.join(root, 'assets', f), 'utf8').catch(() => '[]'));
const models = await readList('models.json');
// Персонажи: меш со скином и полным PBR — из рига (в GLB анимаций Meshy остаётся только цвет),
// клипы — отдельным файлом <id>-anims.glb; кости совпадают по именам. Текстуры 2K, без упрощения сетки
const characters = (await readList('characters.json')).map((c) => ({
  source: 'rigged.glb',
  anims: 'anims.glb',
  target: 'collector',
  simplify: false,
  max_texture: 2048,
  max_mb: 16,
  ...c,
}));
const byId = Object.fromEntries([...models, ...characters].map((m) => [m.id, m]));
const cacheDir = path.join(root, 'assets/cache');
const sourceOf = (id) => path.join(cacheDir, id, byId[id]?.source ?? 'raw.glb');

const ids = [];
for (const e of await fs.readdir(cacheDir, { withFileTypes: true }).catch(() => []))
  if (e.isDirectory() && (await fs.stat(sourceOf(e.name)).catch(() => null))) ids.push(e.name);
const only = process.argv.indexOf('--only') >= 0 ? process.argv[process.argv.indexOf('--only') + 1] : null;

let failed = false;
for (const id of ids.filter((i) => !only || i === only)) {
  const cfg = byId[id] ?? {};
  const src = sourceOf(id);
  const outDir = path.join(root, cfg.target === 'collector' ? 'public/collector/models' : 'public/models');
  await fs.mkdir(outDir, { recursive: true });
  const dst = path.join(outDir, `${id}.glb`);
  const maxBytes = cfg.max_mb ? cfg.max_mb * 1024 * 1024 : MAX_BYTES;
  const maxTex = cfg.max_texture ?? 1024;
  const before = (await fs.stat(src)).size;
  const doc = await io.read(src);
  const trisBefore = triCount(doc);

  // ratio: explicit from models.json, else derive from target_polycount (default 8000)
  const target = cfg.target_polycount ?? 8000;
  const ratio = cfg.simplify === false ? 1 : cfg.simplify_ratio ?? Math.min(1, target / Math.max(trisBefore, 1));

  // Клип рига (A-поза) не нужен — клипы едут отдельным файлом
  if (cfg.anims) for (const a of doc.getRoot().listAnimations()) a.dispose();
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 })] : []),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex] }),
    reorder({ encoder: MeshoptEncoder }),
    quantize(),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(dst, doc);

  const after = (await fs.stat(dst)).size;
  const trisAfter = triCount(doc);
  console.log(`${id}: ${kb(before)} -> ${kb(after)}, triangles ${trisBefore} -> ${trisAfter} (ratio ${ratio.toFixed(3)})`);
  if (after > maxBytes) { console.error(`  ERROR: ${id}.glb exceeds ${kb(maxBytes)}`); failed = true; }

  if (cfg.anims) {
    // Только узлы и анимации: меши, скины, материалы и текстуры удаляются
    const anim = await io.read(path.join(cacheDir, id, cfg.anims));
    for (const n of anim.getRoot().listNodes()) {
      n.setMesh(null);
      n.setSkin(null);
    }
    for (const m of anim.getRoot().listMeshes()) m.dispose();
    for (const s of anim.getRoot().listSkins()) s.dispose();
    await anim.transform(prune(), dedup());
    anim.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
    const adst = path.join(outDir, `${id}-anims.glb`);
    await io.write(adst, anim);
    console.log(`  ${id}-anims.glb ${kb((await fs.stat(adst)).size)}, clips: ${anim.getRoot().listAnimations().map((a) => a.getName()).join(', ')}`);
  }
}
if (!ids.length) console.log('No cached raw.glb files found.');
process.exit(failed ? 1 : 0);

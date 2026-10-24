// Converts assets/raw/*.jpg -> public/paintings/<kebab>-1600.webp and -800.webp
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawDir = path.join(root, 'assets/raw');
const outDir = path.join(root, 'public/paintings');
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

await fs.mkdir(outDir, { recursive: true });
const files = (await fs.readdir(rawDir)).filter((f) => /\.jpe?g$/i.test(f));
if (!files.length) console.warn('No jpg files in', rawDir);

for (const f of files) {
  const name = kebab(path.parse(f).name);
  const src = path.join(rawDir, f);
  const inSize = (await fs.stat(src)).size;
  const meta = await sharp(src).metadata();
  console.log(`${f}: ${meta.width}x${meta.height}, ${kb(inSize)}`);
  for (const [w, q] of [[1600, 82], [800, 82]]) {
    const out = path.join(outDir, `${name}-${w}.webp`);
    const info = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: q }).toFile(out);
    console.log(`  -> public/paintings/${name}-${w}.webp ${info.width}x${info.height} ${kb(info.size)}`);
  }
}

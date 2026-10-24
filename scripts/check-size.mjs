// Бюджет веса. v1 (эпизоды по QR) — строгий: посетитель в зале с плохим интернетом скачивает
// ровно то, что сервис-воркер кладёт в precache. v2 «Коллекционер» — десктоп, только предупреждение.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LIMIT_MB = Number(process.env.SIZE_LIMIT_MB ?? 8);
const V2_WARN_MB = Number(process.env.V2_WARN_MB ?? 120);
const mb = (b) => (b / 1024 / 1024).toFixed(2);
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [{ p: relative('dist', p), size: statSync(p).size }];
  });
const files = walk('dist').sort((a, b) => b.size - a.size);

// Список precache — из сгенерированного sw.js; без него считаем v1 весь dist, как раньше
const sw = existsSync('dist/sw.js') ? readFileSync('dist/sw.js', 'utf8') : null;
const precached = sw ? new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])) : null;
const isV1 = (f) => !precached || precached.has(f.p) || f.p === 'sw.js' || f.p.startsWith('workbox-');
const v1 = files.filter(isV1);
const v2 = files.filter((f) => !isV1(f));
const sum = (list) => list.reduce((s, f) => s + f.size, 0);

const show = (title, list) => {
  console.log(title);
  for (const f of list.slice(0, 8)) console.log(`${(f.size / 1024).toFixed(0).padStart(9)} KB  ${f.p}`);
};
show('v1 (precache):', v1);
console.log(`v1 total: ${mb(sum(v1))} MB (limit ${LIMIT_MB} MB)`);
if (v2.length) {
  show('v2 (collector):', v2);
  console.log(`v2 total: ${mb(sum(v2))} MB (warning above ${V2_WARN_MB} MB)`);
  if (sum(v2) / 1024 / 1024 > V2_WARN_MB) console.warn(`WARNING: v2 is ${mb(sum(v2))} MB`);
}
if (sum(v1) / 1024 / 1024 > LIMIT_MB) process.exit(1);

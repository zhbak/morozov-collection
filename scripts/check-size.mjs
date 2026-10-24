// Бюджет веса для посетителя в зале с плохим интернетом
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LIMIT_MB = Number(process.env.SIZE_LIMIT_MB ?? 8);
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [{ p, size: statSync(p).size }];
  });
const files = walk('dist').sort((a, b) => b.size - a.size);
const total = files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
for (const f of files.slice(0, 8)) console.log(`${(f.size / 1024).toFixed(0).padStart(7)} KB  ${f.p}`);
console.log(`total: ${total.toFixed(2)} MB (limit ${LIMIT_MB} MB)`);
if (total > LIMIT_MB) process.exit(1);

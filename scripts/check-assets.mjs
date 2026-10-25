// Fails if any asset required by src/ui/assets.ts or app.json is missing or empty.  node scripts/check-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'src/ui/assets.ts'), 'utf8');
const files = [...src.matchAll(/require\('\.\.\/\.\.\/([^']+)'\)/g)].map((m) => m[1]);
const cfg = fs.readFileSync(path.join(root, 'app.json'), 'utf8');
for (const m of cfg.matchAll(/"\.\/(assets\/[^"]+)"/g)) files.push(m[1]);
const bad = [];
for (const f of new Set(files)) {
  const p = path.join(root, f);
  if (!fs.existsSync(p) || fs.statSync(p).size === 0) bad.push(f);
}
if (bad.length) { console.error('Missing or empty assets:\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`assets ok (${new Set(files).size} files)`);

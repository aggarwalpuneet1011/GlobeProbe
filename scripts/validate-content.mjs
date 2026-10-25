// Validates every bundled content JSON. Usage: npm run validate:content
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const assets = fs.readFileSync(path.join(root, 'src/ui/assets.ts'), 'utf8');
const block = /CONCEPT_ICONS = \{([\s\S]*?)\} as const/.exec(assets)[1];
const iconNames = [...block.matchAll(/"([a-z_]+)":/g)].map((m) => m[1]);

const entry = `
import { validateAll } from './src/content/validate';
import { CONCEPTS, DECKS, CASES, PLACES } from './src/content/data';
export const run = (icons) => validateAll({ concepts: CONCEPTS, decks: DECKS, cases: CASES, places: PLACES }, new Set(icons));
`;
const res = await build({
  stdin: { contents: entry, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
  loader: { '.json': 'json' },
});
const tmp = path.join(os.tmpdir(), `gp-validate-${process.pid}.mjs`);
fs.writeFileSync(tmp, res.outputFiles[0].text);
const { run } = await import(pathToFileURL(tmp).href);
const problems = run(iconNames);
fs.unlinkSync(tmp);
for (const p of problems) console.log(`${p.level.toUpperCase().padEnd(5)} [${p.where}] ${p.message}`);
const errors = problems.filter((p) => p.level === 'error').length;
console.log(`\n${errors} error(s), ${problems.length - errors} warning(s)`);
process.exit(errors ? 1 : 0);

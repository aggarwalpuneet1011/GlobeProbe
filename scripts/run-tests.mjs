// Bundles each tests/*.test.ts with esbuild (tsconfig paths honoured) and runs it with node.
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const only = process.argv[2];
const files = fs.readdirSync(path.join(root, 'tests')).filter((f) => f.endsWith('.test.ts') && (!only || f.includes(only))).sort();
let failed = 0;
for (const f of files) {
  const out = path.join(os.tmpdir(), `gp-test-${f}.cjs`);
  await build({
    entryPoints: [path.join(root, 'tests', f)], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'error',
    tsconfig: path.join(root, 'tsconfig.json'), loader: { '.json': 'json' }, define: { __DEV__: 'false' },
    alias: { '@shopify/react-native-skia': path.join(root, 'tests/mocks/skia.ts'), 'react-native': path.join(root, 'tests/mocks/rn.ts'), 'expo-keep-awake': path.join(root, 'tests/mocks/keepawake.ts') },
  });
  console.log(`\n=== ${f}`);
  const r = spawnSync(process.execPath, [out], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) FAILED` : `\nAll ${files.length} test file(s) passed`);
process.exit(failed ? 1 : 0);

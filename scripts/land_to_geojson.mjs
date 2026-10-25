// Converts Natural Earth land (via the world-atlas npm package) to GeoJSON for the offline texture renderer.
// Usage: node scripts/land_to_geojson.mjs <path/to/land-50m.json> <out.geojson>
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { feature } = require(process.env.TOPOJSON_CLIENT || 'topojson-client');
const [, , input, output] = process.argv;
const topo = JSON.parse(fs.readFileSync(input, 'utf8'));
const land = feature(topo, topo.objects.land);
fs.writeFileSync(output, JSON.stringify(land));
console.log('wrote', output);

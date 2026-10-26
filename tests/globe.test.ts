import { test, ok, eq, near, done } from './harness';
import { latLonToVec3, vec3ToLatLon, subSolar, centerOn, rotateVec, haversineKm, equalEarthUV, equalEarthInverse, clampDist, clampPitch, DIST_MIN, DIST_MAX, PITCH_LIMIT, dragScale, facingAngle, isFacingCamera, DIST_DEFAULT, MUMBAI, EQUAL_EARTH_ASPECT } from '@/three/globeMath';

test('lat/lon <-> sphere point round trips and matches the texture seam (lon -180 at u = 0)', () => {
  for (const [la, lo] of [[0, 0], [19.08, 72.88], [-33.9, 151.2], [60, -120], [-70, 179]]) {
    const v = latLonToVec3(la, lo); near(Math.hypot(...v), 1, 1e-9);
    const b = vec3ToLatLon(v); near(b.lat, la, 1e-6); near(b.lon, lo, 1e-6);
  }
  const seam = latLonToVec3(0, -180); near(seam[0], -1, 1e-9); near(seam[2], 0, 1e-9);
});
test('centerOn brings any place to face the camera (+z)', () => {
  for (const [la, lo] of [[19.076, 72.878], [0, 0], [-35, -58], [48, 2], [-55, 170]]) {
    const { yaw, pitch } = centerOn(la, lo);
    const r = rotateVec(latLonToVec3(la, lo), yaw, pitch);
    near(r[0], 0, 1e-6); near(r[1], 0, 1e-6); near(r[2], 1, 1e-6);
  }
});
test('sub-solar point: equinox noon UTC is near (0, 0); June solstice is near +23.4 latitude', () => {
  const eq1 = subSolar(new Date(Date.UTC(2026, 2, 21, 12, 0, 0))); near(eq1.lon, 0, 0.1); near(eq1.lat, 0, 1.5);
  const j = subSolar(new Date(Date.UTC(2026, 5, 21, 6, 0, 0))); near(j.lat, 23.4, 0.5); near(j.lon, 90, 0.1);
});
test('distances and limits', () => {
  near(haversineKm(19.076, 72.878, 28.61, 77.21), 1150, 40);
  eq(clampDist(1), DIST_MIN); eq(clampDist(9), DIST_MAX); near(clampPitch(5), PITCH_LIMIT, 1e-9);
  ok(haversineKm(MUMBAI.lat, MUMBAI.lon, 8.08, 77.54) > 700, 'Kanyakumari is farther than the 700 km find radius');
});
test('Equal Earth: centre, edges, and spots matching the pre-rendered map', () => {
  near(equalEarthUV(0, 0).u, 0.5, 1e-9); near(equalEarthUV(0, 0).v, 0.5, 1e-9); near(equalEarthUV(-180, 0).u, 0, 1e-9);
  const m = equalEarthUV(72.88, 19.08); near(m.u, 0.6971, 5e-4); near(m.v, 0.3547, 5e-4);
  near(equalEarthUV(0, 60).v, 0.0869, 5e-4);
  near(EQUAL_EARTH_ASPECT, 2.0546, 1e-3);
  const inv = equalEarthInverse(m.u, m.v)!; near(inv.lat, 19, 1.1); near(inv.lon, 73, 1.1);
  eq(equalEarthInverse(0.01, 0.01), null);
});
test('zoom range leaves room to zoom out and in; drag slows when zoomed in', () => {
  ok(DIST_MIN < 1.6 && DIST_MAX >= 5 && DIST_DEFAULT > 3 && DIST_DEFAULT < DIST_MAX, 'wide zoom range');
  ok(1 / DIST_DEFAULT < Math.sin((40 / 2) * Math.PI / 180) * 0.9, 'whole globe fits in the 40 degree field of view at the default distance');
  near(dragScale(DIST_DEFAULT), 1, 1e-9); ok(dragScale(DIST_MIN) < 0.35, 'slow when close'); ok(dragScale(DIST_MAX) > 1, 'faster when far');
});
test('facingAngle is 0 for the centred place and grows as the globe turns; back-face test', () => {
  const { yaw, pitch } = centerOn(19.076, 72.878);
  near(facingAngle(19.076, 72.878, yaw, pitch), 0, 1e-6);
  ok(facingAngle(19.076 - 0, 72.878 - 90, yaw, pitch) > 1.0, 'a place 90 degrees away is far from centre');
  ok(facingAngle(-19.076, 72.878 - 180, yaw, pitch) > 2.5, 'the antipode is on the far side');
  ok(isFacingCamera(0.9, 3.4) && !isFacingCamera(0.1, 3.4), 'horizon cut-off at distance 3.4');
});
done();

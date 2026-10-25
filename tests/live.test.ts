import { test, ok, eq, near, done } from './harness';
import { compass8, seaLand, windStrengthWord, breezeLine, weatherWord, rainAmountWord, rainNowFromCode, windFromLine } from '@/live/translate';
import { findTides, sanityCheck, clockFor, walkLine } from '@/live/tides';
import { shouldFetch, cacheState, lastCheckedLabel, parseWeather, parseTide, fetchAll, tidesForDay, rainTotal } from '@/live/openmeteo';
import { weatherUrl, tideUrl, LIVE_PLACES, WEATHER_HOST, MARINE_HOST } from '@/live/places';

test('compass8 and sea/land', () => {
  eq(compass8(0), 'north'); eq(compass8(270), 'west'); eq(compass8(225), 'south-west'); eq(compass8(359), 'north'); eq(compass8(22), 'north'); eq(compass8(23), 'north-east');
  eq(seaLand(180), 'sea'); eq(seaLand(315), 'sea'); eq(seaLand(250), 'sea'); eq(seaLand(0), 'land'); eq(seaLand(135), 'land'); eq(seaLand(160), 'coast'); eq(seaLand(340), 'coast');
  eq(windFromLine(270), 'Wind from the west, from the sea'); ok(windFromLine(270).startsWith('Wind from'), 'always from');
});

test('Wind strength words, breeze lines, weather words, rain words', () => {
  eq([0, 5.9, 6, 19, 20, 38, 39, 60].map(windStrengthWord), ['barely a breath', 'barely a breath', 'a gentle breeze', 'a gentle breeze', 'a strong breeze', 'a strong breeze', 'very windy', 'very windy']);
  eq(breezeLine(14, 250, 10), 'Sea breeze is on'); eq(breezeLine(14, 250, 5), null); eq(breezeLine(10, 250, 10), null); eq(breezeLine(23, 90, 3), 'Land breeze is on'); eq(breezeLine(3, 90, 3), 'Land breeze is on'); eq(breezeLine(12, 90, 3), null);
  eq(weatherWord(0)?.word, 'sunny'); eq(weatherWord(2)?.word, 'a few clouds'); eq(weatherWord(3)?.word, 'cloudy'); eq(weatherWord(56)?.word, 'drizzle'); eq(weatherWord(65)?.word, 'heavy rain'); eq(weatherWord(82)?.word, 'downpour'); eq(weatherWord(96)?.word, 'thunderstorm'); eq(weatherWord(71), null);
  eq([0, 1, 2.4, 2.5, 14.9, 15, 63, 64, 200].map(rainAmountWord), ['no rain', 'a little', 'a little', 'some', 'some', 'heavy', 'heavy', 'very heavy', 'very heavy']);
  eq(rainNowFromCode(53), 'drizzle'); eq(rainNowFromCode(63), 'rain'); eq(rainNowFromCode(82), 'rain'); eq(rainNowFromCode(0), null); eq(rainNowFromCode(null), null);
});

// 3 days of a clean M2-ish tide, hourly, high at 2:40 pm on day 0 (hour 14.667)
const series = (n: number, high0 = 14.667, amp = 1.8, period = 12.42, mean = 2.4) => Array.from({ length: n }, (_, i) => mean + amp * Math.cos((2 * Math.PI * (i - high0)) / period));

test('Tides: parabola refinement lands within a few minutes; display rounds to 10 min with "about"', () => {
  const v = series(72); const pts = findTides(v);
  const high = pts.find((p) => p.kind === 'high' && p.hour > 12 && p.hour < 17)!;
  near(high.hour, 14.667, 0.05); near(high.level, 4.2, 0.02);
  eq(clockFor(high.hour), '2:40 pm');
  eq(walkLine('7:10 am').includes('usually walkable'), true); ok(walkLine('7:10 am').includes('Always check with a grown-up'), 'adult line');
});

test('Tides sanity check passes on good data, fails on flat or noisy data', () => {
  const v = series(72); eq(sanityCheck(v, findTides(v)).ok, true);
  const flat = series(72, 14.667, 0.05); eq(sanityCheck(flat, findTides(flat)).ok, false);
  const noisy = v.map((x, i) => x + (i % 2 ? 0.4 : -0.4)); eq(sanityCheck(noisy, findTides(noisy)).ok, false);
  eq(sanityCheck([1, 2, 3], []).ok, false);
});

test('Cache rules: fetch if online and older than 60 min; never within 15 min; 48 h hides', () => {
  const now = '2026-10-25T10:00:00.000Z';
  eq(shouldFetch(false, null, now), false); eq(shouldFetch(true, null, now), true);
  eq(shouldFetch(true, '2026-10-25T09:30:00.000Z', now), false); eq(shouldFetch(true, '2026-10-25T08:50:00.000Z', now), true);
  eq(cacheState('2026-10-25T09:30:00.000Z', now), 'fresh'); eq(cacheState('2026-10-25T05:00:00.000Z', now), 'stale');
  eq(cacheState('2026-10-23T09:59:00.000Z', now), 'hidden'); eq(cacheState('2026-10-23T10:01:00.000Z', now), 'stale'); eq(cacheState(null, now), 'hidden');
  eq(lastCheckedLabel('2026-10-25T09:10:00.000Z', now), 'Last checked 2:40 pm');
  eq(lastCheckedLabel('2026-10-24T09:10:00.000Z', now), 'Last checked 24 Oct, 2:40 pm');
});

const wjson = (mm: number[]) => ({
  current: { time: '2026-10-25T15:30', temperature_2m: 31.2, relative_humidity_2m: 62, precipitation: 0, weather_code: 2, wind_speed_10m: 14, wind_direction_10m: 262, is_day: 1 },
  daily: { time: mm.map((_, i) => `2026-10-${19 + i}`), precipitation_sum: mm },
});
test('Parse weather + tide; rain total is the last 7 days', () => {
  const s = parseWeather('mum', wjson([0, 1, 2, 3, 4, 5, 6]), '2026-10-25T10:00:00Z')!;
  eq(s.now.windDeg, 262); eq(rainTotal(s), 21); eq(parseWeather('x', {}, ''), null);
  eq(parseTide('hajiali', { hourly: { time: Array(72).fill('t'), sea_level_height_msl: series(72) } }, 'x') !== null, true);
  eq(parseTide('hajiali', { hourly: { time: Array(72).fill('t'), sea_level_height_msl: [...series(71), null] } }, 'x'), null);
});

test('URLs are the expected ones and only allowed hosts are used', () => {
  const u = weatherUrl(LIVE_PLACES[0]);
  ok(u.startsWith(WEATHER_HOST + '/v1/forecast?latitude=18.944&longitude=72.823'), u);
  ok(u.includes('past_days=6') && u.includes('forecast_days=1') && u.includes('timezone=Asia%2FKolkata') && u.includes('is_day'), 'params');
  const t = tideUrl(LIVE_PLACES[1]); ok(t.startsWith(MARINE_HOST + '/v1/marine?latitude=18.982&longitude=72.809'), t); ok(t.includes('cell_selection=sea') && t.includes('forecast_days=3'), 'tide params');
});

test('fetchAll: parallel, a failed place is just missing, tide failure is null', async () => {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    if (url.includes('latitude=26.915')) return { ok: false, status: 500, json: async () => ({}) };
    if (url.includes('marine')) return { ok: true, status: 200, json: async () => ({ hourly: { time: Array(72).fill('t'), sea_level_height_msl: series(72) } }) };
    return { ok: true, status: 200, json: async () => wjson([1, 1, 1, 1, 1, 1, 1]) };
  };
  const r = await fetchAll(f, '2026-10-25T10:00:00Z');
  eq(r.weather.map((w) => w.placeId), ['mum', 'pune', 'sohra', 'chennai']); ok(r.tide !== null, 'tide'); eq(calls.length, 6);
  const bad = await fetchAll(async () => { throw new Error('offline'); }, '2026-10-25T10:00:00Z');
  eq(bad.weather.length, 0); eq(bad.tide, null);
});

test('tidesForDay returns the IST day highs/lows and a 24-point curve; null on bad data', () => {
  const times = Array.from({ length: 72 }, (_, i) => `2026-10-${25 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`);
  const snap = { placeId: 'hajiali', fetchedAt: 'x', times, heights: series(72) };
  const d = tidesForDay(snap, '2026-10-25T10:00:00Z')!;
  ok(d.highs.length >= 1 && d.highs.length <= 2 && d.lows.length >= 1, 'extrema'); eq(d.curve.length, 24);
  eq(tidesForDay({ ...snap, heights: series(72, 14.667, 0.02) }, '2026-10-25T10:00:00Z'), null);
});
done();

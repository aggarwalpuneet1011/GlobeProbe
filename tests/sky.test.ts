import { test, ok, eq, done } from './harness';
import { mumbaiNow, rainRace, tideEvents, arrowRotation } from '../src/live/sky';
import type { WeatherSnap, TideSnap } from '../src/live/openmeteo';

const snap = (id: string, deg: number, kmh: number, code: number, daily: number[]): WeatherSnap => ({
  placeId: id, fetchedAt: '2026-10-25T08:00:00.000Z',
  now: { time: '2026-10-25T14:00', tempC: 31.2, humidity: 68, precipMm: 0, code, windKmh: kmh, windDeg: deg, isDay: true },
  daily: daily.map((mm, i) => ({ date: `2026-10-${String(19 + i).padStart(2, '0')}`, mm })),
});

test('sea breeze at 2 pm from the west', () => {
  const n = mumbaiNow(snap('mum', 270, 12, 2, [0, 0, 1, 0, 0, 0, 0]), '2026-10-25T08:30:00.000Z'); // 2:00 pm IST
  ok(!!n);
  eq(n!.breeze, 'Sea breeze is on');
  eq(n!.windLine, 'Wind from the west, from the sea');
  eq(n!.strength, 'a gentle breeze');
  eq(n!.rainWord, 'no rain');
});
test('arrow points where the wind goes', () => {
  eq(arrowRotation(270), 90, 'west wind blows east');
  eq(arrowRotation(0), 180, 'north wind blows south');
});
test('rain race sums 7 days, skips missing places', () => {
  const bars = rainRace({ mum: snap('mum', 270, 5, 0, [1, 1, 1, 1, 1, 1, 1]), sohra: snap('sohra', 180, 5, 61, [20, 20, 20, 20, 20, 20, 20]) });
  eq(bars.map((b) => b.id).join(','), 'sohra,mum');
  eq(bars[0].mm, 140);
});
test('tide events find the next upcoming one', () => {
  // two semi-diurnal cycles per day, period 12.4 h
  const times: string[] = []; const heights: number[] = [];
  for (let i = 0; i < 72; i++) {
    const day = 25 + Math.floor(i / 24); const h = i % 24;
    times.push(`2026-10-${day}T${String(h).padStart(2, '0')}:00`);
    heights.push(1.2 * Math.sin((2 * Math.PI * i) / 12.4));
  }
  const tide: TideSnap = { placeId: 'hajiali', fetchedAt: '2026-10-25T00:00:00.000Z', times, heights };
  const r = tideEvents(tide, '2026-10-25T06:30:00.000Z'); // 12:00 noon IST
  ok(!!r);
  ok(r!.events.length >= 3, 'several events today');
  ok(!!r!.next && r!.next!.clock > 12, 'next is after noon');
  ok(/about \d{1,2}:\d{2} (am|pm)$/.test(r!.next!.label), r!.next!.label);
  eq(r!.curve.length, 24);
});
done();

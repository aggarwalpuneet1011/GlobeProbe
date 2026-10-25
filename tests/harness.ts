// Minimal test harness (no dependencies). Every test file ends with `done()`.
let failures = 0; let passes = 0;
const queue: { name: string; fn: () => void | Promise<void> }[] = [];
export function test(name: string, fn: () => void | Promise<void>) { queue.push({ name, fn }); }
export function ok(cond: unknown, msg: string) { if (!cond) throw new Error('assert: ' + msg); }
export function eq<T>(actual: T, expected: T, msg = '') {
  const a = JSON.stringify(actual); const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} expected ${b} but got ${a}`);
}
export function near(actual: number, expected: number, tol: number, msg = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${msg} expected ${expected} +/- ${tol} but got ${actual}`);
}
export async function done() {
  for (const t of queue) {
    try { await t.fn(); passes++; console.log('  ok   ' + t.name); }
    catch (e) { failures++; console.log('  FAIL ' + t.name + '\n       ' + (e as Error).message); }
  }
  console.log(`  ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

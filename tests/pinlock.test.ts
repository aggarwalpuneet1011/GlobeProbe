import { test, eq, ok, done } from './harness';
import { afterWrong, afterRight, freshPinState, lockedMinutes, isValidPin, LOCK_MS } from '../src/state/pinlock';

test('four wrong tries do not lock; the fifth does for 5 minutes', () => {
  let s = freshPinState(); const t = 1_000_000;
  for (let i = 0; i < 4; i++) { s = afterWrong(s, t); eq(lockedMinutes(s, t), 0, 'not locked yet'); }
  s = afterWrong(s, t);
  eq(lockedMinutes(s, t), 5, 'locked 5 min');
  eq(lockedMinutes(s, t + LOCK_MS - 1), 1, 'one minute left rounds up');
  eq(lockedMinutes(s, t + LOCK_MS), 0, 'unlocked after 5 min');
});
test('wrong tries during a lock do not extend it', () => {
  let s = freshPinState(); const t = 5;
  for (let i = 0; i < 5; i++) s = afterWrong(s, t);
  const again = afterWrong(s, t + 1000);
  eq(again.lockUntil, s.lockUntil, 'unchanged');
});
test('a right PIN clears the counter', () => {
  let s = freshPinState(); s = afterWrong(s, 1); s = afterWrong(s, 1);
  eq(afterRight().fails, 0, 'reset');
});
test('PIN must be exactly 4 digits', () => {
  ok(isValidPin('0420')); ok(!isValidPin('420')); ok(!isValidPin('42a0')); ok(!isValidPin('04201'));
});
done();

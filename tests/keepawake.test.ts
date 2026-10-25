import { test, eq, done } from './harness';
import { holdAwake } from '../src/state/keepAwake';
import { log } from './mocks/keepawake';

test('Keep-awake holds are counted: the screen is released only when the last hold ends', async () => {
  log.length = 0;
  const a = await holdAwake('gemini'); const b = await holdAwake('gemini');
  eq(log, ['on:gemini']);
  a(); a(); eq(log, ['on:gemini']);   // a second release of the same hold does nothing
  b(); eq(log, ['on:gemini', 'off:gemini']);
});
test('Different tags are independent', async () => {
  log.length = 0;
  const app = await holdAwake('app'); const g = await holdAwake('gemini');
  g(); eq(log, ['on:app', 'on:gemini', 'off:gemini']);
  app(); eq(log[log.length - 1], 'off:app');
});
done();

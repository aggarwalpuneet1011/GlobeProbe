import { test, eq, done } from './harness';
import { base64ToBytes, bytesToBase64 } from '../src/util/b64';

test('base64 known vectors', () => {
  const enc = (s: string) => bytesToBase64(new TextEncoder().encode(s));
  eq(enc(''), ''); eq(enc('f'), 'Zg=='); eq(enc('fo'), 'Zm8='); eq(enc('foo'), 'Zm9v'); eq(enc('foob'), 'Zm9vYg==');
  eq(new TextDecoder().decode(base64ToBytes('Zm9vYmE=')), 'fooba');
});
test('base64 round trip over all lengths', () => {
  for (let n = 0; n < 40; n++) {
    const b = new Uint8Array(n).map((_, i) => (i * 37 + n) & 255);
    eq(Array.from(base64ToBytes(bytesToBase64(b))), Array.from(b));
  }
});
done();

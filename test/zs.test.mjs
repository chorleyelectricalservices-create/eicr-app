import test from 'node:test';
import assert from 'node:assert/strict';
import { tableMaxZs, mcbMaxZs, MCB_RATINGS } from '../js/zs.js';

// Previous hard-coded values (kept only as a regression check that the calculation matches them).
const OLD = {
  B: [7.28, 4.37, 2.73, 2.19, 1.75, 1.37, 1.09, 0.87, 0.69, 0.55, 0.44, 0.35],
  C: [3.64, 2.19, 1.37, 1.09, 0.87, 0.68, 0.55, 0.44, 0.35, 0.27, 0.22, 0.17],
  D: [1.82, 1.09, 0.68, 0.55, 0.44, 0.34, 0.27, 0.22, 0.17, 0.14, 0.11, 0.09],
  D5: [3.64, 2.19, 1.37, 1.09, 0.87, 0.68, 0.55, 0.44, 0.35, 0.27, 0.22, 0.17],
};
test('calculated MCB max Zs match previous values for every rating', () => {
  MCB_RATINGS.forEach((r, i) => {
    for (const t of ['B', 'C', 'D']) assert.equal(mcbMaxZs(t, r), OLD[t][i], `${t}${r}`);
    assert.equal(mcbMaxZs('D', r, 5), OLD.D5[i], `D${r} 5s`);
    assert.equal(tableMaxZs('BS EN 61009', 'b', r), OLD.B[i]);
  });
});
test('formula: 0.95 x 230 / (5 x 6) = 7.28 for B6', () => assert.equal(mcbMaxZs('B', 6), 7.28));
test('unknown devices and ratings return null', () => {
  assert.equal(tableMaxZs('BS 88-3', 'gG', 32), null);
  assert.equal(tableMaxZs('60898', 'B', 7), null);
  assert.equal(tableMaxZs('60898', 'K', 16), null);
});

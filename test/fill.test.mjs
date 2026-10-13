import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFill, applyFill, isSpare } from '../js/fill.js';

const cs = () => [
  { desc: 'Lights', testV: '', bc: '6', zs: '1.1' },
  { desc: 'Sockets', testV: '250', bc: '', zs: '0.5' },
  { desc: 'Spare', testV: '', bc: '' },
  { desc: 'Cooker', testV: '', bc: '10', zs: 'LIM' },
  { desc: 'Shower', testV: '500', bc: '', remarks: 'Not tested – occupier request' },
];

test('isSpare', () => {
  const c = cs();
  assert.deepEqual(c.map(isSpare), [false, false, true, true, true]);
});
test('empty-only by default, skips spares/untested', () => {
  const p = planFill(cs(), 'testV', '500');
  assert.deepEqual(p.changes.map(x => x.index), [0]);
  assert.equal(p.fills, 1); assert.equal(p.replaces, 0); assert.equal(p.skipped, 4);
});
test('overwrite replaces existing values, unchanged equal values ignored', () => {
  const p = planFill(cs(), 'testV', '500', { overwrite: true });
  assert.deepEqual(p.changes.map(x => [x.index, x.old]), [[0, ''], [1, '250']]);
  assert.equal(p.replaces, 1);
});
test('including spares', () => {
  const p = planFill(cs(), 'bc', '6', { skipSpare: false });
  assert.deepEqual(p.changes.map(x => x.index), [1, 2, 4]);
  const o = planFill(cs(), 'bc', '6', { skipSpare: false, overwrite: true });
  assert.deepEqual(o.changes.map(x => x.index), [1, 2, 3, 4]);
});
test('row limit, blank value, remarks not skipped for spares', () => {
  assert.deepEqual(planFill(cs(), 'testV', '500', { rows: [2, 3], skipSpare: false }).changes.map(x => x.index), [2, 3]);
  assert.equal(planFill(cs(), 'testV', '  ').changes.length, 0);
  assert.equal(planFill(cs(), 'remarks', 'Spare').changes.length, 4);
});
test('applyFill writes and returns undo info', () => {
  const c = cs(); const p = planFill(c, 'testV', '500', { overwrite: true });
  const u = applyFill(c, 'testV', p);
  assert.equal(c[0].testV, '500'); assert.equal(c[1].testV, '500');
  assert.deepEqual(u, [{ index: 0, field: 'testV', old: '' }, { index: 1, field: 'testV', old: '250' }]);
  for (const x of u) c[x.index][x.field] = x.old;
  assert.equal(c[1].testV, '250');
});

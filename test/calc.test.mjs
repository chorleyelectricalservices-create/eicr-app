import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcR1R2, calcZs, boardZe, planCalcAll, markCalc } from '../js/calc.js';
import { newJob, newBoard } from '../js/model.js';

test('R1+R2 = Zs − Ze, rounded to 2dp', () => {
  assert.deepEqual(calcR1R2('0.52', '0.21'), { ok: true, value: '0.31' });
  assert.deepEqual(calcR1R2('1.125', '0.2'), { ok: true, value: '0.93' });
  assert.deepEqual(calcR1R2('0,45', '.2'), { ok: true, value: '0.25' });
});
test('guard rails', () => {
  assert.match(calcR1R2('', '0.2').error, /No Zs/);
  assert.match(calcR1R2('LIM', '0.2').error, /isn't a plain/);
  assert.match(calcR1R2('>999', '0.2').error, /isn't a plain/);
  assert.match(calcR1R2('0.5', '').error, /No Ze/);
  assert.match(calcR1R2('0.2', '0.2').error, /look wrong/);
  assert.match(calcR1R2('0.15', '0.2').error, /look wrong/);
});
test('reverse Zs = Ze + R1+R2', () => {
  assert.deepEqual(calcZs('0.31', '0.21'), { ok: true, value: '0.52' });
  assert.equal(calcZs('', '0.2').ok, false);
  assert.equal(calcZs('0.3', 'N/A').ok, false);
  assert.equal(calcZs('0', '0.2').ok, false);
});
test('board Ze: main uses supply Ze, sub-board uses Zdb else supply Ze with note', () => {
  const j = newJob(); j.supply.ze = '0.21';
  j.boards.push(Object.assign(newBoard('DB2'), { suppliedFrom: 'CU1 way 10', zdb: '0.45' }));
  j.boards.push(Object.assign(newBoard('DB3'), { suppliedFrom: 'CU1 way 11', zdb: '' }));
  assert.deepEqual(boardZe(j, 0), { value: 0.21, source: 'Ze', note: '' });
  assert.deepEqual(boardZe(j, 1), { value: 0.45, source: 'Zdb', note: '' });
  const z3 = boardZe(j, 2); assert.equal(z3.value, 0.21); assert.match(z3.note, /No Zdb recorded for DB3/);
  j.supply.ze = ''; assert.match(boardZe(j, 0).note, /not recorded/);
});
const cs = () => [
  { desc: 'Lights', zs: '1.10', r1r2: '' }, { desc: 'Sockets', zs: '0.50', r1r2: '0.25' },
  { desc: 'Spare', zs: '0.9', r1r2: '' }, { desc: 'Cooker', zs: 'LIM', r1r2: '' },
  { desc: 'Shower', zs: '', r1r2: '' }, { desc: 'Bad', zs: '0.1', r1r2: '' },
];
test('calculate all: empty only, skips spares and no-Zs, counts bad readings', () => {
  const p = planCalcAll(cs(), 0.2);
  assert.deepEqual(p.changes, [{ index: 0, old: '', value: '0.90' }]);
  assert.equal(p.skipped, 4); assert.equal(p.bad, 1);
});
test('calculate all: overwrite and include spares', () => {
  const p = planCalcAll(cs(), 0.2, { overwrite: true, skipSpare: false });
  assert.deepEqual(p.changes.map(c => [c.index, c.value]), [[0, '0.90'], [1, '0.30'], [2, '0.70']]);
  assert.equal(p.replaces, 1);
});
test('markCalc flag', () => {
  const c = {}; markCalc(c, 'r1r2', true); assert.deepEqual(c.calc, { r1r2: true }); markCalc(c, 'r1r2', false); assert.deepEqual(c.calc, {});
});

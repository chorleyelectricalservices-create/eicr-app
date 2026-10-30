import test from 'node:test';
import assert from 'node:assert/strict';
import { copySections, circuitRowTsv, sectionText, copyProgress, CIRCUIT_COLS } from '../js/copyview.js';
import { newJob, newEic, newMw, newEv, newCircuit } from '../js/model.js';
test('EICR sections follow IET order A..K then schedules', () => {
  const j = newJob(); j.client.name = 'Mrs Smith'; j.inspDates = '2026-10-30';
  const s = copySections(j);
  const ids = s.map(x => x.id);
  assert.deepEqual(ids.slice(0, 11), ['ref', 'client', 'B', 'C', 'D', 'E', 'F', 'G', 'supply', 'origin', 'K']);
  assert.ok(ids.includes('board0') && ids.at(-1) === 'instruments');
  assert.equal(s[1].fields[0].value, 'Mrs Smith');
  assert.equal(s[2].fields.find(f => f.key === 'inspDates').value, '30/10/2026');
});
test('circuit row is tab-separated in column order, sanitised', () => {
  const c = newCircuit(3, { desc: 'Ring\tkitchen', bsen: '61009', type: 'B', rating: '32', r1r2: '0.31', zs: '0.52' });
  const row = circuitRowTsv(c).split('\t');
  assert.equal(row.length, CIRCUIT_COLS.length);
  assert.equal(row[0], '3'); assert.equal(row[1], 'Ring kitchen');
  assert.equal(row[CIRCUIT_COLS.findIndex(x => x[0] === 'zs')], '0.52');
  assert.equal(row[CIRCUIT_COLS.findIndex(x => x[0] === 'maxZs')], '1.37');
});
test('all kinds build, section text and progress', () => {
  for (const f of [newEic, newMw, newEv]) assert.ok(copySections(f()).length > 4);
  const s = copySections(newEv()); assert.ok(s.some(x => x.id === 'ev'));
  const sec = { fields: [{ key: 'a', label: 'A', value: '1' }, { key: 'b', label: 'B', value: '' }] };
  assert.equal(sectionText(sec), 'A: 1');
  const p = copyProgress([sec], { a: 1 }); assert.deepEqual(p, { done: 1, total: 1 });
});

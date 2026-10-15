import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatRef, refNum, allocateRef, planRestore, isDuplicate, cleanPrefix } from '../js/refno.js';
const D = new Date(2026, 9, 15);
test('format CES-EICR-YYMM-NNNN', () => {
  assert.equal(formatRef('CES', 7, D), 'CES-EICR-2610-0007');
  assert.equal(formatRef('', 12345, D), 'CES-EICR-2610-12345');
  assert.equal(cleanPrefix(' c.e-s '), 'CES');
});
test('refNum reads old and new styles', () => { assert.equal(refNum('EICR-0003'), 3); assert.equal(refNum('CES-EICR-2610-0042'), 42); assert.equal(refNum('x'), 0); });
test('allocate never reuses: counter and existing jobs both respected', () => {
  assert.deepEqual(allocateRef({ refPrefix: 'CES', nextNumber: 5 }, [], D), { ref: 'CES-EICR-2610-0005', next: 6 });
  assert.deepEqual(allocateRef({ refPrefix: 'CES', nextNumber: 2 }, [{ id: 'a', reportNo: 'EICR-0009' }], D), { ref: 'CES-EICR-2610-0010', next: 11 });
  // deleted jobs: counter stays high
  assert.equal(allocateRef({ refPrefix: 'CES', nextNumber: 20 }, [], D).ref, 'CES-EICR-2610-0020');
});
test('duplicate check is case/space-insensitive and ignores self', () => {
  const jobs = [{ id: 'a', reportNo: 'CES-EICR-2610-0001' }];
  assert.ok(isDuplicate(' ces-eicr-2610-0001 ', jobs)); assert.ok(!isDuplicate('CES-EICR-2610-0001', jobs, 'a'));
});
test('restore bumps counter above highest and renumbers clashes only', () => {
  const existing = [{ id: 'x', reportNo: 'CES-EICR-2610-0003' }];
  const incoming = [{ id: 'a', reportNo: 'CES-EICR-2609-0001' }, { id: 'b', reportNo: 'CES-EICR-2610-0003', refLocked: true }, { id: 'x', reportNo: 'CES-EICR-2610-0003' }];
  const r = planRestore({ refPrefix: 'CES', nextNumber: 1 }, existing, incoming, D);
  assert.equal(r.jobs[0].reportNo, 'CES-EICR-2609-0001');
  assert.equal(r.jobs[1].reportNo, 'CES-EICR-2610-0004'); assert.equal(r.jobs[1].refLocked, false);
  assert.equal(r.jobs[2].reportNo, 'CES-EICR-2610-0003'); // same job id restored over itself – keeps number
  assert.equal(r.nextNumber, 5); assert.deepEqual(r.renamed, [['CES-EICR-2610-0003', 'CES-EICR-2610-0004']]);
  assert.equal(planRestore({ nextNumber: 1 }, [], [{ id: 'q', reportNo: 'EICR-0150' }], D).nextNumber, 151);
});

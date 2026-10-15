import test from 'node:test';
import assert from 'node:assert/strict';
import { newEic, newMw, newJob } from '../js/model.js';
import { kindOf, kindMeta } from '../js/kinds.js';
import { validateJob } from '../js/validate.js';
import { formatRef } from '../js/refno.js';
test('kinds', () => {
  assert.equal(kindOf(newEic()), 'eic'); assert.equal(kindOf(newMw()), 'mw'); assert.equal(kindOf({}), 'eicr');
  assert.equal(kindMeta(newMw()).maxCircuits, 4);
});
test('EIC/MW validation skips EICR-only checks', () => {
  for (const j of [newEic(), newMw()]) {
    const v = validateJob(j);
    assert.ok(!v.some(i => /Reason for producing|Authoriser|Schedule of inspection|K Observations/.test(i.section + i.msg)));
  }
  assert.ok(validateJob(newJob()).some(i => /Reason for producing/.test(i.msg)));
});
test('MW >4 circuits flagged', () => {
  const j = newMw(); const c = j.boards[0].circuits[0];
  j.boards[0].circuits = [c, c, c, c, c];
  assert.ok(validateJob(j).some(i => /up to 4 circuits/.test(i.msg)));
});
test('ref kind code', () => { assert.match(formatRef('CES', 7, new Date(2026, 9, 1), 'EIC'), /^CES-EIC-2610-0007$/); });

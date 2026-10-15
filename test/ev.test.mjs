import test from 'node:test';
import assert from 'node:assert/strict';
import { newEv } from '../js/model.js';
import { kindOf, isEicLike, refCode } from '../js/kinds.js';
import { evPmeRisk } from '../js/presets.js';
import { validateJob } from '../js/validate.js';
import { formatRef, planRestore } from '../js/refno.js';
test('EV kind basics', () => {
  const j = newEv(); assert.equal(kindOf(j), 'ev'); assert.ok(isEicLike(j)); assert.equal(refCode('ev'), 'EV');
  assert.equal(j.boards[0].circuits.length, 1); assert.equal(j.ev.connector, 'Type 2');
  assert.equal(formatRef('CES', 12, new Date(2026, 9, 1), 'EV'), 'CES-EV-2610-0012');
});
test('PME without open-PEN method flagged', () => {
  const j = newEv(); j.supply.earthing = 'TN-C-S (PME)';
  assert.ok(evPmeRisk(j)); assert.ok(validateJob(j).some(i => /open-PEN/.test(i.msg) && i.level === 'error'));
  j.ev.pmeMethod = '722.411.4.1(c) – open-PEN device, 70 V CPC-to-Earth (incl. built into charger)';
  assert.ok(!evPmeRisk(j));
  j.supply.earthing = 'TN-S'; j.ev.pmeMethod = ''; assert.ok(!evPmeRisk(j));
});
test('TT needs Ra; demand over fuse without load mgmt', () => {
  const j = newEv(); j.supply.earthing = 'TT'; j.ev.pmeMethod = 'TT – charger earthed to dedicated electrode, not PME (separated)';
  assert.ok(validateJob(j).some(i => /Ra missing/.test(i.msg)));
  j.ev.maxDemandA = '110'; j.ev.supplyFuseA = '100';
  assert.ok(validateJob(j).some(i => /exceeds supply fuse/.test(i.msg)));
  j.ev.loadMgmt = 'CT clamp dynamic load management';
  assert.ok(!validateJob(j).some(i => /exceeds supply fuse/.test(i.msg)));
});

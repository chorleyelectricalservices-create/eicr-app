import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestItems, recalcSchedule, setItemOutcome, mostSevere, migrate, linkedObs } from '../js/links.js';
import { OBS_LIBRARY, INSPECTION_ITEMS } from '../js/presets.js';
import { newJob } from '../js/model.js';
import { sampleJob, sampleSettings } from '../js/sample.js';
import { validateJob } from '../js/validate.js';

const S = (d, r) => suggestItems(d, r)[0];
test('keyword mapping to schedule items', () => {
  assert.equal(S('No main protective bonding to gas'), '3.7');
  assert.equal(S('Main bonding to water is only 6mm² – undersized'), '3.6');
  assert.equal(S('Socket-outlets have no RCD protection'), '5.12');
  assert.equal(S('Cracked socket front plate in bedroom 2'), '5.18');
  assert.equal(S('Damaged light switch'), '5.18');
  assert.equal(S('No SPD fitted'), '4.19');
  assert.equal(S('No surge protection'), '4.19');
  assert.equal(S('Circuit chart missing'), '4.9');
  assert.equal(S('Inadequate labelling at consumer unit'), '4.9');
  assert.equal(S('No RCD six-monthly test notice'), '4.10');
  assert.equal(S('Earth and bonding warning labels missing'), '3.3');
  assert.equal(S('Bathroom lighting circuit not RCD protected'), '6.1');
  assert.equal(S('Plastic consumer unit under stairs, not non-combustible'), '4.4');
  assert.equal(S('Missing blanks leaving openings in CU'), '4.3');
  assert.equal(S('Scorch marks and overheating at main switch terminals'), '4.13');
  assert.equal(S('Signs of overheating at neutral bar'), '4.13');
  assert.equal(S('Metal light fitting has no cpc'), '5.8');
  assert.equal(S('Circuit protective conductor not connected'), '5.8');
  assert.equal(S('Cables in escape route not supported against collapse'), '5.2');
  assert.equal(S('Solar PV inverter has no isolator label'), '2.0');
  assert.equal(S('Meter tails not clipped'), '1.3');
  assert.equal(S('Damaged service head'), '1.1b');
  assert.equal(S('No AFDD indication'), '4.23');
  assert.equal(S('Loose termination at socket'), '4.20');
  assert.equal(S('Earth electrode connection corroded'), '3.2');
  assert.equal(S('Something odd', '514.12.2'), '4.10');
  assert.deepEqual(suggestItems(''), []);
});

test('every library preset carries a valid default link', () => {
  const ids = new Set(INSPECTION_ITEMS.map(i => i.id));
  for (const o of OBS_LIBRARY) { assert.ok(Array.isArray(o.items), o.desc); o.items.forEach(i => assert.ok(ids.has(i), i)); }
  assert.ok(OBS_LIBRARY.filter(o => o.items.length).length >= 20);
});

test('most severe code: C1 > C2 > FI > C3', () => {
  assert.equal(mostSevere(['C3', 'FI']), 'FI');
  assert.equal(mostSevere(['C3', 'C2', 'FI']), 'C2');
  assert.equal(mostSevere(['C2', 'C1']), 'C1');
  assert.equal(mostSevere(['C3']), 'C3');
  assert.equal(mostSevere(['C2', 'FI'], 'A2:2022'), 'C2');
  assert.equal(mostSevere([]), '');
});

const job = () => { const j = newJob(); j.inspection['3.7'] = { o: '✓' }; return j; };

test('linking sets the outcome, unlinking restores the previous one', () => {
  const j = job();
  j.observations.push({ id: 'a', code: 'C2', items: ['3.7'] });
  recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, 'C2');
  j.observations[0].items = [];
  recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, '✓');
  assert.equal(j.inspection['3.7'].linked, undefined);
});

test('several observations: most severe wins; code change and delete recalc', () => {
  const j = job();
  j.observations.push({ id: 'a', code: 'C3', items: ['3.7'] }, { id: 'b', code: 'FI', items: ['3.7', '5.18'] });
  recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, 'FI');
  assert.equal(j.inspection['5.18'].o, 'FI');
  j.observations[0].code = 'C1'; recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, 'C1');
  j.observations.splice(0, 1); recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, 'FI');
  j.observations.splice(0, 1); recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, '✓');
  assert.equal(j.inspection['5.18'].o, '');
});

test('observation without a code does not change the item', () => {
  const j = job();
  j.observations.push({ id: 'a', code: '', items: ['3.7'] });
  recalcSchedule(j);
  assert.equal(j.inspection['3.7'].o, '✓');
});

test('manual change on a linked item', () => {
  const j = job();
  j.observations.push({ id: 'a', code: 'C3', items: ['3.7'] });
  recalcSchedule(j);
  setItemOutcome(j, '3.7', 'C2', 'updateObs');
  assert.equal(j.observations[0].code, 'C2'); assert.equal(j.inspection['3.7'].o, 'C2');
  setItemOutcome(j, '3.7', 'C1', 'keep');
  assert.equal(j.observations[0].code, 'C2'); assert.equal(j.inspection['3.7'].o, 'C2');
  setItemOutcome(j, '3.7', 'N/A', 'unlink');
  assert.deepEqual(j.observations[0].items, []); assert.equal(j.inspection['3.7'].o, 'N/A');
  assert.equal(linkedObs(j, '3.7').length, 0);
  setItemOutcome(j, '3.7', '✓');
  assert.equal(j.inspection['3.7'].o, '✓');
});

test('recalc is idempotent and migrate converts old schedRef', () => {
  const j = job();
  j.observations.push({ id: 'a', code: 'C2', schedRef: '3.7' });
  migrate(j); recalcSchedule(j); recalcSchedule(j);
  assert.deepEqual(j.observations[0].items, ['3.7']);
  assert.equal(j.inspection['3.7'].o, 'C2'); assert.equal(j.inspection['3.7'].prev, '✓');
});

test('validation: unlinked observation and coded item without observation', () => {
  const s = sampleSettings(); s.inspector.signature = 'data:image/png;base64,x';
  const j = sampleJob(s);
  assert.equal(j.inspection['3.7'].o, 'C2');
  assert.ok(!validateJob(j, s).some(i => /not linked|no observation is linked/.test(i.msg)));
  j.observations[1].items = []; recalcSchedule(j);
  j.inspection['6.1'] = { o: 'C3' };
  const msgs = validateJob(j, s).map(i => i.msg).join('\n');
  assert.match(msgs, /Observation 2: not linked/);
  assert.match(msgs, /Item 6.1 is coded C3 but no observation is linked/);
});

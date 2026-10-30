import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDomestic, parseRules, matchRule, markTyp, DEFAULT_RULES_TEXT } from '../js/domestic.js';
const R = parseRules(DEFAULT_RULES_TEXT);
const m = (desc, rating) => { const r = matchRule({ desc, rating }, R); return r && `${r.live}/${r.cpc}`; };

test('typical UK domestic sizes', () => {
  assert.equal(m('Downstairs lights', '6'), '1.0/1.0');
  assert.equal(m('Smoke alarms', '6'), '1.0/1.0');
  assert.equal(m('Ring final sockets', '32'), '2.5/1.5');
  assert.equal(m('Sockets', '32'), '2.5/1.5');
  assert.equal(m('Kitchen radial', '20'), '2.5/1.5');
  assert.equal(m('Garage radial', '32'), '4.0/1.5');
  assert.equal(m('Cooker', '32'), '6.0/2.5');
  assert.equal(m('Cooker', '45'), '10/4.0');
  assert.equal(m('Electric shower', '40'), '10/4.0');
  assert.equal(m('Shower', '32'), '10/4.0');
  assert.equal(m('Shower', '45'), '10/4.0');
  assert.equal(m('Immersion heater', '16'), '2.5/1.5');
  assert.equal(m('Boiler', '6'), '1.5/1.0');
  assert.equal(m('FCU', '16'), '2.5/1.5');
});
test('unknown / mismatched rating / no rating -> no guess', () => {
  assert.equal(m('Garden pond pump', '16'), null);
  assert.equal(m('Lights', '32'), null);
  assert.equal(m('Lights', ''), null);
  assert.equal(m('', '6'), null);
});
test('empty cells only, spares skipped, wiring mismatch skipped, ref method C', () => {
  const cs = [{ desc: 'Lights', rating: '6' }, { desc: 'Ring', rating: '32', live: '4.0', wiring: 'A' }, { desc: 'Spare', rating: '32' }, { desc: 'Lights', rating: '6', wiring: 'H' }, { desc: 'Pond', rating: '16' }];
  const { plan, unknown, spare } = planDomestic(cs);
  assert.deepEqual(plan, [{ index: 0, set: { wiring: 'A', refMethod: 'C', live: '1.0', cpc: '1.0' } }, { index: 1, set: { refMethod: 'C', cpc: '1.5' } }]);
  assert.equal(spare, 1); assert.equal(unknown, 2);
  assert.deepEqual(planDomestic(cs, DEFAULT_RULES_TEXT, [1]).plan.map(p => p.index), [1]);
});
test('custom rules from Settings', () => {
  const txt = '# my rules\nlight | 6 | 1.5/1.0 | A | 102\nhot tub | 32 | 6.0/2.5 | F | D';
  const { plan } = planDomestic([{ desc: 'lights', rating: '6' }, { desc: 'Hot tub', rating: '32' }], txt);
  assert.deepEqual(plan[0].set, { wiring: 'A', refMethod: '102', live: '1.5', cpc: '1.0' });
  assert.deepEqual(plan[1].set, { wiring: 'F', refMethod: 'D', live: '6.0', cpc: '2.5' });
});
test('typ marking', () => { const c = {}; markTyp(c, 'live', true); assert.deepEqual(c.typ, { live: true }); markTyp(c, 'live', false); assert.deepEqual(c.typ, {}); });

import { migrateRules, OLD_DEFAULT_RULES_TEXT, DEFAULT_RULES_TEXT as NEWDEF } from '../js/domestic.js';
test('migrate saved rules: old shower lines upgraded, custom kept', () => {
  assert.equal(migrateRules(null), null);
  assert.equal(migrateRules(OLD_DEFAULT_RULES_TEXT), null);
  const edited = OLD_DEFAULT_RULES_TEXT.replace('ring | 32 | 2.5/1.5', 'ring | 32 | 4.0/1.5');
  const out = migrateRules(edited);
  assert.ok(out.includes('shower | 6-63 | 10/4.0 | A | C') && !out.includes('shower | 32 | 6.0/2.5') && out.includes('ring | 32 | 4.0/1.5'));
  const custom = OLD_DEFAULT_RULES_TEXT.replace('shower | 32 | 6.0/2.5', 'shower | 32 | 6.0/1.5');
  assert.equal(migrateRules(custom), custom);
  assert.ok(NEWDEF.includes('shower | 6-63 | 10/4.0'));
});

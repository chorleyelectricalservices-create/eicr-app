import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableMaxZs, zsLimit } from '../js/zs.js';
import { overallAssessment, checkCircuit, validateJob, parseReading, sortObservations, circuitMaxZs } from '../js/validate.js';
import { sampleJob, sampleSettings } from '../js/sample.js';
import { newJob, newCircuit, addYears } from '../js/model.js';

const SIG = 'data:image/png;base64,iVBORw0KGgo=';
const ready = () => { const s = sampleSettings(); s.inspector.signature = SIG; return { s, j: sampleJob(s) }; };

test('max Zs tables for MCB/RCBO B/C/D', () => {
  assert.equal(tableMaxZs('BS EN 60898', 'B', 32), 1.37);
  assert.equal(tableMaxZs('61009', 'B', 6), 7.28);
  assert.equal(tableMaxZs('60898', 'C', 16), 1.37);
  assert.equal(tableMaxZs('60898', 'D', 20), 0.55);
  assert.equal(tableMaxZs('60898', 'D', 20, 5), 1.09);
  assert.equal(tableMaxZs('3036', '', 30), null);
  assert.equal(zsLimit(1.37, true), 1.1);
  assert.equal(zsLimit(1.37, false), 1.37);
});

test('parseReading handles >, LIM and decimals with commas', () => {
  assert.deepEqual(parseReading('>999'), { n: 999, gt: true, lt: false });
  assert.equal(parseReading('0,45').n, 0.45);
  assert.equal(parseReading('LIM').n, null);
  assert.ok(parseReading('').empty);
});

test('A4:2026 – C1/C2 make report unsatisfactory, C3/FI do not', () => {
  const j = newJob();
  assert.equal(overallAssessment(j), 'SATISFACTORY');
  j.observations = [{ code: 'C3' }, { code: 'FI' }];
  assert.equal(overallAssessment(j), 'SATISFACTORY');
  j.observations.push({ code: 'C2' });
  assert.equal(overallAssessment(j), 'UNSATISFACTORY');
  j.observations = [{ code: 'C1' }];
  assert.equal(overallAssessment(j), 'UNSATISFACTORY');
});

test('legacy A2:2022+A3 edition – FI makes report unsatisfactory', () => {
  const j = newJob(); j.edition = 'A2:2022';
  j.observations = [{ code: 'FI' }];
  assert.equal(overallAssessment(j), 'UNSATISFACTORY');
  j.observations = [{ code: 'C3' }];
  assert.equal(overallAssessment(j), 'SATISFACTORY');
});

test('observations sort C1, C2, C3, FI', () => {
  const s = sortObservations([{ code: 'FI' }, { code: 'C3' }, { code: 'C1' }, { code: 'C2' }]);
  assert.deepEqual(s.map(x => x.code), ['C1', 'C2', 'C3', 'FI']);
});

const good = () => newCircuit(1, { desc: 'Ring', bsen: '61009', type: 'B', rating: '32', live: '2.5', cpc: '1.5', zs: '0.5', r1r2: '0.3', irLE: '>999', irLL: '>999', polarity: '✓', rcdType: 'A', idn: '30', rcdTime: '20', rcdBtn: '✓' });

test('good circuit passes', () => {
  assert.deepEqual(checkCircuit(good(), null, { ruleOfThumb: true, ze: 0.2 }).filter(x => x.level === 'error'), []);
});

test('Zs above tabulated max is an error', () => {
  const c = { ...good(), zs: '1.50' };
  const e = checkCircuit(c, null, { ruleOfThumb: false });
  assert.ok(e.some(x => x.level === 'error' && x.field === 'zs' && /exceeds max/.test(x.msg)));
});

test('0.8 rule of thumb flags Zs between 80% and 100% of max', () => {
  const c = { ...good(), zs: '1.20' };
  assert.ok(checkCircuit(c, null, { ruleOfThumb: true }).some(x => x.level === 'error' && /0.8/.test(x.msg)));
  assert.ok(!checkCircuit(c, null, { ruleOfThumb: false }).some(x => x.level === 'error' && x.field === 'zs'));
  assert.ok(checkCircuit(c, null, { ruleOfThumb: false }).some(x => x.level === 'warn' && x.field === 'zs'));
});

test('manual max Zs overrides table', () => {
  const c = { ...good(), bsen: 'BS 3036', type: '', maxZs: '1.04', maxZsManual: true };
  assert.equal(circuitMaxZs(c), 1.04);
  const unknown = { ...good(), bsen: 'BS 3036', type: '' };
  assert.ok(checkCircuit(unknown, null, {}).some(x => x.field === 'maxZs'));
});

test('insulation resistance below 1 MΩ is an error, under 2 is a warning', () => {
  assert.ok(checkCircuit({ ...good(), irLE: '0.8' }, null, {}).some(x => x.level === 'error' && x.field === 'irLE'));
  assert.ok(checkCircuit({ ...good(), irLE: '1.5' }, null, {}).some(x => x.level === 'warn' && x.field === 'irLE'));
  assert.ok(!checkCircuit({ ...good(), irLE: '>2' }, null, {}).some(x => x.field === 'irLE'));
});

test('RCD trip time limits: 300 ms at IΔn, 40 ms at 5×, no-trip', () => {
  assert.ok(checkCircuit({ ...good(), rcdTime: '310' }, null, {}).some(x => x.level === 'error' && x.field === 'rcdTime'));
  assert.ok(!checkCircuit({ ...good(), rcdTime: '299' }, null, {}).some(x => x.field === 'rcdTime'));
  assert.ok(checkCircuit({ ...good(), rcd5x: '45' }, null, {}).some(x => x.field === 'rcd5x'));
  assert.ok(checkCircuit({ ...good(), rcdTime: '>300' }, null, {}).some(x => x.level === 'error' && /did not trip/.test(x.msg)));
  assert.ok(!checkCircuit({ ...good(), rcdType: 'S', rcdTime: '400' }, null, {}).some(x => x.level === 'error' && x.field === 'rcdTime'));
});

test('missing required circuit readings are errors; LIM suppresses them', () => {
  const c = { ...good(), zs: '', irLE: '', polarity: '', rcdTime: '', r1r2: '' };
  const f = checkCircuit(c, null, {}).filter(x => x.level === 'error').map(x => x.field);
  for (const k of ['zs', 'irLE', 'polarity', 'rcdTime', 'r1r2']) assert.ok(f.includes(k), k);
  const lim = { ...c, zs: 'LIM' };
  assert.deepEqual(checkCircuit(lim, null, {}).filter(x => x.level === 'error'), []);
});

test('ring final circuit cross-checks', () => {
  const c = { ...good(), ring: true, r1: '0.50', rn: '0.60', r2: '0.83', r1r2: '0.50' };
  const w = checkCircuit(c, null, {});
  assert.ok(w.some(x => x.field === 'rn'));
  assert.ok(w.some(x => x.field === 'r1r2'));
});

test('sample job validates cleanly once signed, and is UNSATISFACTORY (C2)', () => {
  const { s, j } = ready();
  const errs = validateJob(j, s).filter(i => i.level === 'error');
  assert.deepEqual(errs, []);
  assert.equal(overallAssessment(j), 'UNSATISFACTORY');
});

test('validateJob lists missing fields on an empty job', () => {
  const j = newJob();
  const msgs = validateJob(j, {}).map(i => i.msg).join('\n');
  for (const m of ['Name of person ordering', 'Installation address', 'Earthing arrangement', 'Ze', 'Inspector signature', 'No circuits recorded', 'General condition'])
    assert.match(msgs, new RegExp(m));
});

test('validateJob flags failing test results and missing C1/C2', () => {
  const { s, j } = ready();
  j.observations = j.observations.filter(o => o.code !== 'C2');
  j.boards[0].circuits[2].zs = '2.5';
  const issues = validateJob(j, s);
  assert.ok(issues.some(i => i.level === 'error' && /exceeds max/.test(i.msg)));
  assert.ok(issues.some(i => /no C1\/C2 observation/.test(i.msg)));
  assert.ok(issues.some(i => /not linked to a schedule|coded C2 but no observation is linked/.test(i.msg)));
});

test('next inspection date must be after inspection; addYears', () => {
  assert.equal(addYears('2026-10-13', 5), '2031-10-13');
  const { s, j } = ready();
  j.next.date = '2026-01-01';
  assert.ok(validateJob(j, s).some(i => /must be after/.test(i.msg)));
});

test('duplicate circuit numbers flagged', () => {
  const { s, j } = ready();
  j.boards[0].circuits[1].no = '1';
  assert.ok(validateJob(j, s).some(i => /Duplicate circuit number 1/.test(i.msg)));
});

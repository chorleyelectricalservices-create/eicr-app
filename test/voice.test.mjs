import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDictation, wordsToNumbers, matchCircuit } from '../js/voice.js';

const CS = [
  { no: '1', desc: 'Electric shower' }, { no: '2', desc: 'Cooker' },
  { no: '3', desc: 'Sockets – downstairs ring', ring: true }, { no: '4', desc: 'Sockets – upstairs ring', ring: true },
  { no: '5', desc: 'Kitchen sockets ring', ring: true }, { no: '6', desc: 'Immersion heater' },
  { no: '7', desc: 'Lighting – downstairs' }, { no: '8', desc: 'Lighting – upstairs' },
  { no: '9', desc: 'Smoke/heat alarms' }, { no: '10', desc: 'Boiler / heating controls' },
];
const P = (t, ctx = {}) => parseDictation(t, { circuits: CS, ...ctx });
const U = r => r.updates.map(u => [u.scope === 'supply' ? 'supply' : CS[u.index].no, u.field, u.value]);

test('number words', () => {
  assert.equal(wordsToNumbers('nought point four two'), '0.42');
  assert.equal(wordsToNumbers('zero point four two'), '0.42');
  assert.equal(wordsToNumbers('oh point eight five'), '0.85');
  assert.equal(wordsToNumbers('point four two'), '0.42');
  assert.equal(wordsToNumbers('twenty two'), '22');
  assert.equal(wordsToNumbers('nine hundred and ninety nine'), '999');
  assert.equal(wordsToNumbers('nine nine nine'), '999');
  assert.equal(wordsToNumbers('five hundred'), '500');
  assert.equal(wordsToNumbers('one point two'), '1.2');
  assert.equal(wordsToNumbers('ok so'), 'ok so');
});

test('the headline example: several results in one phrase', () => {
  assert.deepEqual(U(P('circuit 3 Zs 0.42 IR greater than 999 RCD 22 milliseconds')),
    [['3', 'zs', '0.42'], ['3', 'irLL', '>999'], ['3', 'irLE', '>999'], ['3', 'rcdTime', '22']]);
});

test('spoken decimals and circuit forms', () => {
  assert.deepEqual(U(P('circuit three Zs nought point four two')), [['3', 'zs', '0.42']]);
  assert.deepEqual(U(P('C7 zs zero point eight')), [['7', 'zs', '0.8']]);
  assert.deepEqual(U(P('way 10 loop impedance point nine five')), [['10', 'zs', '0.95']]);
  assert.deepEqual(U(P('circuit number 2 earth loop 0,41 ohms')), [['2', 'zs', '0.41']]);
  assert.deepEqual(U(P('Circuit 7, Zs 1.12 ohms. R1 + R2 0.89.')), [['7', 'zs', '1.12'], ['7', 'r1r2', '0.89']]);
});

test('match by description, incl. fuzzy and synonyms', () => {
  assert.deepEqual(U(P('kitchen sockets zs nought point four nine')), [['5', 'zs', '0.49']]);
  assert.deepEqual(U(P('upstairs lights Zs oh point eight five')), [['8', 'zs', '0.85']]);
  assert.deepEqual(U(P('cooker R1 plus R2 0.2')), [['2', 'r1r2', '0.2']]);
  assert.deepEqual(U(P('shower zs zero point three three')), [['1', 'zs', '0.33']]);
  assert.deepEqual(U(P('IR reading for the immersion is over 200')), [['6', 'irLL', '>200'], ['6', 'irLE', '>200']]);
  assert.deepEqual(U(P('smoke alarms rcd 26')), [['9', 'rcdTime', '26']]);
  assert.deepEqual(U(P('Zs for the oven is 0.41')), [['2', 'zs', '0.41']]);
});

test('ambiguous description asks which circuit', () => {
  const r = P('IR reading for sockets is greater than 999');
  assert.equal(r.updates.length, 0);
  assert.equal(r.questions.length, 1);
  assert.deepEqual(r.questions[0].candidates.map(i => CS[i].no), ['3', '4', '5']);
  assert.deepEqual(r.questions[0].updates.map(u => [u.field, u.value]), [['irLL', '>999'], ['irLE', '>999']]);
  const l = P('lights zs 1.1');
  assert.deepEqual(l.questions[0].candidates.map(i => CS[i].no), ['7', '8']);
});

test('no circuit given asks, unless context has one', () => {
  assert.equal(P('zs 0.4').questions.length, 1);
  assert.deepEqual(U(P('zs 0.4', { lastIndex: 3 })), [['4', 'zs', '0.4']]);
});

test('insulation resistance variants', () => {
  assert.deepEqual(U(P('way 1 live live 200 live earth infinity test voltage 500')), [['1', 'irLL', '200'], ['1', 'irLE', '>999'], ['1', 'testV', '500']]);
  assert.deepEqual(U(P('circuit 4 insulation resistance L-E 150 megohms')), [['4', 'irLE', '150']]);
  assert.deepEqual(U(P('circuit 4 IR live to earth more than 200 L L more than 200')), [['4', 'irLE', '>200'], ['4', 'irLL', '>200']]);
  assert.deepEqual(U(P('circuit 6 IR both out of range')), [['6', 'irLL', '>999'], ['6', 'irLE', '>999']]);
  assert.deepEqual(U(P('circuit 6 insulation max')), [['6', 'irLL', '>999'], ['6', 'irLE', '>999']]);
});

test('ring end-to-end and R2', () => {
  assert.deepEqual(U(P('C4 r1 0.56 rn 0.56 r2 0.92 R1 plus R2 0.37')), [['4', 'r1', '0.56'], ['4', 'rn', '0.56'], ['4', 'r2', '0.92'], ['4', 'r1r2', '0.37']]);
  assert.deepEqual(U(P('cooker r2 point one five')), [['2', 'R2', '0.15']]);
  assert.deepEqual(U(P('circuit 3 r one nought point four eight r n nought point four seven')), [['3', 'r1', '0.48'], ['3', 'rn', '0.47']]);
});

test('RCD times, 5x and test buttons', () => {
  assert.deepEqual(U(P('circuit 2 rcd at five times 12 ms test button ok')), [['2', 'rcd5x', '12'], ['2', 'rcdBtn', '✓']]);
  assert.deepEqual(U(P('circuit 2 trip time twenty two milliseconds x5 nine')), [['2', 'rcdTime', '22'], ['2', 'rcd5x', '9']]);
  assert.deepEqual(U(P('circuit 2 rcd trip time 18 rcd test button OK afdd n/a')), [['2', 'rcdTime', '18'], ['2', 'rcdBtn', '✓'], ['2', 'afddBtn', 'N/A']]);
  assert.deepEqual(U(P('circuit 4 rcd lim')), [['4', 'rcdTime', 'LIM']]);
  assert.deepEqual(U(P('circuit 4 rcd did not trip greater than 300')), [['4', 'rcdTime', '>300']]);
});

test('polarity and points', () => {
  assert.deepEqual(U(P('C5 polarity correct points 10')), [['5', 'polarity', '✓'], ['5', 'points', '10']]);
  assert.deepEqual(U(P('circuit 8 polarity')), [['8', 'polarity', '✓']]);
  assert.deepEqual(U(P('circuit 8 polarity reversed')), [['8', 'polarity', 'X']]);
  assert.deepEqual(U(P('circuit 7 number of points nine')), [['7', 'points', '9']]);
});

test('all circuits', () => {
  const r = P('all circuits polarity OK');
  assert.equal(r.updates.length, CS.length);
  assert.ok(r.updates.every(u => u.field === 'polarity' && u.value === '✓' && u.all));
  const ir = P('all IR greater than 999');
  assert.equal(ir.updates.length, CS.length * 2);
  assert.ok(ir.updates.every(u => u.value === '>999'));
  assert.equal(P('every circuit test voltage 500').updates.length, CS.length);
});

test('supply: Ze and Ipf', () => {
  assert.deepEqual(U(P('Ze 0.21 Ipf 1.6 kA')), [['supply', 'ze', '0.21'], ['supply', 'ipf', '1.6']]);
  assert.deepEqual(U(P('zed e nought point three five prospective fault current one point two kiloamps')), [['supply', 'ze', '0.35'], ['supply', 'ipf', '1.2']]);
  assert.deepEqual(U(P('PFC 2.4')), [['supply', 'ipf', '2.4']]);
});

test('switching circuit mid-phrase and context carries', () => {
  const r = P('circuit 1 zs 0.33 circuit 2 zs 0.41 rcd 24');
  assert.deepEqual(U(r), [['1', 'zs', '0.33'], ['2', 'zs', '0.41'], ['2', 'rcdTime', '24']]);
  assert.equal(r.lastIndex, 1);
  assert.deepEqual(U(P('kitchen sockets zs 0.49 upstairs lights zs 1.3')), [['5', 'zs', '0.49'], ['8', 'zs', '1.3']]);
});

test('junk and errors reported, not applied', () => {
  const r = P('circuit 42 zs 0.3');
  assert.ok(r.notes.some(n => /No circuit 42/.test(n)));
  const n = P('circuit 3 zs');
  assert.equal(n.updates.length, 0); assert.ok(n.notes.some(x => /No value/.test(x)));
  const p = P('circuit 3 polarity 0.5');
  assert.equal(p.updates.length, 0);
  assert.equal(P('hello there').updates.length, 0);
});

test('matchCircuit', () => {
  assert.deepEqual(matchCircuit(['kitchen'], CS), { index: 4 });
  assert.equal(matchCircuit(['garden'], CS), null);
});

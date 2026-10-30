import test from 'node:test';
import assert from 'node:assert/strict';
import { guessCategory, computeDemand, demandRows, supplyLimit } from '../js/maxdemand.js';
import { newJob, newBoard, newCircuit } from '../js/model.js';
const C = (desc, rating) => newCircuit(1, { desc, rating: String(rating) });
test('category guesses', () => {
  assert.equal(guessCategory(C('Upstairs lights', 6)), 'lighting');
  assert.equal(guessCategory(C('Ring final kitchen', 32)), 'sockets');
  assert.equal(guessCategory(C('Cooker', 32)), 'cooker');
  assert.equal(guessCategory(C('Electric shower', 40)), 'instant');
  assert.equal(guessCategory(C('Immersion heater', 16)), 'storageWH');
  assert.equal(guessCategory(C('EV charger', 32)), 'ev');
  assert.equal(guessCategory(C('Spare', 32)), 'exclude');
  assert.equal(guessCategory(C('Sub-main to garage', 32)), 'submainFull');
});
test('typical house estimate', () => {
  const rows = [['lighting', 6], ['lighting', 6], ['sockets', 32], ['sockets', 32], ['sockets', 20], ['cooker', 32], ['instant', 40], ['storageWH', 16]]
    .map(([cat, rating], i) => ({ key: i, cat, rating: String(rating) }));
  const r = computeDemand(rows);
  assert.equal(r.rawA, 184);
  // light 7.92 + skt 32+12.8+8 + cooker 10+6.6 + shower 40 + imm 16 = 133.32
  assert.equal(r.est, 133.32); assert.equal(r.estA, 134);
});
test('sub-main to recorded board excluded, its circuits counted; supply limit', () => {
  const j = newJob(); j.boards = [newBoard('CU1'), newBoard('DB2')];
  j.boards[0].circuits = [C('Sub-main to DB2', 40), C('Lights', 6)];
  j.boards[1].circuits = [C('Garage sockets', 20)];
  const rows = demandRows(j); assert.equal(rows[0].cat, 'submain');
  const r = computeDemand(rows); assert.equal(r.rawA, 26); assert.equal(r.estA, Math.ceil(3.96 + 20));
  j.supply.deviceRating = '60'; assert.equal(supplyLimit(j), 60);
});
test('cooker with socket and heat/power groups', () => {
  const r = computeDemand([{ key: 1, cat: 'cookerSkt', rating: '45' }, { key: 2, cat: 'heatPower', rating: '16' }, { key: 3, cat: 'heatPower', rating: '6' }, { key: 4, cat: 'evManaged', rating: '32' }]);
  // cooker 10 + 0.3*35 + 5 = 25.5 ; heat 10 + 0.5*12 = 16 ; managed EV 0
  assert.equal(r.est, 41.5);
});

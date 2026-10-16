import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenPostcode, spokenNumber, spokenPhone, spokenEmail, formatPostcode, normaliseForField, fieldKind } from '../js/fieldvoice.js';
test('postcodes', () => {
  assert.equal(spokenPostcode('P R seven one A B'), 'PR7 1AB');
  assert.equal(spokenPostcode('papa romeo seven one alpha bravo'), 'PR7 1AB');
  assert.equal(spokenPostcode('S W one A one A A'), 'SW1A 1AA');
  assert.equal(spokenPostcode('M double one one A A'), 'M11 1AA');
  assert.equal(formatPostcode('pr71ab'), 'PR7 1AB'); assert.equal(formatPostcode('hello'), '');
});
test('numbers', () => {
  assert.equal(spokenNumber('nought point four two'), '0.42');
  assert.equal(spokenNumber('greater than 999 megohms'), '>999');
  assert.equal(spokenNumber('thirty two amps'), '32');
  assert.equal(spokenNumber('point eight ohms'), '0.8');
});
test('phone & email', () => {
  assert.equal(spokenPhone('oh one two five seven double four five six seven eight'), '01257 445678');
  assert.equal(spokenPhone('oh seven seven double oh nine double oh one two three'), '07700 900123');
  assert.equal(spokenPhone('plus four four seven seven double oh nine double oh one two three'), '07700 900123');
  assert.equal(spokenEmail('tom dot daniels at gmail dot com'), 'tom.daniels@gmail.com');
  assert.equal(spokenEmail('info at chorley electrical dot co dot uk'), 'info@chorleyelectrical.co.uk');
});
test('field kind + text', () => {
  assert.equal(fieldKind({ dataset: { p: 'client.postcode' }, type: 'text' }), 'postcode');
  assert.equal(fieldKind({ dataset: { p: 'contractor.email' }, type: 'text' }), 'email');
  assert.equal(fieldKind({ dataset: { p: 'contractor.phone' }, type: 'text' }), 'phone');
  assert.equal(fieldKind({ dataset: {}, type: 'text', inputMode: 'decimal' }), 'number');
  assert.equal(normaliseForField('text', '12 high street comma chorley pr7 1ab'), '12 high street, chorley PR7 1AB'.replace(/^./, '1'));
});

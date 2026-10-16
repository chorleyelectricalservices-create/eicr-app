import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupPostcode, parseProvider, formatAddress, providerUrl } from '../js/address.js';
const resp = (status, j) => Promise.resolve({ status, json: async () => j });
const pio = { status: 200, result: { postcode: 'PR7 1AB', admin_district: 'Chorley', admin_county: 'Lancashire', region: 'North West', country: 'England' } };
test('no key: validates + town/county only', async () => {
  const r = await lookupPostcode('pr71ab', { fetchFn: () => resp(200, pio) });
  assert.ok(r.ok); assert.equal(r.postcode, 'PR7 1AB'); assert.equal(r.info.town, 'Chorley'); assert.equal(r.addresses.length, 0);
  assert.equal(formatAddress({ house: '12', street: 'Market Street', town: 'Chorley', county: 'Lancashire', postcode: r.postcode }), '12 Market Street\nChorley\nLancashire\nPR7 1AB');
});
test('bad postcode', async () => {
  assert.equal((await lookupPostcode('xyz', { fetchFn: () => resp(200, {}) })).ok, false);
  assert.match((await lookupPostcode('ZZ1 1ZZ', { fetchFn: () => resp(404, { status: 404 }) })).error, /not found/);
});
test('ideal provider list', async () => {
  const ideal = { result: [{ line_1: '2 Barons Court Road', line_2: '', line_3: '', post_town: 'LONDON', county: 'Greater London', postcode: 'ID1 1QD' }] };
  const r = await lookupPostcode('ID1 1QD', { provider: 'ideal', key: 'ak_test', fetchFn: url => resp(200, /ideal/.test(url) ? ideal : pio) });
  assert.equal(r.addresses[0].lines[0], '2 Barons Court Road'); assert.equal(r.addresses[0].town, 'London');
  assert.match(providerUrl('ideal', 'ak_x', 'pr7 1ab'), /postcodes\/PR71AB\?api_key=ak_x/);
  const bad = await lookupPostcode('PR7 1AB', { provider: 'ideal', key: 'k', fetchFn: url => resp(/ideal/.test(url) ? 402 : 200, pio) });
  assert.match(bad.error, /out of lookups/);
});
test('postcoder parse', () => {
  const a = parseProvider('postcoder', [{ summaryline: '1 Foo St, Chorley, PR7 1AB', addressline1: '1 Foo St', posttown: 'CHORLEY', county: 'Lancashire', postcode: 'PR7 1AB' }]);
  assert.equal(a[0].town, 'Chorley'); assert.equal(a[0].label, '1 Foo St, Chorley, PR7 1AB');
});

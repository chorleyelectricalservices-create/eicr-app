import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BASED_ON } from '../js/pdf.js';

const src = fs.readFileSync(new URL('../js/pdf.js', import.meta.url), 'utf8');
test('PDF carries the Appendix 6 "based on" footer and no IET logo', () => {
  assert.match(BASED_ON, /based on the model forms in Appendix 6 of BS 7671:2018\+A4:2026/);
  assert.doesNotMatch(src, /IET logo|theiet/i);
});
test('PDF wording is CertPad\'s own (old model-form phrases removed)', () => {
  for (const p of ['SECTION A: DETAILS OF THE PERSON ORDERING', 'having exercised reasonable skill and care, declare', 'hereby CERTIFY', 'Danger present. Risk of injury. Immediate remedial action required', 'This certificate has been issued to confirm'])
    assert.ok(!src.includes(p), p);
});

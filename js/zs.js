// Maximum earth fault loop impedance (Zs) values, ohms, for U0 = 230 V, Cmin 0.95,
// as tabulated in BS 7671 Chapter 41 (Tables 41.2 / 41.3), 0.4 s disconnection
// for final circuits <= 63 A (5 s for distribution circuits shown where it differs).
// Values are the tabulated maxima (conductor at operating temperature).
const MCB = {
  B: { 6: 7.28, 10: 4.37, 16: 2.73, 20: 2.19, 25: 1.75, 32: 1.37, 40: 1.09, 50: 0.87, 63: 0.69, 80: 0.55, 100: 0.44, 125: 0.35 },
  C: { 6: 3.64, 10: 2.19, 16: 1.37, 20: 1.09, 25: 0.87, 32: 0.68, 40: 0.55, 50: 0.44, 63: 0.35, 80: 0.27, 100: 0.22, 125: 0.17 },
  D: { 6: 1.82, 10: 1.09, 16: 0.68, 20: 0.55, 25: 0.44, 32: 0.34, 40: 0.27, 50: 0.22, 63: 0.17, 80: 0.14, 100: 0.11, 125: 0.09 },
};
// Type D at 5 s (Table 41.3 is 0.4 s only for B/C as instantaneous trip governs; D differs)
const MCB_D_5S = { 6: 3.64, 10: 2.19, 16: 1.37, 20: 1.09, 25: 0.87, 32: 0.68, 40: 0.55, 50: 0.44, 63: 0.35, 80: 0.27, 100: 0.22, 125: 0.17 };
// Fuses (BS 3036, BS 88-2/-3) and older BS 3871 MCBs are not tabulated here yet:
// enter max Zs manually for those circuits.

export function normBsen(s) {
  const t = String(s || '').toUpperCase().replace(/\s+/g, '').replace(/^BS(EN)?/, '');
  if (/60898/.test(t)) return '60898';
  if (/61009/.test(t)) return '61009';
  if (/62423/.test(t)) return '62423';
  if (/3036/.test(t)) return '3036';
  if (/1361|88-3/.test(t)) return '88-3';
  if (/3871/.test(t)) return '3871';
  if (/88-2|88/.test(t)) return '88-2';
  return t;
}

/**
 * Tabulated max Zs for a device, or null if not in our tables.
 * @param {string} bsen e.g. "60898", "BS EN 61009"
 * @param {string} type e.g. "B", "C", "D", "1".."3", "gG"
 * @param {number|string} rating amps
 * @param {number|string} discTime seconds (0.4 or 5)
 */
export function tableMaxZs(bsen, type, rating, discTime = 0.4) {
  const b = normBsen(bsen);
  const r = Number(rating);
  const t = String(type || '').toUpperCase().trim();
  const dt = Number(discTime) >= 5 ? '5' : '0.4';
  if (!r) return null;
  if (b === '60898' || b === '61009') {
    if (t === 'D' && dt === '5') return MCB_D_5S[r] ?? null;
    return MCB[t]?.[r] ?? null;
  }
  return null;
}

/** Limit to compare a measured (ambient-temperature) Zs against. */
export function zsLimit(maxZs, useRuleOfThumb) {
  if (maxZs == null || !isFinite(maxZs)) return null;
  return useRuleOfThumb ? Math.round(maxZs * 0.8 * 100) / 100 : maxZs;
}

// Maximum earth fault loop impedance (Zs) limits, ohms, for circuit-breakers to BS EN 60898 and
// RCBOs to BS EN 61009 (U0 = 230 V). These are CALCULATED here from the BS 7671 Chapter 41 method,
// not copied from a published table:
//   Zs(max) = Cmin x U0 / Ia, with Cmin = 0.95 and U0 = 230 V
//   Ia = current that gives instantaneous tripping: 5 x In (Type B), 10 x In (Type C), 20 x In (Type D)
//   For a Type D device at 5 s disconnection, Ia = 10 x In is used.
// Results are rounded to 2 decimal places (conductor at operating temperature).
export const CMIN = 0.95, U0 = 230;
export const MCB_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
const TRIP_MULTIPLE = { B: 5, C: 10, D: 20 };
const round2 = v => Math.round(v * 100) / 100;
/** Calculated max Zs for a B/C/D circuit-breaker or RCBO. */
export function mcbMaxZs(type, rating, discTime = 0.4) {
  const t = String(type || '').toUpperCase().trim(); const In = Number(rating);
  let k = TRIP_MULTIPLE[t];
  if (!k || !MCB_RATINGS.includes(In)) return null;
  if (t === 'D' && Number(discTime) >= 5) k = 10;
  return round2((CMIN * U0) / (k * In));
}
// Fuses (BS 3036, BS 88-2/-3, BS 1361) and older BS 3871 MCBs: CertPad has NO built-in table for these;
// the user enters max Zs by hand. Any future fuse/RCBO table taken from product time/current curves or
// published BS 7671 tables is PENDING SOLICITOR REVIEW (copyright / database right) before it is added.

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
 * Max Zs for a device (calculated for B/C/D MCBs and RCBOs) for a device, or null if not in our tables.
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
    return mcbMaxZs(t, r, dt);
  }
  return null;
}

/** Limit to compare a measured (ambient-temperature) Zs against. */
export function zsLimit(maxZs, useRuleOfThumb) {
  if (maxZs == null || !isFinite(maxZs)) return null;
  return useRuleOfThumb ? Math.round(maxZs * 0.8 * 100) / 100 : maxZs;
}

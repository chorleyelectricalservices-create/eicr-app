// Maximum demand estimate from protective device ratings, using the IET On-Site Guide
// Appendix A (Table A2) domestic diversity allowances. Device rating is used as each
// circuit's load, so this is an ESTIMATE – real connected load may be lower or higher.
import { isSpare } from './fill.js';

export const MD_CATS = {
  lighting: 'Lighting', sockets: 'Socket circuits (ring/radial)', cooker: 'Cooker', cookerSkt: 'Cooker + socket',
  instant: 'Instantaneous water heater / shower', storageWH: 'Immersion / storage water heater', storageHeat: 'Storage / floor heating',
  heatPower: 'Fixed heating & power (other)', ev: 'EV charger', evManaged: 'EV charger (load managed)', submain: 'Sub-main to recorded sub-board (excluded)', submainFull: 'Sub-main, sub-board not recorded (100%)', exclude: 'Exclude (spare / not used)',
};
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** Guess a category from circuit description/device. */
export function guessCategory(c, boards = []) {
  const d = String(c.desc || '').toLowerCase();
  if (isSpare(c)) return 'exclude';
  if (feedsBoard(c, boards) != null) return 'submain';
  if (/sub[\s-]?main|sub[\s-]?board|\bdb ?\d|distribution board|garage (cu|board|consumer)|\bcu ?\d\b/.test(d)) return boards.length > 1 ? 'submain' : 'submainFull';
  if (/\bev\b|car charg|vehicle|charge ?point|wallbox|zappi|ohme|pod ?point/.test(d)) return /managed|ct clamp|load manag/.test(d) ? 'evManaged' : 'ev';
  if (/shower|instant|inline heater|electric tap/.test(d)) return 'instant';
  if (/immersion|water heater|boiler|cylinder|unvented/.test(d)) return 'storageWH';
  if (/storage heat|underfloor|ufh|floor heat|night store/.test(d)) return 'storageHeat';
  if (/cooker|oven|hob|range/.test(d)) return /socket|outlet|\+ ?skt|& ?skt/.test(d) ? 'cookerSkt' : 'cooker';
  if (/light|ltg|lts|lamp|downlight|chandelier/.test(d)) return 'lighting';
  if (/socket|skt|ring|rfc|radial|power|kitchen|sockets|utility|garage|outlet/.test(d)) return 'sockets';
  if (/heat|heater|pump|fan|alarm|smoke|fcu|spur|boiler|extract|gate|pond|aircon|a\/c|solar|pv|battery|dishwasher|washer|dryer|fridge|freezer/.test(d)) return 'heatPower';
  return num(c.rating) != null && num(c.rating) <= 6 ? 'lighting' : 'heatPower';
}
/** Index of a recorded board this circuit feeds, or null (matches board ref in description, e.g. "Sub-main to DB2"). */
export function feedsBoard(c, boards) {
  const d = String(c.desc || '').toLowerCase();
  for (let i = 1; i < boards.length; i++) { const r = String(boards[i].ref || '').toLowerCase().trim(); if (r && new RegExp(`\\b${r.replace(/[^a-z0-9]/g, '\\W?')}\\b`).test(d)) return i; }
  return null;
}

/**
 * rows: [{board, index, no, desc, rating, cat}] → { raw, est, lines:[{...row, amps, allow, note}], notes }
 * Sub-mains feeding a recorded sub-board are excluded; the sub-board's own circuits are counted instead
 * (so diversity applies across like circuits in the whole installation and nothing is counted twice).
 */
export function computeDemand(rows) {
  const lines = rows.map(r => ({ ...r, amps: num(r.rating) ?? 0, allow: 0, note: '' }));
  const use = lines.filter(l => !['submain', 'exclude'].includes(l.cat) && l.amps > 0);
  const raw = lines.filter(l => l.cat !== 'submain' && l.cat !== 'exclude').reduce((a, l) => a + l.amps, 0);
  const by = k => use.filter(l => l.cat === k).sort((a, b) => b.amps - a.amps);
  const set = (l, a, note) => { l.allow = Math.round(a * 100) / 100; l.note = note; };
  by('lighting').forEach(l => set(l, l.amps * 0.66, '66%'));
  by('sockets').forEach((l, i) => set(l, i === 0 ? l.amps : l.amps * 0.4, i === 0 ? '100% (largest)' : '40%'));
  // Heating & power: 100% up to 10 A + 50% of the excess (OSG Table A2, applied to the group total)
  { const g = by('heatPower'); const tot = g.reduce((a, l) => a + l.amps, 0); const allowTot = tot <= 10 ? tot : 10 + (tot - 10) * 0.5;
    g.forEach(l => set(l, tot ? l.amps / tot * allowTot : 0, '100% of first 10 A + 50% rest (shared)')); }
  // Cooking: 10 A + 30% of the remainder (+5 A if socket) – applied to the cooker group
  { const g = [...by('cooker'), ...by('cookerSkt')]; const tot = g.reduce((a, l) => a + l.amps, 0);
    const allowTot = tot <= 10 ? tot : 10 + (tot - 10) * 0.3; const skt = g.some(l => l.cat === 'cookerSkt') ? 5 : 0;
    g.forEach((l, i) => set(l, (tot ? l.amps / tot * allowTot : 0) + (i === 0 ? skt : 0), `10 A + 30% rest${skt && i === 0 ? ' + 5 A socket' : ''} (shared)`)); }
  by('instant').forEach((l, i) => set(l, i < 2 ? l.amps : l.amps * 0.25, i === 0 ? '100% (largest)' : i === 1 ? '100% (2nd)' : '25%'));
  by('storageWH').forEach(l => set(l, l.amps, '100% (no diversity)'));
  by('storageHeat').forEach(l => set(l, l.amps, '100% (no diversity)'));
  by('ev').forEach(l => set(l, l.amps, '100% (no diversity)'));
  by('submainFull').forEach(l => set(l, l.amps, '100% (sub-board circuits not recorded)'));
  by('evManaged').forEach(l => set(l, 0, 'load-managed – limited by CT clamp, not added'));
  lines.filter(l => l.cat === 'submain').forEach(l => set(l, 0, 'sub-main – its board’s circuits counted instead'));
  lines.filter(l => l.cat === 'exclude').forEach(l => set(l, 0, 'excluded'));
  const est = use.reduce((a, l) => a + l.allow, 0);
  return { raw, est: Math.round(est * 100) / 100, rawA: Math.ceil(raw), estA: Math.ceil(est - 1e-9), lines };
}

/** Rows for all boards of a job (cats from saved overrides or guessed). */
export function demandRows(job, overrides = {}) {
  const boards = job.boards || []; const rows = [];
  boards.forEach((b, bi) => (b.circuits || []).forEach((c, ci) => {
    const key = c.id || `${bi}.${ci}`;
    rows.push({ key, board: b.ref || `DB${bi + 1}`, no: c.no, desc: c.desc, rating: c.rating, cat: overrides[key] || guessCategory(c, boards) });
  }));
  return rows;
}
/** Supply limit to compare against: supply fuse rating, else main switch rating. */
export function supplyLimit(job) { return num(job.supply?.deviceRating) ?? num(job.origin?.msCurrent) ?? null; }

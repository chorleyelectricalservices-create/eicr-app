// R1+R2 = Zs − Ze (and reverse Zs = Ze + R1+R2). Pure, Node-testable.
import { isSpare } from './fill.js';

const plain = v => { const s = String(v ?? '').trim().replace(',', '.'); return /^\d+(\.\d+)?$|^\.\d+$/.test(s) ? parseFloat(s) : null; };
const r2 = n => Math.round(n * 100) / 100;
const fmt = n => r2(n).toFixed(2);

/** Ze to use for a board: origin board -> supply Ze; sub-board -> its Zdb, else supply Ze (noted). */
export function boardZe(job, boardIndex) {
  const b = job.boards?.[boardIndex] || {};
  const ze = plain(job.supply?.ze);
  const isMain = boardIndex === 0 || /origin|supply|intake|main/i.test(b.suppliedFrom || '');
  if (isMain) return { value: ze, source: 'Ze', note: ze == null ? 'Supply Ze not recorded' : '' };
  const zdb = plain(b.zdb);
  if (zdb != null) return { value: zdb, source: 'Zdb', note: '' };
  return { value: ze, source: 'Ze', note: ze == null ? 'No Zdb for this board and no supply Ze' : `No Zdb recorded for ${b.ref || 'this board'} – used supply Ze` };
}

export function calcR1R2(zs, ze) {
  const z = plain(zs), e = plain(ze);
  if (z == null) return { ok: false, error: String(zs ?? '').trim() ? `Zs "${zs}" isn't a plain reading` : 'No Zs reading' };
  if (e == null) return { ok: false, error: 'No Ze value to subtract' };
  if (z <= e) return { ok: false, error: `Zs ${z} is not more than Ze ${e} – readings look wrong` };
  return { ok: true, value: fmt(z - e) };
}

export function calcZs(r1r2, ze) {
  const r = plain(r1r2), e = plain(ze);
  if (r == null) return { ok: false, error: String(r1r2 ?? '').trim() ? `R1+R2 "${r1r2}" isn't a plain reading` : 'No R1+R2 reading' };
  if (e == null) return { ok: false, error: 'No Ze value to add' };
  if (r <= 0) return { ok: false, error: 'R1+R2 must be more than zero' };
  return { ok: true, value: fmt(r + e) };
}

/** Plan "calculate all R1+R2" for a board. Same shape as planFill. */
export function planCalcAll(circuits, ze, opts = {}) {
  const { overwrite = false, skipSpare = true } = opts;
  const changes = []; let skipped = 0, bad = 0;
  circuits.forEach((c, index) => {
    if (skipSpare && isSpare(c)) { skipped++; return; }
    const old = String(c.r1r2 ?? '').trim();
    if (old && !overwrite) { skipped++; return; }
    const r = calcR1R2(c.zs, ze);
    if (!r.ok) { if (String(c.zs ?? '').trim()) bad++; else skipped++; return; }
    if (old === r.value) return;
    changes.push({ index, old, value: r.value });
  });
  return { changes, fills: changes.filter(x => !x.old).length, replaces: changes.filter(x => x.old).length, skipped, bad };
}

export function markCalc(c, field, on) { if (on) (c.calc ??= {})[field] = true; else if (c.calc) delete c.calc[field]; }

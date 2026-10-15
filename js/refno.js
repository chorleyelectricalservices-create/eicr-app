// Certificate reference numbers: PREFIX-EICR-YYMM-NNNN. The counter only ever goes up.
export const DEFAULT_REF_PREFIX = 'CES';
export const cleanPrefix = p => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export function formatRef(prefix, n, date = new Date(), kindCode = 'EICR') {
  const yymm = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const code = String(kindCode || 'EICR').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'EICR';
  return `${cleanPrefix(prefix) || DEFAULT_REF_PREFIX}-${code}-${yymm}-${String(n).padStart(4, '0')}`;
}
/** Sequence number at the end of any ref (new or old style, e.g. "EICR-0007" -> 7). */
export function refNum(ref) { const m = String(ref ?? '').match(/(\d+)\s*$/); return m ? parseInt(m[1], 10) : 0; }
export const normRef = r => String(r ?? '').trim().toUpperCase();
export function maxRefNum(jobs) { return Math.max(0, ...jobs.map(j => refNum(j.reportNo))); }
export function isDuplicate(ref, jobs, exceptId) { const r = normRef(ref); return !!r && jobs.some(j => j.id !== exceptId && normRef(j.reportNo) === r); }
/** Allocate the next unused ref. Returns { ref, next } – store `next` as settings.nextNumber. */
export function allocateRef(settings, jobs, date = new Date(), kindCode = 'EICR') {
  let n = Math.max(Number(settings.nextNumber) || 1, maxRefNum(jobs) + 1);
  let ref = formatRef(settings.refPrefix, n, date, kindCode);
  while (isDuplicate(ref, jobs)) ref = formatRef(settings.refPrefix, ++n, date, kindCode);
  return { ref, next: n + 1 };
}
/** Restoring a backup: give any clashing incoming job a fresh ref and raise the counter. */
export function planRestore(settings, existing, incoming, date = new Date()) {
  const all = existing.filter(e => !incoming.some(i => i.id === e.id)); const renamed = [];
  let s = { ...settings, nextNumber: Math.max(Number(settings.nextNumber) || 1, maxRefNum([...existing, ...incoming]) + 1) };
  const order = [...incoming.keys()].sort((x, y) => (existing.some(e => e.id === incoming[y].id) ? 1 : 0) - (existing.some(e => e.id === incoming[x].id) ? 1 : 0));
  const out = []; for (const idx of order) out[idx] = ((j) => {
    let jj = j;
    if (!normRef(j.reportNo) || isDuplicate(j.reportNo, all)) { const code = (j.kind === 'eic' ? 'EIC' : j.kind === 'mw' ? 'MW' : 'EICR'); const a = allocateRef(s, [...all, ...incoming], date, code); renamed.push([j.reportNo, a.ref]); jj = { ...j, reportNo: a.ref, refLocked: false }; s = { ...s, nextNumber: a.next }; }
    all.push(jj); return jj;
  })(incoming[idx]);
  return { jobs: out, nextNumber: s.nextNumber, renamed };
}

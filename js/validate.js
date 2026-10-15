import { EDITIONS, CODES, INSPECTION_ITEMS } from './presets.js';
import { tableMaxZs, zsLimit } from './zs.js';

/** Parse test readings like "0.45", ">999", "≥200", "LIM", "N/A". Returns {n, gt, text}. */
export function parseReading(v) {
  const s = String(v ?? '').trim();
  if (!s) return { n: null, empty: true };
  const m = s.replace(',', '.').match(/^([<>≥≤]=?)?\s*(\d+(?:\.\d+)?)/);
  if (!m) return { n: null, text: s.toUpperCase() };
  return { n: parseFloat(m[2]), gt: /[>≥]/.test(m[1] || ''), lt: /[<≤]/.test(m[1] || '') };
}
const num = v => parseReading(v).n;
const isNA = v => /^(N\/?A|LIM|N\/?V|-)$/i.test(String(v ?? '').trim());

/** Effective max Zs for a circuit: manual value if given, else from tables. */
export function circuitMaxZs(c) {
  if (c.maxZsManual && num(c.maxZs) != null) return num(c.maxZs);
  const t = tableMaxZs(c.bsen, c.type, c.rating, c.maxDisc);
  if (t != null) return t;
  return num(c.maxZs);
}

export function hasRcd(c, board) {
  return !!(c.rcdType || c.idn || /61009|62423/.test(c.bsen || '') || (board && board.rcdIdn && !c.noBoardRcd));
}

/** Overall assessment per edition. */
export function overallAssessment(job) {
  const ed = EDITIONS[job.edition] || EDITIONS['A4:2026'];
  const bad = new Set(['C1', 'C2', ...(ed.fiUnsatisfactory ? ['FI'] : [])]);
  const codes = (job.observations || []).map(o => o.code);
  return codes.some(c => bad.has(c)) ? 'UNSATISFACTORY' : 'SATISFACTORY';
}

export function codeCounts(job) {
  const r = { C1: 0, C2: 0, C3: 0, FI: 0 };
  for (const o of job.observations || []) if (r[o.code] != null) r[o.code]++;
  return r;
}

const ORDER = { C1: 0, C2: 1, C3: 2, FI: 3 };
export function sortObservations(list) {
  return [...list].sort((a, b) => (ORDER[a.code] ?? 9) - (ORDER[b.code] ?? 9));
}

/** Checks for one circuit. Returns [{level:'error'|'warn', field, msg}] */
export function checkCircuit(c, board, opts = {}) {
  const out = [];
  const add = (level, field, msg) => out.push({ level, field, msg });
  const lim = isNA(c.zs) || /LIM/i.test(c.remarks || '');
  if (!c.desc) add('error', 'desc', 'Circuit description missing');
  if (!c.bsen) add('error', 'bsen', 'Protective device BS (EN) missing');
  if (!c.type && /60898|61009/.test(c.bsen)) add('error', 'type', 'Device type (B/C/D) missing');
  if (!c.rating) add('error', 'rating', 'Device rating missing');
  if (!c.live) add('warn', 'live', 'Live conductor csa missing');
  if (!c.cpc) add('warn', 'cpc', 'CPC csa missing');

  const max = circuitMaxZs(c);
  const zs = parseReading(c.zs);
  if (zs.empty) { if (!lim) add('error', 'zs', 'Measured Zs missing'); }
  else if (zs.n != null) {
    if (max == null) add('warn', 'maxZs', 'Max permitted Zs unknown for this device – enter it manually');
    else {
      const limit = zsLimit(max, opts.ruleOfThumb);
      if (zs.n > max) add('error', 'zs', `Zs ${zs.n} Ω exceeds max permitted ${max} Ω`);
      else if (opts.ruleOfThumb && zs.n > limit) add('error', 'zs', `Zs ${zs.n} Ω exceeds 0.8 rule-of-thumb limit ${limit} Ω (max ${max} Ω)`);
      else if (!opts.ruleOfThumb && zs.n > max * 0.8) add('warn', 'zs', `Zs ${zs.n} Ω is above 80% of max ${max} Ω – check against temperature correction`);
    }
    if (zs.n <= 0) add('error', 'zs', 'Zs of zero or less is impossible');
  }
  if (c.calc?.zs) add('warn', 'zs', 'Zs is calculated (Ze + R1+R2), not measured');
  // Continuity
  const r1r2 = num(c.r1r2), R2 = num(c.R2);
  if (r1r2 == null && R2 == null && !lim && !isNA(c.r1r2)) add('error', 'r1r2', 'Continuity (R1+R2) or R2 missing');
  if (r1r2 != null && zs.n != null && opts.ze != null && zs.n + 0.05 < r1r2) add('warn', 'zs', `Measured Zs (${zs.n}) is less than R1+R2 (${r1r2}) – suspicious`);
  if (r1r2 != null && zs.n != null && opts.ze != null) {
    const expected = opts.ze + r1r2;
    if (Math.abs(zs.n - expected) > Math.max(0.3, expected * 0.5)) add('warn', 'zs', `Zs ${zs.n} Ω differs a lot from Ze + (R1+R2) = ${expected.toFixed(2)} Ω`);
  }
  if (c.ring) {
    const r1 = num(c.r1), rn = num(c.rn), r2 = num(c.r2);
    if (r1 == null || rn == null || r2 == null) add('warn', 'r1', 'Ring end-to-end readings (r1, rn, r2) incomplete');
    else {
      if (Math.abs(r1 - rn) > 0.05) add('warn', 'rn', `Ring r1 (${r1}) and rn (${rn}) differ by more than 0.05 Ω`);
      if (r1r2 != null) {
        const exp = (r1 + r2) / 4;
        if (Math.abs(r1r2 - exp) > 0.05) add('warn', 'r1r2', `(R1+R2) ${r1r2} Ω is not close to (r1+r2)/4 = ${exp.toFixed(2)} Ω`);
      }
    }
  }
  // Insulation resistance
  for (const f of ['irLE', 'irLL']) {
    const ir = parseReading(c[f]);
    const label = f === 'irLE' ? 'L-E' : 'L-L';
    if (ir.empty) { if (f === 'irLE' && !lim) add('error', f, `Insulation resistance ${label} missing`); continue; }
    if (ir.n == null) continue;
    if (ir.n < 1) add('error', f, `Insulation resistance ${label} ${ir.n} MΩ is below 1 MΩ`);
    else if (ir.n < 2 && !ir.gt) add('warn', f, `Insulation resistance ${label} ${ir.n} MΩ is low (under 2 MΩ) – investigate`);
  }
  if ((c.irLE || c.irLL) && !c.testV) add('warn', 'testV', 'IR test voltage missing');
  // Polarity
  if (!c.polarity && !lim) add('error', 'polarity', 'Polarity not recorded');
  else if (/^x$/i.test(c.polarity)) add('error', 'polarity', 'Incorrect polarity recorded – raise an observation');
  // RCD
  if (hasRcd(c, board)) {
    const t = parseReading(c.rcdTime);
    const delayed = /(^|[-\s])S$|^S\b/i.test(String(c.rcdType || '').trim());
    const maxT = delayed ? 500 : 300;
    if (t.empty) { if (!lim) add('error', 'rcdTime', 'RCD trip time missing'); }
    else if (t.n != null && !t.gt && t.n > maxT) add('error', 'rcdTime', `RCD trip time ${t.n} ms exceeds ${maxT} ms at IΔn`);
    else if (t.gt) add('error', 'rcdTime', `RCD did not trip within the test time (${c.rcdTime})`);
    else if (t.n != null && t.n <= 0) add('error', 'rcdTime', 'RCD trip time of zero is impossible');
    const t5 = parseReading(c.rcd5x);
    if (t5.n != null && !delayed && (t5.n > 40 || t5.gt)) add('error', 'rcd5x', `RCD trip time ${c.rcd5x} ms at 5×IΔn exceeds 40 ms`);
    if (!c.rcdBtn && !lim) add('warn', 'rcdBtn', 'RCD test button operation not recorded');
    if (/^x$/i.test(c.rcdBtn)) add('error', 'rcdBtn', 'RCD test button failed');
  }
  if (/^x$/i.test(c.afddBtn)) add('error', 'afddBtn', 'AFDD test button failed');
  return out;
}

/** Full report validation. Returns list of {level, section, msg, target}. */
export function validateJob(job, settings = {}) {
  const issues = [];
  const add = (level, section, msg, target = '') => issues.push({ level, section, msg, target });
  const req = (v, section, msg, target) => { if (v == null || String(v).trim() === '') add('error', section, msg, target); };

  req(job.reportNo, 'Report', 'Report number missing', 'client');
  req(job.client?.name, 'A Client', 'Name of person ordering the report missing', 'client');
  req(job.client?.address, 'A Client', 'Address of person ordering the report missing', 'client');
  const kind = ['eic', 'mw'].includes(job.kind) ? job.kind : 'eicr';
  const isR = kind === 'eicr';
  if (isR) {
  req(job.reason, 'B Reason', 'Reason for producing the report missing', 'client');
  req(job.inspDates, 'B Reason', 'Date(s) of inspection missing', 'client');
  }
  if (kind === 'eic') { req(job.eic?.installType, 'B Installation', 'Type of work (new/addition/alteration) missing', 'client'); req(job.eic?.description, 'B Installation', 'Description of installation missing', 'client'); }
  if (kind === 'mw') {
    req(job.mw?.description, 'A Minor works', 'Description of the minor works missing', 'client');
    req(job.mw?.completed, 'A Minor works', 'Date minor works completed missing', 'client');
    const n = (job.boards || []).reduce((a, b) => a + (b.circuits?.length || 0), 0);
    if (n > 4) add('error', 'Circuits', `Minor Works covers up to 4 circuits (${n} recorded) – use an EIC`, 'boards');
  }
  req(job.installation?.address, 'C Installation', 'Installation address missing', 'client');
  if (isR) {
  req(job.installation?.premises, 'C Installation', 'Description of premises missing', 'client');
  req(job.installation?.wiringAge, 'C Installation', 'Estimated age of wiring missing', 'client');
  req(job.installation?.alterations, 'C Installation', 'Evidence of alterations (Yes/Not apparent) missing', 'client');
  req(job.installation?.records, 'C Installation', 'Installation records available (Yes/No) missing', 'client');
  req(job.extent?.covered, 'D Extent', 'Extent of installation covered missing', 'extent');
  req(job.extent?.agreedWith, 'D Extent', '"Agreed with" (limitations) missing', 'extent');
  req(job.summary?.general, 'E Summary', 'General condition of the installation missing', 'summary');
  req(job.next?.date, 'F Next inspection', 'Next inspection date missing', 'summary');
  }
  if (isR && job.next?.date && job.inspDates && job.next.date <= String(job.inspDates).slice(0, 10)) add('error', 'F Next inspection', 'Next inspection date must be after the inspection date', 'summary');
  const ins = job.declaration?.inspector || {};
  req(ins.name, 'G Declaration', 'Inspector name missing', 'summary');
  if (!ins.signature && !(ins.useSaved && settings.inspector?.signature)) add('error', 'G Declaration', 'Inspector signature missing', 'summary');
  req(ins.date, 'G Declaration', 'Inspector date missing', 'summary');
  const au = job.declaration?.authoriser || {};
  if (isR && !au.sameAsInspector) {
    req(au.name, 'G Declaration', 'Authoriser (QS) name missing', 'summary');
    req(au.signature, 'G Declaration', 'Authoriser (QS) signature missing', 'summary');
  }
  if (!settings.contractor?.name) add('warn', 'Settings', 'Contractor name not set in Settings', 'settings');

  const s = job.supply || {};
  req(s.earthing, 'I Supply', 'Earthing arrangement missing', 'supply');
  req(s.conductors, 'I Supply', 'Number and type of live conductors missing', 'supply');
  req(s.u0, 'I Supply', 'Nominal voltage missing', 'supply');
  req(s.ipf, 'I Supply', 'Prospective fault current (Ipf) missing', 'supply');
  req(s.ze, 'I Supply', 'External earth fault loop impedance (Ze) missing', 'supply');
  if (!s.polarityConfirmed) add('error', 'I Supply', 'Supply polarity not confirmed', 'supply');
  const ze = num(s.ze), ipf = num(s.ipf);
  if (ze != null) {
    if (ze <= 0) add('error', 'I Supply', 'Ze must be greater than zero', 'supply');
    else if (s.earthing === 'TN-S' && ze > 0.8) add('warn', 'I Supply', `Ze ${ze} Ω is above the typical 0.8 Ω for TN-S – check`, 'supply');
    else if (/TN-C-S/.test(s.earthing) && ze > 0.35) add('warn', 'I Supply', `Ze ${ze} Ω is above the typical 0.35 Ω for TN-C-S – check`, 'supply');
    else if (s.earthing === 'TT' && ze > 200) add('warn', 'I Supply', `Earth electrode resistance ${ze} Ω is above 200 Ω and may be unstable`, 'supply');
  }
  if (ipf != null && (ipf <= 0 || ipf > 50)) add('warn', 'I Supply', `Ipf ${ipf} kA looks wrong (enter in kA)`, 'supply');
  if (ipf != null && ze != null && ze > 0 && s.earthing !== 'TT') {
    const est = 230 / ze / 1000;
    if (ipf < est * 0.3) add('warn', 'I Supply', `Ipf ${ipf} kA seems low for Ze ${ze} Ω (PEFC ≈ ${est.toFixed(2)} kA)`, 'supply');
  }
  const o = job.origin || {};
  req(o.meansEarthing, 'J Particulars', 'Means of earthing missing', 'supply');
  if (o.meansEarthing === 'Electrode' || s.earthing === 'TT') { req(o.electrodeType, 'J Particulars', 'Earth electrode type missing', 'supply'); req(o.electrodeRa, 'J Particulars', 'Earth electrode resistance missing', 'supply'); }
  req(o.earthingCsa, 'J Particulars', 'Earthing conductor csa missing', 'supply');
  req(o.bondingCsa, 'J Particulars', 'Main protective bonding conductor csa missing', 'supply');
  if (kind !== 'mw') req(o.msBsen, 'J Particulars', 'Main switch BS (EN) missing', 'supply');
  if (kind !== 'mw') req(o.msCurrent, 'J Particulars', 'Main switch current rating missing', 'supply');
  if (/TN-C-S/.test(s.earthing) && num(o.bondingCsa) != null && num(o.bondingCsa) < 10) add('warn', 'J Particulars', `Main bonding ${o.bondingCsa} mm² is below 10 mm² usually needed for PME`, 'supply');
  if (o.msRcdType && o.msRcdTime && num(o.msRcdTime) > 300 && !/S/i.test(o.msRcdType)) add('error', 'J Particulars', `Main switch RCD trip time ${o.msRcdTime} ms exceeds 300 ms`, 'supply');

  if (isR) {
  // Inspection schedule
  const insp = job.inspection || {};
  const blank = INSPECTION_ITEMS.filter(i => !insp[i.id]?.o);
  if (blank.length) add(blank.length > 10 ? 'error' : 'warn', 'Schedule of inspection', `${blank.length} item(s) have no outcome: ${blank.slice(0, 8).map(i => i.id).join(', ')}${blank.length > 8 ? '…' : ''}`, 'inspection');
  for (const i of INSPECTION_ITEMS) {
    const out = insp[i.id]?.o;
    if (CODES.includes(out) && !(job.observations || []).some(o => (o.items || []).includes(i.id))) add('warn', 'Schedule of inspection', `Item ${i.id.replace(/[a-g]$/, '')} is coded ${out} but no observation is linked to it`, 'inspection');
  }
  // Observations
  const obs = job.observations || [];
  obs.forEach((x, i) => {
    if (!x.desc) add('error', 'K Observations', `Observation ${i + 1}: description missing`, 'observations');
    if (!CODES.includes(x.code)) add('error', 'K Observations', `Observation ${i + 1}: classification code missing`, 'observations');
    if (!x.reg) add('warn', 'K Observations', `Observation ${i + 1}: regulation reference missing`, 'observations');
    if (!(x.items || []).length) add('warn', 'K Observations', `Observation ${i + 1}: not linked to a schedule of inspection item`, 'observations');
  });
  if (!obs.length && !job.noRemedial) add('warn', 'K Observations', 'No observations – tick "No remedial action is required" if that is correct', 'observations');
  }

  // Boards & circuits
  if (!job.boards?.length) add('error', 'Boards', 'No distribution board added', 'boards');
  for (const b of job.boards || []) {
    if (!b.ref) add('error', 'Boards', 'Board reference missing', 'boards');
    if (!b.location) add('warn', `Board ${b.ref}`, 'Board location missing', 'boards');
    if (!b.zdb && !b.ipf) add('warn', `Board ${b.ref}`, 'Zdb / Ipf at board not recorded', 'boards');
    if (!b.polarityOk) add('warn', `Board ${b.ref}`, 'Board polarity not confirmed', 'boards');
    if (!b.circuits.length) add('error', `Board ${b.ref}`, 'No circuits recorded', 'boards');
    const seen = new Set();
    for (const c of b.circuits) {
      if (!c.no) add('error', `Board ${b.ref}`, 'Circuit with no circuit number', 'boards');
      else if (seen.has(c.no)) add('error', `Board ${b.ref}`, `Duplicate circuit number ${c.no}`, 'boards');
      seen.add(c.no);
      for (const p of checkCircuit(c, b, { ruleOfThumb: settings.zsRuleOfThumb ?? true, ze }))
        add(p.level, `Board ${b.ref} cct ${c.no || '?'}`, `${c.desc ? c.desc + ': ' : ''}${p.msg}`, 'boards');
    }
  }
  // Instruments
  const ins2 = job.instruments || {};
  if (!Object.values(ins2).some(v => String(v || '').trim())) add('warn', 'Instruments', 'No test instrument serial numbers recorded', 'boards');

  // Assessment consistency
  const failing = issues.filter(i => i.level === 'error' && /Zs .*exceeds|below 1 MΩ|trip time .*exceeds|did not trip|Incorrect polarity/.test(i.msg));
  if (isR && failing.length && overallAssessment(job) === 'SATISFACTORY') add('warn', 'E Summary', 'Test results fail but no C1/C2 observation is recorded – report would show SATISFACTORY', 'observations');
  return issues;
}

export function summariseIssues(issues) {
  return { errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warn').length };
}

// "Copy for Electraform": certificate data laid out section by section in IET model-form order
// (Electraform's EICR/EIC/MW screens follow the IET model forms). Pure + Node-testable.
import { INSPECTION_ITEMS, EIC_ITEMS } from './presets.js';
import { overallAssessment, circuitMaxZs } from './validate.js';

const s = v => (v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)).trim();
const ukDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : s(d); };
const F = (key, label, value) => ({ key, label, value: s(value) });
const tick = v => (v ? '✓' : '');

/** Schedule of test results columns, IET model-form order (as used by Electraform). */
export const CIRCUIT_COLS = [
  ['no', 'Circuit no'], ['desc', 'Description'], ['wiring', 'Type of wiring'], ['refMethod', 'Ref method'], ['points', 'Points served'],
  ['live', 'Live (mm²)'], ['cpc', 'cpc (mm²)'], ['maxDisc', 'Max disconnection time (s)'],
  ['bsen', 'OCPD BS (EN)'], ['type', 'OCPD type'], ['rating', 'OCPD rating (A)'], ['bc', 'Breaking capacity (kA)'], ['maxZs', 'Max permitted Zs (Ω)'],
  ['rcdBsen', 'RCD BS (EN)'], ['rcdType', 'RCD type'], ['idn', 'RCD IΔn (mA)'], ['rcdRating', 'RCD rating (A)'],
  ['r1', 'Ring r1 (Ω)'], ['rn', 'Ring rn (Ω)'], ['r2', 'Ring r2 (Ω)'], ['r1r2', 'R1+R2 (Ω)'], ['R2', 'R2 (Ω)'],
  ['testV', 'IR test voltage (V)'], ['irLL', 'IR Live–Live (MΩ)'], ['irLE', 'IR Live–Earth (MΩ)'], ['polarity', 'Polarity'],
  ['zs', 'Max measured Zs (Ω)'], ['rcdTime', 'RCD time (ms)'], ['rcdBtn', 'RCD test button'], ['afddBtn', 'AFDD test button'], ['remarks', 'Remarks'],
];
export function circuitValue(c, k) {
  if (k === 'maxZs') { const m = circuitMaxZs(c); return m == null ? s(c.maxZs) : String(m); }
  return s(c[k]);
}
/** Tab-separated row, Electraform/IET column order. Tabs/newlines inside values become spaces. */
export function circuitRowTsv(c) { return CIRCUIT_COLS.map(([k]) => circuitValue(c, k).replace(/[\t\r\n]+/g, ' ')).join('\t'); }
export function sectionText(sec) { return sec.fields.filter(f => f.value).map(f => `${f.label}: ${f.value}`).join('\n'); }

function supplySection(job, letter) {
  const p = job.supply || {};
  return { id: 'supply', title: `${letter} · Supply characteristics & earthing arrangements`, fields: [
    F('supply.earthing', 'Earthing arrangement', p.earthing), F('supply.acdc', 'AC / DC', p.acdc), F('supply.conductors', 'Live conductors', p.conductors),
    F('supply.u', 'Nominal voltage U (V)', p.u), F('supply.u0', 'Nominal voltage U0 (V)', p.u0), F('supply.freq', 'Frequency (Hz)', p.freq),
    F('supply.ipf', 'Prospective fault current Ipf (kA)', p.ipf), F('supply.ze', 'External loop impedance Ze (Ω)', p.ze),
    F('supply.polarityConfirmed', 'Supply polarity confirmed', p.polarityConfirmed), F('supply.otherSources', 'Other sources of supply', p.otherSources),
    F('supply.deviceBsen', 'Supply protective device BS (EN)', p.deviceBsen), F('supply.deviceType', 'Supply device type', p.deviceType), F('supply.deviceRating', 'Supply device rated current (A)', p.deviceRating)] };
}
function originSection(job, letter) {
  const o = job.origin || {};
  return { id: 'origin', title: `${letter} · Particulars of installation at the origin`, fields: [
    F('origin.meansEarthing', 'Means of earthing', o.meansEarthing), F('origin.electrodeType', 'Earth electrode type', o.electrodeType),
    F('origin.electrodeLocation', 'Electrode location', o.electrodeLocation), F('origin.electrodeRa', 'Electrode resistance Ra (Ω)', o.electrodeRa),
    F('origin.maxDemand', `Maximum demand (${o.maxDemandUnit || 'A'})`, o.maxDemand),
    F('origin.earthingMaterial', 'Earthing conductor material', o.earthingMaterial), F('origin.earthingCsa', 'Earthing conductor csa (mm²)', o.earthingCsa), F('origin.earthingVerified', 'Earthing conductor verified', o.earthingVerified),
    F('origin.bondingMaterial', 'Main bonding material', o.bondingMaterial), F('origin.bondingCsa', 'Main bonding csa (mm²)', o.bondingCsa), F('origin.bondingVerified', 'Main bonding verified', o.bondingVerified),
    F('origin.bondWater', 'Bonding – water', o.bondWater), F('origin.bondGas', 'Bonding – gas', o.bondGas), F('origin.bondOil', 'Bonding – oil', o.bondOil),
    F('origin.bondSteel', 'Bonding – structural steel', o.bondSteel), F('origin.bondOther', 'Bonding – other', [o.bondOther, o.bondOtherSpec].filter(Boolean).join(' ')),
    F('origin.msLocation', 'Main switch location', o.msLocation), F('origin.msBsen', 'Main switch BS (EN)', o.msBsen), F('origin.msPoles', 'No. of poles', o.msPoles),
    F('origin.msCurrent', 'Current rating (A)', o.msCurrent), F('origin.msRating', 'Device rating / setting (A)', o.msRating), F('origin.msVoltage', 'Voltage rating (V)', o.msVoltage),
    F('origin.msRcdType', 'RCD type', o.msRcdType), F('origin.msIdn', 'RCD IΔn (mA)', o.msIdn), F('origin.msRcdTime', 'RCD operating time (ms)', o.msRcdTime)] };
}
function boardSections(job) {
  return (job.boards || []).map((b, bi) => ({ id: `board${bi}`, board: bi, title: `Schedule of circuit details & test results – ${b.ref || 'DB' + (bi + 1)}`, fields: [
    F(`b${bi}.ref`, 'Distribution board', b.ref), F(`b${bi}.location`, 'Location', b.location), F(`b${bi}.suppliedFrom`, 'Supplied from', b.suppliedFrom),
    F(`b${bi}.ocpd`, 'Distribution circuit OCPD', [b.ocpdBsen, b.ocpdType, b.ocpdRating && b.ocpdRating + ' A'].filter(Boolean).join(' ')),
    F(`b${bi}.rcd`, 'Board RCD', [b.rcdBsen, b.rcdType, b.rcdRating && b.rcdRating + ' A', b.rcdIdn && b.rcdIdn + ' mA'].filter(Boolean).join(' ')),
    F(`b${bi}.spd`, 'SPD', Object.entries(b.spd || {}).filter(([, v]) => v).map(([k]) => k === 'NA' ? 'N/A' : 'Type ' + k.slice(1)).join(', ')),
    F(`b${bi}.zdb`, 'Zdb (Ω)', b.zdb), F(`b${bi}.ipf`, 'Ipf at board (kA)', b.ipf),
    F(`b${bi}.polarityOk`, 'Polarity confirmed', b.polarityOk), F(`b${bi}.phaseSeqOk`, 'Phase sequence confirmed', b.phaseSeqOk), F(`b${bi}.spdOk`, 'SPD operational', b.spdOk)],
    circuits: (b.circuits || []).map((c, ci) => ({ key: `b${bi}.c${ci}`, no: s(c.no), desc: s(c.desc), fields: CIRCUIT_COLS.map(([k, label]) => F(`b${bi}.c${ci}.${k}`, label, circuitValue(c, k))), tsv: circuitRowTsv(c) })) }));
}
function instrumentsSection(job) {
  const i = job.instruments || {};
  return { id: 'instruments', title: 'Test instruments (serial numbers)', fields: [F('inst.multi', 'Multi-functional', i.multi), F('inst.continuity', 'Continuity', i.continuity), F('inst.ir', 'Insulation resistance', i.ir), F('inst.loop', 'Earth fault loop impedance', i.loop), F('inst.rcd', 'RCD', i.rcd), F('inst.earth', 'Earth electrode resistance', i.earth)] };
}
function clientSection(job, title) { return { id: 'client', title, fields: [F('client.name', 'Client name', job.client?.name), F('client.address', 'Client address', job.client?.address), F('client.postcode', 'Client postcode', job.client?.postcode)] }; }

/** Build the copy sheet for a job. Returns [{id,title,fields:[{key,label,value}], circuits?}] */
export function copySections(job, settings = {}) {
  const k = ['eic', 'ev', 'mw'].includes(job.kind) ? job.kind : 'eicr';
  const ins = job.installation || {}; const di = job.declaration?.inspector || {}; const au = job.declaration?.authoriser || {};
  const head = { id: 'ref', title: 'Certificate', fields: [F('reportNo', 'Certificate / report no', job.reportNo), F('edition', 'BS 7671 edition', job.edition)] };
  if (k === 'mw') {
    const m = job.mw || {}; const b = job.boards?.[0] || {};
    return [head, clientSection(job, 'Client'),
      { id: 'mwA', title: 'Part 1 · Description of the minor works', fields: [F('mw.description', 'Description of minor works', m.description), F('installation.address', 'Location / address', ins.address), F('installation.postcode', 'Postcode', ins.postcode), F('mw.completed', 'Date completed', ukDate(m.completed)), F('mw.departures', 'Departures from BS 7671', m.departures), F('mw.exceptions', 'Permitted exceptions', m.exceptions), F('mw.riskAssessment', 'Risk assessment attached', m.riskAssessment), F('mw.commentsExisting', 'Comments on existing installation', m.commentsExisting)] },
      { id: 'mwB', title: 'Part 2 · Installation details', fields: [F('supply.earthing', 'System earthing arrangement', job.supply?.earthing), F('origin.meansEarthing', 'Method of fault protection / means of earthing', job.origin?.meansEarthing), F('b0.ocpd', 'Protective device for modified circuit', [b.ocpdBsen, b.ocpdType, b.ocpdRating].filter(Boolean).join(' ')), F('supply.ze', 'Ze (Ω)', job.supply?.ze)] },
      ...boardSections(job), instrumentsSection(job),
      { id: 'decl', title: 'Part 4 · Declaration', fields: [F('di.name', 'Name', di.name), F('di.position', 'Position', di.position), F('di.date', 'Date', ukDate(di.date))] }];
  }
  if (k === 'eic' || k === 'ev') {
    const e = job.eic || {};
    const signers = e.singleSignature ? [F('eic.inspection.name', 'Signatory (design, construction, I&T)', e.inspection?.name || di.name), F('eic.inspection.date', 'Date', ukDate(e.inspection?.date || di.date))]
      : [F('eic.design.name', 'Design – name', e.design?.name), F('eic.design.date', 'Design – date', ukDate(e.design?.date)), F('eic.design.departures', 'Design – departures', e.design?.departures),
        F('eic.design2.name', 'Design 2 – name', e.design2?.name), F('eic.construction.name', 'Construction – name', e.construction?.name), F('eic.construction.date', 'Construction – date', ukDate(e.construction?.date)),
        F('eic.inspection.name', 'Inspection & testing – name', e.inspection?.name), F('eic.inspection.date', 'Inspection & testing – date', ukDate(e.inspection?.date))];
    const ei = job.eicInspection || {};
    const out = [head, clientSection(job, 'A · Details of the client'),
      { id: 'eicB', title: 'B · Installation details', fields: [F('installation.address', 'Installation address', ins.address), F('installation.postcode', 'Postcode', ins.postcode), F('eic.description', 'Description of installation', e.description), F('extent.covered', 'Extent covered by this certificate', job.extent?.covered), F('eic.installType', 'New / addition / alteration', e.installType)] },
      { id: 'eicC', title: `C · Declaration${e.singleSignature ? ' (single signature)' : ''}`, fields: [...signers, F('eic.departures', 'Departures from BS 7671', e.departures), F('eic.exceptions', 'Permitted exceptions', e.exceptions), F('eic.riskAssessment', 'Risk assessment attached', e.riskAssessment)] },
      { id: 'eicD', title: 'D · Next inspection', fields: [F('next.intervalYears', 'Recommended interval (years)', job.next?.intervalYears)] },
      supplySection(job, 'F'), originSection(job, 'G'),
      { id: 'eicH', title: 'H · Schedule of inspections', fields: EIC_ITEMS.map(([id, t]) => F(`ei.${id}`, `${id} ${t}`, ei[id])) },
      { id: 'eicI', title: 'I · Comments on existing installation', fields: [F('eic.commentsExisting', 'Comments', e.commentsExisting)] },
      ...boardSections(job), instrumentsSection(job)];
    if (k === 'ev') { const v = job.ev || {}; out.splice(out.length - 1, 0, { id: 'ev', title: 'EV charging equipment', fields: Object.entries({ make: 'Make', model: 'Model', serial: 'Serial', powerKw: 'Rated power (kW)', mode: 'Mode', outlet: 'Outlet', connector: 'Connector', phases: 'Phases', location: 'Location', pmeMethod: 'PME / earthing method (722.411.4.1)', pmeNotes: 'Device details', electrodeRa: 'Electrode Ra (Ω)', rcdType: 'RCD / DC protection', cableType: 'Cable', cableCsa: 'Cable csa (mm²)', cableLength: 'Cable length (m)', vdPct: 'Voltage drop (%)', maxDemandA: 'Max demand (A)', loadMgmt: 'Load management', dnoMethod: 'DNO notification', dnoDate: 'DNO date', dnoRef: 'DNO reference' }).map(([f, l]) => F(`ev.${f}`, l, f === 'dnoDate' ? ukDate(v[f]) : v[f])) }); }
    return out;
  }
  // EICR – IET model form sections A–K, then schedules
  const insp = job.inspection || {};
  return [head,
    clientSection(job, 'A · Person ordering the report'),
    { id: 'B', title: 'B · Reason for producing this report', fields: [F('reason', 'Reason', job.reason), F('inspDates', 'Date(s) of inspection', ukDate(job.inspDates))] },
    { id: 'C', title: 'C · Details of the installation', fields: [F('installation.occupier', 'Occupier', ins.occupier), F('installation.address', 'Installation address', ins.address), F('installation.postcode', 'Postcode', ins.postcode),
      F('installation.premises', 'Description of premises', ins.premises === 'Other' ? ins.premisesOther : ins.premises), F('installation.wiringAge', 'Estimated age of wiring (years)', ins.wiringAge),
      F('installation.alterations', 'Evidence of additions/alterations', ins.alterations), F('installation.alterationsAge', 'If yes, estimated age (years)', ins.alterationsAge),
      F('installation.records', 'Installation records available', ins.records), F('installation.lastInspection', 'Date of last inspection', ukDate(ins.lastInspection))] },
    { id: 'D', title: 'D · Extent and limitations', fields: [F('extent.covered', 'Extent of installation covered', job.extent?.covered), F('extent.agreedWith', 'Agreed limitations / agreed with', job.extent?.agreedWith), F('extent.limitations', 'Limitations', job.extent?.limitations), F('extent.operational', 'Operational limitations', job.extent?.operational)] },
    { id: 'E', title: 'E · Summary of the condition', fields: [F('summary.general', 'General condition', job.summary?.general), F('overall', 'Overall assessment', overallAssessment(job))] },
    { id: 'F', title: 'F · Recommendations', fields: [F('next.intervalYears', 'Next inspection interval (years)', job.next?.intervalYears), F('next.date', 'Next inspection by', ukDate(job.next?.date)), F('next.reasons', 'Reasons', job.next?.reasons)] },
    { id: 'G', title: 'G · Declaration', fields: [F('di.name', 'Inspected by – name', di.name), F('di.position', 'Position', di.position), F('di.date', 'Date', ukDate(di.date)),
      F('au.name', 'Authorised by – name', au.sameAsInspector ? di.name : au.name), F('au.position', 'Position', au.sameAsInspector ? di.position : au.position), F('au.date', 'Date', ukDate(au.sameAsInspector ? di.date : au.date))] },
    supplySection(job, 'I'), originSection(job, 'J'),
    { id: 'K', title: 'K · Observations', fields: (job.observations || []).flatMap((o, i) => [F(`obs${i}`, `${i + 1}. ${o.code || '?'}${o.reg ? ' · ' + o.reg : ''}`, [o.desc, o.location && `(${o.location})`].filter(Boolean).join(' '))]).concat(job.noRemedial ? [F('noRemedial', 'No remedial action required', true)] : []) },
    { id: 'insp', title: 'Schedule of inspections', fields: INSPECTION_ITEMS.map(i => F(`insp.${i.id}`, `${i.id} ${i.text}`, insp[i.id]?.o)) },
    ...boardSections(job), instrumentsSection(job)];
}
/** Progress over all copyable keys that have a value. */
export function copyProgress(sections, ticks = {}) {
  const keys = sections.flatMap(sec => [...sec.fields.filter(f => f.value).map(f => f.key), ...(sec.circuits || []).map(c => c.key)]);
  return { done: keys.filter(k => ticks[k]).length, total: keys.length };
}

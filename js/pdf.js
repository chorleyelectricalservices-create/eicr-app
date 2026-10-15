// PDF report generator. Works in the browser (window.jspdf.jsPDF + autotable plugin)
// and in Node (jspdf + jspdf-autotable applyPlugin) – caller supplies the jsPDF class.
import { EDITIONS, INSPECTION_GROUPS, WIRING_TYPES } from './presets.js';
import { overallAssessment, sortObservations, circuitMaxZs } from './validate.js';

const DARK = [1, 38, 77], ACCENT = [1, 38, 77], ORANGE = [243, 146, 0], LIGHT = [241, 245, 249], RED = [185, 28, 28], GREEN = [21, 128, 61];
const M = 10; // margin mm

// Standard PDF fonts are WinAnsi only – map symbols that are not.
export function pdfText(v) {
  if (v == null) return '';
  return String(v).replace(/−/g, '-').replace(/MΩ/g, 'MOhm').replace(/Ω/g, 'Ohm').replace(/Δ/g, 'd').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[“”]/g, '"').replace(/[^\x00-\xFF‘’–—•…€]/g, c => (c === '✓' || c === '✔' ? '✓' : '?'));
}
const fmtDate = iso => { if (!iso) return ''; const m = String(iso).match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const yn = b => (b ? '✓' : '');

function imgFormat(dataUrl) { return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG'; }

export function buildReport(jsPDF, job, settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const ed = EDITIONS[job.edition] || EDITIONS['A4:2026'];
  const con = settings.contractor || {};
  const assess = overallAssessment(job);
  const W = () => doc.internal.pageSize.getWidth();
  let y = 0;

  // tick rendering for any autotable cell whose raw text is ✓
  const tickHooks = {
    didParseCell(d) { if (d.cell.raw === '✓' || (Array.isArray(d.cell.text) && d.cell.text.join('') === '✓')) { d.cell.text = ['']; d.cell._tick = true; } },
    didDrawCell(d) {
      if (!d.cell._tick) return;
      const { x, y: cy, width: w, height: h } = d.cell;
      const s = Math.min(3, h * 0.55), cx = x + w / 2, my = cy + h / 2;
      doc.setDrawColor(...GREEN); doc.setLineWidth(0.45);
      doc.line(cx - s * 0.5, my, cx - s * 0.15, my + s * 0.4); doc.line(cx - s * 0.15, my + s * 0.4, cx + s * 0.55, my - s * 0.45);
      doc.setDrawColor(0); doc.setLineWidth(0.1);
    },
  };
  const table = (opts) => {
    doc.autoTable({
      theme: 'grid', margin: { left: M, right: M, top: 26, bottom: 14 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.3, lineColor: [180, 188, 200], lineWidth: 0.15, textColor: 20, overflow: 'linebreak' },
      headStyles: { fillColor: LIGHT, textColor: DARK, fontStyle: 'bold' },
      ...opts,
      headStyles: { fillColor: LIGHT, textColor: DARK, fontStyle: 'bold', ...(opts.headStyles || {}) },
      body: opts.body.map(r => r.map(c => (c && typeof c === 'object' && !Array.isArray(c)) ? { ...c, content: pdfText(c.content) } : pdfText(c))),
      head: opts.head?.map(r => r.map(c => (c && typeof c === 'object') ? { ...c, content: pdfText(c.content) } : pdfText(c))),
      didParseCell: d => { tickHooks.didParseCell(d); opts.didParseCell?.(d); },
      didDrawCell: d => { tickHooks.didDrawCell(d); opts.didDrawCell?.(d); },
      startY: opts.startY ?? y,
    });
    y = doc.lastAutoTable.finalY + 3;
  };
  const section = (title) => {
    if (y > doc.internal.pageSize.getHeight() - 30) { newPage(); }
    doc.setFillColor(...DARK); doc.rect(M, y, W() - 2 * M, 6, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(pdfText(title), M + 2, y + 4.2); doc.setTextColor(20); y += 7;
  };
  const kv = (rows, widths = [38, null, 38, null]) => {
    const lab = { fontStyle: 'bold', fillColor: LIGHT, textColor: [70, 80, 95] };
    const cs = {}; const n = Math.max(...rows.map(r => r.length));
    for (let i = 0; i < n; i++) cs[i] = i % 2 === 0 ? { ...lab, cellWidth: widths[i] ?? 38 } : {};
    table({ body: rows.map(r => r.map((c, i) => (i % 2 === 0 && typeof c === 'string') ? { content: c, styles: lab } : c)), columnStyles: cs });
  };
  const note = (t, size = 7) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(80);
    const lines = doc.splitTextToSize(pdfText(t), W() - 2 * M);
    doc.text(lines, M, y + 2.5); y += lines.length * size * 0.42 + 2; doc.setTextColor(20);
  };

  function header() {
    const w = W();
    let x = M;
    if (con.logo) { try { const pr = doc.getImageProperties(con.logo); const h = 16.5, lw = Math.min(40, h * pr.width / pr.height); doc.addImage(con.logo, imgFormat(con.logo), M, 5, lw, lw * pr.height / pr.width, undefined, 'FAST'); x = M + lw + 3; } catch { /* bad image */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK);
    doc.text(pdfText(con.name || 'Contractor name (set in Settings)'), x, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(pdfText([con.address, [con.phone, con.email].filter(Boolean).join('  ·  ')].filter(Boolean).join('\n')), x, 13.5);
    if (con.regNo || con.scheme) doc.text(pdfText([con.scheme, con.regNo].filter(Boolean).join(' · ')), x, 20.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...ACCENT);
    doc.text('ELECTRICAL INSTALLATION CONDITION REPORT', w - M, 10, { align: 'right' });
    doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(pdfText(`Report No: ${job.reportNo || ''}`), w - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(pdfText(ed.label), w - M, 19, { align: 'right' });
    doc.setDrawColor(...ORANGE); doc.setLineWidth(0.7); doc.line(M, 23, w - M, 23); doc.setLineWidth(0.1); doc.setDrawColor(0);
    doc.setTextColor(20); y = 26;
  }
  function newPage(orientation = 'portrait') { doc.addPage('a4', orientation); header(); }
  // keep header on autotable page breaks
  const origAuto = doc.autoTable.bind(doc);
  doc.autoTable = (o) => origAuto({ ...o, willDrawPage: d => { if (d.pageNumber > 1) header(); o.willDrawPage?.(d); } });

  // ---------- Page 1 ----------
  header();
  section('SECTION A: DETAILS OF THE PERSON ORDERING THE REPORT');
  kv([['Name', job.client?.name, 'Address', job.client?.address]]);
  section('SECTION B: REASON FOR PRODUCING THIS REPORT');
  kv([['Reason', { content: job.reason, colSpan: 3 }], ['Date(s) of inspection', { content: String(job.inspDates || '').split(/[,;]/).map(s => fmtDate(s.trim())).join(', '), colSpan: 3 }]]);
  section('SECTION C: DETAILS OF THE INSTALLATION WHICH IS THE SUBJECT OF THIS REPORT');
  const ins = job.installation || {};
  kv([
    ['Occupier', ins.occupier, 'Address', ins.address],
    ['Description of premises', ins.premises === 'Other' ? `Other: ${ins.premisesOther}` : ins.premises, 'Estimated age of wiring', ins.wiringAge ? `${ins.wiringAge} years` : ''],
    ['Evidence of additions / alterations', ins.alterations === 'Yes' ? `Yes${ins.alterationsAge ? ` – approx. ${ins.alterationsAge} years` : ''}` : ins.alterations, 'Installation records available (651.1)', ins.records],
    ['Date of last inspection', fmtDate(ins.lastInspection) || 'Not known', '', ''],
  ]);
  section('SECTION D: EXTENT AND LIMITATIONS OF INSPECTION AND TESTING');
  const ex = job.extent || {};
  kv([
    ['Extent of installation covered', { content: ex.covered, colSpan: 3 }],
    ['Agreed limitations incl. reasons', { content: ex.limitations || 'None', colSpan: 3 }],
    ['Agreed with', { content: ex.agreedWith, colSpan: 3 }],
    ['Operational limitations incl. reasons', { content: ex.operational || 'None', colSpan: 3 }],
  ]);
  note(`Unless specifically agreed between the client and inspector beforehand, cables concealed within trunking and conduits, under floors, in roof spaces and generally within the fabric of the building or underground have not been inspected, and no checks have been made for safety alerts, corrective actions or product recalls on equipment forming part of the installation. The inspection and testing in this report and its schedules were carried out in accordance with ${ed.label.replace(/ \(.*\)/, '')}, as amended to ${fmtDate(ed.amendedTo)}.`);
  section('SECTION E: SUMMARY OF THE CONDITION OF THE INSTALLATION');
  kv([['General condition (electrical safety)', { content: job.summary?.general, colSpan: 3 }]]);
  // assessment box
  const col = assess === 'SATISFACTORY' ? GREEN : RED;
  doc.setDrawColor(...col); doc.setLineWidth(0.8); doc.roundedRect(M, y, W() - 2 * M, 13, 1.5, 1.5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(40);
  doc.text('Overall assessment of the installation, as detailed in Section D, in terms of suitability for continued use:', M + 3, y + 5);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...col);
  doc.text(assess, M + 3, y + 11); doc.setLineWidth(0.1); doc.setDrawColor(0); doc.setTextColor(20); y += 16;
  note(ed.fiUnsatisfactory
    ? 'An UNSATISFACTORY assessment means dangerous (C1) or potentially dangerous (C2) conditions have been found, or further investigation (FI) is required. These should be dealt with as a matter of urgency.'
    : 'An UNSATISFACTORY assessment means dangerous (C1) and/or potentially dangerous (C2) conditions have been found and should be acted on as a matter of urgency. Observations coded C3 (improvement recommended) or FI (further investigation advised) are advisory and do not affect the overall assessment, but should be given due consideration.');

  // ---------- Page 2 ----------
  newPage();
  section('SECTION F: RECOMMENDATION FOR NEXT INSPECTION');
  kv([['Next inspection by', fmtDate(job.next?.date), 'Interval', job.next?.intervalYears ? `${job.next.intervalYears} years` : ''], ['Reasons', { content: job.next?.reasons, colSpan: 3 }]]);
  note('Subject to any necessary remedial action being taken, the installation should be further inspected and tested before the date above.');
  section('SECTION G: DECLARATION');
  note('I/We, being the person(s) responsible for the inspection and testing of the electrical installation (as shown by the signatures below), particulars of which are described above, having exercised reasonable skill and care, declare that the information in this report, including the observations and attached schedules, gives an accurate assessment of the condition of the installation, taking into account the extent and limitations stated in Section D.');
  const di = job.declaration?.inspector || {}; const da = job.declaration?.authoriser || {};
  const insSig = di.useSaved && settings.inspector?.signature ? settings.inspector.signature : di.signature;
  const auth = da.sameAsInspector ? { ...di, signature: insSig } : da;
  const forOf = con.name || '';
  const sigRowIdx = 1;
  const sigs = [insSig, auth.signature];
  table({
    head: [[{ content: 'Inspected and tested by', colSpan: 2 }, { content: 'Report authorised for issue by', colSpan: 2 }]],
    body: [
      ['Name (capitals)', String(di.name || '').toUpperCase(), 'Name (capitals)', String(auth.name || '').toUpperCase()],
      ['Signature', '', 'Signature', ''],
      ['For/on behalf of', forOf, 'For/on behalf of', forOf],
      ['Position', di.position, 'Position', auth.position],
      ['Address', con.address, 'Address', con.address],
      ['Date', fmtDate(di.date), 'Date', fmtDate(auth.date)],
    ],
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold', fillColor: LIGHT }, 2: { cellWidth: 28, fontStyle: 'bold', fillColor: LIGHT } },
    didParseCell: d => { if (d.section === 'body' && d.row.index === sigRowIdx) d.cell.styles.minCellHeight = 16; },
    didDrawCell: d => {
      if (d.section === 'body' && d.row.index === sigRowIdx && (d.column.index === 1 || d.column.index === 3)) {
        const img = sigs[d.column.index === 1 ? 0 : 1];
        if (img) { try { doc.addImage(img, imgFormat(img), d.cell.x + 1, d.cell.y + 1, Math.min(d.cell.width - 2, 42), d.cell.height - 2); } catch { /* ignore */ } }
      }
    },
  });
  section('SECTION H: SCHEDULES AND CONTINUATION SHEETS ATTACHED');
  const nb = job.boards?.length || 0;
  note(`Attached: Schedule of Inspection (1); Schedule(s) of Circuit Details and Test Results (${nb} board${nb === 1 ? '' : 's'}); Guidance for recipients. These schedules are part of this report, which is valid only when they are attached.`);
  section('SECTION I: SUPPLY CHARACTERISTICS AND EARTHING ARRANGEMENTS');
  const s = job.supply || {};
  kv([
    ['Earthing arrangement', s.earthing, 'Live conductors', `${s.acdc || ''} ${s.conductors || ''}`],
    ['Nominal voltage U / U0', `${s.u || ''} / ${s.u0 || ''} V`, 'Nominal frequency', s.freq ? `${s.freq} Hz` : ''],
    ['Prospective fault current Ipf', s.ipf ? `${s.ipf} kA` : '', 'External loop impedance Ze', s.ze ? `${s.ze} Ω` : ''],
    ['Supply polarity confirmed', yn(s.polarityConfirmed) || 'No', 'Other sources of supply', s.otherSources ? 'Yes – see continuation sheet' : 'None'],
    ['Supply protective device BS (EN)', s.deviceBsen, 'Type / rated current', [s.deviceType, s.deviceRating && `${s.deviceRating} A`].filter(Boolean).join(' / ')],
  ]);
  section('SECTION J: PARTICULARS OF INSTALLATION AT THE ORIGIN');
  const o = job.origin || {};
  kv([
    ['Means of earthing', o.meansEarthing, 'Maximum demand', o.maxDemand ? `${o.maxDemand} ${o.maxDemandUnit || 'A'}` : ''],
    ['Earth electrode type / location', [o.electrodeType, o.electrodeLocation].filter(Boolean).join(' / ') || 'N/A', 'Electrode resistance RA', o.electrodeRa ? `${o.electrodeRa} Ω` : 'N/A'],
    ['Earthing conductor', `${o.earthingMaterial || ''} ${o.earthingCsa ? o.earthingCsa + ' mm²' : ''}`, 'Connection / continuity verified', yn(o.earthingVerified) || 'No'],
    ['Main protective bonding', `${o.bondingMaterial || ''} ${o.bondingCsa ? o.bondingCsa + ' mm²' : ''}`, 'Connection / continuity verified', yn(o.bondingVerified) || 'No'],
  ]);
  table({
    head: [['Bonding to: Water', 'Gas', 'Oil', 'Structural steel', 'Other']],
    body: [[o.bondWater || '', o.bondGas || '', o.bondOil || '', o.bondSteel || '', [o.bondOther, o.bondOtherSpec].filter(Boolean).join(' ')]],
    styles: { halign: 'center', fontSize: 8, cellPadding: 1.3 },
  });
  kv([
    ['Main switch / device', o.msDevice, 'Location', o.msLocation],
    ['BS (EN)', o.msBsen, 'No. of poles', o.msPoles],
    ['Current rating', o.msCurrent ? `${o.msCurrent} A` : '', 'Voltage rating', o.msVoltage ? `${o.msVoltage} V` : ''],
    ['If RCD: type / IΔn', [o.msRcdType, o.msIdn && `${o.msIdn} mA`].filter(Boolean).join(' / ') || 'N/A', 'RCD operating time at IΔn', o.msRcdTime ? `${o.msRcdTime} ms` : 'N/A'],
  ]);

  // ---------- Observations ----------
  newPage();
  section('SECTION K: OBSERVATIONS');
  const obs = sortObservations(job.observations || []);
  const numbered = obs.map((x, i) => ({ ...x, n: i + 1 }));
  if (!obs.length || job.noRemedial) note('No remedial action is required.', 9);
  else note('Referring to the attached schedules, and subject to the limitations in Section D, the following observations are made. Photographs may be attached to support observations.', 7.5);
  const obsTable = (title, list, footer) => {
    table({
      head: [[{ content: title, colSpan: 6 }], ['Item', 'Observation', 'Location', 'Sched. item', 'Code', 'Reg.']],
      body: list.length ? list.map(x => [String(x.n), x.desc, x.location || '', [...new Set((x.items || []).map(i => i.replace(/[a-g]$/, '')))].concat(x.schedRef ? [x.schedRef] : []).join(', '), x.code, x.reg || '']) : [[{ content: 'None', colSpan: 6, styles: { textColor: 120 } }]],
      columnStyles: { 0: { cellWidth: 11, halign: 'center' }, 2: { cellWidth: 32 }, 3: { cellWidth: 17, halign: 'center' }, 4: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, 5: { cellWidth: 22 } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 4) { const c = d.cell.raw; d.cell.styles.textColor = c === 'C1' || c === 'C2' ? RED : c === 'C3' ? [161, 98, 7] : ACCENT; } },
    });
    note(footer);
  };
  obsTable('C1 AND C2 OBSERVATIONS – these affect the overall assessment', numbered.filter(x => x.code === 'C1' || x.code === 'C2'),
    'C1 – Danger present. Risk of injury. Immediate remedial action required.   C2 – Potentially dangerous. Urgent remedial action required.');
  obsTable(`C3 AND FI OBSERVATIONS – ${ed.fiUnsatisfactory ? 'C3 does not affect the assessment; FI does' : 'these do not affect the overall assessment'}`, numbered.filter(x => x.code === 'C3' || x.code === 'FI'),
    'C3 – Improvement recommended.   FI – Further investigation advised (could not be verified within the extent and limitations).');

  // ---------- Schedule of inspection ----------
  newPage();
  section('SCHEDULE OF INSPECTION – RESIDENTIAL AND SIMILAR PREMISES (UP TO 100 A SUPPLY)');
  note('Outcomes: ✓ acceptable · C1/C2 unacceptable · C3 improvement recommended · FI further investigation · N/V not verified · LIM limitation · N/A not applicable · X inadequacy (intake only). Coded items are recorded in Section K.'.replace('✓', 'tick ='));
  const body = [];
  for (const g of INSPECTION_GROUPS) {
    body.push([{ content: `${g.id}.0  ${g.title.toUpperCase()}`, colSpan: 3, styles: { fillColor: LIGHT, fontStyle: 'bold', textColor: DARK } }]);
    for (const [id, text] of g.items) { const r = job.inspection?.[id] || {}; const ks = numbered.filter(x => (x.items || []).includes(id)).map(x => x.n); body.push([id.replace(/[a-g]$/, ''), text + (r.note ? `  – ${r.note}` : '') + (ks.length ? `  [see Section K item ${ks.join(', ')}]` : ''), r.o || '']); }
  }
  table({ head: [['Item', 'Description', 'Outcome']], body, styles: { fontSize: 7.2, cellPadding: 1 }, columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 17, halign: 'center', fontStyle: 'bold' } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 2) { const c = d.cell.raw; if (/C1|C2|X/.test(c)) d.cell.styles.textColor = RED; } } });

  // ---------- Boards (landscape) ----------
  for (const b of job.boards || []) {
    newPage('landscape');
    section(`SCHEDULE OF CIRCUIT DETAILS AND TEST RESULTS – ${b.ref || ''}`);
    const spd = Object.entries(b.spd || {}).filter(([, v]) => v).map(([k]) => (k === 'NA' ? 'N/A' : k)).join('+') || '';
    kv([
      ['DB/CU reference', b.ref, 'Location', b.location, 'Supplied from', b.suppliedFrom],
      ['Distribution OCPD', [b.ocpdBsen, b.ocpdType, b.ocpdRating && `${b.ocpdRating} A`].filter(Boolean).join(' / '), 'SPD type(s)', spd, 'RCD (main)', [b.rcdBsen, b.rcdType, b.rcdRating && `${b.rcdRating} A`, b.rcdIdn && `${b.rcdIdn} mA`].filter(Boolean).join(' / ') || 'N/A'],
      ['Zdb', b.zdb ? `${b.zdb} Ω` : '', 'Ipf at board', b.ipf ? `${b.ipf} kA` : '', 'Confirmed', [b.polarityOk && 'Polarity ✓', b.phaseSeqOk && 'Phase sequence ✓', b.spdOk && 'SPD status ✓'].filter(Boolean).join('  ').replace(/✓/g, 'OK')],
    ], [30, null, 24, null, 26, null]);
    const cs = b.circuits || [];
    const fs = 6.3;
    table({
      head: [['No', 'Circuit description', 'Wiring', 'Ref', 'Pts', 'Live mm²', 'cpc mm²', 'Max disc s', 'OCPD BS (EN)', 'Type', 'A', 'kA', 'RCD BS (EN)', 'RCD type', 'IΔn mA', 'RCD A', 'Max Zs Ω']],
      body: cs.map(c => { const mz = circuitMaxZs(c); const T = k => c[k] && c.typ?.[k] ? `${c[k]}†` : c[k]; return [c.no, c.desc, T('wiring'), T('refMethod'), c.points, T('live'), T('cpc'), c.maxDisc, c.bsen, c.type, c.rating, c.bc, c.rcdBsen, c.rcdType, c.idn, c.rcdRating, mz != null ? String(mz) : '']; }),
      styles: { fontSize: fs, cellPadding: 0.8, halign: 'center' }, headStyles: { fontSize: 6, halign: 'center', valign: 'middle' },
      columnStyles: { 1: { halign: 'left', cellWidth: 52 }, 0: { cellWidth: 9 } },
    });
    if (cs.some(c => c.typ && Object.keys(c.typ).length)) note('† Typical value for a domestic installation, assumed (not verified by inspection).', 6.5);
    note(`Wiring codes: ${Object.entries(WIRING_TYPES).map(([k, v]) => `${k} ${v}`).join(' · ')}. Max Zs from BS 7671 Chapter 41 tables unless stated.`, 6);
    table({
      head: [['No', 'r1', 'rn', 'r2', 'R1+R2', 'R2', 'IR V', 'IR L-L MΩ', 'IR L-E MΩ', 'Polarity', 'Zs Ω', 'RCD ms', 'RCD 5× ms', 'RCD btn', 'AFDD btn', 'Remarks']],
      body: cs.map(c => [c.no, c.r1, c.rn, c.r2, c.r1r2 && c.calc?.r1r2 ? `${c.r1r2}*` : c.r1r2, c.R2, c.testV, c.irLL, c.irLE, c.polarity, c.zs && c.calc?.zs ? `${c.zs}**` : c.zs, c.rcdTime, c.rcd5x, c.rcdBtn, c.afddBtn, c.remarks]),
      styles: { fontSize: fs, cellPadding: 0.8, halign: 'center' }, headStyles: { fontSize: 6, halign: 'center', valign: 'middle' },
      columnStyles: { 0: { cellWidth: 9 }, 15: { halign: 'left', cellWidth: 60 } },
    });
    if (cs.some(c => c.calc?.r1r2 || c.calc?.zs)) note([cs.some(c => c.calc?.r1r2) && '* R1+R2 derived from Zs − Ze (not measured by continuity test).', cs.some(c => c.calc?.zs) && '** Zs calculated as Ze + (R1+R2) (not measured).'].filter(Boolean).join('   '), 6.5);
    const I = job.instruments || {};
    kv([
      ['Test instruments (serial no.)', { content: [['Multi-function', I.multi], ['Insulation', I.ir], ['Continuity', I.continuity], ['Loop', I.loop], ['RCD', I.rcd], ['Earth electrode', I.earth]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('   ') || '—', colSpan: 3 }],
      ['Tested by (capitals)', String(di.name || '').toUpperCase(), 'Date', fmtDate(di.date)],
    ], [40, null, 20, 40]);
  }

  // ---------- Guidance ----------
  newPage();
  section('GUIDANCE FOR RECIPIENTS');
  const guide = [
    'This report is an important record of the condition of the electrical installation at the time it was inspected. Keep it safe and pass it on to any future owner or occupier.',
    'The report describes the condition of an existing installation. It is not a certificate for new work: new circuits or a replacement consumer unit need an Electrical Installation Certificate.',
    'Any item coded C1 (danger present) needs immediate action. Any item coded C2 (potentially dangerous) needs urgent action. Either code makes the overall assessment unsatisfactory.',
    ed.fiUnsatisfactory ? 'Items coded FI need further investigation without delay and make the overall assessment unsatisfactory.' : 'Items coded FI could not be verified within the agreed extent and limitations. They are advisory, but should be investigated as soon as possible. Landlords should note that investigative work may still be required within 28 days.',
    'Items coded C3 are recommended improvements. They do not make the installation unsafe, but acting on them will improve safety.',
    'Remedial work should be carried out by a competent person. Ask for an Electrical Installation Certificate or Minor Works Certificate for that work.',
    'An installation designed to an earlier edition of the Wiring Regulations that does not fully comply with the current edition is not necessarily unsafe or in need of upgrading.',
    `The installation should be inspected and tested again by the date in Section F${job.next?.date ? ` (${fmtDate(job.next.date)})` : ''}, or sooner if it is altered, damaged or the use of the premises changes.`,
    'RCDs: press the button marked "T" or "Test" every six months. The device should switch off. If it does not, get advice from a competent electrician. Switch it back on afterwards.',
    'AFDDs with a manual test button: test every six months following the manufacturer\'s instructions.',
    'Surge protective devices (SPDs): check regularly that the status indicator shows the device is working. If not, get advice from a competent electrician.',
    'Do not remove covers from the consumer unit or accessories. If you see scorch marks, smell burning, hear buzzing or find damaged accessories or cables, switch off and get advice.',
    'Where the report is for a rented property, landlords must give a copy to tenants and keep it for the next inspector, in line with current legislation.',
  ];
  table({ body: guide.map((g, i) => [String(i + 1), g]), theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.4 }, columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold' } } });

  // ---------- footers ----------
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200); doc.line(M, h - 10, w - M, h - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100);
    doc.text(pdfText(`Report No ${job.reportNo || ''}  ·  ${job.installation?.address || ''}`).slice(0, 110), M, h - 6);
    doc.text(`Page ${i} of ${n}`, w - M, h - 6, { align: 'right' });
  }
  return doc;
}

// PDF report generator. Works in the browser (window.jspdf.jsPDF + autotable plugin)
// and in Node (jspdf + jspdf-autotable applyPlugin) – caller supplies the jsPDF class.
import { EDITIONS, INSPECTION_GROUPS, WIRING_TYPES, EIC_ITEMS } from './presets.js';
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

  const docTitle = opts => opts?.title || 'ELECTRICAL INSTALLATION CONDITION REPORT';
  const docNoLabel = opts => opts?.noLabel || 'Report No';
  function header(hdrOpts = {}) {
    const w = W();
    let x = M;
    if (con.logo) { try { const pr = doc.getImageProperties(con.logo); const h = 16.5, lw = Math.min(40, h * pr.width / pr.height); doc.addImage(con.logo, imgFormat(con.logo), M, 5, lw, lw * pr.height / pr.width, undefined, 'FAST'); x = M + lw + 3; } catch { /* bad image */ } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK);
    doc.text(pdfText(con.name || 'Contractor name (set in Settings)'), x, 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(pdfText([con.address, [con.phone, con.email].filter(Boolean).join('  ·  ')].filter(Boolean).join('\n')), x, 13.5);
    if (con.regNo || con.scheme) doc.text(pdfText([con.scheme, con.regNo].filter(Boolean).join(' · ')), x, 20.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ACCENT);
    doc.text(docTitle(hdrOpts), w - M, 10, { align: 'right' });
    doc.setFontSize(8.5); doc.setTextColor(...DARK);
    doc.text(pdfText(`${docNoLabel(hdrOpts)}: ${job.reportNo || ''}`), w - M, 15, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(pdfText(ed.label), w - M, 19, { align: 'right' });
    doc.setDrawColor(...ORANGE); doc.setLineWidth(0.7); doc.line(M, 23, w - M, 23); doc.setLineWidth(0.1); doc.setDrawColor(0);
    doc.setTextColor(20); y = 26;
  }
  let _hdr = {}; function setHdr(o) { _hdr = o || {}; }
  function newPage(orientation = 'portrait') { doc.addPage('a4', orientation); header(_hdr); }
  // keep header on autotable page breaks
  const origAuto = doc.autoTable.bind(doc);
  doc.autoTable = (o) => origAuto({ ...o, willDrawPage: d => { if (d.pageNumber > 1) header(_hdr); o.willDrawPage?.(d); } });

  // ---------- Boards (landscape) ----------
  function boardSchedules(di, boardsList = job.boards || []) {
  for (const b of boardsList) {
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
  }

  function footers() {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200); doc.line(M, h - 10, w - M, h - 10);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(100);
    doc.text(pdfText(`${docNoLabel(_hdr)} ${job.reportNo || ''}  ·  ${job.installation?.address || job.client?.address || ''}`).slice(0, 110), M, h - 6);
    doc.text(`Page ${i} of ${n}`, w - M, h - 6, { align: 'right' });
  }
  }
  if (job.kind === 'eic') return eicBody();
  if (job.kind === 'mw') return mwBody();
  if (job.kind === 'sched') return schedBody();
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

  boardSchedules(job.declaration?.inspector || {});

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


  // ================= shared bits for EIC / MW =================
  function savedSigFor(name) {
    const mine = settings.inspector?.signature; const myName = String(settings.inspector?.name || '').trim().toUpperCase();
    return mine && (!name || String(name).trim().toUpperCase() === myName) ? mine : '';
  }
  function sigTable(rows) { // rows: [{role, name, date, sig, extra:[[label,value]]}]
    const body = []; const sigIdx = [];
    rows.forEach(r => {
      body.push([{ content: r.role, colSpan: 4, styles: { fillColor: LIGHT, fontStyle: 'bold', textColor: DARK } }]);
      sigIdx.push({ i: body.length, img: r.sig });
      body.push(['Signature', '', 'Date', fmtDate(r.date)]);
      body.push(['Name (capitals)', String(r.name || '').toUpperCase(), 'For/on behalf of', con.name || '']);
      for (const [a, b2] of r.extra || []) body.push([a, { content: b2, colSpan: 3 }]);
    });
    table({ body, columnStyles: { 0: { cellWidth: 30, fontStyle: 'bold', fillColor: LIGHT }, 2: { cellWidth: 28, fontStyle: 'bold', fillColor: LIGHT } },
      didParseCell: d => { if (d.section === 'body' && sigIdx.some(x => x.i === d.row.index)) d.cell.styles.minCellHeight = 14; },
      didDrawCell: d => { const m = sigIdx.find(x => x.i === d.row.index); if (d.section === 'body' && m && d.column.index === 1 && m.img) { try { doc.addImage(m.img, imgFormat(m.img), d.cell.x + 1, d.cell.y + 1, Math.min(d.cell.width - 2, 40), d.cell.height - 2); } catch { /* ignore */ } } } });
  }
  function supplySection(title) {
    section(title);
    const s = job.supply || {};
    kv([
      ['Earthing arrangement', s.earthing, 'Live conductors', `${s.acdc || ''} ${s.conductors || ''}`],
      ['Nominal voltage U / U0', `${s.u || ''} / ${s.u0 || ''} V`, 'Nominal frequency', s.freq ? `${s.freq} Hz` : ''],
      ['Prospective fault current Ipf', s.ipf ? `${s.ipf} kA` : '', 'External loop impedance Ze', s.ze ? `${s.ze} Ω` : ''],
      ['Supply polarity confirmed', yn(s.polarityConfirmed) || 'No', 'Other sources of supply', s.otherSources ? 'Yes – see continuation sheet' : 'None'],
      ['Supply protective device BS (EN)', s.deviceBsen, 'Type / rated current', [s.deviceType, s.deviceRating && `${s.deviceRating} A`].filter(Boolean).join(' / ')],
    ]);
  }
  function originSection(title) {
    section(title);
    const o = job.origin || {};
    kv([
      ['Means of earthing', o.meansEarthing, 'Maximum demand', o.maxDemand ? `${o.maxDemand} ${o.maxDemandUnit || 'A'}` : ''],
      ['Earth electrode type / location', [o.electrodeType, o.electrodeLocation].filter(Boolean).join(' / ') || 'N/A', 'Electrode resistance RA', o.electrodeRa ? `${o.electrodeRa} Ω` : 'N/A'],
      ['Earthing conductor', `${o.earthingMaterial || ''} ${o.earthingCsa ? o.earthingCsa + ' mm²' : ''}`, 'Connection / continuity verified', yn(o.earthingVerified) || 'No'],
      ['Main protective bonding', `${o.bondingMaterial || ''} ${o.bondingCsa ? o.bondingCsa + ' mm²' : ''}`, 'Connection / continuity verified', yn(o.bondingVerified) || 'No'],
    ]);
    table({ head: [['Bonding to: Water', 'Gas', 'Oil', 'Structural steel', 'Lightning protection', 'Other']],
      body: [[o.bondWater || '', o.bondGas || '', o.bondOil || '', o.bondSteel || '', o.bondLightning || '', [o.bondOther, o.bondOtherSpec].filter(Boolean).join(' ')]], styles: { halign: 'center', fontSize: 8, cellPadding: 1.3 } });
    kv([
      ['Main switch / device', o.msDevice, 'Location', o.msLocation],
      ['BS (EN)', o.msBsen, 'No. of poles', o.msPoles],
      ['Current rating', o.msCurrent ? `${o.msCurrent} A` : '', 'Voltage rating', o.msVoltage ? `${o.msVoltage} V` : ''],
      ['If RCD: type / IΔn', [o.msRcdType, o.msIdn && `${o.msIdn} mA`].filter(Boolean).join(' / ') || 'N/A', 'RCD operating time at IΔn', o.msRcdTime ? `${o.msRcdTime} ms` : 'N/A'],
    ]);
  }
  function guidance(list) {
    newPage(); section('GUIDANCE FOR RECIPIENTS');
    table({ body: list.map((g, i) => [String(i + 1), g]), theme: 'plain', styles: { fontSize: 8.5, cellPadding: 1.4 }, columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold' } } });
  }
  function commonGuide() { return [
    'RCDs: press the button marked "T" or "Test" every six months. The device should switch off; switch it back on to restore the supply. If it does not switch off, seek expert advice.',
    'AFDDs with a manual test facility should be tested six-monthly by pressing the test button (follow the manufacturer\'s instructions where there is also an automatic test function).',
    'SPDs: check the status indicator regularly to confirm the device is operational. If it shows the device is not operational, seek expert advice.',
    'Where there are alternative or additional sources of supply, warning notices should be found at the origin or meter position (or the consumer unit if remote) and at all points of isolation.',
  ]; }

  // ================= EIC =================
  function eicBody() {
    setHdr({ title: 'ELECTRICAL INSTALLATION CERTIFICATE', noLabel: 'Certificate No' });
    header(_hdr); const amended = fmtDate(ed.amendedTo);
    const e = job.eic || {}; const ins = job.installation || {};
    note('Requirements for electrical installations – ' + ed.label.replace(/ \(.*\)/, '') + '. Original to the person ordering the work; duplicate retained by the contractor.', 6.5);
    section('SECTION A: DETAILS OF THE CLIENT');
    kv([['Client', job.client?.name, 'Address', job.client?.address]]);
    section('SECTION B: INSTALLATION DETAILS');
    kv([
      ['Installation address', { content: ins.address, colSpan: 3 }],
      ['Description of installation', { content: e.description, colSpan: 3 }],
      ['Extent covered by this certificate', { content: job.extent?.covered, colSpan: 3 }],
      ['Type of work', { content: ['New installation', 'Addition to an existing installation', 'Alteration to an existing installation'].map(t => (t.startsWith(e.installType || 'New') ? '[X] ' : '[  ] ') + t).join('     '), colSpan: 3 }],
    ]);
    section('SECTION C: CERTIFICATION SIGNATORIES');
    const decl = role => `I/We, being the person(s) responsible for the ${role} of the electrical installation (as indicated by my/our signatures below), particulars of which are described above, having exercised reasonable skill and care when carrying out the ${role}, hereby CERTIFY that the ${role} work for which I/we have been responsible is to the best of my/our knowledge and belief in accordance with BS 7671:2018, amended to ${amended}, except for the departures, if any, detailed below.`;
    const dep = t => t || 'None';
    if (e.singleSignature) {
      note('SINGLE-SIGNATURE CERTIFICATE – the design, construction, and inspection and testing have been carried out by the one person signing below.', 7.5);
      note(decl('design, construction, inspection and testing'), 7);
      const who = e.inspection?.name || job.declaration?.inspector?.name || settings.inspector?.name;
      sigTable([{ role: 'FOR DESIGN, CONSTRUCTION, INSPECTION AND TESTING', name: who, date: e.inspection?.date, sig: savedSigFor(who),
        extra: [['Departures from BS 7671 (120.3, 133.1.2, 133.1.3, 133.5)', dep(e.departures)], ['Permitted exceptions (411.3.3)', (e.exceptions || 'None') + (e.riskAssessment ? '   [Risk assessment attached]' : '')]] }]);
    } else {
      note(decl('design'), 6.8);
      const rows = [{ role: 'FOR THE DESIGN – Designer No 1', name: e.design?.name, date: e.design?.date, sig: savedSigFor(e.design?.name),
        extra: [['Departures from BS 7671', dep(e.design?.departures || e.departures)], ['Permitted exceptions (411.3.3)', (e.exceptions || 'None') + (e.riskAssessment ? '   [Risk assessment attached]' : '')]] }];
      if (e.design2?.name) rows.push({ role: 'FOR THE DESIGN – Designer No 2 (mutual responsibility)', name: e.design2.name, date: e.design2.date, sig: savedSigFor(e.design2.name), extra: [] });
      sigTable(rows);
      note(decl('construction'), 6.8);
      sigTable([{ role: 'FOR CONSTRUCTION – Constructor', name: e.construction?.name, date: e.construction?.date, sig: savedSigFor(e.construction?.name), extra: [['Departures from BS 7671', dep(e.construction?.departures)]] }]);
      note(decl('inspection and testing'), 6.8);
      sigTable([{ role: 'FOR INSPECTION AND TESTING – Inspector', name: e.inspection?.name, date: e.inspection?.date, sig: savedSigFor(e.inspection?.name), extra: [['Departures from BS 7671', dep(e.inspection?.departures)]] }]);
    }
    note('The extent of liability of the signatory or signatories is limited to the work described above as the subject of this Certificate.', 6.5);
    section('SECTION D: NEXT INSPECTION');
    kv([['Recommended interval to first inspection', { content: job.next?.intervalYears ? `${job.next.intervalYears} years` : '', colSpan: 3 }]]);
    section('SECTION E: PARTICULARS OF SIGNATORIES');
    kv([['Company', con.name, 'Tel', con.phone], ['Address', { content: con.address, colSpan: 3 }], ['Scheme / registration', { content: [con.scheme, con.regNo].filter(Boolean).join(' · '), colSpan: 3 }]]);
    newPage();
    supplySection('SECTION F: SUPPLY CHARACTERISTICS AND EARTHING ARRANGEMENTS');
    originSection('SECTION G: PARTICULARS OF INSTALLATION REFERRED TO IN THE CERTIFICATE');
    section('SECTION H: SCHEDULE OF INSPECTIONS');
    note('Outcome: tick = acceptable, N/A = not applicable. All relevant items must be inspected for an EIC.', 7);
    const ei = job.eicInspection || {};
    table({ head: [['Item', 'Description', 'Outcome']], body: EIC_ITEMS.map(([id, t]) => [id, t, ei[id] || '']), styles: { fontSize: 7.5 }, columnStyles: { 0: { cellWidth: 12 }, 2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' } } });
    section('SECTION I: COMMENTS ON EXISTING INSTALLATION (addition/alteration – Reg 644.1.2)');
    kv([['Comments', { content: e.commentsExisting || (e.installType && !/^New/.test(e.installType) ? 'None' : 'N/A – new installation'), colSpan: 3 }]]);
    section('SECTION J: SCHEDULES');
    const nb = job.boards?.length || 0;
    note(`Attached: Schedule of Inspections (Section H); ${nb} Schedule(s) of Circuit Details and Test Results. The schedules and continuation sheets listed are part of this document and this certificate is valid only when they are attached to it.`);
    boardSchedules({ name: e.inspection?.name || job.declaration?.inspector?.name, date: e.inspection?.date });
    guidance([
      'This certificate has been issued to confirm that the electrical installation work to which it relates has been designed, constructed, inspected and tested in accordance with BS 7671.',
      'You should have received the original certificate and the contractor should have kept a duplicate. If you were the person ordering the work but not the owner, pass this certificate (or a full copy including the schedules) to the owner immediately.',
      'Keep the original in a safe place and show it to anyone inspecting or working on the installation in future. If you later vacate the property, it will show the new owner the installation complied with BS 7671 when the certificate was issued.',
      'This certificate is only for a new installation or new work associated with an addition or alteration. It can not be used for inspecting an existing installation – an Electrical Installation Condition Report is issued for that.',
      `For safety, the installation will need to be inspected at appropriate intervals by a skilled person. The maximum recommended interval is in Section D${job.next?.intervalYears ? ` (${job.next.intervalYears} years)` : ''}.`,
      ...commonGuide(),
    ]);
    footers(); return doc;
  }

  // ================= MINOR WORKS =================
  function mwBody() {
    setHdr({ title: 'MINOR ELECTRICAL INSTALLATION WORKS CERTIFICATE', noLabel: 'Certificate No' });
    header(_hdr); const amended = fmtDate(ed.amendedTo);
    const w = job.mw || {}; const ins = job.installation || {}; const b0 = job.boards?.[0] || {}; const o = job.origin || {};
    note('To be used only for minor electrical work which does not include the provision of a new circuit.', 7.5);
    section('SECTION A: DESCRIPTION OF THE MINOR WORKS');
    kv([
      ['1. Client', job.client?.name, 'Date minor works completed', fmtDate(w.completed)],
      ['2. Installation location / address', { content: ins.address, colSpan: 3 }],
      ['3. Description of the minor works', { content: w.description, colSpan: 3 }],
      [`4. Departures from BS 7671:2018 as amended to ${amended} (120.3, 133.1.2, 133.1.3, 133.5)`, { content: w.departures || 'None', colSpan: 3 }],
      ['Permitted exceptions (411.3.3)', { content: (w.exceptions || 'None') + (w.riskAssessment ? '   [Risk assessment attached]' : ''), colSpan: 3 }],
      ['5. Comments on (incl. defects observed in) the existing installation (644.1.2)', { content: w.commentsExisting || 'None', colSpan: 3 }],
    ], [48, null, 34, null]);
    section('SECTION B: PRESENCE AND ADEQUACY OF INSTALLATION EARTHING AND BONDING ARRANGEMENTS (132.16)');
    const arr = ['TN-S', 'TN-C-S (PME)', 'TN-C-S (PNB)', 'TT', 'TN-C', 'IT'];
    kv([
      ['1. System earthing arrangement', { content: arr.map(a => (job.supply?.earthing === a ? '[X] ' : '[  ] ') + a).join('    '), colSpan: 3 }],
      ['2. Zdb at the distribution board supplying the final circuit', b0.zdb ? `${b0.zdb} Ω` : '', '3. Earthing conductor present & adequate', yn(o.earthingVerified) || 'No'],
      ['Main protective bonding to', { content: [['Water', o.bondWater], ['Gas', o.bondGas], ['Oil', o.bondOil], ['Structural steel', o.bondSteel], ['Other', [o.bondOther, o.bondOtherSpec].filter(Boolean).join(' ')]].map(([k, v]) => `${k}: ${v || '–'}`).join('    '), colSpan: 3 }],
    ], [48, null, 40, null]);
    const cs = (b0.circuits || []).slice(0, 4);
    cs.forEach((c, i) => {
      if (i > 0 && y > doc.internal.pageSize.getHeight() - 110) newPage();
      section(`SECTION C: CIRCUIT DETAILS${cs.length > 1 ? ` – circuit ${i + 1} of ${cs.length}` : ''}`);
      kv([
        ['DB reference', b0.ref, 'DB location and type', b0.location],
        ['Circuit no.', c.no, 'Circuit description', c.desc],
        ['Reference method (Table 4A2)', c.refMethod, 'csa Live / CPC (mm²)', [c.live, c.cpc].filter(Boolean).join(' / ')],
        ['Overcurrent device BS (EN) / Type', [c.bsen, c.type].filter(Boolean).join(' / '), 'Rating / Breaking capacity', [c.rating && `${c.rating} A`, c.bc && `${c.bc} kA`].filter(Boolean).join(' / ')],
        ['RCD BS (EN) / Type / Rating', [c.rcdBsen, c.rcdType, c.rcdRating && `${c.rcdRating} A`].filter(Boolean).join(' / ') || 'N/A', 'IΔn / time delay', [c.idn && `${c.idn} mA`, c.rcdDelay && `${c.rcdDelay} ms`].filter(Boolean).join(' / ') || 'N/A'],
        ['AFDD BS (EN) / Rating', [c.afddBsen, c.afddRating && `${c.afddRating} A`].filter(Boolean).join(' / ') || 'N/A', 'SPD BS (EN) / Type', [c.spdBsen, c.spdType].filter(Boolean).join(' / ') || 'N/A'],
      ], [44, null, 40, null]);
      section(`SECTION D: TEST RESULTS FOR THE ALTERED OR EXTENDED CIRCUIT${cs.length > 1 ? ` – circuit ${i + 1}` : ''}`);
      kv([
        ['Protective conductor continuity (R1+R2)', c.r1r2 ? `${c.r1r2}${c.calc?.r1r2 ? '*' : ''} Ω` : '', 'or R2', c.R2 ? `${c.R2} Ω` : ''],
        ['Ring continuity r1 / rn / r2', [c.r1, c.rn, c.r2].map(v => v || '–').join(' / ') + ' Ω', 'Insulation resistance test voltage', c.testV ? `${c.testV} V` : ''],
        ['IR Live–Live', c.irLL ? `${c.irLL} MΩ` : '', 'IR Live–Earth', c.irLE ? `${c.irLE} MΩ` : ''],
        ['Polarity satisfactory', c.polarity || '', 'Max measured Zs', c.zs ? `${c.zs}${c.calc?.zs ? '**' : ''} Ω` : ''],
        ['RCD time at IΔn', c.rcdTime ? `${c.rcdTime} ms` : 'N/A', 'RCD test button operation', c.rcdBtn || 'N/A'],
        ['AFDD test button operation', c.afddBtn || 'N/A', 'SPD functionality confirmed', c.spdOk || 'N/A'],
      ], [44, null, 40, null]);
    });
    if (cs.some(c => c.calc?.r1r2 || c.calc?.zs)) note('* R1+R2 derived from Zs − Ze (not measured).   ** Zs calculated as Ze + (R1+R2) (not measured).', 6.5);
    if (y > doc.internal.pageSize.getHeight() - 75) newPage();
    section('SECTION E: DECLARATION');
    note(`I certify that the work covered by this certificate does not impair the safety of the existing installation and the work has been designed, constructed, inspected and tested in accordance with BS 7671:2018 amended to ${amended} and that to the best of my knowledge and belief, at the time of my inspection, complied with BS 7671 except as detailed in Section A.`, 7.5);
    const di = job.declaration?.inspector || {};
    const sig = di.useSaved && settings.inspector?.signature ? settings.inspector.signature : di.signature;
    sigTable([{ role: 'SIGNED', name: di.name, date: di.date, sig, extra: [['Position', di.position], ['Address', con.address]] }]);
    const I = job.instruments || {};
    kv([['Test instruments (serial no.)', { content: [['Multi-function', I.multi], ['Insulation', I.ir], ['Continuity', I.continuity], ['Loop', I.loop], ['RCD', I.rcd]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('   ') || '—', colSpan: 3 }]]);
    guidance([
      'This certificate confirms that the minor electrical installation work to which it relates has been designed, constructed, inspected and tested in accordance with BS 7671.',
      'You should have received an original certificate and the contractor should have kept a duplicate. If you were the person ordering the work but not the owner, pass this certificate or a copy of it to the owner.',
      'A separate certificate should have been received for each existing circuit on which minor works have been carried out. This certificate is not appropriate if you asked for more extensive work (for example a new circuit or a replacement consumer unit), for which you should have received an Electrical Installation Certificate.',
      'Keep the certificate in a safe place and show it to anyone inspecting or working on the installation in future.',
      'For safety, the electrical installation will need to be inspected at appropriate intervals by a skilled person.',
      ...commonGuide(),
    ]);
    footers(); return doc;
  }

  // ================= standalone schedule continuation =================
  function schedBody() {
    setHdr({ title: 'SCHEDULE OF CIRCUIT DETAILS AND TEST RESULTS', noLabel: 'Schedule No' });
    header(_hdr);
    const sc = job.sched || {};
    section('CONTINUATION SCHEDULE');
    kv([['Continuation of certificate / report No.', sc.parentRef || '', 'Type', sc.parentType || ''], ['Installation address', { content: job.installation?.address, colSpan: 3 }]]);
    note(`This schedule forms part of ${sc.parentType || 'the certificate/report'} No. ${sc.parentRef || '…'} and is valid only when attached to it.`);
    const di = job.declaration?.inspector || {};
    boardSchedules(di);
    footers(); return doc;
  }
  footers();
  return doc;
}

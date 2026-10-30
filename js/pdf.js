// PDF generator – CertPad's own certificate layout and wording.
// Records the information required by BS 7671 Appendix 6 / Reg 653.1 ("based on" the model forms),
// but the design, section order, headings, labels, notes and declarations are CertPad's own.
// Works in the browser (window.jspdf.jsPDF + autotable plugin) and in Node (jspdf + jspdf-autotable).
import { EDITIONS, INSPECTION_GROUPS, WIRING_TYPES, EIC_ITEMS, evPmeRisk } from './presets.js';
import { overallAssessment, sortObservations, circuitMaxZs } from './validate.js';

const NAVY = [1, 38, 77], ORANGE = [243, 146, 0], PALE = [246, 248, 251], RULE = [214, 220, 228], MUTED = [96, 108, 124], RED = [185, 28, 28], GREEN = [21, 128, 61], AMBER = [161, 98, 7];
const M = 12; // page margin, mm
export const BASED_ON = 'This certificate is based on the model forms in Appendix 6 of BS 7671:2018+A4:2026.';
export const LAYOUT_NOTE = 'Layout and wording © CertPad / Chorley Electrical Services.';

// Standard PDF fonts are WinAnsi only – map symbols that are not.
export function pdfText(v) {
  if (v == null) return '';
  return String(v).replace(/−/g, '-').replace(/MΩ/g, 'MOhm').replace(/Ω/g, 'Ohm').replace(/Δ/g, 'd').replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/[“”]/g, '"').replace(/[^\x00-\xFF‘’–—•…€]/g, c => (c === '✓' || c === '✔' ? '✓' : '?'));
}
const fmtDate = iso => { if (!iso) return ''; const m = String(iso).match(/^(\d{4})-(\d\d)-(\d\d)/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
const yn = b => (b ? '✓' : '');
const join = (a, s = ' / ') => a.filter(Boolean).join(s);
function imgFormat(dataUrl) { return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG'; }
// Inspection item texts are shared with the app screens; point their cross-references at this layout.
const xref = t => String(t || '').replace(/see Section D/g, 'see scope, section 3').replace(/Section K/g, 'Findings');

export function buildReport(jsPDF, job, settings) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const ed = EDITIONS[job.edition] || EDITIONS['A4:2026'];
  const std = ed.label.replace(/ \(.*\)/, '');
  const amended = fmtDate(ed.amendedTo);
  const con = settings.contractor || {};
  const W = () => doc.internal.pageSize.getWidth();
  const H = () => doc.internal.pageSize.getHeight();
  let y = 0;
  let secNo = 0;

  const tickHooks = {
    didParseCell(d) { if (d.cell.raw === '✓' || (Array.isArray(d.cell.text) && d.cell.text.join('') === '✓')) { d.cell.text = ['']; d.cell._tick = true; } },
    didDrawCell(d) {
      if (!d.cell._tick) return;
      const { x, y: cy, width: w, height: h } = d.cell;
      const s = Math.min(3, h * 0.55), cx = d.cell.styles.halign === 'left' ? x + 3 : x + w / 2, my = cy + h / 2;
      doc.setDrawColor(...GREEN); doc.setLineWidth(0.45);
      doc.line(cx - s * 0.5, my, cx - s * 0.15, my + s * 0.4); doc.line(cx - s * 0.15, my + s * 0.4, cx + s * 0.55, my - s * 0.45);
      doc.setDrawColor(0); doc.setLineWidth(0.1);
    },
  };
  const clean = c => (c && typeof c === 'object' && !Array.isArray(c)) ? { ...c, content: pdfText(c.content) } : pdfText(c);
  const table = (opts) => {
    doc.autoTable({
      theme: 'striped', margin: { left: M, right: M, top: 30, bottom: 16 },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.4, bottom: 1.4, left: 1.6, right: 1.6 }, lineColor: RULE, lineWidth: 0, textColor: 25, overflow: 'linebreak' },
      alternateRowStyles: { fillColor: PALE },
      ...opts,
      headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', ...(opts.headStyles || {}) },
      body: opts.body.map(r => r.map(clean)),
      head: opts.head?.map(r => r.map(clean)),
      didParseCell: d => { tickHooks.didParseCell(d); opts.didParseCell?.(d); },
      didDrawCell: d => { tickHooks.didDrawCell(d); opts.didDrawCell?.(d); },
      startY: opts.startY ?? y,
    });
    y = doc.lastAutoTable.finalY + 4;
  };
  // Section heading: orange number tab + navy title + hairline.
  const section = (title, { numbered = true } = {}) => {
    if (y > H() - 34) newPage();
    const label = numbered ? String(++secNo) : '';
    if (label) {
      doc.setFillColor(...ORANGE); doc.roundedRect(M, y, 7, 6, 1, 1, 'F');
      doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(label, M + 3.5, y + 4.3, { align: 'center' });
    }
    const tx = label ? M + 9.5 : M;
    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
    doc.text(pdfText(title), tx, y + 4.4);
    doc.setDrawColor(...RULE); doc.setLineWidth(0.3); doc.line(tx, y + 6.6, W() - M, y + 6.6); doc.setLineWidth(0.1); doc.setDrawColor(0);
    doc.setTextColor(25); y += 9;
  };
  // Label / value grid: muted small labels, values in dark text, hairlines between rows.
  const kv = (rows, widths = [40, null, 40, null]) => {
    const lab = { fontSize: 7, textColor: MUTED, fontStyle: 'normal' };
    const cs = {}; const n = Math.max(...rows.map(r => r.length));
    for (let i = 0; i < n; i++) cs[i] = i % 2 === 0 ? { ...lab, cellWidth: widths[i] ?? 40 } : { fontStyle: 'bold' };
    table({ theme: 'plain', body: rows.map(r => r.map((c, i) => (i % 2 === 0 && typeof c === 'string') ? { content: c, styles: lab } : c)), columnStyles: cs,
      styles: { lineWidth: { bottom: 0.15 }, lineColor: RULE } });
  };
  const note = (t, size = 7.2, color = MUTED) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...[color].flat());
    const lines = doc.splitTextToSize(pdfText(t), W() - 2 * M);
    if (y + lines.length * size * 0.42 > H() - 18) newPage();
    doc.text(lines, M, y + 2.5); y += lines.length * size * 0.42 + 2.2; doc.setTextColor(25);
  };
  // A highlighted panel with a coloured edge – used for results and declarations.
  const panel = (lines, col = NAVY, { title, big } = {}) => {
    doc.setFontSize(7.6); const body = doc.splitTextToSize(pdfText(lines), W() - 2 * M - 8);
    const h = 4 + (title ? 5 : 0) + (big ? 7 : 0) + body.length * 3.3;
    if (y + h > H() - 18) newPage();
    doc.setFillColor(...PALE); doc.rect(M, y, W() - 2 * M, h, 'F'); doc.setFillColor(...col); doc.rect(M, y, 1.6, h, 'F');
    let ty = y + 4.5;
    if (title) { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...col); doc.text(pdfText(title), M + 5, ty); ty += 5; }
    if (big) { doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...col); doc.text(pdfText(big), M + 5, ty + 2); ty += 7; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.6); doc.setTextColor(40); doc.text(body, M + 5, ty);
    y += h + 3; doc.setTextColor(25);
  };

  const docTitle = o => o?.title || 'Electrical Installation Condition Report';
  const docNoLabel = o => o?.noLabel || 'Report no.';
  function header(o = {}) {
    const w = W();
    doc.setFillColor(...NAVY); doc.rect(0, 0, w, 24, 'F');
    doc.setFillColor(...ORANGE); doc.rect(0, 24, w, 1.2, 'F');
    let x = M;
    if (con.logo) {
      try {
        const pr = doc.getImageProperties(con.logo); const h = 15, lw = Math.min(36, h * pr.width / pr.height), lh = lw * pr.height / pr.width;
        doc.setFillColor(255); doc.roundedRect(M - 1.5, 4.5 - 1.5, lw + 3, lh + 3, 1.5, 1.5, 'F');
        doc.addImage(con.logo, imgFormat(con.logo), M, 4.5, lw, lh, undefined, 'FAST'); x = M + lw + 5;
      } catch { /* bad image */ }
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(pdfText(con.name || 'Contractor name (set in Settings)'), x, 9);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(205, 215, 230);
    doc.text(pdfText(join([con.address, join([con.phone, con.email], '  ·  '), join([con.scheme, con.regNo], ' · ')], '\n')), x, 12.6);
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(pdfText(docTitle(o)), w - M, 9, { align: 'right' });
    const ref = pdfText(`${docNoLabel(o)} ${job.reportNo || ''}`);
    doc.setFontSize(8.5); const rw = doc.getTextWidth(ref) + 6;
    doc.setFillColor(...ORANGE); doc.roundedRect(w - M - rw, 11.5, rw, 5.5, 2.7, 2.7, 'F'); doc.text(ref, w - M - 3, 15.4, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(205, 215, 230);
    doc.text(pdfText(`To ${ed.label}`), w - M, 21, { align: 'right' });
    doc.setTextColor(25); y = 31;
  }
  let _hdr = {}; function setHdr(o) { _hdr = o || {}; }
  function newPage(orientation = doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight() ? 'landscape' : 'portrait') { doc.addPage('a4', orientation); header(_hdr); }
  const origAuto = doc.autoTable.bind(doc);
  doc.autoTable = (o) => origAuto({ ...o, willDrawPage: d => { if (d.pageNumber > 1) header(_hdr); o.willDrawPage?.(d); } });

  const instrumentsText = (I, withEarth = true) => [['Multifunction', I.multi], ['Insulation', I.ir], ['Continuity', I.continuity], ['Loop', I.loop], ['RCD', I.rcd], ...(withEarth ? [['Earth electrode', I.earth]] : [])]
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('   ') || '—';

  // ---------- Circuit schedules (landscape) ----------
  function boardSchedules(di, boardsList = job.boards || []) {
    for (const b of boardsList) {
      newPage('landscape');
      section(`Circuit schedule – board ${b.ref || ''}`, { numbered: false });
      const spd = Object.entries(b.spd || {}).filter(([, v]) => v).map(([k]) => (k === 'NA' ? 'N/A' : k)).join('+') || '';
      kv([
        ['Board', b.ref, 'Where it is', b.location, 'Fed from', b.suppliedFrom],
        ['Protective device feeding board', join([b.ocpdBsen, b.ocpdType, b.ocpdRating && `${b.ocpdRating} A`]), 'Surge protection type', spd, 'Main RCD', join([b.rcdBsen, b.rcdType, b.rcdRating && `${b.rcdRating} A`, b.rcdIdn && `${b.rcdIdn} mA`]) || 'N/A'],
        ['Zdb at board', b.zdb ? `${b.zdb} Ω` : '', 'Ipf at board', b.ipf ? `${b.ipf} kA` : '', 'Checked', join([b.polarityOk && 'Polarity OK', b.phaseSeqOk && 'Phase sequence OK', b.spdOk && 'SPD indicator OK'], '  ')],
        ['Tested by', String(di.name || '').toUpperCase(), 'Date tested', fmtDate(di.date), 'Instruments (serial no.)', instrumentsText(job.instruments || {})],
      ], [34, null, 28, null, 22, null]);
      const cs = b.circuits || [];
      const fs = 6.3;
      const hs = { fontSize: 6, halign: 'center', valign: 'middle' };
      table({
        head: [[{ content: 'Circuit', colSpan: 2 }, { content: 'Cables', colSpan: 6 }, { content: 'Protective device', colSpan: 4 }, { content: 'RCD', colSpan: 4 }, 'Limit'],
          ['No', 'Description', 'Wiring code', 'Ref. method', 'Points', 'Line mm²', 'cpc mm²', 'Disconnect (s)', 'Standard', 'Type', 'Rating A', 'Break kA', 'Standard', 'Type', 'IΔn mA', 'Rating A', 'Max Zs Ω']],
        body: cs.map(c => { const mz = circuitMaxZs(c); const T = k => c[k] && c.typ?.[k] ? `${c[k]}†` : c[k]; return [c.no, c.desc, T('wiring'), T('refMethod'), c.points, T('live'), T('cpc'), c.maxDisc, c.bsen, c.type, c.rating, c.bc, c.rcdBsen, c.rcdType, c.idn, c.rcdRating, mz != null ? String(mz) : '']; }),
        styles: { fontSize: fs, cellPadding: 0.9, halign: 'center' }, headStyles: hs,
        columnStyles: { 1: { halign: 'left', cellWidth: 52 }, 0: { cellWidth: 9 } },
      });
      if (cs.some(c => c.typ && Object.keys(c.typ).length)) note('† Assumed typical domestic value – not confirmed by inspection.', 6.5);
      note(`Wiring codes: ${Object.entries(WIRING_TYPES).map(([k, v]) => `${k} ${v}`).join(' · ')}. Max Zs limits are worked out from the device's instantaneous tripping current (0.95 × U0 ÷ Ia) per BS 7671 Chapter 41, unless entered by hand.`, 6);
      table({
        head: [[{ content: '', colSpan: 1 }, { content: 'Continuity (Ω)', colSpan: 5 }, { content: 'Insulation resistance', colSpan: 3 }, '', '', { content: 'RCD / AFDD', colSpan: 4 }, ''],
          ['No', 'Ring r1', 'Ring rn', 'Ring r2', 'R1+R2', 'R2', 'Test V', 'L–L MΩ', 'L–E MΩ', 'Polarity', 'Zs Ω', 'Trip ms', '5× ms', 'RCD button', 'AFDD button', 'Remarks']],
        body: cs.map(c => [c.no, c.r1, c.rn, c.r2, c.r1r2 && c.calc?.r1r2 ? `${c.r1r2}*` : c.r1r2, c.R2, c.testV, c.irLL, c.irLE, c.polarity, c.zs && c.calc?.zs ? `${c.zs}**` : c.zs, c.rcdTime, c.rcd5x, c.rcdBtn, c.afddBtn, c.remarks]),
        styles: { fontSize: fs, cellPadding: 0.9, halign: 'center' }, headStyles: hs,
        columnStyles: { 0: { cellWidth: 9 }, 15: { halign: 'left', cellWidth: 60 } },
      });
      if (cs.some(c => c.calc?.r1r2 || c.calc?.zs)) note(join([cs.some(c => c.calc?.r1r2) && '* R1+R2 worked out as Zs − Ze, not measured with a continuity test.', cs.some(c => c.calc?.zs) && '** Zs worked out as Ze + (R1+R2), not measured.'], '   '), 6.5);
    }
  }

  function footers() {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
      doc.setFillColor(...ORANGE); doc.rect(M, h - 13, 18, 0.6, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...MUTED);
      doc.text(pdfText(`${docNoLabel(_hdr)} ${job.reportNo || ''}  ·  ${job.installation?.address || job.client?.address || ''}`).slice(0, 110), M, h - 9.5);
      doc.text(`Page ${i} of ${n}`, w - M, h - 9.5, { align: 'right' });
      doc.setFontSize(6.2);
      doc.text(pdfText(`${BASED_ON}  ${LAYOUT_NOTE}  Made with CertPad.`), M, h - 6);
    }
  }

  // ---------- shared: supply / origin ----------
  function supplyBlock() {
    const s = job.supply || {};
    kv([
      ['Earthing system', s.earthing, 'Live conductors', `${s.acdc || ''} ${s.conductors || ''}`],
      ['Voltage U / U0', `${s.u || ''} / ${s.u0 || ''} V`, 'Frequency', s.freq ? `${s.freq} Hz` : ''],
      ['Prospective fault current (Ipf)', s.ipf ? `${s.ipf} kA` : '', 'External loop impedance (Ze)', s.ze ? `${s.ze} Ω` : ''],
      ['Supply polarity checked', yn(s.polarityConfirmed) || 'No', 'Other supplies (e.g. solar, battery)', s.otherSources ? 'Yes – see extra sheet' : 'None'],
      ["Supplier's fuse / device", s.deviceBsen, 'Type / rating', join([s.deviceType, s.deviceRating && `${s.deviceRating} A`])],
    ]);
  }
  function originBlock(withLightning = false) {
    const o = job.origin || {};
    kv([
      ['Earth provided by', o.meansEarthing, 'Maximum demand', o.maxDemand ? `${o.maxDemand} ${o.maxDemandUnit || 'A'}` : ''],
      ['Earth electrode (type / where)', join([o.electrodeType, o.electrodeLocation]) || 'N/A', 'Electrode resistance RA', o.electrodeRa ? `${o.electrodeRa} Ω` : 'N/A'],
      ['Earthing conductor', `${o.earthingMaterial || ''} ${o.earthingCsa ? o.earthingCsa + ' mm²' : ''}`, 'Connection checked', yn(o.earthingVerified) || 'No'],
      ['Main bonding conductors', `${o.bondingMaterial || ''} ${o.bondingCsa ? o.bondingCsa + ' mm²' : ''}`, 'Connections checked', yn(o.bondingVerified) || 'No'],
    ]);
    const head = ['Bonded: water', 'Gas', 'Oil', 'Structural steel', ...(withLightning ? ['Lightning protection'] : []), 'Other'];
    const row = [o.bondWater || '', o.bondGas || '', o.bondOil || '', o.bondSteel || '', ...(withLightning ? [o.bondLightning || ''] : []), join([o.bondOther, o.bondOtherSpec], ' ')];
    table({ head: [head], body: [row], styles: { halign: 'center', fontSize: 8 }, headStyles: { fillColor: PALE, textColor: NAVY, fontSize: 7, halign: 'center' } });
    kv([
      ['Main switch type', o.msDevice, 'Where it is', o.msLocation],
      ['Standard (BS / EN)', o.msBsen, 'Poles', o.msPoles],
      ['Current rating', o.msCurrent ? `${o.msCurrent} A` : '', 'Voltage rating', o.msVoltage ? `${o.msVoltage} V` : ''],
      ['If an RCD: type / IΔn', join([o.msRcdType, o.msIdn && `${o.msIdn} mA`]) || 'N/A', 'RCD trip time at IΔn', o.msRcdTime ? `${o.msRcdTime} ms` : 'N/A'],
    ]);
  }
  function ownerNotes(list, title = 'Notes for the property owner') {
    newPage(); section(title, { numbered: false });
    table({ theme: 'plain', body: list.map((g, i) => [String(i + 1), g]), styles: { fontSize: 8.4, cellPadding: 1.6 }, columnStyles: { 0: { cellWidth: 8, fontStyle: 'bold', textColor: ORANGE } } });
  }
  const careNotes = () => [
    'RCDs and RCBOs: every six months, press the test button (marked T or Test). It should switch off straight away. Switch it back on afterwards. If it does not switch off, ask an electrician to check it.',
    'AFDDs (arc fault devices) with a test button: test them every six months in the way the maker\'s instructions describe.',
    'Surge protection (SPD): glance at the status window now and then. If it shows the device has failed, ask an electrician to check it.',
    'If the property has another source of power (for example solar panels, a battery or a generator), warning labels should be fitted at the meter or consumer unit and wherever that supply can be switched off.',
  ];
  function savedSigFor(name) {
    const mine = settings.inspector?.signature; const myName = String(settings.inspector?.name || '').trim().toUpperCase();
    return mine && (!name || String(name).trim().toUpperCase() === myName) ? mine : '';
  }
  function sigTable(rows) { // rows: [{role, name, date, sig, extra:[[label,value]]}]
    const body = []; const sigIdx = [];
    rows.forEach(r => {
      body.push([{ content: r.role, colSpan: 4, styles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', fontSize: 7.5 } }]);
      sigIdx.push({ i: body.length, img: r.sig });
      body.push(['Signed', '', 'Date', fmtDate(r.date)]);
      body.push(['Name', String(r.name || '').toUpperCase(), 'Company', con.name || '']);
      for (const [a, b2] of r.extra || []) body.push([a, { content: b2, colSpan: 3 }]);
    });
    const lab = { cellWidth: 30, fontSize: 7, textColor: MUTED };
    table({ theme: 'plain', body, styles: { lineWidth: { bottom: 0.15 }, lineColor: RULE }, columnStyles: { 0: lab, 1: { fontStyle: 'bold' }, 2: { ...lab, cellWidth: 22 }, 3: { fontStyle: 'bold' } },
      didParseCell: d => { if (d.section === 'body' && sigIdx.some(x => x.i === d.row.index)) d.cell.styles.minCellHeight = 14; },
      didDrawCell: d => { const m = sigIdx.find(x => x.i === d.row.index); if (d.section === 'body' && m && d.column.index === 1 && m.img) { try { doc.addImage(m.img, imgFormat(m.img), d.cell.x + 1, d.cell.y + 1, Math.min(d.cell.width - 2, 40), d.cell.height - 2); } catch { /* ignore */ } } } });
  }

  if (job.kind === 'eic' || job.kind === 'ev') return eicBody();
  if (job.kind === 'mw') return mwBody();
  if (job.kind === 'sched') return schedBody();
  return eicrBody();

  // ================= EICR =================
  function eicrBody() {
    const assess = overallAssessment(job);
    header();
    const ok = assess === 'SATISFACTORY';
    const col = ok ? GREEN : RED;
    panel(job.summary?.general ? `General condition: ${job.summary.general}` : 'General condition: not recorded.', col, { title: 'RESULT – is the installation safe to keep using?', big: assess });
    note(ed.fiUnsatisfactory
      ? 'The result is UNSATISFACTORY if anything has been coded C1 (danger now), C2 (could become dangerous) or FI (needs further investigation). Those items need dealing with urgently.'
      : 'The result is UNSATISFACTORY if anything has been coded C1 (danger now) or C2 (could become dangerous); those items need dealing with urgently. C3 and FI items do not change the result, but you should still act on them.', 7);
    kv([['Next inspection due by', fmtDate(job.next?.date), 'Interval', job.next?.intervalYears ? `${job.next.intervalYears} years` : ''], ['Why this interval', { content: job.next?.reasons, colSpan: 3 }]]);
    note('This date assumes any work recommended in this report is done. Have the installation checked sooner if it is altered, damaged or the property starts being used differently.', 6.8);

    section('Who the report is for');
    kv([['Name', job.client?.name, 'Address', job.client?.address],
      ['Purpose of the report', { content: job.reason, colSpan: 3 }],
      ['Inspected on', { content: String(job.inspDates || '').split(/[,;]/).map(s => fmtDate(s.trim())).join(', '), colSpan: 3 }]]);
    section('The property');
    const ins = job.installation || {};
    kv([
      ['Address', ins.address, 'Occupier', ins.occupier],
      ['Type of premises', ins.premises === 'Other' ? `Other: ${ins.premisesOther}` : ins.premises, 'Approx. age of wiring', ins.wiringAge ? `${ins.wiringAge} years` : ''],
      ['Signs of later additions or changes', ins.alterations === 'Yes' ? `Yes${ins.alterationsAge ? ` – about ${ins.alterationsAge} years ago` : ''}` : ins.alterations, 'Previous records available (651.1)', ins.records],
      ['Last inspected', fmtDate(ins.lastInspection) || 'Not known', '', ''],
    ]);
    section('Scope – what was and was not checked');
    const ex = job.extent || {};
    kv([
      ['Parts of the installation covered', { content: ex.covered, colSpan: 3 }],
      ['Limits agreed beforehand, and why', { content: ex.limitations || 'None', colSpan: 3 }],
      ['Limits agreed with', { content: ex.agreedWith, colSpan: 3 }],
      ['Limits found on the day, and why', { content: ex.operational || 'None', colSpan: 3 }],
    ]);
    note(`Unless agreed otherwise beforehand, wiring hidden inside the building – in walls, floors, roof spaces, trunking, conduit or underground – was not exposed for inspection, and equipment was not checked against manufacturer recalls or safety notices. Inspection and testing followed ${std} (amendments up to ${amended}).`);

    section('Supply and earthing');
    supplyBlock();
    section('Main switch, earthing and bonding');
    originBlock(false);

    // Sign-off
    if (y > H() - 95) newPage();
    section('Sign-off');
    panel('I/We carried out the inspection and testing recorded in this report with reasonable skill and care. To the best of my/our knowledge, the report – including its findings and attached schedules – is an accurate account of the condition of the installation, within the scope and limits set out in section 3.', NAVY, { title: 'Declaration' });
    const di = job.declaration?.inspector || {}; const da = job.declaration?.authoriser || {};
    const insSig = di.useSaved && settings.inspector?.signature ? settings.inspector.signature : di.signature;
    const auth = da.sameAsInspector ? { ...di, signature: insSig } : da;
    const forOf = con.name || '';
    const sigs = [insSig, auth.signature];
    const lab = { cellWidth: 22, fontSize: 7, textColor: MUTED };
    table({
      theme: 'plain', styles: { lineWidth: { bottom: 0.15 }, lineColor: RULE },
      head: [[{ content: 'Inspector', colSpan: 2 }, { content: 'Approved for issue by', colSpan: 2 }]],
      body: [
        ['Name', String(di.name || '').toUpperCase(), 'Name', String(auth.name || '').toUpperCase()],
        ['Signed', '', 'Signed', ''],
        ['Role', di.position, 'Role', auth.position],
        ['Company', forOf, 'Company', forOf],
        ['Address', con.address, 'Address', con.address],
        ['Date', fmtDate(di.date), 'Date', fmtDate(auth.date)],
      ],
      columnStyles: { 0: lab, 1: { fontStyle: 'bold' }, 2: lab, 3: { fontStyle: 'bold' } },
      didParseCell: d => { if (d.section === 'body' && d.row.index === 1) d.cell.styles.minCellHeight = 16; },
      didDrawCell: d => {
        if (d.section === 'body' && d.row.index === 1 && (d.column.index === 1 || d.column.index === 3)) {
          const img = sigs[d.column.index === 1 ? 0 : 1];
          if (img) { try { doc.addImage(img, imgFormat(img), d.cell.x + 1, d.cell.y + 1, Math.min(d.cell.width - 2, 42), d.cell.height - 2); } catch { /* ignore */ } }
        }
      },
    });
    const nb = job.boards?.length || 0;
    note(`This report is made up of: these summary pages, Findings, the Inspection checklist (1), Circuit schedules (${nb} board${nb === 1 ? '' : 's'}) and Notes for the property owner. It is only complete with all of them.`);

    // Findings
    newPage();
    section('Findings', { numbered: false });
    const obs = sortObservations(job.observations || []);
    const numbered = obs.map((x, i) => ({ ...x, n: i + 1 }));
    if (!obs.length || job.noRemedial) note('Nothing needs putting right.', 9, NAVY);
    else note('These findings relate to the schedules attached and to the scope in section 3. Photos may be attached as supporting evidence.', 7.5);
    table({ theme: 'plain', body: [
      [{ content: 'C1', styles: { textColor: RED, fontStyle: 'bold' } }, 'Danger now – risk of injury. Put right immediately.', { content: 'C2', styles: { textColor: RED, fontStyle: 'bold' } }, 'Could become dangerous. Put right urgently.'],
      [{ content: 'C3', styles: { textColor: AMBER, fontStyle: 'bold' } }, 'Improvement recommended.', { content: 'FI', styles: { textColor: NAVY, fontStyle: 'bold' } }, 'Could not be confirmed within the scope – investigate as soon as possible.'],
    ], styles: { fontSize: 7.2, cellPadding: 1 }, columnStyles: { 0: { cellWidth: 9 }, 2: { cellWidth: 9 } } });
    const obsTable = (title, list) => {
      table({
        head: [[{ content: title, colSpan: 6, styles: { fillColor: PALE, textColor: NAVY } }], ['#', 'What was found', 'Where', 'Checklist ref', 'Code', 'Regulation']],
        body: list.length ? list.map(x => [String(x.n), x.desc, x.location || '', [...new Set((x.items || []).map(i => i.replace(/[a-g]$/, '')))].concat(x.schedRef ? [x.schedRef] : []).join(', '), x.code, x.reg || '']) : [[{ content: 'None', colSpan: 6, styles: { textColor: 120 } }]],
        columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 32 }, 3: { cellWidth: 18, halign: 'center' }, 4: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, 5: { cellWidth: 22 } },
        didParseCell: d => { if (d.section === 'body' && d.column.index === 4) { const c = d.cell.raw; d.cell.styles.textColor = c === 'C1' || c === 'C2' ? RED : c === 'C3' ? AMBER : NAVY; } },
      });
    };
    obsTable('Items that make the result unsatisfactory (C1, C2)', numbered.filter(x => x.code === 'C1' || x.code === 'C2'));
    obsTable(ed.fiUnsatisfactory ? 'Other items (C3 is advisory; FI also makes the result unsatisfactory)' : 'Advisory items (C3, FI) – do not change the result', numbered.filter(x => x.code === 'C3' || x.code === 'FI'));

    // Inspection checklist
    newPage();
    section('Inspection checklist – homes and similar premises (supply up to 100 A)', { numbered: false });
    note('Key: tick = acceptable · C1 / C2 = unacceptable · C3 = improvement recommended · FI = investigate further · N/V = not verified · LIM = limited · N/A = not applicable · X = intake shortcoming. Anything coded is listed in Findings.');
    const body = [];
    for (const g of INSPECTION_GROUPS) {
      body.push([{ content: `${g.id}   ${g.title}`, colSpan: 3, styles: { fillColor: PALE, fontStyle: 'bold', textColor: NAVY } }]);
      for (const [id, text] of g.items) { const r = job.inspection?.[id] || {}; const ks = numbered.filter(x => (x.items || []).includes(id)).map(x => x.n); body.push([id.replace(/[a-g]$/, ''), xref(text) + (r.note ? `  – ${r.note}` : '') + (ks.length ? `  [Finding ${ks.join(', ')}]` : ''), r.o || '']); }
    }
    table({ theme: 'plain', head: [['Ref', 'Check', 'Result']], body, styles: { fontSize: 7.1, cellPadding: 0.9, lineWidth: { bottom: 0.1 }, lineColor: RULE }, columnStyles: { 0: { cellWidth: 11, textColor: MUTED }, 2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' } },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 2) { const c = d.cell.raw; if (/C1|C2|X/.test(c)) d.cell.styles.textColor = RED; } } });

    boardSchedules(job.declaration?.inspector || {});

    ownerNotes([
      'Keep this report somewhere safe. It records what condition the wiring was in on the day it was checked, and the next electrician will want to see it. Pass it on if the property changes hands.',
      'This is a check of existing wiring. It does not certify new work – a new circuit or consumer unit should come with an Electrical Installation Certificate.',
      'C1 means there is a danger now and it must be fixed straight away. C2 means something could become dangerous and should be fixed urgently. Either one makes the result unsatisfactory.',
      ed.fiUnsatisfactory ? 'FI means something needs investigating without delay. It also makes the result unsatisfactory.' : 'FI means something could not be confirmed within the scope of this inspection. It does not change the result, but it should be looked into soon. Landlords should be aware that investigative work may still be required within 28 days.',
      'C3 means an improvement is recommended. The installation is not unsafe because of it, but doing the work will make it safer.',
      'Get any repairs done by a competent electrician, and ask for a certificate for that work (an Electrical Installation Certificate or a Minor Works Certificate).',
      'Wiring put in under an older edition of the Wiring Regulations is not automatically unsafe just because it differs from today\'s rules.',
      `Have the installation checked again by the date on page 1${job.next?.date ? ` (${fmtDate(job.next.date)})` : ''}, or sooner if it is changed, damaged or used differently.`,
      ...careNotes().slice(0, 3),
      'Do not take covers off the consumer unit, sockets or switches. If you notice scorch marks, a burning smell, buzzing, or damaged sockets or cables, switch off and call an electrician.',
      'Landlords: give tenants a copy of this report and keep one for the next inspector, as current rules require.',
    ]);
    footers(); return doc;
  }

  // ================= EIC =================
  function eicBody() {
    const isEv = job.kind === 'ev';
    setHdr({ title: isEv ? 'Electrical Installation Certificate – EV charge point' : 'Electrical Installation Certificate', noLabel: 'Certificate no.' });
    header(_hdr);
    const e = job.eic || {}; const ins = job.installation || {};
    note(`Certificate for new electrical work, made to ${std}. The original goes to the person who ordered the work; the contractor keeps a copy.`, 7);
    section('Client and installation');
    kv([['Client', job.client?.name, 'Client address', job.client?.address],
      ['Installation address', { content: ins.address, colSpan: 3 }]]);
    section('The work');
    kv([
      ['What was installed', { content: e.description, colSpan: 3 }],
      ['Parts this certificate covers', { content: job.extent?.covered, colSpan: 3 }],
      ['Type of work', { content: ['New installation', 'Addition to an existing installation', 'Alteration to an existing installation'].map(t => (t.startsWith(e.installType || 'New') ? '[X] ' : '[  ] ') + t).join('     '), colSpan: 3 }],
      ['Comments on the existing installation (644.1.2)', { content: e.commentsExisting || (e.installType && !/^New/.test(e.installType) ? 'None' : 'N/A – new installation'), colSpan: 3 }],
    ]);
    section('Supply and earthing');
    supplyBlock();
    section('Main switch, earthing and bonding');
    originBlock(true);

    if (y > H() - 90) newPage();
    section('Sign-off');
    const decl = role => `Signed for the ${role}. The ${role} work I/we were responsible for, as described in this certificate, was carried out with reasonable skill and care. To the best of my/our knowledge it meets ${std.replace(/\+A.*/, '')} as amended to ${amended}, apart from any departures listed.`;
    const dep = t => t || 'None';
    const exc = () => (e.exceptions || 'None') + (e.riskAssessment ? '   [Risk assessment attached]' : '');
    if (e.singleSignature) {
      panel(`One person was responsible for the design, construction, and inspection and testing of this work. ${decl('design, construction, inspection and testing')}`, NAVY, { title: 'Declaration – single signatory' });
      const who = e.inspection?.name || job.declaration?.inspector?.name || settings.inspector?.name;
      sigTable([{ role: 'Design, construction, inspection and testing', name: who, date: e.inspection?.date, sig: savedSigFor(who),
        extra: [['Departures from BS 7671 (120.3, 133.1.2, 133.1.3, 133.5)', dep(e.departures)], ['Permitted exceptions (411.3.3)', exc()]] }]);
    } else {
      panel(decl('design'), NAVY, { title: 'Design' });
      const rows = [{ role: 'Designer 1', name: e.design?.name, date: e.design?.date, sig: savedSigFor(e.design?.name),
        extra: [['Departures from BS 7671', dep(e.design?.departures || e.departures)], ['Permitted exceptions (411.3.3)', exc()]] }];
      if (e.design2?.name) rows.push({ role: 'Designer 2 (shared responsibility)', name: e.design2.name, date: e.design2.date, sig: savedSigFor(e.design2.name), extra: [] });
      sigTable(rows);
      panel(decl('construction'), NAVY, { title: 'Construction' });
      sigTable([{ role: 'Installer', name: e.construction?.name, date: e.construction?.date, sig: savedSigFor(e.construction?.name), extra: [['Departures from BS 7671', dep(e.construction?.departures)]] }]);
      panel(decl('inspection and testing'), NAVY, { title: 'Inspection and testing' });
      sigTable([{ role: 'Inspector', name: e.inspection?.name, date: e.inspection?.date, sig: savedSigFor(e.inspection?.name), extra: [['Departures from BS 7671', dep(e.inspection?.departures)]] }]);
    }
    note('Each person signing is responsible only for the work they have signed for on this certificate.', 6.8);
    kv([['Company', con.name, 'Phone', con.phone], ['Address', { content: con.address, colSpan: 3 }], ['Scheme / registration no.', { content: join([con.scheme, con.regNo], ' · '), colSpan: 3 }]]);

    section('Next inspection and attached documents');
    const nb = job.boards?.length || 0;
    kv([['Recommended time until first inspection', { content: job.next?.intervalYears ? `${job.next.intervalYears} years` : '', colSpan: 3 }]]);
    note(`This certificate is made up of: these pages, the Inspection checklist, ${isEv ? 'the EV charge point supplement, ' : ''}${nb} circuit schedule(s) and Notes for the property owner. It is only valid with all of them attached.`);

    if (y > H() - 90) newPage();
    section('Inspection checklist');
    note('Key: tick = checked and acceptable · N/A = does not apply. Every relevant item must be checked for new work.', 7);
    const ei = job.eicInspection || {};
    table({ theme: 'plain', head: [['Ref', 'Area checked', 'Result']], body: EIC_ITEMS.map(([id, t]) => [id, t, ei[id] || '']), styles: { fontSize: 7.6, lineWidth: { bottom: 0.1 }, lineColor: RULE }, columnStyles: { 0: { cellWidth: 12, textColor: MUTED }, 2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' } } });

    if (isEv) evSupplement();
    boardSchedules({ name: e.inspection?.name || job.declaration?.inspector?.name, date: e.inspection?.date });
    ownerNotes([
      'This certificate confirms that the new electrical work described in it was designed, installed, inspected and tested to BS 7671.',
      'You should have the original. The contractor keeps a copy. If you ordered the work but do not own the property, give the owner this certificate (or a full copy with all its schedules) straight away.',
      'Keep it somewhere safe and show it to anyone who inspects or works on the installation later. If you sell or move out, it shows the next occupier the work met BS 7671 when it was done.',
      'This certificate is only for new work, additions or alterations. To check an existing installation, ask for an Electrical Installation Condition Report.',
      `The installation should be inspected regularly by a qualified electrician – the first time within the period shown under "Next inspection"${job.next?.intervalYears ? ` (${job.next.intervalYears} years)` : ''}.`,
      ...careNotes(),
    ]);
    footers(); return doc;
  }

  function evSupplement() {
    const v = job.ev || {}; const yesNo = b => (b ? 'Yes' : 'No');
    newPage('portrait');
    section('EV charge point supplement (BS 7671 Section 722)', { numbered: false });
    note(`Part of certificate ${job.reportNo || ''}. Records the extra checks needed for electric vehicle charging equipment.`, 7);
    const sub = t => { note(t, 8.5, NAVY); y -= 0.5; };
    sub('Charger');
    kv([['Make', v.make, 'Model', v.model], ['Serial no.', v.serial, 'Rated power', v.powerKw ? v.powerKw + ' kW' : ''],
      ['Charging mode', v.mode, 'Outlet', v.outlet], ['Connector', v.connector, 'Supply', v.phases],
      ['Location', v.location, 'IP / IK rating', join([v.ipRating, v.ikRating])]]);
    sub('Earthing and PME (722.411.4.1)');
    kv([['Supply earthing', job.supply?.earthing, 'Method used', v.pmeMethod],
      ['Device details', { content: v.pmeNotes, colSpan: 3 }],
      ['Electrode type', v.electrodeType, 'Electrode Ra (Ω)', v.electrodeRa], ['Electrode location', { content: v.electrodeLocation, colSpan: 3 }]]);
    if (evPmeRisk(job)) panel('PME earthing is recorded without one of the methods allowed by 722.411.4.1. Check this before issuing.', RED, { title: 'Warning' });
    sub('Protection');
    kv([['RCD / DC fault protection', { content: v.rcdType, colSpan: 3 }], ['RCD IΔn', v.rcdIdn ? v.rcdIdn + ' mA' : '', 'Protective device', join([v.deviceBsen && 'BS EN ' + v.deviceBsen, v.deviceType && 'Type ' + v.deviceType, v.deviceRating && v.deviceRating + ' A'], ' ')]]);
    sub('Circuit cable');
    kv([['Cable type', v.cableType, 'Line / cpc size', join([v.cableCsa, v.cpcCsa]) + ((v.cableCsa || v.cpcCsa) ? ' mm²' : '')],
      ['Length', v.cableLength ? v.cableLength + ' m' : '', 'Reference method', v.refMethod], ['Route', v.cableRoute, 'Voltage drop', v.vdPct ? v.vdPct + ' %' : '']]);
    sub('Maximum demand and load management');
    kv([['Supply fuse', v.supplyFuseA ? v.supplyFuseA + ' A' : '', 'Max demand with charger', v.maxDemandA ? v.maxDemandA + ' A' : ''],
      ['Load management', v.loadMgmt, 'CT clamp checked', yesNo(v.ctClamp)], ['Assessment', { content: v.admdNotes, colSpan: 3 }]]);
    sub('Network operator (DNO) notification');
    kv([['Method', v.dnoMethod, 'DNO', v.dno], ['Date', fmtDate(v.dnoDate), 'Reference', v.dnoRef]]);
    sub('Smart charging (Smart Charge Points Regulations 2021)');
    kv([['Compliant charger', yesNo(v.smartCompliant), 'Off-peak default hours', yesNo(v.offPeakDefault)], ['Randomised delay', yesNo(v.randomDelay), 'Notes', v.smartNotes]]);
    sub('Commissioning and handover');
    kv([['Test charge done', yesNo(v.commissioned), 'Connectivity', v.wifiApp], ['Firmware', v.firmware, 'Photos on file', yesNo(v.photos)],
      ['Customer shown how to use it', yesNo(v.customerShown), 'Instructions left', yesNo(v.manualsLeft)], ['Handover complete', yesNo(v.handover), 'Notes', v.notes]]);
  }

  // ================= MINOR WORKS =================
  function mwBody() {
    setHdr({ title: 'Minor Works Certificate', noLabel: 'Certificate no.' });
    header(_hdr);
    const w = job.mw || {}; const ins = job.installation || {}; const b0 = job.boards?.[0] || {}; const o = job.origin || {};
    note('For small jobs on an existing circuit only. Work that adds a new circuit needs an Electrical Installation Certificate instead.', 7.5, NAVY);
    section('The job');
    kv([
      ['Client', job.client?.name, 'Date finished', fmtDate(w.completed)],
      ['Address of the work', { content: ins.address, colSpan: 3 }],
      ['What was done', { content: w.description, colSpan: 3 }],
      [`Departures from ${std.replace(/\+A.*/, '')} as amended to ${amended} (120.3, 133.1.2, 133.1.3, 133.5)`, { content: w.departures || 'None', colSpan: 3 }],
      ['Permitted exceptions (411.3.3)', { content: (w.exceptions || 'None') + (w.riskAssessment ? '   [Risk assessment attached]' : ''), colSpan: 3 }],
      ['Comments on the existing installation, incl. defects seen (644.1.2)', { content: w.commentsExisting || 'None', colSpan: 3 }],
    ], [50, null, 30, null]);
    section('Earthing and bonding present and adequate (132.16)');
    const arr = ['TN-S', 'TN-C-S (PME)', 'TN-C-S (PNB)', 'TT', 'TN-C', 'IT'];
    kv([
      ['Earthing system', { content: arr.map(a => (job.supply?.earthing === a ? '[X] ' : '[  ] ') + a).join('    '), colSpan: 3 }],
      ['Zdb at the board feeding the circuit', b0.zdb ? `${b0.zdb} Ω` : '', 'Earthing conductor present and adequate', yn(o.earthingVerified) || 'No'],
      ['Main bonding to', { content: [['Water', o.bondWater], ['Gas', o.bondGas], ['Oil', o.bondOil], ['Structural steel', o.bondSteel], ['Other', join([o.bondOther, o.bondOtherSpec], ' ')]].map(([k, v]) => `${k}: ${v || '–'}`).join('    '), colSpan: 3 }],
    ], [50, null, 42, null]);
    const cs = (b0.circuits || []).slice(0, 4);
    cs.forEach((c, i) => {
      if (i > 0 && y > H() - 110) newPage();
      section(`Circuit worked on${cs.length > 1 ? ` (${i + 1} of ${cs.length})` : ''} – details and test results`);
      kv([
        ['Board', b0.ref, 'Board location / type', b0.location],
        ['Circuit no.', c.no, 'Description', c.desc],
        ['Reference method (Table 4A2)', c.refMethod, 'Line / cpc size (mm²)', join([c.live, c.cpc])],
        ['Protective device standard / type', join([c.bsen, c.type]), 'Rating / breaking capacity', join([c.rating && `${c.rating} A`, c.bc && `${c.bc} kA`])],
        ['RCD standard / type / rating', join([c.rcdBsen, c.rcdType, c.rcdRating && `${c.rcdRating} A`]) || 'N/A', 'IΔn / time delay', join([c.idn && `${c.idn} mA`, c.rcdDelay && `${c.rcdDelay} ms`]) || 'N/A'],
        ['AFDD standard / rating', join([c.afddBsen, c.afddRating && `${c.afddRating} A`]) || 'N/A', 'SPD standard / type', join([c.spdBsen, c.spdType]) || 'N/A'],
      ], [44, null, 40, null]);
      kv([
        ['Continuity R1+R2', c.r1r2 ? `${c.r1r2}${c.calc?.r1r2 ? '*' : ''} Ω` : '', 'or R2', c.R2 ? `${c.R2} Ω` : ''],
        ['Ring r1 / rn / r2', [c.r1, c.rn, c.r2].map(v => v || '–').join(' / ') + ' Ω', 'Insulation test voltage', c.testV ? `${c.testV} V` : ''],
        ['Insulation L–L', c.irLL ? `${c.irLL} MΩ` : '', 'Insulation L–E', c.irLE ? `${c.irLE} MΩ` : ''],
        ['Polarity correct', c.polarity || '', 'Highest measured Zs', c.zs ? `${c.zs}${c.calc?.zs ? '**' : ''} Ω` : ''],
        ['RCD trip time at IΔn', c.rcdTime ? `${c.rcdTime} ms` : 'N/A', 'RCD test button works', c.rcdBtn || 'N/A'],
        ['AFDD test button works', c.afddBtn || 'N/A', 'SPD working', c.spdOk || 'N/A'],
      ], [44, null, 40, null]);
    });
    if (cs.some(c => c.calc?.r1r2 || c.calc?.zs)) note('* R1+R2 worked out as Zs − Ze, not measured.   ** Zs worked out as Ze + (R1+R2), not measured.', 6.5);
    if (y > H() - 80) newPage();
    section('Sign-off');
    panel(`I confirm that the work described on this certificate was designed, carried out, inspected and tested to ${std.replace(/\+A.*/, '')} as amended to ${amended}; that to the best of my knowledge, when I inspected it, it complied with BS 7671 apart from any departures listed in section 1; and that it does not reduce the safety of the existing installation.`, NAVY, { title: 'Declaration' });
    const di = job.declaration?.inspector || {};
    const sig = di.useSaved && settings.inspector?.signature ? settings.inspector.signature : di.signature;
    sigTable([{ role: 'Signed by', name: di.name, date: di.date, sig, extra: [['Role', di.position], ['Address', con.address], ['Instruments (serial no.)', instrumentsText(job.instruments || {}, false)]] }]);
    ownerNotes([
      'This certificate confirms that the small job described in it was designed, carried out, inspected and tested to BS 7671.',
      'You should have the original. The contractor keeps a copy. If you ordered the work but do not own the property, give the owner this certificate or a copy.',
      'Each existing circuit that was worked on should have its own certificate. If the job included a new circuit or a new consumer unit, you should have an Electrical Installation Certificate instead.',
      'Keep it somewhere safe and show it to anyone who inspects or works on the installation later.',
      'The installation should be inspected regularly by a qualified electrician.',
      ...careNotes(),
    ]);
    footers(); return doc;
  }

  // ================= standalone schedule =================
  function schedBody() {
    setHdr({ title: 'Circuit Schedule (continuation)', noLabel: 'Schedule no.' });
    header(_hdr);
    const sc = job.sched || {};
    section('Continuation schedule', { numbered: false });
    kv([['Belongs to certificate / report no.', sc.parentRef || '', 'Document type', sc.parentType || ''], ['Installation address', { content: job.installation?.address, colSpan: 3 }]]);
    note(`This schedule is part of ${sc.parentType || 'the certificate/report'} no. ${sc.parentRef || '…'} and is only valid when attached to it.`);
    boardSchedules(job.declaration?.inspector || {});
    footers(); return doc;
  }
}

import { db } from './db.js';
import { newJob, newEic, newMw, newEv, newBoard, newCircuit, defaultSettings, uid, addYears, today } from './model.js';
import { KINDS, kindOf, kindMeta, isEicLike } from './kinds.js';
import { EDITIONS, INSPECTION_GROUPS, INSPECTION_ITEMS, DOMESTIC_TEMPLATE, OBS_LIBRARY, QUICK_CIRCUITS, WIRING_TYPES, CODES, EIC_ITEMS, EV_PME_OPTIONS, EV_RCD_OPTIONS, EV_DNO_OPTIONS, EV_POWER, EV_CONNECTORS, EV_LOADMGMT, EV_CABLES, evPmeRisk } from './presets.js';
import { validateJob, overallAssessment, checkCircuit, circuitMaxZs, codeCounts, sortObservations, summariseIssues } from './validate.js';
import { tableMaxZs } from './zs.js';
import { buildReport } from './pdf.js';
import { sampleJob } from './sample.js';
import { allocateRef, planRestore, isDuplicate, maxRefNum, DEFAULT_REF_PREFIX, cleanPrefix } from './refno.js';
import { planDomestic, markTyp, DEFAULT_RULES_TEXT } from './domestic.js';
import { ai, AI_TIMEOUT_MS, aiCfg, PROVIDERS, getKey, setKey, planImport, markImported, boardPlan } from './ai.js';
import { parseDictation, FIELD_LABELS } from './voice.js';
import { boardZe, calcR1R2, calcZs, planCalcAll, markCalc } from './calc.js';
import { planFill, applyFill, COMMON_VALUES, isSpare } from './fill.js';
import { suggestItems, recalcSchedule, migrate, linkedObs, setItemOutcome, itemText, displayId } from './links.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let main = $('#main');
function fresh() { const m = main.cloneNode(false); main.replaceWith(m); main = m; }
let settings = defaultSettings();
let job = null;
let saveTimer = null;
let currentBoard = 0;
let currentTab = 'client';
let selRow = null;

// ---------- path helpers ----------
const getP = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setP(o, p, v) { const ks = p.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; }

function toast(msg, ms = 2200, action) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  if (action) { const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'margin-left:10px;min-height:38px'; b.textContent = action.label; b.onclick = () => { t.hidden = true; action.fn(); }; t.appendChild(b); }
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), ms);
}
function saved(state) { $('#saveState').textContent = state; }

async function saveSettings() { await db.setKV('settings', settings); }
function scheduleSave() {
  if (!job) return; saved('…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => { job.updated = Date.now(); await db.putJob(job); saved('Saved ✓'); refreshHeader(); }, 400);
}
window.addEventListener('pagehide', () => { if (job) db.putJob(job); });

// ---------- generic fields ----------
function fld(path, label, opts = {}) {
  const v = getP(opts.obj || job, path) ?? '';
  const t = opts.type || 'text';
  const scope = opts.scope ? ` data-scope="${opts.scope}"` : '';
  const ph = opts.ph ? ` placeholder="${esc(opts.ph)}"` : '';
  const list = opts.list ? ` list="dl-${path.replace(/\W/g, '')}"` : '';
  const dl = opts.list ? `<datalist id="dl-${path.replace(/\W/g, '')}">${opts.list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
  let ctrl;
  if (t === 'textarea') ctrl = `<textarea data-p="${path}"${scope}${ph}>${esc(v)}</textarea>`;
  else if (t === 'select') ctrl = `<select data-p="${path}"${scope}>${opts.options.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(v) === String(val) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  else if (t === 'seg') return `<div class="f" style="margin-bottom:12px"><label class="f" style="margin:0 0 4px"><span>${esc(label)}</span></label><div class="seg" data-segp="${path}"${scope}>${opts.options.map(o => `<button type="button" data-v="${esc(o)}" class="${String(v) === o ? 'on' : ''} ${o.toLowerCase().replace(/[^a-z0-9]/g, '')}">${esc(o)}</button>`).join('')}</div></div>`;
  else if (t === 'check') return `<label class="chk"><input type="checkbox" data-p="${path}"${scope}${v ? ' checked' : ''}> ${esc(label)}</label>`;
  else {
    const im = t === 'num' ? ' inputmode="decimal"' : t === 'tel' ? ' inputmode="tel"' : '';
    ctrl = `<input type="${t === 'num' || t === 'tel' ? 'text' : t}"${im} data-p="${path}"${scope}${ph}${list} value="${esc(v)}">${dl}`;
  }
  return `<label class="f"><span>${esc(label)}</span>${ctrl}</label>`;
}

function bindFields(root, obj, onChange) {
  root.addEventListener('input', e => {
    const el = e.target; const p = el.dataset.p; if (!p) return;
    const target = el.dataset.scope === 'settings' ? settings : obj;
    setP(target, p, el.type === 'checkbox' ? el.checked : el.value);
    onChange?.(p, el);
    if (target === settings) saveSettings(); else scheduleSave();
  });
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-segp] button'); if (!b) return;
    const wrap = b.parentElement; const p = wrap.dataset.segp;
    const target = wrap.dataset.scope === 'settings' ? settings : obj;
    const nv = b.classList.contains('on') && !wrap.dataset.req ? '' : b.dataset.v;
    setP(target, p, nv);
    wrap.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b && nv !== ''));
    onChange?.(p, b);
    if (target === settings) saveSettings(); else scheduleSave();
  });
}

// ---------- routing ----------
const TAB_LABELS = { client: 'Client & site', extent: 'Extent', supply: 'Supply & origin', inspection: 'Inspection', boards: 'Circuits', observations: 'Observations', ev: 'EV charger', summary: 'Summary & sign', check: 'Check & PDF' };
const TABS_FOR = j => (kindMeta(j).tabs || []).map(k => [k, TAB_LABELS[k] || k]);
async function route() {
  const h = location.hash.slice(1) || '/';
  const parts = h.split('/').filter(Boolean);
  $('#tabs').hidden = true; $('#backBtn').hidden = true; $('#micFab').hidden = true;
  if (parts[0] === 'job' && parts[1]) {
    if (!job || job.id !== parts[1]) { if (job) await db.putJob(job); job = await db.getJob(parts[1]); currentBoard = 0; }
    if (!job) { location.hash = '#/'; return; }
    migrate(job); recalcSchedule(job);
    const tab = parts[2] || 'client';
    const tabs = TABS_FOR(job); if (!tabs.some(([k]) => k === tab)) { location.hash = `#/job/${job.id}/${tabs[0][0]}`; return; }
    renderTabs(tab); $('#backBtn').hidden = false; refreshHeader(); currentTab = tab;
    $('#micFab').hidden = !['boards', 'supply'].includes(tab);
    main.innerHTML = ''; window.scrollTo(0, 0);
    VIEWS[tab]?.();
  } else if (parts[0] === 'settings') {
    if (job) await db.putJob(job);
    $('#backBtn').hidden = false; $('#topTitle').textContent = 'Settings'; $('#topSub').textContent = 'Your details, logo, instruments';
    renderSettings();
  } else {
    if (job) { await db.putJob(job); job = null; }
    $('#topTitle').textContent = 'Cert Pad'; $('#topSub').textContent = 'EICR · EIC · Minor Works'; saved('');
    renderJobs();
  }
}
window.addEventListener('hashchange', route);
$('#backBtn').onclick = () => { location.hash = '#/'; };
$('#settingsBtn').onclick = () => { location.hash = '#/settings'; };

function renderTabs(active) {
  const nav = $('#tabs'); nav.hidden = false;
  const iss = validateJob(job, settings);
  const by = {}; iss.filter(i => i.level === 'error').forEach(i => (by[i.target] = (by[i.target] || 0) + 1));
  nav.innerHTML = TABS_FOR(job).map(([k, l]) => `<a href="#/job/${job.id}/${k}" class="${k === active ? 'on' : ''}">${l}${k === 'check' && iss.filter(i => i.level === 'error').length ? `<span class="dot">${iss.filter(i => i.level === 'error').length}</span>` : ''}</a>`).join('');
  nav.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
function refreshHeader() {
  if (!job) return;
  $('#topTitle').textContent = job.reportNo || kindMeta(job).label;
  const sub = kindOf(job) === 'eicr' ? overallAssessment(job) : kindMeta(job).full;
  $('#topSub').textContent = [job.installation?.address, sub].filter(Boolean).join(' · ');
}

// ---------- jobs list ----------
async function renderJobs() {
    fresh();
  const jobs = (await db.allJobs()).sort((a, b) => b.updated - a.updated);
  main.innerHTML = `
  <input class="search" id="q" type="search" placeholder="Search address, client, report no…">
  <div id="list"></div>
  <div class="card"><h2>Backup</h2><p class="muted">Everything is stored only on this phone. Export a backup file regularly and keep it somewhere safe (e.g. Google Drive).</p>
   <div class="btns"><button class="btn" id="exp">⬇ Export backup</button><label class="btn" style="display:inline-flex;align-items:center">⬆ Import backup<input type="file" id="imp" accept="application/json,.json" hidden></label></div></div>
  <button class="btn pri fab" id="new">＋ New EICR</button>`;
  const list = $('#list');
  const draw = q => {
    q = q.toLowerCase();
    const f = jobs.filter(j => !q || [j.reportNo, j.client?.name, j.installation?.address, j.installation?.occupier, j.inspDates].join(' ').toLowerCase().includes(q));
    list.innerHTML = f.length ? f.map(j => { const a = overallAssessment(j); return `<div class="card">
      <a class="job" href="#/job/${j.id}/client"><div class="meta"><b style="color:var(--ink)">${esc(j.reportNo)}</b><span>${esc(kindMeta(j).label)} · ${esc(j.inspDates || j.mw?.completed || '')}</span></div>
      <div style="font-weight:600;margin:4px 0">${esc(j.installation?.address || 'No address yet')}</div>
      <div class="meta"><span>${esc(j.client?.name || '')}</span><span><span class="badge ${j.status === 'issued' ? 'issued' : 'draft'}">${j.status === 'issued' ? 'Issued' : 'Draft'}</span> <span class="badge ${a === 'SATISFACTORY' ? 'ok' : 'bad'}">${a === 'SATISFACTORY' ? 'Sat' : 'Unsat'}</span></span></div></a>
      <div class="btns"><button class="btn" data-dup="${j.id}">⧉ Duplicate</button><button class="btn danger" data-del="${j.id}">🗑 Delete</button></div></div>`; }).join('')
      : `<div class="card"><p>No reports yet.</p><p class="muted">Tap <b>＋ New EICR</b> to start, or load the sample job from Settings.</p></div>`;
  };
  draw('');
  $('#q').oninput = e => draw(e.target.value);
  $('#new').onclick = () => modal(`<h2>New certificate</h2><p class="muted">Choose the form that matches the work (BS 7671:2018+A4:2026).</p>
    <div class="btns" style="flex-direction:column;align-items:stretch"><button class="btn pri" data-k="eicr">EICR – Condition Report</button>
    <button class="btn" data-k="eic">EIC – Installation Certificate</button>
    <button class="btn" data-k="ev">EV Charger – EIC + EV supplement</button>
    <button class="btn" data-k="mw">Minor Works Certificate</button>
    <button class="btn" id="mclose">Cancel</button></div>
    <p class="muted" style="margin-top:10px">Minor Works is only for additions/alterations that do <b>not</b> introduce a new circuit. A new circuit or consumer unit / distribution board replacement needs an EIC.</p>`);
    $('#modalBody').onclick = async e => { const t = e.target.closest('[data-k]'); if (!t) return; closeModal();
      const makers = { eicr: newJob, eic: newEic, mw: newMw, ev: newEv }; const j = makers[t.dataset.k](settings);
      const a = allocateRef(settings, await db.allJobs(), new Date(), KINDS[t.dataset.k].ref); j.reportNo = a.ref; settings.nextNumber = a.next; await saveSettings(); await db.putJob(j); location.hash = `#/job/${j.id}/client`; };
  list.onclick = async e => {
    const d = e.target.closest('[data-dup]'), x = e.target.closest('[data-del]');
    if (d) {
      const src = await db.getJob(d.dataset.dup); const j = structuredClone(src);
      j.id = uid(); j.created = j.updated = Date.now(); j.status = 'draft'; j.refLocked = false; j.pdfMade = 0;
      { const a = allocateRef(settings, await db.allJobs(), new Date(), kindMeta(j).ref); j.reportNo = a.ref; settings.nextNumber = a.next; } await saveSettings();
      j.declaration.inspector.signature = ''; j.declaration.authoriser.signature = ''; j.inspDates = today();
      j.declaration.inspector.date = today(); j.declaration.authoriser.date = today();
      j.next.date = addYears(today(), j.next.intervalYears || 5);
      j.boards.forEach(b => { b.id = uid(); b.circuits.forEach(c => (c.id = uid())); });
      await db.putJob(j); toast(`Duplicated as ${j.reportNo}`); renderJobs();
    }
    if (x && confirm('Delete this report permanently from this phone?')) { await db.deleteJob(x.dataset.del); renderJobs(); }
  };
  $('#exp').onclick = async () => {
    const data = { app: 'eicr-pad', version: 1, exported: new Date().toISOString(), settings, jobs: await db.allJobs() };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `eicr-backup-${today()}.json`);
  };
  $('#imp').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const js = data.jobs || (data.id ? [data] : []);
      if (!js.length && !data.settings) throw new Error('No reports found in file');
      if (data.settings && confirm('Also restore settings (your details, logo, signature) from the backup?')) { const keep = settings.nextNumber; settings = { ...defaultSettings(), ...data.settings }; settings.nextNumber = Math.max(Number(keep) || 1, Number(settings.nextNumber) || 1); settings.refPrefix ??= DEFAULT_REF_PREFIX; }
      const r = planRestore(settings, await db.allJobs(), js); settings.nextNumber = r.nextNumber; await saveSettings();
      for (const j of r.jobs) await db.putJob(j);
      if (r.renamed.length) alert(`${r.renamed.length} report(s) had a reference already used on this phone and were given new numbers:\n` + r.renamed.map(([a, b]) => `${a || '(none)'} → ${b}`).join('\n'));
      toast(`Imported ${js.length} report(s). Next number: ${settings.nextNumber}`); renderJobs();
    } catch (err) { alert('Import failed: ' + err.message); }
  };
}
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }

// ---------- job views ----------
function evView() {
  fresh();
  job.ev ??= {};
  const e = job.ev; const pmeRisk = evPmeRisk(job);
  const tt = /^TT/.test(job.supply?.earthing || '') || /^TT|\(b\)/.test(e.pmeMethod || '');
  main.innerHTML = `
  <div class="card"><h2>Charging equipment</h2>
    ${fld('ev.make', 'Make', { list: ['Zappi (myenergi)', 'Ohme', 'Pod Point', 'Hypervolt', 'Wallbox', 'Easee', 'Andersen', 'EO', 'Indra', 'Rolec', 'Project EV', 'Tesla Wall Connector'] })}
    ${fld('ev.model', 'Model')}${fld('ev.serial', 'Serial number')}
    ${fld('ev.powerKw', 'Rated power (kW)', { type: 'seg', options: EV_POWER })}
    ${fld('ev.mode', 'Charging mode', { type: 'seg', options: ['Mode 3', 'Mode 2', 'Mode 4'] })}
    ${fld('ev.outlet', 'Outlet', { type: 'seg', options: ['Tethered', 'Socket (untethered)'] })}
    ${fld('ev.connector', 'Connector', { list: EV_CONNECTORS })}
    ${fld('ev.phases', 'Supply', { type: 'seg', options: ['Single phase', 'Three phase'] })}
    ${fld('ev.location', 'Location', { list: ['Outdoor – wall mounted', 'Outdoor – post/pedestal', 'Garage (indoor)', 'Car port', 'Driveway'] })}
    ${fld('ev.ipRating', 'IP rating (≥ IP44 outdoors, 722.512.2.201)', { list: ['IP54', 'IP55', 'IP65', 'IP66'] })}
    ${fld('ev.ikRating', 'IK rating (impact, ≥ IK08 where vehicle damage possible)', { list: ['IK08', 'IK10'] })}</div>
  <div class="card"><h2>Earthing & PME (722.411.4.1)</h2>
    <p class="muted">Supply earthing: <b>${esc(job.supply?.earthing || 'not set – see Supply tab')}</b></p>
    ${pmeRisk ? '<p class="warnbox" style="background:#fef3c7;padding:8px;border-radius:6px">⚠ PME / TN-C-S supply without a permitted method. An outdoor (or outdoor-capable) charge point must not use the PME earth unless 722.411.4.1(b)–(e) is applied: open-PEN device (often built into the charger), earth electrode, or TT the charger.</p>' : ''}
    ${fld('ev.pmeMethod', 'Method used', { type: 'select', options: ['', ...EV_PME_OPTIONS] })}
    ${fld('ev.pmeNotes', 'Device details (model, threshold, isolation per Table 537.4)', { type: 'textarea' })}
    ${tt ? `${fld('ev.electrodeType', 'Electrode type', { list: ['Rod', 'Tape', 'Plate'] })}${fld('ev.electrodeRa', 'Electrode resistance Ra (Ω)', { type: 'number' })}${fld('ev.electrodeLocation', 'Electrode location')}` : ''}</div>
  <div class="card"><h2>Protection</h2>
    ${fld('ev.rcdType', 'RCD / DC fault protection (722.531.3.101)', { type: 'select', options: ['', ...EV_RCD_OPTIONS] })}
    ${fld('ev.rcdIdn', 'RCD IΔn (mA)', { type: 'seg', options: ['30'] })}
    ${fld('ev.deviceBsen', 'Protective device BS (EN)', { list: ['61009', '60898', '60947-2'] })}
    ${fld('ev.deviceType', 'Type', { type: 'seg', options: ['B', 'C', 'D'] })}
    ${fld('ev.deviceRating', 'Rating (A)', { type: 'seg', options: ['16', '20', '32', '40'] })}
    <p class="muted">AFDD not required for EV circuits to BS EN 61851 with BS EN IEC 62196-2 outlets (722.421.1.7.201). Each charge point on its own dedicated final circuit (Section 722).</p></div>
  <div class="card"><h2>Cable</h2>
    ${fld('ev.cableType', 'Cable type', { list: EV_CABLES })}
    ${fld('ev.cableCsa', 'Live csa (mm²)', { type: 'seg', options: ['4', '6', '10', '16'] })}
    ${fld('ev.cpcCsa', 'CPC csa (mm²)', { list: ['2.5', '4', '6', '10'] })}
    ${fld('ev.cableLength', 'Length (m)', { type: 'number' })}
    ${fld('ev.refMethod', 'Reference method', { list: ['C (clipped direct)', 'A', 'B', '100', '101', '102', '103', 'D (buried)', 'E'] })}
    ${fld('ev.cableRoute', 'Route / installation method')}
    ${fld('ev.vdPct', 'Voltage drop (%) – max 5% (power)', { type: 'number' })}</div>
  <div class="card"><h2>Max demand & load (311.1)</h2>
    ${fld('ev.supplyFuseA', 'Supply fuse (A)', { type: 'seg', options: ['60', '80', '100'] })}
    ${fld('ev.maxDemandA', 'Assessed max demand incl. EV (A)', { type: 'number' })}
    ${fld('ev.admdNotes', 'Assessment / diversity notes', { type: 'textarea' })}
    ${fld('ev.loadMgmt', 'Load management', { list: EV_LOADMGMT })}
    ${fld('ev.ctClamp', 'CT clamp fitted & orientation verified', { type: 'check' })}</div>
  <div class="card"><h2>DNO notification</h2>
    ${fld('ev.dnoMethod', 'Method', { type: 'select', options: ['', ...EV_DNO_OPTIONS] })}
    ${fld('ev.dno', 'DNO', { list: ['Electricity North West', 'SP Energy Networks', 'Northern Powergrid', 'National Grid (WPD)', 'UK Power Networks', 'SSEN', 'NIE Networks'] })}
    ${fld('ev.dnoDate', 'Date submitted', { type: 'date' })}${fld('ev.dnoRef', 'DNO reference')}</div>
  <div class="card"><h2>Smart charge point (SI 2021/1467)</h2>
    ${fld('ev.smartCompliant', 'Charger is compliant with the Smart Charge Points Regulations 2021', { type: 'check' })}
    ${fld('ev.offPeakDefault', 'Default charging hours set outside peak (8–11 am, 4–10 pm weekdays) – owner may override', { type: 'check' })}
    ${fld('ev.randomDelay', 'Randomised delay (up to 600 s) enabled by default', { type: 'check' })}
    ${fld('ev.smartNotes', 'Notes', { type: 'textarea' })}</div>
  <div class="card"><h2>Commissioning & handover</h2>
    ${fld('ev.commissioned', 'Commissioned & test charge carried out', { type: 'check' })}
    ${fld('ev.wifiApp', 'Connectivity / app', { list: ['WiFi – app set up with customer', 'Ethernet', '4G/SIM', 'Not connected (customer declined)'] })}
    ${fld('ev.firmware', 'Firmware version')}
    ${fld('ev.customerShown', 'Customer shown operation, emergency isolation & app', { type: 'check' })}
    ${fld('ev.manualsLeft', 'Manufacturer instructions & certificate left with customer', { type: 'check' })}
    ${fld('ev.handover', 'Handover complete', { type: 'check' })}
    ${fld('ev.photos', 'Installation photos taken (kept on file)', { type: 'check' })}
    ${fld('ev.notes', 'Other notes', { type: 'textarea' })}</div>`;
  bindFields(main, job, p => { if (p === 'ev.pmeMethod') evView(); });
}
function eicInspection() {
  fresh();
  job.eicInspection ??= {};
  main.innerHTML = `<div class="card"><h2>Schedule of inspections (EIC)</h2>
    <p class="muted">BS 7671:2018+A4:2026 Section H. Tick each relevant item; mark N/A where not applicable.</p>
    <div class="btns"><button class="btn" id="eicAllTick">Mark all ✓</button><button class="btn" id="eicAllNa">Mark remaining N/A</button></div>
    ${EIC_ITEMS.map(([id, t]) => `<label class="f"><span>${esc(id)} · ${esc(t)}</span>
      <select data-ei="${id}">${['', '✓', 'N/A'].map(o => `<option${(job.eicInspection[id] || '') === o ? ' selected' : ''}>${o}</option>`).join('')}</select></label>`).join('')}</div>`;
  main.querySelectorAll('[data-ei]').forEach(el => el.onchange = e => { job.eicInspection[e.target.dataset.ei] = e.target.value; scheduleSave(); });
  $('#eicAllTick').onclick = () => { for (const [id] of EIC_ITEMS) job.eicInspection[id] = '✓'; scheduleSave(); eicInspection(); };
  $('#eicAllNa').onclick = () => { for (const [id] of EIC_ITEMS) if (!job.eicInspection[id]) job.eicInspection[id] = 'N/A'; scheduleSave(); eicInspection(); };
}
const VIEWS = {
  client() {
    fresh();
    main.innerHTML = `
    <div class="card"><h2>Report</h2>${job.refLocked ? `<label class="f"><span>Report reference 🔒</span><input value="${esc(job.reportNo)}" readonly style="background:#f1f5f9"></label><p class="muted">Locked because a PDF has been made${job.status === 'issued' ? '/issued' : ''}. <button class="btn" id="chgRef">Change reference…</button></p>` : `<label class="f"><span>Report reference</span><input id="refIn" value="${esc(job.reportNo)}"></label>`}${fld('edition', 'Edition', { type: 'select', options: Object.entries(EDITIONS).map(([k, v]) => [k, v.label]) })}</div>
    <div class="card"><h2>A · Person ordering the report</h2>${fld('client.name', 'Name')}${fld('client.address', 'Address', { type: 'textarea' })}</div>
    ${kindOf(job) === 'eicr' ? `<div class="card"><h2>B · Reason for the report</h2>${fld('reason', 'Reason', { list: ['Periodic inspection', 'Change of tenancy', 'Landlord requirement (5-yearly)', 'Sale of property', 'Purchase survey', 'Mortgage / insurance requirement', 'Change of occupancy'] })}
      ${fld('inspDates', 'Date(s) of inspection', { type: 'date' })}</div>` : ''}
    ${isEicLike(job) ? `<div class="card"><h2>B · Installation details (EIC)</h2>
      ${fld('eic.installType', 'Type of work', { type: 'seg', options: ['New installation', 'Addition', 'Alteration'] })}
      ${fld('eic.description', 'Description of installation', { type: 'textarea' })}
      ${fld('extent.covered', 'Extent covered by this certificate', { type: 'textarea' })}
      ${fld('eic.departures', 'Departures from BS 7671', { type: 'textarea' })}
      ${fld('eic.exceptions', 'Permitted exceptions (411.3.3)', { type: 'textarea' })}
      ${fld('eic.riskAssessment', 'Risk assessment attached', { type: 'check' })}
      ${fld('eic.commentsExisting', 'Comments on existing installation (addition/alteration)', { type: 'textarea' })}
      ${fld('next.intervalYears', 'Recommended first inspection (years)', { type: 'seg', options: ['1', '3', '5', '10'] })}</div>` : ''}
    ${kindOf(job) === 'mw' ? `<div class="card"><h2>A · Description of the minor works</h2>
      <p class="muted">Use Minor Works only when you have <b>not</b> introduced a new circuit. A new circuit, or replacing a consumer unit / distribution board, needs an <b>EIC</b>.</p>
      ${fld('mw.completed', 'Date minor works completed', { type: 'date' })}
      ${fld('mw.description', 'Description of the minor works', { type: 'textarea' })}
      ${fld('mw.departures', 'Departures from BS 7671', { type: 'textarea' })}
      ${fld('mw.exceptions', 'Permitted exceptions (411.3.3)', { type: 'textarea' })}
      ${fld('mw.riskAssessment', 'Risk assessment attached', { type: 'check' })}
      ${fld('mw.commentsExisting', 'Comments on existing installation (incl. defects observed)', { type: 'textarea' })}</div>` : ''}
    <div class="card"><h2>${kindOf(job) === 'eicr' ? 'C · Installation' : 'Installation'}</h2>${kindOf(job) === 'eicr' ? fld('installation.occupier', 'Occupier') : ''}
      ${fld('installation.address', 'Installation address', { type: 'textarea' })}
      <button class="btn" id="sameAddr">Same as client address</button><br><br>
      ${fld('installation.premises', 'Description of premises', { type: 'seg', options: ['Residential', 'Commercial', 'Industrial', 'Other'] })}
      ${fld('installation.premisesOther', 'If other, describe')}
      <div class="row">${fld('installation.wiringAge', 'Est. age of wiring (yrs)', { type: 'num' })}${fld('installation.lastInspection', 'Date of last inspection', { type: 'date' })}</div>
      ${fld('installation.alterations', 'Evidence of additions/alterations?', { type: 'seg', options: ['Yes', 'Not apparent'] })}
      ${fld('installation.alterationsAge', 'If yes, estimated age (yrs)', { type: 'num' })}
      ${fld('installation.records', 'Installation records available? (651.1)', { type: 'seg', options: ['Yes', 'No'] })}</div>`;
    $('#refIn') && ($('#refIn').onchange = async e => { const v = e.target.value.trim(); if (!v) { e.target.value = job.reportNo; return toast('Reference can’t be blank'); }
      if (isDuplicate(v, await db.allJobs(), job.id)) { e.target.value = job.reportNo; return alert(`${v} is already used by another report on this phone.`); }
      job.reportNo = v; scheduleSave(); refreshHeader(); });
    $('#chgRef') && ($('#chgRef').onclick = async () => {
      if (!confirm(`Warning: a PDF of this report has already been made${job.status === 'issued' ? ' and it is marked issued' : ''} with reference ${job.reportNo}. Changing it means copies already sent won’t match. Change anyway?`)) return;
      const v = prompt('New reference:', job.reportNo); if (!v || v.trim() === job.reportNo) return;
      if (isDuplicate(v.trim(), await db.allJobs(), job.id)) return alert(`${v.trim()} is already used by another report on this phone.`);
      (job.refHistory ??= []).push({ from: job.reportNo, to: v.trim(), at: new Date().toISOString() }); job.reportNo = v.trim(); scheduleSave(); refreshHeader(); VIEWS.client(); });
    bindFields(main, job, p => { if (p === 'reportNo' || p.startsWith('installation.address')) refreshHeader(); });
    $('#sameAddr').onclick = () => { job.installation.address = job.client.address; scheduleSave(); VIEWS.client(); };
  },
  extent() {
    fresh();
    main.innerHTML = `<div class="card"><h2>D · Extent and limitations</h2>
      ${fld('extent.covered', 'Parts of the installation inspected and tested', { type: 'textarea' })}
      <div class="btns"><button class="btn" data-ins="extent.covered" data-t="Whole of the fixed electrical installation">Whole installation</button></div>
      ${fld('extent.limitations', 'Agreed limitations including reasons', { type: 'textarea' })}
      <div class="btns"><button class="btn" data-ins="extent.limitations" data-t="10% of accessories opened for visual inspection.">10% accessories</button><button class="btn" data-ins="extent.limitations" data-t="Concealed cables not inspected.">Concealed cables</button><button class="btn" data-ins="extent.limitations" data-t="No access to loft/under floors.">No loft/floor access</button><button class="btn" data-ins="extent.limitations" data-t="Fixed equipment not dismantled.">Equipment not dismantled</button></div>
      ${fld('extent.agreedWith', 'Agreed with')}
      ${fld('extent.operational', 'Operational limitations including reasons', { type: 'textarea' })}
      <div class="btns"><button class="btn" data-ins="extent.operational" data-t="Some circuits not isolated for insulation resistance testing due to occupier's equipment (e.g. fridge/freezer, alarm).">IR not done on some circuits</button><button class="btn" data-ins="extent.operational" data-t="Furniture/stored items prevented access to some accessories.">Access restricted</button></div>
      <p class="muted">The standard note about concealed cables and product recalls is printed automatically on the report.</p></div>`;
    bindFields(main, job);
    main.addEventListener('click', e => { const b = e.target.closest('[data-ins]'); if (!b) return; const p = b.dataset.ins; const cur = getP(job, p) || ''; setP(job, p, (cur ? cur + ' ' : '') + b.dataset.t); scheduleSave(); VIEWS.extent(); });
  },
  supply() {
    fresh();
    main.innerHTML = `<div class="card"><h2>I · Supply characteristics & earthing</h2>
      ${fld('supply.earthing', 'Earthing arrangement', { type: 'seg', options: ['TN-C', 'TN-S', 'TN-C-S (PME)', 'TN-C-S (PNB)', 'TT', 'IT'] })}
      ${fld('supply.acdc', 'AC / DC', { type: 'seg', options: ['AC', 'DC'] })}
      ${fld('supply.conductors', 'Number and type of live conductors', { type: 'select', options: ['1-phase, 2-wire', '2-phase, 3-wire', '3-phase, 3-wire', '3-phase, 4-wire', 'DC 2-wire', 'DC 3-wire', 'Other'] })}
      <div class="row3">${fld('supply.u', 'U (V)', { type: 'num' })}${fld('supply.u0', 'U0 (V)', { type: 'num' })}${fld('supply.freq', 'f (Hz)', { type: 'num' })}</div>
      <div class="row">${fld('supply.ipf', 'Ipf (kA)', { type: 'num', ph: 'e.g. 1.6' })}${fld('supply.ze', 'Ze (Ω)', { type: 'num', ph: 'e.g. 0.21' })}</div>
      ${fld('supply.polarityConfirmed', 'Supply polarity confirmed', { type: 'check' })}
      ${fld('supply.otherSources', 'Other sources of supply present (attach details)', { type: 'check' })}
      <h3>Supply protective device</h3>
      <div class="row3">${fld('supply.deviceBsen', 'BS (EN)', { list: ['BS 88-3', 'BS 1361', 'BS 88-2', 'BS 3036'] })}${fld('supply.deviceType', 'Type', { list: ['Fuse', '2', 'gG'] })}${fld('supply.deviceRating', 'Rating (A)', { type: 'num', list: ['60', '80', '100'] })}</div></div>
    <div class="card"><h2>J · Particulars at the origin</h2>
      ${fld('origin.meansEarthing', 'Means of earthing', { type: 'seg', options: ["Distributor's facility", 'Electrode'] })}
      <div class="row">${fld('origin.maxDemand', 'Maximum demand', { type: 'num' })}${fld('origin.maxDemandUnit', 'Unit', { type: 'seg', options: ['A', 'kVA'] })}</div>
      <details ${job.origin.meansEarthing === 'Electrode' || job.supply.earthing === 'TT' ? 'open' : ''}><summary class="muted" style="min-height:40px">Earth electrode (TT)</summary>
        <div class="row">${fld('origin.electrodeType', 'Type', { list: ['Rod(s)', 'Tape', 'Plate'] })}${fld('origin.electrodeRa', 'RA (Ω)', { type: 'num' })}</div>${fld('origin.electrodeLocation', 'Location')}</details>
      <h3>Earthing conductor</h3><div class="row">${fld('origin.earthingMaterial', 'Material', { list: ['Copper', 'Aluminium'] })}${fld('origin.earthingCsa', 'csa (mm²)', { type: 'num', list: ['10', '16', '25'] })}</div>${fld('origin.earthingVerified', 'Connection / continuity verified', { type: 'check' })}
      <h3>Main protective bonding conductors</h3><div class="row">${fld('origin.bondingMaterial', 'Material', { list: ['Copper'] })}${fld('origin.bondingCsa', 'csa (mm²)', { type: 'num', list: ['6', '10', '16'] })}</div>${fld('origin.bondingVerified', 'Connection / continuity verified', { type: 'check' })}
      ${['Water', 'Gas', 'Oil', 'Steel', 'Other'].map(k => fld('origin.bond' + k, 'Bonding to ' + (k === 'Steel' ? 'structural steel' : k.toLowerCase()), { type: 'seg', options: ['✓', 'X', 'N/A', 'LIM'] })).join('')}
      ${fld('origin.bondOtherSpec', 'Other – specify')}
      <h3>Main switch / switch-fuse / CB / RCD</h3>
      ${fld('origin.msDevice', 'Type', { type: 'seg', options: ['Isolator', 'Switch-fuse', 'Circuit-breaker', 'RCD'] })}
      <div class="row">${fld('origin.msLocation', 'Location', { list: ['Under stairs', 'Hall cupboard', 'Garage', 'Kitchen', 'Meter cupboard'] })}${fld('origin.msBsen', 'BS (EN)', { list: ['BS EN 60947-3', 'BS EN 60898', 'BS EN 61008', 'BS EN 61009', 'BS 5419'] })}</div>
      <div class="row3">${fld('origin.msPoles', 'Poles', { type: 'num' })}${fld('origin.msCurrent', 'Current (A)', { type: 'num', list: ['63', '80', '100'] })}${fld('origin.msVoltage', 'Voltage (V)', { type: 'num' })}</div>
      <div class="row3">${fld('origin.msRcdType', 'If RCD: type', { list: ['AC', 'A', 'F', 'B', 'S', 'A-S'] })}${fld('origin.msIdn', 'IΔn (mA)', { type: 'num' })}${fld('origin.msRcdTime', 'Time (ms)', { type: 'num' })}</div></div>`;
    bindFields(main, job);
  },
  ev() { evView(); },
  inspection() {
    if (isEicLike(job)) return eicInspection();
    fresh();
    const insp = job.inspection;
    const outs = id => (id.startsWith('1.') ? ['✓', 'X', 'N/A', 'LIM', 'N/V', 'C1'] : ['✓', 'N/A', 'LIM', 'N/V', 'C1', 'C2', 'C3', 'FI']);
    const obsNo = o => job.observations.indexOf(o) + 1;
    main.innerHTML = `<div class="card"><h2>Schedule of inspection</h2>
      <div class="btns"><button class="btn" id="tplDom">🏠 Domestic template</button><button class="btn" id="allOk">✓ Fill blanks with ✓</button></div>
      <p class="muted">Tap an outcome; tap again to clear. Coded items get a ＋Obs button. Items linked to observations show 🔗 and follow the observation's code.</p></div>
      ${INSPECTION_GROUPS.map(g => `<div class="card insp-g"><h3>${g.id}.0 ${esc(g.title)}</h3>${g.note ? `<p class="muted">${esc(g.note)}</p>` : ''}
      ${g.items.map(([id, text]) => { const r = insp[id] || {}; const coded = CODES.includes(r.o) || r.o === 'X' || r.o === 'LIM'; const lk = linkedObs(job, id);
        return `<div class="insp-i" data-id="${id}"><p><b>${displayId(id)}</b> ${esc(text)}
          ${lk.map(o => `<a class="badge link ${o.code === 'C3' ? 'c3' : o.code === 'FI' ? 'fi' : 'bad'}" href="#/job/${job.id}/observations" data-goobs="${esc(o.id)}">🔗 Obs ${obsNo(o)} ${esc(o.code || '')}</a>`).join(' ')}</p>
        <div class="seg">${outs(id).map(o => `<button data-o="${esc(o)}" class="${r.o === o ? 'on' : ''} ${o.toLowerCase().replace(/[^a-z0-9]/g, '')}">${esc(o)}</button>`).join('')}
        ${coded && r.o !== 'LIM' && !lk.length ? `<button data-obs="1" title="Raise observation">＋Obs</button>` : ''}</div>
        ${coded || r.note ? `<input data-note="${id}" placeholder="Comment" value="${esc(r.note || '')}">` : ''}</div>`; }).join('')}</div>`).join('')}`;
    main.onclick = e => {
      const row = e.target.closest('.insp-i');
      const go = e.target.closest('[data-goobs]'); if (go) { sessionStorage.focusObs = go.dataset.goobs; return; }
      const b = e.target.closest('button[data-o]');
      if (b && row) {
        const id = row.dataset.id; const cur = insp[id]?.o; const nv = cur === b.dataset.o ? '' : b.dataset.o;
        const lk = linkedObs(job, id);
        if (lk.length && insp[id]?.linked) {
          if (CODES.includes(nv)) setItemOutcome(job, id, nv, confirm(`Item ${displayId(id)} is linked to observation ${lk.map(obsNo).join(', ')}. Change the observation code to ${nv} as well?`) ? 'updateObs' : 'keep');
          else setItemOutcome(job, id, nv, confirm(`Item ${displayId(id)} is linked to observation ${lk.map(obsNo).join(', ')} (${lk.map(o => o.code).join(', ')}). Unlink it so you can set "${nv || 'blank'}"?`) ? 'unlink' : 'keep');
        } else insp[id] = { ...(insp[id] || {}), o: nv };
        scheduleSave(); const y = window.scrollY; VIEWS.inspection(); window.scrollTo(0, y); return;
      }
      const ob = e.target.closest('button[data-obs]');
      if (ob && row) { const id = row.dataset.id; const it = INSPECTION_ITEMS.find(i => i.id === id); const code = CODES.includes(insp[id]?.o) ? insp[id].o : 'C3';
        job.observations.push({ id: uid(), desc: insp[id]?.note || it.text.replace(/\s*\([^)]*\)\s*$/, ''), location: '', code, reg: (it.text.match(/\(([^)]*)\)\s*$/) || [])[1]?.split(';')[0] || '', schedRef: '', items: [id] });
        recalcSchedule(job); scheduleSave(); const y = scrollY; VIEWS.inspection(); scrollTo(0, y); toast('Observation added and linked – edit it in Observations'); }
      if (e.target.id === 'tplDom') { for (const i of INSPECTION_ITEMS) if (!insp[i.id]?.o && DOMESTIC_TEMPLATE[i.id]) insp[i.id] = { o: DOMESTIC_TEMPLATE[i.id] }; scheduleSave(); VIEWS.inspection(); toast('Domestic N/A & LIM items set'); }
      if (e.target.id === 'allOk') { for (const i of INSPECTION_ITEMS) if (!insp[i.id]?.o) insp[i.id] = { ...(insp[i.id] || {}), o: '✓' }; scheduleSave(); VIEWS.inspection(); }
    };
    main.oninput = e => { const id = e.target.dataset.note; if (id) { insp[id] = { ...(insp[id] || {}), note: e.target.value }; scheduleSave(); } };
  },
  boards() { renderBoards(); },
  observations() {
    fresh();
    const lib = settings.obsLibrary || OBS_LIBRARY;
    const cc = codeCounts(job);
    const chips = (o, i) => {
      const items = o.items || [];
      const sug = suggestItems(o.desc, o.reg).filter(x => !items.includes(x));
      return `<div class="links" data-links="${i}"><span class="muted">Schedule item:</span>
        ${items.map(id => `<span class="chip on" title="${esc(itemText(id))}">${displayId(id)} <small>${esc(itemText(id).slice(0, 28))}…</small><button data-unlink="${i}" data-item="${id}" aria-label="Remove link">×</button></span>`).join('')}
        ${!items.length && sug.length ? sug.map(id => `<button class="chip sug" data-accept="${i}" data-item="${id}" title="${esc(itemText(id))}">💡 ${displayId(id)} ${esc(itemText(id).slice(0, 30))}… <b>✓</b></button>`).join('') : ''}
        <button class="chip" data-pick="${i}">${items.length ? '＋ / change' : '🔍 Choose item'}</button></div>`;
    };
    main.innerHTML = `<div class="card"><h2>K · Observations</h2>
      <p class="muted">C1 ${cc.C1} · C2 ${cc.C2} · C3 ${cc.C3} · FI ${cc.FI} → <b>${overallAssessment(job)}</b></p>
      <div class="btns"><button class="btn pri" id="addObs">＋ Blank</button><button class="btn" id="libObs">📚 From library</button><button class="btn" id="sortObs">⇅ Sort by code</button></div>
      ${fld('noRemedial', 'No remedial action is required', { type: 'check' })}</div>
      ${job.observations.map((o, i) => `<div class="card obs ${esc(o.code)}" data-i="${i}" id="obs-${esc(o.id)}">
        <div class="meta" style="display:flex;justify-content:space-between"><b>Item ${i + 1}</b><span><button class="btn" data-up="${i}" aria-label="Move up">↑</button> <button class="btn danger" data-rm="${i}">🗑</button></span></div>
        ${fld(`observations.${i}.desc`, 'Observation', { type: 'textarea' })}
        ${chips(o, i)}
        ${fld(`observations.${i}.code`, 'Code', { type: 'seg', options: CODES })}
        <div class="row">${fld(`observations.${i}.location`, 'Location')}${fld(`observations.${i}.reg`, 'Regulation')}</div>
        ${fld(`observations.${i}.schedRef`, 'Other schedule ref (e.g. CU1/3)')}
        
        <button class="btn" data-save="${i}">☆ Save to my library</button></div>`).join('')}`;
    const redraw = () => { const y = scrollY; VIEWS.observations(); scrollTo(0, y); };
    const relink = () => { recalcSchedule(job); scheduleSave(); };
    bindFields(main, job, (p, el) => {
      if (/\.code$/.test(p)) { relink(); redraw(); }
      if (/\.(desc|reg)$/.test(p)) { const i = +p.split('.')[1]; const box = main.querySelector(`[data-links="${i}"]`); if (box) { const t = document.createElement('div'); t.innerHTML = chips(job.observations[i], i); box.replaceWith(t.firstElementChild); } }
    });
    if (sessionStorage.focusObs) { document.getElementById('obs-' + sessionStorage.focusObs)?.scrollIntoView({ block: 'center' }); delete sessionStorage.focusObs; }
    main.addEventListener('click', e => {
      const t = e.target.closest('button') || e.target;
      if (t.id === 'addObs') { job.observations.push({ id: uid(), desc: '', location: '', code: '', reg: '', schedRef: '', items: [] }); scheduleSave(); VIEWS.observations(); scrollTo(0, document.body.scrollHeight); }
      if (t.id === 'sortObs') { job.observations = sortObservations(job.observations); scheduleSave(); VIEWS.observations(); }
      if (t.dataset.rm != null && confirm('Remove this observation?')) { job.observations.splice(+t.dataset.rm, 1); relink(); VIEWS.observations(); }
      if (t.dataset.up != null && +t.dataset.up > 0) { const i = +t.dataset.up; [job.observations[i - 1], job.observations[i]] = [job.observations[i], job.observations[i - 1]]; scheduleSave(); VIEWS.observations(); }
      if (t.dataset.accept != null) { const o = job.observations[+t.dataset.accept]; o.items = [...(o.items || []), t.dataset.item]; relink(); redraw(); toast(`Linked to schedule item ${displayId(t.dataset.item)}`); }
      if (t.dataset.unlink != null) { const o = job.observations[+t.dataset.unlink]; o.items = (o.items || []).filter(x => x !== t.dataset.item); relink(); redraw(); }
      if (t.dataset.pick != null) pickItems(job.observations[+t.dataset.pick], () => { relink(); redraw(); });
      if (t.dataset.save != null) { const o = job.observations[+t.dataset.save]; settings.obsLibrary = [...(settings.obsLibrary || OBS_LIBRARY), { desc: o.desc, code: o.code, reg: o.reg, items: o.items || [] }]; saveSettings(); toast('Saved to your library'); }
      if (t.id === 'libObs') {
        modal(`<h2>Observation library</h2><input id="lq" type="search" placeholder="Filter…" style="margin-bottom:8px"><div class="lib" id="ll"></div><div class="btns"><button class="btn" id="mclose">Close</button></div>`);
        const draw = q => { $('#ll').innerHTML = lib.map((o, i) => [o, i]).filter(([o]) => !q || o.desc.toLowerCase().includes(q)).map(([o, i]) => `<button data-li="${i}"><span class="badge ${o.code === 'C3' ? '' : o.code === 'FI' ? 'issued' : 'bad'}">${o.code}</span> ${esc(o.desc)} <small class="muted">${esc(o.reg)}${(o.items || suggestItems(o.desc, o.reg)).length ? ' · item ' + (o.items || suggestItems(o.desc, o.reg)).map(displayId).join(', ') : ''}</small></button>`).join(''); };
        draw(''); $('#lq').oninput = e2 => draw(e2.target.value.toLowerCase());
        $('#ll').onclick = e2 => { const b = e2.target.closest('[data-li]'); if (!b) return; const o = lib[+b.dataset.li];
          job.observations.push({ id: uid(), desc: o.desc, code: o.code, reg: o.reg, location: '', schedRef: '', items: [...(o.items || suggestItems(o.desc, o.reg, 1))] });
          relink(); closeModal(); VIEWS.observations(); toast('Added and linked – add the location'); };
      }
    });
  },
  summary() {
    fresh();
    const a = overallAssessment(job); const cc = codeCounts(job);
    const d = job.declaration;
    if (isEicLike(job)) {
      job.eic ??= {};
      const e = job.eic;
      const sigImgE = d.inspector.useSaved && settings.inspector.signature ? settings.inspector.signature : d.inspector.signature;
      main.innerHTML = `<div class="card"><h2>Certification (EIC)</h2>
        ${fld('eic.singleSignature', 'Single-signature certificate (one person did design, construction, and I&T)', { type: 'check' })}
        <p class="muted">A4:2026 allows one authorised person to sign for all three categories when they carried out all of that work.</p>
        ${e.singleSignature ? `${fld('eic.inspection.name', 'Name (capitals)')}${fld('eic.inspection.date', 'Date', { type: 'date' })}${fld('eic.departures', 'Departures from BS 7671', { type: 'textarea' })}`
          : `<h3>Design</h3>${fld('eic.design.name', 'Designer 1 name')}${fld('eic.design.date', 'Date', { type: 'date' })}${fld('eic.design.departures', 'Design departures', { type: 'textarea' })}
          ${fld('eic.design2.name', 'Designer 2 name (optional)')}${fld('eic.design2.date', 'Date', { type: 'date' })}
          <h3>Construction</h3>${fld('eic.construction.name', 'Constructor name')}${fld('eic.construction.date', 'Date', { type: 'date' })}${fld('eic.construction.departures', 'Construction departures', { type: 'textarea' })}
          <h3>Inspection & testing</h3>${fld('eic.inspection.name', 'Inspector name')}${fld('eic.inspection.date', 'Date', { type: 'date' })}${fld('eic.inspection.departures', 'I&T departures', { type: 'textarea' })}`}
        <button class="btn" id="eicFillMe">Use my Settings name for blank signatories</button></div>
        <div class="card"><h2>Declaration signature</h2>
          ${fld('declaration.inspector.name', 'Name (capitals)')}${fld('declaration.inspector.position', 'Position')}
          ${fld('declaration.inspector.date', 'Date', { type: 'date' })}
          ${settings.inspector.signature ? fld('declaration.inspector.useSaved', 'Use my saved signature', { type: 'check' }) : ''}
          <button class="btn" id="sigIns">Sign</button>
          ${sigImgE ? `<img class="sigprev" src="${sigImgE}" alt="signature">` : ''}</div>`;
      bindFields(main, job, p => { if (p === 'eic.singleSignature') { scheduleSave(); VIEWS.summary(); } });
      $('#eicFillMe').onclick = () => { const n = settings.inspector?.name || ''; const d0 = today();
        for (const path of ['eic.inspection', 'eic.design', 'eic.construction']) { const o = path.split('.').reduce((a, k) => a[k], job); if (!o.name) { o.name = n; o.date = o.date || d0; } }
        if (!job.declaration.inspector.name) job.declaration.inspector.name = n;
        scheduleSave(); VIEWS.summary(); toast('Filled from Settings'); };
      $('#sigIns').onclick = () => signaturePad(url => { job.declaration.inspector.signature = url; job.declaration.inspector.useSaved = false; scheduleSave(); VIEWS.summary(); });
      return;
    }
    const sigImg = d.inspector.useSaved && settings.inspector.signature ? settings.inspector.signature : d.inspector.signature;
    main.innerHTML = `<div class="card"><h2>E · Summary of condition</h2>
      <div class="assess ${a === 'SATISFACTORY' ? 'ok' : 'bad'}">${a}<small>Set automatically: C1 ${cc.C1}, C2 ${cc.C2}, C3 ${cc.C3}, FI ${cc.FI}${EDITIONS[job.edition]?.fiUnsatisfactory ? ' (FI counts as unsatisfactory in this edition)' : ' · C3/FI are advisory under A4:2026'}</small></div><br>
      ${fld('summary.general', 'General condition of the installation (electrical safety)', { type: 'textarea' })}
      <div class="btns"><button class="btn" data-gen="Installation is in good condition for its age with no defects requiring urgent attention.">Good</button><button class="btn" data-gen="Installation is in reasonable condition for its age. Improvements are recommended as listed in Section K.">Fair</button><button class="btn" data-gen="Installation is in poor condition. Items in Section K require urgent remedial action.">Poor</button></div></div>
    <div class="card"><h2>F · Next inspection</h2>
      ${fld('next.intervalYears', 'Interval (years)', { type: 'seg', options: ['1', '3', '5', '10'] })}
      ${fld('next.date', 'Inspect again before', { type: 'date' })}
      ${fld('next.reasons', 'Reasons', { type: 'textarea' })}</div>
    <div class="card"><h2>G · Declaration</h2><h3>Inspected and tested by</h3>
      ${fld('declaration.inspector.name', 'Name (capitals)')}${fld('declaration.inspector.position', 'Position')}${fld('declaration.inspector.date', 'Date', { type: 'date' })}
      ${settings.inspector.signature ? fld('declaration.inspector.useSaved', 'Use my saved signature', { type: 'check' }) : ''}
      ${sigImg ? `<img class="sigprev" src="${sigImg}" alt="signature">` : '<p class="muted">Not signed yet</p>'}
      <button class="btn" data-sig="inspector">✍ Sign here</button>
      <h3>Report authorised for issue by (QS)</h3>
      ${fld('declaration.authoriser.sameAsInspector', 'Same person as inspector', { type: 'check' })}
      ${d.authoriser.sameAsInspector ? '' : `${fld('declaration.authoriser.name', 'Name (capitals)')}${fld('declaration.authoriser.position', 'Position')}${fld('declaration.authoriser.date', 'Date', { type: 'date' })}
      ${d.authoriser.signature ? `<img class="sigprev" src="${d.authoriser.signature}" alt="signature">` : ''}<button class="btn" data-sig="authoriser">✍ QS sign here</button>`}</div>`;
    bindFields(main, job, (p) => {
      if (p === 'next.intervalYears') { job.next.date = addYears(String(job.inspDates || today()).slice(0, 10), job.next.intervalYears || 5); const y = scrollY; VIEWS.summary(); scrollTo(0, y); }
      if (/useSaved|sameAsInspector/.test(p)) { const y = scrollY; VIEWS.summary(); scrollTo(0, y); }
    });
    main.addEventListener('click', e => {
      const g = e.target.dataset.gen; if (g) { job.summary.general = g; scheduleSave(); VIEWS.summary(); }
      const s = e.target.dataset.sig; if (s) signaturePad(url => { job.declaration[s].signature = url; if (s === 'inspector') job.declaration.inspector.useSaved = false; scheduleSave(); VIEWS.summary(); });
    });
  },
  check() {
    fresh();
    const iss = validateJob(job, settings); const sm = summariseIssues(iss);
    const a = overallAssessment(job);
    main.innerHTML = `<div class="card"><h2>Check & issue</h2>
      <div class="assess ${a === 'SATISFACTORY' ? 'ok' : 'bad'}">${a}</div>
      <p><b style="color:var(--bad)">${sm.errors} must fix</b> · <b style="color:var(--warn)">${sm.warnings} to check</b></p>
      <button class="btn pri big" id="pdf">📄 Create PDF</button><button class="btn" id="schedPdf">Circuit schedule only</button>
      <button class="btn big" id="share">📤 Share PDF (email, WhatsApp…)</button>
      <button class="btn big" id="issue">${job.status === 'issued' ? '↩ Mark as draft' : '✅ Mark as issued'}</button>
      <button class="btn big" id="json">⬇ Export this job (JSON)</button></div>
      <div class="card"><h2>Validation</h2>${iss.length ? iss.map(i => `<a class="issue ${i.level}" href="#/job/${job.id}/${i.target === 'settings' ? '' : i.target}" ${i.target === 'settings' ? 'data-set="1"' : ''}><b>${i.level === 'error' ? '⛔' : '⚠️'}</b><span>${esc(i.msg)}<small>${esc(i.section)}</small></span></a>`).join('') : '<p>✅ Everything looks complete.</p>'}</div>`;
    main.querySelectorAll('[data-set]').forEach(a2 => (a2.href = '#/settings'));
    const lockRef = () => { if (!job.refLocked) { job.refLocked = true; job.pdfMade = Date.now(); scheduleSave(); } };
    const make = () => { const { jsPDF } = window.jspdf; return buildReport(jsPDF, job, settings); };
    const makeSched = () => { const { jsPDF } = window.jspdf; return buildReport(jsPDF, { ...job, kind: 'sched', sched: { parentRef: job.reportNo, parentType: kindMeta(job).full } }, settings); };
    const fname = () => `${job.reportNo || 'EICR'} ${job.installation?.address?.split(/[,\n]/)[0] || ''}`.trim().replace(/[^\w\- ]+/g, '') + '.pdf';
    $('#pdf').onclick = () => {
      if (sm.errors && !confirm(`${sm.errors} item(s) still need fixing. Create the PDF anyway (e.g. as a draft)?`)) return;
      try { make().save(fname()); lockRef(); toast('PDF created'); } catch (err) { alert('PDF failed: ' + err.message); console.error(err); }
    };
    $('#schedPdf') && ($('#schedPdf').onclick = () => {
      try { makeSched().save(`${job.reportNo || 'schedule'} circuit schedule.pdf`); toast('Schedule PDF created'); } catch (err) { alert('PDF failed: ' + err.message); console.error(err); }
    });
    $('#share').onclick = async () => {
      try {
        const blob = make().output('blob'); lockRef(); const file = new File([blob], fname(), { type: 'application/pdf' });
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: job.reportNo });
        else { downloadBlob(blob, fname()); toast('Sharing not supported here – downloaded instead'); }
      } catch (err) { if (err.name !== 'AbortError') alert('Share failed: ' + err.message); }
    };
    $('#issue').onclick = () => {
      if (job.status !== 'issued' && sm.errors && !confirm('There are still items to fix. Mark as issued anyway?')) return;
      job.status = job.status === 'issued' ? 'draft' : 'issued'; if (job.status === 'issued') job.refLocked = true; scheduleSave(); VIEWS.check();
    };
    $('#json').onclick = () => downloadBlob(new Blob([JSON.stringify(job, null, 1)], { type: 'application/json' }), `${job.reportNo}.json`);
  },
};

// ---------- boards & circuit table ----------
const CYC = ['', '✓', 'X', 'N/A', 'LIM'];
const COLS = [
  // key, label, kind, width/options, group
  ['desc', 'Description', 'text', 'w5', 'Circuit'], ['wiring', 'Wiring', 'sel', ['', ...Object.keys(WIRING_TYPES)]], ['refMethod', 'Ref meth', 'text', 'w1'], ['points', 'Pts', 'num', 'w1'],
  ['live', 'Live mm²', 'num', 'w1'], ['cpc', 'cpc mm²', 'num', 'w1'], ['maxDisc', 'Disc s', 'sel', ['0.4', '5', '0.2', '1']],
  ['bsen', 'BS EN', 'sel', ['', '60898', '61009', '62423', '88-3', '88-2', '3036', '3871', '60947-2']], ['type', 'Type', 'sel', ['', 'B', 'C', 'D', '1', '2', '3', 'gG']], ['rating', 'A', 'num', 'w1'], ['bc', 'kA', 'num', 'w1'],
  ['rcdBsen', 'RCD BS EN', 'sel', ['', '61009', '61008', '62423', '62606']], ['rcdType', 'RCD type', 'sel', ['', 'AC', 'A', 'F', 'B', 'S', 'A-S']], ['idn', 'IΔn mA', 'num', 'w1'], ['rcdRating', 'RCD A', 'num', 'w1'],
  ['maxZs', 'Max Zs Ω', 'mz'],
  ['r1', 'r1', 'num', 'w2', 'Ring'], ['rn', 'rn', 'num', 'w2'], ['r2', 'r2', 'num', 'w2'],
  ['r1r2', 'R1+R2', 'num', 'w2', 'Continuity'], ['R2', 'R2', 'num', 'w2'],
  ['testV', 'IR V', 'num', 'w2', 'Insulation'], ['irLL', 'L-L MΩ', 'num', 'w2'], ['irLE', 'L-E MΩ', 'num', 'w2'],
  ['polarity', 'Pol', 'cyc'], ['zs', 'Zs Ω', 'num', 'w2', 'Tests'], ['rcdTime', 'RCD ms', 'num', 'w2'], ['rcd5x', '5× ms', 'num', 'w2'], ['rcdBtn', 'RCD btn', 'cyc'], ['afddBtn', 'AFDD btn', 'cyc'],
  ['remarks', 'Remarks', 'text', 'w5'],
];
function cell(c, col, ci) { const h = cell0(c, col, ci); if (c.typ?.[col[0]]) return `<div class="impwrap">${h.replace(/^<(input|select)/, '<$1 data-typ="1"')}<span class="typtag">typ</span></div>`; return c.imp?.[col[0]] ? `<div class="impwrap">${h.replace(/^<(input|select)/, '<$1 data-imp="1"')}<span class="imptag">AI</span></div>` : h; }
function cell0(c, [k, , kind, opt], ci) {
  const v = c[k] ?? '';
  if (kind === 'sel') return `<select data-c="${k}">${opt.map(o => `<option${String(v) === o ? ' selected' : ''}>${o}</option>`).join('')}${opt.includes(String(v)) ? '' : `<option selected>${esc(v)}</option>`}</select>`;
  if (kind === 'cyc') return `<button class="cyc" data-cyc="${k}">${esc(v)}</button>`;
  if (kind === 'mz') { const m = circuitMaxZs(c); return `<input class="w2" data-c="maxZs" inputmode="decimal" placeholder="${m ?? '?'}" value="${c.maxZsManual ? esc(c.maxZs) : ''}" title="Leave blank to use BS 7671 table value">`; }
  const inp = `<input class="${opt}${c.calc?.[k] ? ' calcd' : ''}" data-c="${k}" ${kind === 'num' ? 'inputmode="decimal"' : ''} value="${esc(v)}">`;
  if (k === 'r1r2' || k === 'zs') return `<div class="calcwrap">${inp}<button class="calcbtn" data-calc="${k}" aria-label="Calculate ${k === 'zs' ? 'Zs = Ze + (R1+R2)' : 'R1+R2 = Zs − Ze'}">=</button>${c.calc?.[k] ? '<span class="calctag">calc</span>' : ''}</div>`;
  return inp;
}
function renderBoards() {
    fresh();
  const boards = job.boards; if (currentBoard >= boards.length) currentBoard = 0;
  const b = boards[currentBoard];
  main.innerHTML = `
  <div class="boards">${boards.map((x, i) => `<button class="btn ${i === currentBoard ? 'pri' : ''}" data-b="${i}">${esc(x.ref || 'DB' + (i + 1))}</button>`).join('')}<button class="btn" id="addB">＋ Board</button></div>
  ${b ? `<details class="card" ${b.circuits.length ? '' : 'open'}><summary><b>Board details – ${esc(b.ref)}</b> <span class="muted">${esc(b.location)}</span></summary><br>
    <div class="row">${fld(`boards.${currentBoard}.ref`, 'DB/CU reference')}${fld(`boards.${currentBoard}.location`, 'Location')}</div>
    ${fld(`boards.${currentBoard}.suppliedFrom`, 'Supplied from')}
    <div class="row3">${fld(`boards.${currentBoard}.ocpdBsen`, 'Distribution OCPD BS(EN)')}${fld(`boards.${currentBoard}.ocpdType`, 'Type')}${fld(`boards.${currentBoard}.ocpdRating`, 'Rating A', { type: 'num' })}</div>
    <label class="f"><span>SPD type(s)</span></label><div class="seg" style="margin-bottom:12px">${['T1', 'T2', 'T3', 'NA'].map(k => `<button type="button" data-spd="${k}" class="${b.spd?.[k] ? 'on' : ''}">${k === 'NA' ? 'N/A' : k}</button>`).join('')}</div>
    <div class="row">${fld(`boards.${currentBoard}.rcdBsen`, 'Main RCD BS(EN)')}${fld(`boards.${currentBoard}.rcdType`, 'RCD type')}</div>
    <div class="row">${fld(`boards.${currentBoard}.rcdRating`, 'RCD rating A', { type: 'num' })}${fld(`boards.${currentBoard}.rcdIdn`, 'RCD IΔn mA', { type: 'num' })}</div>
    <div class="row">${fld(`boards.${currentBoard}.zdb`, 'Zdb (Ω)', { type: 'num' })}${fld(`boards.${currentBoard}.ipf`, 'Ipf at board (kA)', { type: 'num' })}</div>
    ${fld(`boards.${currentBoard}.polarityOk`, 'Correct polarity confirmed', { type: 'check' })}${fld(`boards.${currentBoard}.phaseSeqOk`, 'Phase sequence confirmed (3-phase)', { type: 'check' })}${fld(`boards.${currentBoard}.spdOk`, 'SPD operational status confirmed', { type: 'check' })}
    <div class="btns"><button class="btn" id="zdbZe">Zdb/Ipf = origin (Ze, Ipf)</button><button class="btn danger" id="delB">Delete board</button></div></details>
  <div class="card"><h2>Circuits (${b.circuits.length}${kindOf(job) === 'mw' ? ' / 4 max' : ''})</h2>
    ${kindOf(job) === 'mw' ? '<p class="muted">Minor Works covers alterations to <b>existing</b> circuits only (up to 4 on this form). If you are adding a new circuit or replacing the board, start an EIC instead.</p>' : ''}
    <div class="btns"><button class="btn pri" id="dictate" style="font-size:17px">🎤 Dictate results</button><label class="btn" id="aiPhoto" style="font-size:17px;display:inline-flex;align-items:center">📷 Take photo<input type="file" id="aiFile" accept="image/*" capture="environment" hidden></label><label class="btn" id="aiGallery" style="font-size:17px;display:inline-flex;align-items:center">🖼️ Choose from gallery<input type="file" id="aiFileGal" accept="image/*" hidden></label>${voiceUndo.length ? '<button class="btn" id="undoDict">↶ Undo last dictation/fill</button>' : ''}</div>
    <div class="muted">Quick add:</div><div class="fillbar">${QUICK_CIRCUITS.map((q, i) => `<button class="btn" data-q="${i}">＋ ${esc(q.name)}</button>`).join('')}<button class="btn" data-q="-1">＋ Blank</button></div>
    <div class="muted">Fill all rows:</div><div class="fillbar"><button class="btn" data-fill="polarity">Polarity ✓</button><button class="btn" data-fill="testV">IR 500 V</button><button class="btn" data-fill="ir">IR &gt;999</button><button class="btn" data-fill="rcdBtn">RCD btn ✓</button><button class="btn" data-fill="afddBtn">AFDD N/A</button><button class="btn" data-fill="bc">kA 6</button><button class="btn" id="domDef">🏠 Domestic defaults</button></div>
    <div class="tbl-wrap"><table class="ct"><thead>
      <tr><th>No</th>${COLS.map(c => `<th>${c[1]}${c[2] === 'mz' ? '' : `<br><button class="fillcol" data-fillcol="${c[0]}" aria-label="Fill ${esc(c[1])} column">⬇</button>`}</th>`).join('')}</tr></thead>
      <tbody>${b.circuits.map((c, i) => `<tr data-r="${i}"><td class="no"><input data-c="no" inputmode="numeric" value="${esc(c.no)}"><button class="rowbtn" data-act="${i}" aria-label="Row actions">⋮</button></td>${COLS.map((col, ci) => `<td${col[2] === 'mz' ? ' class="mzc"' : ''}>${cell(c, col, ci)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="muted">Max Zs fills from BS 7671 tables for BS EN 60898/61009 B, C, D (type a value to override). Red = fails, amber = check. Rule of thumb (0.8×): ${settings.zsRuleOfThumb ? 'ON' : 'OFF'} (Settings). Use “>999” for over-range IR and “LIM” where a test was not possible.</p></div>` : '<div class="card"><p>No boards yet.</p></div>'}
  <div class="card"><h2>Test instruments</h2>
    <div class="row">${fld('instruments.multi', 'Multi-function')}${fld('instruments.ir', 'Insulation')}</div>
    <div class="row">${fld('instruments.continuity', 'Continuity')}${fld('instruments.loop', 'Earth fault loop')}</div>
    <div class="row">${fld('instruments.rcd', 'RCD')}${fld('instruments.earth', 'Earth electrode')}</div>
    <div class="btns"><button class="btn" id="instSave">☆ Save as my default instruments</button><button class="btn" id="instLoad">↺ Load my saved instruments</button></div></div>`;
  bindFields(main, job, p => { if (/\.ref$/.test(p)) main.querySelector(`[data-b="${currentBoard}"]`).textContent = getP(job, p); });
  if (b) markRows(b);
  const tbody = main.querySelector('table.ct tbody');
  tbody?.addEventListener('focusin', e => { const tr = e.target.closest('tr[data-r]'); if (tr) selRow = +tr.dataset.r; });
  tbody?.addEventListener('input', e => {
    const el = e.target; const k = el.dataset.c; if (!k) return; e.stopPropagation();
    const tr = el.closest('tr'); const c = b.circuits[+tr.dataset.r];
    if (k === 'maxZs') { c.maxZs = el.value; c.maxZsManual = el.value.trim() !== ''; } else c[k] = el.value;
    if (c.typ?.[k]) { markTyp(c, k, false); el.removeAttribute('data-typ'); el.parentElement.querySelector('.typtag')?.remove(); }
    if (c.imp?.[k]) { markImported(c, k, false); el.removeAttribute('data-imp'); el.parentElement.querySelector('.imptag')?.remove(); }
    if (c.calc?.[k]) { markCalc(c, k, false); el.classList.remove('calcd'); el.parentElement.querySelector('.calctag')?.remove(); }
    if (k === 'desc' && /ring/i.test(el.value)) c.ring = true;
    if (['bsen', 'type', 'rating', 'maxDisc'].includes(k)) { const m = tableMaxZs(c.bsen, c.type, c.rating, c.maxDisc); tr.querySelector('[data-c="maxZs"]').placeholder = m ?? '?'; }
    scheduleSave(); markRow(tr, c, b);
  });
  for (const id of ['#aiFile', '#aiFileGal']) $(id) && ($(id).onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) boardPhotoFlow(f, b); });
  main.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.b != null) { currentBoard = +t.dataset.b; renderBoards(); return; }
    if (t.id === 'addB') { job.boards.push(newBoard(`DB${job.boards.length + 1}`)); currentBoard = job.boards.length - 1; scheduleSave(); renderBoards(); return; }
    if (t.id === 'delB') { if (confirm(`Delete board ${b.ref} and all its circuits?`)) { job.boards.splice(currentBoard, 1); currentBoard = 0; scheduleSave(); renderBoards(); } return; }
    if (t.id === 'zdbZe') { b.zdb = job.supply.ze; b.ipf = job.supply.ipf; scheduleSave(); renderBoards(); return; }
    if (t.dataset.spd) { b.spd = b.spd || {}; b.spd[t.dataset.spd] = !b.spd[t.dataset.spd]; if (t.dataset.spd === 'NA' && b.spd.NA) b.spd.T1 = b.spd.T2 = b.spd.T3 = false; else if (t.dataset.spd !== 'NA') b.spd.NA = false; scheduleSave(); renderBoards(); return; }
    if (t.dataset.q != null) {
      const q = +t.dataset.q; if (kindOf(job) === 'mw' && b.circuits.length >= 4) return toast('Minor Works allows up to 4 circuits – use an EIC for more');
      const n = Math.max(0, ...b.circuits.map(c => parseInt(c.no) || 0)) + 1;
      b.circuits.push(newCircuit(n, q >= 0 ? structuredClone(QUICK_CIRCUITS[q].c) : {})); scheduleSave(); renderBoards();
      const w = main.querySelector('.tbl-wrap'); w.scrollTop = w.scrollHeight; return;
    }
    if (t.dataset.fill) {
      const f = t.dataset.fill;
      for (const c of b.circuits) {
        if (f === 'polarity' && !c.polarity) c.polarity = '✓';
        if (f === 'testV') c.testV = '500';
        if (f === 'ir') { if (!c.irLL) c.irLL = '>999'; if (!c.irLE) c.irLE = '>999'; }
        if (f === 'rcdBtn' && !c.rcdBtn && (c.rcdType || c.idn)) c.rcdBtn = '✓';
        if (f === 'afddBtn' && !c.afddBtn) c.afddBtn = 'N/A';
        if (f === 'bc' && !c.bc) c.bc = '6';
      }
      scheduleSave(); renderBoards(); toast('Filled empty cells'); return;
    }
    if (t.dataset.calc) {
      const tr = t.closest('tr'); const i = +tr.dataset.r; const c = b.circuits[i]; const k = t.dataset.calc;
      const ze = boardZe(job, currentBoard);
      const r = k === 'r1r2' ? calcR1R2(c.zs, ze.value) : (String(c.zs ?? '').trim() && !c.calc?.zs ? { ok: false, error: 'Zs already measured – clear it first to calculate' } : calcZs(c.r1r2, ze.value));
      if (!r.ok) { toast(r.error + (ze.note ? ` (${ze.note})` : ''), 3500); return; }
      const old = c[k];
      if (String(old ?? '').trim() && String(old) !== r.value && !c.calc?.[k] && !confirm(`Replace ${k === 'zs' ? 'Zs' : 'R1+R2'} ${old} with calculated ${r.value}?`)) return;
      c[k] = r.value; markCalc(c, k, true);
      voiceUndo.push([{ obj: c, k, old }, { obj: c, k: 'calc', old: c.calc && { ...c.calc, [k]: undefined } }]);
      scheduleSave(); const y = scrollY; const sx = main.querySelector('.tbl-wrap')?.scrollLeft; renderBoards(); scrollTo(0, y); if (sx) main.querySelector('.tbl-wrap').scrollLeft = sx;
      flash([{ scope: 'circuit', index: i, field: k }]);
      toast(`${k === 'zs' ? 'Zs' : 'R1+R2'} = ${r.value} (${k === 'zs' ? ze.source + ' + R1+R2' : 'Zs − ' + ze.source})${ze.note ? ' · ' + ze.note : ''}`, 5000, { label: 'Undo', fn: undoDictation });
      return;
    }
    if (t.dataset.fillcol) { fillColumnSheet(b, t.dataset.fillcol); return; }
    if (t.dataset.cyc) {
      const tr = t.closest('tr'); const c = b.circuits[+tr.dataset.r]; const k = t.dataset.cyc;
      c[k] = CYC[(CYC.indexOf(c[k] ?? '') + 1) % CYC.length]; t.textContent = c[k]; scheduleSave(); markRow(tr, c, b); return;
    }
    if (t.dataset.act != null) {
      const i = +t.dataset.act; const c = b.circuits[i];
      modal(`<h2>Circuit ${esc(c.no)} – ${esc(c.desc)}</h2><div class="btns" style="flex-direction:column">
        <button class="btn big" data-a="copy">⧉ Copy circuit (new row below)</button><button class="btn big" data-a="up">↑ Move up</button><button class="btn big" data-a="down">↓ Move down</button>
        <button class="btn big" data-a="ring">${c.ring ? 'Ring final: YES (tap to change)' : 'Ring final: no (tap to change)'}</button>
        <button class="btn big" data-a="lim">Mark untested (LIM)</button><button class="btn big danger" data-a="del">🗑 Delete circuit</button><button class="btn big" data-a="close">Close</button></div>
        <h3>Checks</h3>${checkCircuit(c, b, { ruleOfThumb: settings.zsRuleOfThumb, ze: parseFloat(job.supply.ze) || null }).map(p => `<div class="issue ${p.level}">${p.level === 'error' ? '⛔' : '⚠️'} ${esc(p.msg)}</div>`).join('') || '<p>✅ No problems</p>'}`);
      $('#modalBody').onclick = e2 => {
        const a = e2.target.dataset.a; if (!a) return;
        if (a === 'copy') { const cp = newCircuit(Math.max(0, ...b.circuits.map(x => parseInt(x.no) || 0)) + 1, { ...structuredClone(c), no: undefined }); cp.no = String(Math.max(0, ...b.circuits.map(x => parseInt(x.no) || 0)) + 1); b.circuits.splice(i + 1, 0, cp); }
        if (a === 'up' && i > 0) [b.circuits[i - 1], b.circuits[i]] = [b.circuits[i], b.circuits[i - 1]];
        if (a === 'down' && i < b.circuits.length - 1) [b.circuits[i + 1], b.circuits[i]] = [b.circuits[i], b.circuits[i + 1]];
        if (a === 'ring') c.ring = !c.ring;
        if (a === 'lim') { c.zs = c.zs || 'LIM'; c.remarks = (c.remarks ? c.remarks + ' ' : '') + 'LIM – see Section D'; }
        if (a === 'del' && !confirm('Delete this circuit?')) return;
        if (a === 'del') b.circuits.splice(i, 1);
        closeModal(); scheduleSave(); renderBoards();
      };
    }
    if (t.id === 'instSave') { settings.instruments = { ...job.instruments }; saveSettings(); toast('Saved as default instruments'); }
    if (t.id === 'instLoad') { job.instruments = { ...settings.instruments }; scheduleSave(); renderBoards(); }
    if (t.id === 'dictate') { startDictation(); return; }
    if (t.id === 'undoDict') { undoDictation(); return; }
    if (t.id === 'domDef') { applyDomestic(b, null); return; }
  });
}
function markRow(tr, c, b) {
  const probs = checkCircuit(c, b, { ruleOfThumb: settings.zsRuleOfThumb, ze: parseFloat(job.supply.ze) || null });
  tr.querySelectorAll('[data-c],[data-cyc]').forEach(el => { const k = el.dataset.c || el.dataset.cyc; const p = probs.filter(x => x.field === k); el.classList.toggle('err', p.some(x => x.level === 'error') && String(c[k] ?? '').trim() !== ''); el.classList.toggle('wrn', p.length > 0 && !p.some(x => x.level === 'error' && String(c[k] ?? '').trim() !== '') && String(c[k] ?? '').trim() !== ''); el.title = p.map(x => x.msg).join('\n'); });
}
function markRows(b) { main.querySelectorAll('table.ct tbody tr').forEach(tr => markRow(tr, b.circuits[+tr.dataset.r], b)); }

// ---------- AI board photo import ----------
const APP_VERSION = '1.9.0';
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`${what} timed out after ${ms / 1000} s`)), ms))]);
function drawToJpeg(src, w, h, max, q) {
  const s = Math.min(1, max / Math.max(w, h)); const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
  const g = cv.getContext('2d'); if (!g) throw new Error('canvas unavailable'); g.drawImage(src, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL('image/jpeg', q); if (!url.startsWith('data:image/jpeg')) throw new Error('canvas JPEG export failed');
  return url;
}
const readAsDataUrl = f => new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => bad(r.error || new Error('read failed')); r.readAsDataURL(f); });
/** Shrink a camera photo to ~1600px JPEG. Tries createImageBitmap, then <img>, then sends the original if small enough. */
async function downscaleJpeg(file, max = 1600, q = 0.85, log = () => {}) {
  const tries = [];
  if (window.createImageBitmap) {
    try { const bm = await withTimeout(createImageBitmap(file, { imageOrientation: 'from-image' }), 20000, 'createImageBitmap');
      try { return drawToJpeg(bm, bm.width, bm.height, max, q); } finally { bm.close?.(); } }
    catch (e) { tries.push('bitmap: ' + e.message); log('Preparing photo… (trying another way)'); }
  }
  try {
    const u = URL.createObjectURL(file);
    try { const img = await withTimeout(new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('image decode failed')); i.src = u; }), 20000, 'image load');
      return drawToJpeg(img, img.naturalWidth, img.naturalHeight, max, q); } finally { URL.revokeObjectURL(u); }
  } catch (e) { tries.push('img: ' + e.message); }
  if (/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && file.size < 7e6) { const d = await withTimeout(readAsDataUrl(file), 20000, 'file read'); return d.replace(/^data:[^;]+/, 'data:image/jpeg'); }
  const err = new Error('Couldn’t open that photo on this phone. Try taking it again, or pick a JPEG from the gallery.'); err.detail = `${file.type || 'unknown type'} ${Math.round(file.size / 1024)} KB · ${tries.join(' · ')}`; throw err;
}
async function boardPhotoFlow(file, b) {
  const cfg = aiCfg(settings);
  if (!ai.configured(settings)) { if (confirm(`Photo reading needs a free ${PROVIDERS[cfg.provider].label} API key (one-off setup). Open Settings now?`)) location.hash = '#/settings'; return; }
  const ctl = new AbortController(); const t0 = Date.now(); let step = 'Preparing photo…';
  modal(`<h2>📷 Reading the board…</h2><p id="aiStep"><b>${esc(step)}</b></p><p class="muted" id="aiTime">0 s</p><p class="muted">${esc(PROVIDERS[cfg.provider].label)} · ${esc(cfg.model)}. Usually 5–40 s; retries if Google is busy; gives up after ${Math.round(AI_TIMEOUT_MS / 1000)} s.</p><div class="btns"><button class="btn" id="aiCancel">Cancel</button></div>`);
  const setStep = t => { step = t; const el = $('#aiStep'); if (el) el.innerHTML = `<b>${esc(t)}</b>`; };
  const tick = setInterval(() => { const el = $('#aiTime'); if (el) el.textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 1000);
  let cancelled = false;
  $('#aiCancel').onclick = () => { cancelled = true; ctl.abort(); clearInterval(tick); closeModal(); toast('Photo reading cancelled'); };
  const dlg = $('#modal'); const onClose = () => { if (!cancelled) { cancelled = true; ctl.abort(); clearInterval(tick); } }; dlg.addEventListener('close', onClose, { once: true });
  try {
    const img = await downscaleJpeg(file, 1600, 0.85, setStep);
    if (cancelled) return;
    const res = await ai.importBoardPhoto(img, settings, { signal: ctl.signal, onStatus: setStep });
    if (cancelled) return;
    clearInterval(tick); dlg.removeEventListener('close', onClose);
    reviewImport(res, img, b);
  } catch (err) {
    clearInterval(tick); dlg.removeEventListener('close', onClose);
    if (cancelled || err.code === 'cancel') return;
    console.error('AI import', err);
    const detail = [`step: ${step}`, `after ${((Date.now() - t0) / 1000).toFixed(1)} s`, `model: ${cfg.provider}/${cfg.model}`, `online: ${navigator.onLine}`, `file: ${file.type || '?'} ${Math.round(file.size / 1024)} KB`, `error: ${err.name || ''} ${err.code || ''} ${err.message}`, err.detail ? `detail: ${err.detail}` : '', `app: ${APP_VERSION}`].filter(Boolean).join('\n');
    modal(`<h2>Couldn’t read the board</h2><p>${esc(err.message || String(err))}</p><details><summary>Details (for support)</summary><pre style="white-space:pre-wrap;font-size:11px;max-height:200px;overflow:auto" id="aiDet">${esc(detail)}</pre><button class="btn" id="aiCopy">Copy details</button></details><div class="btns">${['nokey', 'key', 'model'].includes(err.code) ? '<button class="btn" id="goSet">Open Settings</button>' : ''}<button class="btn pri" id="mclose">OK</button></div>`);
    $('#goSet') && ($('#goSet').onclick = () => { closeModal(); location.hash = '#/settings'; });
    $('#aiCopy').onclick = () => navigator.clipboard?.writeText(detail).then(() => toast('Copied'), () => toast('Long-press the text to copy'));
  }
}
function reviewImport(res, img, b) {
  const rows = res.circuits.map(r => ({ ...r, keep: true }));
  const F = [['no', 'Way', 'w1'], ['desc', 'Description', 'w5'], ['device', 'Device', 'w2'], ['bsen', 'BS EN', 'w2'], ['type', 'Curve', 'w1'], ['rating', 'A', 'w1'], ['bc', 'kA', 'w1'], ['rcdType', 'RCD type', 'w1'], ['idn', 'IΔn mA', 'w1']];
  const bi = res.board; const has = b.circuits.length > 0;
  modal(`<h2>Check what was read</h2>
    <p class="muted">Nothing is saved until you tap Apply. <b class="warn">Orange</b> = couldn’t read clearly (left blank) – fill in or leave. Always check against the board.</p>
    <img src="${img}" alt="board photo" style="max-width:100%;max-height:220px;display:block;margin:0 auto 8px;border-radius:6px">
    <p><b>Board:</b> ${esc(bi.make || 'make not read')}${bi.mainSwitchRating ? ` · main switch ${esc(bi.mainSwitchRating)} A` : ''}${bi.rcds.map(r => ` · RCD ${esc([r.label, r.rating && r.rating + 'A', r.idn && r.idn + 'mA', r.type && 'Type ' + r.type].filter(Boolean).join(' '))}${r.covers.length ? ` (ways ${esc(r.covers.join(','))})` : ''}`).join('')}</p>
    ${res.notes ? `<p class="muted">AI notes: ${esc(res.notes)}</p>` : ''}
    <div class="tbl-wrap"><table class="ct imprev"><thead><tr><th>Use</th>${F.map(f => `<th>${f[1]}</th>`).join('')}<th>Conf.</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr data-i="${i}"><td><input type="checkbox" data-k="keep" checked></td>${F.map(([k, , w]) => `<td><input class="${w}${r.unreadable.includes(k) ? ' unread' : ''}" data-k="${k}" value="${esc(r[k])}" ${r.unreadable.includes(k) ? 'placeholder="?"' : ''}></td>`).join('')}<td class="conf-${r.confidence}">${r.confidence}</td></tr>`).join('')}
    </tbody></table></div>
    ${has ? `<div class="seg" id="impMode" style="margin:10px 0"><button type="button" data-m="merge" class="on">Merge into my ${b.circuits.length} circuits</button><button type="button" data-m="replace">Replace all circuits</button></div>
    <p class="muted" id="impNote">Merge matches by way number and only fills empty boxes – your test results are never touched.</p>` : ''}
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="impOk">Apply</button></div>`);
  let mode = 'merge';
  $('#modalBody').oninput = e => { const tr = e.target.closest('tr[data-i]'); if (!tr) return; const r = rows[+tr.dataset.i]; const k = e.target.dataset.k;
    if (k === 'keep') r.keep = e.target.checked; else { r[k] = e.target.value; r.unreadable = r.unreadable.filter(x => x !== k); r.edited = { ...(r.edited || {}), [k]: true }; e.target.classList.remove('unread'); } };
  $('#impMode') && ($('#impMode').onclick = e => { const t = e.target.closest('[data-m]'); if (!t) return; mode = t.dataset.m;
    $('#impMode').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === t));
    $('#impNote').textContent = mode === 'replace' ? 'Replace deletes the current circuit rows on this board (including any test results) and uses the list above.' : 'Merge matches by way number and only fills empty boxes – your test results are never touched.'; });
  $('#impOk').onclick = () => {
    const use = rows.filter(r => r.keep);
    if (mode === 'replace' && has && !confirm(`Delete the ${b.circuits.length} existing circuits on ${b.ref} and replace with ${use.length} from the photo?`)) return;
    const plan = planImport(b.circuits, use, has ? mode : 'replace');
    if (mode === 'replace' || !has) b.circuits = [];
    let added = 0, upd = 0;
    for (const p of plan) {
      const r = use.find(x => x.no === p.no) || {};
      let c = p.index != null ? b.circuits[p.index] : null;
      if (!c) { c = newCircuit(p.no); b.circuits.push(c); added++; } else upd++;
      for (const [k, v] of Object.entries(p.set)) { c[k] = v; markImported(c, k, !r.edited?.[k]); }
      if (/ring/i.test(c.desc)) c.ring = true;
    }
    b.circuits.sort((x, y) => (parseInt(x.no) || 999) - (parseInt(y.no) || 999));
    const bs = boardPlan(b, bi); Object.assign(b, bs);
    const touched = plan.map(p => b.circuits.findIndex(c => String(c.no) === String(p.no))).filter(i => i >= 0);
    closeModal(); scheduleSave(); renderBoards();
    setTimeout(() => askDomestic(b, touched), 300);
    toast(`${added} circuits added, ${upd} updated${Object.keys(bs).length ? ', board RCD filled' : ''}. AI values are tagged until you edit them.`, 4000);
  };
}

// ---------- domestic defaults ----------
function askDomestic(b, idx) {
  if (!idx.length) return;
  modal(`<h2>Is this a domestic installation?</h2><p>If yes, I’ll fill typical UK domestic values – wiring type, reference method, live/cpc sizes – into <b>empty</b> boxes of the ${idx.length} imported circuit${idx.length === 1 ? '' : 's'}. Nothing you’ve entered is changed, spares and unknown circuits are skipped, and filled values are tagged <span class="typtag" style="position:static">typ</span> until you check/edit them.</p><div class="btns"><button class="btn" id="domNo">No</button><button class="btn pri" id="domYes">Yes – fill typical values</button></div>`);
  $('#domNo').onclick = closeModal; $('#domYes').onclick = () => { closeModal(); applyDomestic(b, idx); };
}
function applyDomestic(b, idx) {
  const { plan, unknown, spare } = planDomestic(b.circuits, settings.domesticRules || DEFAULT_RULES_TEXT, idx);
  if (!plan.length) return toast(`Nothing to fill${unknown ? ` – ${unknown} circuit type(s) not recognised or already different` : ''}${spare ? `, ${spare} spare` : ''}. Rules are in Settings → Domestic defaults.`, 5000);
  const undo = [];
  for (const p of plan) { const c = b.circuits[p.index]; undo.push({ obj: c, k: 'typ', old: c.typ ? { ...c.typ } : undefined });
    for (const [k, v] of Object.entries(p.set)) { undo.push({ obj: c, k, old: c[k] }); c[k] = v; markTyp(c, k, true); } }
  voiceUndo.push(undo); if (voiceUndo.length > 20) voiceUndo.shift();
  scheduleSave(); renderBoards();
  toast(`Typical values filled on ${plan.length} circuit${plan.length === 1 ? '' : 's'}${unknown ? `, ${unknown} not recognised (left blank)` : ''}. Check them!`, 7000, { label: 'Undo', fn: undoDictation });
}

// ---------- settings ----------
function renderSettings() {
    fresh();
  main.innerHTML = `<div class="card"><h2>Your business (printed on reports)</h2>
    ${fld('contractor.name', 'Business name', { obj: settings, scope: 'settings' })}${fld('contractor.address', 'Address', { obj: settings, scope: 'settings', type: 'textarea' })}
    <div class="row">${fld('contractor.phone', 'Phone', { obj: settings, scope: 'settings', type: 'tel' })}${fld('contractor.email', 'Email', { obj: settings, scope: 'settings', type: 'email' })}</div>
    ${fld('contractor.scheme', 'Scheme (e.g. NICEIC / NAPIT)', { obj: settings, scope: 'settings' })}${fld('contractor.regNo', 'Registration / enrolment no.', { obj: settings, scope: 'settings' })}
    <label class="f"><span>Logo</span></label>${settings.contractor.logo ? `<img class="sigprev" src="${settings.contractor.logo}" alt="logo">` : ''}
    <div class="btns"><label class="btn" style="display:inline-flex;align-items:center">🖼 Choose logo<input type="file" id="logo" accept="image/*" hidden></label>${settings.contractor.logo ? '<button class="btn danger" id="rmLogo">Remove</button>' : ''}</div></div>
  <div class="card"><h2>Inspector</h2>${fld('inspector.name', 'Name (capitals)', { obj: settings, scope: 'settings' })}${fld('inspector.position', 'Position', { obj: settings, scope: 'settings' })}
    ${settings.inspector.signature ? `<img class="sigprev" src="${settings.inspector.signature}" alt="signature">` : '<p class="muted">No saved signature</p>'}<button class="btn" id="sig">✍ Save my signature</button></div>
  <div class="card"><h2>Default test instruments</h2>
    <div class="row">${fld('instruments.multi', 'Multi-function', { obj: settings, scope: 'settings' })}${fld('instruments.ir', 'Insulation', { obj: settings, scope: 'settings' })}</div>
    <div class="row">${fld('instruments.continuity', 'Continuity', { obj: settings, scope: 'settings' })}${fld('instruments.loop', 'Earth fault loop', { obj: settings, scope: 'settings' })}</div>
    <div class="row">${fld('instruments.rcd', 'RCD', { obj: settings, scope: 'settings' })}${fld('instruments.earth', 'Earth electrode', { obj: settings, scope: 'settings' })}</div></div>
  <div class="card"><h2>AI photo import</h2>
    <p class="muted">Reads circuits from a photo of the board. Your key is kept only on this phone (not in backups). The photo goes straight from your phone to the AI company you pick.</p>
    <label class="f"><span>AI provider</span></label><div class="seg" id="aiProv" style="margin-bottom:12px">${Object.entries(PROVIDERS).map(([k, v]) => `<button type="button" data-prov="${k}" class="${aiCfg(settings).provider === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
    <label class="f"><span>${PROVIDERS[aiCfg(settings).provider].label} API key</span><input id="aiKey" type="password" autocomplete="off" placeholder="paste key" value="${esc(getKey(aiCfg(settings).provider))}"></label>
    <p class="muted"><a href="${PROVIDERS[aiCfg(settings).provider].keyUrl}" target="_blank" rel="noopener">Get a key ↗</a>${aiCfg(settings).provider === 'gemini' ? ' (free – sign in with Google, tap “Create API key”)' : ' (paid account)'}</p>
    <label class="f"><span>Model (blank = ${PROVIDERS[aiCfg(settings).provider].defaultModel})</span><input id="aiModel" placeholder="${PROVIDERS[aiCfg(settings).provider].defaultModel}" value="${esc(settings.ai?.model || '')}"></label></div>
  <div class="card"><h2>Domestic defaults</h2>
    <p class="muted">Used by “🏠 Domestic defaults” and after photo import. Only fills empty boxes. One rule per line, first match wins:<br><code>words in description | ratings A (e.g. 6 or 40-50) | live/cpc mm² | wiring code | ref method</code><br>Max Zs is filled automatically from the BS 7671 tables from device type/curve/rating.</p>
    <textarea id="domTxt" style="min-height:220px;font-size:13px;font-family:monospace">${esc(settings.domesticRules || DEFAULT_RULES_TEXT)}</textarea>
    <div class="btns"><button class="btn pri" id="domSave">Save rules</button><button class="btn" id="domReset">Reset to built-in</button></div></div>
  <div class="card"><h2>Reports</h2><div class="row"><label class="f"><span>Reference prefix</span><input id="refPre" value="${esc(settings.refPrefix || DEFAULT_REF_PREFIX)}" maxlength="8"></label><label class="f"><span>Next number</span><input id="refNext" inputmode="numeric" value="${esc(settings.nextNumber)}"></label></div>
    <p class="muted">New reports are numbered <b>${esc(cleanPrefix(settings.refPrefix) || DEFAULT_REF_PREFIX)}-EICR-YYMM-${String(settings.nextNumber).padStart(4, '0')}</b>. The number only ever goes up (never reused, even if a report is deleted). Restoring a backup on a new phone continues the sequence.</p>
    ${fld('defaultInterval', 'Default next inspection (years)', { obj: settings, scope: 'settings', type: 'seg', options: ['1', '3', '5', '10'] })}
    ${fld('zsRuleOfThumb', 'Check measured Zs against 0.8 × tabulated max (rule of thumb)', { obj: settings, scope: 'settings', type: 'check' })}</div>
  <div class="card"><h2>Observation library</h2><p class="muted">One per line: CODE | regulation | description | schedule item(s)</p>
    <textarea id="libTxt" style="min-height:200px;font-size:14px">${esc((settings.obsLibrary || OBS_LIBRARY).map(o => `${o.code} | ${o.reg} | ${o.desc} | ${(o.items || []).join(', ')}`).join('\n'))}</textarea>
    <div class="btns"><button class="btn pri" id="libSave">Save library</button><button class="btn" id="libReset">Reset to built-in</button></div></div>
  <div class="card"><h2>Demo</h2><button class="btn" id="sample">Load sample domestic job</button>
    <p class="muted">EICR Pad v1 · data stored only on this device · works offline once opened.</p></div>`;
  bindFields(main, settings);
  $('#aiProv').onclick = async e => { const t = e.target.closest('[data-prov]'); if (!t) return; settings.ai = { provider: t.dataset.prov, model: '' }; await saveSettings(); const y = scrollY; renderSettings(); scrollTo(0, y); };
  $('#aiKey').onchange = e => { setKey(aiCfg(settings).provider, e.target.value); toast(e.target.value.trim() ? 'Key saved on this phone' : 'Key removed'); };
  $('#aiModel').onchange = async e => { settings.ai = { ...aiCfg(settings), model: e.target.value.trim() }; await saveSettings(); };
  $('#logo').onchange = async e => { const f = e.target.files[0]; if (!f) return; settings.contractor.logo = await shrinkImage(f, 600, 280); await saveSettings(); renderSettings(); };
  $('#rmLogo') && ($('#rmLogo').onclick = async () => { settings.contractor.logo = ''; settings.contractor.logoRemoved = true; await saveSettings(); renderSettings(); });
  $('#sig').onclick = () => signaturePad(async url => { settings.inspector.signature = url; await saveSettings(); renderSettings(); });
  $('#libSave').onclick = async () => {
    settings.obsLibrary = $('#libTxt').value.split('\n').map(l => l.split('|').map(s => s.trim())).filter(p => p.length >= 3 && p[2]).map(([code, reg, desc, items]) => ({ code: code.toUpperCase(), reg, desc, items: items ? items.split(/[ ,]+/).filter(x => INSPECTION_ITEMS.some(i => i.id === x)) : suggestItems(desc, reg, 1) }));
    await saveSettings(); toast(`Saved ${settings.obsLibrary.length} entries`);
  };
  $('#refPre').onchange = async e => { const v = cleanPrefix(e.target.value); if (!v) { e.target.value = settings.refPrefix; return toast('Prefix needs letters/numbers'); } settings.refPrefix = v; await saveSettings(); const y = scrollY; renderSettings(); scrollTo(0, y); };
  $('#refNext').onchange = async e => { const v = parseInt(e.target.value, 10); const min = Math.max(Number(settings.nextNumber) || 1, maxRefNum(await db.allJobs()) + 1);
    if (!(v >= min)) { e.target.value = settings.nextNumber; return alert(`The number can only go up (minimum ${min}) so references are never reused.`); } settings.nextNumber = v; await saveSettings(); const y = scrollY; renderSettings(); scrollTo(0, y); };
  $('#domSave').onclick = async () => { const v = $('#domTxt').value.trim(); settings.domesticRules = v === DEFAULT_RULES_TEXT ? null : v; await saveSettings(); toast('Domestic rules saved'); };
  $('#domReset').onclick = async () => { settings.domesticRules = null; await saveSettings(); const y = scrollY; renderSettings(); scrollTo(0, y); };
  $('#libReset').onclick = async () => { settings.obsLibrary = null; await saveSettings(); renderSettings(); };
  $('#sample').onclick = async () => { const j = sampleJob(settings); j.id = uid(); await db.putJob(j); location.hash = `#/job/${j.id}/check`; };
}
function shrinkImage(file, maxW, maxH) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, maxW / img.width, maxH / img.height); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', 0.9)); URL.revokeObjectURL(img.src);
    }; img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}

function pickItems(o, done) {
  o.items ??= [];
  modal(`<h2>Link to schedule items</h2><input id="iq" type="search" placeholder="Search e.g. bonding, RCD, 5.18" style="margin-bottom:8px"><div class="lib" id="il"></div><div class="btns"><button class="btn pri" id="mclose">Done</button></div>`);
  const sug = suggestItems(o.desc, o.reg, 4);
  const draw = q => { q = q.toLowerCase();
    const list = INSPECTION_ITEMS.filter(i => !q || (i.id + ' ' + i.text).toLowerCase().includes(q)).sort((a, b) => (sug.includes(b.id) - sug.includes(a.id)));
    $('#il').innerHTML = list.map(i => `<button data-it="${i.id}">${o.items.includes(i.id) ? '☑' : '☐'} <b>${displayId(i.id)}</b> ${esc(i.text)} ${sug.includes(i.id) ? '<span class="badge issued">suggested</span>' : ''}</button>`).join(''); };
  draw(''); $('#iq').oninput = e => draw(e.target.value);
  $('#il').onclick = e => { const b = e.target.closest('[data-it]'); if (!b) return; const id = b.dataset.it; o.items = o.items.includes(id) ? o.items.filter(x => x !== id) : [...o.items, id]; draw($('#iq').value); };
  $('#mclose').onclick = () => { closeModal(); done(); };
}

function fillColumnSheet(b, field) {
  const col = COLS.find(c => c[0] === field); const label = col ? col[1] : field;
  const cs = b.circuits; const st = { value: '', overwrite: false, skipSpare: true };
  const commons = [...new Set([...(COMMON_VALUES[field] || []), ...(col && col[2] === 'sel' ? col[3].filter(Boolean) : [])])];
  const fromRow = i => (cs[i] ? String(cs[i][field] ?? '') : '');
  const sel = selRow != null && cs[selRow] && selRow !== 0 ? selRow : null;
  modal(`<h2>Fill column: ${esc(label)}</h2>
    <label class="f"><span>Value</span><input id="fv" ${col && col[2] === 'num' ? 'inputmode="decimal"' : ''} autocomplete="off"></label>
    <div class="seg" id="fcom" style="margin-bottom:10px">${commons.map(v => `<button type="button" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div>
    <div class="btns">${fromRow(0) ? `<button class="btn" data-from="0">Copy from cct ${esc(cs[0].no)} (${esc(fromRow(0))})</button>` : ''}${sel != null && fromRow(sel) ? `<button class="btn" data-from="${sel}">Copy from selected cct ${esc(cs[sel].no)} (${esc(fromRow(sel))})</button>` : ''}</div>
    ${field === 'r1r2' ? `<button class="btn big" id="fcalc">Σ Calculate all from Zs − ${esc(boardZe(job, currentBoard).source)}</button><p class="muted" id="fcalcnote">${esc(boardZe(job, currentBoard).note || '')}</p>` : ''}
    <label class="chk"><input type="checkbox" id="fow"> Overwrite cells that already have a value</label>
    <label class="chk"><input type="checkbox" id="fsk" checked> Skip spare / untested circuits</label>
    <p id="fprev" class="muted" style="font-size:15px"></p>
    <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="fgo" disabled>Fill</button></div>`);
  const upd = () => {
    if (st.calc) {
      const p = planCalcAll(cs, boardZe(job, currentBoard).value, st);
      $('#fprev').innerHTML = `Calculates <b>${p.fills}</b> empty cell${p.fills === 1 ? '' : 's'}${p.replaces ? `, replaces <b>${p.replaces}</b>` : ''}${p.skipped ? ` · ${p.skipped} skipped` : ''}${p.bad ? ` · ${p.bad} with unusable Zs/Ze` : ''}`;
      $('#fgo').disabled = !p.changes.length; $('#fgo').textContent = p.changes.length ? `Calculate ${p.changes.length}` : 'Calculate';
      return p;
    }
    const p = planFill(cs, field, st.value, st);
    $('#fprev').innerHTML = st.value ? `Fills <b>${p.fills}</b> empty cell${p.fills === 1 ? '' : 's'}${p.replaces ? `, replaces <b>${p.replaces}</b>` : ''}${p.skipped ? ` · ${p.skipped} skipped` : ''}` : 'Enter or pick a value';
    $('#fgo').disabled = !p.changes.length; $('#fgo').textContent = p.changes.length ? `Fill ${p.changes.length}` : 'Fill';
    $('#fcom').querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === st.value));
    return p;
  };
  const setV = v => { st.value = v; st.calc = false; $('#fcalc')?.classList.remove('pri'); $('#fv').value = v; upd(); };
  $('#fv').oninput = e => { st.value = e.target.value; st.calc = false; $('#fcalc')?.classList.remove('pri'); upd(); };
  $('#fcalc') && ($('#fcalc').onclick = () => { st.calc = true; st.value = ''; $('#fv').value = ''; $('#fcalc').classList.add('pri'); upd(); });
  $('#fcom').onclick = e => { const x = e.target.closest('[data-v]'); if (x) setV(x.dataset.v); };
  $('#modalBody').querySelectorAll('[data-from]').forEach(x => (x.onclick = () => setV(fromRow(+x.dataset.from))));
  $('#fow').onchange = e => { st.overwrite = e.target.checked; upd(); };
  $('#fsk').onchange = e => { st.skipSpare = e.target.checked; upd(); };
  $('#fgo').onclick = () => {
    const p = upd(); const prevCalc = p.changes.map(ch => ({ obj: cs[ch.index], k: 'calc', old: cs[ch.index].calc ? { ...cs[ch.index].calc } : undefined }));
    const undo = applyFill(cs, field, p).map(u => ({ obj: cs[u.index], k: u.field, old: u.old })).concat(prevCalc);
    p.changes.forEach(ch => markCalc(cs[ch.index], field, !!st.calc));
    voiceUndo.push(undo); closeModal(); scheduleSave();
    const y = scrollY; renderBoards(); scrollTo(0, y); flash(p.changes.map(ch => ({ scope: 'circuit', index: ch.index, field })));
    toast(`Filled ${p.changes.length} ${label} cell${p.changes.length === 1 ? '' : 's'}`, 6000, { label: 'Undo', fn: undoDictation });
  };
  upd(); setTimeout(() => $('#fv')?.focus(), 50);
}

// ---------- voice dictation ----------
let voiceLast = null; const voiceUndo = [];
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function gboardTip() { return '<p class="muted">Tip: the keyboard mic (Gboard voice typing) still works in any box, even offline.</p>'; }
function startDictation() {
  if (!SR || !navigator.onLine) {
    modal(`<h2>🎤 Dictate results</h2><p>${!SR ? 'Voice input isn’t supported in this browser. Use Chrome on Android.' : 'You seem to be offline – phone voice recognition usually needs signal.'}</p>${gboardTip()}
      <p>You can type or voice-type the phrase here instead:</p><textarea id="vtxt" placeholder="e.g. circuit 3 Zs 0.42 IR greater than 999 RCD 22"></textarea>
      <div class="btns"><button class="btn" id="mclose">Cancel</button><button class="btn pri" id="vgo">Read it</button></div>`);
    $('#vgo').onclick = () => { const t = $('#vtxt').value.trim(); if (t) handleTranscript(t); };
    return;
  }
  const rec = new SR(); rec.lang = 'en-GB'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = '', done = false;
  modal(`<h2>🎤 Listening…</h2><p class="muted">Say e.g. “circuit 3 Zs nought point four two, IR greater than 999, RCD 22”.</p>
    <div id="vlive" style="min-height:60px;font-size:20px;font-weight:600;padding:10px;background:#f1f5f9;border-radius:10px"></div>
    <div class="btns"><button class="btn" id="vcancel">Cancel</button><button class="btn pri" id="vstop">Done</button></div>`);
  $('#vcancel').onclick = () => { done = true; try { rec.abort(); } catch {} closeModal(); };
  $('#vstop').onclick = () => { try { rec.stop(); } catch {} };
  rec.onresult = e => { let t = ''; for (const r of e.results) t += r[0].transcript; $('#vlive') && ($('#vlive').textContent = t); if (e.results[e.results.length - 1].isFinal) finalText = t; else finalText = t; };
  rec.onerror = e => { if (done) return; done = true;
    const msg = e.error === 'not-allowed' ? 'Microphone permission was blocked. Allow the mic for this site in Chrome settings.' : e.error === 'network' ? 'Voice recognition needs a connection.' : e.error === 'no-speech' ? 'Didn’t hear anything – try again.' : 'Voice recognition error: ' + e.error;
    $('#modalBody').innerHTML = `<h2>🎤</h2><p>${msg}</p>${gboardTip()}<div class="btns"><button class="btn" id="mclose">Close</button><button class="btn pri" id="vagain">Try again</button></div>`;
    $('#mclose').onclick = closeModal; $('#vagain').onclick = startDictation; };
  rec.onend = () => { if (done) return; done = true; if (finalText.trim()) handleTranscript(finalText.trim()); else { closeModal(); toast('Didn’t catch that – try again'); } };
  try { rec.start(); } catch (err) { closeModal(); toast('Could not start the mic: ' + err.message); }
}
function dictCtx() { const b = job.boards[currentBoard]; return { b, circuits: b ? b.circuits : [] }; }
function cctLabel(c) { return `Cct ${esc(c.no)} ${esc(c.desc || '')}`; }
function handleTranscript(text) {
  const { b, circuits } = dictCtx();
  const res = parseDictation(text, { circuits, lastIndex: voiceLast });
  const rows = res.updates.map(u => ({ ...u, on: true }));
  const qs = res.questions.map(q => ({ ...q }));
  const draw = () => {
    const rowHtml = rows.map((u, i) => {
      const old = u.scope === 'supply' ? job.supply[u.field] : circuits[u.index]?.[u.field];
      const where = u.scope === 'supply' ? 'Supply' : cctLabel(circuits[u.index]);
      const changed = old != null && String(old) !== '' && String(old) !== String(u.value);
      return `<label class="chk" style="font-weight:500;border-bottom:1px solid #e2e8f0"><input type="checkbox" data-ri="${i}" ${u.on ? 'checked' : ''}>
        <span><b>${where}</b><br>${esc(FIELD_LABELS[u.field] || u.field)}: ${changed ? `<s style="color:var(--bad)">${esc(old)}</s> → ` : ''}<b style="color:var(--acc)">${esc(u.value)}</b>${changed ? ' <small class="muted">(replaces)</small>' : ''}</span></label>`; }).join('');
    const qHtml = qs.map((q, qi) => `<div class="issue warn" style="display:block"><b>Which circuit${q.said ? ` for “${esc(q.said)}”` : ''}?</b> (${q.updates.map(u => `${esc(FIELD_LABELS[u.field] || u.field)} ${esc(u.value)}`).join(', ')})
      <div class="btns">${q.candidates.map(ci => `<button class="btn" data-q="${qi}" data-ci="${ci}">${cctLabel(circuits[ci])}</button>`).join('')}</div></div>`).join('');
    $('#modalBody').innerHTML = `<h2>Check before filling in</h2><label class="f"><span>Heard (edit and tap Re-read if wrong)</span><textarea id="vheard">${esc(text)}</textarea></label>
      <div class="btns"><button class="btn" id="vreread">↻ Re-read</button></div>
      ${b ? `<p class="muted">Board ${esc(b.ref)}</p>` : ''}${qHtml}${rowHtml || (qs.length ? '' : '<p>Nothing recognised to fill in.</p>')}
      ${res.notes.length ? `<p class="muted">${res.notes.map(esc).join('<br>')}</p>` : ''}
      <div class="btns"><button class="btn" id="vcancel">Cancel</button><button class="btn" id="vedit">✎ Edit</button><button class="btn pri" id="vapply" ${rows.some(r => r.on) ? '' : 'disabled'}>✓ Apply ${rows.filter(r => r.on).length}</button></div>`;
    $('#vcancel').onclick = closeModal;
    $('#vedit').onclick = () => { const t = $('#vheard'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); };
    $('#vreread').onclick = () => handleTranscript($('#vheard').value);
    $('#modalBody').querySelectorAll('[data-ri]').forEach(cb => (cb.onchange = () => { rows[+cb.dataset.ri].on = cb.checked; draw(); }));
    $('#modalBody').querySelectorAll('[data-q]').forEach(btn => (btn.onclick = () => { const q = qs[+btn.dataset.q]; const ci = +btn.dataset.ci;
      rows.push(...q.updates.map(u => ({ ...u, index: ci, field: u.field === 'r2' && !circuits[ci].ring ? 'R2' : u.field, on: true }))); qs.splice(+btn.dataset.q, 1); voiceLast = ci; draw(); }));
    $('#vapply').onclick = () => applyDictation(rows.filter(r => r.on), b);
  };
  if (!$('#modal').open) $('#modal').showModal();
  if (res.lastIndex != null) voiceLast = res.lastIndex;
  draw();
}
function applyDictation(rows, b) {
  const undo = [];
  for (const u of rows) {
    if (u.scope === 'supply') { undo.push({ obj: job.supply, k: u.field, old: job.supply[u.field] }); job.supply[u.field] = u.value; }
    else { const c = b.circuits[u.index]; if (!c) continue; undo.push({ obj: c, k: u.field, old: c[u.field] }); if (c.calc?.[u.field]) { undo.push({ obj: c, k: 'calc', old: { ...c.calc } }); markCalc(c, u.field, false); } c[u.field] = u.value; }
  }
  voiceUndo.push(undo); if (voiceUndo.length > 20) voiceUndo.shift();
  closeModal(); scheduleSave();
  const y = scrollY; VIEWS[currentTab]?.(); scrollTo(0, y); flash(rows);
  toast(`Filled ${rows.length} cell${rows.length === 1 ? '' : 's'}`, 6000, { label: 'Undo', fn: undoDictation });
}
function undoDictation() {
  const u = voiceUndo.pop(); if (!u) return toast('Nothing to undo');
  for (const x of u.reverse()) x.obj[x.k] = x.old;
  scheduleSave(); const y = scrollY; VIEWS[currentTab]?.(); scrollTo(0, y); toast('Dictation undone');
}
function flash(rows) {
  for (const u of rows) {
    const el = u.scope === 'supply' ? main.querySelector(`[data-p="supply.${u.field}"]`) : main.querySelector(`tr[data-r="${u.index}"] [data-c="${u.field}"], tr[data-r="${u.index}"] [data-cyc="${u.field}"]`);
    if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2500); }
  }
  const first = main.querySelector('.flash'); first?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
}
$('#micFab').onclick = startDictation;

// ---------- modal & signature ----------
function modal(html) { $('#modalBody').innerHTML = html; if (!$('#modal').open) $('#modal').showModal(); $('#mclose') && ($('#mclose').onclick = closeModal); }
function closeModal() { $('#modal').close(); $('#modalBody').onclick = null; }
function signaturePad(done) {
  modal(`<h2>Sign with your finger</h2><canvas class="sigpad" id="sp"></canvas><div class="btns"><button class="btn" id="spc">Clear</button><button class="btn" id="spx">Cancel</button><button class="btn pri" id="spok">Use signature</button></div>`);
  const cv = $('#sp'); const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr; const g = cv.getContext('2d'); g.scale(dpr, dpr);
  g.lineWidth = 2.6; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = '#0b1f5c';
  let drawing = false, any = false, last;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { drawing = true; last = pt(e); cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!drawing) return; const p = pt(e); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p; any = true; };
  cv.onpointerup = cv.onpointercancel = () => (drawing = false);
  $('#spc').onclick = () => { g.clearRect(0, 0, cv.width, cv.height); any = false; };
  $('#spx').onclick = closeModal;
  $('#spok').onclick = () => { if (!any) return toast('Sign first'); const url = cv.toDataURL('image/png'); closeModal(); done(url); };
}

// ---------- boot ----------
(async function boot() {
  const s = await db.getKV('settings');
  settings = { ...defaultSettings(), ...(s || {}) };
  for (const k of ['contractor', 'inspector', 'instruments']) settings[k] = { ...defaultSettings()[k], ...(settings[k] || {}) };
  if (!settings.contractor.name || settings.contractor.name === 'Daniels Electrical') { settings.contractor.name = defaultSettings().contractor.name; await saveSettings(); }
  if (!settings.contractor.logo && !settings.contractor.logoRemoved) { settings.contractor.logo = defaultSettings().contractor.logo; await saveSettings(); }
  if (settings.refPrefix === undefined) { settings.refPrefix = DEFAULT_REF_PREFIX; await saveSettings(); }
  { const m = maxRefNum(await db.allJobs()) + 1; if ((Number(settings.nextNumber) || 1) < m) { settings.nextNumber = m; await saveSettings(); } }
  if (!s) await saveSettings();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW', err));
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  route();
  if (location.search.includes('debug')) window.__eicr = { get job() { return job; }, get settings() { return settings; }, db, dictate: t => handleTranscript(t) };
})();

import { DEFAULT_EDITION } from './presets.js';
import { DEFAULT_LOGO } from './default-logo.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const today = () => new Date().toISOString().slice(0, 10);

export function addYears(iso, years) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + Number(years || 0));
  return d.toISOString().slice(0, 10);
}

export function defaultSettings() {
  return {
    contractor: { name: 'Chorley Electrical Services Ltd', address: '', phone: '', email: '', regNo: '', scheme: '', logo: DEFAULT_LOGO },
    inspector: { name: '', position: 'Qualified Supervisor', signature: '' },
    instruments: { multi: '', ir: '', continuity: '', loop: '', rcd: '', earth: '' },
    reportPrefix: 'EICR-', refPrefix: 'CES', nextNumber: 1, // refs: CES-EICR-YYMM-NNNN (js/refno.js)
    zsRuleOfThumb: true, defaultInterval: 5,
    obsLibrary: null, // null = use built-in list
    domesticRules: null, // null = built-in DEFAULT_RULES_TEXT (js/domestic.js)
    ai: { provider: 'gemini', model: '' }, // AI photo import; API keys are kept in localStorage only
  };
}

export function newCircuit(n = 1, preset = {}) {
  return { id: uid(), no: String(n), desc: '', wiring: '', refMethod: '', points: '', live: '', cpc: '', maxDisc: '0.4',
    bsen: '', type: '', rating: '', bc: '', rcdBsen: '', rcdType: '', idn: '', rcdRating: '', maxZs: '', maxZsManual: false,
    r1: '', rn: '', r2: '', r1r2: '', R2: '', testV: '500', irLL: '', irLE: '', polarity: '', zs: '', rcdTime: '', rcd5x: '',
    rcdBtn: '', afddBtn: '', remarks: '', ring: false, ...preset, id: uid() };
}

export function newBoard(ref = 'DB1') {
  return { id: uid(), ref, location: '', suppliedFrom: 'Origin', ocpdBsen: '', ocpdType: '', ocpdRating: '',
    spd: { T1: false, T2: false, T3: false, NA: false }, rcdBsen: '', rcdType: '', rcdRating: '', rcdIdn: '',
    zdb: '', ipf: '', polarityOk: false, phaseSeqOk: false, spdOk: false, circuits: [] };
}

export function newJob(settings = defaultSettings()) {
  const s = settings;
  const d = today();
  return {
    id: uid(), created: Date.now(), updated: Date.now(), status: 'draft', kind: 'eicr', edition: DEFAULT_EDITION,
    reportNo: `${s.reportPrefix || ''}${String(s.nextNumber || 1).padStart(4, '0')}`,
    client: { name: '', address: '' },
    reason: '', inspDates: d,
    installation: { occupier: '', address: '', premises: 'Residential', premisesOther: '', wiringAge: '', alterations: '', alterationsAge: '', records: '', lastInspection: '' },
    extent: { covered: 'Whole installation', limitations: '', agreedWith: '', operational: '' },
    summary: { general: '' },
    next: { intervalYears: String(s.defaultInterval || 5), date: addYears(d, s.defaultInterval || 5), reasons: '' },
    declaration: {
      inspector: { name: s.inspector?.name || '', signature: '', position: s.inspector?.position || '', date: d, useSaved: true },
      authoriser: { sameAsInspector: true, name: '', signature: '', position: '', date: d },
    },
    supply: { earthing: '', acdc: 'AC', conductors: '1-phase, 2-wire', u: '230', u0: '230', freq: '50', ipf: '', ze: '', polarityConfirmed: false, otherSources: false,
      deviceBsen: 'BS 88-3', deviceType: '', deviceRating: '' },
    origin: { meansEarthing: '', maxDemand: '', maxDemandUnit: 'A', electrodeType: '', electrodeLocation: '', electrodeRa: '',
      earthingMaterial: 'Copper', earthingCsa: '', earthingVerified: false, bondingMaterial: 'Copper', bondingCsa: '', bondingVerified: false,
      bondWater: '', bondGas: '', bondOil: '', bondSteel: '', bondOther: '', bondOtherSpec: '',
      msLocation: '', msBsen: '', msPoles: '2', msCurrent: '', msVoltage: '230', msDevice: 'Isolator', msRating: '',
      msRcdType: '', msIdn: '', msRcdTime: '' },
    inspection: {},
    boards: [newBoard('CU1')],
    observations: [],
    noRemedial: false,
    instruments: { ...(s.instruments || {}) },
    photos: [], // reserved: {id, dataUrl, obsId} – future photo evidence / AI import
  };
}

export function newEic(settings = defaultSettings()) {
  const j = newJob(settings);
  j.kind = 'eic';
  j.eic = {
    installType: 'New installation', // New installation | Addition | Alteration
    description: '',
    departures: '', exceptions: '', riskAssessment: false,
    commentsExisting: '',
    singleSignature: true, // A4 allows one person to sign for design+construction+I&T
    design: { name: '', date: today(), departures: '' },
    design2: { name: '', date: '', departures: '' },
    construction: { name: '', date: today(), departures: '' },
    inspection: { name: '', date: today(), departures: '' },
  };
  j.reason = ''; // unused
  return j;
}
/** EV charge point: EIC (new circuit) + EV supplement (BS 7671 Section 722, IET CoP EV). */
export function newEv(settings = defaultSettings()) {
  const j = newEic(settings);
  j.kind = 'ev';
  j.eic.description = 'Installation of a new dedicated circuit and electric vehicle charging point (Mode 3)';
  j.extent.covered = 'New EV charging point circuit from the consumer unit to the charge point, including the charge point.';
  j.ev = newEvSupplement();
  j.boards[0].circuits = [newCircuit(1, { desc: 'EV charger', bsen: '61009', type: 'B', rating: '32', points: '1' })];
  return j;
}
export function newEvSupplement() {
  return {
    make: '', model: '', serial: '', powerKw: '7.4', mode: 'Mode 3', outlet: 'Tethered', connector: 'Type 2', phases: 'Single phase',
    location: 'Outdoor – wall mounted', ipRating: '', ikRating: '',
    pmeMethod: '', // see EV_PME_OPTIONS
    pmeNotes: '', electrodeType: '', electrodeRa: '', electrodeLocation: '',
    rcdType: '', rcdIdn: '30', rddc: '', // RDC-DD built in?
    deviceBsen: '61009', deviceType: 'B', deviceRating: '32',
    cableType: '', cableCsa: '6', cpcCsa: '', cableLength: '', refMethod: '', cableRoute: '',
    vdPct: '', maxDemandA: '', supplyFuseA: '', admdNotes: '', loadMgmt: '', ctClamp: false,
    dnoMethod: '', dnoDate: '', dnoRef: '', dno: '',
    smartCompliant: false, offPeakDefault: false, randomDelay: false, smartNotes: '',
    commissioned: false, wifiApp: '', firmware: '',
    handover: false, manualsLeft: false, customerShown: false,
    photos: false, notes: '',
  };
}
export function newMw(settings = defaultSettings()) {
  const j = newJob(settings);
  j.kind = 'mw';
  j.boards = [newBoard('CU1')];
  j.mw = {
    description: '', completed: today(),
    departures: '', exceptions: '', riskAssessment: false,
    commentsExisting: '',
    earthingOk: false, bonding: { water: '', gas: '', oil: '', steel: '', other: '', otherSpec: '' },
  };
  // one blank circuit ready
  j.boards[0].circuits = [newCircuit(1)];
  return j;
}

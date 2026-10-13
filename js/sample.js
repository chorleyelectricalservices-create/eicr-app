import { newJob, newCircuit, newBoard, defaultSettings } from './model.js';
import { QUICK_CIRCUITS, INSPECTION_ITEMS, DOMESTIC_TEMPLATE } from './presets.js';
import { recalcSchedule } from './links.js';

export function sampleSettings() {
  const s = defaultSettings();
  s.contractor = { name: 'Chorley Electrical Services Ltd', address: '[PLACEHOLDER ADDRESS – set in Settings], Chorley', phone: '[PLACEHOLDER PHONE]', email: '[PLACEHOLDER EMAIL]', regNo: '[PLACEHOLDER REG NO]', scheme: '[PLACEHOLDER SCHEME]', logo: s.contractor.logo };
  s.inspector = { name: 'TOM DANIELS', position: 'Qualified Supervisor', signature: '' };
  s.instruments = { multi: 'MFT-1741 s/n 1234567', ir: '', continuity: '', loop: '', rcd: '', earth: '' };
  return s;
}

export function sampleJob(settings = sampleSettings()) {
  const j = newJob(settings);
  j.reportNo = 'EICR-0001';
  j.inspDates = '2026-10-13';
  j.client = { name: 'Mrs J Smith', address: '4 Sample Close, Chorley, PR7 2BB' };
  j.reason = 'Periodic inspection – change of tenancy (landlord requirement)';
  j.installation = { occupier: 'Tenant', address: '4 Sample Close, Chorley, PR7 2BB', premises: 'Residential', premisesOther: '', wiringAge: '25', alterations: 'Yes', alterationsAge: '8', records: 'No', lastInspection: '2021-09-30' };
  j.extent = { covered: 'Whole of the fixed electrical installation of the dwelling', limitations: '10% of accessories opened for inspection. Loft not boarded – cables viewed from hatch only.', agreedWith: 'Mrs J Smith (landlord)', operational: 'Fridge-freezer circuit not isolated for IR test at occupier\'s request.' };
  j.summary.general = 'Installation is in fair condition overall for its age. One potentially dangerous item (missing gas bonding) requires urgent attention.';
  j.next = { intervalYears: '5', date: '2031-10-13', reasons: 'Rented property – maximum 5 years under the 2020 regulations, subject to remedial work being carried out.' };
  j.declaration.inspector = { name: 'TOM DANIELS', signature: '', position: 'Qualified Supervisor', date: '2026-10-13', useSaved: true };
  j.supply = { earthing: 'TN-C-S (PME)', acdc: 'AC', conductors: '1-phase, 2-wire', u: '230', u0: '230', freq: '50', ipf: '1.6', ze: '0.21', polarityConfirmed: true, otherSources: false, deviceBsen: 'BS 88-3', deviceType: 'Fuse', deviceRating: '100' };
  Object.assign(j.origin, { meansEarthing: "Distributor's facility", maxDemand: '60', maxDemandUnit: 'A', earthingCsa: '16', earthingVerified: true, bondingCsa: '10', bondingVerified: true,
    bondWater: '✓', bondGas: 'X', bondOil: 'N/A', bondSteel: 'N/A', bondOther: 'N/A', msLocation: 'Under stairs', msBsen: 'BS EN 60947-3', msPoles: '2', msCurrent: '100', msVoltage: '230', msDevice: 'Isolator' });
  for (const i of INSPECTION_ITEMS) j.inspection[i.id] = { o: DOMESTIC_TEMPLATE[i.id] || '✓' };
  j.inspection['3.7'].note = 'No bonding to gas';
  j.inspection['5.18'].note = 'Cracked socket front, bed 2';
  const b = j.boards[0];
  Object.assign(b, { ref: 'CU1', location: 'Under stairs', suppliedFrom: 'Origin', ocpdBsen: 'BS 88-3', ocpdType: 'Fuse', ocpdRating: '100', spd: { T1: false, T2: true, T3: false, NA: false }, zdb: '0.21', ipf: '1.6', polarityOk: true, phaseSeqOk: false, spdOk: true });
  const q = n => QUICK_CIRCUITS.find(x => x.name === n).c;
  const rows = [
    [q('Shower'), { zs: '0.33', r1r2: '0.12', irLL: '>999', irLE: '>999', rcdTime: '22' }],
    [q('Cooker'), { zs: '0.41', r1r2: '0.20', irLL: '>999', irLE: '>999', rcdTime: '24' }],
    [q('Ring'), { desc: 'Sockets – downstairs ring', zs: '0.52', r1: '0.48', rn: '0.47', r2: '0.79', r1r2: '0.32', irLL: '>999', irLE: '250', rcdTime: '19' }],
    [q('Ring'), { desc: 'Sockets – upstairs ring', zs: '0.58', r1: '0.56', rn: '0.56', r2: '0.92', r1r2: '0.37', irLL: '>999', irLE: '>999', rcdTime: '21' }],
    [q('Ring'), { desc: 'Kitchen sockets ring', zs: '0.49', r1: '0.40', rn: '0.41', r2: '0.66', r1r2: '0.27', irLL: '>999', irLE: '>999', rcdTime: '18' }],
    [q('Immersion'), { zs: '0.62', r1r2: '0.41', irLL: '>999', irLE: '>999', rcdTime: '25' }],
    [q('Lights'), { desc: 'Lighting – downstairs', zs: '1.12', r1r2: '0.89', irLL: '>999', irLE: '>999', rcdTime: '23', points: '9' }],
    [q('Lights'), { desc: 'Lighting – upstairs', zs: '1.30', r1r2: '1.05', irLL: '>999', irLE: '>999', rcdTime: '20', points: '7' }],
    [q('Smoke alarms'), { zs: '1.25', r1r2: '1.02', irLL: '>999', irLE: '>999', rcdTime: '26' }],
    [q('Boiler'), { zs: '0.95', r1r2: '0.71', irLL: '>999', irLE: '>999', rcdTime: '24' }],
  ];
  b.circuits = rows.map(([p, v], i) => newCircuit(i + 1, { ...p, ...v, rcdBtn: '✓', afddBtn: 'N/A' }));
  j.observations = [
    { id: 'o1', desc: 'No main protective bonding to incoming gas installation pipe at meter', location: 'Gas meter, external box', code: 'C2', reg: '411.3.1.2', schedRef: '', items: ['3.7'] },
    { id: 'o2', desc: 'Cracked socket-outlet front plate', location: 'Bedroom 2', code: 'C3', reg: '651.2(e)', schedRef: '', items: ['5.18'] },
    { id: 'o3', desc: 'No RCD six-monthly test notice at consumer unit', location: 'Consumer unit', code: 'C3', reg: '514.12.2', schedRef: '', items: ['4.10'] },
    { id: 'o4', desc: 'Loft lighting junction box could not be accessed – further investigation advised', location: 'Loft', code: 'FI', reg: '651.1', schedRef: '', items: ['5.17'] },
  ];
  j.instruments = { ...settings.instruments };
  recalcSchedule(j);
  return j;
}

// Presets: schedule of inspection items (BS 7671:2018+A4:2026 condition report
// schedule for residential and similar premises up to 100 A), observation library,
// quick-add circuits. Wording kept short for on-site use.

export const EDITIONS = {
  'A4:2026': { label: 'BS 7671:2018+A4:2026', fiUnsatisfactory: false, amendedTo: '2026-04-15' },
  'A2:2022': { label: 'BS 7671:2018+A2:2022+A3:2024 (withdrawn 15 Oct 2026)', fiUnsatisfactory: true, amendedTo: '2024-07-31' },
};
export const DEFAULT_EDITION = 'A4:2026';

export const OUTCOMES = ['✓', 'N/A', 'LIM', 'N/V', 'C1', 'C2', 'C3', 'FI', 'X'];
export const CODES = ['C1', 'C2', 'C3', 'FI'];

export const INSPECTION_GROUPS = [
  { id: '1', title: 'Intake equipment (visual only)', note: 'Outcomes here, other than access to live parts, do not set the overall result. Use X for inadequacies and comment in Section K.', items: [
    ['1.1a', 'Service cable'], ['1.1b', 'Service head'], ['1.1c', 'Earthing arrangement'], ['1.1d', 'Meter tails (distributor)'],
    ['1.1e', 'Metering equipment'], ['1.1f', 'Means of isolation (where present)'],
    ['1.1g', 'Person ordering informed of any dangerous/potentially dangerous intake condition'],
    ['1.2', "Consumer's means of isolation (where present)"], ['1.3', "Consumer's meter tails"] ] },
  { id: '2', title: 'Other sources (e.g. microgeneration)', items: [
    ['2.0', 'Adequate arrangements for other sources such as microgenerators (551.6; 551.7)'] ] },
  { id: '3', title: 'Earthing / bonding (411.3; Chap 54)', items: [
    ['3.1', "Distributor's earthing arrangement present and in good condition (542.1.2.1; 542.1.2.2)"],
    ['3.2', 'Earth electrode connection present and in good condition, where applicable (542.1.2.3)'],
    ['3.3', 'Earthing/bonding labels at all appropriate locations (514.13.1)'],
    ['3.4', 'Earthing conductor size confirmed (542.3; 543.1.1)'],
    ['3.5', 'Earthing conductor at MET accessible and in good condition (543.3.2)'],
    ['3.6', 'Main protective bonding conductor sizes confirmed (544.1)'],
    ['3.7', 'Main bonding connections accessible and in good condition (543.3.2; 544.1.2)'],
    ['3.8', 'Other protective bonding connections accessible and in good condition (543.3.1; 543.3.2)'] ] },
  { id: '4', title: 'Consumer unit(s) / distribution board(s)', items: [
    ['4.1', 'Working space / access to CU or DB adequate (132.12; 513.1)'],
    ['4.2', 'Fixed securely (134.1.1)'],
    ['4.3', 'Enclosure condition – IP rating (416.2)'],
    ['4.4', 'Enclosure condition – fire rating (421.1.201; 526.5)'],
    ['4.5', 'Enclosure not damaged or deteriorated so as to impair safety (651.2)'],
    ['4.6', 'Main linked switch present (462.1.201)'],
    ['4.7', 'Main switch operates (functional check) (643.10)'],
    ['4.8', 'Circuit-breakers and RCDs operated manually to prove disconnection (643.10)'],
    ['4.9', 'Circuits and protective devices correctly identified (514.8.1; 514.9.1)'],
    ['4.10', 'RCD six-monthly test notice present where required (514.12.2)'],
    ['4.11', 'Alternative supply warning notice at/near CU or DB (514.15)'],
    ['4.12', 'Other required labelling present (Section 514)'],
    ['4.13', 'Devices, bases and components compatible, correct type and rating; no thermal damage, arcing or overheating (411.3.2; 411.4–411.6; 432; 433)'],
    ['4.14', 'Single-pole switching/protective devices in line conductor only (132.14.1; 530.3.3)'],
    ['4.15', 'Cables protected against mechanical damage where entering CU/DB (522.8.1; 522.8.5; 522.8.11)'],
    ['4.16', 'Protection against electromagnetic effects at cable entries (521.5.1)'],
    ['4.17', 'RCDs (incl. RCBOs) for fault protection (411.4.204; 411.5.2; 531.2)'],
    ['4.18', 'RCDs (incl. RCBOs) for additional protection (411.3.3; 415.1)'],
    ['4.19', 'SPD functional indication confirmed (651.4)'],
    ['4.20', 'All conductor connections, incl. busbars, correctly located, tight and secure (526.1)'],
    ['4.21', 'Generating set as switched alternative to public supply – arrangements adequate (551.6)'],
    ['4.22', 'Generating set in parallel with public supply – arrangements adequate (551.7)'],
    ['4.23', 'AFDD(s) operational indication confirmed (421.1.7; 532.6; 651.2(e))'] ] },
  { id: '5', title: 'Distribution / final circuits', items: [
    ['5.1', 'Conductors identified (514.3.1)'],
    ['5.2', 'Cables correctly supported throughout (521.10.202; 522.8.5)'],
    ['5.3', 'Insulation of live parts in good condition (416.1)'],
    ['5.4', 'Non-sheathed cables enclosed in conduit, ducting or trunking (521.10.1)'],
    ['5.5', 'Cables adequate for current-carrying capacity (Section 523)'],
    ['5.6', 'Conductors coordinated with overload devices (433.1; 533.2.1)'],
    ['5.7', 'Protective devices adequate in type and rating for fault protection (411.3; 530.3.201)'],
    ['5.8', 'Circuit protective conductors present and adequate (411.3.1; Section 543)'],
    ['5.9', 'Wiring systems suit the installation and external influences (Section 522)'],
    ['5.10', 'Concealed cables in prescribed zones (see Section D) (522.6.202)'],
    ['5.11', 'Cables under floors, above ceilings, in walls adequately protected (see Section D) (522.6.204)'],
    ['5.12', 'Additional protection by 30 mA RCD where required'],
    ['5.13', 'Fire barriers, sealing and protection against thermal effects (Section 527)'],
    ['5.14', 'Band II cables segregated from Band I (528.1)'],
    ['5.15', 'Cables segregated from communications cabling (528.2)'],
    ['5.16', 'Cables segregated from non-electrical services (528.3)'],
    ['5.17', 'Cable terminations at enclosures – record sampling in Section D (Section 526)'],
    ['5.18', 'Condition of accessories: sockets, switches, joint boxes (651.2(e))'],
    ['5.19', 'Accessories suitable for external influences (512.2)'],
    ['5.20', 'Working space / access to equipment adequate (132.12; 513.1)'],
    ['5.21', 'Single-pole switching/protective devices in line conductors only (132.14.1; 530.3.3)'] ] },
  { id: '6', title: 'Locations containing a bath or shower', items: [
    ['6.1', 'All LV circuits have 30 mA RCD additional protection (701.411.3.3)'],
    ['6.2', 'SELV/PELV requirements met where used (701.414.4.5)'],
    ['6.3', 'Shaver supply units to BS EN 61558-2-5 (701.512.3)'],
    ['6.4', 'Supplementary bonding present where required (701.415.2)'],
    ['6.5', 'LV socket-outlets at least 2.5 m from zone 1 (701.512.3)'],
    ['6.6', 'Equipment IP rating suits location (701.512.2)'],
    ['6.7', 'Accessories and controlgear suit the zone (701.512.3)'],
    ['6.8', 'Current-using equipment suits its position (701.55)'] ] },
  { id: '7', title: 'Other Part 7 special installations/locations', items: [
    ['7.1', 'Other special installations or locations listed (attach separate results)'] ] },
  { id: '8', title: "Prosumer's LV installation(s)", items: [
    ['8.1', 'Chapter 82 inspection items listed (attach separate results)'] ] },
];
export const INSPECTION_ITEMS = INSPECTION_GROUPS.flatMap(g => g.items.map(([id, text]) => ({ id, text, group: g.id })));

// Typical domestic: items usually not applicable in a house with a single CU and no generation.
export const DOMESTIC_TEMPLATE = {
  '2.0': 'N/A', '3.2': 'N/A', '4.11': 'N/A', '4.21': 'N/A', '4.22': 'N/A', '4.23': 'N/A',
  '5.4': 'N/A', '5.14': 'N/A', '6.2': 'N/A', '7.1': 'N/A', '8.1': 'N/A', '5.10': 'LIM', '5.11': 'LIM',
};

export const OBS_LIBRARY = [
  { desc: 'Accessory damaged with live parts exposed', code: 'C1', reg: '416.1' , items: ['5.18'] },
  { desc: 'No main protective bonding to incoming gas installation pipe', code: 'C2', reg: '411.3.1.2' , items: ['3.7'] },
  { desc: 'No main protective bonding to incoming water installation pipe', code: 'C2', reg: '411.3.1.2' , items: ['3.7'] },
  { desc: 'Measured earth fault loop impedance exceeds maximum permitted for the protective device', code: 'C2', reg: '411.4.4' , items: ['5.7'] },
  { desc: 'Signs of overheating / thermal damage at terminals', code: 'C2', reg: '526.1' , items: ['4.13', '4.20'] },
  { desc: 'Missing blanks in consumer unit leaving openings to live parts', code: 'C2', reg: '416.2.1' , items: ['4.3'] },
  { desc: 'Metal light fitting with no circuit protective conductor connected', code: 'C2', reg: '411.3.1.1' , items: ['5.8'] },
  { desc: 'Incorrect polarity at accessory', code: 'C2', reg: '643.6' , items: ['5.21'] },
  { desc: 'Socket-outlet which may supply equipment outdoors has no 30 mA RCD protection', code: 'C2', reg: '411.3.3' , items: ['5.12'] },
  { desc: 'Insulation resistance below acceptable value on circuit', code: 'C2', reg: '643.3' , items: ['5.3'] },
  { desc: 'Socket-outlets not provided with 30 mA RCD additional protection', code: 'C3', reg: '411.3.3' , items: ['5.12'] },
  { desc: 'Circuits in bathroom without 30 mA RCD additional protection (supplementary bonding present)', code: 'C3', reg: '701.411.3.3' , items: ['6.1'] },
  { desc: 'Main protective bonding conductor smaller than currently required (10 mm² for PME)', code: 'C3', reg: '544.1.1' , items: ['3.6'] },
  { desc: 'No RCD six-monthly test notice', code: 'C3', reg: '514.12.2' , items: ['4.10'] },
  { desc: 'Circuit chart missing or incomplete', code: 'C3', reg: '514.9.1' , items: ['4.9'] },
  { desc: 'Earthing/bonding warning labels missing', code: 'C3', reg: '514.13.1' , items: ['3.3'] },
  { desc: 'Consumer unit enclosure not of non-combustible material', code: 'C3', reg: '421.1.201' , items: ['4.4'] },
  { desc: 'Wiring in escape route not supported against premature collapse in a fire', code: 'C3', reg: '521.10.202' , items: ['5.2'] },
  { desc: 'No surge protection fitted – consider risk assessment', code: 'C3', reg: '443.4' , items: ['4.19'] },
  { desc: 'Circuit could not be traced / identified – further investigation advised', code: 'FI', reg: '514.9.1' , items: ['4.9'] },
  { desc: 'Circuit could not be tested owing to limitations – further investigation advised', code: 'FI', reg: '651.1' , items: [] },
];

const base = { wiring: 'A', refMethod: 'C', maxDisc: '0.4', bsen: '61009', type: 'B', bc: '6', rcdBsen: '61009', rcdType: 'A', idn: '30', testV: '500', polarity: '✓', rcdBtn: '✓' };
export const QUICK_CIRCUITS = [
  { name: 'Lights', c: { ...base, desc: 'Lighting', live: '1.0', cpc: '1.0', rating: '6', points: '8' } },
  { name: 'Ring', c: { ...base, desc: 'Sockets (ring)', live: '2.5', cpc: '1.5', rating: '32', points: '10', ring: true } },
  { name: 'Radial 20A', c: { ...base, desc: 'Sockets (radial)', live: '2.5', cpc: '1.5', rating: '20', points: '4' } },
  { name: 'Cooker', c: { ...base, desc: 'Cooker', live: '6.0', cpc: '2.5', rating: '32', points: '1' } },
  { name: 'Shower', c: { ...base, desc: 'Electric shower', live: '10', cpc: '4.0', rating: '40', points: '1' } },
  { name: 'Immersion', c: { ...base, desc: 'Immersion heater', live: '2.5', cpc: '1.5', rating: '16', points: '1' } },
  { name: 'Smoke alarms', c: { ...base, desc: 'Smoke/heat alarms', live: '1.0', cpc: '1.0', rating: '6', points: '3' } },
  { name: 'Boiler', c: { ...base, desc: 'Boiler / heating controls', live: '1.5', cpc: '1.0', rating: '6', points: '1' } },
  { name: 'EV charger', c: { ...base, desc: 'EV charge point', live: '6.0', cpc: '2.5', rating: '32', points: '1', wiring: 'F' } },
  { name: 'Outbuilding', c: { ...base, desc: 'Garage / outbuilding', live: '6.0', cpc: '6.0', rating: '32', points: '1', wiring: 'F', maxDisc: '5' } },
];

export const WIRING_TYPES = { A: 'Thermoplastic sheathed (T&E)', B: 'Thermoplastic in metal conduit', C: 'Thermoplastic in non-metal conduit', D: 'Thermoplastic in metal trunking', E: 'Thermoplastic in non-metal trunking', F: 'Thermoplastic SWA', G: 'Thermosetting SWA', H: 'Mineral insulated', O: 'Other' };

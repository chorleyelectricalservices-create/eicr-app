// Two-way links between Section K observations and schedule of inspection items. Pure (Node-testable).
import { INSPECTION_ITEMS, EDITIONS } from './presets.js';

const CODESET = ['C1', 'C2', 'C3', 'FI'];
// Higher = more severe. C1 > C2 > FI > C3 (FI ranks above C3 in both editions; in the
// withdrawn A2/A3 edition FI also made the report unsatisfactory, ranked level with C2 but after it).
export function severity(code, edition) {
  const legacy = EDITIONS[edition]?.fiUnsatisfactory;
  return { C1: 4, C2: 3, FI: legacy ? 2.5 : 2, C3: 1 }[code] ?? 0;
}
export function mostSevere(codes, edition) {
  return codes.filter(c => CODESET.includes(c)).sort((a, b) => severity(b, edition) - severity(a, edition))[0] || '';
}

// keyword rules -> schedule items (first listed = best)
const RULES = [
  [/(label|notice|warning).*(earth|bond)|(earth|bond).*(label|notice)/, ['3.3']],
  [/(undersized|smaller|size|mm²|mm2|6 ?mm).*bond|bond.*(undersized|smaller than|size|mm²|mm2)/, ['3.6']],
  [/supplementary bond/, ['6.4']],
  [/bond/, ['3.7', '3.6']],
  [/electrode|earth rod/, ['3.2']],
  [/earthing conductor|main earth|\bmet\b/, ['3.5', '3.4']],
  [/distributor'?s? earth|no earth (at|from) (the )?(supply|cut.?out)/, ['3.1']],
  [/meter tails|tails/, ['1.3']],
  [/rcd.*(test notice|six.?monthly)|(test notice|six.?monthly).*rcd/, ['4.10']],
  [/bath|shower room|en.?suite|wet room/, ['6.1']],
  [/shaver/, ['6.3']],
  [/\bzone\b/, ['6.7']],
  [/rcd|30 ?ma|residual current/, ['5.12', '4.18']],
  [/afdd|arc fault/, ['4.23']],
  [/\bspd\b|surge/, ['4.19']],
  [/alternative supply|dual supply/, ['4.11']],
  [/generat|solar|\bpv\b|battery|microgen|inverter/, ['2.0']],
  [/prosumer/, ['8.1']],
  [/(circuit )?chart|untrac|not (be )?(traced|identified)|unidentified|identif|unlabelled|labell?ing|labels?\b/, ['4.9', '4.12']],
  [/blank|opening|ip ?rating|ip2x|ip4x|missing cover|knock.?out/, ['4.3']],
  [/combustible|fire rat|plastic consumer unit|plastic (cu|board)/, ['4.4']],
  [/(thermal|heat) damage|overheat|scorch|burn|arcing/, ['4.13', '4.20']],
  [/main switch/, ['4.6', '4.7']],
  [/loose|termination|not tight|insecure connection|busbar/, ['4.20', '5.17']],
  [/(consumer unit|distribution board|\bcu\b|\bdb\b).*(damaged|broken|cracked)|(damaged|broken|cracked).*(consumer unit|distribution board)/, ['4.5']],
  [/polarity|neutral switch|single.?pole/, ['5.21', '4.14']],
  [/service head|cut.?out|service cable/, ['1.1b', '1.1a']],
  [/isolator|means of isolation/, ['1.2']],
  [/(no|missing|without)( a)? (cpc|circuit protective|earth)|cpc|protective conductor|unearthed/, ['5.8']],
  [/accessor|socket|switch|ceiling rose|light fitting|fused spur|fcu|backbox|back box|faceplate|face plate/, ['5.18']],
  [/loop impedance|\bzs\b|disconnection time|protective device.*(rating|type)/, ['5.7']],
  [/insulation (resistance|damaged|deteriorat)|bare (live|conductor)|exposed (live|conductor)|live parts/, ['5.3']],
  [/support|escape route|collapse|clip/, ['5.2']],
  [/fire barrier|sealing|penetration|fire.?stop/, ['5.13']],
  [/prescribed zone|buried|concealed|in walls/, ['5.10', '5.11']],
  [/segregat|gas pipe|water pipe/, ['5.16']],
  [/communication|data cabl|telephone/, ['5.15']],
  [/outdoor|outside|external influence|weather|garden/, ['5.19']],
  [/sheath|singles|unsheathed/, ['5.4']],
  [/current.?carrying|undersized cable|cable size|overload|coordinat/, ['5.5', '5.6']],
  [/working space|access to|inaccessible/, ['5.20']],
  [/special location|swimming|sauna|caravan|marina|ev charg|electric vehicle/, ['7.1']],
];

const itemIds = new Set(INSPECTION_ITEMS.map(i => i.id));
const regToItems = (() => {
  const m = new Map();
  for (const it of INSPECTION_ITEMS) for (const r of (it.text.match(/\(([^)]*)\)\s*$/)?.[1] || '').split(/;\s*/)) if (/^\d/.test(r)) { const k = r.trim(); m.set(k, [...(m.get(k) || []), it.id]); }
  return m;
})();

/** Suggest schedule items for an observation. Returns up to `max` ids, best first. */
export function suggestItems(desc = '', reg = '', max = 2) {
  const t = ` ${String(desc).toLowerCase()} `;
  const out = [];
  const push = ids => ids.forEach(id => { if (itemIds.has(id) && !out.includes(id)) out.push(id); });
  for (const [re, ids] of RULES) if (re.test(t)) { push(ids); if (out.length >= max) break; }
  const r = String(reg || '').trim();
  if (r && out.length < max) { push(regToItems.get(r) || []); if (!out.length) for (const [k, ids] of regToItems) if (k.startsWith(r) || r.startsWith(k)) push(ids); }
  return out.slice(0, max);
}

export function itemText(id) { return INSPECTION_ITEMS.find(i => i.id === id)?.text || ''; }
export const displayId = id => String(id).replace(/[a-g]$/, '');

/** Migrate older observations (schedRef text) to item links. */
export function migrate(job) {
  for (const o of job.observations || []) {
    if (!Array.isArray(o.items)) {
      const refs = String(o.schedRef || '').split(/[,;\s]+/).filter(x => itemIds.has(x));
      o.items = refs;
    }
  }
  return job;
}

/** Observations linked to an item. */
export const linkedObs = (job, id) => (job.observations || []).filter(o => (o.items || []).includes(id));

/**
 * Recalculate schedule outcomes from observation links.
 * Linked items get the most severe linked code; the item's own earlier outcome is kept
 * in `prev` and restored when the last link is removed.
 */
export function recalcSchedule(job) {
  job.inspection ??= {};
  const ins = job.inspection;
  const want = new Map();
  for (const o of job.observations || []) for (const id of o.items || []) {
    if (!want.has(id)) want.set(id, []);
    if (CODESET.includes(o.code)) want.get(id).push(o.code);
  }
  for (const [id, codes] of want) {
    const r = ins[id] ??= {};
    const code = mostSevere(codes, job.edition);
    if (!code) continue; // linked but observation has no code yet
    if (!r.linked) { r.prev = r.o ?? ''; r.linked = true; }
    r.o = code;
  }
  for (const [id, r] of Object.entries(ins)) {
    if (r?.linked && !(want.get(id)?.some(c => CODESET.includes(c)))) { r.o = r.prev ?? ''; delete r.prev; delete r.linked; }
  }
  return job;
}

/** Manual change on a linked schedule item. mode: 'updateObs' | 'unlink' | 'keep' */
export function setItemOutcome(job, id, outcome, mode = 'keep') {
  const r = (job.inspection[id] ??= {});
  const obs = linkedObs(job, id);
  if (!obs.length || !r.linked) { r.o = outcome; return job; }
  if (mode === 'updateObs' && CODESET.includes(outcome)) obs.forEach(o => (o.code = outcome));
  else if (mode === 'unlink') { obs.forEach(o => (o.items = o.items.filter(x => x !== id))); r.prev = outcome; }
  return recalcSchedule(job);
}

// Spoken test-result parser. Pure module (no DOM) so it can be unit tested in Node.
// parseDictation("circuit 3 zs nought point four two ir greater than 999", { circuits })
//   -> { updates:[{scope:'circuit', index:2, field:'zs', value:'0.42'}, ...], questions:[], notes:[] }

const UNITS = { zero: 0, nought: 0, naught: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isNumWord = w => w in UNITS || w in TENS || w === 'hundred' || w === 'thousand' || /^\d+(\.\d+)?$/.test(w);

function compound(words) {
  // all single digits (e.g. "nine nine nine") -> concatenate
  if (words.length > 1 && words.every(w => /^\d$/.test(w) || (w in UNITS && UNITS[w] < 10))) return words.map(w => (w in UNITS ? UNITS[w] : w)).join('');
  let total = 0, cur = 0;
  for (const w of words) {
    if (/^\d+(\.\d+)?$/.test(w)) cur += Number(w);
    else if (w in UNITS) cur += UNITS[w];
    else if (w in TENS) cur += TENS[w];
    else if (w === 'hundred') cur = (cur || 1) * 100;
    else if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; }
  }
  return String(total + cur);
}

/** Convert spoken number words into digits: "nought point four two" -> "0.42". */
export function wordsToNumbers(text) {
  const t = text.split(/\s+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < t.length;) {
    const w = t[i];
    const startsNum = isNumWord(w) && !(w === 'oh' && !(t[i + 1] === 'point' || isNumWord(t[i + 1] || '')))
      || (w === 'point' && isNumWord(t[i + 1] || '') && t[i + 1] !== 'hundred');
    if (!startsNum) { out.push(w); i++; continue; }
    const intW = [], fracW = []; let inFrac = false;
    while (i < t.length) {
      const x = t[i];
      if (x === 'point' && !inFrac && isNumWord(t[i + 1] || '')) { inFrac = true; i++; continue; }
      if (x === 'and' && !inFrac && intW.length && isNumWord(t[i + 1] || '') && /hundred|thousand/.test(intW[intW.length - 1])) { i++; continue; }
      if (!isNumWord(x)) break;
      if (!inFrac && /^\d+\.\d+$/.test(x) && intW.length) break; // "3 0.42" -> separate
      // a plain digit token after a complete compound starts a new number ("circuit 3 22")
      if (!inFrac && intW.length && /^\d+$/.test(x) && /^\d+$/.test(intW[intW.length - 1])) break;
      (inFrac ? fracW : intW).push(x); i++;
      if (!inFrac && /^\d+\.\d+$/.test(x)) break;
    }
    const ip = intW.length ? compound(intW) : '0';
    out.push(fracW.length ? `${ip}.${fracW.map(f => (/^\d+$/.test(f) ? f : f in UNITS ? UNITS[f] : f in TENS ? TENS[f] : '')).join('')}` : ip);
  }
  return out.join(' ');
}

// ordered: more specific first. Each -> field placeholder.
const FIELD_RULES = [
  ['ze', /\b(?:ze|z e|zed e|zee|zed ee|external (?:earth )?(?:fault )?loop(?: impedance)?)\b/g],
  ['ipf', /\b(?:ipf|i p f|pfc|p f c|pscc|psc|pefc|(?:prospective )?(?:short circuit |earth fault |fault )current)\b/g],
  ['r1r2', /\b(?:r ?1 ?(?:plus|\+|and) ?r ?2|r1r2|r12)\b/g],
  ['rcd5x', /\b(?:(?:rcd |trip )?(?:at )?(?:5|five) ?(?:times|x)(?: (?:rcd|trip time|i delta n))?|(?:rcd )?(?:times|x) ?5)\b/g],
  ['afddBtn', /\b(?:afdd|a f d d|arc fault)(?: (?:detection )?device)?(?: test)?(?: button)?\b/g],
  ['rcdBtn', /\b(?:rcd )?test button\b/g],
  ['rcdTime', /\b(?:rcd|r c d)(?: trip)?(?: time)?\b|\btrip time\b|\btrip\b/g],
  ['irLL', /\b(?:(?:insulation(?: resistance)?|ir|i r) )?(?:live (?:to )?live|line (?:to )?line|l ?l|l-l|live (?:to )?neutral|phase (?:to )?neutral)\b/g],
  ['irLE', /\b(?:(?:insulation(?: resistance)?|ir|i r) )?(?:live (?:to )?earth|line (?:to )?earth|l ?e|l-e)\b/g],
  ['irBoth', /\b(?:insulation(?: resistance)?|ir|i r)(?: (?:both|on both|each))?\b/g],
  ['testV', /\btest (?:voltage|volts)\b/g],
  ['zs', /\b(?:zs|z s|zed s|zeds|zee s|zds|earth (?:fault )?loop(?: impedance)?|loop impedance|loop)\b/g],
  ['r1', /\b(?:r1|r 1|r one|line end to end)\b/g],
  ['rn', /\b(?:rn|r n|neutral end to end)\b/g],
  ['r2', /\b(?:r2|r 2|r two|cpc(?: end to end)?)\b/g],
  ['polarity', /\bpolarity\b/g],
  ['points', /\b(?:number of )?points\b/g],
];
export const FIELD_LABELS = { zs: 'Zs', r1r2: 'R1+R2', R2: 'R2', r1: 'r1', rn: 'rn', r2: 'r2', irLL: 'IR L-L', irLE: 'IR L-E', testV: 'IR test V', rcdTime: 'RCD ms', rcd5x: 'RCD 5× ms',
  polarity: 'Polarity', rcdBtn: 'RCD button', afddBtn: 'AFDD button', points: 'Points', ze: 'Ze', ipf: 'Ipf (kA)' };
const TICK_FIELDS = new Set(['polarity', 'rcdBtn', 'afddBtn']);
const SUPPLY_FIELDS = new Set(['ze', 'ipf']);

const STOP = new Set(('reading readings read reads for the is was are of on at and a an to it its value result results circuit number please then also with um uhm er erm '
  + 'i got gives give measured measure test tested reading equals equal be that this one ok so next now in my our has have had').split(' '));

function stem(w) {
  w = w.toLowerCase().replace(/[^a-z0-9]/g, '');
  const syn = { lights: 'light', lighting: 'light', lamp: 'light', socket: 'socket', sockets: 'socket', plugs: 'socket', plug: 'socket', downstairs: 'down', ground: 'down', upstairs: 'up', first: 'up',
    oven: 'cooker', hob: 'cooker', cookers: 'cooker', showers: 'shower', water: 'immersion', alarms: 'smoke', alarm: 'smoke', heating: 'boiler', ch: 'boiler', garage: 'outbuilding', shed: 'outbuilding', ev: 'ev', car: 'ev', charger: 'ev', rings: 'ring' };
  if (syn[w]) return syn[w];
  if (w.length > 4 && w.endsWith('s')) w = w.slice(0, -1);
  return w;
}

/** Fuzzy circuit match by description. Returns {index} | {candidates:[...]} | null */
export function matchCircuit(words, circuits) {
  const q = words.map(stem).filter(w => w && !STOP.has(w));
  if (!q.length) return null;
  let best = 0, hits = [];
  circuits.forEach((c, i) => {
    const d = String(c.desc || '').split(/[^a-zA-Z0-9]+/).map(stem).filter(Boolean);
    let s = 0;
    for (const w of q) if (d.some(x => x === w || (w.length >= 4 && x.length >= 4 && (x.startsWith(w) || w.startsWith(x))))) s++;
    if (s > best) { best = s; hits = [i]; } else if (s === best && s > 0) hits.push(i);
  });
  if (!best) return null;
  return hits.length === 1 ? { index: hits[0] } : { candidates: hits };
}

/** Normalise raw speech into a token list of {t:'field'|'circuit'|'all'|'value'|'word', v} */
export function tokenize(raw) {
  let s = ' ' + String(raw).toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2').replace(/[,;:!?]/g, ' ').replace(/(\d)\.(?!\d)/g, '$1 ').replace(/\s\.(?=\s)/g, ' ')
    .replace(/[‐–—]/g, '-').replace(/(\d)(ms|mΩ|v|ka|a)\b/g, '$1 $2').replace(/\bn\/a\b/g, ' na ').replace(/\//g, ' ') + ' ';
  s = s.replace(/\bmeg ?ohms?\b|\bmegaohms?\b|\bmegs?\b|\bmω\b/g, ' ');
  s = s.replace(/\br (one|1)\b/g, 'r1').replace(/\br (two|2)\b/g, 'r2').replace(/\br n\b/g, 'rn');
  s = wordsToNumbers(s.replace(/-/g, ' - ').replace(/\s+/g, ' ').trim()).replace(/ - /g, '-');
  s = ' ' + s.replace(/\br ?(one|1)\b/g, 'r1').replace(/\br ?(two|2|to|too)\b(?= )/g, 'r2').replace(/\br ?(n|and)\b(?= (?:\d|\.|point|nought|zero))/g, 'rn') + ' ';
  // circuit refs
  s = s.replace(/\b(?:all|every)(?: the)?(?: circuits?| ways?)?\b/g, ' xxALLxx ');
  s = s.replace(/\b(?:circuit|cct|way)s? ?(?:number |no )?(\d+)\b/g, ' xxC$1xx ').replace(/\bc ?(\d+)\b/g, ' xxC$1xx ');
  for (const [f, re] of FIELD_RULES) s = s.replace(re, ` xxF_${f}_xx `);
  // value phrases
  s = s.replace(/\b(?:greater than|more than|bigger than|higher than|over|above|in excess of|plus)\s+(\d+(?:\.\d+)?)/g, ' >$1 ')
    .replace(/(?:^|\s)>\s+(\d)/g, ' >$1')
    .replace(/\b(?:less than|under|below)\s+(\d+(?:\.\d+)?)/g, ' <$1 ')
    .replace(/\b(?:infinity|infinite|max(?:imum)?|out of range|over ?range|off (?:the )?scale|o ?l)\b/g, ' >999 ')
    .replace(/\b(?:lim|limitation|limited|not tested|untested|couldn't test|could not test)\b/g, ' xxVLIMxx ')
    .replace(/\b(?:n a|na|not applicable|none|not fitted|no button)\b/g, ' xxVNAxx ')
    .replace(/\b(?:ok|okay|correct|good|pass(?:ed|es)?|fine|tick|yes|right|confirmed|satisfactory|works|working|operational)\b/g, ' xxVOKxx ')
    .replace(/\b(?:fail(?:ed|s)?|incorrect|wrong|reversed|faulty)\b/g, ' xxVXxx ');
  s = s.replace(/\b(?:ohms?|omes?|milliseconds?|millisecond|ms|kiloamps?|kilo amps?|ka|volts?|v|amps?|seconds)\b/g, ' ');
  const toks = [];
  for (const w of s.split(/\s+/).map(x => x.replace(/^[.'"()]+|[.'"()]+$/g, '')).filter(Boolean)) {
    let m;
    if ((m = w.match(/^xxF_(\w+?)_xx$/))) toks.push({ t: 'field', v: m[1] });
    else if ((m = w.match(/^xxC(\d+)xx$/))) toks.push({ t: 'circuit', v: m[1] });
    else if (w === 'xxALLxx') toks.push({ t: 'all' });
    else if ((m = w.match(/^xxV(\w+?)xx$/))) toks.push({ t: 'value', v: { OK: '✓', X: 'X', LIM: 'LIM', NA: 'N/A' }[m[1]] });
    else if ((m = w.match(/^([<>])?(\d+(?:\.\d+)?|\.\d+)$/))) toks.push({ t: 'value', v: (m[1] || '') + (m[2].startsWith('.') ? '0' + m[2] : m[2]), num: true });
    else toks.push({ t: 'word', v: w });
  }
  return toks;
}

/**
 * @param {string} raw spoken text
 * @param {{circuits:Array<{no:string,desc:string,ring?:boolean}>, lastIndex?:number}} ctx
 */
export function parseDictation(raw, ctx = {}) {
  const circuits = ctx.circuits || [];
  const toks = tokenize(raw);
  const updates = [], questions = [], notes = [];
  let current = ctx.lastIndex ?? null; // number | 'all' | null
  let words = [];
  let ringHint = false;
  const byNo = no => circuits.findIndex(c => String(c.no).trim() === String(no));
  const resolve = () => {
    const ws = words.filter(w => !STOP.has(w)); words = [];
    if (!ws.length) return { target: current };
    const m = matchCircuit(ws, circuits);
    if (!m) { notes.push(`Didn't recognise "${ws.join(' ')}"`); return { target: current }; }
    if (m.candidates) return { ask: m.candidates, said: ws.join(' ') };
    current = m.index; return { target: m.index };
  };
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t === 'word') { words.push(k.v); continue; }
    if (k.t === 'circuit') { const idx = byNo(k.v); if (idx < 0) { notes.push(`No circuit ${k.v} on this board`); current = null; } else current = idx; words = []; continue; }
    if (k.t === 'all') { current = 'all'; words = []; continue; }
    if (k.t === 'value') { notes.push(`Value "${k.v}" without a field – ignored`); continue; }
    // field: gather words up to its value, plus pending words before it
    let field = k.v;
    if (field === 'r1' || field === 'rn') ringHint = true;
    let j = i + 1;
    while (j < toks.length && toks[j].t === 'word') { words.push(toks[j].v); j++; }
    // "ir live earth 200 live live 150" handled naturally; "ir both" handled in rule
    let val = null;
    if (j < toks.length && toks[j].t === 'value') { val = toks[j].v; i = j; }
    else if (TICK_FIELDS.has(field) || (field === 'rcdBtn')) { val = '✓'; i = j - 1; } // "polarity" alone = ok
    else { notes.push(`No value heard for ${FIELD_LABELS[field] || field}`); i = j - 1; words = []; continue; }
    if (TICK_FIELDS.has(field) && /^[<>]?\d/.test(val)) { notes.push(`"${val}" doesn't fit ${FIELD_LABELS[field]}`); words = []; continue; }
    if (!TICK_FIELDS.has(field) && (val === '✓' || val === 'X')) { notes.push(`"${val}" doesn't fit ${FIELD_LABELS[field] || field}`); words = []; continue; }
    if (SUPPLY_FIELDS.has(field)) { updates.push({ scope: 'supply', field, value: val }); words = []; continue; }
    const r = resolve();
    const fields = field === 'irBoth' ? ['irLL', 'irLE'] : [field];
    const mk = (idx) => fields.map(f => {
      let ff = f;
      if (f === 'r2' && !(ringHint || circuits[idx]?.ring)) ff = 'R2';
      return { scope: 'circuit', index: idx, field: ff, value: val };
    });
    if (r.ask) { questions.push({ said: r.said, candidates: r.ask, updates: fields.map(f => ({ scope: 'circuit', field: f, value: val })) }); continue; }
    if (r.target === 'all') { circuits.forEach((c, idx) => updates.push(...mk(idx).map(u => ({ ...u, all: true })))); continue; }
    if (r.target == null) { questions.push({ said: '', candidates: circuits.map((_, x) => x), updates: fields.map(f => ({ scope: 'circuit', field: f, value: val })) }); continue; }
    updates.push(...mk(r.target));
  }
  return { updates, questions, notes, lastIndex: typeof current === 'number' ? current : null, tokens: toks };
}

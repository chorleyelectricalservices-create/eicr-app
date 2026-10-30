// Typical UK domestic cable/installation defaults, applied only to EMPTY cells and tagged "typ".
import { isSpare } from './fill.js';

// One rule per line:  keywords (comma) | ratings A (list or range) | live/cpc mm² | wiring | ref method
// First matching line wins. Keywords match the circuit description (case-insensitive, start of word).
export const DEFAULT_RULES_TEXT = `smoke, alarm, detector, heat det | 6 | 1.0/1.0 | A | C
light, lts, ltg, lamp | 3-10 | 1.0/1.0 | A | C
shower | 6-63 | 10/4.0 | A | C
cooker, oven, hob | 40-50 | 10/4.0 | A | C
cooker, oven, hob | 32 | 6.0/2.5 | A | C
immersion, imm | 13-16 | 2.5/1.5 | A | C
boiler, fcu, fused spur, heating, ch, controls | 3-6 | 1.5/1.0 | A | C
boiler, fcu, fused spur, heating, ch, controls | 10-16 | 2.5/1.5 | A | C
radial | 16-20 | 2.5/1.5 | A | C
radial | 32 | 4.0/1.5 | A | C
ring | 32 | 2.5/1.5 | A | C
socket, skt, sockets, s/o, kitchen, garage, utility | 16-20 | 2.5/1.5 | A | C
socket, skt, sockets, s/o | 32 | 2.5/1.5 | A | C`;

export const TYP_FIELDS = ['wiring', 'refMethod', 'live', 'cpc'];

export function parseRules(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(l => {
    const [kw = '', rt = '', cab = '', wiring = '', ref = ''] = l.split('|').map(s => s.trim());
    const keywords = kw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    const ratings = []; for (const part of rt.split(',').map(s => s.trim()).filter(Boolean)) {
      const m = part.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/); if (m) ratings.push([+m[1], +m[2]]); else if (!isNaN(+part)) ratings.push([+part, +part]); }
    const [live = '', cpc = ''] = cab.split('/').map(s => s.trim());
    return { keywords, ratings, live, cpc, wiring, refMethod: ref };
  }).filter(r => r.keywords.length);
}

const esc = s => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
export function matchRule(c, rules) {
  const d = String(c.desc || '').toLowerCase(); const a = parseFloat(String(c.rating || '').replace(',', '.'));
  if (!d.trim() || isNaN(a)) return null;
  return rules.find(r => r.keywords.some(k => new RegExp(`(^|[^a-z])${esc(k)}`).test(d)) && r.ratings.some(([lo, hi]) => a >= lo && a <= hi)) || null;
}

/** Plan: [{index, set:{field:value}}] – empty cells only, spares skipped, unknown types skipped. */
export function planDomestic(circuits, rulesText = DEFAULT_RULES_TEXT, onlyIdx = null) {
  const rules = parseRules(rulesText); const plan = []; let unknown = 0, spare = 0;
  circuits.forEach((c, index) => {
    if (onlyIdx && !onlyIdx.includes(index)) return;
    if (isSpare(c)) { spare++; return; }
    const r = matchRule(c, rules); if (!r) { unknown++; return; }
    if (String(c.wiring ?? '').trim() && r.wiring && c.wiring !== r.wiring) { unknown++; return; } // different cable type – don't guess sizes
    const set = {}; for (const f of TYP_FIELDS) if (r[f] && !String(c[f] ?? '').trim()) set[f] = r[f];
    if (Object.keys(set).length) plan.push({ index, set });
  });
  return { plan, unknown, spare };
}
export function markTyp(c, field, on) { if (on) (c.typ ??= {})[field] = true; else if (c.typ) delete c.typ[field]; }

// v1.16: showers default to 10/4.0 mm² at any rating. Old built-in shower lines, if still untouched in saved rules, are upgraded.
const OLD_SHOWER = ['shower | 40-50 | 10/4.0 | A | C', 'shower | 32 | 6.0/2.5 | A | C'];
export const OLD_DEFAULT_RULES_TEXT = DEFAULT_RULES_TEXT.replace('shower | 6-63 | 10/4.0 | A | C', OLD_SHOWER.join('\n'));
/** Returns migrated rules text (null = built-in). Custom shower rules are left alone. */
export function migrateRules(text) {
  if (text == null) return null;
  const norm = t => String(t).split('\n').map(l => l.trim().replace(/\s*\|\s*/g, ' | ')).join('\n');
  const t = norm(text);
  if (t === norm(OLD_DEFAULT_RULES_TEXT) || t === norm(DEFAULT_RULES_TEXT)) return null;
  const lines = t.split('\n'); const i = lines.indexOf(OLD_SHOWER[0]);
  if (i >= 0 && lines[i + 1] === OLD_SHOWER[1]) { lines.splice(i, 2, 'shower | 6-63 | 10/4.0 | A | C'); return lines.join('\n'); }
  return text;
}

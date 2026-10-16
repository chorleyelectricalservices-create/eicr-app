// Normalise dictated text for a single form field (postcode, number, phone, email, plain text).
import { wordsToNumbers } from './voice.js';

const DIGIT = { zero: '0', nought: '0', oh: '0', o: '0', one: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4', five: '5', six: '6', seven: '7', eight: '8', ate: '8', nine: '9' };
const LETTER = { ay: 'A', bee: 'B', be: 'B', see: 'C', sea: 'C', dee: 'D', ee: 'E', eff: 'F', gee: 'G', aitch: 'H', haitch: 'H', eye: 'I', jay: 'J', kay: 'K', el: 'L', ell: 'L', em: 'M', en: 'N', pee: 'P', cue: 'Q', queue: 'Q', are: 'R', ar: 'R', ess: 'S', tee: 'T', tea: 'T', you: 'U', vee: 'V', ex: 'X', why: 'Y', zed: 'Z', zee: 'Z' };
const NATO = { alpha: 'A', alfa: 'A', bravo: 'B', charlie: 'C', delta: 'D', echo: 'E', foxtrot: 'F', golf: 'G', hotel: 'H', india: 'I', juliet: 'J', juliett: 'J', kilo: 'K', lima: 'L', mike: 'M', november: 'N', oscar: 'O', papa: 'P', quebec: 'Q', romeo: 'R', sierra: 'S', tango: 'T', uniform: 'U', victor: 'V', whiskey: 'W', whisky: 'W', xray: 'X', yankee: 'Y', zulu: 'Z' };
const UK_PC = /^([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9][A-Z]{2})$/;

/** Format a UK postcode ("pr71ab" -> "PR7 1AB"); returns '' when not valid-looking. */
export function formatPostcode(s) {
  const t = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = t.match(/^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : '';
}
export const isPostcode = s => UK_PC.test(String(s || '').toUpperCase().trim());

/** Spoken postcode -> "PR7 1AB". Handles letters, NATO, digit words, "double"/"treble". */
export function spokenPostcode(raw) {
  const words = String(raw).toLowerCase().replace(/[.,]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  let out = ''; let rep = 1;
  for (let i = 0; i < words.length; i++) {
    let w = words[i];
    if (w === 'double') { rep = 2; continue; } if (w === 'treble' || w === 'triple') { rep = 3; continue; }
    if (w === 'x' && words[i + 1] === 'ray') { w = 'xray'; i++; }
    let c = '';
    if (/^[a-z0-9]+$/.test(w) && (w.length === 1 || /\d/.test(w))) c = w.toUpperCase();
    else if (DIGIT[w] && !(w === 'o' || w === 'oh')) c = DIGIT[w];
    else if (w === 'o' || w === 'oh') c = '__O__';
    else if (NATO[w]) c = NATO[w];
    else if (LETTER[w]) c = LETTER[w];
    else if (/^[a-z]{2,3}$/.test(w) && w === w.replace(/[^a-z]/g, '')) c = w.toUpperCase(); // "PR" said as a word
    else continue;
    out += c.repeat(rep); rep = 1;
  }
  // resolve O/0 by position: try candidates
  const n = (out.match(/__O__/g) || []).length;
  for (let mask = 0; mask < (1 << n); mask++) {
    let k = 0; const s = out.replace(/__O__/g, () => ((mask >> k++) & 1 ? 'O' : '0'));
    const f = formatPostcode(s); if (f) return f;
  }
  return formatPostcode(out.replace(/__O__/g, '0')) || out.replace(/__O__/g, '0');
}

/** Spoken number -> "0.42" (keeps ">"/"<" prefixes like "greater than 999"). */
export function spokenNumber(raw) {
  let t = String(raw).toLowerCase().replace(/,/g, '').trim();
  t = t.replace(/\b(greater|more) than\b|\bover\b/g, '>').replace(/\b(less|fewer) than\b|\bunder\b/g, '<').replace(/\bminus\b|\bnegative\b/g, '-');
  t = wordsToNumbers(t).replace(/\s*(ohms?|amps?|volts?|milliseconds?|ms|kilo ?amps?|ka|millimet(?:re|er)s?( squared)?|mm2?|mega ?ohms?|kw|kilowatts?|metres?|meters?|m|percent|%)\b/g, '');
  const m = t.replace(/\s+/g, ' ').match(/([<>]?)\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return t.trim();
  return (m[1] || '') + m[2];
}

/** Spoken phone -> "01257 123456" / "07700 900123". */
export function spokenPhone(raw) {
  const words = String(raw).toLowerCase().replace(/[.,-]/g, ' ').split(/\s+/).filter(Boolean);
  let d = ''; let rep = 1;
  for (const w of words) {
    if (w === 'double') { rep = 2; continue; } if (w === 'treble' || w === 'triple') { rep = 3; continue; }
    if (w === 'plus') { d += '+'; continue; }
    const c = /^\d+$/.test(w) ? w : DIGIT[w] ?? '';
    d += c.length === 1 ? c.repeat(rep) : c; rep = 1;
  }
  if (d.startsWith('+44')) d = '0' + d.slice(3);
  if (/^07\d{9}$/.test(d)) return d.slice(0, 5) + ' ' + d.slice(5);
  if (/^0[12]\d{9}$/.test(d)) return /^02/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}` : `${d.slice(0, 5)} ${d.slice(5)}`;
  if (/^0[38]\d{9}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return d;
}

/** Spoken email -> "tom.daniels@example.co.uk". */
export function spokenEmail(raw) {
  let t = ' ' + String(raw).toLowerCase() + ' ';
  t = t.replace(/\s+at sign\s+|\s+at\s+|\s*@\s*/g, '@').replace(/\s+(dot|full stop|period|point)\s+/g, '.')
    .replace(/\s+(underscore|under score)\s+/g, '_').replace(/\s+(dash|hyphen|minus)\s+/g, '-');
  t = t.replace(/\b(dot|full stop)\b/g, '.');
  t = wordsToNumbers(t.trim());
  return t.replace(/\s+/g, '').replace(/\.+/g, '.');
}

/** Pick the normaliser for a field. kind: postcode|number|phone|email|text */
export function fieldKind(el) {
  const p = (el.dataset?.p || el.id || el.name || '').toLowerCase();
  const type = (el.type || '').toLowerCase(); const im = (el.inputMode || el.getAttribute?.('inputmode') || '').toLowerCase();
  if (/postcode|postal/.test(p) || el.dataset?.kind === 'postcode') return 'postcode';
  if (type === 'email' || /email/.test(p)) return 'email';
  if (type === 'tel' || /phone|tel\b|mobile/.test(p)) return 'phone';
  if (type === 'number' || im === 'decimal' || im === 'numeric' || el.dataset?.kind === 'number') return 'number';
  return 'text';
}
export function normaliseForField(kind, raw) {
  const t = String(raw || '').trim(); if (!t) return '';
  if (kind === 'postcode') return spokenPostcode(t);
  if (kind === 'number') return spokenNumber(t);
  if (kind === 'phone') return spokenPhone(t);
  if (kind === 'email') return spokenEmail(t);
  // plain text: tidy spoken punctuation, capitalise first letter; embedded postcodes formatted
  let s = t.replace(/\s+(comma)\b/gi, ',').replace(/\s+(full stop|period)\b/gi, '.').replace(/\s+new line\s*/gi, '\n');
  s = s.replace(/\b([A-Za-z]{1,2}\d[A-Za-z\d]?)\s?(\d[A-Za-z]{2})\b/g, (m) => formatPostcode(m) || m);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

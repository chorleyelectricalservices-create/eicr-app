// Postcode → address lookup. postcodes.io (free, no key) for validation + town/county;
// optional house-level provider (Ideal Postcodes or Postcoder) with a key kept only on this phone.
import { formatPostcode } from './fieldvoice.js';

export const ADDR_PROVIDERS = {
  ideal: { label: 'Ideal Postcodes', signup: 'https://account.ideal-postcodes.co.uk/users/sign_up', keyHint: 'ak_…' },
  postcoder: { label: 'Postcoder', signup: 'https://postcoder.com/sign-up', keyHint: 'PCW…' },
};
const LS = p => `certpad.addrKey.${p}`;
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export const getAddrKey = p => store()?.getItem(LS(p)) || '';
export function setAddrKey(p, v) { const s = store(); if (!s) return; v = String(v || '').trim(); v ? s.setItem(LS(p), v) : s.removeItem(LS(p)); }

export function postcodesIoUrl(pc) { return `https://api.postcodes.io/postcodes/${encodeURIComponent(formatPostcode(pc) || pc)}`; }
/** {postcode, town, county, region} from a postcodes.io result. */
export function parsePostcodesIo(data) {
  const r = data?.result; if (!r) return null;
  return { postcode: r.postcode, town: r.admin_district || r.parish || '', county: r.admin_county || r.ceremonial_county || r.region || '', region: r.region || '', country: r.country || '' };
}

export function providerUrl(provider, key, pc) {
  const p = (formatPostcode(pc) || pc).replace(/\s/g, '');
  if (provider === 'ideal') return `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(p)}?api_key=${encodeURIComponent(key)}`;
  if (provider === 'postcoder') return `https://ws.postcoder.com/pcw/${encodeURIComponent(key)}/address/uk/${encodeURIComponent(p)}?format=json&lines=3`;
  throw new Error('Unknown provider');
}
/** Normalise provider results to [{label, lines:[...], town, county, postcode}]. */
export function parseProvider(provider, data) {
  const tidy = a => a.lines.filter(Boolean);
  if (provider === 'ideal') return (data?.result || []).map(r => {
    const lines = [r.line_1, r.line_2, r.line_3].filter(Boolean);
    return { label: [...lines, r.post_town].join(', '), lines, town: titleCase(r.post_town), county: r.county || r.postal_county || '', postcode: r.postcode };
  });
  if (provider === 'postcoder') return (Array.isArray(data) ? data : []).map(r => {
    const lines = [r.addressline1, r.addressline2, r.addressline3].filter(Boolean);
    return { label: r.summaryline || [...lines, r.posttown].join(', '), lines, town: titleCase(r.posttown), county: r.county || '', postcode: r.postcode };
  });
  return [];
}
export const titleCase = s => String(s || '').toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(Upon|On|In|Le|By|The|Of|And)\b/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase());

/** Build the multi-line address text stored in the job. */
export function formatAddress({ lines = [], house = '', street = '', town = '', county = '', postcode = '' }) {
  const first = lines.length ? lines : [[house, street].filter(Boolean).join(' ')];
  return [...first, town, county, formatPostcode(postcode) || postcode].map(s => String(s || '').trim()).filter(Boolean).join('\n');
}

/** Lookup: always postcodes.io; then provider if keyed. Returns {ok, info, addresses, error}. */
export async function lookupPostcode(pc, { provider = '', key = '', fetchFn = fetch, timeoutMs = 10000 } = {}) {
  const f = formatPostcode(pc); if (!f) return { ok: false, error: 'Not a valid UK postcode format' };
  const go = async url => { const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
    try { const r = await fetchFn(url, { signal: ac.signal }); const j = await r.json().catch(() => null); return { status: r.status, j }; } finally { clearTimeout(t); } };
  let info = null; const keyed = !!(provider && key);
  try { const { status, j } = await go(postcodesIoUrl(f)); if (status === 404 && !keyed) return { ok: false, error: `Postcode ${f} not found`, postcode: f }; info = parsePostcodesIo(j); }
  catch (e) { info = null; } // offline: carry on
  let addresses = [], error = '';
  if (keyed) {
    try { const { status, j } = await go(providerUrl(provider, key, f));
      if (status === 200) addresses = parseProvider(provider, j);
      else error = `${ADDR_PROVIDERS[provider]?.label}: ${status === 401 || status === 403 ? 'key rejected or trial ended' : status === 402 ? 'out of lookups' : status === 404 ? 'no addresses found' : status === 429 ? 'rate limited – try again shortly' : 'error ' + status}`;
    } catch (e) { error = 'Address provider unreachable'; }
  }
  if (keyed && !info && !addresses.length) return { ok: false, error: error || `Postcode ${f} not found`, postcode: f };
  return { ok: true, postcode: info?.postcode || f, info, addresses, error };
}

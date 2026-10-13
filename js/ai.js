// AI features. Photo import of a consumer unit / distribution board.
// The phone calls the AI provider directly with the user's own API key.
// Keys live ONLY in this phone's localStorage (never in settings backups, never in the repo).

export const PROVIDERS = {
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-3.8-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  openai: { label: 'OpenAI', defaultModel: 'gpt-5.4-mini', keyUrl: 'https://platform.openai.com/api-keys' },
};
const KEY_LS = p => `eicr.aiKey.${p}`;
const store = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export function getKey(p) { return store()?.getItem(KEY_LS(p)) || ''; }
export function setKey(p, v) { const s = store(); if (!s) return; v = String(v || '').trim(); v ? s.setItem(KEY_LS(p), v) : s.removeItem(KEY_LS(p)); }
export function aiCfg(settings) {
  const a = settings?.ai || {}; const provider = PROVIDERS[a.provider] ? a.provider : 'gemini';
  return { provider, model: (a.model || '').trim() || PROVIDERS[provider].defaultModel };
}

export const CIRCUIT_FIELDS = ['no', 'desc', 'device', 'bsen', 'type', 'rating', 'bc', 'rcdType', 'idn'];
export const BOARD_FIELDS = ['make', 'mainSwitchRating', 'mainSwitchBsen', 'rcds'];

export const PROMPT = `You are reading a photo of a UK consumer unit / distribution board for an EICR (BS 7671).
Return ONLY JSON, no prose, matching exactly:
{"board":{"make":"","model":"","mainSwitchRating":"","mainSwitchBsen":"","rcds":[{"label":"","rating":"","idn":"","type":"","bsen":"","covers":[]}]},
 "circuits":[{"no":"","desc":"","device":"","bsen":"","type":"","rating":"","bc":"","rcdType":"","idn":"","unreadable":[],"confidence":"high"}],
 "notes":""}
Rules:
- One entry per protective device way, left to right (way 1 = nearest main switch unless numbered otherwise). Use printed way numbers if visible.
- desc = the circuit label/handwriting exactly as written (e.g. "Sockets downstairs"). Blank if no label.
- device: one of "MCB","RCBO","RCD","fuse","" . bsen: digits only e.g. "60898","61009","61008","62423","3036","3871","88-3".
- type: curve "B","C","D" (or fuse type "1","2","3","gG"). rating: amps number only e.g. "32". bc: breaking capacity kA number only e.g. "6" (the boxed number on the device).
- rcdType: "AC","A","F","B" (from the waveform symbol/text). idn: residual current in mA, number only e.g. "30".
- covers: way numbers protected by that RCD, if you can tell.
- NEVER guess. If a value is not clearly legible, leave it "" and add the field name to "unreadable". Do not infer ratings from labels.
- confidence: "high","medium","low" for that row.
- Do not include RCD main switches/isolators as circuits; put them in board.`;

const clean = v => (v == null ? '' : String(v).trim());
const num = v => { const m = clean(v).replace(',', '.').match(/\d+(\.\d+)?/); return m ? m[0] : ''; };
function normBsen(v) {
  const s = clean(v).toUpperCase().replace(/BS\s*(EN)?\s*/g, '').replace(/\s/g, '');
  const m = s.match(/60898|61009|61008|62423|62606|60947-2|3036|3871|88-3|88-2|60947/); return m ? m[0] : '';
}
const oneOf = (v, opts) => { const s = clean(v).toUpperCase(); return opts.find(o => o.toUpperCase() === s) || ''; };

/** Pull a JSON object out of model text (handles ```json fences). */
export function extractJson(text) {
  const t = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new AiError('bad', 'The AI reply was not readable data. Try again with a clearer, straight-on photo.');
}

/** Normalise model output into safe app shapes. Never fills anything the model left blank. */
export function normaliseResult(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.circuits)) throw new AiError('bad', 'The AI reply had no circuit list. Try again with a clearer photo of the whole board.');
  const circuits = raw.circuits.filter(c => c && typeof c === 'object').map((c, i) => {
    const device = oneOf(c.device, ['MCB', 'RCBO', 'RCD', 'fuse']);
    let bsen = normBsen(c.bsen);
    const out = { no: num(c.no) || String(i + 1), desc: clean(c.desc).slice(0, 80), device, bsen,
      type: oneOf(c.type, ['B', 'C', 'D', '1', '2', '3', 'gG']), rating: num(c.rating), bc: num(c.bc),
      rcdType: oneOf(c.rcdType, ['AC', 'A', 'F', 'B', 'S', 'A-S']), idn: num(c.idn) };
    const unreadable = new Set((Array.isArray(c.unreadable) ? c.unreadable : []).map(clean).filter(f => CIRCUIT_FIELDS.includes(f)));
    for (const f of ['bsen', 'type', 'rating']) if (clean(c[f]) && !out[f]) unreadable.add(f); // value given but nonsense
    const confidence = ['high', 'medium', 'low'].includes(clean(c.confidence).toLowerCase()) ? clean(c.confidence).toLowerCase() : 'medium';
    return { ...out, unreadable: [...unreadable], confidence };
  });
  const b = raw.board && typeof raw.board === 'object' ? raw.board : {};
  const rcds = (Array.isArray(b.rcds) ? b.rcds : []).filter(r => r && typeof r === 'object').map(r => ({
    label: clean(r.label), rating: num(r.rating), idn: num(r.idn), type: oneOf(r.type, ['AC', 'A', 'F', 'B', 'S', 'A-S']), bsen: normBsen(r.bsen),
    covers: (Array.isArray(r.covers) ? r.covers : []).map(num).filter(Boolean) }));
  return { board: { make: [clean(b.make), clean(b.model)].filter(Boolean).join(' '), mainSwitchRating: num(b.mainSwitchRating), mainSwitchBsen: clean(b.mainSwitchBsen), rcds },
    circuits, notes: clean(raw.notes) };
}

export class AiError extends Error { constructor(code, msg, detail = '') { super(msg); this.code = code; this.detail = detail; } }
export const AI_TIMEOUT_MS = 90000;

export function buildRequest(provider, model, key, base64Jpeg, opts = {}) {
  if (provider === 'openai') return { url: 'https://api.openai.com/v1/chat/completions',
    init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Jpeg}`, detail: 'high' } }] }] }) } };
  return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64Jpeg } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', ...(opts.noThinking ? {} : { thinkingConfig: { thinkingLevel: 'low' } }) } }) } };
}

export function replyText(provider, data) {
  if (provider === 'openai') return data?.choices?.[0]?.message?.content || '';
  const c = data?.candidates?.[0];
  if (!c && data?.promptFeedback?.blockReason) throw new AiError('bad', `Gemini refused the photo (${data.promptFeedback.blockReason}).`);
  return (c?.content?.parts || []).map(p => p.text || '').join('');
}

function httpError(provider, status, body, raw) {
  const m = body?.error?.message || '';
  const e = httpError0(provider, status, m); e.detail = `HTTP ${status}: ${String(raw || m).slice(0, 600)}`; return e;
}
function httpError0(provider, status, m) {
  if (status === 400 && /api key/i.test(m) || status === 401 || status === 403) return new AiError('key', `Your ${PROVIDERS[provider].label} API key was rejected. Check it in Settings → AI photo import.`);
  if (status === 404) return new AiError('model', `Model not found. Check the model name in Settings (or clear it to use the default). ${m}`);
  if (status === 429) return new AiError('quota', 'AI rate limit or free quota reached. Wait a minute and try again.');
  return new AiError('http', `AI service error ${status}${m ? ': ' + m : ''}`);
}

/**
 * Read circuits from a board photo.
 * @param {string} imageDataUrl data:image/jpeg;base64,... (already downscaled)
 * @param {object} settings app settings
 * @param {{fetch?:Function, key?:string, online?:boolean}} deps for tests
 */
async function importBoardPhoto(imageDataUrl, settings, deps = {}) {
  const { provider, model } = aiCfg(settings);
  const key = deps.key ?? getKey(provider);
  if (!key) throw new AiError('nokey', `No ${PROVIDERS[provider].label} API key yet. Add one in Settings → AI photo import.`);
  const online = deps.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) throw new AiError('offline', 'You’re offline. Photo reading needs a signal – take the photo now and try again when connected, or enter circuits by hand.');
  const b64 = String(imageDataUrl || '').replace(/^data:[^,]+,/, '');
  if (!b64) throw new AiError('bad', 'No photo.');
  const f = deps.fetch || globalThis.fetch;
  const status = deps.onStatus || (() => {});
  const timeoutMs = deps.timeoutMs ?? AI_TIMEOUT_MS;
  const send = async opts => {
    const { url, init } = buildRequest(provider, model, key, b64, opts);
    const ctl = new AbortController(); let timedOut = false;
    const outer = deps.signal; const onAbort = () => ctl.abort();
    if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', onAbort, { once: true }); }
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs);
    const kb = Math.round(b64.length * 0.75 / 1024);
    status(`Sending photo (${kb} KB) to ${PROVIDERS[provider].label} – ${model}…`);
    const t0 = Date.now(); let aborted;
    try {
      let res;
      aborted = new Promise((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('aborted')), { once: true }));
      try { res = await Promise.race([f(url, { ...init, signal: ctl.signal }), aborted]); }
      catch (e) {
        if (timedOut) throw new AiError('timeout', `No reply from ${PROVIDERS[provider].label} after ${Math.round(timeoutMs / 1000)} s. Try again, or try a smaller/closer photo.`, `timeout after ${timeoutMs} ms (model ${model}, ${kb} KB)`);
        if (ctl.signal.aborted) throw new AiError('cancel', 'Cancelled.');
        throw new AiError('offline', 'Couldn’t reach the AI service. Check your signal and try again.', `${e?.name || 'Error'}: ${e?.message || e}`);
      }
      status(`Waiting for reply… (HTTP ${res.status} after ${((Date.now() - t0) / 1000).toFixed(1)} s, reading answer)`);
      let raw = ''; try { raw = await Promise.race([res.text ? res.text() : res.json().then(JSON.stringify), aborted]); } catch (e) { if (timedOut) throw new AiError('timeout', `Reply took longer than ${Math.round(timeoutMs / 1000)} s.`, 'timeout while reading body'); if (ctl.signal.aborted) throw new AiError('cancel', 'Cancelled.'); throw new AiError('offline', 'Connection dropped while reading the reply.', String(e?.message || e)); }
      let data = null; try { data = JSON.parse(raw); } catch {}
      return { res, data, raw };
    } finally { clearTimeout(timer); outer?.removeEventListener?.('abort', onAbort); }
  };
  let { res, data, raw } = await send({});
  if (provider === 'gemini' && res.status === 400 && /thinking/i.test(raw)) ({ res, data, raw } = await send({ noThinking: true }));
  if (!res.ok) throw httpError(provider, res.status, data, raw);
  status('Checking the answer…');
  let text;
  try { text = replyText(provider, data); } catch (e) { e.detail ||= raw.slice(0, 600); throw e; }
  if (!text) { const fr = data?.candidates?.[0]?.finishReason; throw new AiError('bad', `The AI gave an empty answer${fr ? ` (${fr})` : ''}. Try again with a clearer photo.`, raw.slice(0, 600)); }
  let parsed; try { parsed = extractJson(text); } catch (e) { e.detail = text.slice(0, 600); throw e; }
  const out = normaliseResult(parsed);
  if (!out.circuits.length) throw new AiError('empty', 'No circuits could be read from that photo. Try closer, straight-on, with the cover open and labels visible.');
  return { ...out, provider, model };
}

/**
 * Plan applying reviewed rows to a board.
 * mode 'replace' = new circuit list; 'merge' = match by way number, fill only EMPTY fields (never overwrite test results).
 * Returns {circuits:[{index|null, set:{field:value}}], board:{field:value}}
 */
export const APPLY_FIELDS = ['desc', 'bsen', 'type', 'rating', 'bc', 'rcdType', 'idn'];
export function planImport(existing, rows, mode = 'merge', overwrite = false) {
  const plan = [];
  rows.forEach(r => {
    const set = {}; for (const f of APPLY_FIELDS) if (clean(r[f])) set[f] = clean(r[f]);
    if (r.device === 'RCBO' && !set.rcdBsen && set.bsen === '61009') set.rcdBsen = '61009';
    if (mode === 'replace') { plan.push({ index: null, no: r.no, set }); return; }
    const index = existing.findIndex(c => String(c.no).trim() === String(r.no).trim());
    if (index < 0) { plan.push({ index: null, no: r.no, set }); return; }
    const c = existing[index]; const s2 = {};
    for (const [k, v] of Object.entries(set)) if (overwrite || !clean(c[k])) if (clean(c[k]) !== v) s2[k] = v;
    if (Object.keys(s2).length) plan.push({ index, no: r.no, set: s2 });
  });
  return plan;
}
export function markImported(c, field, on) { if (on) (c.imp ??= {})[field] = true; else if (c.imp) delete c.imp[field]; }

export function boardPlan(board, info) {
  const set = {};
  const rcd = info.rcds?.[0];
  if (rcd) { if (rcd.bsen && !board.rcdBsen) set.rcdBsen = rcd.bsen; if (rcd.type && !board.rcdType) set.rcdType = rcd.type;
    if (rcd.rating && !board.rcdRating) set.rcdRating = rcd.rating; if (rcd.idn && !board.rcdIdn) set.rcdIdn = rcd.idn; }
  return set;
}

export const ai = {
  available(settings) { return true; },
  configured(settings) { return !!getKey(aiCfg(settings).provider); },
  importBoardPhoto,
  /** @returns {Promise<Object>} partial job read from a photo/PDF of a previous EICR */
  async importPreviousReport() { throw new Error('AI report import is not enabled yet'); },
  async suggestObservation() { throw new Error('AI suggestions are not enabled yet'); },
};

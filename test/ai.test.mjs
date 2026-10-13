import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ai, extractJson, normaliseResult, planImport, buildRequest, boardPlan, markImported, aiCfg } from '../js/ai.js';

const MODEL_JSON = {
  board: { make: 'Hager', model: 'VML', mainSwitchRating: '100A', mainSwitchBsen: '60947-3', rcds: [{ label: 'RCD1', rating: '63', idn: '30mA', type: 'A', bsen: 'BS EN 61008', covers: ['1', '2'] }] },
  circuits: [
    { no: '1', desc: 'Cooker', device: 'MCB', bsen: 'BS EN 60898', type: 'B', rating: '32A', bc: '6kA', rcdType: '', idn: '', unreadable: [], confidence: 'high' },
    { no: '2', desc: 'Sockets ring', device: 'RCBO', bsen: '61009', type: 'b', rating: '', bc: '', rcdType: 'A', idn: '30', unreadable: ['rating', 'bc'], confidence: 'low' },
    { no: '3', desc: '', device: 'thing', bsen: 'unknown', type: 'Z', rating: 'six', bc: '', unreadable: [], confidence: 'weird' },
  ], notes: 'glare on way 3' };
const gemReply = obj => ({ candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(obj) + '\n```' }] } }] });
const okFetch = (body, status = 200) => async (url, init) => { okFetch.last = { url, init }; return { ok: status < 300, status, json: async () => body }; };
const S = { ai: { provider: 'gemini', model: '' } };
const IMG = 'data:image/jpeg;base64,AAAA';

test('gemini request shape and default model', async () => {
  const f = okFetch(gemReply(MODEL_JSON));
  const r = await ai.importBoardPhoto(IMG, S, { fetch: f, key: 'k1', online: true });
  assert.match(okFetch.last.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:generateContent$/);
  assert.equal(okFetch.last.init.headers['x-goog-api-key'], 'k1');
  const body = JSON.parse(okFetch.last.init.body);
  assert.equal(body.contents[0].parts[0].inline_data.data, 'AAAA');
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(r.model, 'gemini-3.8-flash');
  assert.equal(r.circuits.length, 3);
  assert.deepEqual(r.circuits[0], { no: '1', desc: 'Cooker', device: 'MCB', bsen: '60898', type: 'B', rating: '32', bc: '6', rcdType: '', idn: '', unreadable: [], confidence: 'high' });
  assert.equal(r.board.make, 'Hager VML'); assert.equal(r.board.mainSwitchRating, '100');
  assert.deepEqual(r.board.rcds[0], { label: 'RCD1', rating: '63', idn: '30', type: 'A', bsen: '61008', covers: ['1', '2'] });
});
test('never invents: blanks stay blank, nonsense dropped and flagged', () => {
  const r = normaliseResult(MODEL_JSON);
  assert.equal(r.circuits[1].rating, ''); assert.equal(r.circuits[1].type, 'B');
  assert.deepEqual(r.circuits[1].unreadable.sort(), ['bc', 'rating']);
  const c3 = r.circuits[2];
  assert.equal(c3.device, ''); assert.equal(c3.bsen, ''); assert.equal(c3.type, ''); assert.equal(c3.rating, '');
  assert.deepEqual(c3.unreadable.sort(), ['bsen', 'rating', 'type']); assert.equal(c3.confidence, 'medium');
});
test('openai provider', async () => {
  const f = okFetch({ choices: [{ message: { content: JSON.stringify(MODEL_JSON) } }] });
  const r = await ai.importBoardPhoto(IMG, { ai: { provider: 'openai', model: '' } }, { fetch: f, key: 'sk', online: true });
  assert.equal(okFetch.last.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(okFetch.last.init.headers.Authorization, 'Bearer sk');
  assert.equal(JSON.parse(okFetch.last.init.body).model, 'gpt-5.4-mini');
  assert.equal(r.circuits.length, 3);
});
test('errors: no key, offline, network, bad key, quota, bad JSON, empty', async () => {
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: '' }), e => e.code === 'nokey');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: false }), e => e.code === 'offline');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: true, fetch: async () => { throw new TypeError('Failed to fetch'); } }), e => e.code === 'offline');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: true, fetch: okFetch({ error: { message: 'API key not valid' } }, 400) }), e => e.code === 'key');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: true, fetch: okFetch({}, 429) }), e => e.code === 'quota');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: true, fetch: okFetch({}, 404) }), e => e.code === 'model');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: true, fetch: okFetch({ candidates: [{ content: { parts: [{ text: 'sorry I cannot' }] } }] }) }), e => e.code === 'bad');
  await assert.rejects(ai.importBoardPhoto(IMG, S, { key: 'k', online: true, fetch: okFetch(gemReply({ board: {}, circuits: [] })) }), e => e.code === 'empty');
  assert.throws(() => normaliseResult({ foo: 1 }), e => e.code === 'bad');
});
test('extractJson tolerates prose around JSON', () => { assert.deepEqual(extractJson('Here: {"a":1} done'), { a: 1 }); });
test('merge fills only empty fields, never overwrites; replace builds all', () => {
  const rows = normaliseResult(MODEL_JSON).circuits;
  const existing = [{ no: '1', desc: 'Kitchen cooker', bsen: '', type: '', rating: '', zs: '0.5' }];
  const m = planImport(existing, rows, 'merge');
  assert.deepEqual(m[0], { index: 0, no: '1', set: { bsen: '60898', type: 'B', rating: '32', bc: '6' } });
  assert.equal(m.filter(p => p.index === null).length, 2);
  const r = planImport(existing, rows, 'replace');
  assert.equal(r.length, 3); assert.ok(r.every(p => p.index === null));
  assert.equal(r[1].set.rcdBsen, '61009'); assert.equal(r[1].set.rating, undefined);
});
test('board RCD fills empty board fields only', () => {
  const info = normaliseResult(MODEL_JSON).board;
  assert.deepEqual(boardPlan({ rcdBsen: '', rcdType: 'AC', rcdRating: '', rcdIdn: '' }, info), { rcdBsen: '61008', rcdRating: '63', rcdIdn: '30' });
});
test('imported marking + config defaults', () => {
  const c = {}; markImported(c, 'rating', true); assert.deepEqual(c.imp, { rating: true }); markImported(c, 'rating', false); assert.deepEqual(c.imp, {});
  assert.deepEqual(aiCfg({}), { provider: 'gemini', model: 'gemini-3.8-flash' });
  assert.equal(buildRequest('gemini', 'x y', 'k', 'A').url.includes('x%20y'), true);
});

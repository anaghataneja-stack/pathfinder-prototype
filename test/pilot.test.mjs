import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAI } from '../lib/ai.mjs';
import { createApp } from '../lib/server.mjs';
import { createStore } from '../lib/store.mjs';
import { summarise } from '../lib/store.mjs';

const fakeSync = { get: () => ({ source: 'live', fetchedAt: null, changes: null, metrics: null, opps: [{ id: 'y-1' }], courses: [] }), status: () => ({}) };
let app, base, dir;
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));
const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pf-pilot-'));
  app = createApp({ sync: fakeSync, ai: createAI({}), store: createStore(dir), staffCode: 'staff-2026' });
  base = await listen(app);
});
after(() => app.close());

test('a handoff becomes a case with a short code the young person can quote', async () => {
  const r = await post('/api/cases', { kind: 'handoff', urgent: true, reason: 'urgent', state: 'kano', age: 17, lang: 'ha', step: 'Digital Skills Learnership' });
  assert.equal(r.status, 200);
  const { caseId } = await r.json();
  assert.match(caseId, /^[A-HJ-NP-Z2-9]{6}$/);
  const saved = readFileSync(join(dir, 'cases.ndjson'), 'utf8');
  assert.match(saved, new RegExp(caseId));
  assert.match(saved, /"ageBand":"15-17"/);
  assert.ok(!/"age":17/.test(saved), 'exact age should not be stored');
});

test('cases only accept known values; free text is not stored', async () => {
  assert.equal((await post('/api/cases', { kind: 'gossip' })).status, 400);
  await post('/api/cases', { kind: 'handoff', reason: 'help', state: 'lagos', age: 21, lang: 'en', note: 'my number is 0803 123 4567' });
  assert.ok(!readFileSync(join(dir, 'cases.ndjson'), 'utf8').includes('0803'));
});

test('a listing report is recorded as a case', async () => {
  const r = await post('/api/cases', { kind: 'report', listingId: 'y-abc', listingTitle: 'Easy Online Data Job', state: 'lagos', age: 21, lang: 'en' });
  assert.equal(r.status, 200);
  assert.match(readFileSync(join(dir, 'cases.ndjson'), 'utf8'), /Easy Online Data Job/);
});

test('the staff inbox needs the staff code, lists urgent cases first, and can mark one contacted', async () => {
  assert.equal((await fetch(base + '/api/staff/cases')).status, 401);
  const page = await fetch(base + '/staff?code=staff-2026', { redirect: 'manual' });
  assert.equal(page.status, 302);
  const cookie = page.headers.get('set-cookie').split(';')[0];
  const list = await (await fetch(base + '/api/staff/cases', { headers: { cookie } })).json();
  assert.ok(list.cases.length >= 3);
  assert.equal(list.cases[0].urgent, true);
  const id = list.cases[0].caseId;
  assert.equal((await post(`/api/staff/cases/${id}/done`, {}, { cookie })).status, 200);
  const again = await (await fetch(base + '/api/staff/cases', { headers: { cookie } })).json();
  assert.equal(again.cases.find(c => c.caseId === id).status, 'contacted');
  assert.match(await (await fetch(base + '/staff', { headers: { cookie } })).text(), /Pathfinder cases/);
});

test('anonymous pilot events: known types only, no identifiers, and a summary', async () => {
  for (const type of ['plan_built', 'plan_built', 'plan_saved', 'urgent']) assert.equal((await post('/api/events', { type, lang: 'yo', age: 16 })).status, 204);
  assert.equal((await post('/api/events', { type: 'whatever' })).status, 400);
  const raw = readFileSync(join(dir, 'events.ndjson'), 'utf8');
  assert.ok(!/ip|caseId|"age":16/.test(raw));
  const s = summarise(raw.trim().split('\n').map(l => JSON.parse(l)));
  assert.equal(s.byType.plan_built, 2); assert.equal(s.byLang.yo, 4); assert.equal(s.byAge['15-17'], 4);
});

test('wrong access codes are limited, and the cookie is Secure behind https', async () => {
  const locked = createApp({ sync: fakeSync, ai: createAI({}), store: createStore(dir), accessCode: 'naija', trustProxy: true });
  const b = await listen(locked);
  for (let i = 0; i < 10; i++) await fetch(b + '/?code=wrong' + i, { headers: { 'x-forwarded-for': '41.0.0.9' } });
  const blocked = await fetch(b + '/?code=naija', { redirect: 'manual', headers: { 'x-forwarded-for': '41.0.0.9' } });
  assert.equal(blocked.status, 429);
  const ok = await fetch(b + '/?code=naija', { redirect: 'manual', headers: { 'x-forwarded-for': '41.0.0.10', 'x-forwarded-proto': 'https' } });
  assert.equal(ok.status, 302);
  assert.match(ok.headers.get('set-cookie'), /Secure/);
  locked.close();
});

test('the privacy notice page is served', async () => {
  const r = await fetch(base + '/privacy.html');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /What Pathfinder keeps/);
});

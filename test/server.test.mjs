import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { startMockAzure } from './helpers/mock-azure.mjs';
import { createAI } from '../lib/ai.mjs';
import { createApp } from '../lib/server.mjs';

const azState = {};
let az, app, base, locked, lockedBase;
const catalogue = { source: 'live', fetchedAt: '2026-11-13T05:00:00.000Z', changes: { added: 2, removed: 1 }, metrics: null,
  opps: Array.from({ length: 20 }, (_, i) => ({ id: 'y-' + i, kind: 'opp', title: 'Customer Care Trainee ' + i, org: 'Contact centre', skills: ['customer', 'comms'] })), courses: [] };
const fakeSync = { get: () => catalogue, status: () => ({ lastRun: null, nextAt: Date.parse('2026-11-14T05:00:00Z') }) };

async function listen(server) { await new Promise(r => server.listen(0, '127.0.0.1', r)); return `http://127.0.0.1:${server.address().port}`; }

before(async () => {
  az = await startMockAzure(azState);
  const ai = createAI(az.env, fetch, { timeoutMs: 500 });
  app = createApp({ sync: fakeSync, ai, rateLimit: { max: 30, windowMs: 600000 } });
  base = await listen(app);
  locked = createApp({ sync: fakeSync, ai, accessCode: 'naija2026' });
  lockedBase = await listen(locked);
});
after(async () => { app.close(); locked.close(); await az.close(); });

test('GET /api/listings returns the catalogue with its source', async () => {
  const r = await fetch(base + '/api/listings');
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.source, 'live'); assert.equal(j.opps.length, 20);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
});

test('listings are gzipped when the client accepts it, and 304 on a matching ETag', async () => {
  const raw = await fetch(base + '/api/listings', { headers: { 'accept-encoding': 'gzip' } });
  const etag = raw.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(base + '/api/listings', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  const http = await import('node:http');
  const body = await new Promise(ok => http.get(base + '/api/listings', { headers: { 'accept-encoding': 'gzip' } }, res => {
    assert.equal(res.headers['content-encoding'], 'gzip');
    const c = []; res.on('data', d => c.push(d)); res.on('end', () => ok(Buffer.concat(c)));
  }));
  assert.equal(JSON.parse(gunzipSync(body)).source, 'live');
});

test('GET /api/status reports AI features and sync timing', async () => {
  const j = await (await fetch(base + '/api/status')).json();
  assert.deepEqual(j.ai, { provider: 'azure', chat: true, voice: true });
  assert.equal(j.yoma.source, 'live'); assert.deepEqual(j.yoma.changes, { added: 2, removed: 1 });
  assert.equal(j.yoma.nextSync, '2026-11-14T05:00:00.000Z');
});

test('skills route strips a phone number before the AI sees it', async () => {
  azState.chat = () => ({ content: { skills: ['phone-repair'], summary: 'Repairs phones.' } });
  const r = await fetch(base + '/api/ai/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'I repair phones, call 0803 123 4567', lang: 'en' }) });
  const j = await r.json();
  assert.equal(j.source, 'ai'); assert.deepEqual(j.skills, ['phone-repair']);
  assert.ok(!JSON.stringify(azState.chatBodies.at(-1)).includes('4567'));
});

test('bad input is rejected with 400, oversized JSON with 413', async () => {
  const empty = await fetch(base + '/api/ai/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '' }) });
  assert.equal(empty.status, 400);
  const junk = await fetch(base + '/api/ai/understand', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(junk.status, 400);
  const big = await fetch(base + '/api/ai/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(20000) }) });
  assert.equal(big.status, 413);
});

test('audio over 2 MB is rejected with 413', async () => {
  const r = await fetch(base + '/api/ai/transcribe?lang=en', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.alloc(3 * 1024 * 1024) });
  assert.equal(r.status, 413);
});

test('transcribe route returns cleaned text', async () => {
  azState.transcribe = () => ({ text: 'I sell tomatoes' });
  const r = await fetch(base + '/api/ai/transcribe?lang=yo', { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.from('fake') });
  assert.deepEqual(await r.json(), { text: 'I sell tomatoes', source: 'ai' });
});

test('the 31st AI request from one address in 10 minutes gets 429', async () => {
  const ai = createAI({});
  const small = createApp({ sync: fakeSync, ai, rateLimit: { max: 30, windowMs: 600000 } });
  const b = await listen(small);
  const call = () => fetch(b + '/api/ai/understand', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: '1', options: [{ v: 1, labels: ['a'] }] }) });
  for (let i = 0; i < 30; i++) assert.equal((await call()).status, 200);
  const r = await call();
  assert.equal(r.status, 429); assert.deepEqual(await r.json(), { error: 'rate_limited' });
  small.close();
});

test('unknown API routes are 404; the app page is served', async () => {
  assert.equal((await fetch(base + '/api/nothing')).status, 404);
  const page = await fetch(base + '/');
  assert.equal(page.status, 200); assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(await page.text(), /Pathfinder/);
  for (const p of ['/sw.js', '/manifest.webmanifest', '/icon.svg']) assert.equal((await fetch(base + p)).status, 200, p);
});

test('access code: API is 401 without the cookie, and ?code= sets it', async () => {
  assert.equal((await fetch(lockedBase + '/api/listings')).status, 401);
  const page = await fetch(lockedBase + '/');
  assert.match(await page.text(), /access code/i);
  const wrong = await fetch(lockedBase + '/?code=nope', { redirect: 'manual' });
  assert.notEqual(wrong.status, 302);
  const ok = await fetch(lockedBase + '/?code=naija2026', { redirect: 'manual' });
  assert.equal(ok.status, 302);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(lockedBase + '/api/listings', { headers: { cookie } })).status, 200);
});

test('behind a proxy, the rate limit counts each forwarded client separately', async t => {
  const ai = createAI({});
  const proxied = createApp({ sync: fakeSync, ai, trustProxy: true, rateLimit: { max: 2, windowMs: 600000 } });
  t.after(() => proxied.close());
  const b = await listen(proxied);
  const call = ip => fetch(b + '/api/ai/understand', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` }, body: JSON.stringify({ text: '1', options: [{ v: 1, labels: ['a'] }] }) });
  for (const ip of ['41.1.1.1', '41.1.1.2', '41.1.1.3', '41.1.1.4']) assert.equal((await call(ip)).status, 200, ip);
  assert.equal((await call('41.1.1.1')).status, 200);
  assert.equal((await call('41.1.1.1')).status, 429);
});

test('the app page is marked so the offline cache only stores the real app', async () => {
  assert.equal((await fetch(base + '/')).headers.get('x-pf-app'), '1');
  assert.equal((await fetch(lockedBase + '/')).headers.get('x-pf-app'), null);
});

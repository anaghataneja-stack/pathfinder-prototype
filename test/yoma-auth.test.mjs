import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockKeycloak } from './helpers/mock-keycloak.mjs';
import { startMockYoma, yomaItem } from './helpers/mock-yoma.mjs';
import { createAI } from '../lib/ai.mjs';
import { createApp } from '../lib/server.mjs';

const kc = {}, ys = { items: [yomaItem(1)] };
let kcs, yoma, app, base, plain, plainBase;
const fakeSync = { get: () => ({ source: 'live', opps: [{ id: 'y-1' }], courses: [] }), status: () => ({}) };
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));

before(async () => {
  kcs = await startMockKeycloak(kc); yoma = await startMockYoma(ys);
  app = createApp({ sync: fakeSync, ai: createAI({}), yomaBase: yoma.base, yomaAuth: { issuer: kcs.issuer, clientId: 'pathfinder', publicUrl: 'http://pathfinder.test' } });
  base = await listen(app);
  plain = createApp({ sync: fakeSync, ai: createAI({}) }); plainBase = await listen(plain);
});
after(async () => { app.close(); plain.close(); await kcs.close(); await yoma.close(); });

async function signIn() {
  const start = await fetch(base + '/auth/yoma', { redirect: 'manual' });
  assert.equal(start.status, 302);
  const authUrl = new URL(start.headers.get('location'));
  const back = await fetch(authUrl, { redirect: 'manual' });          // the mock Keycloak approves at once
  const cb = new URL(back.headers.get('location'));
  assert.equal(cb.origin + cb.pathname, 'http://pathfinder.test/auth/yoma/callback');
  const done = await fetch(base + '/auth/yoma/callback' + cb.search, { redirect: 'manual' });
  return { authUrl, done };
}

test('Yoma sign-in is off unless configured', async () => {
  assert.equal((await (await fetch(plainBase + '/api/status')).json()).yomaLogin, false);
  assert.equal((await fetch(plainBase + '/auth/yoma', { redirect: 'manual' })).status, 404);
  assert.equal((await (await fetch(base + '/api/status')).json()).yomaLogin, true);
});

test('sign-in uses Yoma Keycloak with PKCE and sets a session cookie', async () => {
  const { authUrl, done } = await signIn();
  assert.equal(authUrl.searchParams.get('client_id'), 'pathfinder');
  assert.equal(authUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authUrl.searchParams.get('state'));
  assert.equal(done.status, 302);
  assert.equal(done.headers.get('location'), '/?yoma=connected');
  assert.match(done.headers.get('set-cookie'), /pf_yoma=[^;]+; Path=\/; Max-Age=\d+; HttpOnly; SameSite=Lax/);
  assert.equal(kc.tokenRequests.at(-1).grant_type, 'authorization_code');
});

test('a wrong or reused state is refused', async () => {
  const r = await fetch(base + '/auth/yoma/callback?code=x&state=forged', { redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/?yoma=error');
});

test('after sign-in, /api/yoma/me returns the real Yoma skills mapped to Pathfinder skills', async () => {
  const { done } = await signIn();
  const cookie = done.headers.get('set-cookie').split(';')[0];
  const me = await (await fetch(base + '/api/yoma/me', { headers: { cookie } })).json();
  assert.equal(me.connected, true);
  assert.deepEqual(me.names, ['Customer Service', 'Microsoft Excel']);
  assert.ok(me.skills.includes('customer') && me.skills.includes('spreadsheets'));
  assert.deepEqual(await (await fetch(base + '/api/yoma/me')).json(), { connected: false });
});

test('saving the plan saves only real Yoma opportunities to the account', async () => {
  const { done } = await signIn();
  const cookie = done.headers.get('set-cookie').split(';')[0];
  const id = '00000000-0000-0000-0000-000000000042';
  const r = await (await fetch(base + '/api/yoma/save', { method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ ids: ['y-' + id, 's-o1', 'c3', 'y-not-a-uuid'] }) })).json();
  assert.equal(r.saved, 1);
  assert.deepEqual(ys.saved, [id]);
  assert.equal((await fetch(base + '/api/yoma/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ids":[]}' })).status, 401);
});

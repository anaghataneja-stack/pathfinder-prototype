import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAI } from '../lib/ai.mjs';
import { createApp } from '../lib/server.mjs';
import { createStore } from '../lib/store.mjs';
import { mapListing } from '../lib/yoma.mjs';
import { startMockYoma, yomaItem } from './helpers/mock-yoma.mjs';

// A small real-shaped catalogue: Lagos jobs, online tasks and courses
const items = [
  yomaItem(1, { title: 'Customer Care Agent in Lagos', type: 'Job', engagementType: null, organizationName: 'Jobberman Nigeria', skills: [{ name: 'Customer service' }, { name: 'Communication' }] }),
  yomaItem(2, { title: 'Sales Representative in Lagos', type: 'Job', engagementType: null, organizationName: 'Shop NG', skills: [{ name: 'Sales' }, { name: 'Customer service' }] }),
  yomaItem(3, { title: 'Retail Assistant in Lagos', type: 'Job', engagementType: null, organizationName: 'Mart Ltd', skills: [{ name: 'Customer service' }, { name: 'Pricing' }] }),
  yomaItem(4, { title: 'Community Survey Task', type: 'Task', organizationName: 'Yoma', zltoReward: 20, dateEnd: null }),
  yomaItem(5, { title: 'Customer Service Basics', type: 'Learning', organizationName: 'P2E (GenU)', commitmentIntervalTotalHours: 4 }),
  yomaItem(6, { title: 'Selling and Pricing for Beginners', type: 'Learning', organizationName: 'Alison Learning', commitmentIntervalTotalHours: 3 })
].map(mapListing);
const catalogue = { source: 'live', fetchedAt: '2026-11-25T05:00:00Z', changes: null, metrics: null, opps: items.filter(i => i.kind === 'opp'), courses: items.filter(i => i.kind === 'course') };
let app, base;
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));
const post = (path, body, token = 'rp-secret') => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Token ' + token } : {}) }, body: JSON.stringify(body) });

before(async () => {
  app = createApp({ sync: { get: () => catalogue, status: () => ({}) }, ai: createAI({}), store: createStore(mkdtempSync(join(tmpdir(), 'pf-rp-'))), rapidproToken: 'rp-secret' });
  base = await listen(app);
});
after(() => app.close());

test('the RapidPro webhook needs the shared token', async () => {
  assert.equal((await post('/api/rapidpro/plan', {}, null)).status, 401);
  assert.equal((await post('/api/rapidpro/plan', {}, 'wrong')).status, 401);
});

test('a plan built over WhatsApp uses the same engine as the web app', async () => {
  const r = await post('/api/rapidpro/plan', { lang: 'en', age: '21', goal: 'job', sector: 'customer', state: 'lagos', hours: '4', data: 'some', size: '5', work: 'I sell provisions in the market' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.match(j.plan_id, /^[A-Z2-9]{6}$/);
  assert.equal(j.steps, j.text_steps.length);
  assert.ok(j.steps >= 4 && j.steps <= 5, 'steps ' + j.steps);
  assert.match(j.message, /Customer Care Agent in Lagos|Sales Representative in Lagos|Retail Assistant in Lagos/);
  assert.match(j.message, /Never pay to apply/);
  assert.ok(j.message.length < 4096, 'WhatsApp message too long');
  assert.match(j.handoff, /complete a P2E course/i);
});

test('check-ins move through the plan and finish with the hand-off to SkillLens', async () => {
  const p = await (await post('/api/rapidpro/plan', { lang: 'en', age: '21', goal: 'job', sector: 'customer', state: 'lagos', hours: '4', data: 'some', size: '3' })).json();
  let r = await (await post('/api/rapidpro/checkin', { plan_id: p.plan_id, answer: '1' })).json();   // 1 = finished
  assert.equal(r.step, 2); assert.equal(r.finished, false); assert.match(r.message, /Step 2/);
  r = await (await post('/api/rapidpro/checkin', { plan_id: p.plan_id, answer: '2' })).json();       // 2 = still working
  assert.equal(r.step, 2);
  r = await (await post('/api/rapidpro/checkin', { plan_id: p.plan_id, answer: '1' })).json();
  r = await (await post('/api/rapidpro/checkin', { plan_id: p.plan_id, answer: '1' })).json();
  assert.equal(r.finished, true);
  assert.equal((await post('/api/rapidpro/checkin', { plan_id: 'NOPE22', answer: '1' })).status, 404);
});

test('the importable RapidPro flow is complete: every exit leads somewhere that exists', () => {
  const exp = JSON.parse(readFileSync(new URL('../flows/pathfinder-rapidpro.json', import.meta.url), 'utf8'));
  assert.equal(exp.version, '13');
  const flow = exp.flows[0];
  const ids = new Set(flow.nodes.map(n => n.uuid));
  for (const n of flow.nodes) {
    for (const e of n.exits) assert.ok(!e.destination_uuid || ids.has(e.destination_uuid), 'broken exit in ' + n.uuid);
    if (n.router) {
      const exits = new Set(n.exits.map(e => e.uuid));
      for (const c of n.router.categories) assert.ok(exits.has(c.exit_uuid), 'category without exit');
      for (const c of n.router.cases || []) assert.ok(n.router.categories.some(k => k.uuid === c.category_uuid), 'case without category');
    }
  }
  const webhooks = flow.nodes.flatMap(n => n.actions).filter(a => a.type === 'call_webhook');
  assert.ok(webhooks.some(w => /\/api\/rapidpro\/plan$/.test(w.url)));
  assert.ok(exp.triggers.some(t => t.keyword === 'plan'));
  const guardianNode = flow.nodes.find(n => n.actions.some(x => x.type === 'send_msg' && /parent or guardian needs to agree/.test(x.text)));
  assert.ok(guardianNode, 'under-18s must be asked for guardian agreement');
  const ageSplit = flow.nodes.find(n => n.router && n.router.operand === '@results.age.value');
  assert.deepEqual(ageSplit.router.cases.map(c => c.arguments), [['15', '17'], ['18', '24']]);
});

test('Skills Backpack (as in FunDoo): written to YoID only after a yes, and only from 16', async () => {
  const adult = await (await post('/api/rapidpro/plan', { lang: 'en', age: '21', goal: 'job', sector: 'customer', state: 'lagos', hours: '4', data: 'some', size: '3' })).json();
  assert.equal(adult.yoid_ok, true);
  // Before a yes, a finished step isn't recorded
  const fresh = await (await post('/api/rapidpro/plan', { lang: 'en', age: '21', goal: 'job', sector: 'customer', state: 'lagos', hours: '4', data: 'some', size: '3' })).json();
  assert.doesNotMatch((await (await post('/api/rapidpro/checkin', { plan_id: fresh.plan_id, answer: '1' })).json()).message, /Skills Backpack/);
  const yes = await (await post('/api/rapidpro/backpack', { plan_id: adult.plan_id, answer: 'yes' })).json();
  assert.equal(yes.backpack, true);
  assert.match(yes.message, /Added to your Skills Backpack \(YoID\): your 3-step Pathfinder plan/);
  assert.match(yes.handoff, /complete a P2E course/);
  assert.match((await (await post('/api/rapidpro/checkin', { plan_id: adult.plan_id, answer: '1' })).json()).message, /Added to your Skills Backpack \(YoID\): step 1 finished/);

  const no = await (await post('/api/rapidpro/backpack', { plan_id: fresh.plan_id, answer: 'no' })).json();
  assert.equal(no.backpack, false);

  const young = await (await post('/api/rapidpro/plan', { lang: 'en', age: '15', goal: 'skills', sector: 'customer', state: 'lagos', hours: '4', data: 'some', size: '3' })).json();
  assert.equal(young.yoid_ok, false);
  const refused = await (await post('/api/rapidpro/backpack', { plan_id: young.plan_id, answer: 'yes' })).json();
  assert.equal(refused.backpack, false);
  assert.match(refused.message, /start at 16/);
});

test('the flow only offers the Skills Backpack to 16 to 24 year olds, with FunDoo-style numbered menus', () => {
  const f = JSON.parse(readFileSync(new URL('../flows/pathfinder-rapidpro.json', import.meta.url))).flows[0];
  const bpSplit = f.nodes.find(n => n.router && n.router.operand === '@results.age.value' && n.router.cases.some(c => c.arguments[0] === '16'));
  assert.ok(bpSplit, 'no 16+ split before the Skills Backpack');
  const target = bpSplit.exits[0].destination_uuid;
  const ask = f.nodes.find(n => n.uuid === target);
  assert.match(ask.actions[0].text, /Skills Backpack/);
  assert.match(ask.actions[0].text, /1️⃣ Yes, activate it\n2️⃣ Tell me more\n3️⃣ Not now/);
  assert.ok(f.nodes.some(n => n.actions && n.actions.some(a => a.type === 'call_webhook' && /\/api\/rapidpro\/backpack$/.test(a.url))));
});

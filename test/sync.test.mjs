import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMockYoma, yomaItem } from './helpers/mock-yoma.mjs';
import { fetchYoma, mapListing } from '../lib/yoma.mjs';
import { createSync } from '../lib/sync.mjs';

const state = { items: [] };
let mock;
before(async () => { mock = await startMockYoma(state); });
after(() => mock.close());
const freshDir = () => mkdtempSync(join(tmpdir(), 'pf-sync-'));

test('fetchYoma pages through every result and filters to Nigeria + Worldwide', async () => {
  state.fail = false;
  state.items = Array.from({ length: 230 }, (_, i) => yomaItem(i + 1));
  const r = await fetchYoma({ base: mock.base });
  assert.equal(r.items.length, 230);
  assert.deepEqual(state.lastFilter.countries.sort(), ['ng', 'ww']);
  assert.equal(r.metrics.userCountDisplay, '950,000+');
});

test('mapListing flags fee-asking listings and informal signals', () => {
  const scam = mapListing(yomaItem(1, { description: 'Pay a registration fee of N3000 to start' }));
  assert.equal(scam.scam, true);
  const task = mapListing(yomaItem(2, { type: 'Task', zltoReward: 50, dateEnd: null }));
  assert.equal(task.kind, 'opp'); assert.equal(task.type, 'task');
  assert.equal(task.informal.earnNow, true); assert.equal(task.informal.phoneOnly, true);
  assert.equal(task.openEnded, true); assert.equal(task.deadline, null);
  const course = mapListing(yomaItem(3, { type: 'Learning', commitmentIntervalTotalHours: 6, skills: [{ name: 'Microsoft Excel' }] }));
  assert.equal(course.kind, 'course'); assert.equal(course.hours, 6); assert.ok(course.skills.includes('spreadsheets'));
  assert.equal(course.id, 'y-' + yomaItem(3).id);
});

test('sync saves a cache and reports what changed since the last sync', async () => {
  state.fail = false;
  state.items = [yomaItem(1), yomaItem(2), yomaItem(3)];
  const dir = freshDir();
  const sync = createSync({ dataDir: dir, base: mock.base });
  const first = await sync.run();
  assert.equal(first.source, 'live');
  assert.ok(existsSync(join(dir, 'yoma-cache.json')));
  state.items = [yomaItem(2), yomaItem(3), yomaItem(4)];
  const second = await sync.run();
  assert.deepEqual(second.changes, { added: 1, removed: 1 });
});

test('Yoma failure keeps the previous copy, labelled as saved', async () => {
  state.fail = false;
  state.items = [yomaItem(1), yomaItem(2)];
  const dir = freshDir();
  await createSync({ dataDir: dir, base: mock.base }).run();
  state.fail = true;
  const sync = createSync({ dataDir: dir, base: mock.base });   // a restart: loads from disk
  assert.equal(sync.get().source, 'saved');
  const r = await sync.run();
  assert.equal(r.source, 'saved');
  assert.equal(r.opps.length, 2);
  assert.ok(r.error);
});

test('Yoma returning zero listings does not wipe the catalogue', async () => {
  state.fail = false;
  state.items = [yomaItem(1)];
  const dir = freshDir();
  const sync = createSync({ dataDir: dir, base: mock.base });
  await sync.run();
  state.items = [];
  const r = await sync.run();
  assert.equal(r.opps.length, 1);
  assert.equal(r.source, 'saved');
});

test('corrupt cache and Yoma down falls back to the bundled sample', async () => {
  state.fail = true;
  const dir = freshDir();
  writeFileSync(join(dir, 'yoma-cache.json'), '{not json');
  const sync = createSync({ dataDir: dir, base: mock.base });
  const r = await sync.run();
  assert.equal(r.source, 'sample');
  assert.ok(r.opps.length >= 8);
  assert.ok(r.opps.every(o => o.sample === true));
});

test('enrichment is applied after mapping, and its failure keeps rule tags', async () => {
  state.fail = false;
  state.items = [yomaItem(1)];
  const ok = await createSync({ dataDir: freshDir(), base: mock.base, enrich: async ls => ls.map(l => ({ ...l, skills: ['poultry'], tagged: 'ai' })) }).run();
  assert.deepEqual(ok.opps[0].skills, ['poultry']);
  const bad = await createSync({ dataDir: freshDir(), base: mock.base, enrich: async () => { throw new Error('ai down'); } }).run();
  assert.equal(bad.source, 'live');
  assert.equal(bad.opps[0].tagged, 'rules');
});

test('nextRunAt picks the next occurrence of the sync hour', () => {
  const sync = createSync({ dataDir: freshDir(), base: 'http://x', now: () => new Date(2026, 10, 13, 9, 0).getTime() });
  const next = new Date(sync.nextRunAt(5));
  assert.equal(next.getDate(), 14); assert.equal(next.getHours(), 5);
});

test('after a failed sync the next try is within an hour, not tomorrow', () => {
  const now = new Date(2026, 10, 13, 9, 0).getTime();
  const sync = createSync({ dataDir: freshDir(), base: 'http://x', now: () => now });
  assert.equal(sync.delayAfter({ source: 'saved', error: 'down' }, 5), 3600e3);
  assert.equal(sync.delayAfter({ source: 'live' }, 5), new Date(2026, 10, 14, 5, 0).getTime() - now);
});

test('a running server picks up a sync made by "node sync.mjs" without a restart', async () => {
  state.fail = false;
  state.items = [yomaItem(1)];
  const dir = freshDir();
  const server = createSync({ dataDir: dir, base: mock.base });
  await server.run();
  state.items = [yomaItem(1), yomaItem(2), yomaItem(3)];
  await new Promise(r => setTimeout(r, 20));
  await createSync({ dataDir: dir, base: mock.base }).run();   // the CLI, a separate instance
  assert.equal(server.get().opps.length, 3);
});

test('after a restart with a recent copy, nothing is reported as failed', async () => {
  state.fail = false;
  state.items = [yomaItem(1)];
  const dir = freshDir();
  await createSync({ dataDir: dir, base: mock.base }).run();
  const restarted = createSync({ dataDir: dir, base: mock.base });
  assert.equal(restarted.get().error, undefined);
});

test('only https links from Yoma are kept', () => {
  const bad = mapListing(yomaItem(9, { yomaInfoURL: 'javascript:alert(1)' }));
  assert.match(bad.link, /^https:\/\/yoma\.world\/opportunities\//);
  assert.equal(mapListing(yomaItem(9, { yomaInfoURL: 'https://app.yoma.world/x' })).link, 'https://app.yoma.world/x');
});

// Cases taken from the real Yoma API (13 Nov 2026 live check).
test('Jobberman jobs with a city in the title are in-person in that state, not remote', () => {
  const job = t => mapListing(yomaItem(20, { title: t, engagementType: null, organizationName: 'Jobberman Nigeria', countries: [{ name: 'Nigeria' }] }));
  const lagos = job('Baking Assistant in Lagos [NG:1276472]');
  assert.equal(lagos.remote, false); assert.deepEqual(lagos.states, ['lagos']);
  assert.deepEqual(job('Application & IT Support Engineer in Abuja').states, ['fct']);
  assert.deepEqual(job('Sales Rep in Ibadan & Oyo State').states, ['oyo']);
  assert.deepEqual(job('Driver in Port Harcourt & Rivers State').states, ['rivers']);
  assert.deepEqual(job('Cashier in Enugu [NG:1273521]').states, ['other']);
  assert.deepEqual(job('Marketing Manager in Nigeria').states, ['all']);
  assert.equal(job('Backend Developer in Remote (Work From Home) [NG:1276637]').remote, true);
});

test('jobs are for 18+; online courses with no engagement type stay online', () => {
  assert.equal(mapListing(yomaItem(21, { type: 'Job', title: 'Cashier in Lagos', engagementType: null })).minAge, 18);
  const course = mapListing(yomaItem(22, { type: 'Learning', title: 'Time Control for Overloaded Managers', engagementType: null, organizationName: 'Alison Learning' }));
  assert.equal(course.kind, 'course'); assert.equal(course.offline, false);
});

test('the scam check ignores ordinary job wording', () => {
  const ok = d => mapListing(yomaItem(23, { description: d })).scam;
  assert.equal(ok('Track cost per qualified lead, inspection bookings, deposit conversion and campaign spend'), false);
  assert.equal(ok('We pay a competitive salary and pay for transport'), false);
  assert.equal(ok('Handle cash deposits and withdrawals for customers'), false);
  assert.equal(ok('Pay a registration fee of N3000 to start'), true);
  assert.equal(ok('Successful applicants must pay N5,000 for training materials'), true);
  assert.equal(ok('Make a refundable deposit of ₦10,000 to secure your slot'), true);
  assert.equal(ok('Send money for your form'), true);
});

test('fetchYoma reaches every listing, not just the first 1,000', async () => {
  state.fail = false;
  state.items = Array.from({ length: 5171 }, (_, i) => yomaItem(i + 1));
  const r = await fetchYoma({ base: mock.base });
  assert.equal(r.items.length, 5171);
});

test('Yoma "Other" listings (e.g. scholarships) are not earn-now tasks', () => {
  const sch = mapListing(yomaItem(30, { type: 'Other', title: 'Scholarship Alert: 2026 MTN Foundation Scholarship for Nigerian Undergraduates' }));
  assert.equal(sch.type, 'other'); assert.equal(sch.informal.earnNow, false);
  assert.equal(mapListing(yomaItem(31, { type: 'Task', title: 'Community survey' })).informal.earnNow, true);
});

test('broad Yoma category names set sectors, not skills', () => {
  const c = mapListing(yomaItem(32, { type: 'Learning', title: 'Sepsis Recognition for Care Workers', categories: [{ name: 'Career and Personal Development' }, { name: 'Business and Entrepreneurship' }] }));
  assert.ok(!c.skills.includes('job-search') && !c.skills.includes('business-plan'), c.skills.join());
  assert.ok(c.sectors.includes('all'));
});

test('graduate-only listings (NYSC, undergraduates) are 18+', () => {
  assert.equal(mapListing(yomaItem(33, { type: 'Task', title: 'NYSC Camp YOMA Onboarding Activation – Ogun State' })).minAge, 18);
  assert.equal(mapListing(yomaItem(34, { type: 'Other', title: 'MTN Foundation Scholarship for Nigerian Undergraduates' })).minAge, 18);
  assert.equal(mapListing(yomaItem(35, { type: 'Task', title: 'Community survey' })).minAge, 15);
});

test('real Passport to Earning courses on Yoma are labelled as P2E', () => {
  const c = mapListing(yomaItem(36, { type: 'Learning', title: 'Work Readiness', organizationName: 'P2E (GenU)' }));
  assert.equal(c.src, 'Passport to Earning'); assert.equal(c.p2e, true); assert.equal(c.live, true);
  assert.equal(mapListing(yomaItem(37, { type: 'Learning', title: 'Excel', organizationName: 'Alison Learning' })).src, 'Yoma');
});

test('a Yoma reply with courses but no opportunities is not accepted as live', async () => {
  state.fail = false;
  state.items = [yomaItem(1)];
  const dir = freshDir();
  const sync = createSync({ dataDir: dir, base: mock.base });
  await sync.run();
  state.items = [yomaItem(2, { type: 'Learning' })];
  const r = await sync.run();
  assert.equal(r.opps.length, 1); assert.equal(r.source, 'saved');
});

// From the 24 Nov real-data check of 5- and 7-step plans.
test('listings meant for organisations or for another country are marked', () => {
  const m = t => mapListing(yomaItem(40, { title: t, type: 'Other' }));
  assert.equal(m('Become a Yoma partner: AfriLabs hub webinar 2').forOrgs, true);
  assert.equal(m('Grant Alert: Up to $2M Grants for AI Solutions in Public Services').forOrgs, true);
  assert.equal(m('Free Digital Commerce Training for Nigerian SMEs with ICC & TikTok').forOrgs, true);
  assert.equal(m('Customer sales support in Lagos').forOrgs, false);
  assert.equal(m('Opportunity 3: [Botswana] Mapathons - Remote Mapping Contributions').otherCountry, true);
  assert.equal(m('Opportunity 3: [South Africa] Mapathons').otherCountry, true);
  assert.equal(m('[Nigeria] Community survey').otherCountry, false);
});

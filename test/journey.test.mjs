// The connected journey (journey contract v1): the link to SkillLens, passing on parameters, the return URL, the YoID thread.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ URL, URLSearchParams });
vm.runInContext(readFileSync(new URL('../engine/journey.js', import.meta.url), 'utf8') + '\n;globalThis.J = {JOURNEY_PHASE, JOURNEY_STEPS, journeyReturn, journeyLink, journeyThread};', ctx);
const { journeyReturn, journeyLink, journeyThread } = ctx.J;
const html = readFileSync(new URL('../pathfinder.html', import.meta.url), 'utf8');

const LISTING = 'http://localhost:3000/opportunities/c0a7e000-0000-4000-8000-000000000301';
// What Ziqi sends (contract link 1)
const fromZiqi = new URLSearchParams(`journey=demo&from=ziqi&yoid=yoid-ng-7f3a0123&listing=opp-job-001&goal=job&return=${encodeURIComponent(LISTING)}`);
const own = { journey: 'demo', from: 'pathfinder', yoid: 'yoid-ng-7f3a0123', listing: 'opp-job-001', goal: 'job', plan: 'plan-001', course: 'opp-course-001' };

test('the SkillLens link is exactly the contract\'s link 2', () => {
  assert.equal(journeyLink('http://localhost:3001/demo/p2e', fromZiqi, own),
    'http://localhost:3001/demo/p2e?journey=demo&from=pathfinder&yoid=yoid-ng-7f3a0123&listing=opp-job-001&goal=job&plan=plan-001&course=opp-course-001'
    + '&return=http%3A%2F%2Flocalhost%3A3000%2Fopportunities%2Fc0a7e000-0000-4000-8000-000000000301');
});

test('every parameter received is passed on, return unchanged and last; PathFinder\'s own "from" wins', () => {
  const got = new URLSearchParams(fromZiqi); got.set('lang', 'ha'); got.set('credential', 'cred-002');
  const u = new URL(journeyLink('https://skilllens.example.org/demo/p2e', got, own));
  assert.equal(u.searchParams.get('from'), 'pathfinder');
  assert.equal(u.searchParams.get('lang'), 'ha');
  assert.equal(u.searchParams.get('credential'), 'cred-002');
  assert.equal(u.searchParams.get('return'), LISTING);
  assert.equal([...u.searchParams.keys()].at(-1), 'return');
  assert.equal(u.searchParams.getAll('from').length, 1);
});

test('received values are kept when PathFinder has none of its own, and empty own values are skipped', () => {
  const u = new URL(journeyLink('http://localhost:3001/demo/p2e', fromZiqi, { from: 'pathfinder', plan: '', course: null }));
  assert.equal(u.searchParams.get('yoid'), 'yoid-ng-7f3a0123');
  assert.equal(u.searchParams.get('goal'), 'job');
  assert.ok(!u.searchParams.has('plan') && !u.searchParams.has('course'));
});

test('the pilot access code is never passed on', () => {
  const got = new URLSearchParams(fromZiqi); got.set('code', 'secret-pilot-code');
  assert.ok(!new URL(journeyLink('http://localhost:3001/demo/p2e', got, own)).searchParams.has('code'));
});

test('only http(s) return URLs are followed and passed on', () => {
  assert.equal(journeyReturn(LISTING), LISTING);
  assert.equal(journeyReturn('https://yoma.world/opportunities/x?a=1'), 'https://yoma.world/opportunities/x?a=1');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', '/opportunities/x', 'ftp://x.org/', '', null, undefined])
    assert.equal(journeyReturn(bad), '', String(bad));
  const got = new URLSearchParams(fromZiqi); got.set('return', 'javascript:alert(1)');
  assert.ok(!new URL(journeyLink('http://localhost:3001/demo/p2e', got, own)).searchParams.has('return'));
});

test('the base URL keeps its own path and query', () => {
  const u = new URL(journeyLink('https://skilllens.example.org/demo/p2e?embed=0', fromZiqi, own));
  assert.equal(u.pathname, '/demo/p2e'); assert.equal(u.searchParams.get('embed'), '0');
});

test('the YoID thread for Phase 2: Saved Opportunity recorded, Learning Plan in progress then recorded, the rest next', () => {
  const states = done => [...journeyThread(2, done)].map(s => `${s.name}: ${s.state}`);   // copied out of the vm realm for deepEqual
  assert.deepEqual(states(false), ['Saved Opportunity: recorded', 'Learning Plan: in progress', 'Skill Credential: next', 'Job Application: next']);
  assert.deepEqual(states(true), ['Saved Opportunity: recorded', 'Learning Plan: recorded', 'Skill Credential: next', 'Job Application: next']);
});

test('the app uses the contract\'s exact wording, and the journey link opens in the same tab', () => {
  const jc = html.match(/const JC = \{([\s\S]*?)\};/)[1];
  for (const s of ["'From {app} · Phase {n}'", "'Handing on to {app} · Phase {n}'", "'Continue to {app}'", "'✓ Recorded on your YoID (mock-up)'",
    "'Back to the listing'", "'YoID · {yoid} · mock-up'"]) assert.ok(jc.includes(s), s);
  const link = html.match(/if \(JOURNEY\.demo\) \{   \/\/ journey contract v1, link 2[\s\S]*?\n  \}/)[0];
  assert.ok(!/target=/.test(link), 'the journey link must open in the same tab');
  assert.match(html, /<script src="engine\/journey\.js"><\/script>/);
});

test('in the journey, "Test as" is Halima from the shared mock data, with the credentials she holds before the plan', () => {
  const data = JSON.parse(readFileSync(new URL('../mockups/shared-mock-data.json', import.meta.url), 'utf8'));
  const fn = html.match(/function journeyPersona\(d\)\{[\s\S]*?\n\}/)[0];
  const buttons = ['halima', 'amina', 'tunde', 'new'].map(v => ({dataset: {v}, hidden: v === 'halima', pressed: null, setAttribute(k, x) { this.pressed = String(x); }}));
  const sub = {textContent: ''};
  const c = vm.createContext({PERSONAS: {amina: {name: 'Amina', creds: []}}, persona: 'amina',
    document: {getElementById: id => id === 'halima-sub' ? sub : null, querySelectorAll: () => buttons}});
  vm.runInContext(fn + '\njourneyPersona(' + JSON.stringify(data) + ');', c);
  assert.equal(c.persona, 'halima');
  const P = c.PERSONAS.halima;
  assert.equal(P.name, 'Halima'); assert.equal(P.full, 'Halima Yusuf');
  assert.deepEqual([...P.creds].map(x => x.title), ['Digital Literacy Essentials', 'Community Tree Planting Day', 'Customer Service Basics']);
  assert.ok(!P.creds.some(x => /Solar PV|Safely at Height/.test(x.title)), 'credentials earned later in the journey are not on her profile yet');
  assert.equal(sub.textContent, '20 · Kaduna · phone repair');
  assert.deepEqual(buttons.map(b => `${b.dataset.v}:${b.pressed}:${b.hidden}`), ['halima:true:false', 'amina:false:false', 'tunde:false:false', 'new:false:false']);
  assert.match(html, /<button data-v="halima" aria-pressed="false" hidden>/, 'the Halima button is hidden outside the journey');
  assert.match(html, /Sample profile for \$\{esc\(P\.full \|\| P\.name\)\}/);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startMockAzure } from './helpers/mock-azure.mjs';
import { createAI, parseJSON } from '../lib/ai.mjs';
import { extractSkills, understand, writeReasons, enrichListings, transcribeNote, rankCourses } from '../lib/ai-tasks.mjs';

const state = {};
let az;
before(async () => { az = await startMockAzure(state); });
after(() => az.close());
const ai = (opts = {}) => createAI(az.env, fetch, { timeoutMs: 300, ...opts });

test('provider is azure when endpoint, key and deployment are set; none otherwise', () => {
  assert.equal(ai().provider, 'azure');
  assert.equal(ai().features.voice, true);
  const off = createAI({});
  assert.equal(off.provider, 'none'); assert.equal(off.features.chat, false); assert.equal(off.features.voice, false);
});

test('azure requests use the deployment URL, api-version and api-key header', async () => {
  state.chat = () => ({ content: { skills: ['customer'], summary: 'Serves customers.' } });
  await extractSkills(ai(), { text: 'I sell in the market', lang: 'en' });
  assert.equal(state.headers.at(-1)['api-key'], 'test-key');
});

test('extractSkills keeps only known skills and returns source ai', async () => {
  state.chat = () => ({ content: { skills: ['market-trading', 'customer', 'astronaut', 'pricing'], summary: 'Runs a market stall and serves customers.' } });
  const r = await extractSkills(ai(), { text: 'I dey sell provisions for market', lang: 'pcm' });
  assert.equal(r.source, 'ai');
  assert.deepEqual(r.skills, ['market-trading', 'customer', 'pricing']);
  assert.match(r.summary, /market/);
});

test('extractSkills never sends a phone number to the AI', async () => {
  state.chat = () => ({ content: { skills: ['phone-repair'], summary: 'Repairs phones.' } });
  await extractSkills(ai(), { text: 'I fix phones, call me on 0803 123 4567', lang: 'en' });
  assert.ok(!JSON.stringify(state.chatBodies.at(-1)).includes('4567'));
});

test('fenced or prose-wrapped JSON is still parsed', async () => {
  assert.deepEqual(parseJSON('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
  state.chat = () => ({ content: '```json\n{"skills":["tailoring"],"summary":"Sews clothes."}\n```' });
  const r = await extractSkills(ai(), { text: 'I sew clothes', lang: 'en' });
  assert.equal(r.source, 'ai'); assert.deepEqual(r.skills, ['tailoring']);
});

test('bad JSON falls back to keyword rules', async () => {
  state.chat = () => ({ content: 'Sorry, I cannot help with that.' });
  const r = await extractSkills(ai(), { text: 'I fix phone and sell for market', lang: 'en' });
  assert.equal(r.source, 'fallback');
  assert.ok(r.skills.includes('phone-repair'));
  assert.ok(r.summary.length > 0);
});

test('a timeout falls back instead of hanging', async () => {
  state.chat = () => ({ delay: 600, content: { skills: [], summary: '' } });
  const t0 = Date.now();
  const r = await extractSkills(ai(), { text: 'I braid hair', lang: 'en' });
  assert.equal(r.source, 'fallback');
  assert.ok(r.skills.includes('hair-beauty'));
  assert.ok(Date.now() - t0 < 1500);
});

test('one retry after a 500, then success', async () => {
  state.calls = 0;
  state.chat = (_, n) => (n === 1 ? { status: 500 } : { content: { skills: ['childcare'], summary: 'Cares for children.' } });
  const r = await extractSkills(ai(), { text: 'I look after my neighbour children', lang: 'en' });
  assert.equal(r.source, 'ai'); assert.equal(state.calls, 2);
});

test('no AI configured: rules only, no network', async () => {
  const before = state.calls;
  const r = await extractSkills(createAI({}), { text: 'I cook akara and sell', lang: 'en' });
  assert.equal(r.source, 'fallback'); assert.ok(r.skills.includes('food-prep'));
  assert.equal(state.calls, before);
});

test('understand: local match first, then AI, value must be one of the options', async () => {
  const options = [{ v: 2, labels: ['1–2 hours'] }, { v: 4, labels: ['3–5 hours'] }, { v: 8, labels: ['6–10 hours'] }];
  const before = state.calls;
  assert.deepEqual(await understand(ai(), { text: '2', question: 'Hours?', options }), { value: 4, source: 'rules' });
  assert.equal(state.calls, before);
  state.chat = () => ({ content: { value: 4 } });
  assert.deepEqual(await understand(ai(), { text: 'I fit do like 4 hours', question: 'Hours?', options }), { value: 4, source: 'ai' });
  state.chat = () => ({ content: { value: 99 } });
  assert.equal((await understand(ai(), { text: 'plenty', question: 'Hours?', options })).value, null);
});

test('writeReasons drops promises and invented numbers, keeps good ones', async () => {
  const steps = [
    { kind: 'start', title: 'Phone Repair Basics', facts: { hours: 10 } },
    { kind: 'learn', title: 'Customer Service', facts: { hours: 5 } },
    { kind: 'apply', title: 'Phone Repair Apprenticeship', facts: { org: 'Computer Village', closes: '2027-01-31' } }
  ];
  state.chat = () => ({ content: { reasons: [
    'It takes 10 hours and builds on the phone repair you already do.',
    'This course will guarantee you a job.',
    'Computer Village needs 50 apprentices and closes in January.'
  ] } });
  const r = await writeReasons(ai(), { steps, lang: 'en' });
  assert.equal(r.source, 'ai');
  assert.equal(r.reasons[0], 'It takes 10 hours and builds on the phone repair you already do.');
  assert.equal(r.reasons[1], null);
  assert.equal(r.reasons[2], null);
});

test('writeReasons with AI down returns all nulls (client uses templates)', async () => {
  const r = await writeReasons(createAI({}), { steps: [{ kind: 'start', title: 'x', facts: {} }], lang: 'en' });
  assert.deepEqual(r, { reasons: [null], source: 'fallback', why: 'ai_off' });
});

test('enrichListings tags listings in batches and keeps rule tags when a batch fails', async () => {
  const listings = Array.from({ length: 25 }, (_, i) => ({ id: 'y-' + i, title: 'Listing ' + i, org: 'Org', type: 'job', skills: ['comms'], sectors: ['all'], tagged: 'rules' }));
  state.calls = 0;
  state.chat = (body, n) => {
    if (n === 2) return { status: 400 };
    const ids = JSON.parse(body.messages.at(-1).content).map(l => l.id);
    return { content: { items: ids.map(id => ({ id, skills: ['customer', 'nonsense'], sectors: ['customer'] })) } };
  };
  const out = await enrichListings(ai(), listings);
  assert.equal(out.length, 25);
  assert.deepEqual(out[0].skills, ['customer']); assert.equal(out[0].tagged, 'ai');
  assert.equal(out[24].tagged, 'rules');
});

test('transcribeNote returns cleaned text, and flags empty audio', async () => {
  state.transcribe = () => ({ text: 'I dey sell provisions, my number na 08031234567' });
  const r = await transcribeNote(ai(), { buffer: Buffer.from('fake-audio'), mime: 'audio/webm', lang: 'pcm' });
  assert.equal(r.source, 'ai'); assert.ok(!r.text.includes('0803')); assert.match(r.text, /provisions/);
  assert.match(state.audioBody, /name="language"\r\n\r\nen/);
  state.transcribe = () => ({ text: '   ' });
  assert.deepEqual(await transcribeNote(ai(), { buffer: Buffer.from('x'), mime: 'audio/webm', lang: 'ha' }), { text: '', source: 'fallback', why: 'empty' });
  assert.equal((await transcribeNote(createAI({}), { buffer: Buffer.from('x'), mime: 'audio/webm', lang: 'en' })).why, 'voice_off');
});

test('speech-to-text filler from silence or noise counts as empty', async () => {
  for (const filler of ['Thank you.', 'you', 'Thanks for watching!', '...']) {
    state.transcribe = () => ({ text: filler });
    assert.equal((await transcribeNote(ai(), { buffer: Buffer.from('x'.repeat(5000)), mime: 'audio/webm', lang: 'en' })).why, 'empty', filler);
  }
});

test('a skill summary that promises a job is replaced by the plain template', async () => {
  state.chat = () => ({ content: { skills: ['customer'], summary: 'This guarantee you will get a job soon.' } });
  const r = await extractSkills(ai(), { text: 'I sell in the market', lang: 'en' });
  assert.ok(!/guarantee/i.test(r.summary)); assert.match(r.summary, /serving customers/i);
});

test('plan reasons give up quickly (no retry), so the page is not kept waiting', async () => {
  state.calls = 0;
  state.chat = () => ({ delay: 4500, content: { reasons: ['x'] } });
  const t0 = Date.now();
  const r = await writeReasons(createAI(az.env, fetch, { timeoutMs: 10000 }), { steps: [{ kind: 'start', title: 'x', facts: {} }], lang: 'en' });
  assert.equal(r.source, 'fallback'); assert.ok(Date.now() - t0 < 4200, 'took ' + (Date.now() - t0)); assert.equal(state.calls, 1);
});

test('rankCourses returns only known course ids, in the AI order', async () => {
  state.chat = () => ({ content: { ids: ['c3', 'zzz', 'c1'] } });
  const r = await rankCourses(ai(), { goal: 'Get a job', targets: ['Customer Care Trainee'], candidates: [{ id: 'c1', title: 'A' }, { id: 'c3', title: 'B' }] });
  assert.deepEqual(r, { ids: ['c3', 'c1'], source: 'ai' });
  assert.deepEqual(await rankCourses(createAI({}), { goal: '', targets: [], candidates: [{ id: 'c1', title: 'A' }] }), { ids: [], source: 'fallback' });
});

test('plan reasons accept up to 7 steps', async () => {
  state.chat = (body) => ({ content: { reasons: JSON.parse(body.messages[1].content).map(s => `Good for ${s.title}.`) } });
  const steps = Array.from({ length: 7 }, (_, i) => ({ kind: 'learn', title: 'Course ' + i, facts: {} }));
  assert.equal((await writeReasons(ai(), { steps, lang: 'en' })).reasons.filter(Boolean).length, 7);
});

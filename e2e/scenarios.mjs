// Browser scenarios: real server + mock Yoma + mock Azure, driven with Playwright (Chromium).
//   node e2e/scenarios.mjs            (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { createRequire } from 'node:module';
import net from 'node:net';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startMockYoma, yomaItem } from '../test/helpers/mock-yoma.mjs';
import { startMockAzure } from '../test/helpers/mock-azure.mjs';
import { createAI } from '../lib/ai.mjs';
import { createSync } from '../lib/sync.mjs';
import { createApp } from '../lib/server.mjs';
import { createStore } from '../lib/store.mjs';
import { startMockKeycloak } from '../test/helpers/mock-keycloak.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// ---------- fixtures ----------
const yState = { items: [
  yomaItem(1, { title: 'Market Vendor Records Challenge', type: 'Task', zltoReward: 40, dateEnd: null, skills: [{ name: 'Bookkeeping' }], categories: [{ name: 'Business and Entrepreneurship' }] }),
  yomaItem(2, { title: 'Customer Support Agent (remote)', type: 'Job', organizationName: 'BrightDesk', skills: [{ name: 'Customer service' }, { name: 'Communication' }] }),
  yomaItem(3, { title: 'Intro to Excel', type: 'Learning', commitmentIntervalTotalHours: 6, skills: [{ name: 'Microsoft Excel' }], categories: [{ name: 'Technology and Digitization' }] }),
  yomaItem(4, { title: 'Easy Online Data Job', type: 'Job', organizationName: 'QuickCash', description: 'Pay a registration fee of N3000 to start', skills: [{ name: 'Data entry' }] }),
  yomaItem(5, { title: 'Junior Data Analyst', type: 'Job', organizationName: 'DataWorks NG', skills: [{ name: 'Data analysis' }, { name: 'Spreadsheets' }], categories: [{ name: 'Technology and Digitization' }] }),
  yomaItem(6, { title: 'Phone Repair Apprenticeship', type: 'Other', engagementType: 'Offline', organizationName: 'Computer Village Techs', skills: [{ name: 'Electronics repair' }] }),
  yomaItem(7, { title: 'Become a Data Analyst', type: 'Learning', engagementType: null, organizationName: 'Online Academy', commitmentIntervalTotalHours: 1, categories: [{ name: 'Career and Personal Development' }] }),
  yomaItem(8, { title: 'Customer Service Agent in Lagos', type: 'Job', engagementType: null, organizationName: 'Jobberman Nigeria', skills: [{ name: 'Customer service' }, { name: 'Communication' }] }),
  yomaItem(10, { title: 'Serving Customers Well', type: 'Learning', engagementType: 'Online', organizationName: 'P2E (GenU)', commitmentIntervalTotalHours: 4 }),
  yomaItem(9, { title: 'Handling Customer Complaints', type: 'Learning', engagementType: null, organizationName: 'Online Academy', commitmentIntervalTotalHours: 3 })
] };
const aState = { transcript: 'I dey sell provisions for market' };
aState.chat = body => {
  const sys = body.messages[0].content, user = body.messages[1].content;
  aState.log.push(sys.slice(0, 40));
  if (sys.includes('informal work')) return { content: { skills: ['market-trading', 'pricing', 'customer'], summary: 'Sells goods at a market stall and serves customers.' } };
  if (sys.includes('Pick the ONE option')) return { content: { value: /4 hours/i.test(user) ? 1 : null } };   // option index of '3–5 hours'
  if (sys.includes('why this step')) { const steps = JSON.parse(user); return { content: { reasons: steps.map(s => `AI: ${s.title} suits what you told me.`) } }; }
  if (sys.includes('Tag each youth opportunity')) return { content: { items: [] } };
  return { status: 400 };
};
aState.log = [];
aState.transcribe = () => ({ text: aState.transcript });

// ---------- harness ----------
const results = [];
async function scenario(name, fn) {
  try { await fn(); results.push([name, 'PASS']); console.log(`PASS  ${name}`); }
  catch (e) { results.push([name, 'FAIL', e.message]); console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));

const yoma = await startMockYoma(yState);
const azure = await startMockAzure(aState);
aState.chat = aState.chat; // keep handler after mock init
const dir = mkdtempSync(join(tmpdir(), 'pf-e2e-'));
const sync = createSync({ dataDir: dir, base: yoma.base });
await sync.run();
const store = createStore(mkdtempSync(join(tmpdir(), 'pf-e2e-store-')));
const withAI = await listen(createApp({ sync, ai: createAI(azure.env, fetch, { timeoutMs: 3000 }), store, staffCode: 'staff', rateLimit: { max: 1000 } }));
const noAI = await listen(createApp({ sync, ai: createAI({}), rateLimit: { max: 1000 } }));
// A server whose Yoma is down but has yesterday's copy on disk.
const savedDir = mkdtempSync(join(tmpdir(), 'pf-e2e-saved-'));
writeFileSync(join(savedDir, 'yoma-cache.json'), JSON.stringify({ ...sync.get(), fetchedAt: '2026-11-12T05:00:00.000Z' }));
const savedSync = createSync({ dataDir: savedDir, base: 'http://127.0.0.1:9' });
await savedSync.run();
const saved = await listen(createApp({ sync: savedSync, ai: createAI({}), rateLimit: { max: 1000 } }));

// A server whose AI is always over its rate limit, and one restarted with a recent copy (no failed sync).
const busy = await listen(createApp({ sync, ai: createAI(azure.env, fetch, { timeoutMs: 3000 }), rateLimit: { max: 0 } }));
const restartDir = mkdtempSync(join(tmpdir(), 'pf-e2e-restart-'));
writeFileSync(join(restartDir, 'yoma-cache.json'), JSON.stringify(sync.get()));
const demoVoice = await listen(createApp({ sync, ai: createAI({}), demoVoice: true, rateLimit: { max: 1000 } }));
const linked = await listen(createApp({ sync, ai: createAI({}), rateLimit: { max: 1000 }, nextPrototype: { name: 'YoCV', url: 'https://yocv.example.org/?from=pathfinder' } }));
const journeyApp = await listen(createApp({ sync, ai: createAI({}), rateLimit: { max: 1000 }, nextPrototype: { name: 'SkillLens', url: 'https://skilllens.example.org/' } }));
// "Continue with Yoma": a fake Keycloak, and the fake Yoma API for skills and saving.
const kcState = {}; const kc = await startMockKeycloak(kcState);
const port = await new Promise(r => { const t = net.createServer().listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => r(p)); }); });
const yomaApp = createApp({ sync, ai: createAI({}), rateLimit: { max: 1000 }, yomaBase: yoma.base,
  yomaAuth: { issuer: kc.issuer, clientId: 'pathfinder', publicUrl: `http://127.0.0.1:${port}` } });
await new Promise(r => yomaApp.listen(port, '127.0.0.1', r));
const withYoma = `http://127.0.0.1:${port}`;
const restarted = await listen(createApp({ sync: createSync({ dataDir: restartDir, base: yoma.base }), ai: createAI({}), rateLimit: { max: 1000 } }));

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
async function open(base, { offline = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(base + '/'); await page.waitForFunction(() => !/connecting/.test(document.querySelector('#live-sub')?.textContent || 'x'), null, { timeout: 15000 });
  return { ctx, page };
}
const tap = (page, text) => page.locator('.opts button', { hasText: text }).last().click({ timeout: 15000 });
const tapIdx = (page, i) => page.locator('.opts button').nth(i).click({ timeout: 15000 });
const typeMsg = async (page, text) => { await page.fill('#msg-input', text); await page.press('#msg-input', 'Enter'); };
const chatText = page => page.locator('#chat').innerText();
const waitChat = (page, re, timeout = 15000) => page.waitForFunction(r => new RegExp(r, 'i').test(document.querySelector('#chat').innerText), re.source, { timeout });

// ---------- scenarios ----------
await scenario('Amina, 17, Kano, Hausa: types her market work, AI turns it into skills, plan built (template reasons for under-18)', async () => {
  const { ctx, page } = await open(withAI);
  aState.log.length = 0;
  await tap(page, 'Hausa');
  await waitChat(page, /Shekarunka nawa/);
  await tap(page, '17');
  await tap(page, 'Ee, sun amince');
  await tap(page, 'Ee, yi amfani');
  await waitChat(page, /aikin da kake yi/);
  await tap(page, 'Rubuta');
  await waitChat(page, /Rubuta 'yan kalmomi/);
  await typeMsg(page, 'ina sayar da kaya a kasuwa');
  await waitChat(page, /ƙwarewa/);
  await page.waitForSelector('.skills-card');
  const card = await page.locator('.skills-card').last().innerText();
  assert(/Kasuwanci a kasuwa/.test(card), 'Hausa skill name missing in card: ' + card);
  await tap(page, 'Ee, haka ne');
  await tap(page, 'Samun kuɗi yanzu');
  await tap(page, 'Hidimar abokan ciniki');
  await tap(page, 'Kano');
  await tap(page, '3–5');
  await tap(page, 'Matsakaici');
  await tap(page, 'Gajere');
  await page.waitForSelector('.plan', { timeout: 20000 });
  const panel = await page.locator('#p-profile').innerText();
  assert(/from their own work/i.test(panel), 'panel missing own-work skills');
  assert(!aState.log.some(s => s.includes('You write the one-line')), 'reasons AI was called for an under-18');
  assert(/Shirinka na Pathfinder/.test(await page.locator('.plan').last().innerText()), 'plan title not in Hausa');
  assert(!page.errors.length, 'page errors: ' + page.errors.join('; '));
  await ctx.close();
});

await scenario('Tunde, 21, Lagos, English: plain-words answer understood by AI; plan reasons written by AI', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Digital & tech'); await tap(page, 'Lagos');
  await page.waitForSelector('.opts button:has-text("3–5 hours")');
  await typeMsg(page, 'I fit do like 4 hours');
  await waitChat(page, /How much mobile data/);
  await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.plan', { timeout: 20000 });
  const plan = await page.locator('.plan').last().innerText();
  assert(/AI: /.test(plan), 'AI reasons not shown: ' + plan.slice(0, 300));
  assert(/Azure/i.test(await page.locator('#p-board').innerText()), 'panel does not label AI reasons');
  assert(/Azure OpenAI/i.test(await page.locator('#ai-chip').innerText()), 'AI chip not showing Azure');
  await ctx.close();
});

await scenario('AI off: work description still mapped by keyword rules; reasons use templates', async () => {
  const { ctx, page } = await open(noAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile');
  await waitChat(page, /work you already do/);
  assert(!(await page.locator('.opts button', { hasText: 'Record a voice note' }).count()), 'voice offered with AI off');
  await tap(page, 'Type it');
  await waitChat(page, /Type a few words/);
  await typeMsg(page, 'I fix phone for my area and sell recharge card');
  await page.waitForSelector('.skills-card');
  assert(/Phone & electronics repair/.test(await page.locator('.skills-card').last().innerText()), 'rules did not find phone repair');
  await tap(page, "Yes, that's right");
  await tap(page, 'Get a job'); await tap(page, 'Digital & tech'); await tap(page, 'Lagos'); await tap(page, '3–5 hours'); await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.plan', { timeout: 20000 });
  assert(/Recommended because/.test(await page.locator('.plan').last().innerText()), 'template reasons missing');
  assert(/off/i.test(await page.locator('#ai-chip').innerText()), 'AI chip should say off');
  await ctx.close();
});

await scenario('Yoma down: the app says it is using the saved copy', async () => {
  const { ctx, page } = await open(saved);
  const sub = await page.locator('#live-sub').innerText();
  assert(/saved copy/i.test(sub), 'status should say saved copy, got: ' + sub);
  assert(/couldn.t be reached/i.test(await page.locator('footer').innerText()), 'footer should say the last sync failed');
  assert(!/node serve\.mjs/.test(await page.locator('footer').innerText()) || /localhost|127\.0\.0\.1/.test(page.url()), 'developer hint shown off localhost');
  await ctx.close();
  const r = await open(restarted);
  assert(!/couldn.t be reached/i.test(await r.page.locator('footer').innerText()), 'restart with a recent copy wrongly says Yoma failed');
  await r.ctx.close();
});

await scenario('A live Yoma listing asking for a fee is removed and flagged', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Digital & tech'); await tap(page, 'Online only'); await tap(page, '6–10 hours'); await tap(page, 'Plenty'); await tap(page, 'Quick');
  await page.waitForSelector('.plan', { timeout: 20000 });
  const match = await page.locator('#p-match').innerText();
  assert(/Easy Online Data Job[\s\S]*fee or payment/i.test(match), 'scam listing not flagged');
  assert(!/Easy Online Data Job/.test(await page.locator('.plan').last().innerText()), 'scam listing in plan');
  await ctx.close();
});

await scenario('Voice note: silence gets a clear retry message; a real note is played back as "I heard"', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile');
  aState.transcript = '   ';
  await tap(page, 'Record a voice note');
  await page.waitForSelector('#mic.rec', { timeout: 10000 });
  await page.waitForTimeout(1200); await page.click('#mic');
  await waitChat(page, /couldn't hear that/);
  aState.transcript = 'I dey sell provisions for market';
  await tap(page, 'Record a voice note');
  await page.waitForSelector('#mic.rec', { timeout: 10000 });
  await page.waitForTimeout(1200); await page.click('#mic');
  await waitChat(page, /I heard: .I dey sell provisions/);
  await page.waitForSelector('.skills-card');
  await ctx.close();
});

await scenario('Offline: after one visit the page reloads from cache and shows the offline banner', async () => {
  const { ctx, page } = await open(withAI);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => page.reload());
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#chat .msg', { timeout: 15000 });
  assert(await page.locator('#offline').isVisible(), 'offline banner not visible');
  assert(/offline/i.test(await page.locator('#offline').innerText()), 'offline banner text');
  await ctx.close();
});

await scenario('Slow data: after one visit, cached real listings show within a few seconds, with the banner', async () => {
  const { ctx, page } = await open(withAI);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => page.reload());
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.reload(); await page.waitForTimeout(1000);          // the controlled page caches /api/listings
  await ctx.route(u => new URL(u).pathname === '/api/listings', route => setTimeout(() => route.continue().catch(() => {}), 12000));
  const t0 = Date.now();
  await page.reload();
  await page.waitForFunction(() => /listings/.test(document.querySelector('#live-sub').textContent), null, { timeout: 8000 });
  assert(Date.now() - t0 < 8000, 'cached listings took too long');
  assert(await page.locator('#offline').isVisible(), 'banner should say these are saved listings');
  await ctx.close();
});

await scenario('A bad page response (404) never replaces the offline copy of the app', async () => {
  const { ctx, page } = await open(withAI);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => page.reload());
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  const isRoot = u => new URL(u).pathname === '/';
  await ctx.route(isRoot, route => route.fulfill({ status: 404, contentType: 'text/html', body: '<p>nope</p>' }));
  await page.reload(); await page.waitForTimeout(800);
  assert(/nope/.test(await page.content()), 'the 404 page should show while online');
  await ctx.unroute(isRoot);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#chat .msg', { timeout: 15000 });
  await ctx.close();
});

await scenario('AI busy (rate limited): a clear "try again in a minute" message, not a network error', async () => {
  const { ctx, page } = await open(busy);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Type it');
  await waitChat(page, /Type a few words/);
  await typeMsg(page, 'I sell provisions');
  await waitChat(page, /try again in a minute/);
  assert(!/couldn't reach/.test(await chatText(page)), 'showed a network error for a busy server');
  await ctx.close();
});

await scenario('Real-data shape: the Start step is relevant to the goal, not just the shortest course', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Customer service'); await tap(page, 'Lagos'); await tap(page, '3–5 hours'); await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  const start = await page.locator('.plan').last().locator('.pstep').first().locator('.ttl').innerText();
  assert(!/Data Analyst/.test(start), 'unrelated course chosen as Start: ' + start);
  const card = await page.locator('.plan').last().innerText();
  assert(/Serving Customers Well[\s\S]*?Passport to Earning/.test(card), 'real P2E course on Yoma should be the Start step: ' + start);
  const steps = await page.locator('.plan').last().locator('.pstep').evaluateAll(els => els.map(e => ({ t: e.querySelector('.ttl').textContent, src: e.querySelector('.src').textContent })));
  for (const st of steps) if (st.t !== 'Serving Customers Well' && /Passport to Earning/.test(st.src)) assert(/\(sample\)/.test(st.src), 'sample P2E course not labelled: ' + st.t);
  await ctx.close();
});

await scenario('Pilot: an urgent message reaches the staff inbox with a case code; reports and counts are recorded', async () => {
  const { ctx, page } = await open(withAI);
  assert(await page.locator('#chat a[href="/privacy.html"]').count(), 'privacy notice link missing in the chat');
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Customer service'); await tap(page, 'Lagos'); await tap(page, '3–5 hours'); await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  await page.locator('.plan').last().locator('[data-report]').nth(2).click();
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 15000 });
  await typeMsg(page, 'my boss is threatening me');
  await waitChat(page, /case number is [A-Z2-9]{6}/);
  const code = (await chatText(page)).match(/case number is ([A-Z2-9]{6})/)[1];
  await page.waitForTimeout(500);
  const cases = store.listCases();
  const c = cases.find(x => x.caseId === code);
  assert(c && c.urgent && c.reason === 'urgent' && c.state === 'lagos' && c.ageBand === '18-24', 'urgent case not in the inbox: ' + JSON.stringify(cases));
  assert(!JSON.stringify(cases).includes('threatening'), 'message text must not be stored');
  assert(cases.some(x => x.kind === 'report'), 'report not recorded');
  const types = store.events().map(e => e.type);
  for (const t of ['intake_started', 'plan_built', 'report', 'urgent']) assert(types.includes(t), 'missing event ' + t + ' in ' + types);
  await ctx.close();
});

await scenario('Demo voice (no Azure): Chrome speech recognition, clearly labelled demo only', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Stand-in for Chrome's speech service (the real one needs Google's servers).
  await ctx.addInitScript(() => {
    window.webkitSpeechRecognition = class {
      start() { this.started = true; }
      stop() { setTimeout(() => { this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'I sell provisions in the market' }], { isFinal: true })] }); this.onend && this.onend(); }, 50); }
      abort() { this.onend && this.onend(); }
    };
    window.SpeechRecognition = window.webkitSpeechRecognition;   // newer Chrome has the unprefixed name too
  });
  const page = await ctx.newPage();
  await page.goto(demoVoice + '/');
  await page.waitForFunction(() => !/connecting/.test(document.querySelector('#live-sub').textContent));
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile');
  await tap(page, 'Record a voice note');
  await waitChat(page, /demo only/i);
  await page.waitForSelector('#mic.rec', { timeout: 10000 });
  await page.click('#mic');
  await waitChat(page, /I heard: .I sell provisions in the market/);
  await page.waitForSelector('.skills-card');
  await ctx.close();
});

await scenario('Bigger plan: 5 steps, several openings per Apply step, and more openings on request', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Digital & tech'); await tap(page, 'Online only'); await tap(page, '6–10 hours'); await tap(page, 'Plenty');
  await tap(page, 'Bigger');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  const plan = page.locator('.plan').last();
  const steps = await plan.locator('.pstep').count();
  assert(steps >= 4 && steps <= 5, 'expected a 5-step plan (fewer only if openings run out), got ' + steps);
  const titles = await plan.locator('.opening .ttl').allInnerTexts();
  assert(titles.length >= 2, 'expected several openings, got ' + titles.length);
  assert(new Set(titles).size === titles.length, 'an opening appears twice: ' + titles);
  await tap(page, 'Show more openings');
  await waitChat(page, /more openings that fit you|every good match I have/);
  await ctx.close();
});

await scenario('Finishing a plan offers a next plan that builds on the new skills', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Digital & tech'); await tap(page, 'Online only'); await tap(page, '6–10 hours'); await tap(page, 'Plenty'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  const first = await page.locator('.plan').last().innerText();
  await tap(page, 'Save my plan'); await tap(page, 'Not now'); await tap(page, 'Yes, very');
  assert(!/Skills Backpack \(YoID\):/.test(await chatText(page)), 'declined Skills Backpack but something was written');
  for (const answer of ['Yes, finished', 'Yes, finished', 'One']) {
    await page.waitForSelector('#weekbtn', { timeout: 15000 }); await page.click('#weekbtn');
    await tap(page, answer);
  }
  await waitChat(page, /finished your plan\. What would you like to do next/);
  await tap(page, 'Make my next plan');
  await waitChat(page, /next plan\. It builds on the skills/);
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  const second = await page.locator('.plan').last().innerText();
  assert(second !== first, 'the next plan should differ from the finished one');
  assert(/Plan 2/.test(await page.locator('#p-gap').innerText()), 'panel should show plan 2');
  await ctx.close();
});

await scenario('Continue with Yoma: sign in, real Yoma skills are used, and the plan is saved to the Yoma account', async () => {
  yState.saved = [];
  const { ctx, page } = await open(withYoma);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21');
  await tap(page, 'Connect my Yoma account');
  await waitChat(page, /Connected to Yoma\. I found 2 skills/, 20000);
  assert(/connected · real account/i.test(await page.locator('#p-profile').innerText()), 'panel should show the real Yoma account');
  await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Customer service'); await tap(page, 'Lagos'); await tap(page, '3–5 hours'); await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  await tap(page, 'Save my plan'); await tap(page, 'Yes, activate it');
  await waitChat(page, /Saved to your Yoma account \(\d+ opportunit/);
  assert(yState.saved.length >= 1, 'nothing was saved to Yoma');
  await ctx.close();
});

await scenario('YoID records and the link to the next prototype (joined-up journey)', async () => {
  const { ctx, page } = await open(linked);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Type it');
  await waitChat(page, /Type a few words/);
  await typeMsg(page, 'I fix phones and sell recharge cards');
  await page.waitForSelector('.skills-card'); await tap(page, "Yes, that's right");
  assert(!/Skills Backpack \(YoID\):/.test(await chatText(page)), 'nothing should be written to YoID before the Skills Backpack is agreed');
  await tap(page, 'Get a job'); await tap(page, 'Digital & tech'); await tap(page, 'Online only'); await tap(page, '6–10 hours'); await tap(page, 'Plenty'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  await tap(page, 'Save my plan');
  await waitChat(page, /activate your Skills Backpack/);
  await tap(page, 'Tell me more'); await waitChat(page, /You decide when and if you share it/);
  await tap(page, 'Yes, activate it');
  await waitChat(page, /Added to your Skills Backpack \(YoID\): \d+ skills from your own work/);
  await waitChat(page, /Added to your Skills Backpack \(YoID\): your 3-step Pathfinder plan/);
  const link = page.locator('.plan').last().locator('a.next-proto');
  assert(await link.count(), 'next prototype link missing after saving');
  const nextUrl = new URL(await link.getAttribute('href'));
  assert(nextUrl.origin === 'https://yocv.example.org' && nextUrl.searchParams.get('from') === 'pathfinder' && nextUrl.searchParams.get('course'), 'wrong next link: ' + nextUrl);
  const look = await link.evaluate(el => { const c = getComputedStyle(el); return [c.color, c.backgroundColor]; });
  assert(look[0] !== look[1], 'next prototype button text is the same colour as its background: ' + look);
  assert(/YoID records/.test(await page.locator('#p-profile').innerText()), 'panel should list YoID records');
  await ctx.close();
});

await scenario('15-year-old: guardian agrees, plan saved, but no Skills Backpack (YoID starts at 16, as in FunDoo)', async () => {
  const { ctx, page } = await open(noAI);
  await tap(page, 'English'); await page.locator('.opts button').getByText('15', { exact: true }).click(); await tap(page, 'Yes, they agree'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Learn new skills'); await tap(page, 'Digital & tech'); await tap(page, 'Lagos'); await tap(page, '3–5 hours'); await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  await tap(page, 'Save my plan');
  await waitChat(page, /Skills Backpacks on YoID start at 16/);
  const chat = await chatText(page);
  assert(!/activate your Skills Backpack/.test(chat) && !/Skills Backpack \(YoID\):/.test(chat), 'a 15-year-old should not be offered or given YoID records');
  assert(/not offered \(YoID starts at 16\)/.test(await page.locator('#p-profile').innerText()), 'panel should say why');
  assert(!page.errors.length, 'page errors: ' + page.errors.join('; '));
  await ctx.close();
});

await scenario('Journey (team shared mock data): Ziqi hands over the Saved Opportunity; PathFinder hands the Learning Plan to SkillLens', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage(); page.errors = []; page.on('pageerror', e => page.errors.push(e.message));
  await page.goto(journeyApp + '/?journey=demo');
  await waitChat(page, /From Ziqi/);
  const intro = await chatText(page);
  assert(/Saved Opportunity/.test(intro) && /A verified opportunity and the user's goal/.test(intro), 'incoming handoff item not named as in the shared data and the journey');
  assert(/Solar Installation Assistant \(Trainee\)/.test(intro) && /Sunrise Solar Ltd/.test(intro), 'the shared job not shown');
  await tap(page, 'English'); await tap(page, '20'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await waitChat(page, /Which state do you live in/);   // the goal came from Phase 1, so it isn't asked again
  await tap(page, 'Another state'); await tap(page, '6–10 hours'); await tap(page, 'Very little'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  const plan = await page.locator('.plan').last().innerText();
  // The same plan as the shared Learning Plan (plan-001): safety course, solar course, the saved job
  assert(/Solar Installation Assistant/.test(plan) && /Verified on Yoma/.test(plan), 'the saved job should be in the plan');
  assert(/Working Safely at Height/.test(plan) && /Solar PV Installation Basics/.test(plan), 'the shared courses should be in the plan: ' + plan);
  assert(!/Solar Sales Agent/.test(plan), 'the pay-to-apply job must be filtered out');
  assert(/Asks for a fee/.test(await page.locator('#p-match').innerText()), 'the scam job should be listed as removed');
  await tap(page, 'Save my plan'); await tap(page, 'Yes, activate it');
  await waitChat(page, /Learning Plan/);
  assert(/Plan step: complete a P2E course/.test(await chatText(page)), 'outgoing handoff should also use the journey wording');
  const next = page.locator('a.next-proto').last();
  const href = new URL(await next.getAttribute('href'));
  assert(href.origin === 'https://skilllens.example.org' && href.searchParams.get('from') === 'pathfinder', 'wrong SkillLens link: ' + href);
  assert(href.searchParams.get('course') === 'opp-course-001' && href.searchParams.get('plan') === 'plan-001' && href.searchParams.get('listing') === 'opp-job-001', 'SkillLens link should carry the shared ids: ' + href);
  assert(/continue in SkillLens/.test(await next.innerText()), 'next button should name SkillLens');
  assert(!page.errors.length, page.errors.join('; '));
  await ctx.close();
});

await scenario('Yoruba: choosing Yorùbá switches the conversation to Yoruba', async () => {
  const { ctx, page } = await open(withAI);
  await tap(page, 'Yorùbá');
  await waitChat(page, /Ọmọ ọdún mélòó ni ọ́/);
  await waitChat(page, /àyẹ̀wò/);   // review notice
  await ctx.close();
});

await scenario('Earlier safety features still work: report a step, save, resume after reload, DELETE', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await tap(page, 'English'); await tap(page, '21'); await tap(page, 'Yes, use my profile'); await tap(page, 'Skip');
  await tap(page, 'Get a job'); await tap(page, 'Customer service'); await tap(page, 'Lagos'); await tap(page, '3–5 hours'); await tap(page, 'Some'); await tap(page, 'Quick');
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 20000 });
  const before = await page.locator('.plan').last().locator('.pstep').nth(2).locator('.opening .ttl').first().innerText();
  await page.locator('.plan').last().locator('[data-report]').nth(2).click();
  await page.waitForFunction(() => document.querySelectorAll('.plan').length >= 2, null, { timeout: 15000 });
  await page.waitForSelector('.opts button:has-text("Save my plan")', { timeout: 15000 });
  const after = await page.locator('.plan').last().locator('.pstep').nth(2).locator('.opening .ttl').first().innerText();
  assert(before !== after, 'reported step was not replaced');
  await tap(page, 'Save my plan'); await tap(page, 'Not now'); await tap(page, 'Yes, very');
  assert(!/Skills Backpack \(YoID\):/.test(await chatText(page)), 'declined Skills Backpack but something was written');
  await page.waitForSelector('#weekbtn', { timeout: 15000 });
  await page.reload();
  await page.waitForSelector('.opts button:has-text("Yes, continue")', { timeout: 15000 });
  await tap(page, 'Yes, continue');
  await page.waitForSelector('#weekbtn', { timeout: 15000 });
  await typeMsg(page, 'DELETE');
  await page.waitForTimeout(800);
  assert(!(await page.evaluate(() => localStorage.getItem('pf-saved-plan'))), 'DELETE did not clear the saved plan');
  await ctx.close();
});

await scenario('Basic phone (SMS): numbered replies, plan as text with REPORT instructions', async () => {
  const { ctx, page } = await open(withAI);
  await page.click('#persona button[data-v="tunde"]');
  await page.click('#channel button[data-v="sms"]');
  for (const n of ['1', '7', '1']) await tap(page, n);          // English, 21, use profile
  await waitChat(page, /work you already do/);
  assert(!/Record a voice note/.test(await chatText(page)), 'voice offered on a basic phone');
  for (const n of ['2', '1', '2', '1', '2', '2', '1']) await tap(page, n);   // skip work, job, customer service, Lagos, 3-5 h, some data, quick plan
  await waitChat(page, /YOUR PATHFINDER PLAN/, 20000);
  assert(/reply REPORT/i.test(await chatText(page)), 'SMS plan missing REPORT instruction');
  await ctx.close();
});

await scenario('Opened as a file (no server): runs on built-in sample data and says so', async () => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await page.goto('file://' + new URL('../pathfinder.html', import.meta.url).pathname);
  await page.waitForSelector('.opts button', { timeout: 10000 });
  assert(/not reachable/.test(await page.locator('#live-sub').innerText()), 'status should say not reachable');
  assert(/sample/i.test(await page.locator('#data-badge').innerText()), 'badge should say sample');
  await tap(page, 'English'); await tap(page, '21');
  await ctx.close();
});

await browser.close();
await yoma.close(); await azure.close(); await kc.close(); yomaApp.close();
const failed = results.filter(r => r[1] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} scenarios passed`);
process.exit(failed ? 1 : 0);

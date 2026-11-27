// HTTP app: static files, /api routes, rate limits and an optional pilot access code.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import { extractSkills, understand, writeReasons, transcribeNote, rankCourses } from './ai-tasks.mjs';
import { createYomaAuth } from './yoma-auth.mjs';
import { normalise, buildPlan as buildServerPlan, planMessage, stepText, handoffCourse } from './plan-server.mjs';
import { ageBand } from './store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = {
  '/': ['pathfinder.html', 'text/html; charset=utf-8'],
  '/pathfinder.html': ['pathfinder.html', 'text/html; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/privacy.html': ['privacy.html', 'text/html; charset=utf-8'],
  '/tokens/yoma-tokens.css': ['tokens/yoma-tokens.css', 'text/css; charset=utf-8'],
  '/engine/plan-engine.js': ['engine/plan-engine.js', 'text/javascript; charset=utf-8']
};
const STATES = ['lagos', 'kano', 'fct', 'oyo', 'rivers', 'other', 'online'];
const CASE_REASONS = ['urgent', 'help', 'missed', 'no_match', 'person', 'report'];
const EVENT_TYPES = ['intake_started', 'work_skills_added', 'voice_used', 'plan_built', 'plan_saved', 'step_done', 'applied',
  'handoff', 'urgent', 'report', 'ai_fallback', 'deleted', 'next_plan'];
const LANGS = ['en', 'pcm', 'ha', 'yo'];
const JSON_LIMIT = 16 * 1024, AUDIO_LIMIT = 2 * 1024 * 1024;

class HttpError extends Error { constructor(status, code) { super(code); this.status = status; } }

async function readBody(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new HttpError(413, 'too_large');
  const chunks = []; let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, 'too_large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function readJSON(req) {
  const buf = await readBody(req, JSON_LIMIT);
  try { return JSON.parse(buf.toString('utf8') || '{}'); } catch { throw new HttpError(400, 'bad_json'); }
}
const str = (v, max = 600) => (typeof v === 'string' ? v.slice(0, max) : '');
const lang = v => (LANGS.includes(v) ? v : 'en');

function send(req, res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra };
  if (buf.length > 1024 && /gzip/.test(req.headers['accept-encoding'] || '') && /json|html|javascript/.test(type)) {
    buf = gzipSync(buf); headers['content-encoding'] = 'gzip'; headers.vary = 'accept-encoding';
  }
  res.writeHead(status, headers); res.end(buf);
}

function rateLimiter({ max = 30, windowMs = 600000 } = {}) {
  const hits = new Map();
  return ip => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
    list.push(now); hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
    return list.length <= max;
  };
}

const CODE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pathfinder</title>
<style>body{font-family:system-ui,sans-serif;max-width:360px;margin:15vh auto;padding:0 16px}input,button{font:inherit;padding:10px;width:100%;margin-top:8px;box-sizing:border-box}</style>
<h1>Pathfinder</h1><p>This pilot needs an access code.</p><form method="get"><label>Access code<input name="code" autocomplete="off" required></label><button>Open</button></form>`;

// Behind Azure App Service (or any proxy) every request comes from the proxy, so the real client is the
// first address in X-Forwarded-For. Only trust that header when told to, or anyone could fake it.
function clientIp(req, trustProxy) {
  if (trustProxy) {
    const first = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (first) return first.replace(/^\[?([^\]]+?)\]?(:\d+)?$/, (m, host) => (host.includes('.') ? host : m));
  }
  return req.socket.remoteAddress || 'unknown';
}

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const cookieValue = (req, name) => { const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return m ? decodeURIComponent(m[1]) : null; };
const STAFF_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pathfinder cases</title>
<link rel="stylesheet" href="/tokens/yoma-tokens.css">
<style>body{font-family:var(--yoma-font-body);max-width:900px;margin:24px auto;padding:0 16px;color:var(--yoma-ink);background:var(--yoma-bg)}h1{margin:0 0 4px;font-family:var(--yoma-font-display);color:var(--yoma-primary)}
.c{background:var(--yoma-surface);border:1px solid var(--yoma-line);border-radius:var(--yoma-radius);padding:12px 14px;margin:10px 0}.u{border:2px solid var(--yoma-danger-ink);background:var(--yoma-danger-soft)}
.done{opacity:.55}.k{font:700 18px var(--yoma-font-mono);letter-spacing:2px;color:var(--yoma-primary)}.m{color:var(--yoma-muted);font-size:14px}
button{font:inherit;font-weight:600;padding:6px 14px;margin-top:6px;border-radius:var(--yoma-radius-pill);border:0;background:var(--yoma-primary);color:var(--yoma-primary-ink)}
.s{display:flex;gap:12px;flex-wrap:wrap;font-size:14px}.s span{background:var(--yoma-surface);border:1px solid var(--yoma-line);border-radius:var(--yoma-radius-sm);padding:6px 10px}</style>
<h1>Pathfinder cases</h1><p class="m">Facilitator handoffs and listing reports. Urgent cases first: contact the same day. No names or phone numbers are stored; the young person quotes the case code.</p>
<div class="s" id="sum"></div><div id="list">Loading…</div>
<script>
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const WHY = {urgent:'URGENT: message suggests they may be unsafe', help:'Asked for help', missed:'Missed 2 check-ins', no_match:'No opening matched', person:'Asked to talk to a person', report:'Reported a listing'};
async function load(){
  const r = await fetch('/api/staff/cases'); const j = await r.json();
  document.getElementById('sum').innerHTML = Object.entries(j.summary.byType).map(([k,v]) => '<span>'+esc(k)+': <b>'+v+'</b></span>').join('');
  document.getElementById('list').innerHTML = j.cases.length ? j.cases.map(c => '<div class="c '+(c.urgent && c.status==='open'?'u ':'')+(c.status!=='open'?'done':'')+'">'
    + '<div class="k">'+esc(c.caseId)+'</div><div><b>'+esc(WHY[c.reason]||c.reason)+'</b>'+(c.kind==='report'?': '+esc(c.listingTitle):'')+'</div>'
    + '<div class="m">'+esc(c.at.replace('T',' ').slice(0,16))+' UTC · '+esc(c.state)+' · age '+esc(c.ageBand)+' · '+esc(c.lang)+(c.step?' · step: '+esc(c.step):'')+' · '+esc(c.status)+'</div>'
    + (c.status==='open'?'<button data-id="'+esc(c.caseId)+'">Mark contacted</button>':'')+'</div>').join('') : '<p>No cases yet.</p>';
}
document.addEventListener('click', async e => { const id = e.target.dataset && e.target.dataset.id; if (!id) return; await fetch('/api/staff/cases/'+id+'/done', {method:'POST'}); load(); });
load(); setInterval(load, 60000);
</script>`;

export function createApp({ sync, ai, store = null, root = ROOT, accessCode = '', staffCode = '', rateLimit = {}, trustProxy = false, demoVoice = false, yomaAuth = null, yomaBase = 'https://api.yoma.world/api/v3', nextPrototype = null, rapidproToken = '', log = () => {} }) {
  const next = nextPrototype && /^https?:\/\//.test(nextPrototype.url || '') ? { name: String(nextPrototype.name || 'the next prototype').slice(0, 40), url: nextPrototype.url } : null;
  const yAuth = yomaAuth && yomaAuth.issuer && yomaAuth.clientId && yomaAuth.publicUrl ? createYomaAuth({ ...yomaAuth, yomaBase }) : null;
  const allow = rateLimiter(rateLimit);
  const allowRecord = rateLimiter({ max: 120, windowMs: 600000 });
  const wrongCodes = new Map();   // ip -> timestamps of wrong access/staff codes
  const tooManyWrong = ip => (wrongCodes.get(ip) || []).filter(t => Date.now() - t < 600000).length >= 10;
  const noteWrong = ip => wrongCodes.set(ip, [...(wrongCodes.get(ip) || []).filter(t => Date.now() - t < 600000), Date.now()]);
  const codeOK = req => !accessCode || (cookieValue(req, 'pf_code') !== null && same(cookieValue(req, 'pf_code'), accessCode));
  const staffOK = req => !!staffCode && cookieValue(req, 'pf_staff') !== null && same(cookieValue(req, 'pf_staff'), staffCode);
  const secure = req => req.socket.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const setCookie = (req, name, value, location) => ({ location, 'set-cookie': `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}` });

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    try {
      const ip = clientIp(req, trustProxy);
      // Codes in the address (?code=…): limited to 10 wrong tries per address per 10 minutes.
      if (req.method === 'GET' && url.searchParams.has('code') && (accessCode || (staffCode && path === '/staff'))) {
        if (tooManyWrong(ip)) return send(req, res, 429, 'Too many wrong codes. Try again in 10 minutes.', 'text/plain; charset=utf-8');
        const given = url.searchParams.get('code');
        if (path === '/staff' && staffCode && same(given, staffCode)) { res.writeHead(302, setCookie(req, 'pf_staff', staffCode, '/staff')); return res.end(); }
        if (path !== '/staff' && accessCode && same(given, accessCode)) { res.writeHead(302, setCookie(req, 'pf_code', accessCode, '/')); return res.end(); }
        noteWrong(ip);
      }
      // Staff inbox: its own code, separate from the pilot access code.
      if (path === '/staff' || path.startsWith('/api/staff/')) {
        if (!staffCode || !store) return send(req, res, 404, { error: 'not_found' });
        if (!staffOK(req)) return path === '/staff' ? send(req, res, 200, CODE_PAGE.replace('This pilot needs an access code.', 'Staff code needed.'), 'text/html; charset=utf-8') : send(req, res, 401, { error: 'staff_code_required' });
        if (req.method === 'GET' && path === '/staff') return send(req, res, 200, STAFF_PAGE, 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
        if (req.method === 'GET' && path === '/api/staff/cases') return send(req, res, 200, { cases: store.listCases(), summary: (await import('./store.mjs')).summarise(store.events()) }, undefined, { 'cache-control': 'no-store' });
        const m = path.match(/^\/api\/staff\/cases\/([A-Z0-9]{6})\/done$/);
        if (req.method === 'POST' && m) return store.markDone(m[1]) ? send(req, res, 200, { ok: true }) : send(req, res, 404, { error: 'not_found' });
        return send(req, res, 404, { error: 'not_found' });
      }
      // Sign in with Yoma (only when configured). The token never leaves this server.
      if (path === '/auth/yoma' || path === '/auth/yoma/callback' || path.startsWith('/api/yoma/')) {
        if (!yAuth) return send(req, res, 404, { error: 'not_found' });
        if (!allowRecord(ip)) return send(req, res, 429, { error: 'rate_limited' });
        if (req.method === 'GET' && path === '/auth/yoma') { res.writeHead(302, { location: await yAuth.loginUrl() }); return res.end(); }
        if (req.method === 'GET' && path === '/auth/yoma/callback') {
          const sid = await yAuth.finish(url.searchParams.get('code'), url.searchParams.get('state')).catch(() => null);
          if (!sid) { res.writeHead(302, { location: '/?yoma=error' }); return res.end(); }
          res.writeHead(302, { location: '/?yoma=connected', 'set-cookie': `pf_yoma=${sid}; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax${secure(req) ? '; Secure' : ''}` });
          return res.end();
        }
        const sid = cookieValue(req, 'pf_yoma');
        if (req.method === 'GET' && path === '/api/yoma/me') return send(req, res, 200, await yAuth.me(sid).catch(() => ({ connected: false })), undefined, { 'cache-control': 'no-store' });
        if (req.method === 'POST' && path === '/api/yoma/save') {
          const b = await readJSON(req);
          const saved = await yAuth.save(sid, Array.isArray(b.ids) ? b.ids : []);
          return saved === null ? send(req, res, 401, { error: 'not_signed_in' }) : send(req, res, 200, { saved });
        }
        if (req.method === 'POST' && path === '/api/yoma/logout') { yAuth.end(sid); return send(req, res, 200, { ok: true }, undefined, { 'set-cookie': 'pf_yoma=; Path=/; Max-Age=0' }); }
        return send(req, res, 404, { error: 'not_found' });
      }
      // RapidPro / WhatsApp webhooks: the same plan engine, called by a flow. Protected by a shared token.
      if (path.startsWith('/api/rapidpro/')) {
        if (!rapidproToken || !store) return send(req, res, 404, { error: 'not_found' });
        const given = String(req.headers.authorization || '').replace(/^Token\s+/i, '') || String(req.headers['x-pathfinder-token'] || '');
        if (!given || !same(given, rapidproToken)) return send(req, res, 401, { error: 'bad_token' });
        if (!allowRecord(ip)) return send(req, res, 429, { error: 'rate_limited' });
        const b = await readJSON(req);
        if (req.method === 'POST' && path === '/api/rapidpro/plan') {
          const answers = normalise(b);
          if (answers.age !== null && (answers.age < 15 || answers.age > 24)) return send(req, res, 200, { ok: false, message: 'Pathfinder is for young people aged 15 to 24.' });
          const plan = buildServerPlan({ answers, catalogue: sync.get() });
          if (!plan) return send(req, res, 200, { ok: false, message: "I couldn't find an opening that fits your answers today. A facilitator will contact you." });
          const steps = plan.steps.map((st, i) => stepText(st, i));
          const course = handoffCourse(plan);
          // yoidOk: YoID (the Skills Backpack) is for 16 and over, as in UNICEF's FunDoo bot. The exact age isn't stored.
          const planId = store.addPlan({ lang: answers.lang, ageBand: ageBand(answers.age), yoidOk: answers.age !== null && answers.age >= 16, backpack: null, state: answers.a.state, steps, kinds: plan.steps.map(s => s.kind) });
          store.addEvent({ type: 'plan_built', lang: answers.lang, age: ageBand(answers.age) });
          const handoff = course ? `Learning Plan (plan step: complete a P2E course): ${course.title}` : '';
          if (handoff) store.updatePlan(planId, { handoff });
          return send(req, res, 200, { ok: true, plan_id: planId, steps: steps.length, text_steps: steps, message: planMessage(plan), handoff, yoid_ok: answers.age !== null && answers.age >= 16 });
        }
        // FunDoo's Skills Backpack: the young person agrees once; then plan and finished steps are written to YoID (mocked).
        if (req.method === 'POST' && path === '/api/rapidpro/backpack') {
          const p = store.getPlan(str(b.plan_id, 12));
          if (!p) return send(req, res, 404, { error: 'unknown_plan' });
          const course = p.handoff || '';
          if (!p.yoidOk) { store.updatePlan(p.planId, { backpack: false });
            return send(req, res, 200, { ok: true, backpack: false, handoff: course, message: "Skills Backpacks on YoID start at 16, so your plan stays here in this chat for now." }); }
          const yes = /^(1|yes|y|agree|activate)$/.test(String(b.answer ?? '').trim().toLowerCase());
          store.updatePlan(p.planId, yes ? { backpack: true, yoid: [{ type: 'plan', n: p.steps.length, at: new Date().toISOString() }] } : { backpack: false });
          if (yes) store.addEvent({ type: 'backpack_on', lang: p.lang, age: p.ageBand });
          return send(req, res, 200, { ok: true, backpack: yes, handoff: course, message: yes
            ? `🎒 Your Skills Backpack is ready!\n\nAdded to your Skills Backpack (YoID): your ${p.steps.length}-step Pathfinder plan. Every step you finish can be added to it.`
            : "That's fine. Nothing goes in a Skills Backpack. Your plan is still here in this chat." });
        }
        if (req.method === 'POST' && path === '/api/rapidpro/checkin') {
          const p = store.getPlan(str(b.plan_id, 12));
          if (!p) return send(req, res, 404, { error: 'unknown_plan' });
          const ans = String(b.answer ?? '').trim().toLowerCase();
          const kind = /^(1|done|finished|yes|applied)$/.test(ans) ? 'done' : /^(2|doing|working)$/.test(ans) ? 'doing' : /^(4|help)$/.test(ans) ? 'help' : 'not';
          let { current, stalls } = p, message;
          if (kind === 'done') {
            current += 1; stalls = 0;
            const added = p.backpack && p.kinds && p.kinds[current - 1] !== 'apply' ? `🎒 Added to your Skills Backpack (YoID): step ${current} finished.\n\n` : '';
            message = current >= p.steps.length ? `${added}Well done, you finished your plan!${p.backpack ? ' Your achievements are in your Skills Backpack.' : ''} Reply PLAN to make your next plan.`
              : `${added}Well done! Next is:

${p.steps[current].replace(/^\*(\d+)\./, '*Step $1.')}`;
            store.addEvent({ type: current >= p.steps.length ? 'applied' : 'step_done', lang: p.lang, age: p.ageBand });
          } else if (kind === 'doing') {
            message = 'Good. Try one short lesson today, about 30 minutes.';
          } else {
            stalls = kind === 'help' ? 2 : stalls + 1;
            if (stalls >= 2) {
              const caseId = store.addCase({ kind: 'handoff', urgent: false, reason: kind === 'help' ? 'help' : 'missed', state: p.state, ageBand: p.ageBand, lang: p.lang, step: (p.steps[current] || '').slice(0, 160) });
              message = `A facilitator will message you within 2 working days. Your case number is ${caseId}.`; stalls = 0;
            } else message = "That's okay. Let's make it smaller: just the first lesson this week.";
          }
          store.updatePlan(p.planId, { current, stalls });
          return send(req, res, 200, { ok: true, plan_id: p.planId, step: Math.min(current + 1, p.steps.length), finished: current >= p.steps.length, message });
        }
        return send(req, res, 404, { error: 'not_found' });
      }
      // The team's shared mock data for the four-prototype journey (same user, listing, course, credential everywhere)
      if (req.method === 'GET' && path === '/api/journey') return send(req, res, 200, readFileSync(join(root, 'mockups', 'shared-mock-data.json')), 'application/json; charset=utf-8', { 'access-control-allow-origin': '*' });
      if (req.method === 'GET' && path === '/privacy.html') return send(req, res, 200, readFileSync(join(root, 'privacy.html')), 'text/html; charset=utf-8');
      if (!codeOK(req)) {
        if (path.startsWith('/api/')) return send(req, res, 401, { error: 'access_code_required' });
        return send(req, res, 200, CODE_PAGE, 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && STATIC[path]) {
        const [file, type] = STATIC[path];
        const extra = { 'cache-control': 'no-cache' };
        // x-pf-app marks the real app page: the service worker only keeps this in its offline copy.
        if (path === '/' || path.endsWith('.html')) Object.assign(extra, { 'permissions-policy': 'microphone=(self), camera=(), geolocation=()', 'x-pf-app': '1' });
        return send(req, res, 200, readFileSync(join(root, file)), type, extra);
      }

      if (req.method === 'GET' && path === '/api/listings') {
        const cat = sync.get();
        const etag = `W/"${cat.fetchedAt || cat.source}-${cat.opps.length + cat.courses.length}"`;
        if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag }); return res.end(); }
        const { error, ...pub } = cat;
        return send(req, res, 200, { ...pub, error: error ? 'Yoma could not be reached on the last try' : undefined }, undefined, { etag, 'cache-control': 'no-cache' });
      }

      if (req.method === 'GET' && path === '/api/status') {
        const cat = sync.get(), st = sync.status();
        return send(req, res, 200, {
          ai: { provider: ai.provider, chat: ai.features.chat, voice: ai.features.voice },
          demoVoice: !!demoVoice, yomaLogin: !!yAuth, nextPrototype: next,   // demo only: browser speech recognition when Azure voice is off
          yoma: { source: cat.source, fetchedAt: cat.fetchedAt, changes: cat.changes, count: cat.opps.length + cat.courses.length,
            nextSync: st.nextAt ? new Date(st.nextAt).toISOString() : null, error: cat.error ? 'last sync failed' : null }
        }, undefined, { 'cache-control': 'no-store' });
      }

      // Pilot records: only fixed values are stored, never free text typed by the young person.
      if (req.method === 'POST' && (path === '/api/cases' || path === '/api/events')) {
        if (!store) return send(req, res, 404, { error: 'not_found' });
        if (!allowRecord(ip)) return send(req, res, 429, { error: 'rate_limited' });
        const b = await readJSON(req);
        const common = { lang: lang(b.lang), age: ageBand(b.age) };
        if (path === '/api/events') {
          if (!EVENT_TYPES.includes(b.type)) throw new HttpError(400, 'unknown_event');
          store.addEvent({ type: b.type, ...common });
          res.writeHead(204); return res.end();
        }
        if (!['handoff', 'report'].includes(b.kind)) throw new HttpError(400, 'unknown_kind');
        const c = { kind: b.kind, urgent: b.urgent === true, reason: b.kind === 'report' ? 'report' : (CASE_REASONS.includes(b.reason) ? b.reason : 'help'),
          state: STATES.includes(b.state) ? b.state : 'unknown', ageBand: common.age, lang: common.lang, step: str(b.step, 160) || undefined,
          listingId: /^[\w-]{1,80}$/.test(b.listingId || '') ? b.listingId : undefined, listingTitle: str(b.listingTitle, 160) || undefined };
        const caseId = store.addCase(c);
        log(`case ${caseId}: ${c.kind}${c.urgent ? ' URGENT' : ''}`);
        return send(req, res, 200, { caseId });
      }

      if (req.method === 'POST' && path.startsWith('/api/ai/')) {
        if (!allow(ip)) return send(req, res, 429, { error: 'rate_limited' });
        const job = path.slice('/api/ai/'.length);
        if (job === 'transcribe') {
          const buf = await readBody(req, AUDIO_LIMIT);
          if (!buf.length) throw new HttpError(400, 'no_audio');
          const mime = str(req.headers['content-type'], 80) || 'audio/webm';
          return send(req, res, 200, await transcribeNote(ai, { buffer: buf, mime, lang: lang(url.searchParams.get('lang')) }));
        }
        const body = await readJSON(req);
        if (job === 'skills') {
          const text = str(body.text);
          if (!text.trim()) throw new HttpError(400, 'text_required');
          return send(req, res, 200, await extractSkills(ai, { text, lang: lang(body.lang) }));
        }
        if (job === 'understand') {
          const options = Array.isArray(body.options) ? body.options.slice(0, 16)
            .filter(o => o && ['string', 'number', 'boolean'].includes(typeof o.v) && Array.isArray(o.labels))
            .map(o => ({ v: o.v, labels: o.labels.slice(0, 4).map(l => str(l, 80)) })) : [];
          if (!options.length || !str(body.text).trim()) throw new HttpError(400, 'text_and_options_required');
          return send(req, res, 200, await understand(ai, { text: str(body.text, 300), question: str(body.question, 300), options }));
        }
        if (job === 'rank') {
          const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, 12).map(c => ({ id: str(c && c.id, 80), title: str(c && c.title, 160) })).filter(c => c.id) : [];
          const targets = Array.isArray(body.targets) ? body.targets.slice(0, 6).map(x => str(x, 160)) : [];
          return send(req, res, 200, await rankCourses(ai, { goal: str(body.goal, 80), sector: str(body.sector, 40), targets, candidates }));
        }
        if (job === 'reasons') {
          const steps = Array.isArray(body.steps) ? body.steps.slice(0, 7).map(s => ({ kind: str(s?.kind, 10), title: str(s?.title, 160),
            facts: Object.fromEntries(Object.entries(s?.facts || {}).slice(0, 12).map(([k, v]) => [str(k, 30), typeof v === 'number' ? v : str(v, 200)])) })) : [];
          if (!steps.length) throw new HttpError(400, 'steps_required');
          return send(req, res, 200, await writeReasons(ai, { steps, lang: lang(body.lang) }));
        }
      }
      return send(req, res, 404, { error: 'not_found' });
    } catch (e) {
      // After a rejected upload the rest of the body is unread, so the connection can't be reused.
      if (e instanceof HttpError) return send(req, res, e.status, { error: e.message }, undefined, e.status === 413 ? { connection: 'close' } : {});
      log(`error on ${req.method} ${path}: ${e.message}`);   // never log bodies
      return send(req, res, 500, { error: 'server_error' });
    }
  });
}

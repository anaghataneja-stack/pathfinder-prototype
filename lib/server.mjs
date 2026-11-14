// HTTP app: static files, /api routes, rate limits and an optional pilot access code.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import { extractSkills, understand, writeReasons, transcribeNote } from './ai-tasks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = {
  '/': ['pathfinder.html', 'text/html; charset=utf-8'],
  '/pathfinder.html': ['pathfinder.html', 'text/html; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
  '/icon.svg': ['icon.svg', 'image/svg+xml']
};
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

export function createApp({ sync, ai, root = ROOT, accessCode = '', rateLimit = {}, trustProxy = false, log = () => {} }) {
  const allow = rateLimiter(rateLimit);
  const codeOK = req => {
    if (!accessCode) return true;
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)pf_code=([^;]+)/);
    if (!m) return false;
    const a = Buffer.from(decodeURIComponent(m[1])), b = Buffer.from(accessCode);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    try {
      if (accessCode && req.method === 'GET' && url.searchParams.has('code') && url.searchParams.get('code') === accessCode) {
        res.writeHead(302, { location: '/', 'set-cookie': `pf_code=${encodeURIComponent(accessCode)}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax` });
        return res.end();
      }
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
          yoma: { source: cat.source, fetchedAt: cat.fetchedAt, changes: cat.changes, count: cat.opps.length + cat.courses.length,
            nextSync: st.nextAt ? new Date(st.nextAt).toISOString() : null, error: cat.error ? 'last sync failed' : null }
        }, undefined, { 'cache-control': 'no-store' });
      }

      if (req.method === 'POST' && path.startsWith('/api/ai/')) {
        const ip = clientIp(req, trustProxy);
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
        if (job === 'reasons') {
          const steps = Array.isArray(body.steps) ? body.steps.slice(0, 3).map(s => ({ kind: str(s?.kind, 10), title: str(s?.title, 160),
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

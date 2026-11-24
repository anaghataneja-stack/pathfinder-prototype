// "Continue with Yoma": OpenID Connect sign-in against Yoma's Keycloak (authorization code + PKCE).
// The access token stays on this server, in memory, keyed by an HttpOnly session cookie; the browser never sees it.
// Needs a Keycloak client for Pathfinder, registered by Yoma, whose redirect URI is <PUBLIC_URL>/auth/yoma/callback.
import { randomBytes, createHash } from 'node:crypto';
import { skillsFromText } from './rules.mjs';

const b64url = buf => buf.toString('base64url');

export function createYomaAuth({ issuer, clientId, clientSecret = '', publicUrl, yomaBase, fetchImpl = fetch }) {
  const pending = new Map();    // state -> { verifier, at }
  const sessions = new Map();   // sid -> { token, exp }
  let discovery = null;
  const redirectUri = `${publicUrl.replace(/\/+$/, '')}/auth/yoma/callback`;
  const tidy = () => { const now = Date.now();
    for (const [k, v] of pending) if (now - v.at > 600000) pending.delete(k);
    for (const [k, v] of sessions) if (v.exp < now) sessions.delete(k); };

  async function discover() {
    if (discovery) return discovery;
    const r = await fetchImpl(`${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`);
    if (!r.ok) throw new Error('Yoma sign-in discovery failed: ' + r.status);
    return (discovery = await r.json());
  }

  async function loginUrl() {
    tidy();
    const d = await discover();
    const state = b64url(randomBytes(16)), verifier = b64url(randomBytes(32));
    pending.set(state, { verifier, at: Date.now() });
    const q = new URLSearchParams({ client_id: clientId, response_type: 'code', scope: 'openid', redirect_uri: redirectUri, state,
      code_challenge: b64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256' });
    return `${d.authorization_endpoint}?${q}`;
  }

  // Returns a new session id, or null if the state is unknown or the code exchange fails.
  async function finish(code, state) {
    const p = pending.get(state); pending.delete(state);
    if (!p || !code) return null;
    const d = await discover();
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, code_verifier: p.verifier });
    if (clientSecret) form.set('client_secret', clientSecret);
    const r = await fetchImpl(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
    if (!r.ok) return null;
    const tok = await r.json();
    if (!tok.access_token) return null;
    const sid = b64url(randomBytes(24));
    sessions.set(sid, { token: tok.access_token, exp: Date.now() + Math.min(Number(tok.expires_in) || 300, 3600) * 1000 });
    return sid;
  }

  const session = sid => { const s = sid && sessions.get(sid); return s && s.exp > Date.now() ? s : null; };
  const yoma = (s, path, init = {}) => fetchImpl(yomaBase + path, { ...init, headers: { accept: 'application/json', ...(init.headers || {}), authorization: `Bearer ${s.token}` } });

  async function me(sid) {
    const s = session(sid);
    if (!s) return { connected: false };
    const r = await yoma(s, '/user/skills');
    if (!r.ok) return { connected: false };
    const list = await r.json();
    const names = (Array.isArray(list) ? list : []).map(x => String(x.name || '')).filter(Boolean).slice(0, 60);
    return { connected: true, names, skills: [...new Set(names.flatMap(n => skillsFromText(n)))] };
  }

  // Saves real Yoma opportunities (ids "y-<uuid>") to the person's Yoma account. Returns how many were saved.
  async function save(sid, ids) {
    const s = session(sid);
    if (!s) return null;
    let saved = 0;
    for (const id of (ids || []).slice(0, 21)) {
      const m = /^y-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(String(id));
      if (!m) continue;
      const r = await yoma(s, `/myopportunity/action/${m[1]}/save`, { method: 'PUT' }).catch(() => null);
      if (r && r.ok) saved++;
    }
    return saved;
  }

  return { loginUrl, finish, me, save, end: sid => sessions.delete(sid) };
}

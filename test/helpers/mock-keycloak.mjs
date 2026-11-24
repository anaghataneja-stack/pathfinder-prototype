// In-process fake of Yoma's Keycloak: discovery, an authorize page that approves at once, and a PKCE token endpoint.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

export async function startMockKeycloak(state) {
  state.codes = new Map(); state.tokenRequests = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x'); let body = ''; for await (const c of req) body += c;
    const base = `http://127.0.0.1:${server.address().port}/realms/yoma`;
    if (url.pathname === '/realms/yoma/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ issuer: base, authorization_endpoint: base + '/protocol/openid-connect/auth', token_endpoint: base + '/protocol/openid-connect/token' }));
    }
    if (url.pathname === '/realms/yoma/protocol/openid-connect/auth') {
      state.lastAuth = Object.fromEntries(url.searchParams);
      const code = 'code-' + Math.random().toString(36).slice(2);
      state.codes.set(code, url.searchParams.get('code_challenge'));
      res.writeHead(302, { location: `${url.searchParams.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(url.searchParams.get('state'))}` });
      return res.end();
    }
    if (url.pathname === '/realms/yoma/protocol/openid-connect/token' && req.method === 'POST') {
      const f = Object.fromEntries(new URLSearchParams(body)); state.tokenRequests.push(f);
      const challenge = state.codes.get(f.code);
      const ok = challenge && createHash('sha256').update(f.code_verifier || '').digest('base64url') === challenge && f.client_id === 'pathfinder';
      if (!ok) { res.writeHead(400, { 'content-type': 'application/json' }); return res.end('{"error":"invalid_grant"}'); }
      state.codes.delete(f.code);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access_token: state.token || 'tok-123', expires_in: 300, token_type: 'Bearer' }));
    }
    res.writeHead(404).end();
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { issuer: `http://127.0.0.1:${server.address().port}/realms/yoma`, close: () => new Promise(r => server.close(r)) };
}

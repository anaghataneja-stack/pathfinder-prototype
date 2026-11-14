// Pathfinder server. No dependencies; needs Node 18+.
//   cp .env.example .env   (add Azure keys, optional)
//   node serve.mjs          -> http://localhost:4173
import { loadEnv } from './lib/env.mjs';
import { createSync } from './lib/sync.mjs';
import { createAI } from './lib/ai.mjs';
import { enrichListings } from './lib/ai-tasks.mjs';
import { createApp } from './lib/server.mjs';

loadEnv();
const env = process.env;
const log = m => console.log(`[${new Date().toISOString()}] ${m}`);
const ai = createAI(env);
const enrich = ai.features.chat && env.AI_ENRICH_LISTINGS !== 'false' ? ls => enrichListings(ai, ls) : null;
const sync = createSync({ dataDir: 'data', base: (env.YOMA_API_BASE || 'https://api.yoma.world/api/v3').replace(/\/+$/, ''), enrich, log });
const hour = Math.min(23, Math.max(0, Number(env.SYNC_HOUR ?? 5) || 0));
sync.schedule(hour);

const port = Number(env.PORT) || 4173;
const rateLimit = { max: Number(env.AI_RATE_LIMIT) || 60, windowMs: 10 * 60e3 };
createApp({ sync, ai, accessCode: env.PILOT_ACCESS_CODE || '', trustProxy: env.TRUST_PROXY === 'true', rateLimit, log }).listen(port, () => {
  log(`Pathfinder running at http://localhost:${port}`);
  log(`AI: ${ai.provider === 'none' ? 'off (keyword rules and templates)' : `${ai.provider}, voice ${ai.features.voice ? 'on' : 'off'}`}`);
  log(`Yoma: ${sync.get().source} copy loaded; daily sync at ${String(hour).padStart(2, '0')}:00`);
  if (env.PILOT_ACCESS_CODE) log('Access code required (PILOT_ACCESS_CODE is set)');
});

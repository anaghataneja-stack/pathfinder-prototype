// Run one Yoma sync now (for cron, or to refresh before a demo):  node sync.mjs
import { loadEnv } from './lib/env.mjs';
import { createSync } from './lib/sync.mjs';
import { createAI } from './lib/ai.mjs';
import { enrichListings } from './lib/ai-tasks.mjs';

loadEnv();
const ai = createAI(process.env);
const enrich = ai.features.chat && process.env.AI_ENRICH_LISTINGS !== 'false' ? ls => enrichListings(ai, ls) : null;
const sync = createSync({ dataDir: 'data', base: process.env.YOMA_API_BASE || 'https://api.yoma.world/api/v3', enrich, log: m => console.log(m) });
const r = await sync.run();
console.log(`${r.source}: ${r.opps.length} opportunities, ${r.courses.length} courses${r.changes ? `, ${r.changes.added} new, ${r.changes.removed} closed` : ''}${r.error ? ` (error: ${r.error})` : ''}`);
process.exit(r.source === 'live' ? 0 : 1);

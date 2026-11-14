// Pilot numbers from data/events.ndjson and data/cases.ndjson:  npm run pilot-report
import { createStore, summarise } from './lib/store.mjs';

const store = createStore('data');
const s = summarise(store.events());
const cases = store.listCases();
const line = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none';
console.log(`Pathfinder pilot report (${new Date().toISOString().slice(0, 10)})`);
console.log(`Events: ${s.total}`);
console.log(`  by type:     ${line(s.byType)}`);
console.log(`  by language: ${line(s.byLang)}`);
console.log(`  by age band: ${line(s.byAge)}`);
const built = s.byType.plan_built || 0, saved = s.byType.plan_saved || 0;
if (built) console.log(`  plans saved / built: ${saved}/${built} (${Math.round((saved / built) * 100)}%)`);
console.log(`Cases: ${cases.length} (open ${cases.filter(c => c.status === 'open').length}, urgent open ${cases.filter(c => c.status === 'open' && c.urgent).length}, reports ${cases.filter(c => c.kind === 'report').length})`);

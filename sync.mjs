// Daily Yoma sync with a saved copy on disk and a bundled sample as the last resort.
import { readFileSync, writeFileSync, renameSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchYoma, mapListing } from './yoma.mjs';

const SAMPLE = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sample-listings.json');
const DAY = 24 * 3600e3, RETRY = 3600e3;

function readJSON(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }
const valid = c => c && Array.isArray(c.opps) && c.opps.length > 0;

export function createSync({ dataDir, base, fetchImpl = fetch, enrich = null, now = () => Date.now(), samplePath = SAMPLE, log = () => {} }) {
  const cachePath = join(dataDir, 'yoma-cache.json');
  const loadSample = () => {
    const s = readJSON(samplePath) || { opps: [], courses: [] };
    return { source: 'sample', fetchedAt: null, changes: null, metrics: null, opps: s.opps, courses: s.courses || [] };
  };
  const mtime = () => { try { return statSync(cachePath).mtimeMs; } catch { return 0; } };
  const cached = readJSON(cachePath);
  let current = valid(cached) ? { ...cached, source: 'saved' } : loadSample();
  let loadedAt = valid(cached) ? mtime() : 0;
  // Pick up a copy written by another process (e.g. "node sync.mjs") without a restart.
  function get() {
    const m = mtime();
    if (m && m !== loadedAt) {
      const c = readJSON(cachePath);
      if (valid(c)) { current = { ...c, source: 'live' }; }
      loadedAt = m;
    }
    return current;
  }
  let lastRun = null, nextAt = null, timer = null;

  function save(cat) {
    try {
      mkdirSync(dataDir, { recursive: true });
      const tmp = cachePath + '.tmp';
      writeFileSync(tmp, JSON.stringify(cat));
      renameSync(tmp, cachePath);
      loadedAt = mtime();
    } catch (e) { log(`could not save Yoma cache: ${e.message}`); }
  }

  async function run() {
    lastRun = now();
    try {
      const { items, metrics } = await fetchYoma({ base, fetchImpl });
      if (!items.length) throw new Error('Yoma returned no listings');
      let mapped = items.map(mapListing);
      if (enrich) {
        try { mapped = await enrich(mapped); } catch (e) { log(`listing enrichment skipped: ${e.message}`); }
      }
      const opps = mapped.filter(l => l.kind === 'opp'), courses = mapped.filter(l => l.kind === 'course');
      let changes = null;
      if (current.source !== 'sample') {
        const before = new Set([...current.opps, ...current.courses].map(l => l.id));
        const after = new Set(mapped.map(l => l.id));
        changes = { added: [...after].filter(id => !before.has(id)).length, removed: [...before].filter(id => !after.has(id)).length };
      }
      current = { source: 'live', fetchedAt: new Date(now()).toISOString(), changes, metrics, opps, courses };
      save(current);
      log(`Yoma sync: ${opps.length} opportunities, ${courses.length} courses`);
    } catch (e) {
      current = { ...current, source: current.source === 'sample' ? 'sample' : 'saved', error: e.message };
      log(`Yoma sync failed, keeping ${current.source} copy: ${e.message}`);
    }
    return current;
  }

  function nextRunAt(hour) {
    const d = new Date(now()); d.setMinutes(0, 0, 0); d.setHours(hour);
    if (d.getTime() <= now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  // After a failure, try again in an hour; otherwise wait for the next daily slot.
  const delayAfter = (result, hour) => (result && result.error ? RETRY : nextRunAt(hour) - now());

  // Runs now if the copy is missing or older than a day, then every day at `hour`.
  function schedule(hour) {
    const plan = result => {
      const wait = delayAfter(result, hour);
      nextAt = now() + wait;
      timer = setTimeout(async () => plan(await run()), wait); timer.unref?.();
    };
    const age = current.fetchedAt ? now() - Date.parse(current.fetchedAt) : Infinity;
    if (current.source === 'sample' || age > DAY) run().then(plan); else plan(null);
  }

  return { get, run, schedule, nextRunAt, delayAfter, status: () => ({ lastRun, nextAt }), stop: () => clearTimeout(timer) };
}

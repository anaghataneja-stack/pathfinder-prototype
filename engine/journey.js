/* The connected journey (journey contract v1): Ziqi → PathFinder → SkillLens → YoCV → back to the Ziqi listing.
   A classic script with no DOM access (like plan-engine.js), loaded by pathfinder.html and tested in test/journey.test.mjs.
   Only used when the page is opened with ?journey=demo; without it PathFinder behaves as before. */
const JOURNEY_PHASE = 2;   // PathFinder is Phase 2 of 4
const JOURNEY_STEPS = ['Saved Opportunity', 'Learning Plan', 'Skill Credential', 'Job Application'];
// The contract's order for the link parameters. Anything else received is passed on, before `return`.
const JOURNEY_ORDER = ['journey', 'from', 'yoid', 'listing', 'goal', 'plan', 'course', 'credential', 'application'];
// Received parameters PathFinder never passes on: the pilot access code is PathFinder's own.
const JOURNEY_PRIVATE = ['code'];

// Only absolute http: and https: return URLs are followed; anything else is ignored. A valid one is passed on unchanged.
function journeyReturn(raw){
  if (!raw) return '';
  try { const u = new URL(String(raw)); return u.protocol === 'http:' || u.protocol === 'https:' ? String(raw) : ''; }
  catch { return ''; }
}

// The link to the next app: every parameter received, plus PathFinder's own (own values win).
// `received` is a URLSearchParams (or [key, value] pairs); `own` is {key: value}, empty values are skipped.
function journeyLink(base, received, own){
  const u = new URL(base);
  const got = new Map();
  for (const [k, v] of received) if (!JOURNEY_PRIVATE.includes(k) && !got.has(k)) got.set(k, v);
  for (const [k, v] of Object.entries(own || {})) if (v !== undefined && v !== null && v !== '') got.set(k, String(v));
  const ret = journeyReturn(got.get('return')); got.delete('return');
  const keys = [...JOURNEY_ORDER.filter(k => got.has(k)), ...[...got.keys()].filter(k => !JOURNEY_ORDER.includes(k))];
  for (const k of keys) u.searchParams.set(k, got.get(k));
  if (ret) u.searchParams.set('return', ret);
  return u.toString();
}

// The YoID thread for the app at phase `phase`: before it recorded, its own step in progress until done, later steps next.
function journeyThread(phase, done){
  return JOURNEY_STEPS.map((name, i) => ({name, state: i + 1 < phase || (i + 1 === phase && done) ? 'recorded' : i + 1 === phase ? 'in progress' : 'next'}));
}

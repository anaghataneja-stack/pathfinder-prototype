// The four AI jobs Pathfinder uses, each with output checks and a labelled fallback.
// Every function resolves (never throws) to an object with source: 'ai' | 'rules' | 'fallback'.
import { SKILLS, skillsFromText, sectorsFromText, matchOption } from './rules.mjs';
import { stripPII } from './privacy.mjs';

const LANG_NAME = { en: 'English', pcm: 'Nigerian Pidgin', ha: 'Hausa', yo: 'Yoruba' };
const langName = l => LANG_NAME[l] || 'English';
const skillList = () => Object.entries(SKILLS).map(([k, v]) => `${k}: ${v}`).join('\n');
const why = e => (/timeout/i.test(e.message) ? 'timeout' : /not configured/.test(e.message) ? 'ai_off' : 'ai_error');

// Fallback summaries (Hausa/Yoruba need native-speaker review).
const SUMMARY_T = {
  en: s => `Has hands-on experience in ${s}.`,
  pcm: s => `E get experience for ${s}.`,
  ha: s => `Yana da kwarewa a ${s}.`,
  yo: s => `Ó ní ìrírí nínú ${s}.`
};
const listLabels = keys => keys.map(k => SKILLS[k].toLowerCase()).join(', ');

export async function extractSkills(ai, { text, lang = 'en' }) {
  const clean = stripPII(text);
  const rules = () => {
    const skills = skillsFromText(clean);
    return { skills, summary: skills.length ? (SUMMARY_T[lang] || SUMMARY_T.en)(listLabels(skills)) : '' };
  };
  if (!ai.features.chat) return { ...rules(), source: 'fallback', why: 'ai_off' };
  try {
    const out = await ai.chat({
      system: `You help young people in Nigeria turn informal work they already do (trading, repairs, farming, cooking, hair, tailoring, driving, childcare, helping in a family business) into recognised skills.
Choose ONLY skill keys from this list that the text clearly supports (at most 6):
${skillList()}
Reply as JSON: {"skills": ["key", ...], "summary": "..."}.
The summary is one sentence of at most 30 words in ${langName(lang)}, written like a CV line, with no names, places or contact details, and no promises.
The person may write in English, Nigerian Pidgin, Hausa or Yoruba.`,
      user: clean
    });
    const skills = [...new Set((out.skills || []).filter(k => k in SKILLS))].slice(0, 6);
    let summary = String(out.summary || '').trim();
    if (summary.split(/\s+/).length > 30) summary = summary.split(/\s+/).slice(0, 30).join(' ') + '…';
    if (!skills.length) { const r = rules(); if (r.skills.length) return { ...r, source: 'fallback', why: 'ai_found_none' }; }
    if (PROMISE.test(summary)) summary = (SUMMARY_T[lang] || SUMMARY_T.en)(listLabels(skills));
    return { skills, summary: stripPII(summary, 300), source: 'ai' };
  } catch (e) {
    return { ...rules(), source: 'fallback', why: why(e) };
  }
}

// options: [{v, labels}]
export async function understand(ai, { text, question = '', options }) {
  const local = matchOption(text, options);
  if (local !== null) return { value: local, source: 'rules' };
  if (!ai.features.chat) return { value: null, source: 'fallback' };
  try {
    const out = await ai.chat({
      system: `A young person in Nigeria is answering a question in a chat, possibly in English, Nigerian Pidgin, Hausa or Yoruba.
Pick the ONE option their reply means, or null if it is unclear or unrelated. Reply as JSON: {"value": <option value or null>}.
Options (value: labels):
${options.map(o => `${JSON.stringify(o.v)}: ${o.labels.join(' / ')}`).join('\n')}`,
      user: `Question: ${stripPII(question, 300)}\nReply: ${stripPII(text, 300)}`,
      maxTokens: 30
    });
    const hit = options.find(o => o.v === out.value || String(o.v) === String(out.value));
    return { value: hit ? hit.v : null, source: 'ai' };
  } catch {
    return { value: null, source: 'fallback' };
  }
}

const PROMISE = /guarantee|will get (a|the|you)|promise|definitely|surely get|go surely|tabbas za ka samu|dájúdájú|da tabbas/i;

function checkReason(reason, facts) {
  const r = String(reason ?? '').trim();
  if (!r || r.split(/\s+/).length > 35 || PROMISE.test(r)) return null;
  const factText = JSON.stringify(facts ?? {});
  const nums = r.match(/\d+/g) || [];
  if (nums.some(n => !factText.includes(n))) return null;
  return r;
}

// steps: [{kind, title, facts}]; returns one reason or null per step.
export async function writeReasons(ai, { steps, lang = 'en' }) {
  const nulls = steps.map(() => null);
  if (!ai.features.chat) return { reasons: nulls, source: 'fallback', why: 'ai_off' };
  try {
    const out = await ai.chat({
      system: `You write the one-line "why this step" for a young person's 3-step plan (start, learn, apply).
Write in ${langName(lang)}. Each reason: one sentence, at most 30 words, friendly and plain.
Use ONLY the facts given for that step and what the person told us. Do not invent numbers, dates, names or pay. Never promise a job or result.
Reply as JSON: {"reasons": ["...", "...", "..."]} in the same order as the steps.`,
      user: JSON.stringify(steps.map(s => ({ kind: s.kind, title: s.title, facts: s.facts }))),
      timeout: 3500, retries: 0   // the page waits about 4 s for these, then uses templates
    });
    const list = Array.isArray(out.reasons) ? out.reasons : [];
    return { reasons: steps.map((s, i) => checkReason(list[i], { title: s.title, ...s.facts })), source: 'ai' };
  } catch (e) {
    return { reasons: nulls, source: 'fallback', why: why(e) };
  }
}

// Orders candidate courses by how well they prepare someone for the openings in their plan.
// The AI only orders known ids; it writes nothing the person sees, so it is allowed for under-18s too.
export async function rankCourses(ai, { goal = '', sector = '', targets = [], candidates = [] }) {
  if (!ai.features.chat || candidates.length < 2) return { ids: [], source: 'fallback' };
  try {
    const out = await ai.chat({
      system: `You help match young people in Nigeria with courses. Order the candidate courses from most to least useful for getting the target openings.
Leave out courses that don't help. Reply as JSON: {"ids": ["id", ...]} using only the given ids.`,
      user: JSON.stringify({ goal, sector, targets: targets.slice(0, 6), candidates: candidates.slice(0, 12) }),
      timeout: 3500, retries: 0, maxTokens: 200
    });
    const known = new Set(candidates.map(c => c.id));
    return { ids: [...new Set((out.ids || []).map(String).filter(id => known.has(id)))], source: 'ai' };
  } catch (e) {
    return { ids: [], source: 'fallback', why: why(e) };
  }
}

const SECTORS = ['digital', 'customer', 'agri', 'fashion', 'all'];

export async function enrichListings(ai, listings, batchSize = 20) {
  if (!ai.features.chat) return listings;
  const out = listings.map(l => ({ ...l }));
  for (let i = 0; i < out.length; i += batchSize) {
    const batch = out.slice(i, i + batchSize);
    try {
      const res = await ai.chat({
        system: `Tag each youth opportunity with the skills it needs or teaches (1 to 4 keys from the list) and its sectors (from: ${SECTORS.join(', ')}).
Skills:
${skillList()}
Reply as JSON: {"items": [{"id": "...", "skills": [...], "sectors": [...]}]}.`,
        user: JSON.stringify(batch.map(l => ({ id: l.id, title: l.title, org: l.org, type: l.type || 'course' }))),
        maxTokens: 1500
      });
      for (const item of res.items || []) {
        const l = batch.find(b => b.id === item.id); if (!l) continue;
        const skills = [...new Set((item.skills || []).filter(k => k in SKILLS))].slice(0, 4);
        const sectors = [...new Set((item.sectors || []).filter(s => SECTORS.includes(s)))];
        if (skills.length) { l.skills = skills; l.sectors = sectors.length ? sectors : sectorsFromText(l.title); l.tagged = 'ai'; }
      }
    } catch { /* keep rule tags for this batch */ }
  }
  return out;
}

// Speech-to-text models often "hear" these in silence or noise.
const FILLER = new Set(['', 'you', 'thank you', 'thanks', 'thank you for watching', 'thanks for watching', 'bye', 'okay', 'ok',
  'subtitles by the amara org community', 'music']);
const isFiller = t => FILLER.has(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim());

export async function transcribeNote(ai, { buffer, mime, lang = 'en' }) {
  if (!ai.features.voice) return { text: '', source: 'fallback', why: 'voice_off' };
  try {
    const text = stripPII((await ai.transcribe(buffer, mime, lang)).trim(), 600);
    if (!text.trim() || isFiller(text)) return { text: '', source: 'fallback', why: 'empty' };
    return { text, source: 'ai' };
  } catch (e) {
    return { text: '', source: 'fallback', why: why(e) };
  }
}

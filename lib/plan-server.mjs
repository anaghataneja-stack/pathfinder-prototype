// Builds plans on the server with the same engine the web app uses (engine/plan-engine.js), for RapidPro/WhatsApp.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { skillsFromText } from './rules.mjs';
import { stripPII } from './privacy.mjs';

const ENGINE = new vm.Script(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', 'plan-engine.js'), 'utf8'), { filename: 'plan-engine.js' });
const TITLES = { applyTitleBest: 'Apply to one or more of these', applyTitleNow: 'Apply now: you already have the skills',
  applyTitleLater: 'Apply after your courses', applyTitleEarn: 'Earn while you learn' };

// Answers from a chat flow may arrive as menu numbers ("2") or words ("job"). Both are accepted.
const pick = (v, list, dflt) => { const s = String(v ?? '').trim().toLowerCase(); if (list.includes(s)) return s; const n = Number(s); return Number.isInteger(n) && n >= 1 && n <= list.length ? list[n - 1] : dflt; };
export function normalise(b) {
  const age = Number(String(b.age ?? '').replace(/\D/g, '')) || null;
  const hoursIdx = pick(b.hours, ['1', '2', '3', '4'], null);
  const hours = [2, 4, 8, 12].includes(Number(b.hours)) ? Number(b.hours) : hoursIdx ? [2, 4, 8, 12][Number(hoursIdx) - 1] : 4;
  const size = [3, 5, 7].includes(Number(b.size)) ? Number(b.size) : ({ 1: 3, 2: 5, 3: 7 })[Number(b.size)] || 3;
  return {
    lang: pick(b.lang, ['en', 'pcm', 'ha', 'yo'], 'en'), age,
    a: { goal: pick(b.goal, ['job', 'earn', 'skills', 'business', 'notsure'], 'job'), sector: pick(b.sector, ['digital', 'customer', 'agri', 'fashion', 'notsure'], 'notsure'),
      state: pick(b.state, ['lagos', 'kano', 'fct', 'oyo', 'rivers', 'other', 'online'], 'other'), hours, data: pick(b.data, ['low', 'some', 'plenty'], 'some'), size },
    skills: [...new Set([...skillsFromText(stripPII(b.work || '')), ...String(b.skills || '').split(',').map(s => s.trim()).filter(Boolean)])]
  };
}

export function buildPlan({ answers, catalogue, today = Date.now() }) {
  const S = { a: answers.a, age: answers.age, swap: {}, reported: [], doneIds: [], journey: null, aiRank: null, plan: null, calc: null };
  const day = new Date(today);
  const ctx = vm.createContext({ S, TODAY: Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
    held: () => new Set(answers.skills), catalogue: () => ({ opps: catalogue.opps, courses: catalogue.courses }), liveOn: () => true, t: k => TITLES[k] || k });
  ENGINE.runInContext(ctx);
  vm.runInContext('compute()', ctx);
  return S.plan;
}

const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const TAG = { start: 'Start here', learn: 'Learn here', apply: 'Apply here' };
export function stepText(st, i) {
  if (st.kind === 'apply') return `*${i + 1}. ${st.item.title}*\n` + st.items.map((o, j) => `   ${'abc'[j]}) ${o.title}, ${o.org}${o.deadline ? ` (closes ${fmtDate(o.deadline)})` : ''}${o.link ? `\n      ${o.link}` : ''}`).join('\n');
  return `*${i + 1}. ${TAG[st.kind]}:* ${st.item.title} (${st.item.src}${st.item.hours ? `, ${st.item.hours} hrs` : ''})${st.item.link ? `\n   ${st.item.link}` : ''}`;
}
export function handoffCourse(plan) {
  const steps = plan.steps.filter(s => s.kind !== 'apply' && !s.item.pseudo);
  return (steps.find(s => s.item.p2e) || steps[0] || {}).item || null;
}
export function planMessage(plan) {
  const lines = plan.steps.map(stepText);
  let msg = `*Your Pathfinder plan* (${plan.steps.length} steps)\n\n${lines.join('\n\n')}\n\n⚠️ Never pay to apply. Real openings are free. If anyone asks for money, reply REPORT.`;
  if (msg.length > 4000) msg = msg.slice(0, 3990) + '…';
  return msg;
}

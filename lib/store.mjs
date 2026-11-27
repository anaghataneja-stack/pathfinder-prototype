// Pilot records, kept as append-only files in data/ (one JSON object per line).
//   cases.ndjson  facilitator handoffs and listing reports, so they reach a person
//   events.ndjson anonymous counts for measuring the pilot (no ids, no text, age band only)
import { appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no I, O, 0, 1: easy to read out on a call
export const ageBand = age => (Number(age) >= 15 && Number(age) <= 17 ? '15-17' : Number(age) >= 18 && Number(age) <= 24 ? '18-24' : 'other');

export function createStore(dir) {
  mkdirSync(dir, { recursive: true });
  const file = name => join(dir, name);
  const append = (name, obj) => appendFileSync(file(name), JSON.stringify(obj) + '\n');
  const readAll = name => { try { return readFileSync(file(name), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };

  function addCase(c) {
    const caseId = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    append('cases.ndjson', { caseId, at: new Date().toISOString(), status: 'open', ...c });
    return caseId;
  }
  function listCases() {
    const byId = new Map();
    for (const row of readAll('cases.ndjson')) {
      if (row.update) { const c = byId.get(row.caseId); if (c) Object.assign(c, { status: row.status, updatedAt: row.at }); }
      else byId.set(row.caseId, row);
    }
    const rank = c => (c.status === 'open' ? (c.urgent ? 0 : 1) : 2);
    return [...byId.values()].sort((a, b) => rank(a) - rank(b) || b.at.localeCompare(a.at));
  }
  function markDone(caseId) {
    if (!listCases().some(c => c.caseId === caseId)) return false;
    append('cases.ndjson', { update: true, caseId, status: 'contacted', at: new Date().toISOString() });
    return true;
  }
  // WhatsApp plans: kept so weekly check-ins can follow them (fixed values only; no names or numbers)
  function addPlan(p) {
    const planId = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    append('plans.ndjson', { planId, at: new Date().toISOString(), current: 0, stalls: 0, ...p });
    return planId;
  }
  function getPlan(planId) {
    let plan = null;
    for (const row of readAll('plans.ndjson')) if (row.planId === planId) plan = row.update ? { ...plan, ...row, update: undefined } : row;
    return plan;
  }
  const updatePlan = (planId, patch) => append('plans.ndjson', { update: true, planId, at: new Date().toISOString(), ...patch });
  const addEvent = e => append('events.ndjson', { ...e, d: new Date().toISOString().slice(0, 10) });
  return { addCase, listCases, markDone, addEvent, addPlan, getPlan, updatePlan, events: () => readAll('events.ndjson') };
}

export function summarise(events) {
  const count = key => events.reduce((a, e) => ((a[e[key]] = (a[e[key]] || 0) + 1), a), {});
  return { total: events.length, byType: count('type'), byLang: count('lang'), byAge: count('age'), byDay: count('d') };
}

// Public Yoma API (v3): fetch published opportunities for Nigeria + Worldwide and map them to Pathfinder listings.
import { skillsFromText, sectorsFromText, isScam } from './rules.mjs';

// "Other" on Yoma covers scholarships, programmes and competitions: not something that earns money now.
const TYPE_MAP = { Job: 'job', Task: 'task', Event: 'volunteer', Other: 'other' };

async function getJSON(fetchImpl, url, body, timeoutMs) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, body
      ? { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), signal: ctl.signal }
      : { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`Yoma ${res.status} on ${url.split('/api/v3')[1] || url}`);
    return await res.json();
  } finally { clearTimeout(timer); }
}

// Yoma accepts up to 1,000 per page; 500 keeps each response moderate. 20 pages = up to 10,000 listings.
export async function fetchYoma({ base, fetchImpl = fetch, pageSize = 500, maxPages = 20, timeoutMs = 30000 }) {
  const countries = await getJSON(fetchImpl, `${base}/opportunity/search/filter/country`, null, timeoutMs);
  const ids = countries.filter(c => c.codeAlpha2 === 'NG' || c.codeAlpha2 === 'WW').map(c => c.id);
  const metrics = await getJSON(fetchImpl, `${base}/analytics/platform/metrics/info`, null, timeoutMs).catch(() => null);
  const items = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await getJSON(fetchImpl, `${base}/opportunity/search`, { pageNumber: page, pageSize, countries: ids.length ? ids : null }, timeoutMs);
    const got = r.items || [];
    items.push(...got);
    if (got.length < pageSize) break;
  }
  return { items: items.filter(x => !x.hidden), countries, metrics };
}

const names = a => (a || []).map(v => v.name).join(' | ');

// Jobberman titles end with the place: "Baking Assistant in Lagos [NG:1276472]", "… in Remote (Work From Home)".
const PLACES = [
  [/remote|work from home/i, 'remote'], [/lagos/i, 'lagos'], [/abuja|\bfct\b/i, 'fct'], [/kano/i, 'kano'],
  [/ibadan|\boyo\b/i, 'oyo'], [/port harcourt|rivers/i, 'rivers'], [/rest of nigeria/i, 'other'], [/^nigeria$/i, 'all']
];
export function placeOf(title) {
  const m = String(title || '').match(/\sin\s+([^[\]]+?)\s*(?:\[[^\]]*\])?\s*$/i);
  if (!m) return null;
  const where = m[1].trim();
  for (const [re, key] of PLACES) if (re.test(where)) return key;
  return 'other';
}

export function mapListing(x) {
  // Skills come from the listing itself; Yoma's broad category names ("Career and Personal Development")
  // would tag hundreds of unrelated courses, so categories only set the sector.
  const text = [x.title, x.summary, names(x.skills), (x.keywords || []).join(' ')].join(' | ');
  let skills = skillsFromText(text, 4);
  const place = x.engagementType ? null : placeOf(x.title);
  const online = x.engagementType ? x.engagementType === 'Online' : (place === null || place === 'remote');
  if (!skills.length) skills = [online ? 'digital-basics' : 'comms'];
  const sectors = sectorsFromText(text + ' | ' + names(x.categories));
  if (/career|personal development|entrepreneur/i.test(names(x.categories)) && !sectors.includes('all')) sectors.push('all');
  const deadline = x.dateEnd ? String(x.dateEnd).slice(0, 10) : null;
  const zlto = Number(x.zltoReward) || 0;
  const noCert = !/advanced|intermediate/i.test(x.difficulty || '');
  // Passport to Earning publishes some of its courses on Yoma (organisation "P2E (GenU)").
  const p2e = /^P2E\b|passport to earning/i.test(x.organizationName || '');
  // Some listings are for organisations (grants, partner webinars, SME programmes) or for one other country.
  const forOrgs = /grant alert|become a (yoma )?partner|\bfor (nigerian )?(smes|organi[sz]ations|ngos|hubs|businesses)\b/i.test(x.title || '');
  const country = /^\W*(?:opportunity \d+:\s*)?\[([a-z ]+)\]/i.exec(x.title || '');
  const otherCountry = !!country && !/^(nigeria|africa|global|worldwide)$/i.test(country[1].trim());
  const base = {
    id: 'y-' + x.id, title: x.title, org: x.organizationName, src: p2e ? 'Passport to Earning' : 'Yoma', p2e, forOrgs, otherCountry, live: true, skills, sectors, tagged: 'rules',
    link: /^https:\/\/[^\s"'<>]+$/i.test(x.yomaInfoURL || '') ? x.yomaInfoURL : `https://yoma.world/opportunities/${encodeURIComponent(x.id)}`, zlto, commitment: x.commitmentIntervalDescription || null,
    scam: isScam([x.title, x.summary, x.description, x.instructions].join(' ')), deadline
  };
  if (x.type === 'Learning') {
    const hrs = Number(x.commitmentIntervalTotalHours) || 4;
    return { ...base, kind: 'course', hours: Math.max(1, Math.min(hrs, 40)), entry: noCert, data: online ? 2 : 1, offline: !online };
  }
  const type = TYPE_MAP[x.type] || 'task';
  const states = online ? [] : [place && place !== 'remote' ? place : 'all'];
  const adultOnly = type === 'job' || /\bNYSC\b|corps member|undergraduate|graduates?\b/i.test(x.title || '');
  return { ...base, kind: 'opp', type, remote: online, states, minAge: adultOnly ? 18 : 15, openEnded: !deadline,
    informal: { earnNow: x.type === 'Task' || zlto > 0, phoneOnly: online, noCert } };
}

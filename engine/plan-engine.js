/* PathFinder plan engine: shared by the web app (pathfinder.html) and the server (RapidPro/WhatsApp webhook).
   A classic script with no DOM access. It reads these from its host:
     S (answers, age, swap, reported, doneIds, journey, aiRank; it writes S.calc and S.plan),
     held(), catalogue(), liveOn(), TODAY and t(key).
   The browser defines them in pathfinder.html; lib/plan-server.mjs defines them for each WhatsApp request. */
const parseD = s => { const [y,m,d] = s.split('-').map(Number); return Date.UTC(y, m-1, d); };
const hasDeadline = o => o.deadline && o.deadline !== 'ongoing';

const SK = {
  'digital-basics':'Using a phone & computer','online-safety':'Staying safe online','job-search':'Finding & applying for jobs',
  comms:'Clear communication',customer:'Serving customers',spreadsheets:'Spreadsheets & data entry','social-media':'Social media marketing',
  cv:'Writing a CV',interview:'Interview skills',teamwork:'Working in a team',bookkeeping:'Basic bookkeeping',
  'business-plan':'Business planning',pricing:'Pricing & selling','agri-practice':'Modern farming practices',poultry:'Poultry care',
  tailoring:'Sewing & tailoring','design-basics':'Graphic design basics','coding-basics':'Coding basics',
  'phone-repair':'Phone & electronics repair','market-trading':'Market trading & stock','food-prep':'Cooking & food selling',
  'hair-beauty':'Hair & beauty','driving-delivery':'Driving & delivery',childcare:'Caring for children'
};

const PROFILE_STEP = {id:'p1',title:'Complete your Yoma profile',src:'Yoma',kind:'course',skills:[],hours:1,pseudo:true,sectors:['all'],data:1};

const GOAL_TYPES = {earn:['task','self','apprenticeship','job'],job:['job','learnership','apprenticeship','self'],skills:['learnership','volunteer','task','apprenticeship'],business:['challenge','self','apprenticeship'],notsure:['task','learnership','volunteer','challenge']};

function oppBlock(o){
  const a = S.a;
  if (S.reported.includes(o.id)) return 'Reported by the user';
  if ((S.doneIds || []).includes(o.id)) return 'Applied to in an earlier plan';
  if (o.forOrgs) return 'For organisations, not individuals';
  if (o.otherCountry) return 'For another country';
  if (o.scam) return 'Asks for a fee or payment, flagged for review';
  if (o.deadline === 'ongoing' || (!o.deadline && !o.openEnded)) return 'No clear deadline ("ongoing")';
  if (o.linkBroken) return 'Application link broken';
  if (hasDeadline(o) && parseD(o.deadline) < TODAY) return 'Deadline passed';
  if (S.age < o.minAge) return `Needs age ${o.minAge}+`;
  const st = o.states || [];
  const okLoc = a.state === 'online' ? !!o.remote : (o.remote || st.includes('all') || st.includes(a.state));
  if (!okLoc) return a.state === 'online' ? 'In person only' : 'Outside your state';
  return null;
}
function courseBlock(c){
  if (S.reported.includes(c.id)) return 'Reported by the user';
  if ((S.doneIds || []).includes(c.id)) return 'Finished in an earlier plan';
  if (c.expired || (c.deadline && parseD(c.deadline) < TODAY)) return 'Course closed (expired)';
  if (S.a.data === 'low' && c.data === 3 && !c.offline) return 'Video-heavy, over data budget';
  return null;
}

/* ---------- Plans: 3, 5 or 7 steps; Apply steps hold several openings ----------
   Start (1) + Learn (1-3) + Apply (1-3). Each Apply step lists up to 3 openings from different employers,
   so one rejection doesn't end the plan. Courses are chosen to cover the skills the whole set of openings
   asks for, weighted by how many openings need each skill. */
const PLAN_SHAPES = {3: {learn: 1, apply: ['best']}, 5: {learn: 2, apply: ['now', 'later']}, 7: {learn: 3, apply: ['now', 'later', 'earn']}};
const PER_GROUP = 3;
const STOPWORDS = new Set(['with','your','from','into','skills','skill','course','introduction','basic','basics','work','working','assistant','officer','become','learn','master','nigeria','lagos','abuja','remote','home','state','junior','senior','level','entry']);
const words = s => new Set(String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOPWORDS.has(w)));
const hasKey = (o, ids) => ids.includes(o.id);

function compute(){
  const a = S.a, have = held(), excluded = [], CAT = catalogue();
  const pin = S.journey && S.journey.listing;
  if (pin && !CAT.opps.some(o => o.id === pin.id)) CAT.opps = [pin, ...CAT.opps];
  if (S.journey && S.journey.course && !CAT.courses.some(c => c.id === S.journey.course.id)) CAT.courses = [S.journey.course, ...CAT.courses];
  const courses = CAT.courses.filter(c => { const r = courseBlock(c); if (r) excluded.push({name:c.title, src:c.src, why:r}); return !r; });
  const teachable = new Set(courses.flatMap(c => c.skills));
  // The verified opportunity from Phase 1 stays in the plan (only scam and age checks apply to it)
  const block = o => pin && o.id === pin.id ? (o.scam ? 'Asks for a fee or payment' : S.age < o.minAge ? `Needs age ${o.minAge}+` : null) : oppBlock(o);
  const opps = CAT.opps.filter(o => { const r = block(o); if (r) excluded.push({name:o.title, src:o.src, why:r}); return !r; })
    .map(o => {
      const pref = GOAL_TYPES[a.goal], ti = pref.indexOf(o.type);
      let s = ti >= 0 ? 4 - ti * .5 : -2;
      if (a.goal === 'earn' && o.informal && o.informal.earnNow) s += 1.5;
      if (a.sector !== 'notsure') s += o.sectors.includes(a.sector) ? 4 : o.sectors.includes('all') ? 1 : -3;
      else if (o.sectors.includes('all')) s += 1;
      const st = o.states || [];
      if (st.includes(a.state)) s += 2; else if (st.includes('all')) s += 1.5; else if (o.remote) s += a.data === 'low' ? 0 : 1;
      const gap = o.skills.filter(k => !have.has(k));
      s += (o.skills.length - gap.length) - gap.length * .5;
      s -= gap.filter(k => !teachable.has(k)).length * 1.5;
      if (pin && o.id === pin.id) s += 100;
      return {o, score: Math.round(s * 10) / 10};
    }).sort((x, y) => y.score - x.score);
  S.calc = {courses, opps, excluded, considered: CAT.courses.length + CAT.opps.length, live: liveOn()};
  if (!opps.length) { S.plan = null; return; }
  S.swap = {};
  buildPlan();
}

// Prefer different employers: one per organisation first, then the rest.
function diversify(list){
  const seen = new Set(), first = [], rest = [];
  for (const x of list) { const k = x.o.org || x.o.id; (seen.has(k) ? rest : first).push(x); seen.add(k); }
  return [...first, ...rest];
}
const MIN_FIT = 2;   // openings below this fit score only fill a group when nothing better is left
function groupCandidates(group, used, gapOf){
  const free = S.calc.opps.filter(x => !used.has(x.o.id)), good = free.filter(x => x.score >= MIN_FIT);
  // Career groups keep to the kinds of opening the goal asks for (a job goal gets jobs, apprenticeships…), when there are enough
  const pref = GOAL_TYPES[S.a.goal] || [], onGoal = good.filter(x => pref.includes(x.o.type));
  const all = group !== 'earn' && onGoal.length >= PER_GROUP ? onGoal : good.length >= PER_GROUP ? good : free;
  if (group === 'now') {
    const ready = all.filter(x => !gapOf(x.o).length);
    return diversify(ready.length ? ready : [...all].sort((p, q) => gapOf(p.o).length - gapOf(q.o).length || q.score - p.score));
  }
  if (group === 'later') { const need = all.filter(x => gapOf(x.o).length); return diversify(need.length ? need : all); }
  if (group === 'earn') {
    const earn = all.filter(x => (x.o.informal && x.o.informal.earnNow) || x.o.type === 'task' || x.o.type === 'self');
    return diversify(earn.length ? earn : all);
  }
  return diversify(all);
}
function buildPlan(){
  const a = S.a, have = held(), c = S.calc, shape = PLAN_SHAPES[a.size] || PLAN_SHAPES[3], sw = S.swap || {};
  const gapOf = o => o.skills.filter(k => !have.has(k));
  const scoreOf = new Map(c.opps.map(x => [x.o.id, x.score]));
  const used = new Set();
  const pinX = S.journey && S.journey.listing && c.opps.find(x => x.o.id === S.journey.listing.id);
  if (pinX) used.add(pinX.o.id);
  let pinned = false;
  // 1. Apply steps (the verified opportunity from Phase 1 leads the first career group)
  const applySteps = [];
  shape.apply.forEach((group, gi) => {
    const cands = groupCandidates(group, used, gapOf), off = (sw['apply' + gi] || 0) * PER_GROUP;
    const lead = pinX && !pinned && (group === 'best' || group === 'later');
    const items = (lead ? [pinX, ...cands.slice(off, off + PER_GROUP - 1)] : cands.slice(off, off + PER_GROUP)).map(x => x.o);
    if (lead) pinned = true;
    if (!items.length) return;
    items.forEach(o => used.add(o.id));
    applySteps.push({kind:'apply', group, items, more: cands.length > off + PER_GROUP, status:'todo', applied:0,
      item: {id: 'g:' + items.map(o => o.id).join(','), title: t({best:'applyTitleBest', now:'applyTitleNow', later:'applyTitleLater', earn:'applyTitleEarn'}[group])}});
  });
  if (!applySteps.length) { S.plan = null; return; }
  // 2. Skills the career openings ask for that the person doesn't have yet, weighted by how many need them
  //    ("earn now" tasks and openings they can already apply to don't drive the courses)
  const targets = applySteps.filter(s => s.group === 'later' || s.group === 'best').flatMap(s => s.items);
  const tgt = targets.length ? targets : applySteps.flatMap(s => s.items);
  const need = {};
  tgt.forEach(o => gapOf(o).forEach(k => { need[k] = (need[k] || 0) + 1; }));
  const tWords = new Set(tgt.flatMap(o => [...words(o.title), ...o.skills.flatMap(k => [...words(SK[k])])]));
  const aiBonus = id => { const i = (S.aiRank && S.aiRank.ids || []).indexOf(id); return i < 0 ? 0 : Math.max(0, 3 - i * .5); };
  const overlap = x => [...words(x.title)].filter(w => tWords.has(w)).length;
  const relevant = x => x.skills.some(k => need[k]) || overlap(x) > 0 || (a.sector !== 'notsure' && x.sectors.includes(a.sector));
  const onTarget = x => x.skills.some(k => need[k]) || overlap(x) > 0;   // matches the openings, not just the sector
  const covered = new Set();
  // 3. Start Here is meant to be a Passport to Earning course: reserve a relevant real one first
  let start = null;
  if (!(sw.start > 0)) {
    const p2e = c.courses.filter(x => x.p2e && x.entry && !used.has(x.id) && (onTarget(x) || (S.journey && S.journey.course && x.id === S.journey.course.id)))
      .sort((p, q) => (S.journey && S.journey.course ? (q.id === S.journey.course.id) - (p.id === S.journey.course.id) : 0) || q.skills.filter(k => need[k]).length - p.skills.filter(k => need[k]).length || overlap(q) - overlap(p) || p.hours - q.hours)[0];
    if (p2e) { used.add(p2e.id); p2e.skills.forEach(k => { if (need[k]) covered.add(k); }); start = {kind:'start', item: p2e, more: true, status:'todo'}; }
  }
  // 4. Learn steps: greedy cover of the weighted gap
  const learnSteps = [];
  for (let i = 0; i < shape.learn; i++) {
    const scored = c.courses.filter(x => !used.has(x.id)).map(x => {
      const cov = x.skills.filter(k => need[k] && !covered.has(k));
      if (!cov.length) return null;
      let s = cov.reduce((t, k) => t + need[k], 0) * 3;
      s += Math.min(2, overlap(x));
      if (x.sectors.includes(a.sector)) s += 1;
      if (x.p2e) s += 1;
      s += x.hours <= a.hours * 3 ? 1 : -1;
      if (a.data === 'low' && x.data > 1) s -= 1;
      s += aiBonus(x.id);
      return {c: x, cov, score: s};
    }).filter(Boolean).sort((p, q) => q.score - p.score || p.c.hours - q.c.hours);
    const off = sw['learn' + i] || 0, pick = scored[off];
    if (!pick) break;
    used.add(pick.c.id); pick.cov.forEach(k => covered.add(k));
    learnSteps.push({kind:'learn', item: pick.c, cov: pick.cov, more: scored.length > off + 1, status:'todo'});
  }
  // Spare Learn slots: job-ready skills (CV, interviews, finding work) help with every application
  const JOB_READY = ['cv', 'interview', 'job-search', 'comms'];
  while (learnSteps.length < shape.learn) {
    const extra = c.courses.filter(x => !used.has(x.id) && x.skills.some(k => JOB_READY.includes(k) && !have.has(k)))
      .sort((p, q) => (q.p2e ? 1 : 0) - (p.p2e ? 1 : 0) || p.hours - q.hours)[0];
    if (!extra) break;
    used.add(extra.id);
    learnSteps.push({kind:'learn', item: extra, cov: [], extra: extra.skills.filter(k => JOB_READY.includes(k) && !have.has(k)), more: false, status:'todo'});
  }
  if (!learnSteps.length) {
    const r = PROFILE_STEP; used.add(r.id);
    learnSteps.push({kind:'learn', item: r, cov: [], ready: true, more: false, status:'todo'});
  }
  // 5. Otherwise the Start step is an entry-level course, ideally a prerequisite of a Learn step, related to the goal
  const prereqs = learnSteps.map(s => s.item.prereq).filter(k => k && !have.has(k));
  const startList = c.courses.filter(x => x.entry && !used.has(x.id) && !(x.skills.length && x.skills.every(k => have.has(k)))).map(x => {
    let s = 0; const pre = x.skills.some(k => prereqs.includes(k));
    if (pre) s += 5;
    s += x.skills.filter(k => need[k] && !covered.has(k)).length * 2;
    if (x.sectors.includes(a.sector)) s += 2; else if (x.sectors.includes('all')) s += 1;
    s += x.hours <= a.hours * 3 ? 2 : -1;
    if (x.p2e) s += 3;   // Start Here is meant to be a Passport to Earning course; prefer the real ones on Yoma
    s += Math.min(2, overlap(x));
    if (!pre && !relevant(x)) s -= 3;   // a short course that has nothing to do with the goal is not a good start
    if (a.data === 'low' && x.data > 1) s -= 1;
    return {c: x, score: s, pre};
  }).sort((p, q) => q.score - p.score || p.c.hours - q.c.hours);
  if (!learnSteps.some(s => s.item.pseudo)) startList.push({c: PROFILE_STEP, score: -9, profile: true});
  if (!start) {
    const off = Math.max(0, (sw.start || 0) - (sw.start > 0 ? 1 : 0)), st0 = startList[Math.min(off, startList.length - 1)];
    start = {kind:'start', item: st0.c, pre: st0.pre, profile: st0.profile, more: startList.length > off + 1, status:'todo'};
  }
  const old = S.plan;
  const top = applySteps[0].items[0];
  S.plan = {steps: [start, ...learnSteps, ...applySteps], need, covered: [...covered], targets: tgt, weak: (scoreOf.get(top.id) ?? 0) < 5};
  if (old && S.saved) S.plan.steps.forEach(st => { const o = old.steps.find(x => x.item.id === st.item.id); if (o) { st.status = o.status; st.applied = o.applied; } });
}

// Builds flows/pathfinder-rapidpro.json: a RapidPro (flow spec 13) export with two flows and keyword triggers.
//   node flows/build-flow.mjs
// Import in RapidPro: Settings → Import. Then create two globals: pathfinder_url (e.g. https://pathfinder.example.org)
// and pathfinder_token (the server's RAPIDPRO_TOKEN). Not yet tried on a live RapidPro workspace: test in the sandbox.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const uuid = seed => { const h = createHash('sha1').update('pathfinder:' + seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

const KEYCAP = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function flowBuilder(name) {
  const nodes = [], ui = {}; let y = 0;
  const place = (n, type) => { ui[n.uuid] = { position: { left: 0, top: (y += 180) }, type }; nodes.push(n); return n; };
  const say = (id, text, quick = []) => place({ uuid: uuid(name + id), actions: [{ type: 'send_msg', uuid: uuid(name + id + 'msg'), text, quick_replies: quick }], exits: [{ uuid: uuid(name + id + 'exit'), destination_uuid: null }] }, 'execute_actions');
  // A menu question: send, wait, route each option (by number or word) to a category named after its value.
  function menu(id, text, options, resultName) {
    // Numbered like FunDoo's menus (1️⃣ 2️⃣ 3️⃣); a reply of the number or a keyword both work.
    const s = say(id, text + '\n\n' + options.map((o, i) => `${KEYCAP[i] || i + 1 + '.'} ${o.label}`).join('\n'), options.map(o => o.label));
    const cats = options.map(o => ({ uuid: uuid(name + id + 'cat' + o.value), name: o.value, exit_uuid: uuid(name + id + 'ex' + o.value) }));
    const other = { uuid: uuid(name + id + 'cat-other'), name: 'Other', exit_uuid: uuid(name + id + 'ex-other') };
    const w = place({ uuid: uuid(name + id + 'wait'), actions: [], router: { type: 'switch', operand: '@input.text', result_name: resultName, wait: { type: 'msg' },
      default_category_uuid: other.uuid, categories: [...cats, other],
      cases: options.map((o, i) => ({ uuid: uuid(name + id + 'case' + o.value), type: 'has_any_word', arguments: [`${i + 1} ${o.words || o.value}`], category_uuid: cats[i].uuid })) },
      exits: [...cats.map(c => ({ uuid: c.exit_uuid, destination_uuid: null })), { uuid: other.exit_uuid, destination_uuid: s.uuid }] }, 'wait_for_response');
    s.exits[0].destination_uuid = w.uuid;
    return { first: s, wait: w, then(dest) { w.exits.filter(e => e.uuid !== other.exit_uuid).forEach(e => { e.destination_uuid = dest.uuid; }); return dest; } };
  }
  function freeText(id, text, resultName) {
    const s = say(id, text);
    const all = { uuid: uuid(name + id + 'cat-all'), name: 'All Responses', exit_uuid: uuid(name + id + 'ex-all') };
    const w = place({ uuid: uuid(name + id + 'wait'), actions: [], router: { type: 'switch', operand: '@input.text', result_name: resultName, wait: { type: 'msg' }, default_category_uuid: all.uuid, categories: [all], cases: [] },
      exits: [{ uuid: all.exit_uuid, destination_uuid: null }] }, 'wait_for_response');
    s.exits[0].destination_uuid = w.uuid;
    return { first: s, wait: w, then(dest) { w.exits[0].destination_uuid = dest.uuid; return dest; } };
  }
  function webhook(id, path, body, resultName) {
    const ok = { uuid: uuid(name + id + 'ok'), name: 'Success', exit_uuid: uuid(name + id + 'ex-ok') };
    const fail = { uuid: uuid(name + id + 'fail'), name: 'Failure', exit_uuid: uuid(name + id + 'ex-fail') };
    const n = place({ uuid: uuid(name + id), actions: [{ type: 'call_webhook', uuid: uuid(name + id + 'act'), method: 'POST', url: `@globals.pathfinder_url${path}`,
      headers: { 'Content-Type': 'application/json', Authorization: 'Token @globals.pathfinder_token' }, body, result_name: resultName }],
      router: { type: 'switch', operand: `@results.${resultName}.category`, default_category_uuid: fail.uuid, categories: [ok, fail],
        cases: [{ uuid: uuid(name + id + 'case-ok'), type: 'has_only_text', arguments: ['Success'], category_uuid: ok.uuid }] },
      exits: [{ uuid: ok.exit_uuid, destination_uuid: null }, { uuid: fail.exit_uuid, destination_uuid: null }] }, 'split_by_webhook');
    return { node: n, onOk(dest) { n.exits[0].destination_uuid = dest.uuid; return dest; }, onFail(dest) { n.exits[1].destination_uuid = dest.uuid; return dest; } };
  }
  // Route on an expression, e.g. the age someone gave.
  function split(id, operand, cases) {
    const cats = cases.map(c => ({ uuid: uuid(name + id + 'cat' + c.name), name: c.name, exit_uuid: uuid(name + id + 'ex' + c.name) }));
    const other = { uuid: uuid(name + id + 'cat-other'), name: 'Other', exit_uuid: uuid(name + id + 'ex-other') };
    const n = place({ uuid: uuid(name + id), actions: [], router: { type: 'switch', operand, default_category_uuid: other.uuid, categories: [...cats, other],
      cases: cases.map((c, i) => ({ uuid: uuid(name + id + 'case' + c.name), type: c.type, arguments: c.args, category_uuid: cats[i].uuid })) },
      exits: [...cats.map(c => ({ uuid: c.exit_uuid, destination_uuid: null })), { uuid: other.exit_uuid, destination_uuid: null }] }, 'split_by_expression');
    return { node: n, to(catName, dest) { n.exits[catName === 'Other' ? cats.length : cases.findIndex(c => c.name === catName)].destination_uuid = dest.uuid; return dest; } };
  }
  const setField = (id, key, label, value) => place({ uuid: uuid(name + id), actions: [{ type: 'set_contact_field', uuid: uuid(name + id + 'act'), field: { key, name: label }, value }], exits: [{ uuid: uuid(name + id + 'exit'), destination_uuid: null }] }, 'execute_actions');
  const link = (a, b) => { a.exits[0].destination_uuid = b.uuid; return b; };
  const flow = () => ({ uuid: uuid(name), name, spec_version: '13.1.0', language: 'eng', type: 'messaging', revision: 1, expire_after_minutes: 10080, localization: {}, nodes, _ui: { nodes: ui, stickies: {} } });
  return { say, menu, freeText, webhook, split, setField, link, flow };
}

// ---- Flow 1: goal to plan (intake → plan webhook → plan message)
const A = flowBuilder('Pathfinder: goal to plan');
const lang = A.menu('lang', "Hi, I'm Pathfinder from GenU. I turn your goal into a plan: courses to take and openings to apply to. Which language do you prefer?",
  [{ value: 'en', label: 'English', words: 'english' }, { value: 'pcm', label: 'Naija Pidgin', words: 'pidgin naija' }, { value: 'ha', label: 'Hausa', words: 'hausa' }, { value: 'yo', label: 'Yorùbá', words: 'yoruba yorùbá' }], 'lang');
const age = A.freeText('age', 'Before we start: I only save your answers and your plan. Reply DELETE at any time to erase them.\n\nHow old are you? (Reply with a number)', 'age');
lang.then(age.first);
const work = A.freeText('work', "Tell me about work you already do, even if it's informal (selling, fixing phones, farming, cooking, hair…). Don't include your name or phone number. Or reply SKIP.", 'work');
// Ages 15-17 need a parent or guardian's agreement first; Pathfinder is for 15-24 (same rules as the web app).
const ageCheck = A.split('agecheck', '@results.age.value', [{ name: 'Minor', type: 'has_number_between', args: ['15', '17'] }, { name: 'Adult', type: 'has_number_between', args: ['18', '24'] }]);
age.then(ageCheck.node);
const guardian = A.menu('guardian', "Because you're under 18, a parent or guardian needs to agree before I save anything. Does your parent or guardian agree?", [{ value: 'yes', label: 'Yes, they agree', words: 'yes' }, { value: 'no', label: 'Not yet', words: 'no not' }], 'guardian');
ageCheck.to('Minor', guardian.first);
ageCheck.to('Adult', work.first);
ageCheck.to('Other', A.say('agerange', 'Pathfinder is for young people aged 15 to 24. Reply PLAN to start again, or browse every opportunity on Yoma.'));
const guardianNo = A.say('guardian-no', "That's fine. Nothing has been saved. When they agree, reply PLAN to start again.");
guardian.wait.exits.find(e => e.uuid === guardian.wait.router.categories.find(c => c.name === 'yes').exit_uuid).destination_uuid = work.first.uuid;
guardian.wait.exits.find(e => e.uuid === guardian.wait.router.categories.find(c => c.name === 'no').exit_uuid).destination_uuid = guardianNo.uuid;
const goal = A.menu('goal', "What's your main goal right now?", [{ value: 'job', label: 'Get a job' }, { value: 'earn', label: 'Earn money now' }, { value: 'skills', label: 'Learn new skills' }, { value: 'business', label: 'Start a business' }, { value: 'notsure', label: "I'm not sure", words: 'unsure' }], 'goal');
work.then(goal.first);
const sector = A.menu('sector', 'What kind of work interests you?', [{ value: 'digital', label: 'Digital & tech' }, { value: 'customer', label: 'Customer service & sales' }, { value: 'agri', label: 'Farming & agribusiness' }, { value: 'fashion', label: 'Fashion & beauty' }, { value: 'notsure', label: 'Not sure yet' }], 'sector');
goal.then(sector.first);
const state = A.menu('state', 'Which state do you live in?', [{ value: 'lagos', label: 'Lagos' }, { value: 'kano', label: 'Kano' }, { value: 'fct', label: 'FCT Abuja', words: 'abuja fct' }, { value: 'oyo', label: 'Oyo' }, { value: 'rivers', label: 'Rivers' }, { value: 'other', label: 'Another state' }, { value: 'online', label: 'Online only' }], 'state');
sector.then(state.first);
const hours = A.menu('hours', 'How many hours a week can you spend on this?', [{ value: '2', label: '1–2 hours' }, { value: '4', label: '3–5 hours' }, { value: '8', label: '6–10 hours' }, { value: '12', label: 'More than 10' }], 'hours');
state.then(hours.first);
const data = A.menu('data', 'How much mobile data can you use for learning?', [{ value: 'low', label: 'Very little' }, { value: 'some', label: 'Some' }, { value: 'plenty', label: 'Plenty' }], 'data');
hours.then(data.first);
const size = A.menu('size', 'How big a plan do you want?', [{ value: '3', label: 'Quick: 3 steps', words: 'quick' }, { value: '5', label: 'Bigger: 5 steps', words: 'bigger' }, { value: '7', label: 'Full: 7 steps', words: 'full' }], 'size');
data.then(size.first);
const body = '@(json(object("lang", results.lang.category, "age", results.age.value, "work", results.work.value, "goal", results.goal.category, "sector", results.sector.category, "state", results.state.category, "hours", results.hours.category, "data", results.data.category, "size", results.size.category)))';
const wh = A.webhook('plan', '/api/rapidpro/plan', body, 'plan');
size.then(wh.node);
const saveId = wh.onOk(A.setField('save-plan', 'pf_plan_id', 'PathFinder plan id', '@webhook.plan_id'));
const saveDate0 = A.link(saveId, A.setField('save-date', 'pf_plan_saved_on', 'PathFinder plan saved on', '@(now())'));
const saveDate = A.link(saveDate0, A.setField('save-handoff', 'pf_handoff', 'PathFinder handoff item', '@webhook.handoff'));
const show = A.link(saveDate, A.say('show', '@webhook.message\n\nI\'ll check in every week. Reply CHECKIN any time to update me.'));
const handoffText = 'Next in your journey: @fields.pf_handoff.';
// Skills Backpack, worded as in FunDoo: offered from 16 (YoID's minimum age), asked once, nothing written without a yes.
const bpAge = A.split('bp-age', '@results.age.value', [{ name: 'YoID', type: 'has_number_between', args: ['16', '24'] }]);
A.link(show, bpAge.node);
const bpOpts = [{ value: 'yes', label: 'Yes, activate it', words: 'yes activate' }, { value: 'more', label: 'Tell me more', words: 'more tell' }, { value: 'no', label: 'Not now', words: 'not no' }];
const bp = A.menu('backpack', "🎒 Want to activate your Skills Backpack?\n\nIt keeps the certificates you earn, the skills you learn and your Pathfinder plan in one place, on your Youth Identity (YoID).\n\nYour information is:\n🔒 Private\n🔒 Secure\n🔒 Only shared with your permission", bpOpts, 'backpack');
const bpMore = A.menu('backpack-more', "Your Skills Backpack helps you:\n✅ Keep your certificates safe, so you never lose them.\n✅ Show employers what you can do, with skills from trusted programmes like FunDoo and Yoma.\n✅ Find learning and earning opportunities on yoma.world.\n🔒 You decide when and if you share it.\n\nReady to activate it?", [bpOpts[0], bpOpts[2]], 'backpack');
bpAge.to('YoID', bp.first);
const handoffNo = A.say('handoff', handoffText);
bpAge.to('Other', A.link(A.say('bp-young', 'Skills Backpacks on YoID start at 16, so your plan stays here in this chat for now.'), handoffNo));
const bpWh = A.webhook('backpack-save', '/api/rapidpro/backpack', '@(json(object("plan_id", fields.pf_plan_id, "answer", "yes")))', 'backpack_saved');
const bpNo = A.link(A.setField('bp-no', 'pf_backpack', 'Skills Backpack on', 'no'), A.say('bp-no-msg', "That's fine. Nothing goes in a Skills Backpack. Your plan is still here in this chat."));
A.link(bpNo, handoffNo);
for (const m of [bp, bpMore]) for (const [cat, dest] of [['yes', bpWh.node], ['no', bpNo], ['more', bpMore.first]]) {
  const c = m.wait.router.categories.find(x => x.name === cat); if (c) m.wait.exits.find(e => e.uuid === c.exit_uuid).destination_uuid = dest.uuid;
}
const bpOk = bpWh.onOk(A.setField('bp-yes', 'pf_backpack', 'Skills Backpack on', 'yes'));
A.link(A.link(bpOk, A.say('bp-yes-msg', '@webhook.message')), A.say('handoff-yes', handoffText));
bpWh.onFail(A.link(A.say('bp-fail', "Sorry, I couldn't open your Skills Backpack right now. Reply PLAN later to try again."), handoffNo));
wh.onFail(A.say('busy', "Sorry, Pathfinder can't build your plan right now. Please reply PLAN to try again later."));

// ---- Flow 2: weekly check-in (check-in webhook → next step)
const B = flowBuilder('Pathfinder: weekly check-in');
const ci = B.menu('ci', 'Pathfinder check-in: how is your current step going?', [{ value: '1', label: 'Finished', words: 'finished done yes' }, { value: '2', label: 'Still working', words: 'working doing' }, { value: '3', label: 'Not started', words: 'not' }, { value: '4', label: 'I need help', words: 'help' }], 'checkin');
const cw = B.webhook('checkin', '/api/rapidpro/checkin', '@(json(object("plan_id", fields.pf_plan_id, "answer", results.checkin.category)))', 'checkin_result');
ci.then(cw.node);
const step = cw.onOk(B.setField('step', 'pf_step', 'PathFinder current step', '@webhook.step'));
B.link(step, B.say('reply', '@webhook.message'));
cw.onFail(B.say('busy', "Sorry, I couldn't update your plan right now. Please try again later."));

const fA = A.flow(), fB = B.flow();
const exp = {
  version: '13', site: 'https://app.rapidpro.io',
  flows: [fA, fB],
  campaigns: [{ uuid: uuid('campaign'), name: 'Pathfinder weekly check-ins', group: { uuid: uuid('group'), name: 'Pathfinder users' },
    events: [1, 2, 3, 4, 5, 6].map(w => ({ uuid: uuid('event' + w), offset: w * 7, unit: 'D', event_type: 'F', delivery_hour: 10,
      relative_to: { key: 'pf_plan_saved_on', label: 'PathFinder plan saved on' }, flow: { uuid: fB.uuid, name: fB.name }, start_mode: 'I' })) }],
  triggers: [
    { trigger_type: 'K', keyword: 'plan', flow: { uuid: fA.uuid, name: fA.name }, groups: [], exclude_groups: [], channel: null, match_type: 'F' },
    { trigger_type: 'K', keyword: 'checkin', flow: { uuid: fB.uuid, name: fB.name }, groups: [], exclude_groups: [], channel: null, match_type: 'F' }
  ],
  fields: [{ key: 'pf_plan_id', name: 'PathFinder plan id', type: 'text' }, { key: 'pf_backpack', name: 'Skills Backpack on', type: 'text' }, { key: 'pf_handoff', name: 'PathFinder handoff item', type: 'text' }, { key: 'pf_plan_saved_on', name: 'PathFinder plan saved on', type: 'datetime' }, { key: 'pf_step', name: 'PathFinder current step', type: 'number' }],
  groups: [{ uuid: uuid('group'), name: 'Pathfinder users', query: null }]
};
writeFileSync(new URL('./pathfinder-rapidpro.json', import.meta.url), JSON.stringify(exp, null, 2) + '\n');
console.log(`wrote flows/pathfinder-rapidpro.json: ${fA.nodes.length} + ${fB.nodes.length} nodes`);

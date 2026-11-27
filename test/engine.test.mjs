import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, normalise } from '../lib/plan-server.mjs';
import { mapListing } from '../lib/yoma.mjs';
import { yomaItem } from './helpers/mock-yoma.mjs';

const jobs = ['Shop Floor Assistant', 'Sales Support Officer', 'Telesales Agent', 'Sales & Marketing Assistant', 'Customer Service Rep', 'Retail Cashier']
  .map((t, i) => yomaItem(100 + i, { title: `${t} in Lagos`, type: 'Job', engagementType: null, organizationName: 'Employer ' + i, skills: [{ name: 'Customer service' }, { name: 'Sales' }, { name: 'Communication' }] }));
const task = yomaItem(200, { title: 'GREEN LEARN2EARN - AGROECOLOGY IMPACT TASK', type: 'Task', organizationName: 'GREEN', categories: [{ name: 'Agriculture' }], skills: [{ name: 'Sales' }] });
const courses = [yomaItem(300, { title: 'Sustainable Aquaculture', type: 'Learning', organizationName: 'P2E (GenU)', categories: [{ name: 'Agriculture' }] }),
  yomaItem(301, { title: 'Customer Service Basics', type: 'Learning', organizationName: 'P2E (GenU)' })];
const all = [...jobs, task, ...courses].map(mapListing);
const catalogue = { opps: all.filter(x => x.kind === 'opp'), courses: all.filter(x => x.kind === 'course') };

test('for a job goal, career Apply steps hold jobs, not unrelated tasks, and Start follows them', () => {
  const plan = buildPlan({ answers: normalise({ age: 21, goal: 'job', sector: 'customer', state: 'lagos', hours: 4, data: 'some', size: 5 }), catalogue });
  const career = plan.steps.filter(s => s.kind === 'apply').flatMap(s => s.items);
  assert.ok(career.every(o => o.type === 'job'), career.map(o => o.title).join(' | '));
  assert.equal(plan.steps[0].item.title, 'Customer Service Basics');
});

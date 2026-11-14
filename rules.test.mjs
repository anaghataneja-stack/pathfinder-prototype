import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS, skillsFromText, sectorsFromText, isScam, matchOption } from '../lib/rules.mjs';

test('informal work description maps to informal skills', () => {
  const s = skillsFromText('I dey sell provisions for market and I fit fix phone');
  for (const k of ['market-trading', 'phone-repair', 'customer']) assert.ok(s.includes(k), `missing ${k}: ${s}`);
  assert.ok(s.every(k => k in SKILLS));
  assert.ok(s.length <= 6);
});

test('skill list keeps the original 18 skills and adds 6 informal ones', () => {
  assert.equal(Object.keys(SKILLS).length, 24);
  for (const k of ['phone-repair', 'market-trading', 'food-prep', 'hair-beauty', 'driving-delivery', 'childcare', 'customer', 'digital-basics']) assert.ok(k in SKILLS, k);
});

test('sectors default to all when nothing matches', () => {
  assert.deepEqual(sectorsFromText('general volunteering'), ['all']);
  assert.ok(sectorsFromText('Agriculture field day').includes('agri'));
});

test('scam check catches fees but not paid work', () => {
  assert.equal(isScam('Pay a registration fee of N3000'), true);
  assert.equal(isScam('Send a deposit to secure your slot'), true);
  assert.equal(isScam('deposit conversion and campaign spend'), false);
  assert.equal(isScam('Paid internship'), false);
  assert.equal(isScam('Learn pricing for your shop'), false);
});

test('matchOption accepts numbers, labels and label prefixes', () => {
  const opts = [{ v: 'job', labels: ['Get a job', 'Find work'] }, { v: 'skills', labels: ['Learn new skills'] }];
  assert.equal(matchOption('2', opts), 'skills');
  assert.equal(matchOption('find work', opts), 'job');
  assert.equal(matchOption('learn', opts), 'skills');
  assert.equal(matchOption('9', opts), null);
  assert.equal(matchOption('banana', opts), null);
});

test('"marketing" is not market trading (real Yoma title)', () => {
  assert.ok(!skillsFromText('Brand Marketing Specialist in Lagos').includes('market-trading'));
  assert.ok(skillsFromText('I run a stall in the market').includes('market-trading'));
});

test('"Marketer" is not market trading either', () => {
  assert.ok(!skillsFromText('Become a Digital Marketer: Grow Brands').includes('market-trading'));
  assert.ok(!sectorsFromText('Become a Digital Marketer').includes('customer'));
});

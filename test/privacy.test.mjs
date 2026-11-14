import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripPII } from '../lib/privacy.mjs';

test('phone numbers and emails are removed', () => {
  const out = stripPII('call me 0803 123 4567 or +234-803-123-4567 or a@b.com');
  assert.ok(!/\d{3}/.test(out), out);
  assert.ok(!out.includes('@'), out);
  assert.ok(out.includes('[removed]'));
});

test('long digit runs are removed but short numbers stay', () => {
  assert.equal(stripPII('BVN 22123456789 and I work 3 days'), 'BVN [removed] and I work 3 days');
});

test('text is capped at 600 characters', () => {
  assert.equal(stripPII('a'.repeat(900)).length, 600);
});

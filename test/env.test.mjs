import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEnv } from '../lib/env.mjs';

test('loadEnv sets missing keys and keeps existing ones', () => {
  const f = join(mkdtempSync(join(tmpdir(), 'pf-')), '.env');
  writeFileSync(f, '# comment\nPF_A="one"\n\nPF_B=two\nPF_C=x=y\n');
  process.env.PF_B = 'kept';
  loadEnv(f);
  assert.equal(process.env.PF_A, 'one');
  assert.equal(process.env.PF_B, 'kept');
  assert.equal(process.env.PF_C, 'x=y');
});

test('loadEnv ignores a missing file', () => { loadEnv('/nope/.env'); });

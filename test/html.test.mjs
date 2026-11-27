import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SKILLS } from '../lib/rules.mjs';

const html = readFileSync(new URL('../pathfinder.html', import.meta.url), 'utf8');
const engine = readFileSync(new URL('../engine/plan-engine.js', import.meta.url), 'utf8');
const block = name => engine.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`))[1];
const keysOf = src => [...src.matchAll(/(?:^|[,{\s])'?([a-z][\w-]*)'?\s*:\s*['"]/g)].map(m => m[1]);

test('the app skill list matches the server skill list', () => {
  assert.deepEqual(keysOf(block('SK')).sort(), Object.keys(SKILLS).sort());
});

test('every English message has a Hausa and Yoruba version', () => {
  const en = html.match(/ en:\{([\s\S]*?)\n \},/)[1];
  const enKeys = [...en.matchAll(/(?:^\s+|",\s*)([a-zA-Z0-9]+):"/gm)].map(m => m[1]);
  for (const lang of ['ha', 'yo']) {
    const src = html.match(new RegExp(`T\\.${lang} = \\{([\\s\\S]*?)\\n\\};`))[1];
    const have = new Set([...src.matchAll(/(?:^\s+|",\s*)([a-zA-Z0-9]+):"/gm)].map(m => m[1]));
    const missing = enKeys.filter(k => !have.has(k));
    assert.deepEqual(missing, [], `${lang} missing: ${missing.join(', ')}`);
  }
});

test('placeholders are kept in every translation', () => {
  for (const lang of ['ha', 'yo']) {
    const src = html.match(new RegExp(`T\\.${lang} = \\{([\\s\\S]*?)\\n\\};`))[1];
    const en = html.match(/ en:\{([\s\S]*?)\n \},/)[1];
    for (const [, key, val] of en.matchAll(/(?:^\s+|",\s*)([a-zA-Z0-9]+):"((?:[^"\\]|\\.)*)"/gm)) {
      const tr = src.match(new RegExp(`(?:^\\s+|",\\s*)${key}:"((?:[^"\\\\]|\\\\.)*)"`, 'm'));
      if (!tr) continue;
      const need = (val.match(/\{\w+\}/g) || []).sort().join();
      const got = (tr[1].match(/\{\w+\}/g) || []).sort().join();
      assert.equal(got, need, `${lang}.${key} placeholders`);
    }
  }
});

test('urgent-help words are caught in Hausa and Yoruba too, with or without tone marks', () => {
  const src = html.match(/const URGENT = (\/.*\/[a-z]*);/)[1];
  const URGENT = eval(src);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ɗ]/g, 'd').replace(/[ƙ]/g, 'k').replace(/[ɓ]/g, 'b');
  for (const msg of ['my boss is threatening me', 'ba na cikin aminci', 'ana dukana a gida', 'zan kashe kaina', 'mi ò wà láìléwu', 'mi o wa lailewu', 'wọ́n ń lù mí', 'mo fẹ́ pa ara mi'])
    assert.ok(URGENT.test(norm(msg)), msg);
  assert.ok(!URGENT.test(norm('ina sayar da kaya a kasuwa')));
});

test('colours come from the shared Yoma tokens, not hard-coded in the app', () => {
  const tokens = readFileSync(new URL('../tokens/yoma-tokens.css', import.meta.url), 'utf8');
  assert.match(tokens, /--yoma-purple:\s*#41204b/i); assert.match(tokens, /--yoma-green:\s*#387f6a/i);
  assert.match(html, /<link rel="stylesheet" href="\/tokens\/yoma-tokens\.css">/);
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const hexes = css.match(/#[0-9a-f]{3,8}\b/gi) || [];
  assert.deepEqual(hexes, [], 'hard-coded colours in pathfinder.html CSS: ' + hexes.join(' '));
  assert.match(css, /--f-display:\s*var\(--yoma-font-display\)/);
});

test('every YoID and next-prototype message has Hausa and Yoruba versions', () => {
  for (const key of ['yoidAdded', 'yoidSkills', 'yoidPlan', 'yoidCourse', 'yoidApplied', 'nextProto'])
    for (const lang of ['ha', 'yo']) assert.match(html.match(new RegExp(`T\\.${lang} = \\{([\\s\\S]*?)\\n\\};`))[1], new RegExp(`\\b${key}:"`), `${lang}.${key}`);
});

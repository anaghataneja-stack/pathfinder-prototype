# Pathfinder Pilot-Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pathfinder pilot-ready for Nigeria: daily Yoma sync, real Azure OpenAI calls (informal-work skills from voice or text, plain-word answers, plan reasons, listing enrichment) with checked fallbacks, Hausa and Yoruba, offline use, tests and docs.

**Architecture:** Keep the single-page app `pathfinder.html`. Grow `serve.mjs` into a dependency-free Node server with small modules under `lib/` for env, rules, privacy, Yoma sync and AI. The browser only talks to `/api/*`; every external call has a timeout and a labelled fallback.

**Tech Stack:** Node 18+ built-ins only (`http`, `fs`, `zlib`, `fetch`, `node:test`); vanilla JS/HTML; Playwright (already on the dev machine) for optional browser scenarios.

**Spec:** `docs/superpowers/specs/2026-11-13-pathfinder-pilot-ready-design.md`

## Global Constraints

- Start with one command: `node serve.mjs` (port `PORT`, default `4173`). No npm dependencies.
- Keys only in `.env` (gitignored); `.env.example` committed with: `AI_PROVIDER`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_CHAT_DEPLOYMENT`, `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION=2024-10-21`, `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY`, `OPENAI_COMPAT_MODEL`, `AI_ENRICH_LISTINGS=true`, `SYNC_HOUR=5`, `YOMA_API_BASE=https://api.yoma.world/api/v3`, `PILOT_ACCESS_CODE=`, `PORT=4173`.
- AI routes: 10 s timeout, one retry on 429/5xx, input ≤ 600 chars after PII stripping, JSON output checked; failure → fallback with `source:"fallback"` and HTTP 200.
- Rate limit AI routes: 30 requests per IP per 10 minutes → 429 `{error:"rate_limited"}`.
- Audio ≤ 2 MB; reject larger with 413.
- Interface languages: `en`, `pcm`, `ha`, `yo`; missing strings fall back to `en`; `ha`/`yo` labelled "needs native-speaker review".
- Under-18 plan reasons: templates only. Voice for under-18s only after guardian consent; "Don't say your name or phone number" shown above recording.
- Never send names, phone numbers or emails to AI; never log request text.
- Every data source and AI output labelled in the UI (Live Yoma / saved copy / sample; Azure AI / fallback).

## Review Focus

1. Azure returns 200 with prose or fenced JSON instead of pure JSON → parser strips fences; otherwise fallback (test in Task 3).
2. Yoma returns 200 with empty items, or the cache file is corrupt → keep previous good copy / sample, never serve an empty catalogue (test in Task 2).
3. Voice note is silence or noise → empty transcript shows "I couldn't hear that. Try again or type it" (test in Task 3 + e2e in Task 5).
4. Someone types a phone number in their work description → stripped before AI (test in Task 1, asserted again through the route in Task 4).
5. Browser offline after first load → page and last listings come from the service worker cache with an offline banner (e2e in Task 5).

---

### Task 1: Foundations (env, rules, privacy)

**Files:** Create `package.json`, `.env.example`, `.gitignore`, `lib/env.mjs`, `lib/rules.mjs`, `lib/privacy.mjs`, `test/rules.test.mjs`, `test/privacy.test.mjs`.

**Interfaces — Produces:**
- `loadEnv(path='.env'): void` — sets missing `process.env` keys from KEY=VALUE lines (ignores comments/blank lines, strips quotes).
- `SKILLS: Record<string,string>` — existing 18 keys plus `phone-repair`, `market-trading`, `food-prep`, `hair-beauty`, `driving-delivery`, `childcare`.
- `skillsFromText(text): string[]` (max 6, keys of SKILLS), `sectorsFromText(text): string[]` (`digital|customer|agri|fashion`, `all` when none), `isScam(text): boolean`, `matchOption(text, options:[{v,labels:string[]}]): v|null` (number, exact label, or label prefix).
- `stripPII(text): string` — replaces phone numbers (≥7 digits incl. +234/0 prefixes, spaces/dashes), emails, and runs of 6+ digits with `[removed]`; trims to 600 chars.

- [ ] Step 1: Tests: `skillsFromText("I dey sell provisions for market and I fit fix phone")` includes `market-trading`, `phone-repair`, `customer`; `isScam("Pay a registration fee of N3000")===true`, `isScam("Paid internship")===false`; `matchOption("2",opts)` → second v; `stripPII("call me 0803 123 4567 or a@b.com")` contains neither digits run nor `@`.
- [ ] Step 2: Run `node --test test/` → fails (modules missing).
- [ ] Step 3: Implement the four modules; `package.json` scripts: `start`, `sync`, `test` (`node --test test/`), `e2e`.
- [ ] Step 4: `node --test test/` → pass.
- [ ] Step 5: Commit `feat: add server foundations (env, rules, privacy)`.

### Task 2: Yoma daily sync

**Files:** Create `lib/yoma.mjs`, `lib/sync.mjs`, `sync.mjs`, `data/sample-listings.json`, `test/sync.test.mjs`.

**Interfaces — Consumes:** Task 1 rules. **Produces:**
- `fetchYoma({base, fetchImpl, pageSize=100, maxPages=10}) → {items, countries, metrics}` — country filter NG + WW (codeAlpha2), pages `POST /opportunity/search` until fewer than pageSize returned.
- `mapListing(item) → listing` with `{id:'y-'+id, kind:'opp'|'course', title, org, type, skills, sectors, remote, states, minAge:15, deadline|null, openEnded, hours?, entry?, data, offline, link, zlto, commitment, scam, informal:{earnNow,phoneOnly,noCert}, src:'Yoma', live:true}` (field rules as in current `mapYoma`).
- `createSync({dataDir, base, fetchImpl, enrich?, now?}) → {get(): Catalogue, run(): Promise<Catalogue>, schedule(hour)}` where `Catalogue = {source:'live'|'saved'|'sample', fetchedAt, changes:{added,removed}, metrics, opps, courses, error?}`; writes `data/yoma-cache.json` atomically (tmp + rename); on start loads cache if valid, else sample; `run()` failure or zero items keeps previous catalogue with `source:'saved'` (or `'sample'`) and `error`.
- `sync.mjs` CLI runs one `run()` and prints counts.

- [ ] Step 1: Tests with an in-process mock Yoma: paging (230 items over 3 pages → 230 mapped); fee listing has `scam:true`; second run with one item removed and one added → `changes {added:1, removed:1}`; Yoma 500 → `source:'saved'` with previous items; corrupt cache file + Yoma down → `source:'sample'` and non-empty opps.
- [ ] Step 2: Run → fail. Step 3: Implement; sample file holds ≥ 12 representative Nigeria listings (marked `sample:true`) incl. informal ones. Step 4: Run → pass.
- [ ] Step 5: Commit `feat: daily Yoma sync with saved-copy and sample fallback`.

### Task 3: AI layer (Azure OpenAI + checks)

**Files:** Create `lib/ai.mjs`, `lib/ai-tasks.mjs`, `test/ai.test.mjs`.

**Interfaces — Produces:**
- `createAI(env, fetchImpl) → {provider:'azure'|'openai-compatible'|'none', chat({system, user, json:true}), transcribe(buffer, mime, lang), features:{chat:boolean, voice:boolean}}`. Azure URLs: `${endpoint}/openai/deployments/${dep}/chat/completions?api-version=${v}` and `.../audio/transcriptions?api-version=${v}`, header `api-key`. Compat: `${base}/chat/completions`, `Authorization: Bearer`.
- In `ai-tasks.mjs`, each returns `{..., source:'ai'|'fallback', why?}`:
  - `extractSkills(ai, {text, lang})` → `{skills, summary}`; skills filtered to SKILLS keys, max 6; summary ≤ 30 words; fallback = `skillsFromText` + template summary.
  - `understand(ai, {text, question, options})` → `{value}`; value must be one of options' `v` or null; local `matchOption` first, AI only if that fails.
  - `writeReasons(ai, {steps, lang})` → `{reasons}`; each ≤ 35 words, rejects `guarantee|will get|promise|definitely` (+ ha/yo/pcm equivalents list), rejects reasons mentioning digits not present in that step's facts; any reject → fallback `null` per reason (client uses template).
  - `enrichListings(ai, listings)` → listings with AI skills/sectors in batches of 20; failures keep rule tags.
  - `transcribeNote(ai, {buffer, mime, lang})` → `{text}`; empty/whitespace → `{text:'', source:'fallback', why:'empty'}`.
- JSON parsing helper strips ``` fences and leading prose before the first `{`.

- [ ] Step 1: Tests with mock Azure server: valid JSON → `source:'ai'`; fenced JSON parsed; unknown skill keys dropped; reason with "guarantee" → null; 10 s timeout simulated with 50 ms override → fallback; 500 then 200 → succeeds after one retry; provider none → fallback without network; empty transcript → `why:'empty'`.
- [ ] Step 2: Run → fail. Step 3: Implement (timeout configurable for tests). Step 4: Run → pass.
- [ ] Step 5: Commit `feat: Azure OpenAI layer with checked outputs and fallbacks`.

### Task 4: Server routes

**Files:** Modify `serve.mjs` (rewrite); create `test/server.test.mjs`, `manifest.webmanifest`, `icon.svg`, `sw.js`.

**Interfaces — Consumes:** Tasks 1–3. **Produces routes:** `GET /` and `/pathfinder.html`, `/sw.js`, `/manifest.webmanifest`, `/icon.svg`; `GET /api/listings` (gzip when accepted; `Cache-Control: no-cache`, ETag = fetchedAt); `GET /api/status` → `{ai:{provider, chat, voice}, yoma:{source, fetchedAt, nextSync, changes, error}}`; `POST /api/ai/skills|understand|reasons` (JSON ≤ 16 KB); `POST /api/ai/transcribe?lang=` (raw audio body, ≤ 2 MB). Optional access code: when `PILOT_ACCESS_CODE` set, requests need cookie `pf_code` (set by `GET /?code=...`), else a small code-entry page. Export `createServer(opts)` for tests; start + schedule only when run directly.

- [ ] Step 1: Tests: `/api/listings` returns `source` and non-empty `opps`; gzip header when requested; skills route strips a phone number before the mock AI sees it (mock records bodies); 31st AI request from same IP → 429; 3 MB audio → 413; unknown `/api/x` → 404; access code set → `/api/listings` without cookie → 401.
- [ ] Step 2: Run → fail. Step 3: Implement. Step 4: Run → pass.
- [ ] Step 5: Commit `feat: API server with AI routes, rate limits and offline assets`.

### Task 5: App update (pathfinder.html)

**Files:** Modify `pathfinder.html`; create `test/e2e.mjs`.

**Interfaces — Consumes:** Task 4 routes. Decisions:
- Listings from `/api/listings`; on file:// use built-in sample catalogue. Remove old `/yoma-api` loader.
- Status chips: Yoma (`Live · synced <time> · N new` / `Saved copy from <date>` / `Sample`) and AI (`Azure AI on` / `AI off, using rules`).
- Languages `en|pcm|ha|yo` in the first question (four buttons); all `T` keys for `ha` and `yo`; notice "Hausa and Yoruba text needs native-speaker review".
- New step `askWork` after the profile question: buttons Record a voice note (hidden if `voice:false` or SMS mode) / Type it / Skip; free-text pending mode in composer; result shown as "I heard: …" + skill chips + Yes / Say it again / Skip. Accepted keys stored in `S.workSkills` and included in `held()`; panel chips "from your own work".
- Goal option `earn` ("Earn money now"): `GOAL_TYPES.earn = ['task','self','apprenticeship','job']`; scoring +1.5 for listings with `informal.earnNow`.
- Unclear typed answers to option questions (from profile question onward) call `/api/ai/understand`; null → existing fallback message.
- After plan built and age ≥ 18: call `/api/ai/reasons` (3 s budget) and use non-null reasons; panel marks each reason "Azure AI" or "template".
- "Skills I have" card with AI summary + WhatsApp share.
- Light mode: skip Google Fonts when `navigator.connection?.saveData` or data answer `low`.
- Register `sw.js` on http(s); offline banner on `offline` event.

- [ ] Step 1: Write `test/e2e.mjs` scenarios (server with mock Yoma + mock Azure): Amina 17 Kano Hausa, types work "ina sayar da kaya a kasuwa" → skill chips shown → plan; Tunde 21 Lagos English typed "about 4 hours" for hours → understood; AI down → rules chips + "template" labels; Yoma down → "Saved copy"; scam listing removed; empty voice transcript message; offline reload shows page and banner; Yoruba language renders Yoruba greeting.
- [ ] Step 2: Run `node test/e2e.mjs` → fail. Step 3: Implement. Step 4: Run → all scenarios pass; `node --test test/` still passes.
- [ ] Step 5: Commit `feat: informal-work skills by voice or text, Hausa and Yoruba, live status`.

### Task 6: Docs and slide

**Files:** Rewrite `README.md`; create `docs/INTEGRATION.md`, `docs/TESTING.md`; slide as a published artifact.

- [ ] Step 1: README: what it is, quick start (Node 18+, `cp .env.example .env`, `node serve.mjs`), env table, what's real vs simulated, daily sync, Azure App Service deploy, troubleshooting, review notice for ha/yo/pcm.
- [ ] Step 2: INTEGRATION.md: Yoma endpoints used now; where it fits in Yoma (`src/web` page using `opportunities` services, `/myopportunity/action/{id}/save`, `/user/skills`, Keycloak sign-in, sync/enrichment as an API background job); permissions, agreements and infrastructure for a live pilot.
- [ ] Step 3: TESTING.md: scenario table from Task 5 + unit coverage, issues found and fixed, open issues for next sprint.
- [ ] Step 4: Verify every command in README works from a fresh clone of the branch (`git clone` to scratch, run `npm test`, start server, curl `/api/status`).
- [ ] Step 5: Commit `docs: setup, integration and testing docs`; publish slide.

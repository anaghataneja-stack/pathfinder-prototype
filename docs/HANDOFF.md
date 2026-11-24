# Pathfinder: handoff from the cloud chat (2 to 20 November 2026)

This file is for the next Claude Code session (local, on the owner's Mac) to carry on from the cloud chat titled "Anagha". **Read it first, then README.md, docs/PILOT.md, docs/TESTING.md, docs/INTEGRATION.md and docs/DEMO.md.**

## Who and what

- **Who:** the owner is a Berkeley student consultant on the GenU / UNICEF project. GitHub accounts involved:
  - `anaghataneja-stack` owns this repo;
  - `Devin-Fitzpatrick06` is the account the cloud chat was linked to (no push access to this repo).
- **What:** Pathfinder is "Concept 1, the Goal-to-Plan Navigator", one of four GenU AI prototypes. It turns a young Nigerian's goal into three steps (Start Here, Learn Here, Apply Here) using Yoma, Passport to Earning (P2E) and imaGen, with weekly check-ins.
- **Pilot country:** Nigeria.
- **Interface languages:** English, Nigerian Pidgin, Hausa, Yoruba. Igbo is next sprint.

## The assignment this sprint (summary)

Deliverables:
- 1 updated, functional prototype;
- 1 slide (AI/API + Yoma connections, testing results, limitations and next steps);
- an updated GitHub repo with setup docs;
- a 3-minute live demo.

Requirements:
- Core flow works end to end. Consider accessibility, mobile and connectivity.
- Real AI calls (Azure where available, modular), not hardcoded.
- At least one Yoma data source. Clearly separate what's real from what's simulated.
- Reproducible from GitHub, with documentation on how it would integrate with Yoma.
- Testing with realistic scenarios and failure cases, plus open issues.

Owner priorities:
- informal work;
- usable with low access;
- Yoma listings refreshed daily;
- pilot-ready;
- stick to the assignment.

## What was built (all on `main` in GitHub)

- **Architecture: single page plus a small Node server, no dependencies.**
  - `pathfinder.html` (the app).
  - `serve.mjs` → `lib/server.mjs` for the routes.
  - `lib/sync.mjs` and `lib/yoma.mjs` for the daily Yoma sync.
  - `lib/ai.mjs` and `lib/ai-tasks.mjs` for Azure OpenAI, with checked outputs and fallbacks.
  - `lib/rules.mjs` (keyword fallback, scam check), `lib/privacy.mjs` (removes personal details).
  - `lib/store.mjs` (cases and anonymous events).
  - `sw.js` (offline and slow-data support), `privacy.html`, `pilot-report.mjs`.
- **AI (Azure OpenAI):**
  - skills from informal work (typed or voice);
  - understanding plain-word answers;
  - plan reasons, adults only;
  - listing tagging during the sync;
  - voice transcription.

  All of it is off until `.env` has the keys. It falls back to rules and templates, labelled in the UI.
- **Yoma:** the public API (`api.yoma.world`), no key needed.
  - Daily sync of Nigeria + Worldwide listings: 5,171 on the 14 Nov live check.
  - Saved copy and hourly retry.
  - Jobberman jobs: the city is read from the title.
  - 13 real P2E courses are labelled and preferred for Start Here.
  - Sample data is marked "(sample)".
- **Pilot features:**
  - **Staff inbox** at `/staff` (needs `STAFF_CODE`). Urgent cases first, with case codes; no personal data stored.
  - **Anonymous counts:** `npm run pilot-report`.
  - **Privacy notice:** `/privacy.html`, a draft for GenU review.
  - **Access-code limits.**
  - **Go-live checklist:** `docs/PILOT.md`.
- **Demo voice fallback:** `DEMO_BROWSER_VOICE=true` uses Chrome speech recognition when Azure voice is off. The audio goes to Google, so it's demo only and must be off for the pilot. It's labelled in the chat.
- **Earlier safety features kept:**
  - guardian consent for ages 15–17;
  - never pay to apply / scam check;
  - report a step;
  - urgent-help words (en/pcm/ha/yo) going to a facilitator plus 112;
  - save and resume, DELETE;
  - SMS mode.
- **Tests:** `npm test` gives 77 unit/API tests. `npm run e2e` gives 17 Playwright scenarios against mock Yoma and mock Azure. GitHub Actions runs both (`.github/workflows/test.yml`).

## How to run (owner's Mac)

```bash
cd ~/Downloads/pf-repo
node sync.mjs                                           # optional: refresh Yoma now
DEMO_BROWSER_VOICE=true STAFF_CODE=demo node serve.mjs  # demo setup
```

- App: http://localhost:4173
- Staff inbox: http://localhost:4173/staff?code=demo
- If "address already in use": run `lsof -ti :4173 | xargs kill`.
- If the browser shows an old version: press Cmd+Shift+R.

## Status on 20 November

- **GitHub `main` has everything up to the pilot features.** The last two changes, the demo voice fallback and `docs/DEMO.md`, were sent as a zip. Check `docs/DEMO.md` exists; if not, that update still needs committing and pushing.
- **Slide:** a claude.ai Slides artifact (private until the owner shares it). Its speaker notes hold a demo script that assumes Azure is on. Use `docs/DEMO.md` for the no-Azure demo.

## Added on 24 November (client feedback: well received; align with Yoma's RapidPro sandbox; stronger course matching)

- **Plans of 3, 5 or 7 steps** (`askSize`, `PLAN_SHAPES` in `pathfinder.html`).
  - Apply steps hold up to 3 openings each ("now", "later", "earn").
  - "Show more openings".
  - A **next plan** after finishing (`nextPlan`: skills from finished courses count as held; finished items are excluded).
- **Course matching:** weighted gap across the career openings, title overlap, a real P2E course reserved for Start, spare slots filled with job-readiness courses, AI re-ranking (`/api/ai/rank`) when Azure is on.
- **Continue with Yoma** (`lib/yoma-auth.mjs`): Keycloak OIDC + PKCE, real skills from `/user/skills`, plan saved via `/myopportunity/action/{id}/save`. Needs a Pathfinder Keycloak client from Yoma (`docs/INTEGRATION.md` 2b).
- **`docs/RAPIDPRO.md`:** maps the flow onto RapidPro, plus questions for Camila.
- **Real-data tuning:** organisation-only and other-country listings removed; "hospitality" no longer counts as a customer-service skill.
- **Tests:** 87 unit, 20 browser scenarios.

## Open items

1. **Azure keys** (owner waiting on the team). Then run the live AI check in `docs/TESTING.md` and record the results.
2. **GenU sign-offs** (`docs/PILOT.md` ☐ items):
   - DPIA and privacy notice review;
   - native-speaker review of Hausa, Yoruba and Pidgin;
   - vetted helplines;
   - real facilitators;
   - App Service hosting with `TRUST_PROXY=true` and `DEMO_BROWSER_VOICE=false`.
3. **Known product gaps:**
   - Yoma has almost no Kano jobs.
   - Real P2E courses on Yoma are mostly green and hospitality, so Start/Learn matching is approximate until AI tagging is on.
   - The first load is about 246 KB gzipped.
   - Small English-only labels remain for Hausa and Yoruba users.

## Lessons from the chat

- **GitHub web uploads flatten folders.** Upload with git from Terminal (clone, `git rm -rq .`, copy files in, commit, push).
- **Pushing workflow files from the owner's token was refused.** `.github/workflows/test.yml` had to be created on the GitHub website. Watch for a trailing "." in the file name.
- **Never commit `.env`.** It is git-ignored.

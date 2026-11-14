# Pathfinder: pilot-ready sprint (design)

Date: 13 November 2026 · Status: approved by owner, 13 Nov 2026

## Why

Pathfinder is one of four GenU prototypes. This week's assignment asks for a prototype that works end to end with realistic inputs, makes real AI calls (Azure where available), uses Yoma data, launches from its GitHub repo with documented setup, is tested against realistic and failure scenarios, and has a clear path into Yoma. The owner also wants it to:

- help young Nigerians whose work is **informal** (market trading, repairs, tailoring, farming, helping family businesses), which is most youth work in Nigeria;
- be usable by someone with **low access**: cheap phone, little data, patchy signal, limited reading or typing;
- use **Yoma listings refreshed daily**;
- be ready for a **pilot**.

Success: a 3-minute demo where a young person speaks about the informal work they already do, Pathfinder recognises it as skills using Azure AI, and builds a plan from today's real Yoma listings, with clear labels showing what is live, AI-generated, or sample. Plus a repo a stranger can clone and run.

## Goals

1. **Real AI, via Azure OpenAI**, in four places, each with a validated fallback:
   - *Skills from informal work*: free text or a voice note ("I dey help my aunty sell provisions") becomes skills from Pathfinder's skill list plus a one-line "skills I have" summary.
   - *Understanding typed replies*: any question can be answered in the person's own words ("I fit do like 3 hours"), not only by number or button.
   - *Plan reasons*: the one-line "why this step" is written from the listing's own fields (over-18s only; under-18s keep reviewed templates, as today).
   - *Listing enrichment during the daily sync*: Yoma listings are tagged with skills and sectors (replacing the keyword rules when AI is available).
2. **Voice notes**: the mic button records up to 60 seconds; Azure OpenAI transcription turns it into text; the person sees what was heard and can correct it before it is used.
3. **Daily Yoma sync on the server**: fetch all published Nigeria + Worldwide opportunities once a day (and on start if the copy is older than 24 hours), save the last good copy, and report what changed ("12 new, 3 closed today").
4. **Informal-work support**: a new "Earn money now" goal; informal experience counts towards skill gaps; listings show informal-friendly signals (earns Zlto, works from a phone, no certificate needed, apprenticeship); a shareable "Skills I have" card.
5. **Low access**: works offline after first visit (installable web app with cached page and listings); light mode skips web fonts and keeps payloads small; typing in plain words works in SMS mode; voice for people who would rather speak.
6. **Reliability**: timeouts, retries and fallbacks on every external call; input limits; AI output checked before use; clear error messages in the chat.
7. **Honesty about what is real**: status chips and the Behind the scenes panel label every data source (Live Yoma / saved copy / sample) and every AI output (Azure AI / fallback).
9. **Tests and docs**: automated tests runnable with one command, a written scenario test log, setup and integration docs, and one summary slide.

## Non-goals

- Real SMS/USSD gateway (next sprint; code is organised to allow it).
- Rewriting in Next.js or merging into the Yoma repository.
- Reading a real person's Yoma profile (needs Yoma sign-in and a partner agreement).
- Live P2E or imaGen data (no access; stays sample, labelled).
- Igbo interface text (next sprint).

## Anti-goals (would count as failure even if it "works")

- AI output shown without checks, or AI promising jobs or outcomes.
- Personal details (phone numbers, names) sent to the AI or written to logs.
- The demo silently showing sample data as if it were live.
- Breaking the existing flow, safety features, or basic-phone mode.
- Adding npm dependencies that make setup harder (the server stays dependency-free on Node 18+).

## Constraints

- One command to start: `node serve.mjs`. Keys in a `.env` file (with `.env.example` committed).
- Azure access is believed available but unconfirmed: everything must run without keys, with fallbacks labelled.
- The Yoma API blocks browser calls from other sites, so all Yoma calls go through the server.
- Under-18 data: AI processing of a minor's free text only after guardian consent (already in the flow); minors' plan reasons stay template-only.
- This build environment cannot reach Azure or Yoma, so testing here uses local mock servers; the owner must run one live check.
- The owner uploads to GitHub manually (no push access from here).

## Approaches considered

1. **Single page + small Node server** (chosen). Keep `pathfinder.html`; grow `serve.mjs` into a small server with Yoma sync, AI endpoints, and fallbacks. Smallest change, runs anywhere, keeps keys server-side.
2. **Option 1 + server-side matching and a real SMS/USSD line.** Truly reaches feature phones, but needs a paid gateway and roughly doubles the work. Deferred to next sprint.
3. **Rebuild in Next.js like Yoma's web app.** Easiest to merge later, but a full rewrite and too risky for this week.

## Design

### Files

```
serve.mjs                 entry point: static files + API routes + daily sync timer
lib/env.mjs               loads .env without dependencies
lib/yoma.mjs              Yoma fetch (paged), mapping to Pathfinder listings, change stats
lib/sync.mjs              daily schedule, cache file, fallback to sample snapshot
lib/ai.mjs                provider interface: azure | openai-compatible | none
lib/ai-tasks.mjs          skills, understand, reasons, enrich, transcribe + output checks
lib/rules.mjs             keyword fallbacks (skills, sectors, scam check), shared by sync and AI fallback
lib/privacy.mjs           strip phone numbers, emails and long digit runs; length limits
sync.mjs                  `node sync.mjs`: run one sync now (for cron or a manual refresh)
data/sample-listings.json representative snapshot used when Yoma has never been reached
data/ (gitignored)        yoma-cache.json
pathfinder.html           the app (updated)
sw.js, manifest.webmanifest, icon.svg   offline + install
test/*.test.mjs           node:test unit and API tests with mock Yoma and mock Azure
test/e2e.mjs              browser scenarios (needs Playwright; optional)
docs/INTEGRATION.md       how this maps onto Yoma's code and what access a live pilot needs
docs/TESTING.md           scenarios, results, open issues
.env.example, package.json (scripts only, no dependencies)
```

### Server API

| Route | Does | Fallback |
|---|---|---|
| `GET /api/listings` | Mapped Yoma listings + metrics + `source` (`live`, `saved`, `sample`), `fetchedAt`, `changes` | Saved copy, then bundled sample |
| `GET /api/status` | AI provider and which features are on, last/next sync | — |
| `POST /api/ai/skills` | `{text, lang, minor}` → `{skills[], summary, heard?, source}` | Keyword rules |
| `POST /api/ai/understand` | `{text, question, options[]}` → `{value or null, source}` | Exact/number/keyword match |
| `POST /api/ai/reasons` | `{steps[] (facts only), lang}` → `{reasons[], source}` | Templates (client keeps them) |
| `POST /api/ai/transcribe` | audio (≤ 60 s, ≤ 2 MB) → `{text, source}` | "Please type it instead" |

All AI routes: 10-second timeout, one retry on 429/5xx, PII stripped first, input capped at 600 characters, output parsed as JSON and checked (skills must be in the skill list; reasons ≤ 35 words, must not contain promise words such as "guarantee"/"will get", must not invent organisations or dates absent from the facts). Any failure returns the fallback with `source: "fallback"` and the reason, never an error page.

### Azure configuration (`.env`)

```
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_CHAT_DEPLOYMENT=gpt-4o-mini        # any chat deployment
AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT=whisper      # optional; voice is off without it
AZURE_OPENAI_API_VERSION=2024-10-21
AI_ENRICH_LISTINGS=true
SYNC_HOUR=5                                     # local hour for the daily Yoma sync
```

An `openai-compatible` provider (any endpoint speaking the same API) is supported for teams without Azure, selected by `AI_PROVIDER`.

### App changes (pathfinder.html)

- Reads listings from `/api/listings` (no direct Yoma calls); file:// still works with built-in sample data.
- New optional intake step after the profile question: "Tell me about work you already do: selling, fixing, farming, helping at a shop…" with **Record a voice note / Type it / Skip**. The result is played back ("I heard: … From this, you already have: Serving customers, Pricing & selling. Is that right?") with Yes / Say it again / Skip. Accepted skills count as held, shown as "from your own work" chips.
- New goal "Earn money now", favouring tasks, self-employment and apprenticeships, and listings that earn Zlto or work from a phone.
- Any question accepts plain words; unclear text is sent to `/api/ai/understand` before falling back to "use the buttons".
- Plan reasons requested from the AI for over-18s after the plan is built (shown within ~3 s or templates are used); each reason's source shown in the panel.
- "Skills I have" card, shareable on WhatsApp (no name or number).
- Status chips: Yoma (live / saved copy from <date> / sample) and AI (Azure on / fallback).
- Light mode: skip web fonts when the person chose "Very little data" or the browser asks to save data.
- Offline: service worker caches the page, icon and last `/api/listings`; an offline banner appears when the network is down.

### Informal-work details

- Skill list gains informal-relevant skills: `phone-repair`, `market-trading`, `food-prep`, `hair-beauty`, `driving-delivery`, `childcare`, alongside the existing ones (each with courses/opportunities in sample data so plans stay sensible).
- Sample data gains a few clearly labelled informal routes (apprenticeships, starter kits) where Yoma has none; live Yoma tasks that earn Zlto are flagged as "earn now".

### Testing

- `npm test` (node:test, no installs): rules, privacy filter, AI output checks, Yoma mapping and paging, sync fallback chain, each API route with mock Azure success, timeout, bad JSON and refusal.
- `node test/e2e.mjs` (Playwright): at least 8 scenarios: Amina 17 Kano informal tailoring by voice; Tunde 21 Lagos digital; new user online-only with low data; Pidgin free-text answers; AI down; Yoma down then saved copy; scam listing; nonsense input and empty transcription; offline reload.
- `docs/TESTING.md` records each scenario, the result, issues found and fixed, and open issues.

### Deliverables beyond code

- README: what it is, quick start, `.env`, what's real vs simulated, troubleshooting.
- `docs/INTEGRATION.md`: where this would live in Yoma (`src/web` page using existing `opportunities` services; save plan steps via `/myopportunity/action/{id}/save`; read skills via `/user/skills` after Keycloak sign-in; listing enrichment as a Yoma API job), plus the permissions, partner agreements and infrastructure a live GenU pilot needs.
- One summary slide (AI/API and Yoma connections, testing results, limitations and next steps).

## Calls made in review (builder's calls, owner may override)

- **AI before age is known:** the language, age and guardian questions use local matching only (their answers are numbers or yes/no). From the profile question on, unclear typed answers may go to `/api/ai/understand`, for minors too after guardian consent, because it only picks one of the fixed options and generates nothing.
- **Informal skills count fully:** skills the person describes count as held whether or not they let Pathfinder read their Yoma profile (it's their own statement). They close that part of the gap, are shown as "from your own work", and the Learn step then covers the next missing skill, or job readiness if none are missing.
- **Contacts:** facilitators and helplines stay sample data, labelled as such. Sample informal routes cover the five states already in the app.
- **Abuse protection:** AI routes are rate limited per IP (default 30 requests / 10 minutes) and an optional `PILOT_ACCESS_CODE` can lock the whole app for a closed pilot.

## Owner decisions (13 Nov)

- **Scope = the assignment.** Pilot country is Nigeria. Other GenU countries (India, Egypt, Brazil, South Africa, Turkey, Philippines) are out of scope this sprint; listed in next steps only.
- **Languages:** interface in English, Nigerian Pidgin, **Hausa and Yoruba** (owner request: widely spoken in Nigeria). Hausa and Yoruba text is written by the builder and labelled "needs native-speaker review" in the app and README until checked; any missing string falls back to English. Voice notes accept all four (the chosen language is passed to transcription as a hint); what was heard is always shown for correction. AI-written skill summaries and plan reasons are produced in the chosen language. Igbo is next sprint.
- **Voice for under-18s:** allowed after guardian consent. A line above the record button says "Don't say your name or phone number"; transcripts are cleaned of numbers and emails before any further AI use. The Azure resource region must meet NDPA 2023 and UNICEF data policy (documented, owner to confirm with GenU).
- **Hosting:** runs on a laptop with `node serve.mjs` for the demo; README documents Azure App Service for a hosted pilot. The Vercel/Netlify notes are removed.

## Left to the builder

Exact prompt wording, the sample informal listings' contents, chip styling, the scenario script details, and internal module boundaries, within the constraints above.

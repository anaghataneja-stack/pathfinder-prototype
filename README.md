# Pathfinder

**Pathfinder** (Concept 1, the Goal-to-Plan Navigator) is a GenU prototype for the Nigeria pilot. It turns a young person's goal into three ordered steps across Passport to Earning (P2E), Yoma and imaGen, then keeps them moving with weekly check-ins.

This version adds:

- **Plans of 3, 5 or 7 steps**, the person's choice.
  - **Several openings per Apply step** ("Apply now", "Apply after your courses", "Earn while you learn"), so one rejection doesn't end the plan.
  - **More openings on request.**
  - **A next plan after finishing**, building on the skills just gained.
- **Stronger course matching.**
  - Courses cover the skills needed across *all* the target openings, weighted by how many need each skill.
  - Course titles are matched to job titles.
  - Real Passport to Earning courses are reserved for Start Here.
  - With Azure on, the AI re-orders the candidate courses.
- **"Continue with Yoma" sign-in**, via Yoma's Keycloak.
  - Reads the person's **real Yoma skills** and **saves the plan's opportunities to their Yoma account**.
  - Off until Yoma registers a Pathfinder client; see [docs/INTEGRATION.md](docs/INTEGRATION.md).
- **Yoma's look:** colours, fonts and spacing come from the shared tokens file `tokens/yoma-tokens.css` (Yoma's own brand values). No colours are hard-coded.
- **YoID as the thread:** skills, the plan, finished courses and applications are recorded on the young person's YoID (mocked writes). There's also a link to the next prototype in the joined-up demo. See [docs/COHESION.md](docs/COHESION.md).
- **WhatsApp through RapidPro:** a ready-to-import RapidPro file and two webhooks, using the same plan engine as the web app. It follows UNICEF's FunDoo bot: the same Skills Backpack question, YoID only from 16, and 1️⃣ 2️⃣ 3️⃣ menus. Setup: [docs/RAPIDPRO.md](docs/RAPIDPRO.md).
- **One journey across four prototypes:** Yoma's design tokens, YoID records, shared mock data and handoffs in and out. Open `/?journey=demo` to see Halima's journey from the team's shared mock data. See [docs/COHESION.md](docs/COHESION.md).

- **Real Yoma data, refreshed daily.** The server syncs every published Nigeria and Worldwide opportunity from the public Yoma API once a day. If Yoma is down it keeps the last good copy.
- **Azure OpenAI**, with a checked fallback for every call:
  - turns informal work someone already does (typed, or as a voice note) into recognised skills;
  - understands answers typed in plain words;
  - writes the "why this step" lines for adults;
  - tags Yoma listings with skills during the daily sync.
- **Informal work counts.** Market trading, phone repair, cooking, hair, driving and childcare are recognised skills. There's also an "Earn money now" goal, and each opening shows whether it earns now, works from a phone, or needs no certificate.
- **Hausa and Yoruba**, alongside English and Nigerian Pidgin.
- **Pilot-ready**: urgent and help requests reach facilitators through a staff inbox at `/staff`, with a case code the young person can quote. There are also anonymous pilot counts (`npm run pilot-report`), a privacy notice and a go-live checklist ([docs/PILOT.md](docs/PILOT.md)).
- **Built for low access**:
  - works offline after the first visit and can be added to the home screen;
  - on slow data it shows the listings saved on the phone after 4 seconds instead of waiting;
  - skips web fonts on low data;
  - has a basic-phone (SMS) mode;
  - offers voice for people who'd rather speak.

> **What's real and what's simulated** is listed [below](#whats-real-and-whats-simulated). The app also shows it live: the *Listings* and *AI* chips above the phone, and the footer.

## Quick start

You need [Node.js](https://nodejs.org) 18 or newer. There is nothing to install: no npm packages.

```bash
git clone https://github.com/anaghataneja-stack/pathfinder-prototype
cd pathfinder-prototype
cp .env.example .env        # optional: add Azure keys (see below)
node serve.mjs
```

Open **http://localhost:4173**. The server log says what's connected:

```
Pathfinder running at http://localhost:4173
AI: azure, voice on                       (or: off (keyword rules and templates))
Yoma: live copy loaded; daily sync at 05:00
```

Without a `.env`, everything still works: listings come from Yoma (or the bundled sample if Yoma can't be reached), and AI steps fall back to keyword rules and reviewed templates.

Opening `pathfinder.html` directly as a file also works, using only the built-in sample data.

## Connecting Azure OpenAI

1. In the Azure portal, create an **Azure OpenAI** resource. Choose a region that meets GenU's data rules for Nigeria (NDPA 2023) and UNICEF's data policy.
2. Deploy a **chat model**, for example `gpt-4o-mini`. Optionally also deploy a **speech-to-text model** (`whisper` or `gpt-4o-mini-transcribe`) to turn on voice notes.
3. Fill in `.env`:

   | Variable | Example | Needed for |
   |---|---|---|
   | `AZURE_OPENAI_ENDPOINT` | `https://genu-pathfinder.openai.azure.com` | all AI |
   | `AZURE_OPENAI_API_KEY` | *(from Keys and Endpoint)* | all AI |
   | `AZURE_OPENAI_CHAT_DEPLOYMENT` | `gpt-4o-mini` (your deployment name) | all AI |
   | `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` | `whisper` | voice notes (optional) |
   | `AZURE_OPENAI_API_VERSION` | `2024-10-21` | change only if Azure asks |

4. Restart `node serve.mjs`. The **AI** chip should say *Azure OpenAI on · voice*.

Other settings:

- `SYNC_HOUR`: the hour of the daily Yoma sync, in the server's clock. App Service runs on UTC, so `5` means 06:00 in Nigeria (WAT).
- `AI_RATE_LIMIT`: AI requests per person per 10 minutes (default 60).
- `TRUST_PROXY`: set `true` when hosted behind a proxy such as App Service, so each phone gets its own rate limit instead of everyone sharing one.
- `AI_ENRICH_LISTINGS`: AI tagging of listings during the sync.
- `PILOT_ACCESS_CODE`: locks a hosted pilot behind a code. Open `/?code=…` once on each phone. Wrong codes are limited to 10 tries per 10 minutes.
- `YOMA_AUTH_ISSUER`, `YOMA_AUTH_CLIENT_ID`, `YOMA_AUTH_CLIENT_SECRET`, `PUBLIC_URL`: turn on **"Continue with Yoma"**. These need a Keycloak client registered by Yoma for Pathfinder, with redirect URI `<PUBLIC_URL>/auth/yoma/callback`.
- `NEXT_PROTOTYPE_NAME`, `NEXT_PROTOTYPE_URL`: the next prototype in the joined-up GenU demo, shown as a button once the plan is saved. For the connected journey, `http://localhost:3001/demo/p2e` (SkillLens's mock P2E course page). If it is empty, `SKILLLENS_URL` + `/demo/p2e` is used.
- `DEMO_BROWSER_VOICE`: **demo only.** `true` lets voice notes use Chrome's built-in speech recognition when Azure voice isn't set up. The audio goes to Google, so it must stay `false` for the pilot. The app labels it "Demo only" whenever it's used.
- `STAFF_CODE`: turns on the facilitator case inbox at `/staff`. Open `/staff?code=…` once. Use a long random code.
- `PORT`: the port the server listens on.
- `AI_PROVIDER=openai-compatible` plus the `OPENAI_COMPAT_*` settings: lets teams without Azure use any OpenAI-compatible endpoint.

The keys stay on the server. The browser never sees them.

## What's real and what's simulated

| Part | Status |
|---|---|
| Yoma opportunities and courses (Nigeria + Worldwide) | **Real**: public Yoma API (`/opportunity/search`), synced daily, saved to `data/yoma-cache.json` |
| Yoma platform totals in the header | **Real**: `/analytics/platform/metrics/info` |
| Skills from informal work, plain-word answers, plan reasons, listing tags | **Real Azure OpenAI calls** when `.env` is set; otherwise keyword rules and templates, labelled in the app |
| Voice notes | **Real** Azure transcription when a speech deployment is set. For demos without Azure, `DEMO_BROWSER_VOICE=true` uses Chrome's speech recognition instead, labelled "Demo only". Otherwise the option is hidden |
| Scam check, safety rules, matching and scoring | **Real logic** running on whatever listings are loaded |
| Passport to Earning courses | **Partly real**: 13 P2E courses published on Yoma are used and labelled. The rest are built-in samples marked "(sample)" |
| imaGen challenges | **Sample**: no API access yet |
| Test personas (Amina, Tunde) and their Yoma credentials | **Sample**. With "Continue with Yoma" configured, the person's **real** Yoma skills are used instead |
| "Saved to your Yoma account" | **Real** when signed in with Yoma (opportunities saved through the Yoma API). Otherwise it says "Saved on this phone" |
| Facilitator handoffs, urgent cases and listing reports | **Real**: stored on the server and shown in the staff inbox (`/staff`), with no names or numbers |
| Facilitator names, guardian SMS code, "saved to your Yoma profile" | **Simulated**: see [docs/INTEGRATION.md](docs/INTEGRATION.md) for what each needs |
| `data/sample-listings.json` | **Sample**: only used when Yoma has never been reached |

## How it fits together

```
 phone / browser ──► pathfinder.html (chat, matching, safety rules, offline cache)
                         │  /api/listings  /api/status  /api/ai/*
                         ▼
                 serve.mjs (Node, no dependencies)
                  ├─ daily sync ──► api.yoma.world  (public Yoma API)
                  │      └─ data/yoma-cache.json (last good copy) → data/sample-listings.json
                  └─ AI tasks ────► Azure OpenAI (chat + transcription)
                         └─ checks: known skills only, no promises, no invented numbers,
                            personal details removed first; any failure → rules/templates
```

**Daily sync.**
- Runs at `SYNC_HOUR` each day, and on start if the saved copy is older than a day.
- If a sync fails, it tries again every hour and keeps serving the last good copy.
- To refresh by hand before a demo, run `node sync.mjs`. A running server picks up the new copy straight away.

## Using it

1. **Tell us your goal.**
   - Language (English, Pidgin, Hausa, Yoruba) and age.
   - A guardian's agreement if under 18.
   - Permission to read the Yoma profile.
   - **The work you already do**: a voice note, typed, or skipped.
   - Goal, sector, state, weekly hours and data budget. Buttons, numbers or plain words all work.
2. **Get your 3-step plan.**
   - Start Here, Learn Here, Apply Here, each with a reason.
   - Swap or report any step, or say none fit.
   - Share the plan on WhatsApp.
3. **Weekly check-ins.** A person steps in after two missed check-ins, when someone asks for help, or straight away if a message suggests they're unsafe.

Controls above the phone:
- **Test as**: sample personas.
- **Phone**: smartphone or basic-phone SMS.
- **Listings**: live Yoma or sample.
- **AI**: status.

The **Behind the scenes** panel shows:
- the stored answers;
- skills from the person's own work;
- every listing removed and why;
- the skill gap;
- who wrote each reason;
- the facilitator queue.

## Tests

```bash
npm test                    # 106 unit and API tests, no installs, about 5 seconds
```

Browser scenarios (24 of them) run the real server against a mock Yoma API and a mock Azure, in Chromium:

```bash
npm i --no-save playwright && npx playwright install chromium
npm run e2e
```

Scenarios, results, issues fixed and open issues: [docs/TESTING.md](docs/TESTING.md). GitHub runs both suites on every push (`.github/workflows/test.yml`).

## Running the pilot

- **Go-live checklist and measures:** [docs/PILOT.md](docs/PILOT.md).
- **Staff inbox:** set `STAFF_CODE`, then open `/staff?code=…` to see handoffs and reports, with urgent ones first.
- **Pilot numbers:** run `npm run pilot-report`.
- **Privacy notice:** `/privacy.html`, linked at the top of every chat.
- **What's stored on the server:** `data/cases.ndjson` and `data/events.ndjson` hold fixed values only (state, age band, language, step, reason). They're git-ignored.

## Hosting a pilot on Azure App Service

1. Create a **Web App**: Linux, Node 20 LTS, in the same region as the Azure OpenAI resource.
2. Deploy this repo, either from GitHub (Deployment Center) or with `az webapp up`.
3. Under **Configuration**:
   - set the startup command to `node serve.mjs`;
   - add the `.env` values as **Application settings**, including `TRUST_PROXY=true`. App Service sets `PORT` itself.
4. Turn on **Always On** so the daily sync timer keeps running. The saved Yoma copy lives under `/home/site/wwwroot/data`, which is kept across restarts.
5. Optionally set `PILOT_ACCESS_CODE` for a closed pilot.

HTTPS is required for voice notes and offline mode on phones. App Service provides it.

## Privacy and safety

- **On the server:** only cases (for facilitators) and anonymous counts, with fixed values and no names, numbers, exact ages or typed text.
- **Only the six answers, the age check, the plan and its status are stored**, on the person's phone. Reply `DELETE` to erase them. Plans are dropped after 6 months without use.
- **Personal details are removed before the AI sees anything.** Phone numbers, emails and long digit runs are stripped from text and transcripts, and the server never logs what people type or say. The recording screen says "Don't say your name or phone number".
- **Under-18s need a guardian's agreement** before anything is saved or sent to the AI. Their plan reasons only use reviewed templates.
- **Never pay to apply.** Listings that ask for a fee are removed, and every step can be reported.
- **Voice is shown back before it's used.** What the AI heard is played back, and the person confirms the skills before they count.

## Languages

The interface is in English, Nigerian Pidgin, Hausa and Yoruba.

> **The Hausa, Yoruba and Pidgin text was written for this prototype and still needs a native-speaker review before real users see it.** The app tells Hausa and Yoruba users this.

Igbo is planned for the next sprint.

## Project layout

```
serve.mjs            server entry point
sync.mjs             run one Yoma sync now
pathfinder.html      the app
engine/              plan-engine.js: matching and plan building, shared by the web app and the WhatsApp webhooks
flows/               RapidPro import file and its builder
sw.js, manifest.webmanifest, icon.svg   offline + add to home screen
lib/                 env, rules, privacy, yoma, sync, ai, ai-tasks, server, plan-server, store, yoma-auth
data/                sample-listings.json (+ yoma-cache.json at runtime, git-ignored)
test/                unit/API tests (node:test) and mock Yoma/Azure servers
e2e/scenarios.mjs    browser scenarios
docs/                DEMO.md, PILOT.md, INTEGRATION.md, RAPIDPRO.md, COHESION.md, TESTING.md, HANDOFF.md, design and plan
tokens/              yoma-tokens.css: shared Yoma design tokens for all four prototypes
mockups/             the team's shared mock data (Halima) and the RoleMap mock-up
prompts/, rubrics/   the AI prompts and the plan-scoring rubric, as reviewable files
privacy.html         privacy notice (draft for GenU review)
pilot-report.mjs     pilot numbers from data/
.github/workflows/   tests on every push
```

## Troubleshooting

| You see | Do this |
|---|---|
| *Listings: not reachable* | Start the server with `node serve.mjs` and open `http://localhost:4173`, not the file |
| *saved copy* or *server sample* | Yoma couldn't be reached. Check internet access, then run `node sync.mjs` |
| *AI: Off · rules & templates* | Check the four `AZURE_OPENAI_*` values in `.env` and restart |
| No "Record a voice note" option | Set `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT`, use the smartphone view, and allow the microphone. Phones need HTTPS |
| `node: command not found` | Install Node.js LTS from nodejs.org and open a new terminal |

# Pathfinder: Nigeria pilot go-live checklist

Work through this before the first young person uses Pathfinder. Each item says who owns it.
- ✅ = done in the code.
- ☐ = still to do.

## 1. Must be done before launch

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | Azure OpenAI resource in an approved region, with a chat deployment (+ whisper for voice). Keys in App Service settings, never in GitHub | GenU / UNICEF IT | ☐ |
| 2 | Live AI check from [TESTING.md](TESTING.md#live-check-run-this-before-the-demo) passes. Record 10–20 real voice notes per language and note accuracy | Pathfinder team | ☐ |
| 3 | Data protection impact assessment covering voice notes, under-18s, cases and counts (NDPA 2023, UNICEF policy) | GenU / UNICEF legal | ☐ |
| 4 | Privacy notice (`privacy.html`) reviewed, `[ ]` contacts and case retention filled in | GenU data protection lead | ☐ |
| 5 | Native-speaker review of Hausa, Yoruba and Pidgin text, including the urgent-help words | GenU Nigeria | ☐ |
| 6 | Vetted helplines added to the urgent-help message (currently 112 only) | GenU Nigeria | ☐ |
| 7 | Real facilitator names per state replace the sample ones. A named person checks `/staff` **every working day**; urgent cases are contacted the same day | GenU Nigeria partners | ☐ |
| 8 | Hosting on Azure App Service: HTTPS, **Always On**, `TRUST_PROXY=true`, `STAFF_CODE` (long, random) and `PILOT_ACCESS_CODE` set, **`DEMO_BROWSER_VOICE=false`** (the demo voice sends audio to Google) | GenU IT | ☐ |
| 9 | How a facilitator reaches a young person agreed. Today the young person quotes their case code; a WhatsApp/SMS channel would let staff message them | GenU Nigeria | ☐ |

## 2. Already built in

| Item | Where |
|---|---|
| Handoffs and urgent cases reach a person: the staff inbox at `/staff`, urgent first, "mark contacted" | `lib/server.mjs`, `lib/store.mjs` |
| The young person gets a short case code to quote (no I/O/0/1, easy to read out) | `pathfinder.html` |
| Cases made offline are sent when the phone is back online | `pathfinder.html` (`flushCases`) |
| Listing reports reach the same inbox | `pathfinder.html` (`report`) |
| No names, phone numbers, exact ages or typed text stored on the server | `lib/server.mjs` (fixed values only), tests in `test/pilot.test.mjs` |
| Anonymous pilot counts, plus `npm run pilot-report` | `lib/store.mjs`, `pilot-report.mjs` |
| Privacy notice linked at the top of every chat | `privacy.html` |
| Access code for a closed pilot, with a limit on wrong tries and Secure cookies on HTTPS | `lib/server.mjs` |
| Daily Yoma sync with a saved copy, hourly retry and correct locations for Jobberman jobs | `lib/sync.mjs`, `lib/yoma.mjs` |
| Fair AI rate limit per phone, with a "try again in a minute" message | `lib/server.mjs` |
| Offline and slow-data support | `sw.js` |
| Tests run on every push to GitHub (Node 18, 20, 22 + browser scenarios) | `.github/workflows/test.yml` |

## 3. Measuring the pilot

`npm run pilot-report` prints:
- **Plans:** plans built and saved, and the save rate.
- **Progress:** steps finished and applications.
- **Help:** handoffs and urgent cases.
- **Reports:** listings reported.
- **AI fallbacks:** times the AI fell back to rules.
- **Who:** voice notes used, plus language and age-band splits.

Suggested pilot measures:

| Measure | Why |
|---|---|
| Plans saved ÷ plans built | Do young people find the plan worth keeping? |
| Step done and applied events per saved plan | Does the plan lead to action? |
| Urgent cases and time to "contacted" | Safety: every urgent case contacted the same day |
| Reports per 100 plans | Listing quality and scams |
| AI fallbacks per 100 plans | AI reliability on real networks |
| Use by language and age band | Are Hausa, Yoruba and under-18 users served? |

## 4. Day-to-day

- **Every working day:** open `/staff`, contact urgent cases, mark them contacted.
- **Every week:** run `npm run pilot-report` and share the numbers.
- **When something looks wrong:**
  - Run `node sync.mjs` to refresh Yoma straight away.
  - Check `/api/status` for the AI and Yoma state.
- **Rolling back:** redeploy the previous GitHub commit. Data in `data/` is kept.

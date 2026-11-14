# Testing

Last run: 13 November 2026, Node 22, Chromium (Playwright).

| Suite | Command | Result |
|---|---|---|
| Unit and API tests | `npm test` | **65 / 65 pass** (about 2 s) |
| Browser scenarios | `npm run e2e` | **15 / 15 pass** |
| Live check, real Yoma API | `node sync.mjs` + the app | **Done 14 Nov 2026**: 5,171 real listings. Results and fixes [below](#live-check-real-yoma-14-november-2026) |
| Live check, real Azure OpenAI | see [Live check](#live-check-run-this-before-the-demo) | **Not run yet.** Needs the team's Azure keys |

The automated tests use **mock** Yoma and Azure servers (`test/helpers/`) that copy the real request and response shapes. They prove Pathfinder's own logic and its failure handling. They don't prove the real services' content.

## Unit and API tests (`test/`)

| Area | What's covered |
|---|---|
| Rules (`rules.test.mjs`) | Informal-work phrases in English and Pidgin map to the right skills. The scam check catches fees but not "paid internship". Typed answers match by number, label or prefix |
| Privacy (`privacy.test.mjs`) | Nigerian phone numbers (`0803…`, `+234…`), emails and long digit runs are removed. Text is capped at 600 characters |
| Settings (`env.test.mjs`) | `.env` loading. Existing environment variables win |
| Yoma sync (`sync.test.mjs`) | Paging through 230 results. Filtering to Nigeria and Worldwide. Mapping and informal signals. Change counts ("1 new, 1 closed"). Yoma down: saved copy kept. Yoma returns 0 listings: the catalogue isn't wiped. Corrupt cache plus Yoma down: bundled sample. AI enrichment failure keeps the rule tags. Next run time. Hourly retry after a failure |
| AI layer (`ai.test.mjs`) | Azure URL and `api-key` header. Unknown skills dropped. Phone numbers never reach the AI. Fenced or prose-wrapped JSON parsed. Bad JSON falls back to rules. Timeout falls back within the time limit. One retry after a 500. No AI configured: no network calls. Plain-word answers: local match first, AI second, invalid AI value rejected. Reasons with promises ("guarantee") or invented numbers rejected. Listing tagging in batches survives a failed batch. Transcripts cleaned. Empty audio flagged |
| Server (`server.test.mjs`) | Listings with source, gzip and ETag/304. Status. Personal details stripped on the route. 400 for bad input. 413 for oversized JSON and audio over 2 MB. 429 after 30 AI calls in 10 minutes. 404. Static files. Access code (401 without it, cookie after `?code=`) |
| App text (`html.test.mjs`) | The app's skill list matches the server's. Every English message has a Hausa and Yoruba version. Placeholders such as `{date}` are kept in every translation |

## Browser scenarios (`e2e/scenarios.mjs`)

| # | Scenario | What it checks | Result |
|---|---|---|---|
| 1 | Amina, 17, Kano, **Hausa**, types "ina sayar da kaya a kasuwa" | Guardian step. AI skills shown with Hausa names. Confirmed skills count in the plan. Plan in Hausa. **No AI-written reasons for an under-18** | Pass |
| 2 | Tunde, 21, Lagos, English, types "I fit do like 4 hours" | AI understands plain words. Plan reasons written by AI and labelled in the panel. AI chip shows Azure | Pass |
| 3 | AI switched off | Voice option hidden. Typed work still mapped by keyword rules (labelled). Template reasons. AI chip says off | Pass |
| 4 | Yoma down, yesterday's copy on disk | App says "saved copy" with the date | Pass |
| 5 | A live listing asks for a registration fee | Removed, shown in the panel as "Asks for a fee or payment", never in the plan | Pass |
| 6 | Voice note: silence, then a real note | Silence gets "I couldn't hear that clearly…". A real note is played back as "I heard: …" and turned into skills. *Proven against the mock only*: real speech-to-text can "hear" filler words in silence. The server treats common filler ("Thank you.", "you") and recordings under about 1.5 KB as empty | Pass |
| 7 | Offline reload after one visit | Page loads from the offline cache and the offline banner shows | Pass |
| 8 | Yorùbá chosen | Conversation switches to Yoruba, with the review notice | Pass |
| 9 | Report a step, save, reload, resume, DELETE | Reported step replaced. Plan survives a reload. DELETE clears it | Pass |
| 10 | Basic phone (SMS) | Numbered replies work. No voice offered. Plan sent as text with REPORT instructions | Pass |
| 11 | Page opened as a file, no server | Says "not reachable" and "sample", and the flow still runs | Pass |
| 12 | Slow data: listings take 12 s | The listings saved on the phone show within 8 s, with a "slow connection" banner | Pass |
| 13 | The server returns a 404 page once | The 404 doesn't replace the offline copy, and the app still opens offline afterwards | Pass |
| 14 | AI over its rate limit | Shows "try again in a minute", not a network error | Pass |

The test fake microphone is Chromium's `--use-fake-device-for-media-stream`.

## Issues found and fixed this sprint

| Issue | Fix |
|---|---|
| No real AI calls anywhere. Every reason was a fixed template | Azure OpenAI layer with checked outputs (`lib/ai.mjs`, `lib/ai-tasks.mjs`) |
| Yoma data was only fetched when someone opened the page. No daily refresh, no copy kept | Server-side daily sync with saved copy, sample fallback and hourly retry |
| A failed sync at start-up waited about 24 hours for the next try | Retries every hour after a failure (test: *after a failed sync the next try is within an hour*) |
| After rejecting a too-large voice upload, the next request on the same connection failed | Connection closed after a 413 (test: *audio over 2 MB…* followed by *unknown API routes…*) |
| Served page had no `<!doctype>`, charset or mobile viewport, so it rendered zoomed-out on phones | Proper document head added. Checked at 390 px wide with no sideways scroll |
| Web fonts (~100 KB) always loaded, even on tiny data bundles | Skipped when the phone asks to save data or the person picks "Very little data" |
| The plan card collapsed to a thin line in long chats (fixed earlier in this branch) | Chat items no longer shrink |
| The rate limit counted everyone behind App Service (or one Wi-Fi) as one person, so AI would have stopped for a whole room | Real client address used when `TRUST_PROXY=true`. Limit raised to 60 and configurable. Busy message on the phone |
| On slow data the page waited up to 15 s, then showed invented sample listings | The service worker answers from the phone's copy after 4 s and the page says so |
| Any page response (even a 404 or the access-code page) could replace the offline copy of the app | Only the real app page is saved |
| `node sync.mjs` didn't reach a running server until it restarted | The server re-reads the saved copy when it changes |
| Urgent-help words only worked in English and Pidgin | Hausa and Yoruba terms added (draft, for review), matched with or without tone marks |
| A non-https link from Yoma could have run as a script when opened | Only `https:` links are kept |
| After a restart the footer said Yoma "couldn't be reached" when nothing had failed | Wording now depends on a real failure |
| Informal work wasn't recognised. The skill list had no trading, repairs, cooking, hair, driving or childcare | Six informal skills added, recognised from voice or text, counted towards skill gaps |

## Live check: real Yoma, 14 November 2026

`node sync.mjs` against `api.yoma.world` took 17 seconds and returned **2,867 opportunities and 2,304 courses** for Nigeria and Worldwide. Payload to a phone: 246 KB gzipped, downloaded again only when the daily sync changes something.

What the real data showed, and what was fixed (each fix has a test built from the real case):

| Found in real data | Fix |
|---|---|
| Only the first 1,000 of 5,171 listings were fetched | Pages of 500, up to 10,000 |
| Most listings are **Jobberman Nigeria** jobs whose city is only in the title ("Baking Assistant in Lagos"), with no engagement type. All 2,867 were treated as remote | Location read from the title. Now 1,288 Lagos, 346 Abuja, 235 Rivers, 112 Oyo, 245 nationwide, 453 other states, 188 remote |
| 6 normal jobs flagged as scams ("deposit conversion", "cash deposits") | Scam check now needs real money-asking wording. 0 false flags on the real data. Fee requests are still caught |
| "Marketing"/"Marketer" tagged as market trading. Broad category names ("Career and Personal Development") tagged 887 courses as job search, so two generic 1-hour courses appeared in every plan | Keyword fixes. Categories now set the sector only |
| A 17-year-old was offered jobs, an undergraduate scholarship and NYSC onboarding | Jobs and graduate/NYSC listings are 18+. Yoma "Other" (scholarships) no longer counts as earn-now |
| **Yoma already hosts 13 real Passport to Earning courses** (organisation "P2E (GenU)") | Labelled as Passport to Earning and preferred for Start Here. Built-in sample courses now say "(sample)" |

Plans on real data after the fixes:
- **Tunde, 21, Lagos, customer service:** Start is a real P2E course. Apply is "Customer sales support in Lagos" (Jobberman Nigeria).
- **Amina, 17, Kano, earn money now, typed market and tailoring work:** no adult listings. Apply is a real UNICEF Nigeria phone task that earns.

Still weak: Yoma has no Kano jobs. The real P2E courses on Yoma are mostly green-skills and hospitality, so Start/Learn matches are approximate until AI tagging is on.

## Open issues for the next sprint

1. **Live check with real services hasn't been run here.** Run it with the team's Azure keys before the demo (below).
2. **Hausa, Yoruba and Pidgin text needs native-speaker review.** It was written for the prototype. Keyword rules for Hausa and Yoruba are also first drafts.
3. **Speech-to-text accuracy for Pidgin, Hausa and Yoruba is unmeasured.** Test with 10 to 20 real voice notes per language. People can always correct or type instead.
4. **Yoma listings have no Nigerian state or minimum age.** In-person listings count as nationwide and the age check assumes 15+.
5. **Small mixed-language bits for Hausa and Yoruba users:** opportunity type labels ("Job", "Learnership"), the message box placeholder and the tester controls are still in English.
6. **Typing while Pathfinder is still "typing" is ignored.** The text stays in the box, so a fast typist may need to press Enter again.
7. **Basic-phone mode is a simulation** in the browser. A real SMS/USSD gateway and guardian SMS codes are next sprint.
8. **Facilitator handoffs and listing reports are only recorded on the phone.** They need a real queue (see [INTEGRATION.md](INTEGRATION.md)).
9. Deferred from review: the access code has no guess limit; work-history years like "2019-2023" are removed as if they were phone numbers; a Yoma reply with only courses is accepted; the client stops waiting for AI reasons after 4 s while the server may keep trying for up to 10 s; skill summaries aren't checked for promise words.
10. **The urgent-help message only lists 112.** GenU needs to add vetted Nigerian youth and mental-health helplines.

## Live check (run this before the demo)

With `.env` filled in and internet access:

```bash
node sync.mjs                       # expect: "live: N opportunities, M courses"
node serve.mjs
curl -s localhost:4173/api/status   # expect: "provider":"azure","chat":true and yoma "source":"live"
curl -s -X POST localhost:4173/api/ai/skills -H 'content-type: application/json' \
  -d '{"text":"I dey sell provisions for market and I fit fix phone","lang":"pcm"}'
# expect: "source":"ai" with market-trading / phone-repair skills
```

Then in the browser at http://localhost:4173:
1. Run scenario 1 (Hausa) and scenario 2 (English adult).
2. Record one real voice note in each of English, Pidgin, Hausa and Yoruba, and write down what was heard.

Record the results in this file.

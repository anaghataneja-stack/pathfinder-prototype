# Pathfinder: handover note for GenU

Pathfinder is Phase 2 of the BBS x GenU journey. It turns a young person's goal into a plan of 3, 5 or 7 steps across Passport to Earning (P2E), Yoma and imaGen, then keeps them moving with weekly check-ins. It receives the **Saved Opportunity** from Ziqi (Phase 1) and hands a **Learning Plan** to SkillLens (Phase 3). Open `/?journey=demo` to see this with the team's shared mock data (Halima and the solar trainee job).

This is prototype code for GenU's team to take forward. It is not production-ready and is not deployed.

## Where to find things

| You need | Look in |
|---|---|
| Setup (Node 18+, no npm packages, `node serve.mjs`) | [README.md](../README.md#quick-start) |
| Environment settings, including model choice | [.env.example](../.env.example) |
| What's real and what's simulated, in full | [README.md](../README.md#whats-real-and-whats-simulated) |
| Prompts, as reviewable files | [prompts/](../prompts) (copies of `lib/ai-tasks.mjs`; the code wins if they differ) |
| How a plan is scored and filtered | [rubrics/plan-scoring.md](../rubrics/plan-scoring.md) |
| Test cases | `test/` (98 unit and API tests) and `e2e/scenarios.mjs` (23 browser scenarios); results in [TESTING.md](TESTING.md) |
| Costs and assumptions | [COSTS.md](COSTS.md) |
| Go-live checklist for a pilot | [PILOT.md](PILOT.md) |
| WhatsApp (RapidPro/FunDoo): setup and the import file | [RAPIDPRO.md](RAPIDPRO.md), `flows/pathfinder-rapidpro.json` |
| Joining the four prototypes (design tokens, YoID, handoffs) | [COHESION.md](COHESION.md), `tokens/yoma-tokens.css` |
| Yoma integration details | [INTEGRATION.md](INTEGRATION.md) |
| RoleMap mock-up (new idea), clickable | [mockups/rolemap/](../mockups/rolemap/index.html), labelled as a mock-up |
| Team's shared mock data | [mockups/SHARED-MOCK-DATA.md](../mockups/SHARED-MOCK-DATA.md) and `shared-mock-data.json` |

## Secrets

No keys are in the repo. `.env` is git-ignored, and the browser never sees the keys. Before handing the repo over, run `git log -p | grep -iE "api_key|secret"` once and rotate anything found.

## What is live, rule-based and mocked

| Part | Status |
|---|---|
| Yoma listings (Nigeria + Worldwide) | **Live:** public Yoma API, synced daily (5,171 listings on 14 Nov 2026), last good copy kept |
| Matching, plan building, scam and safety filters | **Live, rule-based:** deterministic scoring in `engine/plan-engine.js`, the same file for the web app and WhatsApp (see the rubric) |
| Facilitator case inbox (`/staff`) and anonymous pilot counts | **Live:** no names, numbers or typed text stored |
| Skills from informal work, plain-word answers, plan reasons, course ranking, listing tags | **Built on Azure OpenAI, off until keys are added.** Each falls back to keyword rules or reviewed templates, labelled in the app |
| Voice notes | **Built:** Azure transcription when a speech deployment is set |
| Model choice | **Swappable in config:** `AI_PROVIDER=azure`, `openai-compatible` (any OpenAI-compatible server, including a locally hosted open model) or `none` |
| "Continue with Yoma" sign-in, real Yoma skills, saving the plan to the Yoma account | **Built and tested against a mock Keycloak.** Needs Yoma to register a Pathfinder client |
| P2E courses | **Partly real:** 13 P2E courses on Yoma; the rest are labelled samples |
| imaGen challenges | **Sample:** no API access yet |
| Skills Backpack on YoID (plan, confirmed skills, finished courses, applications) | **Mocked writes**, as the brief allows. Asked once with FunDoo's wording; nothing written before a yes; 16 and over only. Real YoID writes need the Yoma team's API |
| WhatsApp through Yoma's RapidPro (FunDoo) flows | **Built, not yet tried live:** webhooks for plan, check-in and Skills Backpack, plus an importable RapidPro flow file, all tested. Not imported into a real RapidPro yet (waiting for the FunDoo sandbox). Messages are English only |
| Journey handoffs (in from Ziqi, out to SkillLens) | **Built with mock data:** the team's shared file; the next-prototype link is set in `NEXT_PROTOTYPE_URL` |
| Facilitator names, guardian SMS code | **Simulated** |

## Handover plan: bringing it into GenU's systems

Done this sprint: the plan engine runs on the server, the WhatsApp webhooks exist, and the RapidPro flows are built as an import file.

1. **Import the flows into the FunDoo sandbox** and run them end to end (steps in [RAPIDPRO.md](RAPIDPRO.md)). Then fold them into FunDoo's own menus: PathFinder becomes a home-menu option, takes age from FunDoo's onboarding, and uses FunDoo's Skills Backpack step instead of its own.
2. **Translate the WhatsApp messages** (the web app already has Pidgin, Hausa and Yoruba text to reuse).
3. **Host on GenU's Azure App Service** (steps in the README). Point `AI_PROVIDER` at Azure or at a government's own model.
4. **Make the YoID writes real.** Replace the mocked Skills Backpack writes with Yoma's YoID API, and issue a credential when a course step is finished (to design with the Yoma team).
5. **Use the Yoma identity on WhatsApp.** Read skills from the person's Yoma account and save plan steps to it, as the web app does after "Continue with Yoma".

**Still missing:** Azure keys; a Pathfinder Keycloak client from Yoma; access to the FunDoo sandbox; a data protection impact assessment; native-speaker review of Hausa, Yoruba and Pidgin; vetted helplines beyond 112; real facilitator names per state; an imaGen data feed.

**Effort to finish (BBS estimate):** about 2 to 3 developer weeks. Sandbox import, FunDoo merge and translations (1 to 1.5), Azure hosting and the live AI check (0.5), real YoID writes and Yoma identity on WhatsApp (0.5 to 1). GenU sign-offs run alongside.

## Known limitations

- The live AI check with real Azure has not been run; all AI tests use a mock.
- Hausa, Yoruba and Pidgin text has not had a native-speaker review.
- Listing tags are redone for every listing on each daily sync, which is slower and costs more than tagging only new ones.
- Location filtering depends on Yoma listings having good location data; Jobberman cities are read from titles.
- WhatsApp list messages allow 10 rows and short titles, so long course and job titles need cutting.
- The RapidPro flow file is checked by tests but has never been imported into a real RapidPro.
- WhatsApp messages are English only.
- YoID writes are mocked; nothing reaches a real YoID yet.
- Some course picks are only loosely related to the goal until Azure listing tags are on (e.g. an aquaculture course for a customer-service goal on real data).
- No testing with real young people yet.

## Suggested next steps

1. Run the live AI check in [TESTING.md](TESTING.md) as soon as Azure keys arrive, and record 10 to 20 real voice notes per language.
2. Import the flows into the FunDoo sandbox and run the full journey there.
3. Tag only new or changed listings in the daily sync.
4. Pilot with one facilitator group in one state, and measure facilitator time saved per young person.
5. Feed step drop-off (who starts a course but never applies) back to Ziqi as a course quality signal.

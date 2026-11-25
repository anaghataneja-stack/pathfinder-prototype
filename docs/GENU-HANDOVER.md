# Pathfinder: handover note for GenU

Pathfinder is Phase 2 of the BBS x GenU journey. It turns a young person's goal into a plan of 3, 5 or 7 steps across Passport to Earning (P2E), Yoma and imaGen, then keeps them moving with weekly check-ins. It receives the **Saved Opportunity** from Ziqi (Phase 1) and hands a **Learning Plan** to SkillLens (Phase 3).

This is prototype code for GenU's team to take forward. It is not production-ready and is not deployed.

## Where to find things

| You need | Look in |
|---|---|
| Setup (Node 18+, no npm packages, `node serve.mjs`) | [README.md](../README.md#quick-start) |
| Environment settings, including model choice | [.env.example](../.env.example) |
| What's real and what's simulated, in full | [README.md](../README.md#whats-real-and-whats-simulated) |
| Prompts, as reviewable files | [prompts/](../prompts) (copies of `lib/ai-tasks.mjs`; the code wins if they differ) |
| How a plan is scored and filtered | [rubrics/plan-scoring.md](../rubrics/plan-scoring.md) |
| Test cases | `test/` (87 unit and API tests) and `e2e/scenarios.mjs` (20 browser scenarios); results in [TESTING.md](TESTING.md) |
| Costs and assumptions | [COSTS.md](COSTS.md) |
| Go-live checklist for a pilot | [PILOT.md](PILOT.md) |
| Moving to WhatsApp | [RAPIDPRO.md](RAPIDPRO.md) |
| Yoma integration details | [INTEGRATION.md](INTEGRATION.md) |
| RoleMap mock-up (new idea), clickable | [mockups/rolemap/](../mockups/rolemap/index.html), labelled as a mock-up |
| Team's shared mock data | [mockups/SHARED-MOCK-DATA.md](../mockups/SHARED-MOCK-DATA.md) and `shared-mock-data.json` |

## Secrets

No keys are in the repo. `.env` is git-ignored, and the browser never sees the keys. Before handing the repo over, run `git log -p | grep -iE "api_key|secret"` once and rotate anything found.

## What is live, rule-based and mocked

| Part | Status |
|---|---|
| Yoma listings (Nigeria + Worldwide) | **Live:** public Yoma API, synced daily (5,171 listings on 14 Nov 2026), last good copy kept |
| Matching, plan building, scam and safety filters | **Live, rule-based:** deterministic scoring in `pathfinder.html` (see the rubric) |
| Facilitator case inbox (`/staff`) and anonymous pilot counts | **Live:** no names, numbers or typed text stored |
| Skills from informal work, plain-word answers, plan reasons, course ranking, listing tags | **Built on Azure OpenAI, off until keys are added.** Each falls back to keyword rules or reviewed templates, labelled in the app |
| Voice notes | **Built:** Azure transcription when a speech deployment is set |
| Model choice | **Swappable in config:** `AI_PROVIDER=azure`, `openai-compatible` (any OpenAI-compatible server, including a locally hosted open model) or `none` |
| "Continue with Yoma" sign-in, real Yoma skills, saving the plan to the Yoma account | **Built and tested against a mock Keycloak.** Needs Yoma to register a Pathfinder client |
| P2E courses | **Partly real:** 13 P2E courses on Yoma; the rest are labelled samples |
| imaGen challenges | **Sample:** no API access yet |
| YoID credential for a finished plan step | **Designed, not built** |
| WhatsApp through Yoma's RapidPro (FunDoo) flows | **Mapped, not built:** see [RAPIDPRO.md](RAPIDPRO.md) |
| Facilitator names, guardian SMS code | **Simulated** |

## Handover plan: bringing it into GenU's systems

1. **Move the plan engine to the server.** `compute()` and `buildPlan()` run in the browser today. Move them to `lib/plan.mjs` so the web app and a webhook share one engine.
2. **Add the WhatsApp webhooks.** `POST /api/plan` (intake answers + Yoma user id in, steps out) and `POST /api/plan/:id/checkin`.
3. **Build the RapidPro flows** in the Yoma team's FunDoo workspace, after the YoID sign-up and skills backpack steps: intake, plan, weekly check-in campaign, urgent-help handoff.
4. **Host on GenU's Azure App Service** (steps in the README). Point `AI_PROVIDER` at Azure or at a government's own model.
5. **Record progress on YoID.** Save plan opportunities through the Yoma API (built), then issue a credential when a step is finished (to design with the Yoma team).

**Still missing:** Azure keys; a Pathfinder Keycloak client from Yoma; access to the FunDoo sandbox; a data protection impact assessment; native-speaker review of Hausa, Yoruba and Pidgin; vetted helplines beyond 112; real facilitator names per state; an imaGen data feed.

**Effort to finish (BBS estimate):** about 3 to 4 developer weeks. Plan engine and webhooks with tests (1 to 1.5), RapidPro flows (1), Azure hosting and the live AI check (0.5), YoID credential write (0.5 to 1). GenU sign-offs run alongside.

## Known limitations

- The live AI check with real Azure has not been run; all AI tests use a mock.
- Hausa, Yoruba and Pidgin text has not had a native-speaker review.
- Listing tags are redone for every listing on each daily sync, which is slower and costs more than tagging only new ones.
- Location filtering depends on Yoma listings having good location data; Jobberman cities are read from titles.
- WhatsApp list messages allow 10 rows and short titles, so long course and job titles need cutting.
- No testing with real young people yet.

## Suggested next steps

1. Run the live AI check in [TESTING.md](TESTING.md) as soon as Azure keys arrive, and record 10 to 20 real voice notes per language.
2. Do the server move and webhooks, then run the full flow in the FunDoo sandbox.
3. Tag only new or changed listings in the daily sync.
4. Pilot with one facilitator group in one state, and measure facilitator time saved per young person.
5. Feed step drop-off (who starts a course but never applies) back to Ziqi as a course quality signal.

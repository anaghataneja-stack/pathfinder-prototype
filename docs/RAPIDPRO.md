# Pathfinder on WhatsApp: aligning with Yoma's RapidPro sandbox

Client feedback (November 2026):
- **Ben** liked that Pathfinder uses RapidPro, which UNICEF co-created.
- **Camila** will share Yoma's existing **WhatsApp/RapidPro sandbox**. It's connected to youth identity and credentials, and lets young people see their credentials on WhatsApp, build a CV and get recommended next steps.

The plan is to align with that sandbox, or merge into it, instead of building a separate bot.

This doc maps Pathfinder's flow onto RapidPro, so the team is ready as soon as the sandbox is shared.

## What already lines up

| Pathfinder today | RapidPro equivalent |
|---|---|
| Button and numbered replies, never free chat | WhatsApp quick replies and lists / SMS numbered menus (`wait_for_response` + `switch` on the answer) |
| Basic-phone mode (`Phone → Basic phone`) | The same flow on an SMS channel |
| Six intake questions + plan size | Flow nodes saving to contact fields (`@fields.pf_goal`, `pf_sector`, `pf_state`, `pf_hours`, `pf_data`, `pf_size`) |
| Plan-reason templates in 4 languages | RapidPro flow translations (en, pcm, ha, yo) |
| Weekly check-ins | A RapidPro **campaign** event every Monday after `@fields.pf_plan_saved_on` |
| Two missed check-ins, help or urgent words → a facilitator | A `send_email`/webhook to the case inbox (`POST /api/cases`) and a `start_session` into a human-agent ticket |
| DELETE / RESTART keywords | RapidPro keyword triggers |
| "Continue with Yoma" | Already solved in the sandbox: the contact is linked to the Yoma identity |

## What is built now

The WhatsApp version uses **the same plan engine** as the web app (`engine/plan-engine.js`). The server runs it for RapidPro, so a plan on WhatsApp and a plan on the web match.

| Part | File |
|---|---|
| Plan webhook `POST /api/rapidpro/plan` | `lib/server.mjs`, `lib/plan-server.mjs` |
| Check-in webhook `POST /api/rapidpro/checkin` | `lib/server.mjs` |
| Skills Backpack webhook `POST /api/rapidpro/backpack` | `lib/server.mjs` |
| RapidPro import file (2 flows, weekly campaign, keywords, fields, group) | `flows/pathfinder-rapidpro.json`, rebuilt by `node flows/build-flow.mjs` |
| Tests | `test/rapidpro.test.mjs`, `test/engine.test.mjs` |

**Flow 1, "Pathfinder: goal to plan"** (keyword **PLAN**):
- Asks language, age, current work, goal, type of work, state, hours, data budget, and plan size (3, 5 or 7).
- Ages 15–17 must get a parent or guardian's OK first. Other ages get a "for 15 to 24" message.
- Calls the plan webhook, then sends the plan and the handoff line *"Plan step: complete a P2E course: …"*.
- Saves `pf_plan_id` and `pf_plan_saved_on` on the contact.

- Then, for ages 16 to 24, offers the **Skills Backpack** (see below). A yes calls `POST /api/rapidpro/backpack`.

**Flow 2, "Pathfinder: weekly check-in"** (keyword **CHECKIN**, plus a campaign every week for 6 weeks after the plan is saved):
- Replies: 1 done, 2 still doing, 3 not started, 4 need help.
- Two stalls, or "need help", opens a facilitator case with a case code.

**What the webhooks keep:** only the answers given as menu choices, and plan progress. They keep no name, phone number or typed text.

## Fitting into FunDoo (UNICEF's chat bot)

We were given the **FunDoo chat-flow chart** and its Telegram sandbox bot (`fundoo_sandbox_bot`). FunDoo is the "digital life coach" that Yoma's WhatsApp work builds on, so PathFinder should be one more thing FunDoo can do, not a separate bot.

What the chart shows, and what PathFinder now does to match:

| FunDoo | PathFinder |
|---|---|
| **Skills Backpack**: certificates, skills and achievements, stored on the young person's **YoID** | Plan, self-declared skills, finished courses and applications go into the same Skills Backpack (mocked writes) |
| Asked once: *"Would you like to activate your Skills Backpack now?"* 1️⃣ Yes, activate it · 2️⃣ Tell me more · 3️⃣ Not now | The same question and options, asked once when the plan is first saved, on the web and on WhatsApp. Nothing is written before a yes; "Not now" writes nothing |
| *"Your information is private, secure, only shared with your permission"* | The same promise, in English, Pidgin, Hausa and Yoruba |
| **Only users aged 16 or over can get a YoID** | 15-year-olds still get a plan, but aren't offered the Skills Backpack and nothing goes to YoID |
| Menus numbered 1️⃣ 2️⃣ 3️⃣; reply with the number | The WhatsApp flow uses the same numbering |
| Onboarding already asks name, age, country, gender | When merged, PathFinder should take age from FunDoo instead of asking again |
| Type **FUNDOO** to return to the home menu | When merged, PathFinder becomes a home-menu option ("Make a plan"), and its "Not now" paths go back to HOME |
| Backpack levels from FunRuns (Explorer 0–10, Builder 11–30, Achiever 31–60, Trailblazer 60+) and points | Not done. Finished PathFinder steps could count as FunRuns; to agree with the FunDoo team |

Questions on the chart that PathFinder also depends on:
1. Can FunDoo users get a link to register on Yoma automatically, using their phone number? (PathFinder's "Continue with Yoma" needs a Yoma account.)
2. Can certificates and skills in the Skills Backpack be added to the CV automatically? (This is the hand-on to YoCV in Phase 4.)
3. Is the chart's gamified version (a 3-question challenge to unlock the backpack) the one going ahead?

## How to set it up (once Camila shares the sandbox)

1. Run Pathfinder somewhere RapidPro can reach over HTTPS, with a long random token in `.env`:
   ```
   RAPIDPRO_TOKEN=<long random text>
   ```
2. In RapidPro: **Settings → Import**, and choose `flows/pathfinder-rapidpro.json`.
3. In RapidPro: **Globals**, add:
   - `pathfinder_url`, set to the server address (e.g. `https://pathfinder.example.org`, no slash at the end);
   - `pathfinder_token`, set to the same value as `RAPIDPRO_TOKEN`.
4. Send **PLAN** to the sandbox number to try it.

Without `RAPIDPRO_TOKEN`, the webhooks are switched off (404). With a wrong token they refuse the request (401).

**Not yet tried in a real RapidPro.** The file is checked by tests (every exit leads to a real node, every webhook has a success and failure path, the guardian check is there), but nobody has imported it yet because we don't have the sandbox.

## Still to do

1. **Merge with the sandbox's own flows** instead of running alongside them, once we see them. Identity should come from the sandbox contact (the Yoma account), not new questions.
2. **Translations.** The flow and webhook messages are English only. The web app already has Pidgin, Hausa and Yoruba text to copy across.
3. **Yoma identity in the webhook.** Read the person's skills from Yoma (`/user/skills`) and save plan steps to their account, as the web app does after "Continue with Yoma".
4. **Message length.** Plans fit in one WhatsApp message (under 4,000 characters). SMS needs one message per step.
5. **Urgent words** in free-text replies should go straight to a facilitator, as on the web.

## Questions for Camila when the sandbox is shared

1. Which RapidPro workspace and channel (WhatsApp number, SMS shortcode) does the sandbox use?
2. How does a flow get the young person's Yoma identity and a token to call the Yoma API on their behalf?
3. Is there already a "recommended next steps" flow that Pathfinder's plan should replace or feed?
4. Which languages are enabled in the workspace?
5. Who handles human-agent tickets today? This decides where Pathfinder's urgent cases should go.

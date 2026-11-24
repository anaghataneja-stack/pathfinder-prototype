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

## What needs building

1. **Plan building on the server.**
   - Matching and plan building run in the browser today (`pathfinder.html`).
   - RapidPro needs a webhook that returns a plan, e.g. `POST /api/plan` with the intake answers (and the Yoma user id from the sandbox), replying with the steps and openings as short text blocks.
   - This means moving `compute()` / `buildPlan()` into `lib/` so the browser and the webhook share one engine.
2. **Check-in webhook.** `POST /api/plan/:id/checkin` records done, applied counts and stalls, and returns the next message.
3. **Message length.** WhatsApp list messages allow 10 rows and short titles. Long titles should be cut to about 24 characters with the full text in the row description. SMS needs one message per step.
4. **Identity.** In the sandbox, the Yoma account is already known. The plan webhook should read skills from Yoma (`/user/skills`) for that user, and save plan steps with `/myopportunity/action/{id}/save`, as Pathfinder now does after "Continue with Yoma".

## Questions for Camila when the sandbox is shared

1. Which RapidPro workspace and channel (WhatsApp number, SMS shortcode) does the sandbox use?
2. How does a flow get the young person's Yoma identity and a token to call the Yoma API on their behalf?
3. Is there already a "recommended next steps" flow that Pathfinder's plan should replace or feed?
4. Which languages are enabled in the workspace?
5. Who handles human-agent tickets today? This decides where Pathfinder's urgent cases should go.

## Suggested next sprint

- Move matching into `lib/plan.mjs`, with the browser and server both using it.
- Add `POST /api/plan` and check-in webhooks with tests.
- Build the intake + plan + check-in flows in the sandbox workspace.

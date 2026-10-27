# Pathfinder prototype

A clickable prototype of **Pathfinder** (Concept 1, the Goal-to-Plan Navigator) for GenU. Pathfinder turns a young person's goal into three ordered steps across Passport to Earning (P2E), Yoma and imaGen, then keeps them moving with weekly check-ins.

> **Prototype only.** Every course, opportunity, employer and facilitator in this file is invented sample data. The prototype date is fixed at Monday 26 October 2026.

## Run it

Open `pathfinder.html` in any modern browser. It's a single file with no build step and nothing to install; it only loads Google Fonts.

## What you can try

The flow follows the three stages shown at the top of the page:

1. **Tell us your goal.** A consent and age check, then six tap-to-answer questions: language (English or Nigerian Pidgin), goal, sector, state, weekly hours and data budget. Pathfinder asks before reading the user's Yoma profile.
2. **Get your 3-step plan.** Start Here, Learn Here and Apply Here, each with a one-line reason, hours, weeks and deadline. Swap any step, or choose "None of these fit" to get a lighter plan, a different sector or place, or a person.
3. **Weekly check-ins.** After saving, "Skip ahead to Monday" moves time forward. Two missed check-ins in a row, or asking for help, hands the case to a facilitator. Finishing the last step marks the application as Applied on Yoma.

Controls above the phone:

- **Test as** Amina (17, Kano), Tunde (21, Lagos) or a new user. Each has a different sample Yoma record, so the same answers produce different skill gaps.
- **Phone**: smartphone (WhatsApp-style buttons) or basic phone (SMS with numbered replies). You can also type a number, `DELETE` or `RESTART`.

The **Behind the scenes** panel shows the stored answers, which listings were removed and why, the skill gap, the saved plan's progress and what a facilitator sees.

## How matching works

1. Drop listings the user can't act on: no clear deadline, broken link, past deadline, too young, outside their state, or too data-heavy for their budget.
2. Score the remaining opportunities on goal type, sector, location, skills already on the Yoma profile, and whether P2E teaches the missing skills. The best one becomes **Apply Here**.
3. **Learn Here** is the course that covers the most missing skills (ties go to the user's sector, then the shorter course).
4. **Start Here** is an entry-level course with no prerequisites that fits the user's weekly hours, preferring one that unlocks Step 2.

Each plan reason comes from a fixed template. In the full design, Azure OpenAI writes these lines from the listing's own fields, and under-18s get reviewed templates like these.

## Not included yet

- A live connection to the Yoma API, the P2E catalogue or RapidPro
- Hausa, Yoruba and Igbo, and voice notes
- Concepts 2 to 4 (Referrals, Peer Pathways, Transition Guide)

The Pidgin text has not been reviewed by a native speaker yet.

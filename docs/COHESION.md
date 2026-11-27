# Joining the four prototypes into one journey

This is how PathFinder meets the cohesion requirements. Other teams can reuse the shared files listed here.

## 1. Shared design tokens (Yoma's look)

`tokens/yoma-tokens.css` holds Yoma's real brand values, taken from Yoma's own web app (`src/web/src/styles/colors.css` and `globals.css` in the Yoma repository):

| Token | Value | Use |
|---|---|---|
| `--yoma-purple` | `#41204b` | primary: headers, main buttons |
| `--yoma-green` | `#387f6a` | success, done, "apply" |
| `--yoma-blue` | `#4cade9` | info |
| `--yoma-orange` | `#f9ab3e` | warnings, highlights |
| `--yoma-pink` | `#fe4d57` | errors, urgent |
| `--yoma-purple-tint`, `--yoma-green-light`, `--yoma-blue-light`, `--yoma-orange-light`, `--yoma-beige`, greys | | soft backgrounds |
| `--yoma-font-display` / `--yoma-font-body` | Nunito / Open Sans | headings / text |

The file also has spacing, radius and shadow tokens, **semantic roles** (`--yoma-primary`, `--yoma-surface`, `--yoma-success-soft`…) and a dark mode.

**How to use it:**
- **Plain HTML:** add `<link rel="stylesheet" href="/tokens/yoma-tokens.css">` and use `var(--yoma-…)`.
- **React/Tailwind:** import the CSS file once and map Tailwind colours to the variables.
- **Don't hard-code colours, fonts or spacing.** A test (`test/html.test.mjs`) fails if PathFinder's CSS contains a literal colour.

To keep one copy, the tokens file can move to a shared repository that every prototype pulls from. PathFinder will switch to that copy once it exists.

## 2. YoID as the thread

Each achievement in PathFinder is written to the young person's **Skills Backpack** on YoID, the same backpack UNICEF's FunDoo bot uses. These are **mocked writes**, which the brief allows.

- The young person is asked once, when the plan is first saved, with FunDoo's wording: *Yes, activate it / Tell me more / Not now*. Nothing is written before a yes.
- YoID is for 16 and over (FunDoo's rule), so 15-year-olds aren't offered it.
- The chat shows "Added to your Skills Backpack (YoID): …" and the Behind the scenes panel lists the records.

| Moment | YoID record |
|---|---|
| Confirms skills from their own work | `skills`: self-declared skills (labelled self-declared, not verified) |
| Saves the plan | `plan`: the plan and its steps |
| Finishes a course step | `course`: course finished |
| Applies to openings | `applied`: how many openings they applied to |

In the live build these become credential writes through Yoma's YoID (see [INTEGRATION.md](INTEGRATION.md)).

## 3. Handoff to the next prototype

Set `NEXT_PROTOTYPE_NAME` and `NEXT_PROTOTYPE_URL`, e.g. `YoCV` and `https://…/?from=pathfinder`. PathFinder then shows a **"Next: continue in YoCV →"** button once the plan is saved and again at the end of the plan.

## 4. The journey: what comes in and what goes out

PathFinder is **Phase 2** of the journey diagram.

| | Item (named as on the slides) | How it travels |
|---|---|---|
| **In** from Phase 1 · Ziqi | **Saved Opportunity** (*a verified opportunity and the user's goal*) | link `?from=ziqi&listing=<id>&goal=job` |
| **Out** to Phase 3 · SkillLens | **Learning Plan** (*plan step: complete a P2E course*) | link `?from=pathfinder&plan=<id>&course=<id>&course_title=…&listing=<id>&goal=…` |

The bold names are the team's (from `mockups/SHARED-MOCK-DATA.md`); the words in brackets are the journey diagram's. The screen shows both, so it matches the slides either way.

On screen:
- The chat opens with a **"From Ziqi"** card showing the listing, marked "Verified on Yoma". PathFinder doesn't ask the goal again.
- The listing stays in the plan's Apply step, so Phase 4 (YoCV) can apply to the same listing.
- After saving, a **"Handing on to SkillLens"** card names the P2E course, with the "Next: continue in SkillLens →" button.

## 5. Shared mock data

**Shared mock data** means one made-up young person, job, course and credential that all four prototypes use, so the demo reads as one story instead of four.

PathFinder uses the team's file, `mockups/shared-mock-data.json` (explained in `mockups/SHARED-MOCK-DATA.md`). The server also shares it at `GET /api/journey`, open to other sites, so other teams can fetch it.

| | Mock value |
|---|---|
| Young person | Halima Y., 20, Kaduna, fixes phones at a market stall, wants a paid job in solar or electronics |
| Saved Opportunity (Phase 1 → 2) | Solar Installation Assistant (Trainee), Sunrise Solar Ltd · `opp-job-001` |
| Learning Plan (Phase 2 → 3) | Working Safely at Height → Solar PV Installation Basics → apply · `plan-001` |
| Course SkillLens tests | Solar PV Installation Basics · `opp-course-001` |
| Scam listing PathFinder must remove | Solar Sales Agent (pay ₦5,000 registration fee) · `opp-job-002` |

Open `/?journey=demo` to run PathFinder with this data, as if Ziqi had just handed over. The plan matches the shared Learning Plan, the scam job appears under "removed" in Behind the scenes, and the SkillLens link carries `plan=plan-001`, `course=opp-course-001` and `listing=opp-job-001`.

**Still to agree with the other teams:**
- Ziqi's real link format, if it differs from `?from=ziqi&listing=…&goal=…`.
- SkillLens's address, set in `NEXT_PROTOTYPE_URL`.
- Moving `tokens/` and `mockups/shared-mock-data.json` to one shared repository.

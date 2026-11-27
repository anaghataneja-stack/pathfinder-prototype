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
| **In** from Phase 1 · Ziqi | *A verified opportunity and the user's goal* | link `?from=ziqi&listing=<id>&goal=job` |
| **Out** to Phase 3 · SkillLens | *Plan step: complete a P2E course* | link `?from=pathfinder&course=<id>&course_title=…&listing=<id>&goal=…` |

On screen:
- The chat opens with a **"From Ziqi"** card showing the listing, marked "Verified on Yoma". PathFinder doesn't ask the goal again.
- The listing stays in the plan's Apply step, so Phase 4 (YoCV) can apply to the same listing.
- After saving, a **"Handing on to SkillLens"** card names the P2E course, with the "Next: continue in SkillLens →" button.

## 5. Shared mock data

**Shared mock data** means one made-up young person, listing, course and credential that all four prototypes use, so the demo reads as one story instead of four.

It lives in `data/shared-journey.json`, and the server shares it at `GET /api/journey` (open to other sites, so other teams can fetch it):

| | Mock value |
|---|---|
| User | Tunde, 21, Lagos, wants a job · YoID `YOID-DEMO-0001` |
| Listing (Phase 1 finds it, Phase 4 applies to it) | Customer Care Trainee, BrightLine Contact Centre, Lagos |
| Course (Phase 2 plans it, Phase 3 certifies it) | Customer Service Fundamentals (P2E, 10 hours) |
| Credential (Phase 3 saves it) | Customer Service Fundamentals · Level 2 |

Open `/?journey=demo` to run PathFinder with this data, as if Ziqi had just handed over.

**Still to agree with the other teams:**
- That they use these same mock values (or send us theirs, and we'll change the file).
- Ziqi's real link format, if it differs from `?from=ziqi&listing=…&goal=…`.
- SkillLens's address, set in `NEXT_PROTOTYPE_URL`.
- Moving `tokens/` and `data/shared-journey.json` to one shared repository.

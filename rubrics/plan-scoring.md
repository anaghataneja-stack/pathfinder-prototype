# Rubric: how Pathfinder filters and scores a plan

Source of truth: `compute()`, `buildPlan()`, `oppBlock()` and `courseBlock()` in `engine/plan-engine.js` (the same file runs in the web app and behind the WhatsApp webhooks). This file explains them for reviewers; if they differ, the code wins.

## 1. Filters: removed before scoring

Every removed listing is shown with its reason in the app's "Behind the scenes" panel.

| Openings are removed when… | Courses are removed when… |
|---|---|
| The young person reported it | The young person reported it |
| They applied in an earlier plan | They finished it in an earlier plan |
| It's for organisations, not individuals | It has closed or expired |
| It's for another country | It's video-heavy and their data budget is low (unless it works offline) |
| It asks for a fee or payment (scam check) | |
| It has no clear deadline ("ongoing") or a broken link | |
| Its deadline has passed | |
| They're under its minimum age | |
| It's outside their state (or in person when they chose online) | |

## 2. Scoring openings

| Factor | Points |
|---|---|
| Opening type fits the goal (by the goal's preference order) | +4, then −0.5 per place down the list; −2 if not on the list |
| Goal is "earn money now" and it earns now | +1.5 |
| Sector matches / open to all sectors / different sector | +4 / +1 / −3 |
| In their state / open to all states / remote (not on low data) | +2 / +1.5 / +1 |
| Each skill they already have | +1 |
| Each skill they lack | −0.5 |
| Each lacking skill no available course teaches | −1.5 more |

Openings below 2 points only fill a step when nothing better is left. Each Apply step shows up to 3 openings, one per employer first. Career Apply steps keep to the kinds of opening the goal asks for (a job goal gets jobs and apprenticeships) when there are enough of them.

**Journey mode** (`?journey=demo` or a link from Ziqi): the Saved Opportunity always leads the first career Apply step. Only the scam and age checks apply to it, because Ziqi has already checked it.

## 3. Choosing courses

- **Learn steps** cover the skills the target openings need that the person lacks, weighted by how many openings need each skill (×3), plus title overlap with the openings (up to +2), same sector (+1), a real P2E course (+1), fits their weekly hours (+1, else −1), heavy data on a low budget (−1) and, with Azure on, the AI's ranking (up to +3).
- **Start Here** prefers a real P2E course on Yoma that matches the openings. Otherwise an entry-level course, preferring a prerequisite of a Learn step (+5) and P2E (+3).
- Spare Learn slots go to job-ready courses (CV, interviews, job search, communication).
- In journey mode, the courses named in the shared Learning Plan come first (+10), so the demo shows the same plan as the shared mock data.

## 4. GenU's new criterion: the time and cost of not having it

Scored per feature in the deck and in [docs/COSTS.md](../docs/COSTS.md): what the manual process costs today in staff hours and money, set against the feature's running cost. For Pathfinder: about 6,700 facilitator hours (≈ $26,700) a month at 20,000 young people, against about $2,560 a month to run on WhatsApp. Both are BBS estimates for GenU to confirm.

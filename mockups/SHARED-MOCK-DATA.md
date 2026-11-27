# BBS x GenU shared mock data

**Everything here is fictional.** Version 1.1 (counts-only update). Use it in all four prototypes and all four new-idea mock-ups so GenU sees the same person, job, course and credential the whole way through. The full data is in `shared-mock-data.json`.

## The story in one line

Halima, 20, fixes phones at a market stall in Kaduna. She finds a solar trainee job (Phase 1), gets a plan to qualify (Phase 2), proves her solar skill (Phase 3), and applies with a verified CV (Phase 4). The employer created that job with RoleMap.

## The young person

| Field | Value |
|---|---|
| Name | Halima Yusuf (show as "Halima Y.") |
| Age, gender | 20, female (adult on purpose: under-18s need guardian consent) |
| Where | Kaduna North, Kaduna State |
| Languages | Hausa, English |
| Phone | Smartphone, low data, uses WhatsApp |
| Informal work | Fixes phones and sells accessories at her aunt's stall in Kaduna Central Market |
| Goal | A paid job in solar or electronics |
| YoID | `yoid-ng-7f3a0123` |
| Internal anonymous code | A12 (partners never see it: Talent Finder and RoleMap show counts only) |

## The handoffs (same names on every slide)

| From → to | Handoff item | Data id |
|---|---|---|
| Ziqi → PathFinder | **Saved Opportunity** | `opp-job-001` |
| PathFinder → SkillLens | **Learning Plan** | `plan-001` |
| SkillLens → YoCV | **Skill Credential** | `cred-002` |
| YoCV → employer | **Job Application** | `app-001` |

## Key opportunities

| Id | Type | Title | Org | Notes |
|---|---|---|---|---|
| `opp-job-001` | Job | Solar Installation Assistant (Trainee) | Sunrise Solar Ltd | **The journey's job.** ₦85,000/month, Mon to Sat. Made with RoleMap. Grade A- |
| `opp-course-001` | Course | Solar PV Installation Basics | Passport to Earning | 12 hrs, works offline. Grade A, gold partner badge |
| `opp-course-002` | Course | Working Safely at Height | Passport to Earning | 3 hrs. Start Here step |
| `opp-course-003` | Course | Customer Service Basics | Passport to Earning | Already completed |
| `opp-course-004` | Course | Digital Literacy Essentials | Passport to Earning | Already completed |
| `opp-event-001` | Event | Kaduna Youth Green Jobs Fair | Arewa Tech Hub | 12 Dec 2026. Drafted by the AI co-author |
| `opp-impact-001` | Impact action | Community Tree Planting Day | Kaduna Green Youth Network | 29 Nov 2026, photo + location proof |
| `opp-course-005` | Course | Advanced Electrical Wiring | Arewa Tech Hub | **Dead link**, grade D (for Ziqi demos) |
| `opp-job-002` | Job | Solar Sales Agent (pay ₦5,000 registration fee) | FastTrack Solar Agents | **Scam**, must be filtered out |

## Halima's credentials (on YoID)

| Id | Credential | Status |
|---|---|---|
| `cred-001` | Digital Literacy Essentials | Verified |
| `cred-002` | Solar PV Basics: practical challenge passed | Verified (mocked, issued by SkillLens) |
| `cred-003` | Working Safely at Height | Verified |
| `cred-004` | Community Tree Planting Day | Verified after AI proof review |
| `cred-005` | Customer Service Basics | Verified |
| `cred-006` | Phone repair and sales, 2 years | **Self-declared**, with a reference letter |

## Who uses what

| Prototype or mock-up | Uses |
|---|---|
| Phase 1 Ziqi | All opportunities and their grades; Halima saves `opp-job-001` |
| Phase 2 PathFinder | Halima + `opp-job-001` → plan: Height Safety → Solar PV Basics → apply |
| Phase 3 SkillLens | 10-minute challenge after Solar PV Basics; passes on attempt 2 → `cred-002` |
| Phase 4 YoCV | CV from verified credentials plus self-declared phone repair; QR check; applies to `opp-job-001` |
| AI proof review (Charisse) | 4 proofs for the tree planting day: Halima's passes (0.93); a reused photo, an AI-looking image and a mismatched certificate go to a reviewer |
| AI co-author (Jongmin) | Arewa Tech Hub's one-line note → full listing for the jobs fair |
| Talent Finder (Nathan) | Search "young women 18 to 24, digital skills, Kaduna" → 214 matches as **counts only** (by area and extra skills), then an opt-in notification; Halima is one of them |
| RoleMap (Anagha) | Sunrise Solar's description → 5 tasks → 38 matches as **counts only** (9 before dropping the diploma; by distance and language) → Ziqi checks the listing (A-) → opt-in invites; Halima is one of the 38 |

## Rules for the team

- **Partners see counts, not people.** Yoma's AI use-case note (19 Nov) asks for Talent Finder to "see counts only" and send opt-in notifications. Any partner-facing screen shows numbers, never individual young people, until a young person opts in.

- Use these names, ids and numbers exactly; don't invent new people for your screens.
- Need something that isn't here? Add it to the JSON and tell the team, so the next person sees it.
- `solar-install` and `work-at-height` are now in PathFinder's skill list too. PathFinder's `?journey=demo` loads this file (served at `/api/journey`).
- All links point to `example.org`; none are real.
- Label every screen that uses this data as a mock-up or sample data.

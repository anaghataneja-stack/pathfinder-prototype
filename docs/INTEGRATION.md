# Pathfinder and Yoma: integration

This doc covers three things:
- how the prototype connects to Yoma and Azure today;
- where each part would live in Yoma's own code ([didx-xyz/yoma](https://github.com/didx-xyz/yoma): a .NET API, a Next.js web app and Keycloak sign-in);
- what a live GenU pilot still needs.

## 1. Connections today

| Connection | Endpoint | Auth | Status |
|---|---|---|---|
| Yoma opportunity search | `POST https://api.yoma.world/api/v3/opportunity/search` with `{pageNumber, pageSize: 100, countries: [NG, WW ids]}` | none (public) | **Live**, daily sync with paging |
| Yoma country list | `GET /api/v3/opportunity/search/filter/country` (finds the Nigeria and Worldwide ids) | none | **Live** |
| Yoma platform totals | `GET /api/v3/analytics/platform/metrics/info` | none | **Live** |
| Azure OpenAI chat | `POST {endpoint}/openai/deployments/{chat}/chat/completions?api-version=2024-10-21`, JSON mode | `api-key` header (server only) | **Live** when `.env` is set |
| Azure OpenAI transcription | `POST {endpoint}/openai/deployments/{transcribe}/audio/transcriptions` (multipart, language hint en/ha/yo) | `api-key` header | **Live** when a speech deployment is set |

Why the calls go through the server:
- **Browsers can't call Yoma directly.** The Yoma API only accepts browser calls from `yoma.world` (CORS rules in `helm/yoma-api/conf/prod/values.yaml`). So all Yoma calls go through the Pathfinder server, which also lets it keep a saved copy.
- **The Azure keys stay out of the browser.** All AI calls also go through the server, behind a per-address rate limit.

How listings are mapped (`lib/yoma.mjs`):

| Yoma field | Pathfinder use |
|---|---|
| `type` | `Learning` becomes a course; `Job`, `Task`, `Event` and `Other` become openings |
| `engagementType` | `Online` means it can be done remotely or from a phone |
| `dateEnd` | the deadline; empty means open-ended |
| `zltoReward` | "earn now" |
| `difficulty` | "no certificate needed" |
| skills, categories and title | skill tags (AI-tagged during the sync when available, keyword rules otherwise) |
| title, summary and description | the scam check |

## 2. Where it would live in Yoma

| Pathfinder part | In Yoma | Notes |
|---|---|---|
| Chat and plan UI (`pathfinder.html`) | A page in `src/web`, e.g. `src/pages/pathfinder/index.tsx` | Reuse `searchOpportunities` in `src/web/src/api/services/opportunities.ts` and Yoma's Tailwind and i18n setup |
| Daily listing sync | Not needed inside Yoma | The API already has the data. Matching would query it directly or through a cached search |
| Listing skill tags (AI enrichment) | A Hangfire job in `src/api` | Yoma already uses Hangfire for partner syncs (Jobberman, JobJack, Substack). Store tags next to the opportunity's existing skills |
| AI tasks (`lib/ai-tasks.mjs`) | A small `Yoma.Core.Infrastructure.AzureOpenAI` project behind an `IPathfinderAIService` | Keep the same checks: known skills only, no promises, no invented numbers, personal details removed first |
| Reading the person's skills | **Built:** "Continue with Yoma" signs in through Yoma's Keycloak (OIDC code flow + PKCE, `lib/yoma-auth.mjs`), then reads `GET /api/v3/user/skills` | Needs a Pathfinder Keycloak client (below). Replaces the sample personas |
| "Saved to your Yoma account" | **Built:** `PUT /api/v3/myopportunity/action/{opportunityId}/save` for every Yoma opportunity in the plan | Same client. The token stays on the Pathfinder server |
| "Applied" / completion | `/myopportunity/action/{id}/verify` (`performActionSendForVerificationManual`) | Uses Yoma's existing verification flow. Zlto is credited when verified |
| Skills from informal work | **New**: a self-declared skills record on the user profile | Must be labelled "self-declared", separate from verified credentials |
| Nigerian jobs | Already live: Yoma's public search includes the Jobberman Nigeria feed (`Yoma.Core.Infrastructure.Jobberman`, polled `0 06,18 * * *`). About 2,800 jobs on 14 Nov 2026 | Location is only in the title, so Pathfinder reads it from there. An explicit state field in Yoma would be more reliable |
| Passport to Earning | 13 P2E courses already on Yoma (organisation "P2E (GenU)") are used as real P2E steps | The full P2E catalogue still needs a feed |

## 2b. Turning on "Continue with Yoma"

Yoma's website signs people in through Keycloak (realm `yoma`, web client `yoma-web`). Pathfinder needs **its own client** in that realm. Ask Yoma (DIDX) to create it with:

| Setting | Value |
|---|---|
| Client ID | `pathfinder` (or as Yoma prefers) |
| Access type | Confidential (with a secret) or public with PKCE. Pathfinder supports both |
| Valid redirect URI | `<PUBLIC_URL>/auth/yoma/callback`, e.g. `https://pathfinder.<host>/auth/yoma/callback`, plus `http://localhost:4173/auth/yoma/callback` for testing |
| Scopes | `openid` |
| Audience | A token the Yoma API accepts for `/user/skills` and `/myopportunity/action/{id}/save` (an audience mapper for the API, as for `yoma-web`) |

Then set `YOMA_AUTH_ISSUER=https://<Yoma Keycloak host>/realms/yoma`, `YOMA_AUTH_CLIENT_ID`, `YOMA_AUTH_CLIENT_SECRET` (if confidential) and `PUBLIC_URL`.

To link from Yoma into Pathfinder, a button on Yoma can open `<PUBLIC_URL>/`. Pathfinder then offers "Connect my Yoma account" at the profile question. Because the person is already signed in to Yoma, Keycloak returns straight away without asking for a password again.

## 3. What a live GenU pilot needs

| Need | Who | Why |
|---|---|---|
| Azure OpenAI resource, chat + speech deployments, in an approved region | GenU / UNICEF IT | Real AI. Region choice for NDPA 2023 and UNICEF data policy |
| Data protection impact assessment covering voice notes and under-18s | GenU / UNICEF legal | Voice audio reaches Azure before personal details can be removed. Minors are involved |
| Native-speaker review of Hausa, Yoruba and Pidgin text | GenU Nigeria | Safety messages must be right |
| Yoma partner agreement + Keycloak client for Pathfinder (see 2b) | Yoma (DIDX) | Switches on "Continue with Yoma": real skills, plan saved to Yoma. The code is built and tested against a fake Keycloak |
| Yoma's WhatsApp/RapidPro sandbox shared | Yoma / Camila | Align or merge Pathfinder's flow ([RAPIDPRO.md](RAPIDPRO.md)) |
| Passport to Earning catalogue API or export | UNICEF P2E team | Replace the sample courses |
| imaGen challenges feed | imaGen | Replace the sample challenges |
| Facilitator list per state + case inbox | GenU Nigeria partners | Real handoffs (today a simulated queue) |
| SMS / USSD gateway (e.g. a Nigerian aggregator) | GenU | Real basic-phone access and guardian SMS codes (next sprint) |
| Vetted youth and mental-health helplines | GenU Nigeria | The urgent-help message currently gives only 112 |
| Hosting: Azure App Service with HTTPS and Always On | GenU IT | Voice and offline need HTTPS. Daily sync needs a running process |
| Report-a-listing review process | GenU + Yoma | Reports are currently only recorded on the phone |

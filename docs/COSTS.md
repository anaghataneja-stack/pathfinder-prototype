# Pathfinder: cost estimate and assumptions

Method (shared across the four BBS prototypes): token usage per run, cost per run, then monthly cost at GenU's scale. A "run" is one young person getting one plan. Token counts are measured from the prompts in `lib/ai-tasks.mjs` (about 4 characters per token).

## Tokens per run

| AI call | Runs per plan | Input tokens | Output tokens |
|---|---|---|---|
| extract-skills | 1 (if the person describes their work) | ~370 | ~60 |
| understand-answer | 0 to 6 (only when the keyword match fails; assume 2) | ~110 each | ~10 each |
| write-reasons | 1 (adults only) | ~250 | ~120 |
| rank-courses | 1 | ~600 | ~60 |
| **Total** | **~5 calls** | **~1,500** | **~300** |

## Per run

| Item | Assumption | Cost per run |
|---|---|---|
| LLM | ~1,500 in + ~300 out at $0.15 / $0.60 per 1M tokens | $0.0004 |
| Voice note transcription | ~1 minute at ~$0.006/min **[confirm on the Azure rate card]** | $0.0060 |
| WhatsApp, after moving to RapidPro | ~12 business messages at ~$0.0101 per Nigerian service/utility message | $0.1212 |
| **Total (WhatsApp)** | | **≈ $0.13** |
| **Total (web app, as today)** | no messaging fees | **≈ $0.006** |

Weekly check-ins on WhatsApp add about $0.01 per check-in message.

## Fixed: daily listing tags

About 260 calls per day (5,171 listings in batches of 20), ~760 input and ~600 output tokens each: about $0.12 a day, or **≈ $3.70 a month**. Tagging only new listings would cut this further.

## Per month (WhatsApp version)

| Scale | Plans/month | AI + voice | WhatsApp | Total |
|---|---|---|---|---|
| Today: 5% of 400k Yoma Nigeria users | 20,000 | ≈ $130 | ≈ $2,420 | ≈ $2,560 |
| Target: 5% of 2M users | 100,000 | ≈ $640 | ≈ $12,120 | ≈ $12,760 |

With a locally hosted open model, the LLM lines become a fixed hosting cost instead.

## Cost of not having it

| Assumption | Value |
|---|---|
| Facilitator time to build one plan by hand | ~20 min **[BBS estimate, confirm with GenU]** |
| Facilitator cost | ~$4/hr **[BBS estimate, confirm with GenU]** |
| At 20,000 young people a month | ≈ 6,700 hours ≈ $26,700/month |

Not counted: young people who give up between P2E, Yoma and imaGen.

## Sources

- Token rates: GPT-4o-mini on Azure at $0.15 / $0.60 per 1M tokens. Third-party trackers report it retired on Azure in March 2026, so use the current small-model rate from https://azure.microsoft.com/pricing/details/azure-openai/
- WhatsApp: Meta charges per service message from 1 Oct 2026; Nigerian utility/service messages about $0.0101 each (Sahara Reporters and ThisDay, Aug 2026)
- Yoma Nigeria users: 400,000, with a plan to reach 2 million (UNICEF Nigeria, Oct 2025)
- Listing count: live sync on 14 Nov 2026 ([TESTING.md](TESTING.md))

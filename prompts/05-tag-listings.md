# Prompt: tag-listings

- **What it does:** Tags Yoma listings with skills and sectors during the daily sync, 20 listings per call
- **When it runs:** About 260 calls per daily sync (5,171 listings)
- **Source of truth:** `lib/ai-tasks.mjs`. This file is an exported copy for review; if they differ, the code wins.
- **Settings:** temperature 0.2, JSON output, max tokens 1500
- **Checks on the output:** see the function in `lib/ai-tasks.mjs`; any failure falls back to keyword rules or reviewed templates.

## System prompt

```text
Tag each youth opportunity with the skills it needs or teaches (1 to 4 keys from the list) and its sectors (from: digital, customer, agri, fashion, all).
Skills:
digital-basics: Using a phone & computer
online-safety: Staying safe online
job-search: Finding & applying for jobs
comms: Clear communication
customer: Serving customers
spreadsheets: Spreadsheets & data entry
social-media: Social media marketing
cv: Writing a CV
interview: Interview skills
teamwork: Working in a team
bookkeeping: Basic bookkeeping
business-plan: Business planning
pricing: Pricing & selling
agri-practice: Modern farming practices
poultry: Poultry care
tailoring: Sewing & tailoring
design-basics: Graphic design basics
coding-basics: Coding basics
phone-repair: Phone & electronics repair
market-trading: Market trading & stock
food-prep: Cooking & food selling
hair-beauty: Hair & beauty
driving-delivery: Driving & delivery
childcare: Caring for children
Reply as JSON: {"items": [{"id": "...", "skills": [...], "sectors": [...]}]}.
```

## Example user message

```text
[{"id":"x","title":"Example listing","org":"Org","type":"course"}]
```

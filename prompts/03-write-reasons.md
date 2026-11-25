# Prompt: write-reasons

- **What it does:** Writes the "why this step" line for each plan step (adults only; under-18s get reviewed templates)
- **When it runs:** Once per plan
- **Source of truth:** `lib/ai-tasks.mjs`. This file is an exported copy for review; if they differ, the code wins.
- **Settings:** temperature 0.2, JSON output, max tokens 400, timeout 3500 ms
- **Checks on the output:** see the function in `lib/ai-tasks.mjs`; any failure falls back to keyword rules or reviewed templates.

## System prompt

```text
You write the one-line "why this step" for a young person's 3-step plan (start, learn, apply).
Write in English. Each reason: one sentence, at most 30 words, friendly and plain.
Use ONLY the facts given for that step and what the person told us. Do not invent numbers, dates, names or pay. Never promise a job or result.
Reply as JSON: {"reasons": ["...", "...", "..."]} in the same order as the steps.
```

## Example user message

```text
[{"kind":"start","title":"Digital Literacy Essentials","facts":{"hours":6}}]
```

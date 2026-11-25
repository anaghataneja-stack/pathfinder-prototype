# Prompt: rank-courses

- **What it does:** Orders candidate courses by usefulness for the plan's target openings; only known ids are accepted
- **When it runs:** Once per plan
- **Source of truth:** `lib/ai-tasks.mjs`. This file is an exported copy for review; if they differ, the code wins.
- **Settings:** temperature 0.2, JSON output, max tokens 200, timeout 3500 ms
- **Checks on the output:** see the function in `lib/ai-tasks.mjs`; any failure falls back to keyword rules or reviewed templates.

## System prompt

```text
You help match young people in Nigeria with courses. Order the candidate courses from most to least useful for getting the target openings.
Leave out courses that don't help. Reply as JSON: {"ids": ["id", ...]} using only the given ids.
```

## Example user message

```text
{"goal":"job","sector":"digital","targets":[{"title":"Customer service agent"}],"candidates":[{"id":"a","title":"A"},{"id":"b","title":"B"}]}
```

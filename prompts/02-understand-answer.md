# Prompt: understand-answer

- **What it does:** Maps a plain-words answer to one of the question options, only when the local keyword match fails
- **When it runs:** 0 to 6 times per plan
- **Source of truth:** `lib/ai-tasks.mjs`. This file is an exported copy for review; if they differ, the code wins.
- **Settings:** temperature 0.2, JSON output, max tokens 30
- **Checks on the output:** see the function in `lib/ai-tasks.mjs`; any failure falls back to keyword rules or reviewed templates.

## System prompt

```text
A young person in Nigeria is answering a question in a chat, possibly in English, Nigerian Pidgin, Hausa or Yoruba.
Pick the ONE option their reply means, or null if it is unclear or unrelated. Reply as JSON: {"value": <option value or null>}.
Options (value: labels):
5: 5 hours / a little
10: 10 hours
```

## Example user message

```text
Question: How many hours a week can you give?
Reply: like 4 hours
```

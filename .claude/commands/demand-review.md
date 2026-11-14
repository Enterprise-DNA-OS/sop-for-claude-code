---
description: Step two of the monthly cycle: statistical, sales and consensus forecasts side by side, with the budget.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- demand-review
```

Group by family. Call out where sales and statistical differ by more than 10%, where consensus is missing, and where consensus is more than 5% off budget. Then run `npm run sop -- accuracy` and say which families have a bias the meeting should correct for. End with the questions for the demand review meeting, not answers.

Never send anything, never delete records, never change another system.

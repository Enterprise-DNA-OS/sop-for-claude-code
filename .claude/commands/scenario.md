---
description: What-if: change demand, supply or capacity and see what happens to stock and line load. Nothing is saved.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- scenario --demand-percent=<n> [--family=<code>] [--supply-follows | --supply-percent=<n>] [--capacity-percent=<n>] [--resource=<code>]
```

Translate the operator's question into flags: "what if the promotion lifts 500 ml sauce 15% and we build to match" is `--demand-percent=15 --family=SAU-500 --supply-follows`. "What if line 1 loses a shift" is `--capacity-percent=-20 --resource=LINE-1`. Report what changes against the current plan, then say clearly that nothing has been saved.

Never send anything, never delete records, never change another system.

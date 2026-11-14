---
description: Record an assumption behind the plan, with an owner and a date to check it.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- assume --text="<assumption>" --owner="<name>" --review-by=YYYY-MM-DD [--family=<code>] --actor="<name>"
```

This writes to the planning database inside one transaction and records who, what and why in the activity log. Say back the change in one line before running it, and run it only with the operator's values.

Never send anything, never delete records, never change another system.

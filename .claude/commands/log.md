---
description: Add a note against a family (a risk raised, a customer call, a supplier issue).
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- log --family=<code> --note="<note>" --actor="<name>"
```

This writes to the planning database inside one transaction and records who, what and why in the activity log. Say back the change in one line before running it, and run it only with the operator's values.

Never send anything, never delete records, never change another system.

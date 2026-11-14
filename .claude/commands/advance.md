---
description: Move the open cycle to its next stage: data, demand review, supply review, pre-S&OP, executive, closed.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- advance --actor="<name>" --evidence="<meeting held>"
```

This writes to the planning database inside one transaction and records who, what and why in the activity log. Say back the change in one line before running it, and run it only with the operator's values. Pre-S&OP needs the consensus signed off; closing needs the executive sign-off and minutes.

Never send anything, never delete records, never change another system.

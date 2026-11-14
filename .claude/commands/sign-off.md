---
description: Sign off the consensus forecast, or record the executive sign-off and minutes.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- sign-off --what=consensus|exec --actor="<name>" [--minutes="<summary>"] --evidence="<meeting>"
```

This writes to the planning database inside one transaction and records who, what and why in the activity log. Say back the change in one line before running it, and run it only with the operator's values. Consensus sign-off refuses while priced families have months with no consensus, unless the operator gives a reason and `--force`.

Never send anything, never delete records, never change another system.

---
description: List every product family with its unit, owner, price, line and target cover.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- list
```

Present as a table. Point out any family with no price, line or target cover: it cannot be planned properly until those are filled in.

Never send anything, never delete records, never change another system.

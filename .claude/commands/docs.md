---
description: Render the branded documents: the executive S&OP pack and a plan sheet per family.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run docs [-- exec-pack | family-plan]
```

Files land in docs-out/. Branding comes from brand.json.

Never send anything, never delete records, never change another system.

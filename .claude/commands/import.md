---
description: Bring planning data across from a Kinaxis workbook exported to CSV.
---

Read CLAUDE.md first. Add `--json` when you need to work with the result. Resolve family and line names with `list` and `resources`; if a name matches more than one, show the candidates and ask. Never invent a number, an actor, a date or evidence.

Run:

```bash
npm run sop -- import kinaxis --file=<csv> --actor="<name>" --dry-run
npm run sop -- import kinaxis --file=<csv> --actor="<name>" [--map=<field-map>] [--update]
```

Read docs/replace-kinaxis.md first. Inspect the real column headers; if they differ, write a field map (see fixtures/field-map.json). Always run `--dry-run` first and report families created, rows inserted, updated, unchanged and skipped (with reasons). Run without `--dry-run` only when the operator says so. A changed number stops the import until the operator adds `--update`.

Never send anything, never delete records, never change another system.

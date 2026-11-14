# S&OP for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| "What needs me this week?", the Monday review | `/weekly-review` |
| "What is overdue or stuck?" | `/attention` |
| The demand review meeting, forecast versions side by side | `/demand-review` |
| The supply review meeting, what does not balance | `/supply-review` |
| Options and recommendations for the executive meeting | `/pre-sop` |
| The executive S&OP meeting pack | `/exec-pack` |
| Projected stock and cover | `/balance` |
| Line load against hours | `/capacity` |
| Plan against budget | `/gap` |
| How good is our forecast, bias | `/accuracy` |
| "What if..." on demand, supply or line hours | `/scenario` |
| Where is the cycle up to | `/cycles` |
| Start next month's cycle | `/open-cycle` |
| Move the cycle to its next stage | `/advance` |
| Sign off the consensus, or the executive meeting | `/sign-off` |
| Change a forecast number | `/forecast` |
| Fill missing consensus from sales or statistical | `/consensus` |
| Change the supply plan | `/supply` |
| Shutdowns, extra shifts, line hours | `/set-capacity` |
| Opening stock | `/stock` |
| What shipped last month | `/actual` |
| Budget numbers | `/budget` |
| Record an assumption | `/assume` |
| Record a decision | `/decide` |
| Close a decision or assumption | `/resolve` |
| Open decisions | `/decisions` |
| Open assumptions | `/assumptions` |
| Which families do we plan | `/list` |
| Everything about one family | `/show` |
| A new family or line | `/add` |
| Change a family's price, line, targets | `/update` |
| A note on a family | `/log` |
| Who changed what | `/activity` |
| Record controls | `/compliance` |
| Bring data across from Kinaxis | `/import` |
| Take every record out | `/export` |
| Save the demand review pack as a draft | `/draft-demand-review` |
| Save the exec pack as a draft | `/draft-exec-pack` |
| Branded documents | `/docs` |
| Read-only dashboards | `/view` |
| Change a field, stage or rule | `/customise` |
| A new dashboard page | `/new-view` |
| Every CLI command | `/help` |

If an ask fits nothing here, run the CLI directly (`npm run sop -- help`) and then propose a new command for it.

## Hard rules

- The executive meeting decides. Present options and their effect; record a decision only when the operator says it was made.
- Never add currencies together. Never present a scenario as the plan: say it was not saved.

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Kinaxis Maestro.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/kinaxis

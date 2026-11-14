<h1 align="center">S&OP for Claude Code</h1>

<p align="center">
  <strong>The open-source sales and operations planning system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Kinaxis Maestro data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=kinaxis">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/kinaxis?utm_source=github&utm_medium=readme&utm_campaign=kinaxis">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-kinaxis">Instead of Kinaxis Maestro</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

S&OP for Claude Code does the job you pay Kinaxis Maestro for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Kinaxis Maestro dashboard cannot.

Kinaxis does not publish a price for Maestro. It is sold by custom quote, and third-party estimates put annual licensing at US$250,000 to US$1,000,000 or more for 10 to 100 users, before implementation ([Toolradar](https://toolradar.com/tools/kinaxis/pricing), checked 14 November 2026). Those are estimates, not invoices; your quote is what counts.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=kinaxis).

It runs the monthly sales and operations planning cycle for a manufacturer or distributor: demand review, supply review, pre-S&OP and the executive meeting. Product families, forecast versions (statistical, sales, consensus), a supply plan, line hours, opening stock, the budget and what actually shipped sit in one database. From those it works out projected stock and months of cover, the load on every line, the gap to budget, forecast bias, and the decisions and assumptions that are overdue. It is for the planning manager, the operations manager and the managing director who sit in the monthly meeting.

## The monthly cycle as commands

| Step | Ask Claude Code | What it runs |
|---|---|---|
| 1. Data | "Load this month's Kinaxis pack and the actuals" | `/import`, `/actual`, `/stock` |
| 2. Demand review | "Where do sales and the statistical forecast disagree, and who over-forecasts?" | `/demand-review`, `/accuracy`, `/consensus` |
| 3. Supply review | "What doesn't balance, and which lines are over?" | `/supply-review`, `/scenario`, `/supply` |
| 4. Pre-S&OP | "Give me the options for each open issue, with the cost" | `/pre-sop`, `/scenario` |
| 5. Executive meeting | "Write the exec pack and record what we decided" | `/exec-pack`, `/decide`, `/sign-off` |
| Every Monday | "What needs me this week?" | `/weekly-review` |

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/sop-for-claude-code.git
cd sop-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/weekly-review`. The demo is a fictional sauce and dressings maker with an overdue supply review, a line overloaded by a planned shutdown, one family running short of cover, one with too much, and a forecast that has been 20% high for three months.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/weekly-review` | The Monday review: what needs a person, where supply does not balance, and the plan against budget. |
| `/attention` | Everything in the S&OP process that needs a person now. |
| `/demand-review` | Step two of the monthly cycle: statistical, sales and consensus forecasts side by side, with the budget. |
| `/supply-review` | Step three of the monthly cycle: where demand and supply do not balance, and which lines are under pressure. |
| `/pre-sop` | Step four of the monthly cycle: get the decisions ready for the executive meeting. |
| `/exec-pack` | Step five of the monthly cycle: the executive S&OP meeting pack. |
| `/balance` | Projected closing stock and months of cover for every family and month in the horizon. |
| `/capacity` | Hours of load on each line from the supply plan against the hours available. |
| `/gap` | The plan against the budget: revenue and units by month and currency. |
| `/accuracy` | How the consensus made one month ahead compared with what shipped, last three months. |
| `/scenario` | What-if: change demand, supply or capacity and see what happens to stock and line load. Nothing is saved. |
| `/cycles` | Every monthly cycle, its stage and its meeting dates. |
| `/open-cycle` | Start next month's cycle. Last month's consensus and supply plan carry forward as the starting point. |
| `/advance` | Move the open cycle to its next stage: data, demand review, supply review, pre-S&OP, executive, closed. |
| `/sign-off` | Sign off the consensus forecast, or record the executive sign-off and minutes. |
| `/forecast` | Record a statistical, sales or consensus number for one family and month. |
| `/consensus` | Fill missing consensus months from the sales or statistical forecast. |
| `/supply` | Set the planned production or purchases for a family and month. |
| `/set-capacity` | Record the hours a line has in a month: shutdowns, extra shifts, holidays. |
| `/stock` | Record opening stock for a family in the open cycle. |
| `/actual` | Record what shipped for a finished month. |
| `/budget` | Record the budget for a family and month, in units and revenue. |
| `/assume` | Record an assumption behind the plan, with an owner and a date to check it. |
| `/decide` | Record a decision from the S&OP meeting, with an owner and a due date. |
| `/resolve` | Close a decision (done or dropped) or an assumption (confirmed or dropped). |
| `/decisions` | Decisions and actions from the executive meetings, open ones first. |
| `/assumptions` | The assumptions behind the plan, each with an owner and a date to check it again. |
| `/list` | List every product family with its unit, owner, price, line and target cover. |
| `/show` | One family in full: its forecast versions, supply plan, projected stock and forecast record. |
| `/add` | Add a product family or a line. |
| `/update` | Change a family: name, owner, price, cost, line, hours per unit, cover targets, active. |
| `/log` | Add a note against a family (a risk raised, a customer call, a supplier issue). |
| `/activity` | The last 100 changes: who changed what, and the evidence they gave. |
| `/compliance` | Check the records against the controls in docs/compliance.md. |
| `/import` | Bring planning data across from a Kinaxis workbook exported to CSV. |
| `/export` | Export every record to JSON files the business keeps. |
| `/draft-demand-review` | Save the demand review pack as a draft in drafts/. |
| `/draft-exec-pack` | Save the executive meeting pack as a draft in drafts/. |
| `/docs` | Render the branded documents: the executive S&OP pack and a plan sheet per family. |
| `/view` | Render the read-only dashboards: this week, the balance, forecast accuracy. |
| `/customise` | Add a field, rename a stage, change a rule in plain language; writes and tests the migration. |
| `/new-view` | Add a read-only dashboard page from a plain-language description. |
| `/help` | Every CLI command. |

## Instead of Kinaxis Maestro

Export the family-level monthly view your S&OP pack already uses to CSV (one row per family, month and measure), then:

```bash
npm run sop -- import kinaxis --file=imports/sop-pack.csv --actor="Your name" --dry-run
npm run sop -- import kinaxis --file=imports/sop-pack.csv --actor="Your name"
```

Consensus, statistical, sales, supply plan and shipment measures are mapped by name; anything else is skipped and listed, never guessed. A changed number stops the import until you add `--update`, and a failed import leaves nothing behind. Full steps and what does not carry over: [docs/replace-kinaxis.md](docs/replace-kinaxis.md).

## Ten questions this build answers

Each is a real command on the demo data. They are the questions the monthly meeting asks, not a claim about what Kinaxis can or cannot show.

1. How far is the consensus plan from the budget, month by month? `gap`
2. Which families fall below their target cover, and from which month? `balance`
3. Which lines are over capacity, and is it a shutdown or real demand? `capacity`
4. Which families have we over- or under-forecast for three months running? `accuracy`
5. Where do sales and the statistical forecast disagree by more than 10%? `demand-review`
6. If the promotion lifts 500 ml sauce 15% and we build to match, does line 1 cope? `scenario --demand-percent=15 --family=SAU-500 --supply-follows`
7. What if line 2 gets 50% more hours in the shutdown month? `scenario --capacity-percent=50 --resource=LINE-2`
8. Which decisions from last month's executive meeting are still open past their date? `decisions`
9. Which assumptions behind this plan have not been checked since they were made? `assumptions`
10. Who changed the consensus, from what, to what, and on what evidence? `activity`

## Your first hour: ten things to ask for

1. Put our company name, logo and colours on the executive pack.
2. Add our product families, their prices and which line makes each one.
3. Record the hours each line has per month, including the shutdowns.
4. Test our Kinaxis export without saving it, then load it.
5. Load last quarter's actuals so forecast accuracy works.
6. Change our cycle to a four-month horizon.
7. Add a field for the customer channel on every family.
8. Show me the demand review for the families Tama owns.
9. What happens to stock if we drop the Saturday shift on line 2?
10. Write the Monday note for the operations team.

`/customise` writes, tests and applies the database change for any of these. `/new-view` adds a read-only dashboard page. There is no application front end.

## Documents, views and record checks

Change `brand.json` once. `npm run docs` renders the executive S&OP pack and a plan sheet for every family as branded HTML; `npm run view` renders this week, the balance and forecast accuracy as read-only pages. Print to PDF from the browser. `/compliance` checks the record controls in [docs/compliance.md](docs/compliance.md). How every number is worked out: [docs/planning-method.md](docs/planning-method.md).

## Verification

`npm test` runs every one of the 39 CLI commands on a throwaway database: the balance, line load, gap and accuracy arithmetic, scenarios, the cycle stages and their sign-off rules, the Kinaxis import (dry run, mapping, changed values, rollback), drafts, documents, views and escaped HTML. It passes on the embedded database and on PostgreSQL 17 (`TEST_DATABASE_URL` must name an empty, disposable database). CI defines Node 20 and 22 on Linux and Windows.

## Architecture

```
sop-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs S&OP for Claude Code for your business, migrates your Kinaxis Maestro data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=kinaxis)
- Read more: [enterprisedna.co/omni/instead-of/kinaxis](https://enterprisedna.co/omni/instead-of/kinaxis?utm_source=github&utm_medium=readme&utm_campaign=kinaxis)

## License

MIT. Copyright (c) 2026 Enterprise DNA. Not affiliated with Kinaxis or Anthropic. Hosting and agent usage have their own costs.

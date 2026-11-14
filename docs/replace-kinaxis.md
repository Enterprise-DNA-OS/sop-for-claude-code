# Moving off Kinaxis Maestro

Kinaxis plans at part level; S&OP for Claude Code plans at product family level for the monthly cycle. The move is about the family-level numbers your S&OP meeting already looks at.

## 1. Export what the meeting uses

Most planning teams already pull a monthly view out of their Kinaxis workbooks into a spreadsheet for the S&OP pack. That spreadsheet is the import. Save it as CSV in long format, one row per family, month and measure:

```csv
Product Family,Description,Measure,Period,Quantity
SAU-500,Tomato sauce 500 ml,Statistical Forecast,2027-01,8200
SAU-500,Tomato sauce 500 ml,Consensus Demand,2027-01,8500
SAU-500,Tomato sauce 500 ml,Supply Plan,2027-01,8500
SAU-500,Tomato sauce 500 ml,Shipments History,2026-10,7900
```

See `fixtures/kinaxis-export.csv`. If your workbook is wide (one column per month), ask Claude Code to reshape it into this form first and show you the row count before and after.

## 2. Map the columns and measures

Column names are matched case-sensitively against common names (`Product Family`, `Family`, `Part family`; `Period`, `Month`, `Bucket`; `Measure`, `Series`; `Quantity`, `Qty`, `Value`). Anything else goes in a field map, as in `fixtures/field-map.json`, passed with `--map=`.

Measures are mapped by name:

| Measure contains | Becomes |
|---|---|
| consensus, final demand, approved demand | consensus forecast |
| statistical, baseline, system forecast | statistical forecast |
| sales, unconstrained, customer forecast | sales forecast |
| supply, production, planned receipt, build plan | supply plan |
| actual, shipment, history, sold | actuals (finished months only) |

Anything else (safety stock, projected available balance, constrained demand) is skipped and listed, never guessed.

## 3. Open a cycle, then do a test run

```bash
npm run sop -- open-cycle --month=2027-01 --actor="Your name" --evidence="First cycle"
npm run sop -- import kinaxis --file=imports/sop-pack.csv --actor="Your name" --dry-run
```

The dry run reports families created, rows inserted, updated, unchanged and skipped, then rolls everything back. Forecast and supply rows outside the open cycle's horizon are skipped. Families that are new get created with only a code and a name: fill in price, cost, line, hours per unit and cover targets with `update` (the `compliance` check lists what is missing).

## 4. Load it, then add what Kinaxis does not export in this shape

Run the same command without `--dry-run`. A number that differs from what is already loaded stops the import until you add `--update`. Then record:

- opening stock per family (`stock`)
- line hours per month (`set-capacity`)
- the budget (`budget`), from your finance file

## 5. Run one cycle side by side

Run next month's S&OP meeting from both. Compare the gap to budget, the balance exceptions and the line load. Expect differences where Kinaxis constrains supply at part level; this system shows the family-level picture and leaves the constraint to people.

## What does not carry over

- Part-level plans, bills of materials and routings.
- Kinaxis scenarios and their history.
- Alerts, workbooks and dashboards configured in Kinaxis. The equivalents here are slash commands and `views.json`.

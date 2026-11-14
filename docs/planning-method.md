# How the numbers are worked out

Everything is plain arithmetic on the records, so any number can be checked by hand.

- **Months.** Every month is stored as its first day. The open cycle plans `horizon_months` months (six by default) from its own month.
- **Forecast versions.** Statistical (from a model or a moving average, brought in), sales (what the sales team expects), consensus (the one number the business commits to). Only consensus drives the balance, capacity and gap.
- **Closing stock.** Opening stock for the cycle, plus every month's supply plan so far, minus every month's consensus so far.
- **Cover.** Closing stock divided by that month's consensus, in months. Below the family's target cover is "below target"; above its maximum cover is "over cover"; below zero is "short".
- **Line load.** Supply plan units times the family's hours per unit, added up for every family on the line, against the hours recorded for that line and month.
- **Gap to budget.** Consensus units times the family price, against budget revenue, by month and currency. Currencies are never added together.
- **Forecast accuracy.** For each finished month, the consensus that was set in the previous month's cycle against what shipped. Error is the sum of absolute differences over the sum of actuals. Bias is total forecast over total actual, minus one. Three most recent months.
- **Scenarios.** Demand, supply and line hours are scaled by the percentages given, for one family or line or all of them, and the balance and line load are worked out again. Nothing is saved.

Where this is simpler than a planning suite: no bill of materials, no lead-time offsets, no constrained supply optimisation. Those are customisations, and the place to add them is a new view or command, not a change to these definitions.

# Record controls and sources

There is no law that says how a business runs sales and operations planning. What `npm run sop -- compliance` checks is the set of record controls a well-run S&OP process keeps, so the plan the executive approves can be traced to who agreed each number and why. The operator decides which of these to keep; edit this file and the `v_compliance` view together.

| Rule | What the check finds | Source |
|---|---|---|
| CTRL-FAMILY-DATA | An active family with no price, cost, line, hours per unit, target cover or owner. Without them it cannot be priced against budget or loaded on a line. | Internal planning policy. |
| CTRL-CONSENSUS-SIGNOFF | The cycle reached pre-S&OP or the executive stage with no named person signing off the consensus forecast. | Internal planning policy: one agreed number, owned by a named person. |
| CTRL-EXEC-SIGNOFF | A closed cycle with no executive sign-off or no minutes. | Internal governance: the plan the business runs on was approved by someone with the authority to approve it. |
| CTRL-ACTUALS | A priced family with no actuals recorded for last month. Forecast accuracy cannot be measured without them. | Internal planning policy. |
| CTRL-DECISION-OWNER | A decision from an executive meeting still open past its due date. | Internal governance. |

## Keeping the records

The planning records support decisions that end up in the accounts (stock levels, purchase commitments, budgets). Tax authorities set how long business records are kept:

- New Zealand: Inland Revenue's record-keeping guidance, https://www.ird.govt.nz/managing-my-tax/record-keeping
- Australia: the ATO's record-keeping guidance for business, https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/record-keeping-for-business

Check the current rule at the source before you set a retention period. This system has no delete command, keeps an activity log of every change with the person and the evidence, and exports every record to JSON with `npm run sop -- export`. It cannot verify your backups, your retention period or that your accounting records are complete. An administrator with database access can still change records directly.

Nothing here is legal or tax advice. The packs and drafts this system produces are planning documents for people to review. It does not place orders, change your ERP or approve anything on its own.

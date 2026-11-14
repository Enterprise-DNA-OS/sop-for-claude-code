-- S&OP for Claude Code: the monthly sales and operations planning cycle as plain tables.
-- Months are stored as the first day of the month. Runs on Postgres and PGlite.

CREATE FUNCTION touch_updated() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Production lines, plants or buying desks: whatever limits supply.
CREATE TABLE resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name text NOT NULL,
  site text,
  owner text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Product families: S&OP plans in families, not SKUs.
CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (length(trim(code)) > 0),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'cases',
  owner text,
  currency text NOT NULL DEFAULT 'NZD' CHECK (currency ~ '^[A-Z]{3}$'),
  price numeric CHECK (price >= 0),
  cost numeric CHECK (cost >= 0),
  resource_id uuid REFERENCES resources(id),
  hours_per_unit numeric CHECK (hours_per_unit >= 0),
  target_cover numeric CHECK (target_cover >= 0),
  max_cover numeric CHECK (max_cover >= 0),
  active boolean NOT NULL DEFAULT true,
  source jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One cycle per month. Stages follow the five-step monthly process.
CREATE TABLE cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month date NOT NULL UNIQUE CHECK (extract(day FROM month) = 1),
  horizon_months integer NOT NULL DEFAULT 6 CHECK (horizon_months BETWEEN 1 AND 24),
  stage text NOT NULL DEFAULT 'data' CHECK (stage IN ('data','demand_review','supply_review','pre_sop','exec','closed')),
  demand_review_due date,
  supply_review_due date,
  pre_sop_due date,
  exec_meeting date,
  consensus_signed_by text,
  exec_signed_by text,
  exec_signed_at timestamptz,
  minutes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_open_cycle ON cycles ((stage <> 'closed')) WHERE stage <> 'closed';

-- Every forecast number, by version. Consensus is the one the business commits to.
CREATE TABLE forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES cycles(id),
  family_id uuid NOT NULL REFERENCES families(id),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  version text NOT NULL CHECK (version IN ('statistical','sales','consensus')),
  units numeric NOT NULL CHECK (units >= 0),
  actor text NOT NULL,
  source_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, family_id, month, version)
);

-- Planned production or purchases per family per month, set in supply review.
CREATE TABLE supply_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES cycles(id),
  family_id uuid NOT NULL REFERENCES families(id),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  units numeric NOT NULL CHECK (units >= 0),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, family_id, month)
);

-- Hours available on each resource per month (after shutdowns, holidays, crewing).
CREATE TABLE capacity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES resources(id),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  hours numeric NOT NULL CHECK (hours >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_id, month)
);

-- Opening stock for each family at the start of a cycle.
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES cycles(id),
  family_id uuid NOT NULL REFERENCES families(id),
  on_hand numeric NOT NULL,
  asof date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, family_id)
);

-- The financial budget in units, so the plan can be compared with it.
CREATE TABLE budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  units numeric NOT NULL CHECK (units >= 0),
  revenue numeric NOT NULL CHECK (revenue >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, month)
);

-- What actually shipped, from the ERP or accounts.
CREATE TABLE actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  units numeric NOT NULL CHECK (units >= 0),
  revenue numeric CHECK (revenue >= 0),
  source_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (family_id, month)
);

-- Assumptions behind the numbers, each with an owner and a date to check it again.
CREATE TABLE assumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES cycles(id),
  family_id uuid REFERENCES families(id),
  text text NOT NULL,
  owner text NOT NULL,
  review_by date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','dropped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Decisions and actions from the executive meeting.
CREATE TABLE decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES cycles(id),
  family_id uuid REFERENCES families(id),
  text text NOT NULL,
  owner text NOT NULL,
  due date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dropped')),
  outcome text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES families(id),
  action text NOT NULL,
  actor text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  evidence text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  sha256 text NOT NULL,
  kind text NOT NULL,
  row_count integer NOT NULL,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['resources','families','cycles','forecasts','supply_plan','capacity','inventory','budget','actuals','assumptions','decisions','activity','imports'] LOOP
    EXECUTE format('CREATE TRIGGER touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON %I FROM public', t);
  END LOOP;
END $$;

CREATE INDEX forecast_lookup ON forecasts (cycle_id, family_id, month);
CREATE INDEX supply_lookup ON supply_plan (cycle_id, family_id, month);

-- The open cycle and its planning months.
CREATE VIEW v_open_cycle AS
SELECT * FROM cycles WHERE stage <> 'closed';

CREATE VIEW v_horizon AS
SELECT c.id AS cycle_id, (c.month + make_interval(months => g))::date AS month, g AS month_index
FROM v_open_cycle c CROSS JOIN LATERAL generate_series(0, c.horizon_months - 1) g;

-- Every active family against every horizon month: the three forecast versions, supply and budget.
CREATE VIEW v_plan AS
SELECT f.id AS family_id, f.code AS family, f.name, f.unit, f.currency, f.price, f.target_cover, f.max_cover,
  h.cycle_id, h.month, h.month_index,
  st.units AS statistical, sa.units AS sales, co.units AS consensus,
  sp.units AS supply, b.units AS budget_units, b.revenue AS budget_revenue
FROM families f
CROSS JOIN v_horizon h
LEFT JOIN forecasts st ON st.cycle_id = h.cycle_id AND st.family_id = f.id AND st.month = h.month AND st.version = 'statistical'
LEFT JOIN forecasts sa ON sa.cycle_id = h.cycle_id AND sa.family_id = f.id AND sa.month = h.month AND sa.version = 'sales'
LEFT JOIN forecasts co ON co.cycle_id = h.cycle_id AND co.family_id = f.id AND co.month = h.month AND co.version = 'consensus'
LEFT JOIN supply_plan sp ON sp.cycle_id = h.cycle_id AND sp.family_id = f.id AND sp.month = h.month
LEFT JOIN budget b ON b.family_id = f.id AND b.month = h.month
WHERE f.active;

-- Demand against supply: projected closing stock and months of cover.
CREATE VIEW v_balance AS
SELECT p.family_id, p.cycle_id, p.family, p.unit, p.month, p.month_index, p.consensus, p.supply,
  i.on_hand AS opening_stock,
  CASE WHEN i.on_hand IS NULL THEN NULL ELSE
    i.on_hand + sum(coalesce(p.supply, 0)) OVER w - sum(coalesce(p.consensus, 0)) OVER w END AS closing_stock,
  CASE WHEN i.on_hand IS NULL OR coalesce(p.consensus, 0) = 0 THEN NULL ELSE
    round((i.on_hand + sum(coalesce(p.supply, 0)) OVER w - sum(coalesce(p.consensus, 0)) OVER w) / p.consensus, 2) END AS cover_months,
  p.target_cover, p.max_cover,
  CASE
    WHEN p.consensus IS NULL THEN 'no consensus'
    WHEN i.on_hand IS NULL THEN 'no opening stock'
    WHEN p.supply IS NULL THEN 'no supply plan'
    WHEN i.on_hand + sum(coalesce(p.supply, 0)) OVER w - sum(coalesce(p.consensus, 0)) OVER w < 0 THEN 'short'
    WHEN p.target_cover IS NOT NULL AND (i.on_hand + sum(coalesce(p.supply, 0)) OVER w - sum(coalesce(p.consensus, 0)) OVER w) / p.consensus < p.target_cover THEN 'below target'
    WHEN p.max_cover IS NOT NULL AND (i.on_hand + sum(coalesce(p.supply, 0)) OVER w - sum(coalesce(p.consensus, 0)) OVER w) / p.consensus > p.max_cover THEN 'over cover'
    ELSE 'ok' END AS status
FROM v_plan p
LEFT JOIN inventory i ON i.cycle_id = p.cycle_id AND i.family_id = p.family_id
WINDOW w AS (PARTITION BY p.family_id ORDER BY p.month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);

-- Load on each resource from the supply plan against the hours available.
CREATE VIEW v_capacity AS
SELECT r.id AS resource_id, r.code AS resource, r.name, r.site, h.month, h.month_index,
  round(coalesce(sum(sp.units * f.hours_per_unit), 0), 1) AS load_hours,
  c.hours AS available_hours,
  CASE WHEN c.hours IS NULL OR c.hours = 0 THEN NULL ELSE round(100 * coalesce(sum(sp.units * f.hours_per_unit), 0) / c.hours, 0) END AS utilisation_pct,
  c.note
FROM resources r
CROSS JOIN v_horizon h
LEFT JOIN families f ON f.resource_id = r.id AND f.active
LEFT JOIN supply_plan sp ON sp.family_id = f.id AND sp.cycle_id = h.cycle_id AND sp.month = h.month
LEFT JOIN capacity c ON c.resource_id = r.id AND c.month = h.month
WHERE r.active
GROUP BY r.id, r.code, r.name, r.site, h.month, h.month_index, c.hours, c.note;

-- Consensus revenue against the budget, by month and currency.
CREATE VIEW v_gap AS
SELECT month, currency,
  sum(coalesce(consensus, 0) * coalesce(price, 0)) AS plan_revenue,
  sum(coalesce(budget_revenue, 0)) AS budget_revenue,
  sum(coalesce(consensus, 0) * coalesce(price, 0)) - sum(coalesce(budget_revenue, 0)) AS gap,
  sum(coalesce(consensus, 0)) AS plan_units,
  sum(coalesce(budget_units, 0)) AS budget_units,
  count(*) FILTER (WHERE consensus IS NULL) AS families_without_consensus
FROM v_plan GROUP BY month, currency;

-- Forecast quality: the consensus made one month ahead against what shipped.
CREATE VIEW v_accuracy_detail AS
SELECT f.id AS family_id, f.code AS family, a.month, fc.units AS forecast_lag1, a.units AS actual
FROM actuals a
JOIN families f ON f.id = a.family_id
JOIN cycles c ON c.month = (a.month - interval '1 month')::date
JOIN forecasts fc ON fc.cycle_id = c.id AND fc.family_id = a.family_id AND fc.month = a.month AND fc.version = 'consensus';

CREATE VIEW v_accuracy AS
SELECT family_id, family, count(*) AS months, min(month) AS first_month, max(month) AS last_month,
  sum(forecast_lag1) AS forecast_units, sum(actual) AS actual_units,
  CASE WHEN sum(actual) = 0 THEN NULL ELSE round(100 * sum(abs(forecast_lag1 - actual)) / sum(actual), 1) END AS wmape_pct,
  CASE WHEN sum(actual) = 0 THEN NULL ELSE round(100 * (sum(forecast_lag1) - sum(actual)) / sum(actual), 1) END AS bias_pct
FROM v_accuracy_detail
WHERE month >= (date_trunc('month', current_date) - interval '3 months')::date
GROUP BY family_id, family;

-- What needs a person this week.
CREATE VIEW v_attention AS
SELECT 'stage overdue' AS issue, to_char(c.month, 'YYYY-MM') AS ref, NULL::date AS month,
  'cycle is at ' || c.stage || ', due ' || CASE c.stage WHEN 'data' THEN c.demand_review_due::text WHEN 'demand_review' THEN c.demand_review_due::text WHEN 'supply_review' THEN c.supply_review_due::text WHEN 'pre_sop' THEN c.pre_sop_due::text ELSE c.exec_meeting::text END AS detail
FROM v_open_cycle c
WHERE CASE c.stage WHEN 'data' THEN c.demand_review_due WHEN 'demand_review' THEN c.demand_review_due WHEN 'supply_review' THEN c.supply_review_due WHEN 'pre_sop' THEN c.pre_sop_due ELSE c.exec_meeting END < current_date
UNION ALL
SELECT 'no consensus', family, min(month), count(*) || ' horizon month(s) have no consensus forecast'
FROM v_balance WHERE status = 'no consensus' GROUP BY family
UNION ALL
SELECT 'stock short', family, min(month), 'projected closing stock below zero from this month'
FROM v_balance WHERE status = 'short' GROUP BY family
UNION ALL
SELECT 'below target cover', family, min(month), 'cover ' || min(cover_months) || ' months against a target of ' || max(target_cover)
FROM v_balance WHERE status = 'below target' GROUP BY family
UNION ALL
SELECT 'over cover', family, min(month), 'cover up to ' || max(cover_months) || ' months against a ceiling of ' || max(max_cover)
FROM v_balance WHERE status = 'over cover' GROUP BY family
UNION ALL
SELECT 'over capacity', resource, month, load_hours || ' hours planned against ' || available_hours || ' available (' || utilisation_pct || '%)'
FROM v_capacity WHERE utilisation_pct > 100
UNION ALL
SELECT 'no capacity record', resource, min(month), count(*) || ' horizon month(s) with no hours recorded'
FROM v_capacity WHERE available_hours IS NULL GROUP BY resource
UNION ALL
SELECT 'forecast bias', family, last_month, 'consensus ' || CASE WHEN bias_pct > 0 THEN 'over' ELSE 'under' END || ' actual by ' || abs(bias_pct) || '% over ' || months || ' month(s)'
FROM v_accuracy WHERE abs(bias_pct) >= 15
UNION ALL
SELECT 'decision overdue', d.owner, d.due, d.text
FROM decisions d WHERE d.status = 'open' AND d.due < current_date
UNION ALL
SELECT 'assumption past review', a.owner, a.review_by, a.text
FROM assumptions a WHERE a.status = 'open' AND a.review_by < current_date;

-- Record controls the operator has adopted (docs/compliance.md).
CREATE VIEW v_compliance AS
SELECT 'CTRL-FAMILY-DATA' AS rule, f.code AS ref,
  'missing ' || concat_ws(', ',
    CASE WHEN f.price IS NULL THEN 'price' END, CASE WHEN f.cost IS NULL THEN 'cost' END,
    CASE WHEN f.resource_id IS NULL THEN 'resource' END, CASE WHEN f.hours_per_unit IS NULL THEN 'hours per unit' END,
    CASE WHEN f.target_cover IS NULL THEN 'target cover' END, CASE WHEN f.owner IS NULL THEN 'owner' END) AS finding
FROM families f
WHERE f.active AND (f.price IS NULL OR f.cost IS NULL OR f.resource_id IS NULL OR f.hours_per_unit IS NULL OR f.target_cover IS NULL OR f.owner IS NULL)
UNION ALL
SELECT 'CTRL-EXEC-SIGNOFF', to_char(c.month, 'YYYY-MM'), 'closed cycle has no executive sign-off recorded'
FROM cycles c WHERE c.stage = 'closed' AND (c.exec_signed_by IS NULL OR c.minutes IS NULL)
UNION ALL
SELECT 'CTRL-CONSENSUS-SIGNOFF', to_char(c.month, 'YYYY-MM'), 'consensus not signed off before the cycle reached ' || c.stage
FROM v_open_cycle c WHERE c.stage IN ('pre_sop','exec') AND c.consensus_signed_by IS NULL
UNION ALL
SELECT 'CTRL-ACTUALS', f.code, 'no actuals recorded for ' || to_char((date_trunc('month', current_date) - interval '1 month')::date, 'YYYY-MM')
FROM families f
WHERE f.active AND f.price IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM actuals a WHERE a.family_id = f.id AND a.month = (date_trunc('month', current_date) - interval '1 month')::date)
UNION ALL
SELECT 'CTRL-DECISION-OWNER', coalesce(d.owner, '?'), 'decision from ' || to_char(c.month, 'YYYY-MM') || ' still open past its due date: ' || d.text
FROM decisions d JOIN cycles c ON c.id = d.cycle_id WHERE d.status = 'open' AND d.due < current_date;

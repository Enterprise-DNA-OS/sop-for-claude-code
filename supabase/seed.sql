-- Demo data: a fictional New Zealand sauce and dressings maker, Harbour Kitchen Foods.
-- Months are relative to today, so the demo always has a live cycle. Safe to run twice.
-- Built to give every command something to say: an overdue supply review, a line overloaded by a
-- planned shutdown, a family running below target cover, one over cover, a forecast with bias,
-- a seasonal family missing consensus, an overdue decision and an assumption past its review date.

INSERT INTO resources (id, code, name, site, owner) VALUES
 ('10000000-0000-4000-8000-000000000001', 'LINE-1', 'Bottling line 1', 'Auckland', 'Wiremu'),
 ('10000000-0000-4000-8000-000000000002', 'LINE-2', 'Filling line 2', 'Christchurch', 'Ben')
ON CONFLICT DO NOTHING;

INSERT INTO families (id, code, name, unit, owner, price, cost, resource_id, hours_per_unit, target_cover, max_cover) VALUES
 ('20000000-0000-4000-8000-000000000001', 'SAU-500', 'Tomato sauce 500 ml', 'cases', 'Aroha', 42, 25, '10000000-0000-4000-8000-000000000001', 0.02, 1.0, 2.0),
 ('20000000-0000-4000-8000-000000000002', 'SAU-1L', 'Tomato sauce 1 litre', 'cases', 'Aroha', 70, 41, '10000000-0000-4000-8000-000000000001', 0.025, 1.0, 2.0),
 ('20000000-0000-4000-8000-000000000003', 'DRS-250', 'Dressings 250 ml', 'cases', 'Ben', 55, 30, '10000000-0000-4000-8000-000000000002', 0.03, 1.5, 3.0),
 ('20000000-0000-4000-8000-000000000004', 'SPR-HOL', 'Holiday relish range', 'cases', 'Ben', 60, 35, '10000000-0000-4000-8000-000000000002', 0.04, 0.5, 2.0)
ON CONFLICT DO NOTHING;
INSERT INTO families (id, code, name, unit) VALUES
 ('20000000-0000-4000-8000-000000000005', 'NEW-CHL', 'Chilli sauce launch', 'cases')
ON CONFLICT DO NOTHING;

-- Four closed cycles and the open one.
INSERT INTO cycles (id, month, stage, demand_review_due, supply_review_due, pre_sop_due, exec_meeting, consensus_signed_by, exec_signed_by, exec_signed_at, minutes)
SELECT ('30000000-0000-4000-8000-00000000000' || (5 - k))::uuid,
  (date_trunc('month', current_date) - make_interval(months => k))::date, 'closed',
  (date_trunc('month', current_date) - make_interval(months => k))::date + 6,
  (date_trunc('month', current_date) - make_interval(months => k))::date + 12,
  (date_trunc('month', current_date) - make_interval(months => k))::date + 16,
  (date_trunc('month', current_date) - make_interval(months => k))::date + 20,
  'Aroha',
  CASE WHEN k = 2 THEN NULL ELSE 'Sarah (managing director)' END,
  CASE WHEN k = 2 THEN NULL ELSE now() - make_interval(months => k) END,
  CASE WHEN k = 2 THEN NULL ELSE 'Plan approved as presented.' END
FROM generate_series(1, 4) k
ON CONFLICT DO NOTHING;

INSERT INTO cycles (id, month, stage, demand_review_due, supply_review_due, pre_sop_due, exec_meeting, consensus_signed_by)
VALUES ('30000000-0000-4000-8000-000000000005', date_trunc('month', current_date)::date, 'supply_review',
  current_date - 7, current_date - 2, current_date + 3, current_date + 7, 'Aroha')
ON CONFLICT DO NOTHING;

-- Open cycle forecasts, six months from this month.
INSERT INTO forecasts (cycle_id, family_id, month, version, units, actor, source_ref)
SELECT '30000000-0000-4000-8000-000000000005', v.family::uuid,
  (date_trunc('month', current_date) + make_interval(months => (u.i - 1)::int))::date, v.version, u.units, v.actor, 'demo forecast'
FROM (VALUES
  ('20000000-0000-4000-8000-000000000001', 'consensus',   'Aroha', ARRAY[8000, 8000, 8500, 9000, 9000, 8500]),
  ('20000000-0000-4000-8000-000000000001', 'sales',       'Tama',  ARRAY[8000, 8500, 9500, 10000, 10000, 9000]),
  ('20000000-0000-4000-8000-000000000001', 'statistical', 'model', ARRAY[7800, 7900, 8200, 8400, 8400, 8200]),
  ('20000000-0000-4000-8000-000000000002', 'consensus',   'Aroha', ARRAY[4000, 4000, 4200, 4400, 4400, 4200]),
  ('20000000-0000-4000-8000-000000000003', 'consensus',   'Ben',   ARRAY[3000, 3200, 3500, 3500, 3200, 3000]),
  ('20000000-0000-4000-8000-000000000003', 'sales',       'Tama',  ARRAY[3200, 3400, 3800, 3800, 3400, 3200]),
  ('20000000-0000-4000-8000-000000000003', 'statistical', 'model', ARRAY[2500, 2600, 2700, 2700, 2600, 2500]),
  ('20000000-0000-4000-8000-000000000004', 'consensus',   'Ben',   ARRAY[500, 1500, 3000, 2000])
) AS v(family, version, actor, series)
CROSS JOIN LATERAL unnest(v.series) WITH ORDINALITY AS u(units, i)
ON CONFLICT DO NOTHING;

-- Consensus made one month ahead in each closed cycle, for the accuracy check.
INSERT INTO forecasts (cycle_id, family_id, month, version, units, actor, source_ref)
SELECT ('30000000-0000-4000-8000-00000000000' || (5 - k))::uuid, v.family::uuid,
  (date_trunc('month', current_date) - make_interval(months => k - 1))::date, 'consensus', v.units, 'Aroha', 'demo forecast'
FROM generate_series(2, 4) k
CROSS JOIN (VALUES
  ('20000000-0000-4000-8000-000000000001', 8000),
  ('20000000-0000-4000-8000-000000000002', 4000),
  ('20000000-0000-4000-8000-000000000003', 3000)
) AS v(family, units)
ON CONFLICT DO NOTHING;

INSERT INTO actuals (family_id, month, units, revenue, source_ref)
SELECT v.family::uuid, (date_trunc('month', current_date) - make_interval(months => (4 - u.i)::int))::date, u.units, u.units * v.price, 'demo ledger'
FROM (VALUES
  ('20000000-0000-4000-8000-000000000001', 42, ARRAY[7600, 8100, 7900]),
  ('20000000-0000-4000-8000-000000000002', 70, ARRAY[4100, 3900, 4000]),
  ('20000000-0000-4000-8000-000000000003', 55, ARRAY[2400, 2500, 2600])
) AS v(family, price, series)
CROSS JOIN LATERAL unnest(v.series) WITH ORDINALITY AS u(units, i)
ON CONFLICT DO NOTHING;

INSERT INTO supply_plan (cycle_id, family_id, month, units, actor)
SELECT '30000000-0000-4000-8000-000000000005', v.family::uuid,
  (date_trunc('month', current_date) + make_interval(months => (u.i - 1)::int))::date, u.units, 'Wiremu'
FROM (VALUES
  ('20000000-0000-4000-8000-000000000001', ARRAY[8000, 8000, 8500, 9000, 9000, 8500]),
  ('20000000-0000-4000-8000-000000000002', ARRAY[4000, 4000, 4000, 4000, 4000, 4000]),
  ('20000000-0000-4000-8000-000000000003', ARRAY[3500, 3500, 3500, 3500, 3500, 3500]),
  ('20000000-0000-4000-8000-000000000004', ARRAY[1000, 2000, 2500, 1500, 0, 0])
) AS v(family, series)
CROSS JOIN LATERAL unnest(v.series) WITH ORDINALITY AS u(units, i)
ON CONFLICT DO NOTHING;

INSERT INTO inventory (cycle_id, family_id, on_hand, asof) VALUES
 ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 9000, date_trunc('month', current_date)::date),
 ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 3000, date_trunc('month', current_date)::date),
 ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', 9000, date_trunc('month', current_date)::date),
 ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000004', 200, date_trunc('month', current_date)::date)
ON CONFLICT DO NOTHING;

-- Line 2 is down for maintenance for half of month three.
INSERT INTO capacity (resource_id, month, hours, note)
SELECT r.id, (date_trunc('month', current_date) + make_interval(months => g))::date,
  CASE WHEN r.code = 'LINE-1' THEN 400 WHEN g = 2 THEN 150 ELSE 300 END,
  CASE WHEN r.code = 'LINE-2' AND g = 2 THEN 'Planned maintenance shutdown, two weeks' END
FROM resources r CROSS JOIN generate_series(0, 5) g
WHERE r.id IN ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO budget (family_id, month, units, revenue)
SELECT v.family::uuid, (date_trunc('month', current_date) + make_interval(months => (u.i - 1)::int))::date, u.units, u.units * v.price
FROM (VALUES
  ('20000000-0000-4000-8000-000000000001', 42, ARRAY[9000, 9000, 9000, 9000, 9000, 9000]),
  ('20000000-0000-4000-8000-000000000002', 70, ARRAY[4000, 4000, 4000, 4000, 4000, 4000]),
  ('20000000-0000-4000-8000-000000000003', 55, ARRAY[3000, 3000, 3000, 3000, 3000, 3000]),
  ('20000000-0000-4000-8000-000000000004', 60, ARRAY[500, 1500, 3000, 2000, 0, 0])
) AS v(family, price, series)
CROSS JOIN LATERAL unnest(v.series) WITH ORDINALITY AS u(units, i)
ON CONFLICT DO NOTHING;

INSERT INTO assumptions (id, cycle_id, family_id, text, owner, review_by) VALUES
 ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001',
  'Supermarket promotion in month three lifts tomato sauce 500 ml by 500 cases', 'Tama', current_date + 10),
 ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003',
  'Export order to Australia for dressings is confirmed for months two and three', 'Tama', current_date - 3)
ON CONFLICT DO NOTHING;

INSERT INTO decisions (id, cycle_id, family_id, text, owner, due, status, outcome) VALUES
 ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004',
  'Approve Saturday overtime on line 2 for the holiday relish build', 'Ben', current_date - 5, 'open', NULL),
 ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002',
  'Hold 1 litre sauce price until the new bottle supplier is confirmed', 'Sarah', current_date - 12, 'done', 'Price held; supplier confirmed')
ON CONFLICT DO NOTHING;

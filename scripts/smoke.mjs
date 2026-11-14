// npm test: a throwaway database, migrate, seed, run every command, check the arithmetic. PASS or a failure.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sop-'));
process.env.DATA_DIR = path.join(tmp, 'db');
process.env.OUTPUT_DIR = tmp;
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || '';
const { getDb, REPO_ROOT } = await import('./lib/db.mjs');
const { migrate } = await import('./migrate.mjs');
const { seed } = await import('./seed.mjs');
const { run, commands, parse, month, measureKind } = await import('./sop.mjs');

const db = await getDb();
const covered = new Set();
const call = async (c, o = {}, args = []) => { covered.add(c); return run(db, c, o, args); };
const actor = 'Test planner';
const m = (k) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 7); };
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const n = (v) => (v === null || v === undefined ? v : Number(v));
const cli = (args, expected = 0) => {
  const r = spawnSync(process.execPath, args, { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  assert.equal(r.status, expected, r.stderr || r.stdout);
  return r;
};

try {
  if (db.mode === 'postgres') {
    const existing = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    assert.equal(existing.length, 0, 'TEST_DATABASE_URL must be empty and disposable');
  }
  await migrate(db);
  assert.equal((await migrate(db)).ran.length, 0, 'migrate is idempotent');
  await seed(db);
  await seed(db);

  // Reads
  assert.equal((await call('help')).length, commands.length);
  assert.equal((await call('list')).length, 5);
  assert.equal((await call('resources')).length, 2);
  const cycles = await call('cycles');
  assert.equal(cycles.length, 5);
  assert.equal(cycles[0].stage, 'supply_review');

  const dr = await call('demand-review');
  const sau = dr.find((r) => r.family === 'SAU-500' && r.month === m(3));
  assert.equal(n(sau.sales), 10000);
  assert.equal(n(sau.sales_vs_stat_pct), 19);

  const bal = await call('balance');
  const oneLitre = bal.filter((r) => r.family === 'SAU-1L');
  assert.equal(n(oneLitre[5].closing_stock), 1800, 'closing stock = opening + supply - consensus');
  assert.equal(oneLitre[5].status, 'below target');
  assert.equal(bal.find((r) => r.family === 'DRS-250' && r.month === m(5)).status, 'over cover');
  assert.equal(bal.filter((r) => r.family === 'SPR-HOL' && r.status === 'no consensus').length, 2);

  const cap = await call('capacity');
  const line2 = cap.find((r) => r.resource === 'LINE-2' && r.month === m(2));
  assert.equal(n(line2.load_hours), 205);
  assert.equal(n(line2.utilisation_pct), 137);

  const gap = await call('gap');
  assert.equal(n(gap[0].gap), -42000, 'this month is 42,000 under budget');
  assert.equal(n(gap[3].gap), 55500);

  const acc = await call('accuracy');
  assert.equal(acc[0].family, 'DRS-250');
  assert.equal(n(acc[0].bias_pct), 20);

  const att = await call('attention');
  const issues = att.map((a) => a.issue);
  for (const want of ['stage overdue', 'no consensus', 'below target cover', 'over cover', 'over capacity', 'forecast bias', 'decision overdue', 'assumption past review']) assert.ok(issues.includes(want), `attention shows ${want}`);
  assert.equal(att.length, 10);

  assert.equal((await call('decisions')).length, 2);
  assert.equal((await call('assumptions')).length, 2);
  const comp = await call('compliance');
  assert.deepEqual([...new Set(comp.map((c) => c.rule))].sort(), ['CTRL-ACTUALS', 'CTRL-DECISION-OWNER', 'CTRL-EXEC-SIGNOFF', 'CTRL-FAMILY-DATA']);
  assert.equal((await call('activity')).length, 0);

  const show = await call('show', { family: 'tomato sauce 1' });
  assert.equal(show.family.code, 'SAU-1L');
  assert.equal(show.accuracy.length, 3);
  await assert.rejects(() => call('show', { family: 'sauce' }), /Ambiguous/);
  await assert.rejects(() => call('show', { family: "' OR 1=1 --" }), /No family/);

  const pack = await call('exec-pack');
  assert.equal(pack.capacity_pressure.length, 1);
  assert.equal(pack.open_decisions.length, 1);
  assert.equal((await call('supply-review')).capacity[0].resource, 'LINE-2');
  const weekly = await call('weekly-review');
  assert.equal(weekly.attention.length, 10);
  assert.ok(weekly.supply_review.capacity.length >= 1);

  const sc = await call('scenario', { 'demand-percent': 15, family: 'SAU-500', 'supply-follows': true });
  const peak = sc.capacity.find((r) => r.resource === 'LINE-1' && r.month === m(3));
  assert.equal(peak.load_after, 307, 'line 1 load rises with the extra 500 ml sauce');
  assert.equal(sc.balance.length, 0, 'stock holds when supply follows demand');
  const sc2 = await call('scenario', { 'demand-percent': 15, family: 'SAU-500' });
  assert.equal(sc2.balance.filter((r) => r.family === 'SAU-500').length, 6, 'without more supply 500 ml sauce drops below target');
  const sc3 = await call('scenario', { 'capacity-percent': 50, resource: 'LINE-2' });
  assert.equal(sc3.capacity.find((r) => r.resource === 'LINE-2' && r.month === m(2)).utilisation_after_pct, 91);
  await assert.rejects(() => call('scenario', { 'supply-follows': true, 'supply-percent': 5 }), /not both/);

  // Drafts
  const d1 = await call('draft-exec-pack');
  assert.match(fs.readFileSync(d1.file, 'utf8'), /DRAFT executive S&OP pack/);
  const d2 = await call('draft-demand-review');
  assert.match(fs.readFileSync(d2.file, 'utf8'), /DRAFT demand review/);

  // Writes
  await assert.rejects(() => call('forecast', { family: 'SAU-500', month: m(1), version: 'sales', units: 1 }), /actor/);
  await assert.rejects(() => call('forecast', { actor, family: 'SAU-500', month: m(1), version: 'sales', units: 9100, evidence: 'call' }), /exists/);
  const fc = await call('forecast', { actor, family: 'SAU-500', month: m(1), version: 'sales', units: 9100, evidence: 'Key account call', update: true });
  assert.equal(n(fc.units), 9100);
  await assert.rejects(() => call('forecast', { actor, family: 'SAU-500', month: m(9), version: 'sales', units: 1, evidence: 'x' }), /outside/);
  await assert.rejects(() => call('forecast', { actor, family: 'SAU-500', month: m(1), version: 'guess', units: 1, evidence: 'x' }), /version/);

  const cons = await call('consensus', { actor, from: 'sales', family: 'DRS-250', evidence: 'Demand review' });
  assert.equal(cons.filled, 0, 'consensus already set for every dressings month');
  await call('forecast', { actor, family: 'NEW-CHL', month: m(1), version: 'sales', units: 400, evidence: 'Launch plan' });
  assert.equal((await call('consensus', { actor, from: 'sales', family: 'NEW-CHL', evidence: 'Launch plan agreed' })).filled, 1);

  const sp = await call('supply', { actor, family: 'SAU-1L', month: m(3), units: 6000, evidence: 'Extra shift agreed', update: true });
  assert.equal(n(sp.units), 6000);
  assert.equal((await call('balance')).find((r) => r.family === 'SAU-1L' && r.month === m(3)).status, 'ok');

  await call('set-capacity', { actor, resource: 'line-2', month: m(2), hours: 220, note: 'Shutdown cut to one week', evidence: 'Maintenance plan' });
  assert.equal(n((await call('capacity')).find((r) => r.resource === 'LINE-2' && r.month === m(2)).utilisation_pct), 93);

  const st = await call('stock', { actor, family: 'SPR-HOL', 'on-hand': 900, asof: day(0), evidence: 'Stocktake' });
  assert.equal(n(st.on_hand), 900);

  await assert.rejects(() => call('actual', { actor, family: 'SAU-500', month: m(0), units: 1, evidence: 'x' }), /finished months/);
  await assert.rejects(() => call('actual', { actor, family: 'SAU-500', month: m(-1), units: 1, evidence: 'x' }), /exist/);
  await call('actual', { actor, family: 'SPR-HOL', month: m(-1), units: 300, evidence: 'Ledger' });

  const b = await call('budget', { actor, family: 'NEW-CHL', month: m(1), units: 300, revenue: 15000, evidence: 'Launch budget' });
  assert.equal(n(b.revenue), 15000);
  await assert.rejects(() => call('budget', { actor, family: 'NEW-CHL', month: m(2), units: 300, evidence: 'x' }), /no price/);

  const added = await call('add', { actor, kind: 'resource', code: 'CO-PACK', name: 'Co-packer, Hamilton' });
  assert.equal(added.code, 'CO-PACK');
  const fam = await call('add', { actor, kind: 'family', code: 'MAY-300', name: 'Mayonnaise 300 ml', price: 50, cost: 28, resource: 'CO-PACK', 'hours-per-unit': 0, 'target-cover': 1 });
  assert.equal(fam.currency, 'NZD');
  await assert.rejects(() => call('add', { actor, kind: 'widget' }), /kind/);
  const up = await call('update', { actor, family: 'NEW-CHL', price: 48, cost: 26, owner: 'Aroha', resource: 'LINE-1', 'hours-per-unit': 0.02, 'target-cover': 1, evidence: 'Launch costing' });
  assert.equal(n(up.price), 48);
  await assert.rejects(() => call('update', { actor, family: 'NEW-CHL', currency: 'dollars', evidence: 'x' }), /three-letter/);

  const a = await call('assume', { actor, family: 'SAU-500', text: 'Glass bottle supply holds at current lead time', owner: 'Wiremu', 'review-by': day(14) });
  const d = await call('decide', { actor, text: 'Move dressings excess to the Australian distributor', owner: 'Tama', due: day(10) });
  assert.equal((await call('resolve', { actor, decision: d.id.slice(0, 13), status: 'done', evidence: 'Distributor took 1,500 cases' })).status, 'done');
  assert.equal((await call('resolve', { actor, assumption: a.id, status: 'confirmed', evidence: 'Supplier letter' })).status, 'confirmed');
  await assert.rejects(() => call('resolve', { actor, decision: d.id, status: 'confirmed', evidence: 'x' }), /status/);

  const logged = await call('log', { actor, family: 'DRS-250', note: 'Retailer delisting risk raised by Tama' });
  assert.equal(logged.action, 'note');

  // The cycle: sign off, advance through the stages, close, open the next month.
  await assert.rejects(() => call('sign-off', { actor, what: 'exec', minutes: 'x', evidence: 'x' }), /exec stage/);
  await assert.rejects(() => call('sign-off', { actor, what: 'consensus', evidence: 'Demand review' }), /no consensus/);
  await call('sign-off', { actor, what: 'consensus', evidence: 'Holiday relish tail months agreed as zero', force: true });
  assert.equal((await call('advance', { actor, evidence: 'Supply review held' })).stage, 'pre_sop');
  assert.equal((await call('advance', { actor, evidence: 'Pre-S&OP held' })).stage, 'exec');
  await assert.rejects(() => call('advance', { actor, evidence: 'x' }), /executive sign-off/);
  await call('sign-off', { actor: 'Sarah', what: 'exec', minutes: 'Approved extra 1 litre shift; dressings excess to Australia.', evidence: 'Executive meeting' });
  assert.equal((await call('advance', { actor, evidence: 'Executive meeting held' })).stage, 'closed');
  await assert.rejects(() => call('balance').then((r) => { if (!r.length) throw Error('No open cycle'); }), /No open cycle/);
  const next = await call('open-cycle', { actor, month: m(1), evidence: 'Monthly cycle' });
  assert.ok(next.consensus_rows_carried > 0, 'last month\'s consensus is the starting point');
  await assert.rejects(() => call('open-cycle', { actor, month: m(2), evidence: 'x' }), /already open/);

  // Import from a Kinaxis workbook export (CSV), then a dry run, then a changed value.
  const csv = path.join(tmp, 'kinaxis.csv');
  fs.writeFileSync(csv, [
    'Product Family,Description,Measure,Period,Quantity',
    `SAU-500,Tomato sauce 500 ml,Consensus Demand,${m(2)},"8,700"`,
    `SAU-500,Tomato sauce 500 ml,Statistical Forecast,${m(2)},8300`,
    `PIC-400,Pickles 400 g,Sales Forecast,${m(2)},1200`,
    `PIC-400,Pickles 400 g,Supply Plan,${m(2)},1300`,
    `PIC-400,Pickles 400 g,Shipments History,${m(-1)},1100`,
    `PIC-400,Pickles 400 g,Safety Stock,${m(2)},300`,
  ].join('\n'));
  const dry = await call('import', { actor, file: csv, 'dry-run': true, update: true }, ['kinaxis']);
  assert.equal(dry.families_created, 1);
  assert.equal(dry.skipped.length, 1, 'unmapped measures are reported, not guessed');
  await assert.rejects(() => call('show', { family: 'PIC-400' }), /No family/);
  await assert.rejects(() => call('import', { actor, file: csv }, ['kinaxis']), /--update/);
  const imp = await call('import', { actor, file: csv, update: true }, ['kinaxis']);
  assert.equal(imp.families_created, 1);
  assert.equal((await call('import', { actor, file: csv }, ['kinaxis'])).unchanged, 5);
  assert.equal((await call('show', { family: 'PIC-400' })).plan.find((r) => r.month === m(2)).supply !== null, true);
  await assert.rejects(() => call('import', { actor, file: csv }, ['excel']), /supports/);
  const bad = path.join(tmp, 'bad.csv');
  fs.writeFileSync(bad, `Product Family,Measure,Period,Quantity\nROLL-1,Sales Forecast,${m(2)},10\nROLL-1,Sales Forecast,${m(3)},lots\n`);
  await assert.rejects(() => call('import', { actor, file: bad }, ['kinaxis']), /finite/);
  await assert.rejects(() => call('show', { family: 'ROLL-1' }), /No family/, 'a failed import leaves nothing behind');
  const mapped = path.join(tmp, 'mapped.csv');
  fs.writeFileSync(mapped, `Our group,Kind,When,How many\nMAP-1,Consensus,${m(2)},50\n`);
  fs.writeFileSync(path.join(tmp, 'map.json'), JSON.stringify({ family: 'Our group', measure: 'Kind', month: 'When', quantity: 'How many' }));
  assert.equal((await call('import', { actor, file: mapped, map: path.join(tmp, 'map.json') }, ['kinaxis'])).inserted, 1);

  // Helpers
  assert.equal(month('Jan 2027'), '2027-01-01');
  assert.equal(month('mar-27'), '2027-03-01');
  assert.equal(month('2027-02-15'), '2027-02-01');
  assert.throws(() => month('2027-13'), /month/);
  assert.equal(measureKind('Final Demand'), 'consensus');
  assert.equal(measureKind('Projected Available Balance'), null);
  assert.throws(() => parse(['list', '--oops']), /Unknown flag/);
  assert.throws(() => parse(['show', '--family']), /Missing/);

  const exported = await call('export', { out: path.join(tmp, 'exports') });
  assert.equal(exported.length, 13);
  assert.ok((await call('activity')).length > 10);
  assert.deepEqual(commands.filter((c) => !covered.has(c)), [], 'every command exercised');
  await db.close();

  cli(['scripts/view.mjs']);
  cli(['scripts/docs.mjs']);
  assert.equal(fs.readdirSync(path.join(tmp, 'views')).length, 3);
  assert.ok(fs.readdirSync(path.join(tmp, 'docs-out', 'exec-pack')).length >= 1);
  const { page, table } = await import('./lib/render.mjs');
  assert.match(page({ title: '<x>', sections: [{ title: 'T', html: table([{ a: '<script>x</script>' }]) }] }), /&lt;script&gt;/);
  assert.equal(JSON.parse(cli(['scripts/sop.mjs', 'list', '--json']).stdout).length, 8);
  assert.match(cli(['scripts/sop.mjs', 'show', '--family=sauce'], 1).stderr, /Ambiguous/);
  console.log(`PASS: ${commands.length} CLI commands; balance, capacity, gap to budget, forecast accuracy, scenarios, the monthly cycle, imports, rollback, drafts, views and documents checked (${process.env.TEST_DATABASE_URL ? 'PostgreSQL' : 'PGlite'}).`);
} finally {
  try { await db.close(); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}

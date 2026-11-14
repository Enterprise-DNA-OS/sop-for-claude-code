#!/usr/bin/env node
// The one CLI for S&OP for Claude Code. Human tables by default, --json for machines.
//   npm run sop -- help
//   npm run sop -- balance
//   npm run sop -- forecast --family=SAU-500 --month=2027-01 --version=sales --units=9000 --actor="Tama" --evidence="Key account call"
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table } from './lib/format.mjs';

export const commands = [
  'help', 'list', 'resources', 'cycles', 'show', 'demand-review', 'supply-review', 'balance', 'capacity', 'gap', 'accuracy',
  'attention', 'decisions', 'assumptions', 'compliance', 'activity', 'exec-pack', 'weekly-review', 'scenario',
  'add', 'update', 'forecast', 'consensus', 'supply', 'set-capacity', 'stock', 'actual', 'budget', 'assume', 'decide',
  'resolve', 'advance', 'sign-off', 'open-cycle', 'log', 'import', 'export', 'draft-exec-pack', 'draft-demand-review',
];
const STAGES = ['data', 'demand_review', 'supply_review', 'pre_sop', 'exec', 'closed'];
const VERSIONS = ['statistical', 'sales', 'consensus'];
const TABLES = ['resources', 'families', 'cycles', 'forecasts', 'supply_plan', 'capacity', 'inventory', 'budget', 'actuals', 'assumptions', 'decisions', 'activity', 'imports'];

// ------------------------------------------------------------ input checks
function need(v, k) { if (v === undefined || v === null || v === true || String(v).trim() === '') throw Error(`Required: --${k}`); return String(v).trim(); }
function num(v, k, min = 0) { const n = Number(need(v, k)); if (!Number.isFinite(n) || n < min) throw Error(`${k} must be a finite number >= ${min}`); return n; }
function date(v, k) { const s = need(v, k); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) !== s) throw Error(`${k} must be a real YYYY-MM-DD date`); return s; }
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export function month(v, k = 'month') {
  const s = need(v, k).toLowerCase();
  let y, m;
  let hit = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (hit) { y = +hit[1]; m = +hit[2]; }
  else if ((hit = s.match(/^([a-z]{3})[a-z]*[\s\-/]+(\d{2}|\d{4})$/)) && MON.includes(hit[1])) { m = MON.indexOf(hit[1]) + 1; y = +hit[2] < 100 ? 2000 + +hit[2] : +hit[2]; }
  else if ((hit = s.match(/^(\d{1,2})\/(\d{4})$/))) { m = +hit[1]; y = +hit[2]; }
  if (!y || !m || m < 1 || m > 12) throw Error(`${k} must be a month like 2027-01 or Jan 2027 (got "${v}")`);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
const today = () => new Date().toISOString().slice(0, 10);

async function tx(db, fn, dry = false) {
  await db.exec('BEGIN');
  try { const r = await fn(); await db.exec(dry ? 'ROLLBACK' : 'COMMIT'); return r; }
  catch (e) { await db.exec('ROLLBACK'); throw e; }
}
async function audit(db, familyId, action, actor, before, after, evidence) {
  await db.query('INSERT INTO activity(family_id,action,actor,before_data,after_data,evidence) VALUES($1,$2,$3,$4,$5,$6)',
    [familyId, action, actor, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, evidence]);
}

export async function matchFamily(db, ref) {
  ref = need(ref, 'family');
  const exact = await db.query('SELECT * FROM families WHERE lower(code)=lower($1) OR id::text=$1', [ref]);
  if (exact.length === 1) return exact[0];
  const rows = await db.query('SELECT * FROM families WHERE id::text LIKE $1 OR lower(name) LIKE $2 OR lower(code) LIKE $2 ORDER BY code', [ref.toLowerCase() + '%', '%' + ref.toLowerCase() + '%']);
  if (rows.length !== 1) throw Error(rows.length ? `Ambiguous family "${ref}"; use the code:\n${rows.map((r) => `${r.code}  ${r.name}`).join('\n')}` : `No family matches "${ref}"`);
  return rows[0];
}
async function matchResource(db, ref) {
  ref = need(ref, 'resource');
  const rows = await db.query('SELECT * FROM resources WHERE lower(code)=lower($1) OR id::text=$1 OR lower(name) LIKE $2 ORDER BY code', [ref, '%' + ref.toLowerCase() + '%']);
  const exact = rows.filter((r) => r.code.toLowerCase() === ref.toLowerCase());
  if (exact.length === 1) return exact[0];
  if (rows.length !== 1) throw Error(rows.length ? `Ambiguous resource "${ref}":\n${rows.map((r) => `${r.code}  ${r.name}`).join('\n')}` : `No resource matches "${ref}"`);
  return rows[0];
}
async function openCycle(db) {
  const c = (await db.query('SELECT * FROM v_open_cycle'))[0];
  if (!c) throw Error('No open cycle. Start one with open-cycle --month=YYYY-MM');
  return c;
}
async function inHorizon(db, m) {
  const ok = await db.query('SELECT 1 FROM v_horizon WHERE month=$1', [m]);
  if (!ok.length) throw Error(`${m.slice(0, 7)} is outside the open cycle's planning horizon`);
}

// ------------------------------------------------------------ reads
const reads = {
  list: 'SELECT f.code, f.name, f.unit, f.owner, f.currency, f.price, r.code AS resource, f.target_cover, f.active FROM families f LEFT JOIN resources r ON r.id=f.resource_id ORDER BY f.code',
  resources: 'SELECT code, name, site, owner, active FROM resources ORDER BY code',
  cycles: "SELECT to_char(month,'YYYY-MM') AS cycle, stage, demand_review_due, supply_review_due, pre_sop_due, exec_meeting, consensus_signed_by, exec_signed_by FROM cycles ORDER BY month DESC",
  'demand-review': "SELECT family, to_char(month,'YYYY-MM') AS month, statistical, sales, consensus, budget_units, CASE WHEN statistical>0 AND sales IS NOT NULL THEN round(100*(sales-statistical)/statistical,0) END AS sales_vs_stat_pct, CASE WHEN budget_units>0 AND consensus IS NOT NULL THEN round(100*(consensus-budget_units)/budget_units,0) END AS consensus_vs_budget_pct FROM v_plan ORDER BY family, month",
  balance: "SELECT family, to_char(month,'YYYY-MM') AS month, consensus, supply, closing_stock, cover_months, target_cover, status FROM v_balance ORDER BY family, month",
  capacity: "SELECT resource, site, to_char(month,'YYYY-MM') AS month, load_hours, available_hours, utilisation_pct, note FROM v_capacity ORDER BY resource, month",
  gap: "SELECT to_char(month,'YYYY-MM') AS month, currency, plan_units, budget_units, plan_revenue, budget_revenue, gap, families_without_consensus FROM v_gap ORDER BY currency, month",
  accuracy: "SELECT family, months, to_char(first_month,'YYYY-MM') AS from_month, to_char(last_month,'YYYY-MM') AS to_month, forecast_units, actual_units, wmape_pct, bias_pct FROM v_accuracy ORDER BY abs(bias_pct) DESC NULLS LAST, family",
  attention: 'SELECT issue, ref, month, detail FROM v_attention ORDER BY issue, ref',
  decisions: "SELECT d.id, to_char(c.month,'YYYY-MM') AS cycle, f.code AS family, d.text, d.owner, d.due, d.status, d.outcome FROM decisions d JOIN cycles c ON c.id=d.cycle_id LEFT JOIN families f ON f.id=d.family_id ORDER BY (d.status='open') DESC, d.due",
  assumptions: "SELECT a.id, to_char(c.month,'YYYY-MM') AS cycle, f.code AS family, a.text, a.owner, a.review_by, a.status FROM assumptions a JOIN cycles c ON c.id=a.cycle_id LEFT JOIN families f ON f.id=a.family_id ORDER BY (a.status='open') DESC, a.review_by",
  compliance: 'SELECT rule, ref, finding FROM v_compliance ORDER BY rule, ref',
  activity: 'SELECT created_at, action, actor, evidence FROM activity ORDER BY created_at DESC, id DESC LIMIT 100',
};

async function execPack(db) {
  const c = await openCycle(db);
  return {
    cycle: { month: c.month.slice(0, 7), stage: c.stage, exec_meeting: c.exec_meeting, consensus_signed_by: c.consensus_signed_by },
    gap_to_budget: await db.query(reads.gap),
    balance_exceptions: await db.query("SELECT family, to_char(min(month),'YYYY-MM') AS from_month, status, count(*) AS months, min(closing_stock) AS lowest_stock FROM v_balance WHERE status<>'ok' GROUP BY family, status ORDER BY family, status"),
    capacity_pressure: await db.query("SELECT resource, to_char(month,'YYYY-MM') AS month, load_hours, available_hours, utilisation_pct, note FROM v_capacity WHERE utilisation_pct>=90 OR available_hours IS NULL ORDER BY resource, month"),
    open_decisions: await db.query("SELECT d.text, d.owner, d.due FROM decisions d WHERE d.status='open' ORDER BY d.due"),
    open_assumptions: await db.query("SELECT a.text, a.owner, a.review_by FROM assumptions a WHERE a.status='open' ORDER BY a.review_by"),
  };
}

async function scenario(db, o) {
  const dp = num(o['demand-percent'] ?? 0, 'demand-percent', -100) / 100;
  const follows = Boolean(o['supply-follows']);
  if (follows && o['supply-percent'] !== undefined) throw Error('Use --supply-follows or --supply-percent, not both');
  const sp = follows ? dp : num(o['supply-percent'] ?? 0, 'supply-percent', -100) / 100;
  const cp = num(o['capacity-percent'] ?? 0, 'capacity-percent', -100) / 100;
  const fam = o.family ? (await matchFamily(db, o.family)).id : null;
  const resRow = o.resource ? await matchResource(db, o.resource) : null;
  const res = resRow?.id || null;
  const resCode = resRow?.code || null;
  const plan = await db.query('SELECT p.family_id, p.family, p.month, p.consensus, p.supply, p.target_cover, f.resource_id, f.hours_per_unit, i.on_hand FROM v_plan p JOIN families f ON f.id=p.family_id LEFT JOIN inventory i ON i.cycle_id=p.cycle_id AND i.family_id=p.family_id ORDER BY p.family, p.month');
  const caps = await db.query('SELECT r.id AS resource_id, r.code, h.month, c.hours FROM resources r CROSS JOIN v_horizon h LEFT JOIN capacity c ON c.resource_id=r.id AND c.month=h.month WHERE r.active ORDER BY r.code, h.month');
  const balance = [];
  const run = {};
  const load = {};
  for (const p of plan) {
    const hit = !fam || p.family_id === fam;
    const demand = Number(p.consensus ?? 0) * (hit ? 1 + dp : 1);
    const supply = Number(p.supply ?? 0) * (hit ? 1 + sp : 1);
    const key = p.family_id;
    run[key] ??= { base: p.on_hand === null ? null : Number(p.on_hand), now: p.on_hand === null ? null : Number(p.on_hand) };
    if (run[key].base === null) continue;
    run[key].base += Number(p.supply ?? 0) - Number(p.consensus ?? 0);
    run[key].now += supply - demand;
    if (p.resource_id) { const lk = p.resource_id + p.month; load[lk] = (load[lk] || { base: 0, now: 0 }); load[lk].base += Number(p.supply ?? 0) * Number(p.hours_per_unit ?? 0); load[lk].now += supply * Number(p.hours_per_unit ?? 0); }
    const cover = demand > 0 ? Math.round((run[key].now / demand) * 100) / 100 : null;
    const status = run[key].now < 0 ? 'short' : cover !== null && p.target_cover !== null && cover < Number(p.target_cover) ? 'below target' : 'ok';
    balance.push({ family: p.family, month: p.month.slice(0, 7), closing_before: Math.round(run[key].base), closing_after: Math.round(run[key].now), cover_after: cover, status_after: status });
  }
  const capacity = caps.map((c) => {
    const l = load[c.resource_id + c.month] || { base: 0, now: 0 };
    const hours = c.hours === null ? null : Number(c.hours) * (!res || res === c.resource_id ? 1 + cp : 1);
    return { resource: c.code, month: c.month.slice(0, 7), load_before: Math.round(l.base * 10) / 10, load_after: Math.round(l.now * 10) / 10, hours_after: hours, utilisation_after_pct: hours ? Math.round((100 * l.now) / hours) : null };
  });
  return {
    inputs: { demand_percent: dp * 100, supply_percent: sp * 100, supply_follows_demand: follows, capacity_percent: cp * 100, family: o.family || 'all', resource: o.resource || 'all' },
    balance: balance.filter((b) => b.status_after !== 'ok' && (b.closing_after !== b.closing_before || (!fam && !dp && !sp))),
    capacity: capacity.filter((c) => c.utilisation_after_pct === null || c.utilisation_after_pct > 100 || c.load_after !== c.load_before || (res && c.resource === resCode)),
  };
}

// ------------------------------------------------------------ import
const ALIASES = {
  family: ['Product family', 'Product Family', 'Family', 'Part family', 'Product group', 'Part'],
  name: ['Description', 'Family description', 'Name'],
  month: ['Month', 'Period', 'Bucket', 'Date', 'Period start'],
  measure: ['Measure', 'Series', 'Data type', 'Type', 'Metric'],
  quantity: ['Quantity', 'Qty', 'Value', 'Units'],
};
export function measureKind(s) {
  const m = String(s || '').toLowerCase();
  if (/consensus|final demand|approved demand/.test(m)) return 'consensus';
  if (/statistical|baseline|system forecast/.test(m)) return 'statistical';
  if (/sales|unconstrained|customer forecast/.test(m)) return 'sales';
  if (/supply|production|planned receipt|build plan/.test(m)) return 'supply';
  if (/actual|shipment|history|sold/.test(m)) return 'actual';
  return null;
}
async function importKinaxis(db, o, actor) {
  const filename = path.resolve(need(o.file, 'file'));
  const input = fs.readFileSync(filename, 'utf8');
  const rows = parseCsv(input);
  if (!rows.length) throw Error('No data rows');
  const mapping = o.map ? JSON.parse(fs.readFileSync(path.resolve(o.map), 'utf8')) : {};
  for (const k of Object.keys(mapping)) if (!ALIASES[k]) throw Error(`Unknown mapping field ${k}; use ${Object.keys(ALIASES).join(', ')}`);
  const col = (row, k) => pick(row, ...(mapping[k] ? [mapping[k]] : []), ...ALIASES[k]);
  const out = { rows: rows.length, families_created: 0, inserted: 0, updated: 0, unchanged: 0, skipped: [], dry_run: Boolean(o['dry-run']) };
  return tx(db, async () => {
    const c = await openCycle(db);
    const seen = new Set();
    for (const [index, row] of rows.entries()) {
      const line = index + 2;
      const code = need(col(row, 'family'), `family in row ${line}`);
      const kind = measureKind(col(row, 'measure'));
      if (!kind) { out.skipped.push(`row ${line}: measure "${col(row, 'measure')}" not mapped`); continue; }
      const m = month(col(row, 'month'), `month in row ${line}`);
      const qty = num(String(col(row, 'quantity')).replace(/,/g, ''), `quantity in row ${line}`);
      const key = `${code}|${m}|${kind}`.toLowerCase();
      if (seen.has(key)) throw Error(`Duplicate row in import: ${code} ${m.slice(0, 7)} ${kind}`);
      seen.add(key);
      let f = (await db.query('SELECT * FROM families WHERE lower(code)=lower($1)', [code]))[0];
      if (!f) {
        f = (await db.query('INSERT INTO families(code,name,source) VALUES($1,$2,$3) RETURNING *', [code, col(row, 'name') || code, JSON.stringify(row)]))[0];
        out.families_created++;
        await audit(db, f.id, 'import kinaxis: family created', actor, null, f, path.basename(filename));
      }
      let old, sql, params;
      if (kind === 'actual') {
        if (m >= today().slice(0, 8) + '01') { out.skipped.push(`row ${line}: actuals for a month not yet finished`); continue; }
        old = (await db.query('SELECT * FROM actuals WHERE family_id=$1 AND month=$2', [f.id, m]))[0];
        sql = 'INSERT INTO actuals(family_id,month,units,source_ref) VALUES($1,$2,$3,$4) ON CONFLICT(family_id,month) DO UPDATE SET units=excluded.units,source_ref=excluded.source_ref RETURNING *';
        params = [f.id, m, qty, path.basename(filename)];
      } else {
        if (!(await db.query('SELECT 1 FROM v_horizon WHERE month=$1', [m])).length) { out.skipped.push(`row ${line}: ${m.slice(0, 7)} outside the open cycle horizon`); continue; }
        if (kind === 'supply') {
          old = (await db.query('SELECT * FROM supply_plan WHERE cycle_id=$1 AND family_id=$2 AND month=$3', [c.id, f.id, m]))[0];
          sql = 'INSERT INTO supply_plan(cycle_id,family_id,month,units,actor) VALUES($1,$2,$3,$4,$5) ON CONFLICT(cycle_id,family_id,month) DO UPDATE SET units=excluded.units,actor=excluded.actor RETURNING *';
          params = [c.id, f.id, m, qty, actor];
        } else {
          old = (await db.query('SELECT * FROM forecasts WHERE cycle_id=$1 AND family_id=$2 AND month=$3 AND version=$4', [c.id, f.id, m, kind]))[0];
          sql = 'INSERT INTO forecasts(cycle_id,family_id,month,version,units,actor,source_ref) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(cycle_id,family_id,month,version) DO UPDATE SET units=excluded.units,actor=excluded.actor,source_ref=excluded.source_ref RETURNING *';
          params = [c.id, f.id, m, kind, qty, actor, path.basename(filename)];
        }
      }
      if (old && Number(old.units) === qty) { out.unchanged++; continue; }
      if (old && !o.update) throw Error(`Row ${line} changes ${code} ${m.slice(0, 7)} ${kind} from ${old.units} to ${qty}; review, then run again with --update`);
      const result = (await db.query(sql, params))[0];
      old ? out.updated++ : out.inserted++;
      await audit(db, f.id, `import kinaxis: ${kind}`, actor, old || null, result, path.basename(filename));
    }
    await db.query('INSERT INTO imports(filename,sha256,kind,row_count,actor) VALUES($1,$2,$3,$4,$5)', [path.basename(filename), createHash('sha256').update(input).digest('hex'), 'kinaxis', rows.length, actor]);
    return out;
  }, Boolean(o['dry-run']));
}

// ------------------------------------------------------------ drafts
function mdTable(rows) {
  if (!rows.length) return '_Nothing to show._\n';
  const keys = Object.keys(rows[0]);
  return [`| ${keys.join(' | ')} |`, `|${keys.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${keys.map((k) => String(r[k] ?? '').replace(/\|/g, '/')).join(' | ')} |`)].join('\n') + '\n';
}
function writeDraft(name, body, o) {
  const dir = path.resolve(o.out || path.join(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, body);
  return { file, draft: true };
}

// ------------------------------------------------------------ run
export async function run(db, cmd, o = {}, args = []) {
  if (!commands.includes(cmd)) throw Error(`Unknown command ${cmd}; use help`);
  if (cmd === 'help') return commands.map((command) => ({ command }));
  if (reads[cmd]) return db.query(reads[cmd]);
  if (cmd === 'show') {
    const f = await matchFamily(db, o.family ?? args[0]);
    return {
      family: (await db.query('SELECT f.code, f.name, f.unit, f.owner, f.currency, f.price, f.cost, r.code AS resource, f.hours_per_unit, f.target_cover, f.max_cover, f.active FROM families f LEFT JOIN resources r ON r.id=f.resource_id WHERE f.id=$1', [f.id]))[0],
      plan: await db.query("SELECT to_char(month,'YYYY-MM') AS month, statistical, sales, consensus, supply, budget_units FROM v_plan WHERE family_id=$1 ORDER BY month", [f.id]),
      balance: await db.query("SELECT to_char(month,'YYYY-MM') AS month, closing_stock, cover_months, status FROM v_balance WHERE family_id=$1 ORDER BY month", [f.id]),
      accuracy: await db.query("SELECT to_char(month,'YYYY-MM') AS month, forecast_lag1, actual FROM v_accuracy_detail WHERE family_id=$1 ORDER BY month", [f.id]),
    };
  }
  if (cmd === 'supply-review') {
    return {
      balance: await db.query("SELECT family, to_char(month,'YYYY-MM') AS month, consensus, supply, closing_stock, cover_months, status FROM v_balance WHERE status<>'ok' ORDER BY family, month"),
      capacity: await db.query("SELECT resource, to_char(month,'YYYY-MM') AS month, load_hours, available_hours, utilisation_pct, note FROM v_capacity WHERE utilisation_pct>=85 OR available_hours IS NULL ORDER BY resource, month"),
    };
  }
  if (cmd === 'exec-pack') return execPack(db);
  if (cmd === 'weekly-review') {
    return {
      attention: await run(db, 'attention'),
      supply_review: await run(db, 'supply-review'),
      gap: await run(db, 'gap'),
    };
  }
  if (cmd === 'scenario') return scenario(db, o);
  if (cmd === 'export') {
    const dir = path.resolve(o.out || path.join(REPO_ROOT, 'exports', new Date().toISOString().replace(/[:.]/g, '-')));
    fs.mkdirSync(dir, { recursive: true });
    const result = [];
    for (const t of TABLES) {
      const file = path.join(dir, t + '.json');
      if (fs.existsSync(file)) throw Error(`Export exists: ${file}`);
      const rows = await db.query(`SELECT * FROM ${t} ORDER BY id`);
      fs.writeFileSync(file, JSON.stringify(rows, null, 2) + '\n');
      result.push({ records: t, count: rows.length, file });
    }
    return result;
  }
  if (cmd === 'draft-exec-pack') {
    const p = await execPack(db);
    const body = `# DRAFT executive S&OP pack, ${p.cycle.month}\n\nStage: ${p.cycle.stage}. Meeting: ${p.cycle.exec_meeting || 'not set'}. Consensus signed off by: ${p.cycle.consensus_signed_by || 'not yet'}.\n\nDraft for review. Numbers come from the planning database; decisions are made in the meeting, not here.\n\n## Plan against budget\n\n${mdTable(p.gap_to_budget)}\n## Where demand and supply do not balance\n\n${mdTable(p.balance_exceptions)}\n## Capacity under pressure\n\n${mdTable(p.capacity_pressure)}\n## Decisions still open\n\n${mdTable(p.open_decisions)}\n## Assumptions behind the plan\n\n${mdTable(p.open_assumptions)}\n## Decisions asked of this meeting\n\n- [ ] \n`;
    return writeDraft(`exec-pack-${p.cycle.month}.md`, body, o);
  }
  if (cmd === 'draft-demand-review') {
    const c = await openCycle(db);
    const rows = await run(db, 'demand-review');
    const acc = await run(db, 'accuracy');
    const body = `# DRAFT demand review, ${c.month.slice(0, 7)}\n\nDraft for the demand review meeting. Sales and statistical forecasts side by side, with consensus where it has been agreed.\n\n## Forecast versions by family\n\n${mdTable(rows)}\n## How last month's consensus did\n\n${mdTable(acc)}\n## To agree in the meeting\n\n- Families with no consensus\n- Where sales and statistical differ by more than 10%\n- Assumptions to record, each with an owner and a review date\n`;
    return writeDraft(`demand-review-${c.month.slice(0, 7)}.md`, body, o);
  }

  // Everything below writes, inside one transaction, with an activity record.
  const actor = need(o.actor, 'actor');
  if (cmd === 'import') {
    if (args[0] !== 'kinaxis') throw Error('Import supports: import kinaxis --file=<csv>');
    return importKinaxis(db, o, actor);
  }
  return tx(db, async () => {
    if (cmd === 'add') {
      const kind = need(o.kind, 'kind');
      if (kind === 'resource') {
        const row = (await db.query('INSERT INTO resources(code,name,site,owner) VALUES($1,$2,$3,$4) RETURNING *', [need(o.code, 'code'), need(o.name, 'name'), o.site || null, o.owner || null]))[0];
        await audit(db, null, 'add resource', actor, null, row, o.evidence || 'added by operator');
        return row;
      }
      if (kind !== 'family') throw Error('--kind must be family or resource');
      const r = o.resource ? await matchResource(db, o.resource) : null;
      const row = (await db.query('INSERT INTO families(code,name,unit,owner,currency,price,cost,resource_id,hours_per_unit,target_cover,max_cover) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *', [
        need(o.code, 'code'), need(o.name, 'name'), o.unit || 'cases', o.owner || null, o.currency ? need(o.currency, 'currency').toUpperCase() : 'NZD',
        o.price !== undefined ? num(o.price, 'price') : null, o.cost !== undefined ? num(o.cost, 'cost') : null, r?.id || null,
        o['hours-per-unit'] !== undefined ? num(o['hours-per-unit'], 'hours-per-unit') : null,
        o['target-cover'] !== undefined ? num(o['target-cover'], 'target-cover') : null, o['max-cover'] !== undefined ? num(o['max-cover'], 'max-cover') : null]))[0];
      await audit(db, row.id, 'add family', actor, null, row, o.evidence || 'added by operator');
      return row;
    }
    if (cmd === 'update') {
      const f = await matchFamily(db, o.family);
      const set = {};
      for (const k of ['name', 'unit', 'owner']) if (o[k] !== undefined) set[k] = need(o[k], k);
      if (o.currency !== undefined) { set.currency = need(o.currency, 'currency').toUpperCase(); if (!/^[A-Z]{3}$/.test(set.currency)) throw Error('currency must be a three-letter code'); }
      for (const k of ['price', 'cost', 'hours-per-unit', 'target-cover', 'max-cover']) if (o[k] !== undefined) set[k.replaceAll('-', '_')] = num(o[k], k);
      if (o.resource !== undefined) set.resource_id = (await matchResource(db, o.resource)).id;
      if (o.active !== undefined) { if (!['true', 'false'].includes(String(o.active))) throw Error('active must be true or false'); set.active = String(o.active) === 'true'; }
      const keys = Object.keys(set);
      if (!keys.length) throw Error('Nothing to update');
      const row = (await db.query(`UPDATE families SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map((k) => set[k]), f.id]))[0];
      await audit(db, f.id, 'update family', actor, f, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'forecast' || cmd === 'supply') {
      const c = await openCycle(db);
      const f = await matchFamily(db, o.family);
      const m = month(o.month);
      await inHorizon(db, m);
      const units = num(o.units, 'units');
      const evidence = need(o.evidence, 'evidence');
      let old, row;
      if (cmd === 'forecast') {
        const version = need(o.version, 'version');
        if (!VERSIONS.includes(version)) throw Error(`--version must be one of ${VERSIONS.join(', ')}`);
        old = (await db.query('SELECT * FROM forecasts WHERE cycle_id=$1 AND family_id=$2 AND month=$3 AND version=$4', [c.id, f.id, m, version]))[0];
        if (old && !o.update) throw Error(`A ${version} forecast for ${f.code} ${m.slice(0, 7)} exists (${old.units}); add --update to replace it`);
        row = (await db.query('INSERT INTO forecasts(cycle_id,family_id,month,version,units,actor,source_ref) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(cycle_id,family_id,month,version) DO UPDATE SET units=excluded.units,actor=excluded.actor,source_ref=excluded.source_ref RETURNING *', [c.id, f.id, m, version, units, actor, evidence]))[0];
      } else {
        old = (await db.query('SELECT * FROM supply_plan WHERE cycle_id=$1 AND family_id=$2 AND month=$3', [c.id, f.id, m]))[0];
        if (old && !o.update) throw Error(`A supply plan for ${f.code} ${m.slice(0, 7)} exists (${old.units}); add --update to replace it`);
        row = (await db.query('INSERT INTO supply_plan(cycle_id,family_id,month,units,actor) VALUES($1,$2,$3,$4,$5) ON CONFLICT(cycle_id,family_id,month) DO UPDATE SET units=excluded.units,actor=excluded.actor RETURNING *', [c.id, f.id, m, units, actor]))[0];
      }
      await audit(db, f.id, cmd, actor, old || null, row, evidence);
      return row;
    }
    if (cmd === 'consensus') {
      const c = await openCycle(db);
      const from = need(o.from, 'from');
      if (!['statistical', 'sales'].includes(from)) throw Error('--from must be statistical or sales');
      const f = o.family ? await matchFamily(db, o.family) : null;
      const rows = await db.query(`INSERT INTO forecasts(cycle_id,family_id,month,version,units,actor,source_ref)
        SELECT cycle_id,family_id,month,'consensus',units,$2,$3 FROM forecasts s WHERE s.cycle_id=$1 AND s.version=$4 AND ($5::uuid IS NULL OR s.family_id=$5)
        AND NOT EXISTS (SELECT 1 FROM forecasts x WHERE x.cycle_id=s.cycle_id AND x.family_id=s.family_id AND x.month=s.month AND x.version='consensus')
        RETURNING *`, [c.id, actor, `copied from ${from}: ${need(o.evidence, 'evidence')}`, from, f?.id || null]);
      await audit(db, f?.id || null, `consensus from ${from}`, actor, null, { rows: rows.length }, o.evidence);
      return { filled: rows.length, from, family: f?.code || 'all', note: 'Only months with no consensus were filled. Change a single month with forecast --version=consensus --update.' };
    }
    if (cmd === 'set-capacity') {
      const r = await matchResource(db, o.resource);
      const m = month(o.month);
      const old = (await db.query('SELECT * FROM capacity WHERE resource_id=$1 AND month=$2', [r.id, m]))[0];
      const row = (await db.query('INSERT INTO capacity(resource_id,month,hours,note) VALUES($1,$2,$3,$4) ON CONFLICT(resource_id,month) DO UPDATE SET hours=excluded.hours,note=excluded.note RETURNING *', [r.id, m, num(o.hours, 'hours'), o.note || null]))[0];
      await audit(db, null, `capacity ${r.code}`, actor, old || null, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'stock') {
      const c = await openCycle(db);
      const f = await matchFamily(db, o.family);
      const old = (await db.query('SELECT * FROM inventory WHERE cycle_id=$1 AND family_id=$2', [c.id, f.id]))[0];
      const row = (await db.query('INSERT INTO inventory(cycle_id,family_id,on_hand,asof) VALUES($1,$2,$3,$4) ON CONFLICT(cycle_id,family_id) DO UPDATE SET on_hand=excluded.on_hand,asof=excluded.asof RETURNING *', [c.id, f.id, num(o['on-hand'], 'on-hand', -1e12), date(o.asof, 'asof')]))[0];
      await audit(db, f.id, 'opening stock', actor, old || null, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'actual') {
      const f = await matchFamily(db, o.family);
      const m = month(o.month);
      if (m >= today().slice(0, 8) + '01') throw Error('Actuals are recorded for finished months only');
      const old = (await db.query('SELECT * FROM actuals WHERE family_id=$1 AND month=$2', [f.id, m]))[0];
      if (old && !o.update) throw Error(`Actuals for ${f.code} ${m.slice(0, 7)} exist (${old.units}); add --update to replace them`);
      const row = (await db.query('INSERT INTO actuals(family_id,month,units,revenue,source_ref) VALUES($1,$2,$3,$4,$5) ON CONFLICT(family_id,month) DO UPDATE SET units=excluded.units,revenue=excluded.revenue,source_ref=excluded.source_ref RETURNING *', [f.id, m, num(o.units, 'units'), o.revenue !== undefined ? num(o.revenue, 'revenue') : null, need(o.evidence, 'evidence')]))[0];
      await audit(db, f.id, 'actual', actor, old || null, row, o.evidence);
      return row;
    }
    if (cmd === 'budget') {
      const f = await matchFamily(db, o.family);
      const m = month(o.month);
      const old = (await db.query('SELECT * FROM budget WHERE family_id=$1 AND month=$2', [f.id, m]))[0];
      if (old && !o.update) throw Error(`Budget for ${f.code} ${m.slice(0, 7)} exists; add --update to replace it`);
      const units = num(o.units, 'units');
      const revenue = o.revenue !== undefined ? num(o.revenue, 'revenue') : f.price !== null ? units * Number(f.price) : null;
      if (revenue === null) throw Error('Family has no price; give --revenue');
      const row = (await db.query('INSERT INTO budget(family_id,month,units,revenue) VALUES($1,$2,$3,$4) ON CONFLICT(family_id,month) DO UPDATE SET units=excluded.units,revenue=excluded.revenue RETURNING *', [f.id, m, units, revenue]))[0];
      await audit(db, f.id, 'budget', actor, old || null, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'assume' || cmd === 'decide') {
      const c = o.cycle ? (await db.query('SELECT * FROM cycles WHERE month=$1', [month(o.cycle, 'cycle')]))[0] : await openCycle(db);
      if (!c) throw Error('No cycle for that month');
      const f = o.family ? await matchFamily(db, o.family) : null;
      const row = cmd === 'assume'
        ? (await db.query('INSERT INTO assumptions(cycle_id,family_id,text,owner,review_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [c.id, f?.id || null, need(o.text, 'text'), need(o.owner, 'owner'), date(o['review-by'], 'review-by')]))[0]
        : (await db.query('INSERT INTO decisions(cycle_id,family_id,text,owner,due) VALUES($1,$2,$3,$4,$5) RETURNING *', [c.id, f?.id || null, need(o.text, 'text'), need(o.owner, 'owner'), date(o.due, 'due')]))[0];
      await audit(db, f?.id || null, cmd, actor, null, row, o.evidence || 'recorded in S&OP meeting');
      return row;
    }
    if (cmd === 'resolve') {
      const isDecision = o.decision !== undefined;
      const ref = need(isDecision ? o.decision : o.assumption, isDecision ? 'decision' : 'assumption');
      const t = isDecision ? 'decisions' : 'assumptions';
      const found = await db.query(`SELECT * FROM ${t} WHERE id::text LIKE $1`, [ref.toLowerCase() + '%']);
      if (found.length !== 1) throw Error(found.length ? `Ambiguous id ${ref}` : `No ${t.slice(0, -1)} ${ref}`);
      const status = need(o.status, 'status');
      const allowed = isDecision ? ['done', 'dropped', 'open'] : ['confirmed', 'dropped', 'open'];
      if (!allowed.includes(status)) throw Error(`--status must be one of ${allowed.join(', ')}`);
      const row = isDecision
        ? (await db.query('UPDATE decisions SET status=$1, outcome=$2 WHERE id=$3 RETURNING *', [status, need(o.evidence, 'evidence'), found[0].id]))[0]
        : (await db.query('UPDATE assumptions SET status=$1 WHERE id=$2 RETURNING *', [status, found[0].id]))[0];
      await audit(db, found[0].family_id, `resolve ${t.slice(0, -1)}`, actor, found[0], row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'sign-off') {
      const c = await openCycle(db);
      const what = need(o.what, 'what');
      let row;
      if (what === 'consensus') {
        const missing = (await db.query("SELECT count(*)::int AS n FROM v_plan WHERE consensus IS NULL AND family_id IN (SELECT id FROM families WHERE price IS NOT NULL)"))[0].n;
        if (missing && !o.force) throw Error(`${missing} family-month(s) with a price have no consensus. Fill them, or add --force with a reason in --evidence`);
        row = (await db.query('UPDATE cycles SET consensus_signed_by=$1 WHERE id=$2 RETURNING *', [actor, c.id]))[0];
      } else if (what === 'exec') {
        if (c.stage !== 'exec') throw Error('Executive sign-off happens at the exec stage');
        row = (await db.query('UPDATE cycles SET exec_signed_by=$1, exec_signed_at=now(), minutes=$2 WHERE id=$3 RETURNING *', [actor, need(o.minutes, 'minutes'), c.id]))[0];
      } else throw Error('--what must be consensus or exec');
      await audit(db, null, `sign-off ${what}`, actor, c, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'advance') {
      const c = await openCycle(db);
      const next = STAGES[STAGES.indexOf(c.stage) + 1];
      if (next === 'pre_sop' && !c.consensus_signed_by) throw Error('Sign off the consensus before pre-S&OP (sign-off --what=consensus)');
      if (next === 'closed' && !c.exec_signed_by) throw Error('Record the executive sign-off before closing the cycle (sign-off --what=exec)');
      const row = (await db.query('UPDATE cycles SET stage=$1 WHERE id=$2 RETURNING *', [next, c.id]))[0];
      await audit(db, null, `advance to ${next}`, actor, c, row, need(o.evidence, 'evidence'));
      return row;
    }
    if (cmd === 'open-cycle') {
      if ((await db.query('SELECT 1 FROM v_open_cycle')).length) throw Error('A cycle is already open; close it first');
      const m = month(o.month);
      const prev = (await db.query('SELECT * FROM cycles WHERE month<$1 ORDER BY month DESC LIMIT 1', [m]))[0];
      const row = (await db.query("INSERT INTO cycles(month,stage,demand_review_due,supply_review_due,pre_sop_due,exec_meeting) VALUES($1,'data',$1::date+6,$1::date+12,$1::date+16,$1::date+20) RETURNING *", [m]))[0];
      let carried = 0;
      if (prev) {
        carried = (await db.query(`INSERT INTO forecasts(cycle_id,family_id,month,version,units,actor,source_ref)
          SELECT $1,family_id,month,'consensus',units,$2,'carried from '||to_char($3::date,'YYYY-MM') FROM forecasts
          WHERE cycle_id=$4 AND version='consensus' AND month>=$5 RETURNING id`, [row.id, actor, prev.month, prev.id, m])).length;
        await db.query(`INSERT INTO supply_plan(cycle_id,family_id,month,units,actor) SELECT $1,family_id,month,units,$2 FROM supply_plan WHERE cycle_id=$3 AND month>=$4`, [row.id, actor, prev.id, m]);
      }
      await audit(db, null, 'open cycle', actor, null, row, need(o.evidence, 'evidence'));
      return { ...row, consensus_rows_carried: carried };
    }
    if (cmd === 'log') {
      const f = await matchFamily(db, o.family);
      await audit(db, f.id, 'note', actor, null, { note: need(o.note, 'note') }, o.evidence || 'note');
      return (await db.query('SELECT * FROM activity WHERE family_id=$1 ORDER BY created_at DESC LIMIT 1', [f.id]))[0];
    }
    throw Error(`Unsupported command ${cmd}`);
  });
}

// ------------------------------------------------------------ command line
const FLAGS = new Set(['json', 'family', 'resource', 'month', 'version', 'units', 'actor', 'evidence', 'update', 'from', 'hours', 'note', 'on-hand', 'asof', 'revenue', 'text', 'owner', 'review-by', 'due', 'cycle', 'decision', 'assumption', 'status', 'what', 'minutes', 'force', 'kind', 'code', 'name', 'unit', 'site', 'currency', 'price', 'cost', 'hours-per-unit', 'target-cover', 'max-cover', 'active', 'file', 'map', 'dry-run', 'out', 'demand-percent', 'supply-percent', 'capacity-percent', 'supply-follows']);
const BOOL = new Set(['json', 'update', 'force', 'dry-run', 'supply-follows']);
export function parse(argv) {
  const args = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { args.push(a); continue; }
    const [k, ...rest] = a.slice(2).split('=');
    if (!FLAGS.has(k)) throw Error(`Unknown flag --${k}`);
    if (BOOL.has(k)) { if (rest.length) throw Error(`--${k} takes no value`); o[k] = true; continue; }
    o[k] = rest.length ? rest.join('=') : argv[++i];
    if (o[k] === undefined || o[k].startsWith('--')) throw Error(`Missing value for --${k}`);
  }
  return { cmd: args.shift() || 'help', args, o };
}
function display(result) {
  if (Array.isArray(result)) return result.length ? table(result, Object.keys(result[0]).map((key) => ({ key, label: key, width: 60, format: (v) => (v && typeof v === 'object' ? JSON.stringify(v) : v) }))) : '(nothing)';
  return Object.entries(result).map(([k, v]) => (v instanceof Date ? `${k}: ${v.toISOString()}` : Array.isArray(v) ? `\n${k}\n${display(v)}` : v && typeof v === 'object' ? `\n${k}\n${display(v)}` : `${k}: ${v}`)).join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  try {
    const { cmd, args, o } = parse(process.argv.slice(2));
    db = await getDb();
    const result = await run(db, cmd, o, args);
    console.log(o.json ? JSON.stringify(result, null, 2) : display(result));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    if (db) await db.close();
  }
}

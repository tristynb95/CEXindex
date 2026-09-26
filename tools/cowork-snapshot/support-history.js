// ========== SUPPORT LIST HISTORY ==========
// The Support List is recomputed from scratch every day and the app keeps no
// record of it, so "who left focus since last month?" or "how long has this
// bakery been High Priority?" can't be answered from a single snapshot. This
// keeps one list per reference month in support-list-history.csv:
//
//   recorded       — captured by the nightly export. The current reference
//                    month is rewritten every run, so each month ends up
//                    holding the list as it stood on the last day it was the
//                    reference (the last day of the following month).
//   reconstructed  — months before recording began, rebuilt by running the
//                    app's code with its clock set to that same last day and
//                    only the visits logged by then. Built once; a recorded
//                    row always wins over a reconstructed one.
//
// Reconstructed months use today's dashboard data and bakery directory, so a
// later re-upload of an old month or an ops-area rename shows through.

const fs = require("fs");
const {loadApp, buildSupportList} = require("./app-logic");

const COLUMNS = [
  "reference_month", "recorded_as", "rank", "bakery", "region", "ops_area",
  "priority_level", "support_score", "cei_score", "cei_band", "trend",
  "visit_status", "biggest_lever",
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthKey(label) {
  const [m, y] = String(label).split(" ");
  return (2000 + Number(y)) * 12 + MONTH_SHORT.indexOf(m);
}

function labelFromKey(key) {
  return MONTH_SHORT[key % 12] + " " + String(Math.floor(key / 12)).slice(-2);
}

// The last moment a month was the Support List's reference month: the end of
// the month after it.
function lastDayAsReference(key) {
  const year = Math.floor((key + 2) / 12);
  const month = (key + 2) % 12;
  return new Date(year, month, 0, 23, 59, 0);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return header ? body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))) : [];
}

function cell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toRows(support, recordedAs) {
  return support.supportList.map((r) => ({
    reference_month: support.referenceMonth,
    recorded_as: recordedAs,
    rank: r.rank,
    bakery: r.bakery,
    region: r.region,
    ops_area: r.opsArea,
    priority_level: r.priorityLevel,
    support_score: r.supportScore,
    cei_score: r.ceiScore,
    cei_band: r.ceiBand,
    trend: r.trend.direction,
    visit_status: r.visitStatus,
    biggest_lever: r.biggestLever ? r.biggestLever.metric : "",
  }));
}

// Returns the new history CSV text. `current` is today's buildSupportList
// result; `existingPath` is last run's history file, if any.
function updateHistory(db, current, existingPath) {
  const existing = fs.existsSync(existingPath) ? parseCsv(fs.readFileSync(existingPath, "utf8")) : [];
  const byMonth = new Map();
  existing.forEach((r) => {
    if (!byMonth.has(r.reference_month)) byMonth.set(r.reference_month, []);
    byMonth.get(r.reference_month).push(r);
  });

  byMonth.set(current.referenceMonth, toRows(current, "recorded"));

  // Rebuild any month the dashboard could have shown a list for but the
  // history lacks — the first run backfills, later runs only fill gaps.
  const months = ((db.dashboardData && db.dashboardData.months) || []).map(monthKey).filter((k) => !isNaN(k));
  const firstKey = Math.min(...months);
  const currentKey = monthKey(current.referenceMonth);
  for (let key = firstKey; key < currentKey; key++) {
    const label = labelFromKey(key);
    if (byMonth.has(label)) continue;
    const support = buildSupportList(db, loadApp(db, lastDayAsReference(key)));
    if (support.referenceMonth === label && support.supportList.length) {
      byMonth.set(label, toRows(support, "reconstructed"));
    }
  }

  const all = [...byMonth.entries()]
      .sort((a, b) => monthKey(a[0]) - monthKey(b[0]))
      .flatMap(([, rows]) => rows);
  return [COLUMNS.join(",")].concat(all.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))).join("\n") + "\n";
}

module.exports = {updateHistory, parseCsv};

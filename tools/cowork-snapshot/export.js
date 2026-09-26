// ========== COWORK DATA SNAPSHOT ==========
// Exports the live Realtime Database into the Cowork OS workspace so Claude
// Cowork can analyse it. Each run overwrites the previous export — there is no
// history, the data carries its own timeline (monthly records, dated visits).
// Run nightly by the "CEXindex Cowork Snapshot" scheduled task (see
// install-task.ps1), or by hand:
//
//   node tools/cowork-snapshot/export.js [outputDir]
//
// Uses the Firebase CLI's own login (`firebase login`), so it needs no service
// account key. One run downloads the whole database once (~4 MB in Sep 2026),
// comfortably inside the free download allowance even run daily.
//
// Only the analysis branches are written out. Security/session logs, admin
// lists, notification plumbing and role config never leave the machine's temp
// folder, and PDF download URLs are stripped because their embedded token
// grants access to the file to anyone holding the link.

const fs = require("fs");
const os = require("os");
const path = require("path");
const {spawnSync} = require("child_process");
const vm = require("vm");
const {loadApp, buildSupportList, visitView, canonicalBakery, kpiRows} = require("./app-logic");
const {fetchComments} = require("./comments");
const {updateHistory} = require("./support-history");

const PROJECT = "cexindex";
const DEFAULT_OUT_DIR = path.join(os.homedir(), "OneDrive", "Desktop", "Cowork OS", "Resources", "Coffee", "CEXindex Data");
const OUT_DIR = path.resolve(process.argv[2] || process.env.COWORK_DATA_DIR || DEFAULT_OUT_DIR);

// Friendly column names for the monthly dashboard records, in CSV order.
// Field meanings are documented in DATA-README.md.
const DASHBOARD_COLUMNS = [
  ["b", "bakery"],
  ["m", "month"],
  ["ac", "cei_score"],
  ["acb", "cei_band"],
  ["ac_raw", "cei_score_unadjusted"],
  ["c", "peer_score"],
  ["cb", "peer_band"],
  ["c_raw", "peer_score_unadjusted"],
  ["cr", "peer_rank_in_month"],
  ["co", "data_confidence"],
  ["noData", "no_data"],
  ["n", "nps"],
  ["nd", "nps_drink"],
  ["nm", "nps_meal"],
  ["nc", "nps_coffee"],
  ["na", "nps_all_ratings"],
  ["v", "responses"],
  ["va", "responses_all"],
  ["vc", "responses_coffee"],
  ["vf", "responses_food"],
  ["ov", "overall_satisfaction_pct"],
  ["fr", "friendliness_pct"],
  ["dr", "drink_quality_pct"],
  ["ef", "efficiency_pct"],
  ["td", "total_drinks"],
  ["s30", "drinks_within_30s_pct"],
  ["s2", "drinks_within_2min_pct"],
  ["s2w", "drinks_within_2min_weekend_pct"],
  ["s3", "drinks_within_3min_pct"],
  ["s4", "drinks_within_4min_pct"],
  ["o5", "drinks_over_5min_pct"],
  ["at", "avg_wait_seconds"],
  ["at9", "avg_wait_8to9am_seconds"],
  ["at12", "avg_wait_8am_to_12pm_seconds"],
  ["np", "pctile_nps"],
  ["fp", "pctile_friendliness"],
  ["dp", "pctile_drink_quality"],
  ["ep", "pctile_efficiency"],
  ["ap", "pctile_within_2min"],
  ["atp", "pctile_wait_time"],
  ["ats", "cei_component_coffee_efficiency"],
  ["a_at", "cei_component_wait_time"],
  ["nr", "source_sheet_rank"],
];

// RAG tone per metric, from the app's one shared model (GAILS.metricRagTone —
// the same colours as the league table, KPI cards and Focus review). Added
// only when the app's code loaded.
const RAG_COLUMNS = [
  ["n", "nps_rag"],
  ["ov", "overall_satisfaction_rag"],
  ["fr", "friendliness_rag"],
  ["dr", "drink_quality_rag"],
  ["ef", "efficiency_rag"],
  ["s2", "within_2min_rag"],
  ["o5", "over_5min_rag"],
  ["at", "avg_wait_rag"],
];

function dashboardColumns(G) {
  if (!G) return DASHBOARD_COLUMNS;
  return DASHBOARD_COLUMNS.concat(RAG_COLUMNS.map(([key, name]) => [(r) => (r.noData ? null : G.metricRagTone(key, r[key]) || null), name]));
}

function log(msg) {
  const line = new Date().toISOString() + "  " + msg;
  console.log(line);
  try {
    fs.mkdirSync(OUT_DIR, {recursive: true});
    const file = path.join(OUT_DIR, "export.log");
    const prior = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
    fs.writeFileSync(file, prior.concat(line).slice(-30).join("\n") + "\n");
  } catch (e) { /* logging must never fail the export */ }
}

function download() {
  const tmp = path.join(os.tmpdir(), "cexindex-rtdb-" + process.pid + ".json");
  const res = spawnSync("firebase", ["database:get", "/", "--project", PROJECT, "-o", tmp], {
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (res.status !== 0 || !fs.existsSync(tmp)) {
    throw new Error("firebase database:get failed (" + res.status + "): " + (res.stderr || res.stdout || res.error || "").toString().trim());
  }
  try {
    return JSON.parse(fs.readFileSync(tmp, "utf8"));
  } finally {
    fs.rmSync(tmp, {force: true});
  }
}

function values(obj) {
  return obj && typeof obj === "object" ? Object.entries(obj).map(([id, v]) => ({id, ...v})) : [];
}

// Mirrors followUpIsArchived in js/visit-report.js: a done task is archived
// when someone archived it by hand, or 30 days after sign-off (or after it was
// last unarchived). Auto-archiving is never written to the database, so the
// export has to derive it the same way the dashboard does.
const FOLLOW_UP_ARCHIVE_DAYS = 30;

function followUpIsArchived(task, nowMs) {
  if ((task.status || "open") !== "done") return false;
  if (task.archivedAt) return true;
  const since = [task.completedAt, task.unarchivedAt].filter(Boolean).sort().pop();
  const sinceMs = since ? new Date(since).getTime() : NaN;
  return !isNaN(sinceMs) && nowMs - sinceMs >= FOLLOW_UP_ARCHIVE_DAYS * 86400000;
}

function followUpActions(db) {
  const nowMs = Date.now();
  return values(db.followUpActions).map((t) => ({...t, archived: followUpIsArchived(t, nowMs)}));
}

function stripPdfUrls(visit) {
  const copy = {...visit};
  delete copy.pdfUrl;
  return copy;
}

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(records, columns = DASHBOARD_COLUMNS) {
  const rows = [columns.map(([, name]) => name).join(",")];
  records.forEach((r) => rows.push(columns.map(([key]) => csvCell(typeof key === "function" ? key(r) : r[key])).join(",")));
  return rows.join("\n") + "\n";
}

const SUPPORT_COLUMNS = [
  ["rank", "rank"],
  ["bakery", "bakery"],
  ["region", "region"],
  ["opsArea", "ops_area"],
  ["priorityLevel", "priority_level"],
  ["supportScore", "support_score"],
  [(r) => r.scoreParts.headroom, "headroom_pts"],
  [(r) => r.scoreParts.momentum, "momentum_pts"],
  [(r) => r.scoreParts.duration, "duration_pts"],
  [(r) => r.scoreParts.visitCoverage, "visit_coverage_pts"],
  ["ceiScore", "cei_score"],
  ["ceiBand", "cei_band"],
  [(r) => r.trend.direction, "trend"],
  [(r) => r.trend.changeVsPreviousMonth, "change_vs_previous_month"],
  [(r) => r.trend.changeVsThreeMonthsAgo, "change_vs_three_months_ago"],
  ["monthsInFocusOfLastSix", "months_in_focus_of_last_six"],
  ["focusStreakMonths", "focus_streak_months"],
  ["lastVisit", "last_visit"],
  ["visitStatus", "visit_status"],
  [(r) => r.biggestLever && r.biggestLever.metric, "biggest_lever"],
  [(r) => r.biggestLever && r.biggestLever.value, "biggest_lever_value"],
  [(r) => r.biggestLever && r.biggestLever.target, "biggest_lever_target"],
  ["nearlyThere", "nearly_there"],
  ["lowResponseVolume", "low_response_volume"],
  ["dataStatus", "data_status"],
];

// Everything derived through the app's own code or from BigQuery is optional:
// a failure there (a dashboard module changed shape, the gcloud login lapsed)
// must not cost Cowork the raw data, so it is logged and the export carries on.
// A section that fails leaves its files from the previous run in place.
function optional(label, fn, fallback = {}) {
  try {
    return fn();
  } catch (e) {
    log("WARN  " + label + ": " + e.message);
    return fallback;
  }
}

const AREA_COLUMNS = [
  ["month", "month"],
  ["scope", "scope"],
  ["name", "name"],
  ["bakeries", "bakeries"],
  ["bakeriesWithData", "bakeries_with_data"],
  ["benchmarkScore", "benchmark_score"],
  ["benchmarkBand", "benchmark_band"],
  ["benchmarkScoreChange", "benchmark_score_change"],
  ["coffeeEfficiency", "coffee_efficiency_pct"],
  ["coffeeEfficiencyChange", "coffee_efficiency_change"],
  ["nps", "nps"],
  ["npsChange", "nps_change"],
  ["drinkQuality", "drink_quality_pct"],
  ["drinkQualityChange", "drink_quality_change"],
  ["efficiency", "efficiency_pct"],
  ["efficiencyChange", "efficiency_change"],
  ["friendliness", "friendliness_pct"],
  ["friendlinessChange", "friendliness_change"],
  ["over5min", "over_5min_pct"],
  ["over5minChange", "over_5min_change"],
  ["avgWaitSeconds", "avg_wait_seconds"],
  ["comparedWith", "change_compared_with"],
];

function areaFiles(G) {
  if (!G) return {};
  return optional("area summary not built", () => ({"area-monthly.csv": toCsv(kpiRows(G), AREA_COLUMNS)}));
}

function supportFiles(db, G) {
  if (!G) return {};
  return optional("support list not built", () => {
    const support = buildSupportList(db, G);
    return {
      "support-list.csv": toCsv(support.supportList, SUPPORT_COLUMNS),
      "support-list.json": support,
      ...optional("support list history not updated", () => ({
        "support-list-history.csv": updateHistory(db, support, path.join(OUT_DIR, "support-list-history.csv")),
      })),
    };
  });
}

// The comment survey renamed these sites in April 2026: each old name stops
// within weeks of the new one starting (checked against first/last comment
// dates, 2026-09-26). The app's resolver doesn't know the new spellings, so
// they are mapped here onto the bakery directory's names.
const COMMENT_LOCATION_ALIASES = {
  "Kensington High Street": "High Street Kensington",
  "Southbank Place": "Southbank",
  "Seven Dials": "Seven Dials Brighton",
  "Dulwich Village": "Dulwich",
  "The Strand": "Strand",
  "Spitafields": "Spitalfields",
  "Wandsworth Town": "Wandsworth",
  "Camden Town": "Camden",
  "Abbeville Road": "Abbeville",
  "Cheapside - One New Change": "Cheapside",
  "Bath - Union Street": "Union Street, Bath",
};

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(isoDate) {
  const [y, m] = String(isoDate || "").split("-");
  return y && m ? MONTH_SHORT[Number(m) - 1] + " " + y.slice(-2) : "";
}

const COMMENT_COLUMNS = [
  ["date", "date"],
  [(c) => monthLabel(c.date), "month"],
  ["bakery", "bakery"],
  ["sentiment_label", "sentiment"],
  ["sentiment_score", "sentiment_score"],
  ["top_sub_category", "main_theme"],
  ["top_term", "key_phrase"],
  ["feedback_comments", "comment"],
];

const THEME_COLUMNS = [
  ["bakery", "bakery"],
  ["month", "month"],
  ["sub_category", "theme"],
  ["sentiment", "sentiment"],
  ["customers", "customers_mentioning"],
  ["mentions", "mentions"],
  ["sentiment_score", "sentiment_score"],
  ["commenting_surveys", "customers_commenting"],
  ["all_surveys", "surveys_total"],
];

function commentFiles(commentData, G) {
  if (!commentData) return {};
  return optional("comments not built", () => {
    const name = (loc) => {
      const aliased = COMMENT_LOCATION_ALIASES[loc] || loc;
      return G ? canonicalBakery(G, aliased) : aliased;
    };
    commentData.comments.forEach((c) => { c.bakery = name(c.bakery_location); });
    commentData.themes.forEach((t) => { t.bakery = name(t.bakery_location); });
    return {
      "customer-comments.csv": toCsv(commentData.comments, COMMENT_COLUMNS),
      "comment-themes-monthly.csv": toCsv(commentData.themes, THEME_COLUMNS),
    };
  });
}

// The Log Visit form's Maintenance To Flag groups, read from the app's own
// js/maintenance-flags.js. Loaded on its own rather than through loadApp, so
// the flags still export on a morning the rest of the app logic fails.
function loadMaintenanceFlags() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const file = path.resolve(__dirname, "..", "..", "js", "maintenance-flags.js");
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, {filename: "maintenance-flags.js"});
  return sandbox.GAILS.MaintenanceFlags;
}

const MAINTENANCE_COLUMNS = [
  ["date", "date"],
  [(r) => monthLabel(r.date), "month"],
  ["time", "time"],
  ["bakery", "bakery"],
  ["visitKind", "visit_kind"],
  ["item", "item"],
  ["group", "kit_group"],
  ["loggedBy", "logged_by"],
  ["visitId", "visit_id"],
];

// One row per item flagged on a check-in or NBO opening, oldest visit first.
function maintenanceRows(visits) {
  const M = loadMaintenanceFlags();
  const rows = [];
  visits.forEach((v) => {
    (Array.isArray(v.maintenanceFlags) ? v.maintenanceFlags : []).forEach((flag) => {
      const match = M.classify(flag);
      rows.push({
        date: v.date || "",
        time: v.time || "",
        bakery: (v.app && v.app.bakery) || v.bakery || "",
        visitKind: v.visitKind || "checkin",
        item: match.name,
        group: match.group,
        loggedBy: v.coffeePartner || "",
        visitId: v.id,
      });
    });
  });
  return rows;
}

function maintenanceFiles(visits) {
  return optional("maintenance flags not built", () => ({
    "maintenance-flags.csv": toCsv(maintenanceRows(visits), MAINTENANCE_COLUMNS),
  }));
}

function build(db, G, commentData) {
  const visits = values(db.routineVisits)
      .map(stripPdfUrls)
      .map((v) => (G ? optional("visit view for " + v.id, () => ({...v, app: visitView(G, v)}), v) : v))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const notes = [];
  Object.values(db.bakeryNotes || {}).forEach((byId) => notes.push(...values(byId)));
  const site = (db.portalData && db.portalData.siteMeta) || {};
  const dash = db.dashboardData || {};
  const tasks = followUpActions(db);

  const derived = {
    ...supportFiles(db, G), ...areaFiles(G), ...commentFiles(commentData, G), ...maintenanceFiles(visits),
  };

  return {
    ...derived,
    "dashboard-monthly.csv": toCsv(dash.records || [], optional("RAG columns skipped", () => dashboardColumns(G), DASHBOARD_COLUMNS)),
    "routine-visits.json": visits,
    "follow-up-actions.json": tasks,
    "bakery-notes.json": notes,
    "bakery-directory.json": {
      bakeries: Object.entries(site.entries || {}).map(([bakery, e]) => ({
        bakery,
        opsArea: e.o || "",
        region: e.r || "",
        latLng: e.ll || null,
      })),
      opsAreaAssignments: site.opsAreaAssignments || [],
      regionAssignments: site.regionAssignments || [],
      source: site.sourceName || "",
      updatedAt: site.updatedAt || "",
    },
    "head-baristas.json": (db.portalData && db.portalData.headBaristas) || {},
    "team.json": values(db.teamDirectory).map((p) => ({
      name: p.name,
      email: p.email,
      roleId: p.roleId,
      department: p.department,
      opsArea: p.opsArea,
      managerUid: p.managerUid,
      uid: p.id,
    })),
    "snapshot-info.json": {
      exportedAt: new Date().toISOString(),
      project: PROJECT,
      dashboardSource: dash.sourceName || "",
      dashboardSourceUpdated: dash.sourceLastUpdated || "",
      months: dash.months || [],
      counts: {
        dashboardRecords: (dash.records || []).length,
        routineVisits: visits.length,
        followUpActions: tasks.length,
        followUpActionsArchived: tasks.filter((t) => t.archived).length,
        bakeryNotes: notes.length,
        bakeries: Object.keys(site.entries || {}).length,
        maintenanceFlags: derived["maintenance-flags.csv"]
          ? visits.reduce((n, v) => n + (Array.isArray(v.maintenanceFlags) ? v.maintenanceFlags.length : 0), 0)
          : null,
        customerComments: commentData && derived["customer-comments.csv"] ? commentData.comments.length : null,
      },
      builtWithAppLogic: !!G,
      sectionsSkipped: [
        !derived["support-list.json"] && "support list",
        !derived["customer-comments.csv"] && "customer comments",
        !derived["area-monthly.csv"] && "area summary",
        !derived["maintenance-flags.csv"] && "maintenance flags",
      ].filter(Boolean),
    },
  };
}

// Writes beside the target then renames over it, so a reader never sees a
// half-written file. The rename retries briefly in case something (a sync
// client, an open editor) has the old file locked.
function replaceFile(target, body) {
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, body);
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, target);
      return;
    } catch (e) {
      if (attempt >= 5 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        fs.rmSync(tmp, {force: true});
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000 * attempt);
    }
  }
}

async function main() {
  const db = download();
  const G = optional("dashboard code not loaded, derived files skipped", () => loadApp(db), null);
  let commentData = null;
  try {
    commentData = await fetchComments();
  } catch (e) {
    log("WARN  comments not fetched: " + e.message);
  }
  const files = build(db, G, commentData);

  fs.mkdirSync(OUT_DIR, {recursive: true});
  for (const [name, content] of Object.entries(files)) {
    replaceFile(path.join(OUT_DIR, name), typeof content === "string" ? content : JSON.stringify(content, null, 1));
  }
  replaceFile(path.join(OUT_DIR, "README.md"), fs.readFileSync(path.join(__dirname, "DATA-README.md")));

  const c = files["snapshot-info.json"].counts;
  log("OK  " + c.dashboardRecords + " dashboard rows, " + c.routineVisits + " visits, " +
      c.followUpActions + " actions, " + (c.customerComments ?? "no") + " comments -> " + OUT_DIR);
}

main().catch((e) => {
  log("FAILED  " + e.message);
  process.exit(1);
});

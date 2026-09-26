// ========== DASHBOARD LOGIC FOR THE COWORK SNAPSHOT ==========
// Runs the dashboard's own code (not a copy of it) over a database export, so
// what Cowork reads is what the app shows: the Support List (same focus
// bakeries, support score and priority levels), CQV bands with the
// zero-tolerance override, and canonical bakery names.
//
// The browser modules are loaded into a sandbox in the order index.html loads
// them, with a document stub that has no elements, then fed the data the way
// js/auth.js and js/app.js feed it on sign-in. Anything the app changes about
// these rules is picked up here automatically.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS_DIR = path.resolve(__dirname, "..", "..", "js");
const MODULES = [
  "state.js", "config.js", "utils.js", "cei.js", "periods.js", "filters.js", "focus-data.js",
  "support-score.js", "targets.js", "cqv-criticals.js", "cqv-shared.js", "nbo-shared.js",
];

// A do-nothing stand-in for any DOM object: every property is another stub and
// calling it returns a stub, so page-chrome code at module load (measuring the
// banner, wiring listeners) runs harmlessly. Lookups for elements return null,
// which every module already handles because the elements are page-specific.
function inertStub() {
  const target = function () {};
  const handler = {
    get: (t, prop) => (prop === Symbol.toPrimitive ? () => 0 : prop === "length" ? 0 : stub),
    apply: () => stub,
    construct: () => stub,
    set: () => true,
  };
  const stub = new Proxy(target, handler);
  return stub;
}

// A Date whose "now" is fixed, so the app can be asked what it would have
// shown on an earlier day. Only argument-less construction and Date.now()
// change; every other use behaves like the real Date.
function frozenDate(now) {
  const t = now.getTime();
  return class FrozenDate extends Date {
    constructor(...args) {
      if (args.length) super(...args); else super(t);
    }
    static now() {
      return t;
    }
  };
}

function createApp(now) {
  const noop = () => {};
  const element = () => null;
  const stub = inertStub();
  const documentStub = new Proxy({
    getElementById: element,
    querySelector: element,
    querySelectorAll: () => [],
    getElementsByClassName: () => [],
    readyState: "complete",
  }, {get: (t, prop) => (prop in t ? t[prop] : stub)});
  const sandbox = {
    console: {log: noop, info: noop, debug: noop, warn: noop, error: console.error},
    document: documentStub,
    localStorage: {getItem: () => null, setItem: noop, removeItem: noop},
    sessionStorage: {getItem: () => null, setItem: noop, removeItem: noop},
    navigator: {userAgent: "node"},
    location: {search: "", hash: "", pathname: "/"},
    setTimeout, clearTimeout, requestAnimationFrame: (fn) => setTimeout(fn, 0),
    addEventListener: noop, removeEventListener: noop, dispatchEvent: noop,
    CustomEvent: function CustomEvent() {},
    matchMedia: () => ({matches: false, addEventListener: noop, removeEventListener: noop}),
  };
  if (now) sandbox.Date = frozenDate(now);
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const file of MODULES) {
    vm.runInContext(fs.readFileSync(path.join(JS_DIR, file), "utf8"), sandbox, {filename: file});
  }
  return sandbox.GAILS;
}

// Mirrors computeLastVisitRecords in js/auth.js.
function lastVisitRecords(G, visitsObj) {
  const last = {};
  Object.keys(visitsObj || {}).forEach((id) => {
    const v = visitsObj[id];
    if (!v || !v.bakery || !v.date) return;
    const key = G.resolveBakeryMetaKey(v.bakery);
    if (!last[key] || v.date > last[key].date) last[key] = Object.assign({id}, v);
  });
  return last;
}

function round1(n) {
  return typeof n === "number" && !isNaN(n) ? Math.round(n * 10) / 10 : null;
}

// The dashboard, signed in and loaded with this export's data. With `now`, it
// is the dashboard as it would have run on that day: its clock is set there
// and it only knows visits logged up to then.
function loadApp(db, now) {
  const G = createApp(now);
  if (now) {
    const cutoff = now.toISOString().slice(0, 10);
    const visits = {};
    Object.entries(db.routineVisits || {}).forEach(([id, v]) => {
      if (v && v.date && v.date <= cutoff) visits[id] = v;
    });
    db = Object.assign({}, db, {routineVisits: visits});
  }

  // js/auth.js applySiteMeta
  const site = (db.portalData && db.portalData.siteMeta) || null;
  if (site) {
    G.setRegionAssignments(site.regionAssignments);
    G.setOpsAreaAssignments(site.opsAreaAssignments);
    G.setBakeryMeta(site.entries && typeof site.entries === "object" ? site.entries : site);
  }

  // js/app.js initDashboard: canonical names, legacy NPS migration, fresh bands.
  const records = JSON.parse(JSON.stringify((db.dashboardData && db.dashboardData.records) || []));
  records.forEach((r) => {
    if (r && r.b) r.b = G.resolveBakeryMetaKey(r.b) || r.b;
    if (!r || typeof r.na === "number") return;
    r.na = typeof r.n === "number" ? r.n : null;
    r.va = typeof r.v === "number" ? r.v : null;
    if (typeof r.nd === "number") r.n = r.nd;
    if (typeof r.vf === "number" && typeof r.v === "number") r.v = Math.max(0, r.v - r.vf);
  });
  records.forEach(G.ensureBands);
  Object.assign(G.state, {
    ALL: records,
    MONTHS: (db.dashboardData && db.dashboardData.months) || [],
    regionFilter: [], opsFilter: [], searchBakery: [], bandFilter: "", headBaristaFilter: null,
  });

  // js/auth.js applyLastVisitDates
  G.setLastVisitRecords(lastVisitRecords(G, db.routineVisits || {}));
  G._allVisitsObj = db.routineVisits || {};
  return G;
}

// Canonical bakery name, as the app resolves it (aliases, old street names).
function canonicalBakery(G, name) {
  return G.resolveBakeryMetaKey(name) || String(name || "").trim();
}

// The derived facts the app shows for a visit but doesn't store on it:
// CQV bands via js/cqv-shared.js (the zero-tolerance override re-applied
// live, as the visit report does), which questions are zero-tolerance, and
// the NBO yes-percentage from js/nbo-shared.js.
function visitView(G, visit) {
  const out = {bakery: canonicalBakery(G, visit.bakery)};
  if (visit.type === "cqv") {
    const C = G.CQVShared;
    out.displayBand = C.band(visit) || null;
    out.zeroToleranceFail = C.hasCriticalFail(visit);
    out.storedBandOverridden = !!visit.band && out.displayBand !== visit.band;
    out.zeroToleranceQuestionsLost = (visit.questions || [])
        .filter((q) => G.CQVCriticals.isCriticalQuestion(q.label) &&
          (q.score != null && q.max != null ? q.score < q.max : /^(no|inadequate)$/i.test(q.response || "")))
        .map((q) => q.label);
    out.actionPlanFlags = (visit.actionPlan || []).map((a) => C.criticalTag(a.questionLabel));
  } else if (visit.type === "nbo") {
    out.nboYesPct = G.NBOShared.overallPct(visit);
  }
  return out;
}

// The Overview KPI row, month by month, for the whole company, each region and
// each ops area — the figures you read off the Overview with that filter set.
// Current values come from G.getData() averaged the way js/app.js does for
// the KPI row (plain mean of the rows with data, via G.avg). The "vs last
// month" figure mirrors getPriorAvgs in js/app.js, which is private to that
// file: the prior month's filtered records from G.getPriorPeriodRecords,
// averaged over every record (a missing value counts as 0), as the app does.
const KPI_FIELDS = [
  ["ac", "benchmarkScore"], ["ts", "coffeeEfficiency"], ["n", "nps"],
  ["dr", "drinkQuality"], ["ef", "efficiency"], ["fr", "friendliness"], ["o5", "over5min"],
];

function kpiRows(G) {
  const state = G.state;
  const saved = {selectedMonths: state.selectedMonths, regionFilter: state.regionFilter, opsFilter: state.opsFilter};
  const bakeries = [...new Set(state.ALL.map((r) => r.b))];
  const scopes = [{scope: "company", name: "Company", set: {}}]
      .concat([...new Set(bakeries.map(G.getBakeryRegion))].filter((r) => r && r !== "Unknown").sort()
          .map((r) => ({scope: "region", name: r, set: {regionFilter: [r]}})))
      .concat([...new Set(bakeries.map(G.getBakeryOps))].filter((o) => o && o !== "Unknown").sort()
          .map((o) => ({scope: "ops area", name: o, set: {opsFilter: [o]}})));

  const out = [];
  try {
    (state.MONTHS || []).forEach((month) => {
      scopes.forEach((s) => {
        Object.assign(state, {selectedMonths: [month], regionFilter: [], opsFilter: []}, s.set);
        G.invalidateCompanyPeriodData();
        const data = G.getData();
        const scored = data.filter((r) => r && !r.noData);
        if (!scored.length) return;
        const prior = G.getPriorPeriodRecords();
        const row = {month, scope: s.scope, name: s.name, bakeries: data.length, bakeriesWithData: scored.length};
        KPI_FIELDS.forEach(([key, name]) => {
          row[name] = round1(G.avg(scored, key));
          row[name + "Change"] = prior && prior.records.length
            ? round1(G.avg(scored, key) - prior.records.reduce((a, r) => a + (r[key] || 0), 0) / prior.records.length)
            : null;
        });
        const waits = scored.filter((r) => typeof r.at === "number" && !isNaN(r.at));
        row.avgWaitSeconds = waits.length ? round1(waits.reduce((a, r) => a + r.at, 0) / waits.length) : null;
        row.benchmarkBand = row.benchmarkScore >= 90 ? "Exceeding" : row.benchmarkScore >= 75 ? "Meeting"
          : row.benchmarkScore >= 60 ? "Approaching" : "Below Standard";
        row.comparedWith = prior ? prior.label : null;
        out.push(row);
      });
    });
  } finally {
    Object.assign(state, saved);
    G.invalidateCompanyPeriodData();
  }
  return JSON.parse(JSON.stringify(out));
}

function buildSupportList(db, G = loadApp(db)) {
  const rows = G.getSupportPriorityRows();
  const context = G.buildFocusDataset({isAbsolute: true});
  const tierLabel = {critical: "High Priority", high: "Medium Priority", watch: "Monitor"};

  const list = rows.map((r) => ({
    rank: r.rank,
    bakery: r.name,
    region: G.getBakeryRegion(r.name),
    opsArea: r.ops,
    priorityLevel: tierLabel[r.tier] || r.tier,
    supportScore: r.priority,
    scoreParts: {headroom: r.severity, momentum: r.momentum, duration: r.persistence, visitCoverage: r.coverage},
    ceiScore: round1(r.score),
    ceiBand: r.rec.acb,
    trend: {
      direction: r.trend.direction,
      latestMonth: r.trend.latest ? r.trend.latest.m : null,
      changeVsPreviousMonth: r.trend.prev ? round1(r.trend.ceiChange) : null,
      changeVsThreeMonthsAgo: r.trend.threePrev ? round1(r.trend.cei3mChange) : null,
    },
    monthsInFocusOfLastSix: r.focusMonths,
    focusStreakMonths: r.focusStreak,
    lastVisit: r.lastVisit,
    monthsSinceVisit: round1(r.monthsSinceVisit),
    visitStatus: r.monthsSinceVisit === null ? "No visit recorded"
      : r.monthsSinceVisit >= 12 ? "Visit overdue" : r.monthsSinceVisit >= 6 ? "Visit due" : "Visited recently",
    biggestLever: r.weakest ? {
      metric: r.weakest.label,
      value: r.weakest.value,
      target: r.weakest.bench,
      rag: r.weakest.rag,
    } : null,
    nearlyThere: !!r.quickWin,
    lowResponseVolume: !!r.lowVol,
    dataStatus: r.dataStatus,
  }));

  // Round-trip through JSON so callers get plain data rather than objects and
  // arrays belonging to the sandbox's realm.
  return JSON.parse(JSON.stringify({
    referenceMonth: context.latestClosedMonth,
    scoredOverMonths: context.recentMonths,
    config: {
      supportScore: G.SUPPORT_SCORE_CONFIG,
      focusData: G.FOCUS_DATA_CONFIG,
      benchmarks: G.BENCHMARKS,
    },
    counts: {
      bakeriesInData: context.bakeryCount,
      eligible: context.eligibleCount,
      onSupportList: list.length,
      highPriority: list.filter((r) => r.priorityLevel === "High Priority").length,
      mediumPriority: list.filter((r) => r.priorityLevel === "Medium Priority").length,
      monitor: list.filter((r) => r.priorityLevel === "Monitor").length,
    },
    supportList: list,
    allEligibleBakeries: context.allSnapshots.map((s) => ({
      bakery: s.b,
      region: G.getBakeryRegion(s.b),
      opsArea: G.getBakeryOps(s.b),
      ceiScore: round1(s.ac),
      ceiBand: s.acb,
      peerScore: round1(s.c),
      peerBand: s.cb,
      dataStatus: s.focusDataStatus,
      monthsUsed: s.focusSourceMonths,
    })).sort((a, b) => (a.ceiScore ?? 999) - (b.ceiScore ?? 999)),
    needsDataReview: context.dataReview,
    notYetEligible: context.onboarding,
  }));
}

module.exports = {loadApp, buildSupportList, visitView, canonicalBakery, kpiRows};

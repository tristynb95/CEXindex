const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const indexHtml = read('index.html');
const appSource = read('js', 'app.js');
const cssSource = read('css', 'styles.css');
const targetsSource = read('js', 'targets.js');
const visitReportSource = read('js', 'visit-report.js');
const glanceSource = read('js', 'at-a-glance.js');
const authSource = read('js', 'auth.js');

// ========== HARNESS ==========
// The panel talks to the page through a handful of GAILS helpers and a few
// elements by id, so it can be driven against stubs of both.
//
// The fixture is built so a different bakery is lowest on each metric, so the
// riser and the faller are not the same site as either, and so Soho and Balham
// tie at the top of friendliness — which is what the tie-break is for.
const ROWS = [
  { b: 'Soho', ac: 88, acb: 'Meeting', n: 70, dr: 92, ef: 91, fr: 95 },
  { b: 'Balham', ac: 71, acb: 'Approaching', n: 50, dr: 78, ef: 88, fr: 95 },
  { b: 'Barnes', ac: 55, acb: 'Below Standard', n: 30, dr: 85, ef: 70, fr: 88 },
  { b: 'Windsor', ac: 62, acb: 'Approaching', n: 45, dr: 74, ef: 84, fr: 82 }
];

const LAST_VISITS = {
  Soho: '2026-09-04',
  Balham: '2026-06-02',
  Windsor: '2026-08-20'
};

const VISIT_COUNTS = { Soho: 2, Windsor: 1 };

function element() {
  const el = {
    innerHTML: '',
    textContent: '',
    offsetWidth: 0,
    classes: new Set(),
    active: true,
    classList: {
      add: (name) => el.classes.add(name),
      remove: (name) => el.classes.delete(name),
      contains: (name) => (name === 'active' ? el.active : el.classes.has(name))
    },
    addEventListener: () => {},
    contains: () => false
  };
  return el;
}

function mount(overrides) {
  const els = {
    atAGlance: element(),
    atAGlanceBody: element(),
    atAGlanceDots: element(),
    'tab-overview': element()
  };
  const ticks = [];
  const context = {
    window: {
      setInterval: (fn) => { ticks.push(fn); return ticks.length; },
      clearInterval: () => {},
      matchMedia: () => ({ matches: false })
    },
    document: { hidden: false, getElementById: (id) => els[id] || null }
  };
  context.window.GAILS = Object.assign({
    state: { selectedMonths: ['Aug 26'] },
    escapeHtml: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    bakeryProfileLink: (name) => '<a>' + name + '</a>',
    metricRagTone: () => 'red',
    getLastVisitDate: (name) => LAST_VISITS[name] || null,
    getVisitCountInPeriod: (name) => VISIT_COUNTS[name] || 0,
    getPriorPeriodRecords: () => ({
      records: [
        { b: 'Soho', m: 'Jul 26', ac: 80 },
        { b: 'Balham', m: 'Jul 26', ac: 60 },
        { b: 'Barnes', m: 'Jul 26', ac: 70 },
        { b: 'Windsor', m: 'Jul 26', ac: 61 }
      ],
      months: ['Jul 26'],
      label: 'Jul 26'
    }),
    getSupportPriorityRows: () => ([
      { name: 'Barnes', ops: 'Ana Ruiz', tier: 'critical', priority: 82 },
      { name: 'Windsor', ops: 'Joe Fen', tier: 'watch', priority: 40 }
    ]),
    SUPPORT_TIER_LABELS: { critical: 'High', high: 'Medium', watch: 'Monitor' }
  }, overrides || {});
  vm.runInNewContext(glanceSource, context);
  return {
    GAILS: context.window.GAILS,
    els,
    tick: () => ticks.forEach((fn) => fn()),
    html: () => els.atAGlanceBody.innerHTML,
    // The current slide is named by the active tab: it is the only place the
    // name is rendered, so there is nothing else to read it from.
    scope: () => {
      const active = els.atAGlanceDots.innerHTML
        .match(/class="ataglance-dot is-active"[\s\S]*?__label">([^<]*)</);
      return active ? active[1] : '';
    }
  };
}

// Renders and then steps the rotation on to the named slide.
function slide(label, overrides) {
  const app = mount(overrides);
  app.GAILS.renderAtAGlance(ROWS);
  for (let i = 0; i < 4 && app.scope() !== label; i++) app.tick();
  assert.equal(app.scope(), label, 'expected to reach the ' + label + ' slide');
  return app;
}

// ========== ROTATION ==========

test('rotates through performance, leaders, opportunities and visits', () => {
  const app = mount();
  app.GAILS.renderAtAGlance(ROWS);
  assert.equal(app.scope(), 'Performance');
  app.tick();
  assert.equal(app.scope(), 'Leaders');
  app.tick();
  assert.equal(app.scope(), 'Opportunities');
  app.tick();
  assert.equal(app.scope(), 'Visits');
  app.tick();
  assert.equal(app.scope(), 'Performance', 'the rotation wraps');
});

test('holds still while the Overview is not the panel on screen', () => {
  const app = mount();
  app.GAILS.renderAtAGlance(ROWS);
  app.els['tab-overview'].active = false;
  app.tick();
  assert.equal(app.scope(), 'Performance');
});

test('keeps the reader on their slide across a filter change', () => {
  const app = mount();
  app.GAILS.renderAtAGlance(ROWS);
  app.tick();
  assert.equal(app.scope(), 'Leaders');
  app.GAILS.renderAtAGlance(ROWS.slice(0, 3));
  assert.equal(app.scope(), 'Leaders');
});

// ========== PERFORMANCE ==========

test('the performance slide carries the top scorer, both movers and the support pick', () => {
  const html = slide('Performance').html();
  assert.match(html, /Top bakery[\s\S]*?<a>Soho<\/a>[\s\S]*?88/);
  assert.match(html, /Biggest riser[\s\S]*?<a>Balham<\/a>[\s\S]*?vs Jul 26[\s\S]*?\+11\.0/);
  assert.match(html, /Biggest faller[\s\S]*?<a>Barnes<\/a>[\s\S]*?vs Jul 26[\s\S]*?−15\.0/);
  assert.match(html, /Needs most support[\s\S]*?<a>Barnes<\/a>[\s\S]*?High priority[\s\S]*?82/);
});

test('the support pick names the bakery and its tier, and nothing else', () => {
  // The ops area was dropped from this row: it crowded out the bakery name.
  assert.doesNotMatch(slide('Performance').html(), /Needs most support[\s\S]*?Ana Ruiz/);
});

// ========== LEADERS & OPPORTUNITIES ==========

test('leaders and levers show the same four metrics from opposite ends', () => {
  const leaders = slide('Leaders').html();
  assert.match(leaders, /Highest NPS[\s\S]*?<a>Soho<\/a>[\s\S]*?>70</);
  assert.match(leaders, /Best drink quality[\s\S]*?<a>Soho<\/a>[\s\S]*?92%/);
  assert.match(leaders, /Best efficiency[\s\S]*?<a>Soho<\/a>[\s\S]*?91%/);

  const levers = slide('Opportunities').html();
  assert.match(levers, /Lowest NPS[\s\S]*?<a>Barnes<\/a>[\s\S]*?>30</);
  assert.match(levers, /Lowest drink quality[\s\S]*?<a>Windsor<\/a>[\s\S]*?74%/);
  assert.match(levers, /Lowest efficiency[\s\S]*?<a>Barnes<\/a>[\s\S]*?70%/);
  assert.match(levers, /Lowest friendliness[\s\S]*?<a>Windsor<\/a>[\s\S]*?82%/);
});

test('a tie hands the row to a bakery not already named on the slide', () => {
  // Soho and Balham are both on 95 friendliness, and Soho has already taken the
  // three rows above it. The row is equally true of either, so it goes to
  // Balham rather than printing one name four times.
  assert.match(slide('Leaders').html(), /Best friendliness[\s\S]*?<a>Balham<\/a>[\s\S]*?95%/);
});

test('a strictly better figure is never passed over to spread the names', () => {
  // Barnes is lowest on both NPS and efficiency by a clear margin, so it leads
  // both rows — the repetition is the finding, not a bug to design away.
  const levers = slide('Opportunities').html();
  assert.equal((levers.match(/<a>Barnes<\/a>/g) || []).length, 2);
});

test('tone comes from the shared RAG model at both ends, not from the slide', () => {
  // A leader still short of target must not be dressed up as a win.
  const app = mount({ metricRagTone: (metric, value) => (value >= 90 ? 'green' : 'amber') });
  app.GAILS.renderAtAGlance(ROWS);
  app.tick();
  assert.equal(app.scope(), 'Leaders');
  // Soho's NPS of 70 is the estate's best and still reads amber.
  assert.match(app.html(), /Highest NPS[\s\S]*?ataglance-row__stat--amber/);
});

// ========== VISITS ==========

test('the last visit opens that visit report rather than only naming the bakery', () => {
  const html = slide('Visits').html();
  assert.match(html, /Last visit[\s\S]*?<a>Soho<\/a>/);
  assert.match(html, /data-visit-report="Soho"/);
  // visit-report.js owns that attribute, and resolves it to the bakery's own
  // most recent visit.
  assert.match(visitReportSource, /closest\('\[data-visit-report\]'\)/);
  assert.match(visitReportSource, /window\.GAILS\.openVisitReport = function/);
});

test('the visit slide separates the longest gap from the sites never visited at all', () => {
  const html = slide('Visits').html();
  // Balham is the oldest last visit; Barnes has none, so it belongs to the
  // "no visit yet" row and must not be ranked as merely overdue.
  const gapRow = html.match(/Longest since a visit[\s\S]*?<\/li>/)[0];
  assert.match(gapRow, /<a>Balham<\/a>/);
  assert.doesNotMatch(gapRow, /Barnes/);
  assert.match(html, /No visit yet[\s\S]*?<a>Barnes<\/a>[\s\S]*?1 of 4/);
});

test('most visited counts visits in the selected period, and says so', () => {
  // "2" alone reads as a placing on a row labelled "Most visited".
  assert.match(slide('Visits').html(), /Most visited[\s\S]*?<a>Soho<\/a>[\s\S]*?>2 visits</);
  const single = slide('Visits', { getVisitCountInPeriod: (name) => (name === 'Soho' ? 1 : 0) });
  assert.match(single.html(), /Most visited[\s\S]*?>1 visit</);
});

// ========== FOOTER ==========

test('the footer reports coverage and scope on every slide', () => {
  for (const label of ['Performance', 'Leaders', 'Opportunities', 'Visits']) {
    const html = slide(label).html();
    // Two of four bakeries visited, three visits between them.
    assert.match(html, /50%[\s\S]*?visited this period/);
    assert.match(html, /0\.8[\s\S]*?visits per bakery/);
    assert.match(html, /4 bakeries · 1 meeting or better · 1 below standard/);
  }
});

test('says plainly when an insight has nothing to report rather than inventing one', () => {
  assert.match(slide('Performance', { getPriorPeriodRecords: () => null }).html(),
    /No earlier period to compare with/);
  assert.match(slide('Performance', { getSupportPriorityRows: () => [] }).html(),
    /No bakery in this selection is on the focus list/);
  assert.match(slide('Visits', { getLastVisitDate: () => null }).html(),
    /No routine visit logged here yet/);
  assert.match(slide('Visits', { getLastVisitDate: (name) => LAST_VISITS[name] || '2026-01-01' }).html(),
    /Every bakery in scope has been visited/);
  assert.match(slide('Visits', { getVisitCountInPeriod: () => 0 }).html(),
    /No visits logged in this period/);
});

test('an empty selection replaces the panel rather than rendering blank rows', () => {
  const app = mount();
  app.GAILS.renderAtAGlance([]);
  assert.match(app.html(), /No bakeries match the current filters/);
  assert.equal(app.els.atAGlanceDots.innerHTML, '');
});

// ========== LATE VISIT DATA ==========

// The panel is rendered from the CEX period rows, which arrive first; the
// routine-visit index comes from a separate Firebase subscription, so the visit
// figures are computed against an empty index on the first paint.

test('the visit figures redraw when the routine-visit feed lands after the render', () => {
  let counts = {};
  const app = mount({ getVisitCountInPeriod: (name) => counts[name] || 0 });
  app.GAILS.renderAtAGlance(ROWS);
  assert.match(app.html(), /<strong>0%<\/strong>/, 'the strip opens on zeros');

  counts = VISIT_COUNTS;
  app.GAILS.refreshAtAGlanceVisits();
  assert.match(app.html(), /<strong>50%<\/strong>/);
  assert.match(app.html(), /<strong>0\.8<\/strong>/);
});

test('the late redraw holds the reader on their slide and does not replay the fade', () => {
  const app = mount();
  app.GAILS.renderAtAGlance(ROWS);
  app.tick();
  assert.equal(app.scope(), 'Leaders');

  app.els.atAGlanceBody.classList.remove('is-entering');
  app.GAILS.refreshAtAGlanceVisits();
  assert.equal(app.scope(), 'Leaders', 'a redraw nobody asked for must not move the slide');
  assert.equal(app.els.atAGlanceBody.classes.has('is-entering'), false,
    'the entry fade announces a new slide, not a refreshed one');
});

test('the late redraw is a no-op before the panel has anything to draw', () => {
  const app = mount();
  app.GAILS.refreshAtAGlanceVisits();
  assert.equal(app.html(), '');
});

// ========== WIRING ==========

test('the panel is mounted on the Overview and loaded before the app', () => {
  assert.match(indexHtml, /<section class="section overview-card at-a-glance" id="atAGlance"/);
  assert.match(indexHtml, /id="atAGlanceBody"/);
  assert.match(indexHtml, /id="atAGlanceDots"/);
  const glanceTag = indexHtml.indexOf('js/at-a-glance.js');
  const appTag = indexHtml.indexOf('js/app.js"');
  const targetsTag = indexHtml.indexOf('js/targets.js');
  assert.ok(glanceTag > -1 && appTag > -1);
  // getSupportPriorityRows lives in targets.js, and app.js calls the render.
  assert.ok(targetsTag < glanceTag, 'at-a-glance.js must load after targets.js');
  assert.ok(glanceTag < appTag, 'at-a-glance.js must load before app.js');
});

test('both refresh paths render the panel, so it is never left showing a stale selection', () => {
  const calls = appSource.match(/G\.renderAtAGlance\(data\)/g) || [];
  assert.equal(calls.length, 2, 'expected the no-data and scored refresh paths to both render it');
});

test('the routine-visit feed redraws the panel when it lands', () => {
  // Without this the two visit figures sit on the empty index they were first
  // drawn against until the rotation happens to tick.
  assert.match(authSource, /refreshAtAGlanceVisits\(\);/);
  assert.match(glanceSource, /G\.refreshAtAGlanceVisits = function/);
});

test('the support pick reuses the Focus queue rather than ranking bakeries a second way', () => {
  assert.match(targetsSource, /window\.GAILS\.getSupportPriorityRows = function/);
  assert.match(targetsSource, /window\.GAILS\.SUPPORT_TIER_LABELS = _TIER_LABEL/);
  // The hub and the panel must go through the same row builder (the third
  // occurrence of the name is its own declaration).
  const builderCalls = targetsSource.match(/(?<!function )_supportRows\(targets, focusContext/g) || [];
  assert.equal(builderCalls.length, 2);
  assert.doesNotMatch(glanceSource, /computeSupportPriority/,
    'the panel must not score support itself');
});

test('the panel takes three of the twelve Overview columns and the KPI grid the other nine', () => {
  assert.match(cssSource, /#tab-overview>\.at-a-glance \{\s*grid-column: span 3;/);
  assert.match(cssSource, /#tab-overview>\.kpi-row \{\s*grid-column: span 9;/);
});

test('the rotation and its fade both stand down under reduced motion', () => {
  assert.match(glanceSource, /prefers-reduced-motion: reduce/);
  assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\) \{\s*\.at-a-glance__body\.is-entering \{\s*animation: none;/);
});

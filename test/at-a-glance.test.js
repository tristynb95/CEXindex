const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const indexHtml = read('index.html');
const appSource = read('js', 'app.js');
// index.html loads css/styles.css and css/dashboard.css together; dashboard-only
// rules live in the latter, so the dashboard stylesheet is the pair of them.
const cssSource = read('css', 'styles.css') + read('css', 'dashboard.css');
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

// Ops areas are named after the ops manager who runs them; regions are not.
const OPS = { Soho: 'Kate Downes', Balham: 'Kate Downes', Barnes: 'Chris Kral', Windsor: 'Chris Kral' };
const REGIONS = {
  Soho: 'London Region', Balham: 'London Region',
  Barnes: 'South Region', Windsor: 'South Region'
};
const GROUP_BANDS = {
  'Kate Downes': 'Meeting', 'Chris Kral': 'Below Standard',
  'London Region': 'Meeting', 'South Region': 'Below Standard'
};

// The rows the View toggle hands the card: one aggregate per group, shaped the
// way buildGroupAggregate shapes them (js/filters.js).
function grouped(map, type) {
  const byKey = {};
  ROWS.forEach((record) => {
    (byKey[map[record.b]] = byKey[map[record.b]] || []).push(record);
  });
  return Object.keys(byKey).map((key) => {
    const members = byKey[key];
    const avg = (field) =>
      Math.round((members.reduce((total, r) => total + r[field], 0) / members.length) * 10) / 10;
    return {
      b: key, isGroup: true, groupType: type, memberCount: members.length,
      ac: avg('ac'), acb: GROUP_BANDS[key],
      n: avg('n'), dr: avg('dr'), ef: avg('ef'), fr: avg('fr')
    };
  });
}

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
    getBakeryOps: (name) => OPS[name],
    getBakeryRegion: (name) => REGIONS[name],
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
    // Whether the panel asked for a rotation at all.
    rotating: () => ticks.length > 0,
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

// Renders the card the way the View toggle does — bakery rows, plus the
// grouped rows the page is actually showing — and steps to the named slide.
function groupSlide(label, viewData, overrides) {
  const app = mount(overrides);
  app.GAILS.renderAtAGlance(ROWS, viewData);
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
  assert.match(html, /Biggest rise[\s\S]*?<a>Balham<\/a>[\s\S]*?vs Jul 26[\s\S]*?\+11\.0/);
  assert.match(html, /Biggest dip[\s\S]*?<a>Barnes<\/a>[\s\S]*?vs Jul 26[\s\S]*?−15\.0/);
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
  assert.match(leaders, /Highest drink quality[\s\S]*?<a>Soho<\/a>[\s\S]*?92%/);
  assert.match(leaders, /Highest efficiency[\s\S]*?<a>Soho<\/a>[\s\S]*?91%/);

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
  assert.match(slide('Leaders').html(), /Highest friendliness[\s\S]*?<a>Balham<\/a>[\s\S]*?95%/);
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
    // Every band is accounted for, so the counts reconcile to the total.
    assert.match(html, /4 bakeries · 1 meeting or better · 2 approaching · 1 below standard/);
  }
});

test('the scope line drops a band that holds nothing rather than printing a nought', () => {
  const app = mount();
  app.GAILS.renderAtAGlance([
    { b: 'Soho', ac: 88, acb: 'Meeting', n: 70, dr: 92, ef: 91, fr: 95 },
    { b: 'Barnes', ac: 55, acb: 'Below Standard', n: 30, dr: 85, ef: 70, fr: 88 }
  ]);
  assert.match(app.html(), /2 bakeries · 1 meeting or better · 1 below standard/);
  assert.doesNotMatch(app.html(), /approaching/);
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

// ========== OPS AREAS ==========

test('the area view ranks areas, and names them as areas rather than bakeries', () => {
  const app = groupSlide('Performance', grouped(OPS, 'ops'));
  const html = app.html();
  assert.match(html, /Top area[\s\S]*?Kate Downes[\s\S]*?>80</);
  assert.doesNotMatch(html, /Top bakery/);
  // An area has no bakery profile to open, so it must not be dressed as a link.
  assert.doesNotMatch(html, /<a>Kate Downes<\/a>/);
  assert.match(html, /2 ops areas · 1 meeting or better · 1 below standard/);
});

test('an area moves on the mean of its own bakeries, then and now', () => {
  // Kate Downes holds Soho (88, was 80) and Balham (71, was 60): 79.5 against
  // 70. Chris Kral holds Barnes (55, was 70) and Windsor (62, was 61): 58.5
  // against 65.5.
  const html = groupSlide('Performance', grouped(OPS, 'ops')).html();
  assert.match(html, /Biggest rise[\s\S]*?Kate Downes[\s\S]*?>\+9\.5</);
  assert.match(html, /Biggest dip[\s\S]*?Chris Kral[\s\S]*?>−7\.0</);
});

test('the two rows a group cannot inherit ask the group question instead', () => {
  // One label for one question in every view; what changes underneath is the
  // measure. A bakery answers it with its own support score, a patch with how
  // many of its sites are on the list at all — Barnes and Windsor are both
  // Chris Kral's, so their patch is carrying it.
  const html = groupSlide('Performance', grouped(OPS, 'ops')).html();
  assert.match(html, /Needs most support[\s\S]*?Chris Kral[\s\S]*?>2 sites</);
  assert.doesNotMatch(html, /<a>Barnes<\/a>/, 'the area view must not answer with a bakery');
  // A name, a second name and a figure is one thing more than the row fits, so
  // which of its sites is the highest priority rides in the title instead.
  assert.match(html, /title="Chris Kral — 2 sites on the focus list, Barnes the highest at 82\/100"/);
});

test('the area view swaps the visit slide for coverage of each patch', () => {
  const app = groupSlide('Coverage', grouped(OPS, 'ops'), {
    getVisitCountInPeriod: (name) => ({ Soho: 2, Balham: 1 })[name] || 0
  });
  const html = app.html();
  assert.match(html, /Highest coverage[\s\S]*?Kate Downes[\s\S]*?>100%</);
  assert.match(html, /Lowest coverage[\s\S]*?Chris Kral[\s\S]*?>0%</);
  // Barnes has never been visited at all, and that is Chris Kral's.
  assert.match(html, /No visit yet[\s\S]*?Chris Kral[\s\S]*?>1 site</);
  // The site to chase is still a site; whose patch it is on rides in the title.
  assert.match(html, /Longest since a visit[\s\S]*?<a>Balham<\/a>/);
  assert.match(html, /title="Balham \(Kate Downes\) — last visited/);
});

test('coverage ties are spread across the rows rather than naming one patch thrice', () => {
  // Nothing has been visited and nothing ever has been, so every area ties on
  // every row. Four rows naming four areas tell a reader more than four naming
  // one — the same rule the Leaders slide plays by.
  const app = groupSlide('Coverage', grouped(OPS, 'ops'), {
    getVisitCountInPeriod: () => 0,
    getLastVisitDate: () => null
  });
  const names = [...app.html().matchAll(/ataglance-row__name">([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(names, ['Kate Downes', 'Chris Kral'], 'the tied rows must not repeat a name');
});

test('an empty end of the coverage pair says so rather than colouring a nought', () => {
  const none = groupSlide('Coverage', grouped(OPS, 'ops'), { getVisitCountInPeriod: () => 0 });
  assert.match(none.html(), /Highest coverage[\s\S]*?No visits logged in this period/);
  const all = groupSlide('Coverage', grouped(OPS, 'ops'), { getVisitCountInPeriod: () => 1 });
  assert.match(all.html(), /Lowest coverage[\s\S]*?Every bakery in scope was visited this period/);
});

test('a single ops area gets its own standing, with its worst site named', () => {
  const app = mount();
  app.GAILS.renderAtAGlance(ROWS, [grouped(OPS, 'ops')[1]]);
  assert.equal(app.scope(), 'Chris Kral');
  const html = app.html();
  assert.match(html, /Benchmark score[\s\S]*?Below Standard[\s\S]*?>59</);
  assert.match(html, /Support[\s\S]*?<a>Barnes<\/a>[\s\S]*?High[\s\S]*?>2 sites</);
  assert.match(html, /Visited[\s\S]*?1 of 2[\s\S]*?>50%</);
});

// ========== REGIONS ==========

test('the region view names a bakery in every region rather than ranking regions', () => {
  // Four regions of sixty-odd bakeries each all average out to the same place,
  // so the rows are the regions and what they name is a site to act on.
  const leaders = groupSlide('Leaders', grouped(REGIONS, 'region')).html();
  assert.doesNotMatch(leaders, /Top region|Highest NPS/);
  assert.match(leaders, /London Region[\s\S]*?<a>Soho<\/a>[\s\S]*?>88</);
  assert.match(leaders, /South Region[\s\S]*?<a>Windsor<\/a>[\s\S]*?>62</);

  const opportunities = groupSlide('Opportunities', grouped(REGIONS, 'region')).html();
  assert.match(opportunities, /London Region[\s\S]*?<a>Balham<\/a>[\s\S]*?>71</);
  assert.match(opportunities, /South Region[\s\S]*?<a>Barnes<\/a>[\s\S]*?>55</);
});

test('the region support slide names who each region is carrying, or says nobody', () => {
  const html = groupSlide('Support', grouped(REGIONS, 'region')).html();
  assert.match(html, /South Region[\s\S]*?<a>Barnes<\/a>[\s\S]*?High[\s\S]*?>82</);
  assert.match(html, /London Region[\s\S]*?No bakery here is on the focus list/);
});

test('the region coverage slide counts the bakeries inside each region', () => {
  const html = groupSlide('Coverage', grouped(REGIONS, 'region')).html();
  assert.match(html, /London Region[\s\S]*?1 of 2 visited[\s\S]*?>50%</);
  assert.match(html, /South Region[\s\S]*?1 of 2 visited[\s\S]*?>50%</);
});

// ========== A SINGLE BAKERY ==========

const SOHO = ROWS[0];
const BALHAM = ROWS[1];
const WINDSOR = ROWS[3];

test('a single bakery gets its own standing, not four rankings of one site', () => {
  const app = mount();
  app.GAILS.renderAtAGlance([SOHO]);
  assert.equal(app.scope(), 'Soho', 'the tab names the bakery rather than a theme');

  const html = app.html();
  assert.doesNotMatch(html, /Highest|Lowest|Top bakery|Biggest/,
    'nothing on the card may rank a bakery against itself');
  assert.match(html, /Benchmark score[\s\S]*?Meeting[\s\S]*?>88</);
  assert.match(html, /Movement[\s\S]*?Up on Jul 26[\s\S]*?>\+8\.0</);
  assert.match(html, /Support[\s\S]*?Not on the focus list/);
  assert.match(html, /Last visit[\s\S]*?data-visit-report="Soho"/);
});

test('a single bakery is a single slide, so the card does not rotate', () => {
  const app = mount();
  app.GAILS.renderAtAGlance([SOHO]);
  assert.equal(app.rotating(), false);
});

test('two bakeries keep the ranking slides, because ranking two is comparing them', () => {
  const app = mount();
  app.GAILS.renderAtAGlance([SOHO, BALHAM]);
  assert.equal(app.scope(), 'Performance');
  assert.equal(app.rotating(), true);
  assert.match(app.html(), /Top bakery[\s\S]*?<a>Soho<\/a>/);

  // Which of the pair leads each measure is the comparison someone selecting
  // two bakeries is after, and it is the estate slides that answer it.
  app.tick();
  assert.equal(app.scope(), 'Leaders');
  assert.match(app.html(), /Highest NPS[\s\S]*?<a>Soho<\/a>/);
  assert.match(app.html(), /Highest friendliness[\s\S]*?<a>Balham<\/a>/);
});

test('filtering down to one bakery cannot strand the card on a slide that is gone', () => {
  const app = mount();
  app.GAILS.renderAtAGlance(ROWS);
  app.tick();
  app.tick();
  app.tick();
  assert.equal(app.scope(), 'Visits');

  app.GAILS.renderAtAGlance([SOHO]);
  assert.equal(app.scope(), 'Soho');
});

test('the bakery slide reads its own support tier, not the top of the queue', () => {
  // Windsor sits below Barnes in the queue; on its own slide the queue's
  // ranking is beside the point.
  const app = mount();
  app.GAILS.renderAtAGlance([WINDSOR]);
  assert.match(app.html(), /Support[\s\S]*?Monitor priority[\s\S]*?>40</);
});

test('the bakery slide says plainly when a row has nothing to report', () => {
  const app = mount({ getPriorPeriodRecords: () => null, getLastVisitDate: () => null });
  app.GAILS.renderAtAGlance([SOHO]);
  assert.match(app.html(), /Movement[\s\S]*?No earlier period to compare with/);
  assert.match(app.html(), /Last visit[\s\S]*?No routine visit logged here yet/);

  const unscored = mount();
  unscored.GAILS.renderAtAGlance([{ b: 'Kew', acb: 'No Data', noData: true }]);
  assert.match(unscored.html(), /Benchmark score[\s\S]*?Not scored this period/);
});

test('a bakery that has held its score reads as level, not as a rise or a fall', () => {
  const app = mount({
    getPriorPeriodRecords: () => ({
      records: [{ b: 'Soho', m: 'Jul 26', ac: 88 }],
      months: ['Jul 26'],
      label: 'Jul 26'
    })
  });
  app.GAILS.renderAtAGlance([SOHO]);
  assert.match(app.html(), /Movement[\s\S]*?Level with Jul 26/);
  assert.match(app.html(), /ataglance-row__stat--muted">0\.0</);
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
  // Both the bakery rows and the rows the View toggle is showing: the card
  // ranks whichever the page is about, and still reaches for the bakeries
  // underneath a group for anything only a bakery has.
  const calls = appSource.match(/G\.renderAtAGlance\(data, viewData\)/g) || [];
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

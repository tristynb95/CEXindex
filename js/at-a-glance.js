// ========== AT A GLANCE ==========
// The Overview's reading of whatever the filters currently select. It rotates
// through four slides — how the estate is performing, which sites are worth
// learning from, where its biggest levers are, and how well it is being visited
// — so one small card can carry more than four facts without burying any of
// them.
//
// Leaders and Opportunities are deliberately a pair. Four rows of laggards on
// their own read as a naughty list; the same four metrics shown from both ends,
// one slide apart, say the same thing without it.
//
// All four slides rank the selection, so all four need something to rank. Filter
// down to a single subject and the card swaps them for that subject's own
// standing instead — see A SINGLE SUBJECT.
//
// The View toggle changes what the card is about, because a finding that is
// worth the space at one level is noise at another:
//
//   Bakeries     the four themes over the sites themselves. A bakery is the
//                unit someone acts on, and the only unit a visit or a support
//                score exists for at all.
//   Ops Areas    the same four themes with the patch as the subject — twenty-odd
//                areas of five to twelve sites is a field worth ranking. Only
//                the two rows reporting something a group does not have are
//                rebuilt: how much of a patch is on the focus list, and how much
//                of it is being walked (see OPS AREAS).
//   Regions      four regions of sixty-odd bakeries average out to the same
//                place, so ranking them says nothing. The rows become the
//                regions and what they name is a bakery inside each one (see
//                REGIONS).
//
// Whatever the toggle says, anything that only a bakery has stays bakery-level
// and reaches through the group to its members.
//
// Everything here is derived from figures other panels already own — nothing on
// this card is computed a second way:
//
//   scores / movers      from the same period rows the KPI row and league
//                        table read, against GAILS.getPriorPeriodRecords
//   metric tone          from GAILS.metricRagTone, the shared RAG model
//   support pick         from GAILS.getSupportPriorityRows (js/targets.js),
//                        the same queue the Support List is ranked by
//   visit figures        from the routine-visit index in js/config.js
//
// The support score is deliberately scored over its own window of closed
// months (see js/focus-data.js), so that row answers to the region/ops/search
// filters but not to the month filter.
window.GAILS = window.GAILS || {};

(function () {
  var G = window.GAILS;

  var ROTATE_MS = 9000;

  // Band tones reuse the KPI row's vocabulary so a bakery reading "Exceeding"
  // here carries the same colour it does two cards over.
  var BAND_TONE = {
    'Exceeding': 'blue',
    'Meeting': 'green',
    'Approaching': 'amber',
    'Below Standard': 'red'
  };

  var TIER_TONE = { critical: 'red', high: 'amber', watch: 'gold' };
  var RAG_TONE = { green: 'green', amber: 'amber', red: 'red' };

  // The four metrics the KPI row leads with, in its order. Leaders and
  // Opportunities are the two ends of the same four measures, so a slide of
  // sites to learn from always sits opposite the slide of sites with ground to
  // make up.
  var METRICS = [
    { key: 'n', high: 'Highest NPS', low: 'Lowest NPS', format: function (v) { return String(Math.round(v)); } },
    { key: 'dr', high: 'Highest drink quality', low: 'Lowest drink quality', format: percent },
    { key: 'ef', high: 'Highest efficiency', low: 'Lowest efficiency', format: percent },
    { key: 'fr', high: 'Highest friendliness', low: 'Lowest friendliness', format: percent }
  ];

  // The four themes, ranking whatever the View toggle has made the unit of the
  // page. Bakeries and ops areas share them: both are fields worth ranking, and
  // only the two rows that report something a group does not have — a support
  // score, a visit — are rebuilt for areas.
  function estateSlides() {
    var grouped = grouping() !== 'bakeries';
    return [
      { id: 'performance', label: 'Performance', build: performanceRows },
      { id: 'leaders', label: 'Leaders', build: leaderRows },
      { id: 'levers', label: 'Opportunities', build: leverRows },
      { id: 'visits', label: grouped ? 'Coverage' : 'Visits', build: grouped ? coverageRows : visitRows }
    ];
  }

  // Regions are too few and too big to rank against each other, so they get
  // their own four slides, each one asking every region the same question about
  // the bakeries inside it (see REGIONS).
  function regionSlides() {
    return [
      { id: 'region-leaders', label: 'Leaders', build: regionLeaderRows },
      { id: 'region-levers', label: 'Opportunities', build: regionLeverRows },
      { id: 'region-support', label: 'Support', build: regionSupportRows },
      { id: 'region-coverage', label: 'Coverage', build: regionCoverageRows }
    ];
  }

  // Which set of slides the current selection has earned: one subject's own
  // standing when there is nothing left to rank it against (see A SINGLE
  // SUBJECT), the region slides, or the four estate themes.
  function slides() {
    var data = subjects();
    if (data.length === 1) return [subjectSlide(data[0])];
    if (grouping() === 'region') return regionSlides();
    return estateSlides();
  }

  var index = 0;
  var timer = null;
  var paused = false;
  var currentData = null;
  var currentView = null;
  var listenersBound = false;

  function isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }

  function esc(value) {
    return G.escapeHtml(value == null ? '' : String(value));
  }

  function round1(value) {
    return Math.round(value * 10) / 10;
  }

  function percent(value) {
    return Math.round(value) + '%';
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function scored(record) {
    return record && !record.noData && !record.incompletePeriod;
  }

  // ========== SUBJECTS ==========
  // The card always holds two sets of rows: the bakeries in the selection, and
  // whatever the View toggle has made the unit of the page — the same bakeries,
  // or the ops areas / regions they roll up into.
  //
  // Bakeries stay the unit of anything only a bakery has. A visit is logged
  // against a site and a support score is scored for one, so those rows read
  // the bakery set and reach for the group's members when they need to; every
  // ranking reads the subject set, so "top" means top area when the page is
  // about areas.
  function rows() {
    return currentData || [];
  }

  function subjects() {
    return currentView && currentView.length ? currentView : rows();
  }

  // 'bakeries' | 'ops' | 'region' — what the rows on screen are counting.
  function grouping() {
    var first = subjects()[0];
    return first && first.isGroup ? first.groupType : 'bakeries';
  }

  // The same fallback buildRankedGroups uses (js/filters.js), so a bakery with
  // no area on record lands in the same bucket here as it does there.
  function memberKey(bakery) {
    var mode = grouping();
    if (mode === 'ops') return (G.getBakeryOps ? G.getBakeryOps(bakery) : null) || 'Unknown';
    if (mode === 'region') return (G.getBakeryRegion ? G.getBakeryRegion(bakery) : null) || 'Unknown';
    return bakery;
  }

  function membersOf(subject) {
    if (grouping() === 'bakeries') return [subject];
    return rows().filter(function (record) { return memberKey(record.b) === subject.b; });
  }

  // A bakery name opens its profile; an ops area or a region has no profile to
  // open, so it is named in plain text rather than dressed as a dead link.
  function subjectName(record) {
    return record.isGroup ? subject(record.b) : bakeryLink(record.b);
  }

  var SUBJECT_WORDS = {
    bakeries: { top: 'Top bakery', unit: 'bakery', units: 'bakeries', none: 'No scored bakeries in this selection' },
    ops: { top: 'Top area', unit: 'ops area', units: 'ops areas', none: 'No scored ops areas in this selection' },
    region: { top: 'Top region', unit: 'region', units: 'regions', none: 'No scored regions in this selection' }
  };

  function words() {
    return SUBJECT_WORDS[grouping()] || SUBJECT_WORDS.bakeries;
  }

  // "4 Sep" for the current year, "4 Sep 25" once it is old enough for the year
  // to matter — the row is narrow and the year is noise most of the time.
  function formatVisitDate(iso) {
    var date = new Date(String(iso || '') + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    var options = { day: 'numeric', month: 'short' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = '2-digit';
    return date.toLocaleDateString('en-GB', options);
  }

  function relativeVisitLabel(iso) {
    var date = new Date(String(iso || '') + 'T00:00:00');
    if (isNaN(date.getTime())) return '';
    var days = Math.round((new Date().setHours(0, 0, 0, 0) - date.getTime()) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return days + ' days ago';
    if (days < 31) {
      var weeks = Math.floor(days / 7);
      return weeks + ' week' + (weeks === 1 ? '' : 's') + ' ago';
    }
    if (days < 365) {
      var months = Math.floor(days / 30);
      return months + ' month' + (months === 1 ? '' : 's') + ' ago';
    }
    return 'over a year ago';
  }

  function bakeryLink(name) {
    return G.bakeryProfileLink(name, {
      className: 'ataglance-row__name',
      returnUrl: 'index.html#overview',
      returnLabel: 'Overview'
    });
  }

  // A long name is ellipsised rather than allowed to push the figure off the
  // row, so the untruncated text is carried in a title for hover and assistive
  // reading. config.plain is that text.
  function row(config) {
    var hasStat = config.stat || config.stat === 0;
    var stat = hasStat
      ? '<span class="ataglance-row__stat ataglance-row__stat--' + config.tone + '">' + config.stat + '</span>'
      : '';
    var title = config.plain ? ' title="' + esc(config.plain) + '"' : '';
    return '<li class="ataglance-row">' +
      '<span class="ataglance-row__label"><i class="ataglance-row__dot ataglance-row__dot--' +
      config.tone + '" aria-hidden="true"></i>' + esc(config.label) + '</span>' +
      '<span class="ataglance-row__line">' +
      '<span class="ataglance-row__value"' + title + '>' + config.value + '</span>' + stat +
      '</span>' +
      '</li>';
  }

  function emptyRow(label, message) {
    return '<li class="ataglance-row ataglance-row--empty">' +
      '<span class="ataglance-row__label"><i class="ataglance-row__dot ataglance-row__dot--muted" aria-hidden="true"></i>' +
      esc(label) + '</span>' +
      '<span class="ataglance-row__line"><span class="ataglance-row__value">' + esc(message) + '</span></span>' +
      '</li>';
  }

  // A short qualifier after the name. It gives up its width before the name
  // does (see .ataglance-row__meta), so only rows that genuinely need one
  // should carry it — three things rarely fit this row at once.
  function meta(text) {
    return '<span class="ataglance-row__meta">' + esc(text) + '</span>';
  }

  // ========== PERFORMANCE ==========

  function topPerformerRow() {
    var best = null;
    subjects().forEach(function (record) {
      if (!scored(record) || !isNumber(record.ac)) return;
      if (!best || record.ac > best.ac) best = record;
    });
    if (!best) return emptyRow(words().top, words().none);
    return row({
      label: words().top,
      tone: BAND_TONE[best.acb] || 'muted',
      value: subjectName(best),
      plain: best.b,
      stat: Math.round(best.ac)
    });
  }

  // Movement is measured the way the KPI deltas are: this period's score
  // against the mean of the same bakery over the period immediately before it.
  // The estate rows and the single-bakery rows both read this one map, so a
  // bakery's movement is the same figure whichever way the card is showing it.
  // Prior rows are always bakery-level, so they are folded onto whatever the
  // page is counting before the comparison — an area's movement is the mean of
  // its bakeries then and now, which is how its score is built in the first
  // place (buildGroupAggregate, js/filters.js).
  function priorAverages() {
    var prior = G.getPriorPeriodRecords ? G.getPriorPeriodRecords() : null;
    if (!prior) return null;
    var totals = {};
    prior.records.forEach(function (record) {
      if (!isNumber(record.ac) || record.noData || record.incompletePeriod) return;
      var key = memberKey(record.b);
      if (!totals[key]) totals[key] = { sum: 0, count: 0 };
      totals[key].sum += record.ac;
      totals[key].count++;
    });
    var averages = {};
    Object.keys(totals).forEach(function (bakery) {
      averages[bakery] = totals[bakery].sum / totals[bakery].count;
    });
    return { label: prior.label, averages: averages };
  }

  // The change on one bakery, or null where there is nothing to compare it
  // with. Both movers share one pass, so the rise and the dip are always drawn
  // from the same comparison.
  function changeOn(record, prior) {
    if (!prior || !scored(record) || !isNumber(record.ac)) return null;
    var mean = prior.averages[record.b];
    return mean === undefined ? null : record.ac - mean;
  }

  function movers() {
    var prior = priorAverages();
    if (!prior) return null;
    var up = null;
    var down = null;
    subjects().forEach(function (record) {
      var change = changeOn(record, prior);
      if (change === null) return;
      if (!up || change > up.change) up = { record: record, change: change };
      if (!down || change < down.change) down = { record: record, change: change };
    });
    return { label: prior.label, up: up, down: down };
  }

  function moverRow(config) {
    var found = config.movers;
    if (!found) return emptyRow(config.label, 'No earlier period to compare with');
    var pick = config.rising ? found.up : found.down;
    var moved = pick && (config.rising ? pick.change > 0 : pick.change < 0);
    if (!moved) {
      return emptyRow(config.label, 'No ' + words().unit +
        (config.rising ? ' gained ground on ' : ' dipped on ') + found.label);
    }
    var change = round1(Math.abs(pick.change)).toFixed(1);
    return row({
      label: config.label,
      tone: config.rising ? 'green' : 'red',
      value: subjectName(pick.record) + meta('vs ' + found.label),
      plain: pick.record.b + ' — ' + (config.rising ? 'up ' : 'down ') + change + ' vs ' + found.label,
      stat: (config.rising ? '+' : '−') + change
    });
  }

  function supportRow() {
    var queue = G.getSupportPriorityRows ? G.getSupportPriorityRows() : [];
    if (!queue.length) {
      return emptyRow('Needs most support', 'No bakery in this selection is on the focus list');
    }
    var top = queue[0];
    var labels = G.SUPPORT_TIER_LABELS || {};
    var tier = labels[top.tier] || '';
    return row({
      label: 'Needs most support',
      tone: TIER_TONE[top.tier] || 'muted',
      value: bakeryLink(top.name) + (tier ? meta(tier + ' priority') : ''),
      plain: top.name + ' — ' + tier + ' priority, support score ' + top.priority + '/100',
      stat: top.priority
    });
  }

  function performanceRows() {
    var found = movers();
    return topPerformerRow() +
      moverRow({ label: 'Biggest rise', rising: true, movers: found }) +
      moverRow({ label: 'Biggest dip', rising: false, movers: found }) +
      (grouping() === 'bakeries' ? supportRow() : groupSupportRow());
  }

  // ========== LEADERS & OPPORTUNITIES ==========

  // The bakery at one end of one metric. The extreme is always the true one:
  // the four measures are correlated, so a site can legitimately lead several
  // rows, and a strictly better figure is never passed over to avoid printing a
  // name twice. Ranking bakeries across metrics instead (by gap to target, say)
  // only moves the problem to the label column, since it hands every row to
  // whichever measure the estate is furthest behind on.
  //
  // Ties are the exception, and they are common at the top, where SHINE scores
  // bunch against 100. Between two bakeries on the same figure the row is
  // equally true of either, so "named" steers it to one not already on this
  // slide — four rows naming four sites tell a reader more than four naming one.
  //
  // Tone is the shared RAG model at both ends, so a leader that is still short
  // of target reads amber rather than being dressed up as a win.
  function extremeRow(metric, highest, named) {
    var label = highest ? metric.high : metric.low;
    var pick = null;
    subjects().forEach(function (record) {
      if (!scored(record) || !isNumber(record[metric.key])) return;
      if (!pick) { pick = record; return; }
      var value = record[metric.key];
      var current = pick[metric.key];
      if (highest ? value > current : value < current) { pick = record; return; }
      if (value === current && named[pick.b] && !named[record.b]) pick = record;
    });
    if (!pick) return emptyRow(label, words().none);
    named[pick.b] = true;
    var value = pick[metric.key];
    var tone = G.metricRagTone ? RAG_TONE[G.metricRagTone(metric.key, value)] : null;
    return row({
      label: label,
      tone: tone || 'muted',
      value: subjectName(pick),
      plain: pick.b + ' — ' + label.toLowerCase() + ' in scope, ' + metric.format(value),
      stat: metric.format(value)
    });
  }

  function metricRows(highest) {
    var named = {};
    return METRICS.map(function (metric) { return extremeRow(metric, highest, named); }).join('');
  }

  function leaderRows() {
    return metricRows(true);
  }

  function leverRows() {
    return metricRows(false);
  }

  // ========== A SINGLE SUBJECT ==========

  // Ranking something against itself says nothing. With one bakery selected
  // every "highest" row and every "lowest" row names it, Leaders and
  // Opportunities print the same four figures as each other, and a site sitting
  // on 78% drink quality is announced as the best in scope. So a selection of
  // one drops the ranking framing and gives the subject a slide of its own
  // standing instead — and that holds just as well for one ops area or one
  // region, which is how a manager looking at their own patch arrives here.
  //
  // Two is where the ranking starts earning its keep again: "highest NPS" on
  // one site and "highest drink quality" on the other is a comparison, which is
  // the thing someone selecting a pair is usually after. So the cut is at one,
  // not at some notion of a small selection.
  //
  // The four metrics are deliberately not repeated here: with a single subject
  // selected, the KPI row alongside this card is already showing exactly those
  // figures for exactly it. What nothing else on the Overview says is where
  // that subject stands on its own — its band, which way it is moving, what it
  // is carrying on the focus list, and how recently anyone walked in.

  // Plain text in the slot the bakery name holds on the estate slides. The
  // bakery is the slide here, so naming it on all four rows would be four
  // repetitions of something the dot already says.
  function subject(text) {
    return '<span class="ataglance-row__name">' + esc(text) + '</span>';
  }

  function bakeryScoreRow(record) {
    if (!scored(record) || !isNumber(record.ac)) {
      return emptyRow('Benchmark score', 'Not scored this period');
    }
    var band = record.acb || '';
    return row({
      label: 'Benchmark score',
      tone: BAND_TONE[band] || 'muted',
      value: subject(band || 'Scored'),
      plain: record.b + ' — ' + (band ? band + ', ' : '') + 'benchmark score ' +
        Math.round(record.ac),
      stat: Math.round(record.ac)
    });
  }

  // Level is its own answer, and a muted one: a bakery that has held its score
  // has not risen and has not fallen, and colouring it either way would say it
  // had.
  function bakeryMovementRow(record, prior) {
    if (!prior) return emptyRow('Movement', 'No earlier period to compare with');
    var change = changeOn(record, prior);
    if (change === null) return emptyRow('Movement', 'Nothing logged here on ' + prior.label);
    var size = round1(Math.abs(change)).toFixed(1);
    var flat = size === '0.0';
    var rising = change > 0;
    var direction = flat ? 'Level with ' : (rising ? 'Up on ' : 'Down on ');
    return row({
      label: 'Movement',
      tone: flat ? 'muted' : (rising ? 'green' : 'red'),
      value: subject(direction + prior.label),
      plain: record.b + ' — ' + direction.toLowerCase() + prior.label +
        (flat ? '' : ' by ' + size),
      stat: flat ? size : (rising ? '+' : '−') + size
    });
  }

  // The queue is already filtered to the selection, so this is a lookup rather
  // than a ranking: the question is whether this bakery is on the focus list,
  // not which bakery is highest up it.
  // On a slide that is already about one group, the group's own name is the
  // pill above it. What this row has to add is which of its bakeries is the
  // highest priority, and how much of the list it is carrying.
  function groupFocusRow(group) {
    var queue = G.getSupportPriorityRows ? G.getSupportPriorityRows() : [];
    var mine = queue.filter(function (item) { return memberKey(item.name) === group.b; });
    if (!mine.length) return emptyRow('Support', 'No bakery here is on the focus list');
    var top = mine[0];
    var labels = G.SUPPORT_TIER_LABELS || {};
    var tier = labels[top.tier] || '';
    return row({
      label: 'Support',
      tone: TIER_TONE[top.tier] || 'muted',
      value: bakeryLink(top.name) + (tier ? meta(tier) : ''),
      plain: group.b + ' — ' + sites(mine.length) + ' on the focus list, ' +
        top.name + ' the highest at ' + top.priority + '/100',
      stat: sites(mine.length)
    });
  }

  function bakerySupportRow(record) {
    if (record.isGroup) return groupFocusRow(record);
    var queue = G.getSupportPriorityRows ? G.getSupportPriorityRows() : [];
    var entry = null;
    queue.forEach(function (item) {
      if (!entry && item.name === record.b) entry = item;
    });
    if (!entry) return emptyRow('Support', 'Not on the focus list');
    var labels = G.SUPPORT_TIER_LABELS || {};
    var tier = labels[entry.tier] || '';
    return row({
      label: 'Support',
      tone: TIER_TONE[entry.tier] || 'muted',
      value: subject(tier ? tier + ' priority' : 'On the focus list'),
      plain: record.b + ' — ' + (tier ? tier + ' priority, ' : '') +
        'support score ' + entry.priority + '/100',
      stat: entry.priority
    });
  }

  // The age is the reading and the date is the way in, so this row spends its
  // name column on how long it has been rather than on the bakery.
  function bakeryVisitRow(record) {
    if (record.isGroup) return groupCoverageRow(record);
    if (!G.getLastVisitDate) return emptyRow('Last visit', 'Visit data unavailable');
    var date = G.getLastVisitDate(record.b);
    if (!date) return emptyRow('Last visit', 'No routine visit logged here yet');
    return '<li class="ataglance-row">' +
      '<span class="ataglance-row__label"><i class="ataglance-row__dot ataglance-row__dot--muted" aria-hidden="true"></i>Last visit</span>' +
      '<span class="ataglance-row__line">' +
      '<span class="ataglance-row__value" title="' +
      esc(record.b + ' — ' + formatVisitDate(date) + ', ' + relativeVisitLabel(date)) + '">' +
      subject(relativeVisitLabel(date)) + '</span>' +
      visitReportButton(record.b, formatVisitDate(date)) +
      '</span></li>';
  }

  // How much of one group was walked this period, in the slot a single bakery
  // spends on its own last visit.
  function groupCoverageRow(group) {
    var members = membersOf(group);
    if (!G.getVisitCountInPeriod || !members.length) {
      return emptyRow('Visited', 'Visit data unavailable');
    }
    var visited = 0;
    members.forEach(function (record) { if (visitedInPeriod(record)) visited++; });
    return row({
      label: 'Visited',
      tone: visited ? 'muted' : 'red',
      value: subject(visited + ' of ' + members.length),
      plain: group.b + ' — ' + visited + ' of ' + members.length +
        ' bakeries visited this period',
      stat: percent((visited / members.length) * 100)
    });
  }

  function subjectSlide(record) {
    return {
      id: 'subject:' + record.b,
      label: record.b,
      build: function () {
        var prior = priorAverages();
        return bakeryScoreRow(record) + bakeryMovementRow(record, prior) +
          bakerySupportRow(record) + bakeryVisitRow(record);
      }
    };
  }

  // ========== OPS AREAS ==========

  // Twenty-odd areas of five to twelve bakeries each is a field worth ranking,
  // so the area view keeps the four themes and swaps the subject: the rows name
  // areas, and "top" means the best-performing patch. Two of the sixteen rows
  // cannot simply change subject, because the thing they report only exists per
  // bakery — a support score is scored for a site and a visit is logged against
  // one. Those two are rebuilt below to ask the group question instead: how much
  // of this patch is on the focus list, and how much of it is being walked.

  // The group at one end of a measure taken over its own members.
  //
  // Ties are the rule rather than the exception here — coverage over five to
  // twelve sites lands on the same handful of fractions, and nought is the most
  // crowded of the lot. So a tie is broken the way the Leaders slide breaks its
  // own: towards a group not already named on this slide, and then towards the
  // larger group, since the same share across more bakeries is the bigger
  // finding. A strictly worse figure still wins the row outright.
  function groupExtremeRow(config) {
    var named = config.named || {};
    var pick = null;
    subjects().forEach(function (record) {
      var value = config.measure(record);
      if (value === null || value === undefined) return;
      if (!pick || (config.highest ? value > pick.value : value < pick.value)) {
        pick = { record: record, value: value };
        return;
      }
      if (value !== pick.value) return;
      if (named[pick.record.b] && !named[record.b]) {
        pick = { record: record, value: value };
        return;
      }
      if (!named[record.b] === !named[pick.record.b] &&
        (record.memberCount || 0) > (pick.record.memberCount || 0)) {
        pick = { record: record, value: value };
      }
    });
    // Claimed only once the row actually names it: a row that comes out as an
    // empty state has not spent a name, and must not stop a later row using it.
    if (!pick || (config.nothing && config.nothing(pick.value))) {
      return emptyRow(config.label, config.empty);
    }
    named[pick.record.b] = true;
    return row({
      label: config.label,
      tone: config.tone,
      value: subjectName(pick.record),
      plain: config.plain(pick.record, pick.value),
      stat: config.stat(pick.value, pick.record)
    });
  }

  function visitedInPeriod(record) {
    var months = (G.state && G.state.selectedMonths) || [];
    return !!(G.getVisitCountInPeriod && G.getVisitCountInPeriod(record.b, months));
  }

  // The share of a group's bakeries that saw anyone this period.
  function visitedShare(group) {
    if (!G.getVisitCountInPeriod) return null;
    var members = membersOf(group);
    if (!members.length) return null;
    var visited = 0;
    members.forEach(function (record) { if (visitedInPeriod(record)) visited++; });
    return visited / members.length;
  }

  function coverageText(group, share) {
    var members = membersOf(group).length;
    return group.b + ' — ' + Math.round(share * members) + ' of ' + members +
      ' bakeries visited this period';
  }

  function sites(count) {
    return count + ' site' + (count === 1 ? '' : 's');
  }

  // Which patch is carrying the most of the focus list. The queue is ranked by
  // support score, so the first entry found in a group is also its highest
  // priority, and a tie on count goes to whichever group holds the higher one.
  function groupSupportRow() {
    var queue = G.getSupportPriorityRows ? G.getSupportPriorityRows() : [];
    if (!queue.length) {
      return emptyRow('Needs most support', 'No bakery in this selection is on the focus list');
    }
    var counts = {};
    var highest = {};
    queue.forEach(function (item) {
      var key = memberKey(item.name);
      counts[key] = (counts[key] || 0) + 1;
      if (!highest[key]) highest[key] = item;
    });
    var pick = null;
    subjects().forEach(function (record) {
      var count = counts[record.b] || 0;
      if (!count) return;
      if (!pick || count > pick.count) { pick = { record: record, count: count }; return; }
      if (count === pick.count && highest[record.b].priority > highest[pick.record.b].priority) {
        pick = { record: record, count: count };
      }
    });
    if (!pick) {
      return emptyRow('Needs most support', 'No bakery in this selection is on the focus list');
    }
    var top = highest[pick.record.b];
    return row({
      label: 'Needs most support',
      tone: TIER_TONE[top.tier] || 'muted',
      value: subjectName(pick.record),
      plain: pick.record.b + ' — ' + sites(pick.count) + ' on the focus list, ' +
        top.name + ' the highest at ' + top.priority + '/100',
      stat: sites(pick.count)
    });
  }

  // Coverage, from both ends, and then the two rows a coverage figure cannot
  // carry: the sites nobody has ever been to, and the single site that has gone
  // longest without anyone.
  function coverageRows() {
    var named = {};
    if (!G.getVisitCountInPeriod) {
      return emptyRow('Highest coverage', 'Visit data unavailable') +
        emptyRow('Lowest coverage', 'Visit data unavailable') +
        emptyRow('No visit yet', 'Visit data unavailable') +
        longestGapRow();
    }
    return groupExtremeRow({
      label: 'Highest coverage',
      named: named,
      highest: true,
      tone: 'green',
      measure: visitedShare,
      nothing: function (share) { return share === 0; },
      empty: 'No visits logged in this period',
      plain: coverageText,
      stat: function (share) { return percent(share * 100); }
    }) + groupExtremeRow({
      label: 'Lowest coverage',
      named: named,
      highest: false,
      tone: 'red',
      measure: visitedShare,
      nothing: function (share) { return share === 1; },
      empty: 'Every bakery in scope was visited this period',
      plain: coverageText,
      stat: function (share) { return percent(share * 100); }
    }) + groupExtremeRow({
      label: 'No visit yet',
      named: named,
      highest: true,
      tone: 'red',
      measure: function (group) {
        if (!G.getLastVisitDate) return null;
        return membersOf(group).filter(function (record) {
          return !G.getLastVisitDate(record.b);
        }).length;
      },
      nothing: function (count) { return count === 0; },
      empty: 'Every bakery in scope has been visited',
      plain: function (group, count) {
        return group.b + ' — ' + sites(count) + ' with no routine visit on record';
      },
      stat: sites
    }) + longestGapRow();
  }

  // ========== REGIONS ==========

  // There are four regions and two of them hold a third of the estate each, so
  // ranking them says almost nothing: every average lands in the same place,
  // and "the North leads on friendliness by half a point" is not a finding
  // anybody can act on. Averaged over sixty-five bakeries, a region is the one
  // unit on this dashboard that cannot be wrong enough to be interesting.
  //
  // So the region view inverts: every row is a region, and what it names is a
  // bakery inside it. Four regions make four rows, which is the card's own
  // rhythm, and each slide asks one question of all of them at once — who is
  // leading it, where its biggest opportunity sits, who it is carrying, and how
  // much of it is being walked.
  function perRegionRows(build) {
    return subjects().map(function (group) {
      return build(group, membersOf(group));
    }).join('');
  }

  function regionExtreme(group, members, highest) {
    var pick = null;
    members.forEach(function (record) {
      if (!scored(record) || !isNumber(record.ac)) return;
      if (!pick || (highest ? record.ac > pick.ac : record.ac < pick.ac)) pick = record;
    });
    if (!pick) return emptyRow(group.b, 'No scored bakeries in this region');
    return row({
      label: group.b,
      tone: BAND_TONE[pick.acb] || 'muted',
      value: bakeryLink(pick.b),
      plain: group.b + ' — ' + pick.b + ', benchmark score ' + Math.round(pick.ac) +
        (pick.acb ? ', ' + pick.acb : ''),
      stat: Math.round(pick.ac)
    });
  }

  function regionLeaderRows() {
    return perRegionRows(function (group, members) {
      return regionExtreme(group, members, true);
    });
  }

  function regionLeverRows() {
    return perRegionRows(function (group, members) {
      return regionExtreme(group, members, false);
    });
  }

  // The queue is already ranked by support score, so the first of a region's
  // bakeries to appear in it is the one that region is carrying.
  function regionSupportRows() {
    var queue = G.getSupportPriorityRows ? G.getSupportPriorityRows() : [];
    var labels = G.SUPPORT_TIER_LABELS || {};
    return perRegionRows(function (group) {
      var top = null;
      queue.forEach(function (item) {
        if (!top && memberKey(item.name) === group.b) top = item;
      });
      if (!top) return emptyRow(group.b, 'No bakery here is on the focus list');
      var tier = labels[top.tier] || '';
      return row({
        label: group.b,
        tone: TIER_TONE[top.tier] || 'muted',
        value: bakeryLink(top.name) + (tier ? meta(tier) : ''),
        plain: group.b + ' — ' + top.name + ', ' + (tier ? tier + ' priority, ' : '') +
          'support score ' + top.priority + '/100',
        stat: top.priority
      });
    });
  }

  function regionCoverageRows() {
    return perRegionRows(function (group, members) {
      if (!G.getVisitCountInPeriod) return emptyRow(group.b, 'Visit data unavailable');
      if (!members.length) return emptyRow(group.b, 'No bakeries in this region');
      var visited = 0;
      members.forEach(function (record) { if (visitedInPeriod(record)) visited++; });
      var share = visited / members.length;
      return row({
        label: group.b,
        tone: visited ? 'muted' : 'red',
        value: subject(visited + ' of ' + members.length + ' visited'),
        plain: group.b + ' — ' + visited + ' of ' + members.length +
          ' bakeries visited this period',
        stat: percent(share * 100)
      });
    });
  }

  // ========== VISITS ==========

  function monthsSince(iso) {
    var date = new Date(String(iso || '') + 'T00:00:00');
    if (isNaN(date.getTime())) return null;
    var now = new Date();
    return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  }

  // The date opens the visit itself: [data-visit-report] is picked up by the
  // document-level handler in js/visit-report.js, which resolves the bakery's
  // latest visit and opens that report.
  function visitReportButton(bakery, label) {
    return '<button type="button" class="ataglance-row__stat ataglance-row__stat--link"' +
      ' data-visit-report="' + esc(bakery) + '">' + esc(label) +
      '<span aria-hidden="true"> &rarr;</span></button>';
  }

  // The date carries the age, so the name gets the rest of the row: a bakery
  // name, a relative age and a date is one thing more than fits here.
  function lastVisitRow() {
    if (!G.getLastVisitDate) return emptyRow('Last visit', 'Visit data unavailable');
    var latest = null;
    rows().forEach(function (record) {
      var date = G.getLastVisitDate(record.b);
      if (!date) return;
      if (!latest || date > latest.date) latest = { date: date, bakery: record.b };
    });
    if (!latest) return emptyRow('Last visit', 'No routine visit logged here yet');
    return '<li class="ataglance-row">' +
      '<span class="ataglance-row__label"><i class="ataglance-row__dot ataglance-row__dot--muted" aria-hidden="true"></i>Last visit</span>' +
      '<span class="ataglance-row__line">' +
      '<span class="ataglance-row__value" title="' +
      esc(latest.bakery + ' — ' + formatVisitDate(latest.date) + ', ' + relativeVisitLabel(latest.date)) + '">' +
      bakeryLink(latest.bakery) + '</span>' +
      visitReportButton(latest.bakery, formatVisitDate(latest.date)) +
      '</span></li>';
  }

  // Bakeries that have never been visited are their own row below, so this one
  // ranks only the ones with a visit to be overdue on.
  function longestGapRow() {
    if (!G.getLastVisitDate) return emptyRow('Longest since a visit', 'Visit data unavailable');
    var oldest = null;
    rows().forEach(function (record) {
      var date = G.getLastVisitDate(record.b);
      if (!date) return;
      if (!oldest || date < oldest.date) oldest = { date: date, bakery: record.b };
    });
    if (!oldest) return emptyRow('Longest since a visit', 'No routine visit logged here yet');
    var months = monthsSince(oldest.date);
    return row({
      label: 'Longest since a visit',
      tone: months >= 12 ? 'red' : months >= 6 ? 'gold' : 'muted',
      value: bakeryLink(oldest.bakery),
      // Whose patch it is on rides in the title rather than the row: a name, a
      // second name and a date is one thing more than this row fits, and the
      // site is what the row is for.
      plain: oldest.bakery + (grouping() === 'bakeries' ? '' : ' (' + memberKey(oldest.bakery) + ')') +
        ' — last visited ' + formatVisitDate(oldest.date) + ', ' +
        relativeVisitLabel(oldest.date),
      stat: formatVisitDate(oldest.date)
    });
  }

  function mostVisitedRow() {
    var months = (G.state && G.state.selectedMonths) || [];
    if (!G.getVisitCountInPeriod) return emptyRow('Most visited', 'Visit data unavailable');
    var best = null;
    rows().forEach(function (record) {
      var count = G.getVisitCountInPeriod(record.b, months);
      if (!count) return;
      if (!best || count > best.count) best = { bakery: record.b, count: count };
    });
    if (!best) return emptyRow('Most visited', 'No visits logged in this period');
    // Carries its unit: a bare number on a row labelled "Most visited" reads as
    // a placing rather than a count, next to the scores every other row shows.
    var visits = best.count + ' visit' + (best.count === 1 ? '' : 's');
    return row({
      label: 'Most visited',
      tone: 'green',
      value: bakeryLink(best.bakery),
      plain: best.bakery + ' — ' + visits + ' this period',
      stat: visits
    });
  }

  // Counted over every visit ever logged, not the selected period: a bakery is
  // only "awaiting a first visit" if nobody has ever been.
  function neverVisitedRow() {
    if (!G.getLastVisitDate) return emptyRow('No visit yet', 'Visit data unavailable');
    var waiting = rows().filter(function (record) { return !G.getLastVisitDate(record.b); });
    if (!waiting.length) {
      return emptyRow('No visit yet', 'Every bakery in scope has been visited');
    }
    // One site is named; several are counted. Either way the figure on the
    // right says something the left-hand side does not.
    if (waiting.length === 1) {
      return row({
        label: 'No visit yet',
        tone: 'red',
        value: bakeryLink(waiting[0].b),
        plain: waiting[0].b + ' has no routine visit on record',
        stat: '1 of ' + rows().length
      });
    }
    var share = Math.round((waiting.length / rows().length) * 100);
    return row({
      label: 'No visit yet',
      tone: 'red',
      value: '<span class="ataglance-row__name">' + waiting.length + ' bakeries</span>',
      plain: waiting.length + ' bakeries in scope have no routine visit on record',
      stat: share + '%'
    });
  }

  function visitRows() {
    return lastVisitRow() + longestGapRow() + mostVisitedRow() + neverVisitedRow();
  }

  // ========== FOOTER ==========

  // Coverage is counted over the months the period filter selects, so it
  // answers "how well was this period covered", not "how many visits exist".
  function visitStrip() {
    var months = (G.state && G.state.selectedMonths) || [];
    var data = rows();
    if (!G.getVisitCountInPeriod || !data.length) return '';
    var visited = 0;
    var total = 0;
    data.forEach(function (record) {
      var count = G.getVisitCountInPeriod(record.b, months);
      total += count;
      if (count > 0) visited++;
    });
    return '<div class="ataglance-strip">' +
      '<div class="ataglance-stat">' +
      '<strong>' + Math.round((visited / data.length) * 100) + '%</strong>' +
      '<span>visited this period</span>' +
      '</div>' +
      '<div class="ataglance-stat">' +
      '<strong>' + round1(total / data.length).toFixed(1) + '</strong>' +
      '<span>visits per bakery</span>' +
      '</div>' +
      '</div>';
  }

  // One line describing the selection, in the same bands the Index Band Split
  // card beside it plots.
  //
  // Every band is counted, so the figures add up to the estate total on the
  // front of the line. Leaving the middle out made the line read as though the
  // rest were unaccounted for: 198 bakeries, 67 meeting or better and 76 below
  // standard leaves 54 sites a reader has to work out for themselves.
  function scopeLine() {
    var data = subjects();
    var strong = 0;
    var middle = 0;
    var weak = 0;
    var unscored = 0;
    data.forEach(function (record) {
      if (record.acb === 'Exceeding' || record.acb === 'Meeting') strong++;
      else if (record.acb === 'Approaching') middle++;
      else if (record.acb === 'Below Standard') weak++;
      else if (record.acb === 'No Data' || record.acb === 'Incomplete') unscored++;
    });
    var parts = [data.length + ' ' + (data.length === 1 ? words().unit : words().units)];
    // A band only earns its place when it holds something. "0 below standard"
    // reads as a fact about the estate when it is really a fact about the line,
    // and on a selection of four regions two of the four counts are noughts.
    if (strong) parts.push(strong + ' meeting or better');
    if (middle) parts.push(middle + ' approaching');
    if (weak) parts.push(weak + ' below standard');
    if (unscored) parts.push(unscored + ' not scored');
    return '<p class="ataglance-scope">' + esc(parts.join(' · ')) + '</p>';
  }

  function slideHtml(slide) {
    return '<ul class="ataglance-list">' + slide.build() + '</ul>' +
      visitStrip() + scopeLine();
  }

  // ========== ROTATION ==========

  function stopRotation() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  // A panel that keeps moving under a reader's cursor is a nuisance, so the
  // rotation stops on hover and while anything inside it holds focus, and never
  // starts at all for a viewer who has asked for reduced motion. The dots still
  // work in every case.
  function startRotation() {
    stopRotation();
    if (paused || reducedMotion() || !currentData || !currentData.length) return;
    // A single bakery is a single slide, and rotating it would redraw the same
    // four rows every nine seconds.
    if (slides().length < 2) return;
    timer = window.setInterval(function () {
      var panel = document.getElementById('tab-overview');
      if (document.hidden || !panel || !panel.classList.contains('active')) return;
      show(index + 1);
    }, ROTATE_MS);
  }

  function bindListeners(card) {
    if (listenersBound || !card) return;
    listenersBound = true;
    var hold = function () { paused = true; stopRotation(); };
    var release = function () { paused = false; startRotation(); };
    card.addEventListener('mouseenter', hold);
    card.addEventListener('mouseleave', release);
    card.addEventListener('focusin', hold);
    card.addEventListener('focusout', function (event) {
      if (!card.contains(event.relatedTarget)) release();
    });
    card.addEventListener('click', function (event) {
      var dot = event.target.closest ? event.target.closest('[data-glance-slide]') : null;
      if (!dot) return;
      show(parseInt(dot.getAttribute('data-glance-slide'), 10) || 0);
      startRotation();
    });
  }

  function renderChrome() {
    var dots = document.getElementById('atAGlanceDots');
    if (!dots) return;
    dots.innerHTML = slides().map(function (slide, i) {
      // The pill is capped in width, so a name long enough to be trimmed still
      // reads in full on hover and to a screen reader.
      return '<button type="button" role="tab" class="ataglance-dot' +
        (i === index ? ' is-active' : '') + '" data-glance-slide="' + i + '"' +
        ' title="' + esc(slide.label) + '"' +
        ' aria-selected="' + (i === index) + '" aria-controls="atAGlanceBody">' +
        '<span class="ataglance-dot__label">' + esc(slide.label) + '</span></button>';
    }).join('');
  }

  // `quiet` redraws the slide in place without the entry fade, for a refresh
  // the reader did not ask for: the fade announces a new slide, and playing it
  // over the slide they are already reading reads as a glitch.
  function show(next, quiet) {
    var set = slides();
    index = ((next % set.length) + set.length) % set.length;
    var body = document.getElementById('atAGlanceBody');
    if (!body) return;
    body.innerHTML = slideHtml(set[index]);
    if (!quiet) {
      // Replay the entry fade: on an element that is already in the document
      // the class has to come off, force a reflow, and go back on.
      body.classList.remove('is-entering');
      void body.offsetWidth;
      body.classList.add('is-entering');
    }
    renderChrome();
  }

  // ========== RENDER ==========

  // Called from refresh() with the filtered period rows: the bakeries in the
  // selection, and the rows the View toggle is showing — the same bakeries, or
  // the ops areas / regions they roll up into.
  G.renderAtAGlance = function (data, viewData) {
    var card = document.getElementById('atAGlance');
    var body = document.getElementById('atAGlanceBody');
    if (!body) return;
    currentData = data || [];
    currentView = viewData && viewData.length ? viewData : currentData;

    if (!currentData.length) {
      stopRotation();
      body.innerHTML = '<p class="ataglance-empty">No bakeries match the current filters.</p>';
      var dots = document.getElementById('atAGlanceDots');
      if (dots) dots.innerHTML = '';
      return;
    }

    bindListeners(card);
    // The slide the reader was on survives a filter change: a refresh should
    // update what they are looking at, not snap them back to the first slide.
    show(index);
    startRotation();
  };

  // The visit figures are the one thing on this card that does not come out of
  // the period rows: they are read from the routine-visit index, which arrives
  // from Firebase after the first render (js/auth.js). Until it lands every
  // bakery reads as never visited, so the card opens on "0% visited this
  // period" and only corrects itself whenever the rotation next ticks — which
  // is nine seconds later, or never, if the reader has hovered or asked for
  // reduced motion. Redrawing when the feed lands is what makes those two
  // figures true on first sight.
  G.refreshAtAGlanceVisits = function () {
    if (!currentData || !currentData.length) return;
    show(index, true);
  };
})();

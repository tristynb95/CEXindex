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
// down to a single bakery and the card swaps them for that bakery's own standing
// instead — see A SINGLE BAKERY.
//
// Every slide is bakery-level, whatever the View toggle is set to. The charts
// below the KPI row already answer the grouped questions; a bakery is the unit
// someone acts on, and it is the only unit a visit or a support score exists
// for at all.
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

  var SLIDES = [
    { id: 'performance', label: 'Performance', build: performanceRows },
    { id: 'leaders', label: 'Leaders', build: leaderRows },
    { id: 'levers', label: 'Opportunities', build: leverRows },
    { id: 'visits', label: 'Visits', build: visitRows }
  ];

  // Which set of slides the current selection has earned: the four estate
  // themes, or the one bakery's own standing when there is nothing left to rank
  // it against (see A SINGLE BAKERY).
  function slides() {
    var data = rows();
    if (data.length !== 1) return SLIDES;
    return [bakerySlide(data[0])];
  }

  var index = 0;
  var timer = null;
  var paused = false;
  var currentData = null;
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

  function rows() {
    return currentData || [];
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
    rows().forEach(function (record) {
      if (!scored(record) || !isNumber(record.ac)) return;
      if (!best || record.ac > best.ac) best = record;
    });
    if (!best) return emptyRow('Top bakery', 'No scored bakeries in this selection');
    return row({
      label: 'Top bakery',
      tone: BAND_TONE[best.acb] || 'muted',
      value: bakeryLink(best.b),
      plain: best.b,
      stat: Math.round(best.ac)
    });
  }

  // Movement is measured the way the KPI deltas are: this period's score
  // against the mean of the same bakery over the period immediately before it.
  // The estate rows and the single-bakery rows both read this one map, so a
  // bakery's movement is the same figure whichever way the card is showing it.
  function priorAverages() {
    var prior = G.getPriorPeriodRecords ? G.getPriorPeriodRecords() : null;
    if (!prior) return null;
    var totals = {};
    prior.records.forEach(function (record) {
      if (!isNumber(record.ac) || record.noData || record.incompletePeriod) return;
      if (!totals[record.b]) totals[record.b] = { sum: 0, count: 0 };
      totals[record.b].sum += record.ac;
      totals[record.b].count++;
    });
    var averages = {};
    Object.keys(totals).forEach(function (bakery) {
      averages[bakery] = totals[bakery].sum / totals[bakery].count;
    });
    return { label: prior.label, averages: averages };
  }

  // The change on one bakery, or null where there is nothing to compare it
  // with. Both movers share one pass, so the riser and the faller are always
  // drawn from the same comparison.
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
    rows().forEach(function (record) {
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
      return emptyRow(config.label, 'No bakery ' + (config.rising ? 'gained' : 'lost') +
        ' ground on ' + found.label);
    }
    var change = round1(Math.abs(pick.change)).toFixed(1);
    return row({
      label: config.label,
      tone: config.rising ? 'green' : 'red',
      value: bakeryLink(pick.record.b) + meta('vs ' + found.label),
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
      moverRow({ label: 'Biggest riser', rising: true, movers: found }) +
      moverRow({ label: 'Biggest faller', rising: false, movers: found }) +
      supportRow();
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
    rows().forEach(function (record) {
      if (!scored(record) || !isNumber(record[metric.key])) return;
      if (!pick) { pick = record; return; }
      var value = record[metric.key];
      var current = pick[metric.key];
      if (highest ? value > current : value < current) { pick = record; return; }
      if (value === current && named[pick.b] && !named[record.b]) pick = record;
    });
    if (!pick) return emptyRow(label, 'No scored bakeries in this selection');
    named[pick.b] = true;
    var value = pick[metric.key];
    var tone = G.metricRagTone ? RAG_TONE[G.metricRagTone(metric.key, value)] : null;
    return row({
      label: label,
      tone: tone || 'muted',
      value: bakeryLink(pick.b),
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

  // ========== A SINGLE BAKERY ==========

  // Ranking a bakery against itself says nothing. With one site selected every
  // "highest" row and every "lowest" row names it, Leaders and Opportunities
  // print the same four figures as each other, and a site sitting on 78% drink
  // quality is announced as the best in scope. So a selection of one drops the
  // ranking framing and gives the bakery a slide of its own standing instead.
  //
  // Two is where the ranking starts earning its keep again: "highest NPS" on
  // one site and "highest drink quality" on the other is a comparison, which is
  // the thing someone selecting a pair of bakeries is usually after. So the cut
  // is at one, not at some notion of a small selection.
  //
  // The four metrics are deliberately not repeated here: with a single bakery
  // selected, the KPI row alongside this card is already showing exactly those
  // figures for exactly that site. What nothing else on the Overview says at
  // bakery level is where it stands on its own — its band, which way it is
  // moving, whether it is on the focus list, and when anyone last walked in.

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
  function bakerySupportRow(record) {
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

  function bakerySlide(record) {
    return {
      id: 'bakery:' + record.b,
      label: record.b,
      build: function () {
        var prior = priorAverages();
        return bakeryScoreRow(record) + bakeryMovementRow(record, prior) +
          bakerySupportRow(record) + bakeryVisitRow(record);
      }
    };
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
      plain: oldest.bakery + ' — last visited ' + formatVisitDate(oldest.date) + ', ' +
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
    var data = rows();
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
    var parts = [data.length + ' baker' + (data.length === 1 ? 'y' : 'ies')];
    parts.push(strong + ' meeting or better');
    // The two ends are the point of the line and are stated even at nought;
    // the bands between them only earn their place when they hold something.
    if (middle) parts.push(middle + ' approaching');
    parts.push(weak + ' below standard');
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

  // Called from refresh() with the filtered, bakery-level period rows.
  G.renderAtAGlance = function (data) {
    var card = document.getElementById('atAGlance');
    var body = document.getElementById('atAGlanceBody');
    if (!body) return;
    currentData = data || [];

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

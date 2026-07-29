// ========== CHARTS MODULE ==========
window.GAILS = window.GAILS || {};

// ── GAIL's light-theme defaults for Chart.js ──
if (typeof Chart !== 'undefined') {
  function setSafe(obj, path, value) {
    var parts = path.split('.');
    var curr = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
  }

  setSafe(Chart, 'defaults.color', '#757575');
  setSafe(Chart, 'defaults.borderColor', 'rgba(34, 31, 26,0.07)');
  setSafe(Chart, 'defaults.font.family', 'Inter, system-ui, sans-serif');
  setSafe(Chart, 'defaults.plugins.legend.labels.color', '#757575');
  setSafe(Chart, 'defaults.plugins.legend.labels.font.family', 'Inter, system-ui, sans-serif');
  setSafe(Chart, 'defaults.plugins.legend.labels.usePointStyle', true);
  setSafe(Chart, 'defaults.plugins.tooltip.backgroundColor', '#FFFFFF');
  setSafe(Chart, 'defaults.plugins.tooltip.titleColor', '#221F1A');
  setSafe(Chart, 'defaults.plugins.tooltip.bodyColor', '#757575');
  setSafe(Chart, 'defaults.plugins.tooltip.borderColor', 'rgba(0,0,0,0.1)');
  setSafe(Chart, 'defaults.plugins.tooltip.borderWidth', 1);
  setSafe(Chart, 'defaults.plugins.tooltip.padding', 10);
  setSafe(Chart, 'defaults.plugins.tooltip.cornerRadius', 8);
  setSafe(Chart, 'defaults.plugins.tooltip.displayColors', false);

  if (Chart.defaults.scale) {
    setSafe(Chart, 'defaults.scale.grid.color', 'rgba(0,0,0,0.05)');
    setSafe(Chart, 'defaults.scale.ticks.color', '#8C8272');
    setSafe(Chart, 'defaults.scale.ticks.backdropColor', 'transparent');
    setSafe(Chart, 'defaults.scale.title.color', '#757575');
  }

  if (Chart.defaults.scales) {
    ['linear', 'category'].forEach(function (scaleType) {
      setSafe(Chart, 'defaults.scales.' + scaleType + '.grid.color', 'rgba(0,0,0,0.05)');
      setSafe(Chart, 'defaults.scales.' + scaleType + '.ticks.color', '#8C8272');
      setSafe(Chart, 'defaults.scales.' + scaleType + '.ticks.backdropColor', 'transparent');
      setSafe(Chart, 'defaults.scales.' + scaleType + '.title.color', '#757575');
    });
  }
}

// Ink and rule colours shared by the chart configs, mirroring the CSS custom
// properties of the same name so charts and cards stay in step.
window.GAILS.CHART_INK = {
  strong: '#221F1A',
  body: '#4D463C',
  muted: '#8C8272',
  grid: 'rgba(34, 31, 26, 0.05)',
  track: 'rgba(34, 31, 26, 0.05)'
};

var _charts = {};

window.GAILS.makeChart = function (id, config) {
  if (_charts[id]) _charts[id].destroy();
  var el = document.getElementById(id);
  if (!el) return;
  _charts[id] = new Chart(el, config);
};

window.GAILS.getChart = function (id) { return _charts[id]; };
window.GAILS.destroyChart = function (id) { if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; } };
window.GAILS.resizeChartsIn = function (container) {
  if (!container) return;
  Array.from(container.querySelectorAll('canvas[id]')).forEach(function (canvas) {
    var chart = _charts[canvas.id];
    if (chart) chart.resize();
  });
};

// ========== RENDER OVERVIEW CHARTS ==========
window.GAILS.renderOverviewCharts = function (data) {
  var G = GAILS;
  var avg = G.avg;
  data.forEach(G.ensureBands);
  var chartData = data.filter(function (r) { return r && !r.noData; });
  var n = chartData.length;
  if (!n) {
    ['npsVsCei', 'absComponentDrag'].forEach(G.destroyChart);
    var emptySplit = document.getElementById('bandSplit');
    if (emptySplit) emptySplit.innerHTML = '';
    return;
  }
  var valueKey = 'ac';
  var bandKey = 'acb';
  var colorMap = G.ABSCOL;
  var bandNames = G.ABS_BAND_NAMES;
  var metricLabel = 'Benchmark Score';
  // Benchmark Score cut-offs between bands — mirrors the ladder in ensureBands
  // (js/cei.js) and the ranges in ABS_BAND_RANGES.
  var BAND_CUTS = [60, 75, 90];

  // Band split. Deliberately DOM bars rather than a pie: five shares of an
  // estate are a magnitude comparison, and arcs are the one form that makes
  // "is Meeting bigger than Approaching?" hard to answer. Bars share a
  // baseline, carry their own count and share as text, and cost far less
  // height than a ring plus its legend.
  var bandSplitTitle = document.getElementById('overviewBandSplitTitle');
  if (bandSplitTitle) bandSplitTitle.textContent = 'Index Band Split (' + metricLabel + ')';
  var splitEl = document.getElementById('bandSplit');
  if (splitEl) {
    // "Incomplete" and "No Data" are both unscored states, already sharing the
    // same grey in colorMap — fold them into a single "Not Scored" row. It is
    // counted off `data`, not `chartData`, so this stays the one place on the
    // Overview showing how much of the estate has no score at all.
    var splitBandNames = bandNames.filter(function (bn) { return bn !== 'Incomplete' && bn !== 'No Data'; });
    var isUnscored = function (d) { return d[bandKey] === 'Incomplete' || d[bandKey] === 'No Data'; };
    var splitRows = splitBandNames.map(function (bn) {
      return { label: bn, color: colorMap[bn], count: data.filter(function (d) { return d[bandKey] === bn; }).length };
    }).concat([{
      label: 'Not Scored',
      color: colorMap['Incomplete'] || colorMap['No Data'] || '#B3AA99',
      count: data.filter(isUnscored).length
    }]);
    var splitTotal = splitRows.reduce(function (a, r) { return a + r.count; }, 0);
    // Bars scale against the largest band, not the total: no band is ever close
    // to the whole estate, so scaling to the total would leave every bar a stub.
    var splitMax = splitRows.reduce(function (a, r) { return Math.max(a, r.count); }, 0) || 1;

    splitEl.innerHTML = splitRows.map(function (row) {
      var pct = splitTotal ? Math.round(row.count / splitTotal * 100) : 0;
      // The band names alone don't say where the cut-offs are, so each row
      // carries its score range for the hover bubble and for screen readers.
      var range = (G.ABS_BAND_RANGES && G.ABS_BAND_RANGES[row.label]) || '';
      return '<button type="button" class="band-split__row" data-band="' + G.escapeHtml(row.label) + '"'
        + ' data-range="' + G.escapeHtml(range) + '"'
        + (row.count ? '' : ' disabled')
        + ' aria-label="' + G.escapeHtml(row.label) + (range ? ', ' + G.escapeHtml(range) : '')
        + ': ' + row.count + ' bakeries, ' + pct + ' per cent">'
        + '<span class="band-split__name">'
        + '<span class="band-split__dot" style="background:' + row.color + '"></span>'
        + G.escapeHtml(row.label)
        + '</span>'
        + '<span class="band-split__track">'
        + '<span class="band-split__fill" style="width:' + (row.count / splitMax * 100) + '%;'
        + 'background:' + row.color + '"></span>'
        + '</span>'
        + '<span class="band-split__count">' + row.count + '</span>'
        + '<span class="band-split__pct">' + pct + '%</span>'
        + '</button>';
    }).join('');

    splitEl.onclick = function (evt) {
      var btn = evt.target.closest('.band-split__row');
      if (!btn) return;
      var band = btn.dataset.band;
      var bakeries = band === 'Not Scored'
        ? data.filter(isUnscored)
        : data.filter(function (d) { return d[bandKey] === band; });
      if (!bakeries.length) return;
      G.showDrillDown(band, bakeries.length + ' bakeries in this band', bakeries, 'absolute');
    };
  }

  // NPS vs CEI
  var npsScatterTitle = document.getElementById('npsScatterTitle');
  if (npsScatterTitle) npsScatterTitle.textContent = 'NPS (Drink + Meal) vs ' + metricLabel;
  // Marks and axes are deliberately light here: washed fill behind a hairline,
  // recessive grid, small muted type — the same weights the KPI tiles and the
  // band split use, so the lower row reads as part of the same system.
  G.makeChart('npsVsCei', {
    type: 'scatter',
    data: {
      datasets: [{
        data: chartData.map(function (b) { return { x: b[valueKey], y: b.n }; }),
        // Solid fill with a surface-coloured ring: at 195 points the cloud
        // overlaps heavily, and the ring is what keeps individual bakeries
        // legible instead of merging into a single mass.
        backgroundColor: chartData.map(function (b) { return colorMap[b[bandKey]] + 'D9'; }),
        borderColor: '#FFFFFF',
        borderWidth: 1.5,
        pointRadius: 5,
        pointHitRadius: 12,
        pointHoverRadius: 8,
        pointHoverBorderColor: '#FFFFFF',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: function (items) { return chartData[items[0].dataIndex].b; }, label: function (ctx) { var b = chartData[ctx.dataIndex]; return [metricLabel + ': ' + b[valueKey] + ' (' + b[bandKey] + ')', 'Company rank: ' + (b.companyRank ? b.companyRank + ' of ' + b.companyCohortSize : 'Not ranked'), 'NPS (D+M): ' + b.n, 'Vol: ' + b.v + ' (' + b.co + ' confidence)']; } } }
      },
      scales: {
        x: {
          min: 0, max: 100,
          title: { display: true, text: metricLabel, font: { size: 10.5, weight: '600' }, color: G.CHART_INK.muted },
          // Ticks sit on the band cut-offs rather than at round tens, so the
          // colour of a point and its position tell the same story as the band
          // split card above: left of 60 is Below Standard, past 90 Exceeding.
          afterBuildTicks: function (axis) {
            axis.ticks = [0, 60, 75, 90, 100].map(function (v) { return { value: v }; });
          },
          ticks: { font: { size: 10, weight: '600' }, color: G.CHART_INK.muted, autoSkip: false },
          grid: {
            color: function (ctx) { return BAND_CUTS.indexOf(ctx.tick.value) >= 0 ? 'rgba(34, 31, 26, 0.16)' : G.CHART_INK.grid; }
          },
          border: { display: false }
        },
        y: {
          min: -15, max: 105,
          title: { display: true, text: 'NPS (D+M)', font: { size: 10.5, weight: '600' }, color: G.CHART_INK.muted },
          // Explicit ticks: the -15 to 105 range makes Chart.js pick uneven
          // stops (-15, 0, 50, 105) that are hard to read a value against.
          afterBuildTicks: function (axis) {
            axis.ticks = [0, 25, 50, 75, 100].map(function (v) { return { value: v }; });
          },
          ticks: { font: { size: 10, weight: '600' }, color: G.CHART_INK.muted, autoSkip: false },
          grid: { color: G.CHART_INK.grid },
          border: { display: false }
        }
      }
    }
  });

  // Component drag by selected CEI lens
  var dragTitle = document.getElementById('overviewDragTitle');
  if (dragTitle) dragTitle.textContent = 'Biggest Drags on ' + metricLabel;
  var atRows = chartData.filter(function (b) { return typeof b.at === 'number' && !isNaN(b.at); });
  var rawAvgAt = atRows.length ? atRows.reduce(function (a, r) { return a + r.at; }, 0) / atRows.length : null;

  var W = G.CEI_WEIGHTS;
  var componentAvgs = [
      { name: 'Drink + Meal NPS', weight: W.nps, avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.n, G.BENCHMARKS.nps, G.BENCHMARK_FLOORS.nps); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'n') },
      { name: 'Overall Efficiency', weight: W.ef, avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.ef, G.BENCHMARKS.ef, G.BENCHMARK_FLOORS.ef); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'ef') },
      { name: 'Drink Quality', weight: W.dr, avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.dr, G.BENCHMARKS.dr, G.BENCHMARK_FLOORS.dr); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'dr') },
      { name: 'Friendliness', weight: W.fr, avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.fr, G.BENCHMARKS.fr, G.BENCHMARK_FLOORS.fr); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'fr') },
      { name: 'Coffee Efficiency', weight: W.time, avg: chartData.map(function (b) { return b.ats; }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'ts') },
      { name: 'Avg Wait Time', weight: W.at, avg: chartData.map(function (b) { return (b.a_at !== undefined && b.a_at !== null) ? b.a_at : 100; }).reduce(function (a, v) { return a + v; }, 0) / n, raw: rawAvgAt }
    ];

  // Bars are benchmark points lost, not points scored. The index is a weighted
  // mean of these components, so weight x (100 - component) is literally the
  // number of points that component costs the score, and the six sum to the gap
  // between 100 and the estate's raw index. Plotting the score instead made the
  // worst component the *shortest* bar, which read backwards against the title,
  // and gave a 5%-weighted miss the same visual size as a 25%-weighted one.
  componentAvgs.forEach(function (c) { c.lost = Math.max(0, (100 - c.avg) * c.weight); });
  componentAvgs.sort(function (a, b) { return b.lost - a.lost; });
  var dragTone = function (v) { return v >= 90 ? '#1D9E5C' : v >= 60 ? '#C97F12' : '#B22A24'; };
  var dragValues = componentAvgs.map(function (c) { return Math.round(c.lost * 10) / 10; });
  var dragTotal = componentAvgs.reduce(function (a, c) { return a + c.lost; }, 0);
  // Headroom so the longest bar stops short of the label column.
  var dragMax = Math.max(1, Math.ceil(Math.max.apply(null, dragValues) * 1.15));

  // Labels sit in a column just outside the plot rather than trailing each bar,
  // so the numbers line up the way the band split's counts do.
  var dragValueLabels = {
    id: 'dragValueLabels',
    afterDatasetsDraw: function (chart) {
      var meta = chart.getDatasetMeta(1);
      if (!meta || meta.hidden) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '800 13px Inter, system-ui, sans-serif';
      ctx.fillStyle = G.CHART_INK.strong;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      meta.data.forEach(function (bar, i) {
        ctx.fillText('−' + dragValues[i].toFixed(1), chart.chartArea.right + 10, bar.y);
      });
      ctx.restore();
    }
  };

  G.makeChart('absComponentDrag', {
    type: 'bar',
    data: {
      labels: componentAvgs.map(function (c) { return c.name; }),
      datasets: [
        {
          label: 'Track',
          data: componentAvgs.map(function () { return dragMax; }),
          backgroundColor: G.CHART_INK.track,
          borderWidth: 0,
          borderRadius: 999,
          maxBarThickness: 20,
          grouped: false
        },
        {
          // Solid tone rather than a wash — the bars are what the eye should
          // land on, so the weight lives here and the axis furniture stays quiet.
          // Length is points lost, colour is that component's own health, so a
          // long amber bar reads as "middling but heavily weighted".
          label: 'Benchmark points lost',
          data: dragValues,
          backgroundColor: componentAvgs.map(function (c) { return dragTone(c.avg); }),
          hoverBackgroundColor: componentAvgs.map(function (c) { return dragTone(c.avg); }),
          borderWidth: 0,
          borderRadius: 999,
          maxBarThickness: 20,
          grouped: false
        }
      ]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      // Room at the right for the value label column outside the plot area:
      // 10px offset + ~44px for a bold 13px "−10.0".
      layout: { padding: { right: 56 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: function (item) { return item.datasetIndex === 1; },
          callbacks: {
            label: function (ctx) {
              var c = componentAvgs[ctx.dataIndex];
              var rawStr = c.name === 'Avg Wait Time' ? G.formatSecs(c.raw) : c.name === 'Drink + Meal NPS' ? (c.raw ? c.raw.toFixed(1) : '—') : (c.raw ? c.raw.toFixed(1) + '%' : '—');
              return [
                'Costing ' + ctx.raw + ' benchmark points',
                'Component score: ' + (Math.round(c.avg * 10) / 10) + ' of 100 (raw avg: ' + rawStr + ')',
                'Weight in the score: ' + Math.round(c.weight * 100) + '%'
              ];
            }
          }
        }
      },
      scales: {
        x: {
          min: 0, max: dragMax,
          title: { display: true, text: 'Benchmark points lost — ' + (Math.round(dragTotal * 10) / 10) + ' in total', font: { size: 10.5, weight: '600' }, color: G.CHART_INK.muted },
          ticks: { display: false },
          grid: { display: false },
          border: { display: false }
        },
        y: {
          ticks: { font: { size: 11.5, weight: '700' }, color: G.CHART_INK.body },
          grid: { display: false },
          border: { display: false }
        }
      }
    },
    plugins: [dragValueLabels]
  });
};

// ========== RENDER TREND CHARTS ==========
window.GAILS.renderTrendCharts = function (data) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var RM = G.getRollingMonths();

  if (state.ALL && G.ensureBands) {
    state.ALL.forEach(G.ensureBands);
  }

  // Build scoped dataset matching the same filters as the bakery tracker
  var trendSelectedBakeries = Array.isArray(state.searchBakery) ? state.searchBakery.slice() : [];
  var trendScopedAll = state.ALL.filter(function (r) {
    if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(r.b))) return false;
    if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(r.b))) return false;
    if (state.bandFilter) { var _bf = state.bandFilter; if (_bf.indexOf('abs:') === 0) { if (r.acb !== _bf.slice(4)) return false; } else { if (r.cb !== _bf) return false; } }
    if (trendSelectedBakeries.length && trendSelectedBakeries.indexOf(r.b) === -1) return false;
    return true;
  });

  // Build scope label for chart titles
  var trendScopeLabel = '';
  if (trendSelectedBakeries.length) {
    trendScopeLabel = trendSelectedBakeries.length === 1 ? trendSelectedBakeries[0] : trendSelectedBakeries.length + ' Bakeries';
  } else {
    var scopeParts = [];
    if (state.regionFilter.length) scopeParts.push(state.regionFilter.join(', '));
    if (state.opsFilter.length) scopeParts.push(state.opsFilter.join(', '));
    if (state.bandFilter) {
      var bf = state.bandFilter;
      scopeParts.push(bf.indexOf('abs:') === 0 ? bf.slice(4) : bf);
    }
    trendScopeLabel = scopeParts.join(' \u00b7 ');
  }
  function trendTitle(base) {
    return trendScopeLabel ? base + ' \u2014 ' + trendScopeLabel : base;
  }

  // Update h2 titles
  var el;
  el = document.getElementById('trendCXTitle'); if (el) el.textContent = trendTitle('Average CX Scores by Month');
  el = document.getElementById('trendAbsBandsTitle'); if (el) el.textContent = trendTitle('Benchmark Score Bands by Month');
  el = document.getElementById('trendNpsSplitTitle'); if (el) el.textContent = trendTitle('Average NPS by Month');
  el = document.getElementById('trendWaitPressureTitle'); if (el) el.textContent = trendTitle('Coffee Timing Mix by Month');

  function rowsForMonth(month) {
    return trendScopedAll.filter(function (r) { return r.m === month; });
  }

  function avgDefined(rows, key) {
    var vals = rows
      .map(function (r) { return r[key]; })
      .filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    return vals.length ? vals.reduce(function (a, v) { return a + v; }, 0) / vals.length : null;
  }

  function round1OrNull(value) {
    return value === null || value === undefined || isNaN(value) ? null : Math.round(value * 10) / 10;
  }

  // Headline NPS by month — drawn as the bold "Drink + Meal" series of the NPS
  // split chart below, and returned here for callers that want the raw series.
  var trendNPS = RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.reduce(function (a, r) { return a + r.n; }, 0) / mr.length : null; });

  var trendKeys = [{ k: 'dr', l: 'Quality', c: '#1E70C4' }, { k: 'ef', l: 'Overall Efficiency', c: '#1D9E5C' }, { k: 'fr', l: 'Friendliness', c: '#C97F12' }, { k: 'ov', l: 'Overall', c: '#6B4FA8' }];
  G.makeChart('trendCX', { type: 'line', data: { labels: RM, datasets: trendKeys.map(function (tk) { return { label: tk.l, data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.reduce(function (a, r) { return a + r[tk.k]; }, 0) / mr.length : null; }), borderColor: tk.c, tension: 0.3, pointRadius: 3, borderWidth: 2 }; }) }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { title: { display: true, text: 'Score %' } } } } });

  // NPS split trend: exposes the newer Coffee / Meal / All-response columns.
  var npsSplitKeys = [
    { k: 'n', l: 'Drink + Meal', c: G.COL['Top Performance'], dash: [] },
    { k: 'nc', l: 'Coffee Only', c: '#1E70C4', dash: [5, 3] },
    { k: 'nm', l: 'Meal Only', c: '#C97F12', dash: [2, 3] },
    { k: 'na', l: 'All Responses', c: '#6B4FA8', dash: [7, 3] }
  ];
  G.makeChart('trendNpsSplit', {
    type: 'line',
    data: {
      labels: RM,
      datasets: npsSplitKeys.map(function (tk) {
        return {
          label: tk.l,
          data: RM.map(function (m) {
            var mr = rowsForMonth(m);
            return mr.length ? round1OrNull(avgDefined(mr, tk.k)) : null;
          }),
          borderColor: tk.c,
          backgroundColor: tk.c + '18',
          borderDash: tk.dash,
          tension: 0.3,
          pointRadius: 3,
          borderWidth: tk.k === 'n' ? 2.5 : 2
        };
      })
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 } } },
        tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + (ctx.raw === null ? 'No data' : ctx.raw); } } }
      },
      scales: { y: { title: { display: true, text: 'Avg NPS' }, min: -15, max: 105 } }
    }
  });

  // Coffee timing mix: turns cumulative speed percentages into actionable buckets.
  function timingBucketAvg(month, bucket) {
    var rows = rowsForMonth(month);
    var vals = rows.map(function (r) {
      var s2 = typeof r.s2 === 'number' && !isNaN(r.s2) ? r.s2 : null;
      var s3 = typeof r.s3 === 'number' && !isNaN(r.s3) ? r.s3 : null;
      var s4 = typeof r.s4 === 'number' && !isNaN(r.s4) ? r.s4 : null;
      var o5 = typeof r.o5 === 'number' && !isNaN(r.o5) ? r.o5 : null;
      if (s2 === null || s3 === null || s4 === null || o5 === null) return null;
      if (bucket === 'under2') return Math.max(0, Math.min(100, s2));
      if (bucket === 'twoToThree') return Math.max(0, s3 - s2);
      if (bucket === 'threeToFour') return Math.max(0, s4 - s3);
      if (bucket === 'fourToFive') return Math.max(0, 100 - s4 - o5);
      if (bucket === 'overFive') return Math.max(0, o5);
      return null;
    }).filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    return vals.length ? round1OrNull(vals.reduce(function (a, v) { return a + v; }, 0) / vals.length) : null;
  }
  var customerEfficiency = RM.map(function (m) { return round1OrNull(avgDefined(rowsForMonth(m), 'ef')); });
  G.makeChart('trendWaitPressure', {
    type: 'bar',
    data: {
      labels: RM,
      datasets: [
        { label: '<2 min', data: RM.map(function (m) { return timingBucketAvg(m, 'under2'); }), backgroundColor: 'rgba(29, 158, 92,0.72)', borderColor: '#1D9E5C', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '2-3 min', data: RM.map(function (m) { return timingBucketAvg(m, 'twoToThree'); }), backgroundColor: 'rgba(30, 112, 196,0.42)', borderColor: '#1E70C4', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '3-4 min', data: RM.map(function (m) { return timingBucketAvg(m, 'threeToFour'); }), backgroundColor: 'rgba(201, 127, 18,0.48)', borderColor: '#C97F12', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '4-5 min', data: RM.map(function (m) { return timingBucketAvg(m, 'fourToFive'); }), backgroundColor: 'rgba(146, 137, 120,0.38)', borderColor: '#928978', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '>5 min', data: RM.map(function (m) { return timingBucketAvg(m, 'overFive'); }), backgroundColor: 'rgba(178, 42, 36,0.65)', borderColor: '#B22A24', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { type: 'line', label: 'Overall Efficiency (customer-rated)', data: customerEfficiency, borderColor: '#221F1A', backgroundColor: 'rgba(34, 31, 26,0.12)', tension: 0.3, pointRadius: 4, borderWidth: 2.5, yAxisID: 'y1' }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              if (ctx.raw === null) return ctx.dataset.label + ': No data';
              return ctx.dataset.label + ': ' + round1OrNull(ctx.raw) + '%';
            }
          }
        }
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          title: { display: true, text: '% of Drinks by Timing Band' },
          min: 0,
          max: 100
        },
        y1: {
          title: { display: true, text: 'Overall Efficiency % (customer-rated)' },
          position: 'right',
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100
        }
      }
    }
  });

  // Absolute CEI band distribution over time
  var absBandDs = G.ABS_BAND_NAMES.map(function (bn) { return { label: bn, data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.filter(function (r) { return r.acb === bn; }).length / mr.length * 100 : 0; }), backgroundColor: G.ABSCOL[bn] + 'cc', borderColor: G.ABSCOL[bn], borderWidth: 1 }; });
  G.makeChart('trendAbsBands', { type: 'bar', data: { labels: RM, datasets: absBandDs }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '% of Bakeries' }, max: 100 } } } });

  // Coffee Efficiency (ts === s2) and the Over 5 Min % series are not charted
  // separately here — both are already shown as bands of the Coffee Timing Mix
  // chart above, which also covers the 2-3, 3-4 and 4-5 minute middle.

  // Bakery tracker
  (function renderBakeryTracker() {
    var trackerStatusEl = document.getElementById('bakeryTrackerStatus');
    var trackerCanvas = document.getElementById('bakeryTracker');
    var trackerTableEl = document.getElementById('bakeryTrackerTable');
    var selectedBakeries = Array.isArray(state.searchBakery) ? state.searchBakery.slice() : [];
    var scopedRows = state.ALL.filter(function (r) {
      if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(r.b))) return false;
      if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(r.b))) return false;
      if (state.bandFilter) { var _bf = state.bandFilter; if (_bf.indexOf('abs:') === 0) { if (r.acb !== _bf.slice(4)) return false; } else { if (r.cb !== _bf) return false; } }
      if (selectedBakeries.length && selectedBakeries.indexOf(r.b) === -1) return false;
      return true;
    });
    var benchmarkRows = state.ALL.filter(function (r) {
      if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(r.b))) return false;
      if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(r.b))) return false;
      if (state.bandFilter) { var _bf = state.bandFilter; if (_bf.indexOf('abs:') === 0) { if (r.acb !== _bf.slice(4)) return false; } else { if (r.cb !== _bf) return false; } }
      return true;
    });
    var isSingleBakery = selectedBakeries.length === 1;

    function clearTracker(statusText) {
      G.destroyChart('bakeryTracker');
      if (trackerCanvas) {
        var ctx = trackerCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, trackerCanvas.width || 0, trackerCanvas.height || 0);
      }
      if (trackerTableEl) trackerTableEl.innerHTML = '';
      if (trackerStatusEl) {
        trackerStatusEl.textContent = statusText;
        trackerStatusEl.className = 'status';
      }
    }

    function round1(value) {
      return Math.round(value * 10) / 10;
    }

    function formatValue(value, suffix) {
      return value === null || value === undefined ? '\u2014' : value.toFixed(1) + (suffix || '');
    }

    if (!scopedRows.length) {
      clearTracker('No tracker data is available for the current filters.');
      return;
    }

    var scopeLabel = selectedBakeries.length
      ? (selectedBakeries.length === 1 ? selectedBakeries[0] : selectedBakeries.length + ' selected bakeries')
      : 'All bakeries';
    var trackerRows = RM.map(function (m) {
      var scopedMonthRows = scopedRows.filter(function (r) { return r.m === m; });
      var benchmarkMonthRows = benchmarkRows.filter(function (r) { return r.m === m; });
      if (!scopedMonthRows.length) {
        return {
          month: m,
          n: null,
          ac: null,
          v: null,
          benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
        };
      }

      if (isSingleBakery) {
        return {
          month: m,
          n: scopedMonthRows[0].n,
          ac: scopedMonthRows[0].ac,
          v: scopedMonthRows[0].v,
          benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
        };
      }

      return {
        month: m,
        n: round1(avg(scopedMonthRows, 'n')),
        ac: round1(avg(scopedMonthRows, 'ac')),
        v: Math.round(scopedMonthRows.reduce(function (total, row) { return total + row.v; }, 0)),
        benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
      };
    });
    var trackerNps = trackerRows.map(function (row) { return row.n; });
    var trackerAbsCei = trackerRows.map(function (row) { return row.ac; });
    var benchmarkNps = selectedBakeries.length
      ? trackerRows.map(function (row) { return row.benchmarkNps; })
      : null;
    var trackerTableRows = trackerRows.filter(function (row) {
      return row.n !== null || row.ac !== null || row.v !== null;
    });

    if (trackerStatusEl) {
      trackerStatusEl.textContent = isSingleBakery
        ? 'Showing monthly datapoints for ' + scopeLabel + '.'
        : selectedBakeries.length
          ? 'Showing combined monthly averages for ' + scopeLabel + '.'
          : 'Showing all-bakeries monthly averages.';
      trackerStatusEl.className = 'status success';
    }

    if (trackerTableEl) {
      var tableTitle = isSingleBakery
        ? scopeLabel + ' Monthly Performance'
        : selectedBakeries.length
          ? 'Combined Monthly Performance for ' + scopeLabel
          : 'All Bakeries Monthly Average Performance';
      var tableDescription = isSingleBakery
        ? 'Actual monthly datapoints for ' + scopeLabel + ', with all-bakeries average NPS (Drink + Meal) shown for context.'
        : selectedBakeries.length
          ? 'Monthly average scores across the selected bakeries, with all-bakeries average NPS (Drink + Meal) shown for context.'
          : 'Monthly average scores across every bakery in the current filter scope.';
      trackerTableEl.innerHTML = trackerTableRows.length
        ? '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">'
        + tableTitle
        + '</h3><p class="tracker-table-header__copy">'
        + tableDescription
        + '</p></div></div><div class="table-wrap table-wrap--floating"><table><thead><tr><th>Month</th><th>NPS (D+M)</th><th>Benchmark Score</th><th>Responses</th>' + (selectedBakeries.length ? '<th>All Bakeries Avg NPS (D+M)</th>' : '') + '</tr></thead><tbody>' +
        trackerTableRows.slice().reverse().map(function (row) {
          return '<tr>'
            + '<td>' + row.month + '</td>'
            + '<td>' + formatValue(row.n) + '</td>'
            + '<td>' + formatValue(row.ac) + '</td>'
            + '<td>' + (row.v === null || row.v === undefined ? '\u2014' : row.v) + '</td>'
            + (selectedBakeries.length ? '<td>' + formatValue(row.benchmarkNps) + '</td>' : '')
            + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '';
      G.makeSortable(trackerTableEl);
    }

    G.makeChart('bakeryTracker', {
      type: 'line', data: {
        labels: RM, datasets: [
          { label: scopeLabel + (isSingleBakery ? ' NPS (D+M)' : ' Avg NPS (D+M)'), data: trackerNps, borderColor: G.COL['Top Performance'], tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
          { label: scopeLabel + (isSingleBakery ? ' Benchmark Score' : ' Avg Benchmark Score'), data: trackerAbsCei, borderColor: '#6B4FA8', tension: 0.3, pointRadius: 4, borderWidth: 2, borderDash: [6, 3] }
        ].concat(selectedBakeries.length ? [
          { label: 'All Bakeries Avg NPS (D+M)', data: benchmarkNps, borderColor: 'rgba(146, 137, 120,0.5)', borderDash: [5, 5], tension: 0.3, pointRadius: 0, borderWidth: 1.5 }
        ] : [])
      }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: 'Score' }, min: 0, max: 110 } } }
    });
  }());

  return { RM: RM, trendNPS: trendNPS };
};

// ========== RENDER SPEED vs NPS CHARTS ==========
window.GAILS.renderSpeedCharts = function (data) {
  var G = GAILS;
  var avg = G.avg;
  var n = data.length;

  document.getElementById('speedSampleVal').textContent = n;

  // Shared rich tooltip for the scatter charts: bakery name + connected stats for that site.
  // (Chart.js v4 passes the context as the callback's first argument.)
  var num = function (v) { return (v === undefined || v === null || isNaN(v)) ? '—' : v; };
  var scatterTip = {
    displayColors: false,
    callbacks: {
      title: function (items) {
        var it = items && items[0];
        if (!it || it.datasetIndex === 1) return '';
        var b = data[it.dataIndex];
        return b ? b.b : '';
      },
      label: function (ctx) {
        if (ctx.datasetIndex === 1) return '';
        var b = data[ctx.dataIndex];
        if (!b) return '';
        var lines = [
          'NPS (D+M): ' + num(b.n),
          'Coffee Efficiency (<2 min): ' + num(b.s2) + '%',
          'Customer-Rated Efficiency: ' + num(b.ef) + '%',
          'Friendliness: ' + num(b.fr) + '%',
          'Drink Quality: ' + num(b.dr) + '%',
          'Overall CX: ' + num(b.ov) + '%'
        ];
        if (b.v !== undefined && b.v !== null) lines.push('Reviews: ' + b.v);
        return lines;
      }
    }
  };

  var xSm = avg(data, 's2'), ySm = avg(data, 'n');
  var sNum = 0, sDen = 0; data.forEach(function (b) { sNum += (b.s2 - xSm) * (b.n - ySm); sDen += (b.s2 - xSm) ** 2; });
  var sSlope = sDen ? sNum / sDen : 0, sInt = ySm - sSlope * xSm;
  G.makeChart('speedVsNps', {
    type: 'scatter', data: {
      datasets: [
        { data: data.map(function (b) { return { x: b.s2, y: b.n }; }), backgroundColor: 'rgba(178, 42, 36,0.35)', borderColor: 'rgba(178, 42, 36,0.2)', pointRadius: 3.5, borderWidth: 1 },
        { type: 'line', data: [{ x: 35, y: sSlope * 35 + sInt }, { x: 95, y: sSlope * 95 + sInt }], borderColor: '#B22A24', borderWidth: 2.5, borderDash: [6, 4], pointRadius: 0 }
      ]
    }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: scatterTip }, scales: { x: { title: { display: true, text: 'Coffee Speed (% within 2 min)', font: { weight: 'bold' } }, min: 35, max: 95 }, y: { title: { display: true, text: 'NPS (D+M)', font: { weight: 'bold' } }, min: -15, max: 105 } } }
  });

  var xEm = avg(data, 'ef');
  var eNum = 0, eDen = 0; data.forEach(function (b) { eNum += (b.ef - xEm) * (b.n - ySm); eDen += (b.ef - xEm) ** 2; });
  var eSlope = eDen ? eNum / eDen : 0, eInt = ySm - eSlope * xEm;
  G.makeChart('effVsNps', {
    type: 'scatter', data: {
      datasets: [
        { data: data.map(function (b) { return { x: b.ef, y: b.n }; }), backgroundColor: 'rgba(26, 123, 104,0.3)', borderColor: 'rgba(26, 123, 104,0.15)', pointRadius: 3.5, borderWidth: 1 },
        { type: 'line', data: [{ x: 35, y: eSlope * 35 + eInt }, { x: 102, y: eSlope * 102 + eInt }], borderColor: '#1A7B68', borderWidth: 2.5, pointRadius: 0 }
      ]
    }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: scatterTip }, scales: { x: { title: { display: true, text: 'Customer-Rated Overall Efficiency %', font: { weight: 'bold' } }, min: 35, max: 102 }, y: { title: { display: true, text: 'NPS (D+M)', font: { weight: 'bold' } }, min: -15, max: 105 } } }
  });

  // Quartile compare
  var bySpd = [].concat(data).sort(function (a, b) { return a.s2 - b.s2; });
  var byEff = [].concat(data).sort(function (a, b) { return a.ef - b.ef; });
  var q = Math.floor(n / 4);
  var sqNPS = [bySpd.slice(0, q), bySpd.slice(q, 2 * q), bySpd.slice(2 * q, 3 * q), bySpd.slice(3 * q)].map(function (g) { return avg(g, 'n'); });
  var eqNPS = [byEff.slice(0, q), byEff.slice(q, 2 * q), byEff.slice(2 * q, 3 * q), byEff.slice(3 * q)].map(function (g) { return avg(g, 'n'); });
  G.makeChart('quartileCompare', {
    type: 'bar', data: {
      labels: ['Lowest 25%', 'Below Avg', 'Above Avg', 'Highest 25%'], datasets: [
        { label: 'By Coffee Speed', data: sqNPS, backgroundColor: 'rgba(178, 42, 36,0.28)', borderColor: '#B22A24', borderWidth: 2, borderRadius: 6 },
        { label: 'By Customer-Rated Efficiency', data: eqNPS, backgroundColor: 'rgba(26, 123, 104,0.28)', borderColor: '#1A7B68', borderWidth: 2, borderRadius: 6 }
      ]
    }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11, weight: 'bold' } } } }, scales: { y: { title: { display: true, text: 'Avg NPS (D+M)', font: { weight: 'bold' } }, suggestedMin: 0, suggestedMax: 90 }, x: { title: { display: true, text: 'Quartile (worst \u2192 best)', font: { weight: 'bold' } } } } }
  });

  document.getElementById('speedGapVal').textContent = Math.round(Math.abs(sqNPS[3] - sqNPS[0])) + ' pts';
  document.getElementById('effGapVal').textContent = Math.round(Math.abs(eqNPS[3] - eqNPS[0])) + ' pts';

  // R² comparison
  var corr = function (k) { var xm = avg(data, k), ym = avg(data, 'n'); var num = 0, xd = 0, yd = 0; data.forEach(function (b) { num += (b[k] - xm) * (b.n - ym); xd += (b[k] - xm) ** 2; yd += (b.n - ym) ** 2; }); return xd && yd ? (num * num) / (xd * yd) * 100 : 0; };
  var formatR2 = function (value) { return (Math.round(value * 10) / 10).toFixed(1) + '%'; };
  document.getElementById('speedR2Val').textContent = formatR2(corr('s2'));
  document.getElementById('effR2Val').textContent = formatR2(corr('ef'));
  var metrics = [
    { name: 'Within 2 min', r2: corr('s2'), t: 'speed' }, { name: 'Within 3 min', r2: corr('s3'), t: 'speed' },
    { name: 'Over 5 min', r2: corr('o5'), t: 'speed' },
    { name: 'Friendliness', r2: corr('fr'), t: 'cx' }, { name: 'Drink Quality', r2: corr('dr'), t: 'cx' },
    { name: 'Overall Efficiency', r2: corr('ef'), t: 'cx' }, { name: 'Overall CX', r2: corr('ov'), t: 'cx' }
  ];
  metrics.sort(function (a, b) { return a.r2 - b.r2; });
  G.makeChart('corrCompare', { type: 'bar', data: { labels: metrics.map(function (m) { return m.name; }), datasets: [{ data: metrics.map(function (m) { return Math.round(m.r2 * 10) / 10; }), backgroundColor: metrics.map(function (m) { return m.t === 'speed' ? 'rgba(178, 42, 36,0.42)' : 'rgba(26, 123, 104,0.42)'; }), borderColor: metrics.map(function (m) { return m.t === 'speed' ? '#B22A24' : '#1A7B68'; }), borderWidth: 2, borderRadius: 5 }] }, options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.raw + '% of NPS (D+M) explained'; } } } }, scales: { x: { title: { display: true, text: '% of NPS (D+M) Variance Explained (R\u00B2)', font: { weight: 'bold' } }, min: 0 }, y: { ticks: { font: { size: 11, weight: 'bold' } } } } } });
};

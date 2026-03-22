// ========== TARGETS MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.renderTargets = function(data) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var targets = [].concat(data).filter(function(b) { return b.cb === 'Needs Attention' || b.cb === 'Developing'; }).sort(function(a, b) { return a.c - b.c; });
  var needsAttn = targets.filter(function(b) { return b.cb === 'Needs Attention'; });
  var developing = targets.filter(function(b) { return b.cb === 'Developing'; });

  document.getElementById('targetSummary').innerHTML = [
    { v: needsAttn.length, l: 'Needs Attention', col: 'var(--red)', bg: '#fce4ec' },
    { v: developing.length, l: 'Developing', col: 'var(--amber)', bg: '#fff8e1' },
    { v: targets.length, l: 'Total Targeted', col: 'var(--accent)', bg: '#fdf8f3' },
    { v: targets.length ? avg(targets, 'c').toFixed(1) : '—', l: 'Avg CEI (Targeted)', col: 'var(--accent)', bg: '#f5f0eb' },
  ].map(function(k) { return '<div style="background:' + k.bg + ';border-radius:8px;padding:12px;text-align:center;border:1px solid var(--border)"><div style="font-size:1.5rem;font-weight:700;color:' + k.col + '">' + k.v + '</div><div style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-top:2px">' + k.l + '</div></div>'; }).join('');

  _renderInsights(targets);
  _renderTargetTable(targets);
  _renderTargetTrends(targets, data);
};

function _renderInsights(targets) {
  var G = GAILS;
  var insightsEl = document.getElementById('targetInsights');
  if (targets.length === 0) { insightsEl.innerHTML = ''; return; }

  var focusCounts = { 'Overall Efficiency': [], 'Drink Quality': [], Friendliness: [], 'Barista Speed': [] };
  targets.forEach(function(b) {
    var areas = [
      { name: 'Overall Efficiency', pct: b.ep }, { name: 'Drink Quality', pct: b.dp },
      { name: 'Friendliness', pct: b.fp }, { name: 'Barista Speed', pct: b.ap },
    ].sort(function(a, x) { return a.pct - x.pct; });
    focusCounts[areas[0].name].push(b.b);
  });
  var topWeakness = Object.entries(focusCounts).sort(function(a, b) { return b[1].length - a[1].length; })[0];

  var quickWins = targets.filter(function(b) { return b.cb === 'Developing' && b.c >= 40; });

  var mgrCounts = {};
  targets.forEach(function(b) {
    var mgr = G.getBakeryOps(b.b);
    if (!mgrCounts[mgr]) mgrCounts[mgr] = { na: 0, dev: 0, bakeries: [] };
    if (b.cb === 'Needs Attention') mgrCounts[mgr].na++; else mgrCounts[mgr].dev++;
    mgrCounts[mgr].bakeries.push(b.b);
  });
  var mgrSorted = Object.entries(mgrCounts).sort(function(a, b) { return (b[1].na + b[1].dev) - (a[1].na + a[1].dev); });

  var coachingTips = {
    'Overall Efficiency': 'Customers feel the service is slow or disorganised. Review front-of-house workflow: are team members positioned well? Is there a clear hand-off between till and bar? Consider mystery visits to observe the customer journey.',
    'Drink Quality': 'Drinks are not meeting customer expectations. Check machine calibration, grind settings, and milk technique. Arrange a barista refresher session and taste-test drinks during a quiet period.',
    'Friendliness': 'Customers are not feeling welcomed or valued. Focus on eye contact, greeting every customer, and using names where possible. Role-play exercises during team briefings can help build confidence.',
    'Barista Speed': 'Too many drinks are taking over 5 minutes. Look at ticket management \u2014 are drinks being made in order? Are completed drinks being called out promptly? Check if peak-hour staffing levels are adequate.',
  };

  var h = '<h3 style="font-size:0.9rem;font-weight:600;color:var(--accent);margin:16px 0 10px">Actionable Insights</h3><div class="insight-grid">';

  h += '<div class="insight-card"><h4>\u26A0\uFE0F Biggest Shared Weakness</h4><p><span class="stat">' + topWeakness[1].length + ' of ' + targets.length + '</span> target bakeries are being dragged down most by <strong>' + topWeakness[0] + '</strong>.</p><p>' + coachingTips[topWeakness[0]] + '</p><div class="action">\u2192 Prioritise ' + topWeakness[0].toLowerCase() + ' coaching across these ' + topWeakness[1].length + ' bakeries</div></div>';

  h += '<div class="insight-card"><h4>\u2B50 Quick Wins &mdash; Close to &ldquo;Good&rdquo; Band</h4>';
  if (quickWins.length > 0) {
    h += '<p><span class="stat">' + quickWins.length + '</span> baker' + (quickWins.length === 1 ? 'y is' : 'ies are') + ' in the Developing band with a CEI of 40+. A small improvement could push them into the <strong>Good</strong> band (50+).</p><ul>' + quickWins.map(function(b) { return '<li><strong>' + b.b + '</strong> &mdash; CEI ' + b.c + '</li>'; }).join('') + '</ul><div class="action">\u2192 Give these bakeries targeted attention for the fastest results</div>';
  } else {
    h += '<p style="color:var(--muted)">No bakeries are currently close enough to the Good band for a quick turnaround. Focus efforts on the highest-priority bakeries in the table below.</p>';
  }
  h += '</div>';

  h += '<div class="insight-card"><h4>\u{1F464} Ops Manager Workload</h4><p>Managers with the most target bakeries may need additional support or resource.</p>';
  mgrSorted.slice(0, 5).forEach(function(entry) {
    var mgr = entry[0], info = entry[1];
    var naTag = info.na > 0 ? '<span style="color:var(--red);font-weight:600">' + info.na + ' Needs Attention</span>' : '';
    var devTag = info.dev > 0 ? '<span style="color:var(--amber);font-weight:600">' + info.dev + ' Developing</span>' : '';
    var sep = info.na > 0 && info.dev > 0 ? ' + ' : '';
    h += '<div class="mgr-row"><span style="font-weight:500">' + mgr + '</span><span>' + naTag + sep + devTag + '</span></div>';
  });
  if (mgrSorted.length > 0 && mgrSorted[0][1].na >= 3) {
    h += '<div class="action">\u2192 Consider pairing ' + mgrSorted[0][0] + ' with a support partner</div>';
  }
  h += '</div>';

  var weakAreas = Object.entries(focusCounts).filter(function(e) { return e[1].length > 0; }).sort(function(a, b) { return b[1].length - a[1].length; });
  h += '<div class="insight-card"><h4>\u{1F4CB} Coaching Priorities by Area</h4><p>Across all target bakeries, here is where coaching is needed most:</p>';
  weakAreas.forEach(function(entry) {
    h += '<p style="margin-top:8px"><strong>' + entry[0] + '</strong> <span style="color:var(--muted);font-size:0.7rem">(' + entry[1].length + ' baker' + (entry[1].length === 1 ? 'y' : 'ies') + ')</span></p><p style="font-size:0.72rem;color:var(--muted)">' + coachingTips[entry[0]] + '</p>';
  });
  h += '</div></div>';
  insightsEl.innerHTML = h;
}

function _renderTargetTable(targets) {
  var G = GAILS;
  var getFocus = function(b) {
    return [
      { name: 'Overall Efficiency', pct: b.ep }, { name: 'Drink Quality', pct: b.dp },
      { name: 'Friendliness', pct: b.fp }, { name: 'Barista Speed', pct: b.ap },
    ].sort(function(a, x) { return a.pct - x.pct; })[0];
  };
  var focusLabel = function(pct) {
    if (pct <= 10) return 'amongst the lowest of all bakeries';
    if (pct <= 25) return 'well below most bakeries';
    return 'below the bakery average';
  };

  document.getElementById('targetTable').innerHTML = targets.length === 0
    ? '<p style="text-align:center;color:var(--muted);padding:32px 0">No bakeries in Needs Attention or Developing bands for this period.</p>'
    : '<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Bakery</th><th>Region</th><th>Ops Manager</th><th>CEI</th><th>Abs CEI</th><th>Band</th><th>NPS</th><th>Vol</th><th>Conf</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>Barista Speed</th><th>&gt;5m</th><th>Where to Focus</th></tr></thead><tbody>' +
    targets.map(function(b, i) {
      var focus = getFocus(b);
      var focusColor = focus.pct <= 10 ? 'var(--red)' : 'var(--amber)';
      var confTag = b.co === 'Low' ? ' <span style="font-size:0.58rem;color:var(--red);font-weight:600">LOW VOL</span>' : '';
      return '<tr>' +
        '<td style="font-weight:700;color:' + (b.cb === 'Needs Attention' ? 'var(--red)' : 'var(--amber)') + '">P' + (i + 1) + '</td>' +
        '<td style="font-weight:500">' + b.b + confTag + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b.c + '</td>' +
        '<td style="font-weight:600">' + b.ac + '</td>' +
        '<td><span class="band ' + G.bc(b.cb) + '">' + b.cb + '</span></td>' +
        '<td>' + b.n + '</td><td>' + b.v + '</td>' +
        '<td><span class="conf ' + b.co + '">' + b.co + '</span></td>' +
        '<td style="color:' + (b.dp < 25 ? 'var(--red)' : 'inherit') + '">' + b.dr + '%</td>' +
        '<td style="color:' + (b.ep < 25 ? 'var(--red)' : 'inherit') + '">' + b.ef + '%</td>' +
        '<td style="color:' + (b.fp < 25 ? 'var(--red)' : 'inherit') + '">' + b.fr + '%</td>' +
        '<td style="color:' + (b.ap < 25 ? 'var(--red)' : 'inherit') + '">' + b.ts + '</td>' +
        '<td style="color:' + (b.o5 > 4 ? 'var(--red)' : b.o5 > 2.5 ? 'var(--amber)' : 'inherit') + '">' + b.o5 + '%</td>' +
        '<td style="font-weight:600;color:' + focusColor + '">' + focus.name + ' &mdash; ' + focusLabel(focus.pct) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTable'));
}

function _renderTargetTrends(targets, data) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var trendSection = document.getElementById('targetTrendSection');
  if (targets.length === 0 || state.MONTHS.length < 2) { trendSection.style.display = 'none'; return; }

  trendSection.style.display = '';
  var targetNames = targets.map(function(b) { return b.b; });
  var FM = G.getRollingMonths();
  var THRESHOLD = 3;

  var histories = {};
  targetNames.forEach(function(name) {
    histories[name] = FM.map(function(m) { return state.ALL.find(function(r) { return r.b === name && r.m === m; }) || null; });
  });

  var trendData = targetNames.map(function(name) {
    var hist = histories[name];
    var valid = hist.filter(function(r) { return r !== null; });
    var latest = valid.length > 0 ? valid[valid.length - 1] : null;
    var prev = valid.length > 1 ? valid[valid.length - 2] : null;
    var threePrev = valid.length > 2 ? valid[valid.length - 3] : null;

    var direction = 'new', ceiChange = 0, npsChange = 0;
    if (latest && prev) {
      ceiChange = latest.c - prev.c; npsChange = latest.n - prev.n;
      direction = ceiChange >= THRESHOLD ? 'up' : ceiChange <= -THRESHOLD ? 'down' : 'flat';
    }
    var trend3m = 'new', cei3mChange = 0;
    if (latest && threePrev) { cei3mChange = latest.c - threePrev.c; trend3m = cei3mChange >= THRESHOLD ? 'up' : cei3mChange <= -THRESHOLD ? 'down' : 'flat'; }
    else if (latest && prev) { trend3m = direction; cei3mChange = ceiChange; }

    var streak = 0;
    for (var i = valid.length - 1; i >= 1; i--) { if (valid[i].c < valid[i - 1].c - 1) streak++; else break; }

    var best = null, worst = null;
    valid.forEach(function(r) { if (!best || r.c > best.c) best = r; if (!worst || r.c < worst.c) worst = r; });

    var first = valid.length > 0 ? valid[0] : null;
    var periodChange = 0;
    if (latest && first && latest !== first) periodChange = latest.c - first.c;

    var compTrends = {};
    if (latest && prev) {
      compTrends.drink = latest.dr - prev.dr; compTrends.efficiency = latest.ef - prev.ef;
      compTrends.friendliness = latest.fr - prev.fr; compTrends.timeliness = prev.o5 - latest.o5;
    }
    return { name: name, hist: hist, valid: valid, latest: latest, prev: prev, direction: direction, ceiChange: ceiChange, npsChange: npsChange, trend3m: trend3m, cei3mChange: cei3mChange, streak: streak, best: best, worst: worst, compTrends: compTrends, monthsTracked: valid.length, periodChange: periodChange };
  });

  var improving = trendData.filter(function(t) { return t.direction === 'up'; });
  var declining = trendData.filter(function(t) { return t.direction === 'down'; });
  var stable = trendData.filter(function(t) { return t.direction === 'flat'; });
  var chronic = trendData.filter(function(t) { return t.streak >= 3; });

  document.getElementById('trendSummaryCards').innerHTML = [
    { v: improving.length, l: 'Improving', col: 'var(--green)', bg: '#e8f5e9' },
    { v: stable.length, l: 'Stable', col: 'var(--muted)', bg: '#f5f0eb' },
    { v: declining.length, l: 'Declining', col: 'var(--red)', bg: '#fce4ec' },
    { v: chronic.length, l: 'Declining 3+ Months', col: '#7b1fa2', bg: '#f3e5f5' },
  ].map(function(k) { return '<div style="background:' + k.bg + ';border-radius:8px;padding:12px;text-align:center;border:1px solid var(--border)"><div style="font-size:1.5rem;font-weight:700;color:' + k.col + '">' + k.v + '</div><div style="font-size:0.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;margin-top:2px">' + k.l + '</div></div>'; }).join('');

  var targetAvgByMonth = FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m && targetNames.includes(r.b); }); return recs.length ? recs.reduce(function(a, r) { return a + r.c; }, 0) / recs.length : null; });
  var allAvgByMonth = FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m; }); return recs.length ? recs.reduce(function(a, r) { return a + r.c; }, 0) / recs.length : null; });

  G.makeChart('targetAvgTrend', { type: 'line', data: { labels: FM, datasets: [
    { label: 'Target Bakeries Avg CEI', data: targetAvgByMonth, borderColor: '#c62828', backgroundColor: '#c6282822', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
    { label: 'All Bakeries Avg CEI', data: allAvgByMonth, borderColor: '#9e9e9e', backgroundColor: '#9e9e9e11', fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2, borderDash: [6, 4] },
  ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: 'Avg CEI' }, min: 0, max: 100 }, x: { ticks: { font: { size: 10 } } } } } });

  var bandNames2 = ['Needs Attention', 'Developing', 'Good', 'Excellent'];
  G.makeChart('targetBandFlow', { type: 'bar', data: { labels: FM, datasets: bandNames2.map(function(bn) { return { label: bn, data: FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m && targetNames.includes(r.b); }); return recs.length ? recs.filter(function(r) { return r.cb === bn; }).length : 0; }), backgroundColor: G.COL[bn] + 'cc', borderColor: G.COL[bn], borderWidth: 1 }; }) }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' } } } } });

  // Sparkline cards
  var sparkGrid = document.getElementById('sparklineGrid');
  trendData.forEach(function(t) { G.destroyChart('spark_' + t.name); });
  sparkGrid.innerHTML = '';
  var sparkSorted = [].concat(trendData).sort(function(a, b) { return (a.latest ? a.latest.c : 999) - (b.latest ? b.latest.c : 999); });
  sparkSorted.forEach(function(t) {
    var card = document.createElement('div');
    var dirClass = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'down' : t.direction === 'flat' ? 'flat' : 'new-entry';
    var dirLabel = t.direction === 'up' ? '\u2191 Improving' : t.direction === 'down' ? '\u2193 Declining' : t.direction === 'flat' ? '\u2194 Stable' : 'New';
    var ceiNow = t.latest ? t.latest.c : '\u2014';
    var bandNow = t.latest ? t.latest.cb : '\u2014';
    var changeText = t.ceiChange !== 0 ? (t.ceiChange > 0 ? '+' : '') + t.ceiChange.toFixed(1) : '';
    var periodText = t.periodChange !== 0 ? (t.periodChange > 0 ? '+' : '') + t.periodChange.toFixed(1) + ' over period' : '';

    card.style.cssText = 'background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 12px;';
    if (t.streak >= 3) card.style.borderColor = '#7b1fa2';
    else if (t.direction === 'down') card.style.borderColor = '#c62828';

    card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><div><span style="font-weight:600;font-size:0.8rem">' + t.name + '</span><span style="font-size:0.66rem;color:var(--muted);margin-left:4px">' + G.getBakeryOps(t.name) + '</span></div><span class="dir ' + dirClass + '" style="font-size:0.64rem">' + dirLabel + '</span></div><div style="display:flex;gap:12px;align-items:center;margin-bottom:6px;flex-wrap:wrap"><div><span style="font-size:1.2rem;font-weight:700">' + ceiNow + '</span> <span style="font-size:0.66rem;color:var(--muted)">CEI</span></div><span class="band ' + G.bc(bandNow) + '" style="font-size:0.6rem">' + bandNow + '</span>' + (changeText ? '<span style="font-size:0.72rem;font-weight:600;color:' + (t.ceiChange > 0 ? 'var(--green)' : 'var(--red)') + '">' + changeText + ' m/m</span>' : '') + (periodText ? '<span style="font-size:0.64rem;color:' + (t.periodChange > 0 ? 'var(--green)' : 'var(--red)') + '">' + periodText + '</span>' : '') + (t.streak >= 2 ? '<span style="font-size:0.64rem;color:#7b1fa2;font-weight:600">\u2193' + t.streak + ' months</span>' : '') + '</div><canvas id="spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_') + '" height="50"></canvas>';
    sparkGrid.appendChild(card);

    var canvasId = 'spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_');
    var lineColor = t.direction === 'up' ? '#2e7d32' : t.direction === 'down' ? '#c62828' : '#8b4513';
    new Chart(document.getElementById(canvasId), {
      type: 'line', data: { labels: FM, datasets: [
        { data: t.hist.map(function(r) { return r ? r.c : null; }), borderColor: lineColor, backgroundColor: lineColor + '18', fill: true, tension: 0.3, pointRadius: 1.5, borderWidth: 2, spanGaps: true },
        { data: allAvgByMonth, borderColor: '#ccc', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 }
      ] }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { title: function(items) { return items[0].label; }, label: function(ctx) { return ctx.datasetIndex === 0 ? 'CEI: ' + ctx.raw : 'Avg: ' + (ctx.raw ? ctx.raw.toFixed(1) : ''); } } } }, scales: { y: { display: false, min: 0, max: 100 }, x: { display: false } }, maintainAspectRatio: false }
    });
  });

  // Momentum chart
  if (FM.length >= 3) {
    var momentumData = FM.slice(1).map(function(m, mi) {
      var prevMonth = FM[mi]; var up = 0, down = 0, flat = 0;
      targetNames.forEach(function(name) {
        var curr = state.ALL.find(function(r) { return r.b === name && r.m === m; });
        var prev = state.ALL.find(function(r) { return r.b === name && r.m === prevMonth; });
        if (curr && prev) { var diff = curr.c - prev.c; if (diff >= THRESHOLD) up++; else if (diff <= -THRESHOLD) down++; else flat++; }
      });
      return { m: m, up: up, down: down, flat: flat };
    });
    G.makeChart('targetMomentumChart', { type: 'bar', data: { labels: momentumData.map(function(d) { return d.m; }), datasets: [
      { label: 'Improving', data: momentumData.map(function(d) { return d.up; }), backgroundColor: '#2e7d32aa', borderRadius: 3 },
      { label: 'Stable', data: momentumData.map(function(d) { return d.flat; }), backgroundColor: '#9e9e9eaa', borderRadius: 3 },
      { label: 'Declining', data: momentumData.map(function(d) { return -d.down; }), backgroundColor: '#c62828aa', borderRadius: 3 },
    ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' }, ticks: { callback: function(v) { return Math.abs(v); } } } } } });
  }

  // Helpers
  var dirIcon = function(dir) {
    if (dir === 'up') return '<span class="dir up">&uarr; Improving</span>';
    if (dir === 'down') return '<span class="dir down">&darr; Declining</span>';
    if (dir === 'flat') return '<span class="dir flat">&harr; Stable</span>';
    return '<span class="dir new-entry">New</span>';
  };
  var changeStr = function(val) {
    if (val === 0) return '\u2014';
    var sign = val > 0 ? '+' : '';
    var col = val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--muted)';
    return '<span style="color:' + col + ';font-weight:600">' + sign + val.toFixed(1) + '</span>';
  };

  trendData.sort(function(a, b) { var order = { down: 0, flat: 1, up: 2, new: 3 }; if (order[a.direction] !== order[b.direction]) return order[a.direction] - order[b.direction]; return a.ceiChange - b.ceiChange; });

  var latestMonth = FM.length > 0 ? FM[FM.length - 1] : '—';
  var prevMonth = FM.length > 1 ? FM[FM.length - 2] : '—';
  var threeAgoMonth = FM.length > 2 ? FM[FM.length - 3] : (FM.length > 1 ? FM[FM.length - 2] : '—');
  var firstMonth = FM.length > 0 ? FM[0] : '—';

  document.getElementById('targetTrendTable').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Bakery</th><th>Ops Manager</th><th>CEI (' + latestMonth + ')</th><th>CEI Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Direction<br><span style="font-weight:400;font-size:0.6rem">Month-on-Month</span></th><th>NPS Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>3-Month Trend<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>3m CEI Change<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>Period Change<br><span style="font-weight:400;font-size:0.6rem">' + firstMonth + ' &rarr; ' + latestMonth + '</span></th><th>Declining Streak</th><th>Best Month</th><th>Worst Month</th><th>Quality &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Efficiency &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Friendliness &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Barista Speed &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th></tr></thead><tbody>' +
  trendData.map(function(t) {
    var streakWarn = t.streak >= 3 ? 'color:#7b1fa2;font-weight:700' : t.streak >= 2 ? 'color:var(--red);font-weight:600' : '';
    return '<tr><td style="font-weight:500">' + t.name + '</td><td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(t.name) + '</td><td style="font-weight:700">' + (t.latest ? t.latest.c : '\u2014') + '</td><td>' + changeStr(t.ceiChange) + '</td><td>' + dirIcon(t.direction) + '</td><td>' + changeStr(t.npsChange) + '</td><td>' + dirIcon(t.trend3m) + '</td><td>' + changeStr(t.cei3mChange) + '</td><td>' + changeStr(t.periodChange) + '</td><td style="' + streakWarn + '">' + (t.streak > 0 ? t.streak + ' month' + (t.streak > 1 ? 's' : '') : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.best ? t.best.m + ' (' + t.best.c + ')' : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.worst ? t.worst.m + ' (' + t.worst.c + ')' : '\u2014') + '</td><td>' + (t.compTrends.drink !== undefined ? changeStr(t.compTrends.drink) : '\u2014') + '</td><td>' + (t.compTrends.efficiency !== undefined ? changeStr(t.compTrends.efficiency) : '\u2014') + '</td><td>' + (t.compTrends.friendliness !== undefined ? changeStr(t.compTrends.friendliness) : '\u2014') + '</td><td>' + (t.compTrends.timeliness !== undefined ? changeStr(t.compTrends.timeliness) : '\u2014') + '</td></tr>';
  }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTrendTable'));
}

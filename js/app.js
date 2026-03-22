// ========== MAIN APPLICATION ENTRY POINT ==========
(function() {
  var G = GAILS;
  var state = G.state;

  // ========== REFRESH ==========
  function refresh() {
    if (state.ALL.length === 0) return;
    var data = G.getData();
    var n = data.length;
    if (n === 0) return;

    var periodLabel = state.selectedMonths.length === 1 ? state.selectedMonths[0] : state.selectedMonths.length + ' months';

    // KPIs
    document.getElementById('kpis').innerHTML = [
      { v: n, l: 'Bakeries' },
      { v: G.avg(data, 'n').toFixed(1), l: 'Avg NPS' },
      { v: G.avg(data, 'c').toFixed(1), l: 'Avg CEI (Relative)', h: true },
      { v: G.avg(data, 'ac').toFixed(1), l: 'Avg CEI (Absolute)', h: true },
      { v: G.avg(data, 'dr').toFixed(1) + '%', l: 'Avg Quality' },
      { v: G.avg(data, 'ef').toFixed(1) + '%', l: 'Avg Overall Efficiency' },
      { v: G.avg(data, 'fr').toFixed(1) + '%', l: 'Avg Friendly' },
      { v: G.avg(data, 'ts').toFixed(1), l: 'Avg Barista Speed' },
      { v: G.avg(data, 'o5').toFixed(1) + '%', l: 'Avg >5min' },
      { v: periodLabel, l: 'Period' },
    ].map(function(k) { return '<div class="kpi' + (k.h ? ' hl' : '') + '"><div class="value">' + k.v + '</div><div class="label">' + k.l + '</div></div>'; }).join('');

    G.renderOverviewCharts(data);
    G.renderTrendCharts(data);
    G.renderSpeedCharts(data);
    G.renderLeagueTable(data);
    G.renderTargets(data);
  }

  // ========== INITIALISE DASHBOARD ==========
  function initDashboard(records, months) {
    state.ALL = records;
    state.MONTHS = months;
    state.BAKERIES = [...new Set(records.map(function(r) { return r.b; }))].sort();
    state.PERIODS = G.buildPeriods(months);

    var initRolling = parseInt(document.getElementById('rollingWindow').value, 10);
    if (initRolling > 0 && initRolling < months.length) {
      state.selectedMonths = months.slice(-initRolling);
    } else {
      state.selectedMonths = [months[months.length - 1]];
    }

    var first = months[0], last = months[months.length - 1];
    document.getElementById('headerSub').textContent = first + ' \u2013 ' + last + ' \u00B7 ' + state.BAKERIES.length + ' bakeries \u00B7 CEI v4.1';

    var mSel = document.getElementById('monthSelect');
    mSel.innerHTML = '<option value="">\u2014 Select \u2014</option>';
    months.forEach(function(m) { var o = document.createElement('option'); o.value = m; o.textContent = m; mSel.appendChild(o); });
    if (initRolling > 0) { mSel.value = ''; } else { mSel.value = months[months.length - 1]; }

    var regSel = document.getElementById('regionFilter');
    regSel.innerHTML = '<option value="">All Regions</option>';
    var regions = [...new Set(Object.values(G.BAKERY_META).map(function(v) { return v.r; }))].sort();
    regions.forEach(function(r) { var o = document.createElement('option'); o.value = r; o.textContent = r; regSel.appendChild(o); });

    G.populateOpsFilter('');
    G.buildPeriodButtons(state.PERIODS, refresh);

    document.getElementById('uploadZone').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';

    refresh();
  }

  // ========== EVENT LISTENERS ==========
  document.getElementById('monthSelect').addEventListener('change', function() {
    if (this.value) {
      state.selectedMonths = [this.value];
      document.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
      document.getElementById('rollingWindow').value = '0';
      refresh();
    }
  });

  document.getElementById('bakerySearch').addEventListener('input', function(e) { state.searchBakery = e.target.value.toLowerCase(); refresh(); });
  document.getElementById('bandFilter').addEventListener('change', function(e) { state.bandFilter = e.target.value; refresh(); });
  document.getElementById('regionFilter').addEventListener('change', function(e) { state.regionFilter = e.target.value; G.populateOpsFilter(state.regionFilter); refresh(); });
  document.getElementById('opsFilter').addEventListener('change', function(e) { state.opsFilter = e.target.value; refresh(); });
  document.getElementById('sortBy').addEventListener('change', refresh);

  document.getElementById('rollingWindow').addEventListener('change', function() {
    var val = parseInt(this.value, 10);
    if (val > 0) {
      state.selectedMonths = state.MONTHS.slice(-val);
      document.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
      document.getElementById('monthSelect').value = '';
    }
    refresh();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(function(t) {
    t.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(function(x) { x.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(x) { x.classList.remove('active'); });
      t.classList.add('active');
      document.getElementById('tab-' + t.dataset.tab).classList.add('active');
    });
  });

  // ========== INITIALISE FILE UPLOAD ==========
  G.initUpload(initDashboard);
})();

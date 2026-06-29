// ========== MAIN APPLICATION ENTRY POINT ==========
(function() {
  var G = GAILS;
  var state = G.state;
  var dashboardWorkspaceShell = document.getElementById('dashboardWorkspaceShell');
  var dashboardSidebarToggleBtn = document.getElementById('dashboardSidebarToggle');
  var dashboardSidebarToggleLabel = document.querySelector('[data-dashboard-sidebar-toggle-label]');
  var dashboardSidebarOpenBtn = document.getElementById('dashboardSidebarOpen');
  var dashboardSidebarBackdrop = document.getElementById('dashboardSidebarBackdrop');
  var dashboardActiveViewLabel = document.getElementById('dashboardActiveViewLabel');
  var dashboardKpiRow = document.getElementById('kpis');
  var sectionPageTitle = document.getElementById('sectionPageTitle');
  var compactDashboardSidebarMedia = window.matchMedia('(max-width: 980px)');
  var desktopDashboardSidebarCollapsed = false;
  var _networkMapMetric = 'relative';
  var dashboardTabLabels = {
    overview: 'Overview',
    trends: 'Trends',
    table: 'League Table',
    map: 'Map',
    target: 'Focus Bakeries',
    speed: 'Speed vs NPS',
    cei: 'Coffee Experience Index Methodology',
    feedback: 'Customer Feedback'
  };
  var dashboardTabsWithKpis = {
    overview: true
  };

  function formatSelectedPeriod() {
    var selectedMonths = state.selectedMonths || [];
    var count = selectedMonths.length;
    if (count === 0) return 'No period selected';
    if (count === 1) return selectedMonths[0];
    return selectedMonths[0] + ' \u2013 ' + selectedMonths[count - 1];
  }

  function updateHeaderSummary(bakeryCount) {
    var bakeryLabel = bakeryCount === 1 ? '1 bakery' : bakeryCount + ' bakeries';
    document.getElementById('headerSub').textContent = formatSelectedPeriod() + ' \u00B7 ' + bakeryLabel + ' \u00B7 Index v4.1';
  }

  function rebuildRegionFilter() {
    if (G.rebuildRegionMultiselect) G.rebuildRegionMultiselect();
    if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
  }

  function resizeChartsSoon(container) {
    if (!container || !G.resizeChartsIn) return;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        G.resizeChartsIn(container);
      });
    });
  }

  function updateDashboardActiveIndex(name) {
    var container = document.getElementById('dashboardActiveIndexContainer');
    var label = document.getElementById('dashboardActiveIndexLabel');
    if (!container || !label) return;

    var currentTab = name;
    if (!currentTab) {
      var activePanel = document.querySelector('.tab-content.active');
      currentTab = activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview';
    }

    if (currentTab === 'overview') {
      container.style.display = '';
      label.textContent = state.rankingsMetric === 'absolute' ? 'Absolute Score' : 'Relative Score';
    } else if (currentTab === 'target') {
      container.style.display = '';
      label.textContent = state.targetMetric === 'absolute' ? 'Absolute Score' : 'Relative Score';
    } else if (currentTab === 'map') {
      container.style.display = '';
      label.textContent = _networkMapMetric === 'absolute' ? 'Absolute Score' : 'Relative Score';
    } else if (currentTab === 'table' || currentTab === 'trends' || currentTab === 'speed') {
      container.style.display = '';
      label.textContent = 'Relative & Absolute';
    } else {
      container.style.display = 'none';
    }
  }

  function updateDashboardActiveView(name) {
    if (dashboardActiveViewLabel) {
      dashboardActiveViewLabel.textContent = dashboardTabLabels[name] || name;
    }
    if (sectionPageTitle) {
      sectionPageTitle.textContent = dashboardTabLabels[name] || name;
    }
    updateDashboardActiveIndex(name);
  }

  function syncDashboardKpis(name) {
    if (!dashboardKpiRow) return;
    var activeTabName = name;
    if (!activeTabName) {
      var activePanel = document.querySelector('.tab-content.active');
      activeTabName = activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview';
    }
    var shouldShow = !!dashboardTabsWithKpis[activeTabName];

    dashboardKpiRow.hidden = !shouldShow;
    dashboardKpiRow.setAttribute('aria-hidden', String(!shouldShow));
    dashboardKpiRow.style.display = shouldShow ? '' : 'none';
  }

  function syncDashboardSidebarControls() {
    if (!dashboardWorkspaceShell) return;
    var isCompact = compactDashboardSidebarMedia.matches;
    var isOpen = dashboardWorkspaceShell.dataset.sidebarOpen === 'true';
    var isCollapsed = dashboardWorkspaceShell.dataset.sidebarCollapsed === 'true';

    if (dashboardSidebarToggleBtn) {
      dashboardSidebarToggleBtn.setAttribute('aria-expanded', String(isCompact ? isOpen : !isCollapsed));
      dashboardSidebarToggleBtn.setAttribute('aria-label', isCompact ? 'Close menu' : (isCollapsed ? 'Expand menu' : 'Collapse menu'));
    }
    if (dashboardSidebarToggleLabel) {
      dashboardSidebarToggleLabel.textContent = isCompact ? 'Close' : (isCollapsed ? 'Expand' : 'Collapse');
    }
    if (dashboardSidebarOpenBtn) {
      dashboardSidebarOpenBtn.setAttribute('aria-expanded', String(isCompact && isOpen));
    }
    if (dashboardSidebarBackdrop) {
      dashboardSidebarBackdrop.hidden = !(isCompact && isOpen);
    }
  }

  function setDashboardSidebarOpen(open) {
    if (!dashboardWorkspaceShell) return;
    dashboardWorkspaceShell.dataset.sidebarOpen = open ? 'true' : 'false';
    syncDashboardSidebarControls();
  }

  function setDashboardSidebarCollapsed(collapsed) {
    if (!dashboardWorkspaceShell) return;
    desktopDashboardSidebarCollapsed = !!collapsed;
    dashboardWorkspaceShell.dataset.sidebarCollapsed = desktopDashboardSidebarCollapsed ? 'true' : 'false';
    syncDashboardSidebarControls();
  }

  function syncDashboardSidebarForViewport() {
    if (!dashboardWorkspaceShell) return;
    if (compactDashboardSidebarMedia.matches) {
      dashboardWorkspaceShell.dataset.sidebarCollapsed = 'false';
      setDashboardSidebarOpen(false);
      return;
    }
    dashboardWorkspaceShell.dataset.sidebarOpen = 'true';
    setDashboardSidebarCollapsed(desktopDashboardSidebarCollapsed);
  }

  function activateTargetSubtab(name) {
    var workspace = document.getElementById('targetTabWorkspace');
    if (!workspace) return;
    workspace.querySelectorAll('.target-subtab').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.targetSubtab === name);
    });
    workspace.querySelectorAll('.target-subtab-panel').forEach(function(panel) {
      panel.classList.toggle('active', panel.dataset.targetSubtabPanel === name);
    });
    if (name === 'map') {
      requestAnimationFrame(function() {
        requestAnimationFrame(function() { G.initTargetMap(); });
      });
    } else if (name === 'feedback') {
      G.fetchTargetWordCloud();
    } else {
      var activePanel = workspace.querySelector('.target-subtab-panel.active');
      if (activePanel && G.resizeChartsIn) G.resizeChartsIn(activePanel);
    }
  }

  function initDashboardMapSoon() {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() { G.initDashboardMap(); });
    });
  }

  function animateScrollToTop() {
    var startY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (startY <= 0) return;

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      window.scrollTo(0, 0);
      return;
    }

    var duration = 550;
    var startTime = null;

    function easeOutCubic(progress) {
      return 1 - Math.pow(1 - progress, 3);
    }

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      var nextY = Math.round(startY * (1 - easeOutCubic(progress)));

      window.scrollTo(0, nextY);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }

    requestAnimationFrame(step);
  }

  function activateDashboardTab(name) {
    var activePanel = document.getElementById('tab-' + name);
    if (!activePanel) return null;

    document.querySelectorAll('.tab').forEach(function(tab) {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.dashboard-footer__link').forEach(function(link) {
      link.classList.toggle('active', link.dataset.footerTab === name);
    });
    document.querySelectorAll('.tab-content').forEach(function(panel) {
      panel.classList.toggle('active', panel === activePanel);
    });
    updateDashboardActiveView(name);
    syncDashboardKpis(name);

    if (compactDashboardSidebarMedia.matches) {
      setDashboardSidebarOpen(false);
    }

    if (name === 'map') {
      initDashboardMapSoon();
      return activePanel;
    }

    if (name === 'feedback') {
      if (!G.wordCloudInited) {
        G.wordCloudInited = true;
        requestAnimationFrame(function() { G.initWordCloud(); });
      } else {
        requestAnimationFrame(function() { G.fetchWordCloud(); });
      }
      return activePanel;
    }

    if (name === 'trends' && G._trendsNeedRender) {
      G._trendsNeedRender = false;
      requestAnimationFrame(function() {
        if (G._lastData) G.renderTrendCharts(G._lastData);
      });
      return activePanel;
    }

    resizeChartsSoon(activePanel);
    if (name === 'target') {
      var activeSubtab = activePanel.querySelector('.target-subtab-panel.active');
      if (activeSubtab && activeSubtab.dataset.targetSubtabPanel === 'map') {
        requestAnimationFrame(function() {
          requestAnimationFrame(function() { G.initTargetMap(); });
        });
      } else {
        resizeChartsSoon(activeSubtab);
      }
    }

    return activePanel;
  }

  // ========== KPI DELTA & GAP HELPERS ==========

  function getPriorAvgs() {
    var sel = state.selectedMonths;
    var all = state.MONTHS;
    if (!sel || sel.length === 0 || all.length === 0) return null;
    var indices = sel.map(function(m) { return all.indexOf(m); }).filter(function(i) { return i >= 0; });
    if (indices.length === 0) return null;
    indices.sort(function(a, b) { return a - b; });
    var firstIdx = indices[0];
    var n = indices.length;
    if (firstIdx < n) return null;
    var priorMonths = all.slice(firstIdx - n, firstIdx);
    var recs = state.ALL.filter(function(r) { return priorMonths.indexOf(r.m) >= 0; });
    if (state.regionFilter.length) recs = recs.filter(function(r) { return state.regionFilter.indexOf(G.getBakeryRegion(r.b)) >= 0; });
    if (state.opsFilter.length) recs = recs.filter(function(r) { return state.opsFilter.indexOf(G.getBakeryOps(r.b)) >= 0; });
    if (state.searchBakery && state.searchBakery.length) recs = recs.filter(function(r) {
      return state.searchBakery.some(function(s) { return r.b.toLowerCase().indexOf(s.toLowerCase()) >= 0; });
    });
    if (recs.length === 0) return null;
    var avg = function(key) { return recs.reduce(function(a, r) { return a + (r[key] || 0); }, 0) / recs.length; };
    var tsVol = recs.reduce(function(a, r) { return a + r.v; }, 0);
    var label = n === 1 ? priorMonths[0] : 'prior ' + n + 'm';
    return {
      n: avg('n'), c: avg('c'), ac: avg('ac'),
      dr: avg('dr'), ef: avg('ef'), fr: avg('fr'),
      ts: tsVol > 0 ? recs.reduce(function(a, r) { return a + (r.ts || 0) * r.v; }, 0) / tsVol : avg('ts'),
      o5: avg('o5'),
      label: label
    };
  }

  function kpiDeltaHtml(current, priorObj, key, invert) {
    if (!priorObj || priorObj[key] === undefined || isNaN(priorObj[key])) return '';
    var prior = priorObj[key];
    var raw = current - prior;
    var effective = invert ? -raw : raw;
    var abs = Math.abs(raw);
    var ref = '<span class="kpi__delta-ref">vs ' + priorObj.label + '</span>';
    if (abs < 0.3) return '<span class="kpi__delta kpi__delta--flat">— flat ' + ref + '</span>';
    var arrow = raw > 0 ? '↑' : '↓';
    var cls = effective > 0 ? 'kpi__delta--up' : 'kpi__delta--down';
    return '<span class="kpi__delta ' + cls + '">' + arrow + ' ' + abs.toFixed(1) + ' ' + ref + '</span>';
  }

  function kpiGapText(val, gapMetric) {
    if (!gapMetric) return '';
    var r = Math.round(val);
    var gap, next;
    if (gapMetric === 'nps') {
      if (val < 45)      { gap = 45 - r; next = 'Watch'; }
      else if (val < 55) { gap = 55 - r; next = 'On Target'; }
      else if (val <= 60){ gap = 61 - r; next = 'Exceeding'; }
      else return '';
      return gap + ' pts from ' + next;
    }
    if (gapMetric === 'cei') {
      if (val < 25)      { gap = 25 - r; next = 'Developing'; }
      else if (val < 50) { gap = 50 - r; next = 'Good'; }
      else if (val < 75) { gap = 75 - r; next = 'Excellent'; }
      else return '';
      return gap + ' pts from ' + next;
    }
    if (gapMetric === 'acei') {
      if (val < 60)      { gap = 60 - r; next = 'Approaching'; }
      else if (val < 75) { gap = 75 - r; next = 'Meeting'; }
      else if (val < 90) { gap = 90 - r; next = 'Exceeding'; }
      else return '';
      return gap + ' pts from ' + next;
    }
    if (gapMetric === 'pct90') {
      if (val < 90) return (90 - r) + '% below target';
      return '';
    }
    if (gapMetric === 'ts') {
      if (val < 75) return (75 - r) + ' pts from target';
      return '';
    }
    if (gapMetric === 'o5') {
      var disp = parseFloat(val.toFixed(1));
      if (disp > 2) return '+' + (disp - 2).toFixed(1) + '% above target';
      return '';
    }
    return '';
  }

  // ========== REFRESH ==========
  function refresh() {
    if (state.ALL.length === 0) return;
    updateDashboardActiveIndex();
    updateBandFilterOptions();
    var data = G.getData();
    var n = data.length;
    updateHeaderSummary(n);
    G.storeDashboardMapData(data);
    if (n === 0) {
      G.renderTargets([]);
      return;
    }

    // KPI cards pair each metric with a compact status so the row scans quickly.
    var metricState = function(val, good, warn, invert, labels, bands) {
      if (Array.isArray(bands) && bands.length) {
        for (var i = 0; i < bands.length; i++) {
          var band = bands[i];
          if (typeof band.test === 'function' && band.test(val)) {
            return { tone: band.tone, status: band.status };
          }
        }
      }
      var tone = invert
        ? (val <= good ? 'kpi-green' : val <= warn ? 'kpi-amber' : 'kpi-red')
        : (val >= good ? 'kpi-green' : val >= warn ? 'kpi-amber' : 'kpi-red');
      var status = tone === 'kpi-green' ? labels.good : tone === 'kpi-amber' ? labels.warn : labels.bad;
      return { tone: tone, status: status };
    };
    var prior = getPriorAvgs();
    var buildMetricCard = function(config) {
      var cmpVal = config.compare != null ? config.compare : config.value;
      var status = metricState(cmpVal, config.good, config.warn, config.invert, config.labels, config.bands);
      return {
        value: config.display,
        eyebrow: config.eyebrow,
        title: config.title,
        meta: config.meta,
        delta: kpiDeltaHtml(config.value, prior, config.priorKey, config.invert),
        gap: kpiGapText(config.value, config.gapMetric),
        tone: status.tone,
        status: status.status,
        primary: !!config.primary
      };
    };
    var nps  = G.avg(data, 'n');
    var cei  = G.avg(data, 'c');
    var acei = G.avg(data, 'ac');
    var dr   = G.avg(data, 'dr');
    var ef   = G.avg(data, 'ef');
    var fr   = G.avg(data, 'fr');
    var _tsVol = data.reduce(function(a, r) { return a + r.v; }, 0);
    var ts   = _tsVol > 0 ? data.reduce(function(a, r) { return a + r.ts * r.v; }, 0) / _tsVol : 0;
    var o5   = G.avg(data, 'o5');
    dashboardKpiRow.innerHTML = [
      buildMetricCard({
        value: nps,
        compare: Math.round(nps),
        display: Math.round(nps).toString(),
        eyebrow: 'NPS',
        title: 'Net Promoter Score',
        meta: 'Customer advocacy score.',
        priorKey: 'n',
        gapMetric: 'nps',
        bands: [
          { test: function(val) { return val < 45; }, tone: 'kpi-red', status: 'Below' },
          { test: function(val) { return val < 55; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function(val) { return val <= 60; }, tone: 'kpi-blue', status: 'On Target' },
          { test: function(val) { return val > 60; }, tone: 'kpi-green', status: 'Exceeding' }
        ],
        labels: { good: 'Exceeding', warn: 'Watch', bad: 'Below' },
        primary: true
      }),
      buildMetricCard({
        value: cei,
        compare: Math.round(cei),
        display: Math.round(cei).toString(),
        eyebrow: 'Index',
        title: 'Relative Score',
        meta: 'Vs bakery peer set.',
        priorKey: 'c',
        gapMetric: 'cei',
        good: 62.5,
        warn: 37.5,
        labels: { good: 'Leading', warn: 'Mid-Pack', bad: 'Lagging' },
        primary: true
      }),
      buildMetricCard({
        value: acei,
        compare: Math.round(acei),
        display: Math.round(acei).toString(),
        eyebrow: 'Index',
        title: 'Absolute Score',
        meta: 'Vs company benchmark.',
        priorKey: 'ac',
        gapMetric: 'acei',
        good: 75,
        warn: 60,
        labels: { good: 'On Target', warn: 'Near', bad: 'Below' },
        primary: true
      }),
      buildMetricCard({
        value: dr,
        compare: Math.round(dr),
        display: Math.round(dr) + '%',
        eyebrow: 'SHINE',
        title: 'Drink Quality',
        meta: 'Target: 90% positive.',
        priorKey: 'dr',
        gapMetric: 'pct90',
        good: 90,
        warn: 80,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: ef,
        compare: Math.round(ef),
        display: Math.round(ef) + '%',
        eyebrow: 'SHINE',
        title: 'Efficiency',
        meta: 'Target: 90% positive.',
        priorKey: 'ef',
        gapMetric: 'pct90',
        good: 90,
        warn: 80,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: fr,
        compare: Math.round(fr),
        display: Math.round(fr) + '%',
        eyebrow: 'SHINE',
        title: 'Friendliness',
        meta: 'Target: 90% positive.',
        priorKey: 'fr',
        gapMetric: 'pct90',
        good: 90,
        warn: 80,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: ts,
        compare: Math.round(ts),
        display: Math.round(ts).toString(),
        eyebrow: 'Speed',
        title: 'KV Link Times',
        meta: '100% under 5 min. Target: 75+.',
        priorKey: 'ts',
        gapMetric: 'ts',
        good: 75,
        warn: 50,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Slow' }
      }),
      buildMetricCard({
        value: o5,
        display: o5.toFixed(1) + '%',
        eyebrow: 'Speed',
        title: 'Orders >5 Min',
        meta: 'Target: below 2%.',
        priorKey: 'o5',
        gapMetric: 'o5',
        good: 2,
        warn: 3,
        invert: true,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Slow' }
      })
    ].map(function(metric) {
      return '<article class="kpi ' + metric.tone + (metric.primary ? ' kpi--primary' : '') + '">'
        + '<div class="kpi__top">'
        + '<span class="kpi__eyebrow">' + metric.eyebrow + '</span>'
        + '<span class="kpi__status">' + metric.status + '</span>'
        + '</div>'
        + '<div class="kpi__value">' + metric.value + '</div>'
        + '<div class="kpi__title">' + metric.title + '</div>'
        + (metric.delta ? metric.delta : '')
        + '<div class="kpi__meta">' + metric.meta + (metric.gap ? '<span class="kpi__gap">' + metric.gap + '</span>' : '') + '</div>'
        + '</article>';
    }).join('');

    G.renderOverviewCharts(data);
    G._lastData = data;
    var trendsPanel = document.getElementById('tab-trends');
    if (trendsPanel && trendsPanel.classList.contains('active')) {
      G.renderTrendCharts(data);
      G._trendsNeedRender = false;
    } else {
      G._trendsNeedRender = true;
    }
    G.renderSpeedCharts(data);
    G.renderLeagueTable(data);
    G.renderTargets(data);

    // Word clouds — only call when their panel is visible; fetch functions handle cache
    var feedbackTab = document.getElementById('tab-feedback');
    if (feedbackTab && feedbackTab.classList.contains('active')) G.fetchWordCloud();
    var targetFeedbackPanel = document.querySelector('[data-target-subtab-panel="feedback"]');
    if (targetFeedbackPanel && targetFeedbackPanel.classList.contains('active')) G.fetchTargetWordCloud();
  }

  // ========== INITIALISE DASHBOARD ==========
  function initDashboard(records, months) {
    state.ALL = records;
    state.MONTHS = months;
    state.BAKERIES = [...new Set(records.map(function(r) { return r.b; }))].sort();
    state.PERIODS = G.buildPeriods(months);

    var initRolling = parseInt(document.getElementById('rollingWindow').value, 10);
    if (initRolling > 0) {
      state.selectedMonths = months.slice(-Math.min(initRolling, months.length));
    } else {
      state.selectedMonths = [].concat(months);
    }

    var mSel = document.getElementById('monthSelect');
    mSel.innerHTML = '<option value="">\u2014 Select \u2014</option>';
    [].concat(months).reverse().forEach(function(m) {
      var o = document.createElement('option');
      o.value = m;
      o.textContent = m;
      mSel.appendChild(o);
    });
    mSel.value = '';
    G.syncCustomSelect(mSel);

    rebuildRegionFilter();

    document.getElementById('uploadZone').style.display = 'none';
    document.getElementById('dashboardContent').style.display = 'block';

    refresh();
  }

  // ========== EVENT LISTENERS ==========
  document.getElementById('monthSelect').addEventListener('change', function() {
    if (this.value) {
      state.selectedMonths = [this.value];
      document.getElementById('rollingWindow').value = '0';
      G.syncCustomSelect('rollingWindow');
      refresh();
    }
  });

  // ========== GLOBAL INDEX TYPE TOGGLE (header) ==========
  _networkMapMetric = 'relative';
  Array.from(document.querySelectorAll('[data-global-index]')).forEach(function(btn) {
    btn.addEventListener('click', function() {
      var nextMetric = btn.dataset.globalIndex === 'absolute' ? 'absolute' : 'relative';
      if (state.indexType === nextMetric) return;
      state.indexType = nextMetric;
      state.rankingsMetric = nextMetric;
      state.targetMetric = nextMetric;
      _networkMapMetric = nextMetric;
      Array.from(document.querySelectorAll('[data-global-index]')).forEach(function(toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.globalIndex === nextMetric);
      });
      if (G.setNetworkMapMetric) G.setNetworkMapMetric(nextMetric);
      if (G.setTargetMapMetric) G.setTargetMapMetric(nextMetric);
      updateDashboardActiveIndex();
      refresh();
    });
  });

  // ========== NETWORK MAP AREA TOGGLE ==========
  var _networkMapArea = 'off';
  Array.from(document.querySelectorAll('[data-map-area]')).forEach(function(btn) {
    btn.addEventListener('click', function() {
      var nextArea = btn.dataset.mapArea === 'on' ? 'on' : 'off';
      if (_networkMapArea === nextArea) return;
      _networkMapArea = nextArea;
      Array.from(document.querySelectorAll('[data-map-area]')).forEach(function(toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.mapArea === nextArea);
      });
      if (G.setNetworkMapArea) G.setNetworkMapArea(nextArea);
    });
  });

  // ========== TARGET MAP AREA TOGGLE ==========
  var _targetMapArea = 'off';
  Array.from(document.querySelectorAll('[data-target-map-area]')).forEach(function(btn) {
    btn.addEventListener('click', function() {
      var nextArea = btn.dataset.targetMapArea === 'on' ? 'on' : 'off';
      if (_targetMapArea === nextArea) return;
      _targetMapArea = nextArea;
      Array.from(document.querySelectorAll('[data-target-map-area]')).forEach(function(toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.targetMapArea === nextArea);
      });
      if (G.setTargetMapArea) G.setTargetMapArea(nextArea);
    });
  });

  // ========== BAKERY MULTI-SELECT ==========
  (function() {
    var selected = state.searchBakery;
    var msTrigger = document.getElementById('bakeryMsTrigger');
    var msLabel = document.getElementById('bakeryMsLabel');
    var msDropdown = document.getElementById('bakeryDropdown');
    var msList = document.getElementById('bakeryMsList');
    var msSearch = document.getElementById('bakerySearch');
    var msClearBtn = document.getElementById('bakeryClearBtn');
    var msContainer = document.getElementById('bakeryMultiselect');
    var msSelectedSection = document.getElementById('bakeryMsSelectedSection');
    var msSelectedChips = document.getElementById('bakeryMsChips');
    var msSelectedCount = document.getElementById('bakeryMsCount');
    var isOpen = false;

    function updateLabel() {
      if (!selected.length) { msLabel.textContent = 'All Bakeries'; }
      else if (selected.length === 1) { msLabel.textContent = selected[0]; }
      else { msLabel.textContent = selected.length + ' bakeries'; }
      msTrigger.classList.toggle('bakery-ms__trigger--active', selected.length > 0);
      msClearBtn.style.display = selected.length ? '' : 'none';
    }

    function renderSelected() {
      var sorted = selected.slice().sort();
      msSelectedSection.style.display = sorted.length ? '' : 'none';
      msSelectedCount.textContent = sorted.length;
      msSelectedChips.innerHTML = '';
      sorted.forEach(function(name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var lbl = document.createElement('span');
        lbl.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bakery-ms__sel-chip-remove';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.innerHTML = '&#x2715;';
        x.addEventListener('click', function(e) {
          e.stopPropagation();
          var idx = selected.indexOf(name);
          if (idx !== -1) selected.splice(idx, 1);
          renderSelected();
          renderList(msSearch.value);
          updateLabel();
          refresh();
        });
        chip.appendChild(lbl);
        chip.appendChild(x);
        msSelectedChips.appendChild(chip);
      });
    }

    function renderList(query) {
      var all = (state.BAKERIES || []).filter(function(b) {
        if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(b))) return false;
        if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(b))) return false;
        return true;
      });
      var q = (query || '').toLowerCase().trim();
      var visible = q ? all.filter(function(b) { return b.toLowerCase().includes(q); }) : all;
      msList.innerHTML = '';
      visible.forEach(function(name) {
        var isSel = selected.includes(name);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bakery-ms__option' + (isSel ? ' is-checked' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var txt = document.createElement('span');
        txt.textContent = name;
        btn.appendChild(box);
        btn.appendChild(txt);
        btn.addEventListener('click', function() { toggleBakery(name); });
        msList.appendChild(btn);
      });
    }

    function toggleBakery(name) {
      var idx = selected.indexOf(name);
      if (idx === -1) { selected.push(name); } else { selected.splice(idx, 1); }
      renderList(msSearch.value);
      renderSelected();
      updateLabel();
      refresh();
    }

    function openDropdown() {
      isOpen = true;
      msDropdown.style.display = 'block';
      msTrigger.setAttribute('aria-expanded', 'true');
      msTrigger.classList.add('is-open');
      msSearch.value = '';
      renderList('');
      renderSelected();
      msSearch.focus();
    }

    function closeDropdown() {
      isOpen = false;
      msDropdown.style.display = 'none';
      msTrigger.setAttribute('aria-expanded', 'false');
      msTrigger.classList.remove('is-open');
    }

    msTrigger.addEventListener('click', function() { isOpen ? closeDropdown() : openDropdown(); });
    msSearch.addEventListener('input', function() { renderList(this.value); });
    msClearBtn.addEventListener('click', function() {
      selected.splice(0, selected.length);
      updateLabel();
      if (isOpen) { renderList(msSearch.value); renderSelected(); }
      refresh();
    });
    document.addEventListener('click', function(e) {
      if (isOpen && !e.composedPath().some(function(el) { return el === msContainer; })) closeDropdown();
    });
    document.addEventListener('keydown', function(e) {
      if (isOpen && e.key === 'Escape') { closeDropdown(); msTrigger.focus(); }
    });

    updateLabel();

    G.resetBakeryMultiselect = function() {
      updateLabel();
      renderSelected();
      if (isOpen) renderList(msSearch.value);
    };
  })();
  function updateBandFilterOptions() {
    var bandFilterEl = document.getElementById('bandFilter');
    if (!bandFilterEl) return;

    // Snapshot original structure once
    if (!updateBandFilterOptions._orig) {
      updateBandFilterOptions._orig = Array.from(bandFilterEl.children).map(function(child) {
        if (child.tagName === 'OPTGROUP') {
          return { type: 'optgroup', label: child.label, options: Array.from(child.children).map(function(opt) { return { value: opt.value, text: opt.textContent }; }) };
        }
        return { type: 'option', value: child.value, text: child.textContent };
      });
    }

    var available = G.getAvailableBands();
    var currentValue = state.bandFilter;

    // Rebuild select from original structure, omitting unavailable options
    bandFilterEl.innerHTML = '';
    updateBandFilterOptions._orig.forEach(function(item) {
      if (item.type === 'option') {
        var opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.text;
        bandFilterEl.appendChild(opt);
      } else if (item.type === 'optgroup') {
        var visibleOpts = item.options.filter(function(o) {
          return o.value.indexOf('abs:') === 0
            ? available.absolute.has(o.value.slice(4))
            : available.relative.has(o.value);
        });
        if (!visibleOpts.length) return;
        var grp = document.createElement('optgroup');
        grp.label = item.label;
        visibleOpts.forEach(function(o) {
          var opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.text;
          grp.appendChild(opt);
        });
        bandFilterEl.appendChild(grp);
      }
    });

    // Reset to "All" only if the current selection is no longer in the available options
    var selectionExists = !currentValue || !!Array.from(bandFilterEl.options).find(function(o) { return o.value === currentValue; });
    if (!selectionExists) currentValue = '';
    state.bandFilter = currentValue;
    bandFilterEl.value = currentValue;

    if (bandFilterEl._customSelect) bandFilterEl._customSelect.rebuild();
  }

  document.getElementById('bandFilter').addEventListener('change', function(e) { state.bandFilter = e.target.value; refresh(); });

  // ========== REGION MULTI-SELECT ==========
  (function() {
    var selected = state.regionFilter;
    var msTrigger = document.getElementById('regionMsTrigger');
    var msLabel = document.getElementById('regionMsLabel');
    var msDropdown = document.getElementById('regionDropdown');
    var msList = document.getElementById('regionMsList');
    var msClearBtn = document.getElementById('regionClearBtn');
    var msContainer = document.getElementById('regionMultiselect');
    var msSelectedSection = document.getElementById('regionMsSelectedSection');
    var msSelectedChips = document.getElementById('regionMsChips');
    var msSelectedCount = document.getElementById('regionMsCount');
    var isOpen = false;
    var availableOptions = [];

    function updateLabel() {
      if (!selected.length) { msLabel.textContent = 'All Regions'; }
      else if (selected.length === 1) { msLabel.textContent = selected[0]; }
      else { msLabel.textContent = selected.length + ' regions'; }
      msTrigger.classList.toggle('bakery-ms__trigger--active', selected.length > 0);
      msClearBtn.style.display = selected.length ? '' : 'none';
    }

    function renderSelected() {
      var sorted = selected.slice().sort();
      msSelectedSection.style.display = sorted.length ? '' : 'none';
      msSelectedCount.textContent = sorted.length;
      msSelectedChips.innerHTML = '';
      sorted.forEach(function(name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var lbl = document.createElement('span');
        lbl.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bakery-ms__sel-chip-remove';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.innerHTML = '&#x2715;';
        x.addEventListener('click', function(e) {
          e.stopPropagation();
          var idx = selected.indexOf(name);
          if (idx !== -1) selected.splice(idx, 1);
          renderSelected();
          renderList();
          updateLabel();
          onRegionChange();
        });
        chip.appendChild(lbl);
        chip.appendChild(x);
        msSelectedChips.appendChild(chip);
      });
    }

    function renderList() {
      msList.innerHTML = '';
      availableOptions.forEach(function(name) {
        var isSel = selected.includes(name);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bakery-ms__option' + (isSel ? ' is-checked' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var txt = document.createElement('span');
        txt.textContent = name;
        btn.appendChild(box);
        btn.appendChild(txt);
        btn.addEventListener('click', function() { toggleRegion(name); });
        msList.appendChild(btn);
      });
    }

    function toggleRegion(name) {
      var idx = selected.indexOf(name);
      if (idx === -1) { selected.push(name); } else { selected.splice(idx, 1); }
      renderList();
      renderSelected();
      updateLabel();
      onRegionChange();
    }

    function onRegionChange() {
      if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
      // Remove selected bakeries that don't belong to the now-selected regions
      if (selected.length) {
        var removed = false;
        for (var i = state.searchBakery.length - 1; i >= 0; i--) {
          if (!selected.includes(G.getBakeryRegion(state.searchBakery[i]))) {
            state.searchBakery.splice(i, 1);
            removed = true;
          }
        }
        if (removed && G.resetBakeryMultiselect) G.resetBakeryMultiselect();
      }
      refresh();
    }

    function openDropdown() {
      isOpen = true;
      msDropdown.style.display = 'block';
      msTrigger.setAttribute('aria-expanded', 'true');
      msTrigger.classList.add('is-open');
      renderList();
      renderSelected();
    }

    function closeDropdown() {
      isOpen = false;
      msDropdown.style.display = 'none';
      msTrigger.setAttribute('aria-expanded', 'false');
      msTrigger.classList.remove('is-open');
    }

    msTrigger.addEventListener('click', function() { isOpen ? closeDropdown() : openDropdown(); });
    msClearBtn.addEventListener('click', function() {
      selected.splice(0, selected.length);
      updateLabel();
      if (isOpen) { renderList(); renderSelected(); }
      onRegionChange();
    });
    document.addEventListener('click', function(e) {
      if (isOpen && !e.composedPath().some(function(el) { return el === msContainer; })) closeDropdown();
    });
    document.addEventListener('keydown', function(e) {
      if (isOpen && e.key === 'Escape') { closeDropdown(); msTrigger.focus(); }
    });

    updateLabel();

    G.rebuildRegionMultiselect = function() {
      availableOptions = [...new Set(Object.values(G.BAKERY_META).map(function(v) { return v.r; }))].filter(Boolean).sort();
      for (var i = selected.length - 1; i >= 0; i--) {
        if (!availableOptions.includes(selected[i])) selected.splice(i, 1);
      }
      if (isOpen) renderList();
      updateLabel();
      renderSelected();
    };
  })();

  // ========== OPS MANAGER MULTI-SELECT ==========
  (function() {
    var selected = state.opsFilter;
    var msTrigger = document.getElementById('opsMsTrigger');
    var msLabel = document.getElementById('opsMsLabel');
    var msDropdown = document.getElementById('opsDropdown');
    var msList = document.getElementById('opsMsList');
    var msSearch = document.getElementById('opsSearch');
    var msClearBtn = document.getElementById('opsClearBtn');
    var msContainer = document.getElementById('opsMultiselect');
    var msSelectedSection = document.getElementById('opsMsSelectedSection');
    var msSelectedChips = document.getElementById('opsMsChips');
    var msSelectedCount = document.getElementById('opsMsCount');
    var isOpen = false;

    function getAvailableOps() {
      var regions = state.regionFilter;
      return [...new Set(Object.entries(G.BAKERY_META)
        .filter(function(e) { return !regions.length || regions.includes(e[1].r); })
        .map(function(e) { return e[1].o; })
      )].filter(Boolean).sort();
    }

    function updateLabel() {
      if (!selected.length) { msLabel.textContent = 'All Managers'; }
      else if (selected.length === 1) { msLabel.textContent = selected[0]; }
      else { msLabel.textContent = selected.length + ' managers'; }
      msTrigger.classList.toggle('bakery-ms__trigger--active', selected.length > 0);
      msClearBtn.style.display = selected.length ? '' : 'none';
    }

    function renderSelected() {
      var sorted = selected.slice().sort();
      msSelectedSection.style.display = sorted.length ? '' : 'none';
      msSelectedCount.textContent = sorted.length;
      msSelectedChips.innerHTML = '';
      sorted.forEach(function(name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var lbl = document.createElement('span');
        lbl.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bakery-ms__sel-chip-remove';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.innerHTML = '&#x2715;';
        x.addEventListener('click', function(e) {
          e.stopPropagation();
          var idx = selected.indexOf(name);
          if (idx !== -1) selected.splice(idx, 1);
          renderSelected();
          renderList(msSearch.value);
          updateLabel();
          onOpsChange();
        });
        chip.appendChild(lbl);
        chip.appendChild(x);
        msSelectedChips.appendChild(chip);
      });
    }

    function renderList(query) {
      var available = getAvailableOps();
      var q = (query || '').toLowerCase().trim();
      var visible = q ? available.filter(function(o) { return o.toLowerCase().includes(q); }) : available;
      msList.innerHTML = '';
      visible.forEach(function(name) {
        var isSel = selected.includes(name);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bakery-ms__option' + (isSel ? ' is-checked' : '');
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', isSel ? 'true' : 'false');
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var txt = document.createElement('span');
        txt.textContent = name;
        btn.appendChild(box);
        btn.appendChild(txt);
        btn.addEventListener('click', function() { toggleOps(name); });
        msList.appendChild(btn);
      });
    }

    function toggleOps(name) {
      var idx = selected.indexOf(name);
      if (idx === -1) { selected.push(name); } else { selected.splice(idx, 1); }
      renderList(msSearch.value);
      renderSelected();
      updateLabel();
      onOpsChange();
    }

    function onOpsChange() {
      state.searchBakery.splice(0, state.searchBakery.length);
      if (G.resetBakeryMultiselect) G.resetBakeryMultiselect();
      refresh();
    }

    function openDropdown() {
      isOpen = true;
      msDropdown.style.display = 'block';
      msTrigger.setAttribute('aria-expanded', 'true');
      msTrigger.classList.add('is-open');
      msSearch.value = '';
      renderList('');
      renderSelected();
      msSearch.focus();
    }

    function closeDropdown() {
      isOpen = false;
      msDropdown.style.display = 'none';
      msTrigger.setAttribute('aria-expanded', 'false');
      msTrigger.classList.remove('is-open');
    }

    msTrigger.addEventListener('click', function() { isOpen ? closeDropdown() : openDropdown(); });
    msSearch.addEventListener('input', function() { renderList(this.value); });
    msClearBtn.addEventListener('click', function() {
      selected.splice(0, selected.length);
      updateLabel();
      if (isOpen) { renderList(msSearch.value); renderSelected(); }
      onOpsChange();
    });
    document.addEventListener('click', function(e) {
      if (isOpen && !e.composedPath().some(function(el) { return el === msContainer; })) closeDropdown();
    });
    document.addEventListener('keydown', function(e) {
      if (isOpen && e.key === 'Escape') { closeDropdown(); msTrigger.focus(); }
    });

    updateLabel();

    G.rebuildOpsMultiselect = function() {
      var available = getAvailableOps();
      var prevLen = selected.length;
      for (var i = selected.length - 1; i >= 0; i--) {
        if (!available.includes(selected[i])) selected.splice(i, 1);
      }
      if (selected.length !== prevLen) {
        state.searchBakery.splice(0, state.searchBakery.length);
        if (G.resetBakeryMultiselect) G.resetBakeryMultiselect();
      }
      if (isOpen) renderList(msSearch.value);
      updateLabel();
      renderSelected();
    };
  })();
  document.getElementById('sortBy').addEventListener('change', refresh);

  document.getElementById('rollingWindow').addEventListener('change', function() {
    var val = parseInt(this.value, 10);
    if (val > 0) {
      state.selectedMonths = state.MONTHS.slice(-Math.min(val, state.MONTHS.length));
      document.getElementById('monthSelect').value = '';
      G.syncCustomSelect('monthSelect');
    } else {
      state.selectedMonths = [].concat(state.MONTHS);
      document.getElementById('monthSelect').value = '';
      G.syncCustomSelect('monthSelect');
    }
    refresh();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(function(t) {
    t.addEventListener('click', function() {
      activateDashboardTab(t.dataset.tab);
      if (window.matchMedia('(max-width: 980px)').matches) {
        animateScrollToTop();
      }
    });
  });

  if (dashboardSidebarToggleBtn) {
    dashboardSidebarToggleBtn.addEventListener('click', function() {
      if (compactDashboardSidebarMedia.matches) {
        setDashboardSidebarOpen(false);
        return;
      }
      setDashboardSidebarCollapsed(dashboardWorkspaceShell.dataset.sidebarCollapsed !== 'true');
    });
  }

  if (dashboardSidebarOpenBtn) {
    dashboardSidebarOpenBtn.addEventListener('click', function() {
      setDashboardSidebarOpen(true);
    });
  }

  if (dashboardSidebarBackdrop) {
    dashboardSidebarBackdrop.addEventListener('click', function() {
      setDashboardSidebarOpen(false);
    });
  }

  if (compactDashboardSidebarMedia && compactDashboardSidebarMedia.addEventListener) {
    compactDashboardSidebarMedia.addEventListener('change', function() {
      syncDashboardSidebarForViewport();
      syncDashboardKpis();
    });
  }

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && compactDashboardSidebarMedia.matches && dashboardWorkspaceShell && dashboardWorkspaceShell.dataset.sidebarOpen === 'true') {
      setDashboardSidebarOpen(false);
    }
  });

  document.querySelectorAll('.dashboard-footer__link').forEach(function(link) {
    link.addEventListener('click', function() {
      var activePanel = activateDashboardTab(link.dataset.footerTab);
      if (activePanel) {
        animateScrollToTop();
      }
    });
  });

  document.querySelectorAll('.target-subtab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      activateTargetSubtab(tab.dataset.targetSubtab);
      if (window.matchMedia('(max-width: 980px)').matches) {
        animateScrollToTop();
      }
    });
  });

  // ========== INITIALISE FILE UPLOAD ==========
  // ── Mobile filter side panel ──
  var filterControlsPanel = document.getElementById('filterControlsPanel');
  var filterActiveBadge   = document.getElementById('filterActiveBadge');
  var filterSideTab       = document.getElementById('filterSideTab');
  var filterSideTabBadge  = document.getElementById('filterSideTabBadge');
  var filterSideBackdrop  = document.getElementById('filterSideBackdrop');
  var filterPanelClose    = document.getElementById('filterPanelClose');
  var filterPanelReset    = document.getElementById('filterPanelReset');
  var filterSidePanelOpen = false;
  var mobileFilterMedia   = window.matchMedia('(max-width: 720px)');
  var filterDragState = null;
  var suppressFilterTabClick = false;

  function getFilterPanelWidth() {
    if (!filterControlsPanel) return 0;
    return filterControlsPanel.getBoundingClientRect().width || 0;
  }

  function setFilterPanelDragOffset(offsetPx) {
    if (!filterControlsPanel) return;
    var width = getFilterPanelWidth();
    if (!width) return;
    var clamped = Math.max(0, Math.min(width, offsetPx || 0));
    var progress = 1 - (clamped / width);
    filterControlsPanel.classList.add('is-dragging');
    filterControlsPanel.style.transform = 'translateX(' + (-clamped) + 'px)';
    if (filterSideBackdrop) {
      filterSideBackdrop.style.opacity = String(Math.max(0, Math.min(1, progress)));
    }
    if (filterSideTab) {
      filterSideTab.style.opacity = String(Math.max(0, Math.min(1, 1 - (progress * 1.15))));
    }
  }

  function clearFilterDragStyles() {
    if (filterControlsPanel) {
      filterControlsPanel.classList.remove('is-dragging');
      filterControlsPanel.style.transform = '';
    }
    if (filterSideBackdrop) filterSideBackdrop.style.opacity = '';
    if (filterSideTab) filterSideTab.style.opacity = '';
  }

  function closeExpandedMobileFilters() {
    if (!filterControlsPanel) return;
    filterControlsPanel.querySelectorAll('.filter-select.is-open').forEach(function(wrapper) {
      wrapper.classList.remove('is-open');
      var trigger = wrapper.querySelector('.filter-select__trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    filterControlsPanel.querySelectorAll('.bakery-ms__trigger.is-open').forEach(function(trigger) {
      trigger.click();
    });
  }

  function resetAllFilters() {
    var monthSelect = document.getElementById('monthSelect');
    var rollingWindow = document.getElementById('rollingWindow');
    var bandFilter = document.getElementById('bandFilter');
    var rollingValue = 6;

    state.regionFilter.splice(0, state.regionFilter.length);
    state.opsFilter.splice(0, state.opsFilter.length);
    state.searchBakery.splice(0, state.searchBakery.length);
    state.bandFilter = '';

    if (rollingWindow) {
      rollingWindow.value = '6';
      rollingValue = parseInt(rollingWindow.value, 10) || 0;
      G.syncCustomSelect(rollingWindow);
    }

    if (monthSelect) {
      monthSelect.value = '';
      G.syncCustomSelect(monthSelect);
    }

    if (bandFilter) {
      bandFilter.value = '';
      G.syncCustomSelect(bandFilter);
    }

    if (state.MONTHS && state.MONTHS.length) {
      state.selectedMonths = rollingValue > 0
        ? state.MONTHS.slice(-Math.min(rollingValue, state.MONTHS.length))
        : [].concat(state.MONTHS);
    } else {
      state.selectedMonths = [];
    }

    if (G.rebuildRegionMultiselect) G.rebuildRegionMultiselect();
    if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
    if (G.resetBakeryMultiselect) G.resetBakeryMultiselect();

    closeExpandedMobileFilters();
    refresh();
  }

  function countActiveFilters() {
    var count = 0;
    if (state.regionFilter && state.regionFilter.length) count++;
    if (state.opsFilter && state.opsFilter.length) count++;
    if (state.searchBakery && state.searchBakery.length) count++;
    if (state.bandFilter) count++;
    return count;
  }

  function openFilterSidePanel() {
    if (!filterControlsPanel) return;
    filterSidePanelOpen = true;
    clearFilterDragStyles();
    filterControlsPanel.classList.add('is-open');
    if (filterSideBackdrop) { filterSideBackdrop.classList.add('is-open'); filterSideBackdrop.removeAttribute('aria-hidden'); }
    if (filterSideTab) { filterSideTab.classList.add('is-open'); filterSideTab.setAttribute('aria-expanded', 'true'); }
    if (mobileFilterMedia.matches) { document.body.style.overflow = 'hidden'; }
  }

  function closeFilterSidePanel() {
    if (!filterControlsPanel) return;
    filterSidePanelOpen = false;
    clearFilterDragStyles();
    closeExpandedMobileFilters();
    filterControlsPanel.classList.remove('is-open');
    if (filterSideBackdrop) { filterSideBackdrop.classList.remove('is-open'); filterSideBackdrop.setAttribute('aria-hidden', 'true'); }
    if (filterSideTab) { filterSideTab.classList.remove('is-open'); filterSideTab.setAttribute('aria-expanded', 'false'); }
    document.body.style.overflow = '';
  }

  function syncFilterBadge() {
    var n = countActiveFilters();
    if (filterActiveBadge) {
      filterActiveBadge.hidden = n === 0;
      if (n > 0) filterActiveBadge.textContent = n;
    }
    if (filterSideTabBadge) {
      filterSideTabBadge.hidden = n === 0;
      if (n > 0) filterSideTabBadge.textContent = n;
    }
    if (filterPanelReset) filterPanelReset.disabled = n === 0;
    if (filterSideTab) { filterSideTab.classList.toggle('has-active-filters', n > 0); }
  }

  if (filterSideTab) {
    filterSideTab.addEventListener('pointerdown', function(event) {
      if (!mobileFilterMedia.matches || filterSidePanelOpen) return;
      if (event.pointerType === 'mouse') return;
      var width = getFilterPanelWidth();
      if (!width) return;
      filterDragState = {
        mode: 'opening',
        pointerId: event.pointerId,
        startX: event.clientX,
        startTime: performance.now(),
        lastX: event.clientX,
        distance: 0
      };
      filterControlsPanel.classList.add('is-open');
      if (filterSideBackdrop) {
        filterSideBackdrop.classList.add('is-open');
        filterSideBackdrop.removeAttribute('aria-hidden');
      }
      if (filterSideTab) filterSideTab.classList.add('is-open');
      setFilterPanelDragOffset(width);
      filterSideTab.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    filterSideTab.addEventListener('pointermove', function(event) {
      if (!filterDragState || filterDragState.mode !== 'opening' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      if (!width) return;
      var deltaX = event.clientX - filterDragState.startX;
      var openedDistance = Math.max(0, Math.min(width, deltaX));
      filterDragState.distance = openedDistance;
      filterDragState.lastX = event.clientX;
      setFilterPanelDragOffset(width - openedDistance);
    });
    filterSideTab.addEventListener('pointerup', function(event) {
      if (!filterDragState || filterDragState.mode !== 'opening' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      var elapsed = Math.max(1, performance.now() - filterDragState.startTime);
      var velocity = filterDragState.distance / elapsed;
      var shouldOpen = filterDragState.distance > (width * 0.34) || velocity > 0.55;
      suppressFilterTabClick = filterDragState.distance > 8;
      filterDragState = null;
      shouldOpen ? openFilterSidePanel() : closeFilterSidePanel();
      window.setTimeout(function() { suppressFilterTabClick = false; }, 180);
    });
    filterSideTab.addEventListener('pointercancel', function(event) {
      if (!filterDragState || filterDragState.pointerId !== event.pointerId) return;
      filterDragState = null;
      closeFilterSidePanel();
    });
    filterSideTab.addEventListener('click', function() {
      if (suppressFilterTabClick) return;
      filterSidePanelOpen ? closeFilterSidePanel() : openFilterSidePanel();
    });
  }
  if (filterControlsPanel) {
    filterControlsPanel.addEventListener('pointerdown', function(event) {
      if (!mobileFilterMedia.matches || !filterSidePanelOpen) return;
      if (event.pointerType === 'mouse') return;
      var panelRect = filterControlsPanel.getBoundingClientRect();
      var startedOnHeader = !!event.target.closest('.filter-panel-header');
      var startedNearEdge = (event.clientX - panelRect.left) <= 28;
      if (!startedOnHeader && !startedNearEdge) return;
      filterDragState = {
        mode: 'closing',
        pointerId: event.pointerId,
        startX: event.clientX,
        startTime: performance.now(),
        lastX: event.clientX,
        distance: 0
      };
      filterControlsPanel.setPointerCapture(event.pointerId);
    });
    filterControlsPanel.addEventListener('pointermove', function(event) {
      if (!filterDragState || filterDragState.mode !== 'closing' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      if (!width) return;
      var deltaX = event.clientX - filterDragState.startX;
      var closeDistance = Math.max(0, Math.min(width, -deltaX));
      filterDragState.distance = closeDistance;
      filterDragState.lastX = event.clientX;
      setFilterPanelDragOffset(closeDistance);
    });
    filterControlsPanel.addEventListener('pointerup', function(event) {
      if (!filterDragState || filterDragState.mode !== 'closing' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      var elapsed = Math.max(1, performance.now() - filterDragState.startTime);
      var velocity = filterDragState.distance / elapsed;
      var shouldClose = filterDragState.distance > (width * 0.24) || velocity > 0.45;
      filterDragState = null;
      shouldClose ? closeFilterSidePanel() : openFilterSidePanel();
    });
    filterControlsPanel.addEventListener('pointercancel', function(event) {
      if (!filterDragState || filterDragState.pointerId !== event.pointerId) return;
      filterDragState = null;
      openFilterSidePanel();
    });
  }
  if (filterPanelClose) { filterPanelClose.addEventListener('click', closeFilterSidePanel); }
  if (filterPanelReset) { filterPanelReset.addEventListener('click', resetAllFilters); }
  if (filterSideBackdrop) { filterSideBackdrop.addEventListener('click', closeFilterSidePanel); }
  document.addEventListener('click', function(event) {
    if (!mobileFilterMedia.matches || !filterSidePanelOpen || !filterControlsPanel) return;
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    var insidePanel = path.indexOf(filterControlsPanel) !== -1;
    var onTab = filterSideTab ? path.indexOf(filterSideTab) !== -1 : false;
    if (!insidePanel && !onTab) closeFilterSidePanel();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && filterSidePanelOpen) { closeFilterSidePanel(); }
  });

  // Close side panel when viewport grows past mobile breakpoint
  if (mobileFilterMedia.addEventListener) {
    mobileFilterMedia.addEventListener('change', function(e) {
      if (!e.matches && filterSidePanelOpen) { closeFilterSidePanel(); }
    });
  }

  // ── Mobile filter sub-panel ──────────────────────────────────
  (function() {
    var subPanel     = document.getElementById('filterSubPanel');
    var subTitle     = document.getElementById('filterSubPanelTitle');
    var subBack      = document.getElementById('filterSubPanelBack');
    if (!subPanel || !subBack) return;
    return;

    var subPanelClosing = false;

    function getLabelFor(trigger) {
      var fc = trigger.closest('.filter-control');
      var lbl = fc && fc.querySelector('label');
      return lbl ? lbl.textContent.trim() : '';
    }

    function showSubPanel(title) {
      subTitle.textContent = title;
      subPanel.classList.add('is-open');
      subPanel.removeAttribute('aria-hidden');
    }

    function hideSubPanel() {
      subPanel.classList.remove('is-open');
      subPanel.setAttribute('aria-hidden', 'true');
    }

    // After a trigger click, check if something is now open and show the sub-panel header
    filterControlsPanel.addEventListener('click', function(e) {
      if (!mobileFilterMedia.matches) return;
      var trigger = e.target.closest('.filter-select__trigger, .bakery-ms__trigger');
      if (!trigger) return;
      setTimeout(function() {
        if (subPanelClosing) return;
        // Check which dropdown is now open
        var openSelect = filterControlsPanel.querySelector('.filter-select.is-open');
        if (openSelect) { showSubPanel(getLabelFor(openSelect.querySelector('.filter-select__trigger'))); return; }
        var openMs = filterControlsPanel.querySelector('.bakery-ms__trigger.is-open');
        if (openMs) { showSubPanel(getLabelFor(openMs)); return; }
        hideSubPanel();
      }, 0);
    });

    // After an option is selected in a filter-select, close the sub-panel
    filterControlsPanel.addEventListener('change', function() {
      if (!mobileFilterMedia.matches) return;
      setTimeout(function() {
        var stillOpen = filterControlsPanel.querySelector('.filter-select.is-open');
        if (!stillOpen) hideSubPanel();
      }, 0);
    });

    // Back button: close whatever is open, hide sub-panel
    subBack.addEventListener('click', function() {
      subPanelClosing = true;
      // bakery-ms: click trigger to toggle closed (isOpen=true → closeDropdown)
      filterControlsPanel.querySelectorAll('.bakery-ms__trigger.is-open').forEach(function(t) {
        t.click();
      });
      // filter-select: closeAll fires on document click propagation, but also close explicitly
      filterControlsPanel.querySelectorAll('.filter-select.is-open').forEach(function(w) {
        w.classList.remove('is-open');
        var t = w.querySelector('.filter-select__trigger');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      hideSubPanel();
      setTimeout(function() { subPanelClosing = false; }, 60);
    });

    // When the main filter panel closes, also hide the sub-panel
    var panelObserver = new MutationObserver(function() {
      if (!filterControlsPanel.classList.contains('is-open')) hideSubPanel();
    });
    panelObserver.observe(filterControlsPanel, { attributes: true, attributeFilter: ['class'] });
  })();

  // Patch refresh to also sync the filter badge
  var originalRefresh = refresh;
  refresh = function() {
    originalRefresh();
    syncFilterBadge();
  };

  G.refreshDashboard = refresh;
  G.rebuildDashboardFilters = function() {
    rebuildRegionFilter();
    if (state.ALL.length > 0) refresh();
  };
  G.onBakeryMetaChanged = function() {
    G.rebuildDashboardFilters();
  };
  updateDashboardActiveView('overview');
  syncDashboardKpis('overview');
  syncDashboardSidebarForViewport();
  G.initUpload(initDashboard);
})();

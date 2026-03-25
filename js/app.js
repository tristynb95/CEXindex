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
  var compactDashboardSidebarMedia = window.matchMedia('(max-width: 980px)');
  var desktopDashboardSidebarCollapsed = false;
  var dashboardTabLabels = {
    overview: 'Overview',
    trends: 'Trends',
    table: 'League Table',
    map: 'Map',
    target: 'Target Bakeries',
    speed: 'Speed vs NPS',
    cei: 'CEI Methodology',
    feedback: 'Customer Feedback'
  };
  var dashboardTabsWithKpis = {
    overview: true,
    trends: true,
    table: true
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
    document.getElementById('headerSub').textContent = formatSelectedPeriod() + ' \u00B7 ' + bakeryLabel + ' \u00B7 CEI v4.1';
  }

  function rebuildRegionFilter() {
    var regSel = document.getElementById('regionFilter');
    var previous = state.regionFilter;
    regSel.innerHTML = '<option value="">All Regions</option>';
    var regions = [...new Set(Object.values(G.BAKERY_META).map(function(v) { return v.r; }))].filter(Boolean).sort();
    regions.forEach(function(r) {
      var option = document.createElement('option');
      option.value = r;
      option.textContent = r;
      regSel.appendChild(option);
    });
    if (previous && regions.includes(previous)) {
      regSel.value = previous;
    } else {
      regSel.value = '';
      state.regionFilter = '';
    }
    G.syncCustomSelect(regSel);
    G.populateOpsFilter(state.regionFilter);
  }

  function resizeChartsSoon(container) {
    if (!container || !G.resizeChartsIn) return;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        G.resizeChartsIn(container);
      });
    });
  }

  function updateDashboardActiveView(name) {
    if (dashboardActiveViewLabel) {
      dashboardActiveViewLabel.textContent = dashboardTabLabels[name] || name;
    }
  }

  function syncDashboardKpis(name) {
    if (!dashboardKpiRow) return;
    var shouldShow = !!dashboardTabsWithKpis[name];
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
      resizeChartsSoon(workspace.querySelector('.target-subtab-panel.active'));
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
      }
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

  // ========== REFRESH ==========
  function refresh() {
    if (state.ALL.length === 0) return;
    var data = G.getData();
    var n = data.length;
    updateHeaderSummary(n);
    G.storeDashboardMapData(data);
    if (n === 0) {
      G.renderTargets([]);
      return;
    }

    // KPI cards pair each metric with a compact status so the row scans quickly.
    var metricState = function(val, good, warn, invert, labels) {
      var tone = invert
        ? (val <= good ? 'kpi-green' : val <= warn ? 'kpi-amber' : 'kpi-red')
        : (val >= good ? 'kpi-green' : val >= warn ? 'kpi-amber' : 'kpi-red');
      var status = tone === 'kpi-green' ? labels.good : tone === 'kpi-amber' ? labels.warn : labels.bad;
      return { tone: tone, status: status };
    };
    var buildMetricCard = function(config) {
      var status = metricState(config.value, config.good, config.warn, config.invert, config.labels);
      return {
        value: config.display,
        eyebrow: config.eyebrow,
        title: config.title,
        meta: config.meta,
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
    var ts   = G.avg(data, 'ts');
    var o5   = G.avg(data, 'o5');
    dashboardKpiRow.innerHTML = [
      buildMetricCard({
        value: nps,
        display: nps.toFixed(1),
        eyebrow: 'Customer',
        title: 'Net Promoter Score',
        meta: 'Customer advocacy score.',
        good: 55,
        warn: 35,
        labels: { good: 'Strong', warn: 'At Risk', bad: 'Low' },
        primary: true
      }),
      buildMetricCard({
        value: cei,
        display: cei.toFixed(1),
        eyebrow: 'Index',
        title: 'Relative CEI',
        meta: 'Vs bakery peer set.',
        good: 62.5,
        warn: 37.5,
        labels: { good: 'Leading', warn: 'Mid-Pack', bad: 'Lagging' },
        primary: true
      }),
      buildMetricCard({
        value: acei,
        display: acei.toFixed(1),
        eyebrow: 'Index',
        title: 'Absolute CEI',
        meta: 'Vs company benchmark.',
        good: 75,
        warn: 60,
        labels: { good: 'On Target', warn: 'Near', bad: 'Below' },
        primary: true
      }),
      buildMetricCard({
        value: dr,
        display: dr.toFixed(1) + '%',
        eyebrow: 'Experience',
        title: 'Drink Quality',
        meta: 'Target: 90% positive.',
        good: 90,
        warn: 80,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: ef,
        display: ef.toFixed(1) + '%',
        eyebrow: 'Experience',
        title: 'Efficiency',
        meta: 'Target: 90% positive.',
        good: 90,
        warn: 80,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: fr,
        display: fr.toFixed(1) + '%',
        eyebrow: 'Service',
        title: 'Friendliness',
        meta: 'Target: 90% positive.',
        good: 90,
        warn: 80,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: ts,
        display: ts.toFixed(1),
        eyebrow: 'Operations',
        title: 'Barista Speed',
        meta: 'Target: 75 or better.',
        good: 75,
        warn: 50,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Slow' }
      }),
      buildMetricCard({
        value: o5,
        display: o5.toFixed(1) + '%',
        eyebrow: 'Operations',
        title: 'Orders >5 Min',
        meta: 'Goal: below 2%.',
        good: 2,
        warn: 4,
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
        + '<div class="kpi__meta">' + metric.meta + '</div>'
        + '</article>';
    }).join('');

    G.renderOverviewCharts(data);
    G.renderTrendCharts(data);
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

  document.getElementById('bakerySearch').addEventListener('input', function(e) { state.searchBakery = e.target.value.toLowerCase(); refresh(); });
  document.getElementById('bandFilter').addEventListener('change', function(e) { state.bandFilter = e.target.value; refresh(); });
  document.getElementById('regionFilter').addEventListener('change', function(e) { state.regionFilter = e.target.value; G.populateOpsFilter(state.regionFilter); refresh(); });
  document.getElementById('opsFilter').addEventListener('change', function(e) { state.opsFilter = e.target.value; refresh(); });
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
    compactDashboardSidebarMedia.addEventListener('change', syncDashboardSidebarForViewport);
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
    });
  });

  // ========== INITIALISE FILE UPLOAD ==========
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

// ========== MAIN APPLICATION ENTRY POINT ==========
(function () {
  var G = GAILS;
  var state = G.state;
  var dashboardWorkspaceShell = document.getElementById('dashboardWorkspaceShell');
  var dashboardSidebarToggleBtn = document.getElementById('dashboardSidebarToggle');
  var dashboardSidebarToggleLabel = document.querySelector('[data-dashboard-sidebar-toggle-label]');
  var dashboardSidebarOpenBtn = document.getElementById('dashboardSidebarOpen');
  var dashboardSidebarBackdrop = document.getElementById('dashboardSidebarBackdrop');
  var dashboardActiveViewLabel = document.getElementById('dashboardActiveViewLabel');
  var dashboardKpiRow = document.getElementById('kpis');
  var dashboardFooterStamp = document.getElementById('dashboardFooterStamp');
  var sectionPageTitle = document.getElementById('sectionPageTitle');
  var compactDashboardSidebarMedia = window.matchMedia('(max-width: 980px)');
  var desktopDashboardSidebarCollapsed = false;
  var _networkMapMetric = 'absolute';
  var dashboardTabLabels = {
    overview: 'Overview',
    trends: 'Trends',
    table: 'League Table',
    map: 'Map',
    target: 'Focus Bakeries',
    speed: 'Speed vs NPS',
    cei: 'Coffee Experience Index Methodology',
    feedback: 'Customer Feedback',
    'visit-log': 'Bakery Reports'
  };
  var dashboardMobileTabLabels = {
    overview: 'Overview',
    trends: 'Trends',
    table: 'Rankings',
    map: 'Map',
    target: 'Focus',
    speed: 'Speed',
    cei: 'Methodology',
    feedback: 'Feedback',
    'visit-log': 'Reports'
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

  function setFocusPeriodControls(isFocus) {
    [
      { id: 'monthSelect', label: '\u2014 Select \u2014' },
      { id: 'rollingWindow', label: 'All Time' }
    ].forEach(function (config) {
      var select = document.getElementById(config.id);
      if (!select) return;
      select.disabled = isFocus;
      if (isFocus) {
        select.dataset.lockedLabel = config.label;
        select.title = 'Focus Bakeries uses all completed history and weights recent months most.';
      } else {
        delete select.dataset.lockedLabel;
        select.removeAttribute('title');
      }
      if (G.syncCustomSelect) G.syncCustomSelect(select);
    });
  }

  var lastHeaderBakeryCount = 0;

  function renderDataUpdatedStamp() {
    if (!dashboardFooterStamp) return;
    dashboardFooterStamp.textContent = state.dataLastUpdated
      ? 'Last updated ' + G.formatUpdatedStamp(state.dataLastUpdated)
      : '';
    dashboardFooterStamp.hidden = !state.dataLastUpdated;
  }

  var escapeHtml = G.escapeHtml;

  function renderHeaderSummary() {
    renderDataUpdatedStamp();
    var headerSub = document.getElementById('headerSub');
    if (!headerSub) return;
    var activePanel = document.querySelector('.tab-content.active');
    var currentTab = activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview';

    if (currentTab === 'visit-log') {
      headerSub.innerHTML = window.GAILS.getVisitLogHeaderSummary ? window.GAILS.getVisitLogHeaderSummary() : 'Bakery Reports';
      return;
    }

    var isMobile = window.innerWidth <= 980;
    var prefix = isMobile
      ? (dashboardMobileTabLabels[currentTab] || 'Dashboard')
      : (dashboardTabLabels[currentTab] || 'Dashboard');

    var pills = [];

    // Core bubble: Period and Bakery count
    var focusContext = currentTab === 'target' ? G._focusDataContext : null;
    var headerBakeryCount = focusContext ? focusContext.bakeryCount : lastHeaderBakeryCount;
    var bakeryLabel = headerBakeryCount === 1 ? '1 bakery' : headerBakeryCount + ' bakeries';
    var coreConfigText = formatSelectedPeriod() + ' · ' + bakeryLabel;
    if (currentTab === 'target') coreConfigText = 'All Time \u00b7 ' + bakeryLabel;
    pills.push('<span class="header-pill-core">' + escapeHtml(coreConfigText) + '</span>');

    // Optional bubble: Region
    var selRegions = state.regionFilter || [];
    if (selRegions.length > 0) {
      var rText = selRegions.length === 1 ? selRegions[0] : selRegions.length + ' Regions';
      pills.push('<span class="header-pill-filter">' + escapeHtml(rText) + '</span>');
    }

    // Optional bubble: Area (Ops Area)
    var selOps = state.opsFilter || [];
    if (selOps.length > 0) {
      var oText = selOps.length === 1 ? selOps[0] : selOps.length + ' Areas';
      pills.push('<span class="header-pill-filter">' + escapeHtml(oText) + '</span>');
    }

    // Optional bubble: Bakery
    var selBakeries = state.searchBakery || [];
    if (selBakeries.length > 0) {
      var bText = selBakeries.length === 1 ? selBakeries[0] : selBakeries.length + ' Bakeries';
      pills.push('<span class="header-pill-filter">' + escapeHtml(bText) + '</span>');
    }

    // Optional bubble: Band
    var bandVal = state.bandFilter;
    if (bandVal) {
      var bandLabels = {
        'exceeding': 'Exceeding',
        'onTarget': 'On Target',
        'watch': 'Watch',
        'below': 'Below'
      };
      var bandText = 'Band: ' + (bandLabels[bandVal] || bandVal);
      pills.push('<span class="header-pill-filter">' + escapeHtml(bandText) + '</span>');
    }

    headerSub.innerHTML = prefix +
      '<span class="header-sub-pillwrap">' +
      pills.join('') +
      '</span>';
  }

  function updateHeaderSummary(bakeryCount) {
    lastHeaderBakeryCount = bakeryCount;
    renderHeaderSummary();
  }

  function rebuildRegionFilter() {
    if (G.rebuildRegionMultiselect) G.rebuildRegionMultiselect();
    if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
  }

  function resizeChartsSoon(container) {
    if (!container || !G.resizeChartsIn) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
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
      label.textContent = state.rankingsMetric === 'absolute' ? 'Benchmark Score' : 'Peer Score';
    } else if (currentTab === 'target') {
      container.style.display = '';
      label.textContent = state.targetMetric === 'absolute' ? 'Benchmark Score' : 'Peer Score';
    } else if (currentTab === 'map') {
      container.style.display = '';
      label.textContent = _networkMapMetric === 'absolute' ? 'Benchmark Score' : 'Peer Score';
    } else if (currentTab === 'table' || currentTab === 'trends' || currentTab === 'speed') {
      container.style.display = '';
      label.textContent = 'Peer & Benchmark';
    } else {
      container.style.display = 'none';
    }
  }

  var globalIndexToggle = document.getElementById('globalIndexToggle');
  var globalIndexToggleDesktopParent = globalIndexToggle ? globalIndexToggle.parentNode : null;
  var globalIndexToggleDesktopNextSibling = globalIndexToggle ? globalIndexToggle.nextSibling : null;
  var globalIndexToggleMobileParent = document.querySelector('#filterControlsPanel .filter-controls-body');
  var tabsWithoutGlobalIndexToggle = {
    'table': true,
    'visit-log': true,
    'trends': true,
    'feedback': true
  };

  function syncGlobalIndexTogglePlacement() {
    if (!globalIndexToggle || !globalIndexToggleDesktopParent || !globalIndexToggleMobileParent) return;
    var useMobilePlacement = compactDashboardSidebarMedia.matches;
    globalIndexToggle.classList.toggle('is-mobile-filter', useMobilePlacement);

    if (useMobilePlacement) {
      if (globalIndexToggle.parentNode !== globalIndexToggleMobileParent) {
        globalIndexToggleMobileParent.insertBefore(globalIndexToggle, globalIndexToggleMobileParent.firstChild);
      }
      return;
    }

    if (globalIndexToggle.parentNode !== globalIndexToggleDesktopParent) {
      var desktopAnchorIsAvailable = globalIndexToggleDesktopNextSibling &&
        globalIndexToggleDesktopNextSibling.parentNode === globalIndexToggleDesktopParent;
      globalIndexToggleDesktopParent.insertBefore(
        globalIndexToggle,
        desktopAnchorIsAvailable ? globalIndexToggleDesktopNextSibling : null
      );
    }
  }

  syncGlobalIndexTogglePlacement();

  function updateGlobalIndexToggleVisibility(name) {
    if (!globalIndexToggle) return;
    globalIndexToggle.style.display = tabsWithoutGlobalIndexToggle[name] ? 'none' : 'inline-flex';
  }

  function syncMobileFilterIndexLabel() {
    var filterTab = document.getElementById('filterSideTab');
    var filterTabLabel = document.getElementById('filterSideTabLabel');
    var indexLabel = state.indexType === 'absolute' ? 'Benchmark' : 'Peer';
    if (filterTabLabel) filterTabLabel.textContent = indexLabel;
    if (filterTab) filterTab.setAttribute('aria-label', 'Open filters — ' + indexLabel + ' index');
  }

  syncMobileFilterIndexLabel();

  function updateDashboardActiveView(name) {
    if (dashboardActiveViewLabel) {
      dashboardActiveViewLabel.textContent = dashboardTabLabels[name] || name;
    }
    if (sectionPageTitle) {
      sectionPageTitle.textContent = dashboardTabLabels[name] || name;
    }
    updateDashboardActiveIndex(name);
    updateGlobalIndexToggleVisibility(name);
    syncMobileFilterIndexLabel();
    // Expose the active tab so tab-specific layout tweaks can be scoped in CSS.
    document.body.dataset.dashTab = name;
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

  function activateTargetSubtab(name, options) {
    var workspace = document.getElementById('targetTabWorkspace');
    if (!workspace) return;
    var shouldScrollNav = !(options && options.scrollNav === false);
    workspace.querySelectorAll('.target-subtab').forEach(function (btn) {
      var isActive = btn.dataset.targetSubtab === name;
      btn.classList.toggle('active', isActive);
      if (isActive && shouldScrollNav) {
        btn.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    });
    workspace.querySelectorAll('.target-subtab-panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.targetSubtabPanel === name);
    });
    if (name === 'map') {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { G.initTargetMap(); });
      });
    } else if (name === 'feedback') {
      G.fetchTargetWordCloud();
    } else {
      var activePanel = workspace.querySelector('.target-subtab-panel.active');
      if (activePanel && G.resizeChartsIn) G.resizeChartsIn(activePanel);
    }
  }

  function initDashboardMapSoon() {
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { G.initDashboardMap(); });
    });
  }

  function scrollToTop() {
    window.scrollTo(0, 0);
  }

  function activateDashboardTab(name) {
    var activePanel = document.getElementById('tab-' + name);
    if (!activePanel) return null;

    var previousPanel = document.querySelector('.tab-content.active');
    var previousName = previousPanel ? previousPanel.id.replace(/^tab-/, '') : '';
    if (previousName !== name && (previousName === 'visit-log' || name === 'visit-log') && G.resetVisitLogCollapsedGroups) {
      G.resetVisitLogCollapsedGroups();
    }

    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.tab === name);
    });
    document.querySelectorAll('.dashboard-footer__link').forEach(function (link) {
      link.classList.toggle('active', link.dataset.footerTab === name);
    });
    document.querySelectorAll('.tab-content').forEach(function (panel) {
      panel.classList.toggle('active', panel === activePanel);
    });
    if (name === 'target' && previousName && previousName !== 'target') {
      activateTargetSubtab('summary', { scrollNav: false });
    }
    var enteringVisitLog = name === 'visit-log' && previousName && previousName !== 'visit-log';
    if (enteringVisitLog && G.resetVisitLogView) {
      G.resetVisitLogView();
    }
    updateDashboardActiveView(name);
    syncDashboardKpis(name);
    setFocusPeriodControls(name === 'target');
    renderHeaderSummary();
    updateBandFilterOptions();

    var filterBar = document.querySelector('.filter-bar');
    if (filterBar) {
      filterBar.classList.toggle('filter-bar--hidden', name === 'visit-log');
    }

    var mobileFilterTab = document.getElementById('filterSideTab');
    if (mobileFilterTab) {
      if (name === 'table' || name === 'visit-log') {
        mobileFilterTab.style.setProperty('display', 'none', 'important');
      } else {
        mobileFilterTab.style.display = '';
      }
    }

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
        requestAnimationFrame(function () { G.initWordCloud(); });
      } else {
        requestAnimationFrame(function () { G.fetchWordCloud(); });
      }
      return activePanel;
    }

    if (name === 'visit-log') {
      requestAnimationFrame(function () {
        if (typeof G.renderVisitLog === 'function') G.renderVisitLog();
        // The list only exists after this render, so the page can grow taller
        // than it was when the nav handler scrolled up — pin to the top again
        // once the history rows are in the DOM.
        if (enteringVisitLog) scrollToTop();
      });
      return activePanel;
    }

    if (name === 'trends' && G._trendsNeedRender) {
      G._trendsNeedRender = false;
      requestAnimationFrame(function () {
        if (G._lastData) G.renderTrendCharts(G._lastData.filter(function (r) { return r && !r.noData; }));
      });
      return activePanel;
    }

    resizeChartsSoon(activePanel);
    if (name === 'target') {
      var activeSubtab = activePanel.querySelector('.target-subtab-panel.active');
      if (activeSubtab && activeSubtab.dataset.targetSubtabPanel === 'map') {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { G.initTargetMap(); });
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
    var indices = sel.map(function (m) { return all.indexOf(m); }).filter(function (i) { return i >= 0; });
    if (indices.length === 0) return null;
    indices.sort(function (a, b) { return a - b; });
    var firstIdx = indices[0];
    var n = indices.length;
    if (firstIdx < n) return null;
    var priorMonths = all.slice(firstIdx - n, firstIdx);
    var recs = state.ALL.filter(function (r) { return priorMonths.indexOf(r.m) >= 0; });
    if (state.regionFilter.length) recs = recs.filter(function (r) { return state.regionFilter.indexOf(G.getBakeryRegion(r.b)) >= 0; });
    if (state.opsFilter.length) recs = recs.filter(function (r) { return state.opsFilter.indexOf(G.getBakeryOps(r.b)) >= 0; });
    if (state.searchBakery && state.searchBakery.length) recs = recs.filter(function (r) {
      return state.searchBakery.some(function (s) { return r.b.toLowerCase().indexOf(s.toLowerCase()) >= 0; });
    });
    if (recs.length === 0) return null;
    var avg = function (key) { return recs.reduce(function (a, r) { return a + (r[key] || 0); }, 0) / recs.length; };
    // Sparse metrics (e.g. avg wait) may be absent on older records — average only
    // the rows that have them; NaN when none do, so kpiDeltaHtml skips the delta.
    var avgDef = function (key) {
      var vs = recs.filter(function (r) { return typeof r[key] === 'number' && !isNaN(r[key]); });
      return vs.length ? vs.reduce(function (a, r) { return a + r[key]; }, 0) / vs.length : NaN;
    };
    var label = n === 1 ? priorMonths[0] : 'prior ' + n + 'm';
    return {
      n: avg('n'), c: avg('c'), ac: avg('ac'),
      dr: avg('dr'), ef: avg('ef'), fr: avg('fr'),
      ts: avg('ts'),
      o5: avg('o5'),
      at: avgDef('at'),
      // Total drinks is compared as a period sum, not a mean; NaN when the
      // prior period predates the KV drinks column so the delta is skipped.
      td: (function () {
        var vs = recs.filter(function (r) { return typeof r.td === 'number' && !isNaN(r.td) && r.td > 0; });
        return vs.length ? vs.reduce(function (a, r) { return a + r.td; }, 0) : NaN;
      })(),
      label: label
    };
  }

  function kpiDeltaHtml(current, priorObj, key, invert, formatFn) {
    if (!priorObj || priorObj[key] === undefined || isNaN(priorObj[key])) return '';
    var prior = priorObj[key];
    var raw = current - prior;
    var effective = invert ? -raw : raw;
    var abs = Math.abs(raw);
    var ref = '<span class="kpi__delta-ref">vs ' + priorObj.label + '</span>';
    if (abs < 0.3) return '<span class="kpi__delta kpi__delta--flat">— flat ' + ref + '</span>';
    var arrow = raw > 0 ? '↑' : '↓';
    var cls = effective > 0 ? 'kpi__delta--up' : 'kpi__delta--down';
    var display = formatFn ? formatFn(abs) : abs.toFixed(1);
    return '<span class="kpi__delta ' + cls + '">' + arrow + ' ' + display + ' ' + ref + '</span>';
  }

  // ========== KPI VALUE FIT ==========
  // Long values (e.g. "2,129,172" on Total Drinks) overflow the card at the
  // stylesheet font size. Shrink each value just enough to fit its card,
  // re-fitting whenever the row's width changes (viewport resize, sidebar
  // collapse). Clearing the inline size first restores the stylesheet size as
  // the measuring baseline so cards regain full size when space allows.
  var KPI_VALUE_MIN_PX = 14;
  function fitKpiValues() {
    if (!dashboardKpiRow) return;
    Array.from(dashboardKpiRow.querySelectorAll('.kpi__value')).forEach(function (el) {
      el.style.fontSize = '';
      el.style.whiteSpace = 'nowrap';
      var available = el.clientWidth;
      if (!available || el.scrollWidth <= available) return;
      var base = parseFloat(window.getComputedStyle(el).fontSize);
      var size = Math.max(KPI_VALUE_MIN_PX, Math.floor(base * available / el.scrollWidth));
      el.style.fontSize = size + 'px';
      while (el.scrollWidth > el.clientWidth && size > KPI_VALUE_MIN_PX) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    });
  }

  if (dashboardKpiRow && window.ResizeObserver) {
    new ResizeObserver(function () { fitKpiValues(); }).observe(dashboardKpiRow);
  } else {
    window.addEventListener('resize', fitKpiValues);
  }

  // ========== REFRESH ==========
  function refresh() {
    if (state.ALL.length === 0) return;
    updateDashboardActiveIndex();
    updateBandFilterOptions();
    var data = G.getData();
    var scoredData = data.filter(function (r) { return r && !r.noData; });
    var n = scoredData.length;
    updateHeaderSummary(data.length);
    G.storeDashboardMapData(data);
    if (data.length === 0 || n === 0) {
      var wantAbs = state.indexType === 'absolute';
      var dashMetrics = [
        { eyebrow: 'NPS', title: 'NPS (Drink & Meal)', meta: 'Target: 55', primary: true }
      ];
      if (wantAbs) {
        dashMetrics.push({ eyebrow: 'Index', title: 'Benchmark Score', meta: 'vs company benchmark', primary: true });
      } else {
        dashMetrics.push({ eyebrow: 'Index', title: 'Peer Score', meta: 'vs bakery peer set.', primary: true });
      }
      dashMetrics.push(
        { eyebrow: 'SHINE', title: 'Drink Quality', meta: 'Target: 90%' },
        { eyebrow: 'SHINE', title: 'Efficiency', meta: 'Target: 90%' },
        { eyebrow: 'SHINE', title: 'Friendliness', meta: 'Target: 90%' },
        { eyebrow: 'KV Link', title: 'Coffee Efficiency', meta: 'Target: 70% < 2 min' },
        { eyebrow: 'KV Link', title: 'Avg Wait Time', meta: 'Target: ≤ 2:00' },
        { eyebrow: 'KV Link', title: 'Orders >5 Min', meta: 'Target: < 1%' }
      );
      dashboardKpiRow.innerHTML = dashMetrics.map(function (metric) {
        return '<article class="kpi kpi-muted' + (metric.primary ? ' kpi--primary' : '') + '">'
          + '<div class="kpi__top">'
          + '<span class="kpi__eyebrow">' + metric.eyebrow + '</span>'
          + '<span class="kpi__status">No Data</span>'
          + '</div>'
          + '<div class="kpi__value">-</div>'
          + '<div class="kpi__title">' + metric.title + '</div>'
          + '<div class="kpi__meta">'
          + '<span class="kpi__meta-text">' + metric.meta + '</span>'
          + '</div>'
          + '</article>';
      }).join('');
      fitKpiValues();
      G.renderOverviewCharts(data);
      G._lastData = data;
      var trendsPanelEmpty = document.getElementById('tab-trends');
      if (trendsPanelEmpty && trendsPanelEmpty.classList.contains('active')) {
        G.renderTrendCharts(scoredData);
        G._trendsNeedRender = false;
      } else {
        G._trendsNeedRender = true;
      }
      G.renderSpeedCharts(scoredData);
      G.renderLeagueTable(data);
      G.renderTargets(scoredData);
      renderHeaderSummary();
      return;
    }

    // KPI cards pair each metric with a compact status so the row scans quickly.
    var metricState = function (val, good, warn, invert, labels, bands) {
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
    var buildMetricCard = function (config) {
      var cmpVal = config.compare != null ? config.compare : config.value;
      var status = metricState(cmpVal, config.good, config.warn, config.invert, config.labels, config.bands);
      return {
        value: config.display,
        eyebrow: config.eyebrow,
        title: config.title,
        meta: config.meta,
        delta: kpiDeltaHtml(config.value, prior, config.priorKey, config.invert, config.deltaFormat),
        tone: status.tone,
        status: status.status,
        primary: !!config.primary
      };
    };
    var nps = G.avg(scoredData, 'n');
    var cei = G.avg(scoredData, 'c');
    var acei = G.avg(scoredData, 'ac');
    var dr = G.avg(scoredData, 'dr');
    var ef = G.avg(scoredData, 'ef');
    var fr = G.avg(scoredData, 'fr');
    var ts = G.avg(scoredData, 'ts');
    var o5 = G.avg(scoredData, 'o5');
    // Avg wait is null on records that predate the KV avg-time columns, so
    // average only the bakeries that have it.
    var atRows = scoredData.filter(function (r) { return typeof r.at === 'number' && !isNaN(r.at); });
    var at = atRows.length ? atRows.reduce(function (a, r) { return a + r.at; }, 0) / atRows.length : null;
    var atCard = at === null
      ? {
        value: '—', eyebrow: 'KV Link', title: 'Avg Wait Time', meta: 'Target: ≤ 2:00',
        delta: '', tone: 'kpi-muted', status: 'No Data', primary: false
      }
      : buildMetricCard({
        value: at,
        display: G.formatSecs(at),
        eyebrow: 'KV Link',
        title: 'Avg Wait Time',
        meta: 'Target: ≤ 2:00',
        priorKey: 'at',
        deltaFormat: G.formatSecs,
        invert: true,
        good: G.BENCHMARKS.at,
        warn: G.BENCHMARK_FLOORS.at,
        bands: [
          { test: function (v) { return G.metricRagTone('at', v) === 'green'; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (v) { return G.metricRagTone('at', v) === 'amber'; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (v) { return G.metricRagTone('at', v) === 'red'; }, tone: 'kpi-red', status: 'Below' }
        ],
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      });
    var wantAbs = state.indexType === 'absolute';
    var cards = [
      buildMetricCard({
        value: nps,
        compare: Math.round(nps),
        display: Math.round(nps).toString(),
        eyebrow: 'NPS',
        title: 'NPS (Drink & Meal)',
        meta: 'Target: 55',
        priorKey: 'n',
        bands: [
          { test: function (val) { return val < 45; }, tone: 'kpi-red', status: 'Below' },
          { test: function (val) { return val < 55; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (val) { return val <= 60; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (val) { return val > 60; }, tone: 'kpi-blue', status: 'Exceeding' }
        ],
        labels: { good: 'Exceeding', warn: 'Watch', bad: 'Below' },
        primary: true
      })
    ];

    if (wantAbs) {
      cards.push(buildMetricCard({
        value: acei,
        compare: Math.round(acei),
        display: Math.round(acei).toString(),
        eyebrow: 'Index',
        title: 'Benchmark Score',
        meta: 'vs company benchmark',
        priorKey: 'ac',
        bands: [
          { test: function (val) { return val > 92; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (val) { return val >= 75; }, tone: 'kpi-green', status: 'Meeting' },
          { test: function (val) { return val >= 60; }, tone: 'kpi-amber', status: 'Approaching' },
          { test: function (val) { return val < 60; }, tone: 'kpi-red', status: 'Below Standard' }
        ],
        labels: { good: 'Meeting', warn: 'Approaching', bad: 'Below Standard' },
        primary: true
      }));
    } else {
      cards.push(buildMetricCard({
        value: cei,
        compare: Math.round(cei),
        display: Math.round(cei).toString(),
        eyebrow: 'Index',
        title: 'Peer Score',
        meta: 'vs bakery peer set.',
        priorKey: 'c',
        good: 62.5,
        warn: 37.5,
        labels: { good: 'Leading', warn: 'Mid-Pack', bad: 'Lagging' },
        primary: true
      }));
    }

    cards.push(
      buildMetricCard({
        value: dr,
        compare: Math.round(dr),
        display: Math.round(dr) + '%',
        eyebrow: 'SHINE',
        title: 'Drink Quality',
        meta: 'Target: 90%',
        priorKey: 'dr',
        good: 90,
        warn: 80,
        bands: [
          { test: function (val) { return val > 92; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (val) { return val >= 90; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (val) { return val >= 80; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (val) { return val < 80; }, tone: 'kpi-red', status: 'Below' }
        ],
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: ef,
        compare: Math.round(ef),
        display: Math.round(ef) + '%',
        eyebrow: 'SHINE',
        title: 'Efficiency',
        meta: 'Target: 90%',
        priorKey: 'ef',
        good: 90,
        warn: 80,
        bands: [
          { test: function (val) { return val > 92; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (val) { return val >= 90; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (val) { return val >= 80; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (val) { return val < 80; }, tone: 'kpi-red', status: 'Below' }
        ],
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: fr,
        compare: Math.round(fr),
        display: Math.round(fr) + '%',
        eyebrow: 'SHINE',
        title: 'Friendliness',
        meta: 'Target: 90%',
        priorKey: 'fr',
        good: 90,
        warn: 80,
        bands: [
          { test: function (val) { return val > 92; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (val) { return val >= 90; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (val) { return val >= 80; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (val) { return val < 80; }, tone: 'kpi-red', status: 'Below' }
        ],
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      }),
      buildMetricCard({
        value: ts,
        compare: Math.round(ts),
        display: Math.round(ts) + '%',
        eyebrow: 'KV Link',
        title: 'Coffee Efficiency',
        meta: 'Target: 70% < 2 min',
        priorKey: 'ts',
        good: 70,
        warn: 60,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' },
        bands: [
          { test: function (v) { return v > 80; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (v) { return v >= 70 && v <= 80; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (v) { return v >= 60 && v < 70; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (v) { return v < 60; }, tone: 'kpi-red', status: 'Below' }
        ]
      }),
      atCard,
      buildMetricCard({
        value: o5,
        display: o5.toFixed(1) + '%',
        eyebrow: 'KV Link',
        title: 'Orders >5 Min',
        meta: 'Target: < 1%',
        priorKey: 'o5',
        bands: [
          { test: function (v) { return v < 0.5; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (v) { return v <= 1.0; }, tone: 'kpi-green', status: 'On Target' },
          { test: function (v) { return v < 2.5; }, tone: 'kpi-amber', status: 'Watch' },
          { test: function (v) { return v >= 2.5; }, tone: 'kpi-red', status: 'Below' }
        ],
        good: 1.0,
        warn: 2.5,
        invert: true,
        labels: { good: 'On Target', warn: 'Watch', bad: 'Below' }
      })
    );

    dashboardKpiRow.innerHTML = cards.map(function (metric) {
      return '<article class="kpi ' + metric.tone + (metric.primary ? ' kpi--primary' : '') + '">'
        + '<div class="kpi__top">'
        + '<span class="kpi__eyebrow">' + metric.eyebrow + '</span>'
        + '<span class="kpi__status">' + metric.status + '</span>'
        + '</div>'
        + '<div class="kpi__value">' + metric.value + '</div>'
        + '<div class="kpi__title">' + metric.title + '</div>'
        + (metric.delta ? metric.delta : '')
        + '<div class="kpi__meta">'
        + '<span class="kpi__meta-text">' + metric.meta + '</span>'
        + '</div>'
        + '</article>';
    }).join('');
    fitKpiValues();

    G.renderOverviewCharts(data);
    G._lastData = data;
    var trendsPanel = document.getElementById('tab-trends');
    if (trendsPanel && trendsPanel.classList.contains('active')) {
      G.renderTrendCharts(scoredData);
      G._trendsNeedRender = false;
    } else {
      G._trendsNeedRender = true;
    }
    G.renderSpeedCharts(scoredData);
    G.renderLeagueTable(data);
    G.renderTargets(data);
    renderHeaderSummary();

    // Word clouds — only call when their panel is visible; fetch functions handle cache
    var feedbackTab = document.getElementById('tab-feedback');
    if (feedbackTab && feedbackTab.classList.contains('active')) G.fetchWordCloud();
    var targetFeedbackPanel = document.querySelector('[data-target-subtab-panel="feedback"]');
    if (targetFeedbackPanel && targetFeedbackPanel.classList.contains('active')) G.fetchTargetWordCloud();

    var visitLogTab = document.getElementById('tab-visit-log');
    if (visitLogTab && visitLogTab.classList.contains('active')) {
      if (typeof G.renderVisitLog === 'function') G.renderVisitLog();
    }
  }

  // ========== INITIALISE DASHBOARD ==========
  function initDashboard(records, months) {
    // Collapse alias/punctuation variants of a bakery name (e.g.
    // "Union Street - Bath" vs "Union Street, Bath") to a single canonical name.
    // Applied here so it also fixes records that were parsed and stored (Firebase /
    // localStorage cache) before the parser started canonicalizing at upload time.
    if (G.resolveBakeryMetaKey) {
      (records || []).forEach(function (r) {
        if (r && r.b) r.b = G.resolveBakeryMetaKey(r.b) || r.b;
      });
    }
    // Records stored (Firebase/localStorage cache) before the Drink + Meal NPS
    // policy have no na/va — their headline n/v ARE the all-sources values,
    // with the splits on nd/vf when the upload carried them. Migrate them here
    // so stored data matches freshly parsed data: keep the all-sources values
    // as na/va, then switch the headline to the D+M score and net volume.
    // Freshly parsed records already have na and are left untouched.
    (records || []).forEach(function (r) {
      if (!r || typeof r.na === 'number') return;
      r.na = typeof r.n === 'number' ? r.n : null;
      r.va = typeof r.v === 'number' ? r.v : null;
      if (typeof r.nd === 'number') r.n = r.nd;
      if (typeof r.vf === 'number' && typeof r.v === 'number') r.v = Math.max(0, r.v - r.vf);
    });
    if (records && G.ensureBands) {
      records.forEach(G.ensureBands);
    }
    state.ALL = records;
    state.MONTHS = months;
    state.BAKERIES = [...new Set(records.map(function (r) { return r.b; }))].sort();
    state.PERIODS = G.buildPeriods(months);

    state.selectedMonths = G.resolvePeriodMonths(document.getElementById('rollingWindow').value, months, records);

    var mSel = document.getElementById('monthSelect');
    mSel.innerHTML = '<option value="">\u2014 Select \u2014</option>';
    [].concat(months).reverse().forEach(function (m) {
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
  document.getElementById('monthSelect').addEventListener('change', function () {
    if (this.value) {
      state.selectedMonths = [this.value];
      document.getElementById('rollingWindow').value = '0';
      G.syncCustomSelect('rollingWindow');
      refresh();
    }
  });

  // ========== GLOBAL INDEX TYPE TOGGLE (header) ==========
  _networkMapMetric = state.indexType;
  Array.from(document.querySelectorAll('[data-global-index]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextMetric = btn.dataset.globalIndex === 'absolute' ? 'absolute' : 'relative';
      if (state.indexType === nextMetric) return;
      state.indexType = nextMetric;
      state.rankingsMetric = nextMetric;
      state.targetMetric = nextMetric;
      _networkMapMetric = nextMetric;
      syncMobileFilterIndexLabel();
      Array.from(document.querySelectorAll('[data-global-index]')).forEach(function (toggleBtn) {
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
  Array.from(document.querySelectorAll('[data-map-area]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextArea = btn.dataset.mapArea === 'on' ? 'on' : 'off';
      if (_networkMapArea === nextArea) return;
      _networkMapArea = nextArea;
      Array.from(document.querySelectorAll('[data-map-area]')).forEach(function (toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.mapArea === nextArea);
      });
      if (G.setNetworkMapArea) G.setNetworkMapArea(nextArea);
    });
  });

  // ========== TARGET MAP AREA TOGGLE ==========
  var _targetMapArea = 'off';
  Array.from(document.querySelectorAll('[data-target-map-area]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextArea = btn.dataset.targetMapArea === 'on' ? 'on' : 'off';
      if (_targetMapArea === nextArea) return;
      _targetMapArea = nextArea;
      Array.from(document.querySelectorAll('[data-target-map-area]')).forEach(function (toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.targetMapArea === nextArea);
      });
      if (G.setTargetMapArea) G.setTargetMapArea(nextArea);
    });
  });

  // ========== NETWORK MAP VISITED TOGGLE ==========
  var _networkMapVisit = 'all';
  Array.from(document.querySelectorAll('[data-map-visit]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextVisit = btn.dataset.mapVisit;
      if (_networkMapVisit === nextVisit) return;
      _networkMapVisit = nextVisit;
      Array.from(document.querySelectorAll('[data-map-visit]')).forEach(function (toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.mapVisit === nextVisit);
      });
      if (G.setNetworkMapVisitFilter) G.setNetworkMapVisitFilter(nextVisit);
    });
  });

  // ========== TARGET MAP VISITED TOGGLE ==========
  var _targetMapVisit = 'all';
  Array.from(document.querySelectorAll('[data-target-map-visit]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextVisit = btn.dataset.targetMapVisit;
      if (_targetMapVisit === nextVisit) return;
      _targetMapVisit = nextVisit;
      Array.from(document.querySelectorAll('[data-target-map-visit]')).forEach(function (toggleBtn) {
        toggleBtn.classList.toggle('active', toggleBtn.dataset.targetMapVisit === nextVisit);
      });
      if (G.setTargetMapVisitFilter) G.setTargetMapVisitFilter(nextVisit);
    });
  });

  // ========== MAP FULLSCREEN TOGGLE ==========
  (function () {
    function invalidate(key) {
      if (G.invalidateMapSize) G.invalidateMapSize(key);
    }

    // Relocate the real global filter bar into the full-screen map's side panel so
    // its controls stay fully wired to dashboard state (changes flow through the
    // existing handlers → refresh() → the map re-renders live). Moved home on exit.
    var filterBar = document.querySelector('.filter-bar');
    var filterHome = filterBar ? { parent: filterBar.parentNode, next: filterBar.nextSibling } : null;

    function hostFor(mapKey) {
      return document.getElementById(mapKey === 'target' ? 'targetMapFilterSummary' : 'networkMapFilterSummary');
    }
    function mountFilters(mapKey) {
      if (!filterBar) return;
      var host = hostFor(mapKey);
      if (!host) return;
      host.innerHTML = '<div class="map-filter-summary__title">Filters</div>';
      host.appendChild(filterBar);
      filterBar.classList.add('filter-bar--in-map');
    }
    function unmountFilters() {
      if (!filterBar || !filterHome) return;
      filterBar.classList.remove('filter-bar--in-map');
      if (filterHome.next && filterHome.next.parentNode === filterHome.parent) {
        filterHome.parent.insertBefore(filterBar, filterHome.next);
      } else {
        filterHome.parent.appendChild(filterBar);
      }
      ['networkMapFilterSummary', 'targetMapFilterSummary'].forEach(function (id) {
        var host = document.getElementById(id);
        if (host) host.innerHTML = '';
      });
    }

    function updateFullscreenButton(panel) {
      if (!panel) return;
      var button = panel.querySelector('[data-map-fullscreen]');
      if (!button) return;
      var active = panel.classList.contains('is-fullscreen');
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Exit full screen map view' : 'Open full screen map view');
      button.setAttribute('title', active ? 'Exit full screen' : 'Open full screen');
    }

    function enterFullscreen(panel) {
      mountFilters(panel.dataset.mapKey);
      panel.classList.add('is-fullscreen');
      document.body.classList.add('map-fullscreen-active');
      updateFullscreenButton(panel);
      invalidate(panel.dataset.mapKey);
    }
    function exitFullscreen(panel) {
      panel.classList.remove('is-fullscreen');
      if (!document.querySelector('.map-panel.is-fullscreen')) {
        document.body.classList.remove('map-fullscreen-active');
      }
      unmountFilters();
      updateFullscreenButton(panel);
      invalidate(panel.dataset.mapKey);
    }

    Array.from(document.querySelectorAll('[data-map-fullscreen]')).forEach(function (btn) {
      var panelId = btn.dataset.mapFullscreen === 'network' ? 'networkMapPanel' : 'targetMapPanel';
      var panel = document.getElementById(panelId);
      if (!panel) return;
      updateFullscreenButton(panel);
      btn.addEventListener('click', function () {
        if (panel.classList.contains('is-fullscreen')) {
          exitFullscreen(panel);
        } else {
          enterFullscreen(panel);
        }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.map-panel.is-fullscreen');
      if (open) exitFullscreen(open);
    });
  })();

  // ========== BAKERY MULTI-SELECT ==========
  (function () {
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
      sorted.forEach(function (name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var lbl = document.createElement('span');
        lbl.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bakery-ms__sel-chip-remove';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.innerHTML = '&#x2715;';
        x.addEventListener('click', function (e) {
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
      var all = (state.BAKERIES || []).filter(function (b) {
        if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(b))) return false;
        if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(b))) return false;
        return true;
      });
      var q = (query || '').toLowerCase().trim();
      var visible = q ? all.filter(function (b) { return b.toLowerCase().includes(q); }) : all;
      msList.innerHTML = '';
      visible.forEach(function (name) {
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
        btn.addEventListener('click', function () { toggleBakery(name); });
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
      msSearch.focus({ preventScroll: true });
    }

    function closeDropdown() {
      isOpen = false;
      msDropdown.style.display = 'none';
      msTrigger.setAttribute('aria-expanded', 'false');
      msTrigger.classList.remove('is-open');
    }

    msTrigger.addEventListener('click', function () { isOpen ? closeDropdown() : openDropdown(); });
    msSearch.addEventListener('input', function () { renderList(this.value); });
    msClearBtn.addEventListener('click', function () {
      selected.splice(0, selected.length);
      updateLabel();
      if (isOpen) { renderList(msSearch.value); renderSelected(); }
      refresh();
    });
    document.addEventListener('click', function (e) {
      if (isOpen && !e.composedPath().some(function (el) { return el === msContainer; })) closeDropdown();
    });
    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { closeDropdown(); msTrigger.focus(); }
    });

    updateLabel();

    G.resetBakeryMultiselect = function () {
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
      updateBandFilterOptions._orig = Array.from(bandFilterEl.children).map(function (child) {
        if (child.tagName === 'OPTGROUP') {
          return { type: 'optgroup', label: child.label, options: Array.from(child.children).map(function (opt) { return { value: opt.value, text: opt.textContent }; }) };
        }
        return { type: 'option', value: child.value, text: child.textContent };
      });
    }

    var activePanel = document.querySelector('.tab-content.active');
    var currentTab = activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview';
    var available = currentTab === 'target' && G.getFocusAvailableBands
      ? G.getFocusAvailableBands()
      : G.getAvailableBands();
    var currentValue = state.bandFilter;
    var toggleApplies = !tabsWithoutGlobalIndexToggle[currentTab];
    var wantAbs = state.indexType === 'absolute';

    // Rebuild select from original structure, omitting unavailable options
    bandFilterEl.innerHTML = '';
    updateBandFilterOptions._orig.forEach(function (item) {
      if (item.type === 'option') {
        var opt = document.createElement('option');
        opt.value = item.value;
        opt.textContent = item.text;
        bandFilterEl.appendChild(opt);
        return;
      }

      // On pages where the Relative/Absolute toggle applies, only show the
      // optgroup matching the active mode; elsewhere (Trends, League Table,
      // Bakery Reports) show both, since either metric can be relevant there.
      var isAbsGroup = item.options.length > 0 && item.options[0].value.indexOf('abs:') === 0;
      if (toggleApplies && isAbsGroup !== wantAbs) return;

      var visibleOpts = item.options.filter(function (o) {
        return o.value.indexOf('abs:') === 0
          ? available.absolute.has(o.value.slice(4))
          : available.relative.has(o.value);
      });
      if (!visibleOpts.length) return;

      if (toggleApplies) {
        // Single mode active: flatten, the optgroup label is redundant with the toggle
        visibleOpts.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.text;
          bandFilterEl.appendChild(opt);
        });
      } else {
        var grp = document.createElement('optgroup');
        grp.label = item.label;
        visibleOpts.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.text;
          grp.appendChild(opt);
        });
        bandFilterEl.appendChild(grp);
      }
    });

    var bandFilterLabelEl = document.getElementById('bandFilterLabel');
    if (bandFilterLabelEl) {
      bandFilterLabelEl.textContent = toggleApplies ? ('Band (' + (wantAbs ? 'Benchmark' : 'Peer') + ')') : 'Band';
    }

    // Reset to "All" only if the current selection is no longer in the available options
    var selectionExists = !currentValue || !!Array.from(bandFilterEl.options).find(function (o) { return o.value === currentValue; });
    if (!selectionExists) currentValue = '';
    state.bandFilter = currentValue;
    bandFilterEl.value = currentValue;

    if (bandFilterEl._customSelect) bandFilterEl._customSelect.rebuild();
  }

  document.getElementById('bandFilter').addEventListener('change', function (e) { state.bandFilter = e.target.value; refresh(); });

  // ========== REGION MULTI-SELECT ==========
  (function () {
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
      sorted.forEach(function (name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var lbl = document.createElement('span');
        lbl.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bakery-ms__sel-chip-remove';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.innerHTML = '&#x2715;';
        x.addEventListener('click', function (e) {
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
      availableOptions.forEach(function (name) {
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
        btn.addEventListener('click', function () { toggleRegion(name); });
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

    msTrigger.addEventListener('click', function () { isOpen ? closeDropdown() : openDropdown(); });
    msClearBtn.addEventListener('click', function () {
      selected.splice(0, selected.length);
      updateLabel();
      if (isOpen) { renderList(); renderSelected(); }
      onRegionChange();
    });
    document.addEventListener('click', function (e) {
      if (isOpen && !e.composedPath().some(function (el) { return el === msContainer; })) closeDropdown();
    });
    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { closeDropdown(); msTrigger.focus(); }
    });

    updateLabel();

    G.rebuildRegionMultiselect = function () {
      availableOptions = [...new Set(Object.values(G.BAKERY_META).map(function (v) { return v.r; }))].filter(function (r) { return r && r !== 'Other'; }).sort();
      for (var i = selected.length - 1; i >= 0; i--) {
        if (!availableOptions.includes(selected[i])) selected.splice(i, 1);
      }
      if (isOpen) renderList();
      updateLabel();
      renderSelected();
    };
  })();

  // ========== OPS MANAGER MULTI-SELECT ==========
  (function () {
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
        .filter(function (e) { return !regions.length || regions.includes(e[1].r); })
        .map(function (e) { return e[1].o; })
      )].filter(Boolean).sort();
    }

    function updateLabel() {
      if (!selected.length) { msLabel.textContent = 'All Areas'; }
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
      sorted.forEach(function (name) {
        var chip = document.createElement('span');
        chip.className = 'bakery-ms__sel-chip';
        var lbl = document.createElement('span');
        lbl.textContent = name;
        var x = document.createElement('button');
        x.type = 'button';
        x.className = 'bakery-ms__sel-chip-remove';
        x.setAttribute('aria-label', 'Remove ' + name);
        x.innerHTML = '&#x2715;';
        x.addEventListener('click', function (e) {
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
      var visible = q ? available.filter(function (o) { return o.toLowerCase().includes(q); }) : available;
      msList.innerHTML = '';
      visible.forEach(function (name) {
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
        btn.addEventListener('click', function () { toggleOps(name); });
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
      // Keep any selected bakeries that still belong to the now-selected ops areas
      if (selected.length) {
        var removed = false;
        for (var i = state.searchBakery.length - 1; i >= 0; i--) {
          if (!selected.includes(G.getBakeryOps(state.searchBakery[i]))) {
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
      msSearch.value = '';
      renderList('');
      renderSelected();
      msSearch.focus({ preventScroll: true });
    }

    function closeDropdown() {
      isOpen = false;
      msDropdown.style.display = 'none';
      msTrigger.setAttribute('aria-expanded', 'false');
      msTrigger.classList.remove('is-open');
    }

    msTrigger.addEventListener('click', function () { isOpen ? closeDropdown() : openDropdown(); });
    msSearch.addEventListener('input', function () { renderList(this.value); });
    msClearBtn.addEventListener('click', function () {
      selected.splice(0, selected.length);
      updateLabel();
      if (isOpen) { renderList(msSearch.value); renderSelected(); }
      onOpsChange();
    });
    document.addEventListener('click', function (e) {
      if (isOpen && !e.composedPath().some(function (el) { return el === msContainer; })) closeDropdown();
    });
    document.addEventListener('keydown', function (e) {
      if (isOpen && e.key === 'Escape') { closeDropdown(); msTrigger.focus(); }
    });

    updateLabel();

    G.rebuildOpsMultiselect = function () {
      var available = getAvailableOps();
      var prevLen = selected.length;
      for (var i = selected.length - 1; i >= 0; i--) {
        if (!available.includes(selected[i])) selected.splice(i, 1);
      }
      if (selected.length !== prevLen && selected.length) {
        // Some ops areas dropped out; keep only bakeries still under a selected ops area
        var removed = false;
        for (var j = state.searchBakery.length - 1; j >= 0; j--) {
          if (!selected.includes(G.getBakeryOps(state.searchBakery[j]))) {
            state.searchBakery.splice(j, 1);
            removed = true;
          }
        }
        if (removed && G.resetBakeryMultiselect) G.resetBakeryMultiselect();
      }
      if (isOpen) renderList(msSearch.value);
      updateLabel();
      renderSelected();
    };
  })();
  document.getElementById('sortBy').addEventListener('change', function () {
    var leagueTableBody = document.getElementById('tableBody');
    var leagueTable = leagueTableBody ? leagueTableBody.closest('table') : null;
    if (leagueTable) {
      delete leagueTable.dataset.sortCol0;
      delete leagueTable.dataset.sortAsc0;
      leagueTable.querySelectorAll('thead th').forEach(function (header) {
        header.classList.remove('sort-asc', 'sort-desc');
      });
    }
    refresh();
  });

  document.getElementById('rollingWindow').addEventListener('change', function () {
    state.selectedMonths = G.resolvePeriodMonths(this.value, state.MONTHS, state.ALL);
    document.getElementById('monthSelect').value = '';
    G.syncCustomSelect('monthSelect');
    refresh();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      activateDashboardTab(t.dataset.tab);
      scrollToTop();
    });
  });

  if (dashboardSidebarToggleBtn) {
    dashboardSidebarToggleBtn.addEventListener('click', function () {
      if (compactDashboardSidebarMedia.matches) {
        setDashboardSidebarOpen(false);
        return;
      }
      setDashboardSidebarCollapsed(dashboardWorkspaceShell.dataset.sidebarCollapsed !== 'true');
    });
  }

  if (dashboardSidebarOpenBtn) {
    dashboardSidebarOpenBtn.addEventListener('click', function () {
      setDashboardSidebarOpen(true);
    });
  }

  if (dashboardSidebarBackdrop) {
    dashboardSidebarBackdrop.addEventListener('click', function () {
      setDashboardSidebarOpen(false);
    });
  }

  if (compactDashboardSidebarMedia && compactDashboardSidebarMedia.addEventListener) {
    compactDashboardSidebarMedia.addEventListener('change', function () {
      syncGlobalIndexTogglePlacement();
      syncDashboardSidebarForViewport();
      syncDashboardKpis();
      renderHeaderSummary();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && compactDashboardSidebarMedia.matches && dashboardWorkspaceShell && dashboardWorkspaceShell.dataset.sidebarOpen === 'true') {
      setDashboardSidebarOpen(false);
    }
  });

  document.querySelectorAll('.dashboard-footer__link').forEach(function (link) {
    link.addEventListener('click', function () {
      var activePanel = activateDashboardTab(link.dataset.footerTab);
      if (activePanel) {
        scrollToTop();
      }
    });
  });

  document.querySelectorAll('.target-subtab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      activateTargetSubtab(tab.dataset.targetSubtab);
      if (window.matchMedia('(max-width: 980px)').matches) {
        scrollToTop();
      }
    });
  });

  // ========== INITIALISE FILE UPLOAD ==========
  // ── Mobile filter side panel ──
  var filterControlsPanel = document.getElementById('filterControlsPanel');
  var filterActiveBadge = document.getElementById('filterActiveBadge');
  var filterSideTab = document.getElementById('filterSideTab');
  var filterSideTabBadge = document.getElementById('filterSideTabBadge');
  var leagueTableFilterBtn = document.getElementById('leagueTableFilterBtn');
  var leagueTableFilterBadge = document.getElementById('leagueTableFilterBadge');
  var filterSideBackdrop = document.getElementById('filterSideBackdrop');
  var filterPanelClose = document.getElementById('filterPanelClose');
  var filterPanelCloseFab = document.getElementById('filterPanelCloseFab');
  var filterPanelReset = document.getElementById('filterPanelReset');
  var desktopFilterReset = document.getElementById('desktopFilterReset');
  var filterSidePanelOpen = false;
  var mobileFilterMedia = window.matchMedia('(max-width: 720px)');
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
    filterControlsPanel.querySelectorAll('.filter-select.is-open').forEach(function (wrapper) {
      wrapper.classList.remove('is-open');
      var trigger = wrapper.querySelector('.filter-select__trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    filterControlsPanel.querySelectorAll('.bakery-ms__trigger.is-open').forEach(function (trigger) {
      trigger.click();
    });
  }

  function resetAllFilters() {
    var monthSelect = document.getElementById('monthSelect');
    var rollingWindow = document.getElementById('rollingWindow');
    var bandFilter = document.getElementById('bandFilter');
    state.regionFilter.splice(0, state.regionFilter.length);
    state.opsFilter.splice(0, state.opsFilter.length);
    state.searchBakery.splice(0, state.searchBakery.length);
    state.bandFilter = '';

    if (rollingWindow) {
      rollingWindow.value = '1';
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

    state.selectedMonths = (state.MONTHS && state.MONTHS.length)
      ? G.resolvePeriodMonths(rollingWindow ? rollingWindow.value : '1', state.MONTHS, state.ALL)
      : [];

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
    if (leagueTableFilterBadge) {
      leagueTableFilterBadge.hidden = n === 0;
      if (n > 0) leagueTableFilterBadge.textContent = n;
    }
    if (filterPanelReset) filterPanelReset.disabled = n === 0;
    if (filterSideTab) { filterSideTab.classList.toggle('has-active-filters', n > 0); }
    if (leagueTableFilterBtn) { leagueTableFilterBtn.classList.toggle('has-active-filters', n > 0); }
    if (desktopFilterReset) { desktopFilterReset.classList.toggle('has-active-filters', n > 0); }
  }

  if (filterSideTab) {
    filterSideTab.addEventListener('pointerdown', function (event) {
      return; // Disable drag-to-open gesture for top sheet layout
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
    filterSideTab.addEventListener('pointermove', function (event) {
      if (!filterDragState || filterDragState.mode !== 'opening' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      if (!width) return;
      var deltaX = event.clientX - filterDragState.startX;
      var openedDistance = Math.max(0, Math.min(width, deltaX));
      filterDragState.distance = openedDistance;
      filterDragState.lastX = event.clientX;
      setFilterPanelDragOffset(width - openedDistance);
    });
    filterSideTab.addEventListener('pointerup', function (event) {
      if (!filterDragState || filterDragState.mode !== 'opening' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      var elapsed = Math.max(1, performance.now() - filterDragState.startTime);
      var velocity = filterDragState.distance / elapsed;
      var shouldOpen = filterDragState.distance > (width * 0.34) || velocity > 0.55;
      suppressFilterTabClick = filterDragState.distance > 8;
      filterDragState = null;
      shouldOpen ? openFilterSidePanel() : closeFilterSidePanel();
      window.setTimeout(function () { suppressFilterTabClick = false; }, 180);
    });
    filterSideTab.addEventListener('pointercancel', function (event) {
      if (!filterDragState || filterDragState.pointerId !== event.pointerId) return;
      filterDragState = null;
      closeFilterSidePanel();
    });
    filterSideTab.addEventListener('click', function () {
      if (suppressFilterTabClick) return;
      filterSidePanelOpen ? closeFilterSidePanel() : openFilterSidePanel();
    });
  }
  if (leagueTableFilterBtn) {
    leagueTableFilterBtn.addEventListener('click', function () {
      filterSidePanelOpen ? closeFilterSidePanel() : openFilterSidePanel();
    });
  }
  if (filterControlsPanel) {
    filterControlsPanel.addEventListener('pointerdown', function (event) {
      return; // Disable drag-to-close gesture for top sheet layout
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
    filterControlsPanel.addEventListener('pointermove', function (event) {
      if (!filterDragState || filterDragState.mode !== 'closing' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      if (!width) return;
      var deltaX = event.clientX - filterDragState.startX;
      var closeDistance = Math.max(0, Math.min(width, -deltaX));
      filterDragState.distance = closeDistance;
      filterDragState.lastX = event.clientX;
      setFilterPanelDragOffset(closeDistance);
    });
    filterControlsPanel.addEventListener('pointerup', function (event) {
      if (!filterDragState || filterDragState.mode !== 'closing' || filterDragState.pointerId !== event.pointerId) return;
      var width = getFilterPanelWidth();
      var elapsed = Math.max(1, performance.now() - filterDragState.startTime);
      var velocity = filterDragState.distance / elapsed;
      var shouldClose = filterDragState.distance > (width * 0.24) || velocity > 0.45;
      filterDragState = null;
      shouldClose ? closeFilterSidePanel() : openFilterSidePanel();
    });
    filterControlsPanel.addEventListener('pointercancel', function (event) {
      if (!filterDragState || filterDragState.pointerId !== event.pointerId) return;
      filterDragState = null;
      openFilterSidePanel();
    });
  }
  if (filterPanelClose) { filterPanelClose.addEventListener('click', closeFilterSidePanel); }
  if (filterPanelCloseFab) { filterPanelCloseFab.addEventListener('click', closeFilterSidePanel); }
  if (filterPanelReset) { filterPanelReset.addEventListener('click', resetAllFilters); }
  if (desktopFilterReset) { desktopFilterReset.addEventListener('click', resetAllFilters); }
  if (filterSideBackdrop) { filterSideBackdrop.addEventListener('click', closeFilterSidePanel); }
  document.addEventListener('click', function (event) {
    if (!mobileFilterMedia.matches || !filterSidePanelOpen || !filterControlsPanel) return;
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    var insidePanel = path.indexOf(filterControlsPanel) !== -1;
    var onTab = filterSideTab ? path.indexOf(filterSideTab) !== -1 : false;
    var onLeagueBtn = leagueTableFilterBtn ? path.indexOf(leagueTableFilterBtn) !== -1 : false;
    if (!insidePanel && !onTab && !onLeagueBtn) closeFilterSidePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && filterSidePanelOpen) { closeFilterSidePanel(); }
  });

  // Close side panel when viewport grows past mobile breakpoint
  if (mobileFilterMedia.addEventListener) {
    mobileFilterMedia.addEventListener('change', function (e) {
      if (!e.matches && filterSidePanelOpen) { closeFilterSidePanel(); }
    });
  }

  // ── Mobile filter sub-panel ──────────────────────────────────
  (function () {
    var subPanel = document.getElementById('filterSubPanel');
    var subTitle = document.getElementById('filterSubPanelTitle');
    var subBack = document.getElementById('filterSubPanelBack');
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
    filterControlsPanel.addEventListener('click', function (e) {
      if (!mobileFilterMedia.matches) return;
      var trigger = e.target.closest('.filter-select__trigger, .bakery-ms__trigger');
      if (!trigger) return;
      setTimeout(function () {
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
    filterControlsPanel.addEventListener('change', function () {
      if (!mobileFilterMedia.matches) return;
      setTimeout(function () {
        var stillOpen = filterControlsPanel.querySelector('.filter-select.is-open');
        if (!stillOpen) hideSubPanel();
      }, 0);
    });

    // Back button: close whatever is open, hide sub-panel
    subBack.addEventListener('click', function () {
      subPanelClosing = true;
      // bakery-ms: click trigger to toggle closed (isOpen=true → closeDropdown)
      filterControlsPanel.querySelectorAll('.bakery-ms__trigger.is-open').forEach(function (t) {
        t.click();
      });
      // filter-select: closeAll fires on document click propagation, but also close explicitly
      filterControlsPanel.querySelectorAll('.filter-select.is-open').forEach(function (w) {
        w.classList.remove('is-open');
        var t = w.querySelector('.filter-select__trigger');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
      hideSubPanel();
      setTimeout(function () { subPanelClosing = false; }, 60);
    });

    // When the main filter panel closes, also hide the sub-panel
    var panelObserver = new MutationObserver(function () {
      if (!filterControlsPanel.classList.contains('is-open')) hideSubPanel();
    });
    panelObserver.observe(filterControlsPanel, { attributes: true, attributeFilter: ['class'] });
  })();

  // Patch refresh to also sync the filter badge
  var originalRefresh = refresh;
  refresh = function () {
    originalRefresh();
    syncFilterBadge();
  };

  G.refreshDashboard = refresh;
  G.rebuildDashboardFilters = function () {
    rebuildRegionFilter();
    if (state.ALL.length > 0) refresh();
  };
  G.onBakeryMetaChanged = function () {
    G.rebuildDashboardFilters();
  };
  updateDashboardActiveView('overview');
  syncDashboardKpis('overview');
  syncDashboardSidebarForViewport();

  // Sync initial mobile filter tab visibility on startup
  var initialActiveTab = document.querySelector('.tab-content.active') ? document.querySelector('.tab-content.active').id.replace(/^tab-/, '') : 'overview';
  var initialMobileFilterTab = document.getElementById('filterSideTab');
  if (initialMobileFilterTab) {
    if (initialActiveTab === 'table' || initialActiveTab === 'visit-log') {
      initialMobileFilterTab.style.setProperty('display', 'none', 'important');
    } else {
      initialMobileFilterTab.style.display = '';
    }
  }

  G.initUpload(initDashboard);
})();

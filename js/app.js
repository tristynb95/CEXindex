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
  // Bottom-nav quick-access popover: reuses the sidebar's own submenu panels
  // (see openDashboardNavPopoverFor) rather than duplicating their buttons,
  // so there is exactly one set of listeners for Focus Bakeries / Bakery
  // Reports subviews regardless of which trigger opened them.
  var dashboardNavPopoverHost = document.createElement('div');
  dashboardNavPopoverHost.className = 'dashboard-nav-popover-host';
  document.body.appendChild(dashboardNavPopoverHost);
  var openDashboardNavPopover = null;
  var dashboardTabLabels = {
    overview: 'Overview',
    trends: 'Trends',
    table: 'League Table',
    map: 'Map',
    target: 'Focus Bakeries',
    speed: 'Speed vs NPS',
    cei: 'Coffee Experience Index Methodology',
    feedback: 'Comment Cloud',
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
  var BENCHMARK_MEETING_SCORE = 75;
  var BENCHMARK_SCORE_PARTS = [
    { label: 'Drink quality', weightKey: 'dr' },
    { label: 'Customer-rated efficiency', weightKey: 'ef' },
    { label: 'Friendliness', weightKey: 'fr' },
    { label: 'Drink + Meal NPS', weightKey: 'nps' },
    { label: 'Coffee efficiency', weightKey: 'time' },
    { label: 'Average wait time', weightKey: 'at' }
  ];

  function benchmarkComponentScore(record, weightKey) {
    if (!record) return null;
    if (weightKey === 'time') {
      return typeof record.ats === 'number' && !isNaN(record.ats)
        ? record.ats
        : G.computeCoffeeEfficiencyComponent(record.s2, record.s3, record.s4, record.o5);
    }
    if (weightKey === 'at') {
      return typeof record.a_at === 'number' && !isNaN(record.a_at)
        ? record.a_at
        : G.computeAbsoluteWaitComponent(record.at);
    }
    var sourceKey = weightKey === 'nps' ? 'n' : weightKey;
    return G.computeAbsoluteComponent(
      record[sourceKey],
      G.BENCHMARKS[weightKey],
      G.BENCHMARK_FLOORS[weightKey]
    );
  }

  function benchmarkScoreInfoHtml(records, publishedScore) {
    var scoredRecords = Array.isArray(records) ? records : [];
    var rawScore = 0;
    var scoreRows = BENCHMARK_SCORE_PARTS.map(function (part) {
      var weight = G.CEI_WEIGHTS && G.CEI_WEIGHTS[part.weightKey];
      var percentage = typeof weight === 'number' ? Math.round(weight * 100) + '%' : '\u2014';
      var points = null;
      if (scoredRecords.length && typeof weight === 'number') {
        points = scoredRecords.reduce(function (sum, record) {
          return sum + benchmarkComponentScore(record, part.weightKey) * weight;
        }, 0) / scoredRecords.length;
        rawScore += points;
      }
      var pointsText = points === null ? '\u2014' : points.toFixed(1);
      return '<li><span class="kpi-info__measure">' + part.label + '</span>'
        + '<span class="kpi-info__weight" aria-label="Weight ' + percentage + '">' + percentage + '</span>'
        + '<span class="kpi-info__points" aria-label="Points earned ' + pointsText + '">' + pointsText + '</span></li>';
    }).join('');
    var hasPublishedScore = typeof publishedScore === 'number' && !isNaN(publishedScore);
    var volumeAdjustment = hasPublishedScore && scoredRecords.length ? publishedScore - rawScore : 0;
    var adjustmentRow = Math.abs(volumeAdjustment) >= 0.05
      ? '<li class="kpi-info__adjustment"><span>Volume adjustment</span><span aria-hidden="true">\u2014</span><span class="kpi-info__adjustment-value">'
        + (volumeAdjustment > 0 ? '+' : '') + volumeAdjustment.toFixed(1) + '</span></li>'
      : '';
    return '<details class="kpi-info">'
      + '<summary aria-label="How the Benchmark Score is calculated"><span aria-hidden="true">i</span></summary>'
      + '<div class="kpi-info__panel">'
      + '<strong>How the score works</strong>'
      + '<p>Six results make one score out of 100.</p>'
      + '<div class="kpi-info__columns" aria-hidden="true"><span></span><span>Weight</span><span>Points</span></div>'
      + '<ul class="kpi-info__weights" aria-label="Score weight and points breakdown">' + scoreRows + adjustmentRow
      + '<li class="kpi-info__total"><span>Score</span><span aria-hidden="true"></span><strong>'
      + (hasPublishedScore ? publishedScore.toFixed(1) : '\u2014') + '</strong></li>'
      + '</ul>'
      + '<p class="kpi-info__target"><strong>' + BENCHMARK_MEETING_SCORE + '+</strong> means Meeting.</p>'
      + '<a class="kpi-info__link" href="#cei" data-benchmark-methodology>View the full methodology <span aria-hidden="true">\u2192</span></a>'
      + '</div>'
      + '</details>';
  }
  // Shared with the Focus Bakery modal's own Score info icon (js/targets.js),
  // so both breakdowns come from the exact same weighting/points logic.
  G.benchmarkComponentScore = benchmarkComponentScore;
  G.benchmarkScoreInfoHtml = benchmarkScoreInfoHtml;


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

  // Which Focus sub-tab is showing. The period controls are locked across the
  // whole Focus tab, the map included, because its scoring always spans all
  // completed history \u2014 a period control that cannot move a single score reads
  // as broken, so the map answers "visited" over that same all-history window.
  var activeTargetSubtab = 'summary';
  // The dashboard's own period, parked while the Focus map holds the selection
  // at all time, so leaving the map puts every other tab back on the period the
  // user chose there. Null whenever the map is not holding it.
  var focusMapPeriodMemo = null;

  function applyPeriodSelection(month, rolling) {
    var monthSelect = document.getElementById('monthSelect');
    var rollingWindow = document.getElementById('rollingWindow');
    if (!monthSelect || !rollingWindow) return;
    monthSelect.value = month || '';
    rollingWindow.value = rolling;
    state.selectedMonths = month
      ? [month]
      : G.resolvePeriodMonths(rolling, state.MONTHS, state.ALL);
    G.syncCustomSelect(monthSelect);
    G.syncCustomSelect(rollingWindow);
    refresh();
  }

  function syncFocusPeriodControls(tabName) {
    var name = tabName;
    if (!name) {
      var activePanel = document.querySelector('.tab-content.active');
      name = activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview';
    }
    var onFocusMap = name === 'target' && activeTargetSubtab === 'map';
    setFocusPeriodControls(name === 'target');

    if (onFocusMap && !focusMapPeriodMemo) {
      var monthSelect = document.getElementById('monthSelect');
      var rollingWindow = document.getElementById('rollingWindow');
      focusMapPeriodMemo = {
        month: monthSelect ? monthSelect.value : '',
        rolling: rollingWindow ? rollingWindow.value : '1'
      };
      // The map runs on the widest view \u2014 every month, no single month \u2014 so
      // "visited" means "ever", matching the All Time label the locked controls
      // show and the all-history basis of the Focus scores themselves.
      applyPeriodSelection('', '0');
    } else if (!onFocusMap && focusMapPeriodMemo) {
      var memo = focusMapPeriodMemo;
      focusMapPeriodMemo = null;
      applyPeriodSelection(memo.month, memo.rolling);
    }
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

  // Chip markup and the funnel live in js/utils.js — Bakery Reports renders
  // into the same #headerSub and must produce identical chips.
  var headerPill = G.headerPill;
  var HEADER_FILTER_BTN = G.HEADER_FILTER_BTN;
  var HEADER_RESET_BTN = G.HEADER_RESET_BTN;

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
    pills.push(headerPill('header-pill-core', 'period', coreConfigText, false));

    // Optional bubble: View — only on the tabs the toggle actually governs,
    // and only when it's grouping (its "Bakeries" default needs no chip).
    if (DASHBOARD_VIEW_SCOPED_TABS[currentTab] && state.dashboardView !== 'bakeries') {
      var viewText = 'View: ' + (state.dashboardView === 'region' ? 'Regions' : 'Ops Areas');
      pills.push(headerPill('header-pill-filter', 'view', viewText, true));
    }

    // Optional bubble: Region
    var selRegions = state.regionFilter || [];
    if (selRegions.length > 0) {
      var rText = selRegions.length === 1 ? selRegions[0] : selRegions.length + ' Regions';
      var rTooltip = selRegions.length > 1 ? 'Selected regions: ' + selRegions.join(', ') : '';
      pills.push(headerPill('header-pill-filter', 'region', rText, true, rTooltip));
    }

    // Optional bubble: Area (Ops Area)
    var selOps = state.opsFilter || [];
    if (selOps.length > 0) {
      var oText = selOps.length === 1 ? selOps[0] : selOps.length + ' Areas';
      var oTooltip = selOps.length > 1 ? 'Selected ops areas: ' + selOps.join(', ') : '';
      pills.push(headerPill('header-pill-filter', 'ops', oText, true, oTooltip));
    }

    // Optional bubble: Bakery
    var selBakeries = state.searchBakery || [];
    if (selBakeries.length > 0) {
      var bText = selBakeries.length === 1 ? selBakeries[0] : selBakeries.length + ' Bakeries';
      var bTooltip = selBakeries.length > 1 ? 'Selected bakeries: ' + selBakeries.join(', ') : '';
      pills.push(headerPill('header-pill-filter', 'bakery', bText, true, bTooltip));
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
      var bandKey = bandVal.indexOf('abs:') === 0 ? bandVal.slice(4) : bandVal;
      var bandText = 'Band: ' + (bandLabels[bandKey] || bandKey);
      pills.push(headerPill('header-pill-filter', 'band', bandText, true));
    }

    // Period/Month live in the core pill, not a clearable chip, and are
    // deliberately left out of this — Reset here is scoped to the filter
    // chips only, not the time window.
    var showReset = G.hasActiveFilterPills && G.hasActiveFilterPills(pills);
    headerSub.innerHTML = prefix +
      '<span class="header-sub-pillwrap">' +
      pills.join('') +
      HEADER_FILTER_BTN +
      (showReset ? HEADER_RESET_BTN : '') +
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

    if (currentTab === 'overview' || currentTab === 'target' || currentTab === 'map' ||
        currentTab === 'table' || currentTab === 'trends' || currentTab === 'speed') {
      container.style.display = '';
      label.textContent = 'Benchmark Score';
    } else {
      container.style.display = 'none';
    }
  }

  function syncMobileFilterIndexLabel() {
    var filterTab = document.getElementById('filterSideTab');
    var filterTabLabel = document.getElementById('filterSideTabLabel');
    var indexLabel = 'Filters';
    if (filterTabLabel) filterTabLabel.textContent = indexLabel;
    if (filterTab) filterTab.setAttribute('aria-label', 'Open dashboard filters');
  }

  syncMobileFilterIndexLabel();

  // The five tabs whose data is scoped by the shared Period/Month filter.
  // Their heading names the period in view, mirroring Bakery Reports' own
  // Visit History / Unvisited Sites titles (js/visit-report.js).
  var periodScopedTabTitleEls = {
    overview: null, // shares #sectionPageTitle, resolved lazily below
    trends: null,   // shares #sectionPageTitle, resolved lazily below
    table: 'leagueTableSectionTitle',
    map: 'mapSectionTitle',
    feedback: 'feedbackSectionTitle'
  };

  // #monthSelect pins one explicit month and always wins over #rollingWindow
  // (picking either resets the other — see their change listeners below).
  function getDashboardPeriodLabel() {
    var monthEl = document.getElementById('monthSelect');
    if (monthEl && monthEl.value) return monthEl.value;
    var periodEl = document.getElementById('rollingWindow');
    var opt = periodEl ? periodEl.options[periodEl.selectedIndex] : null;
    return opt ? opt.textContent : '';
  }

  function syncPeriodScopedTitle(name) {
    if (!(name in periodScopedTabTitleEls)) return;
    var base = dashboardTabLabels[name] || name;
    var periodLabel = getDashboardPeriodLabel();
    var elId = periodScopedTabTitleEls[name];
    var el = elId ? document.getElementById(elId) : sectionPageTitle;
    if (!el) return;
    // The period half is a button so the title doubles as a shortcut into
    // the Period control, rather than making people hunt for the funnel.
    el.innerHTML = escapeHtml(base) + ' - <button type="button" class="section-title-period" ' +
      'data-open-period-filter aria-label="' + escapeHtml('Change period: ' + periodLabel) + '">' +
      escapeHtml(periodLabel) + '</button>';
  }

  // Region/Ops/Bakery open their own multiselect trigger button directly.
  // Period/Band/View are native <select>s that G.syncCustomSelect wraps in a
  // .filter-select at runtime, so those go through its trigger/menu instead.
  // #monthSelect pins the exact date, #rollingWindow the rolling window —
  // whichever the current label came from is the one worth opening for 'period'.
  function findHeaderFilterTrigger(key) {
    if (key === 'region') return document.getElementById('regionMsTrigger');
    if (key === 'ops') return document.getElementById('opsMsTrigger');
    if (key === 'bakery') return document.getElementById('bakeryMsTrigger');
    var selectId = key === 'period'
      ? null
      : key === 'band' ? 'bandFilter' : key === 'view' ? 'dashboardView' : null;
    var target = key === 'period'
      ? (function () {
        var monthEl = document.getElementById('monthSelect');
        return (monthEl && monthEl.value) ? monthEl : document.getElementById('rollingWindow');
      })()
      : (selectId ? document.getElementById(selectId) : null);
    var wrapper = target && target.closest('.filter-select');
    return wrapper ? wrapper.querySelector('.filter-select__trigger') : null;
  }

  // Opens the filter drawer, if it isn't already, then jumps straight to the
  // control for `key` (the chip that was clicked) instead of leaving people to
  // hunt for it in the drawer themselves.
  function openHeaderFilterControl(key) {
    var wasOpen = filterSidePanelOpen;
    openFilterSidePanel();

    function clickTrigger() {
      var trigger = findHeaderFilterTrigger(key);
      if (!trigger || trigger.disabled) return;
      if (trigger.scrollIntoView) trigger.scrollIntoView({ block: 'nearest' });
      trigger.click();
    }

    // On desktop the panel slides in under a CSS transform transition, and
    // the dropdown's fixed position (GAILS.mountDrawerMenus) is computed from
    // the trigger's live bounding rect the moment it opens. Clicking on the
    // very next frame — before that slide-in settles — freezes the menu at
    // the trigger's still-hidden, mid-transition position instead of its
    // final spot under the row. Waiting for the panel's own transition (with
    // a timeout fallback in case it was already open, so nothing transitions)
    // keeps this consistent with opening the panel by hand and clicking the
    // control afterwards.
    if (filterControlsPanel && !wasOpen && window.matchMedia('(min-width: 721px)').matches) {
      var settled = false;
      var fallback;
      var onTransitionEnd = function (e) {
        if (e.target !== filterControlsPanel || e.propertyName !== 'transform') return;
        finish();
      };
      function finish() {
        if (settled) return;
        settled = true;
        filterControlsPanel.removeEventListener('transitionend', onTransitionEnd);
        clearTimeout(fallback);
        requestAnimationFrame(clickTrigger);
      }
      filterControlsPanel.addEventListener('transitionend', onTransitionEnd);
      fallback = setTimeout(finish, 360);
    } else {
      requestAnimationFrame(clickTrigger);
    }
  }

  function updateDashboardActiveView(name) {
    if (dashboardActiveViewLabel) {
      dashboardActiveViewLabel.textContent = dashboardTabLabels[name] || name;
    }
    if (sectionPageTitle) {
      sectionPageTitle.textContent = dashboardTabLabels[name] || name;
    }
    syncPeriodScopedTitle(name);
    updateDashboardActiveIndex(name);
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
    closeDashboardNavPopover();
    dashboardWorkspaceShell.dataset.sidebarOpen = open ? 'true' : 'false';
    // Lets the floating filter FAB (and its sheet) drop behind the nav
    // drawer via CSS — those sit at a higher z-index than the drawer so it
    // can float above filter controls when both are closed, which would
    // otherwise leave the FAB visible/tappable over an open drawer.
    document.body.classList.toggle('dashboard-nav-open', !!open);
    syncDashboardSidebarControls();
  }

  function setDashboardSidebarCollapsed(collapsed) {
    if (!dashboardWorkspaceShell) return;
    desktopDashboardSidebarCollapsed = !!collapsed;
    dashboardWorkspaceShell.dataset.sidebarCollapsed = desktopDashboardSidebarCollapsed ? 'true' : 'false';
    syncDashboardSidebarControls();
  }

  // The two menu branches share one accordion state. Updating every branch in
  // one pass guarantees that opening Focus Bakeries always closes Bakery
  // Reports, and vice versa, while keeping the ARIA state in sync with what is
  // visibly rendered.
  function setDashboardNavAccordion(name) {
    document.querySelectorAll('[data-nav-accordion]').forEach(function (branch) {
      var isOpen = !!name && branch.dataset.navAccordion === name;
      var toggle = branch.querySelector('[data-nav-accordion-toggle]');
      var panel = branch.querySelector('[data-nav-accordion-panel]');
      branch.dataset.navAccordionOpen = isOpen ? 'true' : 'false';
      if (toggle) toggle.setAttribute('aria-expanded', String(isOpen));
      if (panel) panel.hidden = !isOpen;
    });
  }

  function clearInactiveDashboardSubmenuHighlights(activeTabName) {
    document.querySelectorAll('[data-nav-accordion]').forEach(function (branch) {
      if (branch.dataset.navAccordion === activeTabName) return;
      branch.querySelectorAll('.target-subtab.active').forEach(function (button) {
        button.classList.remove('active');
      });
    });
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

  // Positions a popover panel above the bottom-nav icon that opened it,
  // clamped to the viewport, and points its arrow back at the icon's center.
  function positionDashboardNavPopover(panel, trigger) {
    var r = trigger.getBoundingClientRect();
    panel.style.left = '0px';
    panel.style.bottom = (window.innerHeight - r.top + 10) + 'px';
    var panelWidth = panel.offsetWidth;
    var maxLeft = Math.max(10, window.innerWidth - panelWidth - 10);
    var left = Math.min(Math.max(10, r.left + r.width / 2 - panelWidth / 2), maxLeft);
    panel.style.left = left + 'px';
    var arrowLeft = Math.min(Math.max(18, r.left + r.width / 2 - left), panelWidth - 18);
    panel.style.setProperty('--popover-arrow-left', arrowLeft + 'px');
  }

  function onDashboardNavPopoverOutsideClick(event) {
    if (!openDashboardNavPopover) return;
    if (openDashboardNavPopover.panel.contains(event.target) ||
      openDashboardNavPopover.trigger.contains(event.target)) return;
    closeDashboardNavPopover();
  }

  function onDashboardNavPopoverEscape(event) {
    if (event.key === 'Escape') closeDashboardNavPopover();
  }

  // Bottom-nav popovers borrow the sidebar's own submenu panel for the
  // duration they're open (see the doc comment on openDashboardNavPopover
  // above) and hand it back to its original spot in the drawer on close, so
  // the accordion in the full drawer is never left without its panel.
  function closeDashboardNavPopover() {
    if (!openDashboardNavPopover) return;
    var open = openDashboardNavPopover;
    openDashboardNavPopover = null;
    open.panel.classList.remove('dashboard-nav__submenu--popover');
    open.panel.style.cssText = '';
    open.panel.hidden = true;
    if (open.anchorNext && open.anchorNext.parentNode === open.anchorParent) {
      open.anchorParent.insertBefore(open.panel, open.anchorNext);
    } else {
      open.anchorParent.appendChild(open.panel);
    }
    open.trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDashboardNavPopoverOutsideClick, true);
    document.removeEventListener('keydown', onDashboardNavPopoverEscape, true);
    window.removeEventListener('resize', closeDashboardNavPopover);
  }

  function openDashboardNavPopoverFor(name, trigger) {
    var panelId = name === 'target' ? 'dashboardNavTargetSubmenu' : 'visitLogViewToggle';
    var panel = document.getElementById(panelId);
    if (!panel) return;
    openDashboardNavPopover = {
      name: name,
      panel: panel,
      anchorParent: panel.parentNode,
      anchorNext: panel.nextSibling,
      trigger: trigger
    };
    dashboardNavPopoverHost.appendChild(panel);
    panel.hidden = false;
    panel.classList.add('dashboard-nav__submenu--popover');
    positionDashboardNavPopover(panel, trigger);
    trigger.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onDashboardNavPopoverOutsideClick, true);
    document.addEventListener('keydown', onDashboardNavPopoverEscape, true);
    window.addEventListener('resize', closeDashboardNavPopover);
  }

  function toggleDashboardNavPopover(name, trigger) {
    if (openDashboardNavPopover && openDashboardNavPopover.name === name) {
      closeDashboardNavPopover();
      return;
    }
    closeDashboardNavPopover();
    openDashboardNavPopoverFor(name, trigger);
  }

  function activateTargetSubtab(name, options) {
    var workspace = document.getElementById('targetTabWorkspace');
    if (!workspace) return;
    var shouldScrollNav = !(options && options.scrollNav === false);
    activeTargetSubtab = name;
    document.body.dataset.targetSubtab = name;
    document.querySelectorAll('.target-subtab[data-target-subtab]').forEach(function (btn) {
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
    // After the panel is on screen: entering or leaving the map re-renders
    // through applyPeriodSelection, and only an active panel redraws markers.
    syncFocusPeriodControls();
    // The period stops counting as a filter the moment it locks, so the badge
    // and Reset have to be re-read on the way in and out of the map.
    syncFilterBadge();
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

  function activateDashboardTab(name, options) {
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
    clearInactiveDashboardSubmenuHighlights(name);
    document.querySelectorAll('.dashboard-footer__link').forEach(function (link) {
      link.classList.toggle('active', link.dataset.footerTab === name);
    });
    document.querySelectorAll('.tab-content').forEach(function (panel) {
      panel.classList.toggle('active', panel === activePanel);
    });
    // As soon as the panel is on screen and before anything reads what its
    // render publishes — the sub-tab reset below picks a panel to size, and
    // renderHeaderSummary() further down takes the Focus bakery count off
    // G._focusDataContext.
    var flushedPanel = flushPendingPanel(name);
    if (name === 'target' && previousName && previousName !== 'target') {
      activateTargetSubtab('summary', { scrollNav: false });
      if (G.resetFocusSearch) G.resetFocusSearch();
    }
    var enteringVisitLog = name === 'visit-log' && previousName && previousName !== 'visit-log';
    if (enteringVisitLog && G.resetVisitLogView) {
      G.resetVisitLogView();
    }
    updateDashboardActiveView(name);
    syncDashboardKpis(name);
    syncFocusPeriodControls(name);
    syncDashboardViewFilterAvailability();
    renderHeaderSummary();
    updateBandFilterOptions();
    // View counts as a filter only on the tabs it governs, and Period only
    // where it is unlocked, so the badge and Reset are tab-dependent.
    syncFilterBadge();

    // The two page-level filter bars swap: Bakery Reports filters its own data,
    // so it hides the shared bar and shows its own in the same slot above the
    // sidebar + content shell.
    var filterBar = document.querySelector('.filter-bar');
    if (filterBar) {
      filterBar.classList.toggle('filter-bar--hidden', name === 'visit-log');
    }
    var visitLogFilterBar = document.querySelector('.visit-log-filter-bar');
    if (visitLogFilterBar) {
      visitLogFilterBar.classList.toggle('visit-log-filter-bar--visible', name === 'visit-log');
    }

    // Visit Log carries its own standalone filters, so the shared panel — and
    // the tab that opens it — has nothing to offer there. Every other view,
    // League Table included, keeps the floating tab.
    var mobileFilterTab = document.getElementById('filterSideTab');
    if (mobileFilterTab) {
      if (name === 'visit-log') {
        mobileFilterTab.style.setProperty('display', 'none', 'important');
      } else {
        mobileFilterTab.style.display = '';
      }
    }

    if (compactDashboardSidebarMedia.matches && !(options && options.keepSidebarOpen)) {
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

    // A panel drawn from a pending render builds its charts at the size they
    // already have, so resizing them in the same breath is wasted work. Trends
    // skipped this line for that reason back when it was the only panel that
    // deferred; every deferred panel now skips it on the same grounds.
    if (!flushedPanel) resizeChartsSoon(activePanel);
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
      return G.isSelectedBakery(r.b, state.searchBakery);
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

  // ========== OVERVIEW BAND HEIGHT ==========
  // The overview chart cards stand exactly two KPI cards tall. KPI cards size
  // to their content — a title that wraps at a narrower viewport adds a line
  // to all eight, since the row is grid-auto-rows: 1fr — so the figure can't
  // be a constant in the stylesheet. Measure one card and publish it; the CSS
  // falls back to a laptop-width value until this first runs.
  function publishKpiBlockHeight() {
    if (!dashboardKpiRow) return;
    var card = dashboardKpiRow.querySelector('.kpi');
    if (!card) return;
    var gap = parseFloat(window.getComputedStyle(dashboardKpiRow).rowGap) || 0;
    var height = card.getBoundingClientRect().height * 2 + gap;
    if (!height) return;
    document.documentElement.style.setProperty('--kpi-block-h', Math.round(height) + 'px');
  }

  if (dashboardKpiRow && window.ResizeObserver) {
    new ResizeObserver(function () {
      fitKpiValues();
      publishKpiBlockHeight();
    }).observe(dashboardKpiRow);
  } else {
    window.addEventListener('resize', function () {
      fitKpiValues();
      publishKpiBlockHeight();
    });
  }

  // ========== DEFERRED PANEL RENDERS ==========
  // Overview aside, only one panel is ever on screen, but a refresh used to
  // render all of them — and these four are the expensive ones, because each
  // builds Chart.js instances (the Focus panel alone builds four named charts
  // plus a sparkline per focus bakery). Changing a filter while looking at the
  // Overview paid for every one of them.
  //
  // So a refresh renders the panel you are looking at and remembers the rest as
  // a closure over the data it would have drawn; opening one of those panels
  // draws it from that closure. Nothing outside a panel reads what its render
  // produces, with one exception noted on flushPendingPanel below.
  var pendingPanelRenders = {};

  // Takes { panelName: function () { ...render... } }. The closure form matters:
  // the two refresh paths hand the Focus panel different arguments, and a
  // deferred render has to draw what its own refresh would have drawn.
  function renderOrDeferPanels(renderers) {
    Object.keys(renderers).forEach(function (name) {
      var panel = document.getElementById('tab-' + name);
      delete pendingPanelRenders[name];
      if (panel && panel.classList.contains('active')) renderers[name]();
      else pendingPanelRenders[name] = renderers[name];
    });
    warmPendingPanels();
  }

  // Deferring alone would only move the cost, and move it the wrong way: a
  // hidden panel renders cheaply because the browser skips layout for
  // display:none, while the same render against a visible panel costs several
  // times more. Left to be drawn on the click that reveals it, the Focus panel
  // turns a filter change from slow into instant and a tab click into a stall.
  //
  // So the postponed renders are also drawn during the first idle moment after
  // the refresh, while they are still hidden and still cheap. The interaction
  // gets its frame back, the work still happens off the critical path, and
  // opening the panel finds it already drawn. Same idea as the library warming
  // in js/lazy-lib.js.
  //
  // The token is how a superseded warm is abandoned: filters changed in quick
  // succession leave only the last one to draw, which is less work than the
  // unconditional render this replaced, not more.
  var warmToken = 0;

  function warmPendingPanels() {
    var token = ++warmToken;
    var idle = window.requestIdleCallback || function (fn) { return window.setTimeout(fn, 200); };
    idle(function () {
      if (token !== warmToken) return;
      Object.keys(pendingPanelRenders).forEach(function (name) {
        var render = pendingPanelRenders[name];
        // Cleared before drawing, so opening the panel mid-warm doesn't draw twice.
        delete pendingPanelRenders[name];
        render();
      });
    }, { timeout: 2000 });
  }

  // Focus is drawn on the spot rather than on the next frame because
  // renderHeaderSummary(), a few lines further down activateDashboardTab, reads
  // the bakery count off the G._focusDataContext that renderTargets publishes —
  // and nothing would redraw the header afterwards. The invariant this keeps is
  // that G._focusDataContext is current whenever the Focus panel is on screen.
  //
  // The rest go on the next frame, as the Trends panel always has: it lets the
  // tab switch paint before the charts are built, and no other view reads
  // anything they produce.
  //
  // Returns whether this panel had a render waiting for it.
  function flushPendingPanel(name) {
    var render = pendingPanelRenders[name];
    if (!render) return false;
    delete pendingPanelRenders[name];
    if (name === 'target') render();
    else requestAnimationFrame(render);
    return true;
  }

  // ========== REFRESH ==========
  function refresh() {
    if (state.ALL.length === 0) return;
    updateDashboardActiveIndex();
    updateBandFilterOptions();
    // Period/Month filter changes call refresh() directly, without going
    // through updateDashboardActiveView, so the active tab's period-scoped
    // title needs its own sync here to stay live.
    var activePanel = document.querySelector('.tab-content.active');
    syncPeriodScopedTitle(activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview');
    var data = G.getData();
    var scoredData = data.filter(function (r) { return r && !r.noData; });
    var n = scoredData.length;
    updateHeaderSummary(data.length);
    // League Table / Overview / (part of) Trends read this instead of `data`
    // directly, so the View toggle (Bakeries/Ops Areas/Regions) only ever
    // touches those three — the Map, Focus Bakeries, Speed vs NPS, and the
    // word cloud keep working off individual bakeries regardless of its
    // setting (a marker's position is a bakery's, not a group's, so the Map
    // is fixed to Bakery rather than plotting a synthetic centroid).
    var viewData = state.dashboardView === 'bakeries' ? data : G.getGroupedViewData(state.dashboardView);
    var scoredViewData = viewData === data ? scoredData : viewData.filter(function (r) { return r && !r.noData; });
    G.storeDashboardMapData(data);
    if (data.length === 0 || n === 0) {
      // Two rows of four: Benchmark leads the SHINE trio, NPS leads the KV Link trio.
      var dashMetrics = [
        { eyebrow: 'Index', title: 'Benchmark Score', meta: 'Target: ' + BENCHMARK_MEETING_SCORE, primary: true, info: true }
      ];
      dashMetrics.push(
        { eyebrow: 'SHINE', title: 'Drink Quality', meta: 'Target: 90%' },
        { eyebrow: 'SHINE', title: 'Efficiency', meta: 'Target: 90%' },
        { eyebrow: 'SHINE', title: 'Friendliness', meta: 'Target: 90%' },
        { eyebrow: 'NPS', title: 'NPS (Drink & Meal)', meta: 'Target: 55', primary: true },
        { eyebrow: 'KV Link', title: 'Coffee Efficiency', meta: 'Target: 70% < 2 min' },
        { eyebrow: 'KV Link', title: 'Avg Wait Time', meta: 'Target: ≤ 2:00' },
        { eyebrow: 'KV Link', title: 'Orders >5 Min', meta: 'Target: < 1%' }
      );
      dashboardKpiRow.innerHTML = dashMetrics.map(function (metric) {
        return '<article class="kpi kpi-muted' + (metric.info ? ' kpi--has-info' : '') + '">'
          + (metric.info ? benchmarkScoreInfoHtml() : '')
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
      publishKpiBlockHeight();
      G.renderOverviewCharts(viewData);
      G._lastData = data;
      renderOrDeferPanels({
        trends: function () { G.renderTrendCharts(scoredViewData); },
        speed: function () { G.renderSpeedCharts(scoredData); },
        table: function () { G.renderLeagueTable(viewData); },
        // The no-data path has always drawn Focus from the scored rows.
        target: function () { G.renderTargets(scoredData); }
      });
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
        primary: !!config.primary,
        info: !!config.info
      };
    };
    // scoredData, not scoredViewData — the headline row answers "how is the
    // estate in scope performing", and that is one number per metric however
    // the rows below happen to be grouped. Averaging the group rows instead
    // made it a mean of means, so the same bakeries read differently in each
    // view: three ops areas of 12, 9 and 2 bakeries each counted a third,
    // letting the two-bakery area pull the headline as hard as the twelve.
    // The View toggle changes the granularity of the table and scatter below,
    // not the population the KPI row describes.
    var nps = G.avg(scoredData, 'n');
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
    var cards = [
      buildMetricCard({
        value: acei,
        compare: Math.round(acei),
        display: Math.round(acei).toString(),
        eyebrow: 'Index',
        title: 'Benchmark Score',
        meta: 'Target: ' + BENCHMARK_MEETING_SCORE,
        priorKey: 'ac',
        bands: [
          { test: function (val) { return val > 92; }, tone: 'kpi-blue', status: 'Exceeding' },
          { test: function (val) { return val >= BENCHMARK_MEETING_SCORE; }, tone: 'kpi-green', status: 'Meeting' },
          { test: function (val) { return val >= 60; }, tone: 'kpi-amber', status: 'Approaching' },
          { test: function (val) { return val < 60; }, tone: 'kpi-red', status: 'Below Standard' }
        ],
        labels: { good: 'Meeting', warn: 'Approaching', bad: 'Below Standard' },
        primary: true,
        info: true
      })
    ];

    // Two rows of four: Benchmark leads the SHINE trio, NPS leads the KV Link trio.
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
      return '<article class="kpi ' + metric.tone + (metric.info ? ' kpi--has-info' : '') + '">'
        + (metric.info ? benchmarkScoreInfoHtml(scoredData, acei) : '')
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
    publishKpiBlockHeight();

    // Second argument is the bakery-level cohort: the band split and scatter
    // plot whatever rows the View toggle selected, but the two component
    // charts are estate averages and have to agree with the KPI row above them.
    G.renderOverviewCharts(viewData, scoredData);
    G._lastData = data;
    renderOrDeferPanels({
      trends: function () { G.renderTrendCharts(scoredViewData); },
      speed: function () { G.renderSpeedCharts(scoredData); },
      table: function () { G.renderLeagueTable(viewData); },
      target: function () { G.renderTargets(data); }
    });
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

  function revealDashboardContent() {
    var dashboardContent = document.getElementById('dashboardContent');
    if (dashboardContent) dashboardContent.style.removeProperty('display');
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
    // A new dataset invalidates the cached period aggregate. Replacing
    // state.ALL is already the signal the cache watches for; saying so here
    // keeps that from being an implicit contract between two files.
    if (G.invalidateCompanyPeriodData) G.invalidateCompanyPeriodData();
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
    revealDashboardContent();

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

  // ========== DASHBOARD VIEW SELECT (Bakeries / Ops Areas / Regions) ==========
  // Only League Table, Trends and Overview read state.dashboardView (via
  // refresh()'s viewData) — every other tab keeps working off individual
  // bakeries regardless of this setting. The Map and Comment Cloud are
  // fixed to Bakery: a marker needs one bakery's coordinates, not a group's,
  // and the word cloud is sourced per bakery from its own API — so both are
  // excluded the same way Focus Bakeries, Speed vs NPS, and Bakery Reports
  // are, rather than being taught to synthesize a group-level stand-in.
  //
  // Filtering to one bakery/ops area/region stops making sense once rows are
  // rolled up to or past it, so each grouping level disables and clears the
  // filter at its own level and every level finer than it: Ops Areas view
  // disables Ops Area and Bakery (Region stays usable — it's coarser, and
  // still narrows which ops areas appear); Regions view disables Region,
  // Ops Area, and Bakery.
  //
  // Only on the tabs the View select actually governs — everywhere else
  // always triages individual bakeries regardless of state.dashboardView,
  // so the filters there must never be left locked by a grouping picked on
  // a different tab.
  var DASHBOARD_VIEW_SCOPED_TABS = { overview: true, trends: true, table: true };
  function syncDashboardViewFilterAvailability() {
    var viewApplies = !!DASHBOARD_VIEW_SCOPED_TABS[document.body.dataset.dashTab];
    var view = viewApplies ? state.dashboardView : 'bakeries';
    var regionDisabled = view === 'region';
    var opsDisabled = view === 'ops' || view === 'region';
    var bakeryDisabled = view === 'ops' || view === 'region';

    function applyDisabled(triggerId, dropdownId, disabled, selectedArray, resync) {
      var trigger = document.getElementById(triggerId);
      if (!trigger) return;
      if (disabled) {
        var dropdown = document.getElementById(dropdownId);
        if (dropdown) dropdown.style.display = 'none';
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (selectedArray.length) selectedArray.splice(0, selectedArray.length);
        if (resync) resync();
      }
      trigger.disabled = disabled;
    }

    applyDisabled('regionMsTrigger', 'regionDropdown', regionDisabled, state.regionFilter, G.rebuildRegionMultiselect);
    applyDisabled('opsMsTrigger', 'opsDropdown', opsDisabled, state.opsFilter, G.rebuildOpsMultiselect);
    applyDisabled('bakeryMsTrigger', 'bakeryDropdown', bakeryDisabled, state.searchBakery, G.resetBakeryMultiselect);
  }

  document.getElementById('dashboardView').addEventListener('change', function (e) {
    state.dashboardView = e.target.value;
    syncDashboardViewFilterAvailability();
    refresh();
  });

  // Benchmark is the single performance lens. Maps retain their internal
  // metric API, but the dashboard always initialises them in benchmark mode.
  if (G.setNetworkMapMetric) G.setNetworkMapMetric('absolute');
  if (G.setTargetMapMetric) G.setTargetMapMetric('absolute');

  function syncMapSegmentedControl(selector, dataKey, value) {
    Array.from(document.querySelectorAll(selector)).forEach(function (toggleBtn) {
      var selected = toggleBtn.dataset[dataKey] === value;
      toggleBtn.classList.toggle('active', selected);
      toggleBtn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  // ========== NETWORK MAP AREA TOGGLE ==========
  var _networkMapArea = 'off';
  Array.from(document.querySelectorAll('[data-map-area]')).forEach(function (btn) {
    btn.addEventListener('click', function () {
      var nextArea = btn.dataset.mapArea === 'on' ? 'on' : 'off';
      if (_networkMapArea === nextArea) return;
      _networkMapArea = nextArea;
      syncMapSegmentedControl('[data-map-area]', 'mapArea', nextArea);
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
      syncMapSegmentedControl('[data-target-map-area]', 'targetMapArea', nextArea);
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
      syncMapSegmentedControl('[data-map-visit]', 'mapVisit', nextVisit);
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
      syncMapSegmentedControl('[data-target-map-visit]', 'targetMapVisit', nextVisit);
      if (G.setTargetMapVisitFilter) G.setTargetMapVisitFilter(nextVisit);
    });
  });

  // ========== MAP SEARCH (network + Focus Bakery) ==========
  function wireMapSearch(inputId, clearBtnId, setSearchFn) {
    var input = document.getElementById(inputId);
    var clearBtn = document.getElementById(clearBtnId);
    if (!input || !clearBtn) return;
    var debounceTimer = null;

    function apply(value) {
      if (G[setSearchFn]) G[setSearchFn](value);
    }

    input.addEventListener('input', function () {
      var value = input.value;
      clearBtn.style.display = value ? '' : 'none';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { apply(value); }, 150);
    });
    clearBtn.addEventListener('click', function () {
      clearTimeout(debounceTimer);
      input.value = '';
      clearBtn.style.display = 'none';
      apply('');
      input.focus();
    });
  }
  wireMapSearch('networkMapSearchInput', 'networkMapSearchClear', 'setNetworkMapSearch');
  wireMapSearch('targetMapSearchInput', 'targetMapSearchClear', 'setTargetMapSearch');

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

  // Shared by the Bakery/Region/Ops checkbox dropdowns below: Up/Down walks
  // between option rows the same way the custom-select menus already do.
  // Enter/Space need no extra wiring — these rows are native <button>s, which
  // fire their own click on both keys.
  function focusMsListOption(list, direction) {
    var items = Array.prototype.filter.call(list.querySelectorAll('.bakery-ms__option'), function (el) { return !el.disabled; });
    if (!items.length) return;
    var idx = items.indexOf(document.activeElement);
    var next = direction === 'up' ? idx - 1 : idx + 1;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items[next].focus({ preventScroll: true });
    items[next].scrollIntoView({ block: 'nearest' });
  }

  // Toggling a checkbox rebuilds the whole list (see renderList in each
  // dropdown below), which throws away the focused button's DOM node and
  // silently killed arrow-key navigation right after a selection. Re-find
  // the recreated row for the same option and hand focus back to it.
  function restoreMsListFocus(list, optionValue) {
    if (!optionValue) return;
    var btn = Array.prototype.find.call(list.querySelectorAll('.bakery-ms__option'), function (el) { return el.dataset.option === optionValue; });
    if (btn) btn.focus({ preventScroll: true });
  }

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
        btn.dataset.option = name;
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var txt = document.createElement('span');
        txt.textContent = name;
        btn.appendChild(box);
        btn.appendChild(txt);
        btn.addEventListener('click', function () { toggleBakery(name); });
        btn.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowDown') { event.preventDefault(); focusMsListOption(msList, 'down'); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); focusMsListOption(msList, 'up'); }
        });
        msList.appendChild(btn);
      });
    }

    function toggleBakery(name) {
      var idx = selected.indexOf(name);
      if (idx === -1) { selected.push(name); } else { selected.splice(idx, 1); }
      var focusedOption = document.activeElement && document.activeElement.classList.contains('bakery-ms__option') ? name : null;
      renderList(msSearch.value);
      renderSelected();
      updateLabel();
      restoreMsListFocus(msList, focusedOption);
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
      // Reopening should always show the list from the top, not wherever it
      // was scrolled to last time.
      msList.scrollTop = 0;
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
    msSearch.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        var first = msList.querySelector('.bakery-ms__option:not(:disabled)');
        if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'nearest' }); }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        var firstMatch = msList.querySelector('.bakery-ms__option:not(:disabled)');
        if (firstMatch) firstMatch.click();
      }
    });
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
    var isGroupedView = DASHBOARD_VIEW_SCOPED_TABS[currentTab] && state.dashboardView !== 'bakeries';
    var available = currentTab === 'target' && G.getFocusAvailableBands
      ? G.getFocusAvailableBands()
      : isGroupedView && G.getGroupedAvailableBands
        ? G.getGroupedAvailableBands(state.dashboardView)
        : G.getAvailableBands();
    var currentValue = state.bandFilter;

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

      var isAbsGroup = item.options.length > 0 && item.options[0].value.indexOf('abs:') === 0;
      if (!isAbsGroup) return;

      var visibleOpts = item.options.filter(function (o) {
        return available.absolute.has(o.value.slice(4));
      });
      if (!visibleOpts.length) return;

      visibleOpts.forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.value;
        opt.textContent = o.text;
        bandFilterEl.appendChild(opt);
      });
    });

    // Plain "Benchmark Band" regardless of View: the select sits in the same
    // row as View, and the header chip/KPI title already say "Ops Areas" —
    // a fourth callout here was redundant with those, and cost a two-line
    // label wrap. Region/Ops Area/Bakery don't get suffixed either; they
    // signal via disabling instead, so this keeps Band consistent with them.
    var bandFilterLabelEl = document.getElementById('bandFilterLabel');
    if (bandFilterLabelEl) bandFilterLabelEl.textContent = 'Benchmark Band';

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
        btn.dataset.option = name;
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var txt = document.createElement('span');
        txt.textContent = name;
        btn.appendChild(box);
        btn.appendChild(txt);
        btn.addEventListener('click', function () { toggleRegion(name); });
        btn.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowDown') { event.preventDefault(); focusMsListOption(msList, 'down'); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); focusMsListOption(msList, 'up'); }
        });
        msList.appendChild(btn);
      });
    }

    function toggleRegion(name) {
      var idx = selected.indexOf(name);
      if (idx === -1) { selected.push(name); } else { selected.splice(idx, 1); }
      var focusedOption = document.activeElement && document.activeElement.classList.contains('bakery-ms__option') ? name : null;
      renderList();
      renderSelected();
      updateLabel();
      restoreMsListFocus(msList, focusedOption);
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
      // Reopening should always show the list from the top, not wherever it
      // was scrolled to last time.
      msList.scrollTop = 0;
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
        btn.dataset.option = name;
        var box = document.createElement('span');
        box.className = 'bakery-ms__checkbox';
        box.setAttribute('aria-hidden', 'true');
        var txt = document.createElement('span');
        txt.textContent = name;
        btn.appendChild(box);
        btn.appendChild(txt);
        btn.addEventListener('click', function () { toggleOps(name); });
        btn.addEventListener('keydown', function (event) {
          if (event.key === 'ArrowDown') { event.preventDefault(); focusMsListOption(msList, 'down'); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); focusMsListOption(msList, 'up'); }
        });
        msList.appendChild(btn);
      });
    }

    function toggleOps(name) {
      var idx = selected.indexOf(name);
      if (idx === -1) { selected.push(name); } else { selected.splice(idx, 1); }
      var focusedOption = document.activeElement && document.activeElement.classList.contains('bakery-ms__option') ? name : null;
      renderList(msSearch.value);
      renderSelected();
      updateLabel();
      restoreMsListFocus(msList, focusedOption);
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
      // Reopening should always show the list from the top, not wherever it
      // was scrolled to last time.
      msList.scrollTop = 0;
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
    msSearch.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        var first = msList.querySelector('.bakery-ms__option:not(:disabled)');
        if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'nearest' }); }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        var firstMatch = msList.querySelector('.bakery-ms__option:not(:disabled)');
        if (firstMatch) firstMatch.click();
      }
    });
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
  // state.dashboardView defaults to 'bakeries', so this is a no-op today —
  // kept for when the View select's starting value stops being a constant.
  syncDashboardViewFilterAvailability();
  // The only control that reorders the League Table — renderLeagueTable sorts
  // straight off this value. (It used to have to clear a header-click sort off
  // the table first; headers no longer sort, so there is nothing to undo.)
  document.getElementById('sortBy').addEventListener('change', refresh);

  document.getElementById('rollingWindow').addEventListener('change', function () {
    state.selectedMonths = G.resolvePeriodMonths(this.value, state.MONTHS, state.ALL);
    document.getElementById('monthSelect').value = '';
    G.syncCustomSelect('monthSelect');
    refresh();
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var popoverName = t.dataset.navPopoverToggle;
      if (popoverName) {
        toggleDashboardNavPopover(popoverName, t);
        return;
      }
      closeDashboardNavPopover();
      var accordionName = t.dataset.navAccordionToggle;
      if (accordionName) {
        var railIsCollapsed = !compactDashboardSidebarMedia.matches &&
          dashboardWorkspaceShell && dashboardWorkspaceShell.dataset.sidebarCollapsed === 'true';
        var shouldOpen = railIsCollapsed || t.getAttribute('aria-expanded') !== 'true';
        if (railIsCollapsed) setDashboardSidebarCollapsed(false);
        setDashboardNavAccordion(shouldOpen ? accordionName : '');
        return;
      }
      activateDashboardTab(t.dataset.tab);
      scrollToTop();
    });
  });

  // Allow standalone pages (such as a Bakery Profile) to return directly to
  // the dashboard section they came from. Both #visit-log and #tab-visit-log
  // are accepted so links stay readable while matching the panel id.
  function activateDashboardHashTarget() {
    var target = String(window.location.hash || '').replace(/^#(?:tab-)?/, '');
    if (!target) return;
    var trigger = document.querySelector('.tab[data-tab="' + target + '"], ' +
      '.dashboard-footer__link[data-footer-tab="' + target + '"]');
    if (!trigger) return;
    activateDashboardTab(target);
  }
  window.addEventListener('hashchange', activateDashboardHashTarget);
  activateDashboardHashTarget();

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

  document.querySelectorAll('.target-subtab[data-target-subtab]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      // Hand the panel back to the drawer before activateTargetSubtab below
      // scrollIntoViews the clicked button — it needs to be back in its
      // normal (non-fixed) position in the layout for that to behave.
      closeDashboardNavPopover();
      activateDashboardTab('target', { keepSidebarOpen: true });
      setDashboardNavAccordion('target');
      activateTargetSubtab(tab.dataset.targetSubtab);
      if (window.matchMedia('(max-width: 980px)').matches) {
        setDashboardSidebarOpen(false);
        scrollToTop();
      }
    });
  });

  // Bakery Reports owns its view rendering in visit-report.js. A submenu
  // choice, rather than its parent accordion button, enters the Reports tab.
  // Capture runs before visit-report.js's bubble listener so entering the tab
  // can reset its default safely before that listener applies the chosen view.
  document.querySelectorAll('#visitLogViewToggle [data-view]').forEach(function (tab) {
    tab.addEventListener('click', function () {
      closeDashboardNavPopover();
      activateDashboardTab('visit-log', { keepSidebarOpen: true });
      setDashboardNavAccordion('visit-log');
      if (compactDashboardSidebarMedia.matches) {
        setDashboardSidebarOpen(false);
        scrollToTop();
      }
    }, true);
  });

  // ========== INITIALISE FILE UPLOAD ==========
  // ── Mobile filter side panel ──
  var filterControlsPanel = document.getElementById('filterControlsPanel');
  var filterActiveBadge = document.getElementById('filterActiveBadge');
  var filterSideTab = document.getElementById('filterSideTab');
  var filterSideTabBadge = document.getElementById('filterSideTabBadge');
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
    state.dashboardView = 'bakeries';
    var dashboardViewSelect = document.getElementById('dashboardView');
    if (dashboardViewSelect) {
      dashboardViewSelect.value = 'bakeries';
      G.syncCustomSelect(dashboardViewSelect);
    }
    syncDashboardViewFilterAvailability();

    if (focusMapPeriodMemo) {
      // The Focus map holds the live period at All Time, so Reset defaults the
      // parked dashboard period instead — the map keeps its window, and the
      // rest of the dashboard is on Last Month again once the tab is left.
      focusMapPeriodMemo = { month: '', rolling: '1' };
    } else {
      if (rollingWindow) {
        rollingWindow.value = '1';
        G.syncCustomSelect(rollingWindow);
      }

      if (monthSelect) {
        monthSelect.value = '';
        G.syncCustomSelect(monthSelect);
      }

      state.selectedMonths = (state.MONTHS && state.MONTHS.length)
        ? G.resolvePeriodMonths(rollingWindow ? rollingWindow.value : '1', state.MONTHS, state.ALL)
        : [];
    }

    if (bandFilter) {
      bandFilter.value = '';
      G.syncCustomSelect(bandFilter);
    }

    if (G.rebuildRegionMultiselect) G.rebuildRegionMultiselect();
    if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
    if (G.resetBakeryMultiselect) G.resetBakeryMultiselect();

    closeExpandedMobileFilters();
    refresh();
  }

  // The two selects Reset also restores, measured against the values it
  // restores them to: View sits at Bakeries and Period at Last Month on a
  // clean dashboard, so anything else is a filter the user set and Reset can
  // undo.
  function isNonDefaultDashboardView() {
    // Only where the toggle governs anything — the tabs fixed to bakery level
    // hide it, and a grouped view parked there is not something Reset should
    // advertise. Same test the View header pill uses.
    var activePanel = document.querySelector('.tab-content.active');
    var currentTab = activePanel ? activePanel.id.replace(/^tab-/, '') : 'overview';
    return !!(DASHBOARD_VIEW_SCOPED_TABS && DASHBOARD_VIEW_SCOPED_TABS[currentTab]) &&
      state.dashboardView !== 'bakeries';
  }

  function isNonDefaultPeriod() {
    var monthSelect = document.getElementById('monthSelect');
    var rollingWindow = document.getElementById('rollingWindow');
    if (!monthSelect || !rollingWindow) return false;
    // Locked on Focus Bakeries: the period showing there is the tab's, not the
    // user's, so it is not a filter anyone chose or can clear.
    if (monthSelect.disabled) return false;
    // Month and Period are one decision — picking a month parks Period on All
    // Time — so a pinned month scores once, not twice.
    if (monthSelect.value) return true;
    return rollingWindow.value !== '1';
  }

  function countActiveFilters() {
    var count = 0;
    if (state.regionFilter && state.regionFilter.length) count++;
    if (state.opsFilter && state.opsFilter.length) count++;
    if (state.searchBakery && state.searchBakery.length) count++;
    if (state.bandFilter) count++;
    if (isNonDefaultDashboardView()) count++;
    if (isNonDefaultPeriod()) count++;
    return count;
  }

  function openFilterSidePanel() {
    if (!filterControlsPanel) return;
    if (typeof G.isModalOpen === 'function' && G.isModalOpen()) return;
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

  // ── Banner pills as the filter control surface ──
  // #headerSub is rebuilt wholesale by renderHeaderSummary on every refresh,
  // so the listener sits on the container rather than the pills themselves.
  // Bakery Reports filters its own data and owns a separate drawer.
  function isVisitLogTab() {
    return document.body.dataset.dashTab === 'visit-log' &&
      typeof G.setVisitLogFiltersOpen === 'function';
  }

  function clearHeaderFilter(key) {
    if (key === 'view') {
      state.dashboardView = 'bakeries';
      var viewSelect = document.getElementById('dashboardView');
      if (viewSelect) { viewSelect.value = 'bakeries'; G.syncCustomSelect(viewSelect); }
      syncDashboardViewFilterAvailability();
    } else if (key === 'region') {
      state.regionFilter.splice(0, state.regionFilter.length);
      if (G.rebuildRegionMultiselect) G.rebuildRegionMultiselect();
      // Ops Area options are derived from the selected regions.
      if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
    } else if (key === 'ops') {
      state.opsFilter.splice(0, state.opsFilter.length);
      if (G.rebuildOpsMultiselect) G.rebuildOpsMultiselect();
    } else if (key === 'bakery') {
      state.searchBakery.splice(0, state.searchBakery.length);
      if (G.resetBakeryMultiselect) G.resetBakeryMultiselect();
    } else if (key === 'band') {
      state.bandFilter = '';
      var bandSelect = document.getElementById('bandFilter');
      if (bandSelect) { bandSelect.value = ''; G.syncCustomSelect(bandSelect); }
    } else {
      return;
    }
    refresh();
  }

  document.addEventListener('click', function (event) {
    var periodBtn = event.target.closest('[data-open-period-filter]');
    if (!periodBtn) return;
    event.preventDefault();
    openHeaderFilterControl('period');
  });

  var headerSubEl = document.getElementById('headerSub');
  if (headerSubEl) {
    headerSubEl.addEventListener('click', function (event) {
      var clear = event.target.closest('[data-filter-clear]');
      if (clear) {
        // Clearing is the whole intent — don't also open the drawer.
        event.stopPropagation();
        var key = clear.getAttribute('data-filter-clear');
        if (isVisitLogTab()) G.clearVisitLogHeaderFilter(key);
        else clearHeaderFilter(key);
        return;
      }
      var resetAll = event.target.closest('[data-filter-reset-all]');
      if (resetAll) {
        event.stopPropagation();
        if (isVisitLogTab()) { if (G.resetVisitLogHeaderFilters) G.resetVisitLogHeaderFilters(); }
        else resetAllFilters();
        return;
      }
      // A pill jumps straight to its own control, the same shortcut the
      // clickable period in the page title already gives. The bare "+" add
      // button has no key to jump to, so it just opens the drawer generically.
      var pill = event.target.closest('[data-filter-pill]');
      if (pill) {
        var pillKey = pill.getAttribute('data-filter-pill');
        if (isVisitLogTab()) { if (G.openVisitLogFilterControl) G.openVisitLogFilterControl(pillKey); }
        else openHeaderFilterControl(pillKey);
        return;
      }
      if (!event.target.closest('[data-filter-open]')) return;
      if (isVisitLogTab()) {
        G.setVisitLogFiltersOpen(!G.isVisitLogFiltersOpen());
        return;
      }
      filterSidePanelOpen ? closeFilterSidePanel() : openFilterSidePanel();
    });
  }
  document.addEventListener('click', function (event) {
    if (!filterSidePanelOpen || !filterControlsPanel || isVisitLogTab()) return;
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    var insidePanel = path.indexOf(filterControlsPanel) !== -1;
    var onTab = filterSideTab ? path.indexOf(filterSideTab) !== -1 : false;
    // The banner pills (and the clickable period in a section title) open
    // the drawer, so a click on one is not 'outside' — without this the same
    // click would open and immediately close it.
    var onBanner = path.some(function (el) {
      return el && el.closest && el.closest('[data-filter-pill], [data-filter-open], [data-open-period-filter]');
    });
    if (!insidePanel && !onTab && !onBanner) closeFilterSidePanel();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && filterSidePanelOpen) { closeFilterSidePanel(); }
  });

  // Close side panel when viewport grows past mobile breakpoint
  // Crossing the breakpoint swaps the sheet for the drawer rather than
  // dismissing it, but the mobile sheet locks body scroll and the drawer
  // does not, so that lock has to be handed back on the way out.
  if (mobileFilterMedia.addEventListener) {
    mobileFilterMedia.addEventListener('change', function (e) {
      if (!e.matches) { document.body.style.overflow = ''; }
      else if (filterSidePanelOpen) { document.body.style.overflow = 'hidden'; }
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

  // Menus in the drawer are positioned by the shared helper (see
  // mountDrawerMenus in js/utils.js); Bakery Reports mounts its own.
  G.mountDrawerMenus(document.getElementById('filterControlsPanel'));
  G.anchorDrawerToBanner(document.getElementById('filterControlsPanel'));

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
  // Hash navigation may already have activated a returned-to tab above. Keep
  // that panel authoritative during final startup sync instead of resetting
  // only the shared title and KPI strip to Overview.
  var initialActiveTab = document.querySelector('.tab-content.active')
    ? document.querySelector('.tab-content.active').id.replace(/^tab-/, '')
    : 'overview';
  updateDashboardActiveView(initialActiveTab);
  clearInactiveDashboardSubmenuHighlights(initialActiveTab);
  syncDashboardKpis(initialActiveTab);
  syncDashboardSidebarForViewport();

  // Sync initial mobile filter tab visibility on startup
  var initialMobileFilterTab = document.getElementById('filterSideTab');
  if (initialMobileFilterTab) {
    if (initialActiveTab === 'visit-log') {
      initialMobileFilterTab.style.setProperty('display', 'none', 'important');
    } else {
      initialMobileFilterTab.style.display = '';
    }
  }

  // Overlay disclosures ("Columns Explained", "How support priority is
  // calculated") float above the layout, so they need dismissing like a menu —
  // a native <details> otherwise only closes via its own summary. Delegated so
  // it also covers the trend-table one, which is re-rendered on every refresh.
  (function () {
    var floatingDisclosureSelector = '.focus-method--overlay, .kpi-info';
    document.addEventListener('click', function (e) {
      var methodologyLink = e.target && e.target.closest ? e.target.closest('[data-benchmark-methodology]') : null;
      if (!methodologyLink) return;
      e.preventDefault();
      var disclosure = methodologyLink.closest('.kpi-info');
      if (disclosure) disclosure.open = false;
      activateDashboardTab('cei');
      if (window.location.hash !== '#cei') window.location.hash = 'cei';
      scrollToTop();
    });
    document.addEventListener('click', function (e) {
      var clicked = e.target && e.target.closest ? e.target.closest(floatingDisclosureSelector) : null;
      document.querySelectorAll('.focus-method--overlay[open], .kpi-info[open]').forEach(function (el) {
        if (el !== clicked) el.open = false;
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.focus-method--overlay[open], .kpi-info[open]');
      if (!open) return;
      open.open = false;
      var summary = open.querySelector('summary');
      if (summary) summary.focus();
    });

    // The room a KPI panel has to open into: the viewport, tightened by any
    // ancestor that clips (.dashboard-workspace does), since anything outside
    // one of those is invisible however it is positioned.
    function visibleBounds(el) {
      var bounds = { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
      for (var node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        var style = window.getComputedStyle(node);
        // display:contents generates no box (.dashboard-workspace is one, on
        // desktop widths) — it clips nothing, and its getBoundingClientRect()
        // is an empty rect that would collapse the bounds to zero if used.
        if (style.display === 'contents') continue;
        if (style.overflow === 'visible' && style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        var rect = node.getBoundingClientRect();
        bounds.top = Math.max(bounds.top, rect.top);
        bounds.bottom = Math.min(bounds.bottom, rect.bottom);
        bounds.left = Math.max(bounds.left, rect.left);
        bounds.right = Math.min(bounds.right, rect.right);
      }
      return bounds;
    }

    // Default placement is to the right of the card (see styles.css): flip to
    // the left when the right edge would clip and the left has more room, or
    // fall back to stacking above/below when neither side can fit the panel
    // (the 2-up mobile grid, mainly). Cap height so a short viewport scrolls
    // the panel rather than truncating it.
    function positionKpiInfo(disclosure) {
      var summary = disclosure.querySelector('summary');
      var panel = disclosure.querySelector('.kpi-info__panel');
      if (!summary || !panel) return;
      panel.style.top = '';
      panel.style.bottom = '';
      panel.style.left = '';
      panel.style.right = '';
      panel.style.maxHeight = '';
      var gap = 8;
      var gutter = 12;
      var bounds = visibleBounds(disclosure);
      var anchor = summary.getBoundingClientRect();
      var box = disclosure.getBoundingClientRect();
      var size = panel.getBoundingClientRect();
      var roomRight = bounds.right - box.right - gap - gutter;
      var roomLeft = box.left - bounds.left - gap - gutter;

      if (size.width <= Math.max(roomRight, roomLeft)) {
        // Sideways fits: prefer the right (the default in styles.css) and
        // only flip left when the right can't hold it, top-aligned with the
        // card and slid up/down (not clamped by height) to stay in view.
        if (size.width > roomRight) {
          panel.style.left = 'auto';
          panel.style.right = (box.width + gap) + 'px';
        }
        var overflowBottom = (box.top + size.height) - (bounds.bottom - gutter);
        var top = overflowBottom > 0 ? -overflowBottom : 0;
        var minTop = bounds.top + gutter - box.top;
        if (top < minTop) top = minTop;
        panel.style.top = top + 'px';
        var vRoom = bounds.bottom - gutter - (box.top + top);
        if (size.height > vRoom && vRoom > 0) panel.style.maxHeight = vRoom + 'px';
        return;
      }

      // Neither side has room: stack above/below the "i" instead.
      panel.style.left = '8px';
      var roomAbove = anchor.top - gap - bounds.top - gutter;
      var roomBelow = bounds.bottom - anchor.bottom - gap - gutter;
      panel.style.top = (anchor.bottom + gap - box.top) + 'px';
      if (roomAbove >= roomBelow) {
        panel.style.top = '';
        panel.style.bottom = (box.bottom - anchor.top + gap) + 'px';
      }
      var overflowRight = box.left + 8 + size.width - (bounds.right - gutter);
      if (overflowRight > 0) panel.style.left = (8 - overflowRight) + 'px';
      var room = Math.max(roomAbove, roomBelow);
      if (size.height > room && room > 0) panel.style.maxHeight = room + 'px';
    }

    // `toggle` does not bubble, so listen in the capture phase — the KPI row is
    // re-rendered on every filter change, which rules out per-element binding.
    document.addEventListener('toggle', function (e) {
      var disclosure = e.target;
      if (!disclosure || !disclosure.classList || !disclosure.classList.contains('kpi-info')) return;
      if (disclosure.open) positionKpiInfo(disclosure);
    }, true);
    ['scroll', 'resize'].forEach(function (evt) {
      window.addEventListener(evt, function () {
        document.querySelectorAll('.kpi-info[open]').forEach(function (el) { positionKpiInfo(el); });
      }, evt === 'scroll' ? { passive: true, capture: true } : { passive: true });
    });
  })();

  G.initUpload(initDashboard);
})();

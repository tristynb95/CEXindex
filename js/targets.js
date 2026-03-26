// ========== TARGETS MODULE ==========
window.GAILS = window.GAILS || {};

var _sparkState = null; // cached data for toggle re-render

function _drawSparklines(absolute) {
  if (!_sparkState) return;
  var G = GAILS;
  var sparkSorted = _sparkState.sparkSorted;
  var allAvgByMonth = _sparkState.allAvgByMonth;
  var FM = _sparkState.FM;

  sparkSorted.forEach(function(t) {
    var canvasId = 'spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_');
    var lineColor = t.direction === 'up' ? '#00C875' : t.direction === 'down' ? '#FF3B5C' : '#FFB800';
    var yOpts = absolute
      ? { display: true, min: 0, max: 100, ticks: { stepSize: 50, font: { size: 7 }, color: 'rgba(150,150,200,0.45)', maxTicksLimit: 3 }, grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } }
      : { display: false };
    G.makeChart(canvasId, {
      type: 'line',
      data: { labels: FM, datasets: [
        { data: t.hist.map(function(r) { return r ? r.c : null; }), borderColor: lineColor, backgroundColor: lineColor + '18', fill: true, tension: 0.3, pointRadius: 1.5, borderWidth: 2, spanGaps: true },
        { data: allAvgByMonth, borderColor: 'rgba(150,150,200,0.4)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3 }
      ] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function(items) { return items[0].label; }, label: function(ctx) { return ctx.datasetIndex === 0 ? 'CEI: ' + ctx.raw : 'Avg: ' + (ctx.raw ? ctx.raw.toFixed(1) : ''); } } } },
        scales: { y: yOpts, x: { display: false } },
        maintainAspectRatio: false
      }
    });
  });
}

window.GAILS.toggleSparkScale = function() {
  var absolute = !!(document.getElementById('sparkAbsoluteToggle') || {}).checked;
  _drawSparklines(absolute);
};

function _clearTargetTrendCharts() {
  var G = GAILS;
  ['targetAvgTrend', 'targetBandFlow', 'targetMomentumChart'].forEach(function(id) { G.destroyChart(id); });
  if (_sparkState && _sparkState.sparkSorted) {
    _sparkState.sparkSorted.forEach(function(t) {
      G.destroyChart('spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_'));
    });
  }
  _sparkState = null;
}

function _setTargetTrendState(hasData, message) {
  var graphsEmpty = document.getElementById('targetTrendGraphsEmpty');
  var tableEmpty = document.getElementById('targetTrendTableEmpty');
  var graphsContent = document.getElementById('targetTrendGraphsContent');
  var tableContent = document.getElementById('targetTrendTableContent');

  if (graphsEmpty) {
    graphsEmpty.textContent = hasData ? '' : message;
    graphsEmpty.style.display = hasData ? 'none' : '';
  }
  if (tableEmpty) {
    tableEmpty.textContent = hasData ? '' : message;
    tableEmpty.style.display = hasData ? 'none' : '';
  }
  if (graphsContent) graphsContent.style.display = hasData ? '' : 'none';
  if (tableContent) tableContent.style.display = hasData ? '' : 'none';
}

// ========== MAP MODULE ==========
(function() {
  var _mapInstance = null;
  var _mapMarkerLayer = null;
  var _mapTargets = [];
  window.GAILS.storeMapTargets = function(targets) {
    _mapTargets = [].concat(targets);
    // Re-render immediately if the map panel is already open
    var panel = document.querySelector('[data-target-subtab-panel="map"]');
    if (panel && panel.classList.contains('active') && _mapInstance) {
      _placeMarkers(document.getElementById('targetMapStatus'));
    }
  };

  window.GAILS.initTargetMap = function() {
    var el = document.getElementById('targetMap');
    if (!el || typeof L === 'undefined') return;
    var statusEl = document.getElementById('targetMapStatus');

    if (_mapInstance) {
      _mapInstance.invalidateSize();
      _placeMarkers(statusEl);
      return;
    }

    _mapInstance = L.map('targetMap', { zoomControl: true }).setView([52.5, -1.8], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(_mapInstance);

    var legend = L.control({ position: 'bottomright' });
    legend.onAdd = function() {
      var div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML =
        '<div><span class="map-legend__dot" style="background:#FF3B5C"></span>Below Standard</div>' +
        '<div><span class="map-legend__dot" style="background:#FFB800"></span>Approaching</div>';
      return div;
    };
    legend.addTo(_mapInstance);

    _mapMarkerLayer = L.layerGroup().addTo(_mapInstance);
    _placeMarkers(statusEl);
  };

  function _placeMarkers(statusEl) {
    if (!_mapInstance || !_mapMarkerLayer) return;
    _mapMarkerLayer.clearLayers();

    if (_mapTargets.length === 0) {
      if (statusEl) statusEl.textContent = 'No target bakeries for the current selection.';
      return;
    }

    var bounds = [];
    var placed = 0;
    var missing = [];

    _mapTargets.forEach(function(b) {
      var meta = GAILS.getBakeryMeta ? GAILS.getBakeryMeta(b.b) : GAILS.BAKERY_META[b.b];
      var ll = meta && meta.ll;
      if (!ll) { missing.push(b.b); return; }

      var color = b.acb === 'Below Standard' ? '#FF3B5C' : '#FFB800';
      var siteLabel = GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(b.b) : b.b;
      var marker = L.circleMarker(ll, {
        radius: 9,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.88
      });
      marker.bindPopup(
        '<div class="map-popup">' +
          '<div class="map-popup__name">' + siteLabel + '</div>' +
          '<span class="map-popup__band" style="background:' + color + '">' + b.acb + '</span>' +
          '<div class="map-popup__stats">CEI <strong>' + b.c + '</strong> &nbsp;·&nbsp; NPS ' + b.n + ' &nbsp;·&nbsp; Vol ' + b.v + '</div>' +
          '<div class="map-popup__mgr">' + GAILS.getBakeryOps(b.b) + '</div>' +
        '</div>'
      );
      _mapMarkerLayer.addLayer(marker);
      bounds.push(ll);
      placed++;
    });

    if (bounds.length > 1) {
      _mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else if (bounds.length === 1) {
      _mapInstance.setView(bounds[0], 14);
    }

    var msg = placed + ' baker' + (placed === 1 ? 'y' : 'ies') + ' mapped.';
    if (missing.length) msg += ' ' + missing.length + ' without coordinates.';
    if (statusEl) statusEl.textContent = msg;
  }
})();

// Shared map controller for the dashboard-wide map tab and the target map sub-tab.
(function() {
  var DEFAULT_CENTER = [52.5, -1.8];
  var DEFAULT_ZOOM = 6;
  var lockedScrollY = 0;

  var NETWORK_LEGEND = {
    relative: [
      { label: 'Excellent', color: '#00C875' },
      { label: 'Good', color: '#4895FF' },
      { label: 'Developing', color: '#FFB800' },
      { label: 'Needs Attention', color: '#FF3B5C' }
    ],
    absolute: [
      { label: 'Exceeding', color: '#00C875' },
      { label: 'Meeting', color: '#4895FF' },
      { label: 'Approaching', color: '#FFB800' },
      { label: 'Below Standard', color: '#FF3B5C' }
    ]
  };

  var NETWORK_HINT = {
    relative: '<span style="color:var(--green);font-weight:600">&#9679; Excellent</span> &nbsp;&middot;&nbsp; <span style="color:var(--blue);font-weight:600">&#9679; Good</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Developing</span> &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">&#9679; Needs Attention</span> &nbsp;&middot;&nbsp; Locations update automatically from the filters above.',
    absolute: '<span style="color:var(--green);font-weight:600">&#9679; Exceeding</span> &nbsp;&middot;&nbsp; <span style="color:var(--blue);font-weight:600">&#9679; Meeting</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Approaching</span> &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">&#9679; Below Standard</span> &nbsp;&middot;&nbsp; Locations update automatically from the filters above.'
  };

  var TARGET_LEGEND = {
    relative: [
      { label: 'Needs Attention', color: '#FF3B5C' },
      { label: 'Developing', color: '#FFB800' }
    ],
    absolute: [
      { label: 'Below Standard', color: '#FF3B5C' },
      { label: 'Approaching', color: '#FFB800' }
    ]
  };

  var TARGET_HINT = {
    relative: '<span style="color:var(--red);font-weight:600">&#9679; Needs Attention</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Developing</span> &nbsp;&middot;&nbsp; Click a pin for details. Imported site names are matched back to the correct GAIL\'s bakery before plotting.',
    absolute: '<span style="color:var(--red);font-weight:600">&#9679; Below Standard</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Approaching</span> &nbsp;&middot;&nbsp; Click a pin for details. Imported site names are matched back to the correct GAIL\'s bakery before plotting.'
  };

  var MAPS = {
    network: {
      key: 'network',
      elId: 'networkMap',
      statusId: 'networkMapStatus',
      activeSelector: '#tab-map',
      modalTitle: 'Filtered Bakeries Not Mapped',
      emptyMessage: 'No bakeries match the current filters.',
      bandField: 'cb',
      legendItems: NETWORK_LEGEND.relative,
      items: [],
      missingItems: [],
      instance: null,
      markerLayer: null,
      legendControl: null
    },
    target: {
      key: 'target',
      elId: 'targetMap',
      statusId: 'targetMapStatus',
      activeSelector: '[data-target-subtab-panel="map"]',
      modalTitle: 'Target Bakeries Not Mapped',
      emptyMessage: 'No target bakeries for the current selection.',
      bandField: 'acb',
      legendItems: TARGET_LEGEND.absolute,
      items: [],
      missingItems: [],
      instance: null,
      markerLayer: null,
      legendControl: null
    }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isMapActive(selector) {
    var panel = document.querySelector(selector);
    return !!(panel && panel.classList.contains('active'));
  }

  function renderLegend(cfg) {
    if (!cfg.instance) return;
    if (cfg.legendControl) cfg.instance.removeControl(cfg.legendControl);

    cfg.legendControl = L.control({ position: 'bottomright' });
    cfg.legendControl.onAdd = function() {
      var div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = cfg.legendItems.map(function(item) {
        return '<div><span class="map-legend__dot" style="background:' + item.color + '"></span>' + escapeHtml(item.label) + '</div>';
      }).join('');
      return div;
    };
    cfg.legendControl.addTo(cfg.instance);
  }

  function ensureMap(mapKey) {
    var cfg = MAPS[mapKey];
    var el = document.getElementById(cfg.elId);
    if (!el || typeof L === 'undefined') return;

    if (cfg.instance) {
      cfg.instance.invalidateSize();
      renderLegend(cfg);
      placeMarkers(cfg);
      return;
    }

    cfg.instance = L.map(cfg.elId, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(cfg.instance);

    cfg.markerLayer = L.layerGroup().addTo(cfg.instance);
    renderLegend(cfg);
    placeMarkers(cfg);
  }

  function getBandPriority(item, bandField) {
    var band = item && item[bandField || 'cb'];
    if (!band) return 0;
    return {
      Excellent: 0, Outstanding: 0,
      Good: 1, Exceeding: 1,
      Developing: 2, Approaching: 2,
      'Needs Attention': 3, 'Below Standard': 3
    }[band] || 0;
  }

  function getMarkerColor(item, bandField) {
    var band = item && item[bandField || 'cb'];
    var palette = (bandField === 'acb') ? GAILS.ABSCOL : GAILS.COL;
    return (band && palette && palette[band]) || '#FF3B5C';
  }

  function getPopupHtml(item, color, bandField) {
    var band = item[(bandField || 'cb')];
    var siteLabel = GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(item.b) : item.b;
    var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
    var region = GAILS.getBakeryRegion ? GAILS.getBakeryRegion(item.b) : 'Unknown';
    var cei = item.c != null ? item.c : '\u2014';
    var nps = item.n != null ? item.n : '\u2014';
    var volume = item.v != null ? item.v : '\u2014';

    return '<div class="map-popup">' +
      '<div class="map-popup__name">' + escapeHtml(siteLabel) + '</div>' +
      '<span class="map-popup__band" style="background:' + color + '">' + escapeHtml(band || 'Unknown') + '</span>' +
      '<div class="map-popup__stats">CEI <strong>' + escapeHtml(cei) + '</strong> &nbsp;&middot;&nbsp; NPS ' + escapeHtml(nps) + ' &nbsp;&middot;&nbsp; Vol ' + escapeHtml(volume) + '</div>' +
      '<div class="map-popup__mgr">' + escapeHtml(ops) + '</div>' +
      '<div class="map-popup__meta">' + escapeHtml(region) + '</div>' +
    '</div>';
  }

  function placeMarkers(cfg) {
    var statusEl = document.getElementById(cfg.statusId);
    if (!cfg.instance || !cfg.markerLayer) return;
    cfg.markerLayer.clearLayers();

    if (!cfg.items.length) {
      cfg.missingItems = [];
      cfg.instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      if (statusEl) statusEl.textContent = cfg.emptyMessage;
      return;
    }

    var bounds = [];
    var placed = 0;
    var missing = [];
    var bf = cfg.bandField || 'cb';
    var items = [].concat(cfg.items).sort(function(a, b) {
      var bandDelta = getBandPriority(a, bf) - getBandPriority(b, bf);
      if (bandDelta !== 0) return bandDelta;
      return (a.c || 0) - (b.c || 0);
    });

    items.forEach(function(item) {
      var meta = GAILS.getBakeryMeta ? GAILS.getBakeryMeta(item.b) : GAILS.BAKERY_META[item.b];
      var ll = meta && meta.ll;
      if (!ll) {
        missing.push(item.b);
        return;
      }

      var color = getMarkerColor(item, bf);
      var marker = L.circleMarker(ll, {
        radius: 9,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.88
      });
      marker.bindPopup(getPopupHtml(item, color, bf));
      cfg.markerLayer.addLayer(marker);
      bounds.push(ll);
      placed++;
    });

    if (bounds.length > 1) {
      cfg.instance.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else if (bounds.length === 1) {
      cfg.instance.setView(bounds[0], 14);
    } else {
      cfg.instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    cfg.missingItems = missing.slice().sort(function(a, b) {
      return a.localeCompare(b);
    }).map(function(name) {
      return {
        bakery: GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(name) : name,
        region: GAILS.getBakeryRegion ? GAILS.getBakeryRegion(name) : 'Unknown',
        ops: GAILS.getBakeryOps ? GAILS.getBakeryOps(name) : 'Unknown'
      };
    });

    var total = cfg.items.length;
    var msg = placed + ' of ' + total + ' baker' + (total === 1 ? 'y' : 'ies') + ' mapped.';
    if (statusEl) {
      if (missing.length) {
        statusEl.innerHTML = msg + ' <button type="button" class="target-map-status__link" data-unmapped-trigger="' + cfg.key + '">' + missing.length + ' site' + (missing.length === 1 ? '' : 's') + ' not mapped</button>.';
      } else {
        statusEl.textContent = msg;
      }
    }
  }

  function storeMapItems(mapKey, items) {
    var cfg = MAPS[mapKey];
    cfg.items = [].concat(items);
    if (cfg.instance && isMapActive(cfg.activeSelector)) {
      placeMarkers(cfg);
    }
  }

  window.GAILS.storeDashboardMapData = function(items) {
    storeMapItems('network', items);
  };

  window.GAILS.initDashboardMap = function() {
    ensureMap('network');
  };

  window.GAILS.storeMapTargets = function(targets) {
    storeMapItems('target', targets);
  };

  window.GAILS.initTargetMap = function() {
    ensureMap('target');
  };

  window.GAILS.setTargetMapMetric = function(metric) {
    var cfg = MAPS.target;
    var isAbsolute = metric === 'absolute';
    cfg.bandField = isAbsolute ? 'acb' : 'cb';
    cfg.legendItems = isAbsolute ? TARGET_LEGEND.absolute : TARGET_LEGEND.relative;

    var hintEl = document.getElementById('targetMapLegendHint');
    if (hintEl) hintEl.innerHTML = isAbsolute ? TARGET_HINT.absolute : TARGET_HINT.relative;

    if (cfg.instance) {
      renderLegend(cfg);
      placeMarkers(cfg);
    }
  };

  window.GAILS.setNetworkMapMetric = function(metric) {
    var cfg = MAPS.network;
    var isAbsolute = metric === 'absolute';
    cfg.bandField = isAbsolute ? 'acb' : 'cb';
    cfg.legendItems = isAbsolute ? NETWORK_LEGEND.absolute : NETWORK_LEGEND.relative;

    var hintEl = document.getElementById('networkMapLegendHint');
    if (hintEl) hintEl.innerHTML = isAbsolute ? NETWORK_HINT.absolute : NETWORK_HINT.relative;

    if (cfg.instance) {
      renderLegend(cfg);
      placeMarkers(cfg);
    }
  };

  function lockBackgroundScroll() {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('drill-modal-open');
    document.body.classList.add('drill-modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + lockedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
  }

  function unlockBackgroundScroll() {
    document.documentElement.classList.remove('drill-modal-open');
    document.body.classList.remove('drill-modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, lockedScrollY);
  }

  window.GAILS.openUnmappedSitesModal = function(mapKey) {
    var cfg = MAPS[mapKey];
    var modal = document.getElementById('unmappedSitesModal');
    var titleEl = document.getElementById('unmappedSitesTitle');
    var subtitleEl = document.getElementById('unmappedSitesSubtitle');
    var summaryEl = document.getElementById('unmappedSitesSummary');
    var tableBody = document.getElementById('unmappedSitesTableBody');
    if (!cfg || !modal || !titleEl || !subtitleEl || !summaryEl || !tableBody) return;

    var items = cfg.missingItems || [];
    titleEl.textContent = cfg.modalTitle;
    subtitleEl.textContent = items.length
      ? 'These bakeries are included in the current map view but do not yet have saved coordinates.'
      : 'All visible bakeries currently have saved map coordinates.';

    summaryEl.innerHTML = [
      { v: items.length, l: 'Unmapped Sites', col: 'var(--red)' },
      { v: cfg.items.length, l: 'Visible Sites', col: 'var(--accent)' }
    ].map(function(k) {
      return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + escapeHtml(k.v) + '</div><div class="target-stat-card__label">' + escapeHtml(k.l) + '</div></div>';
    }).join('');

    tableBody.innerHTML = items.length
      ? items.map(function(item) {
          return '<tr>' +
            '<td>' + escapeHtml(item.bakery) + '</td>' +
            '<td>' + escapeHtml(item.region) + '</td>' +
            '<td>' + escapeHtml(item.ops) + '</td>' +
          '</tr>';
        }).join('')
      : '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:26px 12px">No unmapped bakeries for this view.</td></tr>';

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeUnmappedSitesModal = function() {
    var modal = document.getElementById('unmappedSitesModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  document.addEventListener('click', function(event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-unmapped-trigger]') : null;
    if (!trigger) return;
    window.GAILS.openUnmappedSitesModal(trigger.getAttribute('data-unmapped-trigger'));
  });

  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    window.GAILS.closeUnmappedSitesModal();
  });
})();

window.GAILS.renderTargets = function(data) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var isAbsolute = state.targetMetric !== 'relative';
  var bf = isAbsolute ? 'acb' : 'cb';
  var cf = isAbsolute ? 'ac' : 'c';
  var highBand = isAbsolute ? 'Below Standard' : 'Needs Attention';
  var lowBand = isAbsolute ? 'Approaching' : 'Developing';

  var targets = [].concat(data).filter(function(b) {
    return b[bf] === highBand || b[bf] === lowBand;
  }).sort(function(a, b) { return a[cf] - b[cf]; });

  var needsAttn = targets.filter(function(b) { return b[bf] === highBand; });
  var developing = targets.filter(function(b) { return b[bf] === lowBand; });
  G.storeMapTargets(targets);

  document.getElementById('targetSummary').innerHTML = [
    { v: needsAttn.length, l: highBand, col: 'var(--red)' },
    { v: developing.length, l: lowBand, col: 'var(--amber)' },
    { v: targets.length, l: 'Total Targeted', col: 'var(--accent)' },
    { v: targets.length ? avg(targets, cf).toFixed(1) : '\u2014', l: (isAbsolute ? 'Avg Abs CEI' : 'Avg CEI') + ' (Targeted)', col: 'var(--accent)' },
  ].map(function(k) { return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + k.v + '</div><div class="target-stat-card__label">' + k.l + '</div></div>'; }).join('');

  _renderInsights(targets, bf, cf, highBand, lowBand, isAbsolute);
  _renderTargetTable(targets, bf, cf, highBand, isAbsolute);
  _renderTargetTrends(targets, data, bf, cf, highBand, lowBand, isAbsolute);
};

function _renderInsights(targets, bf, cf, highBand, lowBand, isAbsolute) {
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
  var quickWins = targets.filter(function(b) { return b[bf] === lowBand && b[cf] >= 70; });
  var quickWinsThreshold = isAbsolute ? 'close to Meeting' : 'close to Good';

  var mgrCounts = {};
  targets.forEach(function(b) {
    var mgr = G.getBakeryOps(b.b);
    if (!mgrCounts[mgr]) mgrCounts[mgr] = { na: 0, dev: 0 };
    if (b[bf] === highBand) mgrCounts[mgr].na++; else mgrCounts[mgr].dev++;
  });
  var mgrSorted = Object.entries(mgrCounts).sort(function(a, b) { return (b[1].na + b[1].dev) - (a[1].na + a[1].dev); });
  var weakAreas = Object.entries(focusCounts).filter(function(e) { return e[1].length > 0; }).sort(function(a, b) { return b[1].length - a[1].length; });

  var h = '<div class="insight-grid">';

  h += '<div class="insight-card"><h4>\u26A0\uFE0F Biggest Weakness</h4><p><span class="stat">' + topWeakness[1].length + '</span> of ' + targets.length + ' bakeries \u2014 <strong>' + topWeakness[0] + '</strong></p><div class="action">\u2192 Prioritise ' + topWeakness[0].toLowerCase() + ' coaching</div></div>';

  h += '<div class="insight-card"><h4>\u2B50 Quick Wins</h4>';
  if (quickWins.length > 0) {
    h += '<p><span class="stat">' + quickWins.length + '</span> baker' + (quickWins.length === 1 ? 'y' : 'ies') + ' at 70+ ' + (isAbsolute ? 'Abs ' : '') + 'CEI &mdash; ' + quickWinsThreshold + '</p><ul>' + quickWins.map(function(b) { return '<li><strong>' + b.b + '</strong> \u2014 ' + b[cf] + '</li>'; }).join('') + '</ul><div class="action">\u2192 Focus here for fastest gains</div>';
  } else {
    h += '<p style="color:var(--muted)">No bakeries close enough to ' + (isAbsolute ? 'Meeting' : 'Good') + ' standard yet.</p>';
  }
  h += '</div>';

  h += '<div class="insight-card"><h4>\uD83D\uDC64 Ops Manager Workload</h4>';
  mgrSorted.slice(0, 5).forEach(function(entry) {
    var mgr = entry[0], info = entry[1];
    var highTag = info.na > 0 ? '<span class="mgr-row__tag mgr-row__tag--below-standard">' + info.na + ' ' + highBand + '</span>' : '';
    var lowTag = info.dev > 0 ? '<span class="mgr-row__tag mgr-row__tag--approaching">' + info.dev + ' ' + lowBand + '</span>' : '';
    h += '<div class="mgr-row"><span class="mgr-row__name">' + mgr + '</span><span class="mgr-row__bands">' + highTag + lowTag + '</span></div>';
  });
  if (mgrSorted.length > 0 && mgrSorted[0][1].na >= 3) {
    h += '<div class="action">\u2192 Support ' + mgrSorted[0][0] + '</div>';
  }
  h += '</div>';

  h += '<div class="insight-card"><h4>\uD83D\uDCCB Coaching Priorities</h4>';
  weakAreas.forEach(function(entry) {
    var pct = Math.round((entry[1].length / targets.length) * 100);
    h += '<div class="coaching-area"><span class="coaching-area__name">' + entry[0] + '</span><span class="coaching-area__count">' + entry[1].length + ' baker' + (entry[1].length === 1 ? 'y' : 'ies') + '</span></div><div class="coaching-area__bar"><div class="coaching-area__fill" style="width:' + pct + '%"></div></div>';
  });
  h += '</div>';

  h += '</div>';
  insightsEl.innerHTML = h;
}

function _renderTargetTable(targets, bf, cf, highBand, isAbsolute) {
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
  var ceiHeader = isAbsolute ? 'Abs CEI' : 'CEI';
  var altCeiHeader = isAbsolute ? 'CEI' : 'Abs CEI';
  var altCeiField = isAbsolute ? 'c' : 'ac';

  document.getElementById('targetTable').innerHTML = targets.length === 0
    ? '<p style="text-align:center;color:var(--muted);padding:32px 0">No bakeries in ' + highBand + ' or adjacent bands for this period.</p>'
    : '<div class="table-wrap"><table><thead><tr><th>Priority</th><th>Bakery</th><th>Region</th><th>Ops Manager</th><th>' + ceiHeader + '</th><th>' + altCeiHeader + '</th><th>Band</th><th>NPS</th><th>Vol</th><th>Conf</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>Barista Speed</th><th>&gt;5m</th><th>Where to Focus</th></tr></thead><tbody>' +
    targets.map(function(b, i) {
      var focus = getFocus(b);
      var focusColor = focus.pct <= 10 ? 'var(--red)' : 'var(--amber)';
      var confTag = b.co === 'Low' ? ' <span style="font-size:0.58rem;color:var(--red);font-weight:600">LOW VOL</span>' : '';
      return '<tr>' +
        '<td style="font-weight:700;color:' + (b[bf] === highBand ? 'var(--red)' : 'var(--amber)') + '">' + (i + 1) + '</td>' +
        '<td style="font-weight:500">' + b.b + confTag + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b[cf] + '</td>' +
        '<td style="font-weight:600">' + b[altCeiField] + '</td>' +
        '<td><span class="band ' + G.bc(b[bf]) + '">' + b[bf] + '</span></td>' +
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

function _renderTargetTrends(targets, data, bf, cf, highBand, lowBand, isAbsolute) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var palette = isAbsolute ? G.ABSCOL : G.COL;
  var allBandNames = isAbsolute
    ? ['Below Standard', 'Approaching', 'Meeting', 'Exceeding']
    : ['Needs Attention', 'Developing', 'Good', 'Excellent'];
  var FM = G.getRollingMonths();
  var targetNames = targets.map(function(b) { return b.b; });
  var THRESHOLD = 3;

  if (targets.length === 0) {
    _clearTargetTrendCharts();
    document.getElementById('trendSummaryCards').innerHTML = '';
    document.getElementById('sparklineGrid').innerHTML = '';
    document.getElementById('targetTrendTable').innerHTML = '';
    _setTargetTrendState(false, 'No target bakeries are in the ' + highBand + ' or ' + lowBand + ' bands for the current selection.');
    return;
  }

  if (FM.length < 2) {
    _clearTargetTrendCharts();
    document.getElementById('trendSummaryCards').innerHTML = '';
    document.getElementById('sparklineGrid').innerHTML = '';
    document.getElementById('targetTrendTable').innerHTML = '';
    _setTargetTrendState(false, 'Select at least two months to view target bakery trend graphs and tables.');
    return;
  }

  _setTargetTrendState(true, '');

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
      ceiChange = latest[cf] - prev[cf]; npsChange = latest.n - prev.n;
      direction = ceiChange >= THRESHOLD ? 'up' : ceiChange <= -THRESHOLD ? 'down' : 'flat';
    }
    var trend3m = 'new', cei3mChange = 0;
    if (latest && threePrev) { cei3mChange = latest[cf] - threePrev[cf]; trend3m = cei3mChange >= THRESHOLD ? 'up' : cei3mChange <= -THRESHOLD ? 'down' : 'flat'; }
    else if (latest && prev) { trend3m = direction; cei3mChange = ceiChange; }

    var streak = 0;
    for (var i = valid.length - 1; i >= 1; i--) { if (valid[i][cf] < valid[i - 1][cf] - 1) streak++; else break; }

    var best = null, worst = null;
    valid.forEach(function(r) { if (!best || r[cf] > best[cf]) best = r; if (!worst || r[cf] < worst[cf]) worst = r; });

    var first = valid.length > 0 ? valid[0] : null;
    var periodChange = 0;
    if (latest && first && latest !== first) periodChange = latest[cf] - first[cf];

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
    { v: improving.length, l: 'Improving', col: 'var(--green)' },
    { v: stable.length, l: 'Stable', col: 'var(--muted-l)' },
    { v: declining.length, l: 'Declining', col: 'var(--red)' },
    { v: chronic.length, l: 'Declining 3+ Mo', col: '#9B5DFF' },
  ].map(function(k) { return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + k.v + '</div><div class="target-stat-card__label">' + k.l + '</div></div>'; }).join('');

  var ceiLabel = isAbsolute ? 'Avg Abs CEI' : 'Avg CEI';
  var targetAvgByMonth = FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m && targetNames.includes(r.b); }); return recs.length ? recs.reduce(function(a, r) { return a + r[cf]; }, 0) / recs.length : null; });
  var allAvgByMonth = FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m; }); return recs.length ? recs.reduce(function(a, r) { return a + r[cf]; }, 0) / recs.length : null; });

  G.makeChart('targetAvgTrend', { type: 'line', data: { labels: FM, datasets: [
    { label: 'Target Bakeries ' + ceiLabel, data: targetAvgByMonth, borderColor: '#FF3B5C', backgroundColor: 'rgba(255,59,92,0.13)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
    { label: 'All Bakeries ' + ceiLabel, data: allAvgByMonth, borderColor: 'rgba(150,150,200,0.5)', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2, borderDash: [6, 4] },
  ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: ceiLabel }, min: 0, max: 100 }, x: { ticks: { font: { size: 10 } } } } } });

  G.makeChart('targetBandFlow', { type: 'bar', data: { labels: FM, datasets: allBandNames.map(function(bn) { return { label: bn, data: FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m && targetNames.includes(r.b); }); return recs.length ? recs.filter(function(r) { return r[bf] === bn; }).length : 0; }), backgroundColor: (palette[bn] || '#888') + 'cc', borderColor: palette[bn] || '#888', borderWidth: 1 }; }) }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' } } } } });

  // Sparkline cards
  var sparkGrid = document.getElementById('sparklineGrid');
  var sparkSorted = [].concat(trendData).sort(function(a, b) { return (a.latest ? a.latest.c : 999) - (b.latest ? b.latest.c : 999); });
  // Destroy any existing sparkline charts
  sparkSorted.forEach(function(t) { G.destroyChart('spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_')); });
  sparkGrid.innerHTML = '';
  // Build card DOM (canvas elements only — charts drawn by _drawSparklines)
  sparkSorted.forEach(function(t) {
    var card = document.createElement('div');
    var dirClass = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'down' : t.direction === 'flat' ? 'flat' : 'new-entry';
    var dirLabel = t.direction === 'up' ? '\u2191 Improving' : t.direction === 'down' ? '\u2193 Declining' : t.direction === 'flat' ? '\u2194 Stable' : 'New';
    var ceiNow = t.latest ? t.latest[cf] : '\u2014';
    var bandNow = t.latest ? t.latest[bf] : '\u2014';
    var changeText = t.ceiChange !== 0 ? (t.ceiChange > 0 ? '+' : '') + t.ceiChange.toFixed(1) : '';
    var changeColor = t.ceiChange > 0 ? 'var(--green)' : 'var(--red)';

    var modClass = t.streak >= 3 ? ' spark-card--chronic' : t.direction === 'down' ? ' spark-card--declining' : '';
    card.className = 'spark-card' + modClass;

    card.innerHTML =
      '<div class="spark-card__head">' +
        '<div><div class="spark-card__name">' + t.name + '</div><div class="spark-card__mgr">' + G.getBakeryOps(t.name) + '</div></div>' +
        '<span class="dir ' + dirClass + '" style="font-size:0.62rem">' + dirLabel + '</span>' +
      '</div>' +
      '<div class="spark-card__metrics">' +
        '<div><span class="spark-card__cei">' + ceiNow + '</span><span class="spark-card__cei-label">CEI</span></div>' +
        '<span class="band ' + G.bc(bandNow) + '" style="font-size:0.58rem">' + bandNow + '</span>' +
        (changeText ? '<span class="spark-card__change" style="color:' + changeColor + '">' + changeText + '</span>' : '') +
        (t.streak >= 2 ? '<span class="spark-card__streak">\u2193' + t.streak + 'm</span>' : '') +
      '</div>' +
      '<canvas id="spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_') + '" height="44"></canvas>';
    sparkGrid.appendChild(card);
  });
  // Cache data and draw with current toggle state
  _sparkState = { sparkSorted: sparkSorted, allAvgByMonth: allAvgByMonth, FM: FM };
  var toggleEl = document.getElementById('sparkAbsoluteToggle');
  _drawSparklines(toggleEl && toggleEl.checked);

  // Momentum chart
  if (FM.length >= 3) {
    var momentumData = FM.slice(1).map(function(m, mi) {
      var prevMonth = FM[mi]; var up = 0, down = 0, flat = 0;
      targetNames.forEach(function(name) {
        var curr = state.ALL.find(function(r) { return r.b === name && r.m === m; });
        var prev = state.ALL.find(function(r) { return r.b === name && r.m === prevMonth; });
        if (curr && prev) { var diff = curr[cf] - prev[cf]; if (diff >= THRESHOLD) up++; else if (diff <= -THRESHOLD) down++; else flat++; }
      });
      return { m: m, up: up, down: down, flat: flat };
    });
    G.makeChart('targetMomentumChart', { type: 'bar', data: { labels: momentumData.map(function(d) { return d.m; }), datasets: [
      { label: 'Improving', data: momentumData.map(function(d) { return d.up; }), backgroundColor: 'rgba(0,200,117,0.65)', borderRadius: 3 },
      { label: 'Stable', data: momentumData.map(function(d) { return d.flat; }), backgroundColor: 'rgba(150,150,200,0.45)', borderRadius: 3 },
      { label: 'Declining', data: momentumData.map(function(d) { return -d.down; }), backgroundColor: 'rgba(255,59,92,0.65)', borderRadius: 3 },
    ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' }, ticks: { callback: function(v) { return Math.abs(v); } } } } } });
  } else {
    G.destroyChart('targetMomentumChart');
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

  var trendCeiHeader = (isAbsolute ? 'Abs ' : '') + 'CEI (' + latestMonth + ')';
  document.getElementById('targetTrendTable').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Bakery</th><th>Ops Manager</th><th>' + trendCeiHeader + '</th><th>CEI Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Direction<br><span style="font-weight:400;font-size:0.6rem">Month-on-Month</span></th><th>NPS Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>3-Month Trend<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>3m CEI Change<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>Period Change<br><span style="font-weight:400;font-size:0.6rem">' + firstMonth + ' &rarr; ' + latestMonth + '</span></th><th>Declining Streak</th><th>Best Month</th><th>Worst Month</th><th>Quality &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Efficiency &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Friendliness &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Barista Speed &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th></tr></thead><tbody>' +
  trendData.map(function(t) {
    var streakWarn = t.streak >= 3 ? 'color:#9B5DFF;font-weight:700' : t.streak >= 2 ? 'color:var(--red);font-weight:600' : '';
    return '<tr><td style="font-weight:500">' + t.name + '</td><td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(t.name) + '</td><td style="font-weight:700">' + (t.latest ? t.latest[cf] : '\u2014') + '</td><td>' + changeStr(t.ceiChange) + '</td><td>' + dirIcon(t.direction) + '</td><td>' + changeStr(t.npsChange) + '</td><td>' + dirIcon(t.trend3m) + '</td><td>' + changeStr(t.cei3mChange) + '</td><td>' + changeStr(t.periodChange) + '</td><td style="' + streakWarn + '">' + (t.streak > 0 ? t.streak + ' month' + (t.streak > 1 ? 's' : '') : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.best ? t.best.m + ' (' + t.best[cf] + ')' : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.worst ? t.worst.m + ' (' + t.worst[cf] + ')' : '\u2014') + '</td><td>' + (t.compTrends.drink !== undefined ? changeStr(t.compTrends.drink) : '\u2014') + '</td><td>' + (t.compTrends.efficiency !== undefined ? changeStr(t.compTrends.efficiency) : '\u2014') + '</td><td>' + (t.compTrends.friendliness !== undefined ? changeStr(t.compTrends.friendliness) : '\u2014') + '</td><td>' + (t.compTrends.timeliness !== undefined ? changeStr(t.compTrends.timeliness) : '\u2014') + '</td></tr>';
  }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTrendTable'));
}

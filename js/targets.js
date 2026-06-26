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

  var _networkMapAreaState = 'off';
  var _targetMapAreaState = 'off';

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
      areaLayer: null,
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
      areaLayer: null,
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

  var BAND_SCORE = {
    Excellent: 3, Outstanding: 3,
    Good: 2, Exceeding: 2, Meeting: 2,
    Developing: 1, Approaching: 1,
    'Needs Attention': 0, 'Below Standard': 0
  };

  var PERF_COLORS = [
    { threshold: 2.5, color: '#00C875' },
    { threshold: 1.5, color: '#4895FF' },
    { threshold: 0.5, color: '#FFB800' },
    { threshold: -1,  color: '#FF3B5C' }
  ];

  function getAreaPerformanceColor(items, bandField) {
    var bf = bandField || 'cb';
    var sum = 0, total = 0;
    items.forEach(function(item) {
      var s = BAND_SCORE[item[bf]];
      if (s != null) { sum += s; total++; }
    });
    if (total === 0) return '#a0aec0';
    var avg = sum / total;
    for (var i = 0; i < PERF_COLORS.length; i++) {
      if (avg >= PERF_COLORS[i].threshold) return PERF_COLORS[i].color;
    }
    return '#FF3B5C';
  }

  var BAND_ORDER = ['Excellent', 'Outstanding', 'Good', 'Exceeding', 'Meeting', 'Developing', 'Approaching', 'Needs Attention', 'Below Standard'];

  function buildAreaTooltip(mgr, items, bandField) {
    var bf = bandField || 'cb';
    var counts = {};
    items.forEach(function(item) {
      var band = item[bf];
      if (band) counts[band] = (counts[band] || 0) + 1;
    });
    var parts = BAND_ORDER.filter(function(b) { return counts[b]; })
      .map(function(b) { return counts[b] + ' ' + b; });
    return '<strong>' + escapeHtml(mgr) + '’s Area</strong>' +
      (parts.length ? '<br><span style="font-size:0.82em;opacity:0.85">' + parts.join(' · ') + '</span>' : '');
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
    if (cfg.instance.createPane) {
      var areaPane = cfg.instance.createPane('areaPane');
      areaPane.style.zIndex = 350;
      areaPane.style.pointerEvents = 'auto';
      areaPane.style.mixBlendMode = 'multiply';
    }
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(cfg.instance);

    cfg.areaLayer = L.layerGroup().addTo(cfg.instance);
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

  function computeVoronoiTerritories(managerGroups) {
    var SENTINEL = '__SENTINEL__';
    var realPts = [];
    Object.keys(managerGroups).forEach(function(mgr) {
      if (mgr === 'Unknown' || mgr === 'Other') return;
      var seen = {};
      managerGroups[mgr].coords.forEach(function(ll) {
        var k = ll[0].toFixed(6) + ',' + ll[1].toFixed(6);
        if (!seen[k]) { seen[k] = true; realPts.push({lat: ll[0], lng: ll[1], mgr: mgr}); }
      });
    });
    if (realPts.length < 2) return {};

    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    realPts.forEach(function(p) {
      if(p.lat<minLat)minLat=p.lat; if(p.lat>maxLat)maxLat=p.lat;
      if(p.lng<minLng)minLng=p.lng; if(p.lng>maxLng)maxLng=p.lng;
    });

    var spread = Math.max(maxLat - minLat, maxLng - minLng);
    var sentPad = spread * 3 + 0.8;

    var pts = realPts.slice();
    var mcLat = (minLat + maxLat) / 2, mcLng = (minLng + maxLng) / 2;
    [[minLat-sentPad,minLng-sentPad],[minLat-sentPad,mcLng],[minLat-sentPad,maxLng+sentPad],
     [mcLat,minLng-sentPad],[mcLat,maxLng+sentPad],
     [maxLat+sentPad,minLng-sentPad],[maxLat+sentPad,mcLng],[maxLat+sentPad,maxLng+sentPad]
    ].forEach(function(c){ pts.push({lat:c[0],lng:c[1],mgr:SENTINEL}); });

    var n = pts.length;
    var lats = pts.map(function(p){return p.lat;});
    var lngs = pts.map(function(p){return p.lng;});
    var mgrs = pts.map(function(p){return p.mgr;});

    function circumcircle(ia, ib, ic) {
      var ax=lats[ia],ay=lngs[ia],bx=lats[ib],by=lngs[ib],cx=lats[ic],cy=lngs[ic];
      var D = 2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
      if (Math.abs(D) < 1e-12) return null;
      var ux=((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/D;
      var uy=((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/D;
      return {x:ux,y:uy,r2:(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy)};
    }

    var sMinX=Infinity,sMaxX=-Infinity,sMinY=Infinity,sMaxY=-Infinity;
    for(var i=0;i<n;i++){
      if(lats[i]<sMinX)sMinX=lats[i];if(lats[i]>sMaxX)sMaxX=lats[i];
      if(lngs[i]<sMinY)sMinY=lngs[i];if(lngs[i]>sMaxY)sMaxY=lngs[i];
    }
    var dM = Math.max(sMaxX-sMinX,sMaxY-sMinY)*20;
    lats.push(sMinX-dM, sMinX+dM*3, sMinX-dM);
    lngs.push(sMinY-dM, sMinY-dM, sMaxY+dM*3);

    var tris = [{v:[n,n+1,n+2], c:circumcircle(n,n+1,n+2)}];

    for (var i=0; i<n; i++) {
      var px=lats[i],py=lngs[i],bad=[],good=[];
      for(var t=0;t<tris.length;t++){
        var ci=tris[t].c;
        if(ci&&(px-ci.x)*(px-ci.x)+(py-ci.y)*(py-ci.y)<ci.r2-1e-10){bad.push(tris[t]);}
        else{good.push(tris[t]);}
      }
      var eCnt={};
      for(var b=0;b<bad.length;b++){
        var v=bad[b].v;
        for(var j=0;j<3;j++){var a=v[j],bb=v[(j+1)%3];var k=a<bb?a+'_'+bb:bb+'_'+a;eCnt[k]=(eCnt[k]||0)+1;}
      }
      tris=good;
      var eKs=Object.keys(eCnt);
      for(var ek=0;ek<eKs.length;ek++){
        if(eCnt[eKs[ek]]!==1)continue;
        var vs=eKs[ek].split('_');
        tris.push({v:[+vs[0],+vs[1],i],c:circumcircle(+vs[0],+vs[1],i)});
      }
    }
    tris=tris.filter(function(t){return t.v[0]<n&&t.v[1]<n&&t.v[2]<n;});

    var e2t={};
    for(var ti=0;ti<tris.length;ti++){
      var v=tris[ti].v;
      for(var j=0;j<3;j++){var a=v[j],b=v[(j+1)%3];var k=a<b?a+'_'+b:b+'_'+a;if(!e2t[k])e2t[k]=[];e2t[k].push(ti);}
    }

    var mgrSegs={};
    var e2tKs=Object.keys(e2t);
    for(var ek=0;ek<e2tKs.length;ek++){
      var tIdxs=e2t[e2tKs[ek]];
      if(tIdxs.length!==2)continue;
      var vs=e2tKs[ek].split('_');
      var mA=mgrs[+vs[0]],mB=mgrs[+vs[1]];
      if(mA===mB)continue;
      var c1=tris[tIdxs[0]].c,c2=tris[tIdxs[1]].c;
      if(!c1||!c2)continue;
      var seg=[[c1.x,c1.y],[c2.x,c2.y]];
      if(mA!==SENTINEL){if(!mgrSegs[mA])mgrSegs[mA]=[];mgrSegs[mA].push(seg);}
      if(mB!==SENTINEL){if(!mgrSegs[mB])mgrSegs[mB]=[];mgrSegs[mB].push(seg);}
    }

    function clipPolyToBounds(poly,b0,b1,b2,b3){
      function ins(pt,e){if(e===0)return pt[1]>=b2;if(e===1)return pt[1]<=b3;if(e===2)return pt[0]>=b0;return pt[0]<=b1;}
      function inter(a,b,e){var t;if(e<2){var lng=e?b3:b2;t=(lng-a[1])/(b[1]-a[1]);return[a[0]+t*(b[0]-a[0]),lng];}else{var lat=e===2?b0:b1;t=(lat-a[0])/(b[0]-a[0]);return[lat,a[1]+t*(b[1]-a[1])];}}
      var res=poly;
      for(var e=0;e<4;e++){if(!res.length)return[];var inp=res;res=[];for(var i=0;i<inp.length;i++){var cur=inp[i],prv=inp[(i+inp.length-1)%inp.length];if(ins(cur,e)){if(!ins(prv,e))res.push(inter(prv,cur,e));res.push(cur);}else if(ins(prv,e))res.push(inter(prv,cur,e));}}
      return res;
    }

    function ptKey(p){return p[0].toFixed(8)+'|'+p[1].toFixed(8);}

    var result={};
    var mgrKs=Object.keys(mgrSegs);
    for(var mi=0;mi<mgrKs.length;mi++){
      var mgr=mgrKs[mi];
      var segs=mgrSegs[mgr];
      var adj={};
      for(var si=0;si<segs.length;si++){
        var kA=ptKey(segs[si][0]),kB=ptKey(segs[si][1]);
        if(!adj[kA])adj[kA]=[];if(!adj[kB])adj[kB]=[];
        adj[kA].push({k:kB,pt:segs[si][1]});adj[kB].push({k:kA,pt:segs[si][0]});
      }
      var usedEdges={},loop=null;
      for(var si=0;si<segs.length&&!loop;si++){
        var skA=ptKey(segs[si][0]),skB=ptKey(segs[si][1]);
        var eKey=skA<skB?skA+'~'+skB:skB+'~'+skA;
        if(usedEdges[eKey])continue;
        usedEdges[eKey]=true;
        var loopPts=[segs[si][0]],prev=skA,cur=skB,curPt=segs[si][1],safety=0;
        while(cur!==skA&&safety++<20000){
          var ns=adj[cur]||[],nxt=null;
          for(var ni=0;ni<ns.length;ni++){
            if(ns[ni].k===prev)continue;
            var nek=cur<ns[ni].k?cur+'~'+ns[ni].k:ns[ni].k+'~'+cur;
            if(usedEdges[nek])continue;
            nxt=ns[ni];usedEdges[nek]=true;break;
          }
          if(!nxt)break;
          loopPts.push(curPt);prev=cur;cur=nxt.k;curPt=nxt.pt;
        }
        if(loopPts.length>=3)loop=loopPts;
      }
      if(loop){
        var mc=managerGroups[mgr]?managerGroups[mgr].coords:[];
        var mL=Infinity,mH=-Infinity,mLn=Infinity,mLx=-Infinity;
        mc.forEach(function(c){if(c[0]<mL)mL=c[0];if(c[0]>mH)mH=c[0];if(c[1]<mLn)mLn=c[1];if(c[1]>mLx)mLx=c[1];});
        var mg=0.07;
        var cl=clipPolyToBounds(loop,mL-mg,mH+mg,mLn-mg,mLx+mg);
        if(cl.length>=3)result[mgr]=cl;
      }
    }
    return result;
  }

  function placeMarkers(cfg) {
    var statusEl = document.getElementById(cfg.statusId);
    if (!cfg.instance || !cfg.markerLayer) return;
    cfg.markerLayer.clearLayers();
    if (cfg.areaLayer) cfg.areaLayer.clearLayers();
    cfg.areaPolygons = {};

    if (!cfg.items.length) {
      cfg.missingItems = [];
      cfg.instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      if (statusEl) statusEl.textContent = cfg.emptyMessage;
      return;
    }

    var showAreas = (cfg.key === 'network' ? _networkMapAreaState : _targetMapAreaState) === 'on';
    if (showAreas && cfg.instance && cfg.areaLayer && cfg.items.length > 0) {
      var managerGroups = {};
      cfg.items.forEach(function(item) {
        var meta = GAILS.getBakeryMeta ? GAILS.getBakeryMeta(item.b) : GAILS.BAKERY_META[item.b];
        var ll = meta && meta.ll;
        if (!ll) return;
        var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
        if (!managerGroups[ops]) managerGroups[ops] = { coords: [], items: [] };
        managerGroups[ops].coords.push(ll);
        managerGroups[ops].items.push(item);
      });

      var voronoiPolys = computeVoronoiTerritories(managerGroups);
      var AREA_DASH_PATTERNS = [null, '8 5', '4 4', '12 4 4 4', '2 5'];
      var mgrIndex = 0;

      Object.keys(managerGroups).forEach(function(mgr) {
        if (mgr === 'Unknown' || mgr === 'Other') return;
        var group = managerGroups[mgr];
        var color = getAreaPerformanceColor(group.items, cfg.bandField);
        var tooltip = buildAreaTooltip(mgr, group.items, cfg.bandField);
        var dashArray = AREA_DASH_PATTERNS[mgrIndex % AREA_DASH_PATTERNS.length] || null;
        mgrIndex++;

        var poly = voronoiPolys[mgr];
        if (!poly || poly.length < 3) return;

        var polygon = L.polygon(poly, {
          color: color,
          weight: 2,
          opacity: 0.85,
          dashArray: dashArray,
          fillColor: color,
          fillOpacity: 0.1,
          lineJoin: 'round',
          pane: 'areaPane'
        });
        polygon._origDash = dashArray;
        polygon._isPolyline = false;
        polygon.bindTooltip(tooltip, { sticky: true, className: 'map-area-tooltip', interactive: false });
        polygon.on('mouseover', function() {
          this.setStyle({ fillOpacity: 0.28, weight: 3, dashArray: null });
          this.bringToFront();
        });
        polygon.on('mouseout', function() {
          this.setStyle({ fillOpacity: 0.1, weight: 2, dashArray: dashArray });
        });
        cfg.areaLayer.addLayer(polygon);
        cfg.areaPolygons[mgr] = polygon;
      });
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
      marker.bindTooltip(getPopupHtml(item, color, bf), {
        sticky: false,
        direction: 'top',
        offset: [0, -12],
        className: 'map-marker-tooltip',
        interactive: false
      });
      (function(ops) {
        marker.on('mouseover', function() {
          var area = cfg.areaPolygons && cfg.areaPolygons[ops];
          if (!area) return;
          if (area._isPolyline) {
            area.setStyle({ opacity: 0.95, weight: 9, dashArray: null });
          } else {
            area.setStyle({ fillOpacity: 0.28, weight: 3.5, dashArray: null });
          }
          area.bringToFront();
        });
        marker.on('mouseout', function() {
          var area = cfg.areaPolygons && cfg.areaPolygons[ops];
          if (!area) return;
          area.setStyle({ fillOpacity: 0.1, weight: 2, dashArray: area._origDash });
        });
      }(GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown'));
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

  window.GAILS.setNetworkMapArea = function(state) {
    _networkMapAreaState = state;
    var cfg = MAPS.network;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setTargetMapArea = function(state) {
    _targetMapAreaState = state;
    var cfg = MAPS.target;
    if (cfg.instance) {
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
  mgrSorted.forEach(function(entry) {
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
    : '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">\ud83c\udfaf Priority Support List</h3><p class="tracker-table-header__copy">Ranked lowest CEI first. <strong>Where to Focus</strong> = the single area dragging each bakery down most. <span style="color:var(--red)">Red</span> scores = bottom quarter of all bakeries.</p></div></div><div class="table-wrap"><table><thead><tr><th>Priority</th><th>Bakery</th><th>Region</th><th>Ops Manager</th><th>' + ceiHeader + '</th><th>' + altCeiHeader + '</th><th>Band</th><th>NPS</th><th>Vol</th><th>Conf</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>Barista Speed</th><th>&gt;5m</th><th>Where to Focus</th></tr></thead><tbody>' +
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
        '<td style="color:' + (b.o5 > 3 ? 'var(--red)' : b.o5 > 2 ? 'var(--amber)' : 'inherit') + '">' + b.o5 + '%</td>' +
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
  document.getElementById('targetTrendTable').innerHTML = '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">Performance Trends \u2014 Table</h3><p class="tracker-table-header__copy"><span style="color:var(--green);font-weight:600">\u2191 Improving</span> = +3pts &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">\u2193 Declining</span> = \u22123pts &nbsp;&middot;&nbsp; <span style="color:var(--muted-l);font-weight:600">\u2194 Stable</span> = \u00b13pts &nbsp;&middot;&nbsp; Direction = month-on-month. 3-Month Trend = last 3 months.</p></div></div><div class="table-wrap"><table><thead><tr><th>Bakery</th><th>Ops Manager</th><th>' + trendCeiHeader + '</th><th>CEI Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Direction<br><span style="font-weight:400;font-size:0.6rem">Month-on-Month</span></th><th>NPS Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>3-Month Trend<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>3m CEI Change<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>Period Change<br><span style="font-weight:400;font-size:0.6rem">' + firstMonth + ' &rarr; ' + latestMonth + '</span></th><th>Declining Streak</th><th>Best Month</th><th>Worst Month</th><th>Quality &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Efficiency &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Friendliness &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Barista Speed &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th></tr></thead><tbody>' +
  trendData.map(function(t) {
    var streakWarn = t.streak >= 3 ? 'color:#9B5DFF;font-weight:700' : t.streak >= 2 ? 'color:var(--red);font-weight:600' : '';
    return '<tr><td style="font-weight:500">' + t.name + '</td><td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(t.name) + '</td><td style="font-weight:700">' + (t.latest ? t.latest[cf] : '\u2014') + '</td><td>' + changeStr(t.ceiChange) + '</td><td>' + dirIcon(t.direction) + '</td><td>' + changeStr(t.npsChange) + '</td><td>' + dirIcon(t.trend3m) + '</td><td>' + changeStr(t.cei3mChange) + '</td><td>' + changeStr(t.periodChange) + '</td><td style="' + streakWarn + '">' + (t.streak > 0 ? t.streak + ' month' + (t.streak > 1 ? 's' : '') : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.best ? t.best.m + ' (' + t.best[cf] + ')' : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.worst ? t.worst.m + ' (' + t.worst[cf] + ')' : '\u2014') + '</td><td>' + (t.compTrends.drink !== undefined ? changeStr(t.compTrends.drink) : '\u2014') + '</td><td>' + (t.compTrends.efficiency !== undefined ? changeStr(t.compTrends.efficiency) : '\u2014') + '</td><td>' + (t.compTrends.friendliness !== undefined ? changeStr(t.compTrends.friendliness) : '\u2014') + '</td><td>' + (t.compTrends.timeliness !== undefined ? changeStr(t.compTrends.timeliness) : '\u2014') + '</td></tr>';
  }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTrendTable'));
}

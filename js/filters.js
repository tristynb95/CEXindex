// ========== FILTERS MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.getRollingMonths = function() {
  var state = GAILS.state;
  var val = parseInt(document.getElementById('rollingWindow').value, 10);
  if (!val || val <= 0 || val >= state.MONTHS.length) return [].concat(state.MONTHS);
  return state.MONTHS.slice(-val);
};

window.GAILS.getAvailableBands = function() {
  var G = GAILS;
  var state = G.state;

  // Apply all filters EXCEPT band
  var recs = state.ALL.filter(function(r) { return state.selectedMonths.includes(r.m); });
  if (state.regionFilter.length) recs = recs.filter(function(r) { return state.regionFilter.includes(G.getBakeryRegion(r.b)); });
  if (state.opsFilter.length) recs = recs.filter(function(r) { return state.opsFilter.includes(G.getBakeryOps(r.b)); });
  if (state.searchBakery && state.searchBakery.length) recs = recs.filter(function(r) { return state.searchBakery.some(function(s) { return r.b.toLowerCase().includes(s.toLowerCase()); }); });

  var relative = new Set();
  var absolute = new Set();

  if (state.selectedMonths.length > 1) {
    var grouped = {};
    recs.forEach(function(r) { if (!grouped[r.b]) grouped[r.b] = []; grouped[r.b].push(r); });
    Object.values(grouped).forEach(function(rows) {
      var avgC = rows.reduce(function(a, r) { return a + r.c; }, 0) / rows.length;
      var avgAc = rows.reduce(function(a, r) { return a + r.ac; }, 0) / rows.length;
      relative.add(avgC >= 75 ? 'Top Performer' : avgC >= 50 ? 'Above Average' : avgC >= 25 ? 'Below Average' : 'Needs Support');
      absolute.add(avgAc >= 90 ? 'Exceeding' : avgAc >= 75 ? 'Meeting' : avgAc >= 60 ? 'Approaching' : 'Below Standard');
    });
  } else {
    recs.forEach(function(r) {
      if (r.cb) relative.add(r.cb);
      if (r.acb) absolute.add(r.acb);
    });
  }

  return { relative: relative, absolute: absolute };
};

window.GAILS.getData = function() {
  var G = GAILS;
  var state = G.state;
  var recs = state.ALL.filter(function(r) { return state.selectedMonths.includes(r.m); });
  if (state.regionFilter.length) recs = recs.filter(function(r) { return state.regionFilter.includes(G.getBakeryRegion(r.b)); });
  if (state.opsFilter.length) recs = recs.filter(function(r) { return state.opsFilter.includes(G.getBakeryOps(r.b)); });
  if (state.searchBakery && state.searchBakery.length) recs = recs.filter(function(r) { return state.searchBakery.some(function(s) { return r.b.toLowerCase().includes(s.toLowerCase()); }); });

  if (state.selectedMonths.length > 1) {
    var grouped = {};
    recs.forEach(function(r) {
      if (!grouped[r.b]) grouped[r.b] = [];
      grouped[r.b].push(r);
    });
    var agg = [];
    Object.entries(grouped).forEach(function(entry) {
      var bakery = entry[0], rows = entry[1];
      var avg = function(key) { return rows.reduce(function(a, r) { return a + r[key]; }, 0) / rows.length; };
      var avgDefined = function(key) { var vs = rows.filter(function(r) { return typeof r[key] === 'number' && !isNaN(r[key]); }); return vs.length ? vs.reduce(function(a, r) { return a + r[key]; }, 0) / vs.length : null; };
      var a = {
        b: bakery, m: state.selectedMonths.join(', '),
        n: Math.round(avg('n') * 10) / 10, v: Math.round(rows.reduce(function(a, r) { return a + r.v; }, 0)),
        s2: Math.round(avg('s2') * 10) / 10, s3: Math.round(avg('s3') * 10) / 10,
        s4: (function() { var v = avgDefined('s4'); return v !== null ? Math.round(v * 10) / 10 : null; })(), o5: Math.round(avg('o5') * 10) / 10,
        ov: Math.round(avg('ov') * 10) / 10, fr: Math.round(avg('fr') * 10) / 10,
        dr: Math.round(avg('dr') * 10) / 10, ef: Math.round(avg('ef') * 10) / 10,
        ep: Math.round(avg('ep') * 10) / 10, dp: Math.round(avg('dp') * 10) / 10,
        fp: Math.round(avg('fp') * 10) / 10,
        c: Math.round(avg('c') * 10) / 10, co: rows[0].co, s2w: Math.round(avg('s2w') * 10) / 10,
        ac: Math.round(avg('ac') * 10) / 10,
        ats: Math.round(avg('ats') * 10) / 10,
        c_raw: Math.round(avg('c_raw') * 10) / 10,
      };
      G.ensureBands(a);
      agg.push(a);
    });
    G.recomputeTimelinessRanks(agg);
    if (state.bandFilter) {
      var bf = state.bandFilter;
      if (bf.indexOf('abs:') === 0) { var abv = bf.slice(4); agg = agg.filter(function(r) { return r.acb === abv; }); }
      else { agg = agg.filter(function(r) { return r.cb === bf; }); }
    }
    agg.sort(function(a, b) { return b.c - a.c; });
    agg.forEach(function(a, i) { a.cr = i + 1; a.nr = 0; });
    return agg;
  }
  recs.forEach(G.ensureBands);
  if (state.bandFilter) {
    var bf = state.bandFilter;
    if (bf.indexOf('abs:') === 0) { var abv = bf.slice(4); recs = recs.filter(function(r) { return r.acb === abv; }); }
    else { recs = recs.filter(function(r) { return r.cb === bf; }); }
  }
  recs = [].concat(recs).sort(function(a, b) { return b.c - a.c; });
  return recs;
};


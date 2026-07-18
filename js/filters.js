// ========== FILTERS MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.getRollingMonths = function() {
  var state = GAILS.state;
  var raw = document.getElementById('rollingWindow').value;
  if (raw === 'current' || raw === 'thisQuarter' || raw === 'lastQuarter' || raw === 'thisYear' || raw === 'lastYear') {
    return [].concat(state.selectedMonths || []);
  }
  var val = parseInt(raw, 10);
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
    var expectedPeriodMonths = state.selectedMonths.filter(function(m) {
      return recs.some(function(r) { return r.m === m; });
    });
    var expectedMonths = expectedPeriodMonths.length || state.selectedMonths.length;
    Object.values(grouped).forEach(function(rows) {
      var scoredRows = rows.filter(function(r) { return r && !r.noData; });
      if (!scoredRows.length) {
        relative.add('No Data');
        absolute.add('No Data');
        return;
      }
      var covered = new Set(scoredRows.map(function(r) { return r.m; })).size;
      if (covered < expectedMonths) {
        relative.add('Incomplete');
        absolute.add('Incomplete');
        return;
      }
      var avgC = scoredRows.reduce(function(a, r) { return a + r.c; }, 0) / scoredRows.length;
      var avgAc = scoredRows.reduce(function(a, r) { return a + r.ac; }, 0) / scoredRows.length;
      relative.add(avgC >= 75 ? 'Top Performance' : avgC >= 50 ? 'Above Average' : avgC >= 25 ? 'Below Average' : 'Low Performance');
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
    var expectedPeriodMonths = state.selectedMonths.filter(function(m) {
      return recs.some(function(r) { return r.m === m; });
    });
    var expectedMonths = expectedPeriodMonths.length || state.selectedMonths.length;
    Object.entries(grouped).forEach(function(entry) {
      var bakery = entry[0], rows = entry[1];
      var avg = function(key) { return rows.reduce(function(a, r) { return a + r[key]; }, 0) / rows.length; };
      var avgDefined = function(key) { var vs = rows.filter(function(r) { return typeof r[key] === 'number' && !isNaN(r[key]); }); return vs.length ? vs.reduce(function(a, r) { return a + r[key]; }, 0) / vs.length : null; };
      // Round-to-0.1 for nullable metrics: months without the metric (old-format
      // uploads, blank cells) are excluded from the mean rather than counted as 0.
      var r1 = function(v) { return v === null ? null : Math.round(v * 10) / 10; };
      var sum = function(key) {
        var vs = rows.filter(function(r) { return typeof r[key] === 'number' && !isNaN(r[key]); });
        return vs.length ? Math.round(vs.reduce(function(a, r) { return a + r[key]; }, 0)) : null;
      };
      var totalVolume = Math.round(rows.reduce(function(a, r) { return a + r.v; }, 0));
      var scoredMonthCount = new Set(rows
        .filter(function(r) { return G.hasScoredData ? G.hasScoredData(r) : r && !r.noData; })
        .map(function(r) { return r.m; })).size;
      var a = {
        b: bakery, m: state.selectedMonths.join(', '),
        monthsExpected: expectedMonths,
        monthsCovered: scoredMonthCount,
        incompletePeriod: scoredMonthCount < expectedMonths,
        n: Math.round(avg('n') * 10) / 10, v: totalVolume,
        s2: Math.round(avg('s2') * 10) / 10, s3: Math.round(avg('s3') * 10) / 10,
        s4: (function() { var v = avgDefined('s4'); return v !== null ? Math.round(v * 10) / 10 : null; })(), o5: Math.round(avg('o5') * 10) / 10,
        ov: Math.round(avg('ov') * 10) / 10, fr: Math.round(avg('fr') * 10) / 10,
        dr: Math.round(avg('dr') * 10) / 10, ef: Math.round(avg('ef') * 10) / 10,
        ep: Math.round(avg('ep') * 10) / 10, dp: Math.round(avg('dp') * 10) / 10,
        fp: Math.round(avg('fp') * 10) / 10, np: Math.round(avg('np') * 10) / 10,
        c: Math.round(avg('c') * 10) / 10, co: rows[0].co, s2w: Math.round(avg('s2w') * 10) / 10,
        ac: Math.round(avg('ac') * 10) / 10,
        ats: Math.round(avg('ats') * 10) / 10,
        a_at: r1(avgDefined('a_at')),
        c_raw: Math.round(avg('c_raw') * 10) / 10,
        ac_raw: Math.round(avg('ac_raw') * 10) / 10,
        s30: r1(avgDefined('s30')),
        td: sum('td'),
        at: r1(avgDefined('at')),
        at12: r1(avgDefined('at12')),
        at9: r1(avgDefined('at9')),
        nc: r1(avgDefined('nc')),
        nm: r1(avgDefined('nm')),
        nd: r1(avgDefined('nd')),
        vc: sum('vc'),
        vf: sum('vf'),
        na: r1(avgDefined('na')),
        va: sum('va'),
      };
      G.markDataCoverage(a);
      G.ensureBands(a);
      agg.push(a);
    });
    G.recomputeTimelinessRanks(agg);
    if (state.bandFilter) {
      var bf = state.bandFilter;
      if (bf.indexOf('abs:') === 0) { var abv = bf.slice(4); agg = agg.filter(function(r) { return r.acb === abv; }); }
      else { agg = agg.filter(function(r) { return r.cb === bf; }); }
    }
    var isRankable = function(record) { return record && !record.noData && !record.incompletePeriod; };
    agg.sort(function(a, b) {
      if (isRankable(a) !== isRankable(b)) return isRankable(a) ? -1 : 1;
      var av = a.c === null || a.c === undefined || isNaN(a.c) ? -Infinity : a.c;
      var bv = b.c === null || b.c === undefined || isNaN(b.c) ? -Infinity : b.c;
      return bv - av;
    });
    var companyRank = 0;
    agg.forEach(function(a) {
      a.cr = isRankable(a) ? ++companyRank : null;
      a.nr = 0;
    });
    return agg;
  }
  G.recomputeTimelinessRanks(recs);
  recs.forEach(G.ensureBands);
  if (state.bandFilter) {
    var bf = state.bandFilter;
    if (bf.indexOf('abs:') === 0) { var abv = bf.slice(4); recs = recs.filter(function(r) { return r.acb === abv; }); }
    else { recs = recs.filter(function(r) { return r.cb === bf; }); }
  }
  recs = [].concat(recs).sort(function(a, b) {
    var aRankable = a && !a.noData && !a.incompletePeriod;
    var bRankable = b && !b.noData && !b.incompletePeriod;
    if (aRankable !== bRankable) return aRankable ? -1 : 1;
    var av = a.c === null || a.c === undefined || isNaN(a.c) ? -Infinity : a.c;
    var bv = b.c === null || b.c === undefined || isNaN(b.c) ? -Infinity : b.c;
    return bv - av;
  });
  return recs;
};


// ========== FILTERS MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.getRollingMonths = function() {
  var state = GAILS.state;
  var val = parseInt(document.getElementById('rollingWindow').value, 10);
  if (!val || val <= 0 || val >= state.MONTHS.length) return [].concat(state.MONTHS);
  return state.MONTHS.slice(-val);
};

window.GAILS.getData = function() {
  var G = GAILS;
  var state = G.state;
  var recs = state.ALL.filter(function(r) { return state.selectedMonths.includes(r.m); });
  if (state.regionFilter) recs = recs.filter(function(r) { return G.getBakeryRegion(r.b) === state.regionFilter; });
  if (state.opsFilter) recs = recs.filter(function(r) { return G.getBakeryOps(r.b) === state.opsFilter; });
  if (state.bandFilter) recs = recs.filter(function(r) { return r.cb === state.bandFilter; });
  if (state.searchBakery) recs = recs.filter(function(r) { return r.b.toLowerCase().includes(state.searchBakery); });

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
      var a = {
        b: bakery, m: state.selectedMonths.join(', '),
        n: Math.round(avg('n') * 10) / 10, v: Math.round(rows.reduce(function(a, r) { return a + r.v; }, 0)),
        s2: Math.round(avg('s2') * 10) / 10, s3: Math.round(avg('s3') * 10) / 10, o5: Math.round(avg('o5') * 10) / 10,
        ov: Math.round(avg('ov') * 10) / 10, fr: Math.round(avg('fr') * 10) / 10,
        dr: Math.round(avg('dr') * 10) / 10, ef: Math.round(avg('ef') * 10) / 10,
        ep: Math.round(avg('ep') * 10) / 10, dp: Math.round(avg('dp') * 10) / 10,
        fp: Math.round(avg('fp') * 10) / 10, ap: Math.round(avg('ap') * 10) / 10,
        c: Math.round(avg('c') * 10) / 10, co: rows[0].co, s2w: Math.round(avg('s2w') * 10) / 10,
        ts: Math.round(avg('ts') * 10) / 10,
        ac: Math.round(avg('ac') * 10) / 10,
        c_raw: Math.round(avg('c_raw') * 10) / 10,
      };
      a.cb = a.c >= 75 ? 'Excellent' : a.c >= 50 ? 'Good' : a.c >= 25 ? 'Developing' : 'Needs Attention';
      a.acb = a.ac >= 90 ? 'Exceeding' : a.ac >= 75 ? 'Meeting' : a.ac >= 60 ? 'Approaching' : 'Below Standard';
      agg.push(a);
    });
    agg.sort(function(a, b) { return b.c - a.c; });
    agg.forEach(function(a, i) { a.cr = i + 1; a.nr = 0; });
    return agg;
  }
  recs = [].concat(recs).sort(function(a, b) { return b.c - a.c; });
  return recs;
};

window.GAILS.populateOpsFilter = function(region) {
  var G = GAILS;
  var state = G.state;
  var opsSel = document.getElementById('opsFilter');
  var managers = region
    ? [...new Set(Object.entries(G.BAKERY_META).filter(function(e) { return e[1].r === region; }).map(function(e) { return e[1].o; }))].sort()
    : [...new Set(Object.values(G.BAKERY_META).map(function(v) { return v.o; }))].sort();
  var prev = opsSel.value;
  opsSel.innerHTML = '<option value="">All Managers</option>';
  managers.forEach(function(m) { var o = document.createElement('option'); o.value = m; o.textContent = m; opsSel.appendChild(o); });
  if (managers.includes(prev)) opsSel.value = prev; else { opsSel.value = ''; state.opsFilter = ''; }
  G.syncCustomSelect(opsSel);
};

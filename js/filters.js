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

(function() {
  var G = window.GAILS;

  function isRankable(record) {
    return !!record && !record.noData && !record.incompletePeriod &&
      record.ac !== null && record.ac !== undefined && !isNaN(record.ac);
  }

  function aggregatePeriodRecords(records, selectedMonths) {
    var source = (records || []).map(function(record) { return Object.assign({}, record); });
    if (selectedMonths.length <= 1) {
      G.recomputeTimelinessRanks(source);
      source.forEach(G.ensureBands);
      return source;
    }

    var grouped = {};
    source.forEach(function(record) {
      if (!grouped[record.b]) grouped[record.b] = [];
      grouped[record.b].push(record);
    });

    var expectedPeriodMonths = selectedMonths.filter(function(month) {
      return source.some(function(record) { return record.m === month; });
    });
    var expectedMonths = expectedPeriodMonths.length || selectedMonths.length;
    var aggregated = [];

    Object.keys(grouped).forEach(function(bakery) {
      var rows = grouped[bakery];
      var avg = function(key) {
        return rows.reduce(function(total, record) { return total + record[key]; }, 0) / rows.length;
      };
      var avgDefined = function(key) {
        var values = rows
          .map(function(record) { return record[key]; })
          .filter(function(value) { return typeof value === 'number' && !isNaN(value); });
        return values.length ? values.reduce(function(total, value) { return total + value; }, 0) / values.length : null;
      };
      var round1 = function(value) {
        return value === null ? null : Math.round(value * 10) / 10;
      };
      var sum = function(key) {
        var values = rows
          .map(function(record) { return record[key]; })
          .filter(function(value) { return typeof value === 'number' && !isNaN(value); });
        return values.length ? Math.round(values.reduce(function(total, value) { return total + value; }, 0)) : null;
      };
      var totalVolume = Math.round(rows.reduce(function(total, record) { return total + record.v; }, 0));
      var scoredMonthCount = new Set(rows
        .filter(function(record) { return G.hasScoredData ? G.hasScoredData(record) : record && !record.noData; })
        .map(function(record) { return record.m; })).size;

      var aggregate = {
        b: bakery,
        m: selectedMonths.join(', '),
        monthsExpected: expectedMonths,
        monthsCovered: scoredMonthCount,
        incompletePeriod: scoredMonthCount < expectedMonths,
        n: round1(avg('n')),
        v: totalVolume,
        s2: round1(avg('s2')),
        s3: round1(avg('s3')),
        s4: round1(avgDefined('s4')),
        o5: round1(avg('o5')),
        ov: round1(avg('ov')),
        fr: round1(avg('fr')),
        dr: round1(avg('dr')),
        ef: round1(avg('ef')),
        ep: round1(avg('ep')),
        dp: round1(avg('dp')),
        fp: round1(avg('fp')),
        np: round1(avg('np')),
        c: round1(avg('c')),
        co: rows[0].co,
        s2w: round1(avg('s2w')),
        ac: round1(avg('ac')),
        ats: round1(avg('ats')),
        a_at: round1(avgDefined('a_at')),
        c_raw: round1(avg('c_raw')),
        ac_raw: round1(avg('ac_raw')),
        s30: round1(avgDefined('s30')),
        td: sum('td'),
        at: round1(avgDefined('at')),
        at12: round1(avgDefined('at12')),
        at9: round1(avgDefined('at9')),
        nc: round1(avgDefined('nc')),
        nm: round1(avgDefined('nm')),
        nd: round1(avgDefined('nd')),
        vc: sum('vc'),
        vf: sum('vf'),
        na: round1(avgDefined('na')),
        va: sum('va')
      };
      G.markDataCoverage(aggregate);
      G.ensureBands(aggregate);
      aggregated.push(aggregate);
    });

    // Recompute both index calculations once against the complete company
    // cohort. Subsequent dashboard filters only hide records, so comparison
    // context and confidence adjustments remain stable.
    G.recomputeTimelinessRanks(aggregated);
    return aggregated;
  }

  function assignCompanyRanking(records) {
    var ranked = records.filter(isRankable).sort(function(first, second) {
      if (second.ac !== first.ac) return second.ac - first.ac;
      // The retained peer calculation is only a tie-breaker when benchmark
      // scores are saturated; it is not exposed as a second performance score.
      if (second.c !== first.c) return second.c - first.c;
      return String(first.b || '').localeCompare(String(second.b || ''), 'en-GB');
    });
    var cohortSize = ranked.length;
    ranked.forEach(function(record, index) {
      record.companyRank = index + 1;
      record.companyCohortSize = cohortSize;
      record.companyTopPercent = Math.max(1, Math.ceil(((index + 1) / cohortSize) * 100));
      record.cr = index + 1;
    });
    records.filter(function(record) { return !isRankable(record); }).forEach(function(record) {
      record.companyRank = null;
      record.companyCohortSize = cohortSize;
      record.companyTopPercent = null;
      record.cr = null;
    });
    return records;
  }

  function buildCompanyPeriodData() {
    var state = G.state;
    var selectedMonths = [].concat(state.selectedMonths || []);
    var records = state.ALL.filter(function(record) {
      return selectedMonths.includes(record.m);
    });
    return assignCompanyRanking(aggregatePeriodRecords(records, selectedMonths));
  }

  function passesNonBandFilters(record) {
    var state = G.state;
    if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(record.b))) return false;
    if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(record.b))) return false;
    if (state.searchBakery && state.searchBakery.length &&
        !state.searchBakery.some(function(search) { return record.b.toLowerCase().includes(search.toLowerCase()); })) return false;
    return true;
  }

  function benchmarkBandValue(filterValue) {
    if (!filterValue) return '';
    return filterValue.indexOf('abs:') === 0 ? filterValue.slice(4) : filterValue;
  }

  G.getCompanyPeriodData = buildCompanyPeriodData;

  G.getAvailableBands = function() {
    var absolute = new Set();
    buildCompanyPeriodData().filter(passesNonBandFilters).forEach(function(record) {
      if (record.acb) absolute.add(record.acb);
    });
    return { absolute: absolute, relative: new Set() };
  };

  G.getData = function() {
    var state = G.state;
    var benchmarkBand = benchmarkBandValue(state.bandFilter);
    var records = buildCompanyPeriodData().filter(passesNonBandFilters);

    if (benchmarkBand) {
      records = records.filter(function(record) { return record.acb === benchmarkBand; });
    }

    return records.sort(function(first, second) {
      if (isRankable(first) !== isRankable(second)) return isRankable(first) ? -1 : 1;
      if (!isRankable(first)) return String(first.b || '').localeCompare(String(second.b || ''), 'en-GB');
      return first.companyRank - second.companyRank;
    });
  };
}());

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

  // A multi-month period used to demand a scored row in *every* month it
  // covered, so a bakery that opened part-way through — or lost a single
  // month — fell out of the sample entirely. Over a long window such as "All"
  // that excluded most of the newer estate. A bakery now only needs three
  // scored months, provided its data still runs up to the end of the period,
  // and it is scored on the months it actually has.
  var MIN_SCORED_MONTHS = 3;

  function isScoredRow(record) {
    return G.hasScoredData ? G.hasScoredData(record) : !!record && !record.noData;
  }

  function isRankable(record) {
    return !!record && !record.noData && !record.incompletePeriod &&
      record.ac !== null && record.ac !== undefined && !isNaN(record.ac);
  }

  function aggregatePeriodRecords(records, selectedMonths) {
    var source = records || [];

    // The single-month path hands its records straight back to the dashboard
    // after stamping ranks and bands on them, so those have to be copies —
    // writing to state.ALL would corrupt the stored dataset.
    if (selectedMonths.length <= 1) {
      source = source.map(function(record) { return Object.assign({}, record); });
      G.recomputeTimelinessRanks(source);
      source.forEach(G.ensureBands);
      return source;
    }

    // The multi-month path only ever reads these records — every value below is
    // averaged or summed into a brand-new aggregate object, and the two mutating
    // helpers are applied to that aggregate, never to a source row. So it can
    // work off state.ALL directly. Copying first was the single most expensive
    // step of a refresh, and bought nothing.
    var grouped = {};
    var monthsPresent = new Set();
    source.forEach(function(record) {
      if (!grouped[record.b]) grouped[record.b] = [];
      grouped[record.b].push(record);
      monthsPresent.add(record.m);
    });

    var expectedPeriodMonths = selectedMonths.filter(function(month) {
      return monthsPresent.has(month);
    });
    var periodMonths = expectedPeriodMonths.length ? expectedPeriodMonths : selectedMonths;
    var expectedMonths = periodMonths.length;
    var requiredMonths = Math.min(MIN_SCORED_MONTHS, expectedMonths);
    // Recent history means the bakery is still reporting at the end of the
    // period, not that it reported in a fixed calendar window. The closing
    // window is the same size as the floor, so a period of three months or
    // fewer still asks for full coverage and behaves exactly as it did before.
    var closingMonths = periodMonths.slice(-requiredMonths);
    var aggregated = [];

    Object.keys(grouped).forEach(function(bakery) {
      var rows = grouped[bakery];
      var scoredRows = rows.filter(isScoredRow);
      // Averages run over the months the bakery was actually scored in. An
      // unscored month carries null scores and empty metrics, and now that
      // partial coverage is allowed those months would otherwise be averaged
      // in as zeroes and understate every site with a gap.
      var statRows = scoredRows.length ? scoredRows : rows;
      var avg = function(key) {
        return statRows.reduce(function(total, record) { return total + record[key]; }, 0) / statRows.length;
      };
      // avgDefined and sum are each asked for around twenty fields per bakery.
      // Built out of map().filter().reduce() they walked the rows three times
      // and allocated two throwaway arrays per field; one pass, no allocation.
      var avgDefined = function(key) {
        var total = 0;
        var count = 0;
        for (var i = 0; i < statRows.length; i++) {
          var value = statRows[i][key];
          if (typeof value === 'number' && !isNaN(value)) { total += value; count++; }
        }
        return count ? total / count : null;
      };
      var round1 = function(value) {
        return value === null ? null : Math.round(value * 10) / 10;
      };
      var sum = function(key) {
        var total = 0;
        var count = 0;
        for (var i = 0; i < statRows.length; i++) {
          var value = statRows[i][key];
          if (typeof value === 'number' && !isNaN(value)) { total += value; count++; }
        }
        return count ? Math.round(total) : null;
      };
      var totalVolume = Math.round(statRows.reduce(function(total, record) { return total + record.v; }, 0));
      var scoredMonths = new Set(scoredRows.map(function(record) { return record.m; }));
      var scoredMonthCount = scoredMonths.size;
      var stillReporting = closingMonths.some(function(month) { return scoredMonths.has(month); });

      var aggregate = {
        b: bakery,
        m: selectedMonths.join(', '),
        monthsExpected: expectedMonths,
        monthsCovered: scoredMonthCount,
        monthsRequired: requiredMonths,
        incompletePeriod: scoredMonthCount < requiredMonths || !stillReporting,
        partialPeriod: scoredMonthCount >= requiredMonths && stillReporting && scoredMonthCount < expectedMonths,
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

  function computeCompanyPeriodData() {
    var state = G.state;
    var selectedMonths = [].concat(state.selectedMonths || []);
    // Set membership rather than Array#includes: over a long period this test
    // runs once per record per month, and "All" makes that the largest loop on
    // the refresh path.
    var wanted = new Set(selectedMonths);
    var records = state.ALL.filter(function(record) {
      return wanted.has(record.m);
    });
    return assignCompanyRanking(aggregatePeriodRecords(records, selectedMonths));
  }

  // The company-wide period aggregate — every bakery, ranked, before any
  // dashboard filter narrows it. It is the most expensive step of a refresh and
  // a single refresh asks for it more than once: updateBandFilterOptions() needs
  // it to work out which bands exist, then getData() needs it again to render,
  // and the word cloud asks a third time when the Feedback tab is open. The
  // result depends on nothing but the loaded dataset and the selected period,
  // so it is computed once per (dataset, period) and handed back after that.
  //
  // state.ALL is only ever replaced wholesale (js/app.js sets it when a dataset
  // loads), so its identity is a sound staleness signal; the month list is
  // compared by value because it is rebuilt on every period change.
  // A control character, so it cannot occur inside a "MMM YY" label and two
  // different month lists cannot produce the same key.
  var MONTH_KEY_SEPARATOR = String.fromCharCode(1);

  var _periodCacheAll = null;
  var _periodCacheMonths = null;
  var _periodCacheData = null;

  function invalidateCompanyPeriodData() {
    _periodCacheAll = null;
    _periodCacheMonths = null;
    _periodCacheData = null;
  }

  function buildCompanyPeriodData() {
    var state = G.state;
    var all = state.ALL;
    var monthKey = (state.selectedMonths || []).join(MONTH_KEY_SEPARATOR);
    if (_periodCacheData && _periodCacheAll === all && _periodCacheMonths === monthKey) {
      // A copy of the list, not of the records: callers sort and filter what
      // they are given, and no caller may reorder the cached list itself.
      return _periodCacheData.slice();
    }
    _periodCacheData = computeCompanyPeriodData();
    _periodCacheAll = all;
    _periodCacheMonths = monthKey;
    return _periodCacheData.slice();
  }

  G.invalidateCompanyPeriodData = invalidateCompanyPeriodData;

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

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
        !G.isSelectedBakery(record.b, state.searchBakery)) return false;
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

  function sortByRank(records) {
    return records.sort(function(first, second) {
      if (isRankable(first) !== isRankable(second)) return isRankable(first) ? -1 : 1;
      if (!isRankable(first)) return String(first.b || '').localeCompare(String(second.b || ''), 'en-GB');
      return first.companyRank - second.companyRank;
    });
  }

  // Region/Ops/search-filtered rows, before Benchmark Band narrows anything
  // further. Band has to apply AFTER grouping (see G.getGroupedViewData) so
  // it filters whichever rows are actually on screen — ops areas/regions
  // when grouped, bakeries otherwise — rather than always filtering the
  // bakeries underneath a group before they're rolled up, which would leave
  // a group's own displayed band not matching the band it was filtered to.
  function getRegionOpsFilteredData() {
    return buildCompanyPeriodData().filter(passesNonBandFilters);
  }

  G.getData = function() {
    var benchmarkBand = benchmarkBandValue(G.state.bandFilter);
    var records = getRegionOpsFilteredData();

    if (benchmarkBand) {
      records = records.filter(function(record) { return record.acb === benchmarkBand; });
    }

    return sortByRank(records);
  };

  // A plain mean, matching G.avg — the same function the Overview KPI row
  // already uses to show one number for however many bakeries the current
  // filters leave in scope. Switching View to Ops Areas/Regions has to land
  // on that same number for the same bakeries, or "76 in Bakery view,
  // filtered to Bobby Holmes" and "76 in Ops Areas view" stop agreeing —
  // which volume-weighting broke, since a handful of small sites can pull
  // a weighted mean well away from the plain one every other view shows.
  //
  // Every displayed metric has to be listed here: anything left off is simply
  // absent from a group row, and G.avg reads a missing field as nothing at all
  // (0 on the KPI tiles, an em dash in the table) rather than erroring — which
  // is how Coffee Efficiency ('ts') and its two percentile siblings ('ap',
  // 'atp') read as no data in Ops Areas/Regions view while every other card
  // showed a figure.
  var GROUP_AVERAGED_FIELDS = [
    'n', 's2', 's3', 's4', 'o5', 'ov', 'fr', 'dr', 'ef', 'ep', 'dp', 'fp',
    'np', 'ts', 'ap', 'atp', 'c', 's2w', 'ac', 'ats', 'a_at', 'c_raw',
    'ac_raw', 's30', 'at', 'at12', 'at9', 'nc', 'nm', 'nd', 'na'
  ];
  var GROUP_SUMMED_FIELDS = ['v', 'td', 'vc', 'vf', 'va'];

  function groupCentroid(rows) {
    var pts = [];
    rows.forEach(function(r) {
      var meta = G.getBakeryMeta ? G.getBakeryMeta(r.b) : null;
      if (meta && meta.ll) pts.push(meta.ll);
    });
    if (!pts.length) return null;
    return [
      pts.reduce(function(total, p) { return total + p[0]; }, 0) / pts.length,
      pts.reduce(function(total, p) { return total + p[1]; }, 0) / pts.length
    ];
  }

  function buildGroupAggregate(groupName, rows, groupBy) {
    var scoredRows = rows.filter(isScoredRow);
    var statRows = scoredRows.length ? scoredRows : rows;
    var round1 = function(value) {
      return value === null || value === undefined ? null : Math.round(value * 10) / 10;
    };
    var avg = function(key) {
      var defined = statRows
        .map(function(record) { return record[key]; })
        .filter(function(value) { return typeof value === 'number' && !isNaN(value); });
      return defined.length ? defined.reduce(function(total, value) { return total + value; }, 0) / defined.length : null;
    };
    var sum = function(key) {
      var total = 0, count = 0;
      rows.forEach(function(record) {
        var value = record[key];
        if (typeof value === 'number' && !isNaN(value)) { total += value; count++; }
      });
      return count ? Math.round(total) : 0;
    };

    var aggregate = {
      b: groupName,
      isGroup: true,
      groupType: groupBy,
      region: groupBy === 'region' ? groupName : (G.getBakeryRegion(rows[0].b) || 'Unknown'),
      memberCount: rows.length,
      m: rows[0] ? rows[0].m : '',
      incompletePeriod: scoredRows.length === 0,
      partialPeriod: false,
      ll: groupCentroid(rows)
    };
    GROUP_AVERAGED_FIELDS.forEach(function(key) { aggregate[key] = round1(avg(key)); });
    GROUP_SUMMED_FIELDS.forEach(function(key) { aggregate[key] = sum(key); });
    // ac/c are the plain average of each member bakery's OWN already-
    // confidence-adjusted score — deliberately NOT recomputed via
    // G.recomputeTimelinessRanks, which re-derives ac/c from raw component
    // inputs and re-applies confidence adjustment against the group's own
    // pooled volume (almost always >=15, so it comes back near-unadjusted —
    // a group reading well above what its own bakeries averaged, purely
    // because pooling volume switched off shrinkage every bakery's own
    // score had applied). Bands are derived from these already-final ac/c.
    G.markDataCoverage(aggregate);
    G.ensureBands(aggregate);
    return aggregate;
  }

  // Ranked ops-area/region rows before Benchmark Band narrows anything —
  // shared by G.getGroupedViewData (which then applies Band) and
  // G.getGroupedAvailableBands (which needs the full, unfiltered set to know
  // what's selectable at all).
  function buildRankedGroups(groupBy) {
    var keyFn = groupBy === 'region' ? G.getBakeryRegion : G.getBakeryOps;
    var groups = {};
    getRegionOpsFilteredData().forEach(function(record) {
      var key = (keyFn ? keyFn(record.b) : null) || 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });
    return assignCompanyRanking(Object.keys(groups).map(function(key) {
      return buildGroupAggregate(key, groups[key], groupBy);
    }));
  }

  // The display-only counterpart to G.getData(): same period/region/ops/
  // search-filtered rows, rolled up to one row per ops area or region. Kept
  // separate from G.getData() itself so every other consumer (Focus Bakeries,
  // Speed vs NPS, the word cloud, exports) is unaffected — only refresh()
  // calls this, and only for the three views that offer the View toggle.
  //
  // Benchmark Band filters the groups themselves (an ops area's/region's own
  // band), not the bakeries feeding into them, so it's applied here, after
  // aggregation and ranking, rather than inherited pre-applied at bakery
  // level. Ranking runs on every group in the region/ops-filtered scope
  // first, so "3 of 23 ops areas" still means all 23 — Band then narrows
  // which of those already-ranked rows are returned.
  G.getGroupedViewData = function(groupBy) {
    var aggregated = buildRankedGroups(groupBy);
    var benchmarkBand = benchmarkBandValue(G.state.bandFilter);
    if (benchmarkBand) {
      aggregated = aggregated.filter(function(record) { return record.acb === benchmarkBand; });
    }
    return aggregated;
  };

  // The Benchmark Band dropdown's available-options counterpart to
  // G.getAvailableBands(), scoped to the groups themselves rather than the
  // bakeries under them — otherwise a band with no ops area/region actually
  // in it (common: an area's average rarely lands in the same band every one
  // of its bakeries does) would stay selectable and silently return nothing.
  G.getGroupedAvailableBands = function(groupBy) {
    var absolute = new Set();
    buildRankedGroups(groupBy).forEach(function(record) {
      if (record.acb) absolute.add(record.acb);
    });
    return { absolute: absolute, relative: new Set() };
  };
}());

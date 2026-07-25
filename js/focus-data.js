// ========== FOCUS BAKERY DATA ==========
// Focus Bakeries is an operational view, so it deliberately ignores the
// dashboard's user-selected period. It uses every closed month for eligibility
// and trends, then weights the latest six closed calendar months for the
// current support decision. The current calendar month is never included.
window.GAILS = window.GAILS || {};

(function() {
  var G = window.GAILS;
  var MIN_ELIGIBLE_MONTHS = 3;
  var RECENT_MONTH_COUNT = 6;

  var WEIGHTED_FIELDS = [
    'c', 'ac', 'c_raw', 'ac_raw', 'n', 's2', 's3', 's4', 'o5', 'ov',
    'fr', 'dr', 'ef', 'ep', 'dp', 'fp', 'np', 's2w', 'ats', 'a_at',
    's30', 'at', 'at12', 'at9', 'nc', 'nm', 'nd', 'na', 'ts', 'ap', 'atp'
  ];
  var SUM_FIELDS = ['v', 'td', 'vc', 'vf', 'va'];

  function isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }

  function padYear(year) {
    return String(year).slice(-2);
  }

  function monthLabelFromKey(key) {
    var year = Math.floor(key / 12);
    var month = key - year * 12;
    return G.MONTH_SHORT[month] + ' ' + padYear(year);
  }

  function currentMonthKey(referenceDate) {
    var now = referenceDate instanceof Date ? referenceDate : new Date();
    return now.getFullYear() * 12 + now.getMonth();
  }

  function hasUsableScore(record, scoreField) {
    return !!record && !record.noData && !record.incompletePeriod && isNumber(record[scoreField]);
  }

  function canonicalBakeryName(name) {
    return G.resolveBakeryMetaKey ? (G.resolveBakeryMetaKey(name) || name) : name;
  }

  function longestConsecutiveRun(byMonth, months, scoreField) {
    var longest = 0;
    var current = 0;
    months.forEach(function(month) {
      if (hasUsableScore(byMonth[month], scoreField)) {
        current++;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    });
    return longest;
  }

  function getRecentClosedMonths(referenceDate) {
    var currentKey = currentMonthKey(referenceDate);
    var months = [];
    for (var age = RECENT_MONTH_COUNT - 1; age >= 0; age--) {
      months.push(monthLabelFromKey(currentKey - 1 - age));
    }
    return months;
  }

  function getAllClosedMonths(records, referenceDate) {
    var currentKey = currentMonthKey(referenceDate);
    var earliestKey = null;
    (records || []).forEach(function(record) {
      if (!record || !record.m) return;
      var key = G.monthSortKey(record.m);
      if (key >= currentKey) return;
      if (earliestKey === null || key < earliestKey) earliestKey = key;
    });
    if (earliestKey === null) return [];

    var months = [];
    for (var key = earliestKey; key < currentKey; key++) {
      months.push(monthLabelFromKey(key));
    }
    return months;
  }

  function passesBakeryFilters(name, state) {
    if ((state.regionFilter || []).length && state.regionFilter.indexOf(G.getBakeryRegion(name)) < 0) return false;
    if ((state.opsFilter || []).length && state.opsFilter.indexOf(G.getBakeryOps(name)) < 0) return false;
    if ((state.searchBakery || []).length && !state.searchBakery.some(function(search) {
      return name.toLowerCase().indexOf(String(search).toLowerCase()) >= 0;
    })) return false;
    return true;
  }

  function weightedValue(sources, field) {
    var total = 0;
    var weight = 0;
    sources.forEach(function(source) {
      var value = source.record[field];
      if (!isNumber(value)) return;
      total += value * source.weight;
      weight += source.weight;
    });
    return weight ? Math.round((total / weight) * 10) / 10 : null;
  }

  function summedValue(records, field) {
    var values = records.map(function(record) { return record[field]; }).filter(isNumber);
    return values.length ? Math.round(values.reduce(function(total, value) { return total + value; }, 0)) : null;
  }

  function averagePositiveValue(records, field) {
    var values = records.map(function(record) { return record[field]; }).filter(function(value) {
      return isNumber(value) && value > 0;
    });
    return values.length ? Math.round(values.reduce(function(total, value) { return total + value; }, 0) / values.length) : null;
  }

  function assignBands(snapshot) {
    snapshot.cb = snapshot.c === null || snapshot.c === undefined || isNaN(snapshot.c)
      ? 'No Data'
      : snapshot.c >= 75 ? 'Top Performance' : snapshot.c >= 50 ? 'Above Average' : snapshot.c >= 25 ? 'Below Average' : 'Low Performance';
    snapshot.acb = snapshot.ac === null || snapshot.ac === undefined || isNaN(snapshot.ac)
      ? 'No Data'
      : snapshot.ac >= 90 ? 'Exceeding' : snapshot.ac >= 75 ? 'Meeting' : snapshot.ac >= 60 ? 'Approaching' : 'Below Standard';
  }

  function focusBandMatch(record, isAbsolute) {
    var band = record[isAbsolute ? 'acb' : 'cb'];
    return isAbsolute
      ? band === 'Below Standard' || band === 'Approaching'
      : band === 'Low Performance' || band === 'Below Average';
  }

  function buildSources(byMonth, recentMonths) {
    var sources = [];
    var latest = byMonth[recentMonths[recentMonths.length - 1]];
    var previous = byMonth[recentMonths[recentMonths.length - 2]];
    var baseline = recentMonths.slice(0, -2).map(function(month) { return byMonth[month]; }).filter(Boolean);

    if (latest) sources.push({ record: latest, weight: 0.60 });
    if (previous) sources.push({ record: previous, weight: 0.25 });
    if (baseline.length) {
      baseline.forEach(function(record) {
        sources.push({ record: record, weight: 0.15 / baseline.length });
      });
    }
    return sources;
  }

  function dataReviewEntry(name, reason, validRows) {
    var last = validRows.length ? validRows[validRows.length - 1] : null;
    return {
      name: name,
      reason: reason,
      region: G.getBakeryRegion(name),
      operationsArea: G.getBakeryOps(name),
      lastObservedMonth: last ? last.m : null,
      lastObservedScore: last ? last.c : null
    };
  }

  G.FOCUS_DATA_CONFIG = Object.freeze({
    minimumEligibleMonths: MIN_ELIGIBLE_MONTHS,
    recentMonthCount: RECENT_MONTH_COUNT,
    weights: Object.freeze({ latest: 0.60, previous: 0.25, baseline: 0.15 })
  });

  G.focusMonthLabelFromKey = monthLabelFromKey;

  G.getFocusRecentMonths = function(referenceDate) {
    return getRecentClosedMonths(referenceDate);
  };

  G.getFocusClosedMonths = function(referenceDate, records) {
    var state = G.state || {};
    return getAllClosedMonths(records || state.ALL || [], referenceDate);
  };

  G.buildFocusDataset = function(options) {
    options = options || {};
    var state = options.state || G.state || {};
    var records = options.records || state.ALL || [];
    var referenceDate = options.referenceDate instanceof Date ? options.referenceDate : new Date();
    var isAbsolute = options.isAbsolute !== undefined ? !!options.isAbsolute : true;
    var scoreField = isAbsolute ? 'ac' : 'c';
    var recentMonths = getRecentClosedMonths(referenceDate);
    var closedMonths = getAllClosedMonths(records, referenceDate);
    var currentKey = currentMonthKey(referenceDate);
    var grouped = {};

    records.forEach(function(record) {
      if (!record || !record.b || !record.m) return;
      var name = canonicalBakeryName(record.b);
      if (!passesBakeryFilters(name, state)) return;
      if (!grouped[name]) grouped[name] = {};
      if (G.monthSortKey(record.m) >= currentKey) return;
      var existing = grouped[name][record.m];
      if (!existing || (!hasUsableScore(existing, scoreField) && hasUsableScore(record, scoreField))) {
        grouped[name][record.m] = record;
      }
    });

    var data = [];
    var onboarding = [];
    var dataReview = [];
    var allSnapshots = [];

    Object.keys(grouped).sort().forEach(function(name) {
      var byMonthAll = grouped[name];
      var lifetimeValid = closedMonths.map(function(month) { return byMonthAll[month]; })
        .filter(function(record) { return hasUsableScore(record, scoreField); });
      var longestRun = longestConsecutiveRun(byMonthAll, closedMonths, scoreField);

      if (longestRun < MIN_ELIGIBLE_MONTHS) {
        onboarding.push({
          name: name,
          completedMonths: longestRun,
          monthsNeeded: MIN_ELIGIBLE_MONTHS - longestRun,
          usableLifetimeMonths: lifetimeValid.length,
          region: G.getBakeryRegion(name),
          operationsArea: G.getBakeryOps(name)
        });
        return;
      }

      var recentByMonth = {};
      recentMonths.forEach(function(month) {
        var record = byMonthAll[month];
        if (hasUsableScore(record, scoreField)) recentByMonth[month] = record;
      });
      var recentValid = recentMonths.map(function(month) { return recentByMonth[month]; }).filter(Boolean);
      var hasLatest = !!recentByMonth[recentMonths[recentMonths.length - 1]];
      var hasPrevious = !!recentByMonth[recentMonths[recentMonths.length - 2]];
      var hasRecentEvidence = hasLatest || hasPrevious;
      var firstUsableKey = G.monthSortKey(lifetimeValid[0].m);
      var expectedRecentMonths = recentMonths.filter(function(month) {
        return G.monthSortKey(month) >= firstUsableKey;
      });

      if (recentValid.length < 2 || !hasRecentEvidence) {
        dataReview.push(dataReviewEntry(name, 'Established bakery has an extended completed-month data gap', lifetimeValid));
        return;
      }

      var sources = buildSources(recentByMonth, recentMonths);
      var mostRecent = recentValid[recentValid.length - 1];
      var snapshot = Object.assign({}, mostRecent);

      WEIGHTED_FIELDS.forEach(function(field) {
        snapshot[field] = weightedValue(sources, field);
      });
      SUM_FIELDS.forEach(function(field) {
        snapshot[field] = summedValue(recentValid, field);
      });
      // Keep the period total for existing consumers, and expose the monthly
      // figure explicitly for the Focus "All bakery data" table.
      snapshot.tdMonthlyAvg = averagePositiveValue(recentValid, 'td');

      snapshot.b = name;
      snapshot.m = recentMonths[recentMonths.length - 1];
      snapshot.noData = false;
      // Focus preserves a usable provisional band. Company-wide aggregation
      // continues to use incompletePeriod/Incomplete independently.
      snapshot.incompletePeriod = false;
      snapshot.focusIncomplete = !(hasLatest && hasPrevious && recentValid.length === expectedRecentMonths.length);
      snapshot.focusDataStatus = snapshot.focusIncomplete ? 'provisional' : 'complete';
      snapshot.focusAsOfMonth = recentMonths[recentMonths.length - 1];
      snapshot.focusObservedThrough = mostRecent.m;
      snapshot.focusRecentMonthsCovered = recentValid.length;
      snapshot.focusLifetimeMonths = lifetimeValid.length;
      snapshot.focusSourceMonths = recentValid.map(function(record) { return record.m; });
      snapshot.monthsExpected = expectedRecentMonths.length;
      snapshot.monthsCovered = recentValid.length;
      assignBands(snapshot);

      if (snapshot.focusDataStatus === 'provisional' && !focusBandMatch(snapshot, isAbsolute)) {
        dataReview.push(dataReviewEntry(name, 'Recent data is incomplete, so current status cannot be confirmed', lifetimeValid));
        return;
      }

      allSnapshots.push(snapshot);

      var bandFilter = options.ignoreBandFilter ? '' : state.bandFilter;
      if (bandFilter) {
        if (bandFilter.indexOf('abs:') === 0 && snapshot.acb !== bandFilter.slice(4)) return;
        if (bandFilter.indexOf('abs:') !== 0 && snapshot.cb !== bandFilter) return;
      }
      data.push(snapshot);
    });

    return {
      data: data,
      allSnapshots: allSnapshots,
      onboarding: onboarding,
      dataReview: dataReview,
      closedMonths: closedMonths,
      recentMonths: recentMonths,
      latestClosedMonth: recentMonths[recentMonths.length - 1],
      bakeryCount: Object.keys(grouped).length,
      eligibleCount: allSnapshots.length,
      isAbsolute: isAbsolute
    };
  };

  G.getFocusAvailableBands = function() {
    var context = G.buildFocusDataset({ ignoreBandFilter: true });
    return {
      relative: new Set(context.allSnapshots.map(function(record) { return record.cb; })),
      absolute: new Set(context.allSnapshots.map(function(record) { return record.acb; }))
    };
  };
})();

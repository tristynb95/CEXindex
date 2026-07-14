// ========== CEI CALCULATION MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.NO_DATA_VOLUME_THRESHOLD = 1;

window.GAILS.hasScoredData = function(r) {
  if (!r || r.noData) return false;
  var volume = typeof r.v === 'number' && !isNaN(r.v) ? r.v : 0;
  return volume >= GAILS.NO_DATA_VOLUME_THRESHOLD;
};

window.GAILS.markDataCoverage = function(r) {
  if (!r) return r;
  var volume = typeof r.v === 'number' && !isNaN(r.v) ? r.v : 0;
  r.noData = !!r.incompletePeriod || volume < GAILS.NO_DATA_VOLUME_THRESHOLD;
  r.co = r.incompletePeriod ? 'Incomplete' : r.noData ? 'No Data' : volume >= 15 ? 'High' : volume >= 8 ? 'Medium' : 'Low';
  return r;
};

// Derives cb/acb (index band labels) fresh from c/ac scores, always
// overwriting whatever is already on the record. Records loaded from
// storage can carry a stale or missing band (e.g. saved before banding
// existed, or under an old naming scheme) — trusting a stored value that
// doesn't match a key in G.COL/G.ABSCOL is what makes chart color lookups
// (G.COL[r.cb] / G.ABSCOL[r.acb]) come back undefined and render points/
// slices black, so we never trust the stored band, only the score.
window.GAILS.ensureBands = function(r) {
  if (!r) return r;
  if (r.incompletePeriod) {
    r.cb = 'Incomplete';
  } else if (r.noData || r.c === null || r.c === undefined || isNaN(r.c)) {
    r.cb = 'No Data';
  } else {
    r.cb = r.c >= 75 ? 'Top Performer' : r.c >= 50 ? 'Above Average' : r.c >= 25 ? 'Below Average' : 'Needs Support';
  }
  if (r.incompletePeriod) {
    r.acb = 'Incomplete';
  } else if (r.noData || r.ac === null || r.ac === undefined || isNaN(r.ac)) {
    r.acb = 'No Data';
  } else {
    r.acb = r.ac >= 90 ? 'Exceeding' : r.ac >= 75 ? 'Meeting' : r.ac >= 60 ? 'Approaching' : 'Below Standard';
  }
  return r;
};

// Coffee Efficiency score = % of drinks delivered under 2 min (company standard: 80%)
// Re-rank ts and ap from raw s2 values — use after multi-month aggregation
window.GAILS.recomputeTimelinessRanks = function(records) {
  var G = GAILS;
  var W = G.CEI_WEIGHTS;
  records.forEach(G.markDataCoverage);
  var scored = records.filter(G.hasScoredData);
  var confidenceContext = G.buildConfidenceContext(scored);

  scored.forEach(function(r) {
    r.ts = Math.round((r.s2 || 0) * 10) / 10;
  });
  var npsVals = scored.map(function(r) { return r.n; });
  var tsVals = scored.map(function(r) { return r.ts; });
  var atVals = scored
    .map(function(r) { return r.at; })
    .filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });

  scored.forEach(function(r) {
    r.np = Math.round(G.percentileRank(npsVals, r.n, false) * 10) / 10;
    r.ap = Math.round(G.percentileRank(tsVals, r.ts, false) * 10) / 10;
    if (r.at !== null && r.at !== undefined && !isNaN(r.at)) {
      r.atp = Math.round(G.percentileRank(atVals, r.at, true) * 10) / 10;
    } else {
      r.atp = 50.0;
    }
    var rawCEI = r.np * W.nps + r.ep * W.ef + r.dp * W.dr + r.fp * W.fr + r.ap * W.time + r.atp * W.at;
    r.c_raw = Math.round(rawCEI * 10) / 10;

    var absNps = G.computeAbsoluteComponent(r.n, G.BENCHMARKS.nps, G.BENCHMARK_FLOORS.nps);
    var absEf = G.computeAbsoluteComponent(r.ef, G.BENCHMARKS.ef, G.BENCHMARK_FLOORS.ef);
    var absDr = G.computeAbsoluteComponent(r.dr, G.BENCHMARKS.dr, G.BENCHMARK_FLOORS.dr);
    var absFr = G.computeAbsoluteComponent(r.fr, G.BENCHMARKS.fr, G.BENCHMARK_FLOORS.fr);
    var absTs = G.computeCoffeeEfficiencyComponent(r.s2, r.s3, r.s4, r.o5);
    r.ats = absTs;

    var absAt = G.computeAbsoluteWaitComponent(r.at);
    r.a_at = Math.round(absAt * 10) / 10;
    r.ac_raw = Math.round((absNps * W.nps + absEf * W.ef + absDr * W.dr + absFr * W.fr + absTs * W.time + absAt * W.at) * 10) / 10;
  });

  var cohortMean = scored.length ? (scored.reduce(function(a, r) { return a + r.c_raw; }, 0) / scored.length) : 0;
  var absMean = scored.length ? (scored.reduce(function(a, r) { return a + r.ac_raw; }, 0) / scored.length) : 0;
  records.forEach(function(r) {
    if (!G.hasScoredData(r)) {
      r.c = null;
      r.ac = null;
      G.ensureBands(r);
      return;
    }
    r.c = Math.round(G.confidenceAdjust(r.c_raw, cohortMean, r.v, r, confidenceContext) * 10) / 10;
    r.ac = Math.round(G.confidenceAdjust(r.ac_raw, absMean, r.v, r, confidenceContext) * 10) / 10;
    G.ensureBands(r);
  });
};

window.GAILS.median = function(values) {
  var nums = (values || []).filter(function(v) { return typeof v === 'number' && !isNaN(v); }).sort(function(a, b) { return a - b; });
  if (!nums.length) return 0;
  var mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

window.GAILS.buildConfidenceContext = function(records) {
  var current = typeof GAILS.getCurrentMonthLabel === 'function' ? GAILS.getCurrentMonthLabel() : '';
  var now = new Date();
  var finalDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  var isSingleCurrentMonth = !!current && !!records.length && records.every(function(r) { return r && r.m === current; });
  var medianVolume = GAILS.median(records.map(function(r) { return typeof r.v === 'number' && !isNaN(r.v) ? r.v : 0; }));
  return {
    isSingleCurrentMonth: isSingleCurrentMonth,
    isLateMonth: now.getDate() >= Math.max(21, finalDay - 7),
    lowVolumeCutoff: medianVolume * 0.5
  };
};

window.GAILS.shouldBalanceCurrentMonthRecord = function(record, context, volume) {
  if (!context || !context.isSingleCurrentMonth || !context.isLateMonth) return false;
  if (!context.lowVolumeCutoff || context.lowVolumeCutoff < GAILS.NO_DATA_VOLUME_THRESHOLD) return false;
  return volume < context.lowVolumeCutoff;
};

// Confidence weighting
window.GAILS.confidenceAdjust = function(rawScore, cohortMean, volume, record, context) {
  if (rawScore === null || rawScore === undefined || isNaN(rawScore)) return null;
  if (cohortMean === null || cohortMean === undefined || isNaN(cohortMean)) return rawScore;
  volume = typeof volume === 'number' && !isNaN(volume) ? volume : 0;
  if (volume < GAILS.NO_DATA_VOLUME_THRESHOLD) return null;
  if (volume >= 15) return rawScore;
  var isCurrentMonthOutlier = GAILS.shouldBalanceCurrentMonthRecord(record, context, volume);
  if (context && context.isSingleCurrentMonth && !isCurrentMonthOutlier) return rawScore;
  if (volume >= 8) return isCurrentMonthOutlier ? rawScore * 0.85 + cohortMean * 0.15 : rawScore * 0.75 + cohortMean * 0.25;
  return isCurrentMonthOutlier ? rawScore * 0.55 + cohortMean * 0.45 : rawScore * 0.35 + cohortMean * 0.65;
};

// Absolute CEI component scoring. A component receives full marks at/above
// benchmark and no marks at/below its floor, with a straight-line penalty between.
window.GAILS.computeAbsoluteComponent = function(value, benchmark, floor) {
  if (value === null || value === undefined || isNaN(value)) return 0;
  if (value >= benchmark) return 100;
  if (value <= floor) return 0;
  return Math.max(0, Math.min(100, ((value - floor) / (benchmark - floor)) * 100));
};

window.GAILS.computeAbsoluteWaitComponent = function(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return 100;
  if (seconds <= GAILS.BENCHMARKS.at) return 100;
  if (seconds >= GAILS.BENCHMARK_FLOORS.at) return 0;
  return Math.max(0, Math.min(100, ((GAILS.BENCHMARK_FLOORS.at - seconds) / (GAILS.BENCHMARK_FLOORS.at - GAILS.BENCHMARKS.at)) * 100));
};

window.GAILS.computeCoffeeEfficiencyComponent = function(s2, s3, s4, o5) {
  var s2Val = s2 || 0;
  var s3Val = s3 || 0;
  var s4Val = s4 || 0;
  var o5Val = o5 || 0;
  var t4_5 = Math.max(0, 100 - s4Val - o5Val);
  var rawTs = s2Val * 1.0
            + Math.max(0, s3Val - s2Val) * 0.5
            + Math.max(0, s4Val - s3Val) * 0.25
            + t4_5 * 0.1
            - o5Val * 5.0;
  var score = Math.max(0, Math.min(100, Math.round(rawTs * 10) / 10));
  if (o5Val >= 2.5) return 0;
  if (o5Val >= 1.5) return Math.round(score * 5) / 10;
  return score;
};

// Compute CEI for a month's records
window.GAILS.computeCEI = function(monthRecords) {
  var G = GAILS;
  var W = G.CEI_WEIGHTS;

  monthRecords.forEach(G.markDataCoverage);
  var scoredRecords = monthRecords.filter(G.hasScoredData);
  var confidenceContext = G.buildConfidenceContext(scoredRecords);

  scoredRecords.forEach(function(r) {
    r.ts = Math.round((r.s2 || 0) * 10) / 10;
  });

  var npsVals = scoredRecords.map(function(r) { return r.n; });
  var efVals = scoredRecords.map(function(r) { return r.ef; });
  var drVals = scoredRecords.map(function(r) { return r.dr; });
  var frVals = scoredRecords.map(function(r) { return r.fr; });
  var tsVals = scoredRecords.map(function(r) { return r.ts; });
  var atVals = scoredRecords
    .map(function(r) { return r.at; })
    .filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });

  scoredRecords.forEach(function(r) {
    r.np = Math.round(G.percentileRank(npsVals, r.n, false) * 10) / 10;
    r.ep = Math.round(G.percentileRank(efVals, r.ef, false) * 10) / 10;
    r.dp = Math.round(G.percentileRank(drVals, r.dr, false) * 10) / 10;
    r.fp = Math.round(G.percentileRank(frVals, r.fr, false) * 10) / 10;
    r.ap = Math.round(G.percentileRank(tsVals, r.ts, false) * 10) / 10;
    if (r.at !== null && r.at !== undefined && !isNaN(r.at)) {
      r.atp = Math.round(G.percentileRank(atVals, r.at, true) * 10) / 10;
    } else {
      r.atp = 50.0;
    }

    var rawCEI = r.np * W.nps + r.ep * W.ef + r.dp * W.dr + r.fp * W.fr + r.ap * W.time + r.atp * W.at;
    r.c_raw = Math.round(rawCEI * 10) / 10;
  });

  var cohortMean = scoredRecords.length ? scoredRecords.reduce(function(a, r) { return a + r.c_raw; }, 0) / scoredRecords.length : 0;

  scoredRecords.forEach(function(r) {
    r.c = Math.round(G.confidenceAdjust(r.c_raw, cohortMean, r.v, r, confidenceContext) * 10) / 10;

    var absNps = G.computeAbsoluteComponent(r.n, G.BENCHMARKS.nps, G.BENCHMARK_FLOORS.nps);
    var absEf = G.computeAbsoluteComponent(r.ef, G.BENCHMARKS.ef, G.BENCHMARK_FLOORS.ef);
    var absDr = G.computeAbsoluteComponent(r.dr, G.BENCHMARKS.dr, G.BENCHMARK_FLOORS.dr);
    var absFr = G.computeAbsoluteComponent(r.fr, G.BENCHMARKS.fr, G.BENCHMARK_FLOORS.fr);
    var absTs = G.computeCoffeeEfficiencyComponent(r.s2, r.s3, r.s4, r.o5);
    r.ats = absTs;

    var absAt = G.computeAbsoluteWaitComponent(r.at);
    r.a_at = Math.round(absAt * 10) / 10;

    r.ac_raw = Math.round((absNps * W.nps + absEf * W.ef + absDr * W.dr + absFr * W.fr + absTs * W.time + absAt * W.at) * 10) / 10;
  });

  var absMean = scoredRecords.length ? scoredRecords.reduce(function(a, r) { return a + r.ac_raw; }, 0) / scoredRecords.length : 0;

  monthRecords.forEach(function(r) {
    if (!G.hasScoredData(r)) {
      r.c = null;
      r.ac = null;
      r.c_raw = null;
      r.ac_raw = null;
      G.ensureBands(r);
      return;
    }
    r.ac = Math.round(G.confidenceAdjust(r.ac_raw, absMean, r.v, r, confidenceContext) * 10) / 10;
    G.ensureBands(r);
  });

  monthRecords.sort(function(a, b) {
    var av = a.c === null || a.c === undefined || isNaN(a.c) ? -Infinity : a.c;
    var bv = b.c === null || b.c === undefined || isNaN(b.c) ? -Infinity : b.c;
    return bv - av;
  });
  monthRecords.forEach(function(r, i) { r.cr = i + 1; });
};

// ========== CEI CALCULATION MODULE ==========
window.GAILS = window.GAILS || {};

// Derives cb/acb (index band labels) fresh from c/ac scores, always
// overwriting whatever is already on the record. Records loaded from
// storage can carry a stale or missing band (e.g. saved before banding
// existed, or under an old naming scheme) — trusting a stored value that
// doesn't match a key in G.COL/G.ABSCOL is what makes chart color lookups
// (G.COL[r.cb] / G.ABSCOL[r.acb]) come back undefined and render points/
// slices black, so we never trust the stored band, only the score.
window.GAILS.ensureBands = function(r) {
  if (!r) return r;
  r.cb = r.c >= 75 ? 'Top Performer' : r.c >= 50 ? 'Above Average' : r.c >= 25 ? 'Below Average' : 'Needs Support';
  r.acb = r.ac >= 90 ? 'Exceeding' : r.ac >= 75 ? 'Meeting' : r.ac >= 60 ? 'Approaching' : 'Below Standard';
  return r;
};

// Coffee Efficiency score = % of drinks delivered under 2 min (company standard: 80%)
// Re-rank ts and ap from raw s2 values — use after multi-month aggregation
window.GAILS.recomputeTimelinessRanks = function(records) {
  var G = GAILS;
  records.forEach(function(r) {
    r.ts = Math.round((r.s2 || 0) * 10) / 10;
  });
  var tsVals = records.map(function(r) { return r.ts; });
  var atVals = records
    .map(function(r) { return r.at; })
    .filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });

  records.forEach(function(r) {
    r.ap = Math.round(G.percentileRank(tsVals, r.ts, false) * 10) / 10;
    if (r.at !== null && r.at !== undefined && !isNaN(r.at)) {
      r.atp = Math.round(G.percentileRank(atVals, r.at, true) * 10) / 10;
    } else {
      r.atp = 50.0;
    }
    var rawCEI = r.ep * 0.25 + r.dp * 0.35 + r.fp * 0.30 + r.ap * 0.05 + r.atp * 0.05;
    r.c_raw = Math.round(rawCEI * 10) / 10;
  });

  var cohortMean = records.length ? (records.reduce(function(a, r) { return a + r.c_raw; }, 0) / records.length) : 0;
  records.forEach(function(r) {
    r.c = Math.round(G.confidenceAdjust(r.c_raw, cohortMean, r.v) * 10) / 10;
    r.cb = r.c >= 75 ? 'Top Performer' : r.c >= 50 ? 'Above Average' : r.c >= 25 ? 'Below Average' : 'Needs Support';
  });
};

// Confidence weighting
window.GAILS.confidenceAdjust = function(rawScore, cohortMean, volume) {
  if (volume >= 15) return rawScore;
  if (volume >= 8) return rawScore * 0.85 + cohortMean * 0.15;
  return rawScore * 0.65 + cohortMean * 0.35;
};

// Absolute CEI component scoring
window.GAILS.computeAbsoluteComponent = function(value, benchmark) {
  if (value >= benchmark) return 100;
  var gap = benchmark - value;
  var penalty = 0;
  var remaining = gap;

  var t1 = Math.min(remaining, 5);
  penalty += t1 * 4;
  remaining -= t1;

  var t2 = Math.min(remaining, 5);
  penalty += t2 * 6;
  remaining -= t2;

  var t3 = Math.min(remaining, 5);
  penalty += t3 * 6;
  remaining -= t3;

  penalty += remaining * 4;

  return Math.max(0, Math.min(100, 100 - penalty));
};

// Compute CEI for a month's records
window.GAILS.computeCEI = function(monthRecords) {
  var G = GAILS;

  monthRecords.forEach(function(r) {
    r.ts = Math.round((r.s2 || 0) * 10) / 10;
  });

  var efVals = monthRecords.map(function(r) { return r.ef; });
  var drVals = monthRecords.map(function(r) { return r.dr; });
  var frVals = monthRecords.map(function(r) { return r.fr; });
  var tsVals = monthRecords.map(function(r) { return r.ts; });
  var atVals = monthRecords
    .map(function(r) { return r.at; })
    .filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });

  monthRecords.forEach(function(r) {
    r.ep = Math.round(G.percentileRank(efVals, r.ef, false) * 10) / 10;
    r.dp = Math.round(G.percentileRank(drVals, r.dr, false) * 10) / 10;
    r.fp = Math.round(G.percentileRank(frVals, r.fr, false) * 10) / 10;
    r.ap = Math.round(G.percentileRank(tsVals, r.ts, false) * 10) / 10;
    if (r.at !== null && r.at !== undefined && !isNaN(r.at)) {
      r.atp = Math.round(G.percentileRank(atVals, r.at, true) * 10) / 10;
    } else {
      r.atp = 50.0;
    }

    var rawCEI = r.ep * 0.25 + r.dp * 0.35 + r.fp * 0.30 + r.ap * 0.05 + r.atp * 0.05;
    r.c_raw = Math.round(rawCEI * 10) / 10;
    r.co = r.v >= 15 ? 'High' : r.v >= 8 ? 'Medium' : 'Low';
  });

  var cohortMean = monthRecords.reduce(function(a, r) { return a + r.c_raw; }, 0) / monthRecords.length;

  monthRecords.forEach(function(r) {
    r.c = Math.round(G.confidenceAdjust(r.c_raw, cohortMean, r.v) * 10) / 10;
    r.cb = r.c >= 75 ? 'Top Performer' : r.c >= 50 ? 'Above Average' : r.c >= 25 ? 'Below Average' : 'Needs Support';

    var absEf = G.computeAbsoluteComponent(r.ef, G.BENCHMARKS.ef);
    var absDr = G.computeAbsoluteComponent(r.dr, G.BENCHMARKS.dr);
    var absFr = G.computeAbsoluteComponent(r.fr, G.BENCHMARKS.fr);
    var s2Val = r.s2 || 0;
    var s3Val = r.s3 || 0;
    var s4Val = r.s4 || 0;
    var o5Val = r.o5 || 0;
    var t4_5 = Math.max(0, 100 - s4Val - o5Val); // 4-5 mins bucket
    var rawTs = s2Val * 1.0 
              + Math.max(0, s3Val - s2Val) * 0.5 
              + Math.max(0, s4Val - s3Val) * 0.25 
              + t4_5 * 0.1 
              - o5Val * 5.0;
    var absTs = Math.max(0, Math.min(100, Math.round(rawTs * 10) / 10));
    r.ats = absTs;

    var absAt;
    if (r.at !== null && r.at !== undefined && !isNaN(r.at)) {
      if (r.at <= 115) {
        absAt = 100;
      } else {
        var secondsOver = r.at - 115;
        var seconds = Math.ceil(secondsOver);
        absAt = Math.max(0, 100 - seconds * 10);
      }
    } else {
      absAt = 100;
    }
    r.a_at = Math.round(absAt * 10) / 10;

    r.ac = Math.round((absEf * 0.25 + absDr * 0.35 + absFr * 0.30 + absTs * 0.05 + absAt * 0.05) * 10) / 10;
    r.acb = r.ac >= 90 ? 'Exceeding' : r.ac >= 75 ? 'Meeting' : r.ac >= 60 ? 'Approaching' : 'Below Standard';
  });

  monthRecords.sort(function(a, b) { return b.c - a.c; });
  monthRecords.forEach(function(r, i) { r.cr = i + 1; });
};

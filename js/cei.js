// ========== CEI CALCULATION MODULE ==========
window.GAILS = window.GAILS || {};

// Tiered beverage delivery time score (0-100)
// Target: 100% under 5 min (o5=0). Bands: <3 min (full) | 3-4 min (-0.2x) | 4-5 min (-0.4x) | >5 min (-3.5x)
window.GAILS.tieredTimelinessScore = function(r) {
  var within3   = r.s3 || 0;
  var over5     = r.o5 || 0;
  // Fall back to within3 if s4 is missing or invalid — preserves 2-band behaviour for old data
  var s4val     = (typeof r.s4 === 'number' && !isNaN(r.s4) && r.s4 >= within3) ? r.s4 : within3;
  var band3to4  = Math.max(0, s4val - within3);
  var band4to5  = Math.max(0, (100 - s4val) - over5);
  var score     = within3 - (band3to4 * 0.2) - (band4to5 * 0.4) - (over5 * 3.5);
  return Math.max(0, Math.min(100, score));
};

// Re-rank ts and ap from raw band values — use after multi-month aggregation
window.GAILS.recomputeTimelinessRanks = function(records) {
  var G = GAILS;
  records.forEach(function(r) {
    r.ts = Math.round(G.tieredTimelinessScore(r) * 10) / 10;
  });
  var tsVals = records.map(function(r) { return r.ts; });
  records.forEach(function(r) {
    r.ap = Math.round(G.percentileRank(tsVals, r.ts, false) * 10) / 10;
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
    r.ts = Math.round(G.tieredTimelinessScore(r) * 10) / 10;
  });

  var efVals = monthRecords.map(function(r) { return r.ef; });
  var drVals = monthRecords.map(function(r) { return r.dr; });
  var frVals = monthRecords.map(function(r) { return r.fr; });
  var tsVals = monthRecords.map(function(r) { return r.ts; });

  monthRecords.forEach(function(r) {
    r.ep = Math.round(G.percentileRank(efVals, r.ef, false) * 10) / 10;
    r.dp = Math.round(G.percentileRank(drVals, r.dr, false) * 10) / 10;
    r.fp = Math.round(G.percentileRank(frVals, r.fr, false) * 10) / 10;
    r.ap = Math.round(G.percentileRank(tsVals, r.ts, false) * 10) / 10;

    var rawCEI = r.ep * 0.35 + r.dp * 0.35 + r.fp * 0.25 + r.ap * 0.05;
    r.c_raw = Math.round(rawCEI * 10) / 10;
    r.co = r.v >= 15 ? 'High' : r.v >= 8 ? 'Medium' : 'Low';
  });

  var cohortMean = monthRecords.reduce(function(a, r) { return a + r.c_raw; }, 0) / monthRecords.length;

  monthRecords.forEach(function(r) {
    r.c = Math.round(G.confidenceAdjust(r.c_raw, cohortMean, r.v) * 10) / 10;
    r.cb = r.c >= 75 ? 'Excellent' : r.c >= 50 ? 'Good' : r.c >= 25 ? 'Developing' : 'Needs Attention';

    var absEf = G.computeAbsoluteComponent(r.ef, G.BENCHMARKS.ef);
    var absDr = G.computeAbsoluteComponent(r.dr, G.BENCHMARKS.dr);
    var absFr = G.computeAbsoluteComponent(r.fr, G.BENCHMARKS.fr);
    var absTs = G.computeAbsoluteComponent(r.ts, G.BENCHMARKS.time);
    r.ac = Math.round((absEf * 0.35 + absDr * 0.35 + absFr * 0.25 + absTs * 0.05) * 10) / 10;
    r.acb = r.ac >= 90 ? 'Exceeding' : r.ac >= 75 ? 'Meeting' : r.ac >= 60 ? 'Approaching' : 'Below Standard';
  });

  monthRecords.sort(function(a, b) { return b.c - a.c; });
  monthRecords.forEach(function(r, i) { r.cr = i + 1; });
};

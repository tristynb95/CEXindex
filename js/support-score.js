// ========== SUPPORT PRIORITY SCORE ==========
// Pure scoring rules for the Growth & Support Hub. Keeping the calculation in
// one small module makes the weighting reviewable and independently testable.
window.GAILS = window.GAILS || {};

(function() {
  var G = window.GAILS;
  var WEIGHTS = Object.freeze({ severity: 50, momentum: 25, persistence: 15, coverage: 10 });
  var TIERS = Object.freeze({ high: 60, medium: 35 });

  function isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Both score modes have two focus bands, but their boundaries differ. Give
  // the adjacent band the first 20 severity points and the lowest band the
  // remaining 30 so equivalent band positions mean the same urgency in peer
  // and benchmark views.
  function severityPoints(score, escapeLine, severeLine) {
    if (!isNumber(score) || !isNumber(escapeLine) || !isNumber(severeLine)) return 0;
    if (score >= escapeLine) return 0;
    if (score >= severeLine) {
      return Math.round(((escapeLine - score) / (escapeLine - severeLine)) * 20);
    }
    return Math.round(20 + ((severeLine - Math.max(0, score)) / severeLine) * 30);
  }

  function momentumPoints(trend) {
    trend = trend || {};
    var recentDrop = trend.prev && isNumber(trend.ceiChange) ? Math.max(0, -trend.ceiChange) : 0;
    var threeMonthDrop = trend.threePrev && isNumber(trend.cei3mChange) ? Math.max(0, -trend.cei3mChange) : 0;

    // The three-month movement already contains the latest MoM movement. Only
    // score the deterioration that happened before the latest month here.
    var earlierDrop = Math.max(0, threeMonthDrop - recentDrop);
    var recentPoints = Math.min(15, Math.round(recentDrop * 1.5));
    var earlierPoints = Math.min(10, Math.round(earlierDrop));
    return recentPoints + earlierPoints;
  }

  function persistencePoints(focusMonths, focusStreak, monthsWithData) {
    var observed = isNumber(monthsWithData) ? Math.max(0, Math.floor(monthsWithData)) : 0;
    if (observed < 2) return 0;

    var focus = isNumber(focusMonths) ? clamp(Math.floor(focusMonths), 0, observed) : 0;
    var streak = isNumber(focusStreak) ? clamp(Math.floor(focusStreak), 0, focus) : 0;
    var evidenceFactor = Math.min(1, (observed - 1) / 2);
    var sharePoints = Math.round((focus / observed) * 9 * evidenceFactor);
    var streakPoints = Math.min(6, Math.max(0, streak - 1) * 3);
    return Math.min(WEIGHTS.persistence, sharePoints + streakPoints);
  }

  function coveragePoints(visitedInPeriod, hasVisitEver) {
    if (visitedInPeriod) return 0;
    return hasVisitEver ? 6 : WEIGHTS.coverage;
  }

  G.SUPPORT_SCORE_CONFIG = Object.freeze({ weights: WEIGHTS, tiers: TIERS });

  G.computeSupportPriority = function(input) {
    input = input || {};
    var severity = severityPoints(input.score, input.escapeLine, input.severeLine);
    var momentum = momentumPoints(input.trend);
    var persistence = persistencePoints(input.focusMonths, input.focusStreak, input.monthsWithData);
    var coverage = coveragePoints(!!input.visitedInPeriod, !!input.hasVisitEver);
    var priority = clamp(severity + momentum + persistence + coverage, 0, 100);

    return {
      severity: severity,
      momentum: momentum,
      persistence: persistence,
      coverage: coverage,
      priority: priority,
      tier: priority >= TIERS.high ? 'critical' : priority >= TIERS.medium ? 'high' : 'watch'
    };
  };
})();

// ========== SHARED CQV HELPERS ==========
// Band derivation and presentation for a parsed CQV record, shared by every
// surface that renders one: the admin CQV table (js/admin-page.js) and the
// visit report modal (js/visit-report.js). The band thresholds are also used
// at import time by js/cqv-parser.js.
//
// Loaded as a plain <script> by BOTH admin.html and index.html, after
// js/cqv-criticals.js (whose zero-tolerance list the Red override depends on).
window.GAILS = window.GAILS || {};

(function() {
  // GAIL's bands across every CQV surface: 0-69.99% Red, 70-89.99% Yellow,
  // 90%+ Green. This is the single definition of those thresholds — callers
  // layer their own precedence and the critical-fail override on top.
  function bandFromPct(pct) {
    return pct >= 90 ? 'Green' : pct >= 70 ? 'Yellow' : 'Red';
  }

  // Ignores any stored record.criticalFail flag on purpose: records imported
  // before js/cqv-criticals.js existed stored criticalFail: true for ANY lost
  // allergen point, and the shared helper is what knows which questions are
  // actually zero-tolerance.
  function hasCriticalFail(record) {
    return window.GAILS.CQVCriticals.hasCriticalFail(record);
  }

  // The band to DISPLAY for an already-stored record. Prefers the stored band
  // (js/cqv-parser.js computed it at import), falling back to deriving it from
  // overallPct for records saved before band computation existed rather than
  // showing a blank — and re-applies the critical-fail override live in case
  // the stored band predates it.
  //
  // Note this precedence is deliberately the opposite of the parser's, which
  // recomputes from overallPct and only falls back to the band the PDF printed.
  function band(record) {
    if (hasCriticalFail(record)) return 'Red';
    if (record.band) return record.band;
    if (record.overallPct == null) return '';
    return bandFromPct(record.overallPct);
  }

  function bandColor(bandName) {
    if (bandName === 'Green') return '#1D9E5C';
    if (bandName === 'Yellow') return '#C97F12';
    if (bandName === 'Red') return '#B22A24';
    return null;
  }

  function priorityColor(priority) {
    if (/^high$/i.test(priority)) return '#B22A24';
    if (/^medium$/i.test(priority)) return '#C97F12';
    if (/^low$/i.test(priority)) return '#0E8074';
    return null;
  }

  // An action item on one of GAIL's zero-tolerance questions (see
  // js/cqv-criticals.js) gets a "Critical Point" flag — losing that point is
  // what forces the visit Red. Other "(allergen point)" questions still get
  // an "Allergen Point" flag as a heads-up, but they don't affect the band.
  function criticalTag(label) {
    if (window.GAILS.CQVCriticals.isCriticalQuestion(label) || /\bcritical point\b/i.test(label || '')) return 'Critical Point';
    if (/\ballergen point\b/i.test(label || '')) return 'Allergen Point';
    return null;
  }

  // Follow-up CQVs sometimes skip the written "Comments & Action Plan" block
  // entirely (see js/cqv-parser.js's action-plan parsing) even though
  // individual questions still lost points — falling back to those lost
  // questions keeps the Action Plan section useful instead of showing "no
  // action items" on a visit that clearly didn't score 100%.
  function lostPointItems(record) {
    return (record.questions || [])
      .filter(function(q) { return q.score != null && q.max != null && q.score < q.max; })
      .map(function(q) {
        var lost = q.max - q.score;
        return {
          sectionPath: q.section + (q.subsection ? ' >> ' + q.subsection : ''),
          questionLabel: (q.label || ('Question ' + (q.qNum || ''))) + ' (−' + lost + ' pt' + (lost === 1 ? '' : 's') + ')',
          findings: q.note || '',
          actionRequired: '',
          assignee: record.bakery || '',
          priority: '',
          dueDate: ''
        };
      });
  }

  window.GAILS.CQVShared = {
    bandFromPct: bandFromPct,
    hasCriticalFail: hasCriticalFail,
    band: band,
    bandColor: bandColor,
    priorityColor: priorityColor,
    criticalTag: criticalTag,
    lostPointItems: lostPointItems
  };
})();

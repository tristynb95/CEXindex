// ========== SHARED NBO HELPERS ==========
// Score derivation and presentation for a parsed NBO Coffee Visit record,
// shared by every surface that renders one: the admin visits table
// (js/admin-page.js) and the visit report modal + visit log (js/visit-report.js).
//
// Loaded as a plain <script> by BOTH admin.html and index.html. Deliberately
// separate from js/nbo-parser.js, which is admin-only — index.html renders
// stored NBO records but never parses a PDF, so it needs these helpers without
// pulling in pdf.js and the parser.
//
// NOTE ON RAG: there is deliberately no band/colour function here, and there
// must not be one. A GoAudits NBO export prints no score at all — the
// percentage below is derived by this app from the Yes/No answers purely so
// visits are comparable at a glance. It is not an audit result, so it is never
// rendered in Red/Yellow/Green: colouring it would imply a pass/fail threshold
// that GAIL's has not set for these visits. Contrast js/cqv-shared.js, where
// the bands are real and come from the CQV itself.
window.GAILS = window.GAILS || {};

(function() {
  // N/A answers are excluded from the denominator — a question that didn't
  // apply on the day shouldn't count against the bakery. A visit that is
  // entirely N/A has no meaningful percentage, hence the null.
  function scorable(record) {
    var questions = (record && record.questions) || [];
    var yes = 0;
    var total = 0;
    questions.forEach(function(q) {
      var response = String(q.response || '').toUpperCase();
      if (response === 'YES') { yes++; total++; }
      else if (response === 'NO') { total++; }
    });
    return { yes: yes, total: total };
  }

  function pctFromCounts(yes, total) {
    if (!total) return null;
    return Math.round((yes / total) * 1000) / 10;
  }

  // Prefers the percentage stored at import time (js/nbo-parser.js computed
  // it), falling back to deriving it from the questions for records saved
  // before that existed — rather than showing a blank.
  function overallPct(record) {
    if (!record) return null;
    if (record.overallPct != null) return record.overallPct;
    var counts = scorable(record);
    return pctFromCounts(counts.yes, counts.total);
  }

  function pctText(record) {
    var pct = overallPct(record);
    return pct == null ? '—' : pct + '%';
  }

  function visitLabel(record) {
    return 'NBO: Coffee Visit ' + ((record && record.visitNumber) || 1);
  }

  window.GAILS.NBOShared = {
    scorable: scorable,
    pctFromCounts: pctFromCounts,
    overallPct: overallPct,
    pctText: pctText,
    visitLabel: visitLabel
  };
})();

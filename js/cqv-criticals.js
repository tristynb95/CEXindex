// ========== CQV CRITICAL (ZERO-TOLERANCE) QUESTIONS ==========
// GAIL's rule: a single failed zero-tolerance question forces the whole CQV
// Red, overriding the normal percentage bands. Which questions are
// zero-tolerance is defined ONLY by the canonical list below — NOT by the
// "(allergen point)" tag or the ALRG category total, because not every
// allergen point is critical (e.g. "All products correctly labelled & not
// expired" counts toward the ALRG category, but losing it does not force a
// Red visit).
//
// Loaded as a plain <script> by BOTH admin.html (before js/cqv-parser.js,
// which uses it to compute the band at import time) and index.html (before
// js/visit-report.js, which uses it to recompute the band live for records
// saved before this list existed).
window.GAILS = window.GAILS || {};

(function() {
  // Canonical wording as printed on the CQV report. Question numbers shift
  // between template revisions, so questions are matched by label, not Q#.
  var CRITICAL_QUESTION_LABELS = [
    'Correct use of barista screens (allergen point)',
    'Orders clearly repeated back to the customer by the barista (allergen point)',
    'Is everyone on the machine trained? (allergen point)',
    'Jugs rinsed every time and fresh milk used (allergen point)',
    'Steam wand purged before and after steaming (allergen point)',
    'Steam wand clean, correctly wiped & follows the j-cloths colour coding (allergen point)',
    'Manual steam wand not left unattended',
    'Milk bottles outside of fridge marked with time they were removed from fridge',
    'Stickers for delivery and Click & Collect and Deliveroo used correctly? (allergen point)',
    'Jugs correctly labelled (non dairy vs dairy). This includes hot chocolate jugs. No build up of old milk from improper maintenance and cleaning (allergen point)',
    'Pitcher rinser (allergen point)',
    '5 clean J-cloths - Kept separate & not touching each other (allergen point)'
  ];

  // A parsed label and the canonical wording can differ in punctuation,
  // spacing (the PDF text layer sometimes drops/merges spaces across line
  // wraps) and the "(allergen point)" suffix — so compare alphanumerics
  // only, with the suffix stripped from both sides.
  function normalizeLabel(label) {
    return String(label == null ? '' : label)
      .toLowerCase()
      .replace(/\(\s*(?:allergen|critical)\s+point\s*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, '');
  }

  var NORMALIZED_CRITICALS = CRITICAL_QUESTION_LABELS.map(normalizeLabel);

  // Containment in either direction tolerates a partially-parsed question
  // label (canonical contains it) or extra text glued onto one (it contains
  // the canonical). The minimum length stops a tiny fragment like "Steam
  // wand" from matching half the list.
  function isCriticalQuestion(label) {
    var norm = normalizeLabel(label);
    if (norm.length < 12) return false;
    return NORMALIZED_CRITICALS.some(function(c) {
      return norm.indexOf(c) !== -1 || c.indexOf(norm) !== -1;
    });
  }

  function questionLostPoints(q) {
    if (q.score != null && q.max != null) return q.score < q.max;
    // Un-scored questions (no "(score/max)" cell in the PDF) only carry a
    // response — NO / INADEQUATE is a fail, anything else isn't.
    return /^(no|inadequate)$/i.test(q.response || '');
  }

  var CATEGORY_NAME_FALLBACK = { CRTCL: /^critical/i, ALRG: /^allergen/i };

  function categoryLost(categoryScores, codes) {
    return Object.keys(categoryScores || {}).some(function(name) {
      var s = categoryScores[name];
      var matches = codes.some(function(code) {
        return s.code === code || CATEGORY_NAME_FALLBACK[code].test(name);
      });
      return matches && s.actual < s.target;
    });
  }

  // The Red override for a parsed CQV record. Ignores any stored
  // record.criticalFail flag on purpose: records imported before this list
  // existed stored criticalFail: true for ANY lost allergen point, which is
  // exactly the over-flagging this replaces.
  function hasCriticalFail(record) {
    if (!record) return false;
    var questions = record.questions || [];
    if (questions.length) {
      // Per-question data is the precise signal. The CRTCL category total
      // stays as a backstop: every question in that category is critical by
      // definition, so a loss there is a fail even if the question's label
      // parsed too mangled to match the list.
      return questions.some(function(q) {
        return questionLostPoints(q) && isCriticalQuestion(q.label);
      }) || categoryLost(record.categoryScores, ['CRTCL']);
    }
    // No per-question data (an old or badly under-parsed record): there's no
    // way to tell WHICH allergen question failed, so keep the old
    // conservative category rule rather than silently clearing a Red.
    return categoryLost(record.categoryScores, ['CRTCL', 'ALRG']);
  }

  window.GAILS.CQVCriticals = {
    labels: CRITICAL_QUESTION_LABELS,
    isCriticalQuestion: isCriticalQuestion,
    hasCriticalFail: hasCriticalFail
  };
})();

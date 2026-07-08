// ========== CQV (COFFEE QUALITY VISIT) PDF PARSER ==========
// Turns a GoAudits "CQV" PDF export (see the sample layout this was built
// against: cover page, score summary, category table, then per-section
// Q#/QUESTION/SCORE/RESPONSE/PREVIOUS tables, then a Comments & Action Plan
// block) into the structured record saved to Firebase at routineVisits/{id}
// with type: 'cqv'. Runs entirely client-side via pdf.js (loaded as a
// separate <script> in admin.html — see GlobalWorkerOptions.workerSrc there).
//
// This is a best-effort text-layout parser, not a strict grammar: GoAudits'
// PDF renderer vertically centers wrapped multi-line question text against
// its SCORE/RESPONSE cells, so a question's number+text and its score can
// land on different reconstructed lines. The state machine below tolerates
// that by holding a "pending question" until a score is found. If a line
// can't be classified it's dropped rather than corrupting other fields —
// the original PDF stays the source of truth (it's stored alongside the
// parsed record), so under-parsing is safe; over-parsing (silently wrong
// values) is what to avoid.
window.GAILS = window.GAILS || {};

(function() {
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function cleanLine(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------- pdf.js text extraction ----------
  async function extractPageLines(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF reader library did not load. Check your connection and try again.');
    }
    var pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var pages = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      var items = content.items
        .map(function(it) { return { str: it.str, x: it.transform[4], y: it.transform[5] }; })
        .filter(function(it) { return it.str && cleanLine(it.str); });

      items.sort(function(a, b) { return b.y - a.y || a.x - b.x; });

      var rows = [];
      var TOL = 2.5;
      items.forEach(function(it) {
        var row = null;
        for (var i = rows.length - 1; i >= 0; i--) {
          if (Math.abs(rows[i].y - it.y) <= TOL) { row = rows[i]; break; }
          if (rows[i].y - it.y > 30) break; // far enough away, stop scanning back
        }
        if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
        row.items.push(it);
      });

      var lines = rows.map(function(r) {
        r.items.sort(function(a, b) { return a.x - b.x; });
        return cleanLine(r.items.map(function(it) { return it.str; }).join(' '));
      }).filter(Boolean);

      pages.push(lines);
    }
    return pages;
  }

  // ---------- shared line patterns ----------
  var RE_PCT_ONLY = /^(\d+(?:\.\d+)?)\s*%$/;
  var RE_BAND = /^(Red|Yellow|Green)$/i;
  var RE_FRACTION = /^\(([\d.]+)\s*\/\s*([\d.]+)\)$/;
  var RE_ADDRESS = /^(.+?)\s*\|\s*(.+)$/;
  var RE_DATE_LINE = /^([A-Z]+DAY)\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})$/i;
  var RE_REF = /Ref:\s*(\d+)/;
  var RE_SECTION_SCORE_ROW = /^([A-Za-z][A-Za-z ]*?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/;
  var RE_CATEGORY_ROW = /^([A-Z]{2,8})\s*-\s*(.+?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/;
  var RE_MAJOR_SECTION_HEADER = /^([A-Z][A-Z &\/]+?)\s*\(([\d.]+)\s*\/\s*([\d.]+)\)\s*([\d.]+)\s*%$/;
  var RE_QCOL_HEADER = /^Q#\s*QUESTION\s*SCORE\s*RESPONSE\s*PREVIOUS$/i;
  var RE_Q_START = /^(\d+)\s+(.+)$/;
  var RE_SCORE_TAIL = /^(.*?)\s*\(([\d.]+)\s*\/\s*([\d.]+)\)\s*([A-Za-z0-9\/.\-]*)\s*$/;
  var RE_SCORE_ONLY_LINE = /^(?:(\d+)\s+)?\(([\d.]+)\s*\/\s*([\d.]+)\)\s*([A-Za-z0-9\/.\-]*)\s*$/;
  // Some questions (e.g. "Eat-in presentation according to standards N/A")
  // print only a bare response with no (score/max) cell at all — GoAudits
  // doesn't score N/A-type answers. These fall back patterns for both a
  // single-line question ("<label> N/A") and a multi-line question's closing
  // line ("<num> N/A").
  var RESPONSE_TOKENS = 'YES|NO|N\\/A|GOOD|INADEQUATE';
  var RE_SCORE_TAIL_BARE = new RegExp('^(.+?)\\s+(' + RESPONSE_TOKENS + ')$', 'i');
  var RE_SCORE_ONLY_BARE = new RegExp('^(?:(\\d+)\\s+)?(' + RESPONSE_TOKENS + ')$', 'i');
  var RE_ACTION_BLOCK_HEADER = /^([A-Za-z][A-Za-z &]+?)\s*>>\s*([A-Za-z][A-Za-z \/&]+)$/;
  var RE_GA_REF = /^\(GA(\d+)\)\s*(.+)$/;
  // The Comments & Action Plan block prints Assignee/Priority/Due Date in a
  // sidebar box next to each item. Because that box is vertically centered
  // against the (often wrapped) findings/action text, its values can land on
  // the SAME reconstructed row as that text rather than their own line —
  // exactly the row-merging problem the Q&A tables have (see the floatingText
  // comments above). These are matched as embedded substrings, not whole
  // lines, so they're found and stripped out wherever they land.
  var RE_PRIORITY_EMBED = /\bPRIORITY\s+(Low|Medium|High)\b/i;
  var RE_DUE_DATE_EMBED = /\bDUE\s*DATE\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/i;
  var RE_ASSIGNEE_EMBED = /\bASSIGNEE\s+(\S+)\b/i;
  var RE_FINDINGS_MARK = /^FINDINGS$/i;
  var RE_ACTION_REQUIRED_START = /^ACTION\s*REQUIRED\s*(.*)$/i;
  var RE_PAGE_FOOTER = /^Page\s+\d+\s+of\s+\d+/i;
  var RE_COLOR_KEY = /^0%[\-–]69\.99%/;
  var RE_DECLARATION_HEADING = /^D\s*E\s*C\s*L\s*A\s*R\s*A\s*T\s*I\s*O\s*N$/i;
  var RE_ACTION_PLAN_HEADING = /^C\s*O\s*M\s*M\s*E\s*N\s*T\s*S\s*&?\s*A\s*C\s*T\s*I\s*O\s*N\s*P\s*L\s*A\s*N$/i;
  var RE_SUMMARY_HEADING = /^S\s*U\s*M\s*M\s*A\s*R\s*Y$/i;
  var RE_SCORE_BY_SECTION_HEADING = /^S\s*C\s*O\s*R\s*E\s*B\s*Y\s*S\s*E\s*C\s*T\s*I\s*O\s*N$/i;
  var RE_SCORE_BY_CATEGORY_HEADING = /^S\s*C\s*O\s*R\s*E\s*B\s*Y\s*C\s*A\s*T\s*E\s*G\s*O\s*R\s*Y$/i;
  var RE_GENERAL_INFO_HEADING = /^GENERAL\s+INFORMATION/i;
  var RE_PREPARED_BY = /^Prepared\s*By$/i;
  var RE_POWERED_BY = /^Powered\s*By$/i;

  function isNoiseLine(line) {
    return RE_PAGE_FOOTER.test(line) || RE_COLOR_KEY.test(line) || RE_POWERED_BY.test(line) || /^GAILS?\s*'?s?$/i.test(line);
  }

  function isoDateFromParts(day, monthName, year) {
    var mi = MONTHS.indexOf(String(monthName).toLowerCase());
    if (mi === -1) return null;
    var dd = String(parseInt(day, 10)).padStart(2, '0');
    var mm = String(mi + 1).padStart(2, '0');
    return year + '-' + mm + '-' + dd;
  }

  // ---------- main parse ----------
  function parsePages(pages) {
    var record = {
      type: 'cqv',
      isFollowUp: false,
      bakery: '',
      date: '',
      title: '',
      auditorName: '',
      ref: '',
      address: '',
      overallPct: null,
      band: '',
      score: null,
      scoreMax: null,
      summary: '',
      sectionScores: {},
      categoryScores: {},
      questions: [],
      actionPlan: []
    };
    var warnings = [];

    // Flatten with a page-boundary marker so later logic can tell pages apart
    // without re-deriving indices.
    var lines = [];
    pages.forEach(function(pageLines, pageIndex) {
      pageLines.forEach(function(line) { lines.push({ text: line, page: pageIndex }); });
    });

    var i = 0;
    var n = lines.length;

    // ---- cover page: bakery/title/date/auditor/ref (best-effort scan of
    // page 0 only, tolerant of ordering since GAILS's cover layout varies) ----
    var page0 = pages[0] || [];
    for (var c = 0; c < page0.length; c++) {
      var cl = page0[c];
      if (/^GAILS?'?s?$/i.test(cl)) continue;
      var dm = cl.match(RE_DATE_LINE);
      if (dm) {
        record.date = isoDateFromParts(dm[2], dm[3], dm[4]) || '';
        continue;
      }
      if (/^CQV\b/i.test(cl) || /^[A-Z]+\s*-\s*Q\d[A-Za-z0-9]*$/i.test(cl)) {
        record.title = cl;
        continue;
      }
      if (RE_PREPARED_BY.test(cl)) {
        // The name can print above or below the "Prepared By" caption
        // depending on the cover layout — prefer whichever neighbour isn't
        // itself a recognisable non-name line (date, title, footer, etc).
        var candidate = page0[c - 1];
        if (!candidate || RE_DATE_LINE.test(candidate) || /^CQV\b/i.test(candidate)
            || isNoiseLine(candidate) || RE_REF.test(candidate) || RE_PREPARED_BY.test(candidate)) {
          candidate = page0[c + 1];
        }
        if (candidate) record.auditorName = candidate;
        continue;
      }
      var refm = cl.match(RE_REF);
      if (refm) record.ref = refm[1];
      if (!record.bakery && !RE_PREPARED_BY.test(cl) && !isNoiseLine(cl) && !/^CQV\b/i.test(cl)
          && cl !== record.auditorName && !RE_DATE_LINE.test(cl) && !/^GAILS BAKERY$/i.test(cl)
          && c > 0 && /^GAILS BAKERY$/i.test(page0[c - 1] || '')) {
        record.bakery = cl;
      }
    }
    // "CQV Q3 FOLLOW UP" vs the standard "CQV - Q3FY26" — GAIL's reissues a
    // follow-up CQV only after a bakery scores poorly on the original visit,
    // so this is worth surfacing as its own status rather than just a title.
    record.isFollowUp = /follow[\s-]*up/i.test(record.title);

    // ---- scan every remaining line once, driving a small state machine ----
    var section = { name: '', earned: null, max: null, pct: null };
    var subsection = '';
    var floatingText = []; // un-numbered lines awaiting resolution — either a wrapped question's label (if a score line later claims them) or a finding/action note for the previous question (if nothing ever claims them)
    var lastQuestion = null; // for attaching trailing red "findings" note lines
    var inActionPlan = false;
    var currentBlock = null; // action plan block being built
    var blockPhase = ''; // '', 'findings', 'action'

    function flushBlock() {
      if (currentBlock) {
        currentBlock.findings = cleanLine(currentBlock.findings);
        currentBlock.actionRequired = cleanLine(currentBlock.actionRequired);
        record.actionPlan.push(currentBlock);
      }
      currentBlock = null;
      blockPhase = '';
    }

    // Called whenever a new event starts (a new question, a new subsection/
    // section, or the action-plan block) that would otherwise silently
    // discard any buffered floatingText. Since a genuine wrapped question's
    // continuation lines are always closed by a scoreOnly line (handled
    // separately, before this ever runs), reaching this function with
    // leftover floatingText means it was never claimed as a label — the only
    // other thing it can legitimately be is a finding/action note trailing a
    // failed question, so attach it there. Anything left over on a passing
    // question (or with no prior question at all) is just dropped.
    function reconcileFloatingText() {
      if (floatingText.length) {
        var text = cleanLine(floatingText.join(' '));
        if (lastQuestion && !lastQuestion.note
            && (lastQuestion.score === 0 || /^(no|inadequate)$/i.test(lastQuestion.response))) {
          lastQuestion.note = text;
        } else {
          warnings.push('Could not attach this text to a question: "' + text.slice(0, 60) + '"');
        }
      }
      floatingText = [];
    }

    for (i = 0; i < n; i++) {
      var raw = lines[i].text;
      var line = cleanLine(raw);
      if (!line) continue;
      if (isNoiseLine(line)) continue;
      if (lines[i].page === 0) continue; // already handled cover page above

      // Section header lines like "GAILS BAKERY PRESTWICH 07 JUL 26" repeat on
      // every interior page as a running header — ignore.
      if (/^GAILS BAKERY/i.test(line) || /^CQV\s*-/i.test(line) && lines[i].page > 0 && line.length < 20) continue;

      if (RE_ACTION_PLAN_HEADING.test(line.replace(/\s+/g, ''))) { inActionPlan = true; reconcileFloatingText(); continue; }
      if (RE_DECLARATION_HEADING.test(line)) { flushBlock(); inActionPlan = false; continue; }

      if (inActionPlan) {
        var hdr = line.match(RE_ACTION_BLOCK_HEADER);
        if (hdr) {
          flushBlock();
          // Assignee is always the bakery itself in this layout ("ASSIGNEE
          // Prestwich") — sourced directly from the already-confirmed
          // record.bakery rather than re-parsed off a sidebar box that's
          // prone to landing on the wrong text row (see RE_*_EMBED above).
          currentBlock = { sectionPath: cleanLine(hdr[1]) + ' >> ' + cleanLine(hdr[2]), questionRef: '', questionLabel: '', findings: '', actionRequired: '', assignee: record.bakery || '', priority: '', dueDate: '' };
          blockPhase = '';
          continue;
        }
        if (!currentBlock) continue; // stray line before first block header

        // Strip the running page header ("GAILS BAKERY <site> DD MON YY")
        // and the Assignee/Priority/Due Date sidebar values out of the line
        // wherever they land, capturing them into currentBlock, before
        // classifying whatever text remains.
        var cleaned = line;
        if (record.bakery) {
          var headerRe = new RegExp('\\b' + escapeRegExp(record.bakery) + '\\s+\\d{1,2}\\s+[A-Z]{3}\\s+\\d{2,4}\\b', 'i');
          cleaned = cleaned.replace(headerRe, '').trim();
        }
        var dueMatch = cleaned.match(RE_DUE_DATE_EMBED);
        if (dueMatch) { currentBlock.dueDate = dueMatch[1]; cleaned = cleaned.replace(dueMatch[0], '').trim(); }
        var priMatch = cleaned.match(RE_PRIORITY_EMBED);
        if (priMatch) { currentBlock.priority = priMatch[1]; cleaned = cleaned.replace(priMatch[0], '').trim(); }
        var assMatch = cleaned.match(RE_ASSIGNEE_EMBED);
        if (assMatch) { if (!currentBlock.assignee) currentBlock.assignee = assMatch[1]; cleaned = cleaned.replace(assMatch[0], '').trim(); }
        if (!cleaned) continue; // line was pure sidebar/header noise

        if (RE_FINDINGS_MARK.test(cleaned)) { blockPhase = 'findings'; continue; }
        var actm = cleaned.match(RE_ACTION_REQUIRED_START);
        if (actm) { blockPhase = 'action'; currentBlock.actionRequired += (actm[1] || '') + ' '; continue; }
        var gam = cleaned.match(RE_GA_REF);
        if (gam) { currentBlock.questionRef = 'GA' + gam[1]; currentBlock.questionLabel = cleanLine(gam[2]); blockPhase = ''; continue; }
        if (blockPhase === 'findings') { currentBlock.findings += cleaned + ' '; continue; }
        if (blockPhase === 'action') { currentBlock.actionRequired += cleaned + ' '; continue; }
        continue;
      }

      // ---- overall score block (page with the big % / band / fraction) ----
      var pctm = line.match(RE_PCT_ONLY);
      if (pctm && record.overallPct == null && !section.name) { record.overallPct = parseFloat(pctm[1]); continue; }
      var bandm = line.match(RE_BAND);
      if (bandm && !record.band && record.overallPct != null && record.score == null) { record.band = bandm[1]; continue; }
      var fracm = line.match(RE_FRACTION);
      if (fracm && record.score == null && record.overallPct != null) {
        record.score = parseFloat(fracm[1]);
        record.scoreMax = parseFloat(fracm[2]);
        continue;
      }
      if (!record.address && record.score != null && RE_ADDRESS.test(line) && !record.summary) {
        var am = line.match(RE_ADDRESS);
        record.address = cleanLine(am[2]);
        if (!record.bakery) record.bakery = cleanLine(am[1]);
        continue;
      }

      if (RE_SUMMARY_HEADING.test(line.replace(/\s+/g, ''))) { record._inSummary = true; continue; }
      if (RE_SCORE_BY_SECTION_HEADING.test(line.replace(/\s+/g, ''))) { record._inSummary = false; record._inSectionTable = true; continue; }
      if (RE_SCORE_BY_CATEGORY_HEADING.test(line.replace(/\s+/g, ''))) { record._inSectionTable = false; record._inCategoryTable = true; continue; }
      if (RE_GENERAL_INFO_HEADING.test(line)) { record._inCategoryTable = false; continue; }

      if (record._inSummary) {
        if (/^Section\s+Actual\s+Target\s+%$/i.test(line)) { record._inSummary = false; record._inSectionTable = true; continue; }
        record.summary += (record.summary ? ' ' : '') + line;
        continue;
      }

      if (record._inSectionTable) {
        if (/^Section\s+Actual\s+Target\s+%$/i.test(line)) continue;
        var srow = line.match(RE_SECTION_SCORE_ROW);
        if (srow) {
          record.sectionScores[cleanLine(srow[1])] = { actual: parseFloat(srow[2]), target: parseFloat(srow[3]), pct: parseFloat(srow[4]) };
          continue;
        }
      }

      if (record._inCategoryTable) {
        if (/^Category\s+Actual\s+Target\s+%$/i.test(line)) continue;
        var crow = line.match(RE_CATEGORY_ROW);
        if (crow) {
          record.categoryScores[cleanLine(crow[2])] = { code: crow[1], actual: parseFloat(crow[3]), target: parseFloat(crow[4]), pct: parseFloat(crow[5]) };
          continue;
        }
      }

      // ---- Q&A tables ----
      // GoAudits vertically centers a wrapped question's SCORE/RESPONSE cells
      // against its text, so for multi-line questions the number+score land
      // on their OWN line *after* the (un-numbered) wrapped text, e.g.:
      //   "Names taken and orders clearly repeated back to the customer by"
      //   "the person at the till"
      //   "6 (20/20) YES"
      // Single-line questions instead carry everything on one row:
      //   "7 Are efficient ways of working embedded? (20/20) YES"
      // `floatingText` buffers un-numbered lines until a score line (with or
      // without a leading number) claims them as its label.
      if (RE_QCOL_HEADER.test(line)) continue;
      var majm = line.match(RE_MAJOR_SECTION_HEADER);
      if (majm && majm[1].trim().split(' ').length <= 4) {
        reconcileFloatingText();
        section = { name: cleanLine(majm[1]), earned: parseFloat(majm[2]), max: parseFloat(majm[3]), pct: parseFloat(majm[4]) };
        subsection = '';
        continue;
      }
      if (!section.name) continue; // nothing scorable seen yet (still in general info etc.)

      // Single-line question: "N <question text> (score/max) RESPONSE", or,
      // for un-scored responses like N/A, "N <question text> RESPONSE" with
      // no (score/max) cell at all.
      var qStart = line.match(RE_Q_START);
      if (qStart) {
        var singleTail = qStart[2].match(RE_SCORE_TAIL);
        var singleBare = !singleTail ? qStart[2].match(RE_SCORE_TAIL_BARE) : null;
        if ((singleTail && singleTail[1]) || singleBare) {
          reconcileFloatingText();
          lastQuestion = singleTail
            ? {
                qNum: parseInt(qStart[1], 10), section: section.name, subsection: subsection,
                label: cleanLine(singleTail[1]),
                score: parseFloat(singleTail[2]), max: parseFloat(singleTail[3]),
                response: singleTail[4] || '', note: ''
              }
            : {
                qNum: parseInt(qStart[1], 10), section: section.name, subsection: subsection,
                label: cleanLine(singleBare[1]),
                score: null, max: null,
                response: singleBare[2] || '', note: ''
              };
          record.questions.push(lastQuestion);
          continue;
        }
      }

      // Score-only line closing a multi-line question: "N (score/max) RESPONSE"
      // (or bare "N RESPONSE" for un-scored answers), with or without the
      // leading number when it was already consumed elsewhere.
      if (floatingText.length) {
        var scoreOnly = line.match(RE_SCORE_ONLY_LINE);
        var scoreOnlyBare = !scoreOnly ? line.match(RE_SCORE_ONLY_BARE) : null;
        if (scoreOnly || scoreOnlyBare) {
          lastQuestion = scoreOnly
            ? {
                qNum: scoreOnly[1] ? parseInt(scoreOnly[1], 10) : null,
                section: section.name, subsection: subsection,
                label: cleanLine(floatingText.join(' ')),
                score: parseFloat(scoreOnly[2]), max: parseFloat(scoreOnly[3]),
                response: scoreOnly[4] || '', note: ''
              }
            : {
                qNum: scoreOnlyBare[1] ? parseInt(scoreOnlyBare[1], 10) : null,
                section: section.name, subsection: subsection,
                label: cleanLine(floatingText.join(' ')),
                score: null, max: null,
                response: scoreOnlyBare[2] || '', note: ''
              };
          record.questions.push(lastQuestion);
          floatingText = [];
          continue;
        }
      }

      // A short line with no digits is a subsection heading like "Barista
      // Skills" — reconcile any buffered text first (it wasn't a wrapped
      // question fragment, since those are always closed by a scoreOnly line
      // above before a subsection heading could appear).
      if (/^[A-Z][A-Za-z \/&']*$/.test(line) && line.length < 48 && !RE_SCORE_ONLY_BARE.test(line)) {
        reconcileFloatingText();
        subsection = line;
        continue;
      }

      // Otherwise this is either a wrapped fragment of an in-progress
      // question's label, or a finding/action note for the previous
      // question — both look identical as plain text, so buffer it and
      // resolve which one it was once the next event (a score line, a new
      // question, or a new section/subsection) arrives.
      floatingText.push(line);
    }
    reconcileFloatingText();
    flushBlock();

    record.summary = cleanLine(record.summary);
    delete record._inSummary;
    delete record._inSectionTable;
    delete record._inCategoryTable;

    // GAIL's rule: a single failed Critical Point OR Allergen Point question
    // forces the whole visit to Red, overriding the normal percentage bands
    // (0-69.99% Red / 70-89.99% Yellow / 90%+ Green) — losing any allergen
    // point is just as disqualifying as losing a critical point. GoAudits
    // marks these questions in red text in the PDF, which pdf.js's text
    // layer doesn't expose — but the category totals (already parsed above)
    // tell us the same thing: if either category's actual is below its
    // target, at least one of those questions failed. Matched by category
    // CODE (CRTCL/ALRG), not the label text, so this still catches a fail
    // even if a report prints a slightly different label for the category.
    var CRITICAL_CATEGORY_CODES = ['CRTCL', 'ALRG'];
    var hasCriticalFail = Object.keys(record.categoryScores).some(function(name) {
      var s = record.categoryScores[name];
      var isCritical = CRITICAL_CATEGORY_CODES.indexOf(s.code) !== -1
        || /^(critical|allergen)\b/i.test(name);
      return isCritical && s.actual < s.target;
    });
    var computedBand = record.overallPct == null ? (record.band || '')
      : record.overallPct >= 90 ? 'Green'
      : record.overallPct >= 70 ? 'Yellow'
      : 'Red';
    if (hasCriticalFail) computedBand = 'Red';
    record.criticalFail = hasCriticalFail;
    record.printedBand = record.band; // whatever band text the PDF itself showed, kept for reference
    record.band = computedBand;

    return { record: record, warnings: warnings };
  }

  window.GAILS.CQV = {
    extractPageLines: extractPageLines,
    parsePages: parsePages,
    buildRecordFromPdf: async function(arrayBuffer) {
      var pages = await extractPageLines(arrayBuffer);
      var result = parsePages(pages);
      result.rawText = pages.map(function(p) { return p.join('\n'); }).join('\n\n');
      return result;
    }
  };
})();

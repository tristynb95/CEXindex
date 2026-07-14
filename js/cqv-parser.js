// ========== CQV (COFFEE QUALITY VISIT) PDF PARSER ==========
// Turns a GoAudits "CQV" PDF export (cover page, score summary, category
// table, then per-section Q#/QUESTION/SCORE/RESPONSE/PREVIOUS tables, then a
// Comments & Action Plan block) into the structured record saved to Firebase
// at routineVisits/{id} with type: 'cqv'. Runs entirely client-side via
// pdf.js (loaded as a separate <script> in admin.html — see
// GlobalWorkerOptions.workerSrc there).
//
// Two layout variants exist and both must parse:
//  - the original CQV: a SUMMARY paragraph, a populated PREVIOUS column on
//    every score row ("... (0/5) NO 02.Oct" with the previous response on
//    its own following line), and a Comments & Action Plan section;
//  - the follow-up CQV ("CQV Q3 FOLLOW UP"): no summary, an empty PREVIOUS
//    column, and no action plan (the dashboard derives one from lost points).
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
  // The overall band line prints Red/Yellow/Green on some exports and
  // PASS/FAIL on others — captured as printedBand either way; the band the
  // dashboard actually uses is recomputed from the percentages at the end.
  var RE_BAND = /^(Red|Yellow|Green|Pass|Fail)$/i;
  var RE_FRACTION = /^\(([\d.]+)\s*\/\s*([\d.]+)\)$/;
  var RE_ADDRESS = /^(.+?)\s*\|\s*(.+)$/;
  var RE_DATE_LINE = /^([A-Z]+DAY)\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})$/i;
  var RE_REF = /Ref:\s*(\d+)/;
  var RE_SECTION_SCORE_ROW = /^([A-Za-z][A-Za-z ]*?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/;
  var RE_CATEGORY_ROW = /^([A-Z]{2,8})\s*-\s*(.+?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/;
  var RE_MAJOR_SECTION_HEADER = /^([A-Z][A-Z &\/]+?)\s*\(([\d.]+)\s*\/\s*([\d.]+)\)\s*([\d.]+)\s*%$/;
  var RE_QCOL_HEADER = /^Q#\s*QUESTION\s*SCORE\s*RESPONSE\s*PREVIOUS$/i;
  var RE_Q_START = /^(\d+)\s+(.+)$/;

  // The original CQV's PREVIOUS column appends the prior visit's date to
  // each score row ("4 <question> (0/5) NO 02.Oct"), with the prior
  // response usually on its own following line ("Yes" / "No" / "N/A" / "G")
  // — and occasionally merged onto the same row. Every score-shaped pattern
  // therefore tolerates that optional tail; the standalone response line is
  // consumed via the expectPrevResponse flag in the parse loop. Follow-up
  // exports leave the column empty, so the tail simply never matches there.
  var PREV_COL_SRC = '(?:\\s+\\d{1,2}\\.[A-Za-z0-9]{3,9}(?:\\s+(?:Yes|No|N\\/A|G|Good|Inadequate))?)?';
  var RE_SCORE_TAIL = new RegExp('^(.*?)\\s*\\(([\\d.]+)\\s*\\/\\s*([\\d.]+)\\)\\s*([A-Za-z0-9\\/.\\-]*)' + PREV_COL_SRC + '\\s*$');
  var RE_SCORE_ONLY_LINE = new RegExp('^(?:(\\d+)\\s+)?\\(([\\d.]+)\\s*\\/\\s*([\\d.]+)\\)\\s*([A-Za-z0-9\\/.\\-]*)' + PREV_COL_SRC + '\\s*$');
  // Some questions (e.g. "Eat-in presentation according to standards N/A")
  // print only a bare response with no (score/max) cell at all — GoAudits
  // doesn't score N/A-type answers. These fall-back patterns cover both a
  // single-line question ("<label> N/A") and a multi-line question's closing
  // line ("<num> N/A").
  var RESPONSE_TOKENS = 'YES|NO|N\\/A|GOOD|INADEQUATE';
  var RE_SCORE_TAIL_BARE = new RegExp('^(.+?)\\s+(' + RESPONSE_TOKENS + ')' + PREV_COL_SRC + '$', 'i');
  var RE_SCORE_ONLY_BARE = new RegExp('^(?:(\\d+)\\s+)?(' + RESPONSE_TOKENS + ')' + PREV_COL_SRC + '$', 'i');
  var RE_PREV_RESPONSE_ONLY = /^(?:Yes|No|N\/A|G|Good|Inadequate)$/i;
  var RE_ENDS_WITH_PREV_DATE = /\d{1,2}\.[A-Za-z0-9]{3,9}\s*$/;

  var RE_ACTION_BLOCK_HEADER = /^([A-Za-z][A-Za-z &]+?)\s*>>\s*([A-Za-z][A-Za-z \/&]+)$/;
  // The Comments & Action Plan block prints Assignee/Priority/Due Date in a
  // sidebar box next to each item. Because that box is vertically centered
  // against the (often wrapped) findings/action text, its values can land on
  // the SAME reconstructed row as that text rather than their own line.
  // These are matched as embedded substrings, not whole lines, so they're
  // found and stripped out wherever they land.
  var RE_PRIORITY_EMBED = /\bPRIORITY\s+(Low|Medium|High)\b/i;
  var RE_DUE_DATE_EMBED = /\bDUE\s*DATE\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/i;
  // ASSIGNEE's value is the sidebar's right column and always runs to the
  // end of whatever row it merged into ("the till ASSIGNEE Welwyn Garden
  // City") — so capture to end-of-line, not a single word.
  var RE_ASSIGNEE_EMBED = /\bASSIGNEE\b\s*(.*)$/i;
  // Sidebar keyword/value pairs can also split across rows, leaving a bare
  // keyword or a bare value on its own line.
  var RE_ORPHAN_SIDEBAR_KEYWORD = /^(?:PRIORITY|DUE\s*DATE)$/i;
  var RE_ORPHAN_DUE_DATE = /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/;
  var RE_ORPHAN_PRIORITY = /^(?:Low|Medium|High)$/i;

  // A single reconstructed action-plan row can glue several logical fields
  // together — a question label's tail, the quoted "'No' - ..." response,
  // the FINDINGS / ACTION REQUIRED headings, and the paragraph text itself.
  // Each marker below is found at any position in a row; the parse loop
  // walks the row left to right, routing the text between markers to
  // whichever field is active at that point.
  var ACTION_PLAN_MARKERS = [
    // "(GA123) <question label>" — starts the label field, carries the ref
    { re: /\(GA(\d+)\)\s*/, phase: 'label', ref: true },
    { re: /\bFINDINGS\b:?\s*/, phase: 'findings' },
    { re: /\bACTION\s*REQUIRED\b:?\s*/i, phase: 'action' },
    // The quoted response ("'No' - ...") directly introduces the findings
    // text — only the quote/dash wrapper is stripped, the text after it is
    // kept as findings.
    { re: /['’]\s*(?:Yes|No|N\/A)\s*['’]?\s*-\s*/i, phase: 'findings' }
  ];

  var RE_PAGE_FOOTER = /^Page\s+\d+\s+of\s+\d+/i;
  var RE_COLOR_KEY = /^0%[\-–]69\.99%/;
  // Photo captions print a timestamp under each embedded photo — one per
  // photo, so a row can carry several back to back.
  var RE_PHOTO_TIMESTAMP = /^(?:\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{1,2}:\d{2}\s*[AP]M\s*)+$/i;
  // A PREVIOUS-column date ("02.Oct") that landed on its own row.
  var RE_PREV_DATE_ARTIFACT = /^\d{1,2}\.[A-Za-z0-9]{3,9}$/;
  // The declaration page embeds a Google map whose labels leak into the
  // text layer.
  var RE_MAP_FOOTER = /^(?:Google|Map data\b.*)$/i;
  var RE_COMMENTS_ROW = /^\d+\s+Comments and photos?$/i;
  var RE_DECLARATION_HEADING = /^D\s*E\s*C\s*L\s*A\s*R\s*A\s*T\s*I\s*O\s*N$/i;
  var RE_ACTION_PLAN_HEADING = /^C\s*O\s*M\s*M\s*E\s*N\s*T\s*S\s*&?\s*A\s*C\s*T\s*I\s*O\s*N\s*P\s*L\s*A\s*N$/i;
  var RE_SUMMARY_HEADING = /^S\s*U\s*M\s*M\s*A\s*R\s*Y$/i;
  var RE_SCORE_BY_SECTION_HEADING = /^S\s*C\s*O\s*R\s*E\s*B\s*Y\s*S\s*E\s*C\s*T\s*I\s*O\s*N$/i;
  var RE_SCORE_BY_CATEGORY_HEADING = /^S\s*C\s*O\s*R\s*E\s*B\s*Y\s*C\s*A\s*T\s*E\s*G\s*O\s*R\s*Y$/i;
  var RE_GENERAL_INFO_HEADING = /^GENERAL\s+INFORMATION/i;
  var RE_PREPARED_BY = /^Prepared\s*By\s*:?\s*$/i;
  var RE_PREPARED_BY_INLINE = /^Prepared\s*By\s*:?\s+(.+)$/i;
  var RE_AUDITOR = /^Auditor\s*:?\s*$/i;
  var RE_AUDITOR_INLINE = /^Auditor\s*:?\s+(.+)$/i;
  var RE_POWERED_BY = /^Powered\s*By$/i;
  // The running page header ("<SITE NAME> DD MON YY", e.g. "WELWYN GARDEN
  // CITY 01 JUL 26") can land appended to the END of real content — a
  // wrapped Summary sentence, a question row — instead of on its own line.
  // The site-name words are always ALL CAPS in this header (unlike normal
  // prose), which is what lets this be stripped safely. NOT applied inside
  // the action plan, where "DUE DATE 16 Jul 26" is exactly the
  // caps-words-plus-date shape this would eat — the action-plan handler
  // strips headers itself after extracting the sidebar values.
  var RE_TRAILING_RUNNING_HEADER = /(?:^|\s+)[A-Z][A-Z']*(?:\s+[A-Z][A-Z']*){0,5}\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\s*$/;

  function isNoiseLine(line) {
    return RE_PAGE_FOOTER.test(line)
      || RE_COLOR_KEY.test(line)
      || RE_POWERED_BY.test(line)
      || /^GAILS?\s*'?s?$/i.test(line)
      || RE_PHOTO_TIMESTAMP.test(line)
      || RE_PREV_DATE_ARTIFACT.test(line)
      || RE_MAP_FOOTER.test(line);
  }

  function isoDateFromParts(day, monthName, year) {
    var mi = MONTHS.indexOf(String(monthName).toLowerCase());
    if (mi === -1) return null;
    var dd = String(parseInt(day, 10)).padStart(2, '0');
    var mm = String(mi + 1).padStart(2, '0');
    return year + '-' + mm + '-' + dd;
  }

  // GoAudits prints the auditor twice: "Prepared By" at the bottom of the
  // cover and "Auditor (Name)" in the declaration on the final page. pdf.js
  // may reconstruct the caption/name as one row or two, and the declaration
  // wraps the value in parentheses. Keep this extraction separate from the
  // general cover scan so both layouts remain dependable fallbacks.
  function cleanAuditorCandidate(value) {
    var candidate = cleanLine(value)
      .replace(/^\(\s*/, '')
      .replace(/\s*\)$/, '')
      .replace(/^[\s:,-]+|[\s:,-]+$/g, '');
    if (!candidate || candidate.length > 100 || !/[A-Za-z]/.test(candidate)) return '';
    if (RE_PREPARED_BY.test(candidate) || RE_AUDITOR.test(candidate)
        || RE_DATE_LINE.test(candidate) || RE_REF.test(candidate)
        || isNoiseLine(candidate) || /^CQV\b/i.test(candidate)
        || /^GAILS?\s+BAKERY\b/i.test(candidate)
        || RE_DECLARATION_HEADING.test(candidate)) return '';
    return candidate;
  }

  function auditorFromCaption(lines, captionRe, inlineRe) {
    for (var idx = 0; idx < lines.length; idx++) {
      var line = cleanLine(lines[idx]);
      var inline = line.match(inlineRe);
      if (inline) {
        var inlineName = cleanAuditorCandidate(inline[1]);
        if (inlineName) return inlineName;
      }
      if (!captionRe.test(line)) continue;

      // The value normally follows the caption. Check the immediately
      // preceding row as a secondary layout variant; reaching farther can
      // mistake the nearby bakery name for an auditor when a value is absent.
      var offsets = [1, -1];
      for (var o = 0; o < offsets.length; o++) {
        var candidate = cleanAuditorCandidate(lines[idx + offsets[o]]);
        if (candidate) return candidate;
      }
    }
    return '';
  }

  function extractAuditorName(pages) {
    var firstPage = pages[0] || [];
    var lastPage = pages.length ? (pages[pages.length - 1] || []) : [];
    return auditorFromCaption(firstPage, RE_PREPARED_BY, RE_PREPARED_BY_INLINE)
      || auditorFromCaption(lastPage, RE_AUDITOR, RE_AUDITOR_INLINE)
      || '';
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
    record.auditorName = extractAuditorName(pages);

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

    // The Comments & Action Plan running header sometimes reprints only the
    // tail of the bakery name (e.g. "Garden City" for "Welwyn Garden City"),
    // merged into a label/findings row without a date attached, so the
    // full-name+date match alone misses it. Match the full name and any of
    // its trailing multi-word substrings — skipping any single trailing
    // word, since on its own that's too generic (e.g. just "City") to
    // safely strip out of real content. This can theoretically remove a
    // genuine mention of the bakery from findings prose, but sidebar
    // leakage is far more common than self-reference.
    var siteNameFragmentRe = null;
    if (record.bakery) {
      var bakeryWords = record.bakery.trim().split(/\s+/).filter(Boolean);
      var fragments = [];
      for (var wIdx = 0; wIdx < bakeryWords.length - 1; wIdx++) {
        fragments.push(escapeRegExp(bakeryWords.slice(wIdx).join(' ')));
      }
      if (bakeryWords.length === 1 && bakeryWords[0].length >= 5) {
        fragments.push(escapeRegExp(bakeryWords[0]));
      }
      if (fragments.length) {
        siteNameFragmentRe = new RegExp('\\b(?:' + fragments.join('|') + ')\\b', 'gi');
      }
    }

    // ---- scan every remaining line once, driving a small state machine ----
    var section = { name: '', earned: null, max: null, pct: null };
    var subsection = '';
    var floatingText = []; // un-numbered lines awaiting resolution — either a wrapped question's label (if a score line later claims them) or a finding/action note for the previous question (if nothing ever claims them)
    var lastQuestion = null; // for attaching trailing red "findings" note lines
    var inActionPlan = false;
    var currentBlock = null; // action plan block being built
    var blockPhase = ''; // '', 'label', 'findings', 'action'
    var expectPrevResponse = false; // a score row ended with a PREVIOUS-column date; its response follows on the next row

    function flushBlock() {
      if (currentBlock) {
        currentBlock.questionLabel = cleanLine(currentBlock.questionLabel);
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

    // A failed question's note lines and the NEXT question's wrapped label
    // can land in the same floating buffer with no event between them (the
    // note has no closing marker; the label has no opening one). The one
    // structural divider this layout does provide: every note ends with an
    // "Action: ..." line — possibly wrapping onto lowercase-starting
    // continuation lines — while a question label always starts uppercase.
    // Split there; return null when the buffer has no Action line (then the
    // whole buffer is the label, the common case).
    function splitNoteFromLabel(buf) {
      var lastActionIdx = -1;
      for (var k = 0; k < buf.length; k++) {
        if (/^Action\s*:/i.test(buf[k])) lastActionIdx = k;
      }
      if (lastActionIdx === -1) return null;
      var end = lastActionIdx + 1;
      while (end < buf.length && /^[a-z]/.test(buf[end])) end++;
      if (end >= buf.length) return null; // nothing left to be the label
      return { note: buf.slice(0, end), label: buf.slice(end) };
    }

    // Running headers reprint at the top of every interior page: the
    // "GAILS BAKERY ..." banner, the report title itself ("CQV Q3 FOLLOW
    // UP" — no dash, so the CQV-code check alone misses it), and short
    // "CQV - ..." codes.
    function isRunningHeader(text) {
      if (/^GAILS BAKERY/i.test(text)) return true;
      if (record.title && text.toUpperCase() === record.title.toUpperCase()) return true;
      return /^CQV\s*-/i.test(text) && text.length < 20;
    }

    // Look past noise/running-header rows to the next real content line —
    // used to confirm subsection headings (see below).
    function nextContentLine(idx) {
      for (var j = idx + 1; j < n; j++) {
        var t = cleanLine(lines[j].text);
        if (!t || isNoiseLine(t) || isRunningHeader(t)) continue;
        return t;
      }
      return '';
    }

    for (i = 0; i < n; i++) {
      var raw = lines[i].text;
      var line = cleanLine(raw);
      if (!line) continue;
      if (isNoiseLine(line)) continue;
      if (lines[i].page === 0) continue; // already handled cover page above
      if (isRunningHeader(line)) continue;

      // The PREVIOUS-column response ("Yes" / "No" / "N/A" / "G") prints on
      // the row after its score line — consume it so it can't pollute notes
      // or get mistaken for a real response. Only ever the immediately-next
      // content line; anything else clears the expectation.
      if (expectPrevResponse) {
        expectPrevResponse = false;
        if (RE_PREV_RESPONSE_ONLY.test(line)) continue;
      }

      // The running header can also land merged onto the end of a real
      // content line — strip it. Skipped inside the action plan (see the
      // RE_TRAILING_RUNNING_HEADER comment).
      if (!inActionPlan && RE_TRAILING_RUNNING_HEADER.test(line)) {
        line = cleanLine(line.replace(RE_TRAILING_RUNNING_HEADER, ''));
        if (!line) continue;
      }

      if (RE_ACTION_PLAN_HEADING.test(line.replace(/\s+/g, ''))) { inActionPlan = true; reconcileFloatingText(); continue; }
      // DECLARATION is the signature block that closes every report —
      // nothing after it (auditor name, embedded map labels) is content.
      if (RE_DECLARATION_HEADING.test(line)) { reconcileFloatingText(); flushBlock(); break; }

      if (inActionPlan) {
        var hdr = line.match(RE_ACTION_BLOCK_HEADER);
        if (hdr) {
          flushBlock();
          // Assignee is pre-seeded with the bakery itself — in this layout
          // it always is ("ASSIGNEE Welwyn Garden City") — so a sidebar
          // parse miss doesn't lose it.
          currentBlock = { sectionPath: cleanLine(hdr[1]) + ' >> ' + cleanLine(hdr[2]), questionRef: '', questionLabel: '', findings: '', actionRequired: '', assignee: record.bakery || '', priority: '', dueDate: '' };
          blockPhase = '';
          continue;
        }
        if (!currentBlock) continue; // stray line before first block header

        // Pull the sidebar values out first, wherever they landed. DUE DATE
        // must be extracted before any header stripping — "DUE DATE 16 Jul
        // 26" ends in exactly the caps-words-plus-date shape the stripper
        // would otherwise eat.
        var cleaned = line;
        var dueMatch = cleaned.match(RE_DUE_DATE_EMBED);
        if (dueMatch) { if (!currentBlock.dueDate) currentBlock.dueDate = dueMatch[1]; cleaned = cleanLine(cleaned.replace(dueMatch[0], ' ')); }
        var priMatch = cleaned.match(RE_PRIORITY_EMBED);
        if (priMatch) { if (!currentBlock.priority) currentBlock.priority = priMatch[1]; cleaned = cleanLine(cleaned.replace(priMatch[0], ' ')); }
        var assMatch = cleaned.match(RE_ASSIGNEE_EMBED);
        if (assMatch) {
          if (!currentBlock.assignee && cleanLine(assMatch[1])) currentBlock.assignee = cleanLine(assMatch[1]);
          cleaned = cleanLine(cleaned.slice(0, assMatch.index));
        }
        // A keyword/value pair that split across rows leaves a bare keyword
        // or bare value behind.
        if (RE_ORPHAN_SIDEBAR_KEYWORD.test(cleaned)) continue;
        if (RE_ORPHAN_DUE_DATE.test(cleaned)) { if (!currentBlock.dueDate) currentBlock.dueDate = cleaned; continue; }
        if (RE_ORPHAN_PRIORITY.test(cleaned)) { if (!currentBlock.priority) currentBlock.priority = cleaned; continue; }
        // Now strip whatever's left of the running page header / bare
        // site-name fragments merged into the row.
        if (record.bakery) {
          var headerRe = new RegExp('\\b' + escapeRegExp(record.bakery) + '\\s+\\d{1,2}\\s+[A-Z]{3}\\s+\\d{2,4}\\b', 'i');
          cleaned = cleanLine(cleaned.replace(headerRe, ' '));
        }
        cleaned = cleanLine(cleaned.replace(RE_TRAILING_RUNNING_HEADER, ''));
        if (siteNameFragmentRe) cleaned = cleanLine(cleaned.replace(siteNameFragmentRe, ' '));
        if (!cleaned) continue; // line was pure sidebar/header noise

        // Walk the row left to right, splitting at whichever marker comes
        // first, and route each piece to whatever field is active when we
        // reach it — a single merged row can span several fields (see
        // ACTION_PLAN_MARKERS above).
        var remaining = cleaned;
        var guard = 0;
        while (remaining && guard++ < 20) {
          var next = null;
          for (var m = 0; m < ACTION_PLAN_MARKERS.length; m++) {
            var mm = ACTION_PLAN_MARKERS[m].re.exec(remaining);
            if (mm && (!next || mm.index < next.index)) {
              next = { index: mm.index, len: mm[0].length, phase: ACTION_PLAN_MARKERS[m].phase, ref: ACTION_PLAN_MARKERS[m].ref ? mm[1] : null };
            }
          }
          var before = cleanLine(next ? remaining.slice(0, next.index) : remaining);
          if (before) {
            if (blockPhase === 'label') currentBlock.questionLabel += before + ' ';
            else if (blockPhase === 'findings') currentBlock.findings += before + ' ';
            else if (blockPhase === 'action') currentBlock.actionRequired += before + ' ';
            // blockPhase === '': text before any field marker has appeared
            // isn't attachable to anything — dropped.
          }
          if (!next) break;
          if (next.ref) currentBlock.questionRef = 'GA' + next.ref;
          blockPhase = next.phase;
          remaining = remaining.slice(next.index + next.len);
        }
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
      //   "6 (0/20) NO 02.Oct"
      // Single-line questions instead carry everything on one row:
      //   "7 Are efficient ways of working embedded? (20/20) YES"
      // `floatingText` buffers un-numbered lines until a score line (with or
      // without a leading number) claims them as its label.
      if (RE_QCOL_HEADER.test(line)) continue;
      // "NN Comments and photos" rows are photo placeholders, not questions —
      // but any buffered note text belongs to the previous question, so
      // reconcile before dropping the row.
      if (RE_COMMENTS_ROW.test(line)) { reconcileFloatingText(); continue; }
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
          expectPrevResponse = RE_ENDS_WITH_PREV_DATE.test(line);
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
          // If the previous question failed and hasn't got its note yet, the
          // buffer may hold that note followed by this question's wrapped
          // label — carve the note off before claiming the rest as label.
          var labelLines = floatingText;
          if (lastQuestion && !lastQuestion.note
              && (lastQuestion.score === 0 || /^(no|inadequate)$/i.test(lastQuestion.response))) {
            var noteSplit = splitNoteFromLabel(floatingText);
            if (noteSplit) {
              lastQuestion.note = cleanLine(noteSplit.note.join(' '));
              labelLines = noteSplit.label;
            }
          }
          lastQuestion = scoreOnly
            ? {
                qNum: scoreOnly[1] ? parseInt(scoreOnly[1], 10) : null,
                section: section.name, subsection: subsection,
                label: cleanLine(labelLines.join(' ')),
                score: parseFloat(scoreOnly[2]), max: parseFloat(scoreOnly[3]),
                response: scoreOnly[4] || '', note: ''
              }
            : {
                qNum: scoreOnlyBare[1] ? parseInt(scoreOnlyBare[1], 10) : null,
                section: section.name, subsection: subsection,
                label: cleanLine(labelLines.join(' ')),
                score: null, max: null,
                response: scoreOnlyBare[2] || '', note: ''
              };
          record.questions.push(lastQuestion);
          floatingText = [];
          expectPrevResponse = RE_ENDS_WITH_PREV_DATE.test(line);
          continue;
        }
      }

      // A short title-case line is only a subsection heading (e.g. "Barista
      // Skills") if the next content row is the Q#/QUESTION/... column
      // header that always follows one — otherwise it's a finding/note
      // sentence that happens to look like a heading (e.g. "Few names not
      // taken on visit"), which belongs in floatingText, not in the
      // subsection state.
      if (/^[A-Z][A-Za-z \/&']*$/.test(line) && line.length < 48 && !RE_SCORE_ONLY_BARE.test(line)
          && RE_QCOL_HEADER.test(nextContentLine(i))) {
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

    // GAIL's rule: a single failed zero-tolerance question forces the whole
    // visit to Red, overriding the normal percentage bands (0-69.99% Red /
    // 70-89.99% Yellow / 90%+ Green). Which questions are zero-tolerance is
    // defined by the canonical list in js/cqv-criticals.js — NOT the
    // "(allergen point)" tag or the ALRG category total, because not every
    // allergen point is critical (e.g. out-of-date stock counts toward ALRG
    // but doesn't force Red). The shared helper matches the parsed questions
    // against that list, with the CRTCL category total as a backstop.
    var hasCriticalFail = window.GAILS.CQVCriticals.hasCriticalFail(record);
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

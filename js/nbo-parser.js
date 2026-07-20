// ========== NBO COFFEE VISIT PDF PARSER ==========
// Turns a GoAudits "NBO COFFEE VISIT 1" / "NBO COFFEE VISIT 2" PDF export
// (cover page, then per-section Q#/QUESTION/RESPONSE tables, then a
// declaration) into the structured record saved to Firebase at
// routineVisits/{id} with type: 'nbo'. Runs entirely client-side via pdf.js,
// reusing the page-line extraction from js/cqv-parser.js (loaded before this
// file in admin.html).
//
// The important difference from a CQV: an NBO visit has NO score of any kind.
// There's no percentage, no points, no band, no action plan — every question
// is a bare YES/NO and the value of the report is the coaching note printed
// under each NO. So this parser produces questions + notes only, and every
// surface that renders an NBO record must avoid implying a score exists.
//
// Layout, as reconstructed by extractPageLines:
//   Visit 1                       <- the visit-number heading
//   Efficiency                    <- section heading
//   Q# QUESTION RESPONSE          <- column header that always follows one
//   1. Is bar set up to Barista Routine phase 1? YES
//   3. Are the coffee positions on the shift planner in line with Barista NO
//   Routine phase 2?              <- the question text wraps BELOW its response
//   Having a coffee standby can elevate the experience when needed. Also
//   allows karolina to read ...   <- the coaching note for question 3
//
// The wrap is what makes this fiddly. GoAudits vertically centers the RESPONSE
// cell against the (often multi-line) question text, so the response token
// lands at the end of whichever reconstructed line happens to sit level with
// it — usually the first, but not by contract. The question's remaining text
// then continues on the following lines, and only AFTER that does the coaching
// note start. Nothing marks the boundary between "rest of the question" and
// "start of the note" except that a question always contains its "?" and a
// note never does. So a question is accumulated until it has both a response
// and a "?", and everything after that belongs to the note.
//
// As with the CQV parser this is best-effort, not a strict grammar.
// Under-parsing is safe (the original PDF is stored alongside the record and
// stays the source of truth); silently wrong values are what to avoid.
window.GAILS = window.GAILS || {};

(function() {
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function cleanLine(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  var RE_TITLE = /^NBO\s+COFFEE\s+VISIT\s*(\d+)\b/i;
  var RE_VISIT_HEADING = /^Visit\s+(\d+)$/i;
  var RE_QCOL_HEADER = /^Q#\s*QUESTION\s*RESPONSE$/i;
  var RE_DATE_LINE = /^([A-Z]+DAY)\s+(\d{1,2})(?:st|nd|rd|th)\s+([A-Za-z]+)\s+(\d{4})$/i;
  var RE_REF = /Ref:\s*(\d+)/;
  var RE_ADDRESS = /^(.+?)\s*\|\s*(.+)$/;

  // "1. <question text>" — the row that starts a question. Everything after
  // the number is question text, possibly with the response token glued to the
  // end of it.
  var RE_Q_START = /^(\d+)\s*\.\s*(.*)$/;
  // The response cell as it lands at the end of a row: "... phase 1? YES".
  var RE_RESPONSE_TAIL = /^(.*?)\s*\b(YES|NO|N\/A)$/i;

  var RE_PAGE_FOOTER = /^Page\s+\d+\s+of\s+\d+/i;
  var RE_POWERED_BY = /^Powered\s*By$/i;
  var RE_MAP_FOOTER = /^(?:Google|Map data\b.*)$/i;
  var RE_PHOTO_TIMESTAMP = /^(?:\d{1,2}\s+[A-Za-z]{3}\s+\d{2}\s+\d{1,2}:\d{2}\s*[AP]M\s*)+$/i;
  var RE_DECLARATION_HEADING = /^D\s*E\s*C\s*L\s*A\s*R\s*A\s*T\s*I\s*O\s*N$/i;
  var RE_AUDITOR_LOCATION = /^AUDITOR'?S\s+LOCATION$/i;
  var RE_PREPARED_BY = /^Prepared\s*By\s*:?\s*$/i;
  var RE_PREPARED_BY_INLINE = /^Prepared\s*By\s*:?\s+(.+)$/i;
  var RE_AUDITOR = /^Auditor\s*:?\s*$/i;
  var RE_AUDITOR_INLINE = /^Auditor\s*:?\s+(.+)$/i;
  // The running page header ("BANBURY GATEWAY 19 JUL 26") reprints on every
  // interior page and can also land merged onto the END of a real content
  // line. The site-name words are always ALL CAPS there, which is what makes
  // stripping it safe.
  var RE_TRAILING_RUNNING_HEADER = /(?:^|\s+)[A-Z][A-Z']*(?:\s+[A-Z][A-Z']*){0,5}\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}\s*$/;

  function isNoiseLine(line) {
    return RE_PAGE_FOOTER.test(line)
      || RE_POWERED_BY.test(line)
      || RE_MAP_FOOTER.test(line)
      || RE_PHOTO_TIMESTAMP.test(line)
      || RE_AUDITOR_LOCATION.test(line)
      || /^GAILS?\s*'?s?$/i.test(line);
  }

  function isoDateFromParts(day, monthName, year) {
    var mi = MONTHS.indexOf(String(monthName).toLowerCase());
    if (mi === -1) return null;
    var dd = String(parseInt(day, 10)).padStart(2, '0');
    var mm = String(mi + 1).padStart(2, '0');
    return year + '-' + mm + '-' + dd;
  }

  // GoAudits prints the auditor twice — "Prepared By" on the cover and
  // "Auditor (Name)" in the closing declaration — and pdf.js may reconstruct
  // the caption and its value in either order, so both neighbours are checked.
  function cleanAuditorCandidate(value) {
    var candidate = cleanLine(value)
      .replace(/^\(\s*/, '')
      .replace(/\s*\)$/, '')
      .replace(/^[\s:,-]+|[\s:,-]+$/g, '');
    if (!candidate || candidate.length > 100 || !/[A-Za-z]/.test(candidate)) return '';
    if (RE_PREPARED_BY.test(candidate) || RE_AUDITOR.test(candidate)
        || RE_DATE_LINE.test(candidate) || RE_REF.test(candidate)
        || isNoiseLine(candidate) || RE_TITLE.test(candidate)
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

  // Is this PDF an NBO Coffee Visit rather than a CQV? Checked against the
  // first couple of pages so the admin import zone can route a dropped file to
  // the right parser without the user having to say which it is.
  function looksLikeNboPdf(pages) {
    var head = (pages[0] || []).concat(pages[1] || []);
    return head.some(function(line) { return RE_TITLE.test(cleanLine(line)); });
  }

  // How many wrapped lines a question's text may run to before the parser
  // stops treating following lines as more of the question. Bounds the damage
  // if a question ever prints without a "?" — it would otherwise swallow the
  // whole coaching note into its label.
  var MAX_LABEL_WRAP_LINES = 4;

  function parsePages(pages) {
    var record = {
      type: 'nbo',
      visitNumber: null,
      bakery: '',
      date: '',
      title: '',
      auditorName: '',
      ref: '',
      address: '',
      questions: []
    };
    var warnings = [];

    var lines = [];
    pages.forEach(function(pageLines, pageIndex) {
      pageLines.forEach(function(line) { lines.push({ text: line, page: pageIndex }); });
    });
    var n = lines.length;

    record.auditorName = extractAuditorName(pages);

    // ---- cover page: title/visit number/bakery/date/ref ----
    var page0 = pages[0] || [];
    for (var c = 0; c < page0.length; c++) {
      var cl = cleanLine(page0[c]);
      if (!cl || /^GAILS?'?s?$/i.test(cl)) continue;
      var tm = cl.match(RE_TITLE);
      if (tm) {
        record.title = cl;
        record.visitNumber = parseInt(tm[1], 10);
        continue;
      }
      var dm = cl.match(RE_DATE_LINE);
      if (dm) {
        record.date = isoDateFromParts(dm[2], dm[3], dm[4]) || '';
        continue;
      }
      var refm = cl.match(RE_REF);
      if (refm) record.ref = refm[1];
      // The bakery name is the line directly under the "GAILS BAKERY" banner.
      if (!record.bakery && c > 0 && /^GAILS BAKERY$/i.test(cleanLine(page0[c - 1]))
          && !isNoiseLine(cl) && !RE_PREPARED_BY.test(cl) && cl !== record.auditorName) {
        record.bakery = cl;
      }
    }

    function isRunningHeader(text) {
      if (/^GAILS BAKERY/i.test(text)) return true;
      if (record.title && text.toUpperCase() === record.title.toUpperCase()) return true;
      if (RE_TITLE.test(text)) return true;
      return RE_DATE_LINE.test(text);
    }

    // Look past noise/header rows to the next real content line — used to
    // confirm section headings (see below).
    function nextContentLine(idx) {
      for (var j = idx + 1; j < n; j++) {
        var t = cleanLine(lines[j].text);
        if (!t || isNoiseLine(t) || isRunningHeader(t)) continue;
        return t;
      }
      return '';
    }

    var section = '';
    var noteLines = [];  // lines trailing a completed question — its coaching note
    var pending = null;  // question still accumulating its wrapped text and/or response

    // A question is done once it has both its response cell and the "?" that
    // every NBO question carries. Until then, following lines are more of the
    // question; after it, they're the coaching note.
    function pendingIsComplete() {
      return !!pending && !!pending.response && pending.label.indexOf('?') !== -1;
    }

    function commitPending(force) {
      if (!pending) return;
      if (!pending.response) {
        warnings.push('No Yes/No response found for question ' + pending.qNum + ': "' + pending.label.slice(0, 60) + '"');
      } else if (force) {
        warnings.push('Question ' + pending.qNum + ' had no "?" to mark where its text ended; its note may be incomplete.');
      }
      record.questions.push({
        qNum: pending.qNum,
        section: pending.section,
        label: cleanLine(pending.label),
        response: pending.response,
        note: ''
      });
      pending = null;
    }

    // Attaches the buffered trailing lines to the question they sit under.
    function flushNote() {
      if (noteLines.length) {
        var text = cleanLine(noteLines.join(' '));
        var last = record.questions[record.questions.length - 1];
        if (last && !last.note) {
          last.note = text;
        } else {
          warnings.push('Could not attach this text to a question: "' + text.slice(0, 60) + '"');
        }
      }
      noteLines = [];
    }

    // Ends whatever question/note is in progress. Called at every boundary
    // (new question, new section, end of report).
    function closeCurrent() {
      commitPending(true);
      flushNote();
    }

    // Adds a line to the question in progress, pulling the response token off
    // the end if this is the row the RESPONSE cell landed on.
    function appendToPending(text) {
      var tail = text.match(RE_RESPONSE_TAIL);
      if (tail && !pending.response) {
        pending.response = tail[2].toUpperCase();
        text = tail[1];
      }
      text = cleanLine(text);
      if (text) pending.label += (pending.label ? ' ' : '') + text;
    }

    for (var i = 0; i < n; i++) {
      var line = cleanLine(lines[i].text);
      if (!line) continue;
      if (isNoiseLine(line)) continue;
      if (lines[i].page === 0) continue; // cover page handled above

      // DECLARATION is the signature block that closes every report — nothing
      // after it (auditor name, embedded map labels) is content.
      if (RE_DECLARATION_HEADING.test(line)) { closeCurrent(); break; }

      var vm = line.match(RE_VISIT_HEADING);
      if (vm) {
        closeCurrent();
        if (record.visitNumber == null) record.visitNumber = parseInt(vm[1], 10);
        continue;
      }

      // The address row ("Banbury Gateway | Unit 17 BANBURY GATEWAY, ...")
      // prints under the running header on the first content page.
      if (!record.address && !section && RE_ADDRESS.test(line)) {
        var am = line.match(RE_ADDRESS);
        record.address = cleanLine(am[2]);
        if (!record.bakery) record.bakery = cleanLine(am[1]);
        continue;
      }

      if (isRunningHeader(line)) continue;
      if (RE_QCOL_HEADER.test(line)) continue;

      // Strip a running header that merged onto the end of a real line.
      if (RE_TRAILING_RUNNING_HEADER.test(line)) {
        line = cleanLine(line.replace(RE_TRAILING_RUNNING_HEADER, ''));
        if (!line) continue;
      }

      // A short title-case line is only a section heading ("Efficiency",
      // "Quality", "Safety", "Service", "Equipment") if the next content row
      // is the Q#/QUESTION/RESPONSE column header that always follows one —
      // otherwise it's a coaching note that happens to look like a heading.
      if (/^[A-Z][A-Za-z /&']*$/.test(line) && line.length < 48
          && RE_QCOL_HEADER.test(nextContentLine(i))) {
        closeCurrent();
        section = line;
        continue;
      }

      // "1. <question text> [RESPONSE]" — starts a new question.
      var qStart = line.match(RE_Q_START);
      if (qStart) {
        closeCurrent();
        pending = { qNum: parseInt(qStart[1], 10), section: section, label: '', response: '', wraps: 0 };
        appendToPending(qStart[2]);
        if (pendingIsComplete()) commitPending(false);
        continue;
      }

      // Still inside a question: this line is the rest of its wrapped text.
      if (pending) {
        pending.wraps++;
        appendToPending(line);
        if (pendingIsComplete()) commitPending(false);
        else if (pending.wraps >= MAX_LABEL_WRAP_LINES) commitPending(true);
        continue;
      }

      // Otherwise this trails a completed question — its coaching note.
      noteLines.push(line);
    }
    closeCurrent();

    var counts = { yes: 0, no: 0, na: 0 };
    record.questions.forEach(function(q) {
      if (q.response === 'YES') counts.yes++;
      else if (q.response === 'NO') counts.no++;
      else if (q.response === 'N/A') counts.na++;
    });
    record.counts = counts;

    // The PDF itself prints no score — this percentage is derived by the app
    // from the Yes/No answers so visits are comparable at a glance. It is
    // stored so it stays stable for a saved record, and is deliberately never
    // given a RAG band; see the note at the top of js/nbo-shared.js.
    record.overallPct = window.GAILS.NBOShared.pctFromCounts(counts.yes, counts.yes + counts.no);

    return { record: record, warnings: warnings };
  }

  window.GAILS.NBO = {
    looksLikeNboPdf: looksLikeNboPdf,
    parsePages: parsePages,
    buildRecordFromPdf: async function(arrayBuffer) {
      // Shares the CQV parser's pdf.js text-layout extraction — identical
      // GoAudits renderer, identical row-reconstruction problem.
      var pages = await window.GAILS.CQV.extractPageLines(arrayBuffer);
      var result = parsePages(pages);
      result.rawText = pages.map(function(p) { return p.join('\n'); }).join('\n\n');
      return result;
    }
  };
})();

// ========== VISIT REPORT MODAL ==========
// Full breakdown of a single Routine Coffee Visit, opened by clicking the
// "Last visited" line in a map popup (see js/targets.js getPopupHtml).
window.GAILS = window.GAILS || {};

(function () {
  var lockedScrollY = 0;
  var CHART_ID = 'visitReportScoreChart';
  var WAIT_TIME_TARGET_SECONDS = 120;

  var escapeHtml = GAILS.escapeHtml;

  function lockBackgroundScroll() {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('drill-modal-open');
    document.body.classList.add('drill-modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + lockedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
  }

  function unlockBackgroundScroll() {
    document.documentElement.classList.remove('drill-modal-open');
    document.body.classList.remove('drill-modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, lockedScrollY);
  }

  function preserveScrollPosition(callback) {
    var scrollX = window.scrollX || window.pageXOffset || 0;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    // Clear any padding from a previous restore so the list re-measures at
    // its natural height before this render.
    var list = document.getElementById('visitLogList');
    if (list) list.style.minHeight = '';

    callback();

    window.scrollTo(scrollX, scrollY);
    // If the re-render shrank the page (e.g. filtering down to one visit),
    // the restore above clamps short of the old position and the page still
    // jumps. Pad the list by exactly the shortfall so the document stays
    // tall enough for the viewport to remain where it was.
    var deficit = scrollY - (window.scrollY || window.pageYOffset || 0);
    if (deficit > 0 && list) {
      list.style.minHeight = (list.offsetHeight + deficit) + 'px';
      window.scrollTo(scrollX, scrollY);
    }
    window.requestAnimationFrame(function () {
      window.scrollTo(scrollX, scrollY);
    });
  }

  function formatVisitDate(isoDate) {
    if (!isoDate) return 'Unknown date';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return isoDate;
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  function ynnaPill(value, flag) {
    var v = value || '—';
    var cls = 'visit-pill';
    if (value === 'Yes') cls += ' visit-pill--yes';
    else if (value === 'No') cls += ' visit-pill--no';
    else if (value === 'N/A') cls += ' visit-pill--na';
    else cls += ' visit-pill--unknown';
    if (flag) cls += ' visit-pill--flag';
    return '<span class="' + cls + '">' + (flag ? '&#9888; ' : '') + escapeHtml(v) + '</span>';
  }

  function renderPhotoLinks(urls) {
    if (!Array.isArray(urls) || !urls.length) return '';
    return '<div class="visit-report-photos">' + urls.map(function (url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Photo &#8599;</a>';
    }).join('') + '</div>';
  }

  function renderSection(section, data, hsIssues) {
    var isHs = section.key === 'healthSafety';
    var rows = [];
    var comments = '';
    var photos = '';

    section.fields.forEach(function (field) {
      var value = data[field.key];
      if (field.type === 'ynna') {
        var failed = value === 'No';
        if (isHs && failed) hsIssues.push(field.label);
        rows.push(
          '<div class="visit-report-row' + (isHs && failed ? ' visit-report-row--flag' : '') + '">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          ynnaPill(value, isHs && failed) +
          '</div>'
        );
      } else if (field.type === 'scale') {
        var scaleText = (value != null && value !== '') ? value + ' / 10' : '—';
        rows.push(
          '<div class="visit-report-row">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="visit-report-row__value">' + escapeHtml(scaleText) + '</span>' +
          '</div>'
        );
      } else if (field.type === 'number' && field.key === 'avgWaitTimeSeconds') {
        var overTarget = value != null && value !== '' && Number(value) > WAIT_TIME_TARGET_SECONDS;
        var waitText = (value != null && value !== '') ? value + 's (target ≤ ' + WAIT_TIME_TARGET_SECONDS + 's)' : '—';
        rows.push(
          '<div class="visit-report-row' + (overTarget ? ' visit-report-row--flag' : '') + '">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="visit-report-row__value' + (overTarget ? ' visit-report-row__value--flag' : ' visit-report-row__value--ok') + '">' + escapeHtml(waitText) + '</span>' +
          '</div>'
        );
      } else if (field.type === 'number') {
        rows.push(
          '<div class="visit-report-row">' +
          '<span class="visit-report-row__label">' + escapeHtml(field.label) + '</span>' +
          '<span class="visit-report-row__value">' + escapeHtml(value != null && value !== '' ? value : '—') + '</span>' +
          '</div>'
        );
      } else if (field.type === 'textarea') {
        if (value) comments = '<p class="visit-report-comment">' + escapeHtml(value) + '</p>';
      } else if (field.type === 'photos') {
        photos = renderPhotoLinks(value);
      }
    });

    return '<div class="visit-report-section-wrapper">' +
      '<div class="visit-report-section' + (isHs ? ' visit-report-section--hs' : '') + '">' +
      '<h4>' + escapeHtml(section.title) + (isHs ? ' <span class="visit-report-hs-tag">Health &amp; Safety</span>' : '') + '</h4>' +
      rows.join('') + comments + photos +
      '</div>' +
      '</div>';
  }

  function buildHsSummaryHtml(hsIssues) {
    if (!hsIssues.length) {
      return '<div class="visit-report-section-wrapper">' +
        '<div class="visit-report-hs-banner visit-report-hs-banner--ok">' +
        '&#9989; No Health &amp; Safety issues found on this visit.' +
        '</div>' +
        '</div>';
    }
    return '<div class="visit-report-section-wrapper">' +
      '<div class="visit-report-hs-banner visit-report-hs-banner--alert">' +
      '<strong>&#9888; ' + hsIssues.length + ' Health &amp; Safety issue' + (hsIssues.length === 1 ? '' : 's') + ' found:</strong>' +
      '<ul>' + hsIssues.map(function (label) { return '<li>' + escapeHtml(label) + '</li>'; }).join('') + '</ul>' +
      '</div>' +
      '</div>';
  }

  function buildHeaderStatsHtml(record) {
    var scoreText = (record.score != null) ? record.score + ' / ' + (record.scoreMax != null ? record.scoreMax : '—') : '—';
    var cards = [
      { label: 'Score', value: scoreText },
      { label: 'Coffee Partner', value: record.coffeePartner || '—' },
      { label: 'MOD', value: record.mod || '—' },
      { label: 'Head Barista Present', value: record.headBaristaPresent || '—' },
      { label: 'Staff on Shift', value: record.numberOfStaff != null ? record.numberOfStaff : '—' }
    ];
    return '<div class="drill-summary">' + cards.map(function (c) {
      return '<div class="drill-card"><div class="drill-card__label">' + escapeHtml(c.label) + '</div>' +
        '<div class="drill-card__value" style="font-size:1.3rem">' + escapeHtml(c.value) + '</div></div>';
    }).join('') + '</div>';
  }

  function buildReportHtml(record) {
    var schema = window.GAILS_VISIT_SCHEMA;
    var hsIssues = [];
    var sectionsHtml = schema.sections.map(function (section) {
      return renderSection(section, record[section.key] || {}, hsIssues);
    }).join('');

    var hasSectionScores = record.sectionScores && Object.keys(record.sectionScores).length > 0;
    var chartHtml = hasSectionScores
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-chart-wrap"><canvas id="' + CHART_ID + '"></canvas></div></div>'
      : '<p class="visit-report-note">Section-by-section score breakdown isn’t available for this visit (it was recorded before scoring breakdown was added).</p>';

    return buildHeaderStatsHtml(record) +
      buildHsSummaryHtml(hsIssues) +
      chartHtml +
      sectionsHtml;
  }

  function drawScoreChart(record) {
    var G = window.GAILS;
    if (!record.sectionScores || typeof G.makeChart !== 'function') return;
    var schema = window.GAILS_VISIT_SCHEMA;
    var labels = schema.sections.map(function (s) { return s.title; });
    var earned = schema.sections.map(function (s) { return (record.sectionScores[s.key] || {}).earned || 0; });
    var max = schema.sections.map(function (s) { return (record.sectionScores[s.key] || {}).max || 0; });

    G.makeChart(CHART_ID, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Points Earned', data: earned, backgroundColor: '#1D9E5C', borderRadius: 6 },
          { label: 'Points Available', data: max, backgroundColor: 'rgba(146, 137, 120,0.25)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(34, 31, 26,0.06)' } }
        },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  var CQV_CHART_ID = 'cqvReportScoreChart';

  // Shared with the admin CQV table — see js/cqv-shared.js.
  var cqvHasCriticalFail = GAILS.CQVShared.hasCriticalFail;
  var cqvBand = GAILS.CQVShared.band;
  var cqvBandColor = GAILS.CQVShared.bandColor;

  function buildCqvHeaderStatsHtml(record) {
    var scoreText = record.overallPct != null ? record.overallPct + '%' : '—';
    var band = cqvBand(record);
    var bandColor = cqvBandColor(band);
    var cards = [
      { label: 'Overall Score', value: scoreText },
      { label: 'Rating', value: band || '—', color: bandColor },
      { label: 'Points', value: (record.score != null) ? record.score + ' / ' + (record.scoreMax != null ? record.scoreMax : '—') : '—' },
      { label: 'Auditor', value: record.auditorName || '—' },
      { label: 'Visit Type', value: record.isFollowUp ? 'Follow-Up' : 'CQV' }
    ];
    return '<div class="drill-summary">' + cards.map(function (c) {
      var colorStyle = c.color ? ' color:' + c.color + ';' : '';
      return '<div class="drill-card"><div class="drill-card__label">' + escapeHtml(c.label) + '</div>' +
        '<div class="drill-card__value" style="font-size:1.3rem;' + colorStyle + '">' + escapeHtml(c.value) + '</div></div>';
    }).join('') + '</div>';
  }

  function buildCqvScoreRowsHtml(scores) {
    return Object.keys(scores || {}).map(function (name) {
      var s = scores[name];
      var isCritical = (s.code === 'CRTCL' || s.code === 'ALRG') || /^(critical|allergen)\b/i.test(name);
      var failing = s.pct < 70 || (isCritical && s.actual < s.target);
      return '<div class="visit-report-row' + (failing ? ' visit-report-row--flag' : '') + '">' +
        '<span class="visit-report-row__label">' + escapeHtml(name) + '</span>' +
        '<span class="visit-report-row__value' + (failing ? ' visit-report-row__value--flag' : ' visit-report-row__value--ok') + '">' +
        escapeHtml(s.actual) + ' / ' + escapeHtml(s.target) + ' (' + escapeHtml(s.pct) + '%)' +
        '</span></div>';
    }).join('');
  }

  var cqvPriorityColor = GAILS.CQVShared.priorityColor;
  var cqvCriticalTag = GAILS.CQVShared.criticalTag;
  var cqvLostPointItems = GAILS.CQVShared.lostPointItems;

  function buildCqvActionPlanHtml(actionPlan) {
    if (!actionPlan || !actionPlan.length) {
      return '<p class="visit-report-note">No action items were flagged on this visit.</p>';
    }
    return actionPlan.map(function (a) {
      var label = a.questionLabel || a.sectionPath || 'Action item';
      var dueDate = a.dueDate;

      // Clean up embedded due date in label if found
      var dueMatch = label.match(/\s*DUE\s*DATE\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/i);
      if (dueMatch) {
        if (!dueDate) dueDate = dueMatch[1];
        label = label.replace(dueMatch[0], '').trim();
      }

      // Clean up sectionPath to get sub-category only
      var cleanSection = a.sectionPath || '';
      if (cleanSection.indexOf('>>') !== -1) {
        cleanSection = cleanSection.split('>>').pop().trim();
      }

      var priorityColor = cqvPriorityColor(a.priority);
      var criticalTag = cqvCriticalTag(label);
      var metaHtml = '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; text-align:right;">' +
        (criticalTag
          ? '<span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding:2px 8px; border-radius:99px; color:#fff; background:#B22A24; white-space:nowrap;">&#9888; ' + escapeHtml(criticalTag) + '</span>'
          : '') +
        (a.priority
          ? '<span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding:2px 8px; border-radius:99px;' +
          (priorityColor ? ' color:' + priorityColor + '; background:' + priorityColor + '26;' : ' color:var(--muted-l); background:rgba(34, 31, 26,0.06);') +
          '">' + escapeHtml(a.priority) + '</span>'
          : '') +
        '<span style="font-size:0.75rem; color:var(--muted-l); white-space:nowrap;">Due ' + escapeHtml(dueDate || '—') + '</span>' +
        '</div>';

      return '<div class="visit-report-row-wrap" style="padding:14px 0; border-bottom:1px solid var(--card-border);' + (criticalTag ? ' border-left:3px solid #B22A24; padding-left:12px;' : '') + '">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">' +
        '<div style="min-width:0; flex:1;">' +
        '<div style="font-weight:700; color:var(--text); font-size:0.9rem;">' + escapeHtml(label) + '</div>' +
        (cleanSection ? '<div style="font-size:0.72rem; color:var(--muted-l); margin-top:2px;">' + escapeHtml(cleanSection) + '</div>' : '') +
        (a.findings ? '<p style="font-size:0.85rem; color:var(--text-2); margin:8px 0 0;">' + escapeHtml(a.findings) + '</p>' : '') +
        (a.actionRequired ? '<div style="font-size:0.85rem; color:var(--text); margin-top:8px; padding:6px 10px; background:var(--accent-light); border-left:3px solid var(--accent); border-radius:4px; line-height:1.4;">' +
          '<strong style="color:var(--accent);">Action required:</strong> ' + escapeHtml(a.actionRequired) + '</div>' : '') +
        '</div>' +
        metaHtml +
        '</div>' +
        '</div>';
    }).join('');
  }

  function buildCqvReportHtml(record) {
    var hasSectionScores = record.sectionScores && Object.keys(record.sectionScores).length > 0;
    var chartHtml = hasSectionScores
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-chart-wrap"><canvas id="' + CQV_CHART_ID + '"></canvas></div></div>'
      : '';

    var pdfHtml = record.pdfUrl
      ? '<div class="visit-report-section-wrapper"><a class="drill-close-btn" style="display:inline-block; text-decoration:none;" href="' + escapeHtml(record.pdfUrl) + '" target="_blank" rel="noopener">&#128196; View Original CQV PDF &#8599;</a></div>'
      : '';

    var criticalFailHtml = cqvHasCriticalFail(record)
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-hs-banner visit-report-hs-banner--alert">' +
      '<strong>&#9888; A Critical Point was lost.</strong>' +
      '</div></div>'
      : '';

    var summaryHtml = record.summary
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section"><h4>Summary</h4><p class="visit-report-comment">' + escapeHtml(record.summary) + '</p></div></div>'
      : '';

    var categoryHtml = record.categoryScores && Object.keys(record.categoryScores).length
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section' + (cqvHasCriticalFail(record) ? ' visit-report-section--danger' : '') + '"><h4>Score by Category</h4>' + buildCqvScoreRowsHtml(record.categoryScores) + '</div></div>'
      : '';

    var sectionHtml = hasSectionScores
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section"><h4>Score by Section</h4>' + buildCqvScoreRowsHtml(record.sectionScores) + '</div></div>'
      : '';

    var actionPlanItems = record.actionPlan;
    var actionPlanIsDerived = false;
    if ((!actionPlanItems || !actionPlanItems.length) && record.isFollowUp) {
      actionPlanItems = cqvLostPointItems(record);
      actionPlanIsDerived = actionPlanItems.length > 0;
    }

    var actionPlanHtml = '<div class="visit-report-section-wrapper"><div class="visit-report-section">' +
      '<h4>Action Plan (' + ((actionPlanItems || []).length) + ')</h4>' +
      (actionPlanIsDerived ? '<p class="visit-report-note" style="margin-bottom:10px;">This follow-up report didn’t include a written action plan — showing the questions that lost points instead.</p>' : '') +
      buildCqvActionPlanHtml(actionPlanItems) +
      '</div></div>';

    return buildCqvHeaderStatsHtml(record) + criticalFailHtml + pdfHtml + summaryHtml + chartHtml + sectionHtml + categoryHtml + actionPlanHtml;
  }

  // ── NBO Coffee Visit ──
  // The PDF prints no score, so the percentage shown here is derived from the
  // Yes/No answers (see js/nbo-shared.js) and is deliberately left uncoloured
  // — there is no RAG band for these visits. The report's real substance is
  // the coaching note printed under each "No", which is why those lead.
  var nboPctText = GAILS.NBOShared.pctText;
  var nboScorable = GAILS.NBOShared.scorable;

  function buildNboHeaderStatsHtml(record) {
    var counts = record.counts || {};
    var scorable = nboScorable(record);
    var cards = [
      { label: 'Score', value: nboPctText(record) },
      { label: 'Visit', value: 'Coffee Visit ' + (record.visitNumber || 1) },
      { label: 'Auditor', value: record.auditorName || '—' },
      { label: 'Met', value: scorable.yes + ' of ' + scorable.total },
      { label: 'To Work On', value: String(counts.no || 0), color: (counts.no ? '#B22A24' : null) }
    ];
    return '<div class="drill-summary">' + cards.map(function (c) {
      var colorStyle = c.color ? ' color:' + c.color + ';' : '';
      return '<div class="drill-card"><div class="drill-card__label">' + escapeHtml(c.label) + '</div>' +
        '<div class="drill-card__value" style="font-size:1.3rem;' + colorStyle + '">' + escapeHtml(c.value) + '</div></div>';
    }).join('') + '</div>';
  }

  function buildNboQuestionRowHtml(q) {
    var isNo = q.response === 'NO';
    var pillColor = isNo ? '#B22A24' : (q.response === 'YES' ? '#1D9E5C' : 'var(--muted-l)');
    return '<div class="visit-report-row-wrap" style="padding:12px 0; border-bottom:1px solid var(--card-border);">' +
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">' +
      '<div style="min-width:0; flex:1;">' +
      '<div style="font-weight:' + (isNo ? '700' : '600') + '; color:var(--text); font-size:0.9rem;">' +
      escapeHtml((q.qNum ? q.qNum + '. ' : '') + (q.label || 'Question')) + '</div>' +
      (q.note
        ? '<p style="font-size:0.85rem; color:var(--text-2); margin:8px 0 0; padding:6px 10px; background:var(--accent-light); border-radius:4px; line-height:1.4;">' +
          escapeHtml(q.note) + '</p>'
        : '') +
      '</div>' +
      '<span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding:2px 8px; border-radius:99px; white-space:nowrap; flex-shrink:0;' +
      ' color:' + pillColor + '; background:' + pillColor + '26;">' + escapeHtml(q.response || '—') + '</span>' +
      '</div></div>';
  }

  function buildNboReportHtml(record) {
    var questions = record.questions || [];

    var pdfHtml = record.pdfUrl
      ? '<div class="visit-report-section-wrapper"><a class="drill-close-btn" style="display:inline-block; text-decoration:none;" href="' + escapeHtml(record.pdfUrl) + '" target="_blank" rel="noopener">&#128196; View Original NBO PDF &#8599;</a></div>'
      : '';

    // Coaching notes are the point of the report, so they're lifted out of the
    // full question list into their own section at the top.
    var coachingItems = questions.filter(function (q) { return q.note; });
    var coachingHtml = coachingItems.length
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section">' +
        '<h4>Coaching Notes (' + coachingItems.length + ')</h4>' +
        coachingItems.map(buildNboQuestionRowHtml).join('') +
        '</div></div>'
      : '';

    // Group the full list by the PDF's own sections (Efficiency, Quality,
    // Safety, Service, Equipment), preserving the order they appear in.
    var sectionOrder = [];
    var bySection = {};
    questions.forEach(function (q) {
      var key = q.section || 'Questions';
      if (!bySection[key]) { bySection[key] = []; sectionOrder.push(key); }
      bySection[key].push(q);
    });

    var sectionsHtml = sectionOrder.map(function (name) {
      var items = bySection[name];
      var noCount = items.filter(function (q) { return q.response === 'NO'; }).length;
      return '<div class="visit-report-section-wrapper"><div class="visit-report-section">' +
        '<h4>' + escapeHtml(name) + (noCount ? ' <span style="color:#B22A24; font-weight:700;">(' + noCount + ' to work on)</span>' : '') + '</h4>' +
        items.map(buildNboQuestionRowHtml).join('') +
        '</div></div>';
    }).join('');

    if (!questions.length) {
      sectionsHtml = '<div class="visit-report-section-wrapper"><p class="visit-report-note">No questions could be read from this PDF — open the original above.</p></div>';
    }

    return buildNboHeaderStatsHtml(record) + pdfHtml + coachingHtml + sectionsHtml;
  }

  function drawCqvScoreChart(record) {
    var G = window.GAILS;
    if (!record.sectionScores || typeof G.makeChart !== 'function') return;
    var names = Object.keys(record.sectionScores);
    if (!names.length) return;
    var earned = names.map(function (n) { return record.sectionScores[n].actual || 0; });
    var max = names.map(function (n) { return record.sectionScores[n].target || 0; });

    G.makeChart(CQV_CHART_ID, {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          { label: 'Points Earned', data: earned, backgroundColor: '#1D9E5C', borderRadius: 6 },
          { label: 'Points Available', data: max, backgroundColor: 'rgba(146, 137, 120,0.25)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(34, 31, 26,0.06)' } }
        },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function bakeryVisitHistory(record) {
    if (!record || !record.bakery) return [];

    var G = window.GAILS;
    var bakeryKey = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(record.bakery) : record.bakery;
    var allVisits = G._allVisitsObj || {};

    return Object.keys(allVisits).map(function (id) {
      return Object.assign({}, allVisits[id], { id: id });
    }).filter(function (visit) {
      if (!visit || !visit.bakery) return false;
      var visitBakeryKey = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(visit.bakery) : visit.bakery;
      return visitBakeryKey === bakeryKey;
    }).sort(function (a, b) {
      var aDateTime = String(a.date || '') + 'T' + String(a.time || '00:00');
      var bDateTime = String(b.date || '') + 'T' + String(b.time || '00:00');
      var dateOrder = aDateTime.localeCompare(bDateTime);
      return dateOrder || String(a.id).localeCompare(String(b.id));
    });
  }

  function visitHistoryNavigation(record, visitId) {
    var history = bakeryVisitHistory(record);
    var currentIndex = history.findIndex(function (visit) { return visit.id === visitId; });

    return {
      previous: currentIndex > 0 ? history[currentIndex - 1] : null,
      next: currentIndex !== -1 && currentIndex < history.length - 1 ? history[currentIndex + 1] : null,
      position: currentIndex === -1 ? 0 : currentIndex + 1,
      total: history.length
    };
  }

  function visitNavigationButtonHtml(direction, target) {
    var isPrevious = direction === 'previous';
    var label = isPrevious ? 'Previous visit' : 'Next visit';
    var title = target
      ? label + ': ' + formatVisitDate(target.date) + (target.time ? ' at ' + target.time : '')
      : 'No ' + direction + ' visit for this bakery';

    return '<button type="button" class="visit-report-nav-btn"' +
      ' onclick="GAILS.openAdjacentVisit(\'' + direction + '\')"' +
      ' aria-label="' + escapeHtml(title) + '"' +
      ' title="' + escapeHtml(title) + '"' +
      (target ? '' : ' disabled') + '>' +
      (isPrevious ? '&#8249;' : '&#8250;') +
      '</button>';
  }

  function renderVisitReportActions(record, visitId) {
    var modal = document.getElementById('visitReportModal');
    var actionsEl = modal && modal.querySelector('.visit-report-header-actions');
    if (!actionsEl) return;

    var navigationHtml = '';
    if (record && visitId) {
      var navigation = visitHistoryNavigation(record, visitId);
      navigationHtml = '<div class="visit-report-history-nav" role="group" aria-label="Bakery visit history">' +
        visitNavigationButtonHtml('previous', navigation.previous) +
        '<span class="visit-report-history-pos" aria-label="Visit ' + navigation.position + ' of ' + navigation.total + '">' +
        navigation.position + ' of ' + navigation.total + '</span>' +
        visitNavigationButtonHtml('next', navigation.next) +
        '</div>';
    }

    actionsEl.innerHTML = navigationHtml +
      '<button type="button" class="drill-close-btn visit-report-print-btn" onclick="window.print()">&#128438; Print</button>' +
      '<button class="drill-close-btn" onclick="GAILS.closeVisitReport()">&#10005; Close</button>';
  }

  window.GAILS.openAdjacentVisit = function (direction) {
    if (direction !== 'previous' && direction !== 'next') return;

    var visitId = window.GAILS._activeVisitReportId;
    var record = visitId && window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    if (!record) return;

    var adjacent = visitHistoryNavigation(record, visitId)[direction];
    if (adjacent) window.GAILS.openVisitReportById(adjacent.id);
  };

  window.GAILS.openVisitReport = function (bakeryName) {
    var record = window.GAILS.getLastVisitRecord ? window.GAILS.getLastVisitRecord(bakeryName) : null;
    if (record && record.id) {
      window.GAILS.openVisitReportById(record.id);
      return;
    }

    var modal = document.getElementById('visitReportModal');
    var titleEl = document.getElementById('visitReportTitle');
    var subtitleEl = document.getElementById('visitReportSubtitle');
    var bodyEl = document.getElementById('visitReportBody');
    if (!modal || !titleEl || !subtitleEl || !bodyEl) return;
    var modalWasOpen = modal.style.display !== 'none';

    titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(bakeryName) : bakeryName;
    subtitleEl.textContent = 'No routine visit has been logged for this bakery yet.';
    bodyEl.innerHTML = '';

    window.GAILS._activeVisitReportId = null;
    renderVisitReportActions(null, null);

    modal.style.display = 'flex';
    bodyEl.scrollTop = 0;
    if (!modalWasOpen) lockBackgroundScroll();
  };

  window.GAILS.closeVisitReport = function () {
    var modal = document.getElementById('visitReportModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    if (window.GAILS.destroyChart) {
      window.GAILS.destroyChart(CHART_ID);
      window.GAILS.destroyChart(CQV_CHART_ID);
    }
    window.GAILS._activeVisitReportId = null;
    if (window.GAILS.closeDeleteConfirmModal) window.GAILS.closeDeleteConfirmModal();
    unlockBackgroundScroll();
  };

  function toggleVisitLogRow(row) {
    row.classList.toggle('expanded');
    row.setAttribute('aria-expanded', row.classList.contains('expanded') ? 'true' : 'false');
  }

  document.addEventListener('click', function (event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-visit-report]') : null;
    if (trigger) {
      window.GAILS.openVisitReport(trigger.getAttribute('data-visit-report'));
      return;
    }

    var logRow = event.target && event.target.closest ? event.target.closest('[data-visit-report-id]') : null;
    if (logRow) {
      // Only the View Report button opens the full report; clicking anywhere
      // else on the row expands/collapses the notes inline.
      if (event.target.closest('.visit-log-row__btn')) {
        window.GAILS.openVisitReportById(logRow.getAttribute('data-visit-report-id'));
        return;
      }
      toggleVisitLogRow(logRow);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') {
      var focused = event.target;
      if (focused && focused.classList && focused.classList.contains('visit-log-row')) {
        event.preventDefault();
        toggleVisitLogRow(focused);
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      var reportModal = document.getElementById('visitReportModal');
      var tagName = event.target && event.target.tagName;
      var isFormField = tagName === 'INPUT' || tagName === 'SELECT' || tagName === 'TEXTAREA';
      if (reportModal && reportModal.style.display !== 'none' && window.GAILS._activeVisitReportId && !isFormField) {
        event.preventDefault();
        window.GAILS.openAdjacentVisit(event.key === 'ArrowLeft' ? 'previous' : 'next');
      }
      return;
    }
    if (event.key !== 'Escape') return;
    window.GAILS.closeVisitReport();
  });

  // NBO Coffee Visit 1 and 2 are NOT site-visit kinds — they arrive as PDF
  // imports (type: 'nbo', see js/nbo-parser.js), not as manually logged
  // check-ins, so they're deliberately absent from this list.
  var SITE_VISIT_KIND_LABELS = {
    checkin: 'Check-in',
    nboOpening: 'NBO: Opening'
  };

  function siteVisitKindLabel(v) {
    return SITE_VISIT_KIND_LABELS[v.visitKind] || 'Check-in';
  }

  function siteVisitKindTagColors(v) {
    return (v.visitKind && v.visitKind !== 'checkin')
      ? { color: 'var(--purple)', bg: 'var(--purple-d)' }
      : { color: 'var(--teal)', bg: 'var(--teal-d)' };
  }

  var nboVisitLabel = GAILS.NBOShared.visitLabel;

  function visitTypeLabel(v) {
    if (v.type === 'siteVisit') return siteVisitKindLabel(v);
    if (v.type === 'cqv') return v.isFollowUp ? 'CQV Follow-Up' : 'CQV';
    if (v.type === 'nbo') return nboVisitLabel(v);
    return 'Routine Coffee Visit';
  }

  // Keys deliberately mirror the #visitLogType <option> values so a summary
  // chip can drive the same dropdown filter directly.
  var VISIT_TYPE_META = [
    { key: 'routine', label: 'Routine Coffee Visit', color: 'var(--gold)', bg: 'var(--gold-d)' },
    { key: 'cqv', label: 'CQV', color: 'var(--accent)', bg: 'var(--accent-light)' },
    { key: 'cqvFollowUp', label: 'CQV Follow-Up', color: 'var(--accent)', bg: 'var(--accent-light)' },
    { key: 'siteVisit', label: 'Check-in', color: 'var(--teal)', bg: 'var(--teal-d)' },
    { key: 'nboOpening', label: 'NBO: Opening', color: 'var(--purple)', bg: 'var(--purple-d)' },
    { key: 'nboVisit1', label: 'NBO: Coffee Visit 1', color: 'var(--purple)', bg: 'var(--purple-d)' },
    { key: 'nboVisit2', label: 'NBO: Coffee Visit 2', color: 'var(--purple)', bg: 'var(--purple-d)' }
  ];

  function visitTypeKey(v) {
    if (v.type === 'cqv') return v.isFollowUp ? 'cqvFollowUp' : 'cqv';
    if (v.type === 'nbo') return 'nboVisit' + (v.visitNumber || 1);
    if (v.type === 'siteVisit') {
      var kind = v.visitKind || 'checkin';
      return kind === 'checkin' ? 'siteVisit' : kind;
    }
    return 'routine';
  }

  // Assembles a visit's notes once for the row preview, the expanded inline
  // view, and the CSV export. Routine visits keep their per-section labels in
  // the expanded HTML; the flat text joins sections for preview/export.
  function buildVisitNotes(v, schema) {
    // An NBO visit has no summary paragraph — its notes ARE the per-question
    // coaching notes, so they're joined here labelled by question.
    if (v.type === 'nbo') {
      var coaching = (v.questions || []).filter(function (q) { return q.note; });
      return {
        text: coaching.map(function (q) { return q.label + ': ' + q.note; }).join(' | '),
        fullHtml: coaching.map(function (q) {
          return '<p class="visit-log-row__note-item">' +
            '<span class="visit-log-row__note-label">' + escapeHtml(q.label) + '</span>' +
            escapeHtml(q.note) + '</p>';
        }).join('')
      };
    }
    if (v.type === 'siteVisit' || v.type === 'cqv') {
      var t = (v.type === 'cqv' ? v.summary : v.comments) || '';
      return {
        text: t,
        fullHtml: t ? '<p class="visit-log-row__note-item">' + escapeHtml(t) + '</p>' : ''
      };
    }
    var text = '';
    var fullHtml = '';
    if (schema && schema.sections) {
      schema.sections.forEach(function (sec) {
        var secData = v[sec.key] || {};
        var comment = secData.comments;
        if (comment && comment.trim()) {
          if (text) text += ' | ';
          text += comment.trim();
          fullHtml += '<p class="visit-log-row__note-item">' +
            '<span class="visit-log-row__note-label">' + escapeHtml(sec.title) + '</span>' +
            escapeHtml(comment.trim()) +
            '</p>';
        }
      });
    }
    return { text: text, fullHtml: fullHtml };
  }

  function daysSince(isoDate) {
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((now - d) / 86400000));
  }

  // Downloads whatever the last render put in _visitLogExport — i.e. exactly
  // the rows the active filters produced, not just the ones rendered so far.
  function exportVisitLogCsv() {
    var data = window.GAILS._visitLogExport;
    if (!data || !data.rows || data.rows.length < 2) return;
    var csv = data.rows.map(function (row) {
      return row.map(function (cell) {
        var s = cell == null ? '' : String(cell);
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    // BOM so Excel opens it as UTF-8
    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = data.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  // Drives the "Group By" filter — Ops Area (default), Region, or Visit
  // Type all group the same underlying visit list, just bucketed differently.
  function getVisitGroupKey(v, groupVal) {
    var G = window.GAILS;
    if (groupVal === 'region') {
      return (G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : '') || 'Unknown';
    }
    if (groupVal === 'type') {
      return visitTypeLabel(v);
    }
    if (groupVal === 'none') {
      return 'All Visits';
    }
    return (G.getBakeryOps ? G.getBakeryOps(v.bakery) : '') || 'Unknown';
  }

  // GAIL's reporting year starts in March: Q1 Mar-May, Q2 Jun-Aug,
  // Q3 Sep-Nov, and Q4 Dec-Feb.
  function getGailsQuarterStart(referenceDate) {
    var month = referenceDate.getMonth();
    var reportingYear = month >= 2 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
    var monthsSinceMarch = (month - 2 + 12) % 12;
    var quarterIndex = Math.floor(monthsSinceMarch / 3);
    return new Date(reportingYear, 2 + (quarterIndex * 3), 1);
  }

  function isDateWithinMonths(dateStr, n) {
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    var now = new Date();

    if (n === 'currentMonth') {
      var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      now.setHours(23, 59, 59, 999);
      return d >= currentMonthStart && d <= now;
    }

    if (n === 'thisQuarter') {
      var currentQuarterStart = getGailsQuarterStart(now);
      now.setHours(23, 59, 59, 999);
      return d >= currentQuarterStart && d <= now;
    }

    if (n === 'lastQuarter') {
      var currentQuarterStart = getGailsQuarterStart(now);
      var previousQuarterStart = new Date(currentQuarterStart.getFullYear(), currentQuarterStart.getMonth() - 3, 1);
      return d >= previousQuarterStart && d < currentQuarterStart;
    }

    if (n === 'thisYear') {
      return d.getFullYear() === now.getFullYear();
    }

    // The previous calendar year always uses its exact Jan 1 - Dec 31 range.
    if (n === 'lastYear') {
      return d.getFullYear() === now.getFullYear() - 1;
    }

    var num = parseInt(n, 10);
    if (isNaN(num) || num === 0) return true;

    // "Last Month" is the complete previous calendar month. Larger numeric
    // periods include the current month-to-date: when today is in July,
    // "Last 2 Months" starts June 1 and "Last 3 Months" starts May 1.
    var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (num === 1) {
      var previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d >= previousMonthStart && d < currentMonthStart;
    }

    var periodStart = new Date(now.getFullYear(), now.getMonth() - (num - 1), 1);
    now.setHours(23, 59, 59, 999);
    return d >= periodStart && d <= now;
  }

  // The Rating filter (Green/Yellow/Red) only makes sense once the results
  // are scoped to CQVs, so it stays hidden — and its value is cleared, so a
  // leftover selection can't silently keep filtering after switching back to
  // another visit type — until "CQV" or "CQV Follow-Up" is selected.
  function syncCqvRatingVisibility() {
    var typeEl = document.getElementById('visitLogType');
    var ratingControl = document.getElementById('visitLogRatingControl');
    var ratingEl = document.getElementById('visitLogRating');
    if (!typeEl || !ratingControl) return;
    var isCqvType = typeEl.value === 'cqv' || typeEl.value === 'cqvFollowUp';
    ratingControl.style.display = isCqvType ? '' : 'none';
    if (!isCqvType && ratingEl && ratingEl.value) {
      ratingEl.value = '';
      if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect('visitLogRating');
    }
  }

  function syncVisitLogViewControls(view) {
    var isHistoryView = view === 'history';
    var isFollowUps = view === 'followups';
    var searchEl = document.getElementById('visitLogSearch');
    var typeEl = document.getElementById('visitLogType');
    var groupEl = document.getElementById('visitLogGroup');
    var sortEl = document.getElementById('visitLogSort');
    var periodEl = document.getElementById('visitLogPeriod');
    var typeControl = typeEl ? typeEl.closest('.visit-log-filter-control') : null;
    var sortControl = sortEl ? sortEl.closest('.visit-log-filter-control') : null;
    var groupControl = groupEl ? groupEl.closest('.visit-log-filter-control') : null;
    var periodControl = periodEl ? periodEl.closest('.visit-log-filter-control') : null;
    var ratingControl = document.getElementById('visitLogRatingControl');
    var statusToggle = document.getElementById('followUpStatusToggle');
    var typeGroupOption = groupEl ? groupEl.querySelector('option[value="type"]') : null;

    if (searchEl) {
      searchEl.placeholder = isHistoryView
        ? 'Search bakery or partner...'
        : (isFollowUps ? 'Search bakery or action...' : 'Search bakery...');
    }
    if (typeControl) typeControl.style.display = isHistoryView ? '' : 'none';
    if (sortControl) sortControl.style.display = isHistoryView ? '' : 'none';
    // Follow-ups always group by bakery and ignore the reporting period, so
    // those two controls are hidden there but remain for the other views.
    if (groupControl) groupControl.style.display = isFollowUps ? 'none' : '';
    if (periodControl) periodControl.style.display = isFollowUps ? 'none' : '';
    if (statusToggle) statusToggle.style.display = isFollowUps ? 'flex' : 'none';

    syncCqvRatingVisibility();
    if (!isHistoryView && ratingControl) ratingControl.style.display = 'none';

    // Unvisited sites have no visit type of their own. Region, Ops Area, and
    // ungrouped views remain meaningful, but grouping them by visit type does
    // not, so fall back to Ops Area if that history-only option was active.
    if (!isHistoryView && groupEl && groupEl.value === 'type') {
      groupEl.value = 'ops';
      if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect(groupEl);
    }
    if (!isHistoryView && typeGroupOption) {
      typeGroupOption.remove();
    } else if (isHistoryView && groupEl && !typeGroupOption) {
      var restoredTypeOption = document.createElement('option');
      restoredTypeOption.value = 'type';
      restoredTypeOption.textContent = 'Visit Type';
      var noneOption = groupEl.querySelector('option[value="none"]');
      groupEl.insertBefore(restoredTypeOption, noneOption || null);
    }
  }

  // Role permission for logging visits (set by js/auth.js after sign-in).
  // Defaults to allowed when permissions haven't loaded so the built-in
  // roles keep their historical behaviour.
  function canLogVisits() {
    var perms = window.GAILS && window.GAILS.permissions;
    return !(perms && perms.actions && perms.actions.logVisits === false);
  }

  // ========== FOLLOW-UP ACTIONS (shared helpers) ==========
  // Site-scoped tasks live in Firebase at followUpActions/{id} and are synced
  // into window.GAILS._followUpActionsObj by js/auth.js.
  function getFollowUpList() {
    var obj = window.GAILS._followUpActionsObj || {};
    return Object.keys(obj).map(function (id) { return Object.assign({ id: id }, obj[id]); });
  }

  function getOpenFollowUpsForBakery(bakery) {
    if (!bakery) return [];
    return getFollowUpList().filter(function (t) {
      return t.bakery === bakery && (t.status || 'open') !== 'done';
    }).sort(followUpSortByDue);
  }

  function todayMidnight() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // Presentation metadata for a due date: state drives the pill colour, label
  // is the human text, days is negative when overdue.
  function dueMeta(iso) {
    if (!iso) return { state: 'none', label: 'No deadline', days: null };
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return { state: 'none', label: 'No deadline', days: null };
    var days = Math.round((d - todayMidnight()) / 86400000);
    if (days < 0) return { state: 'overdue', label: Math.abs(days) + ' day' + (Math.abs(days) === 1 ? '' : 's') + ' overdue', days: days };
    if (days === 0) return { state: 'today', label: 'Due today', days: 0 };
    if (days <= 7) return { state: 'soon', label: 'Due in ' + days + ' day' + (days === 1 ? '' : 's'), days: days };
    return { state: 'future', label: 'Due ' + formatVisitDate(iso), days: days };
  }

  // Unprioritised tasks sort last among ties. 'none' is also what tasks
  // created before priority existed fall back to, which is more honest than
  // inventing a level for them.
  var PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
  var PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };

  function normalizePriority(value) {
    var v = String(value || '').toLowerCase();
    return PRIORITY_ORDER[v] !== undefined ? v : 'none';
  }

  // Renders nothing for unprioritised tasks — a "NONE" tag on every legacy row
  // would be noise and would bury the levels that actually mean something.
  function priorityTagHtml(task) {
    var p = normalizePriority(task.priority);
    if (p === 'none') return '';
    return '<span class="follow-up-priority follow-up-priority--' + p + '">' + PRIORITY_LABELS[p] + '</span>';
  }

  // Dated tasks first (earliest deadline first), then undated — a deadline is
  // more actionable than a priority label, so it leads; an overdue Low still
  // outranks a High due next month. Priority breaks ties, which is what orders
  // the undated tasks among themselves.
  function followUpSortByDue(a, b) {
    var da = a.dueDate || '';
    var db = b.dueDate || '';
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)];
  }

  function followUpBuilderRowHtml() {
    return '<div class="follow-up-builder__row">' +
      '<input type="text" class="visit-log-input follow-up-builder__title" placeholder="Follow-up action...">' +
      '<button type="button" class="follow-up-builder__remove" title="Remove" aria-label="Remove this follow-up">&#10005;</button>' +
      '<div class="follow-up-builder__meta">' +
      '<select class="visit-log-select follow-up-builder__priority" aria-label="Priority">' +
      '<option value="none" selected>No priority</option>' +
      '<option value="low">Low</option>' +
      '<option value="medium">Medium</option>' +
      '<option value="high">High</option>' +
      '</select>' +
      '<input type="date" class="visit-log-input follow-up-builder__date" title="Deadline (optional)" aria-label="Deadline (optional)">' +
      '</div>' +
      '</div>';
  }

  // Rows are built as markup, so each new priority <select> has to be wrapped
  // into the site-wide custom dropdown by hand (js/custom-selects.js only
  // auto-enhances what exists at load).
  function enhanceBuilderRow(row) {
    if (!row) return;
    var priority = row.querySelector('.follow-up-builder__priority');
    if (priority && window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect(priority);
  }

  function appendFollowUpBuilderRow(rows) {
    if (!rows) return null;
    rows.insertAdjacentHTML('beforeend', followUpBuilderRowHtml());
    var row = rows.lastElementChild;
    enhanceBuilderRow(row);
    return row;
  }

  function resetFollowUpBuilder() {
    var rows = document.getElementById('addVisitNewTasks');
    if (!rows) return;
    rows.innerHTML = '';
    appendFollowUpBuilderRow(rows);
  }

  function collectNewFollowUps() {
    var rows = document.getElementById('addVisitNewTasks');
    if (!rows) return [];
    return Array.prototype.map.call(rows.querySelectorAll('.follow-up-builder__row'), function (row) {
      var title = row.querySelector('.follow-up-builder__title');
      var date = row.querySelector('.follow-up-builder__date');
      var priority = row.querySelector('.follow-up-builder__priority');
      return {
        title: title ? title.value.trim() : '',
        dueDate: date && date.value ? date.value : null,
        priority: normalizePriority(priority && priority.value)
      };
    }).filter(function (t) { return t.title; });
  }

  // Renders the "tick off open follow-ups" checklist in the Log Visit modal for
  // the currently selected bakery. Hidden entirely when the site has none open.
  function renderCheckInOpenTasks(bakery) {
    var wrap = document.getElementById('addVisitOpenTasks');
    var list = document.getElementById('addVisitOpenTasksList');
    var empty = document.getElementById('addVisitNoOpenTasks');
    if (!wrap || !list) return;
    var tasks = getOpenFollowUpsForBakery(bakery);
    if (!tasks.length) {
      wrap.hidden = true;
      list.innerHTML = '';
      if (empty) {
        empty.textContent = bakery
          ? 'No open follow-ups for this site.'
          : 'Select a bakery to see its open follow-ups.';
        empty.hidden = false;
      }
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = tasks.map(function (t) {
      var m = dueMeta(t.dueDate);
      return '<label class="follow-up-check">' +
        '<input type="checkbox" class="follow-up-check__box" data-task-id="' + escapeHtml(t.id) + '">' +
        '<span class="follow-up-check__body">' +
        '<span class="follow-up-check__title">' + escapeHtml(t.title || 'Untitled task') + '</span>' +
        priorityTagHtml(t) +
        (t.dueDate ? '<span class="follow-up-pill follow-up-pill--' + m.state + '">' + escapeHtml(m.label) + '</span>' : '') +
        '</span></label>';
    }).join('');
    wrap.hidden = false;
  }

  window.GAILS.openAddSiteVisitModal = function (presetBakery) {
    if (!canLogVisits()) return;
    var modal = document.getElementById('addSiteVisitModal');
    var select = document.getElementById('addVisitBakery');
    if (!modal || !select) return;

    // Populate bakery list if it only has placeholder
    if (select.options.length <= 1 && window.GAILS.state && window.GAILS.state.BAKERIES) {
      window.GAILS.state.BAKERIES.slice().sort().forEach(function (bName) {
        var opt = document.createElement('option');
        opt.value = bName;
        opt.textContent = bName;
        select.appendChild(opt);
      });
      // Theme it!
      if (window.GAILS.initCustomSelects) {
        window.GAILS.initCustomSelects(modal);
      }
    }

    // Reset form
    var form = document.getElementById('addSiteVisitForm');
    if (form) form.reset();

    // Pre-select the bakery when launched from an unvisited-site card
    if (presetBakery) {
      var hasOption = Array.prototype.some.call(select.options, function (o) { return o.value === presetBakery; });
      if (hasOption) select.value = presetBakery;
    }

    // Reset custom select trigger label if populated
    if (window.GAILS.syncCustomSelect) {
      window.GAILS.syncCustomSelect('addVisitBakery');
      window.GAILS.syncCustomSelect('addVisitType');
    }

    // Autofill date/time with local values
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    document.getElementById('addVisitDate').value = yyyy + '-' + mm + '-' + dd;

    var hh = String(now.getHours()).padStart(2, '0');
    var min = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('addVisitTime').value = hh + ':' + min;

    var errorEl = document.getElementById('addVisitError');
    if (errorEl) errorEl.style.display = 'none';

    // Reset the "add follow-up" builder to a single empty row, and show the
    // open-tasks checklist for the (possibly pre-selected) bakery.
    resetFollowUpBuilder();
    renderCheckInOpenTasks(select.value);

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeAddSiteVisitModal = function () {
    var modal = document.getElementById('addSiteVisitModal');
    if (!modal) return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  // Standalone add/edit follow-up modal (opened from the Follow-ups view).
  // Pass an existing task to edit it; otherwise a new task is created.
  window.GAILS.openFollowUpModal = function (presetBakery, editTask) {
    if (!canLogVisits()) return;
    var modal = document.getElementById('addFollowUpModal');
    var select = document.getElementById('followUpBakery');
    var form = document.getElementById('addFollowUpForm');
    if (!modal || !select || !form) return;

    // Populate bakery list once (mirrors openAddSiteVisitModal).
    if (select.options.length <= 1 && window.GAILS.state && window.GAILS.state.BAKERIES) {
      window.GAILS.state.BAKERIES.slice().sort().forEach(function (bName) {
        var opt = document.createElement('option');
        opt.value = bName;
        opt.textContent = bName;
        select.appendChild(opt);
      });
      if (window.GAILS.initCustomSelects) window.GAILS.initCustomSelects(modal);
    }

    form.reset();
    var titleEl = document.getElementById('addFollowUpTitle');
    var submitBtn = document.getElementById('followUpSubmitBtn');
    document.getElementById('followUpEditId').value = editTask ? editTask.id : '';
    if (titleEl) titleEl.textContent = editTask ? 'Edit follow-up' : 'Add follow-up';
    if (submitBtn) submitBtn.textContent = editTask ? 'Save changes' : 'Save follow-up';

    var bakeryVal = editTask ? editTask.bakery : (presetBakery || '');
    if (bakeryVal) {
      var hasOption = Array.prototype.some.call(select.options, function (o) { return o.value === bakeryVal; });
      if (hasOption) select.value = bakeryVal;
    }
    document.getElementById('followUpTitle').value = editTask ? (editTask.title || '') : '';
    document.getElementById('followUpDueDate').value = editTask && editTask.dueDate ? editTask.dueDate : '';
    document.getElementById('followUpDetail').value = editTask ? (editTask.detail || '') : '';
    document.getElementById('followUpPriority').value = normalizePriority(editTask && editTask.priority);

    if (window.GAILS.syncCustomSelect) {
      window.GAILS.syncCustomSelect('followUpBakery');
      window.GAILS.syncCustomSelect('followUpPriority');
    }

    var errorEl = document.getElementById('followUpError');
    if (errorEl) errorEl.style.display = 'none';

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeFollowUpModal = function () {
    var modal = document.getElementById('addFollowUpModal');
    if (!modal) return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  window.GAILS.openVisitReportById = function (visitId) {
    var record = window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    var modal = document.getElementById('visitReportModal');
    var titleEl = document.getElementById('visitReportTitle');
    var subtitleEl = document.getElementById('visitReportSubtitle');
    var bodyEl = document.getElementById('visitReportBody');
    if (!modal || !titleEl || !subtitleEl || !bodyEl) return;
    var modalWasOpen = modal.style.display !== 'none';

    if (!record) {
      window.GAILS._activeVisitReportId = null;
      titleEl.textContent = 'Error';
      subtitleEl.textContent = 'Visit record not found.';
      bodyEl.innerHTML = '';
      renderVisitReportActions(null, null);
      modal.style.display = 'flex';
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      return;
    }

    if (window.GAILS.destroyChart) {
      window.GAILS.destroyChart(CHART_ID);
      window.GAILS.destroyChart(CQV_CHART_ID);
    }
    window.GAILS._activeVisitReportId = visitId;
    renderVisitReportActions(record, visitId);

    if (record.type === 'cqv') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = 'Coffee Quality Visit on ' + formatVisitDate(record.date) + (record.title ? ' — ' + record.title : '');
      bodyEl.innerHTML = buildCqvReportHtml(record);

      modal.style.display = 'flex';
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      requestAnimationFrame(function () { drawCqvScoreChart(record); });
      return;
    }

    if (record.type === 'nbo') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = 'NBO Coffee Visit ' + (record.visitNumber || 1) + ' on ' + formatVisitDate(record.date)
        + (record.auditorName ? ' — ' + record.auditorName : '');
      bodyEl.innerHTML = buildNboReportHtml(record);

      modal.style.display = 'flex';
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      return;
    }

    if (record.type === 'siteVisit') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = siteVisitKindLabel(record) + ' on ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');

      var stats = [
        { label: 'Logged By', value: record.meta && record.meta.updatedBy || '—' },
        { label: 'Coffee Partner', value: record.coffeePartner || '—' },
        { label: 'Barista', value: record.mod || '—' }
      ];

      var statsHtml = '<div class="drill-summary" style="margin-bottom:20px;">' + stats.map(function (c) {
        return '<div class="drill-card">' +
          '<div class="drill-card__label">' + escapeHtml(c.label) + '</div>' +
          '<div class="drill-card__value" style="font-size:1.05rem;">' + escapeHtml(c.value) + '</div></div>';
      }).join('') + '</div>';

      bodyEl.innerHTML = statsHtml +
        '<div class="visit-report-section-wrapper">' +
        '<div class="visit-report-section" style="margin-top:20px; background:rgba(34, 31, 26,0.01); border:1px solid var(--card-border); border-radius:12px; padding:20px;">' +
        '<h4 style="margin-top:0; margin-bottom:10px; font-size:0.95rem; font-weight:700; color:var(--accent);">Visit Comments</h4>' +
        '<p class="visit-report-comment" style="font-size:1rem; line-height:1.6; color:var(--text-2); white-space:pre-wrap; margin:0;">' + escapeHtml(record.comments || 'No comments recorded.') + '</p>' +
        '</div>' +
        '</div>';

      modal.style.display = 'flex';
      bodyEl.scrollTop = 0;
      if (!modalWasOpen) lockBackgroundScroll();
      return;
    }

    titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
    subtitleEl.textContent = 'Visited ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');
    bodyEl.innerHTML = buildReportHtml(record);

    modal.style.display = 'flex';
    bodyEl.scrollTop = 0;
    if (!modalWasOpen) lockBackgroundScroll();
    requestAnimationFrame(function () { drawScoreChart(record); });
  };

  window.GAILS.deleteVisit = function (visitId) {
    var record = window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    var bakeryName = record ? (window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery) : 'this';
    var dateText = record ? formatVisitDate(record.date) : '';

    var modal = document.getElementById('deleteConfirmModal');
    var promptText = document.getElementById('deleteConfirmPromptText');
    var input = document.getElementById('deleteConfirmInput');
    var submitBtn = document.getElementById('deleteConfirmSubmitBtn');

    if (!modal || !promptText || !input || !submitBtn) return;

    promptText.textContent = 'Are you sure you want to permanently delete the check-in for ' + bakeryName + (dateText ? ' on ' + dateText : '') + '?';
    input.value = '';
    submitBtn.disabled = true;

    modal.style.display = 'flex';
    lockBackgroundScroll();

    input.oninput = function () {
      submitBtn.disabled = input.value.trim().toLowerCase() !== 'delete record';
    };

    submitBtn.onclick = async function () {
      if (input.value.trim().toLowerCase() !== 'delete record') return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Deleting...';

      var deleteBtn = document.querySelector('.visit-report-delete-btn');
      if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
      }

      try {
        if (!window.GAILS_Firebase || typeof window.GAILS_Firebase.deleteSiteVisit !== 'function') {
          throw new Error('Database helper not loaded yet. Please try again.');
        }
        await window.GAILS_Firebase.deleteSiteVisit(visitId);
        window.GAILS.closeDeleteConfirmModal();
        window.GAILS.closeVisitReport();
      } catch (err) {
        console.error(err);
        alert(err.message || 'Failed to delete check-in.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Delete';
        if (deleteBtn) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = 'Delete';
        }
      }
    };
  };

  window.GAILS.closeDeleteConfirmModal = function () {
    var modal = document.getElementById('deleteConfirmModal');
    if (modal) {
      modal.style.display = 'none';
      var reportModal = document.getElementById('visitReportModal');
      if (!reportModal || reportModal.style.display === 'none') {
        unlockBackgroundScroll();
      }
    }
  };

  function populateDropdown(selectId, itemsSet, placeholder) {
    var select = document.getElementById(selectId);
    if (!select) return;
    var currentVal = select.value;
    select.innerHTML = '<option value="">' + placeholder + '</option>';
    var sorted = Array.from(itemsSet).sort();
    sorted.forEach(function (item) {
      var opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
    if (itemsSet.has(currentVal)) {
      select.value = currentVal;
    }
  }

  function getPeriodLabel(val) {
    var periodLabels = {
      '0': 'All Time',
      'currentMonth': 'This Month',
      'thisQuarter': 'This Quarter',
      '1': 'Last Month',
      'lastQuarter': 'Last Quarter',
      '2': 'Last 2 Months',
      '3': 'Last 3 Months',
      '6': 'Last 6 Months',
      '12': 'Last 12 Months',
      'thisYear': 'This Year',
      'lastYear': 'Last Year'
    };
    if (val === 'lastYear') {
      return 'Last Year (' + ((new Date()).getFullYear() - 1) + ')';
    }
    return periodLabels[val] || (val + ' Months');
  }

  function getVisitLogDefaultPeriod() {
    return 'thisQuarter';
  }

  window.GAILS.getVisitLogHeaderSummary = function () {
    var G = window.GAILS;
    var searchEl = document.getElementById('visitLogSearch');
    var regionEl = document.getElementById('visitLogRegion');
    var opsEl = document.getElementById('visitLogOps');
    var typeEl = document.getElementById('visitLogType');
    var ratingEl = document.getElementById('visitLogRating');
    var groupEl = document.getElementById('visitLogGroup');
    var sortEl = document.getElementById('visitLogSort');
    var periodEl = document.getElementById('visitLogPeriod');

    var searchVal = searchEl ? searchEl.value.trim() : '';
    var regionVal = regionEl ? regionEl.value : '';
    var opsVal = opsEl ? opsEl.value : '';
    var typeVal = typeEl ? typeEl.value : '';
    var ratingVal = ratingEl ? ratingEl.value : '';
    var groupVal = groupEl ? groupEl.value : 'ops';
    var sortVal = sortEl ? sortEl.value : 'date';
    var view = window.GAILS._activeVisitLogView || 'history';
    var periodVal = periodEl ? periodEl.value : getVisitLogDefaultPeriod(view);

    var pills = [];

    if (view === 'followups') {
      var statusLabels = { 'open': 'Open', 'overdue': 'Overdue', 'done': 'Done', 'all': 'All' };
      var followStatus = window.GAILS._followUpStatusFilter || 'open';
      pills.push('<span class="header-pill-core">Follow-up Tasks · ' + escapeHtml(statusLabels[followStatus] || 'Open') + '</span>');
      if (searchVal) pills.push('<span class="header-pill-filter">Search: "' + escapeHtml(searchVal) + '"</span>');
      if (regionVal) pills.push('<span class="header-pill-filter">' + escapeHtml(regionVal) + '</span>');
      if (opsVal) pills.push('<span class="header-pill-filter">' + escapeHtml(opsVal) + '</span>');
      var fuTitle = (window.innerWidth <= 980) ? 'Reports' : 'Bakery Reports';
      return fuTitle + '<span style="margin-left:8px;">' + pills.join('') + '</span>';
    }

    if (view === 'unvisited') {
      var periodText = getPeriodLabel(periodVal);
      var unvisitedGroupLabels = {
        'ops': 'Grouped by Ops Area',
        'region': 'Grouped by Region',
        'none': 'Ungrouped'
      };
      pills.push('<span class="header-pill-core">Unvisited in ' + escapeHtml(periodText) + ' \u00b7 ' +
        escapeHtml(unvisitedGroupLabels[groupVal] || 'Grouped by Ops Area') + '</span>');

      if (searchVal) pills.push('<span class="header-pill-filter">Search: "' + escapeHtml(searchVal) + '"</span>');
      if (regionVal) pills.push('<span class="header-pill-filter">' + escapeHtml(regionVal) + '</span>');
      if (opsVal) pills.push('<span class="header-pill-filter">' + escapeHtml(opsVal) + '</span>');

      var title = (window.innerWidth <= 980) ? 'Reports' : 'Bakery Reports';
      return title +
        '<span style="margin-left:8px;">' +
        pills.join('') +
        '</span>';
    }

    var periodText = getPeriodLabel(periodVal);
    var groupLabels = {
      'ops': 'Grouped by Ops Area',
      'region': 'Grouped by Region',
      'type': 'Grouped by Type',
      'none': 'Ungrouped'
    };
    var sortLabels = {
      'date': 'Sorted by Date',
      'nameAsc': 'Sorted A-Z',
      'nameDesc': 'Sorted Z-A',
      'type': 'Sorted by Type'
    };

    var coreConfigText = periodText + ' · ' + (groupLabels[groupVal] || 'Grouped') + ' · ' + (sortLabels[sortVal] || 'Sorted');
    pills.push('<span class="header-pill-core">' + escapeHtml(coreConfigText) + '</span>');

    if (searchVal) {
      pills.push('<span class="header-pill-filter">Search: "' + escapeHtml(searchVal) + '"</span>');
    }
    if (regionVal) {
      pills.push('<span class="header-pill-filter">' + escapeHtml(regionVal) + '</span>');
    }
    if (opsVal) {
      pills.push('<span class="header-pill-filter">' + escapeHtml(opsVal) + '</span>');
    }
    if (typeVal) {
      var typeLabels = {
        'routine': 'Routine Coffee Visit',
        'siteVisit': 'Check-in',
        'nboOpening': 'NBO: Opening',
        'nboVisit1': 'NBO: Coffee Visit 1',
        'nboVisit2': 'NBO: Coffee Visit 2',
        'cqv': 'CQV',
        'cqvFollowUp': 'CQV Follow-Up'
      };
      var tLabel = typeLabels[typeVal] || typeVal;
      if (ratingVal && (typeVal === 'cqv' || typeVal === 'cqvFollowUp')) {
        tLabel += ' (' + ratingVal + ')';
      }
      pills.push('<span class="header-pill-filter">' + escapeHtml(tLabel) + '</span>');
    }

    var title = (window.innerWidth <= 980) ? 'Reports' : 'Bakery Reports';
    return title +
      '<span style="margin-left:8px;">' +
      pills.join('') +
      '</span>';
  };

  // Regions come straight from BAKERY_META (North Region / South Region /
  // London Region) rather than being inferred from whatever visits happen
  // to be loaded, so the list is always complete and correct.
  function getVisitLogRegions() {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    return [...new Set(Object.values(meta).map(function (v) { return v.r; }))].filter(function (r) { return r && r !== 'Other'; }).sort();
  }

  // Scoped to regionVal so the Ops Area dropdown only ever lists areas
  // that actually operate in the selected region.
  function getVisitLogOps(regionVal) {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    return [...new Set(Object.values(meta)
      .filter(function (v) { return !regionVal || v.r === regionVal; })
      .map(function (v) { return v.o; })
    )].filter(Boolean).sort();
  }

  function populateVisitLogFilterOptions() {
    var regionEl = document.getElementById('visitLogRegion');
    var regionVal = regionEl ? regionEl.value : '';
    populateDropdown('visitLogRegion', new Set(getVisitLogRegions()), 'All Regions');
    populateDropdown('visitLogOps', new Set(getVisitLogOps(regionVal)), 'All Areas');
    if (window.GAILS.syncCustomSelect) {
      window.GAILS.syncCustomSelect('visitLogRegion');
      window.GAILS.syncCustomSelect('visitLogOps');
    }
  }

  function getVisitLogActiveFilterCount() {
    var regionEl = document.getElementById('visitLogRegion');
    var opsEl = document.getElementById('visitLogOps');
    var typeEl = document.getElementById('visitLogType');
    var ratingEl = document.getElementById('visitLogRating');
    var groupEl = document.getElementById('visitLogGroup');
    var sortEl = document.getElementById('visitLogSort');
    var periodEl = document.getElementById('visitLogPeriod');
    var isHistoryView = (window.GAILS._activeVisitLogView || 'history') === 'history';
    var defaultPeriod = getVisitLogDefaultPeriod();
    var count = 0;

    if (regionEl && regionEl.value) count++;
    if (opsEl && opsEl.value) count++;
    if (isHistoryView && typeEl && typeEl.value) count++;
    if (isHistoryView && ratingEl && ratingEl.value && typeEl && (typeEl.value === 'cqv' || typeEl.value === 'cqvFollowUp')) count++;
    if (groupEl && groupEl.value && groupEl.value !== 'ops') count++;
    if (isHistoryView && sortEl && sortEl.value && sortEl.value !== 'date') count++;
    if (periodEl && periodEl.value && periodEl.value !== defaultPeriod) count++;
    return count;
  }

  function syncVisitLogMobileFilterButton() {
    var btn = document.getElementById('visitLogMobileFilterBtn');
    var badge = document.getElementById('visitLogFilterBadge');
    var count = getVisitLogActiveFilterCount();

    // Desktop reset icon: plain funnel at rest, funnel-with-X once a
    // filter is active (search counts too, unlike the mobile badge, since
    // Reset clears it as well).
    var resetBtn = document.getElementById('visitLogResetBtn');
    if (resetBtn) {
      var searchEl = document.getElementById('visitLogSearch');
      var hasSearch = !!(searchEl && searchEl.value.trim());
      resetBtn.classList.toggle('has-active-filters', hasSearch || count > 0);
    }

    if (!btn || !badge) return;
    btn.classList.toggle('has-active-filters', count > 0);
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = count;
    } else {
      badge.hidden = true;
      badge.textContent = '';
    }
  }

  function setVisitLogFiltersOpen(open) {
    var btn = document.getElementById('visitLogMobileFilterBtn');
    var panel = document.getElementById('visitLogFilterPanel');
    var backdrop = document.getElementById('visitLogFilterBackdrop');
    if (!panel || !backdrop) return;

    panel.classList.remove('is-dragging');
    panel.style.transform = '';

    if (open) {
      panel.classList.add('is-open');
      backdrop.classList.add('is-open');
      backdrop.hidden = false;
      backdrop.removeAttribute('aria-hidden');
      if (btn) {
        btn.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      }
      document.body.style.overflow = 'hidden';
      document.body.classList.add('visit-log-filter-open');
      return;
    }

    panel.querySelectorAll('.filter-select.is-open').forEach(function (wrapper) {
      wrapper.classList.remove('is-open');
      var trigger = wrapper.querySelector('.filter-select__trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
    panel.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    if (btn) {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
    document.body.style.overflow = '';
    document.body.classList.remove('visit-log-filter-open');
    setTimeout(function () {
      if (!backdrop.classList.contains('is-open')) backdrop.hidden = true;
    }, 180);
  }

  var VISIT_LOG_FILTER_STORAGE_KEY = 'gails.visitLogFilters';

  // Rows rendered per page of the history list; "Show more" adds another
  // chunk. Keeps the innerHTML rebuild cheap when "All Time" is selected.
  var VISIT_LOG_RENDER_CHUNK = 150;

  function saveVisitLogFilters(state) {
    try { localStorage.setItem(VISIT_LOG_FILTER_STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }

  function setSelectValueIfPresent(el, val) {
    if (!el || typeof val !== 'string' || !val) return;
    var has = Array.prototype.some.call(el.options, function (o) { return o.value === val; });
    if (has) el.value = val;
  }

  // Restores the last-used filters (saved on every render) so the page opens
  // in the state the user last worked in. Visit type is deliberately not
  // restored: summary chips are temporary result filters and must all start
  // unselected in a new page session. Rating depends on visit type, so it also
  // starts clear. Runs once, right after the filter dropdowns are populated
  // and before the first filtered render reads them.
  function restoreVisitLogFilters() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(VISIT_LOG_FILTER_STORAGE_KEY) || 'null'); } catch (e) { /* corrupt/unavailable */ }
    if (!saved || typeof saved !== 'object') return;

    var searchEl = document.getElementById('visitLogSearch');
    var regionEl = document.getElementById('visitLogRegion');

    if (searchEl && typeof saved.search === 'string') searchEl.value = saved.search;
    setSelectValueIfPresent(regionEl, saved.region);
    // Ops options depend on the selected region, so rebuild them first
    if (regionEl && regionEl.value) {
      populateDropdown('visitLogOps', new Set(getVisitLogOps(regionEl.value)), 'All Areas');
    }
    setSelectValueIfPresent(document.getElementById('visitLogOps'), saved.ops);
    setSelectValueIfPresent(document.getElementById('visitLogGroup'), saved.group);
    setSelectValueIfPresent(document.getElementById('visitLogSort'), saved.sort);
    setSelectValueIfPresent(document.getElementById('visitLogPeriod'), saved.period);
    syncCqvRatingVisibility();

    if (saved.view === 'unvisited' || saved.view === 'history' || saved.view === 'followups') {
      window.GAILS._activeVisitLogView = saved.view;
      document.querySelectorAll('#visitLogViewToggle .visit-log-toggle-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.view === saved.view);
      });
    }

    if (typeof saved.followUpStatus === 'string' && saved.followUpStatus) {
      window.GAILS._followUpStatusFilter = saved.followUpStatus;
      document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.status === saved.followUpStatus);
      });
    }
  }

  // At-a-glance bar above the list: how many visits the filters produced and
  // how many of each type. The total mirrors the rendered list; chip counts
  // come from the list BEFORE the type/rating filter so every type stays
  // visible while one is selected — the active chip highlights, the rest dim
  // but remain one-click switches (clicking the active chip clears it).
  function visitLogGroupToggleHtml(showGroupToggle) {
    if (!showGroupToggle) return '';
    return '<button type="button" class="visit-log-summary__expand-all" title="Collapse every group">Collapse all</button>';
  }

  function syncVisitLogGroupToggle() {
    var button = document.querySelector('#visitLogSummary .visit-log-summary__expand-all');
    if (!button) return;

    var groupNames = window.GAILS._visitLogCurrentGroupNames || [];
    var collapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
    var allCollapsed = groupNames.length > 0 && groupNames.every(function (name) {
      return !!collapsedGroups[name];
    });

    button.textContent = allCollapsed ? 'Expand all' : 'Collapse all';
    button.title = allCollapsed ? 'Expand every group' : 'Collapse every group';
  }

  function toggleAllVisitLogGroups() {
    var groupNames = window.GAILS._visitLogCurrentGroupNames || [];
    if (!groupNames.length) return;

    var collapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
    var allCollapsed = groupNames.every(function (name) { return !!collapsedGroups[name]; });
    var shouldCollapse = !allCollapsed;

    groupNames.forEach(function (name) {
      if (shouldCollapse) collapsedGroups[name] = true;
      else delete collapsedGroups[name];
    });

    document.querySelectorAll('#visitLogList .unvisited-manager-section').forEach(function (section) {
      var name = section.getAttribute('data-group-name') || '';
      if (groupNames.indexOf(name) === -1) return;
      section.classList.toggle('collapsed', shouldCollapse);
      var title = section.querySelector('.unvisited-manager-title');
      if (title) title.setAttribute('aria-expanded', shouldCollapse ? 'false' : 'true');
    });

    syncVisitLogGroupToggle();
  }

  window.GAILS.resetVisitLogCollapsedGroups = function () {
    window.GAILS._visitLogCollapsedGroups = {};

    document.querySelectorAll('#visitLogList .unvisited-manager-section').forEach(function (section) {
      section.classList.remove('collapsed');
      var title = section.querySelector('.unvisited-manager-title');
      if (title) title.setAttribute('aria-expanded', 'true');
    });

    syncVisitLogGroupToggle();
  };

  // Leaving the reports tab ends the "session" for the view toggle: coming
  // back always lands on Visit History rather than resuming Unvisited Sites
  // or Follow-ups. Only flips the in-memory view + button state; the caller
  // re-renders, which writes the reset view back to the saved filters.
  window.GAILS.resetVisitLogView = function () {
    window.GAILS._activeVisitLogView = 'history';

    document.querySelectorAll('#visitLogViewToggle .visit-log-toggle-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === 'history');
    });
  };

  function renderVisitLogSummary(baseFiltered, shownCount, typeVal, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;

    var counts = {};
    baseFiltered.forEach(function (v) {
      var k = visitTypeKey(v);
      counts[k] = (counts[k] || 0) + 1;
    });

    var chipsHtml = VISIT_TYPE_META.filter(function (m) { return counts[m.key]; }).map(function (m) {
      var active = typeVal === m.key;
      var stateClass = active ? ' active' : (typeVal ? ' dimmed' : '');
      return '<button type="button" class="visit-log-summary__chip' + stateClass + '"' +
        ' data-type="' + m.key + '"' +
        ' style="--chip-color:' + m.color + ';--chip-bg:' + m.bg + ';"' +
        ' aria-pressed="' + active + '"' +
        ' title="' + (active ? 'Clear visit type filter' : 'Show only: ' + escapeHtml(m.label)) + '">' +
        escapeHtml(m.label) +
        '<span class="visit-log-summary__chip-count">' + counts[m.key] + '</span>' +
        '</button>';
    }).join('');

    var actionsHtml = '<span class="visit-log-summary__actions">' +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export" title="Download the filtered list as CSV">Export CSV</button>' +
      '</span>';

    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + shownCount + '</strong> visit' + (shownCount === 1 ? '' : 's') + '</span>' +
      chipsHtml +
      actionsHtml;
    summaryEl.hidden = false;
  }

  function renderUnvisitedSummary(unvisitedCount, matchingSites, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;
    var visited = matchingSites - unvisitedCount;
    var coverage = matchingSites > 0 ? Math.round((visited / matchingSites) * 100) : 0;
    var coverageText = matchingSites > 0 ? coverage + '% coverage this period' : 'No sites match the current filters';
    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + unvisitedCount + '</strong> of ' + matchingSites + ' sites unvisited</span>' +
      '<span class="visit-log-summary__coverage">' + coverageText + '</span>' +
      '<span class="visit-log-summary__actions">' +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export" title="Download the unvisited list as CSV">Export CSV</button>' +
      '</span>';
    summaryEl.hidden = false;
  }

  function renderFollowUpSummary(shownCount, openCount, overdueCount, showGroupToggle) {
    var summaryEl = document.getElementById('visitLogSummary');
    if (!summaryEl) return;
    var addBtn = canLogVisits()
      ? '<button type="button" class="visit-log-summary__add-task" title="Add a follow-up task">+ Add task</button>'
      : '';
    summaryEl.innerHTML =
      '<span class="visit-log-summary__total"><strong>' + shownCount + '</strong> follow-up' + (shownCount === 1 ? '' : 's') + '</span>' +
      '<span class="visit-log-summary__coverage">' + openCount + ' open · ' + overdueCount + ' overdue</span>' +
      '<span class="visit-log-summary__actions">' +
      addBtn +
      visitLogGroupToggleHtml(showGroupToggle) +
      '<button type="button" class="visit-log-summary__export" title="Download the follow-up list as CSV">Export CSV</button>' +
      '</span>';
    summaryEl.hidden = false;
  }

  window.GAILS.renderVisitLog = function () {
    var container = document.getElementById('visitLogList');
    var statusEl = document.getElementById('visitLogStatus');
    if (!container) return;

    var allVisits = window.GAILS._allVisitsObj || {};
    var visitIds = Object.keys(allVisits);

    // The Follow-ups view reads its own node and can have tasks even before any
    // visits load, so it isn't gated by the "no check-ins" guard below.
    if (visitIds.length === 0 && window.GAILS._activeVisitLogView !== 'followups') {
      if (statusEl) {
        statusEl.textContent = 'Loading check-ins...';
        statusEl.style.display = '';
      }
      var emptySummaryEl = document.getElementById('visitLogSummary');
      if (emptySummaryEl) emptySummaryEl.hidden = true;
      container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No check-ins loaded yet.</p></div>';
      return;
    }

    if (statusEl) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
    }

    var G = window.GAILS;

    // Initialize listeners once
    if (!window.GAILS._visitLogFiltersInited) {
      window.GAILS._visitLogFiltersInited = true;
      var searchEl = document.getElementById('visitLogSearch');
      var regionEl = document.getElementById('visitLogRegion');
      var opsEl = document.getElementById('visitLogOps');
      var periodEl = document.getElementById('visitLogPeriod');
      var resetBtn = document.getElementById('visitLogResetBtn');
      var mobileFilterBtn = document.getElementById('visitLogMobileFilterBtn');
      var mobileFilterCloseBtn = document.getElementById('visitLogFilterCloseBtn');
      var mobileFilterBackdrop = document.getElementById('visitLogFilterBackdrop');
      var visitMobileFilterMedia = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;

      var lastYearOption = periodEl ? periodEl.querySelector('option[value="lastYear"]') : null;
      if (lastYearOption) {
        lastYearOption.textContent = 'Last Year (' + ((new Date()).getFullYear() - 1) + ')';
      }

      if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener('click', function () {
          setVisitLogFiltersOpen(true);
        });
      }
      if (mobileFilterCloseBtn) {
        mobileFilterCloseBtn.addEventListener('click', function () {
          setVisitLogFiltersOpen(false);
        });
      }
      if (mobileFilterBackdrop) {
        mobileFilterBackdrop.addEventListener('click', function () {
          setVisitLogFiltersOpen(false);
        });
      }
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') setVisitLogFiltersOpen(false);
      });
      if (visitMobileFilterMedia) {
        var closeVisitFilterOnDesktop = function (e) {
          if (!e.matches) setVisitLogFiltersOpen(false);
        };
        if (visitMobileFilterMedia.addEventListener) {
          visitMobileFilterMedia.addEventListener('change', closeVisitFilterOnDesktop);
        } else if (visitMobileFilterMedia.addListener) {
          visitMobileFilterMedia.addListener(closeVisitFilterOnDesktop);
        }
      }

      if (searchEl) {
        var searchDebounceId = null;
        searchEl.addEventListener('input', function () {
          clearTimeout(searchDebounceId);
          searchDebounceId = setTimeout(function () { window.GAILS.renderVisitLog(); }, 220);
        });
      }
      if (regionEl) regionEl.addEventListener('change', function () {
        // Selected region narrowed/changed - the ops list must be rebuilt to
        // only offer areas that actually operate in that region.
        populateDropdown('visitLogOps', new Set(getVisitLogOps(regionEl.value)), 'All Areas');
        if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect('visitLogOps');
        syncVisitLogMobileFilterButton();
        window.GAILS.renderVisitLog();
      });
      if (opsEl) opsEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      if (periodEl) periodEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      var typeEl = document.getElementById('visitLogType');
      var ratingEl = document.getElementById('visitLogRating');
      if (typeEl) typeEl.addEventListener('change', function () {
        syncCqvRatingVisibility();
        syncVisitLogMobileFilterButton();
        window.GAILS.renderVisitLog();
      });
      if (ratingEl) ratingEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      syncCqvRatingVisibility();
      var groupEl = document.getElementById('visitLogGroup');
      if (groupEl) groupEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });
      var sortEl = document.getElementById('visitLogSort');
      if (sortEl) sortEl.addEventListener('change', function () { syncVisitLogMobileFilterButton(); window.GAILS.renderVisitLog(); });

      // Toggle views (scoped to the main view toggle so the Follow-ups status
      // sub-toggle below doesn't collide with it).
      document.querySelectorAll('#visitLogViewToggle .visit-log-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#visitLogViewToggle .visit-log-toggle-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          window.GAILS._activeVisitLogView = btn.dataset.view;
          window.GAILS.renderVisitLog();
        });
      });

      // Follow-ups status sub-filter (Open / Overdue / Done / All).
      document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          window.GAILS._followUpStatusFilter = btn.dataset.status;
          window.GAILS.renderVisitLog();
        });
      });

      // Summary bar: chips filter by visit type (clicking the active chip
      // clears it), export downloads the currently filtered list as CSV
      var summaryBarEl = document.getElementById('visitLogSummary');
      if (summaryBarEl) {
        summaryBarEl.addEventListener('click', function (e) {
          if (e.target.closest && e.target.closest('.visit-log-summary__expand-all')) {
            toggleAllVisitLogGroups();
            return;
          }
          if (e.target.closest && e.target.closest('.visit-log-summary__add-task')) {
            window.GAILS.openFollowUpModal();
            return;
          }
          if (e.target.closest && e.target.closest('.visit-log-summary__export')) {
            exportVisitLogCsv();
            return;
          }
          var chip = e.target.closest ? e.target.closest('.visit-log-summary__chip') : null;
          if (!chip) return;
          var typeSelect = document.getElementById('visitLogType');
          if (!typeSelect) return;
          var key = chip.dataset.type;
          preserveScrollPosition(function () {
            typeSelect.value = (typeSelect.value === key) ? '' : key;
            if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect('visitLogType');
            syncCqvRatingVisibility();
            syncVisitLogMobileFilterButton();
            window.GAILS.renderVisitLog();
          });
        });
      }

      // List-level delegation: collapsible group headers, per-site "Log
      // Visit" quick action on unvisited cards, and the "Show more" pager.
      // (Row expansion/report opening is handled by the document-level
      // [data-visit-report-id] listener.)
      var listEl = document.getElementById('visitLogList');
      if (listEl) {
        listEl.addEventListener('click', function (e) {
          var closest = e.target.closest ? function (sel) { return e.target.closest(sel); } : function () { return null; };

          var groupBtn = closest('.unvisited-manager-title');
          if (groupBtn) {
            var section = groupBtn.closest('.unvisited-manager-section');
            if (!section) return;
            var name = section.getAttribute('data-group-name') || '';
            var collapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
            if (collapsedGroups[name]) delete collapsedGroups[name];
            else collapsedGroups[name] = true;
            section.classList.toggle('collapsed');
            groupBtn.setAttribute('aria-expanded', section.classList.contains('collapsed') ? 'false' : 'true');
            syncVisitLogGroupToggle();
            return;
          }

          var logVisitBtn = closest('.unvisited-log-btn');
          if (logVisitBtn) {
            window.GAILS.openAddSiteVisitModal(logVisitBtn.getAttribute('data-bakery'));
            return;
          }

          // Follow-up item actions: tick off, edit, delete.
          var toggleBtn = closest('[data-followup-toggle]');
          if (toggleBtn) {
            var toggleId = toggleBtn.getAttribute('data-followup-toggle');
            var isChecked = toggleBtn.classList.contains('checked');
            toggleBtn.disabled = true;
            Promise.resolve(window.GAILS_Firebase.completeFollowUpAction(toggleId, !isChecked))
              .catch(function (err) { console.error(err); alert(err.message || 'Failed to update follow-up.'); toggleBtn.disabled = false; });
            // The live followUpActions listener re-renders on success.
            return;
          }

          var editBtn = closest('[data-followup-edit]');
          if (editBtn) {
            var editId = editBtn.getAttribute('data-followup-edit');
            var task = (window.GAILS._followUpActionsObj || {})[editId];
            if (task) window.GAILS.openFollowUpModal(null, Object.assign({ id: editId }, task));
            return;
          }

          var deleteBtn = closest('[data-followup-delete]');
          if (deleteBtn) {
            var deleteId = deleteBtn.getAttribute('data-followup-delete');
            var delTask = (window.GAILS._followUpActionsObj || {})[deleteId];
            var delName = delTask && delTask.title ? '“' + delTask.title + '”' : 'this follow-up';
            if (window.confirm('Delete ' + delName + '? This cannot be undone.')) {
              deleteBtn.disabled = true;
              Promise.resolve(window.GAILS_Firebase.deleteFollowUpAction(deleteId))
                .catch(function (err) { console.error(err); alert(err.message || 'Failed to delete follow-up.'); deleteBtn.disabled = false; });
            }
            return;
          }

          if (closest('.visit-log-show-more')) {
            window.GAILS._visitLogRenderLimit = (window.GAILS._visitLogRenderLimit || VISIT_LOG_RENDER_CHUNK) + VISIT_LOG_RENDER_CHUNK;
            window.GAILS.renderVisitLog();
          }
        });
      }

      // Add Site Visit click
      var addBtn = document.getElementById('visitLogAddBtn');
      if (addBtn) {
        addBtn.addEventListener('click', function () {
          window.GAILS.openAddSiteVisitModal();
        });
      }

      // Add Site Visit form submit
      var form = document.getElementById('addSiteVisitForm');
      if (form) {
        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          var submitBtn = document.getElementById('addVisitSubmitBtn');
          var errorEl = document.getElementById('addVisitError');
          if (!submitBtn) return;

          submitBtn.disabled = true;
          var origText = submitBtn.textContent;
          submitBtn.textContent = 'Saving...';
          if (errorEl) errorEl.style.display = 'none';

          var record = {
            bakery: document.getElementById('addVisitBakery').value,
            visitKind: document.getElementById('addVisitType').value || 'checkin',
            date: document.getElementById('addVisitDate').value,
            time: document.getElementById('addVisitTime').value,
            coffeePartner: document.getElementById('addVisitPartner').value || '',
            mod: document.getElementById('addVisitMod').value || '',
            comments: document.getElementById('addVisitComments').value || ''
          };

          // Follow-ups raised/ticked on this visit, collected before the async
          // save so a re-render can't change the DOM underneath us.
          var newTasks = collectNewFollowUps();
          var tickedIds = Array.prototype.map.call(
            document.querySelectorAll('#addVisitOpenTasksList .follow-up-check__box:checked'),
            function (box) { return box.getAttribute('data-task-id'); }
          );

          try {
            if (!window.GAILS_Firebase || typeof window.GAILS_Firebase.saveSiteVisit !== 'function') {
              throw new Error('Database helper not loaded yet. Please try again.');
            }
            var newVisitId = await window.GAILS_Firebase.saveSiteVisit(record);

            // Close off ticked tasks and raise any new ones (best-effort — the
            // check-in itself has already saved, so surface but don't unwind).
            var followUpOps = [];
            tickedIds.forEach(function (id) {
              followUpOps.push(window.GAILS_Firebase.completeFollowUpAction(id, true));
            });
            newTasks.forEach(function (t) {
              followUpOps.push(window.GAILS_Firebase.saveFollowUpAction({
                bakery: record.bakery,
                title: t.title,
                dueDate: t.dueDate,
                priority: t.priority,
                sourceVisitId: newVisitId || null
              }));
            });
            if (followUpOps.length) {
              try { await Promise.all(followUpOps); }
              catch (fuErr) { console.error('Some follow-up updates failed:', fuErr); }
            }

            window.GAILS.closeAddSiteVisitModal();
          } catch (err) {
            console.error(err);
            if (errorEl) {
              errorEl.textContent = err.message || 'Failed to save check-in.';
              errorEl.style.display = 'block';
            }
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
        });
      }

      // Log Visit modal: refresh the open-tasks checklist when the bakery
      // changes, and drive the "add follow-up" row builder.
      var addVisitBakeryEl = document.getElementById('addVisitBakery');
      if (addVisitBakeryEl) {
        addVisitBakeryEl.addEventListener('change', function () {
          renderCheckInOpenTasks(addVisitBakeryEl.value);
        });
      }
      var addTaskRowBtn = document.getElementById('addVisitNewTaskBtn');
      if (addTaskRowBtn) {
        addTaskRowBtn.addEventListener('click', function () {
          var added = appendFollowUpBuilderRow(document.getElementById('addVisitNewTasks'));
          var input = added && added.querySelector('.follow-up-builder__title');
          if (input) input.focus();
        });
      }
      var newTasksWrap = document.getElementById('addVisitNewTasks');
      if (newTasksWrap) {
        newTasksWrap.addEventListener('click', function (e) {
          var removeBtn = e.target.closest ? e.target.closest('.follow-up-builder__remove') : null;
          if (!removeBtn) return;
          var rows = newTasksWrap.querySelectorAll('.follow-up-builder__row');
          if (rows.length <= 1) {
            // Keep at least one row — just clear it.
            var row = removeBtn.closest('.follow-up-builder__row');
            if (row) row.querySelectorAll('input').forEach(function (i) { i.value = ''; });
            return;
          }
          var target = removeBtn.closest('.follow-up-builder__row');
          if (target) target.remove();
        });
      }

      // Standalone add/edit follow-up form.
      var followUpForm = document.getElementById('addFollowUpForm');
      if (followUpForm) {
        followUpForm.addEventListener('submit', async function (e) {
          e.preventDefault();
          var submitBtn = document.getElementById('followUpSubmitBtn');
          var errorEl = document.getElementById('followUpError');
          if (!submitBtn) return;
          var origText = submitBtn.textContent;
          submitBtn.disabled = true;
          submitBtn.textContent = 'Saving...';
          if (errorEl) errorEl.style.display = 'none';

          var editId = document.getElementById('followUpEditId').value;
          var payload = {
            bakery: document.getElementById('followUpBakery').value,
            title: document.getElementById('followUpTitle').value.trim(),
            dueDate: document.getElementById('followUpDueDate').value || null,
            priority: normalizePriority(document.getElementById('followUpPriority').value),
            detail: document.getElementById('followUpDetail').value.trim()
          };

          try {
            if (!window.GAILS_Firebase) throw new Error('Database helper not loaded yet. Please try again.');
            if (editId) {
              await window.GAILS_Firebase.updateFollowUpAction(editId, payload);
            } else {
              await window.GAILS_Firebase.saveFollowUpAction(payload);
            }
            window.GAILS.closeFollowUpModal();
          } catch (err) {
            console.error(err);
            if (errorEl) {
              errorEl.textContent = err.message || 'Failed to save follow-up.';
              errorEl.style.display = 'block';
            }
          } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = origText;
          }
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', function () {
          try { localStorage.removeItem(VISIT_LOG_FILTER_STORAGE_KEY); } catch (e) { /* storage unavailable */ }
          if (searchEl) searchEl.value = '';
          if (regionEl) regionEl.value = '';
          if (typeEl) typeEl.value = '';
          if (ratingEl) ratingEl.value = '';
          if (groupEl) groupEl.value = 'ops';
          if (sortEl) sortEl.value = 'date';
          if (periodEl) periodEl.value = getVisitLogDefaultPeriod(window.GAILS._activeVisitLogView || 'history');
          populateDropdown('visitLogOps', new Set(getVisitLogOps('')), 'All Areas');
          if (opsEl) opsEl.value = '';
          window.GAILS._followUpStatusFilter = 'open';
          document.querySelectorAll('#followUpStatusToggle .visit-log-toggle-btn').forEach(function (b) {
            b.classList.toggle('active', b.dataset.status === 'open');
          });
          syncCqvRatingVisibility();
          syncVisitLogMobileFilterButton();
          if (window.GAILS.syncCustomSelect) {
            window.GAILS.syncCustomSelect('visitLogRegion');
            window.GAILS.syncCustomSelect('visitLogOps');
            window.GAILS.syncCustomSelect('visitLogType');
            window.GAILS.syncCustomSelect('visitLogRating');
            window.GAILS.syncCustomSelect('visitLogGroup');
            window.GAILS.syncCustomSelect('visitLogSort');
            window.GAILS.syncCustomSelect('visitLogPeriod');
          }
          window.GAILS.renderVisitLog();
        });
      }
    }

    // Populate selects dynamically once (or if not populated yet)
    if (!window.GAILS._visitLogFiltersPopulated) {
      window.GAILS._visitLogFiltersPopulated = true;
      populateVisitLogFilterOptions();
      restoreVisitLogFilters();

      // Theme newly built dropdown options
      if (window.GAILS.initCustomSelects) {
        window.GAILS.initCustomSelects(document.querySelector('.visit-log-filters'));
      }
      syncVisitLogMobileFilterButton();
    }

    var view = window.GAILS._activeVisitLogView || 'history';
    syncVisitLogViewControls(view);

    // Get filter values
    var searchVal = document.getElementById('visitLogSearch') ? document.getElementById('visitLogSearch').value.toLowerCase().trim() : '';
    var regionVal = document.getElementById('visitLogRegion') ? document.getElementById('visitLogRegion').value : '';
    var opsVal = document.getElementById('visitLogOps') ? document.getElementById('visitLogOps').value : '';
    var typeVal = document.getElementById('visitLogType') ? document.getElementById('visitLogType').value : '';
    var ratingVal = document.getElementById('visitLogRating') ? document.getElementById('visitLogRating').value : '';
    var groupVal = document.getElementById('visitLogGroup') ? document.getElementById('visitLogGroup').value : 'ops';
    var sortVal = document.getElementById('visitLogSort') ? document.getElementById('visitLogSort').value : 'date';
    var periodVal = document.getElementById('visitLogPeriod')
      ? document.getElementById('visitLogPeriod').value
      : getVisitLogDefaultPeriod(view);
    var followUpStatus = window.GAILS._followUpStatusFilter || 'open';

    syncVisitLogMobileFilterButton();

    saveVisitLogFilters({
      search: document.getElementById('visitLogSearch') ? document.getElementById('visitLogSearch').value : '',
      region: regionVal,
      ops: opsVal,
      type: typeVal,
      rating: ratingVal,
      group: groupVal,
      sort: sortVal,
      period: periodVal,
      followUpStatus: followUpStatus,
      view: view
    });

    // "Show more" pagination: any filter/view change resets the row limit
    // back to the first chunk; the Show more button re-renders with the same
    // signature, so the raised limit survives.
    var renderSig = [view, searchVal, regionVal, opsVal, typeVal, ratingVal, groupVal, sortVal, periodVal, followUpStatus].join('|');
    if (window.GAILS._visitLogRenderSig !== renderSig) {
      window.GAILS._visitLogRenderSig = renderSig;
      window.GAILS._visitLogRenderLimit = VISIT_LOG_RENDER_CHUNK;
      window.GAILS.resetVisitLogCollapsedGroups();
    }
    var renderLimit = window.GAILS._visitLogRenderLimit || VISIT_LOG_RENDER_CHUNK;

    // Sticky group headers pin just below the app header, whose height
    // varies with viewport — measure it rather than hard-coding.
    var appHeader = document.querySelector('.header');
    if (appHeader) {
      document.documentElement.style.setProperty('--visit-sticky-top', appHeader.offsetHeight + 'px');
    }

    var headerSub = document.getElementById('headerSub');
    if (headerSub && window.GAILS.getVisitLogHeaderSummary) {
      headerSub.innerHTML = window.GAILS.getVisitLogHeaderSummary();
    }

    // Convert object to array
    var visitsList = visitIds.map(function (id) {
      return Object.assign({ id: id }, allVisits[id]);
    });

    if (view === 'history') {
      // Filter history in two stages: everything except visit type/rating
      // first, so the summary bar can keep showing every type's count while
      // one type is selected (unselected chips render dimmed), then the
      // type/rating filter on top for the list itself.
      var baseFiltered = visitsList.filter(function (v) {
        if (!v.bakery || !v.date) return false;

        if (searchVal) {
          var bakeryMatch = v.bakery.toLowerCase().indexOf(searchVal) !== -1;
          var partnerMatch = v.coffeePartner && v.coffeePartner.toLowerCase().indexOf(searchVal) !== -1;
          var auditorMatch = v.auditorName && v.auditorName.toLowerCase().indexOf(searchVal) !== -1;
          if (!bakeryMatch && !partnerMatch && !auditorMatch) return false;
        }
        if (regionVal) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : 'Unknown';
          if (reg !== regionVal) return false;
        }
        if (opsVal) {
          var ops = G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown';
          if (ops !== opsVal) return false;
        }
        if (!isDateWithinMonths(v.date, periodVal)) {
          return false;
        }
        return true;
      });

      var filtered = baseFiltered.filter(function (v) {
        if (typeVal && visitTypeKey(v) !== typeVal) return false;
        if (ratingVal && (v.type !== 'cqv' || cqvBand(v) !== ratingVal)) return false;
        return true;
      });

      if (filtered.length === 0) {
        window.GAILS._visitLogCurrentGroupNames = [];
        renderVisitLogSummary(baseFiltered, filtered.length, typeVal, false);
        // Clear stale export data so the still-visible Export button can't
        // download the previous filter's rows.
        window.GAILS._visitLogExport = null;
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No check-ins found matching the selected filters.</p></div>';
        return;
      }

      // Group by whatever's selected in "Group By" (Ops Area / Region /
      // Visit Type) — same underlying list, just bucketed differently.
      var grouped = {};
      filtered.forEach(function (v) {
        var key = getVisitGroupKey(v, groupVal);
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(v);
      });

      var groupsSorted = Object.keys(grouped).sort();
      var schema = window.GAILS_VISIT_SCHEMA;
      var collapsedGroups = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
      window.GAILS._visitLogCurrentGroupNames = groupVal === 'none' ? [] : groupsSorted.slice();
      renderVisitLogSummary(baseFiltered, filtered.length, typeVal, groupVal !== 'none');

      // CSV export always mirrors the full filtered list, even when the
      // rendered rows are capped by the Show more pager.
      window.GAILS._visitLogExport = {
        filename: 'gails-visits-' + new Date().toISOString().slice(0, 10) + '.csv',
        rows: [['Date', 'Time', 'Bakery', 'Region', 'Ops Area', 'Visit Type', 'Coffee Partner / Auditor', 'Score', 'Notes']].concat(filtered.map(function (v) {
          var score = '';
          if (v.type === 'cqv') score = v.overallPct != null ? v.overallPct + '%' : '';
          else if (v.type === 'nbo') score = GAILS.NBOShared.overallPct(v) != null ? GAILS.NBOShared.overallPct(v) + '%' : '';
          else if (v.type !== 'siteVisit') score = v.score != null ? v.score + ' / ' + (v.scoreMax != null ? v.scoreMax : '') : '';
          return [
            v.date,
            v.time || '',
            G.getBakeryMapLabel ? G.getBakeryMapLabel(v.bakery) : v.bakery,
            G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : '',
            G.getBakeryOps ? G.getBakeryOps(v.bakery) : '',
            visitTypeLabel(v),
            (v.type === 'cqv' || v.type === 'nbo') ? (v.auditorName || '') : (v.coffeePartner || ''),
            score,
            buildVisitNotes(v, schema).text
          ];
        }))
      };

      var remaining = renderLimit;

      var html = groupsSorted.map(function (groupName) {
        var groupVisits = grouped[groupName];

        // Sort based on selected option within the group
        groupVisits.sort(function (a, b) {
          if (sortVal === 'nameAsc') {
            var labelA = (G.getBakeryMapLabel ? G.getBakeryMapLabel(a.bakery) : a.bakery) || '';
            var labelB = (G.getBakeryMapLabel ? G.getBakeryMapLabel(b.bakery) : b.bakery) || '';
            return labelA.localeCompare(labelB);
          }
          if (sortVal === 'nameDesc') {
            var labelA = (G.getBakeryMapLabel ? G.getBakeryMapLabel(a.bakery) : a.bakery) || '';
            var labelB = (G.getBakeryMapLabel ? G.getBakeryMapLabel(b.bakery) : b.bakery) || '';
            return labelB.localeCompare(labelA);
          }
          if (sortVal === 'type') {
            var labelA = visitTypeLabel(a);
            var labelB = visitTypeLabel(b);
            return labelA.localeCompare(labelB);
          }
          // Default: date descending
          var dateA = a.date + 'T' + (a.time || '00:00');
          var dateB = b.date + 'T' + (b.time || '00:00');
          return dateB.localeCompare(dateA);
        });

        // Pagination: spend the remaining row budget on this group; anything
        // beyond it stays reachable via the Show more button after the list.
        if (remaining <= 0) return '';
        var visibleVisits = groupVisits.length > remaining ? groupVisits.slice(0, remaining) : groupVisits;
        remaining -= visibleVisits.length;

        var visitsHtml = visibleVisits.map(function (v) {
          var scoreText = '—';
          var tagsHtml = '';
          var scoreColor = '#ffffff';

          if (v.type === 'siteVisit') {
            scoreText = '';
            var kindColors = siteVisitKindTagColors(v);
            tagsHtml = '<span class="visit-log-row__tag" style="color:' + kindColors.color + ';background:' + kindColors.bg + ';">' + escapeHtml(siteVisitKindLabel(v)) + '</span>';
          } else if (v.type === 'nbo') {
            // Derived percentage, shown in the default text colour — NBO
            // visits have no RAG band (see js/nbo-shared.js).
            scoreText = nboPctText(v);
            scoreColor = 'var(--text)';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--purple);background:var(--purple-d);">' + escapeHtml(nboVisitLabel(v)) + '</span>';
          } else if (v.type === 'cqv') {
            scoreText = (v.overallPct != null) ? v.overallPct + '%' : '—';
            tagsHtml = '<span class="visit-log-row__tag" style="color:#B22A24;background:rgba(178, 42, 36,0.15);">' + (v.isFollowUp ? 'CQV Follow-Up' : 'CQV') + '</span>';
            var band = cqvBand(v);
            var bandColor = cqvBandColor(band);
            if (bandColor) {
              scoreColor = bandColor;
            }
          } else {
            scoreText = (v.score != null) ? v.score + ' / ' + (v.scoreMax != null ? v.scoreMax : '—') : '—';
            scoreColor = 'var(--text)';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--gold);background:var(--gold-d);">Routine Coffee Visit</span>';
          }

          var notes = buildVisitNotes(v, schema);
          var allNotesText = notes.text || 'No notes recorded.';
          var notesFullHtml = notes.fullHtml || '<p class="visit-log-row__note-item">No notes recorded.</p>';

          var previewText = allNotesText;
          if (previewText.length > 120) {
            previewText = previewText.substring(0, 120) + '...';
          }

          var dateLabel = formatVisitDate(v.date);
          var shortDate = dateLabel.split(', ')[1] || dateLabel;
          var bakeryLabel = G.getBakeryMapLabel ? G.getBakeryMapLabel(v.bakery) : v.bakery;
          var isAuditedType = v.type === 'cqv' || v.type === 'nbo';
          var partnerColText = isAuditedType ? (v.auditorName || '—') : (v.coffeePartner || '—');
          // The row always shows the actual Ops Area regardless of the
          // active grouping — grouping by Region/Visit Type would otherwise
          // lose that context entirely.
          var rowOpsLabel = groupVal === 'ops' ? groupName : (G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown');

          return '<div class="visit-log-row" data-visit-report-id="' + escapeHtml(v.id) + '" tabindex="0" role="button" aria-expanded="false" aria-label="Visit report for ' + escapeHtml(bakeryLabel) + '">' +
            '<div class="visit-log-row__date-col">' +
            '<span class="visit-log-row__date">' + escapeHtml(shortDate) + '</span>' +
            '<span class="visit-log-row__time">' + escapeHtml(v.time || '—') + '</span>' +
            '</div>' +
            '<div class="visit-log-row__bakery-col">' +
            '<h3 class="visit-log-row__bakery">' + escapeHtml(bakeryLabel) + '</h3>' +
            '<span class="visit-log-row__manager">Ops Area: ' + escapeHtml(rowOpsLabel) + '</span>' +
            '</div>' +
            '<div class="visit-log-row__partner" title="' + escapeHtml(isAuditedType ? 'Auditor: ' + partnerColText : partnerColText) + '">' + escapeHtml(partnerColText) + '</div>' +
            '<div class="visit-log-row__score-col" style="color:' + scoreColor + ';">' + escapeHtml(scoreText) + '</div>' +
            '<div class="visit-log-row__notes-col">' +
            '<div class="visit-log-row__tags">' + tagsHtml + '</div>' +
            '<p class="visit-log-row__notes-preview">' + escapeHtml(previewText) + '</p>' +
            '</div>' +
            '<div class="visit-log-row__action-col">' +
            '<button type="button" class="visit-log-row__btn">View Report</button>' +
            '<span class="visit-log-row__chevron" aria-hidden="true">' +
            '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
            '</span>' +
            '</div>' +
            // Direct grid child spanning all columns, so expanding adds a
            // panel BELOW the summary line instead of stretching the row.
            '<div class="visit-log-row__notes-full">' + notesFullHtml + '</div>' +
            '</div>';
        }).join('');

        if (groupVal === 'none') {
          return '<div class="unvisited-manager-body">' +
            visitsHtml +
            '</div>';
        }

        var isCollapsed = !!collapsedGroups[groupName];
        return '<div class="unvisited-manager-section' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
          '<button type="button" class="unvisited-manager-title" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
          '<svg class="unvisited-manager-title__chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
          '<span>' + escapeHtml(groupName) + ' (' + groupVisits.length + ' visits)</span>' +
          '</button>' +
          '<div class="unvisited-manager-body">' +
          visitsHtml +
          '</div>' +
          '</div>';
      }).join('');

      if (filtered.length > renderLimit) {
        html += '<button type="button" class="visit-log-show-more">Show more (' + (filtered.length - renderLimit) + ' remaining)</button>';
      }

      container.innerHTML = html;
      syncVisitLogGroupToggle();
    } else if (view === 'unvisited') {
      // Determine which sites are unvisited in periodVal
      var visitedBakeries = new Set();
      visitsList.forEach(function (v) {
        if (v.bakery && v.date && isDateWithinMonths(v.date, periodVal)) {
          visitedBakeries.add(v.bakery);
        }
      });

      var allBakeries = G.state && G.state.BAKERIES || [];
      var unvisitedMap = {};
      var totalUnvisited = 0;
      var matchingSites = 0;

      allBakeries.forEach(function (bName) {
        if (searchVal) {
          if (bName.toLowerCase().indexOf(searchVal) === -1) return;
        }
        if (regionVal) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(bName) : 'Unknown';
          if (reg !== regionVal) return;
        }
        if (opsVal) {
          var ops = G.getBakeryOps ? G.getBakeryOps(bName) : 'Unknown';
          if (ops !== opsVal) return;
        }
        matchingSites++;

        if (!visitedBakeries.has(bName)) {
          var groupName = 'All Sites';
          if (groupVal === 'region') {
            groupName = (G.getBakeryRegion ? G.getBakeryRegion(bName) : '') || 'Unknown';
          } else if (groupVal !== 'none') {
            groupName = (G.getBakeryOps ? G.getBakeryOps(bName) : '') || 'Unknown';
          }
          if (!unvisitedMap[groupName]) unvisitedMap[groupName] = [];
          unvisitedMap[groupName].push(bName);
          totalUnvisited++;
        }
      });

      // Most recent visit per bakery across ALL history (not just the
      // selected period) so each unvisited card can say how stale it is.
      var lastVisitMap = {};
      visitsList.forEach(function (v) {
        if (!v.bakery || !v.date) return;
        var stamp = v.date + 'T' + (v.time || '00:00');
        if (!lastVisitMap[v.bakery] || stamp > lastVisitMap[v.bakery]) {
          lastVisitMap[v.bakery] = stamp;
        }
      });

      function lastVisitedLabel(bName) {
        var stamp = lastVisitMap[bName];
        if (!stamp) return 'Never visited';
        var isoDate = stamp.split('T')[0];
        var days = daysSince(isoDate);
        var dateLabel = formatVisitDate(isoDate);
        dateLabel = dateLabel.split(', ')[1] || dateLabel;
        return 'Last visited ' + dateLabel + (days != null ? ' · ' + days + 'd ago' : '');
      }

      if (totalUnvisited === 0) {
        window.GAILS._visitLogCurrentGroupNames = [];
        renderUnvisitedSummary(totalUnvisited, matchingSites, false);
        window.GAILS._visitLogExport = null;
        // Zero matches means the filters excluded every site — only celebrate
        // when matched sites exist and all of them were actually visited.
        container.innerHTML = matchingSites === 0
          ? '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128269;</div><p>No sites match your current filters.</p></div>'
          : '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#127881;</div><p>All bakeries have been visited in this period!</p></div>';
        return;
      }

      var groupsSorted = Object.keys(unvisitedMap).sort();
      window.GAILS._visitLogCurrentGroupNames = groupVal === 'none' ? [] : groupsSorted.slice();
      renderUnvisitedSummary(totalUnvisited, matchingSites, groupVal !== 'none');

      window.GAILS._visitLogExport = {
        filename: 'gails-unvisited-sites-' + new Date().toISOString().slice(0, 10) + '.csv',
        rows: [['Bakery', 'Region', 'Ops Area', 'Last Visited']].concat(groupsSorted.reduce(function (rows, groupName) {
          unvisitedMap[groupName].slice().sort().forEach(function (bName) {
            rows.push([
              bName,
              G.getBakeryRegion ? G.getBakeryRegion(bName) : '',
              G.getBakeryOps ? G.getBakeryOps(bName) : '',
              lastVisitMap[bName] ? lastVisitMap[bName].split('T')[0] : 'Never visited'
            ]);
          });
          return rows;
        }, []))
      };

      var collapsedUnvisited = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
      var html = groupsSorted.map(function (groupName) {
        var bakeries = unvisitedMap[groupName].sort();
        var count = bakeries.length;

        var bakeryCardsHtml = bakeries.map(function (bName) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(bName) : '—';
          return '<div class="unvisited-bakery-item">' +
            '<div class="unvisited-bakery-item__info">' +
            '<div style="font-weight:700; color:var(--text);">' + escapeHtml(bName) + '</div>' +
            '<div style="font-size:0.72rem; color:var(--muted-l); margin-top:2px;">' + escapeHtml(reg) + '</div>' +
            '<div class="unvisited-bakery-item__last">' + escapeHtml(lastVisitedLabel(bName)) + '</div>' +
            '</div>' +
            (canLogVisits()
              ? '<button type="button" class="unvisited-log-btn" data-bakery="' + escapeHtml(bName) + '">+ Log Visit</button>'
              : '') +
            '</div>';
        }).join('');

        if (groupVal === 'none') {
          return '<div class="unvisited-manager-body"><div class="unvisited-bakeries-grid">' + bakeryCardsHtml + '</div></div>';
        }

        var isCollapsed = !!collapsedUnvisited[groupName];
        return '<div class="unvisited-manager-section' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
          '<button type="button" class="unvisited-manager-title" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
          '<svg class="unvisited-manager-title__chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
          '<span>' + escapeHtml(groupName) + ' (' + count + ' unvisited)</span>' +
          '</button>' +
          '<div class="unvisited-manager-body">' +
          '<div class="unvisited-bakeries-grid">' +
          bakeryCardsHtml +
          '</div>' +
          '</div>' +
          '</div>';
      }).join('');

      container.innerHTML = html;
      syncVisitLogGroupToggle();
    } else if (view === 'followups') {
      var followStatus = window.GAILS._followUpStatusFilter || 'open';
      var allTasks = getFollowUpList();

      // Scope by search / region / ops (but NOT the status sub-filter), so the
      // summary's open/overdue counts stay stable as you switch Open/Done/etc.
      function taskInScope(t) {
        if (!t.bakery) return false;
        var label = (G.getBakeryMapLabel ? G.getBakeryMapLabel(t.bakery) : t.bakery) || t.bakery;
        if (searchVal) {
          var hay = (label + ' ' + (t.title || '') + ' ' + (t.detail || '')).toLowerCase();
          if (hay.indexOf(searchVal) === -1) return false;
        }
        if (regionVal && (G.getBakeryRegion ? G.getBakeryRegion(t.bakery) : 'Unknown') !== regionVal) return false;
        if (opsVal && (G.getBakeryOps ? G.getBakeryOps(t.bakery) : 'Unknown') !== opsVal) return false;
        return true;
      }
      function taskIsDone(t) { return (t.status || 'open') === 'done'; }
      function taskIsOverdue(t) { return !taskIsDone(t) && dueMeta(t.dueDate).state === 'overdue'; }

      var scopeTasks = allTasks.filter(taskInScope);
      var openCount = scopeTasks.filter(function (t) { return !taskIsDone(t); }).length;
      var overdueCount = scopeTasks.filter(taskIsOverdue).length;

      var filteredTasks = scopeTasks.filter(function (t) {
        var done = taskIsDone(t);
        if (followStatus === 'open') return !done;
        if (followStatus === 'done') return done;
        if (followStatus === 'overdue') return taskIsOverdue(t);
        return true; // 'all'
      });

      // Group by bakery (using the display label).
      var taskGroups = {};
      filteredTasks.forEach(function (t) {
        var key = (G.getBakeryMapLabel ? G.getBakeryMapLabel(t.bakery) : t.bakery) || t.bakery;
        if (!taskGroups[key]) taskGroups[key] = [];
        taskGroups[key].push(t);
      });
      Object.keys(taskGroups).forEach(function (k) {
        taskGroups[k].sort(function (a, b) {
          // Open before done, then by soonest deadline.
          var ad = taskIsDone(a), bd = taskIsDone(b);
          if (ad !== bd) return ad ? 1 : -1;
          return followUpSortByDue(a, b);
        });
      });
      var taskGroupsSorted = Object.keys(taskGroups).sort();

      window.GAILS._visitLogExport = {
        filename: 'gails-follow-ups-' + new Date().toISOString().slice(0, 10) + '.csv',
        rows: [['Bakery', 'Region', 'Ops Area', 'Action', 'Detail', 'Priority', 'Due Date', 'Status', 'Added', 'Completed']].concat(filteredTasks.map(function (t) {
          return [
            G.getBakeryMapLabel ? G.getBakeryMapLabel(t.bakery) : t.bakery,
            G.getBakeryRegion ? G.getBakeryRegion(t.bakery) : '',
            G.getBakeryOps ? G.getBakeryOps(t.bakery) : '',
            t.title || '',
            t.detail || '',
            PRIORITY_LABELS[normalizePriority(t.priority)],
            t.dueDate || '',
            taskIsDone(t) ? 'Done' : 'Open',
            t.createdAt ? t.createdAt.slice(0, 10) : '',
            t.completedAt ? t.completedAt.slice(0, 10) : ''
          ];
        }))
      };

      if (filteredTasks.length === 0) {
        window.GAILS._visitLogCurrentGroupNames = [];
        renderFollowUpSummary(0, openCount, overdueCount, false);
        var emptyMsg = followStatus === 'done'
          ? 'No completed follow-ups match your filters.'
          : (followStatus === 'overdue'
            ? 'No overdue follow-ups — nicely on top of it!'
            : 'No open follow-ups. Raise one from a check-in or with “+ Add task”.');
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#9989;</div><p>' + emptyMsg + '</p></div>';
        return;
      }

      window.GAILS._visitLogCurrentGroupNames = taskGroupsSorted.slice();
      renderFollowUpSummary(filteredTasks.length, openCount, overdueCount, true);

      var collapsedTasks = window.GAILS._visitLogCollapsedGroups = window.GAILS._visitLogCollapsedGroups || {};
      var html = taskGroupsSorted.map(function (groupName) {
        var tasks = taskGroups[groupName];
        var itemsHtml = tasks.map(function (t) {
          var done = taskIsDone(t);
          var m = dueMeta(t.dueDate);
          var pill = done
            ? '<span class="follow-up-pill follow-up-pill--done">Done</span>'
            : (t.dueDate ? '<span class="follow-up-pill follow-up-pill--' + m.state + '">' + escapeHtml(m.label) + '</span>' : '');

          var metaBits = [];
          if (t.createdAt) metaBits.push('Added ' + formatVisitDate(t.createdAt.slice(0, 10)).split(', ').slice(1).join(', '));
          if (done && t.completedAt) metaBits.push('Completed ' + formatVisitDate(t.completedAt.slice(0, 10)).split(', ').slice(1).join(', '));

          return '<div class="follow-up-item' + (done ? ' follow-up-item--done' : '') + '" data-task-id="' + escapeHtml(t.id) + '">' +
            '<button type="button" class="follow-up-item__check' + (done ? ' checked' : '') + '" role="checkbox" aria-checked="' + done + '"' +
            ' data-followup-toggle="' + escapeHtml(t.id) + '" title="' + (done ? 'Mark as open' : 'Mark as done') + '">' +
            (done ? '&#10003;' : '') + '</button>' +
            '<div class="follow-up-item__body">' +
            '<div class="follow-up-item__title">' + escapeHtml(t.title || 'Untitled task') + '</div>' +
            (t.detail ? '<div class="follow-up-item__detail">' + escapeHtml(t.detail) + '</div>' : '') +
            (metaBits.length ? '<div class="follow-up-item__meta">' + escapeHtml(metaBits.join(' · ')) + '</div>' : '') +
            '</div>' +
            '<div class="follow-up-item__side">' +
            priorityTagHtml(t) +
            pill +
            '<div class="follow-up-item__actions">' +
            '<button type="button" class="follow-up-item__action" data-followup-edit="' + escapeHtml(t.id) + '">Edit</button>' +
            '<button type="button" class="follow-up-item__action follow-up-item__action--danger" data-followup-delete="' + escapeHtml(t.id) + '">Delete</button>' +
            '</div>' +
            '</div>' +
            '</div>';
        }).join('');

        var isCollapsed = !!collapsedTasks[groupName];
        return '<div class="unvisited-manager-section' + (isCollapsed ? ' collapsed' : '') + '" data-group-name="' + escapeHtml(groupName) + '">' +
          '<button type="button" class="unvisited-manager-title" aria-expanded="' + (isCollapsed ? 'false' : 'true') + '">' +
          '<svg class="unvisited-manager-title__chevron" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5l3 3 3-3"/></svg>' +
          '<span>' + escapeHtml(groupName) + ' (' + tasks.length + ')</span>' +
          '</button>' +
          '<div class="unvisited-manager-body">' +
          '<div class="follow-up-list">' + itemsHtml + '</div>' +
          '</div>' +
          '</div>';
      }).join('');

      container.innerHTML = html;
      syncVisitLogGroupToggle();
    }

    // Banner is updated at the start of renderVisitLog
  };
})();

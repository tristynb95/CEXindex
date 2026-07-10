// ========== VISIT REPORT MODAL ==========
// Full breakdown of a single Routine Coffee Visit, opened by clicking the
// "Last visited" line in a map popup (see js/targets.js getPopupHtml).
window.GAILS = window.GAILS || {};

(function() {
  var lockedScrollY = 0;
  var CHART_ID = 'visitReportScoreChart';
  var WAIT_TIME_TARGET_SECONDS = 120;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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
    return '<div class="visit-report-photos">' + urls.map(function(url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Photo &#8599;</a>';
    }).join('') + '</div>';
  }

  function renderSection(section, data, hsIssues) {
    var isHs = section.key === 'healthSafety';
    var rows = [];
    var comments = '';
    var photos = '';

    section.fields.forEach(function(field) {
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
        '<ul>' + hsIssues.map(function(label) { return '<li>' + escapeHtml(label) + '</li>'; }).join('') + '</ul>' +
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
    return '<div class="drill-summary">' + cards.map(function(c) {
      return '<div class="drill-card"><div class="drill-card__label">' + escapeHtml(c.label) + '</div>' +
        '<div class="drill-card__value" style="font-size:1.3rem">' + escapeHtml(c.value) + '</div></div>';
    }).join('') + '</div>';
  }

  function buildReportHtml(record) {
    var schema = window.GAILS_VISIT_SCHEMA;
    var hsIssues = [];
    var sectionsHtml = schema.sections.map(function(section) {
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
    var labels = schema.sections.map(function(s) { return s.title; });
    var earned = schema.sections.map(function(s) { return (record.sectionScores[s.key] || {}).earned || 0; });
    var max = schema.sections.map(function(s) { return (record.sectionScores[s.key] || {}).max || 0; });

    G.makeChart(CHART_ID, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Points Earned', data: earned, backgroundColor: '#1D9E5C', borderRadius: 6 },
          { label: 'Points Possible', data: max, backgroundColor: 'rgba(146, 137, 120,0.25)', borderRadius: 6 }
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

  // Recomputed live from categoryScores rather than trusting the stored
  // criticalFail flag, so records saved before this override existed (or
  // with a stale value) still show correctly without needing a re-import.
  function cqvHasLostAllergensOrCritical(scores) {
    return Object.keys(scores || {}).some(function(name) {
      var s = scores[name];
      var isCritical = (s.code === 'CRTCL' || s.code === 'ALRG') || /^(critical|allergen)\b/i.test(name);
      return isCritical && s.actual < s.target;
    });
  }

  function cqvHasCriticalFail(record) {
    if (record.criticalFail) return true;
    return cqvHasLostAllergensOrCritical(record.categoryScores);
  }

  // Bands GAIL's uses across every CQV surface: 0-69.99% Red, 70-89.99%
  // Yellow, 90%+ Green, EXCEPT a failed Critical Point or Allergen Point
  // question always forces Red regardless of the percentage (see
  // js/cqv-parser.js). Falls back to deriving the band from overallPct for
  // records saved before band computation existed, rather than showing a
  // blank, and re-applies the critical-fail override live in case the
  // stored band predates it.
  function cqvBand(record) {
    if (cqvHasCriticalFail(record)) return 'Red';
    if (record.band) return record.band;
    if (record.overallPct == null) return '';
    return record.overallPct >= 90 ? 'Green' : record.overallPct >= 70 ? 'Yellow' : 'Red';
  }

  function cqvBandColor(band) {
    if (band === 'Green') return '#1D9E5C';
    if (band === 'Yellow') return '#C97F12';
    if (band === 'Red') return '#B22A24';
    return null;
  }

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
    return '<div class="drill-summary">' + cards.map(function(c) {
      var colorStyle = c.color ? ' color:' + c.color + ';' : '';
      return '<div class="drill-card"><div class="drill-card__label">' + escapeHtml(c.label) + '</div>' +
        '<div class="drill-card__value" style="font-size:1.3rem;' + colorStyle + '">' + escapeHtml(c.value) + '</div></div>';
    }).join('') + '</div>';
  }

  function buildCqvScoreRowsHtml(scores) {
    return Object.keys(scores || {}).map(function(name) {
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

  function cqvPriorityColor(priority) {
    if (/^high$/i.test(priority)) return '#B22A24';
    if (/^medium$/i.test(priority)) return '#C97F12';
    if (/^low$/i.test(priority)) return '#0E8074';
    return null;
  }

  // Questions tagged "(allergen point)" / "(critical point)" are GAIL's
  // zero-tolerance categories — losing a single one forces the whole visit
  // Red — so an action item on one of them gets its own warning flag. An
  // action item only exists because the point was lost, so every match is
  // by definition a failed critical/allergen point.
  function cqvCriticalTag(label) {
    if (/\ballergen point\b/i.test(label || '')) return 'Allergen Point';
    if (/\bcritical point\b/i.test(label || '')) return 'Critical Point';
    return null;
  }

  // Follow-up CQVs sometimes skip the written "Comments & Action Plan"
  // block entirely (see js/cqv-parser.js's action-plan parsing) even though
  // individual questions still lost points — falling back to those lost
  // questions keeps the Action Plan section useful instead of showing
  // "no action items" on a visit that clearly didn't score 100%.
  function cqvLostPointItems(record) {
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

  function buildCqvActionPlanHtml(actionPlan) {
    if (!actionPlan || !actionPlan.length) {
      return '<p class="visit-report-note">No action items were flagged on this visit.</p>';
    }
    return actionPlan.map(function(a) {
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

    var criticalFailHtml = record.criticalFail
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-hs-banner visit-report-hs-banner--alert">' +
          '<strong>&#9888; A Critical Point was lost.</strong>' +
        '</div></div>'
      : '';

    var summaryHtml = record.summary
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section"><h4>Summary</h4><p class="visit-report-comment">' + escapeHtml(record.summary) + '</p></div></div>'
      : '';

    var categoryHtml = record.categoryScores && Object.keys(record.categoryScores).length
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section' + (cqvHasLostAllergensOrCritical(record.categoryScores) ? ' visit-report-section--danger' : '') + '"><h4>Score by Category</h4>' + buildCqvScoreRowsHtml(record.categoryScores) + '</div></div>'
      : '';

    var sectionHtml = hasSectionScores
      ? '<div class="visit-report-section-wrapper"><div class="visit-report-section' + (cqvHasLostAllergensOrCritical(record.sectionScores) ? ' visit-report-section--danger' : '') + '"><h4>Score by Section</h4>' + buildCqvScoreRowsHtml(record.sectionScores) + '</div></div>'
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

  function drawCqvScoreChart(record) {
    var G = window.GAILS;
    if (!record.sectionScores || typeof G.makeChart !== 'function') return;
    var names = Object.keys(record.sectionScores);
    if (!names.length) return;
    var earned = names.map(function(n) { return record.sectionScores[n].actual || 0; });
    var max = names.map(function(n) { return record.sectionScores[n].target || 0; });

    G.makeChart(CQV_CHART_ID, {
      type: 'bar',
      data: {
        labels: names,
        datasets: [
          { label: 'Points Earned', data: earned, backgroundColor: '#1D9E5C', borderRadius: 6 },
          { label: 'Points Possible', data: max, backgroundColor: 'rgba(146, 137, 120,0.25)', borderRadius: 6 }
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

  window.GAILS.openVisitReport = function(bakeryName) {
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

    titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(bakeryName) : bakeryName;
    subtitleEl.textContent = 'No routine visit has been logged for this bakery yet.';
    bodyEl.innerHTML = '';

    var actionsEl = modal.querySelector('.visit-report-header-actions');
    if (actionsEl) {
      actionsEl.innerHTML =
        '<button type="button" class="drill-close-btn visit-report-print-btn" onclick="window.print()">&#128438; Print</button>' +
        '<button class="drill-close-btn" onclick="GAILS.closeVisitReport()">&#10005; Close</button>';
    }

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeVisitReport = function() {
    var modal = document.getElementById('visitReportModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    if (window.GAILS.destroyChart) {
      window.GAILS.destroyChart(CHART_ID);
      window.GAILS.destroyChart(CQV_CHART_ID);
    }
    if (window.GAILS.closeDeleteConfirmModal) window.GAILS.closeDeleteConfirmModal();
    unlockBackgroundScroll();
  };

  document.addEventListener('click', function(event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-visit-report]') : null;
    if (trigger) {
      window.GAILS.openVisitReport(trigger.getAttribute('data-visit-report'));
      return;
    }

    var logTrigger = event.target && event.target.closest ? event.target.closest('[data-visit-report-id]') : null;
    if (logTrigger) {
      window.GAILS.openVisitReportById(logTrigger.getAttribute('data-visit-report-id'));
    }
  });

  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    window.GAILS.closeVisitReport();
  });

  var SITE_VISIT_KIND_LABELS = {
    checkin: 'Check-in',
    nboOpening: 'NBO: Opening',
    nbo2wk: 'NBO: 2WK Check-in',
    nbo4wk: 'NBO: 4WK Check-in'
  };

  function siteVisitKindLabel(v) {
    return SITE_VISIT_KIND_LABELS[v.visitKind] || 'Check-in';
  }

  function siteVisitKindTagColors(v) {
    return (v.visitKind && v.visitKind !== 'checkin')
      ? { color: 'var(--purple)', bg: 'var(--purple-d)' }
      : { color: 'var(--teal)', bg: 'var(--teal-d)' };
  }

  function visitTypeLabel(v) {
    if (v.type === 'siteVisit') return siteVisitKindLabel(v);
    if (v.type === 'cqv') return v.isFollowUp ? 'CQV Follow-Up' : 'CQV';
    return 'Routine Coffee Visit';
  }

  // Drives the "Group By" filter — Ops Manager (default), Region, or Visit
  // Type all group the same underlying visit list, just bucketed differently.
  function getVisitGroupKey(v, groupVal) {
    var G = window.GAILS;
    if (groupVal === 'region') {
      return (G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : '') || 'Unknown';
    }
    if (groupVal === 'type') {
      return visitTypeLabel(v);
    }
    return (G.getBakeryOps ? G.getBakeryOps(v.bakery) : '') || 'Unknown';
  }

  function isDateWithinMonths(dateStr, n) {
    if (n === 'currentMonth') {
      var d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return false;
      var now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    // The previous calendar year (Jan 1 - Dec 31), not a rolling 12-month
    // window from today — that's what "Last 12 Months" already covers.
    if (n === 'lastYear') {
      var d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return false;
      return d.getFullYear() === (new Date()).getFullYear() - 1;
    }

    var num = parseInt(n, 10);
    if (isNaN(num) || num === 0) return true;

    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return false;

    // Date#setMonth() overflows into the next month when the current day-of-
    // month doesn't exist N months back (e.g. May 31 minus 1 month computes
    // "April 31", which JS normalizes to May 1 — putting the cutoff AFTER
    // today and silently hiding everything). Zeroing the day first avoids
    // that entirely and aligns the cutoff to the start of the target month,
    // which also reads more intuitively for a "Last N Months" filter.
    var limit = new Date();
    limit.setDate(1);
    limit.setMonth(limit.getMonth() - num);
    limit.setHours(0, 0, 0, 0);

    return d >= limit;
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

  window.GAILS.openAddSiteVisitModal = function() {
    var modal = document.getElementById('addSiteVisitModal');
    var select = document.getElementById('addVisitBakery');
    if (!modal || !select) return;

    // Populate bakery list if it only has placeholder
    if (select.options.length <= 1 && window.GAILS.state && window.GAILS.state.BAKERIES) {
      window.GAILS.state.BAKERIES.slice().sort().forEach(function(bName) {
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

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeAddSiteVisitModal = function() {
    var modal = document.getElementById('addSiteVisitModal');
    if (!modal) return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  window.GAILS.openVisitReportById = function(visitId) {
    var record = window.GAILS._allVisitsObj ? window.GAILS._allVisitsObj[visitId] : null;
    var modal = document.getElementById('visitReportModal');
    var titleEl = document.getElementById('visitReportTitle');
    var subtitleEl = document.getElementById('visitReportSubtitle');
    var bodyEl = document.getElementById('visitReportBody');
    if (!modal || !titleEl || !subtitleEl || !bodyEl) return;

    if (!record) {
      titleEl.textContent = 'Error';
      subtitleEl.textContent = 'Visit record not found.';
      bodyEl.innerHTML = '';
      modal.style.display = 'flex';
      lockBackgroundScroll();
      return;
    }

    var actionsEl = modal.querySelector('.visit-report-header-actions');
    if (actionsEl) {
      actionsEl.innerHTML =
        '<button type="button" class="drill-close-btn visit-report-print-btn" onclick="window.print()">&#128438; Print</button>' +
        '<button class="drill-close-btn" onclick="GAILS.closeVisitReport()">&#10005; Close</button>';
    }

    if (record.type === 'cqv') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = 'Coffee Quality Visit on ' + formatVisitDate(record.date) + (record.title ? ' — ' + record.title : '');
      bodyEl.innerHTML = buildCqvReportHtml(record);

      modal.style.display = 'flex';
      lockBackgroundScroll();
      requestAnimationFrame(function() { drawCqvScoreChart(record); });
      return;
    }

    if (record.type === 'siteVisit') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = siteVisitKindLabel(record) + ' on ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');
      
      var stats = [
        { label: 'Logged By', value: record.meta && record.meta.updatedBy || '—' },
        { label: 'Coffee Partner', value: record.coffeePartner || '—' },
        { label: 'MOD', value: record.mod || '—' }
      ];
      
      var statsHtml = '<div class="drill-summary" style="margin-bottom:20px;">' + stats.map(function(c) {
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
      lockBackgroundScroll();
      return;
    }

    titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
    subtitleEl.textContent = 'Visited ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');
    bodyEl.innerHTML = buildReportHtml(record);

    modal.style.display = 'flex';
    lockBackgroundScroll();
    requestAnimationFrame(function() { drawScoreChart(record); });
  };

  window.GAILS.deleteVisit = function(visitId) {
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
    
    input.oninput = function() {
      submitBtn.disabled = input.value.trim().toLowerCase() !== 'delete record';
    };
    
    submitBtn.onclick = async function() {
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

  window.GAILS.closeDeleteConfirmModal = function() {
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
    sorted.forEach(function(item) {
      var opt = document.createElement('option');
      opt.value = item;
      opt.textContent = item;
      select.appendChild(opt);
    });
    if (itemsSet.has(currentVal)) {
      select.value = currentVal;
    }
  }

  // Regions come straight from BAKERY_META (North Region / South Region /
  // London Region) rather than being inferred from whatever visits happen
  // to be loaded, so the list is always complete and correct.
  function getVisitLogRegions() {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    return [...new Set(Object.values(meta).map(function(v) { return v.r; }))].filter(function(r) { return r && r !== 'Other'; }).sort();
  }

  // Scoped to regionVal so the Ops Manager dropdown only ever lists managers
  // that actually operate in the selected region.
  function getVisitLogOps(regionVal) {
    var G = window.GAILS;
    var meta = (G && G.BAKERY_META) || {};
    return [...new Set(Object.values(meta)
      .filter(function(v) { return !regionVal || v.r === regionVal; })
      .map(function(v) { return v.o; })
    )].filter(Boolean).sort();
  }

  function populateVisitLogFilterOptions() {
    var regionEl = document.getElementById('visitLogRegion');
    var regionVal = regionEl ? regionEl.value : '';
    populateDropdown('visitLogRegion', new Set(getVisitLogRegions()), 'All Regions');
    populateDropdown('visitLogOps', new Set(getVisitLogOps(regionVal)), 'All Managers');
    if (window.GAILS.syncCustomSelect) {
      window.GAILS.syncCustomSelect('visitLogRegion');
      window.GAILS.syncCustomSelect('visitLogOps');
    }
  }

  window.GAILS.renderVisitLog = function() {
    var container = document.getElementById('visitLogList');
    var statusEl = document.getElementById('visitLogStatus');
    if (!container) return;

    var allVisits = window.GAILS._allVisitsObj || {};
    var visitIds = Object.keys(allVisits);

    if (visitIds.length === 0) {
      if (statusEl) {
        statusEl.textContent = 'Loading check-ins...';
        statusEl.style.display = '';
      }
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

      var lastYearOption = periodEl ? periodEl.querySelector('option[value="lastYear"]') : null;
      if (lastYearOption) {
        lastYearOption.textContent = 'Last Year (' + ((new Date()).getFullYear() - 1) + ')';
      }

      if (searchEl) {
        var searchDebounceId = null;
        searchEl.addEventListener('input', function() {
          clearTimeout(searchDebounceId);
          searchDebounceId = setTimeout(function() { window.GAILS.renderVisitLog(); }, 220);
        });
      }
      if (regionEl) regionEl.addEventListener('change', function() {
        // Selected region narrowed/changed - the ops list must be rebuilt to
        // only offer managers who actually operate in that region.
        populateDropdown('visitLogOps', new Set(getVisitLogOps(regionEl.value)), 'All Managers');
        if (window.GAILS.syncCustomSelect) window.GAILS.syncCustomSelect('visitLogOps');
        window.GAILS.renderVisitLog();
      });
      if (opsEl) opsEl.addEventListener('change', function() { window.GAILS.renderVisitLog(); });
      if (periodEl) periodEl.addEventListener('change', function() { window.GAILS.renderVisitLog(); });
      var typeEl = document.getElementById('visitLogType');
      var ratingEl = document.getElementById('visitLogRating');
      if (typeEl) typeEl.addEventListener('change', function() {
        syncCqvRatingVisibility();
        window.GAILS.renderVisitLog();
      });
      if (ratingEl) ratingEl.addEventListener('change', function() { window.GAILS.renderVisitLog(); });
      syncCqvRatingVisibility();
      var groupEl = document.getElementById('visitLogGroup');
      if (groupEl) groupEl.addEventListener('change', function() { window.GAILS.renderVisitLog(); });

      // Toggle views
      document.querySelectorAll('.visit-log-toggle-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          document.querySelectorAll('.visit-log-toggle-btn').forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          window.GAILS._activeVisitLogView = btn.dataset.view;
          window.GAILS.renderVisitLog();
        });
      });

      // Add Site Visit click
      var addBtn = document.getElementById('visitLogAddBtn');
      if (addBtn) {
        addBtn.addEventListener('click', function() {
          window.GAILS.openAddSiteVisitModal();
        });
      }

      // Add Site Visit form submit
      var form = document.getElementById('addSiteVisitForm');
      if (form) {
        form.addEventListener('submit', async function(e) {
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

          try {
            if (!window.GAILS_Firebase || typeof window.GAILS_Firebase.saveSiteVisit !== 'function') {
              throw new Error('Database helper not loaded yet. Please try again.');
            }
            await window.GAILS_Firebase.saveSiteVisit(record);
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

      if (resetBtn) {
        resetBtn.addEventListener('click', function() {
          if (searchEl) searchEl.value = '';
          if (regionEl) regionEl.value = '';
          if (typeEl) typeEl.value = '';
          if (ratingEl) ratingEl.value = '';
          if (groupEl) groupEl.value = 'ops';
          if (periodEl) periodEl.value = '3'; // Default to Last 3 Months
          populateDropdown('visitLogOps', new Set(getVisitLogOps('')), 'All Managers');
          syncCqvRatingVisibility();
          if (window.GAILS.syncCustomSelect) {
            window.GAILS.syncCustomSelect('visitLogRegion');
            window.GAILS.syncCustomSelect('visitLogOps');
            window.GAILS.syncCustomSelect('visitLogType');
            window.GAILS.syncCustomSelect('visitLogRating');
            window.GAILS.syncCustomSelect('visitLogGroup');
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

      // Theme newly built dropdown options
      if (window.GAILS.initCustomSelects) {
        window.GAILS.initCustomSelects(document.querySelector('.visit-log-filters'));
      }
    }

    // Get filter values
    var searchVal = document.getElementById('visitLogSearch') ? document.getElementById('visitLogSearch').value.toLowerCase().trim() : '';
    var regionVal = document.getElementById('visitLogRegion') ? document.getElementById('visitLogRegion').value : '';
    var opsVal = document.getElementById('visitLogOps') ? document.getElementById('visitLogOps').value : '';
    var typeVal = document.getElementById('visitLogType') ? document.getElementById('visitLogType').value : '';
    var ratingVal = document.getElementById('visitLogRating') ? document.getElementById('visitLogRating').value : '';
    var groupVal = document.getElementById('visitLogGroup') ? document.getElementById('visitLogGroup').value : 'ops';
    var periodVal = document.getElementById('visitLogPeriod') ? document.getElementById('visitLogPeriod').value : '3';

    // Convert object to array
    var visitsList = visitIds.map(function(id) {
      return Object.assign({ id: id }, allVisits[id]);
    });

    var view = window.GAILS._activeVisitLogView || 'history';

    if (view === 'history') {
      // Filter history
      var filtered = visitsList.filter(function(v) {
        if (!v.bakery || !v.date) return false;

        if (searchVal) {
          var bakeryMatch = v.bakery.toLowerCase().indexOf(searchVal) !== -1;
          var partnerMatch = v.coffeePartner && v.coffeePartner.toLowerCase().indexOf(searchVal) !== -1;
          if (!bakeryMatch && !partnerMatch) return false;
        }
        if (regionVal) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(v.bakery) : 'Unknown';
          if (reg !== regionVal) return false;
        }
        if (opsVal) {
          var ops = G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown';
          if (ops !== opsVal) return false;
        }
        if (typeVal) {
          if (typeVal === 'routine' && (v.type === 'siteVisit' || v.type === 'cqv')) return false;
          if (typeVal === 'siteVisit' && !(v.type === 'siteVisit' && (v.visitKind || 'checkin') === 'checkin')) return false;
          if ((typeVal === 'nboOpening' || typeVal === 'nbo2wk' || typeVal === 'nbo4wk') && !(v.type === 'siteVisit' && v.visitKind === typeVal)) return false;
          if (typeVal === 'cqv' && !(v.type === 'cqv' && !v.isFollowUp)) return false;
          if (typeVal === 'cqvFollowUp' && !(v.type === 'cqv' && v.isFollowUp)) return false;
        }
        if (ratingVal && (v.type !== 'cqv' || cqvBand(v) !== ratingVal)) return false;
        if (!isDateWithinMonths(v.date, periodVal)) {
          return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No check-ins found matching the selected filters.</p></div>';
        return;
      }

      // Group by whatever's selected in "Group By" (Ops Manager / Region /
      // Visit Type) — same underlying list, just bucketed differently.
      var grouped = {};
      filtered.forEach(function(v) {
        var key = getVisitGroupKey(v, groupVal);
        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(v);
      });

      var groupsSorted = Object.keys(grouped).sort();
      var schema = window.GAILS_VISIT_SCHEMA;

      var html = groupsSorted.map(function(groupName) {
        var groupVisits = grouped[groupName];

        // Sort chronologically descending
        groupVisits.sort(function(a, b) {
          var dateA = a.date + 'T' + (a.time || '00:00');
          var dateB = b.date + 'T' + (b.time || '00:00');
          return dateB.localeCompare(dateA);
        });

        var visitsHtml = groupVisits.map(function(v) {
          var scoreText = '—';
          var tagsHtml = '';
          var allNotesText = '';
          var scoreColor = '#ffffff';

          if (v.type === 'siteVisit') {
            scoreText = '';
            var kindColors = siteVisitKindTagColors(v);
            tagsHtml = '<span class="visit-log-row__tag" style="color:' + kindColors.color + ';background:' + kindColors.bg + ';">' + escapeHtml(siteVisitKindLabel(v)) + '</span>';
            allNotesText = v.comments || '';
          } else if (v.type === 'cqv') {
            scoreText = (v.overallPct != null) ? v.overallPct + '%' : '—';
            tagsHtml = '<span class="visit-log-row__tag" style="color:#B22A24;background:rgba(178, 42, 36,0.15);">' + (v.isFollowUp ? 'CQV Follow-Up' : 'CQV') + '</span>';
            allNotesText = v.summary || '';
            var band = cqvBand(v);
            var bandColor = cqvBandColor(band);
            if (bandColor) {
              scoreColor = bandColor;
            }
          } else {
            scoreText = (v.score != null) ? v.score + ' / ' + (v.scoreMax != null ? v.scoreMax : '—') : '—';
            scoreColor = 'var(--text)';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--gold);background:var(--gold-d);">Routine Coffee Visit</span>';
            if (schema && schema.sections) {
              schema.sections.forEach(function(sec) {
                var secData = v[sec.key] || {};
                var comment = secData.comments;
                if (comment && comment.trim()) {
                  if (allNotesText) allNotesText += ' | ';
                  allNotesText += comment.trim();
                }
              });
            }
          }

          if (!allNotesText) {
            allNotesText = 'No notes recorded.';
          }

          var previewText = allNotesText;
          if (previewText.length > 120) {
            previewText = previewText.substring(0, 120) + '...';
          }

          var dateLabel = formatVisitDate(v.date);
          var shortDate = dateLabel.split(', ')[1] || dateLabel;
          var bakeryLabel = G.getBakeryMapLabel ? G.getBakeryMapLabel(v.bakery) : v.bakery;
          var partnerColText = v.type === 'cqv' ? (v.auditorName || '—') : (v.coffeePartner || '—');
          // The row always shows the actual Ops Manager regardless of the
          // active grouping — grouping by Region/Visit Type would otherwise
          // lose that context entirely.
          var rowOpsLabel = groupVal === 'ops' ? groupName : (G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown');

          return '<div class="visit-log-row" data-visit-report-id="' + escapeHtml(v.id) + '" aria-label="Visit report for ' + escapeHtml(bakeryLabel) + '">' +
            '<div class="visit-log-row__date-col">' +
              '<span class="visit-log-row__date">' + escapeHtml(shortDate) + '</span>' +
              '<span class="visit-log-row__time">' + escapeHtml(v.time || '—') + '</span>' +
            '</div>' +
            '<div class="visit-log-row__bakery-col">' +
              '<h3 class="visit-log-row__bakery">' + escapeHtml(bakeryLabel) + '</h3>' +
              '<span class="visit-log-row__manager">Ops: ' + escapeHtml(rowOpsLabel) + '</span>' +
            '</div>' +
            '<div class="visit-log-row__partner" title="' + escapeHtml(v.type === 'cqv' ? 'Auditor: ' + partnerColText : partnerColText) + '">' + escapeHtml(partnerColText) + '</div>' +
            '<div class="visit-log-row__score-col" style="color:' + scoreColor + ';">' + escapeHtml(scoreText) + '</div>' +
            '<div class="visit-log-row__notes-col">' +
              '<div class="visit-log-row__tags">' + tagsHtml + '</div>' +
              '<p class="visit-log-row__notes-preview" title="' + escapeHtml(allNotesText) + '">' + escapeHtml(previewText) + '</p>' +
            '</div>' +
            '<div class="visit-log-row__action-col">' +
              '<button type="button" class="visit-log-row__btn">View Report</button>' +
            '</div>' +
          '</div>';
        }).join('');

        return '<div class="unvisited-manager-section">' +
          '<h3 class="unvisited-manager-title">' + escapeHtml(groupName) + ' (' + groupVisits.length + ' visits)</h3>' +
          '<div style="display:flex; flex-direction:column; gap:10px;">' +
            visitsHtml +
          '</div>' +
        '</div>';
      }).join('');

      container.innerHTML = html;
    } else if (view === 'unvisited') {
      // Determine which sites are unvisited in periodVal
      var visitedBakeries = new Set();
      visitsList.forEach(function(v) {
        if (v.bakery && v.date && isDateWithinMonths(v.date, periodVal)) {
          visitedBakeries.add(v.bakery);
        }
      });

      var allBakeries = G.state && G.state.BAKERIES || [];
      var unvisitedMap = {};
      var totalUnvisited = 0;

      allBakeries.forEach(function(bName) {
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

        if (!visitedBakeries.has(bName)) {
          var manager = G.getBakeryOps ? G.getBakeryOps(bName) : 'Unknown';
          if (!unvisitedMap[manager]) {
            unvisitedMap[manager] = [];
          }
          unvisitedMap[manager].push(bName);
          totalUnvisited++;
        }
      });

      if (totalUnvisited === 0) {
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#127881;</div><p>All bakeries have been visited in this period!</p></div>';
        return;
      }

      var managersSorted = Object.keys(unvisitedMap).sort();
      var html = managersSorted.map(function(mName) {
        var bakeries = unvisitedMap[mName].sort();
        var count = bakeries.length;
        
        var bakeryCardsHtml = bakeries.map(function(bName) {
          var reg = G.getBakeryRegion ? G.getBakeryRegion(bName) : '—';
          return '<div class="unvisited-bakery-item">' +
            '<div style="font-weight:700; color:var(--text);">' + escapeHtml(bName) + '</div>' +
            '<div style="font-size:0.72rem; color:var(--muted-l); margin-top:2px;">' + escapeHtml(reg) + '</div>' +
          '</div>';
        }).join('');

        return '<div class="unvisited-manager-section">' +
          '<h3 class="unvisited-manager-title">' + escapeHtml(mName) + ' (' + count + ' unvisited)</h3>' +
          '<div class="unvisited-bakeries-grid">' +
            bakeryCardsHtml +
          '</div>' +
        '</div>';
      }).join('');

      container.innerHTML = html;
    }
  };
})();

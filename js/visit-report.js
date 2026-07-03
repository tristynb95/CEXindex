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

    return '<div class="visit-report-section' + (isHs ? ' visit-report-section--hs' : '') + '">' +
      '<h4>' + escapeHtml(section.title) + (isHs ? ' <span class="visit-report-hs-tag">Health &amp; Safety</span>' : '') + '</h4>' +
      rows.join('') + comments + photos +
    '</div>';
  }

  function buildHsSummaryHtml(hsIssues) {
    if (!hsIssues.length) {
      return '<div class="visit-report-hs-banner visit-report-hs-banner--ok">' +
        '&#9989; No Health &amp; Safety issues found on this visit.' +
      '</div>';
    }
    return '<div class="visit-report-hs-banner visit-report-hs-banner--alert">' +
      '<strong>&#9888; ' + hsIssues.length + ' Health &amp; Safety issue' + (hsIssues.length === 1 ? '' : 's') + ' found:</strong>' +
      '<ul>' + hsIssues.map(function(label) { return '<li>' + escapeHtml(label) + '</li>'; }).join('') + '</ul>' +
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
      ? '<div class="visit-report-chart-wrap"><canvas id="' + CHART_ID + '"></canvas></div>'
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
          { label: 'Points Earned', data: earned, backgroundColor: '#00C875', borderRadius: 6 },
          { label: 'Points Possible', data: max, backgroundColor: 'rgba(150,150,200,0.25)', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' } }
        },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  window.GAILS.openVisitReport = function(bakeryName) {
    var record = window.GAILS.getLastVisitRecord ? window.GAILS.getLastVisitRecord(bakeryName) : null;
    var modal = document.getElementById('visitReportModal');
    var titleEl = document.getElementById('visitReportTitle');
    var subtitleEl = document.getElementById('visitReportSubtitle');
    var bodyEl = document.getElementById('visitReportBody');
    if (!modal || !titleEl || !subtitleEl || !bodyEl) return;

    if (!record) {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(bakeryName) : bakeryName;
      subtitleEl.textContent = 'No routine visit has been logged for this bakery yet.';
      bodyEl.innerHTML = '';
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

  window.GAILS.closeVisitReport = function() {
    var modal = document.getElementById('visitReportModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    if (window.GAILS.destroyChart) window.GAILS.destroyChart(CHART_ID);
    unlockBackgroundScroll();
  };

  document.addEventListener('click', function(event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-visit-report]') : null;
    if (!trigger) return;
    window.GAILS.openVisitReport(trigger.getAttribute('data-visit-report'));
  });

  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    window.GAILS.closeVisitReport();
  });
})();

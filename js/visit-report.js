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

  function isDateWithinMonths(dateStr, n) {
    if (n === 'currentMonth') {
      var d = new Date(dateStr + 'T00:00:00');
      if (isNaN(d.getTime())) return false;
      var now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    
    var num = parseInt(n, 10);
    if (isNaN(num) || num === 0) return true;
    
    var d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return false;
    
    var limit = new Date();
    limit.setMonth(limit.getMonth() - num);
    limit.setHours(0, 0, 0, 0);
    
    return d >= limit;
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
      var deleteHtml = '';
      if (window.GAILS.isAdmin) {
        deleteHtml = '<button type="button" class="drill-close-btn visit-report-delete-btn" style="background:#4A1521; color:#FF4A70; border-color:rgba(255,74,112,0.2); margin-right:8px;" onclick="GAILS.deleteVisit(\'' + escapeHtml(visitId) + '\')">&#128465; Delete</button>';
      }
      actionsEl.innerHTML = deleteHtml +
        '<button type="button" class="drill-close-btn visit-report-print-btn" onclick="window.print()">&#128438; Print</button>' +
        '<button class="drill-close-btn" onclick="GAILS.closeVisitReport()">&#10005; Close</button>';
    }

    if (record.type === 'siteVisit') {
      titleEl.textContent = window.GAILS.getBakeryMapLabel ? window.GAILS.getBakeryMapLabel(record.bakery) : record.bakery;
      subtitleEl.textContent = 'Site Visit on ' + formatVisitDate(record.date) + (record.time ? ' at ' + record.time : '');
      
      var stats = [
        { label: 'Logged By', value: record.meta && record.meta.updatedBy || '—' },
        { label: 'Coffee Partner', value: record.coffeePartner || '—' },
        { label: 'MOD', value: record.mod || '—' }
      ];
      
      var statsHtml = '<div class="drill-summary" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:15px; margin-bottom:20px;">' + stats.map(function(c) {
        return '<div class="drill-card" style="padding:15px; background:rgba(255,255,255,0.02); border:1px solid var(--card-border); border-radius:10px;"><div class="drill-card__label" style="font-size:0.72rem; text-transform:uppercase; color:var(--muted-l); margin-bottom:4px;">' + escapeHtml(c.label) + '</div>' +
          '<div class="drill-card__value" style="font-size:1.05rem; font-weight:700; color:var(--text);">' + escapeHtml(c.value) + '</div></div>';
      }).join('') + '</div>';

      bodyEl.innerHTML = statsHtml + 
        '<div class="visit-report-section" style="margin-top:20px; background:rgba(255,255,255,0.01); border:1px solid var(--card-border); border-radius:12px; padding:20px;">' +
          '<h4 style="margin-top:0; margin-bottom:10px; font-size:0.95rem; font-weight:700; color:var(--accent);">Visit Comments</h4>' +
          '<p class="visit-report-comment" style="font-size:1rem; line-height:1.6; color:var(--text-2); white-space:pre-wrap; margin:0;">' + escapeHtml(record.comments || 'No comments recorded.') + '</p>' +
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
    
    promptText.textContent = 'Are you sure you want to permanently delete the visit log for ' + bakeryName + (dateText ? ' on ' + dateText : '') + '?';
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
        alert(err.message || 'Failed to delete visit log.');
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
        statusEl.textContent = 'Loading visit logs...';
        statusEl.style.display = '';
      }
      container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No visit logs loaded yet.</p></div>';
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
              errorEl.textContent = err.message || 'Failed to save visit log.';
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
          if (periodEl) periodEl.value = '3'; // Default to Last 3 Months
          populateDropdown('visitLogOps', new Set(getVisitLogOps('')), 'All Managers');
          if (window.GAILS.syncCustomSelect) {
            window.GAILS.syncCustomSelect('visitLogRegion');
            window.GAILS.syncCustomSelect('visitLogOps');
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
          if (v.bakery.toLowerCase().indexOf(searchVal) === -1) return false;
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

      if (filtered.length === 0) {
        container.innerHTML = '<div class="visit-log-empty"><div class="visit-log-empty__icon">&#128196;</div><p>No visit logs found matching the selected filters.</p></div>';
        return;
      }

      // Group by Ops Manager
      var grouped = {};
      filtered.forEach(function(v) {
        var ops = G.getBakeryOps ? G.getBakeryOps(v.bakery) : 'Unknown';
        if (!grouped[ops]) {
          grouped[ops] = [];
        }
        grouped[ops].push(v);
      });

      var managersSorted = Object.keys(grouped).sort();
      var schema = window.GAILS_VISIT_SCHEMA;

      var html = managersSorted.map(function(mName) {
        var managerVisits = grouped[mName];
        
        // Sort chronologically descending
        managerVisits.sort(function(a, b) {
          var dateA = a.date + 'T' + (a.time || '00:00');
          var dateB = b.date + 'T' + (b.time || '00:00');
          return dateB.localeCompare(dateA);
        });

        var visitsHtml = managerVisits.map(function(v) {
          var scoreText = '—';
          var tagsHtml = '';
          var allNotesText = '';

          if (v.type === 'siteVisit') {
            scoreText = '—';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--gold);background:var(--gold-d);">Visit Log</span>';
            allNotesText = v.comments || '';
          } else {
            scoreText = (v.score != null) ? v.score + ' / ' + (v.scoreMax != null ? v.scoreMax : '—') : '—';
            tagsHtml = '<span class="visit-log-row__tag" style="color:var(--teal);background:var(--teal-d);">Routine Coffee Visit</span>';
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

          return '<div class="visit-log-row" data-visit-report-id="' + escapeHtml(v.id) + '" aria-label="Visit report for ' + escapeHtml(bakeryLabel) + '">' +
            '<div class="visit-log-row__date-col">' +
              '<span class="visit-log-row__date">' + escapeHtml(shortDate) + '</span>' +
              '<span class="visit-log-row__time">' + escapeHtml(v.time || '—') + '</span>' +
            '</div>' +
            '<div class="visit-log-row__bakery-col">' +
              '<h3 class="visit-log-row__bakery">' + escapeHtml(bakeryLabel) + '</h3>' +
              '<span class="visit-log-row__manager">Ops: ' + escapeHtml(mName) + '</span>' +
            '</div>' +
            '<div class="visit-log-row__partner" title="' + escapeHtml(v.coffeePartner || '—') + '">' + escapeHtml(v.coffeePartner || '—') + '</div>' +
            '<div class="visit-log-row__score-col">' + escapeHtml(scoreText) + '</div>' +
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
          '<h3 class="unvisited-manager-title">' + escapeHtml(mName) + ' (' + managerVisits.length + ' visits)</h3>' +
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

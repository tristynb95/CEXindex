// ========== DRILL-DOWN MODAL MODULE ==========
window.GAILS = window.GAILS || {};

(function() {
  var lockedScrollY = 0;
  var drillReturnFocus = null;

  var escapeHtml = GAILS.escapeHtml;

  function metricText(value, suffix) {
    if (value === null || value === undefined || isNaN(value)) return escapeHtml('—');
    return escapeHtml(value + (suffix || ''));
  }

  function renderSummaryCard(label, value, meta) {
    return '<div class="drill-card">' +
      '<div class="drill-card__label">' + escapeHtml(label) + '</div>' +
      '<div class="drill-card__value">' + escapeHtml(value) + '</div>' +
      (meta ? '<div class="drill-card__meta">' + escapeHtml(meta) + '</div>' : '') +
      '</div>';
  }

  function average(rows, field) {
    if (!rows.length) return 0;
    return Math.round(rows.reduce(function(sum, row) { return sum + Number(row[field] || 0); }, 0) / rows.length);
  }

  function renderOverviewSummary(rows) {
    var highest = rows.length ? rows.reduce(function(best, row) {
      return Number(row.ac || 0) > Number(best.ac || 0) ? row : best;
    }, rows[0]) : null;

    return '<section class="drill-insight-section" aria-labelledby="drillSummaryHeading">' +
      '<div class="drill-section-heading">' +
        '<div><span class="drill-section-kicker">At a glance</span>' +
        '<h4 id="drillSummaryHeading">Performance snapshot</h4></div>' +
        '<p>Use the table below to compare bakeries and open a bakery profile.</p>' +
      '</div>' +
      '<div class="drill-summary">' +
        renderSummaryCard('Bakeries', rows.length, 'in this segment') +
        renderSummaryCard('Avg Benchmark Score', average(rows, 'ac'), 'across this group') +
        renderSummaryCard('Avg NPS (D+M)', average(rows, 'n'), 'drink + meal') +
        renderSummaryCard('Highest score', highest ? metricText(highest.ac) : '—', highest ? highest.b : '') +
      '</div>' +
      '</section>';
  }

  function renderBandPill(G, band) {
    return '<span class="band ' + escapeHtml(G.bc(band)) + '">' + escapeHtml(band) + '</span>';
  }

  function renderConfidence(confidence) {
    return '<span class="conf ' + escapeHtml(window.GAILS.bc(confidence)) + '">' + escapeHtml(confidence) + '</span>';
  }

  // RAG thresholds matched to the league table (window.GAILS.renderLeagueTable)
  function stdRagColor(value) { return value >= 90 ? 'var(--green)' : value >= 80 ? 'var(--amber)' : 'var(--red)'; }
  function s2RagColor(value) { return value >= 70 ? 'var(--green)' : value >= 60 ? 'var(--amber)' : 'var(--red)'; }
  function o5RagColor(value) { return value >= 2.5 ? 'var(--red)' : value > 1 ? 'var(--amber)' : 'var(--green)'; }

  function renderRagMetric(value, suffix, colorFn) {
    return '<span style="color:' + colorFn(value) + '">' + metricText(value, suffix) + '</span>';
  }

  function ragMetricColumns() {
    return [
      { label: 'Quality', render: function(row) { return renderRagMetric(row.dr, '%', stdRagColor); } },
      { label: 'Efficiency', render: function(row) { return renderRagMetric(row.ef, '%', stdRagColor); } },
      {
        label: 'Friendliness',
        className: 'drill-column--friendliness',
        render: function(row) { return renderRagMetric(row.fr, '%', stdRagColor); }
      },
      { label: 'Overall', render: function(row) { return renderRagMetric(row.ov, '%', stdRagColor); } },
      { label: '≤2m', render: function(row) { return renderRagMetric(row.s2, '%', s2RagColor); } },
      { label: '>5m', render: function(row) { return renderRagMetric(row.o5, '%', o5RagColor); } }
    ];
  }

  function detailMetricColumns() {
    return ragMetricColumns().map(function(column, index) {
      // Quality, Efficiency and Friendliness are the most actionable drivers,
      // so keep those in the compact view. Overall and timing remain optional.
      column.detail = index > 2;
      return column;
    });
  }

  function renderRows(G, rows, columns) {
    return rows.map(function(row, index) {
      return '<tr>' + columns.map(function(column) {
        var classes = [];
        if (column.detail) classes.push('drill-detail-column');
        if (column.className) classes.push(column.className);
        return '<td' + (classes.length ? ' class="' + escapeHtml(classes.join(' ')) + '"' : '') + ' data-label="' +
          escapeHtml(column.label) + '">' + column.render(row, index, G) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function renderTableControls(isAnchor, rowCount) {
    return '<div class="drill-controls"' + (isAnchor ? ' data-table-fullscreen-anchor="true"' : '') + '>' +
      '<div class="drill-controls-heading">' +
        '<span class="drill-section-kicker">Bakery comparison</span>' +
        '<div><h4>Compare performance</h4><span class="drill-result-count" aria-live="polite">' +
          escapeHtml(rowCount) + ' bakeries</span></div>' +
      '</div>' +
      '<div class="drill-controls-actions">' +
        '<label class="drill-search"><span class="sr-only">Search bakeries</span>' +
          '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>' +
          '<input type="search" data-drill-search placeholder="Search bakery or area" autocomplete="off">' +
        '</label>' +
        '<button type="button" class="drill-view-toggle" data-drill-toggle-details aria-pressed="false">Show all metrics</button>' +
      '</div>' +
      '<div class="drill-sort-hint"><strong>&#8597;</strong> Select a heading to sort</div>' +
      '</div>';
  }

  function renderTableWrap(G, columns, rows) {
    return '<div class="drill-table-wrap" role="region" aria-label="Bakery comparison table" tabindex="0">' +
      '<table class="drill-table drill-table--key" data-table-fullscreen="off"><thead><tr>' +
      columns.map(function(column) { return '<th scope="col"' +
        ((column.detail || column.className) ? ' class="' + escapeHtml([
          column.detail ? 'drill-detail-column' : '',
          column.className || ''
        ].filter(Boolean).join(' ')) + '"' : '') + '>' + escapeHtml(column.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      renderRows(G, rows, columns) +
      '</tbody></table>' +
      '<div class="drill-empty-state" hidden>No bakeries match that search.</div>' +
      '</div>';
  }

  function renderTable(G, columns, rows) {
    return renderTableControls(false, rows.length) + renderTableWrap(G, columns, rows);
  }

  function parseNpsRange(title) {
    // Titles arrive as "NPS 60–70" or, since the Drink + Meal relabel, "NPS (D+M) 60–70".
    var match = /^NPS(?:\s*\(D\+M\))?\s+(-?\d+)(?:\s*[–-]\s*(-?\d+))?$/i.exec(title || '');
    if (!match) return null;
    return {
      min: parseFloat(match[1]),
      max: match[2] !== undefined ? parseFloat(match[2]) : parseFloat(match[1])
    };
  }

  function getDrillAccent(G, title, type) {
    if (G.COL[title]) return G.COL[title];
    if (G.ABSCOL[title]) return G.ABSCOL[title];
    if (type === 'nps') {
      var range = parseNpsRange(title);
      if (range) {
        if (range.min >= 60) return G.COL['Top Performance'];
        if (range.min >= 50) return G.COL['Above Average'];
        return G.COL['Low Performance'];
      }
      return G.COL['Above Average'];
    }
    if (type === 'relative') return '#B22A24';
    return '#0E8074';
  }

  function commonColumns() {
    return [
      {
        label: '#',
        render: function(row, index) {
          return '<span class="drill-rank-cell">' + (index + 1) + '</span>';
        }
      },
      {
        label: 'Bakery',
        className: 'drill-column--bakery',
        render: function(row) {
          return '<span class="drill-cell-strong">' + GAILS.bakeryProfileLink(row.b, {
            returnUrl: 'index.html#overview',
            returnLabel: 'Overview'
          }) + '</span>';
        }
      },
      {
        label: 'Region',
        detail: true,
        render: function(row, index, G) {
          return '<span class="drill-cell-meta">' + escapeHtml(G.getBakeryRegion(row.b)) + '</span>';
        }
      },
      {
        label: 'Ops Area',
        detail: true,
        render: function(row, index, G) {
          return '<span class="drill-cell-meta">' + escapeHtml(G.getBakeryOps(row.b)) + '</span>';
        }
      }
    ];
  }

  function getModal() {
    return document.getElementById('drillModal');
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

  function resetDrillScroll() {
    var modal = getModal();
    var body = document.getElementById('drillBody');
    if (modal) modal.scrollTop = 0;
    if (body) body.scrollTop = 0;
    var wrap = body ? body.querySelector('.drill-table-wrap') : null;
    if (wrap) {
      wrap.scrollTop = 0;
      wrap.scrollLeft = 0;
    }
  }

  function setupDrillControls(body) {
    if (!body || !body.querySelector || !body.querySelectorAll) return;
    var search = body.querySelector('[data-drill-search]');
    var toggle = body.querySelector('[data-drill-toggle-details]');
    var count = body.querySelector('.drill-result-count');
    var empty = body.querySelector('.drill-empty-state');
    var rows = Array.prototype.slice.call(body.querySelectorAll('.drill-table tbody tr'));

    if (search && search.addEventListener) {
      search.addEventListener('input', function() {
        var query = search.value.trim().toLowerCase();
        var visible = 0;
        rows.forEach(function(row) {
          var matches = !query || row.textContent.toLowerCase().indexOf(query) !== -1;
          row.hidden = !matches;
          if (matches) visible += 1;
        });
        if (count) count.textContent = visible + (visible === 1 ? ' bakery' : ' bakeries');
        if (empty) empty.hidden = visible !== 0;
      });
    }

    if (toggle && toggle.addEventListener) {
      toggle.addEventListener('click', function() {
        var expanded = toggle.getAttribute('aria-pressed') !== 'true';
        toggle.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        toggle.textContent = expanded ? 'Show key metrics' : 'Show all metrics';
        body.classList.toggle('drill-show-details', expanded);
      });
    }
  }

  function trapDrillFocus(event, modal) {
    if (event.key !== 'Tab' || !modal.querySelectorAll) return;
    var focusable = Array.prototype.slice.call(modal.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter(function(element) { return !element.hidden && element.offsetParent !== null; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  window.GAILS.closeDrillDown = function() {
    var modal = getModal();
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
    if (drillReturnFocus && drillReturnFocus.focus) drillReturnFocus.focus();
    drillReturnFocus = null;
  };

  document.addEventListener('keydown', function(event) {
    var modal = getModal();
    if (!modal || modal.style.display === 'none') return;
    if (event.key === 'Escape') window.GAILS.closeDrillDown();
    else trapDrillFocus(event, modal);
  });

  window.GAILS.showDrillDown = function(title, subtitle, bakeries, type) {
    var G = GAILS;
    var modal = document.getElementById('drillModal');
    var inner = modal.querySelector('.drillInner');
    var header = document.getElementById('drillHeader');
    var titleEl = document.getElementById('drillTitle');
    var subtitleEl = document.getElementById('drillSubtitle');
    var eyebrowEl = document.getElementById('drillEyebrow');
    var countEl = document.getElementById('drillHeaderCount');
    var body = document.getElementById('drillBody');
    var accent = getDrillAccent(G, title, type);

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    if (eyebrowEl) eyebrowEl.textContent = type === 'nps' ? 'NPS segment' : 'Overview segment';
    if (countEl) countEl.textContent = bakeries.length + (bakeries.length === 1 ? ' bakery' : ' bakeries');
    // Colour carries meaning through the top accent border only — the header
    // itself stays a clean white surface (Focus Bakery modal template style).
    header.style.background = '';
    if (inner) inner.style.setProperty('--drill-accent', accent);

    var baseColumns = commonColumns();
    var content = '';

    if (type === 'nps') {
      var npsSorted = [].concat(bakeries).sort(function(a, b) { return b.n - a.n; });

      var npsColumns = baseColumns.concat([
        {
          label: 'NPS (D+M)',
          className: 'drill-column--nps',
          render: function(row) { return '<span class="drill-cell-strong">' + metricText(row.n) + '</span>'; }
        },
        {
          label: 'Benchmark Score',
          className: 'drill-column--benchmark',
          render: function(row) { return metricText(row.ac); }
        },
        {
          label: 'Benchmark Band',
          detail: true,
          render: function(row) { return renderBandPill(G, row.acb); }
        },
        {
          label: 'Company Rank',
          detail: true,
          render: function(row) { return row.companyRank ? row.companyRank + ' of ' + row.companyCohortSize : '—'; }
        }
      ].concat(detailMetricColumns()).concat([
        {
          label: 'Conf',
          className: 'drill-column--confidence',
          detail: true,
          render: function(row) { return renderConfidence(row.co); }
        }
      ]));

      content += renderOverviewSummary(npsSorted);
      content += renderTable(G, npsColumns, npsSorted);
    } else {
      var absSorted = [].concat(bakeries).sort(function(a, b) { return b.ac - a.ac; });
      content += renderOverviewSummary(absSorted);
      content += renderTable(G, baseColumns.concat([
        {
          label: 'Benchmark Score',
          className: 'drill-column--benchmark',
          render: function(row) { return '<span class="drill-cell-strong">' + metricText(row.ac) + '</span>'; }
        },
        {
          label: 'Company Rank',
          detail: true,
          render: function(row) { return row.companyRank ? row.companyRank + ' of ' + row.companyCohortSize : '—'; }
        },
        {
          label: 'NPS (D+M)',
          className: 'drill-column--nps',
          render: function(row) { return metricText(row.n); }
        }
      ]).concat(detailMetricColumns()).concat([
        {
          label: 'Conf',
          className: 'drill-column--confidence',
          detail: true,
          render: function(row) { return renderConfidence(row.co); }
        }
      ]), absSorted);
    }

    body.innerHTML = content;
    drillReturnFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    lockBackgroundScroll();
    modal.style.display = 'flex';
    resetDrillScroll();
    G.makeSortable(body);
    setupDrillControls(body);
    var firstControl = modal.querySelector('[data-drill-search]') || modal.querySelector('.drill-close-btn');
    if (firstControl && firstControl.focus) firstControl.focus();
  };
})();

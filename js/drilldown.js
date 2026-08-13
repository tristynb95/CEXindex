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

  // One toolbar row: the segment's headline stats on the left, the controls
  // that act on the table on the right. This replaces what used to be a
  // separate "At a glance" section stacked above a separate controls block —
  // now the panel fills the workspace, that stack cost ~140px of height that
  // the comparison table can use instead.
  function renderDrillToolbar(rows) {
    var highest = rows.length ? rows.reduce(function(best, row) {
      return Number(row.ac || 0) > Number(best.ac || 0) ? row : best;
    }, rows[0]) : null;

    return '<div class="drill-toolbar">' +
      '<div class="drill-summary">' +
        // The Bakeries card is the live count: searching narrows it, and its
        // meta line picks up "of N" so the segment total is still there. A
        // separate count chip next to the search box would have made four
        // copies of the same number, with the header badge and subtitle.
        '<div class="drill-card"><div class="drill-card__label">Bakeries</div>' +
          '<div class="drill-card__value" data-drill-count aria-live="polite">' + escapeHtml(rows.length) + '</div>' +
          '<div class="drill-card__meta" data-drill-count-meta>in this segment</div></div>' +
        renderSummaryCard('Avg Benchmark Score', average(rows, 'ac'), 'across this group') +
        renderSummaryCard('Avg NPS (D+M)', average(rows, 'n'), 'drink + meal') +
        renderSummaryCard('Highest score', highest ? metricText(highest.ac) : '—', highest ? highest.b : '') +
      '</div>' +
      '<div class="drill-toolbar__actions">' +
        '<span class="drill-sort-hint"><strong>&#8597;</strong> Select a heading to sort</span>' +
        '<label class="drill-search"><span class="sr-only">Search bakeries</span>' +
          '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>' +
          '<input type="search" data-drill-search placeholder="Search bakery or area" autocomplete="off">' +
        '</label>' +
        '<button type="button" class="drill-view-toggle" data-drill-toggle-details aria-pressed="false">Show all metrics</button>' +
      '</div>' +
      '</div>';
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
    return renderDrillToolbar(rows) + renderTableWrap(G, columns, rows);
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
            returnLabel: 'Overview',
            isGroup: row.isGroup
          }) + '</span>';
        }
      },
      {
        label: 'Region',
        detail: true,
        render: function(row, index, G) {
          var region = row.isGroup ? (row.region || '—') : G.getBakeryRegion(row.b);
          return '<span class="drill-cell-meta">' + escapeHtml(region) + '</span>';
        }
      },
      {
        label: 'Ops Area',
        detail: true,
        render: function(row, index, G) {
          if (row.isGroup) {
            var opsLabel = row.groupType === 'ops' ? (row.memberCount + (row.memberCount === 1 ? ' bakery' : ' bakeries')) : '—';
            return '<span class="drill-cell-meta">' + escapeHtml(opsLabel) + '</span>';
          }
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
    var count = body.querySelector('[data-drill-count]');
    var countMeta = body.querySelector('[data-drill-count-meta]');
    var empty = body.querySelector('.drill-empty-state');
    var rows = Array.prototype.slice.call(body.querySelectorAll('.drill-table tbody tr'));
    var total = rows.length;

    if (search && search.addEventListener) {
      search.addEventListener('input', function() {
        var query = search.value.trim().toLowerCase();
        var visible = 0;
        rows.forEach(function(row) {
          var matches = !query || row.textContent.toLowerCase().indexOf(query) !== -1;
          row.hidden = !matches;
          if (matches) visible += 1;
        });
        if (count) count.textContent = visible;
        if (countMeta) countMeta.textContent = visible === total ? 'in this segment' : 'of ' + total + ' in this segment';
        if (empty) empty.hidden = visible !== 0;
      });
    }

    function setDetailColumns(expanded) {
      toggle.setAttribute('aria-pressed', expanded ? 'true' : 'false');
      toggle.textContent = expanded ? 'Show key metrics' : 'Show all metrics';
      body.classList.toggle('drill-show-details', expanded);
    }

    if (toggle && toggle.addEventListener) {
      // The panel now fills the workspace, so on a desktop screen the full
      // metric set fits without horizontal scroll — open on it rather than
      // making people find the toggle. Narrower screens still start compact.
      var fitsAllMetrics = !!(window.matchMedia && window.matchMedia('(min-width: 1280px)').matches);
      setDetailColumns(fitsAllMetrics);
      toggle.addEventListener('click', function() {
        setDetailColumns(toggle.getAttribute('aria-pressed') !== 'true');
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

      content += renderTable(G, npsColumns, npsSorted);
    } else {
      var absSorted = [].concat(bakeries).sort(function(a, b) { return b.ac - a.ac; });
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

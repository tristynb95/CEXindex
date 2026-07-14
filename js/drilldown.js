// ========== DRILL-DOWN MODAL MODULE ==========
window.GAILS = window.GAILS || {};

(function() {
  var lockedScrollY = 0;

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function metricText(value, suffix) {
    if (value === null || value === undefined || isNaN(value)) return escapeHtml('â€”');
    return escapeHtml(value + (suffix || ''));
  }

  function renderSummaryCard(label, value) {
    return '<div class="drill-card">' +
      '<div class="drill-card__label">' + escapeHtml(label) + '</div>' +
      '<div class="drill-card__value">' + escapeHtml(value) + '</div>' +
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
  function s2RagColor(value) { return value >= 75 ? 'var(--green)' : value >= 60 ? 'var(--amber)' : 'var(--red)'; }
  function o5RagColor(value) { return value >= 2.5 ? 'var(--red)' : value > 1 ? 'var(--amber)' : 'var(--green)'; }

  function renderRagMetric(value, suffix, colorFn) {
    return '<span style="color:' + colorFn(value) + '">' + metricText(value, suffix) + '</span>';
  }

  function ragMetricColumns() {
    return [
      { label: 'Quality', render: function(row) { return renderRagMetric(row.dr, '%', stdRagColor); } },
      { label: 'Efficiency', render: function(row) { return renderRagMetric(row.ef, '%', stdRagColor); } },
      { label: 'Friendliness', render: function(row) { return renderRagMetric(row.fr, '%', stdRagColor); } },
      { label: 'Overall', render: function(row) { return renderRagMetric(row.ov, '%', stdRagColor); } },
      { label: '≤2m', render: function(row) { return renderRagMetric(row.s2, '%', s2RagColor); } },
      { label: '>5m', render: function(row) { return renderRagMetric(row.o5, '%', o5RagColor); } }
    ];
  }

  function renderRows(G, rows, columns) {
    return rows.map(function(row, index) {
      return '<tr>' + columns.map(function(column) {
        return '<td>' + column.render(row, index, G) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  function renderTableControls(isAnchor) {
    return '<div class="drill-controls"' + (isAnchor ? ' data-table-fullscreen-anchor="true"' : '') + '>' +
      '<div class="drill-sort-hint"><strong>&#8597;</strong> Click any column to sort, then click again to reverse</div>' +
      '</div>';
  }

  function renderTableWrap(G, columns, rows) {
    return '<div class="drill-table-wrap">' +
      '<table class="drill-table"><thead><tr>' +
      columns.map(function(column) { return '<th scope="col">' + escapeHtml(column.label) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      renderRows(G, rows, columns) +
      '</tbody></table>' +
      '</div>';
  }

  function renderTable(G, columns, rows) {
    return renderTableControls(true) + renderTableWrap(G, columns, rows);
  }

  function colorWithAlpha(hex, alpha) {
    var match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!match) return 'rgba(178, 42, 36,' + alpha + ')';
    return 'rgba(' + parseInt(match[1], 16) + ',' + parseInt(match[2], 16) + ',' + parseInt(match[3], 16) + ',' + alpha + ')';
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
        if (range.min >= 60) return G.COL['Top Performer'];
        if (range.min >= 50) return G.COL['Above Average'];
        return G.COL['Needs Support'];
      }
      return G.COL['Above Average'];
    }
    if (type === 'relative') return '#B22A24';
    return '#0E8074';
  }

  function getHeaderBackground(accent) {
    return 'linear-gradient(180deg, ' + colorWithAlpha(accent, 0.18) + ' 0%, rgba(34, 31, 26,0.01) 100%)';
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
        render: function(row) {
          return '<span class="drill-cell-strong">' + escapeHtml(row.b) + '</span>';
        }
      },
      {
        label: 'Region',
        render: function(row, index, G) {
          return '<span class="drill-cell-meta">' + escapeHtml(G.getBakeryRegion(row.b)) + '</span>';
        }
      },
      {
        label: 'Ops Manager',
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

  window.GAILS.closeDrillDown = function() {
    var modal = getModal();
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    var modal = getModal();
    if (!modal || modal.style.display === 'none') return;
    window.GAILS.closeDrillDown();
  });

  window.GAILS.showDrillDown = function(title, subtitle, bakeries, type) {
    var G = GAILS;
    var modal = document.getElementById('drillModal');
    var inner = modal.querySelector('.drillInner');
    var header = document.getElementById('drillHeader');
    var titleEl = document.getElementById('drillTitle');
    var subtitleEl = document.getElementById('drillSubtitle');
    var body = document.getElementById('drillBody');
    var accent = getDrillAccent(G, title, type);

    titleEl.textContent = title;
    subtitleEl.textContent = subtitle;
    header.style.background = getHeaderBackground(accent);
    if (inner) inner.style.setProperty('--drill-accent', accent);

    var baseColumns = commonColumns();
    var content = '';

    if (type === 'nps') {
      var npsSorted = [].concat(bakeries).sort(function(a, b) { return b.n - a.n; });
      var npsAvg = npsSorted.length ? Math.round(npsSorted.reduce(function(sum, bakery) { return sum + bakery.n; }, 0) / npsSorted.length) : 0;
      var ceiAvg = npsSorted.length ? Math.round(npsSorted.reduce(function(sum, bakery) { return sum + bakery.c; }, 0) / npsSorted.length) : 0;

      var npsColumns = baseColumns.concat([
        {
          label: 'NPS (D+M)',
          render: function(row) { return '<span class="drill-cell-strong">' + metricText(row.n) + '</span>'; }
        },
        {
          label: 'Peer Score',
          render: function(row) { return metricText(row.c); }
        },
        {
          label: 'Peer Band',
          render: function(row) { return renderBandPill(G, row.cb); }
        }
      ].concat(ragMetricColumns()).concat([
        {
          label: 'Conf',
          render: function(row) { return renderConfidence(row.co); }
        }
      ]));

      content += '<div class="drill-topbar" data-table-fullscreen-anchor="true">' +
        '<div class="drill-summary">' +
        renderSummaryCard('Avg NPS (D+M)', npsAvg) +
        renderSummaryCard('Avg Score', ceiAvg) +
        renderSummaryCard('Bakeries', npsSorted.length) +
        '</div>' +
        renderTableControls(false) +
        '</div>';

      content += renderTableWrap(G, npsColumns, npsSorted);
    } else if (type === 'relative') {
      var relSorted = [].concat(bakeries).sort(function(a, b) { return b.c - a.c; });
      content += renderTable(G, baseColumns.concat([
        {
          label: 'Peer Score',
          render: function(row) { return '<span class="drill-cell-strong">' + metricText(row.c) + '</span>'; }
        },
        {
          label: 'NPS (D+M)',
          render: function(row) { return metricText(row.n); }
        }
      ]).concat(ragMetricColumns()).concat([
        {
          label: 'Conf',
          render: function(row) { return renderConfidence(row.co); }
        }
      ]), relSorted);
    } else {
      var absSorted = [].concat(bakeries).sort(function(a, b) { return b.ac - a.ac; });
      content += renderTable(G, baseColumns.concat([
        {
          label: 'Benchmark Score',
          render: function(row) { return '<span class="drill-cell-strong">' + metricText(row.ac) + '</span>'; }
        },
        {
          label: 'Peer Score',
          render: function(row) { return metricText(row.c); }
        },
        {
          label: 'NPS (D+M)',
          render: function(row) { return metricText(row.n); }
        }
      ]).concat(ragMetricColumns()).concat([
        {
          label: 'Conf',
          render: function(row) { return renderConfidence(row.co); }
        }
      ]), absSorted);
    }

    body.innerHTML = content;
    lockBackgroundScroll();
    modal.style.display = 'block';
    resetDrillScroll();
    G.makeSortable(body);
  };
})();

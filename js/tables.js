// ========== TABLES MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.makeSortable = function(container) {
  if (!container) return;
  var targets = container.tagName === 'TABLE' ? [container] : Array.from(container.querySelectorAll('table'));

  targets.forEach(function(table, tableIdx) {
    var headers = table.querySelectorAll('thead th');
    
    var savedColStr = container.dataset['sortCol' + tableIdx];
    var savedAscStr = container.dataset['sortAsc' + tableIdx];
    var activeColIdx = savedColStr ? parseInt(savedColStr, 10) : 0;
    var activeAsc = savedAscStr === "1";

    function doSort(cIdx, isAsc) {
      var currentTbody = table.querySelector('tbody');
      if (!currentTbody) return;
      var rows = Array.from(currentTbody.querySelectorAll('tr'));
      rows.sort(function(a, b) {
        var aCell = a.cells[cIdx];
        var bCell = b.cells[cIdx];
        if (!aCell || !bCell) return 0;

        var aVal = aCell.textContent.trim().replace(/%|,|pts/g, '').replace(/[\u2191\u2193\u2194]/g, '').trim();
        var bVal = bCell.textContent.trim().replace(/%|,|pts/g, '').replace(/[\u2191\u2193\u2194]/g, '').trim();

        var isMonth = function(val) {
          var parts = val.split(' ');
          return parts.length === 2 &&
                 window.GAILS.MONTH_SHORT &&
                 window.GAILS.MONTH_SHORT.indexOf(parts[0]) !== -1 &&
                 !isNaN(parseInt(parts[1], 10));
        };

        if (isMonth(aVal) && isMonth(bVal)) {
          var aKey = window.GAILS.monthSortKey(aVal);
          var bKey = window.GAILS.monthSortKey(bVal);
          return isAsc ? aKey - bKey : bKey - aKey;
        }

        var aDuration = window.GAILS.parseDurationSeconds ? window.GAILS.parseDurationSeconds(aVal) : null;
        var bDuration = window.GAILS.parseDurationSeconds ? window.GAILS.parseDurationSeconds(bVal) : null;
        if (aDuration !== null && bDuration !== null && !isNaN(aDuration) && !isNaN(bDuration) && (aVal.indexOf(':') !== -1 || bVal.indexOf(':') !== -1)) {
          return isAsc ? aDuration - bDuration : bDuration - aDuration;
        }

        var aNum = parseFloat(aVal);
        var bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return isAsc ? aNum - bNum : bNum - aNum;
        }

        if (aVal === '\u2014' || aVal === '') return isAsc ? -1 : 1;
        if (bVal === '\u2014' || bVal === '') return isAsc ? 1 : -1;

        return isAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
      rows.forEach(function(r) { currentTbody.appendChild(r); });
    }

    if (activeColIdx !== 0 && activeColIdx < headers.length) {
      doSort(activeColIdx, activeAsc);
      headers[activeColIdx].classList.add(activeAsc ? 'sort-asc' : 'sort-desc');
    }

    headers.forEach(function(th, colIdx) {
      if (th.classList.contains('sortable')) return;
      th.classList.add('sortable');
      th.addEventListener('click', function() {
        var wasAsc = th.classList.contains('sort-asc');
        var wasDesc = th.classList.contains('sort-desc');
        
        headers.forEach(function(h) { h.classList.remove('sort-asc', 'sort-desc'); });
        
        var isCancel = wasDesc;
        var asc = !wasAsc && !wasDesc;
        if (wasAsc) asc = false;
        
        var targetColIdx = colIdx;
        if (isCancel) {
          targetColIdx = 0;
          asc = true;
        } else {
          th.classList.add(asc ? 'sort-asc' : 'sort-desc');
        }
        
        container.dataset['sortCol' + tableIdx] = targetColIdx;
        container.dataset['sortAsc' + tableIdx] = asc ? "1" : "0";

        doSort(targetColIdx, asc);
      });
    });
  });
};

(function() {
  var SHELL_SELECTOR = '.table-fullscreen-shell';
  var HOST_SELECTOR = '.table-fullscreen-host, .table-wrap, .admin-table-wrap, .drill-table-wrap';
  var shellCounter = 0;
  var fallbackShell = null;

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  function requestShellFullscreen(shell) {
    if (shell.requestFullscreen) return shell.requestFullscreen();
    if (shell.webkitRequestFullscreen) return shell.webkitRequestFullscreen();
    if (shell.msRequestFullscreen) return shell.msRequestFullscreen();
    return Promise.reject(new Error('Fullscreen API unavailable'));
  }

  function exitShellFullscreen() {
    if (document.exitFullscreen) return document.exitFullscreen();
    if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
    if (document.msExitFullscreen) return document.msExitFullscreen();
    return Promise.resolve();
  }

  function getActiveShell() {
    var fullscreenElement = getFullscreenElement();
    if (fullscreenElement && fullscreenElement.matches && fullscreenElement.matches(SHELL_SELECTOR)) {
      return fullscreenElement;
    }
    if (fullscreenElement && fullscreenElement.closest) {
      return fullscreenElement.closest(SHELL_SELECTOR);
    }
    return fallbackShell;
  }

  function updateButton(shell) {
    if (!shell) return;
    var button = shell.querySelector('[data-table-fullscreen-button]');
    if (!button) return;

    var active = getActiveShell() === shell;
    shell.classList.toggle('is-fullscreen', active);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.setAttribute('aria-label', active ? 'Exit full screen table view' : 'Open full screen table view');
    button.setAttribute('title', active ? 'Exit full screen' : 'Open full screen');

    var label = button.querySelector('[data-table-fullscreen-label]');
    if (label) {
      label.textContent = active ? 'Exit full screen' : 'Open full screen';
    }
  }

  function updateAllButtons() {
    document.querySelectorAll(SHELL_SELECTOR).forEach(updateButton);
  }

  function resetShellView(shell) {
    if (!shell) return;
    shell.scrollTop = 0;
    shell.scrollLeft = 0;

    var host = shell.querySelector(HOST_SELECTOR);
    if (host) {
      host.scrollTop = 0;
      host.scrollLeft = 0;
    }
  }

  function resetShellViewSoon(shell) {
    if (!shell) return;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        resetShellView(shell);
      });
    });
  }

  function enterFallbackFullscreen(shell) {
    if (!shell) return;
    if (fallbackShell && fallbackShell !== shell) {
      fallbackShell.classList.remove('is-fullscreen-fallback');
    }
    fallbackShell = shell;
    shell.classList.add('is-fullscreen-fallback');
    document.documentElement.classList.add('table-fullscreen-lock');
    document.body.classList.add('table-fullscreen-lock');
    resetShellViewSoon(shell);
    updateAllButtons();
  }

  function exitFallbackFullscreen() {
    if (!fallbackShell) return;
    fallbackShell.classList.remove('is-fullscreen-fallback');
    fallbackShell = null;
    document.documentElement.classList.remove('table-fullscreen-lock');
    document.body.classList.remove('table-fullscreen-lock');
    updateAllButtons();
  }

  function toggleFullscreen(shell) {
    if (!shell) return;

    if (fallbackShell === shell) {
      exitFallbackFullscreen();
      return;
    }

    if (getActiveShell() === shell) {
      Promise.resolve(exitShellFullscreen()).catch(function() {
        exitFallbackFullscreen();
      });
      return;
    }

    exitFallbackFullscreen();
    Promise.resolve(requestShellFullscreen(shell)).then(function() {
      resetShellViewSoon(shell);
      updateAllButtons();
    }).catch(function() {
      enterFallbackFullscreen(shell);
    });
  }

  function ensureHost(table) {
    if (!table || !table.parentElement) return null;

    var host = table.closest(HOST_SELECTOR);
    if (host) {
      host.classList.add('table-fullscreen-host');
      return host;
    }

    host = document.createElement('div');
    host.className = 'table-wrap table-fullscreen-host';
    table.parentElement.insertBefore(host, table);
    host.appendChild(table);
    return host;
  }

  function findInlineToolbarAnchor(host) {
    if (!host || !host.parentElement) return null;
    var candidate = host.previousElementSibling;
    if (!candidate) return null;
    if (candidate.matches(HOST_SELECTOR) || candidate.matches(SHELL_SELECTOR)) return null;
    if (candidate.querySelector('table')) return null;
    if (candidate.matches && candidate.matches('[data-table-fullscreen-anchor="true"]')) return candidate;
    if (candidate.classList && candidate.classList.contains('drill-controls')) return candidate;
    if (!candidate.querySelector('select, input, button, label')) return null;
    return candidate;
  }

  function ensureShell(host) {
    if (!host || !host.parentElement) return null;
    if (host.parentElement.matches && host.parentElement.matches(SHELL_SELECTOR)) return host.parentElement;

    var anchor = findInlineToolbarAnchor(host);
    var shell = document.createElement('div');
    shell.className = 'table-fullscreen-shell';
    if (host.classList.contains('drill-table-wrap')) {
      shell.classList.add('table-fullscreen-shell--drill');
    }
    if (anchor) {
      shell.classList.add('table-fullscreen-shell--inline');
      anchor.classList.add('table-fullscreen-inline-anchor');
      anchor.setAttribute('data-table-fullscreen-anchor', 'true');
      host.parentElement.insertBefore(shell, anchor);
      shell.appendChild(anchor);
    } else {
      host.parentElement.insertBefore(shell, host);
    }
    shell.appendChild(host);
    return shell;
  }

  function attachButton(shell) {
    if (!shell || shell.dataset.tableFullscreenReady === 'true') return;
    if (!shell.querySelector(HOST_SELECTOR)) return;

    shell.dataset.tableFullscreenReady = 'true';

    if (!shell.id) {
      shellCounter += 1;
      shell.id = 'tableFullscreenShell' + shellCounter;
    }

    var toolbar = document.createElement('div');
    toolbar.className = 'table-fullscreen-toolbar';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-fullscreen-btn';
    button.setAttribute('data-table-fullscreen-button', 'true');
    button.setAttribute('aria-controls', shell.id);

    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'table-fullscreen-btn__icon');
    icon.setAttribute('viewBox', '0 0 20 20');
    icon.setAttribute('aria-hidden', 'true');

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 8V4H8M12 4H16V8M16 12V16H12M8 16H4V12');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-linecap', 'square');
    path.setAttribute('stroke-linejoin', 'miter');
    path.setAttribute('stroke-width', '2.4');
    icon.appendChild(path);

    var label = document.createElement('span');
    label.className = 'table-fullscreen-btn__label';
    label.setAttribute('data-table-fullscreen-label', 'true');
    label.textContent = 'Open full screen';

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener('click', function(event) {
      event.stopPropagation();
      toggleFullscreen(shell);
    });

    toolbar.appendChild(button);
    var anchor = shell.querySelector('[data-table-fullscreen-anchor="true"]');
    if (anchor) {
      toolbar.classList.add('table-fullscreen-toolbar--inline');
      anchor.appendChild(toolbar);
    } else {
      shell.insertBefore(toolbar, shell.firstChild);
    }
    updateButton(shell);
  }

  function enhanceTables(root) {
    if (!root || root.nodeType !== 1) return;

    if (root.matches && root.matches('table')) {
      attachButton(ensureShell(ensureHost(root)));
      return;
    }

    if (root.matches && root.matches(SHELL_SELECTOR)) {
      attachButton(root);
    }

    if (root.matches && root.matches(HOST_SELECTOR)) {
      attachButton(ensureShell(root));
    }

    Array.from(root.querySelectorAll('table')).forEach(function(table) {
      attachButton(ensureShell(ensureHost(table)));
    });
  }

  function initTableFullscreenControls() {
    if (!document.body) return;

    enhanceTables(document.body);

    var observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) enhanceTables(node);
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTableFullscreenControls, { once: true });
  } else {
    initTableFullscreenControls();
  }

  function handleFullscreenChange() {
    var activeShell = getActiveShell();
    if (activeShell) {
      resetShellViewSoon(activeShell);
    }
    updateAllButtons();
  }

  document.addEventListener('fullscreenchange', handleFullscreenChange);
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
  document.addEventListener('msfullscreenchange', handleFullscreenChange);
  document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && fallbackShell) {
      exitFallbackFullscreen();
    }
  });
})();

// ========== NPS SPLIT COLUMNS TOGGLE ==========
// The NPS Coffee / NPS Meal / NPS (All) columns sit next to the headline
// NPS (Drink + Meal) column in the league table and the priority list, but are
// collapsed by default behind a compact +/- button in the NPS header so the
// tables don't overwhelm. One shared flag drives both tables; the columns are
// hidden with CSS (not removed) so sort column indices stay stable.
window.GAILS.npsSplitsExpanded = false;

window.GAILS.npsSplitToggleHtml = function() {
  var expanded = window.GAILS.npsSplitsExpanded;
  return '<button type="button" class="nps-split-toggle" data-nps-split-toggle aria-expanded="' + expanded + '"'
    + ' aria-label="' + (expanded ? 'Hide' : 'Show') + ' the NPS Coffee / Meal / All columns"'
    + ' title="' + (expanded ? 'Hide' : 'Show') + ' the NPS Coffee / Meal / All columns">'
    + (expanded ? '-' : '+') + '</button>';
};

window.GAILS.syncNpsSplitTables = function() {
  var expanded = window.GAILS.npsSplitsExpanded;
  Array.from(document.querySelectorAll('table[data-nps-splits]')).forEach(function(table) {
    table.classList.toggle('nps-splits-collapsed', !expanded);
  });
  Array.from(document.querySelectorAll('[data-nps-split-toggle]')).forEach(function(btn) {
    btn.textContent = expanded ? '-' : '+';
    btn.title = (expanded ? 'Hide' : 'Show') + ' the NPS Coffee / Meal / All columns';
    btn.setAttribute('aria-label', (expanded ? 'Hide' : 'Show') + ' the NPS Coffee / Meal / All columns');
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
};

// Capture phase so the click never reaches the header cell's sort handler.
document.addEventListener('click', function(e) {
  var btn = e.target && e.target.closest ? e.target.closest('[data-nps-split-toggle]') : null;
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  window.GAILS.npsSplitsExpanded = !window.GAILS.npsSplitsExpanded;
  window.GAILS.syncNpsSplitTables();
}, true);

window.GAILS.renderLeagueTable = function(data) {
  var G = GAILS;
  var sortKey = document.getElementById('sortBy').value;
  var desc = ['n', 'c', 'ac', 'dr', 'ef', 'fr', 's2', 's30', 'td', 'nc', 'nm', 'na'].includes(sortKey);
  // Sparse metrics (avg times, NPS splits) can be null — always sink them to the bottom.
  var sortVal = function(r) {
    var v = r[sortKey];
    if (v === null || v === undefined || isNaN(v)) return desc ? -Infinity : Infinity;
    return v;
  };
  var sorted = [].concat(data).sort(function(a, b) { return desc ? sortVal(b) - sortVal(a) : sortVal(a) - sortVal(b); });
  var absBandClass = function(b) { return G.bc(b); };
  var hasVal = function(v) { return v !== null && v !== undefined && !isNaN(v); };
  var numOrDash = function(v) { return hasVal(v) ? v : '—'; };
  var pctOrDash = function(v) { return hasVal(v) ? v + '%' : '—'; };
  // Same RAG thresholds as the headline NPS column; sparse splits stay uncoloured when absent.
  var npsSplitStyle = function(v) {
    if (!hasVal(v)) return '';
    return ' style="color:' + (v >= 55 ? 'var(--green)' : v >= 45 ? 'var(--amber)' : 'var(--red)') + '"';
  };
  // Same thresholds as the Avg Wait Time KPI card: <=1:55 green, 1:55-2:00 amber, >=2:00 red.
  var atRagStyle = function(v) {
    if (!hasVal(v)) return '';
    return ' style="color:' + (v <= 115 ? 'var(--green)' : v < 120 ? 'var(--amber)' : 'var(--red)') + '"';
  };
  document.getElementById('tableBody').innerHTML = sorted.map(function(b, i) { return '<tr>' +
    '<td style="font-weight:600">' + (i + 1) + '</td>' +
    '<td style="font-weight:500">' + b.b + '</td>' +
    '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
    '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
    '<td style="font-weight:700">' + numOrDash(b.c) + '</td>' +
    '<td><span class="band ' + G.bc(b.cb) + '">' + b.cb + '</span></td>' +
    '<td style="font-weight:600">' + numOrDash(b.ac) + '</td>' +
    '<td><span class="band ' + absBandClass(b.acb) + '">' + b.acb + '</span></td>' +
    '<td><span class="conf ' + G.bc(b.co) + '">' + b.co + '</span></td>' +
    '<td style="color:' + (b.n >= 55 ? 'var(--green)' : b.n >= 45 ? 'var(--amber)' : 'var(--red)') + '">' + b.n + '</td>' +
    '<td class="nps-split-col"' + npsSplitStyle(b.nc) + '>' + numOrDash(b.nc) + '</td>' +
    '<td class="nps-split-col"' + npsSplitStyle(b.nm) + '>' + numOrDash(b.nm) + '</td>' +
    '<td class="nps-split-col"' + npsSplitStyle(b.na) + '>' + numOrDash(b.na) + '</td>' +
    '<td>' + b.v + '</td>' +
    '<td style="color:' + (b.dr >= 90 ? 'var(--green)' : b.dr >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.dr + '%</td><td style="color:' + (b.ef >= 90 ? 'var(--green)' : b.ef >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.ef + '%</td><td style="color:' + (b.fr >= 90 ? 'var(--green)' : b.fr >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.fr + '%</td>' +
    '<td style="color:' + (b.ov >= 90 ? 'var(--green)' : b.ov >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.ov + '%</td>' +
    '<td>' + pctOrDash(b.s30) + '</td>' +
    '<td style="color:' + (b.s2 >= 75 ? 'var(--green)' : b.s2 >= 60 ? 'var(--amber)' : 'var(--red)') + '">' + b.s2 + '%</td>' +
    '<td style="color:' + (b.o5 >= 2.5 ? 'var(--red)' : b.o5 > 1 ? 'var(--amber)' : 'var(--green)') + '">' + b.o5 + '%</td>' +
    '<td' + atRagStyle(b.at) + '>' + G.formatSecs(b.at) + '</td>' +
    '<td>' + numOrDash(b.td) + '</td>' +
    '</tr>'; }).join('');
  G.makeSortable(document.getElementById('tableBody').closest('table'));
  G.syncNpsSplitTables();
};

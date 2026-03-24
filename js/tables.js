// ========== TABLES MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.makeSortable = function(container) {
  if (!container) return;
  var targets = container.tagName === 'TABLE' ? [container] : Array.from(container.querySelectorAll('table'));

  targets.forEach(function(table) {
    var headers = table.querySelectorAll('thead th');
    headers.forEach(function(th, colIdx) {
      if (th.classList.contains('sortable')) return;
      th.classList.add('sortable');
      th.addEventListener('click', function() {
        var tbody = table.querySelector('tbody');
        if (!tbody) return;
        var rows = Array.from(tbody.querySelectorAll('tr'));

        var wasAsc = th.classList.contains('sort-asc');
        headers.forEach(function(h) { h.classList.remove('sort-asc', 'sort-desc'); });
        var asc = !wasAsc;
        th.classList.add(asc ? 'sort-asc' : 'sort-desc');

        rows.sort(function(a, b) {
          var aCell = a.cells[colIdx];
          var bCell = b.cells[colIdx];
          if (!aCell || !bCell) return 0;

          var aVal = aCell.textContent.trim().replace(/[%,pts]/g, '').replace(/[\u2191\u2193\u2194]/g, '').trim();
          var bVal = bCell.textContent.trim().replace(/[%,pts]/g, '').replace(/[\u2191\u2193\u2194]/g, '').trim();

          var aNum = parseFloat(aVal);
          var bNum = parseFloat(bVal);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return asc ? aNum - bNum : bNum - aNum;
          }

          if (aVal === '\u2014' || aVal === '') return asc ? -1 : 1;
          if (bVal === '\u2014' || bVal === '') return asc ? 1 : -1;

          return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });

        rows.forEach(function(r) { tbody.appendChild(r); });
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
    button.addEventListener('click', function() {
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

window.GAILS.renderLeagueTable = function(data) {
  var G = GAILS;
  var sortKey = document.getElementById('sortBy').value;
  var desc = ['n', 'c', 'ac', 'dr', 'ef', 'fr', 'ts'].includes(sortKey);
  var sorted = [].concat(data).sort(function(a, b) { return desc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]; });
  var absBandClass = function(b) { return b === 'Exceeding' ? 'Excellent' : b === 'Meeting' ? 'Good' : b === 'Approaching' ? 'Developing' : 'Needs-Attention'; };
  document.getElementById('tableBody').innerHTML = sorted.map(function(b, i) { return '<tr>' +
    '<td style="font-weight:600">' + (i + 1) + '</td>' +
    '<td style="font-weight:500">' + b.b + '</td>' +
    '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
    '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
    '<td style="font-weight:700">' + b.c + '</td>' +
    '<td><span class="band ' + G.bc(b.cb) + '">' + b.cb + '</span></td>' +
    '<td style="font-weight:600">' + b.ac + '</td>' +
    '<td><span class="band ' + absBandClass(b.acb) + '">' + b.acb + '</span></td>' +
    '<td><span class="conf ' + b.co + '">' + b.co + '</span></td>' +
    '<td>' + b.n + '</td><td>' + b.v + '</td>' +
    '<td>' + b.dr + '%</td><td>' + b.ef + '%</td><td>' + b.fr + '%</td>' +
    '<td>' + b.ts + '</td>' +
    '<td style="color:' + (b.o5 > 4 ? 'var(--red)' : b.o5 > 2.5 ? 'var(--amber)' : 'inherit') + '">' + b.o5 + '%</td>' +
    '<td>' + b.ov + '%</td><td>' + b.s2 + '%</td>' +
    '</tr>'; }).join('');
  G.makeSortable(document.getElementById('tableBody').closest('table'));
};

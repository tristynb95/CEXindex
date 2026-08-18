// ========== MONTH PARSING ==========
window.GAILS = window.GAILS || {};

// Filter drawers live alongside modal markup on several pages. Keep their
// open guards in one place so a banner pill cannot surface page controls over
// an active dialog, regardless of which kind of modal is currently visible.
window.GAILS.isModalOpen = function() {
  if (typeof document === 'undefined' || !document.querySelectorAll) return false;

  return Array.prototype.some.call(
    document.querySelectorAll('dialog[open], [aria-modal=true]'),
    function(modal) {
      var node = modal;
      while (node && node.nodeType === 1) {
        if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
        if (node.style && (node.style.display === 'none' || node.style.visibility === 'hidden')) return false;
        if (typeof window !== 'undefined' && window.getComputedStyle) {
          var styles = window.getComputedStyle(node);
          if (styles.display === 'none' || styles.visibility === 'hidden') return false;
        }
        node = node.parentElement;
      }
      return true;
    }
  );
};

// ---------- subtle site-wide success notifications ----------
// Mutation forms live on several pages, but their confirmation should feel
// identical everywhere. The region is created lazily so pages that never save
// anything carry no extra markup. Messages use textContent rather than HTML
// because task and bakery names can contain user-entered text.
window.GAILS.notifySuccess = function(message, options) {
  if (!message || typeof document === 'undefined' || !document.body) return null;
  options = options || {};

  var region = document.getElementById('appToastRegion');
  if (!region) {
    region = document.createElement('div');
    region.id = 'appToastRegion';
    region.className = 'app-toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-relevant', 'additions');
    region.setAttribute('aria-label', 'Completed actions');
    document.body.appendChild(region);
  }

  // Keep bursts (for example several quick task sign-offs) useful rather than
  // letting notifications cover the page.
  while (region.children.length >= 3) {
    region.removeChild(region.firstElementChild);
  }

  var toast = document.createElement('div');
  toast.className = 'app-toast app-toast--success';
  toast.setAttribute('role', 'status');

  var icon = document.createElement('span');
  icon.className = 'app-toast__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '✓';

  var copy = document.createElement('span');
  copy.className = 'app-toast__copy';
  copy.textContent = String(message);

  var close = document.createElement('button');
  close.className = 'app-toast__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Dismiss notification');
  close.textContent = '×';

  toast.appendChild(icon);
  toast.appendChild(copy);
  toast.appendChild(close);
  region.appendChild(toast);

  var removed = false;
  var dismiss = function() {
    if (removed) return;
    removed = true;
    toast.classList.remove('is-visible');
    window.setTimeout(function() {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      if (region.parentNode && !region.children.length) region.parentNode.removeChild(region);
    }, 180);
  };

  close.addEventListener('click', dismiss);
  var show = function() { toast.classList.add('is-visible'); };
  if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(show);
  else window.setTimeout(show, 0);
  window.setTimeout(dismiss, Math.max(1600, Number(options.duration) || 3200));
  return { element: toast, dismiss: dismiss };
};

window.GAILS.MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
window.GAILS.MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

window.GAILS.parseSheetMonth = function(name) {
  var parts = name.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  var mi = GAILS.MONTH_NAMES.indexOf(parts[0]);
  if (mi < 0) return null;
  var yr = parts[1].slice(-2);
  return GAILS.MONTH_SHORT[mi] + ' ' + yr;
};

// Memoised because it is called from sort comparators and from per-record
// loops over the whole dataset, and it re-split the same handful of "MMM YY"
// labels every time. The label-to-key mapping is fixed, and a dataset only ever
// holds a few dozen distinct months, so the cache stays tiny and never needs
// clearing. Null-prototype so a label can't collide with an inherited member.
var _monthSortKeyCache = Object.create(null);

window.GAILS.monthSortKey = function(label) {
  var cached = _monthSortKeyCache[label];
  if (cached !== undefined) return cached;
  var parts = label.split(' ');
  var mi = GAILS.MONTH_SHORT.indexOf(parts[0]);
  var yr = 2000 + parseInt(parts[1]);
  return (_monthSortKeyCache[label] = yr * 12 + mi);
};

window.GAILS.getCurrentMonthLabel = function() {
  var now = new Date();
  var yr = String(now.getFullYear()).slice(-2);
  return GAILS.MONTH_SHORT[now.getMonth()] + ' ' + yr;
};

window.GAILS.monthLabelFromDate = function(date) {
  var yr = String(date.getFullYear()).slice(-2);
  return GAILS.MONTH_SHORT[date.getMonth()] + ' ' + yr;
};

window.GAILS.getFiscalQuarterMonths = function(offset) {
  var now = new Date();
  var currentMonth = now.getMonth();
  var fiscalYearStartYear = currentMonth >= 2 ? now.getFullYear() : now.getFullYear() - 1;
  var currentFiscalQuarter = Math.floor(((currentMonth - 2 + 12) % 12) / 3);
  var quarterIndex = currentFiscalQuarter + (offset || 0);
  var startFiscalMonth = 2 + (quarterIndex * 3);
  var startYear = fiscalYearStartYear;

  while (startFiscalMonth < 0) {
    startFiscalMonth += 12;
    startYear -= 1;
  }
  while (startFiscalMonth > 11) {
    startFiscalMonth -= 12;
    startYear += 1;
  }

  var labels = [];
  for (var i = 0; i < 3; i++) {
    labels.push(GAILS.monthLabelFromDate(new Date(startYear, startFiscalMonth + i, 1)));
  }
  return labels;
};

window.GAILS.getCalendarYearMonths = function(offset) {
  var year = (new Date()).getFullYear() + (offset || 0);
  var labels = [];
  for (var month = 0; month < 12; month++) {
    labels.push(GAILS.monthLabelFromDate(new Date(year, month, 1)));
  }
  return labels;
};

// "All Time" should cover the current month even before any data has
// been uploaded for it, so bakeries don't read as falsely unvisited etc.
// Returns a new array, sorted, with the current month appended if missing.
window.GAILS.withCurrentMonth = function(months) {
  var result = [].concat(months || []);
  var current = GAILS.getCurrentMonthLabel();
  if (result.indexOf(current) === -1) result.push(current);
  result.sort(function(a, b) { return GAILS.monthSortKey(a) - GAILS.monthSortKey(b); });
  return result;
};

// Resolves the #rollingWindow select's raw value into the list of month
// labels that period represents. "current" isn't a rolling-window count
// like the others - it's always just this calendar month, even before any
// data has been uploaded for it.
//
// "Last N months" windows are calendar-based and include the current month
// by default (except for "Last Month" where N=1, which always represents the
// previous calendar month). If the current month has no data yet, or is
// mid-collection, it is excluded and the window falls back to the most recent
// N complete past months.
window.GAILS.resolvePeriodMonths = function(rawValue, months, records) {
  var list = months || [];
  var current = GAILS.getCurrentMonthLabel();
  if (rawValue === 'current') return [current];
  if (rawValue === 'thisYear' || rawValue === 'lastYear') {
    var yearMonths = GAILS.getCalendarYearMonths(rawValue === 'lastYear' ? -1 : 0);
    var availableYearMonths = GAILS.withCurrentMonth(list);
    return yearMonths.filter(function(m) { return availableYearMonths.indexOf(m) !== -1; });
  }
  if (rawValue === 'thisQuarter' || rawValue === 'lastQuarter') {
    var quarterMonths = GAILS.getFiscalQuarterMonths(rawValue === 'lastQuarter' ? -1 : 0);
    var currentKey = GAILS.monthSortKey(current);
    var available = GAILS.withCurrentMonth(list);
    return quarterMonths.filter(function(m) {
      return GAILS.monthSortKey(m) <= currentKey && available.indexOf(m) !== -1;
    });
  }
  var val = parseInt(rawValue, 10);
  if (val > 0) {
    var currentIsUsable = list.indexOf(current) !== -1;
    if (currentIsUsable && records && records.length) {
      var currentCount = records.filter(function(r) { return r.m === current; }).length;
      var idx = list.indexOf(current);
      if (idx > 0) {
        var prevMonth = list[idx - 1];
        var prevCount = records.filter(function(r) { return r.m === prevMonth; }).length;
        if (currentCount < prevCount * 0.9) {
          currentIsUsable = false;
        }
      } else {
        if (currentCount === 0) {
          currentIsUsable = false;
        }
      }
    }
    var past = list.filter(function(m) { return m !== current; });
    if (currentIsUsable && val > 1) {
      return list.slice(-Math.min(val, list.length));
    } else {
      return past.slice(-Math.min(val, past.length));
    }
  }
  return GAILS.withCurrentMonth(list);
};

// ========== PERCENTILE RANK ==========
// Sorts a cohort once and returns a lookup for ranking values within it.
//
// Ranking a whole cohort means asking the same question of the same array once
// per member, and percentileRank sorted a fresh copy every time it was asked —
// so scoring 200 bakeries against 200 peers cost 200 sorts, per metric. The
// index does the sort once; each lookup is then a map read.
//
// Ties keep the midpoint of the run they occupy, and a value that is not in the
// cohort still lands at the -1 both ends of indexOf/lastIndexOf produced, so
// the numbers are the ones the old two-scan version returned.
window.GAILS.buildPercentileIndex = function(values, invert) {
  var sorted = [...values].sort((a, b) => invert ? b - a : a - b);
  var size = sorted.length;
  var positions = new Map();
  for (var i = 0; i < size; i++) {
    var entry = positions.get(sorted[i]);
    if (entry === undefined) positions.set(sorted[i], { first: i, last: i });
    else entry.last = i;
  }
  return function(value) {
    if (size <= 1) return 50;
    // A Map would match NaN to a NaN key; indexOf never did, so a NaN has to
    // stay unfound here too.
    var found = (typeof value === 'number' && isNaN(value)) ? undefined : positions.get(value);
    var first = found ? found.first : -1;
    var last = found ? found.last : -1;
    return (((first + last) / 2) / (size - 1)) * 100;
  };
};

window.GAILS.percentileRank = function(values, value, invert) {
  return window.GAILS.buildPercentileIndex(values, invert)(value);
};

// ========== GENERIC HELPERS ==========

// Escapes a value for interpolation into an innerHTML string. Note the null
// check is `== null` rather than a falsy check: 0 is a meaningful score across
// this dashboard and must render as "0", not as a blank cell.
window.GAILS.escapeHtml = function(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// Every bakery-name table link carries its dashboard origin explicitly. URL
// fragments are not included in document.referrer, so relying on the referrer
// alone would lose the active tab and send users back to the wrong page.
window.GAILS.getBakeryProfileUrl = function(name, options) {
  options = options || {};
  var returnUrl = options.returnUrl || 'index.html#visit-log';
  var returnLabel = options.returnLabel || 'Bakery Directory';
  var encodeQueryValue = function(value) {
    return encodeURIComponent(value).replace(/'/g, '%27');
  };
  return 'bakery-profile.html?bakery=' + encodeQueryValue(name) +
    '&from=' + encodeQueryValue(returnUrl) +
    '&fromLabel=' + encodeQueryValue(returnLabel);
};

window.GAILS.bakeryProfileLink = function(name, options) {
  options = options || {};
  var label = options.label || name;
  // Ops-area/region rows from the dashboard View toggle have no profile page
  // to link to — render the name as plain text instead of a dead link.
  if (options.isGroup) {
    return '<span class="bakery-profile-link bakery-profile-link--group">' +
      window.GAILS.escapeHtml(label) + '</span>';
  }
  var className = ['bakery-profile-link', options.className || ''].filter(Boolean).join(' ');
  var url = window.GAILS.getBakeryProfileUrl(name, options);
  return '<a class="' + window.GAILS.escapeHtml(className) + '" href="' +
    window.GAILS.escapeHtml(url) + '" aria-label="Open ' +
    window.GAILS.escapeHtml(name) + ' bakery profile">' +
    window.GAILS.escapeHtml(label) + '</a>';
};

window.GAILS.avg = function(arr, k) {
  if (!arr || !arr.length) return 0;
  var vs = arr.map(function(r) { return r ? r[k] : undefined; }).filter(function(v) { return typeof v === 'number' && !isNaN(v); });
  return vs.length ? vs.reduce(function(a, v) { return a + v; }, 0) / vs.length : 0;
};

// Parses duration values into seconds. Supports workbook time fractions,
// Date/time cells, numeric seconds, and display strings like "2:13".
window.GAILS.parseDurationSeconds = function(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !isNaN(value)) {
    return value.getHours() * 3600 + value.getMinutes() * 60 + value.getSeconds();
  }
  if (typeof value === 'number') {
    return value > 0 && value < 1 ? value * 86400 : value;
  }

  var text = String(value).trim();
  if (!text || text === '\u2014') return null;
  var colon = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/.exec(text);
  if (colon) {
    var first = parseInt(colon[1], 10);
    var second = parseInt(colon[2], 10);
    var third = colon[3] !== undefined ? parseInt(colon[3], 10) : null;
    return third === null ? (first * 60 + second) : (first * 3600 + second * 60 + third);
  }

  var cleaned = text.toLowerCase().replace(/,/g, '');
  var minSec = /(?:(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes))?\s*(?:(\d+(?:\.\d+)?)\s*(?:s|sec|secs|second|seconds))?/.exec(cleaned);
  if (minSec && (minSec[1] || minSec[2])) {
    return (parseFloat(minSec[1] || '0') * 60) + parseFloat(minSec[2] || '0');
  }

  var n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
};

// Formats the workbook's "Last Updated" ISO timestamp for display, e.g. "12 Jul 2026, 09:30"
window.GAILS.formatUpdatedStamp = function(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return String(iso);
  var hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  var datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!hasTime) return datePart;
  return datePart + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

// Formats an average wait in seconds as m:ss (e.g. 132.9 -> "2:13"); null-safe.
window.GAILS.formatSecs = function(secs) {
  if (secs === null || secs === undefined || isNaN(secs)) return '—';
  var m = Math.floor(secs / 60);
  var s = Math.round(secs % 60);
  if (s === 60) { m += 1; s = 0; }
  return m + ':' + (s < 10 ? '0' : '') + s;
};

/* ========== FULL-BLEED WORKSPACE MODALS ==========
   The drill-down and bakery report modals fill the whole workspace below the
   page banner instead of floating as centred popups, so dense comparison
   tables and long reports get the screen rather than a 24px gutter.

   Two things have to hold for that to look right on every host page
   (dashboard, Bakery Profile, My Activity, My Team):

   1. --app-banner-h has to track the real banner height. Each page uses a
      different banner element and they all reflow at mobile widths, so it is
      measured rather than hard-coded.
   2. The banner has to stay put. These modals lock background scroll by
      pinning <body> with position:fixed and a negative top offset, which
      drags a sticky banner off the top of the screen with it — so while a
      full-bleed modal is open the banner is promoted to position:fixed
      (see html.fullbleed-modal-open in styles.css). */
(function() {
  if (typeof document === 'undefined' || !document.documentElement) return;

  var BANNER_SELECTOR = '.header, .bakery-profile-header, .my-activity-header';
  var FULLBLEED_MODALS = ['drillModal', 'focusDetailModal', 'visitReportModal'];
  var OPEN_CLASS = 'fullbleed-modal-open';

  function measureBanner() {
    var el = document.querySelector(BANNER_SELECTOR);
    // A height of 0 is the right answer while the dashboard banner is still
    // display:none pre-auth — there is nothing for the modal to sit under.
    var height = el ? Math.round(el.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--app-banner-h', height + 'px');
  }

  function isOpen(el) {
    if (!el) return false;
    if (el.style && el.style.display && el.style.display !== 'none') return true;
    if (!window.getComputedStyle) return false;
    return window.getComputedStyle(el).display !== 'none';
  }

  function syncOpenState() {
    var open = FULLBLEED_MODALS.some(function(id) {
      return isOpen(document.getElementById(id));
    });
    document.documentElement.classList.toggle(OPEN_CLASS, open);
    if (open) measureBanner();
  }

  function init() {
    measureBanner();

    var banner = document.querySelector(BANNER_SELECTOR);
    if (banner && window.ResizeObserver) new ResizeObserver(measureBanner).observe(banner);
    window.addEventListener('resize', measureBanner);

    // Every modal here is opened and closed by writing style.display, across
    // several modules and close paths (button, Esc, queue stepping), so the
    // state is observed rather than pushed from each call site.
    if (window.MutationObserver) {
      var observer = new MutationObserver(syncOpenState);
      FULLBLEED_MODALS.forEach(function(id) {
        var el = document.getElementById(id);
        if (el) observer.observe(el, { attributes: true, attributeFilter: ['style', 'class'] });
      });
    }
    syncOpenState();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

// ---------- banner filter chips ----------
// The banner is sticky and the filter bars are not, so these chips are the
// only filter readout that survives scrolling — which makes them the right
// place to put the controls too. Both the dashboard and Bakery Reports
// render into #headerSub, so they share one chip vocabulary: a wrapper
// carrying the chip surface, a body button that opens the drawer, and an
// optional clear button. Nested <button> is invalid, hence the wrapper.
window.GAILS.headerPill = function (kind, key, text, clearable, tooltip) {
  var escape = window.GAILS.escapeHtml;
  var tooltipText = tooltip ? String(tooltip) : '';
  var tooltipSeparator = tooltipText.indexOf(': ');
  var tooltipLabel = tooltipSeparator === -1 ? 'Selected filters' : tooltipText.slice(0, tooltipSeparator);
  var tooltipValues = tooltipSeparator === -1 ? tooltipText : tooltipText.slice(tooltipSeparator + 2);
  var tooltipAttrs = tooltipText
    ? ' aria-label="' + escape(text + '. ' + tooltipText) + '"'
    : '';
  var tooltipMarkup = tooltipText
    ? '<span class="header-pill__tooltip" aria-hidden="true">' +
      '<span class="header-pill__tooltip-label">' + escape(tooltipLabel) + '</span>' +
      '<span class="header-pill__tooltip-values">' + escape(tooltipValues) + '</span></span>'
    : '';
  var body = '<button type="button" class="header-pill__body" data-filter-pill="' +
    escape(key) + '"' + tooltipAttrs + '>' + escape(text) + tooltipMarkup + '</button>';
  var clear = clearable
    ? '<button type="button" class="header-pill__clear" data-filter-clear="' + escape(key) +
      '" aria-label="Clear ' + escape(text) + ' filter">\u00d7</button>'
    : '';
  return '<span class="header-pill ' + kind + '">' + body + clear + '</span>';
};

// Always present, unlike the chips: a filter that is not set has no chip, so
// without this there would be no way to set one from the banner.
window.GAILS.HEADER_FILTER_BTN =
  '<span class="header-pill header-pill-add">' +
  '<button type="button" class="header-pill__body" data-filter-open aria-label="Open filters">' +
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round"><path d="M3 7h18M7 12h10M11 17h2"/></svg></button></span>';

// ---------- drawer menu positioning ----------
// A filter drawer stacks its controls in a ~390px column, so a menu that
// opened in flow shoved everything below it down and ran off the bottom of
// the screen. Fixed positioning lifts them out of the column instead: they
// overlay the controls beneath and cap their height to the room left.
// They always open downward. Flipping upward was tried and dropped: a menu
// that jumps over the controls above it hides the filters you were just
// reading, and which direction it took depended on the window height. Six
// rows fit below at any normal height; on a short window the menu simply
// shows fewer and scrolls.
window.GAILS.mountDrawerMenus = function (panel) {
  if (!panel) return;
  var drawerMedia = window.matchMedia('(min-width: 721px)');
  var GAP = 8;
  var EDGE = 16;
  // Floor for a pathologically short window — below this the menu would be
  // too small to use at all, so it is allowed to run past the edge.
  var MIN_MENU = 132;

  function place(trigger, menu) {
    var rect = trigger.getBoundingClientRect();
    var below = window.innerHeight - rect.bottom - GAP - EDGE;
    menu.style.position = 'fixed';
    menu.style.left = rect.left + 'px';
    menu.style.right = 'auto';
    menu.style.bottom = 'auto';
    menu.style.width = rect.width + 'px';
    menu.style.top = (rect.bottom + GAP) + 'px';
    menu.style.maxHeight = Math.max(MIN_MENU, Math.floor(below)) + 'px';
    menu.style.overflowY = 'auto';
  }

  // Only the properties place() writes — display belongs to the control's
  // own open/close code and must survive.
  function reset(menu) {
    menu.style.position = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.width = '';
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.maxHeight = '';
    menu.style.overflowY = '';
  }

  function pair(containerSel, triggerSel, menuSel, openOnContainer) {
    Array.prototype.forEach.call(panel.querySelectorAll(containerSel), function (box) {
      var trigger = box.querySelector(triggerSel);
      var menu = box.querySelector(menuSel);
      if (!trigger || !menu) return;
      var open = (openOnContainer ? box : trigger).classList.contains('is-open');
      if (drawerMedia.matches && open) place(trigger, menu);
      else reset(menu);
    });
  }

  function syncMenus() {
    pair('.bakery-ms', '.bakery-ms__trigger', '.bakery-ms__dropdown', false);
    pair('.filter-select', '.filter-select__trigger', '.filter-select__menu', true);
  }

  // Every control type signals open/closed with a class, and place() only
  // ever writes inline styles, so watching class alone cannot re-trigger.
  new MutationObserver(syncMenus).observe(panel, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
  window.addEventListener('resize', syncMenus);
  panel.addEventListener('scroll', syncMenus, true);
};

// ---------- drawer anchoring ----------
// The filter panels drop from under the banner as a full-bleed strip, so
// they read as coming out of the chips that open them while keeping the
// shape seven controls actually want: a row, not a column. Width is left
// to CSS; only the vertical placement is measured, because the band wraps
// to two rows on narrow desktops and the strip has to follow it down.
window.GAILS.anchorDrawerToBanner = function (panel) {
  if (!panel) return;
  var drawerMedia = window.matchMedia('(min-width: 721px)');
  var EDGE = 12;

  function anchor() {
    var header = document.querySelector('.header');
    if (!drawerMedia.matches || !header) {
      panel.style.top = '';
      panel.style.maxHeight = '';
      return;
    }
    var headerRect = header.getBoundingClientRect();
    panel.style.top = Math.round(headerRect.bottom) + 'px';
    panel.style.maxHeight = Math.round(window.innerHeight - headerRect.bottom - EDGE) + 'px';
  }

  anchor();
  window.addEventListener('resize', anchor);
  // The banner reflows as chips change, so re-measure whenever the panel
  // is opened rather than trusting the position from last time.
  new MutationObserver(anchor).observe(panel, {
    attributes: true,
    attributeFilter: ['class']
  });
};

// ========== MONTH PARSING ==========
window.GAILS = window.GAILS || {};

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

window.GAILS.monthSortKey = function(label) {
  var parts = label.split(' ');
  var mi = GAILS.MONTH_SHORT.indexOf(parts[0]);
  var yr = 2000 + parseInt(parts[1]);
  return yr * 12 + mi;
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
window.GAILS.percentileRank = function(values, value, invert) {
  var sorted = [...values].sort((a, b) => invert ? b - a : a - b);
  if (sorted.length <= 1) return 50;
  var first = sorted.indexOf(value);
  var last = sorted.lastIndexOf(value);
  var avgRank = (first + last) / 2;
  return (avgRank / (sorted.length - 1)) * 100;
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

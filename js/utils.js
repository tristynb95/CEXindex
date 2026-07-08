// ========== MONTH PARSING ==========
window.GAILS = window.GAILS || {};

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

// "All Months" should cover the current month even before any data has
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
window.GAILS.avg = function(arr, k) { return arr.reduce((a, r) => a + r[k], 0) / arr.length; };

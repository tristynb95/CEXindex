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
// by default. If the current month has no data yet, or has data for fewer
// bakeries than a normal month (i.e. it's still mid-collection), it's
// dropped from the window and the window shrinks by one so it falls back
// to the most recent N-1 complete months instead of silently including a
// half-finished month.
window.GAILS.resolvePeriodMonths = function(rawValue, months, records) {
  var list = months || [];
  var current = GAILS.getCurrentMonthLabel();
  if (rawValue === 'current') return [current];
  var val = parseInt(rawValue, 10);
  if (val > 0) {
    var currentIsUsable = list.indexOf(current) !== -1;
    if (currentIsUsable && records && records.length) {
      var totalBakeries = new Set(records.map(function(r) { return r.b; })).size;
      var currentCount = records.filter(function(r) { return r.m === current; }).length;
      if (currentCount < totalBakeries) currentIsUsable = false;
    }
    if (currentIsUsable) return list.slice(-Math.min(val, list.length));
    var past = list.filter(function(m) { return m !== current; });
    var windowSize = Math.max(1, val - 1);
    return past.slice(-Math.min(windowSize, past.length));
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

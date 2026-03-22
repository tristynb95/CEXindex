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

// ========== PERCENTILE RANK ==========
window.GAILS.percentileRank = function(values, value, invert) {
  var sorted = [...values].sort((a, b) => invert ? b - a : a - b);
  var first = sorted.indexOf(value);
  var last = sorted.lastIndexOf(value);
  var avgRank = (first + last) / 2;
  return (avgRank / (sorted.length - 1)) * 100;
};

// ========== GENERIC HELPERS ==========
window.GAILS.avg = function(arr, k) { return arr.reduce((a, r) => a + r[k], 0) / arr.length; };

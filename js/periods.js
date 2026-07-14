// ========== PERIODS MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.buildPeriods = function(months) {
  var G = GAILS;
  var periods = { latest: [months[months.length - 1]], all: G.withCurrentMonth(months) };
  var fyQuarters = {};
  var fyHalves = {};

  months.forEach(function(m) {
    var parts = m.split(' ');
    var mi = G.MONTH_SHORT.indexOf(parts[0]);
    var yr = parseInt(parts[1]) + 2000;
    var fyYear, quarter, half;
    if (mi >= 2) {
      fyYear = yr + 1;
      if (mi <= 4) { quarter = 1; half = 1; }
      else if (mi <= 7) { quarter = 2; half = 1; }
      else if (mi <= 10) { quarter = 3; half = 2; }
      else { quarter = 4; half = 2; }
    } else {
      fyYear = yr;
      quarter = 4;
      half = 2;
    }
    var qKey = 'q' + quarter + '_fy' + (fyYear % 100);
    var hKey = 'h' + half + '_fy' + (fyYear % 100);
    if (!fyQuarters[qKey]) fyQuarters[qKey] = [];
    fyQuarters[qKey].push(m);
    if (!fyHalves[hKey]) fyHalves[hKey] = [];
    fyHalves[hKey].push(m);
  });

  Object.assign(periods, fyQuarters, fyHalves);
  return periods;
};

window.GAILS.buildPeriodButtons = function(periods, refresh) {
  var G = GAILS;
  var state = G.state;
  var container = document.getElementById('periodBtns');
  container.innerHTML = '';

  var btns = [{ key: 'latest', label: 'Latest Month' }];

  var qKeys = Object.keys(periods).filter(function(k) { return k.startsWith('q'); }).sort(function(a, b) {
    var ma = a.match(/q(\d+)_fy(\d+)/);
    var mb = b.match(/q(\d+)_fy(\d+)/);
    return mb[2] - ma[2] || mb[1] - ma[1];
  });
  qKeys.forEach(function(k) {
    var m = k.match(/q(\d+)_fy(\d+)/);
    btns.push({ key: k, label: 'Q' + m[1] + ' FY' + m[2] });
  });

  var hKeys = Object.keys(periods).filter(function(k) { return k.startsWith('h'); }).sort(function(a, b) {
    var ma = a.match(/h(\d+)_fy(\d+)/);
    var mb = b.match(/h(\d+)_fy(\d+)/);
    return mb[2] - ma[2] || mb[1] - ma[1];
  });
  hKeys.forEach(function(k) {
    var m = k.match(/h(\d+)_fy(\d+)/);
    btns.push({ key: k, label: 'H' + m[1] + ' FY' + m[2] });
  });

  btns.push({ key: 'all', label: 'All Time' });

  btns.forEach(function(btn) {
    var div = document.createElement('div');
    var rollingValue = document.getElementById('rollingWindow').value;
    var rollingActive = rollingValue !== '0' && rollingValue !== '';
    div.className = 'period-btn' + (btn.key === 'latest' && !rollingActive ? ' active' : '');
    div.dataset.period = btn.key;
    div.textContent = btn.label;
    div.addEventListener('click', function() {
      container.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
      div.classList.add('active');
      state.selectedMonths = state.PERIODS[btn.key];
      document.getElementById('monthSelect').value = '';
      document.getElementById('rollingWindow').value = '0';
      G.syncCustomSelect('monthSelect');
      G.syncCustomSelect('rollingWindow');
      refresh();
    });
    container.appendChild(div);
  });
};

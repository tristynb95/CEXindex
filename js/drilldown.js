// ========== DRILL-DOWN MODAL MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.showDrillDown = function(title, subtitle, bakeries, type) {
  var G = GAILS;
  var modal = document.getElementById('drillModal');
  var header = document.getElementById('drillHeader');
  var titleEl = document.getElementById('drillTitle');
  var subtitleEl = document.getElementById('drillSubtitle');
  var body = document.getElementById('drillBody');

  var bandColors = {
    'Excellent': '#e8f5e9', 'Good': '#f1f8e9', 'Developing': '#fff8e1', 'Needs Attention': '#fce4ec',
    'Exceeding': '#e8f5e9', 'Meeting': '#f1f8e9', 'Approaching': '#fff8e1', 'Below Standard': '#fce4ec'
  };
  header.style.background = bandColors[title] || '#f9f5f0';

  titleEl.textContent = title;
  subtitleEl.textContent = subtitle;

  var sorted = [].concat(bakeries).sort(function(a, b) { return b.c - a.c; });

  if (type === 'nps') {
    var npsSorted = [].concat(bakeries).sort(function(a, b) { return b.n - a.n; });
    var npsAvg = npsSorted.length ? Math.round(npsSorted.reduce(function(s, b) { return s + b.n; }, 0) / npsSorted.length) : 0;
    var ceiAvg = npsSorted.length ? Math.round(npsSorted.reduce(function(s, b) { return s + b.c; }, 0) / npsSorted.length) : 0;
    body.innerHTML = '<div style="display:flex;gap:1.2rem;margin-bottom:0.8rem;flex-wrap:wrap">' +
      '<div style="background:#f9f5f0;padding:0.5rem 1rem;border-radius:8px;text-align:center"><div style="font-size:0.7rem;color:var(--muted)">Avg NPS</div><div style="font-size:1.3rem;font-weight:700">' + npsAvg + '</div></div>' +
      '<div style="background:#f9f5f0;padding:0.5rem 1rem;border-radius:8px;text-align:center"><div style="font-size:0.7rem;color:var(--muted)">Avg CEI</div><div style="font-size:1.3rem;font-weight:700">' + ceiAvg + '</div></div>' +
      '<div style="background:#f9f5f0;padding:0.5rem 1rem;border-radius:8px;text-align:center"><div style="font-size:0.7rem;color:var(--muted)">Bakeries</div><div style="font-size:1.3rem;font-weight:700">' + npsSorted.length + '</div></div>' +
      '</div>' +
      '<table><thead><tr>' +
      '<th>#</th><th>Bakery</th><th>Region</th><th>Ops Manager</th>' +
      '<th>NPS</th><th>CEI</th><th>Band</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>Barista Speed</th><th>Conf</th>' +
      '</tr></thead><tbody>' +
      npsSorted.map(function(b, i) { return '<tr>' +
        '<td style="font-weight:600;color:var(--muted)">' + (i + 1) + '</td>' +
        '<td style="font-weight:500">' + b.b + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b.n + '</td>' +
        '<td>' + b.c + '</td>' +
        '<td><span style="padding:2px 6px;border-radius:4px;font-size:0.7rem;background:' + (G.COL[b.cb] || '#ccc') + '33;color:' + (G.COL[b.cb] || '#666') + '">' + b.cb + '</span></td>' +
        '<td>' + b.dr + '%</td><td>' + b.ef + '%</td><td>' + b.fr + '%</td>' +
        '<td>' + b.ts + '</td>' +
        '<td><span class="conf ' + b.co + '">' + b.co + '</span></td>' +
        '</tr>'; }).join('') +
      '</tbody></table>';
  } else if (type === 'relative') {
    body.innerHTML = '<table><thead><tr>' +
      '<th>#</th><th>Bakery</th><th>Region</th><th>Ops Manager</th>' +
      '<th>CEI</th><th>NPS</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>Barista Speed</th><th>>5m</th><th>Conf</th>' +
      '</tr></thead><tbody>' +
      sorted.map(function(b, i) { return '<tr>' +
        '<td style="font-weight:600;color:var(--muted)">' + (i + 1) + '</td>' +
        '<td style="font-weight:500">' + b.b + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b.c + '</td>' +
        '<td>' + b.n + '</td>' +
        '<td>' + b.dr + '%</td><td>' + b.ef + '%</td><td>' + b.fr + '%</td>' +
        '<td>' + b.ts + '</td>' +
        '<td style="color:' + (b.o5 > 4 ? 'var(--red)' : b.o5 > 2.5 ? 'var(--amber)' : 'inherit') + '">' + b.o5 + '%</td>' +
        '<td><span class="conf ' + b.co + '">' + b.co + '</span></td>' +
        '</tr>'; }).join('') +
      '</tbody></table>';
  } else {
    var absSorted = [].concat(bakeries).sort(function(a, b) { return b.ac - a.ac; });
    body.innerHTML = '<table><thead><tr>' +
      '<th>#</th><th>Bakery</th><th>Region</th><th>Ops Manager</th>' +
      '<th>Abs CEI</th><th>Rel CEI</th><th>NPS</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>Barista Speed</th><th>Conf</th>' +
      '</tr></thead><tbody>' +
      absSorted.map(function(b, i) { return '<tr>' +
        '<td style="font-weight:600;color:var(--muted)">' + (i + 1) + '</td>' +
        '<td style="font-weight:500">' + b.b + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b.ac + '</td>' +
        '<td>' + b.c + '</td>' +
        '<td>' + b.n + '</td>' +
        '<td style="color:' + (b.dr < 90 ? (b.dr < 80 ? 'var(--red)' : 'var(--amber)') : 'inherit') + '">' + b.dr + '%</td>' +
        '<td style="color:' + (b.ef < 90 ? (b.ef < 80 ? 'var(--red)' : 'var(--amber)') : 'inherit') + '">' + b.ef + '%</td>' +
        '<td style="color:' + (b.fr < 90 ? (b.fr < 80 ? 'var(--red)' : 'var(--amber)') : 'inherit') + '">' + b.fr + '%</td>' +
        '<td>' + b.ts + '</td>' +
        '<td><span class="conf ' + b.co + '">' + b.co + '</span></td>' +
        '</tr>'; }).join('') +
      '</tbody></table>';
  }

  modal.style.display = 'block';
  G.makeSortable(body);
};

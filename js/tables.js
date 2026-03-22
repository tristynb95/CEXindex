// ========== TABLES MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.makeSortable = function(container) {
  if (!container) return;
  var targets = container.tagName === 'TABLE' ? [container] : Array.from(container.querySelectorAll('table'));

  targets.forEach(function(table) {
    var headers = table.querySelectorAll('thead th');
    headers.forEach(function(th, colIdx) {
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

          var aVal = aCell.textContent.trim().replace(/[%,pts]/g, '').replace(/[↑↓↔]/g, '').trim();
          var bVal = bCell.textContent.trim().replace(/[%,pts]/g, '').replace(/[↑↓↔]/g, '').trim();

          var aNum = parseFloat(aVal);
          var bNum = parseFloat(bVal);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            return asc ? aNum - bNum : bNum - aNum;
          }

          if (aVal === '—' || aVal === '') return asc ? -1 : 1;
          if (bVal === '—' || bVal === '') return asc ? 1 : -1;

          return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        });

        rows.forEach(function(r) { tbody.appendChild(r); });
      });
    });
  });
};

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

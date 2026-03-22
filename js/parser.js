// ========== EXCEL PARSER MODULE ==========
window.GAILS = window.GAILS || {};

window.GAILS.parseExcelFile = function(data) {
  var G = GAILS;
  var wb = XLSX.read(data, { type: 'array' });
  var allRecords = [];
  var months = [];

  wb.SheetNames.forEach(function(sheetName) {
    var monthLabel = G.parseSheetMonth(sheetName);
    if (!monthLabel) return;

    var ws = wb.Sheets[sheetName];
    var json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    var headerIdx = -1;
    for (var i = 0; i < Math.min(json.length, 10); i++) {
      if (json[i] && json[i][0] && String(json[i][0]).trim() === 'Bakery') {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) return;

    var headers = json[headerIdx].map(function(h) { return h ? String(h).trim() : ''; });

    var colMap = {};
    headers.forEach(function(h, i) {
      var lc = h.toLowerCase();
      if (lc === 'bakery') colMap.bakery = i;
      else if (lc === 'rank') colMap.rank = i;
      else if (lc.includes('nps')) colMap.nps = i;
      else if (lc.includes('volume')) colMap.vol = i;
      else if (lc.includes('within 2 min') && lc.includes('weekend')) colMap.s2w = i;
      else if (lc.includes('within 2 min')) colMap.s2 = i;
      else if (lc.includes('within 3')) colMap.s3 = i;
      else if (lc.includes('over 5') || lc.includes('5 min')) colMap.o5 = i;
      else if (lc === 'overall') colMap.ov = i;
      else if (lc === 'friendliness') colMap.fr = i;
      else if (lc === 'drink' || lc === 'quality') colMap.dr = i;
      else if (lc === 'efficiency' || lc === 'overall efficiency' || lc === 'speed of service' || lc === 'speed') colMap.ef = i;
    });

    var monthRecs = [];
    for (var i = headerIdx + 1; i < json.length; i++) {
      var row = json[i];
      if (!row || !row[colMap.bakery] || typeof row[colMap.bakery] !== 'string') continue;
      var bakery = row[colMap.bakery].trim();
      if (!bakery || bakery === 'Total' || bakery === '') continue;

      var num = function(idx) {
        var v = row[idx];
        if (v === null || v === undefined || v === '') return 0;
        return typeof v === 'number' ? v : parseFloat(v) || 0;
      };

      var r = {
        b: bakery,
        m: monthLabel,
        nr: num(colMap.rank),
        n: Math.round(num(colMap.nps) * 10) / 10,
        v: Math.round(num(colMap.vol)),
        s2: Math.round(num(colMap.s2) * 1000) / 10,
        s2w: Math.round(num(colMap.s2w) * 1000) / 10,
        s3: Math.round(num(colMap.s3) * 1000) / 10,
        o5: Math.round(num(colMap.o5) * 1000) / 10,
        ov: Math.round(num(colMap.ov) * 1000) / 10,
        fr: Math.round(num(colMap.fr) * 1000) / 10,
        dr: Math.round(num(colMap.dr) * 1000) / 10,
        ef: Math.round(num(colMap.ef) * 1000) / 10,
      };
      monthRecs.push(r);
    }

    if (monthRecs.length > 0) {
      G.computeCEI(monthRecs);
      months.push(monthLabel);
      allRecords.push.apply(allRecords, monthRecs);
    }
  });

  months.sort(function(a, b) { return G.monthSortKey(a) - G.monthSortKey(b); });

  return { records: allRecords, months: months };
};

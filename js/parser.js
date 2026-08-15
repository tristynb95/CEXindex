// ========== EXCEL PARSER MODULE ==========
window.GAILS = window.GAILS || {};

// Converts an Excel serial date number to a JS Date (Excel epoch = 1900-01-01,
// serial 25569 = 1970-01-01). Fractional part carries the time of day.
function excelSerialToDate(serial) {
  return new Date(Math.round((serial - 25569) * 86400 * 1000));
}

// Extracts a timestamp from the "Last Updated" tab. The sheet layout isn't
// guaranteed (label in one cell, value in another, or a single cell), so scan
// every cell and take the first thing that looks like a date: a real Date
// (cellDates), a plausible Excel serial, a dd/mm/yyyy string, or an ISO string.
function parseLastUpdatedSheet(ws) {
  var json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  for (var i = 0; i < json.length; i++) {
    var row = json[i] || [];
    for (var j = 0; j < row.length; j++) {
      var v = row[j];
      if (v === null || v === undefined || v === '') continue;
      if (v instanceof Date && !isNaN(v)) return v.toISOString();
      if (typeof v === 'number' && v > 40000 && v < 80000) return excelSerialToDate(v).toISOString();
      if (typeof v === 'string') {
        // UK-style dd/mm/yyyy, optionally with hh:mm[:ss]
        var uk = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v.trim());
        if (uk) {
          var yr = parseInt(uk[3], 10); if (yr < 100) yr += 2000;
          var d = new Date(yr, parseInt(uk[2], 10) - 1, parseInt(uk[1], 10),
            parseInt(uk[4] || '0', 10), parseInt(uk[5] || '0', 10), parseInt(uk[6] || '0', 10));
          if (!isNaN(d)) return d.toISOString();
        }
        var parsed = Date.parse(v.trim());
        if (!isNaN(parsed) && /\d{4}/.test(v)) return new Date(parsed).toISOString();
      }
    }
  }
  return null;
}

window.GAILS.parseExcelFile = function(data) {
  var G = GAILS;
  var wb = XLSX.read(data, { type: 'array', cellDates: true });
  var allRecords = [];
  var months = [];
  var lastUpdated = null;

  wb.SheetNames.forEach(function(sheetName) {
    if (sheetName.trim().toLowerCase() === 'last updated' && !lastUpdated) {
      lastUpdated = parseLastUpdatedSheet(wb.Sheets[sheetName]);
    }
  });

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
      var lc = h.toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
      if (lc === 'bakery') colMap.bakery = i;
      else if (lc === 'rank') colMap.rank = i;
      else if (lc.includes('nps')) {
        // The export carries several NPS splits — match those before the headline score.
        if (lc.includes('coffee')) colMap.nc = i;
        else if (lc.includes('drink') || lc.includes('retail')) colMap.nd = i;
        else if (lc.includes('meal')) colMap.nm = i;
        else colMap.nps = i;
      }
      else if (lc.includes('coffee') && lc.includes('respon')) colMap.vc = i;
      else if (lc.includes('food') && lc.includes('respon')) colMap.vf = i;
      else if (lc.includes('volume')) colMap.vol = i;
      else if (lc.includes('within 30')) colMap.s30 = i; // "Within 30 Sec" — before the "within 3" check
      else if (lc.includes('within 2 min') && lc.includes('weekend')) colMap.s2w = i;
      else if (lc.includes('within 2 min')) colMap.s2 = i;
      else if (lc.includes('within 3')) colMap.s3 = i;
      else if (lc.includes('within 4')) colMap.s4 = i;
      else if (lc.includes('over 5') || lc.includes('5 min')) colMap.o5 = i;
      else if (lc === 'overall') colMap.ov = i;
      else if (lc === 'friendliness') colMap.fr = i;
      else if (lc === 'drink' || lc === 'quality') colMap.dr = i;
      else if (lc === 'efficiency' || lc === 'overall efficiency' || lc === 'speed of service' || lc === 'speed') colMap.ef = i;
      else if (lc.includes('total drink')) colMap.td = i;
      else if (lc.includes('avg time') || lc.includes('average time')) {
        if (lc.includes('8am-12') || lc.includes('8-12')) colMap.at12 = i;
        else if (lc.includes('8am-9') || lc.includes('8-9')) colMap.at9 = i;
        else colMap.at = i;
      }
    });

    if (colMap.s2 === undefined) {
      console.warn('[CEXindex] Coffee Efficiency column ("within 2 min") not found on sheet "' + sheetName + '" — it will read as 0%. Headers seen: ' + JSON.stringify(headers));
    }

    var monthRecs = [];
    for (var i = headerIdx + 1; i < json.length; i++) {
      var row = json[i];
      if (!row || !row[colMap.bakery] || typeof row[colMap.bakery] !== 'string') continue;
      var bakery = row[colMap.bakery].trim();
      if (!bakery || bakery === 'Total' || bakery === '') continue;
      // Collapse alias/punctuation variants (e.g. "Union Street - Bath" vs
      // "Union Street, Bath") to a single canonical name so all data for a site
      // is treated as one bakery across the filter, tables, map and drilldowns.
      if (G.resolveBakeryMetaKey) bakery = G.resolveBakeryMetaKey(bakery) || bakery;

      var num = function(idx) {
        var v = row[idx];
        if (v === null || v === undefined || v === '') return 0;
        return typeof v === 'number' ? v : parseFloat(v) || 0;
      };

      // Coffee Efficiency (timing) columns are sometimes exported as a fraction
      // (0.75) and sometimes as a whole percentage (75, or the text "75%") depending
      // on how the source sheet was formatted. Normalize both to a 0-100 scale:
      // a "%" sign or any value already above 1 is treated as already-percentage.
      var pct = function(idx) {
        var v = row[idx];
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'string') {
          var isPercentText = v.indexOf('%') !== -1;
          var n = parseFloat(v.replace('%', '')) || 0;
          return isPercentText ? n : (n <= 1 ? n * 100 : n);
        }
        var n = typeof v === 'number' ? v : parseFloat(v) || 0;
        return n <= 1 ? n * 100 : n;
      };

      // Sparse columns (NPS splits, avg times, response counts) are often blank
      // for low-volume bakeries. Blank must stay null — not 0 — so averages and
      // display don't treat "no data" as a real score.
      var numOrNull = function(idx) {
        if (idx === undefined) return null;
        var v = row[idx];
        if (v === null || v === undefined || v === '') return null;
        var n = typeof v === 'number' ? v : parseFloat(v);
        return isNaN(n) ? null : Math.round(n * 10) / 10;
      };
      var durationOrNull = function(idx) {
        if (idx === undefined) return null;
        var secs = G.parseDurationSeconds(row[idx]);
        return secs === null || isNaN(secs) ? null : Math.round(secs * 10) / 10;
      };

      // Headline NPS policy: the score is Drink + Meal only — food-only ratings
      // are cut out, and the food-only responses are netted out of the volume to
      // match. Every sheet now carries the split (the back catalogue was
      // reworked to it), so the raw all-ratings fallback below only exists for
      // an old sheet re-uploaded by mistake; na/va keep the raw figures for
      // reference either way.
      var ndVal = numOrNull(colMap.nd);
      var vfVal = numOrNull(colMap.vf);
      var rawN = Math.round(num(colMap.nps) * 10) / 10;
      var rawV = Math.round(num(colMap.vol));

      var r = {
        b: bakery,
        m: monthLabel,
        nr: num(colMap.rank),
        n: ndVal !== null ? ndVal : rawN,
        na: rawN,
        v: Math.max(0, rawV - (vfVal || 0)),
        va: rawV,
        s2: Math.round(pct(colMap.s2) * 10) / 10,
        s2w: Math.round(pct(colMap.s2w) * 10) / 10,
        s3: Math.round(pct(colMap.s3) * 10) / 10,
        s4: Math.round(pct(colMap.s4) * 10) / 10,
        o5: Math.round(pct(colMap.o5) * 10) / 10,
        ov: Math.round(num(colMap.ov) * 1000) / 10,
        fr: Math.round(num(colMap.fr) * 1000) / 10,
        dr: Math.round(num(colMap.dr) * 1000) / 10,
        ef: Math.round(num(colMap.ef) * 1000) / 10,
        s30: Math.round(pct(colMap.s30) * 10) / 10,
        td: Math.round(num(colMap.td)),
        at: durationOrNull(colMap.at),
        at12: durationOrNull(colMap.at12),
        at9: durationOrNull(colMap.at9),
        nc: numOrNull(colMap.nc),
        nm: numOrNull(colMap.nm),
        nd: ndVal,
        vc: numOrNull(colMap.vc),
        vf: vfVal,
      };
      if (r.s4 < r.s3) r.s4 = r.s3;
      if (r.s3 + r.o5 > 105) console.warn('[CEXindex] Suspect timing data for ' + bakery + ' (' + monthLabel + '): s3=' + r.s3 + ' o5=' + r.o5);
      monthRecs.push(r);
    }

    if (monthRecs.length > 0) {
      G.computeCEI(monthRecs);
      months.push(monthLabel);
      allRecords.push.apply(allRecords, monthRecs);
    }
  });

  months.sort(function(a, b) { return G.monthSortKey(a) - G.monthSortKey(b); });

  return { records: allRecords, months: months, lastUpdated: lastUpdated };
};

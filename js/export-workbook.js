// ========== SHARED EXCEL EXPORT ==========
// One implementation of the spreadsheet an export produces. Bakery Reports,
// My Activity and My Team each had their own copy of this, and the copies had
// drifted: My Team's cell writer had lost its 'percent' branch entirely, so a
// percentage column would have reached Excel as text while the sheet's own
// number format still advertised '0.0%'.
//
// Deliberately NOT shared: the final write. Bakery Reports uses
// XLSX.writeFile; the personal hubs write through XLSX.write + a Blob. That
// split is intentional and pinned by test/excel-export-confirmation.test.js,
// which allows exactly one writeFile call in the codebase.
//
// A classic script rather than an ES module because js/visit-report.js is a
// classic script and cannot import; the hubs reach it through window.GAILS.
window.GAILS = window.GAILS || {};

(function () {
  // Percent precision differs by surface on purpose: Bakery Reports exports
  // whole percentages, the personal hubs export one decimal.
  var DEFAULT_FORMATS = { date: 'dd mmm yyyy', percent: '0.0%', number: '0' };

  // The CSV fallback reads its precision off the same format string the XLSX
  // path applies, so the two can no longer disagree — which is exactly how
  // '87%' and '87.3%' came to describe the same number on different pages.
  function percentDecimals(format) {
    var match = /^0(?:\.(0+))?%$/.exec(format || '');
    return match && match[1] ? match[1].length : 0;
  }

  // Blank cells become null so aoa_to_sheet leaves them genuinely empty rather
  // than writing an empty string Excel then treats as text.
  function cellValue(value, type) {
    if (value == null || value === '') return null;
    if (type === 'date') {
      var d = new Date(String(value).slice(0, 10) + 'T00:00:00');
      return isNaN(d.getTime()) ? String(value) : d;
    }
    if (type === 'percent' || type === 'number') {
      var n = Number(value);
      return isNaN(n) ? String(value) : n;
    }
    return String(value);
  }

  function cellText(value, type, formats) {
    var v = cellValue(value, type);
    if (v == null) return '';
    if (v instanceof Date) {
      return v.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (type === 'percent' && typeof v === 'number') {
      var scale = Math.pow(10, percentDecimals((formats || DEFAULT_FORMATS).percent));
      return (Math.round(v * 100 * scale) / scale) + '%';
    }
    return String(v);
  }

  function buildDataSheet(data, formats) {
    var X = window.XLSX;
    var numberFormats = formats || DEFAULT_FORMATS;
    var header = data.columns.map(function (col) { return col.label; });
    var body = data.rows.map(function (row) {
      return row.map(function (cell, i) {
        return cellValue(cell, data.columns[i] ? data.columns[i].type : 'text');
      });
    });
    var ws = X.utils.aoa_to_sheet([header].concat(body), { cellDates: true });
    var range = X.utils.decode_range(ws['!ref']);

    data.columns.forEach(function (col, c) {
      var fmt = numberFormats[col.type];
      if (!fmt) return;
      for (var r = 1; r <= range.e.r; r++) {
        var cell = ws[X.utils.encode_cell({ r: r, c: c })];
        if (cell && cell.t !== 's') cell.z = fmt;
      }
    });

    ws['!cols'] = data.columns.map(function (col) { return { wch: col.width || 16 }; });
    // The free SheetJS build cannot write bold headers or frozen panes, so the
    // autofilter does that job: it marks row 1 as the header and lets people
    // slice the export without restructuring it.
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
    return ws;
  }

  function buildInfoSheet(data) {
    var X = window.XLSX;
    var ws = X.utils.aoa_to_sheet([[data.title], []].concat(data.meta || []));
    ws['!cols'] = [{ wch: 22 }, { wch: 54 }];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    return ws;
  }

  function triggerDownload(blob, filename) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  // Used when the XLSX library never loaded — same rows, same order, as CSV.
  function csvFallback(data, formats) {
    var lines = [[data.title]]
      .concat(data.meta || [])
      .concat([[], data.columns.map(function (col) { return col.label; })])
      .concat(data.rows.map(function (row) {
        return row.map(function (cell, i) {
          return cellText(cell, data.columns[i] ? data.columns[i].type : 'text', formats);
        });
      }));
    var csv = lines.map(function (row) {
      return row.map(function (cell) {
        return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
    // BOM so Excel opens it as UTF-8.
    triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }),
      data.filename.replace(/\.xlsx$/, '.csv'));
  }

  window.GAILS.ExportWorkbook = {
    DEFAULT_FORMATS: DEFAULT_FORMATS,
    percentDecimals: percentDecimals,
    cellValue: cellValue,
    cellText: cellText,
    buildDataSheet: buildDataSheet,
    buildInfoSheet: buildInfoSheet,
    triggerDownload: triggerDownload,
    csvFallback: csvFallback
  };
})();

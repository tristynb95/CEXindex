// ========== ON-DEMAND THIRD-PARTY LIBRARY LOADER ==========
// SheetJS (~900KB), Leaflet and pdf.js used to sit in <head> as blocking
// <script> tags, so every page paid for all three before it could render even
// though most sessions never export a file, open a map, or import a PDF.
//
// They are fetched through here instead: on demand at the call site, and warmed
// in the background once the page has gone idle so a click that needs one
// almost never waits.
//
// Two rules keep this a pure speed change:
//
//   1. A page only ever loads what it declares in data-libs on this script's
//      own tag, mirroring the <script> tags it used to carry. My Team never
//      shipped SheetJS, so it still exports CSV rather than Excel.
//   2. Every ensure* resolves with the global or `null` and never rejects,
//      because the call sites already degrade gracefully when a library is
//      missing — and that has to survive an unreachable CDN as it did before.
window.GAILS = window.GAILS || {};

(function () {
  var G = window.GAILS;

  var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var LEAFLET_JS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  var LEAFLET_CSS_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  var LEAFLET_JS_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var pending = {};

  function loadScript(url, attrs) {
    if (pending[url]) return pending[url];
    pending[url] = new Promise(function (resolve) {
      var el = document.createElement('script');
      // async=false keeps injected scripts in insertion order, matching how the
      // blocking tags behaved for anything that pulls in more than one file.
      el.async = false;
      el.onload = function () { resolve(true); };
      el.onerror = function () { resolve(false); };
      if (attrs) {
        Object.keys(attrs).forEach(function (name) { el.setAttribute(name, attrs[name]); });
      }
      el.src = url;
      document.head.appendChild(el);
    });
    return pending[url];
  }

  function loadStylesheet(url) {
    if (pending[url]) return pending[url];
    pending[url] = new Promise(function (resolve) {
      var el = document.createElement('link');
      el.rel = 'stylesheet';
      el.onload = function () { resolve(true); };
      el.onerror = function () { resolve(false); };
      el.href = url;
      document.head.appendChild(el);
    });
    return pending[url];
  }

  var allowed = {};
  function isAllowed(name) { return allowed[name] === true; }

  var LOADERS = {
    // The Excel reader/writer behind every .xlsx import and export.
    xlsx: function () {
      return loadScript(XLSX_URL).then(function () { return window.XLSX || null; });
    },

    // Leaflet needs its stylesheet in place before a map is constructed, or the
    // container measures wrong and tiles come back clipped — so resolve only
    // once both halves have landed.
    leaflet: function () {
      return Promise.all([
        loadStylesheet(LEAFLET_CSS_URL),
        loadScript(LEAFLET_JS_URL, { integrity: LEAFLET_JS_INTEGRITY, crossorigin: '' })
      ]).then(function () { return window.L || null; });
    },

    // Reads scanned CQV/NBO reports on the admin page. Its worker URL was set by
    // an inline tag beside the old blocking script; it moves here so the setting
    // still happens exactly once, right after the library arrives.
    pdfjs: function () {
      return loadScript(PDFJS_URL).then(function () {
        if (window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
        }
        return window.pdfjsLib || null;
      });
    }
  };

  function ensure(name, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (!isAllowed(name)) return Promise.resolve(null);
    return LOADERS[name]();
  }

  G.ensureXLSX = function () { return ensure('xlsx', 'XLSX'); };
  G.ensureLeaflet = function () { return ensure('leaflet', 'L'); };
  G.ensurePdfJs = function () { return ensure('pdfjs', 'pdfjsLib'); };

  // Warms the declared libraries after the page has loaded and the main thread
  // has gone quiet. Nothing waits on this — it only means the fetch has usually
  // finished by the time a user reaches the feature that needs it.
  function prefetch(names) {
    if (!names.length) return;
    var started = false;
    function start() {
      if (started) return;
      started = true;
      var idle = window.requestIdleCallback ||
        function (fn) { return window.setTimeout(fn, 1); };
      idle(function () {
        names.forEach(function (name) { LOADERS[name](); });
      }, { timeout: 3000 });
    }
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  }

  // Each page declares its libraries via data-libs on this script's own tag, so
  // the list lives beside the page that needs it rather than being hard-coded.
  var self = document.currentScript;
  var declared = (self && self.getAttribute('data-libs') || '')
    .split(',')
    .map(function (name) { return name.trim(); })
    .filter(function (name) { return Object.prototype.hasOwnProperty.call(LOADERS, name); });

  declared.forEach(function (name) { allowed[name] = true; });
  prefetch(declared);
}());

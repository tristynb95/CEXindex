const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'lazy-lib.js'), 'utf8');

const PAGES = {
  'index.html': fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  'my-activity.html': fs.readFileSync(path.join(root, 'my-activity.html'), 'utf8'),
  'admin.html': fs.readFileSync(path.join(root, 'admin.html'), 'utf8'),
  'my-team.html': fs.readFileSync(path.join(root, 'my-team.html'), 'utf8'),
  'bakery-profile.html': fs.readFileSync(path.join(root, 'bakery-profile.html'), 'utf8')
};

// Runs js/lazy-lib.js against a document stub that records every element it
// appends and lets each load be resolved by hand, so the loader's behaviour can
// be checked without a browser or a network.
function load(dataLibs, options) {
  const settings = options || {};
  const appended = [];

  function createElement(tag) {
    const el = { tagName: tag, setAttribute(name, value) { this[name] = value; } };
    // A real browser starts fetching the moment src/href is assigned, so fire
    // the outcome on assignment rather than making the test drive it.
    let src;
    Object.defineProperty(el, tag === 'script' ? 'src' : 'href', {
      get() { return src; },
      set(value) {
        src = value;
        appended.push(value);
        const succeed = settings.fail ? !settings.fail.test(value) : true;
        setTimeout(() => {
          if (succeed && settings.onLoad) settings.onLoad(value, host.window);
          if (succeed) { if (el.onload) el.onload(); } else if (el.onerror) el.onerror();
        }, 0);
      }
    });
    return el;
  }

  const host = {
    window: { setTimeout, addEventListener() {} },
    setTimeout,
    document: {
      readyState: 'complete',
      currentScript: { getAttribute: (name) => (name === 'data-libs' ? dataLibs : null) },
      createElement,
      head: { appendChild() {} }
    },
    Promise
  };
  host.window.document = host.document;
  vm.createContext(host);
  vm.runInContext(source, host);
  return { GAILS: host.window.GAILS, window: host.window, appended };
}

test('a page only loads the libraries it declares', async () => {
  const { GAILS, appended } = load('xlsx', {
    onLoad(url, win) { if (/xlsx/.test(url)) win.XLSX = { marker: true }; }
  });

  assert.deepEqual(await GAILS.ensureXLSX(), { marker: true });

  // Leaflet and pdf.js are undeclared, so they resolve as unavailable and no
  // request is made for them — the page behaves exactly as it did without them.
  assert.equal(await GAILS.ensureLeaflet(), null);
  assert.equal(await GAILS.ensurePdfJs(), null);
  assert.ok(appended.every((url) => /xlsx/.test(url)), 'requested ' + appended.join(', '));
});

test('an unreachable CDN resolves as unavailable rather than rejecting', async () => {
  const { GAILS } = load('xlsx,leaflet,pdfjs', { fail: /./ });

  // Call sites fall back to CSV / "Map unavailable" on a null, so a failed fetch
  // has to surface as null and never as an unhandled rejection.
  assert.equal(await GAILS.ensureXLSX(), null);
  assert.equal(await GAILS.ensureLeaflet(), null);
  assert.equal(await GAILS.ensurePdfJs(), null);
});

test('Leaflet waits for its stylesheet as well as its script', async () => {
  const { GAILS, appended } = load('leaflet', {
    onLoad(url, win) { if (/leaflet\.js/.test(url)) win.L = { map() {} }; }
  });

  assert.ok(await GAILS.ensureLeaflet());
  assert.ok(appended.some((url) => /leaflet@1\.9\.4\/dist\/leaflet\.css/.test(url)));
  assert.ok(appended.some((url) => /leaflet@1\.9\.4\/dist\/leaflet\.js/.test(url)));
});

test('pdf.js gets its worker URL as soon as it arrives', async () => {
  const { GAILS } = load('pdfjs', {
    onLoad(url, win) { if (/pdf\.min\.js/.test(url)) win.pdfjsLib = { GlobalWorkerOptions: {} }; }
  });

  const lib = await GAILS.ensurePdfJs();
  assert.match(lib.GlobalWorkerOptions.workerSrc, /pdf\.worker\.min\.js$/);
});

test('repeat calls reuse the one request', async () => {
  const { GAILS, appended } = load('xlsx', {
    onLoad(url, win) { win.XLSX = { marker: true }; }
  });

  await Promise.all([GAILS.ensureXLSX(), GAILS.ensureXLSX()]);
  await GAILS.ensureXLSX();
  assert.equal(appended.filter((url) => /xlsx/.test(url)).length, 1);
});

test('each page declares the libraries its features need', () => {
  const declared = (html) => {
    const match = /<script defer src="js\/lazy-lib\.js" data-libs="([^"]*)"/.exec(html);
    assert.ok(match, 'page does not load js/lazy-lib.js');
    return match[1].split(',').map((name) => name.trim()).filter(Boolean);
  };

  // Mirrors the blocking <script> tags each page used to carry — the dashboard
  // and My Activity both export workbooks and draw maps; admin imports .xlsx
  // and PDF; My Team and Bakery Profile shipped neither and still must not.
  assert.deepEqual(declared(PAGES['index.html']).sort(), ['leaflet', 'xlsx']);
  assert.deepEqual(declared(PAGES['my-activity.html']).sort(), ['leaflet', 'xlsx']);
  assert.deepEqual(declared(PAGES['admin.html']).sort(), ['pdfjs', 'xlsx']);
  assert.deepEqual(declared(PAGES['my-team.html']), []);
  assert.deepEqual(declared(PAGES['bakery-profile.html']), []);
});

test('no page still blocks on the libraries in a script tag', () => {
  Object.entries(PAGES).forEach(([name, html]) => {
    assert.doesNotMatch(html, /<script[^>]*src="[^"]*xlsx[^"]*"/, name + ' still blocks on SheetJS');
    assert.doesNotMatch(html, /<script[^>]*src="[^"]*leaflet[^"]*"/, name + ' still blocks on Leaflet');
    assert.doesNotMatch(html, /<script[^>]*src="[^"]*pdf\.min\.js"/, name + ' still blocks on pdf.js');
    // Chart.js stays in the page, but deferred so it cannot stall the parser.
    const chart = /<script([^>]*)src="[^"]*chart\.umd\.min\.js"/.exec(html);
    if (chart) assert.match(chart[1], /\bdefer\b/, name + ' loads Chart.js without defer');
  });
});

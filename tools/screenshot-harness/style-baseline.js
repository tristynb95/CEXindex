// Computed-style regression check for the fixtures in ./fixtures.
//
//   node tools/screenshot-harness/style-baseline.js            # check
//   node tools/screenshot-harness/style-baseline.js --update   # re-record
//
// Why a fixture rather than the real pages: css/styles.css is source-order driven
// and page stylesheets load after it, so moving a rule between them silently flips
// which one wins. Source-text tests cannot see that — only a browser resolving the
// real cascade can. probe.js does that for whole pages, but index.html never
// yields its main thread under the Firebase stub, so the dashboard is unreachable
// that way; these fixtures carry its markup instead.
//
// Unlike probe.js this never touches the working tree: alternate CSS is served,
// not swapped onto disk.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures');
const BASELINE = path.join(__dirname, 'style-baseline.json');
const CACHE = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
const UPDATE = process.argv.includes('--update');

const PROPS = ['display', 'position', 'width', 'height', 'flex-basis', 'flex-grow', 'flex-shrink',
  'color', 'background-color', 'font-size', 'font-weight', 'line-height',
  'margin-top', 'margin-bottom', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border-top-width', 'border-top-color', 'border-radius', 'box-shadow', 'gap',
  'flex-direction', 'align-items', 'justify-content', 'overflow'];

const VIEWS = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 900 }];

function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  for (const d of fs.readdirSync(CACHE).filter((x) => x.startsWith('chromium-')))
    for (const r of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) {
      const p = path.join(CACHE, d, r); if (fs.existsSync(p)) return p;
    }
  throw new Error('no cached Chromium under ' + CACHE);
}

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const base = u.startsWith('/fixtures/') ? __dirname : ROOT;
      const f = path.join(base, u);
      const inside = path.resolve(f).toLowerCase().startsWith(path.resolve(base).toLowerCase());
      if (!inside || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

(async () => {
  const names = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.html')).sort();
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: findChromium() });
  const recorded = {};

  for (const file of names) {
    recorded[file] = {};
    for (const view of VIEWS) {
      const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
      await page.goto(base + '/fixtures/' + file, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(() => (document.fonts && document.fonts.ready) || null).catch(() => {});
      recorded[file][view.name] = await page.evaluate((props) => {
        const out = {};
        document.querySelectorAll('[data-probe]').forEach((el) => {
          const cs = getComputedStyle(el);
          const one = {};
          props.forEach((p) => { one[p] = cs.getPropertyValue(p); });
          out[el.getAttribute('data-probe')] = one;
        });
        return out;
      }, PROPS);
      await page.close();
    }
  }
  await browser.close();
  server.close();

  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify(recorded, null, 2) + '\n');
    const n = Object.values(recorded).reduce((a, v) => a + Object.values(v).reduce((b, w) => b + Object.keys(w).length, 0), 0);
    console.log('recorded ' + n + ' element/view snapshots to style-baseline.json');
    return;
  }

  if (!fs.existsSync(BASELINE)) {
    console.error('no style-baseline.json — run with --update first');
    process.exit(2);
  }
  const want = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  let changed = 0;
  for (const file of new Set(Object.keys(want).concat(Object.keys(recorded)))) {
    for (const view of VIEWS.map((v) => v.name)) {
      const a = (want[file] || {})[view] || {};
      const b = (recorded[file] || {})[view] || {};
      for (const probe of new Set(Object.keys(a).concat(Object.keys(b)))) {
        const pa = a[probe] || {};
        const pb = b[probe] || {};
        for (const prop of PROPS) {
          if (pa[prop] === pb[prop]) continue;
          changed++;
          console.log('  ' + file + '/' + view + '  [' + probe + '] ' + prop);
          console.log('      baseline: "' + pa[prop] + '"');
          console.log('      now:      "' + pb[prop] + '"');
        }
      }
    }
  }
  console.log(changed ? '\n' + changed + ' computed-style change(s). If intended, re-run with --update.'
    : '\nno computed-style change');
  process.exit(changed ? 1 : 0);
})().catch((e) => { console.error(e.message); process.exit(2); });

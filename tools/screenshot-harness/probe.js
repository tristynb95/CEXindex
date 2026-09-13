// Records the computed style of every element on a page, so two CSS versions can
// be compared by what the CSS actually DOES rather than by pixels.
//
// Stronger than a screenshot for pure CSS work: immune to render timing (fonts,
// map tiles, in-flight transitions), and when something changes it names the
// element and the property instead of just saying "this PNG differs".
//
//   node tools/screenshot-harness/probe.js --page=admin --tag=before
//   ...change CSS...
//   node tools/screenshot-harness/probe.js --page=admin --tag=after
//   node tools/screenshot-harness/compare-styles.js before after
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'probes');
const CACHE = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');

function arg(n, d) { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; }
const TAG = arg('tag', 'run');
const PAGE = arg('page', 'bakery-profile');
const QUERY = arg('query', PAGE === 'bakery-profile' ? '?bakery=Test%20Bakery' : '');

function findChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  for (const d of fs.readdirSync(CACHE).filter((x) => x.startsWith('chromium-')))
    for (const r of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) {
      const p = path.join(CACHE, d, r); if (fs.existsSync(p)) return p;
    }
  throw new Error('no cached Chromium under ' + CACHE);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const f = path.join(ROOT, u === '/' ? 'index.html' : u);
      const inside = path.resolve(f).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase());
      if (!inside || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}

// Everything a CSS edit can plausibly move. Kept explicit so the comparison is
// stable across runs and cheap to diff.
const PROPS = ['display', 'position', 'width', 'height', 'color', 'background-color', 'background-image',
  'font-size', 'font-weight', 'font-family', 'line-height', 'letter-spacing', 'text-transform', 'text-align',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-color', 'border-left-color', 'border-radius', 'box-shadow', 'opacity', 'z-index',
  'flex-direction', 'justify-content', 'align-items', 'gap', 'grid-template-columns', 'overflow'];

const VIEWS = [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 900 }];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const stub = fs.readFileSync(path.join(__dirname, 'firebase-stub.js'), 'utf8');
  const browser = await chromium.launch({ executablePath: findChromium() });
  const result = {};

  for (const view of VIEWS) {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
    await page.route('**://**', (r) => {
      const u = r.request().url();
      if (u.startsWith(base)) return r.continue();
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|unpkg\.com/.test(u)) return r.continue();
      return r.abort();
    });
    await page.route('**www.gstatic.com/firebasejs/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/javascript', body: stub }));
    await page.goto(`${base}/${PAGE}.html${QUERY}`, { waitUntil: 'commit', timeout: 60000 });
    await page.evaluate(() => (document.fonts && document.fonts.ready) || null).catch(() => {});
    await page.waitForTimeout(2600);
    result[view.name] = await page.evaluate((props) => {
      const out = {};
      document.querySelectorAll('*').forEach((el, i) => {
        const cs = getComputedStyle(el);
        const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
        out[i + '|' + el.tagName + '|' + String(cls).trim().replace(/\s+/g, '.')] =
          props.map((p) => cs.getPropertyValue(p)).join('~');
      });
      return out;
    }, PROPS);
    console.log(`${view.name}: ${Object.keys(result[view.name]).length} elements`);
    await page.close();
  }
  await browser.close(); server.close();
  fs.writeFileSync(path.join(OUT, `${TAG}-${PAGE}.json`), JSON.stringify({ props: PROPS, views: result }));
  console.log('saved ' + `${TAG}-${PAGE}.json`);
})();

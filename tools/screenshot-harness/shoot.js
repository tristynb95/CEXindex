// Renders a page of this site headlessly with Firebase stubbed and writes a
// full-page screenshot per viewport. See README.md for why this exists.
const { chromium } = require('playwright-core');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'shots');
const CHROMIUM_CACHE = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}
const TAG = arg('tag', 'run');
const PAGE = arg('page', 'bakery-profile');
const QUERY = arg('query', PAGE === 'bakery-profile' ? '?bakery=Test%20Bakery' : '');

// Chromium is cached by a previous playwright install; never download one.
function findChromium() {
  const override = process.env.CHROMIUM_PATH;
  if (override && fs.existsSync(override)) return override;
  if (!fs.existsSync(CHROMIUM_CACHE)) throw new Error('No cached Chromium at ' + CHROMIUM_CACHE);
  for (const dir of fs.readdirSync(CHROMIUM_CACHE).filter((d) => d.startsWith('chromium-'))) {
    for (const rel of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe', 'chrome-linux/chrome']) {
      const exe = path.join(CHROMIUM_CACHE, dir, rel);
      if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('Cached Chromium found but no executable inside ' + CHROMIUM_CACHE);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      // Normalise case and separators: path.join yields backslashes on Windows,
      // so a naive startsWith against a forward-slash root rejects every file.
      const inside = path.resolve(file).toLowerCase().startsWith(path.resolve(ROOT).toLowerCase());
      if (!inside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const VIEWS = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'mobile', width: 390, height: 900 }
];

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const stub = fs.readFileSync(path.join(__dirname, 'firebase-stub.js'), 'utf8');
  const browser = await chromium.launch({ executablePath: findChromium() });
  const errors = [];

  for (const view of VIEWS) {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
    page.on('pageerror', (e) => errors.push(`[${view.name}] ${e}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${view.name}] ${m.text()}`); });

    // Registered first on purpose: Playwright matches routes in reverse order,
    // so the Firebase handler below still takes precedence.
    await page.route('**://**', (route) => {
      const url = route.request().url();
      if (url.startsWith(base)) return route.continue();
      // Fonts and chart/map libraries change layout metrics, so they must load.
      if (/fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com|unpkg\.com/.test(url)) return route.continue();
      return route.abort();
    });
    await page.route('**www.gstatic.com/firebasejs/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: stub }));

    // Screenshots must be deterministic: an in-flight transition or a blinking
    // caret makes two runs of identical code differ, which would make every
    // comparison meaningless. Freeze all motion before anything renders.
    const FREEZE_CSS = '*,*::before,*::after{animation:none!important;animation-duration:0s!important;animation-delay:0s!important;transition:none!important;transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important;scroll-behavior:auto!important}';
    await page.addInitScript((css) => {
      const apply = () => {
        const el = document.createElement('style');
        el.id = '__harness_freeze';
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
      };
      if (document.head) apply();
      else document.addEventListener('DOMContentLoaded', apply, { once: true });
    }, FREEZE_CSS);
    await page.goto(`${base}/${PAGE}.html${QUERY}`, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
    await page.waitForTimeout(2500);
    // Webfonts arrive over the network, so without this a screenshot can catch
    // the fallback face on one run and the real one on the next - which makes
    // two runs of identical code differ and the whole comparison worthless.
    await page.evaluate(() => (document.fonts && document.fonts.ready) || null).catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, `${TAG}-${PAGE}-${view.name}.png`), fullPage: true });

    // Panels are switched by JS, so a single shot only covers the default one.
    // Walk the nav and capture each, or a moved rule can pass unverified.
    const panels = await page.evaluate(() => Array.from(
      document.querySelectorAll('[data-admin-panel]'))
      .map((b, i) => b.getAttribute('data-admin-panel') || b.textContent.trim() || String(i)));
    for (let i = 0; i < panels.length; i++) {
      const label = String(panels[i]).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24);
      const clicked = await page.evaluate((idx) => {
        const bs = Array.from(document.querySelectorAll('[data-admin-panel]'));
        if (!bs[idx]) return false; bs[idx].click(); return true;
      }, i);
      if (!clicked) continue;
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, TAG + "-" + PAGE + "-" + view.name + "-" + label + ".png"), fullPage: true });
    }
    const height = await page.evaluate(() => document.body.scrollHeight);
    console.log(`${view.name}: height=${height}`);
    await page.close();
  }

  await browser.close();
  server.close();
  if (errors.length) { console.log('\nPAGE ERRORS (externals blocked by design are expected):'); errors.slice(0, 8).forEach((e) => console.log('  ' + e)); }
  else console.log('\nno page errors');
})();

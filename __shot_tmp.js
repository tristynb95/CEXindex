const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  const file = 'file:///C:/Users/Trist/AppData/Local/Temp/claude/c--Users-Trist-Downloads-CEXindex/4e1532c2-0383-4f01-a800-3ad1692b0499/scratchpad/nbo-repro.html';
  await page.goto(file);
  await page.waitForTimeout(300);

  const out = process.argv[2] || path.resolve(__dirname, 'nbo-shot.png');
  await page.screenshot({ path: out });
  console.log('Screenshot saved to', out);
  if (errors.length) console.log('PAGE ERRORS:', errors);
  await browser.close();
})();

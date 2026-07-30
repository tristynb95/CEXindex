const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///C:/Users/Trist/AppData/Local/Temp/claude/c--Users-Trist-Downloads-CEXindex/4e1532c2-0383-4f01-a800-3ad1692b0499/scratchpad/nbo-repro.html');
  await page.waitForTimeout(200);
  const info = await page.evaluate(() => {
    const wrappers = Array.from(document.querySelectorAll('.visit-report-section-wrapper'));
    return wrappers.map(w => ({ class: w.className, html: w.innerHTML.slice(0,80) }));
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();

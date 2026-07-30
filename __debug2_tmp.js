const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file:///C:/Users/Trist/AppData/Local/Temp/claude/c--Users-Trist-Downloads-CEXindex/4e1532c2-0383-4f01-a800-3ad1692b0499/scratchpad/nbo-repro.html');
  await page.waitForTimeout(200);
  const info = await page.evaluate(() => {
    const wrappers = Array.from(document.querySelectorAll('.visit-report-section-wrapper--wide'));
    return wrappers.map(w => {
      const cs = getComputedStyle(w);
      return { gridColumn: cs.gridColumn, width: w.getBoundingClientRect().width, class: w.className };
    });
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();

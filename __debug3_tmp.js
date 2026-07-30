const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  await page.goto('file:///C:/Users/Trist/AppData/Local/Temp/claude/c--Users-Trist-Downloads-CEXindex/4e1532c2-0383-4f01-a800-3ad1692b0499/scratchpad/nbo-repro.html');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const body = document.getElementById('visitReportBody');
    const wrappers = Array.from(document.querySelectorAll('.visit-report-section-wrapper--wide'));
    return {
      bodyDisplay: getComputedStyle(body).display,
      bodyClass: body.className,
      bodyGridTemplate: getComputedStyle(body).gridTemplateColumns,
      wrappers: wrappers.map(w => ({
        rect: w.getBoundingClientRect(),
        offsetWidth: w.offsetWidth,
        display: getComputedStyle(w).display,
        parentTag: w.parentElement.tagName + '.' + w.parentElement.className
      }))
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();

# Screenshot harness

Renders any page of this site headlessly with Firebase stubbed, so a visual
change can be diffed instead of guessed at. The ~720 tests in `test/` are almost
all regex matches against raw file text, so they cannot catch a layout or
rendering regression — this can.

## Why it exists

`css/styles.css` is touched by roughly half of all commits. Nothing in the test
suite verifies that a CSS edit renders the same, which makes any restructuring
of that file unreviewable without this.

## Use

    npm i -D playwright-core          # once; Chromium is already cached
    node tools/screenshot-harness/shoot.js --tag=before --page=bakery-profile
    # ...make the change...
    node tools/screenshot-harness/shoot.js --tag=after  --page=bakery-profile
    node tools/screenshot-harness/compare.js before after

Shots land in `tools/screenshot-harness/shots/` (git-ignored). Two renders that
look identical produce byte-identical PNGs, so `compare.js` is an exact check.

## Constraints worth knowing

- Install `playwright-core`, never `playwright`, and never run
  `npx playwright install` — Chromium is already cached under
  `%LOCALAPPDATA%\ms-playwright`.
- Pages must be served over HTTP; module scripts will not load over `file://`.
  Bind and navigate to `127.0.0.1`, not `localhost` (which can resolve to `::1`).
- Playwright matches routes in **reverse** registration order, so the catch-all
  is registered first and the specific Firebase handler still wins.
- Fonts and cdnjs are allowed through because fonts change layout metrics.
  Everything else external is aborted; those failures are identical across runs
  so they never affect a diff.

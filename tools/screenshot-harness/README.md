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

## Computed-style baseline (`npm run css:check`)

    npm run css:check     # fails if any probed element's computed style moved
    npm run css:update    # re-record after an intended change

Renders `fixtures/*.html` — real markup, real stylesheets, real load order — and
compares every `[data-probe]` element's computed style against
`style-baseline.json`. On a difference it names the fixture, viewport, element and
property, and exits 1.

### Why fixtures and not the real pages

`probe.js` walks whole pages, which is broader, but **`index.html` cannot be probed
at all**: under `firebase-stub.js` its main thread never yields. The DOM parses
(≈1,690 elements at commit) and then some script spins — still blocked after 60
seconds, so `getComputedStyle` never returns. Skipping any single script does not
help, so it is not one runaway loop. The dashboard is therefore invisible to
`probe.js`, and the fixtures carry its markup instead.

### What it is for

`css/styles.css` is source-order driven and ends with a layer that only works
because it is last. Page stylesheets load *after* it, so moving a rule between the
two silently changes which one wins — in both directions:

- a rule extracted into a page stylesheet now outranks the final layer;
- an override left behind in `styles.css` now loses to the extracted rule, if they
  have equal specificity.

The second one shipped: `.search-pill` moved into `dashboard.css`, the
`.focus-queue__search` reset that contained it lost, and the Priority Overview
search box rendered 200px tall. No source-text test can see this — only a browser
resolving the real cascade. `test/css-cascade-guard.test.js` pins the *set* of
classes where this can happen; this baseline catches the rendering itself.

### Keeping it honest

- It covers the elements listed in the fixtures, nothing else. Add a `data-probe`
  element when you touch a component that is styled from both files.
- Copy markup from the source it really comes from and note the path, so a fixture
  that drifts from the app can be spotted.
- It never writes to the working tree. Anything that swaps files on disk (an
  earlier draft of this did) can leave the repo broken if it is interrupted.

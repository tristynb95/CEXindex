# CEXindex — GAIL's Coffee Experience Dashboard

A static dashboard for GAIL's bakery visit data, served by Firebase Hosting and
backed by Firebase Auth + Realtime Database + Storage.

**There is no build step.** The HTML loads `js/` and `css/` directly. `package.json`
exists only for tooling (ESLint); nothing is bundled, compiled, or minified.

## Layout

| Page | Entry script | Purpose |
| --- | --- | --- |
| `index.html` | `js/app.js` (+ 19 others) | The dashboard |
| `admin.html` | `js/admin-page.js` | Admin portal, CQV PDF import |
| `profile.html` | `js/profile-page.js` | User profile |
| `bakery-profile.html` | `js/bakery-profile.js` | Per-bakery performance, visits, tasks, map, and team notes |
| `my-activity.html` | `js/my-activity.js` | The signed-in user's own open actions, visits (with Excel export), and activity feed |

## The two JavaScript worlds

`js/` is split, and the halves have different rules. Know which one you're in:

**Classic scripts** (most files) are plain `<script>` tags that share state through
the `window.GAILS` namespace and **depend on load order**, which is maintained by
hand in the `<script>` tags at the bottom of `index.html` / `admin.html`. A file
must appear after anything it reads at load time. `js/state.js` creates the
namespace and goes first.

**ES modules** (`auth.js`, `admin-page.js`, `firebase-config.js`, `my-activity.js`,
`permissions.js`, `profile-menu.js`, `profile-page.js`) use `type="module"` and import each other
directly. They are deferred, so they run *after* every classic script — which is why
they can rely on `window.GAILS` already existing.

Shared code lives in one place per concern; prefer extending these over re-copying:

- `js/utils.js` — `GAILS.escapeHtml`, month parsing, formatting, generic helpers.
- `js/focus-data.js` — the Focus-only closed-month eligibility and recency-weighted snapshot.
- `js/support-score.js` — the tested 0–100 support-priority calculation.
- `js/cqv-criticals.js` — `GAILS.CQVCriticals`, the canonical zero-tolerance question list.
- `js/cqv-shared.js` — `GAILS.CQVShared`, CQV band derivation and presentation.
- `js/profile-menu.js` — the header profile popover (ES module).

## Who a record belongs to

`my-activity.html` is the one screen that asks "whose record is this", so the
authorship fields matter there in a way they don't elsewhere:

- **Visits** (`routineVisits/{id}`) — `meta.createdBy` / `meta.createdByUid` are
  the durable signals, written when a check-in is saved. `meta.updatedBy` is
  **not** a substitute: an admin editing a visit overwrites it, which would
  otherwise move that visit into the admin's activity. Visits from the Google
  Form carry the respondent's `email`; CQV and NBO PDFs only ever carry a printed
  `auditorName`, so both are matched too.
- **Follow-up tasks** (`followUpActions/{id}`) — `createdBy` and `completedBy`,
  both email strings. A task raised by one person and closed by another belongs,
  partly, to both.
- **Bakery notes** (`bakeryNotes/{bakeryKey}/{noteId}`) — `createdBy` /
  `updatedBy`, each an object with `uid`, `name`, and `email`.

If you add a new kind of record that a person authors, stamp the author at
creation time and don't rely on a "last updated by" field to stand in for it.

## Linting

```bash
npm install
npm run lint
```

A clean checkout reports **zero errors** (it does report warnings — those are
pre-existing patterns that were reviewed and deliberately left alone). That means
`npm run lint` is a usable gate: if it errors, it's something you just introduced.

The support-priority calculation also has a dependency-free Node test suite:

```bash
npm test
```

The rule that earns its keep is `no-undef`. With ~20 classic scripts sharing one
namespace and a hand-maintained load order, it's what catches a typo'd global or a
script that reads something before it's loaded. See `eslint.config.mjs` for why the
other rules are demoted.

## Caching

`firebase.json` sets `Cache-Control: no-cache` on HTML, JS, and CSS.

Because there's no build step, filenames carry no content hash, so a long-lived
cache can't be invalidated except by hand. Hosting's default (`max-age=3600`) let a
stale `index.html` pair up with a fresh `js/` file — the script tags and the scripts
could disagree for up to an hour after a deploy.

`no-cache` does **not** mean "don't store": the browser keeps the file and
revalidates it, and Hosting answers with a `304` from its ETag. The cost is one tiny
conditional request per asset, not a re-download.

This replaced a hand-maintained `?v=` query-string scheme that was applied to only
3 of 19 scripts and had already drifted (`styles.css` was pinned at `v2.0.10` on two
pages and `v2.0.11` on a third). **Don't reintroduce `?v=` strings** — revalidation
already handles it.

Images and fonts are cached hard for a week; a stale favicon isn't a correctness problem.

## Security rules

Rules are deployed **from this repo**, not pasted into the console:

- `database.rules.json` → Realtime Database
- `storage.rules` → Storage

```bash
firebase deploy --only database,storage
```

> **Before the first rules deploy:** these files began life as reference copies that
> were applied to the console by hand, so the live rules may have drifted from them.
> Diff them against the console (Firebase Console → Realtime Database / Storage →
> Rules) and reconcile **before** deploying, since deploying overwrites whatever is
> live. After that, the repo is the source of truth.

Note that CI (`.github/workflows/`) deploys **Hosting only** — rules are never pushed
automatically, so a rules change needs the command above.

The `apiKey` in `js/firebase-config.js` is public by design; Firebase web API keys are
identifiers, not secrets. The rules above are what enforce access.

`hosting.public` is `"."`, so the whole repo root is served except what's listed in
`hosting.ignore`. That's a denylist: **anything new is public by default**. If you add
a file that shouldn't ship, add it to `ignore`.

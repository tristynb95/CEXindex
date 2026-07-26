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
| `my-activity.html` | `js/my-activity.js` | The signed-in user's own open actions and visits (both filterable and exportable to Excel), plus their activity feed. Opt-in per user — see below |
| `my-team.html` | `js/my-team.js` | A manager's view of their team's visits, tasks, and coverage. Granted by role — see below |

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
- `js/mentions.js` — `GAILS.Mentions`, parsing and rendering `@mention` text.
- `js/mention-field.js` — `GAILS.MentionField`, the two-face editor for it.
- `js/attribution.js` — `GAILS.Attribution`, who a visit or follow-up belongs to.
- `js/team.js` — `GAILS.Team`, the reporting hierarchy: who reports to whom.
- `js/permissions.js` — roles, the see/edit access grid, and team scope (ES module).

## Assigning a visit with @mentions

A visit's **Coffee Partner** field doubles as its assignment control: type `@`,
pick a colleague, and the visit becomes theirs as well as yours. Mention more
than one person (`@Jamie + @Tristen`) and the visit — and any follow-up raised
during it — belongs to all of them. Whatever you type between the names is kept
as ordinary text; only the names are styled.

The `@` is a typing affordance, not something anyone should have to read. It is
stored (`coffeePartner: "@Sam Partner"`) but never rendered: every read-only
surface shows the bare name in blue with an underline, and the `@` only
reappears while the field is being edited. `js/mention-field.js` does that by
swapping between two elements — a display face and the real `<input>` — because
an `<input>` cannot style part of its own value. The input stays the single
source of truth; the display face is only ever rendered from `input.value`.

The stored text is the human-editable form, so parsing it back out is a
presentation concern and can be ambiguous. The authoritative record is the
separate `assignedTo` **list** on the visit (`[{ uid, name, email }]`), resolved
at save time — which is why deleting the mention really does un-assign the visit,
and why a name typed *without* an `@` stays an ordinary label. Every visit
logged before this existed is therefore unassigned, not mis-assigned.

### Who can be mentioned

`/users` is deliberately unreadable to ordinary users (it carries roles and ops
areas), so the picker reads **`userDirectory/{uid}`** instead: name and email
only, readable by any signed-in user, and rejected by the rules if it ever tries
to carry a `role` or `opsArea`. It is self-maintaining — everyone republishes
their own entry at sign-in, the profile page keeps it in step with a rename, and
the admin portal publishes the full user list and prunes revoked accounts.

> **This needs a rules deploy**, as does the `myActivity` clause above. CI never
> pushes rules — run `firebase deploy --only database`. Until then every read and
> write of `userDirectory` fails harmlessly and the picker falls back to names
> harvested from data everyone can already read: the regional coffee team, and
> names already on past visits and notes. Harvested names carry no uid, so a real
> directory entry always wins once it arrives.

## Who can see what, and who can edit what

Both questions are answered in one place: **People & Access** in the admin
portal. It replaced the separate Users and Roles panels — old `#users` and
`#roles` links still land on it.

The panel is three sections, in the order the questions get asked:

- **People** — one row per person showing their role, who they report to, and a
  plain-English summary of what they can see and change. **Manage** opens a
  single dialog holding every access decision about them: role, reporting line,
  Bakery Reports scope, and their My Activity switch. A read-out under the
  fields says what those choices add up to *before* they are saved.
- **Roles** — the same two questions asked once per role, as **one grid with a
  "Can see" column and a "Can edit" column**. Every capability in the app is a
  row. Ticking Edit ticks See, and clearing See clears Edit, because "can change
  it but cannot look at it" is not a state the stored levels can express and
  would be a lie if it were.
- **Estate-wide rules** — settings applied on top of every role, whoever holds
  it. Currently just the Bakery Reports ops-area restriction.

Under the grid, storage is **unchanged**: `roles/{roleId}.permissions` still
holds `tabs`, `actions`, and `admin` (`'none' | 'view' | 'edit'`) exactly as
before, so no role needed migrating. `ACCESS_ROWS` in `js/permissions.js` is the
translation layer — each row knows how to read itself out of a permission object
and write itself back, so the portal never has to know which sub-object a given
capability lives in. Add a capability there and it appears in the grid.

The signed-in account's own role and reporting line lock themselves, so an admin
cannot demote or orphan themselves. Their My Activity switch stays live: it only
reveals their own work, and with a single admin account nobody else could ever
turn it on.

## Reporting lines and My Team

`my-team.html` is the management counterpart to My Activity: instead of "what
have I been doing", it answers "what is my team doing" — their visits, the
bakeries they covered, and the follow-ups they have open.

Two separate pieces of access control meet on that page, and keeping them
separate is the point:

| | Decides | Set in |
| --- | --- | --- |
| `permissions.teamScope` | whether My Team opens at all, and how far it reaches | the role |
| `users/{uid}.managerUid` | who is actually in a manager's team | each person |

`teamScope` is `'none'`, `'direct'` (their own reporting line), or `'all'` (the
whole team, for the Head of Operations). It is granted by **role**, not a
per-user switch, because a manager needs it for the job they do rather than
because someone remembered to tick a box. Roles saved before My Team existed
carry no `teamScope` at all, which reads as `'none'`.

`managerUid` is one field per person, and the whole hierarchy is derived from
it — so moving someone between managers is a single write and the tree
re-shapes itself. **`'direct'` follows the line all the way down**, not one
level: area head baristas report to coffee partners, coffee partners report to
the coffee manager, and the coffee manager sees both levels, with each barista
nested under the partner they belong to. Selecting a partner shows their whole
area, and their row states their own figures and their area's roll-up
separately — "Alex logged 4 visits" and "Alex's area logged 19" are different
facts, and conflating them would flatter or bury people.

`js/team.js` (`GAILS.Team`) walks the tree. It treats the line as untrusted
input: every walk is cycle-safe, and `assignmentWouldCycle` lets the portal
refuse the write in the first place — the manager picker never offers someone
who already reports to you, and the save refuses it too.

### Where the roster comes from

`/users` carries roles and ops areas and is deliberately unreadable to ordinary
users, but a manager has to be able to see who reports to them. So the org chart
is mirrored into **`teamDirectory/{uid}`** — name, email, `managerUid`, and role
name — readable only by roles that have a team view, and writable only by
someone who can edit access. Nobody can add themselves to a team, which is what
makes the roster worth trusting. It is the same pattern as `userDirectory`
above, and the admin portal publishes and prunes both together.

> **This needs a rules deploy** (`firebase deploy --only database`), as does the
> `managerUid` clause that stops someone reassigning their own manager. Until
> then the roster read fails and My Team shows an empty team rather than
> breaking.

My Team reads `routineVisits` and `followUpActions` — the same records every
signed-in user can already read — and only groups them by person, using
`js/attribution.js` so a visit lands under exactly the name whose own My
Activity hub would show it. It widens *whose work* is in view, never *which
sites*. It is also deliberately read-only: a manager reviewing workload should
not be able to close somebody else's action out from under them.

## Turning My Activity on

My Activity is **off by default**, for everyone including admins. Access is a
single per-user flag, `users/{uid}.myActivity`, switched from a person's access
dialog in People & Access. Absent means off, so nobody gains the hub by upgrade.

Unlike My Team, this one is per-user rather than per-role: it is a personal
workspace, not a job function. The switch stays enabled even on your own
account — see the self-editing note above.

The flag gates three things, and all three matter:

- the profile-menu entry on the dashboard and the admin portal, and the header
  link on the profile page — each starts `hidden` in the markup, so it cannot
  flash before the profile loads;
- `my-activity.html` itself, which refuses a typed URL with an explanation. The
  hidden menu entry is a convenience; this is the check that a bookmark cannot
  walk around;
- the database rules, which stop a non-admin granting it to themselves by
  writing their own user record — the same clause that already pins `role`.

## Who a record belongs to

Most records are not created by the person they belong to. Routine Coffee Visits
arrive from a Google Form, CQV and NBO reports are PDFs an admin imports, and
follow-ups are raised during someone else's check-in. So attribution is
**derived, not typed** — `js/attribution.js` resolves each record against the
shared people directory, strongest signal first:

| | Visit is credited to |
| --- | --- |
| 1 | an explicit `@mention` assignment (`assignedTo`) |
| 2 | the auditor printed on an imported CQV / NBO report |
| 3 | the Coffee Partner named on a routine visit |
| 4 | the Google Form respondent's email |
| 5 | whoever saved it in this app |

A tier wins outright rather than blending, so a visit handed to two people is
theirs alone and is not diluted by the admin who imported the file. Follow-ups
resolve the same way: an assignment first, then whoever raised it.

This is all read-time, so **nothing needs migrating** — it works on every record
ever stored, including those predating assignment. `js/attribution.js` has no
write path at all. The one thing that *is* stamped at write time is the auditor
on a PDF import, because that resolution happens once and is worth keeping;
`meta.importedBy` records the admin separately so a report is never credited to
whoever uploaded the file.

Two caveats worth knowing:

- On a **check-in**, Coffee Partner is free text about who was on the bar, so it
  is deliberately *not* an attribution signal — that visit stays with whoever
  logged it unless someone `@mentions` a colleague.
- Only tier 1 is announced as "assigned". Telling someone a routine visit was
  "assigned to you" when the form merely carried their name would be a lie, so
  derived credit simply makes the record appear in their hub.

The underlying authorship fields:

- **Assigned visits** (`routineVisits/{id}.assignedTo`) — a visit handed over by
  @mention belongs to the assignee(s) *and* the person who logged it. Both see
  it, each labelled with which side of the handover they are on. Assignment
  shares a visit; it never moves it.
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

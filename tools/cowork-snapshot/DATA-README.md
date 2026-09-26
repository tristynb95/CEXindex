# GAIL's Coffee data snapshot

A read-only export of the Coffee Experience Index (CEXindex) portal's database, for analysis. It's overwritten with fresh data every morning, and there's no older copy. Check `snapshot-info.json` for the exact export time and the months covered.

- For trends over time, use the data's own dates: the monthly rows in `dashboard-monthly.csv`, visit `date`s, and action `createdAt` / `completedAt`.
- Editing these files changes nothing in the portal, and the next export overwrites them.

## How to talk about the data

- Frame weaker bakeries as needing support, never as failing or "critical". The Support List's priority levels are **High Priority**, **Medium Priority** and **Monitor**. They say how soon to step in. Bands (Below Standard, Approaching…) say where a score sits. Don't mix the two, and don't invent other level names. ("Critical Point" as a CQV category name is fine, because that's the audit's own label.)
- Name what a score did, not what a person or their patch is. Ops areas are people's names, so say "Leaders / Opportunities" and "Biggest rise / Biggest dip", not strongest/weakest. State the plain fact, then the opportunity.
- The site leader is the BM (Bakery Manager). The estate is "the company", not "the network".
- There are only about 3–4 regions, so region-level rollups say little. Go deeper on individual bakeries and ops areas instead.
- Ops areas are named after their ops manager, so an ops area's name is a person's name and can change when the manager changes. Join on the bakery, not the ops area name.

## Files

### `support-list.csv` / `support-list.json`: the Support List (priority bakeries)
This is the portal's Growth & Support Hub Support List, **calculated by the portal's own code** at export time. It gives the same bakeries, support scores and priority levels the app shows that day. **Use these numbers as they are; don't recalculate them.** The method below is so you can explain a result, or model a "what if".

The CSV has one row per bakery on the list, ranked. The JSON has the same rows plus:
- `referenceMonth` and `scoredOverMonths`
- `counts`
- `config`: the live weights, thresholds and benchmarks
- `allEligibleBakeries`: every scored bakery with its snapshot CEI and band, including those not in focus
- `needsDataReview`: bakeries left off because of data gaps, with the reason
- `notYetEligible`: new bakeries without three consecutive months yet

**Method**
1. **Months used.** Only closed calendar months count, so the current month is never included. The score looks at the last six closed months (`scoredOverMonths`, ending at `referenceMonth`).
2. **Eligibility.** A bakery needs at least 3 consecutive months with a usable score (otherwise it's `notYetEligible`). It also needs at least 2 of the last six months with data, including the latest or the previous month (otherwise it goes to `needsDataReview`).
3. **Snapshot CEI.** A weighted average: the latest month counts 60%, the previous month 25%, and the other four months share 15%. This gives the `cei_score` and `cei_band` here. The number can differ from any single month in `dashboard-monthly.csv`.
4. **On the list.** Any bakery whose snapshot band is **Below Standard** (<60) or **Approaching** (60–74.9).
5. **Support score (0–100)** is the sum of four parts:
   - **Headroom (up to 50):** how far below 75 the score is. Approaching (60–75) scales from 0 to 20 points. Below 60 adds up to 30 more, reaching 50 at a score of 0.
   - **Momentum (up to 25):** the latest month-on-month drop × 1.5 (max 15), plus any earlier drop over the last three months beyond that (max 10). The earlier drop is ignored if the latest month held steady or improved.
   - **Duration (up to 15):** time spent in focus. The share of recent months in a focus band is worth up to 9 points (scaled down when there are fewer than 3 months of evidence). Each consecutive focus month after the first adds 3 points, up to 6. It's 0 with under 2 months of data.
   - **Visit coverage (up to 10):** 0 if visited in the last 6 months, 6 if last visited 6–12 months ago, 10 if longer or never. Visits of any type count.
6. **Priority level:** High Priority at a support score of 60+, Medium Priority at 35–59, Monitor below 35. The list is ranked by support score, with ties broken by the lower CEI.

**Other columns**
| column | meaning |
|---|---|
| `trend` | Month-on-month direction: up or down means a move of 3+ points, otherwise flat; `new` means there's no previous month |
| `months_in_focus_of_last_six`, `focus_streak_months` | Time in a focus band: the count within the last six months, and the current unbroken run |
| `visit_status` | Visited recently (<6 months), Visit due (6–12), Visit overdue (12+), or No visit recorded |
| `biggest_lever` | The metric furthest from its company benchmark in the latest month, with its value and target. It's the natural first conversation. |
| `nearly_there` | Approaching and within 5 points of leaving focus (75) |
| `low_response_volume` | The latest month had under 8 survey responses, so read the score with care |
| `data_status` | `complete`, or `provisional` when a recent month is missing |

The same list, filtered to an ops area or region, is what that manager sees in the portal. Ops area totals in the portal's triage board are the sum of their bakeries' support scores ("attention load").

### `support-list-history.csv`: the Support List month by month
One block of rows per reference month, holding each bakery's rank, level, support score, CEI and band, trend, visit status and biggest lever. Use it for questions like "who has left focus since last month?", "how long has Southbank been High Priority?", or "which ops area's list is shrinking?".
- `recorded_as = recorded`: captured by this export. The current month is updated every morning, and each month keeps the list as it stood on the last day it was current.
- `recorded_as = reconstructed`: months before recording began (from Aug 25), rebuilt by running the portal's code as of the last day that month was current, using only visits logged by then. These are close to what the app showed but not guaranteed identical: they use today's dashboard data and today's bakery directory, so a later re-upload or an ops-area change shows through. Say so if an answer depends on an exact past figure.
- A bakery that's absent from a month was not in focus that month (or wasn't eligible). A bakery that appears one month and not the next has **graduated out of focus**.

### `area-monthly.csv`: Overview figures for the company, each region and each ops area
One row per month and scope. The figures are exactly what the portal's Overview KPI row shows with that region or ops area filtered and that month selected, calculated by the portal's own code. **Use this for any area-level figure**, such as the Area Snapshot in a 1:1, and don't average bakeries yourself.
- `benchmark_score` is the CEI averaged across the area's bakeries. The app calls it Benchmark Score, with a target of 75.
- `coffee_efficiency_pct` is the share of drinks within 2 min (target 70%), and `nps` is Drink + Meal NPS (target 55).
- `*_change` is the movement against `change_compared_with` (the previous month), calculated the same way as the Overview's "vs" figure.
- Area membership is today's bakery directory. Ops areas are named after their ops manager and get redrawn, so an old month shows the current area's bakeries, not the area as it was then.
- The latest month is usually partial until the next data upload. `snapshot-info.json` has the upload date.

### `dashboard-monthly.csv`: customer experience, one row per bakery per month
Built from the monthly "NPS + Efficiency" spreadsheet. About 200 bakeries × 16 months. Percentages are 0–100 and wait times are in seconds. A blank cell means no data, not zero.

**Headline scores**
| column | meaning |
|---|---|
| `cei_score` | **Coffee Experience Index**, the portal's headline score (0–100+). Measured against fixed company benchmarks and adjusted for low response volume. |
| `cei_band` | Exceeding (≥90) · Meeting (≥75) · Approaching (≥60) · Below Standard (<60) |
| `peer_score`, `peer_band`, `peer_rank_in_month` | Relative view: where the bakery sits against all other bakeries that month (percentile-based). Bands: Top Performance ≥75 · Above Average ≥50 · Below Average ≥25 · Low Performance |
| `*_unadjusted` | Score before the low-volume confidence adjustment |
| `data_confidence` | High (≥15 responses) · Medium (≥8) · Low · No Data · Incomplete. Treat Low-confidence months carefully. |

The CEI is built from these components and weights: NPS 20%, efficiency 20%, drink quality 20%, friendliness 20%, coffee efficiency (speed of drink delivery) 10% and average wait time 10%. The benchmarks are NPS 55; efficiency, drink quality and friendliness 90%; 70% of drinks within 2 minutes; and a 120-second average wait.

**Customer feedback**
| column | meaning |
|---|---|
| `nps` | Headline NPS, which covers drink + meal ratings only (food-only ratings excluded) |
| `nps_drink`, `nps_meal`, `nps_coffee` | NPS splits |
| `nps_all_ratings` | NPS including food-only ratings (for reference) |
| `responses` | Survey responses behind `nps` (all minus food-only) |
| `responses_all`, `responses_coffee`, `responses_food` | Response counts by type |
| `overall_satisfaction_pct`, `friendliness_pct`, `drink_quality_pct`, `efficiency_pct` | Customer-rated satisfaction scores |

**Speed of service (coffee bar timings)**
| column | meaning |
|---|---|
| `total_drinks` | Drinks made that month |
| `drinks_within_30s_pct` … `drinks_within_4min_pct` | Share of drinks delivered within that time. The standard is 70% within 2 min, 90% within 3 min. |
| `drinks_within_2min_weekend_pct` | Weekend-only within-2-min share |
| `drinks_over_5min_pct` | Share of drinks taking over 5 minutes (target under 1%) |
| `avg_wait_seconds`, `avg_wait_8to9am_seconds`, `avg_wait_8am_to_12pm_seconds` | Average wait time, overall and for the morning peak |

`pctile_*` columns are the bakery's percentile against other bakeries that month for each component. `cei_component_*` are the scored speed components that feed the CEI. `source_sheet_rank` is the rank as printed in the source spreadsheet.

**RAG columns** (`*_rag`: green / amber / red, blank when there's no data) are the dashboard's own colouring, taken from the portal's shared rule. Use them for "on target / watch / needs attention" so your calls match what people see in the app:

| metric | green | amber | red |
|---|---|---|---|
| NPS | 55+ | 45–54.9 | under 45 |
| Overall satisfaction, friendliness, drink quality, efficiency | 90%+ | 80–89.9% | under 80% |
| Drinks within 2 min | 70%+ | 60–69.9% | under 60% |
| Drinks over 5 min | 1% or less | under 2.5% | 2.5%+ |
| Average wait | 2:00 or less | under 2:05 | 2:05+ |

**How the CEI score is built** (for explaining a score, not recalculating one):
- Each part scores 0–100 against a floor and a benchmark: 0 at or below the floor, 100 at or above the benchmark, and a straight line in between. The ranges are NPS 45→55, efficiency / drink quality / friendliness 80→90%, and average wait 125s→120s. No wait-time data counts as 100.
- **Coffee efficiency** is three pass/fail tests: 70% within 2 min (worth 25), 90% within 3 min (25), and 1% or fewer over 5 min (50).
- The weighted total (NPS, efficiency, drink quality and friendliness 20% each; coffee efficiency and wait 10% each) is then pulled towards the company average when response volume is low. That adjustment is why `cei_score` can differ from `cei_score_unadjusted`.

### `routine-visits.json`: in-bakery visits by the coffee team
One record per visit, sorted by `date`. Every visit has `bakery`, `date` and `assignedTo` (who did the visit).

Each visit also has an **`app`** object: what the portal works out and shows for that visit, calculated by the portal's own code. **Prefer `app` fields over the stored ones.**
- `app.bakery`: the bakery name as the app resolves it. Use this to join to other files, because the stored `bakery` can be an old spelling.
- For CQVs:
  - `app.displayBand`: the band the app shows. A single lost zero-tolerance question forces Red whatever the percentage (GAIL's rule). The stored `band` / `criticalFail` can predate that rule, and `app.storedBandOverridden` is true when they disagree.
  - `app.zeroToleranceFail` and `app.zeroToleranceQuestionsLost`: whether it failed on the zero-tolerance list, and which questions.
  - `app.actionPlanFlags`: one entry per `actionPlan` item, marked "Critical Point" (a zero-tolerance question), "Allergen Point" (an allergen question that doesn't force Red), or null.
- For NBOs: `app.nboYesPct`, the share of applicable questions answered Yes. It's shown for comparison only. **It is not a score and has no pass mark or RAG.**

There are several kinds of visit, told apart by `type` / `visitKind` / `meta.source`:

- **CQV, Coffee Quality Visit** (`type: "cqv"`): a scored audit imported from GoAudits PDFs. Bands are Green 90%+, Yellow 70–89.9% and Red under 70%, with the zero-tolerance override above. Key fields:
  - `overallPct`, `score` / `scoreMax` and the stored `band` (use `app.displayBand`)
  - `isFollowUp`
  - `sectionScores` (Service, Equipment, Cleanliness…) and `categoryScores` (Quality, Allergen Point, Critical Point)
  - `questions[]`, one per audit question, each with `section`, `subsection`, `label`, `response`, `score`, `max` and `note`. This is the richest source for what exactly goes wrong where.
  - `actionPlan[]`, the agreed actions from the visit, each with `findings`, `actionRequired`, `priority`, `dueDate` and `sectionPath`.
  - `auditorName`, `title`, `ref` and `pdfFileName`.
- **NBO, New Bakery Opening coffee visit** (`type: "nbo"`): **has no score**. Don't treat it as a scored audit. It has `questions[]` with yes/no/na responses, `counts` and `visitNumber` (1 or 2).
- **Routine Bakery Visit form** (`meta.source: "form"`): a structured visit form. It has `sectionScores` and `score` / `scoreMax`, plus one object per section: `coffeeEfficiency`, `complianceTraining`, `drinkQuality` / `coffeeQuality`, `healthSafety`, `leadership`, `maintenance` and `service`. Each holds Yes/No/N/A checks and a free-text `comments` field. There are also `headBaristaPresent` and `numberOfStaff`.
- **Check-in** (`visitKind: "checkin"`) and **NBO opening** (`visitKind: "nboOpening"`): lightweight logged visits with `time`, `mod` (who was on the bar) and free-text `comments`. Since Sep 2026 they can also carry `headBaristas[]` (or `noHeadBarista: true`), `pathwayBaristas[]` (or `noPathwayBarista: true`) and `maintenanceFlags[]`, the equipment and bar issues flagged on the visit. Those are also in `maintenance-flags.csv`, one row per item. A missing field means it was left blank or the visit predates it, not that nothing was wrong.

### `maintenance-flags.csv`: maintenance issues flagged on visits
One row per item flagged in a check-in's or NBO opening's "Maintenance To Flag" field, oldest visit first. Visits logged before the field existed (Sep 2026) have no rows, so a bakery missing from this file hasn't necessarily been checked.

| column | meaning |
|---|---|
| `date`, `month`, `time` | When the visit happened (`month` joins to `dashboard-monthly.csv`) |
| `bakery` | App bakery name |
| `visit_kind` | `checkin` or `nboOpening` |
| `item` | The issue, e.g. "Grinder Burrs (Decaf)" or "Ice Machine (Out of Ice)". Most come from a fixed list of quick options; anything else was typed in by hand. |
| `kit_group` | Grinder, Espresso machine, Hot water, Filter coffee, Bar equipment, Ice machine or General. Hand-typed items are `Other`. |
| `logged_by` | The Coffee Partner(s) who logged the visit |
| `visit_id` | The visit's `id` in `routine-visits.json`, for its notes and follow-up actions |

Use it for questions like "which bakeries keep flagging grinder issues?" or "what's open on the espresso machines in an ops area?". Join to `bakery-directory.json` on `bakery` for ops area and region. There's no "fixed" status: a flag records what was seen on that visit. To tell whether an issue has since been sorted, check the bakery's later visits and its `follow-up-actions.json`.

### `customer-comments.csv`: what customers wrote
Every free-text comment from the customer survey since March 2025. The file has about 75,000 rows, so work on it with code rather than reading it whole. It comes from the same comment pipeline behind the portal's Comment Cloud tab.

| column | meaning |
|---|---|
| `date`, `month` | Survey date, and its dashboard month label (join to `dashboard-monthly.csv` on `bakery` + `month`) |
| `bakery` | App bakery name. The survey's own spellings, including the site renames it made in April 2026, are already mapped. |
| `sentiment` | positive, negative, mixed, neutral, or unclassified (nothing in the lexicon matched, so read the comment) |
| `sentiment_score` | Net intensity: positive words add and negative words subtract. It handles negation ("not friendly" counts as negative). |
| `main_theme` | The comment's strongest theme: attitude, drinks, food, speed_of_service, operations, environment, value, availability or loyalty_app |
| `key_phrase` | The phrase that drove it |
| `comment` | The customer's words |

This is the "why" behind a score. When NPS or friendliness moves, read that bakery's comments for the same month.

### `comment-themes-monthly.csv`: themes per bakery per month
One row per bakery, month, theme and sentiment. `customers_mentioning` is how many customers raised that theme with that sentiment, and `customers_commenting` is how many left any usable comment that month. So `customers_mentioning / customers_commenting` gives "x% of commenting customers complained about speed". `surveys_total` includes surveys with no comment. Use this for trends and comparisons, and the comments file for the actual words.

### `follow-up-actions.json`: follow-up tasks per bakery
It has `title`, `detail`, `priority`, `status` (open/done), `dueDate`, `createdAt` / `completedAt` and `assignedTo`. `sourceVisitId` links to the `id` of the visit in `routine-visits.json` that raised the action.

### `bakery-notes.json`
Free-text notes about a bakery (`bakery`, `body`, `createdAt` as epoch milliseconds).

### `bakery-directory.json`: who looks after which bakery
- `bakeries[]`: every bakery with its `opsArea` (named after the ops manager) and `region`.
- `opsAreaAssignments[]`: each ops area's bakeries.
- `regionAssignments[]`: the Coffee Partner and Coffee Trainer for each region.

Use this to join any other file on `bakery`.

### `head-baristas.json`
The Head Barista list (`entries[]`: name, primary bakery, role).

### `team.json`
Portal users on the coffee and ops teams: name, email, role, department, ops area and manager (`managerUid` matches another person's `uid`). Visit and action `assignedTo` entries carry the same `uid`.

### `snapshot-info.json`
Export time, the dashboard spreadsheet it came from, the months covered and record counts.

## Notes

- Bakery names match across all files (for visits, use `app.bakery`). Name variants such as "Union Street - Bath" and "Union Street, Bath" are already collapsed.
- `snapshot-info.json` lists any `sectionsSkipped`. If the comments or the Support List couldn't be refreshed on a given morning, those files are the previous day's. Say so if it matters to the answer.
- Months in the CSV are labels like `Jun 25`. The current month may be partial (`data_confidence` = Incomplete).
- This contains staff names and work emails. Keep analysis internal to GAIL's.

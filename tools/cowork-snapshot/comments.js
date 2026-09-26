// ========== CUSTOMER COMMENTS FOR THE COWORK SNAPSHOT ==========
// Reads the comment sentiment pipeline's output tables in BigQuery (see
// sql/comment_sentiment_pipeline.sql) — the same tables behind the Comment
// Cloud tab — so Cowork can see why a score moved, not just that it did.
//
// Only the pipeline's native output tables are read. The raw
// live_sheet_data table is a Google Sheet behind the scenes and would need a
// Drive-scoped login; everything useful is already in the outputs.
//
// Auth is the user's gcloud login (`gcloud auth login`), the same one `bq`
// uses. Both tables together are ~20 MB scanned per run, far inside the free
// tier.

const {spawnSync} = require("child_process");

const PROJECT = "cexindex";
const DATASET = "cexindex.feedback_data";

const COMMENTS_SQL = `
SELECT
  CAST(visit_date AS STRING) AS date,
  bakery_location,
  sentiment_label,
  sentiment_score,
  top_sub_category,
  top_term,
  feedback_comments
FROM \`${DATASET}.comment_sentiment_summary\`
ORDER BY visit_date, bakery_location, comment_uid`;

// One row per bakery, month, theme and sentiment. Surveys are single-day, so
// summing the daily distinct-survey counts gives the monthly count of
// customers who mentioned the theme; commenting_surveys is the denominator.
const THEMES_SQL = `
WITH themes AS (
  SELECT
    bakery_location,
    DATE_TRUNC(visit_date, MONTH) AS month_start,
    sub_category,
    sentiment,
    SUM(mention_surveys) AS customers,
    SUM(frequency) AS mentions,
    SUM(sentiment_score) AS sentiment_score
  FROM \`${DATASET}.word_cloud_summary\`
  GROUP BY 1, 2, 3, 4
),
surveys AS (
  SELECT
    bakery_location,
    DATE_TRUNC(visit_date, MONTH) AS month_start,
    SUM(total_surveys) AS commenting_surveys,
    SUM(all_surveys) AS all_surveys
  FROM \`${DATASET}.survey_count_summary\`
  GROUP BY 1, 2
)
SELECT
  t.bakery_location,
  FORMAT_DATE('%b %y', t.month_start) AS month,
  t.sub_category,
  t.sentiment,
  t.customers,
  t.mentions,
  t.sentiment_score,
  s.commenting_surveys,
  s.all_surveys
FROM themes t
LEFT JOIN surveys s USING (bakery_location, month_start)
ORDER BY t.month_start, t.bakery_location, t.sub_category, t.sentiment`;

function accessToken() {
  const res = spawnSync("gcloud", ["auth", "print-access-token"], {
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  const token = (res.stdout || "").trim();
  if (res.status !== 0 || !token) {
    throw new Error("gcloud login unavailable — run `gcloud auth login` (" + (res.stderr || "").trim().split("\n")[0] + ")");
  }
  return token;
}

async function call(token, url, body) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error("BigQuery " + res.status + ": " + ((json.error && json.error.message) || res.statusText));
  return json;
}

function toObjects(schema, rows) {
  const fields = schema.fields.map((f) => [f.name, f.type]);
  return (rows || []).map((row) => {
    const o = {};
    row.f.forEach((cell, i) => {
      const [name, type] = fields[i];
      const v = cell.v;
      o[name] = v === null ? null : (type === "INTEGER" || type === "FLOAT" || type === "NUMERIC") ? Number(v) : v;
    });
    return o;
  });
}

// Runs a query and follows every result page.
async function query(token, sql) {
  const base = "https://bigquery.googleapis.com/bigquery/v2/projects/" + PROJECT + "/queries";
  let page = await call(token, base, {query: sql, useLegacySql: false, maxResults: 20000, timeoutMs: 120000});
  const job = page.jobReference;
  const loc = job.location ? "&location=" + encodeURIComponent(job.location) : "";
  while (!page.jobComplete) {
    page = await call(token, base + "/" + job.jobId + "?maxResults=20000&timeoutMs=60000" + loc);
  }
  const schema = page.schema;
  const rows = toObjects(schema, page.rows);
  while (page.pageToken) {
    page = await call(token, base + "/" + job.jobId + "?maxResults=20000&pageToken=" + encodeURIComponent(page.pageToken) + loc);
    rows.push(...toObjects(schema, page.rows));
  }
  return rows;
}

async function fetchComments() {
  const token = accessToken();
  const [comments, themes] = await Promise.all([query(token, COMMENTS_SQL), query(token, THEMES_SQL)]);
  return {comments, themes};
}

module.exports = {fetchComments};

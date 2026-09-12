// ========== SHARED DASHBOARD DATASET READ ==========
// The full estate history is the largest payload this app moves. js/auth.js has
// always served it from IndexedDB (js/dataset-cache.js) after comparing the
// server's dashboardMeta.updatedAt — but that logic lived inside the dashboard's
// own auth flow, where the other pages could not reach it, so My Activity and
// Bakery Profile re-downloaded the whole dataset on every load.
//
// Reading dashboardMeta first costs one small request. On a cache hit that
// replaces the entire download; on a miss it is the same pair of reads the
// dashboard already did. The ts comparison is what makes it safe: the admin
// upload path writes dashboardData and a fresh dashboardMeta together
// (js/admin-page.js), so a new upload never matches a stale cache.
import { db } from './firebase-config.js';
import { ref, get } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { readDatasetCache, writeDatasetCache } from './dataset-cache.js';

// Resolves to the dashboard dataset payload, or null when none is stored.
// Rejects only if the reads themselves fail, so callers keep whatever error
// tolerance they already had.
export async function loadDashboardData() {
  const metaSnap = await get(ref(db, 'dashboardMeta'));
  const meta = metaSnap.exists() ? metaSnap.val() : null;
  const stamp = meta && meta.updatedAt;

  if (stamp) {
    const cached = await readDatasetCache();
    if (cached && cached.ts === stamp) return cached;
  }

  const snap = await get(ref(db, 'dashboardData'));
  if (!snap.exists()) return null;

  const data = snap.val();
  // Fire and forget, exactly as js/auth.js does — nothing renders off the write.
  if (stamp) writeDatasetCache(stamp, data);
  return data;
}

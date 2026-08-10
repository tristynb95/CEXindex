// ========== SCOPED VISIT / FOLLOW-UP FEED ==========
// Every page used to subscribe to the whole of `routineVisits` and
// `followUpActions` and filter client-side. The estate has a roughly fixed
// number of bakeries visited at a roughly fixed rate, so those nodes grow
// linearly with time — which meant boot cost grew with the entire history of
// the company, on every page, forever. A bakery profile downloaded every visit
// ever logged in order to show one site's.
//
// Reading a rolling date window instead makes the payload constant: it is set
// by how far back the UI can look by default, not by how long the dashboard has
// been in service. Ordering is by `date`, which both writers store as
// "yyyy-MM-dd" (js/auth.js and apps-script/RoutineVisitSync.gs), so lexical
// ordering is chronological and needs no migration. See database.rules.json for
// the matching .indexOn.
//
// Visits with no `date` sort before every string key and so fall outside the
// window. That matches what the consumers already did with them — both
// computeLastVisitRecords and the Bakery Reports list skip a dateless visit —
// so nothing that used to render stops rendering.
import { db } from './firebase-config.js';
import {
  ref,
  query,
  orderByChild,
  startAt,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

// The start of the previous calendar year, which is the earliest date any of
// the period controls can reach without the user explicitly asking for "All
// Time": "Last Year" is the whole previous calendar year, and "Last 12 Months"
// never reaches further back than that. So the default window covers every
// preset, and only the All Time option has to widen it.
export function defaultWindowStart(now) {
  var today = now || new Date();
  return (today.getFullYear() - 1) + '-01-01';
}

// Fetches one visit by id, for a link that names a visit older than the window
// — a ?visit=<id> deep link out of the My Activity hub, say. Resolves null if
// there is no such visit. Strictly better than the lookup it replaces, which
// could only ever find a visit that happened to be loaded already.
export function fetchVisit(visitId, path) {
  if (!visitId) return Promise.resolve(null);
  return get(ref(db, (path || 'routineVisits') + '/' + visitId)).then(function (snapshot) {
    return snapshot.exists() ? snapshot.val() : null;
  });
}

// Subscribes to visits from `windowStart` onwards and calls back with the same
// plain { id: visit } object the whole-node listener used to produce, so every
// consumer's downstream code is untouched.
//
// Returns { stop, expandToAllTime }. expandToAllTime() fetches the untruncated
// node once, hands it to the same callback, and leaves the live subscription in
// place — a page only pays for the full history if someone asks to see it, and
// only once per session.
export function subscribeVisits(options) {
  var opts = options || {};
  var onData = typeof opts.onData === 'function' ? opts.onData : function () {};
  var onError = typeof opts.onError === 'function' ? opts.onError : function () {};
  var path = opts.path || 'routineVisits';
  var windowStart = opts.windowStart || defaultWindowStart();

  var allTime = null;
  var latestWindowed = {};

  // Once the full history has been pulled in, it stays merged under every
  // later live update — otherwise the next write to the windowed feed would
  // silently snap the view back to the window the user just widened.
  function emit(windowed) {
    latestWindowed = windowed;
    onData(allTime ? Object.assign({}, allTime, windowed) : windowed);
  }

  var off = onValue(
    query(ref(db, path), orderByChild('date'), startAt(windowStart)),
    function (snapshot) {
      emit(snapshot.exists() ? snapshot.val() : {});
    },
    onError
  );

  return {
    stop: function () {
      if (off) off();
    },
    isAllTime: function () {
      return allTime !== null;
    },
    expandToAllTime: function () {
      if (allTime) return Promise.resolve();
      return get(ref(db, path)).then(function (snapshot) {
        allTime = snapshot.exists() ? snapshot.val() : {};
        emit(latestWindowed);
      });
    }
  };
}

// ========== PATCHES: WHICH SITES A PERSON LOOKS AFTER ==========
// The durable link between a person and the part of the estate they own — the
// ops areas an ops manager runs, and the regions a regional manager covers.
//
// The problem this exists to solve: GAIL's ops areas are named after the ops
// manager who runs them ("Bobby Holmes"), so the *name* changes the moment that
// person moves on, even though the area itself has not. Anything keyed on the
// label silently detaches on the next site directory upload — the app sees a
// brand new area, not a renamed one.
//
// So a saved ops area carries the bakeries it held when it was saved, and is
// re-found by membership rather than by name:
//
//   1. the current ops area holding more than half of the saved bakeries —
//      the durable match, and the only one that survives a rename;
//   2. failing that, the current ops area still carrying the saved name;
//   3. failing that, nothing is guessed. The assignment is kept and reported
//      as unresolved so an admin can re-point it, rather than being dropped or
//      quietly attached to the wrong area.
//
// Regions ("North Region", "London Region") are geographic and stable, so they
// are matched on the name and need none of this.
//
// Stored at users/{uid}.patch:
//
//   { opsAreas: [ { region, opsArea, bakeries: [...] } ], regions: [ '...' ] }
//
// Pure functions over plain objects — nothing here reads or writes the
// database. See js/ops-area-assignments.js, which follows the same rule for
// Area Head Baristas, and [[ops-area-names-are-people]].
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  // More than half, so an old area can only ever carry into one new one.
  // Deliberately the same threshold js/ops-area-assignments.js uses.
  var CARRY_OVER_SHARE = 0.5;

  function cleanText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function key(value) {
    return cleanText(value).toLowerCase();
  }

  function uniqueSorted(names) {
    var seen = {};
    var kept = [];
    (Array.isArray(names) ? names : []).forEach(function (name) {
      var name_ = cleanText(name);
      var k = key(name_);
      if (!k || seen[k]) return;
      seen[k] = true;
      kept.push(name_);
    });
    return kept.sort(function (a, b) { return a.localeCompare(b); });
  }

  // Ops area names are only guaranteed unique inside their own region, so the
  // key carries both — matching js/config.js and js/ops-area-assignments.js.
  function areaKey(region, opsArea) {
    var ops = key(opsArea);
    return ops ? key(region) + ' ' + ops : '';
  }

  // Accepts the stored shape, and every older way this was recorded:
  //   - users/{uid}.opsArea, a bare ops area name (the original form);
  //   - a { opsArea: 'name' } object;
  //   - a list of names rather than records.
  // A legacy entry has no bakeries, so it can only ever be matched by name —
  // which is exactly how it behaved before. Saving the person again stamps the
  // current membership onto it and it becomes rename-proof from then on.
  function normalizePatch(value) {
    if (value == null || value === '') return { opsAreas: [], regions: [] };
    if (typeof value === 'string') {
      return { opsAreas: [{ region: '', opsArea: cleanText(value), bakeries: [] }], regions: [] };
    }

    var source = typeof value === 'object' ? value : {};
    var records = Array.isArray(source.opsAreas) ? source.opsAreas : [];

    // A record written before a person could hold more than one ops area.
    if (!records.length && source.opsArea) records = [source];

    var seen = {};
    var opsAreas = [];
    records.forEach(function (entry) {
      var record = entry && typeof entry === 'object' ? entry : { opsArea: entry };
      var opsArea = cleanText(record.opsArea || record.ops || record.o);
      if (!opsArea) return;
      var region = cleanText(record.region || record.r);
      var k = areaKey(region, opsArea);
      if (seen[k]) return;
      seen[k] = true;
      opsAreas.push({ region: region, opsArea: opsArea, bakeries: uniqueSorted(record.bakeries) });
    });

    return { opsAreas: opsAreas, regions: uniqueSorted(source.regions) };
  }

  function isEmptyPatch(patch) {
    var normalized = normalizePatch(patch);
    return !normalized.opsAreas.length && !normalized.regions.length;
  }

  // The estate as it stands right now, read out of the site directory
  // (GAILS.BAKERY_META and friends: { bakery: { r, o } }).
  function readEstate(bakeryMeta) {
    var areas = [];
    var byKey = {};
    var byOpsName = {};
    var ambiguousOpsNames = {};
    var regions = {};

    Object.keys(bakeryMeta || {}).forEach(function (bakery) {
      var entry = (bakeryMeta || {})[bakery] || {};
      var region = cleanText(entry.r || entry.region);
      var opsArea = cleanText(entry.o || entry.opsArea);
      var name = cleanText(bakery);
      if (!name) return;

      if (region) {
        var regionKey = key(region);
        if (!regions[regionKey]) regions[regionKey] = { region: region, bakeries: [] };
        regions[regionKey].bakeries.push(name);
      }

      if (!opsArea) return;
      var k = areaKey(region, opsArea);
      if (!byKey[k]) {
        byKey[k] = { key: k, region: region, opsArea: opsArea, bakeries: [] };
        areas.push(byKey[k]);

        // A second area answering to the same name across regions makes the
        // name useless as a fallback — better no match than the wrong region's.
        var opsKey = key(opsArea);
        if (Object.prototype.hasOwnProperty.call(byOpsName, opsKey)) ambiguousOpsNames[opsKey] = true;
        else byOpsName[opsKey] = byKey[k];
      }
      byKey[k].bakeries.push(name);
    });

    Object.keys(ambiguousOpsNames).forEach(function (opsKey) { delete byOpsName[opsKey]; });

    return { areas: areas, byKey: byKey, byOpsName: byOpsName, regions: regions };
  }

  function sharedCount(saved, current) {
    var inSaved = {};
    saved.forEach(function (name) { inSaved[key(name)] = true; });
    var shared = 0;
    current.forEach(function (name) { if (inSaved[key(name)]) shared++; });
    return shared;
  }

  // Which current ops area a saved one has become. One-way on purpose: a small
  // area folded whole into a big one has carried over completely, even though
  // the two look nothing alike from the big one's point of view.
  function placeOpsArea(saved, estate) {
    if (saved.bakeries.length) {
      var best = null;
      estate.areas.forEach(function (area) {
        var share = sharedCount(saved.bakeries, area.bakeries) / saved.bakeries.length;
        if (share <= CARRY_OVER_SHARE) return;
        if (!best || share > best.share) best = { area: area, share: share };
      });
      if (best) return { area: best.area, matchedBy: 'bakeries' };
    }

    var exact = estate.byKey[areaKey(saved.region, saved.opsArea)];
    if (exact) return { area: exact, matchedBy: 'name' };

    // Saved without a region (the original users/{uid}.opsArea form), or its
    // region has been re-drawn around it.
    var byName = estate.byOpsName[key(saved.opsArea)];
    if (byName) return { area: byName, matchedBy: 'name' };

    return { area: null, matchedBy: '' };
  }

  // The live reading of a saved patch against the current site directory.
  //
  //   opsAreas[]  — one per saved area: where it is now, how it was found, and
  //                 what it was saved as. `renamed` is the flag worth showing a
  //                 human: this area is the same one, under a new name.
  //   regions[]   — the saved regions that still exist.
  //   bakeries[]  — everything the person owns, deduplicated across both.
  //   unresolved[]— saved areas that could not be placed at all.
  function resolvePatch(patch, bakeryMeta) {
    var normalized = normalizePatch(patch);
    var estate = readEstate(bakeryMeta);

    var opsAreas = [];
    var unresolved = [];
    normalized.opsAreas.forEach(function (saved) {
      var placed = placeOpsArea(saved, estate);
      if (!placed.area) {
        unresolved.push({ region: saved.region, opsArea: saved.opsArea, bakeries: saved.bakeries });
        return;
      }
      opsAreas.push({
        region: placed.area.region,
        opsArea: placed.area.opsArea,
        bakeries: uniqueSorted(placed.area.bakeries),
        matchedBy: placed.matchedBy,
        savedAs: { region: saved.region, opsArea: saved.opsArea },
        renamed: key(placed.area.opsArea) !== key(saved.opsArea)
      });
    });

    var regions = [];
    normalized.regions.forEach(function (region) {
      var record = estate.regions[key(region)];
      // A region absent from the current directory is still theirs — regions
      // are stable, so this is a gap in the upload rather than a re-draw.
      regions.push({
        region: record ? record.region : region,
        bakeries: record ? uniqueSorted(record.bakeries) : [],
        missing: !record
      });
    });

    var bakeries = [];
    opsAreas.forEach(function (area) { bakeries = bakeries.concat(area.bakeries); });
    regions.forEach(function (region) { bakeries = bakeries.concat(region.bakeries); });

    return {
      opsAreas: opsAreas,
      regions: regions,
      unresolved: unresolved,
      bakeries: uniqueSorted(bakeries)
    };
  }

  // Every bakery the person owns — the set the notification centre's "my area"
  // scope and the Bakery Reports restriction both filter on.
  function patchBakeries(patch, bakeryMeta) {
    return resolvePatch(patch, bakeryMeta).bakeries;
  }

  // Rewrites a patch with the membership its areas hold *now*, so the next
  // restructure is judged against the current shape of the estate rather than a
  // stale one. Called when a patch is saved; an area that could not be placed
  // keeps exactly what it was saved with rather than being emptied.
  function stampPatch(patch, bakeryMeta) {
    var normalized = normalizePatch(patch);
    var estate = readEstate(bakeryMeta);
    return {
      opsAreas: normalized.opsAreas.map(function (saved) {
        var placed = placeOpsArea(saved, estate);
        if (!placed.area) return { region: saved.region, opsArea: saved.opsArea, bakeries: saved.bakeries };
        return {
          region: placed.area.region,
          opsArea: placed.area.opsArea,
          bakeries: uniqueSorted(placed.area.bakeries)
        };
      }),
      regions: normalized.regions.slice()
    };
  }

  // Whether a patch is worth storing at all. An empty one is written as null so
  // "looks after nothing in particular" leaves no record behind.
  function toStored(patch, bakeryMeta) {
    var stamped = stampPatch(patch, bakeryMeta);
    if (!stamped.opsAreas.length && !stamped.regions.length) return null;
    return stamped;
  }

  function describePatch(resolved) {
    var parts = [];
    (resolved.opsAreas || []).forEach(function (area) { parts.push(area.opsArea); });
    (resolved.regions || []).forEach(function (region) { parts.push(region.region); });
    (resolved.unresolved || []).forEach(function (area) { parts.push(area.opsArea + ' (not in the site directory)'); });
    if (!parts.length) return 'The whole estate';
    return parts.join(' · ');
  }

  window.GAILS.Patch = {
    normalizePatch: normalizePatch,
    isEmptyPatch: isEmptyPatch,
    resolvePatch: resolvePatch,
    patchBakeries: patchBakeries,
    stampPatch: stampPatch,
    toStored: toStored,
    describePatch: describePatch
  };
})();

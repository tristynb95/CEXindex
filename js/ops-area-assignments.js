// Area Head Baristas are maintained per ops area in the admin site directory,
// alongside the per-region Coffee Partner and Coffee Trainer
// (js/region-assignments.js).
//
// Two things about GAIL's ops areas shape this file:
//
// 1. Ops areas are named after the ops manager who runs them ("Safa Aden"), so
//    a leaver renames the area even though the area itself has not changed.
// 2. Bakeries move between ops areas, so areas are split, merged and reformed.
//
// The durable pairing is therefore an area head barista and their home bakery —
// the bakery they actually work out of. That pairing is what the app follows: an
// area head barista belongs to whichever ops area currently holds their home
// bakery, whoever else is in it and whatever the area is called. Where several
// end up in the same ops area they are all simply listed against it, and the
// admin prunes the list in the Area Head Baristas section. Nothing is ever
// dropped on the app's own initiative.
(function () {
  'use strict';

  // Fallback only, for an area head barista with no home bakery recorded yet:
  // follow the ops area that took more than half of the old area's bakeries.
  // Over half, so an old area can only ever carry into one new one.
  var CARRY_OVER_SHARE = 0.5;

  function cleanText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function segmentKey(value) {
    return cleanText(value).toLowerCase();
  }

  function bakeryList(value) {
    var seen = {};
    var names = [];
    (Array.isArray(value) ? value : []).forEach(function (name) {
      var key = segmentKey(name);
      if (!key || seen[key]) return;
      seen[key] = true;
      names.push(cleanText(name));
    });
    return names.sort(function (a, b) { return a.localeCompare(b); });
  }

  function sharedCount(first, second) {
    var inFirst = {};
    first.forEach(function (name) { inFirst[segmentKey(name)] = true; });
    var shared = 0;
    second.forEach(function (name) { if (inFirst[segmentKey(name)]) shared++; });
    return shared;
  }

  // How much of `bakeries` ended up in `destination`. Deliberately one-way: a
  // small area folded whole into a big one has carried over completely, even
  // though the two look nothing alike from the big one's point of view.
  function membershipShare(bakeries, destination) {
    if (!bakeries.length) return 0;
    return sharedCount(bakeries, destination) / bakeries.length;
  }

  // Ops area names are only guaranteed unique within their region, so the key
  // carries both.
  function opsAreaKey(region, opsArea) {
    var ops = segmentKey(opsArea);
    if (!ops) return '';
    return segmentKey(region) + ' ' + ops;
  }

  function normalizeBarista(entry) {
    var value = entry && typeof entry === 'object' ? entry : { name: entry };
    return {
      name: cleanText(value.name || value.areaHeadBarista || value.barista),
      uid: cleanText(value.uid || value.areaHeadBaristaUid || value.baristaUid),
      homeBakery: cleanText(value.homeBakery)
    };
  }

  // Two entries are the same person when they share a uid, or a name where no
  // uid is recorded. A blank row is nobody yet, so it is never merged away —
  // the admin is part-way through adding someone.
  function baristaIdentity(entry) {
    if (entry.uid) return 'uid:' + entry.uid;
    if (entry.name) return 'name:' + segmentKey(entry.name);
    return '';
  }

  function baristaIsEmpty(entry) {
    return !entry.name && !entry.uid && !entry.homeBakery;
  }

  // Collapses the same person appearing twice against one ops area — which is
  // what a merger of two areas they already ran would otherwise produce —
  // without losing whichever of the two rows carried the home bakery.
  function dedupeBaristas(entries) {
    var byIdentity = {};
    var kept = [];
    entries.forEach(function (entry) {
      var identity = baristaIdentity(entry);
      if (!identity) {
        kept.push(entry);
        return;
      }
      if (!byIdentity[identity]) {
        byIdentity[identity] = { name: entry.name, uid: entry.uid, homeBakery: entry.homeBakery };
        kept.push(byIdentity[identity]);
        return;
      }
      var target = byIdentity[identity];
      target.uid = target.uid || entry.uid;
      target.homeBakery = target.homeBakery || entry.homeBakery;
    });
    return kept;
  }

  function normalizeBaristaList(value) {
    var entries = (Array.isArray(value) ? value : []).map(normalizeBarista);
    return dedupeBaristas(entries);
  }

  function normalizeAssignment(record) {
    var value = record && typeof record === 'object' ? record : {};
    var baristas = normalizeBaristaList(value.baristas);

    // Records written before an ops area could hold more than one area head
    // barista carried a single set of fields. Read as a one-entry list.
    if (!baristas.length) {
      var legacy = normalizeBarista(value);
      if (!baristaIsEmpty(legacy)) baristas = [legacy];
    }

    return {
      region: cleanText(value.region),
      opsArea: cleanText(value.opsArea || value.ops),
      baristas: baristas,
      bakeries: bakeryList(value.bakeries)
    };
  }

  function normalizeAssignments(assignments) {
    var records = [];

    if (Array.isArray(assignments)) {
      records = assignments;
    } else if (assignments && typeof assignments === 'object') {
      records = Object.keys(assignments).map(function (key) {
        return assignments[key];
      });
    }

    var byOpsArea = {};
    var order = [];
    records.forEach(function (record) {
      var normalized = normalizeAssignment(record);
      var key = opsAreaKey(normalized.region, normalized.opsArea);
      if (!key) return;

      if (!byOpsArea[key]) {
        byOpsArea[key] = normalized;
        order.push(key);
        return;
      }

      var target = byOpsArea[key];
      target.region = normalized.region || target.region;
      target.opsArea = normalized.opsArea || target.opsArea;
      target.baristas = dedupeBaristas(target.baristas.concat(normalized.baristas));
      target.bakeries = bakeryList(target.bakeries.concat(normalized.bakeries));
    });

    return order.map(function (key) { return byOpsArea[key]; });
  }

  // `pairs` are the { region, opsArea, bakeries } combinations detected in the
  // site directory. Deduplicated and sorted by region, then ops area.
  function normalizeOpsAreas(pairs) {
    var byOpsArea = {};
    (pairs || []).forEach(function (pair) {
      var value = pair && typeof pair === 'object' ? pair : { opsArea: pair };
      var region = cleanText(value.region || value.r);
      var opsArea = cleanText(value.opsArea || value.ops || value.o);
      var key = opsAreaKey(region, opsArea);
      if (!key) return;
      if (!byOpsArea[key]) {
        byOpsArea[key] = { region: region, opsArea: opsArea, bakeries: bakeryList(value.bakeries) };
        return;
      }
      byOpsArea[key].bakeries = bakeryList(
        byOpsArea[key].bakeries.concat(bakeryList(value.bakeries))
      );
    });
    return Object.keys(byOpsArea).map(function (key) {
      return byOpsArea[key];
    }).sort(function (a, b) {
      return a.region.localeCompare(b.region) || a.opsArea.localeCompare(b.opsArea);
    });
  }

  // Places every saved area head barista against a detected ops area:
  //
  //   1. the ops area holding their home bakery — the durable pairing, and the
  //      only one that survives an area being renamed, split or merged;
  //   2. failing that (no home bakery recorded), the ops area that still
  //      carries the name their entry was saved under;
  //   3. failing that, the ops area that took more than half of the bakeries
  //      their old area used to hold.
  //
  // Anyone who fits none of those keeps their old ops area as a retained row,
  // so a temporary disappearance from a workbook never deletes them.
  function buildMergePlan(pairs, assignments) {
    var existing = normalizeAssignments(assignments);

    var slots = normalizeOpsAreas(pairs).map(function (pair) {
      return { key: opsAreaKey(pair.region, pair.opsArea), pair: pair, baristas: [], sources: [] };
    });

    var slotByKey = {};
    var slotByBakery = {};
    slots.forEach(function (slot) {
      slotByKey[slot.key] = slot;
      slot.pair.bakeries.forEach(function (bakery) {
        slotByBakery[segmentKey(bakery)] = slot;
      });
    });

    var unplaced = {};
    existing.forEach(function (record) {
      var recordKey = opsAreaKey(record.region, record.opsArea);

      var fallbackSlot = slotByKey[recordKey] || null;
      if (!fallbackSlot && record.bakeries.length) {
        var best = null;
        slots.forEach(function (slot) {
          var share = membershipShare(record.bakeries, slot.pair.bakeries);
          if (share <= CARRY_OVER_SHARE) return;
          if (!best || share > best.share) best = { slot: slot, share: share };
        });
        if (best) fallbackSlot = best.slot;
      }

      record.baristas.forEach(function (entry) {
        var destination = entry.homeBakery ? slotByBakery[segmentKey(entry.homeBakery)] : null;
        if (!destination) destination = fallbackSlot;

        if (!destination) {
          if (baristaIsEmpty(entry)) return;
          if (!unplaced[recordKey]) {
            unplaced[recordKey] = {
              region: record.region,
              opsArea: record.opsArea,
              baristas: [],
              bakeries: record.bakeries
            };
          }
          unplaced[recordKey].baristas.push(entry);
          return;
        }

        destination.baristas.push(entry);
        if (destination.sources.indexOf(recordKey) === -1 && recordKey) {
          destination.sources.push(recordKey);
        }
      });
    });

    var renames = [];
    var merges = [];

    slots.forEach(function (slot) {
      // Insertion order, deliberately not sorted: the admin edits these rows by
      // index, so re-ordering them as a name is typed would write the next
      // keystroke into somebody else's row.
      slot.baristas = dedupeBaristas(slot.baristas);

      var movedFrom = slot.sources.filter(function (sourceKey) { return sourceKey !== slot.key; });
      if (!movedFrom.length) return;

      var describe = function (sourceKey) {
        var record = existing.find(function (candidate) {
          return opsAreaKey(candidate.region, candidate.opsArea) === sourceKey;
        });
        return { region: record.region, opsArea: record.opsArea };
      };

      if (slot.sources.length === 1) {
        slot.renamedFrom = describe(movedFrom[0]);
        renames.push({
          from: slot.renamedFrom,
          to: { region: slot.pair.region, opsArea: slot.pair.opsArea },
          baristas: slot.baristas.map(function (entry) { return entry.name; }).filter(Boolean),
          sharedBakeries: sharedCount(slot.pair.bakeries, slot.pair.bakeries)
        });
        return;
      }

      // Two or more previous ops areas now feed this one. Everybody is listed
      // against it rather than the app choosing between them.
      merges.push({
        region: slot.pair.region,
        opsArea: slot.pair.opsArea,
        from: slot.sources.map(describe),
        baristas: slot.baristas.map(function (entry) { return entry.name; }).filter(Boolean)
      });
    });

    var merged = slots.map(function (slot) {
      return {
        region: slot.pair.region,
        opsArea: slot.pair.opsArea,
        baristas: slot.baristas,
        // Always the membership as it stands now, so the next restructure is
        // judged against the current shape of the area rather than a stale one.
        bakeries: slot.pair.bakeries
      };
    });

    Object.keys(unplaced).forEach(function (key) {
      var record = unplaced[key];
      record.baristas = dedupeBaristas(record.baristas);
      merged.push(record);
    });

    return { rows: merged, renames: renames, merges: merges, slots: slots };
  }

  // Returns assignments for every detected ops area, and retains anyone whose
  // ops area has temporarily disappeared from an upload.
  function mergeDetectedOpsAreas(pairs, assignments) {
    return buildMergePlan(pairs, assignments).rows;
  }

  // What this merge would do to the people data, so the admin can be told that
  // an ops area only changed its name, or that a merged area now lists more
  // than one area head barista for them to prune.
  function detectChanges(pairs, assignments) {
    var plan = buildMergePlan(pairs, assignments);
    return { renames: plan.renames, merges: plan.merges };
  }

  function assignmentsForOpsAreas(pairs, assignments) {
    var plan = buildMergePlan(pairs, assignments);
    var activeKeys = {};
    var renamedByKey = {};
    plan.slots.forEach(function (slot) {
      activeKeys[slot.key] = true;
      if (slot.renamedFrom) renamedByKey[slot.key] = slot.renamedFrom;
    });

    return plan.rows.filter(function (record) {
      return !!activeKeys[opsAreaKey(record.region, record.opsArea)];
    }).map(function (record) {
      var renamedFrom = renamedByKey[opsAreaKey(record.region, record.opsArea)];
      // Display-only: never written back, so the note clears once saved.
      return renamedFrom ? Object.assign({}, record, { renamedFrom: renamedFrom }) : record;
    });
  }

  function findRow(rows, region, opsArea) {
    var key = opsAreaKey(region, opsArea);
    if (!key) return null;
    var row = rows.find(function (record) {
      return opsAreaKey(record.region, record.opsArea) === key;
    });
    if (row) return row;
    row = { region: cleanText(region), opsArea: cleanText(opsArea), baristas: [], bakeries: [] };
    rows.push(row);
    return row;
  }

  function updateBarista(pairs, assignments, region, opsArea, index, field, value) {
    if (field !== 'name' && field !== 'uid' && field !== 'homeBakery') {
      return mergeDetectedOpsAreas(pairs, assignments);
    }
    var rows = mergeDetectedOpsAreas(pairs, assignments);
    var row = findRow(rows, region, opsArea);
    if (!row) return rows;
    while (row.baristas.length <= index) {
      row.baristas.push({ name: '', uid: '', homeBakery: '' });
    }
    if (index < 0) return rows;
    row.baristas[index][field] = cleanText(value);
    return rows;
  }

  function addBarista(pairs, assignments, region, opsArea) {
    var rows = mergeDetectedOpsAreas(pairs, assignments);
    var row = findRow(rows, region, opsArea);
    if (row) row.baristas.push({ name: '', uid: '', homeBakery: '' });
    return rows;
  }

  function removeBarista(pairs, assignments, region, opsArea, index) {
    var rows = mergeDetectedOpsAreas(pairs, assignments);
    var row = findRow(rows, region, opsArea);
    if (row && index >= 0 && index < row.baristas.length) row.baristas.splice(index, 1);
    return rows;
  }

  window.GAILS_OPS_AREA_ASSIGNMENTS = {
    opsAreaKey: opsAreaKey,
    normalizeAssignments: normalizeAssignments,
    mergeDetectedOpsAreas: mergeDetectedOpsAreas,
    assignmentsForOpsAreas: assignmentsForOpsAreas,
    detectChanges: detectChanges,
    updateBarista: updateBarista,
    addBarista: addBarista,
    removeBarista: removeBarista
  };
})();

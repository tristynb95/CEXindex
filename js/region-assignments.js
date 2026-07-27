// Coffee Partner and Coffee Trainer ownership is maintained per region in the
// admin site directory, alongside the per-ops-area Area Head Baristas
// (js/ops-area-assignments.js).
//
// A region normally has one of each. When one of them leaves, though, their
// patch is rarely handed to a single replacement — it is split, with different
// colleagues covering different ops areas until the role is filled again. That
// is what cover is for: switch it on for a region and the Coffee Partner and
// Coffee Trainer can be named per ops area, each falling back to whoever is
// still named at region level wherever cover has not been handed out. The two
// roles are covered independently, so a region can split its Coffee Partner
// patch while its Coffee Trainer carries on across the whole region.
//
// Ops areas are named after the ops manager who runs them, so an area's name
// changes whenever that manager does. Each cover row therefore records the
// bakeries the area held when it was saved and follows that membership across a
// rename, in the same way area head baristas follow their home bakery.
(function () {
  'use strict';

  // Fallback for a cover row whose ops area no longer exists under the name it
  // was saved with: follow the detected area that took more than half of its
  // bakeries. Over half, so an old area can only ever carry into one new one.
  var CARRY_OVER_SHARE = 0.5;

  var COVER_FIELDS = [
    'coffeePartner',
    'coffeePartnerUid',
    'coffeeTrainer',
    'coffeeTrainerUid'
  ];

  function cleanText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function regionKey(value) {
    return cleanText(value).toLowerCase();
  }

  function bakeryList(value) {
    var seen = {};
    var names = [];
    (Array.isArray(value) ? value : []).forEach(function (name) {
      var key = regionKey(name);
      if (!key || seen[key]) return;
      seen[key] = true;
      names.push(cleanText(name));
    });
    return names.sort(function (a, b) { return a.localeCompare(b); });
  }

  function sharedCount(first, second) {
    var inFirst = {};
    first.forEach(function (name) { inFirst[regionKey(name)] = true; });
    var shared = 0;
    second.forEach(function (name) { if (inFirst[regionKey(name)]) shared++; });
    return shared;
  }

  // How much of `bakeries` ended up in `destination`. One-way on purpose: a
  // small area folded whole into a big one has carried over completely, even
  // though the two look nothing alike from the big one's point of view.
  function membershipShare(bakeries, destination) {
    if (!bakeries.length) return 0;
    return sharedCount(bakeries, destination) / bakeries.length;
  }

  function emptyCoverArea(opsArea, bakeries) {
    return {
      opsArea: cleanText(opsArea),
      coffeePartner: '',
      coffeePartnerUid: '',
      coffeeTrainer: '',
      coffeeTrainerUid: '',
      bakeries: bakeryList(bakeries)
    };
  }

  // An area nobody covers is the same as no cover row at all — the region-level
  // Coffee Partner and Coffee Trainer still look after it.
  function coverAreaIsEmpty(area) {
    return !area.coffeePartner && !area.coffeePartnerUid &&
      !area.coffeeTrainer && !area.coffeeTrainerUid;
  }

  function normalizeCoverArea(record) {
    var value = record && typeof record === 'object' ? record : { opsArea: record };
    return {
      opsArea: cleanText(value.opsArea || value.ops || value.o),
      coffeePartner: cleanText(value.coffeePartner || value.partner),
      coffeePartnerUid: cleanText(value.coffeePartnerUid || value.partnerUid),
      coffeeTrainer: cleanText(value.coffeeTrainer || value.trainer),
      coffeeTrainerUid: cleanText(value.coffeeTrainerUid || value.trainerUid),
      bakeries: bakeryList(value.bakeries)
    };
  }

  function normalizeCoverAreas(value) {
    var records = [];
    if (Array.isArray(value)) {
      records = value;
    } else if (value && typeof value === 'object') {
      records = Object.keys(value).map(function (key) {
        var record = value[key];
        return record && typeof record === 'object'
          ? Object.assign({ opsArea: key }, record)
          : { opsArea: key };
      });
    }

    var byArea = {};
    var order = [];
    records.map(normalizeCoverArea).forEach(function (area) {
      var key = regionKey(area.opsArea);
      if (!key) return;
      if (!byArea[key]) {
        byArea[key] = area;
        order.push(key);
        return;
      }
      // Same rule as the region rows: merging two representations of one area
      // never replaces a named colleague with a blank.
      var target = byArea[key];
      COVER_FIELDS.forEach(function (field) {
        target[field] = target[field] || area[field];
      });
      target.bakeries = bakeryList(target.bakeries.concat(area.bakeries));
    });

    return order.map(function (key) { return byArea[key]; });
  }

  function normalizeCover(value) {
    var source = value && typeof value === 'object' ? value : {};
    return {
      enabled: source.enabled === true || source.enabled === 'true',
      areas: normalizeCoverAreas(source.areas || source.opsAreas)
    };
  }

  // Cover is stored only where it says something: a region running normally
  // carries no cover key at all.
  function attachCover(record, cover) {
    if (cover && (cover.enabled || cover.areas.length)) record.cover = cover;
    return record;
  }

  function normalizeAssignment(record, fallbackRegion) {
    var value = record && typeof record === 'object' ? record : {};
    return attachCover({
      region: cleanText(value.region || fallbackRegion),
      coffeePartner: cleanText(value.coffeePartner || value.partner),
      coffeePartnerUid: cleanText(value.coffeePartnerUid || value.partnerUid),
      coffeeTrainer: cleanText(value.coffeeTrainer || value.trainer),
      coffeeTrainerUid: cleanText(value.coffeeTrainerUid || value.trainerUid)
    }, normalizeCover(value.cover));
  }

  function normalizeAssignments(assignments) {
    var records = [];

    if (Array.isArray(assignments)) {
      records = assignments;
    } else if (assignments && typeof assignments === 'object') {
      records = Object.keys(assignments).map(function (key) {
        return normalizeAssignment(assignments[key], key);
      });
    }

    var byRegion = {};
    records.forEach(function (record) {
      var normalized = normalizeAssignment(record);
      var key = regionKey(normalized.region);
      if (!key) return;

      if (!byRegion[key]) {
        byRegion[key] = normalized;
        return;
      }

      // Merge duplicate representations of the same region without replacing
      // an existing contact with an empty value.
      byRegion[key].region = normalized.region || byRegion[key].region;
      byRegion[key].coffeePartner = normalized.coffeePartner || byRegion[key].coffeePartner;
      byRegion[key].coffeePartnerUid = normalized.coffeePartnerUid || byRegion[key].coffeePartnerUid;
      byRegion[key].coffeeTrainer = normalized.coffeeTrainer || byRegion[key].coffeeTrainer;
      byRegion[key].coffeeTrainerUid = normalized.coffeeTrainerUid || byRegion[key].coffeeTrainerUid;

      var existingCover = normalizeCover(byRegion[key].cover);
      var incomingCover = normalizeCover(normalized.cover);
      attachCover(byRegion[key], {
        enabled: existingCover.enabled || incomingCover.enabled,
        areas: normalizeCoverAreas(existingCover.areas.concat(incomingCover.areas))
      });
    });

    return Object.keys(byRegion).map(function (key) {
      return byRegion[key];
    });
  }

  // The ops areas detected inside one region. Each carries the bakeries it
  // currently holds, which is what lets a cover row survive a rename.
  function normalizeDetectedOpsAreas(opsAreas) {
    var byArea = {};
    var order = [];
    (opsAreas || []).forEach(function (entry) {
      var value = entry && typeof entry === 'object' ? entry : { opsArea: entry };
      var opsArea = cleanText(value.opsArea || value.ops || value.o);
      var key = regionKey(opsArea);
      if (!key) return;
      if (!byArea[key]) {
        byArea[key] = { opsArea: opsArea, bakeries: bakeryList(value.bakeries) };
        order.push(key);
        return;
      }
      byArea[key].bakeries = bakeryList(byArea[key].bakeries.concat(bakeryList(value.bakeries)));
    });
    return order.map(function (key) {
      return byArea[key];
    }).sort(function (a, b) {
      return a.opsArea.localeCompare(b.opsArea);
    });
  }

  // `regions` may be plain region names, or { region, opsAreas } records where
  // the caller knows how the region is divided up. Only the latter can offer
  // cover, since there is nothing to hand out without the ops areas.
  function normalizeRegions(regions) {
    var byRegion = {};
    var order = [];
    (regions || []).forEach(function (entry) {
      var value = entry && typeof entry === 'object' ? entry : { region: entry };
      var label = cleanText(value.region || value.r);
      var key = regionKey(label);
      if (!key) return;
      if (!byRegion[key]) {
        byRegion[key] = { region: label, opsAreas: [] };
        order.push(key);
      }
      var opsAreas = value.opsAreas || value.areas;
      if (Array.isArray(opsAreas)) {
        byRegion[key].opsAreas = byRegion[key].opsAreas.concat(opsAreas);
      }
    });
    return order.map(function (key) {
      return {
        region: byRegion[key].region,
        opsAreas: normalizeDetectedOpsAreas(byRegion[key].opsAreas)
      };
    }).sort(function (a, b) {
      return a.region.localeCompare(b.region);
    });
  }

  // Places every saved cover row against a detected ops area: the area still
  // carrying its name, or failing that the one that took more than half of its
  // bakeries. A row that fits neither is kept as it was rather than dropped, so
  // an area missing from one upload never loses the colleague covering it.
  //
  // Returns a row for every detected ops area, including the ones nobody covers
  // — those are what the admin types into.
  function placeCoverAreas(detectedOpsAreas, cover) {
    var slots = (detectedOpsAreas || []).map(function (pair) {
      return emptyCoverArea(pair.opsArea, pair.bakeries);
    });

    var slotByKey = {};
    slots.forEach(function (slot) { slotByKey[regionKey(slot.opsArea)] = slot; });

    var retained = [];
    (cover.areas || []).forEach(function (area) {
      var slot = slotByKey[regionKey(area.opsArea)] || null;
      var renamed = false;

      if (!slot && area.bakeries.length) {
        var best = null;
        slots.forEach(function (candidate) {
          var share = membershipShare(area.bakeries, candidate.bakeries);
          if (share <= CARRY_OVER_SHARE) return;
          if (!best || share > best.share) best = { slot: candidate, share: share };
        });
        if (best) {
          slot = best.slot;
          renamed = true;
        }
      }

      if (!slot) {
        if (!coverAreaIsEmpty(area)) retained.push(Object.assign({ retained: true }, area));
        return;
      }

      COVER_FIELDS.forEach(function (field) {
        slot[field] = slot[field] || area[field];
      });
      // Display-only, and only worth saying about an area somebody covers.
      if (renamed && !coverAreaIsEmpty(area)) slot.renamedFrom = area.opsArea;
    });

    return slots.concat(retained);
  }

  function storedCoverArea(area) {
    return {
      opsArea: area.opsArea,
      coffeePartner: area.coffeePartner,
      coffeePartnerUid: area.coffeePartnerUid,
      coffeeTrainer: area.coffeeTrainer,
      coffeeTrainerUid: area.coffeeTrainerUid,
      // Always the membership as it stands now, so the next restructure is
      // judged against the current shape of the area rather than a stale one.
      bakeries: area.bakeries
    };
  }

  function hasAnyContact(record) {
    if (record.coffeePartner || record.coffeePartnerUid ||
        record.coffeeTrainer || record.coffeeTrainerUid) return true;
    return normalizeCover(record.cover).areas.some(function (area) {
      return !coverAreaIsEmpty(area);
    });
  }

  // Returns assignments for every detected region and retains contact-bearing
  // assignments for regions that temporarily disappear from an upload.
  function mergeDetectedRegions(regions, assignments) {
    var existing = normalizeAssignments(assignments);
    var existingByRegion = {};
    existing.forEach(function (record) {
      existingByRegion[regionKey(record.region)] = record;
    });

    var activeKeys = {};
    var merged = normalizeRegions(regions).map(function (detected) {
      var key = regionKey(detected.region);
      var previous = existingByRegion[key] || {};
      activeKeys[key] = true;

      var cover = normalizeCover(previous.cover);
      var areas = placeCoverAreas(detected.opsAreas, cover)
        .filter(function (area) { return !coverAreaIsEmpty(area); })
        .map(storedCoverArea);

      return attachCover({
        region: detected.region,
        coffeePartner: cleanText(previous.coffeePartner),
        coffeePartnerUid: cleanText(previous.coffeePartnerUid),
        coffeeTrainer: cleanText(previous.coffeeTrainer),
        coffeeTrainerUid: cleanText(previous.coffeeTrainerUid)
      }, { enabled: cover.enabled, areas: areas });
    });

    existing.forEach(function (record) {
      var key = regionKey(record.region);
      if (activeKeys[key]) return;
      if (!hasAnyContact(record)) return;
      merged.push(record);
    });

    return merged;
  }

  // The same records shaped for the admin table: every detected ops area of a
  // region on cover gets a row, whether or not anybody covers it yet.
  //
  // Works from the saved assignments rather than the merged ones so a cover row
  // that has just followed its bakeries into a renamed area can still say so —
  // by the time it is merged, it is simply filed under the new name.
  function assignmentsForRegions(regions, assignments) {
    var existingByRegion = {};
    normalizeAssignments(assignments).forEach(function (record) {
      existingByRegion[regionKey(record.region)] = record;
    });

    return normalizeRegions(regions).map(function (entry) {
      var record = existingByRegion[regionKey(entry.region)] || {};
      var cover = normalizeCover(record.cover);
      return attachCover({
        region: entry.region,
        coffeePartner: cleanText(record.coffeePartner),
        coffeePartnerUid: cleanText(record.coffeePartnerUid),
        coffeeTrainer: cleanText(record.coffeeTrainer),
        coffeeTrainerUid: cleanText(record.coffeeTrainerUid)
      }, {
        enabled: cover.enabled,
        areas: cover.enabled || cover.areas.length
          ? placeCoverAreas(entry.opsAreas, cover)
          : []
      });
    });
  }

  function findRegionRecord(rows, region) {
    var key = regionKey(region);
    if (!key) return null;
    var target = rows.find(function (record) {
      return regionKey(record.region) === key;
    });
    if (target) return target;
    target = {
      region: cleanText(region),
      coffeePartner: '',
      coffeePartnerUid: '',
      coffeeTrainer: '',
      coffeeTrainerUid: ''
    };
    rows.push(target);
    return target;
  }

  function detectedOpsAreasFor(regions, region) {
    var key = regionKey(region);
    var entry = normalizeRegions(regions).find(function (candidate) {
      return regionKey(candidate.region) === key;
    });
    return entry ? entry.opsAreas : [];
  }

  function updateAssignment(regions, assignments, region, field, value) {
    if (COVER_FIELDS.indexOf(field) === -1) {
      return mergeDetectedRegions(regions, assignments);
    }

    var merged = mergeDetectedRegions(regions, assignments);
    var target = findRegionRecord(merged, region);
    if (target) target[field] = cleanText(value);
    return merged;
  }

  // Cover ends when the vacancy is filled, so switching it off puts the region
  // back exactly as it was: every ops area returns to the region's own Coffee
  // Partner and Coffee Trainer, and the split is cleared rather than left behind
  // to reappear the next time cover is needed for an unrelated reason.
  function setCover(regions, assignments, region, enabled) {
    var merged = mergeDetectedRegions(regions, assignments);
    var target = findRegionRecord(merged, region);
    if (!target) return merged;

    var isOn = enabled === true;
    var cover = normalizeCover(target.cover);
    delete target.cover;
    attachCover(target, { enabled: isOn, areas: isOn ? cover.areas : [] });
    return merged;
  }

  // Whether ending cover for this region would clear anything, so the admin can
  // be told what they are about to undo before it happens.
  function coveredAreas(assignments, region) {
    var key = regionKey(region);
    var record = normalizeAssignments(assignments).find(function (candidate) {
      return regionKey(candidate.region) === key;
    });
    return normalizeCover(record && record.cover).areas.filter(function (area) {
      return !coverAreaIsEmpty(area);
    });
  }

  function updateCoverAssignment(regions, assignments, region, opsArea, field, value) {
    if (COVER_FIELDS.indexOf(field) === -1) {
      return mergeDetectedRegions(regions, assignments);
    }

    var areaKey = regionKey(opsArea);
    var merged = mergeDetectedRegions(regions, assignments);
    var target = findRegionRecord(merged, region);
    if (!target || !areaKey) return merged;

    var cover = normalizeCover(target.cover);
    var area = cover.areas.find(function (record) {
      return regionKey(record.opsArea) === areaKey;
    });

    if (!area) {
      var detected = detectedOpsAreasFor(regions, region).find(function (record) {
        return regionKey(record.opsArea) === areaKey;
      });
      area = emptyCoverArea(opsArea, detected && detected.bakeries);
      cover.areas.push(area);
    }

    area[field] = cleanText(value);
    delete target.cover;
    attachCover(target, {
      enabled: cover.enabled,
      areas: cover.areas.filter(function (record) { return !coverAreaIsEmpty(record); })
    });
    return merged;
  }

  // The Coffee Partner and Coffee Trainer who actually look after one ops area:
  // whoever covers it while the region is on cover, and the region's own pair
  // everywhere else. The two roles resolve independently.
  function resolveAssignment(record, opsArea) {
    var value = record && typeof record === 'object' ? record : {};
    var cover = normalizeCover(value.cover);
    var resolved = {
      region: cleanText(value.region),
      coffeePartner: cleanText(value.coffeePartner),
      coffeePartnerUid: cleanText(value.coffeePartnerUid),
      coffeeTrainer: cleanText(value.coffeeTrainer),
      coffeeTrainerUid: cleanText(value.coffeeTrainerUid),
      coverEnabled: cover.enabled,
      partnerFromCover: false,
      trainerFromCover: false
    };
    if (!cover.enabled) return resolved;

    var areaKey = regionKey(opsArea);
    var area = areaKey && cover.areas.find(function (entry) {
      return regionKey(entry.opsArea) === areaKey;
    });
    if (!area) return resolved;

    if (area.coffeePartner || area.coffeePartnerUid) {
      resolved.coffeePartner = area.coffeePartner;
      resolved.coffeePartnerUid = area.coffeePartnerUid;
      resolved.partnerFromCover = true;
    }
    if (area.coffeeTrainer || area.coffeeTrainerUid) {
      resolved.coffeeTrainer = area.coffeeTrainer;
      resolved.coffeeTrainerUid = area.coffeeTrainerUid;
      resolved.trainerFromCover = true;
    }
    return resolved;
  }

  window.GAILS_REGION_ASSIGNMENTS = {
    regionKey: regionKey,
    normalizeAssignments: normalizeAssignments,
    mergeDetectedRegions: mergeDetectedRegions,
    assignmentsForRegions: assignmentsForRegions,
    updateAssignment: updateAssignment,
    setCover: setCover,
    coveredAreas: coveredAreas,
    updateCoverAssignment: updateCoverAssignment,
    resolveAssignment: resolveAssignment
  };
})();

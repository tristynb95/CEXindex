(function () {
  'use strict';

  function cleanText(value) {
    return String(value == null ? '' : value).trim().replace(/\s+/g, ' ');
  }

  function regionKey(value) {
    return cleanText(value).toLowerCase();
  }

  function normalizeAssignment(record, fallbackRegion) {
    var value = record && typeof record === 'object' ? record : {};
    return {
      region: cleanText(value.region || fallbackRegion),
      coffeePartner: cleanText(value.coffeePartner || value.partner),
      coffeePartnerUid: cleanText(value.coffeePartnerUid || value.partnerUid),
      coffeeTrainer: cleanText(value.coffeeTrainer || value.trainer),
      coffeeTrainerUid: cleanText(value.coffeeTrainerUid || value.trainerUid)
    };
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
    });

    return Object.keys(byRegion).map(function (key) {
      return byRegion[key];
    });
  }

  function normalizeRegions(regions) {
    var byRegion = {};
    (regions || []).forEach(function (region) {
      var label = cleanText(region);
      var key = regionKey(label);
      if (key && !byRegion[key]) byRegion[key] = label;
    });
    return Object.keys(byRegion).map(function (key) {
      return byRegion[key];
    }).sort(function (a, b) {
      return a.localeCompare(b);
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
    var merged = normalizeRegions(regions).map(function (region) {
      var key = regionKey(region);
      var previous = existingByRegion[key] || {};
      activeKeys[key] = true;
      return {
        region: region,
        coffeePartner: cleanText(previous.coffeePartner),
        coffeePartnerUid: cleanText(previous.coffeePartnerUid),
        coffeeTrainer: cleanText(previous.coffeeTrainer),
        coffeeTrainerUid: cleanText(previous.coffeeTrainerUid)
      };
    });

    existing.forEach(function (record) {
      var key = regionKey(record.region);
      if (activeKeys[key]) return;
      if (!record.coffeePartner && !record.coffeePartnerUid &&
          !record.coffeeTrainer && !record.coffeeTrainerUid) return;
      merged.push(record);
    });

    return merged;
  }

  function assignmentsForRegions(regions, assignments) {
    var activeKeys = {};
    normalizeRegions(regions).forEach(function (region) {
      activeKeys[regionKey(region)] = true;
    });
    return mergeDetectedRegions(regions, assignments).filter(function (record) {
      return !!activeKeys[regionKey(record.region)];
    });
  }

  function updateAssignment(regions, assignments, region, field, value) {
    if (field !== 'coffeePartner' && field !== 'coffeePartnerUid' &&
        field !== 'coffeeTrainer' && field !== 'coffeeTrainerUid') {
      return mergeDetectedRegions(regions, assignments);
    }

    var targetKey = regionKey(region);
    var merged = mergeDetectedRegions(regions, assignments);
    var target = merged.find(function (record) {
      return regionKey(record.region) === targetKey;
    });

    if (!target && targetKey) {
      target = {
        region: cleanText(region),
        coffeePartner: '',
        coffeePartnerUid: '',
        coffeeTrainer: '',
        coffeeTrainerUid: ''
      };
      merged.push(target);
    }
    if (target) target[field] = cleanText(value);
    return merged;
  }

  window.GAILS_REGION_ASSIGNMENTS = {
    regionKey: regionKey,
    normalizeAssignments: normalizeAssignments,
    mergeDetectedRegions: mergeDetectedRegions,
    assignmentsForRegions: assignmentsForRegions,
    updateAssignment: updateAssignment
  };
})();

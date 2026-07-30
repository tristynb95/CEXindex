// ========== ROUTINE VISIT SCHEMA (shared) ==========
// Single source of truth for the "Routine Coffee Visit" form structure, used
// by both admin.html (js/admin-page.js, for editing) and index.html
// (js/visit-report.js, for the read-only report). Keep this in sync with
// apps-script/RoutineVisitSync.gs's QUESTION_MAP when questions change.
window.GAILS_VISIT_SCHEMA = {
  general: [
    { key: 'bakery', label: 'Bakery', type: 'text' },
    { key: 'date', label: 'Visit date', type: 'date' },
    { key: 'time', label: 'Visit time', type: 'time' },
    { key: 'coffeePartner', label: 'Coffee Partner', type: 'text' },
    { key: 'headBaristaPresent', label: 'Head Barista Present', type: 'ynna' },
    { key: 'mod', label: 'Barista', type: 'text' },
    { key: 'numberOfStaff', label: 'Number of Staff', type: 'number' },
    { key: 'score', label: 'Score', type: 'number' },
    { key: 'scoreMax', label: 'Score (out of)', type: 'number' }
  ],
  sections: [
    {
      key: 'service', title: 'Service', fields: [
        { key: 'namesTakenAtTill', label: 'Names taken at till', type: 'ynna' },
        { key: 'namesCalledOutAtBar', label: 'Names called out at bar', type: 'ynna' },
        { key: 'customersCalledToBar', label: 'Customers called to bar as drinks are prepared', type: 'ynna' },
        { key: 'productKnowledge', label: 'Team demonstrate product knowledge', type: 'ynna' },
        { key: 'baristasShine', label: 'Baristas displaying great SHINE', type: 'ynna' },
        { key: 'baristasLift', label: 'Baristas practicing LIFT/Service Recovery', type: 'ynna' },
        { key: 'seasonalAvailable', label: 'All seasonal products available', type: 'ynna' },
        { key: 'filterAvailable', label: 'Filter available', type: 'ynna' },
        { key: 'coldBrewAvailable', label: 'Cold Brew available', type: 'ynna' },
        { key: 'fullRangeAvailableOnline', label: 'Full range available online', type: 'ynna' },
        { key: 'comments', label: 'Service comments', type: 'textarea' },
        { key: 'photos', label: 'Service photos', type: 'photos' }
      ]
    },
    {
      key: 'healthSafety', title: 'Health & Safety', fields: [
        { key: 'allergensControlled', label: 'Allergens are controlled', type: 'ynna' },
        { key: 'ecommerceStickersAvailable', label: 'E-commerce stickers available and in use', type: 'ynna' },
        { key: 'dateLabels', label: 'Open containers have correct date labels', type: 'ynna' },
        { key: 'ordersCompleteAfterCollection', label: 'Orders only marked as complete after collection', type: 'ynna' },
        { key: 'steamWandWipedPurged', label: 'Steam wand wiped and purged between uses', type: 'ynna' },
        { key: 'milkNotResteamed', label: 'Milk is not resteamed', type: 'ynna' },
        { key: 'pitchersStoredUpright', label: 'Pitchers stored up-right', type: 'ynna' },
        { key: 'handWashTimer', label: 'Hand wash timer on and in use', type: 'ynna' },
        { key: 'workStationClean', label: 'Work station clean and tidy according to day-part', type: 'ynna' },
        { key: 'milkBottlesMarkedTimes', label: 'Milk bottles marked with times', type: 'ynna' },
        { key: 'crockeryClean', label: 'Crockery is clean', type: 'ynna' },
        { key: 'pitchersFreeResidue', label: 'Pitchers free of residue and build-up', type: 'ynna' },
        { key: 'comments', label: 'H&S comments', type: 'textarea' },
        { key: 'photos', label: 'H&S photos', type: 'photos' }
      ]
    },
    {
      key: 'coffeeEfficiency', title: 'Coffee Efficiency', fields: [
        { key: 'avgWaitTimeSeconds', label: 'Average coffee wait time (seconds)', type: 'number' },
        { key: 'tillSupportingTeas', label: 'Till supporting with teas and iced drinks', type: 'ynna' },
        { key: 'easyCream', label: 'Baristas using easy-cream', type: 'ynna' },
        { key: 'efficientLayoutWorkflow', label: 'Efficient Layout/Workflow', type: 'ynna' },
        { key: 'baristaRoutineScaling', label: 'Barista routine in use. Baristas scaling to service needs.', type: 'ynna' },
        { key: 'comments', label: 'Comments', type: 'textarea' }
      ]
    },
    {
      // Renamed from 'coffeeQuality' when Maintenance was split out into its
      // own section — see legacyKeys below and the "evolving this schema"
      // note at the end of this file.
      key: 'drinkQuality', legacyKeys: ['coffeeQuality'], title: 'Drink Quality', fields: [
        { key: 'houseBlendRecipe', label: 'House Blend is prepared to recipe', type: 'ynna' },
        { key: 'filterBalancedShelfLife', label: 'Filter is balanced and within 2hr shelf life', type: 'ynna' },
        { key: 'coffeeNotPreGround', label: 'Coffee is not pre-ground', type: 'ynna' },
        { key: 'espressoTampingEven', label: 'Espresso tamping is even and there are no cracks or craters in coffee bed', type: 'ynna' },
        { key: 'milkSteamedStandard', label: 'Milk steamed to standard', type: 'ynna' },
        { key: 'latteArt', label: 'Drinks have latte art', type: 'ynna' },
        { key: 'presentationToStandard', label: 'Drink presentation to standard', type: 'ynna' },
        { key: 'drinkPresentation', label: 'Drink Presentation (scale: Poor – Exceptional)', type: 'scale' },
        // Retired from the form; kept so visits recorded before the change
        // still show the answers they collected. Hidden automatically (see
        // the `legacy` filtering in visit-report.js/admin-page.js) whenever a
        // visit has no value for them, so they never appear on new visits.
        { key: 'espressoTaste', label: 'Espresso Taste (1-10)', type: 'scale', legacy: true },
        { key: 'milkQuality', label: 'Milk Quality (1-10)', type: 'scale', legacy: true },
        { key: 'comments', label: 'Quality comments', type: 'textarea' },
        { key: 'photos', label: 'Coffee quality photos', type: 'photos' }
      ]
    },
    {
      key: 'maintenance', title: 'Maintenance', fields: [
        { key: 'grindersClean', label: 'Grinders are clean and well maintained', type: 'ynna' },
        { key: 'espressoMachinesClean', label: 'Espresso machines are clean and well maintained', type: 'ynna' },
        { key: 'steamWandsFreeBuildUp', label: 'Steam wands are free of build up', type: 'ynna' },
        { key: 'scalesAvailableInUse', label: 'Scales available and in use', type: 'ynna' },
        { key: 'baristaMaintenanceBoxStocked', label: 'Barista maintenance box fully stocked', type: 'ynna' },
        { key: 'pitcherRinserCleanWorking', label: 'Pitcher rinser clean and working', type: 'ynna' },
        { key: 'hotWaterBoilerCleanWorking', label: 'Hot water boiler clean and working', type: 'ynna' },
        { key: 'iceMachinesCleanWorking', label: 'Ice machines clean and working', type: 'ynna' },
        { key: 'comments', label: 'Maintenance comments', type: 'textarea' },
        { key: 'photos', label: 'Maintenance photos', type: 'photos' }
      ]
    },
    {
      key: 'leadership', title: 'Leadership', fields: [
        { key: 'headBaristaCoaching', label: 'Head Barista actively coaching team', type: 'ynna' },
        { key: 'leadBaristaCommunicatingTillStandby', label: 'Lead barista actively communicating with till and coffee standby', type: 'ynna' },
        { key: 'comments', label: 'Leadership comments', type: 'textarea' }
      ]
    },
    {
      key: 'complianceTraining', title: 'Compliance & Training', fields: [
        { key: 'allBaristasSignedOff', label: 'All baristas signed off', type: 'ynna' },
        { key: 'allBaristasRiseComplete', label: 'All baristas RISE complete', type: 'ynna' },
        { key: 'evidenceCrossTraining', label: 'Evidence of cross-training', type: 'ynna' },
        { key: 'comments', label: 'Compliance comments', type: 'textarea' }
      ]
    }
  ]
};

// ========== EVOLVING THIS SCHEMA SAFELY ==========
// The Google Form will keep changing over time — questions get reworded,
// sections get split or renamed, questions get retired. Every visit ever
// recorded under an older shape of the form must keep rendering correctly in
// admin.html and index.html. Three tools below make each kind of change
// backward-compatible; don't delete old data or special-case it by date —
// just follow the matching recipe:
//
// 1. Renaming a section (key and/or title change, e.g. coffeeQuality ->
//    drinkQuality): keep the new key/title, and add the old key to that
//    section's `legacyKeys: [...]` array. Do this every time a section is
//    renamed — the array can hold more than one past key if it's renamed
//    more than once.
//
// 2. Retiring a question (removed from the form, not replaced by anything):
//    leave its field entry in the schema — never delete it — and add
//    `legacy: true`. It then only renders on visits that actually have a
//    value for it, never as a blank row on visits recorded after removal.
//    Also drop (or leave — harmless either way) its entry in apps-script/
//    RoutineVisitSync.gs's QUESTION_MAP.
//
// 3. Renaming a question's underlying field key while it stays the same
//    question (rare — usually only needed if a field is renamed without a
//    section-level change): add `legacyKeys: [...]` to that field, same
//    pattern as #1.
//
// Adding a brand-new question needs no special handling — old visits simply
// show "—" for it, which is correct (they were never asked it).
//
// Whenever a question's title changes on the live Google Form (regardless of
// whether the stored field key changes), also update apps-script/
// RoutineVisitSync.gs's QUESTION_MAP — that's what decides which stored key
// each Form answer lands in going forward.

// Returns the answers for a section, falling back through legacyKeys (oldest
// schema shape last) for visits recorded before a rename.
window.getVisitSectionData = function (record, section) {
  if (!record) return {};
  if (record[section.key]) return record[section.key];
  var legacyKeys = section.legacyKeys || [];
  for (var i = 0; i < legacyKeys.length; i++) {
    if (record[legacyKeys[i]]) return record[legacyKeys[i]];
  }
  return {};
};

// Same fallback as getVisitSectionData, for the sectionScores breakdown.
window.getVisitSectionScores = function (record, section) {
  var scores = (record && record.sectionScores) || {};
  if (scores[section.key]) return scores[section.key];
  var legacyKeys = section.legacyKeys || [];
  for (var i = 0; i < legacyKeys.length; i++) {
    if (scores[legacyKeys[i]]) return scores[legacyKeys[i]];
  }
  return null;
};

// Reads one field's value out of a section's (already-resolved) data,
// falling back through the field's own legacyKeys if its key was renamed.
window.getFieldValue = function (data, field) {
  if (!data) return undefined;
  if (data[field.key] !== undefined) return data[field.key];
  var legacyKeys = field.legacyKeys || [];
  for (var i = 0; i < legacyKeys.length; i++) {
    if (data[legacyKeys[i]] !== undefined) return data[legacyKeys[i]];
  }
  return undefined;
};

// A `legacy` field (a retired question) should only ever be shown for visits
// that actually recorded an answer to it — never as a blank row on visits
// completed after the question was removed from the form.
window.visibleSectionFields = function (section, data) {
  return section.fields.filter(function (field) {
    if (!field.legacy) return true;
    var value = window.getFieldValue(data, field);
    return value != null && value !== '';
  });
};

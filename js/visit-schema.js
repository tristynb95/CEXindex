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
      key: 'drinkQuality', title: 'Drink Quality', fields: [
        { key: 'houseBlendRecipe', label: 'House Blend is prepared to recipe', type: 'ynna' },
        { key: 'filterBalancedShelfLife', label: 'Filter is balanced and within 2hr shelf life', type: 'ynna' },
        { key: 'coffeeNotPreGround', label: 'Coffee is not pre-ground', type: 'ynna' },
        { key: 'espressoTampingEven', label: 'Espresso tamping is even and there are no cracks or craters in coffee bed', type: 'ynna' },
        { key: 'milkSteamedStandard', label: 'Milk steamed to standard', type: 'ynna' },
        { key: 'latteArt', label: 'Drinks have latte art', type: 'ynna' },
        { key: 'presentationToStandard', label: 'Drink presentation to standard', type: 'ynna' },
        { key: 'drinkPresentation', label: 'Drink Presentation (scale: Poor – Exceptional)', type: 'scale' },
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

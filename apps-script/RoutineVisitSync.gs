/**
 * Syncs "Routine Coffee Visit" Google Form submissions into Firebase RTDB at
 * routineVisits/{formResponseId}, matching the schema shared by admin.html
 * (js/admin-page.js) and index.html (js/visit-report.js) — see
 * js/visit-schema.js for the canonical field list.
 *
 * SETUP
 * 1. Open the form in Google Forms > the three-dot menu (⋮) > Script editor.
 *    This binds the script to the form itself so onFormSubmit(e) receives
 *    e.response (a FormResponse), letting us match answers by question title
 *    instead of column position — this survives the sheet being reordered.
 * 2. Paste this file's contents into Code.gs.
 * 3. Project Settings (gear icon) > Script Properties > add:
 *      FIREBASE_DB_URL    = https://cexindex-default-rtdb.firebaseio.com
 *      FIREBASE_DB_SECRET = <a Database Secret, NOT the client apiKey —
 *                            Firebase console > Project settings > Service
 *                            accounts > Database secrets (legacy)>
 *    The secret bypasses RTDB security rules for this trusted script only;
 *    never put it in client-side code.
 * 4. Triggers (clock icon) > Add Trigger > function: onFormSubmit,
 *    event source: From form, event type: On form submit > Save.
 * 5. Submit a test response and confirm it appears under routineVisits in
 *    the Firebase console, then check it renders in the admin Visits panel.
 *
 * NOTE: score, scoreMax, and the per-section sectionScores breakdown (used by
 * the dashboard's visit report chart) are all computed directly from answers
 * and each question's configured point value in onFormSubmit — this does not
 * rely on Google's quiz auto-grading being read back correctly (that path was
 * tried and returned 0 even when Forms itself graded a response correctly).
 * A "Yes" or "N/A" answer on any graded question earns full credit, "No"
 * earns zero. If a question's scoring doesn't follow that pattern, an admin
 * can still correct the score fields by hand in the Visits panel.
 */

var QUESTION_MAP = {
  'Bakery': { field: 'bakery' },
  'Date': { field: 'date', parse: parseDateValue },
  'Time': { field: 'time' },
  'Coffee Partner': { field: 'coffeePartner' },
  'Head Barista Present': { field: 'headBaristaPresent' },
  'MOD': { field: 'mod' },
  'Number of Staff': { field: 'numberOfStaff', parse: Number },

  'Names taken at till': { section: 'service', field: 'namesTakenAtTill' },
  'Names called out at bar': { section: 'service', field: 'namesCalledOutAtBar' },
  'Customers called to bar as drinks are prepared': { section: 'service', field: 'customersCalledToBar' },
  'Team Demonstrate Product knowledge': { section: 'service', field: 'productKnowledge' },
  'Baristas displaying great SHINE': { section: 'service', field: 'baristasShine' },
  'Baristas practicing LIFT/Service Recovery': { section: 'service', field: 'baristasLift' },
  'All seasonal products available': { section: 'service', field: 'seasonalAvailable' },
  'Filter available': { section: 'service', field: 'filterAvailable' },
  'Cold Brew available': { section: 'service', field: 'coldBrewAvailable' },
  'Full range available online': { section: 'service', field: 'fullRangeAvailableOnline' },
  'Service Comments': { section: 'service', field: 'comments' },
  'Upload Service Photos': { section: 'service', field: 'photos', isFile: true },

  'Allergens are controlled': { section: 'healthSafety', field: 'allergensControlled' },
  'E-commerce stickers available and in use': { section: 'healthSafety', field: 'ecommerceStickersAvailable' },
  'Open containers have correct date labels': { section: 'healthSafety', field: 'dateLabels' },
  'Orders only marked as complete after collection': { section: 'healthSafety', field: 'ordersCompleteAfterCollection' },
  'Steam wand wiped and purged between uses': { section: 'healthSafety', field: 'steamWandWipedPurged' },
  'Milk is not resteamed': { section: 'healthSafety', field: 'milkNotResteamed' },
  'Pitchers stored up-right': { section: 'healthSafety', field: 'pitchersStoredUpright' },
  'Hand wash timer on and in use': { section: 'healthSafety', field: 'handWashTimer' },
  'Work station clean and tidy according to day-part': { section: 'healthSafety', field: 'workStationClean' },
  'Milk bottles marked with times': { section: 'healthSafety', field: 'milkBottlesMarkedTimes' },
  'Crockery is clean': { section: 'healthSafety', field: 'crockeryClean' },
  'Pitchers free of residue and build-up': { section: 'healthSafety', field: 'pitchersFreeResidue' },
  'H&S Comments': { section: 'healthSafety', field: 'comments' },
  'Upload Health & Safety Photos': { section: 'healthSafety', field: 'photos', isFile: true },

  'Average coffee wait time (seconds)': { section: 'coffeeEfficiency', field: 'avgWaitTimeSeconds', parse: Number },
  'Till supporting with teas and iced drinks': { section: 'coffeeEfficiency', field: 'tillSupportingTeas' },
  'Baristas using easy-cream': { section: 'coffeeEfficiency', field: 'easyCream' },
  'Efficient Layout/Workflow': { section: 'coffeeEfficiency', field: 'efficientLayoutWorkflow' },
  'Barista routine in use. Baristas scaling to service needs.': { section: 'coffeeEfficiency', field: 'baristaRoutineScaling' },
  'Comments': { section: 'coffeeEfficiency', field: 'comments' },

  'House Blend is prepared to recipe': { section: 'coffeeQuality', field: 'houseBlendRecipe' },
  'Filter is balanced and within 2hr shelf life': { section: 'coffeeQuality', field: 'filterBalancedShelfLife' },
  'Espresso tamping is even and there are no cracks or craters in coffee bed': { section: 'coffeeQuality', field: 'espressoTampingEven' },
  'Espresso Taste': { section: 'coffeeQuality', field: 'espressoTaste', parse: Number },
  'Milk steamed to standard': { section: 'coffeeQuality', field: 'milkSteamedStandard' },
  'Milk Quality': { section: 'coffeeQuality', field: 'milkQuality', parse: Number },
  'Coffee is not pre-ground': { section: 'coffeeQuality', field: 'coffeeNotPreGround' },
  'Drinks have latte art': { section: 'coffeeQuality', field: 'latteArt' },
  'Drink Presentation': { section: 'coffeeQuality', field: 'drinkPresentation', parse: Number },
  'Quality Comments': { section: 'coffeeQuality', field: 'comments' },
  'Upload Coffee Quality Photos': { section: 'coffeeQuality', field: 'photos', isFile: true },

  'Head Barista actively coaching team': { section: 'leadership', field: 'headBaristaCoaching' },
  'Lead barista actively communicating with till and coffee standby': { section: 'leadership', field: 'leadBaristaCommunicatingTillStandby' },
  'Leadership Comments': { section: 'leadership', field: 'comments' },

  'All baristas signed off': { section: 'complianceTraining', field: 'allBaristasSignedOff' },
  'All baristas RISE complete': { section: 'complianceTraining', field: 'allBaristasRiseComplete' },
  'Evidence of cross-training': { section: 'complianceTraining', field: 'evidenceCrossTraining' },
  'Compliance Comments': { section: 'complianceTraining', field: 'comments' }
};

function onFormSubmit(e) {
  try {
    var response = e.response;
    var record = {
      service: {}, healthSafety: {}, coffeeEfficiency: {},
      coffeeQuality: {}, leadership: {}, complianceTraining: {}
    };

    // Section point totals are tallied here (not hardcoded anywhere) by reading
    // each question's real configured point value directly from the Form via
    // getItemPoints — this is what powers the score breakdown chart on the
    // dashboard's visit report, and stays correct automatically if points are
    // ever changed in the Form.
    var sectionScores = {
      service: { earned: 0, max: 0 }, healthSafety: { earned: 0, max: 0 },
      coffeeEfficiency: { earned: 0, max: 0 }, coffeeQuality: { earned: 0, max: 0 },
      leadership: { earned: 0, max: 0 }, complianceTraining: { earned: 0, max: 0 }
    };

    response.getItemResponses().forEach(function(itemResponse) {
      var item = itemResponse.getItem();
      var title = item.getTitle().trim();
      var mapping = QUESTION_MAP[title];
      if (!mapping) return; // question not in the schema — ignored, not an error

      var rawValue = itemResponse.getResponse();
      var value;

      if (mapping.isFile) {
        var ids = Array.isArray(rawValue) ? rawValue : (rawValue ? [rawValue] : []);
        value = ids.map(function(id) { return 'https://drive.google.com/file/d/' + id + '/view'; });
      } else if (mapping.parse) {
        value = mapping.parse(rawValue);
      } else {
        value = rawValue;
      }

      if (mapping.section) {
        record[mapping.section][mapping.field] = value;

        var points = getItemPoints(item);
        if (points && sectionScores[mapping.section]) {
          sectionScores[mapping.section].max += points;
          if (rawValue === 'Yes' || rawValue === 'N/A') {
            sectionScores[mapping.section].earned += points;
          }
        }
      } else {
        record[mapping.field] = value;
      }
    });

    record.email = response.getRespondentEmail() || '';
    record.sectionScores = sectionScores;
    record.score = Object.keys(sectionScores).reduce(function(sum, key) { return sum + sectionScores[key].earned; }, 0);
    record.scoreMax = Object.keys(sectionScores).reduce(function(sum, key) { return sum + sectionScores[key].max; }, 0);

    var nowIso = new Date().toISOString();
    record.meta = {
      source: 'form',
      formTimestamp: response.getTimestamp().toISOString(),
      createdAt: nowIso,
      updatedAt: nowIso,
      updatedBy: record.email || 'form'
    };

    pushRecordToFirebase(record, response.getId());
  } catch (err) {
    console.error('onFormSubmit failed: ' + err);
    throw err;
  }
}

// Pinned explicitly rather than relying on Session.getScriptTimeZone(), which
// reflects whatever timezone happens to be set on the Apps Script project —
// all visits are logged in the UK, so dates must resolve on UK local time
// (GMT/BST) regardless of that project setting.
var VISIT_TIMEZONE = 'Europe/London';

function parseDateValue(raw) {
  if (raw instanceof Date) {
    return Utilities.formatDate(raw, VISIT_TIMEZONE, 'yyyy-MM-dd');
  }
  return String(raw);
}

// Google's own quiz-grading read API (FormResponse#getGradableResponses /
// ItemResponse#getScore) was tried here first but returned 0 even for a
// response Forms itself graded 120/121 in its own UI — the read was broken,
// not the grading. So score, scoreMax, and the per-section breakdown are all
// computed directly in onFormSubmit instead: for every answered question
// that has points assigned (via getItemPoints, which reads the configured
// point value regardless of grading state), a "Yes" or "N/A" answer earns
// full credit and "No" earns zero. This matches how the checklist items are
// worded (a "Yes"/"N/A" answer is the desired one).
function getItemPoints(item) {
  try {
    switch (item.getType()) {
      case FormApp.ItemType.MULTIPLE_CHOICE:
        return item.asMultipleChoiceItem().getPoints();
      case FormApp.ItemType.CHECKBOX:
        return item.asCheckboxItem().getPoints();
      case FormApp.ItemType.SCALE:
        return item.asScaleItem().getPoints();
      case FormApp.ItemType.TEXT:
        return item.asTextItem().getPoints();
      case FormApp.ItemType.PARAGRAPH_TEXT:
        return item.asParagraphTextItem().getPoints();
      default:
        return 0;
    }
  } catch (e) {
    return 0;
  }
}

function pushRecordToFirebase(record, dedupeKey) {
  var props = PropertiesService.getScriptProperties();
  var dbUrl = props.getProperty('FIREBASE_DB_URL');
  var secret = props.getProperty('FIREBASE_DB_SECRET');
  if (!dbUrl || !secret) {
    throw new Error('Set FIREBASE_DB_URL and FIREBASE_DB_SECRET in Script Properties first.');
  }

  // Keying by the form response ID makes re-delivery (e.g. a trigger retry)
  // overwrite the same record instead of creating a duplicate.
  var safeKey = dedupeKey.replace(/[.#$\[\]]/g, '_');
  var url = dbUrl.replace(/\/$/, '') + '/routineVisits/' + safeKey + '.json?auth=' + secret;

  var resp = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(record),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() >= 300) {
    throw new Error('Firebase write failed (' + resp.getResponseCode() + '): ' + resp.getContentText());
  }
}

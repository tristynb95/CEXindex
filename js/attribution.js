// ========== RECORD ATTRIBUTION (shared) ==========
// Who a visit or a follow-up belongs to.
//
// Most records in this app are not created by the person they belong to:
// - Routine Coffee Visits arrive from a Google Form (apps-script/), carrying the
//   respondent's email and a typed Coffee Partner name.
// - CQVs and NBO visits are PDFs an admin imports, carrying only a printed
//   auditor name.
// - Follow-up tasks are raised during someone else's check-in.
//
// Attribution therefore has to be *derived*, not typed. This resolves each
// record against the shared people directory (js/mentions.js) so it lands in the
// right person's My Activity hub without anyone assigning it by hand — while an
// explicit @mention assignment, when there is one, always wins.
//
// Deliberately read-time: nothing here writes, so it works on every record ever
// stored, including the ones that predate assignment entirely. No migration.
window.GAILS = window.GAILS || {};

(function () {
  'use strict';

  var G = window.GAILS;

  function mentions() {
    return G.Mentions;
  }

  function normalizeName(value) {
    return mentions()
      ? mentions().normalizeName(value)
      : String(value == null ? '' : value).toLowerCase().trim();
  }

  function person(entry, source) {
    return {
      uid: (entry && entry.uid) || '',
      name: (entry && entry.name) || '',
      email: (entry && entry.email) || '',
      source: source
    };
  }

  // Turns a bare reference (a printed name, a respondent email) into a directory
  // person where possible, and into a name-only credit where not — an auditor
  // who has never signed in should still be visibly credited.
  function fromReference(reference, source) {
    var value = String(reference == null ? '' : reference).trim();
    if (!value) return null;

    var resolvedUid = mentions() ? mentions().findPersonByUid(value) : null;
    if (resolvedUid) return person(resolvedUid, source);

    var resolved = mentions() ? mentions().resolvePerson(value) : null;
    if (resolved) return person(resolved, source);

    // An unresolvable email is not a name, so it is not worth crediting.
    if (value.indexOf('@') !== -1 && value.indexOf(' ') === -1) {
      return { uid: '', name: '', email: value.toLowerCase(), source: source };
    }
    return { uid: '', name: value, email: '', source: source };
  }

  function dedupe(list) {
    var seenUids = {};
    var seenEmails = {};
    var seenNames = {};
    return list.filter(function (entry) {
      if (!entry || (!entry.name && !entry.email && !entry.uid)) return false;
      var uid = String(entry.uid || '').trim();
      var email = String(entry.email || '').trim().toLowerCase();
      var name = normalizeName(entry.name);
      if ((uid && seenUids[uid]) || (email && seenEmails[email]) || (name && seenNames[name])) return false;
      if (uid) seenUids[uid] = true;
      if (email) seenEmails[email] = true;
      if (name) seenNames[name] = true;
      return true;
    });
  }

  function fromActor(uid, reference, name, source) {
    var cleanUid = String(uid == null ? '' : uid).trim();
    var known = cleanUid && mentions() ? mentions().findPersonByUid(cleanUid) : null;
    if (known) return person(known, source);

    var resolved = fromReference(reference || name || cleanUid, source);
    if (resolved && cleanUid && !resolved.uid) resolved.uid = cleanUid;
    return resolved;
  }

  function explicitAssignees(value) {
    var explicit = mentions() ? mentions().toAssigneeList(value) : [];
    return explicit.map(function (entry) { return person(entry, 'assigned'); });
  }

  function mentionedAssignees(value) {
    var mentioned = mentions() ? mentions().resolveAssignees(value) : [];
    return mentioned.map(function (entry) { return person(entry, 'assigned'); });
  }

  // The strongest available signal wins outright rather than blending: a visit
  // explicitly handed to two people is theirs, and the Coffee Partner printed on
  // the form should not dilute that with the admin who imported the PDF.
  function firstNonEmpty(tiers) {
    for (var i = 0; i < tiers.length; i++) {
      var resolved = dedupe(tiers[i]() || []);
      if (resolved.length) return resolved;
    }
    return [];
  }

  // Everyone a visit is credited to, strongest signal first:
  //   assigned   — an explicit @mention assignment
  //   auditor    — the name printed on an imported CQV / NBO report
  //   partner    — the Coffee Partner named on a routine visit
  //   respondent — the Google Form respondent's email
  //   logger     — whoever saved it in this app
  function forVisit(visit) {
    if (!visit) return [];
    var meta = visit.meta || {};
    var isAudited = visit.type === 'cqv' || visit.type === 'nbo';

    return firstNonEmpty([
      function () { return explicitAssignees(visit.assignedTo); },
      function () {
        // Belt and braces for a visit whose Coffee Partner names people but
        // whose assignedTo was never stamped (edited outside this app, say).
        // Audited PDFs use their printed auditor instead; a stray Coffee
        // Partner value must never override a CQV or NBO auditor.
        return isAudited ? [] : mentionedAssignees(visit.coffeePartner);
      },
      function () { return isAudited ? [fromReference(visit.auditorName, 'auditor')] : []; },
      function () {
        // Only for visit types where the Coffee Partner is a record of who did
        // the visit. On a check-in it is free text about who was on the bar.
        if (isAudited || visit.type === 'siteVisit') return [];
        var text = mentions() ? mentions().toText(visit.coffeePartner) : visit.coffeePartner;
        var parts = mentions() ? mentions().splitPeople(text) : [text];
        function resolvePartner(reference) {
          // When the people directory is available, an ambiguous or mistyped
          // partner must not block the reliable form respondent email below.
          var resolved = mentions() ? mentions().resolvePerson(reference) : null;
          if (resolved) return person(resolved, 'partner');
          return mentions() ? null : fromReference(reference, 'partner');
        }
        if (parts.length < 2) return [resolvePartner(text)];
        // A field naming two people is a pair who covered the visit together —
        // written longhand before "@" could assign it — so both are credited,
        // and neither dilutes the other into a single made-up person.
        return parts.map(resolvePartner);
      },
      function () { return [fromReference(visit.email, 'respondent')]; },
      function () {
        var uid = meta.createdByUid || visit.createdByUid;
        var known = uid && mentions() ? mentions().findPersonByUid(uid) : null;
        if (known) return [person(known, 'logger')];
        return [fromReference(meta.createdBy || visit.createdBy, 'logger')];
      }
    ]);
  }

  // A follow-up belongs to whoever it was assigned to, and otherwise to whoever
  // raised it. Legacy tasks linked to a visit but missing their own assignedTo
  // inherit the source visit at read time, so older actions are not lost.
  function taskRaiser(task) {
    if (!task) return [];
    var meta = task.meta || {};
    return dedupe([fromActor(
      task.createdByUid || meta.createdByUid,
      task.createdBy || meta.createdBy,
      task.createdByName || meta.createdByName,
      'raiser'
    )]);
  }

  function taskCompleter(task) {
    if (!task) return [];
    var meta = task.meta || {};
    return dedupe([fromActor(
      task.completedByUid || meta.completedByUid,
      task.completedBy || meta.completedBy,
      task.completedByName || meta.completedByName,
      'completer'
    )]);
  }

  function forTask(task, sourceVisit) {
    if (!task) return [];
    return firstNonEmpty([
      function () { return explicitAssignees(task.assignedTo); },
      function () { return sourceVisit ? forVisit(sourceVisit) : []; },
      function () { return taskRaiser(task); },
      function () { return taskCompleter(task); }
    ]);
  }

  // My Activity is an activity history rather than a workload queue. It should
  // therefore include everyone who owned, raised, or completed the action,
  // while the manager workload view can continue to use forTask's responsible
  // owner only.
  function actorsForTask(task, sourceVisit) {
    return dedupe(
      forTask(task, sourceVisit)
        .concat(taskRaiser(task))
        .concat(taskCompleter(task))
    );
  }

  function isExplicit(list) {
    return (list || []).some(function (entry) { return entry.source === 'assigned'; });
  }

  function matches(list, identity) {
    if (!identity) return false;
    return (list || []).some(function (entry) {
      if (entry.uid && identity.uid && entry.uid === identity.uid) return true;
      if (entry.email && identity.emails && identity.emails.has(entry.email.toLowerCase())) return true;
      var name = normalizeName(entry.name);
      return !!name && identity.names && identity.names.has(name);
    });
  }

  // "Jamie Smith", "Jamie Smith & Tristen Bayley", "Jamie Smith +2".
  function label(list) {
    var names = (list || []).map(function (entry) { return entry.name || entry.email; }).filter(Boolean);
    if (!names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' & ' + names[1];
    return names[0] + ' +' + (names.length - 1);
  }

  // Every name, for an exported cell where truncation would lose information.
  function namesText(list) {
    return (list || []).map(function (entry) { return entry.name || entry.email; })
      .filter(Boolean).join(', ');
  }

  G.Attribution = {
    forVisit: forVisit,
    forTask: forTask,
    actorsForTask: actorsForTask,
    taskRaiser: taskRaiser,
    taskCompleter: taskCompleter,
    fromReference: fromReference,
    isExplicit: isExplicit,
    matches: matches,
    label: label,
    namesText: namesText
  };
})();

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mentionsSource = fs.readFileSync(path.join(root, 'js', 'mentions.js'), 'utf8');
const attributionSource = fs.readFileSync(path.join(root, 'js', 'attribution.js'), 'utf8');
const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
const visitReport = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const authScript = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

// Both are classic scripts sharing window.GAILS, so they load together exactly
// as the pages load them.
function load(people) {
  const sandbox = { window: {}, console: { warn() {} } };
  vm.createContext(sandbox);
  vm.runInContext(mentionsSource, sandbox);
  vm.runInContext(attributionSource, sandbox);
  const G = sandbox.window.GAILS;
  if (people) G.Mentions.setPeople(people);
  return G;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const TEAM = [
  { uid: 'uid-jamie', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' },
  { uid: 'uid-tristen', name: 'Tristen Bayley', email: 'tristen@gailsbread.co.uk' },
  { uid: 'uid-ada', name: 'Ada Auditor', email: 'ada@gailsbread.co.uk' }
];

// Arrays built inside the vm realm are not reference-comparable with this
// realm's, so everything asserted on is flattened to plain data first.
function names(list) {
  return plain(list).map((entry) => entry.name);
}

test('a visit assigned to two people is credited to both', () => {
  const G = load(TEAM);

  const assignees = G.Mentions.resolveAssignees('@Jamie Smith + @Tristen Bayley');
  assert.deepEqual(plain(assignees), [
    { uid: 'uid-jamie', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' },
    { uid: 'uid-tristen', name: 'Tristen Bayley', email: 'tristen@gailsbread.co.uk' }
  ]);

  const credited = G.Attribution.forVisit({ type: 'siteVisit', assignedTo: assignees });
  assert.deepEqual(names(credited), ['Jamie Smith', 'Tristen Bayley']);
  assert.equal(G.Attribution.isExplicit(credited), true);
});

test('separators between mentions do not become part of a name', () => {
  const G = load(TEAM);

  ['@Jamie Smith + @Tristen Bayley', '@Jamie Smith @Tristen Bayley',
    '@Jamie Smith, @Tristen Bayley', '@Jamie Smith and @Tristen Bayley'].forEach((raw) => {
    assert.deepEqual(names(G.Mentions.resolveAssignees(raw)), ['Jamie Smith', 'Tristen Bayley'], raw);
  });

  // ...and the reading form keeps whatever was typed between them.
  assert.equal(G.Mentions.toText('@Jamie Smith + @Tristen Bayley'), 'Jamie Smith + Tristen Bayley');
});

test('the same person named twice is one assignee', () => {
  const G = load(TEAM);
  assert.equal(G.Mentions.resolveAssignees('@Jamie Smith and @Jamie Smith').length, 1);
});

test('an imported CQV is credited to its printed auditor, not the importer', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    type: 'cqv',
    auditorName: 'Ada Auditor',
    meta: { source: 'pdf-import', importedBy: 'admin@gailsbread.co.uk', createdBy: 'admin@gailsbread.co.uk' }
  });

  assert.deepEqual(names(credited), ['Ada Auditor']);
  assert.equal(credited[0].uid, 'uid-ada');
  assert.equal(credited[0].source, 'auditor');
  // Derived, not assigned — nobody handed this over by hand.
  assert.equal(G.Attribution.isExplicit(credited), false);
});

test('an NBO visit is credited to its auditor and ignores stray partner text', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    type: 'nbo',
    auditorName: 'Ada Auditor',
    coffeePartner: '@Jamie Smith',
    meta: { source: 'pdf-import', importedBy: 'tristen@gailsbread.co.uk' }
  });

  assert.deepEqual(names(credited), ['Ada Auditor']);
  assert.equal(credited[0].source, 'auditor');
});

test('an auditor who is not in the directory is still credited by name', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({ type: 'cqv', auditorName: 'Nina Newstarter' });
  assert.deepEqual(names(credited), ['Nina Newstarter']);
  assert.equal(credited[0].uid, '');
});

test('a routine visit from the form is credited to its Coffee Partner', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    coffeePartner: 'Jamie Smith',
    email: 'someone.else@gailsbread.co.uk',
    meta: { source: 'form', updatedBy: 'someone.else@gailsbread.co.uk' }
  });

  assert.deepEqual(names(credited), ['Jamie Smith']);
  assert.equal(credited[0].source, 'partner');
});

test('a pair named longhand credits both people, not one invented one', () => {
  // Jamie has never set a display name, so the directory carries the one derived
  // from their work address — exactly what the picker offers.
  const G = load([
    { uid: 'uid-jamie', name: 'Jamie Vu', email: 'jamie_vu@gailsbread.co.uk' },
    { uid: 'uid-lauryn', name: 'Lauryn Brown', email: 'lauryn_brown@gailsbread.co.uk' },
    { uid: 'uid-tristen', name: 'Tristen Bayley', email: 'tristen_bayley@gailsbread.co.uk' }
  ]);

  ['Jamie + Tristen', 'Tristen + Jamie', 'Jamie and Tristen'].forEach((partner) => {
    const credited = G.Attribution.forVisit({ coffeePartner: partner, email: 'form@gailsbread.co.uk' });
    assert.deepEqual(names(credited).sort(), ['Jamie Vu', 'Tristen Bayley'], partner);
  });

  const withLauryn = G.Attribution.forVisit({ coffeePartner: 'Lauryn + Tristen' });
  assert.deepEqual(names(withLauryn).sort(), ['Lauryn Brown', 'Tristen Bayley']);

  // Both hubs find it, by uid and by the email of someone with no name set.
  const pair = G.Attribution.forVisit({ coffeePartner: 'Jamie + Tristen' });
  assert.equal(G.Attribution.matches(pair, { uid: 'uid-tristen', emails: new Set(), names: new Set() }), true);
  assert.equal(G.Attribution.matches(pair, {
    uid: '', emails: new Set(['jamie_vu@gailsbread.co.uk']), names: new Set()
  }), true);
  // ...and a pair that never names you is not yours, however it was logged.
  const others = G.Attribution.forVisit({
    coffeePartner: 'Jamie + Lauryn',
    email: 'tristen_bayley@gailsbread.co.uk',
    meta: { createdByUid: 'uid-tristen' }
  });
  assert.equal(G.Attribution.matches(others, { uid: 'uid-tristen', emails: new Set(), names: new Set() }), false);
});

test('a form visit with no Coffee Partner falls back to the respondent', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    coffeePartner: '',
    email: 'Tristen@gailsbread.co.uk',
    meta: { source: 'form' }
  });

  assert.deepEqual(names(credited), ['Tristen Bayley']);
  assert.equal(credited[0].source, 'respondent');
});

test('an ambiguous routine-visit partner does not block the respondent', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    coffeePartner: 'Unknown',
    email: 'tristen@gailsbread.co.uk',
    meta: { source: 'form' }
  });

  assert.deepEqual(names(credited), ['Tristen Bayley']);
  assert.equal(credited[0].source, 'respondent');
});

test('a check-in Coffee Partner defaults to the poster', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    type: 'siteVisit',
    coffeePartner: '',
    meta: { createdBy: 'tristen@gailsbread.co.uk', createdByUid: 'uid-tristen' }
  });

  assert.deepEqual(names(credited), ['Tristen Bayley']);
  assert.equal(credited[0].source, 'logger');
});

test('selected Coffee Partners replace the poster on a check-in', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    type: 'siteVisit',
    coffeePartner: '@Jamie Smith + @Ada Auditor',
    meta: { createdBy: 'tristen@gailsbread.co.uk', createdByUid: 'uid-tristen' }
  });

  assert.deepEqual(names(credited), ['Jamie Smith', 'Ada Auditor']);
  assert.equal(credited.every((entry) => entry.source === 'assigned'), true);
});

test('legacy check-in partner text does not steal attribution from the poster', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    type: 'siteVisit',
    coffeePartner: 'Jamie Smith',
    meta: { createdBy: 'tristen@gailsbread.co.uk', createdByUid: 'uid-tristen' }
  });

  assert.deepEqual(names(credited), ['Tristen Bayley']);
});

test('an explicit assignment outranks every derived signal', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({
    type: 'cqv',
    auditorName: 'Ada Auditor',
    coffeePartner: '@Jamie Smith',
    email: 'tristen@gailsbread.co.uk',
    assignedTo: [{ uid: 'uid-jamie', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }]
  });

  assert.deepEqual(names(credited), ['Jamie Smith']);
  assert.equal(G.Attribution.isExplicit(credited), true);
});

test('a mention in the Coffee Partner counts even when assignedTo was never stamped', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forVisit({ coffeePartner: '@Tristen Bayley', email: 'ada@gailsbread.co.uk' });
  assert.deepEqual(names(credited), ['Tristen Bayley']);
  assert.equal(G.Attribution.isExplicit(credited), true);
});

test('a single stored assignee still reads as a list', () => {
  const G = load(TEAM);

  // Written before a visit could be assigned to more than one person.
  const credited = G.Attribution.forVisit({
    type: 'siteVisit',
    assignedTo: { uid: 'uid-jamie', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }
  });
  assert.deepEqual(names(credited), ['Jamie Smith']);
});

test('a visit with nothing to go on is credited to nobody', () => {
  const G = load(TEAM);
  assert.deepEqual(plain(G.Attribution.forVisit({ type: 'siteVisit', bakery: 'Balham' })), []);
  assert.deepEqual(plain(G.Attribution.forVisit(null)), []);
});

test('a follow-up raised on a handed-over visit belongs to the assignee', () => {
  const G = load(TEAM);

  const credited = G.Attribution.forTask({
    title: 'Re-train on latte art',
    createdBy: 'tristen@gailsbread.co.uk',
    assignedTo: [{ uid: 'uid-jamie', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }]
  });
  assert.deepEqual(names(credited), ['Jamie Smith']);
  assert.equal(G.Attribution.isExplicit(credited), true);

  // A standalone task belongs to whoever raised it.
  const raised = G.Attribution.forTask({ createdBy: 'tristen@gailsbread.co.uk' });
  assert.deepEqual(names(raised), ['Tristen Bayley']);
  assert.equal(raised[0].source, 'raiser');
});

test('a legacy follow-up inherits attribution from its source visit', () => {
  const G = load(TEAM);
  const sourceVisit = {
    type: 'cqv',
    auditorName: 'Ada Auditor'
  };
  const credited = G.Attribution.forTask({
    sourceVisitId: 'visit-1',
    createdBy: 'tristen@gailsbread.co.uk'
  }, sourceVisit);

  assert.deepEqual(names(credited), ['Ada Auditor']);
  assert.equal(credited[0].source, 'auditor');
});

test('task activity includes its owner, raiser and completer without duplicates', () => {
  const G = load(TEAM);
  const task = {
    assignedTo: [{ uid: 'uid-jamie', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }],
    createdByUid: 'uid-tristen',
    completedBy: 'jamie@gailsbread.co.uk'
  };

  const actors = G.Attribution.actorsForTask(task);
  assert.deepEqual(names(actors), ['Jamie Smith', 'Tristen Bayley']);
  assert.deepEqual(names(G.Attribution.taskRaiser(task)), ['Tristen Bayley']);
  assert.deepEqual(names(G.Attribution.taskCompleter(task)), ['Jamie Smith']);
});

test('attribution matches a person by uid, email, or name', () => {
  const G = load(TEAM);
  const credited = G.Attribution.forVisit({ type: 'cqv', auditorName: 'Ada Auditor' });

  assert.equal(G.Attribution.matches(credited, { uid: 'uid-ada', emails: new Set(), names: new Set() }), true);
  assert.equal(G.Attribution.matches(credited, {
    uid: '', emails: new Set(['ada@gailsbread.co.uk']), names: new Set()
  }), true);
  assert.equal(G.Attribution.matches(credited, {
    uid: '', emails: new Set(), names: new Set(['ada auditor'])
  }), true);
  assert.equal(G.Attribution.matches(credited, {
    uid: 'uid-other', emails: new Set(['other@x.co']), names: new Set(['other person'])
  }), false);
});

test('a shared visit is labelled for both people without losing either', () => {
  const G = load(TEAM);
  const two = G.Mentions.resolveAssignees('@Jamie Smith @Tristen Bayley');

  assert.equal(G.Attribution.label(two), 'Jamie Smith & Tristen Bayley');
  assert.equal(G.Attribution.namesText(two), 'Jamie Smith, Tristen Bayley');
  // A crowd is summarised on screen but never truncated in an export.
  const three = two.concat([{ uid: 'uid-ada', name: 'Ada Auditor', email: '' }]);
  assert.equal(G.Attribution.label(three), 'Jamie Smith, Tristen Bayley & Ada Auditor');
  assert.equal(G.Attribution.namesText(three), 'Jamie Smith, Tristen Bayley, Ada Auditor');
});

test('attribution is derived at read time, so nothing needs migrating', () => {
  // No write path in js/attribution.js at all.
  assert.doesNotMatch(attributionSource, /\bset\(|\bupdate\(|\bremove\(/);
});

test('the PDF import stamps the auditor and records the importer separately', () => {
  assert.match(adminScript, /var auditor = window\.GAILS\.Mentions\s*\n?\s*\? window\.GAILS\.Mentions\.resolvePerson\(pending\.record\.auditorName\)/);
  assert.match(adminScript, /var attributedPartners = selectedPartners\.length/);
  assert.match(adminScript, /assignedTo: attributedPartners\.length \? attributedPartners : null/);
  assert.match(adminScript, /importedBy: currentUserEmail\(\)/);
  // Recovering a missing auditor name is also the moment to credit the report.
  assert.match(adminScript, /if \(backfilledAuditor && !visit\.assignedTo\) backfillPatch\.assignedTo = \[backfilledAuditor\]/);
  // Editing an audited report uses the explicit Coffee Partner picker, while
  // retaining the PDF auditor as the automatic fallback.
  assert.match(adminScript, /existing\.type === 'cqv' \|\| existing\.type === 'nbo'/);
  assert.match(adminScript, /collected\.general\.coffeePartnerAttribution/);
  assert.match(adminScript, /editable\.coffeePartnerAttribution = auditedAssignees\.length/);
});

test('follow-ups raised during a check-in inherit that visit\'s assignees', () => {
  assert.match(visitReport, /sourceVisitId: newVisitId \|\| null,[\s\S]{0,220}assignedTo: assignees\.length \? assignees : null/);
  assert.match(authScript, /assignedTo: defaultAssignee,\s*\n\s*completedAt: null/);
  assert.match(authScript, /createdByUid: whoUid/);
  assert.match(authScript, /completedByUid: done \? whoUid : null/);
});

test('standalone follow-ups default attribution to their creator and can be reassigned', () => {
  assert.match(authScript, /var defaultAssignee = whoName \? \[\{/);
  assert.match(authScript, /uid: whoUid,\s*\n\s*name: whoName,\s*\n\s*email: auth\.currentUser\.email/);
  assert.match(visitReport, /return window\.GAILS\.currentPerson \? \[window\.GAILS\.currentPerson\] : \[\]/);
  assert.match(visitReport, /MentionField\.assigneesFor\(assigneeField\)/);
  assert.match(visitReport, /assignedTo: followUpAssignees\.length \? followUpAssignees : null/);
  assert.match(visitReport, /class="follow-up-item__assignee"><strong>Assigned to:<\/strong>/);
  assert.match(visitReport, /\{ label: 'Assigned To', type: 'text', width: 24 \}/);
});

test('a check-in saves every selected assignee', () => {
  assert.match(visitReport, /assigneesFor\(partnerField\)/);
  assert.match(visitReport, /assignedTo: assignees\.length \? assignees : null/);
  assert.match(visitReport, /Mentions\.formatPeople\(assignees\)/);
});

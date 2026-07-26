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

test('a check-in Coffee Partner is free text, not an attribution', () => {
  const G = load(TEAM);

  // On a check-in this field records who was on the bar, so it must not credit
  // the visit away from whoever logged it.
  const credited = G.Attribution.forVisit({
    type: 'siteVisit',
    coffeePartner: 'Jamie Smith',
    meta: { createdBy: 'tristen@gailsbread.co.uk', createdByUid: 'uid-tristen' }
  });

  assert.deepEqual(names(credited), ['Tristen Bayley']);
  assert.equal(credited[0].source, 'logger');
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
  assert.equal(G.Attribution.label(three), 'Jamie Smith +2');
  assert.equal(G.Attribution.namesText(three), 'Jamie Smith, Tristen Bayley, Ada Auditor');
});

test('attribution is derived at read time, so nothing needs migrating', () => {
  // No write path in js/attribution.js at all.
  assert.doesNotMatch(attributionSource, /\bset\(|\bupdate\(|\bremove\(/);
});

test('the PDF import stamps the auditor and records the importer separately', () => {
  assert.match(adminScript, /var auditor = window\.GAILS\.Mentions\s*\n?\s*\? window\.GAILS\.Mentions\.resolvePerson\(pending\.record\.auditorName\)/);
  assert.match(adminScript, /assignedTo: auditor \? \[auditor\] : null/);
  assert.match(adminScript, /importedBy: currentUserEmail\(\)/);
  // Recovering a missing auditor name is also the moment to credit the report.
  assert.match(adminScript, /if \(backfilledAuditor && !visit\.assignedTo\) backfillPatch\.assignedTo = \[backfilledAuditor\]/);
});

test('follow-ups raised during a check-in inherit that visit\'s assignees', () => {
  assert.match(visitReport, /sourceVisitId: newVisitId \|\| null,[\s\S]{0,220}assignedTo: assignees\.length \? assignees : null/);
  assert.match(authScript, /assignedTo: null,\s*\n\s*completedAt: null/);
});

test('a check-in saves every mentioned assignee', () => {
  assert.match(visitReport, /assigneesFor\(partnerField\)/);
  assert.match(visitReport, /assignedTo: assignees\.length \? assignees : null/);
  // Trailing whitespace from the picker never reaches the stored value.
  assert.match(visitReport, /coffeePartner: \(partnerField\.value \|\| ''\)\.trim\(\)/);
});

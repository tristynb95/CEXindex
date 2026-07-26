const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const mentionsSource = fs.readFileSync(path.join(root, 'js', 'mentions.js'), 'utf8');
const fieldSource = fs.readFileSync(path.join(root, 'js', 'mention-field.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const visitReport = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
const bakeryProfile = fs.readFileSync(path.join(root, 'js', 'bakery-profile.js'), 'utf8');
const myActivity = fs.readFileSync(path.join(root, 'js', 'my-activity.js'), 'utf8');
const authScript = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

// js/mentions.js is a classic script that self-registers on window.GAILS, so it
// runs whole rather than being picked apart function by function.
function load(people) {
  const sandbox = { window: {}, console: { warn() {} } };
  vm.createContext(sandbox);
  vm.runInContext(mentionsSource, sandbox);
  const mentions = sandbox.window.GAILS.Mentions;
  if (people) mentions.setPeople(people);
  return mentions;
}

// Objects built inside the vm realm have a different prototype, so
// deepStrictEqual would reject them on identity alone. Comparing the plain data
// is what the assertions are actually about.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

const TEAM = [
  { uid: 'uid-sam', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' },
  { uid: 'uid-jo', name: 'Jo Bloggs', email: 'jo@gailsbread.co.uk' },
  { uid: 'uid-joanne', name: 'Joanne Fielding', email: 'joanne@gailsbread.co.uk' }
];

function loadMentionField(people) {
  let document;

  class FakeClassList {
    constructor(owner) { this.owner = owner; }
    tokens() { return new Set(String(this.owner.className || '').split(/\s+/).filter(Boolean)); }
    write(tokens) { this.owner.className = Array.from(tokens).join(' '); }
    add(name) {
      const tokens = this.tokens();
      tokens.add(name);
      this.write(tokens);
    }
    contains(name) { return this.tokens().has(name); }
    toggle(name, force) {
      const tokens = this.tokens();
      const enabled = force == null ? !tokens.has(name) : !!force;
      if (enabled) tokens.add(name);
      else tokens.delete(name);
      this.write(tokens);
      return enabled;
    }
  }

  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.classList = new FakeClassList(this);
      this.hidden = false;
      this.innerHTML = '';
      this.value = '';
      this.placeholder = '';
      this.id = '';
      this.selectionStart = 0;
      this.selectionEnd = 0;
      this.tabIndex = 0;
    }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] || null; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(type, listener) {
      (this.listeners[type] = this.listeners[type] || []).push(listener);
    }
    dispatchEvent(event) {
      if (!event.target) event.target = this;
      (this.listeners[event.type] || []).forEach((listener) => listener(event));
      return !event.defaultPrevented;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    insertBefore(child, reference) {
      child.parentNode = this;
      const index = this.children.indexOf(reference);
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    }
    contains(node) {
      return node === this || this.children.some((child) => child.contains && child.contains(node));
    }
    focus() {
      document.activeElement = this;
      this.dispatchEvent(new FakeEvent('focus'));
    }
    blur() {
      document.activeElement = null;
      this.dispatchEvent(new FakeEvent('blur'));
    }
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    }
  }

  class FakeEvent {
    constructor(type, options) {
      this.type = type;
      this.bubbles = !!(options && options.bubbles);
      this.defaultPrevented = false;
      this.propagationStopped = false;
      this.target = null;
      this.key = options && options.key;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
  }

  document = {
    activeElement: null,
    createElement(tagName) { return new FakeElement(tagName); },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };

  const sandbox = {
    window: {},
    document,
    Event: FakeEvent,
    setTimeout,
    console: { warn() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(mentionsSource, sandbox);
  vm.runInContext(fieldSource, sandbox);
  sandbox.window.GAILS.Mentions.setPeople(people);

  const parent = new FakeElement('div');
  const input = new FakeElement('input');
  input.id = 'partner';
  parent.appendChild(input);
  const api = sandbox.window.GAILS.MentionField.enhance(input);
  return { api, input, menu: api.wrapper.children[2], FakeEvent, document };
}

test('the stored @ never reaches the reading form', () => {
  const mentions = load(TEAM);

  assert.equal(mentions.toText('@Sam Partner'), 'Sam Partner');
  assert.equal(mentions.toText('Sam Partner'), 'Sam Partner');
  assert.equal(mentions.toText(''), '');
  assert.equal(mentions.toText('Covered by @Jo Bloggs today'), 'Covered by Jo Bloggs today');
});

test('mentions are plain black when read and highlighted only in editable fields', () => {
  const mentions = load(TEAM);

  assert.equal(
    mentions.toHtml('@Sam Partner'),
    '<span class="mention" title="sam@gailsbread.co.uk">Sam Partner</span>'
  );
  // A name typed without the "@" is just a label, and stays unstyled.
  assert.equal(mentions.toHtml('Sam Partner'), 'Sam Partner');
  assert.match(mentions.toHtml('Covered by @Jo Bloggs'), /^Covered by <span class="mention"/);

  const readOnlyRule = styles.slice(
    styles.indexOf('.mention {'),
    styles.indexOf('.mention-field__display .mention {')
  );
  assert.match(readOnlyRule, /color: var\(--text\);/);
  assert.match(readOnlyRule, /font-weight: inherit;/);
  assert.match(readOnlyRule, /text-decoration: none;/);
  assert.doesNotMatch(readOnlyRule, /var\(--blue\)|underline/);

  const editableRule = styles.slice(
    styles.indexOf('.mention-field__display .mention {'),
    styles.indexOf('/* The two faces of an editable mention field')
  );
  assert.match(editableRule, /color: var\(--blue\);/);
  assert.match(editableRule, /text-decoration: underline;/);
});

test('rendered mention text is escaped', () => {
  const mentions = load([{ uid: 'x', name: 'Sam <script>', email: '' }]);
  assert.doesNotMatch(mentions.toHtml('@Sam <script> hi'), /<script>/);
  assert.match(mentions.toHtml('a & b'), /a &amp; b/);
});

test('a mention stops at the end of the name, not the end of the sentence', () => {
  const mentions = load(TEAM);

  const segments = mentions.parse('@Sam Partner and the team');
  assert.equal(segments.length, 2);
  assert.deepEqual(plain(segments[0]), { type: 'mention', text: 'Sam Partner', person: TEAM[0] });
  assert.equal(segments[1].text, ' and the team');
});

test('a longer directory name wins over a shorter one it starts with', () => {
  const mentions = load(TEAM);

  assert.equal(mentions.parse('@Joanne Fielding')[0].text, 'Joanne Fielding');
  assert.equal(mentions.parse('@Jo Bloggs')[0].text, 'Jo Bloggs');
});

test('someone absent from the directory can still be mentioned', () => {
  const mentions = load(TEAM);

  const segments = mentions.parse('@Nina Newstarter');
  assert.equal(segments[0].type, 'mention');
  assert.equal(segments[0].text, 'Nina Newstarter');
  assert.equal(segments[0].person, null);
  // Two words is the ceiling for an unknown name.
  assert.equal(mentions.parse('@Nina Newstarter covered it')[1].text, ' covered it');
});

test('a bare @ and an email address are not mentions', () => {
  const mentions = load(TEAM);

  assert.deepEqual(plain(mentions.parse('@')), [{ type: 'text', text: '@' }]);
  assert.equal(mentions.hasMention('email sam@gailsbread.co.uk'), true);
  // ...but the picker must not open inside one.
  assert.equal(mentions.activeMentionAt('sam@gails', 9), null);
  assert.notEqual(mentions.activeMentionAt('ask @gails', 10), null);
});

test('the assignee comes from the mention, never from a plain name', () => {
  const mentions = load(TEAM);

  assert.deepEqual(plain(mentions.resolveAssignees('@Sam Partner')), [{
    uid: 'uid-sam', name: 'Sam Partner', email: 'sam@gailsbread.co.uk'
  }]);
  // Every visit logged before mentions existed stays unassigned.
  assert.deepEqual(plain(mentions.resolveAssignees('Sam Partner')), []);
  assert.deepEqual(plain(mentions.resolveAssignees('')), []);
  // An unknown name still assigns, just without an identity to hang it on.
  assert.deepEqual(plain(mentions.resolveAssignees('@Nina Newstarter')), [{
    uid: '', name: 'Nina Newstarter', email: ''
  }]);
});

test('a Coffee Partner can name more than one person', () => {
  const mentions = load(TEAM);

  const both = mentions.resolveAssignees('@Sam Partner + @Jo Bloggs');
  assert.deepEqual(plain(both).map((p) => p.name), ['Sam Partner', 'Jo Bloggs']);
  // The reading form keeps the separator the author typed.
  assert.equal(mentions.toText('@Sam Partner + @Jo Bloggs'), 'Sam Partner + Jo Bloggs');
  // Both names are styled, the separator is not.
  const html = mentions.toHtml('@Sam Partner + @Jo Bloggs');
  assert.equal((html.match(/class="mention"/g) || []).length, 2);
  assert.match(html, /<\/span> \+ <span/);
});

test('plain selected names resolve only when they exactly match the directory', () => {
  const mentions = load(TEAM);

  for (const raw of [
    'Sam Partner, Jo Bloggs',
    'Sam Partner + Jo Bloggs',
    'Sam Partner & Jo Bloggs'
  ]) {
    assert.deepEqual(
      plain(mentions.resolveSelections(raw).map((person) => person.name)),
      ['Sam Partner', 'Jo Bloggs'],
      raw
    );
  }

  assert.deepEqual(plain(mentions.resolveSelections('Sam')), []);
  assert.deepEqual(plain(mentions.resolveSelections('Someone Else')), []);
  assert.deepEqual(
    plain(mentions.resolveSelections('@Sam Partner + Jo Bloggs').map((person) => person.name)),
    ['Sam Partner', 'Jo Bloggs']
  );
  assert.deepEqual(plain(mentions.resolveAssignees('Sam Partner')), []);
});

test('the picker tracks the @ the caret is sitting in', () => {
  const mentions = load(TEAM);

  assert.deepEqual(plain(mentions.activeMentionAt('@Sa', 3)), { start: 0, end: 3, query: 'Sa' });
  assert.deepEqual(plain(mentions.activeMentionAt('Covered by @Jo', 14)), { start: 11, end: 14, query: 'Jo' });
  // The caret has moved back before the "@".
  assert.equal(mentions.activeMentionAt('@Sam Partner', 0), null);
  // Too long to still be a name.
  assert.equal(mentions.activeMentionAt('@one two three four', 19), null);
});

test('choosing a name replaces just the query and reports the caret', () => {
  const mentions = load(TEAM);

  const range = mentions.activeMentionAt('Covered by @Sa', 14);
  const applied = mentions.applyMention('Covered by @Sa', range, 'Sam Partner');
  assert.equal(applied.value, 'Covered by @Sam Partner');
  assert.equal(applied.caret, applied.value.length);
});

test('the simplified picker searches from typing and after each separator', () => {
  const mentions = load(TEAM);

  assert.deepEqual(
    plain(mentions.activeSelectionAt('Sa', 2)),
    { start: 0, end: 2, query: 'Sa' }
  );
  assert.deepEqual(
    plain(mentions.activeSelectionAt('Sam Partner, Jo', 15)),
    { start: 13, end: 15, query: 'Jo' }
  );
  assert.deepEqual(
    plain(mentions.activeSelectionAt('Sam Partner + Jo', 16)),
    { start: 14, end: 16, query: 'Jo' }
  );
  assert.deepEqual(
    plain(mentions.activeSelectionAt('Sam Partner & Jo', 16)),
    { start: 14, end: 16, query: 'Jo' }
  );
  assert.equal(mentions.activeSelectionAt('Sam Partner, ', 13), null);

  const applied = mentions.applySelection('Sam Partner, Jo', { start: 13, end: 15 }, 'Jo Bloggs');
  assert.deepEqual(plain(applied), { value: 'Sam Partner, Jo Bloggs', caret: 22 });
});

test('the editable display highlights plain selected names', () => {
  const mentions = load(TEAM);
  const html = mentions.selectionsToHtml('Sam Partner + Jo Bloggs');

  assert.equal((html.match(/class="mention"/g) || []).length, 2);
  assert.match(html, /Sam Partner<\/span> &amp; <span/);
  assert.doesNotMatch(html, />@/);

  assert.equal(
    mentions.formatPeople(TEAM),
    'Sam Partner, Jo Bloggs & Joanne Fielding'
  );
  assert.equal(
    mentions.formatSelectionText('Sam Partner + Jo Bloggs + Joanne Fielding'),
    'Sam Partner, Jo Bloggs & Joanne Fielding'
  );
  assert.equal(
    mentions.formatSelectionText('@Sam Partner @Jo Bloggs'),
    'Sam Partner & Jo Bloggs'
  );
});

test('search ranks a prefix match above a mid-name one', () => {
  const mentions = load(TEAM.concat([{ uid: 'uid-p', name: 'Ada Partnership', email: '' }]));

  const results = mentions.search('partner').map((person) => person.name);
  assert.equal(results[0], 'Sam Partner');
  assert.ok(results.includes('Ada Partnership'));
  // An empty query offers the whole team.
  assert.equal(mentions.search('').length, 4);
});

test('a directory entry outranks a name harvested from old data', () => {
  const mentions = load();

  mentions.addHarvested({ visits: { v1: { coffeePartner: 'Sam Partner' } } });
  assert.deepEqual(plain(mentions.findPerson('Sam Partner')), { uid: '', name: 'Sam Partner', email: '' });

  mentions.addPeople([{ uid: 'uid-sam', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' }]);
  assert.equal(mentions.findPerson('Sam Partner').uid, 'uid-sam');

  // ...and a later harvest must not blank the identity back out.
  mentions.addHarvested({ visits: { v2: { coffeePartner: 'Sam Partner' } } });
  assert.equal(mentions.findPerson('Sam Partner').uid, 'uid-sam');
  assert.equal(mentions.findPerson('Sam Partner').email, 'sam@gailsbread.co.uk');
});

test('harvesting keeps one-word names out of the picker', () => {
  const mentions = load();

  mentions.addHarvested({
    regionAssignments: [{ coffeePartner: 'Sam Partner', coffeeTrainer: 'Jo' }],
    visits: { v1: { coffeePartner: '@Ida Trainer', auditorName: 'Ada Auditor' } },
    notes: [{ createdBy: { uid: 'uid-n', name: 'Nina Notewriter', email: 'nina@gailsbread.co.uk' } }]
  });

  const names = mentions.getPeople().map((person) => person.name);
  assert.deepEqual(plain(names), ['Ada Auditor', 'Ida Trainer', 'Nina Notewriter', 'Sam Partner']);
  assert.ok(!names.includes('Jo'), 'a bare first name would assign visits to the wrong person');
  // The harvested Coffee Partner was itself a mention, so its "@" is stripped.
  assert.ok(!names.some((name) => name.startsWith('@')));
});

test('a pair written longhand never becomes a suggestion of its own', () => {
  const mentions = load();

  // How every visit logged before @mentions named a pair who went together.
  mentions.addHarvested({
    visits: {
      v1: { coffeePartner: 'Jamie + Tristen' },
      v2: { coffeePartner: 'Tristen + Jamie' },
      v3: { coffeePartner: 'Jamie and Tristen' },
      v4: { coffeePartner: 'Lauryn + Tristen' }
    }
  });

  // Each pair splits into two one-word names, which the picker already excludes.
  assert.deepEqual(plain(mentions.getPeople().map((person) => person.name)), []);

  // A real two-word name still survives the split untouched.
  mentions.addHarvested({ visits: { v5: { coffeePartner: 'Sam Partner & Ida Trainer' } } });
  assert.deepEqual(plain(mentions.getPeople().map((person) => person.name)),
    ['Ida Trainer', 'Sam Partner']);
});

test('splitting a pair leaves ordinary names whole', () => {
  const mentions = load();

  assert.deepEqual(plain(mentions.splitPeople('Jamie + Tristen')), ['Jamie', 'Tristen']);
  assert.deepEqual(plain(mentions.splitPeople('Jamie and Tristen')), ['Jamie', 'Tristen']);
  assert.deepEqual(plain(mentions.splitPeople('Sam Partner, Ida Trainer')), ['Sam Partner', 'Ida Trainer']);
  assert.deepEqual(plain(mentions.splitPeople('Sam Partner')), ['Sam Partner']);
  // "and" inside a name is not a joiner.
  assert.deepEqual(plain(mentions.splitPeople('Alexander Sandringham')), ['Alexander Sandringham']);
  assert.deepEqual(plain(mentions.splitPeople('')), []);
});

test('a colleague who has not set a name is still reachable by their work address', () => {
  const mentions = load();

  assert.equal(mentions.nameFromEmail('jamie_vu@gailsbread.co.uk'), 'Jamie Vu');
  assert.equal(mentions.nameFromEmail('lauryn_brown@gailsbread.co.uk'), 'Lauryn Brown');
  // Guessing where an unseparated local part divides would invent a name.
  assert.equal(mentions.nameFromEmail('tristendbayley@gmail.com'), '');
  assert.equal(mentions.nameFromEmail(''), '');
});

test('a lone first name resolves only when one person answers to it', () => {
  const mentions = load();
  mentions.setPeople([
    { uid: 'uid-jamie', name: 'Jamie Vu', email: 'jamie_vu@gailsbread.co.uk' },
    { uid: 'uid-tristen', name: 'Tristen Bayley', email: 'tristen_bayley@gailsbread.co.uk' }
  ]);

  assert.equal(mentions.resolvePerson('Jamie').email, 'jamie_vu@gailsbread.co.uk');
  assert.equal(mentions.resolvePerson('Tristen').uid, 'uid-tristen');

  // A name harvested from an old record cannot outrank a real account...
  mentions.addHarvested({ visits: { v1: { coffeePartner: 'Jamie Robinson' } } });
  assert.equal(mentions.resolvePerson('Jamie').uid, 'uid-jamie');

  // ...but two real accounts sharing a first name resolve to neither.
  mentions.addPeople([{ uid: 'uid-jt', name: 'Jamie Turner', email: 'jamie_turner@gailsbread.co.uk' }]);
  assert.equal(mentions.resolvePerson('Jamie'), null);
});

test('the Coffee Partner field is the assignment control on both editors', () => {
  // Dashboard check-in modal.
  const partnerField = indexHtml.slice(indexHtml.indexOf('id="addVisitPartner"'));
  assert.match(partnerField.slice(0, 300), /data-mention-field/);
  assert.match(partnerField.slice(0, 300), /placeholder="Start typing a name"/);
  assert.match(partnerField.slice(0, 400), /press <strong>Space<\/strong> to add another/);
  assert.match(partnerField.slice(0, 400), /<strong>Backspace<\/strong> removes the last person/);

  // Admin visit detail form.
  assert.match(adminScript, /field\.key === 'coffeePartner'/);
  assert.match(adminScript, /press <strong>Space<\/strong> to add another/);
  assert.match(adminScript, /window\.GAILS\.MentionField\.enhanceAll\(visitDetailBody\)/);

  [indexHtml, adminHtml].forEach((page) => {
    assert.match(page, /<script src="js\/mentions\.js"><\/script>/);
    assert.match(page, /<script src="js\/mention-field\.js"><\/script>/);
  });
});

test('the follow-up modal uses the same multi-person attribution field', () => {
  const field = indexHtml.slice(indexHtml.indexOf('id="followUpAssignees"'));
  assert.match(field.slice(0, 350), /data-mention-field/);
  assert.match(field.slice(0, 350), /press <strong>Space<\/strong>/i);
  assert.match(field.slice(0, 350), /<strong>Backspace<\/strong>/);
  assert.match(visitReport, /followUpResponsiblePeople\(editTask\)/);
  assert.match(visitReport, /MentionField\.enhance\(assigneeInput\)/);
  assert.match(visitReport, /MentionField\.refresh\(assigneeInput\)/);
});

test('follow-up cards show their assignees and can be filtered by assigned person', () => {
  assert.match(indexHtml, /id="followUpAssigneeControl"[\s\S]{0,260}<label for="followUpAssignee">Assigned To<\/label>/);
  assert.match(indexHtml, /id="followUpAssignee"[\s\S]{0,160}<option value="">All<\/option>/);
  assert.match(visitReport, /getFollowUpList\(\)\.forEach\(function \(task\)[\s\S]{0,240}followUpResponsiblePeople\(task\)/);
  assert.match(visitReport, /if \(!followUpTaskMatchesAssignee\(t, followUpAssigneeVal\)\) return false/);
  assert.match(visitReport, /followUpAssignee:\s*followUpAssigneeVal/);
  assert.match(visitReport, /class="follow-up-item__assignee"><strong>Assigned to:<\/strong>/);
  assert.match(styles, /\.follow-up-item__assignee\s*\{/);
});

test('a new check-in prefills the signed-in person as an editable selection', () => {
  assert.match(authScript, /window\.GAILS\.currentPerson = \{\s*uid: user\.uid,\s*name: currentPersonName,/);
  assert.match(authScript, /Mentions\.addPeople\(\[window\.GAILS\.currentPerson\]\)/);
  assert.match(visitReport, /var currentPerson = window\.GAILS\.currentPerson;/);
  assert.match(visitReport, /partnerInput\.value = currentPerson && currentPerson\.name \? currentPerson\.name : '';/);

  const resetIndex = visitReport.indexOf('if (form) form.reset();');
  const prefillIndex = visitReport.indexOf('partnerInput.value = currentPerson');
  const refreshIndex = visitReport.indexOf('window.GAILS.MentionField.refresh(partnerInput);');
  assert.ok(resetIndex < prefillIndex && prefillIndex < refreshIndex);
});

test('the Visits edit modal hydrates the same picker from stored attribution', () => {
  assert.match(adminScript, /function visitForAttributionEdit\(visit\)/);
  assert.match(adminScript, /M\.toAssigneeList\(visit\.assignedTo\)/);
  assert.match(adminScript, /editable\.coffeePartner = M\.formatPeople\(assigned\)/);
  assert.match(adminScript, /buildVisitDetailHtml\(visitForAttributionEdit\(visit\)\)/);
  assert.match(adminScript, /MentionField\.enhanceAll\(visitDetailBody\)/);

  // Saving an untouched edit cannot clear stable assignees if the directory is
  // temporarily unavailable; deleting the visible text still clears them.
  assert.match(adminScript, /storedAssignees\.length[\s\S]{0,180}formatPeople\(storedAssignees\)/);
  assert.match(adminScript, /editedAssignees = storedAssignees;/);
});

test('the editor swaps faces rather than restyling one input', () => {
  assert.match(fieldSource, /wrapper\.classList\.toggle\('is-editing', editing\)/);
  // At rest the display face is shown; editing swaps in the real input.
  const displayRule = styles.slice(styles.indexOf('.mention-field.is-editing .mention-field__display'));
  assert.match(displayRule.slice(0, 120), /display: none;/);
  assert.match(styles, /\.mention-field \.mention-field__input \{\s*display: none;/);
});

test('the assignment is resolved at save, so deleting selected names un-assigns', () => {
  assert.match(visitReport, /assignedTo: assignees\.length \? assignees : null/);
  assert.match(adminScript, /var attributionText = isAudited[\s\S]{0,180}collected\.general\.coffeePartner;/);
  assert.match(adminScript, /resolveEditedAssignees\(attributionText\)/);
  assert.match(adminScript, /payload\.assignedTo = editedAssignees\.length \? editedAssignees : null/);
  // Both save paths resolve the new plain-name format against the directory.
  assert.match(adminScript, /return M\.resolveSelections\(partnerText\);/);
  assert.match(fieldSource, /resolveSelections\(input\.value\)/);
});

test('Space starts another person and Backspace removes the last selection', () => {
  assert.match(fieldSource, /state\.committedMention = \{/);
  assert.match(fieldSource, /activeSelectionAt\(input\.value, caret\)/);
  assert.match(fieldSource, /applySelection\(input\.value, chosenRange, person\.name\)/);
  assert.match(fieldSource, /event\.key === ' ' && beginNextSelection\(\)/);
  assert.match(fieldSource, /event\.key === 'Backspace' && removeLastSelection\(\)/);
});

test('Enter, Tab and clicking an option commit in place and close the picker', () => {
  const keyboard = fieldSource.slice(
    fieldSource.indexOf("event.key === 'Enter' || event.key === 'Tab'"),
    fieldSource.indexOf("event.key === 'Escape'", fieldSource.indexOf("event.key === 'Enter' || event.key === 'Tab'"))
  );
  assert.match(keyboard, /event\.preventDefault\(\)/);
  assert.match(keyboard, /event\.stopPropagation\(\)/);
  assert.match(keyboard, /choose\(state\.activeIndex\)/);

  assert.match(fieldSource, /menu\.addEventListener\('mousedown'[\s\S]{0,240}event\.preventDefault\(\)[\s\S]{0,120}choose\(Number/);
  assert.match(fieldSource, /input\.value = mentions\(\)\.formatPeople\(selected\);[\s\S]{0,360}closeMenu\(\);[\s\S]{0,120}input\.focus\(\)/);
  // The synthetic input event still reaches dirty flags, but does not reopen
  // the picker around the mention that was just selected.
  assert.match(fieldSource, /state\.ignoreNextInput = true;[\s\S]{0,100}dispatchEvent/);
  assert.match(fieldSource, /if \(state\.ignoreNextInput\) \{\s*state\.ignoreNextInput = false;\s*return;/);
});

test('the real picker handlers keep focus and stay closed after each selection method', () => {
  const { input, menu, FakeEvent, document } = loadMentionField(TEAM);
  let inputEvents = 0;
  input.addEventListener('input', () => { inputEvents += 1; });
  input.focus();

  input.value = 'Sa';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new FakeEvent('input'));
  assert.equal(menu.hidden, false);

  const enter = new FakeEvent('keydown', { key: 'Enter' });
  input.dispatchEvent(enter);
  assert.equal(input.value, 'Sam Partner');
  assert.equal(menu.hidden, true);
  assert.equal(inputEvents, 2, 'typing and the committed selection both emit input');
  assert.equal(enter.defaultPrevented, true);
  assert.equal(enter.propagationStopped, true);

  const firstSpace = new FakeEvent('keydown', { key: ' ' });
  input.dispatchEvent(firstSpace);
  assert.equal(input.value, 'Sam Partner & ');
  assert.equal(firstSpace.defaultPrevented, true);
  assert.equal(firstSpace.propagationStopped, true);

  input.value += 'Jo B';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new FakeEvent('input'));
  assert.equal(menu.hidden, false);

  const tab = new FakeEvent('keydown', { key: 'Tab' });
  input.dispatchEvent(tab);
  assert.equal(input.value, 'Sam Partner & Jo Bloggs');
  assert.equal(menu.hidden, true);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(tab.propagationStopped, true);

  const secondSpace = new FakeEvent('keydown', { key: ' ' });
  input.dispatchEvent(secondSpace);
  assert.equal(input.value, 'Sam Partner & Jo Bloggs & ');

  input.value += 'Joan';
  input.setSelectionRange(input.value.length, input.value.length);
  input.dispatchEvent(new FakeEvent('input'));
  assert.equal(menu.hidden, false);

  const mouse = new FakeEvent('mousedown');
  mouse.target = {
    closest() {
      return { getAttribute() { return '0'; } };
    }
  };
  menu.dispatchEvent(mouse);
  assert.equal(input.value, 'Sam Partner, Jo Bloggs & Joanne Fielding');
  assert.equal(menu.hidden, true);
  assert.equal(mouse.defaultPrevented, true);
  assert.equal(document.activeElement, input);

  for (const expected of ['Sam Partner & Jo Bloggs', 'Sam Partner', '']) {
    const backspace = new FakeEvent('keydown', { key: 'Backspace' });
    input.dispatchEvent(backspace);
    assert.equal(input.value, expected);
    assert.equal(backspace.defaultPrevented, true);
  }
});

test('every surface that shows a Coffee Partner renders it without the @', () => {
  // Dashboard: visit rows, the report modal, and the export.
  assert.match(visitReport, /function partnerHtml\(value, fallback\)/);
  assert.match(visitReport, /var partnerColHtml = isAudited/);
  assert.match(visitReport, /partnerText\(v\.coffeePartner\)/);
  // Admin table, bakery profile, and the My Activity hub.
  assert.match(adminScript, /window\.GAILS\.Mentions\s*\n?\s*\? window\.GAILS\.Mentions\.formatSelectionHtml\(v\.coffeePartner\)/);
  assert.match(bakeryProfile, /G\.Mentions\.formatSelectionHtml\(visit\.coffeePartner\)/);
  assert.match(myActivity, /function mentionHtml\(value\)/);
  assert.match(myActivity, /return mentionText\(visit\.coffeePartner\);/);
});

test('an assigned visit reaches the assignee, and the export names them', () => {
  assert.match(myActivity, /function visitAssignedToMe\(visit\)/);
  // Ownership is checked before anything else, so a credited visit is theirs
  // even when someone else logged it.
  assert.match(myActivity, /if \(attributedToMe\(visitAttribution\(visit\)\)\) return true;/);
  assert.match(myActivity, /'Was assigned a visit'/);
  assert.match(myActivity, /'Assigned to you'/);
  // Being named alongside a colleague is not the same as owning it alone.
  assert.match(myActivity, /'Assigned to you &amp; ' \+ escapeHtml/);
  // The export column carries the derived attribution, so a form visit and an
  // imported CQV name someone too.
  [visitReport, myActivity].forEach((source) => {
    assert.match(source, /\{ label: 'Assigned To', type: 'text', width: 24 \}/);
    assert.match(source, /Attribution\.namesText\(/);
  });
});

test('a check-in report presents attribution once as Coffee Partner', () => {
  const start = visitReport.indexOf("if (record.type === 'siteVisit')");
  const end = visitReport.indexOf('bodyEl.innerHTML = buildReportHtml(record);', start);
  const siteVisitReport = visitReport.slice(start, end);

  assert.match(visitReport, /function siteVisitCoffeePartnerHtml\(record\)/);
  assert.match(visitReport, /Attribution\.forVisit\(record\)/);
  assert.match(siteVisitReport, /\{ label: 'Coffee Partner', html: siteVisitCoffeePartnerHtml\(record\) \}/);
  assert.doesNotMatch(siteVisitReport, /Assigned To/);
  assert.match(siteVisitReport, /meta\.createdBy \|\| record\.createdBy \|\| meta\.updatedBy/);
});

test('the shared people directory is readable but never carries a role', () => {
  const directory = rules.rules.userDirectory;

  assert.equal(directory['.read'], 'auth != null');
  // Anyone may publish their own entry; only admins may touch someone else's.
  assert.match(directory.$uid['.write'], /\$uid === auth\.uid/);
  assert.match(directory.$uid['.write'], /root\.child\('admins'\)\.child\(auth\.uid\)/);
  // The whole point of a separate node is that it cannot leak the user record.
  assert.match(directory.$uid['.validate'], /!newData\.hasChild\('role'\)/);
  assert.match(directory.$uid['.validate'], /!newData\.hasChild\('opsArea'\)/);

  // It is self-maintaining: signing in republishes your own entry.
  assert.match(authScript, /function publishDirectoryEntry\(user, profile\)/);
  assert.match(authScript, /publishDirectoryEntry\(user, userProfile\);/);
  assert.match(adminScript, /function publishDirectoryEntries\(users\)/);
});

test('a directory the rules reject degrades to harvested names', () => {
  // Every read and write of the directory is best-effort, so the picker still
  // works before database.rules.json has been deployed.
  assert.match(authScript, /Shared people directory unavailable, falling back to names already in the data/);
  assert.match(myActivity, /get\(ref\(db, 'userDirectory'\)\)\.catch\(/);
  assert.match(adminScript, /Could not publish ' \+ person\.name \+ ' to the shared people directory/);
});

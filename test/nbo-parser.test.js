const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

// js/nbo-parser.js leans on two siblings at runtime: the shared Yes/No score
// helpers in js/nbo-shared.js and the CQV parser's action-plan collector. Load
// all three into one context, exactly as admin.html does.
function loadParser() {
  const context = { window: {} };
  ['nbo-shared.js', 'cqv-parser.js', 'nbo-parser.js'].forEach((file) => {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context);
  });
  return context.window.GAILS.NBO;
}

// The reconstructed lines of a real export — GoAudits "NBO COFFEE VISIT 1",
// Kings Cross Station, 30 July 2026 (ref 10374632) — trimmed to the rows that
// exercise the layout: the summary paragraph, a question whose text wraps
// below its response, photo timestamps, and the closing action plan.
function kingsCrossPages() {
  return [
    [
      "GAIL's",
      'NBO COFFEE VISIT 1',
      'GAILS BAKERY',
      'KINGS CROSS STATION',
      'THURSDAY 30th July 2026',
      'Prepared By',
      'Tristen Bayley',
      'Page 1 of 5 Ref:10374632 : 30,July 2026 17:27:23 BST',
      'Powered By'
    ],
    [
      "GAILS BAKERY GAIL's",
      'NBO COFFEE VISIT 1',
      'Kings Cross Station | Unit M4, Mezzanine level, Kings Cross Station,N1C 4AH',
      'THURSDAY 30TH JULY 2026',
      'S U M M A R Y',
      "Very positive coffee visit at King's Cross Station today. Marta led the bar confidently, supported well by",
      'Tawhidur. It was great to see the opening growth plan actively in use and being implemented by the team.',
      'Stock was labelled correctly and in date, drink standards were high, and the coffee station was clean and',
      'well organised.',
      'Visit 1',
      'Efficiency',
      'Q# QUESTION RESPONSE',
      '1. Is bar set up to Barista Routine phase 1? YES',
      '2. Are all baristas and MODs trained & signed off? YES',
      // A question cell tall enough (its text wraps and a photo sits under it)
      // that GoAudits centres the Q#/RESPONSE pair below the text.
      'Are the coffee positions on the shift planner in line with Barista',
      'Routine phase 2?',
      '3. NO',
      '30 Jul 26 04:04 PM',
      'Deployment can be elevated with assigned roles.',
      'Lead, support and float positions should be communicated in your shift',
      'brief.',
      '4. Is EasyCream in use? N/A',
      'Page 2 of 5 Ref:10374632 : 30,July 2026 17:27:23 BST',
      'Powered By'
    ],
    [
      'KINGS CROSS STATION GAILS BAKERY 30 JUL 26',
      'NBO COFFEE VISIT 1',
      'Service',
      'Q# QUESTION RESPONSE',
      '17. Are baristas SHINE-ing with customers? NO',
      'There is a big opportunity to elevate SHINE particularly in the evening.',
      '18. Is there enough crockery? N/A',
      'Equipment',
      'Q# QUESTION RESPONSE',
      '22. Is all coffee related equipment working? YES',
      'C O M M E N T S & A C T I O N P L A N',
      'Page 4 of 5 Ref:10374632 : 30,July 2026 17:27:23 BST',
      'Powered By'
    ],
    [
      'KINGS CROSS STATION GAILS BAKERY 30 JUL 26',
      'NBO COFFEE VISIT 1',
      'Visit 1 >> Efficiency',
      '(GA100000) Are the coffee positions on the shift planner in line with Barista Routine phase 2? PRIORITY Medium',
      'DUE DATE 02 Aug 26',
      'ASSIGNEE Kings Cross Station',
      "FINDINGS 'No' - Deployment can be elevated with assigned roles.",
      'Lead, support and float positions should be communicated in your shift',
      'brief.',
      'ACTION REQUIRED Please review Barista Routine Phase 2 & Coffee Positions on RISE. BM &',
      'HB to collaboratively work on shift planner.',
      'Visit 1 >> Quality',
      '(GA100000) Are baristas completing tasks accurately on Trail? PRIORITY Medium',
      'DUE DATE 02 Aug 26',
      'ASSIGNEE Kings Cross Station',
      "FINDINGS 'No' - Provide training on the Monthly Coffee report.",
      'ACTION REQUIRED BM & HB to coach team on accurate reporting standards.',
      'D E C L A R A T I O N',
      'Auditor',
      '(Tristen Bayley)',
      "AUDITOR'S LOCATION",
      'Google',
      'Map data ©2026 Google',
      'Page 5 of 5 Ref:10374632 : 30,July 2026 17:27:23 BST',
      'Powered By'
    ]
  ];
}

test('reads the cover details of an NBO Coffee Visit', () => {
  const { record } = loadParser().parsePages(kingsCrossPages());

  assert.equal(record.type, 'nbo');
  assert.equal(record.visitNumber, 1);
  assert.equal(record.bakery, 'KINGS CROSS STATION');
  assert.equal(record.date, '2026-07-30');
  assert.equal(record.auditorName, 'Tristen Bayley');
  assert.equal(record.ref, '10374632');
  assert.equal(record.address, 'Unit M4, Mezzanine level, Kings Cross Station,N1C 4AH');
});

test('keeps the summary paragraph instead of dropping it as unattachable text', () => {
  const { record, warnings } = loadParser().parsePages(kingsCrossPages());

  assert.match(record.summary, /^Very positive coffee visit at King's Cross Station today\./);
  assert.match(record.summary, /well organised\.$/);
  assert.equal(record.summary.includes('Visit 1'), false);
  assert.equal(warnings.some((w) => w.includes('Could not attach')), false);
});

test('attaches a wrapped question to its own coaching note', () => {
  const { record } = loadParser().parsePages(kingsCrossPages());
  const q3 = record.questions.find((q) => q.qNum === 3);

  assert.equal(q3.section, 'Efficiency');
  assert.equal(q3.label, 'Are the coffee positions on the shift planner in line with Barista Routine phase 2?');
  assert.equal(q3.response, 'NO');
  assert.equal(q3.note, 'Deployment can be elevated with assigned roles. Lead, support and float positions should be communicated in your shift brief.');
});

// The bug this guards: with no handler for the "C O M M E N T S & A C T I O N
// P L A N" heading, every line of the action plan read as trailing text and
// was glued onto the last question's coaching note.
test('does not spill the action plan into the last question note', () => {
  const { record } = loadParser().parsePages(kingsCrossPages());
  const q22 = record.questions.find((q) => q.qNum === 22);

  assert.equal(q22.label, 'Is all coffee related equipment working?');
  assert.equal(q22.response, 'YES');
  assert.equal(q22.note, '');
  assert.equal(record.questions.some((q) => /ACTION REQUIRED|GA100000/.test(q.note || '')), false);
  assert.equal(record.questions.some((q) => /COMMENTS|C O M M E N T S/.test(q.label)), false);
});

test('parses each action plan block into its own item', () => {
  const { record } = loadParser().parsePages(kingsCrossPages());

  assert.equal(record.actionPlan.length, 2);
  assert.deepEqual(Object.assign({}, record.actionPlan[0]), {
    sectionPath: 'Visit 1 >> Efficiency',
    questionRef: 'GA100000',
    questionLabel: 'Are the coffee positions on the shift planner in line with Barista Routine phase 2?',
    findings: 'Deployment can be elevated with assigned roles. Lead, support and float positions should be communicated in your shift brief.',
    actionRequired: 'Please review Barista Routine Phase 2 & Coffee Positions on RISE. BM & HB to collaboratively work on shift planner.',
    assignee: 'KINGS CROSS STATION',
    priority: 'Medium',
    dueDate: '02 Aug 26'
  });
  assert.equal(record.actionPlan[1].sectionPath, 'Visit 1 >> Quality');
  assert.equal(record.actionPlan[1].questionLabel, 'Are baristas completing tasks accurately on Trail?');
  assert.equal(record.actionPlan[1].actionRequired, 'BM & HB to coach team on accurate reporting standards.');
});

// Both centring outcomes occur in real exports: the Q#/RESPONSE pair lands
// level with the question's first line when the cell is short, and below the
// whole cell when it is tall (wrapped text, an embedded photo).
test('reads a wrapped question whichever line its number and response land on', () => {
  const parser = loadParser();
  const cover = [
    'GAILS BAKERY',
    'KINGS CROSS STATION',
    'NBO COFFEE VISIT 1',
    'THURSDAY 30th July 2026'
  ];
  const questionRows = (rows) => parser.parsePages([cover, [
    'Visit 1',
    'Efficiency',
    'Q# QUESTION RESPONSE'
  ].concat(rows)]).record.questions;

  const belowTheCell = questionRows([
    '7. Do the team demonstrate efficient habits in their ways of working? YES',
    'Is the Supporting Head Barista on the rota for 2 weeks, including',
    'both weekends?',
    '8. YES'
  ]);
  const levelWithTheFirstLine = questionRows([
    '7. Do the team demonstrate efficient habits in their ways of working? YES',
    '8. Is the Supporting Head Barista on the rota for 2 weeks, including YES',
    'both weekends?'
  ]);

  [belowTheCell, levelWithTheFirstLine].forEach((questions) => {
    assert.equal(questions.length, 2);
    assert.equal(questions[1].qNum, 8);
    assert.equal(questions[1].label, 'Is the Supporting Head Barista on the rota for 2 weeks, including both weekends?');
    assert.equal(questions[1].response, 'YES');
    assert.equal(questions[0].note, '');
  });
});

test('splits a coaching note from the wrapped question printed after it', () => {
  const parser = loadParser();
  const { record } = parser.parsePages([
    ['GAILS BAKERY', 'KINGS CROSS STATION', 'NBO COFFEE VISIT 1', 'THURSDAY 30th July 2026'],
    [
      'Visit 1',
      'Efficiency',
      'Q# QUESTION RESPONSE',
      '3. Are the coffee positions in line with Barista Routine phase 2? NO',
      'Deployment can be elevated with assigned roles.',
      'Lead, support and float positions should be communicated in your shift',
      'brief.',
      'Is the Supporting Head Barista on the rota for 2 weeks, including',
      'both weekends?',
      '8. YES'
    ]
  ]);

  assert.equal(record.questions[0].note, 'Deployment can be elevated with assigned roles. Lead, support and float positions should be communicated in your shift brief.');
  assert.equal(record.questions[1].label, 'Is the Supporting Head Barista on the rota for 2 weeks, including both weekends?');
  assert.equal(record.questions[1].response, 'YES');
});

test('derives the percentage from Yes/No answers only', () => {
  const { record } = loadParser().parsePages(kingsCrossPages());

  // 3 Yes, 2 No, 2 N/A across the trimmed pages above — the two N/A answers
  // stay out of the denominator.
  assert.equal(record.questions.length, 7);
  assert.deepEqual(Object.assign({}, record.counts), { yes: 3, no: 2, na: 2 });
  assert.equal(record.overallPct, 60);
});

test('recognises an NBO export from its cover page', () => {
  const parser = loadParser();

  assert.equal(parser.looksLikeNboPdf(kingsCrossPages()), true);
  assert.equal(parser.looksLikeNboPdf([['GAILS BAKERY'], ['CQV - Q3FY26']]), false);
});

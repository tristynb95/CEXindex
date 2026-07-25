const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'cqv-parser.js'), 'utf8');

function loadParser(pdfjsLib) {
  const context = {
    window: {
      GAILS: {
        CQVCriticals: {
          hasCriticalFail: () => false
        },
        CQVShared: {
          bandFromPct: (pct) => pct >= 90 ? 'Green' : pct >= 70 ? 'Yellow' : 'Red'
        }
      }
    },
    pdfjsLib
  };
  vm.runInNewContext(source, context);
  return context.window.GAILS.CQV;
}

function textItem(str, x, y) {
  return { str, transform: [1, 0, 0, 1, x, y] };
}

function fakePage(items) {
  return {
    getTextContent: async () => ({ items }),
    getViewport: () => ({ width: 595 })
  };
}

test('reconstructs action-plan columns without sidebar controls or shifted field boundaries', async () => {
  const pages = [
    fakePage([
      textItem('C O M M E N T S & A C T I O N P L A N', 22, 100)
    ]),
    fakePage([
      textItem("'No' - Actual findings", 108, 100),
      textItem('Change', 482, 101.5),
      textItem('FINDINGS', 22, 92),
      textItem('Continued finding', 108, 88),
      textItem('Change is genuinely required', 108, 80),
      textItem('ACTION REQUIRED', 22, 60),
      textItem('BM & HB to address this', 109, 72),
      textItem('and support the team', 109, 60),
      textItem('D E C L A R A T I O N', 22, 30)
    ])
  ];
  const pdfjsLib = {
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: pages.length,
        getPage: async (pageNumber) => pages[pageNumber - 1]
      })
    })
  };

  const parser = loadParser(pdfjsLib);
  const lines = await parser.extractPageLines(new ArrayBuffer(0));

  assert.equal(lines[1][0], "FINDINGS 'No' - Actual findings");
  assert.equal(lines[1][1], 'Continued finding');
  assert.equal(lines[1][2], 'Change is genuinely required');
  assert.equal(lines[1][3], 'ACTION REQUIRED BM & HB to address this');
  assert.equal(lines[1][4], 'and support the team');
  assert.equal(lines[1].some((line) => line === 'Change'), false);
});

test('removes a merged Change control from pre-reconstructed action-plan lines', () => {
  const parser = loadParser();
  const result = parser.parsePages([
    [
      'GAILS BAKERY',
      'Cheapside',
      'CQV - Q3FY26',
      'FRIDAY 24th July 2026'
    ],
    [
      'C O M M E N T S & A C T I O N P L A N'
    ],
    [
      'Service >> Standards/Shine',
      'PRIORITY Medium',
      '(GA100000) Are efficient ways of working embedded? DUE DATE 07 Aug 26',
      'ASSIGNEE Cheapside - One New',
      "'No' - Marked down due to the shift planner. Change",
      'FINDINGS',
      'ACTION REQUIRED HB & BM to train the team.',
      'D E C L A R A T I O N'
    ]
  ]);

  assert.equal(result.record.actionPlan.length, 1);
  assert.equal(result.record.actionPlan[0].findings, 'Marked down due to the shift planner.');
  assert.equal(result.record.actionPlan[0].actionRequired, 'HB & BM to train the team.');
  assert.equal(result.record.actionPlan[0].priority, 'Medium');
  assert.equal(result.record.actionPlan[0].dueDate, '07 Aug 26');
});

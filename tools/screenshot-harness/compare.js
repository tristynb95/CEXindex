// Two renders that look identical produce byte-identical PNGs, so an exact
// buffer comparison is a sufficient regression check.
const fs = require('fs');
const path = require('path');
const SHOTS = path.join(__dirname, 'shots');
const [before, after] = process.argv.slice(2);
if (!before || !after) { console.error('usage: node compare.js <before-tag> <after-tag>'); process.exit(2); }

const shots = fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS) : [];
const targets = shots.filter((f) => f.startsWith(before + '-'));
if (!targets.length) { console.error(`no shots tagged "${before}"`); process.exit(2); }

let differed = 0;
for (const file of targets) {
  const other = file.replace(before + '-', after + '-');
  const a = path.join(SHOTS, file), b = path.join(SHOTS, other);
  if (!fs.existsSync(b)) { console.log(`MISSING  ${other}`); differed++; continue; }
  const same = Buffer.compare(fs.readFileSync(a), fs.readFileSync(b)) === 0;
  console.log(`${same ? 'identical' : 'DIFFERS  '}  ${file.replace(before + '-', '')}`);
  if (!same) differed++;
}
console.log(differed ? `\n${differed} view(s) changed — open the PNGs and look.` : '\nno visual change');
process.exit(differed ? 1 : 0);

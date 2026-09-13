// Diffs two probe runs and names every element + property that changed.
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'probes');
const [before, after] = process.argv.slice(2);
if (!before || !after) {
  console.error('usage: node compare-styles.js <before-tag> <after-tag>');
  process.exit(2);
}

const files = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.startsWith(before + '-')) : [];
if (!files.length) { console.error('no probes tagged "' + before + '"'); process.exit(2); }

let changed = 0;
for (const file of files) {
  const other = file.replace(before + '-', after + '-');
  if (!fs.existsSync(path.join(OUT, other))) { console.log('MISSING  ' + other); changed++; continue; }
  const a = JSON.parse(fs.readFileSync(path.join(OUT, file), 'utf8'));
  const b = JSON.parse(fs.readFileSync(path.join(OUT, other), 'utf8'));
  const page = file.replace(before + '-', '').replace('.json', '');
  for (const view of Object.keys(a.views)) {
    const A = a.views[view];
    const B = (b.views && b.views[view]) || {};
    const keys = new Set(Object.keys(A).concat(Object.keys(B)));
    let n = 0;
    for (const k of keys) {
      if (A[k] === B[k]) continue;
      n++; changed++;
      if (n <= 5) {
        console.log('  ' + page + '/' + view + '  ' + k.split('|').slice(1).join(' .'));
        const av = String(A[k] || '').split('~');
        const bv = String(B[k] || '').split('~');
        a.props.forEach(function (p, i) {
          if (av[i] !== bv[i]) console.log('      ' + p + ': "' + av[i] + '" -> "' + bv[i] + '"');
        });
      }
    }
    console.log((n === 0 ? 'identical' : 'CHANGED  ') + '  ' + page + '/' + view + (n ? ' (' + n + ' elements)' : ''));
  }
}
console.log(changed ? '\n' + changed + ' element(s) changed.' : '\nno computed-style change');
process.exit(changed ? 1 : 0);

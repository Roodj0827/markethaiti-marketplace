const fs = require('fs');
const t = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'icons.js'), 'utf8');
const names = [...t.matchAll(/^\s{2}"([a-z0-9-]+)":/gm)].map((m) => m[1]);
console.log('total:', names.length);
console.log(names.join(', '));

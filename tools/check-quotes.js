const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['js/store.js', 'js/admin.js']) {
  const lines = fs.readFileSync(path.join(root, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    // ${icon( précédé d'une apostrophe ou guillemet sur la même ligne, hors backtick
    const re = /['"][^'"`\n]*\$\{icon/g;
    let m;
    while ((m = re.exec(line))) {
      const before = line.slice(0, m.index);
      const bt = (before.match(/`/g) || []).length;
      if (bt % 2 === 0) console.log(f + ':' + (i + 1) + ': ' + line.trim().slice(0, 140));
    }
    // innerHTML = `...` sans ${icon} (régression possible du codemod)
    if (/innerHTML = `[^$`]*`;/.test(line) && line.includes('innerHTML = `') && !line.includes('${')) {
      console.log('VIDE? ' + f + ':' + (i + 1) + ': ' + line.trim().slice(0, 140));
    }
  });
}
console.log('done');

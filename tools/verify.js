const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const icons = fs.readFileSync(path.join(root, 'js/icons.js'), 'utf8');
for (const f of ['js/store.js', 'js/admin.js', 'js/vendor.js', 'index.html', 'admin-marketplace-haiti.html', 'vendor.html']) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  const a = [...t.matchAll(/icon\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  const b = [...t.matchAll(/data-icon="([a-z0-9-]+)"/g)].map((m) => m[1]);
  const missing = [...new Set([...a, ...b])].filter((n) => !icons.includes(`"${n}":`));
  console.log(f, '| icons utilisés:', new Set([...a, ...b]).size, '| manquants:', missing.join(',') || 'aucun');
}
// restes fa- et emoji
for (const f of ['index.html', 'admin-marketplace-haiti.html', 'js/store.js', 'js/admin.js', 'css/store.css', 'css/admin.css']) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  const fa = (t.match(/fa-(solid|regular|brands|[a-z][a-z0-9-]*)/g) || []).filter((x) => !/^(fa-|data-icon)/.test(x) && x.startsWith('fa-'));
  const em = t.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
  console.log(f, '| fa- restants:', fa.length, '| emoji:', em.length, em.join(''));
}

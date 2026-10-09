const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = ['index.html', 'js/store.js', 'admin-marketplace-haiti.html', 'js/admin.js', 'css/store.css', 'css/admin.css'];
for (const f of files) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  const m = t.match(/<i class="fa-[a-z]+ fa-[a-z0-9-]+"[^>]*>/g) || [];
  const u = [...new Set(m)];
  console.log('=== ' + f + ' (' + u.length + ')');
  u.forEach((x) => console.log('  ' + x));
  const other = t.match(/<i class="fa[^"]*"[^>]*>/g) || [];
  const otherU = [...new Set(other.filter((x) => !u.includes(x)))];
  otherU.forEach((x) => console.log('  ? ' + x));
}

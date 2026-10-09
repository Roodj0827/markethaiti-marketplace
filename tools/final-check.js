const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
for (const f of ['index.html', 'admin-marketplace-haiti.html']) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  console.log('=== ' + f);
  const m = t.match(/<(script|link)[^>]*(src|href)="[^"]*"/g) || [];
  m.forEach((x) => console.log('  ' + x));
  console.log('  inline <script>:', (t.match(/<script>/g) || []).length);
  console.log('  data-icon count:', (t.match(/data-icon=/g) || []).length);
}
// cohérence : fonctions utilisées mais pas définies ?
for (const f of ['js/store.js', 'js/admin.js']) {
  const t = fs.readFileSync(path.join(root, f), 'utf8');
  ['hydrateIcons', 'icon(', 'normalizePayments', 'enabledPaymentMethods', 'findPaymentConfig', 'PAYMENT_CREATE_URL', 'PAYMENT_VERIFY_URL', 'MONCASH_PAY_CREATE_URL'].forEach((k) => {
    const uses = t.split(k).length - 1;
    console.log(f, '|', k, '→', uses, 'occurrences');
  });
}

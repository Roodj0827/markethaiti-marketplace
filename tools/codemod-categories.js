const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const CAT_ICONS = {
  'fa-mobile-screen': 'smartphone', 'fa-phone': 'phone', 'fa-laptop': 'laptop',
  'fa-headphones': 'headphones', 'fa-gamepad': 'gamepad-2', 'fa-blender': 'refrigerator',
  'fa-person-dress': 'shopping-bag', 'fa-shirt': 'shirt', 'fa-child-reaching': 'person-standing',
  'fa-shoe-prints': 'footprints', 'fa-bag-shopping': 'backpack', 'fa-gem': 'gem',
  'fa-wand-magic-sparkles': 'sparkles', 'fa-spray-can-sparkles': 'spray-can',
  'fa-heart-pulse': 'heart-pulse', 'fa-house-chimney': 'house', 'fa-utensils': 'utensils',
  'fa-couch': 'sofa', 'fa-baby': 'baby', 'fa-puzzle-piece': 'puzzle', 'fa-dumbbell': 'dumbbell',
  'fa-car': 'car', 'fa-toolbox': 'wrench', 'fa-pen': 'pen', 'fa-basket-shopping': 'shopping-basket',
  'fa-paw': 'paw-print', 'fa-book': 'book-open', 'fa-champagne-glasses': 'party-popper', 'fa-tag': 'tag',
};

for (const f of ['js/store.js', 'js/admin.js']) {
  const p = path.join(root, f);
  let t = fs.readFileSync(p, 'utf8');
  // enlève les champs emoji: "X",
  t = t.replace(/\s*emoji:\s*"[^"]*",/g, '');
  // remplace icon: "fa-x" par le nom lucide
  t = t.replace(/icon:\s*"fa-([a-z0-9-]+)"/g, (m, n) => 'icon: "' + (CAT_ICONS[n] || 'tag') + '"');
  // fallback textuel restant
  t = t.replace(/"fa-tag"/g, '"tag"');
  fs.writeFileSync(p, t);
  console.log(f, 'done');
}

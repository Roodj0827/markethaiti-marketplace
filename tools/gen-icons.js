const fs = require('fs');
const path = require('path');

const LUCIDE_VERSION = '0.469.0';
const SIMPLE_VERSION = '13.19.0';

const LUCIDE = [
  // UI général
  'store','search','user','shopping-cart','shopping-bag','shopping-basket','sliders-horizontal',
  'rotate-ccw','x','smile','lock','truck','credit-card','circle-check','check','triangle-alert',
  'star','loader-circle','circle-x','clock','image','send','log-in','circle-user','package',
  'log-out','share-2','copy','eye','eye-off','plus','minus','users','receipt','history','settings',
  'external-link','download','coins','link','save','pencil','trash-2','key','mail','info',
  'building','hand-coins','upload','map-pin','camera','shield-check','badge-check','wallet',
  'banknote','landmark','globe','bell','message-circle','chevron-down','chevron-right',
  'chevron-left','arrow-left','arrow-right','menu','heart','zap','dollar-sign','timer',
  'package-check','phone-call','refresh-cw','filter','file-text','circle-alert','smartphone',
  'phone','laptop','headphones','gamepad-2','refrigerator','handbag','shirt','baby','puzzle',
  'dumbbell','car','wrench','pen','paw-print','book-open','party-popper','footprints','gem',
  'sparkles','spray-can','heart-pulse','house','utensils','sofa','tag','chart-line','chart-column',
  'trending-up','percent','grid-3x3','list','check-check','circle-dot','wallet-cards','qr-code',
  'scan-line','badge-dollar-sign','receipt-text','user-round','backpack','briefcase','watch',
  'ribbon','crown','person-standing','luggage'
];

const BRANDS = { whatsapp: 'whatsapp', facebook: 'facebook', messenger: 'messenger', 'x-twitter': 'x', telegram: 'telegram' };

async function get(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status);
  return r.text();
}

function inner(svg) {
  return svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '').trim().replace(/\s+/g, ' ');
}

(async () => {
  const icons = {};
  const failed = [];
  for (const name of LUCIDE) {
    try {
      icons[name] = inner(await get(`https://unpkg.com/lucide-static@${LUCIDE_VERSION}/icons/${name}.svg`));
    } catch (e) { failed.push(name); }
  }
  console.log('lucide ok:', Object.keys(icons).length, 'failed:', failed.join(',') || 'none');

  const brands = {};
  for (const [key, slug] of Object.entries(BRANDS)) {
    try {
      brands[key] = inner(await get(`https://unpkg.com/simple-icons@${SIMPLE_VERSION}/icons/${slug}.svg`));
    } catch (e) { failed.push('brand:' + key); }
  }
  console.log('brands ok:', Object.keys(brands).length, 'failed:', failed.join(',') || 'none');

  const out = `// =========================================================================
// MarketHaiti — Icônes (Lucide v${LUCIDE_VERSION} + marques Simple Icons)
// Aucune dépendance externe : les SVG sont embarqués ici.
// Usage HTML statique : <i data-icon="store"></i> puis hydrateIcons()
// Usage dans les templates JS : \${icon('store')} ou \${icon('trash-2','','width:14px')}
// =========================================================================
(function () {
  "use strict";
  const ICONS = ${JSON.stringify(icons, null, 2)};

  // Icônes de marques (remplies — pas des strokes Lucide)
  const BRANDS = ${JSON.stringify(brands, null, 2)};

  function icon(name, cls, style) {
    const brand = BRANDS[name];
    const body = brand || ICONS[name] || ICONS['circle-alert'];
    const c = ('lucide' + (cls ? ' ' + cls : '')).trim();
    const s = style ? ' style="' + style + '"' : '';
    if (brand) return '<svg class="' + c + '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"' + s + '>' + body + '</svg>';
    return '<svg class="' + c + '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + s + '>' + body + '</svg>';
  }

  // Remplace les <i data-icon="nom"> du HTML statique par le SVG correspondant.
  function hydrateIcons(root) {
    (root || document).querySelectorAll('i[data-icon]').forEach(function (el) {
      const tmp = document.createElement('span');
      tmp.innerHTML = icon(el.getAttribute('data-icon'), '', el.getAttribute('style') || '');
      const svg = tmp.firstChild;
      if (el.id) svg.id = el.id;
      el.replaceWith(svg);
    });
  }

  window.icon = icon;
  window.hydrateIcons = hydrateIcons;
})();
`;
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'icons.js'), out);
  console.log('js/icons.js written,', Object.keys(icons).length, 'icons +', Object.keys(brands).length, 'brands');
})();

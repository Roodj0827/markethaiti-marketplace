const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const MAP = {
  'store': 'store', 'magnifying-glass': 'search', 'user': 'user', 'cart-shopping': 'shopping-cart',
  'sliders': 'sliders-horizontal', 'rotate-left': 'rotate-ccw', 'xmark': 'x', 'face-smile': 'smile',
  'lock': 'lock', 'truck': 'truck', 'truck-fast': 'truck', 'credit-card': 'credit-card',
  'circle-check': 'circle-check', 'check': 'check', 'triangle-exclamation': 'triangle-alert',
  'star': 'star', 'spinner': 'loader-circle', 'circle-xmark': 'circle-x', 'clock': 'clock',
  'image': 'image', 'whatsapp': 'whatsapp', 'paper-plane': 'send', 'right-to-bracket': 'log-in',
  'circle-user': 'circle-user', 'box': 'package', 'right-from-bracket': 'log-out',
  'share-nodes': 'share-2', 'facebook': 'facebook', 'facebook-messenger': 'messenger',
  'x-twitter': 'x-twitter', 'telegram': 'telegram', 'copy': 'copy', 'cart-plus': 'shopping-cart',
  'eye': 'eye', 'plus': 'plus', 'chart-line': 'chart-line', 'shop': 'store', 'users': 'users',
  'receipt': 'receipt', 'chart-bar': 'chart-column', 'history': 'history', 'gear': 'settings',
  'arrow-up-right-from-square': 'external-link', 'download': 'download', 'coins': 'coins',
  'link': 'link', 'floppy-disk': 'save', 'pen': 'pencil', 'trash': 'trash-2', 'key': 'key',
  'envelope': 'mail', 'circle-info': 'info', 'building': 'building',
  'hand-holding-dollar': 'hand-coins', 'arrow-rotate-left': 'rotate-ccw',
};

const re = /<i class="fa-(?:solid|regular|brands)\s+fa-([a-z0-9-]+)((?:\s+fa-[a-z-]+)*)"([^>]*)>([\s\S]*?)<\/i>/g;

function convertFile(file, mode) {
  const p = path.join(root, file);
  let t = fs.readFileSync(p, 'utf8');
  let count = 0, skipped = [];
  t = t.replace(re, (m, name, extra, attrs, inner) => {
    const lucide = MAP[name];
    if (!lucide) { skipped.push(name); return m; }
    const cls = extra.includes('fa-spin') ? 'spin' : '';
    const styleM = attrs.match(/style="([^"]*)"/);
    const style = styleM ? styleM[1] : '';
    count++;
    if (mode === 'html') {
      const other = attrs.replace(/style="[^"]*"/, '').trim();
      return `<i data-icon="${lucide}"${style ? ` style="${style}"` : ''}${other ? ' ' + other : ''}>${inner}</i>`;
    }
    // mode js → ${icon('name','cls','style')}inner — inner text kept after the icon
    return '${icon(\'' + lucide + '\'' + (cls ? ',\'' + cls + '\'' : (style ? ',\'\'' : '')) + (style ? ',\'' + style + '\'' : '') + ')}' + inner;
  });
  fs.writeFileSync(p, t);
  console.log(file, '->', count, 'icons convertis', skipped.length ? '| SKIP: ' + skipped.join(',') : '');
}

convertFile('index.html', 'html');
convertFile('admin-marketplace-haiti.html', 'html');
convertFile('js/store.js', 'js');
convertFile('js/admin.js', 'js');

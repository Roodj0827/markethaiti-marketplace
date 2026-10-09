const fs = require('fs');
const path = require('path');
const root = __dirname + '/..';

function extract(htmlFile, cssOut, jsOut) {
  const t = fs.readFileSync(path.join(root, htmlFile), 'utf8');

  // style block
  const sStart = t.indexOf('<style>');
  const sEnd = t.indexOf('</style>');
  const css = t.slice(sStart + '<style>'.length, sEnd);

  // last inline <script> block (without src)
  const scrRe = /<script>([\s\S]*?)<\/script>/g;
  let m, last = null;
  while ((m = scrRe.exec(t))) last = m;
  const js = last[1];

  fs.writeFileSync(path.join(root, cssOut), css.trimStart());
  fs.writeFileSync(path.join(root, jsOut), js.trimStart());

  // rebuild html
  let out = t.slice(0, sStart) + `<link rel="stylesheet" href="${cssOut}">` + t.slice(sEnd + '</style>'.length);
  out = out.slice(0, out.indexOf(last[0])) + `<script src="${jsOut}"></script>` + out.slice(out.indexOf(last[0]) + last[0].length);

  fs.writeFileSync(path.join(root, htmlFile), out);
  console.log(htmlFile, '-> css:', css.length, 'js:', js.length);
}

extract('index.html', 'css/store.css', 'js/store.js');
extract('admin-marketplace-haiti.html', 'css/admin.css', 'js/admin.js');

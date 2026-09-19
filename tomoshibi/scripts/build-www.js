// Capacitorのwebdir（www/）を作るだけのスクリプト。
// ルート直下のファイルがソース・オブ・トゥルース（GitHub Pages配信用）。
// このスクリプトはそれをコピーするだけで、ルート側は一切変更しない。
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var OUT = path.join(ROOT, 'www');

var ENTRIES = [
  'index.html',
  'privacy.html',
  'manifest.webmanifest',
  'sw.js',
  'css',
  'js',
  'icons'
];

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function copy(src, dst) {
  var stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (var name of fs.readdirSync(src)) {
      copy(path.join(src, name), path.join(dst, name));
    }
  } else {
    fs.copyFileSync(src, dst);
  }
}

rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

for (var entry of ENTRIES) {
  var src = path.join(ROOT, entry);
  if (!fs.existsSync(src)) {
    console.warn('[build-www] skip (not found): ' + entry);
    continue;
  }
  copy(src, path.join(OUT, entry));
}

console.log('[build-www] built www/ from root files (' + ENTRIES.join(', ') + ')');

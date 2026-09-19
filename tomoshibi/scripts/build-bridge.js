// capacitor-src/bridge.js（npmパッケージを使うESMソース）を、
// バンドラなしのapp.jsからそのまま<script src>で読めるIIFEにまとめる。
// 出力先 js/capacitor-bridge.js はルート直下の他ファイルと同じ「配信物」で、
// www/ にもそのままコピーされる（build-www.jsより先に実行すること）。
'use strict';

var esbuild = require('esbuild');
var path = require('path');

var ROOT = path.join(__dirname, '..');

esbuild.build({
  entryPoints: [path.join(ROOT, 'capacitor-src/bridge.js')],
  outfile: path.join(ROOT, 'js/capacitor-bridge.js'),
  bundle: true,
  format: 'iife',
  target: 'es2018',
  platform: 'browser',
  logLevel: 'info'
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});

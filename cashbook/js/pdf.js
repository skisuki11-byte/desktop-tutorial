/* pdf.js — canvas に描いたページを PDF ファイルにまとめる（依存ライブラリなし）。
 *
 * 日本語のフォントを PDF に埋め込むのは現実的でない（ファイルが数MBになる）ため、
 * ブラウザに文字を描かせた canvas を画像として貼り付ける方式にしている。
 * これならどの端末でも、画面と同じ字形でそのまま出る。
 */
(function (global) {
  'use strict';

  var A4 = { w: 595.28, h: 841.89 };   // A4 のポイント寸法（1pt = 1/72inch）

  var enc = new TextEncoder();

  function bytes(str) { return enc.encode(str); }

  function canvasToJpeg(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error('画像を作れませんでした')); return; }
        blob.arrayBuffer().then(function (buf) { resolve(new Uint8Array(buf)); }, reject);
      }, 'image/jpeg', quality || 0.92);
    });
  }

  /* canvas の配列から PDF を組み立てる。1 canvas = 1ページ。 */
  function build(canvases, opts) {
    opts = opts || {};
    var page = opts.page || A4;

    return Promise.all(canvases.map(function (c) {
      return canvasToJpeg(c, opts.quality).then(function (data) {
        return { data: data, w: c.width, h: c.height };
      });
    })).then(function (images) {
      var parts = [];       // Uint8Array の並び
      var offsets = [];     // 各オブジェクトの先頭バイト位置
      var pos = 0;

      function push(u8) { parts.push(u8); pos += u8.length; }
      function pushStr(s) { push(bytes(s)); }

      // オブジェクト番号:
      //   1 = カタログ, 2 = ページツリー
      //   ページ i は 3 + i*3 (Page), 4 + i*3 (Image), 5 + i*3 (Contents)
      function pageObj(i) { return 3 + i * 3; }
      function imgObj(i) { return 4 + i * 3; }
      function contObj(i) { return 5 + i * 3; }

      function begin(num) { offsets[num] = pos; pushStr(num + ' 0 obj\n'); }
      function end() { pushStr('endobj\n'); }

      pushStr('%PDF-1.4\n');
      push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));  // バイナリ宣言

      begin(1);
      pushStr('<< /Type /Catalog /Pages 2 0 R >>\n');
      end();

      begin(2);
      pushStr('<< /Type /Pages /Count ' + images.length + ' /Kids [' +
        images.map(function (_, i) { return pageObj(i) + ' 0 R'; }).join(' ') + '] >>\n');
      end();

      images.forEach(function (im, i) {
        begin(pageObj(i));
        pushStr('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
          page.w.toFixed(2) + ' ' + page.h.toFixed(2) + '] ' +
          '/Resources << /XObject << /Im0 ' + imgObj(i) + ' 0 R >> >> ' +
          '/Contents ' + contObj(i) + ' 0 R >>\n');
        end();

        begin(imgObj(i));
        pushStr('<< /Type /XObject /Subtype /Image /Width ' + im.w +
          ' /Height ' + im.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
          ' /Filter /DCTDecode /Length ' + im.data.length + ' >>\nstream\n');
        push(im.data);
        pushStr('\nendstream\n');
        end();

        var content = 'q\n' + page.w.toFixed(2) + ' 0 0 ' + page.h.toFixed(2) +
          ' 0 0 cm\n/Im0 Do\nQ\n';
        begin(contObj(i));
        pushStr('<< /Length ' + bytes(content).length + ' >>\nstream\n' + content + 'endstream\n');
        end();
      });

      var total = 3 + images.length * 3;      // 1..(total-1) を使う
      var xrefPos = pos;
      var xref = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
      for (var n = 1; n < total; n++) {
        xref += ('0000000000' + offsets[n]).slice(-10) + ' 00000 n \n';
      }
      xref += 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n';
      pushStr(xref);

      return new Blob(parts, { type: 'application/pdf' });
    });
  }

  global.PDFOut = { build: build, A4: A4 };
})(window);

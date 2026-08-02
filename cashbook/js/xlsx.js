/* xlsx.js — 依存ライブラリなしの最小 XLSX ライタ。
 *
 * ブラウザだけで本物の .xlsx（ZIP + SpreadsheetML）を組み立てる。
 * ZIP は無圧縮（stored）。Excel / LibreOffice / Numbers / Google スプレッドシートで開ける。
 *
 * 使い方:
 *   const blob = XLSXW.build([{ name:'出納帳', cols:[8,12,...], freezeRow:4,
 *                               rows:[[XLSXW.h('No'), XLSXW.h('日付')], [XLSXW.s('1'), XLSXW.d('2026-01-06')]] }]);
 *   XLSXW.download(blob, 'file.xlsx');
 */
(function (global) {
  'use strict';

  /* ---------------- CRC32 ---------------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var i = 0; i < 256; i++) {
      var c = i;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  var enc = new TextEncoder();

  /* ---------------- ZIP (stored) ---------------- */
  function zip(files) {
    var locals = [], centrals = [], offset = 0;

    files.forEach(function (f) {
      var name = enc.encode(f.name);
      var data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      var crc = crc32(data);

      var lh = new Uint8Array(30 + name.length);
      var lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);          // version needed
      lv.setUint16(6, 0x0800, true);      // UTF-8 filenames
      lv.setUint16(8, 0, true);           // stored
      lv.setUint16(10, 0, true);          // time
      lv.setUint16(12, 0x21, true);       // date (1980-01-01)
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);
      locals.push(lh, data);

      var ch = new Uint8Array(46 + name.length);
      var cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x21, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);
      centrals.push(ch);

      offset += lh.length + data.length;
    });

    var cdSize = centrals.reduce(function (a, b) { return a + b.length; }, 0);
    var eocd = new Uint8Array(22);
    var ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);

    return new Blob(locals.concat(centrals, [eocd]),
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------------- helpers ---------------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
    }).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  function colName(n) {           // 1 -> A
    var s = '';
    while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }

  function dateSerial(v) {        // 'YYYY-MM-DD' or Date -> Excel serial
    var d = (v instanceof Date) ? v : new Date(v + 'T00:00:00Z');
    var utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
  }

  /* ---- セル生成ヘルパ（数字はスタイル番号） ----
     0 既定 / 1 タイトル / 2 見出し / 3 文字 / 4 金額 / 5 日付
     6 小計文字 / 7 小計金額 / 8 合計文字 / 9 合計金額
     10 注記 / 11 パーセント / 12 要確認文字 / 13 要確認金額 / 14 要確認日付 */
  var S = {
    DEF: 0, TITLE: 1, HEAD: 2, TXT: 3, NUM: 4, DATE: 5,
    SUBT: 6, SUBN: 7, TOTT: 8, TOTN: 9, NOTE: 10, PCT: 11, WT: 12, WN: 13, WD: 14
  };

  function cell(v, t, s) { return { v: v, t: t, s: s }; }
  var api = {
    S: S,
    s: function (v, st) { return cell(v, 's', st === undefined ? S.TXT : st); },
    n: function (v, st) { return cell(v, 'n', st === undefined ? S.NUM : st); },
    d: function (v, st) { return cell(v, 'd', st === undefined ? S.DATE : st); },
    h: function (v) { return cell(v, 's', S.HEAD); },
    title: function (v) { return cell(v, 's', S.TITLE); },
    note: function (v) { return cell(v, 's', S.NOTE); },
    blank: null
  };

  /* ---------------- styles.xml ---------------- */
  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3">' +
    '<numFmt numFmtId="164" formatCode="#,##0;(#,##0);&quot;-&quot;"/>' +
    '<numFmt numFmtId="165" formatCode="yyyy/mm/dd"/>' +
    '<numFmt numFmtId="166" formatCode="0.0%"/>' +
    '</numFmts>' +
    '<fonts count="5">' +
    '<font><sz val="11"/><name val="Meiryo"/></font>' +
    '<font><b/><sz val="14"/><name val="Meiryo"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Meiryo"/></font>' +
    '<font><b/><sz val="11"/><name val="Meiryo"/></font>' +
    '<font><sz val="9"/><color rgb="FF555555"/><name val="Meiryo"/></font>' +
    '</fonts>' +
    '<fills count="6">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3864"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD9E2F3"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>' +
    '</fills>' +
    '<borders count="2">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FF9BA7B8"/></left><right style="thin"><color rgb="FF9BA7B8"/></right>' +
    '<top style="thin"><color rgb="FF9BA7B8"/></top><bottom style="thin"><color rgb="FF9BA7B8"/></bottom><diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="15">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /* ---------------- sheet xml ---------------- */
  function sheetXml(sheet) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];

    if (sheet.freezeRow) {
      out.push('<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="' + sheet.freezeRow + '" topLeftCell="A' + (sheet.freezeRow + 1) +
        '" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
    }

    if (sheet.cols && sheet.cols.length) {
      out.push('<cols>');
      sheet.cols.forEach(function (w, i) {
        out.push('<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>');
      });
      out.push('</cols>');
    }

    out.push('<sheetData>');
    sheet.rows.forEach(function (row, ri) {
      if (!row || !row.length) return;
      var r = ri + 1, buf = '<row r="' + r + '">', any = false;
      row.forEach(function (c, ci) {
        if (c === null || c === undefined) return;
        var ref = colName(ci + 1) + r, st = c.s || 0;
        if (c.t === 'n') {
          if (c.v === null || c.v === undefined || c.v === '') return;
          buf += '<c r="' + ref + '" s="' + st + '"><v>' + c.v + '</v></c>';
        } else if (c.t === 'd') {
          buf += '<c r="' + ref + '" s="' + st + '"><v>' + dateSerial(c.v) + '</v></c>';
        } else {
          if (c.v === null || c.v === undefined || c.v === '') {
            buf += '<c r="' + ref + '" s="' + st + '"/>';
          } else {
            buf += '<c r="' + ref + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' +
              esc(c.v) + '</t></is></c>';
          }
        }
        any = true;
      });
      buf += '</row>';
      if (any) out.push(buf);
    });
    out.push('</sheetData>');

    if (sheet.autoFilter) out.push('<autoFilter ref="' + sheet.autoFilter + '"/>');
    out.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>');
    out.push('</worksheet>');
    return out.join('');
  }

  /* ---------------- workbook ---------------- */
  function build(sheets) {
    var files = [];

    var types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (_, i) {
        return '<Override PartName="/xl/worksheets/sheet' + (i + 1) +
          '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') +
      '</Types>';
    files.push({ name: '[Content_Types].xml', data: types });

    files.push({
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>'
    });

    files.push({
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        sheets.map(function (s, i) {
          return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
        }).join('') + '</sheets></workbook>'
    });

    files.push({
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (_, i) {
          return '<Relationship Id="rId' + (i + 1) +
            '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
            (i + 1) + '.xml"/>';
        }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>'
    });

    files.push({ name: 'xl/styles.xml', data: STYLES });
    sheets.forEach(function (s, i) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s) });
    });

    return zip(files);
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  api.build = build;
  api.download = download;
  api.colName = colName;
  global.XLSXW = api;
})(window);

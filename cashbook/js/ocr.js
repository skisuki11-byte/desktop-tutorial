/* ocr.js — カメラで撮った手書き出納帳を Claude API で読み取る。
 *
 * ブラウザから api.anthropic.com を直接叩くため、
 * anthropic-dangerous-direct-browser-access ヘッダを付けている。
 * APIキーは端末の localStorage にのみ保存され、送信先は api.anthropic.com のみ。
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2023-06-01';
  var FALLBACK_BETA = 'server-side-fallback-2026-07-01';
  var MAX_EDGE = 2576;   // Claude の高解像度ビジョンの上限（長辺ピクセル）

  var KAMOKU = ['収入', '諸費', '交際費', '消耗品', '交通費', '大会補助', '事業費', 'その他'];

  /* ---------- 画像の前処理（縮小して base64 に） ---------- */
  function toBase64Jpeg(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        var dataUrl = cv.toDataURL('image/jpeg', 0.88);
        resolve({ data: dataUrl.split(',')[1], preview: dataUrl, width: cw, height: ch });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
      img.src = url;
    });
  }

  /* ---------- 読み取り結果のスキーマ（構造化出力） ---------- */
  function schema() {
    return {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          description: 'ページ上から順に並べた仕訳行',
          items: {
            type: 'object',
            properties: {
              no: { type: 'integer', description: 'ノートの通し番号。無ければ0' },
              month: { type: 'integer', description: '月（1-12）' },
              day: { type: 'integer', description: '日（1-31）' },
              kamoku: { type: 'string', enum: KAMOKU, description: '科目' },
              uchiwake: { type: 'string', description: '科目の内訳。括弧書き部分（例: 手土産, 高速, 事務, 飲食物, その他）。無ければ「その他」' },
              tekiyo: { type: 'string', description: '摘要（内容）' },
              income: { type: 'integer', description: '収入金額。無ければ0' },
              expense: { type: 'integer', description: '支払金額。無ければ0' },
              balance: { type: 'integer', description: '差引残高。読めなければ0' },
              uncertain: { type: 'boolean', description: '文字や数字が判読しにくい場合 true' }
            },
            required: ['no', 'month', 'day', 'kamoku', 'uchiwake', 'tekiyo',
              'income', 'expense', 'balance', 'uncertain'],
            additionalProperties: false
          }
        },
        note: { type: 'string', description: '読み取り上の注意点。無ければ空文字' }
      },
      required: ['rows', 'note'],
      additionalProperties: false
    };
  }

  var PROMPT = [
    'この画像は日本語の手書き出納帳（金銭出納帳）のページです。表の各行を読み取ってJSONにしてください。',
    '',
    '列の並びは通常 左から:「年月日」「科目」「摘要」「収入金額」「支払金額」「差引残高」です。',
    '',
    '重要な読み取りルール:',
    '1. 「差引残高」の列は前の行から連続しています。',
    '   残高[n] = 残高[n-1] + 収入 - 支出 が必ず成立します。',
    '   金額の桁が読みにくい行は、前後の残高の差から金額を確定させてください。',
    '   逆に残高が読みにくい行は、前の残高と金額から計算してください。',
    '2. 科目は括弧付きで内訳が書かれていることがあります（例:「交際費(手土産)」）。',
    '   括弧の外を kamoku、中を uchiwake に入れてください。',
    '   kamoku は指定された選択肢のどれかに必ず当てはめ、迷う場合は「その他」にしてください。',
    '3. 摘要の先頭にある丸数字や番号は通し番号です。no に入れ、tekiyo からは取り除いてください。',
    '4. 金額はカンマを除いた整数にしてください。円未満はありません。',
    '5. 文字がかすれている・判読に自信がない行は uncertain を true にしてください。',
    '   推測で埋めるより、読めた範囲だけ入れて uncertain を立ててください。',
    '6. 「前年度繰越金」の行や、合計・小計の行は出力しないでください（明細行のみ）。',
    '7. 行は必ずページの上から順番に並べてください。'
  ].join('\n');

  /* ---------- API 呼び出し ---------- */
  function callApi(body, apiKey, useFallback) {
    var headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    var payload = Object.assign({}, body);
    if (useFallback) {
      headers['anthropic-beta'] = FALLBACK_BETA;
      payload.fallbacks = 'default';
    }
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = JSON.parse(text); } catch (e) {}
        return { ok: res.ok, status: res.status, json: json, text: text };
      });
    });
  }

  function messageFor(status, json) {
    var m = json && json.error && json.error.message;
    if (status === 401) return 'APIキーが正しくないようです。設定を確認してください。';
    if (status === 403) return 'このAPIキーには権限がありません。';
    if (status === 429) return 'レート制限に達しました。少し待ってからもう一度お試しください。';
    if (status >= 500) return 'Anthropic側で一時的なエラーが起きています（' + status + '）。少し待って再実行してください。';
    return m || ('読み取りに失敗しました（HTTP ' + status + '）');
  }

  /* 1枚の画像を読み取って {rows, note} を返す */
  function readImage(base64, apiKey, model) {
    var body = {
      model: model || 'claude-opus-5',
      max_tokens: 16000,
      output_config: { format: { type: 'json_schema', schema: schema() } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: PROMPT }
        ]
      }]
    };

    return callApi(body, apiKey, true).then(function (r) {
      // fallbacks のベータが使えない環境では付けずにもう一度
      if (!r.ok && r.status === 400 && /fallback|beta/i.test(r.text || '')) {
        return callApi(body, apiKey, false);
      }
      return r;
    }).then(function (r) {
      if (!r.ok) throw new Error(messageFor(r.status, r.json));
      var msg = r.json;
      if (msg.stop_reason === 'refusal') {
        throw new Error('この画像の読み取りは安全性の判定により拒否されました。別の画像でお試しください。');
      }
      if (msg.stop_reason === 'max_tokens') {
        throw new Error('1ページの行数が多すぎて読み切れませんでした。ページを分けて撮影してください。');
      }
      var textBlock = (msg.content || []).filter(function (b) { return b.type === 'text'; })[0];
      if (!textBlock) throw new Error('読み取り結果が空でした。ピントと明るさを確認してもう一度撮影してください。');
      var parsed;
      try { parsed = JSON.parse(textBlock.text); }
      catch (e) { throw new Error('読み取り結果を解釈できませんでした。もう一度お試しください。'); }
      return { rows: parsed.rows || [], note: parsed.note || '' };
    });
  }

  /* ---------- 年度の割り当て ---------- */
  /* 会計期間の開始日から、月だけ分かっている行に西暦を割り当てる */
  function assignYear(month, day, openingDate) {
    var od = openingDate || '2025-04-01';
    var oy = parseInt(od.slice(0, 4), 10);
    var om = parseInt(od.slice(5, 7), 10);
    var y = (month >= om) ? oy : oy + 1;
    return y + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
  }

  /* ---------- 残高で検算 ---------- */
  /* rows[i].balance が入っていれば、直前の残高との差で金額を検証する */
  function reconcile(rows, startBalance) {
    var bal = startBalance;
    return rows.map(function (r) {
      var amt = (r.income || 0) - (r.expense || 0);
      var calc = bal + amt;
      var out = Object.assign({}, r);
      if (r.balance) {
        if (r.balance !== calc) {
          // 残高の方を正として金額を直せるか試す
          var diff = r.balance - bal;
          if (diff > 0 && !r.expense) { out.income = diff; out.expense = 0; out.fixed = true; }
          else if (diff < 0 && !r.income) { out.expense = -diff; out.income = 0; out.fixed = true; }
          else out.mismatch = true;
        }
        bal = r.balance;
      } else {
        bal = calc;
      }
      out.runningBalance = bal;
      return out;
    });
  }

  /* ================= 無料の読み取り（この端末の中だけで動く） =================
   * Tesseract.js（文字認識）を vendor/tesseract/ に同梱している。
   * 外部へは何も送らず、APIキーも要らない。ただし手書きの日本語は誤読が多いので、
   * 結果は必ず確認用の表に出して、人が直してから追記する。
   * 初回だけ ライブラリと日本語データ（約6MB）を読み込む。 */
  var VENDOR = 'vendor/tesseract/';
  var tessLoading = null;
  var worker = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('文字認識の部品を読み込めませんでした（' + src + '）')); };
      document.head.appendChild(s);
    });
  }

  /* 最初の1回だけ部品を用意して、同じ認識エンジンを使い回す */
  function getWorker(onProgress) {
    if (worker) return Promise.resolve(worker);
    if (!tessLoading) {
      tessLoading = (global.Tesseract ? Promise.resolve() : loadScript(VENDOR + 'tesseract.min.js'))
        .then(function () {
          return global.Tesseract.createWorker('jpn', 1, {
            workerPath: new URL(VENDOR + 'worker.min.js', global.location.href).href,
            corePath: new URL(VENDOR + 'tesseract-core-simd-lstm.wasm.js', global.location.href).href,
            langPath: new URL(VENDOR + 'lang', global.location.href).href,
            workerBlobURL: false,      // 同じ場所から直接読む
            cacheMethod: 'none',       // 保存は Service Worker に任せる
            logger: function (m) { if (onProgress) onProgress(m); }
          });
        })
        .then(function (w) { worker = w; return w; });
      tessLoading.catch(function () { tessLoading = null; });
    }
    return tessLoading;
  }

  /* 画像（dataURL）を文字にする。進み具合は onProgress({status, progress}) で知らせる */
  function recognize(dataUrl, onProgress) {
    return getWorker(onProgress).then(function (w) {
      return w.setParameters({ preserve_interword_spaces: '1', tessedit_pageseg_mode: '6' })
        .then(function () { return w.recognize(dataUrl); });
    }).then(function (res) { return (res && res.data && res.data.text) || ''; });
  }

  /* ---------- 文字 → 行 ---------- */
  var KAMOKU_RE = /^(収入|諸費|交際費|消耗品費?|交通費|大会補助|事業費|その他)(?:\(([^)]*)\)?)?/;
  var DATE_RE = /^\s*(?:(\d{4})\s*[\/\-.年]\s*)?(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?(?=\s|[^\d]|$)/;

  /* 文字認識の結果（または、スマホの「テキスト認識」でコピーした文字）を行に直す。
   * 日付で始まる行を1件の始まりとみなし、次の日付までを同じ行として読む。
   * 金額が2つ以上あるときは、直前の残高とのつながりで「金額」と「残高」を見分ける。
   * 自信がない行は uncertain を立てる（確認用の表で「要確認」と出る）。 */
  function parseText(text, startBalance) {
    var t = String(text || '')
      .replace(/[①-⑳㉑-㉟]/g, ' ')     // 丸数字（通し番号）は捨てる
      .normalize('NFKC')
      .replace(/[¥￥円]/g, ' ');
    // 3桁区切りのカンマを外す（1,200 → 1200）
    for (var k = 0; k < 3; k++) t = t.replace(/(\d),(\d{3})(?!\d)/g, '$1$2');

    var recs = [], cur = null;
    t.split(/\r?\n/).forEach(function (line) {
      var m = DATE_RE.exec(line);
      var mo = m && Number(m[2]), da = m && Number(m[3]);
      if (m && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
        cur = { month: mo, day: da, body: line.slice(m[0].length) };
        recs.push(cur);
      } else if (cur) {
        cur.body += ' ' + line;
      }
    });

    var bal = Number(startBalance) || 0;
    var rows = [];
    recs.forEach(function (rc) {
      // 空白区切りに分け、1文字ずつ離れて出た文字（「交 際 費」）はつなぎ直す
      var raw = rc.body.split(/[\s,、|｜]+/).filter(Boolean);
      var toks = [];
      var run = '';
      raw.forEach(function (tk) {
        if (tk.length === 1 && !/\d/.test(tk)) { run += tk; return; }
        if (run) { toks.push(run); run = ''; }
        toks.push(tk);
      });
      if (run) toks.push(run);

      var nums = [], words = [], kamoku = '', uchiwake = '';
      toks.forEach(function (tk) {
        if (/^-?\d+$/.test(tk)) { nums.push(Number(tk)); return; }
        var km = !kamoku && KAMOKU_RE.exec(tk);
        if (km) {
          kamoku = km[1] === '消耗品費' ? '消耗品' : km[1];
          uchiwake = (km[2] || '').trim();
          var rest = tk.slice(km[0].length).replace(/^\)/, '');
          if (rest) words.push(rest);
          return;
        }
        words.push(tk);
      });
      if (!nums.length) return;     // 金額が読めない行は表に出さない

      var income = 0, expense = 0, balance = 0, uncertain = !kamoku;
      var n = nums.length;
      var amt = nums[0];
      if (n >= 2) {
        var last = nums[n - 1], prev = nums[n - 2];
        if (last === bal + prev) { income = prev; balance = last; }
        else if (last === bal - prev) { expense = prev; balance = last; }
        else if (n >= 3 && last === bal + nums[n - 3] - prev) {      // 収入・支払・残高の3列
          income = nums[n - 3]; expense = prev; balance = last;
        } else { uncertain = true; }
      }
      if (!income && !expense) {
        // 残高で確かめられなかった：科目から収入か支出かを決める
        if (kamoku === '収入') income = amt; else expense = amt;
        if (n >= 2) uncertain = true;
      }
      bal = balance || (bal + income - expense);

      var tekiyo = words.join(' ').replace(/^[\s・:：.\-]+/, '').trim();
      rows.push({
        no: 0, month: rc.month, day: rc.day,
        kamoku: kamoku || 'その他', uchiwake: uchiwake || 'その他',
        tekiyo: tekiyo, income: income, expense: expense,
        balance: balance, uncertain: uncertain
      });
    });
    return rows;
  }

  global.OCR = {
    KAMOKU: KAMOKU,
    toBase64Jpeg: toBase64Jpeg,
    readImage: readImage,
    recognize: recognize,
    parseText: parseText,
    assignYear: assignYear,
    reconcile: reconcile
  };
})(window);

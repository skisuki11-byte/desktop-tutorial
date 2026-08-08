/* ocr.js — 売電の明細（検針票・購入電力量のお知らせ・振込通知）をカメラで撮って読み取る。
 *
 *  ブラウザから api.anthropic.com を直接叩くので
 *  anthropic-dangerous-direct-browser-access ヘッダを付けている。
 *  APIキーは端末の localStorage にだけ置き、送信先は api.anthropic.com のみ。
 *
 *  読み取った値はそのまま保存しない。必ず確認画面に出し、
 *  人が見てから「取り込む」を押したときだけ帳簿に入る。
 */
(function (global) {
  'use strict';

  var ENDPOINT = 'https://api.anthropic.com/v1/messages';
  var API_VERSION = '2023-06-01';
  var FALLBACK_BETA = 'server-side-fallback-2026-07-01';
  var MAX_EDGE = 2576;      // Claude の高解像度ビジョンの上限（長辺ピクセル）

  var PLANTS = ['市原発電所', '富津発電所', '竹原発電所'];

  /* ---------- 画像の下ごしらえ（縮小して base64 に） ---------- */
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

  /* ---------- 読み取り結果の形（構造化出力） ---------- */
  function schema() {
    return {
      type: 'object',
      properties: {
        readings: {
          type: 'array',
          description: '1枚の画像から読み取れた明細。ふつうは1件。複数月ぶんが写っていれば複数件',
          items: {
            type: 'object',
            properties: {
              plant: {
                type: 'string',
                enum: PLANTS.concat(['']),
                description: '発電所名。書面から特定できなければ空文字'
              },
              plantHint: {
                type: 'string',
                description: '発電所の判断に使った手がかり（住所・需給地点特定番号・お客さま番号など）。無ければ空文字'
              },
              year: { type: 'integer', description: '対象年（西暦4桁）。読めなければ0' },
              month: { type: 'integer', description: '対象月（1-12）。読めなければ0' },
              sales: { type: 'integer', description: '売電額（円・税込の受取額）。読めなければ0' },
              kwh: { type: 'integer', description: '発電量（買取電力量 kWh）。読めなければ0' },
              uncertain: { type: 'boolean', description: '数字がかすれる等、判読に自信がない場合 true' },
              note: { type: 'string', description: '気づいた点（消費税込／別、日割りなど）。無ければ空文字' }
            },
            required: ['plant', 'plantHint', 'year', 'month', 'sales', 'kwh', 'uncertain', 'note'],
            additionalProperties: false
          }
        },
        docType: { type: 'string', description: '書面の種類（購入電力量のお知らせ／振込明細／検針票など）。分からなければ空文字' }
      },
      required: ['readings', 'docType'],
      additionalProperties: false
    };
  }

  var PROMPT = [
    'これは日本の太陽光発電（FIT売電）の明細書の写真です。',
    '電力会社からの「購入電力量のお知らせ」「再生可能エネルギー買取のお知らせ」',
    '「振込通知書」「検針票」などが写っています。次の値を読み取ってJSONにしてください。',
    '',
    '読み取るもの:',
    '  ・対象年月（「2026年7月分」「令和8年7月分」など）',
    '  ・売電額（買取金額・お支払金額・振込額。円・整数）',
    '  ・発電量（買取電力量・購入電力量。kWh・整数）',
    '  ・どの発電所か',
    '',
    '発電所の見分け方（設備の所在地で判断してください）:',
    '  ・市原発電所 … 千葉県市原市。東京電力エリア。容量76kW',
    '  ・富津発電所 … 千葉県富津市。東京電力エリア。容量99kW',
    '  ・竹原発電所 … 広島県竹原市。中国電力エリア。容量97kW',
    '  住所や需給地点特定番号が読めない場合は plant を空文字にし、',
    '  plantHint に手がかりだけ書いてください（推測で決めないこと）。',
    '',
    '守ってほしいこと:',
    '1. 金額はカンマや「円」を除いた整数。消費税込の受取総額を sales に入れてください。',
    '2. 発電量は kWh の整数。小数があれば四捨五入してください。',
    '3. 元号（令和）で書かれていたら西暦に直してください（令和8年＝2026年）。',
    '4. 「◯月分」の月をそのまま month にしてください。検針日や振込日の月ではありません。',
    '5. 読めなかった項目は 0 のままにし、推測で埋めないでください。',
    '   かすれ・ピンボケで自信がない場合は uncertain を true にしてください。',
    '6. 明細が複数月ぶん写っている場合は、readings に月ごとに分けて入れてください。'
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
      method: 'POST', headers: headers, body: JSON.stringify(payload)
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
    if (status === 429) return '短い時間に送りすぎました。少し待ってからもう一度お試しください。';
    if (status >= 500) return 'Anthropic側で一時的なエラーが起きています（' + status + '）。少し待って再実行してください。';
    return m || ('読み取りに失敗しました（HTTP ' + status + '）');
  }

  /* 画像1枚を読み取って {readings, docType} を返す */
  function readImage(base64, apiKey, model) {
    var body = {
      model: model || 'claude-opus-5',
      max_tokens: 4000,
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
      var block = (msg.content || []).filter(function (b) { return b.type === 'text'; })[0];
      if (!block) throw new Error('読み取り結果が空でした。ピントと明るさを確かめて撮り直してください。');
      var parsed;
      try { parsed = JSON.parse(block.text); }
      catch (e) { throw new Error('読み取り結果を解釈できませんでした。もう一度お試しください。'); }
      return { readings: parsed.readings || [], docType: parsed.docType || '' };
    });
  }

  /* ---------- 読み取り結果の検算 ---------- */
  /* 過去の実績とかけ離れていないかを見て、取り込む前に注意を出す。
     単位の取り違え（100倍・1/10）や月の読み違いは、ここで大体つかまる。 */
  function sanity(r) {
    var warn = [];
    var p = r.plantId ? global.Store.plant(r.plantId) : null;

    if (!r.plantId) warn.push('発電所が特定できていません。選び直してください。');
    if (!(r.month >= 1 && r.month <= 12)) warn.push('対象月が読めていません。');
    if (!(r.year >= 2018 && r.year <= 2100)) warn.push('対象年が読めていません。');
    if (!r.sales && !r.kwh) warn.push('売電額も発電量も読み取れていません。');

    if (p && r.month >= 1 && r.month <= 12) {
      // 同じ月の過去実績を集めて、その幅と比べる
      var past = [];
      Object.keys(p.years).forEach(function (y) {
        var v = p.years[y].sales[r.month - 1];
        if (v) past.push(v);
      });
      if (past.length >= 2 && r.sales) {
        var lo = Math.min.apply(null, past), hi = Math.max.apply(null, past);
        if (r.sales < lo * 0.5 || r.sales > hi * 1.6) {
          warn.push('売電額が例年の' + r.month + '月（' +
            Math.round(lo).toLocaleString('ja-JP') + '〜' +
            Math.round(hi).toLocaleString('ja-JP') + '円）から外れています。桁を確かめてください。');
        }
      }
      // 単価から見た整合（売電額 ÷ kWh ≒ 単価）
      if (r.sales && r.kwh) {
        var unit = r.sales / r.kwh;
        if (unit < p.unit * 0.6 || unit > p.unit * 1.6) {
          warn.push('売電額÷発電量が ' + unit.toFixed(1) + '円/kWh で、契約単価 ' +
            p.unit + '円/kWh と合いません。どちらかの桁が違うかもしれません。');
        }
      }
    }

    var already = r.plantId && global.Store.cell(r.plantId, r.year, r.month);
    if (already && already.sales != null) {
      warn.push('その月にはすでに ' + Math.round(already.sales).toLocaleString('ja-JP') +
        '円が入っています。取り込むと置き換わります。');
    }
    return warn;
  }

  global.OCR = {
    PLANTS: PLANTS,
    toBase64Jpeg: toBase64Jpeg,
    readImage: readImage,
    sanity: sanity
  };
})(window);

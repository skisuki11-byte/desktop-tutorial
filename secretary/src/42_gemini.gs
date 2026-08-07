/**
 * Gemini（Googleの無料枠）で動かすときの中身。
 *
 * 会話の持ちかたが Anthropic と違うので、入口で一度だけ形を変えてから
 * あとはずっと Gemini の形のまま往復する。
 *
 *   Anthropic          Gemini
 *   role: assistant →  role: model
 *   tool_use        →  functionCall
 *   tool_result     →  functionResponse
 *   image           →  inlineData
 *
 * ⚠ 無料枠は、送った内容がGoogleの製品改善に使われます。
 *   それが困る場合は、課金を有効にするか PROVIDER を claude にしてください。
 */

var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

/** 道具つきで往復する */
function geminiRun_(system, messages, tools, userId) {
  var contents = toGeminiContents_(messages);
  var decls = (tools && tools.length) ? toolDeclsGemini_() : [];
  var used = [];

  for (var turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    var res = geminiCall_(system, contents, decls);

    // 安全側の判定で止められたとき
    var blocked = res.promptFeedback && res.promptFeedback.blockReason;
    if (blocked) {
      log_('gemini拒否', blocked);
      return { text: 'その内容にはお答えできませんでした。言いかたを変えてもう一度お願いします。', used: used };
    }

    var cand = (res.candidates || [])[0];
    if (!cand) return { text: '（返事を作れませんでした）', used: used };

    var parts = (cand.content && cand.content.parts) || [];
    contents.push({ role: 'model', parts: parts });

    var calls = parts.filter(function (p) { return p.functionCall; });

    if (!calls.length) {
      var text = parts
        .filter(function (p) { return p.text; })
        .map(function (p) { return p.text; })
        .join('\n')
        .trim();

      if (!text && cand.finishReason === 'MAX_TOKENS') {
        text = '（長くなりすぎて途中で切れました。分けて聞いてください）';
      }
      if (!text && cand.finishReason === 'SAFETY') {
        text = 'その内容にはお答えできませんでした。';
      }
      return { text: text || '（返事を作れませんでした）', used: used };
    }

    // 使いたいと言われた道具を、こちらで順に実行する
    var answers = calls.map(function (p) {
      var name = p.functionCall.name;
      used.push(name);
      var out;
      try {
        out = runTool_(name, p.functionCall.args || {}, userId);
      } catch (e) {
        out = { ok: false, error: String(e && e.message ? e.message : e) };
      }
      log_('tool:' + name, out);
      return { functionResponse: { name: name, response: out } };
    });
    contents.push({ role: 'user', parts: answers });
  }

  return { text: '（途中までしか進められませんでした。もう一度お願いできますか）', used: used };
}

/** 道具なしで一言だけ */
function geminiAsk_(system, userText) {
  var res = geminiCall_(system, [{ role: 'user', parts: [{ text: userText }] }], []);
  var cand = (res.candidates || [])[0];
  if (!cand) return '';
  return ((cand.content && cand.content.parts) || [])
    .filter(function (p) { return p.text; })
    .map(function (p) { return p.text; })
    .join('\n')
    .trim();
}

/* ---------------- 通信 ---------------- */

function geminiCall_(system, contents, decls) {
  requireBrainKey_();

  var payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: contents,
    generationConfig: { maxOutputTokens: MAX_TOKENS }
  };
  if (decls && decls.length) payload.tools = [{ functionDeclarations: decls }];

  var url = GEMINI_BASE + encodeURIComponent(cfg_('GEMINI_MODEL')) +
            ':generateContent?key=' + encodeURIComponent(cfg_('GEMINI_API_KEY'));

  var wait = 2000;   // 無料枠は1分あたりの回数が少ないので、少し長めに待つ
  for (var attempt = 1; attempt <= 4; attempt++) {
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code === 200) return JSON.parse(body);

    if (retryable_(code) && attempt < 4) {
      Utilities.sleep(wait);
      wait *= 2;
      continue;
    }

    log_('gemini失敗', code + ' ' + body);
    if (code === 404) {
      throw new Error('モデル名が違うようです（' + cfg_('GEMINI_MODEL') +
                      '）。listGeminiModels を実行して、使える名前を確かめてください。');
    }
    if (code === 429) {
      throw new Error('無料枠の回数上限に当たりました。少し時間をあけてください。');
    }
    throw new Error('Gemini API エラー (' + code + '): ' + truncate_(body, 300));
  }
  throw new Error('Gemini API に届きませんでした');
}

/* ---------------- 形の変換 ---------------- */

/** Anthropic の書き方の会話を、Gemini の contents に変える */
function toGeminiContents_(messages) {
  return messages.map(function (m) {
    var parts = [];
    if (typeof m.content === 'string') {
      if (m.content) parts.push({ text: m.content });
    } else {
      (m.content || []).forEach(function (b) {
        if (b.type === 'text' && b.text) {
          parts.push({ text: b.text });
        } else if (b.type === 'image' && b.source) {
          parts.push({ inlineData: { mimeType: b.source.media_type, data: b.source.data } });
        }
      });
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: parts };
  }).filter(function (c) { return c.parts.length; });
}

/**
 * 道具の説明を Gemini の書き方に変える。
 * Anthropic 側でだけ動く道具（web_search）は、こちらでは実行できないので外す。
 */
function toolDeclsGemini_() {
  return toolDefs_()
    .filter(function (t) { return !!t.input_schema; })
    .map(function (t) {
      return { name: t.name, description: t.description, parameters: t.input_schema };
    });
}

/* ---------------- 確認用 ---------------- */

/**
 * 自分の鍵で使えるモデルの名前を並べる。
 * 「モデル名が違う」と言われたら、これを実行してログを見て
 * スクリプト プロパティの GEMINI_MODEL を直してください。
 */
function listGeminiModels() {
  cfgRequire_(['GEMINI_API_KEY']);
  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' +
      encodeURIComponent(cfg_('GEMINI_API_KEY')),
    { muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    console.log('★ 取得できませんでした: ' + res.getContentText());
    return '★ 取得できませんでした';
  }
  var names = (tryParse_(res.getContentText(), {}).models || [])
    .filter(function (m) {
      return (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0;
    })
    .map(function (m) { return String(m.name).replace(/^models\//, ''); });

  console.log('使えるモデル:\n' + names.join('\n'));
  return names;
}

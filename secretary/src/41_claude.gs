/**
 * Claude（Anthropic）で動かすときの中身。PROVIDER = claude のときだけ使われる。
 *
 * Claude は「この道具を使いたい」と言ってくるだけで、実行はこちらの役目。
 * 実行結果を返してもう一度聞く、を答えが出るまで繰り返す。
 */

/** 送る中身を組み立てる。モデルと考える深さはここで一括して決める */
function buildPayload_(system, messages, tools) {
  var payload = {
    model: cfg_('MODEL'),
    max_tokens: MAX_TOKENS,
    output_config: { effort: cfg_('EFFORT') },
    system: system,
    messages: messages,
    fallbacks: 'default'      // 安全側の判定で断られたとき、別のモデルが引き受け直す
  };
  if (tools && tools.length) payload.tools = tools;
  return payload;
}

/** /v1/messages を叩く。混んでいるときは少し待って計3回まで試す */
function claudeCall_(payload) {
  requireBrainKey_();
  var wait = 1000;
  var useFallback = !!payload.fallbacks;

  for (var attempt = 1; attempt <= 4; attempt++) {
    var headers = {
      'x-api-key': cfg_('ANTHROPIC_API_KEY'),
      'anthropic-version': ANTHROPIC_VERSION
    };
    if (useFallback) headers['anthropic-beta'] = FALLBACK_BETA;

    var res = UrlFetchApp.fetch(ANTHROPIC_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code === 200) return JSON.parse(body);

    // 429（混雑）と5xx（向こうの不調）だけ待って試し直す
    if (retryable_(code) && attempt < 4) {
      Utilities.sleep(wait);
      wait *= 2;
      continue;
    }

    // 引き受け直しの仕組みだけが原因なら、それを外してもう一度だけ試す
    if (code === 400 && useFallback && /fallback|beta/i.test(body)) {
      log_('fallbackを外して再試行', truncate_(body, 200));
      delete payload.fallbacks;
      useFallback = false;
      continue;
    }

    log_('claude失敗', code + ' ' + body);
    throw new Error('Claude API エラー (' + code + '): ' + truncate_(body, 300));
  }
  throw new Error('Claude API に届きませんでした');
}

/**
 * 道具つきで一往復以上させ、最後の文章を返す。
 *
 * @param {string} system      指示文
 * @param {Array}  messages    会話（この配列は書き足される）
 * @param {Array}  tools       道具の定義。null なら道具なし
 * @param {string} userId      道具を実行するときの持ち主
 * @return {{text: string, used: Array}}  返事と、使った道具の名前
 */
function claudeRun_(system, messages, tools, userId) {
  var used = [];

  for (var turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    var res = claudeCall_(buildPayload_(system, messages, tools));
    messages.push({ role: 'assistant', content: res.content });

    // 安全側の判定で断られたとき。中身が空のことがあるので先に見る
    if (res.stop_reason === 'refusal') {
      return { text: 'その内容にはお答えできませんでした。言いかたを変えてもう一度お願いします。', used: used };
    }

    if (res.stop_reason !== 'tool_use') {
      var out = textOf_(res.content);
      if (!out && res.stop_reason === 'max_tokens') {
        out = '（長くなりすぎて途中で切れました。分けて聞いてください）';
      }
      return { text: out, used: used };
    }

    // 使いたいと言われた道具を、こちらで順に実行する
    var results = [];
    res.content.forEach(function (block) {
      if (block.type !== 'tool_use') return;
      used.push(block.name);
      var out;
      try {
        out = runTool_(block.name, block.input || {}, userId);
      } catch (e) {
        out = { ok: false, error: String(e && e.message ? e.message : e) };
      }
      log_('tool:' + block.name, out);
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(out),
        is_error: out && out.ok === false
      });
    });

    if (!results.length) return { text: textOf_(res.content), used: used };
    messages.push({ role: 'user', content: results });
  }

  // 上限まで回っても終わらなかったとき。今わかっている分だけ言わせる
  return { text: '（途中までしか進められませんでした。もう一度お願いできますか）', used: used };
}

/** 道具なしで一言だけ書かせたいとき（朝のお知らせ、ふりかえりなど） */
function claudeAsk_(system, userText) {
  var res = claudeCall_(buildPayload_(system, [{ role: 'user', content: userText }], null));
  if (res.stop_reason === 'refusal') return '';
  return textOf_(res.content);
}

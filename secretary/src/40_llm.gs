/**
 * 頭脳の窓口。どのAIを使うかは、ここ1か所で切り替わる。
 *
 *   PROVIDER = gemini … Googleの無料枠（既定）
 *   PROVIDER = claude … Anthropic。賢いが有料
 *
 * ほかのファイルは llmRun_ / llmAsk_ しか呼ばない。
 * 中身を差し替えても、道具も記憶も催促もそのまま動く。
 */

/**
 * 道具つきで考えさせ、最後の文章を返す。
 *
 * @param {string} system    指示文
 * @param {Array}  messages  会話。[{role:'user'|'assistant', content: 文字列 or ブロック配列}]
 * @param {Array}  tools     道具の定義（Anthropic の書き方）。null なら道具なし
 * @param {string} userId    道具を実行するときの持ち主
 * @return {{text: string, used: Array}}
 */
function llmRun_(system, messages, tools, userId) {
  normalize_(messages);
  return provider_() === 'claude'
    ? claudeRun_(system, messages, tools, userId)
    : geminiRun_(system, messages, tools, userId);
}

/** 道具なしで一言だけ書かせたいとき（朝のお知らせ、夜のふりかえり） */
function llmAsk_(system, userText) {
  return provider_() === 'claude'
    ? claudeAsk_(system, userText)
    : geminiAsk_(system, userText);
}

function provider_() {
  return String(cfg_('PROVIDER') || 'gemini').toLowerCase() === 'claude' ? 'claude' : 'gemini';
}

/** いま選んでいる頭脳に必要な鍵が入っているか確かめる */
function requireBrainKey_() {
  cfgRequire_(provider_() === 'claude' ? ['ANTHROPIC_API_KEY'] : ['GEMINI_API_KEY']);
}

/* ---------------- どちらでも使う小道具 ---------------- */

/**
 * 会話をAPIが受け取れる形に整える（配列そのものを書き換える）。
 * ・user と assistant が交互になっていないと弾かれるので、続いた分はつなぐ
 * ・先頭は user から始める
 */
function normalize_(messages) {
  while (messages.length && messages[0].role !== 'user') messages.shift();

  for (var i = messages.length - 1; i > 0; i--) {
    if (messages[i].role !== messages[i - 1].role) continue;
    var prev = messages[i - 1];
    var cur = messages[i];
    if (typeof prev.content === 'string' && typeof cur.content === 'string') {
      prev.content = prev.content + '\n' + cur.content;
    } else {
      prev.content = asBlocks_(prev.content).concat(asBlocks_(cur.content));
    }
    messages.splice(i, 1);
  }
  return messages;
}

function asBlocks_(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content || [];
}

/** 返ってきたブロックから文章だけ取り出してつなぐ */
function textOf_(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n')
    .trim();
}

/** 待ち時間を倍にしながら試し直す（混雑・向こうの不調のとき） */
function retryable_(code) {
  return code === 429 || code >= 500;
}

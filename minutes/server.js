// 議事録アプリのサーバー。依存ライブラリなし（Node 18+）。
// 役割は3つだけ:
//   1. public/ の静的配信
//   2. APIキーをブラウザに渡さないための中継（Deepgram / Claude / Notion）
//   3. 合言葉(ACCESS_TOKEN)による簡易認証 … 公開時にAPI課金を勝手に使われないため
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');

// ---------- .env 読み込み（依存なし） ----------
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* .env が無くてもよい */ }

const env = (k, d = '') => process.env[k] || d;
export const CONF = {
  host: env('HOST', '127.0.0.1'),
  port: Number(env('PORT', '8787')),
  token: env('ACCESS_TOKEN'),
  dgKey: env('DEEPGRAM_API_KEY'),
  anthropicKey: env('ANTHROPIC_API_KEY'),
  notionToken: env('NOTION_TOKEN'),
  notionParent: env('NOTION_PARENT'),
  modelLive: env('MODEL_LIVE', 'claude-haiku-4-5-20251001'),
  modelFinal: env('MODEL_FINAL', 'claude-sonnet-5-5'),
  // テスト用に差し替え可能
  dgBase: env('DEEPGRAM_BASE', 'https://api.deepgram.com'),
  anthropicBase: env('ANTHROPIC_BASE', 'https://api.anthropic.com'),
  notionBase: env('NOTION_BASE', 'https://api.notion.com'),
};

// ---------- 小道具 ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'content-type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, '送信データが大きすぎます');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}
async function readJson(req, limit = 4 * 1024 * 1024) {
  const buf = await readBody(req, limit);
  try { return JSON.parse(buf.toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'JSON が不正です'); }
}

function authorized(req) {
  if (!CONF.token) return true;
  const got = Buffer.from(String(req.headers['x-access-token'] || ''));
  const want = Buffer.from(CONF.token);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// 日本語の認識結果は単語間に不要な空白が入ることがある。CJK同士の間だけ詰める。
const CJK = '\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef';
export const tidyJa = (s) => s.replace(new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, 'g'), '');

// ---------- Deepgram ----------
async function dgToken() {
  if (!CONF.dgKey) throw new HttpError(503, 'DEEPGRAM_API_KEY が未設定です');
  const r = await fetch(`${CONF.dgBase}/v1/auth/grant`, {
    method: 'POST',
    headers: { authorization: `Token ${CONF.dgKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ ttl_seconds: 120 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new HttpError(502, `Deepgram のトークン発行に失敗しました（キーの権限は Member 以上が必要）: ${j.err_msg || j.message || r.status}`);
  }
  return { token: j.access_token };
}

async function dgTranscribe(req, lang) {
  if (!CONF.dgKey) throw new HttpError(503, 'DEEPGRAM_API_KEY が未設定です');
  const audio = await readBody(req, 400 * 1024 * 1024);
  if (!audio.length) throw new HttpError(400, '音声がありません');
  const q = new URLSearchParams({
    model: 'nova-3', language: lang, diarize: 'true', utterances: 'true',
    punctuate: 'true', smart_format: 'true',
  });
  const r = await fetch(`${CONF.dgBase}/v1/listen?${q}`, {
    method: 'POST',
    headers: { authorization: `Token ${CONF.dgKey}`, 'content-type': req.headers['content-type'] || 'audio/webm' },
    body: audio,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `文字起こしに失敗しました: ${j.err_msg || j.message || r.status}`);
  const utts = j.results?.utterances || [];
  return {
    segments: utts
      .filter((u) => (u.transcript || '').trim())
      .map((u) => ({ spk: String(u.speaker ?? 0), start: u.start, end: u.end, text: tidyJa(u.transcript.trim()) })),
  };
}

// ---------- Claude ----------
async function claude({ model, system, user, maxTokens }) {
  if (!CONF.anthropicKey) throw new HttpError(503, 'ANTHROPIC_API_KEY が未設定です');
  const r = await fetch(`${CONF.anthropicBase}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': CONF.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, `要約に失敗しました: ${j.error?.message || r.status}`);
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

export function parseJsonLoose(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new HttpError(502, '要約結果を解釈できませんでした');
  try { return JSON.parse(text.slice(a, b + 1)); }
  catch { throw new HttpError(502, '要約結果の JSON が壊れていました'); }
}

const asStrArr = (v, max = 30) => (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, max);
const asTodos = (v, max = 30) => (Array.isArray(v) ? v : []).map((x) => ({
  who: String(x?.who ?? '').trim(), what: String(x?.what ?? '').trim(), due: String(x?.due ?? '').trim(),
})).filter((x) => x.what).slice(0, max);

const LIVE_SYSTEM = `あなたは会議のリアルタイム書記です。音声認識の文字起こし（誤変換・言い淀みを含む）から、参加者が画面で一瞥して把握できる「要点メモ」を更新します。

ルール:
- 出力は JSON のみ。前置き・コードフェンス・解説は禁止。
- 文字起こしに無いことは書かない。推測で補わない。数字・日付・固有名詞は原文どおり。明らかな誤変換は文脈で直してよい。
- 「これまでの要点メモ」と「新しい発言」を統合して更新する。既出の重要事項は、新情報で訂正されない限り残す。読み切れる分量（points は最大8件・各60字以内）に保ち、古く重要度の低いものは統合・削除する。
- 話者は「話者A」などのラベルのまま扱う。
- 明確に合意・決定されたものだけを decisions に入れる。検討中の案は points に入れる。
- todos は「誰が・何を」が発言から読み取れるものだけ。担当が不明なら who は空文字。
- 「★」付きの行は参加者が重要と印を付けた箇所。優先して反映する。

JSON スキーマ:
{"topic":"いま話している議題（30字以内）","points":["要点"],"decisions":["決定事項"],"todos":[{"who":"話者A","what":"やること","due":"期限(あれば)"}],"questions":["未解決の論点"]}`;

const FINAL_SYSTEM = `あなたは優秀な議事録作成者です。会議の文字起こし（音声認識のため誤変換・言い淀みを含む）から、欠席者が読んでも経緯と結論が分かる議事録を作ります。

ルール:
- 出力は JSON のみ。前置き・コードフェンス・解説は禁止。
- 文字起こしに無いことは書かない。推測で補わない。数字・日付・固有名詞は原文どおり。不確かな箇所は「（要確認）」を付ける。
- 話者は「話者A」などのラベルのまま書く（後でユーザーが名前に置き換える）。
- overview は結論から先に、3文以内。
- topics は議題ごとに、議論の経緯ではなく「何が話され、何が分かったか」を箇条書き（各項目60字程度）。
- decisions は明確に合意されたことだけ。todos は担当(who)・内容(what)・期限(due)を発言から読み取れる範囲で。
- 「★」付きの行は参加者が重要と印を付けた箇所。必ず反映する。
- 雑談・言い直し・フィラーは省く。

JSON スキーマ:
{"title":"会議タイトル（30字以内）","overview":"概要","topics":[{"heading":"議題","bullets":["内容"]}],"decisions":["決定事項"],"todos":[{"who":"話者A","what":"やること","due":"期限"}],"open_issues":["未解決・持ち越し事項"],"next":"次回予定（あれば。なければ空文字）"}`;

async function liveSummary({ previous, delta }) {
  if (!String(delta || '').trim()) throw new HttpError(400, '発言がありません');
  const user = `# これまでの要点メモ\n${previous ? JSON.stringify(previous) : '（まだありません）'}\n\n# 新しい発言\n${String(delta).slice(-12000)}`;
  const o = parseJsonLoose(await claude({ model: CONF.modelLive, system: LIVE_SYSTEM, user, maxTokens: 1200 }));
  return {
    topic: String(o.topic ?? '').slice(0, 60),
    points: asStrArr(o.points, 10), decisions: asStrArr(o.decisions), todos: asTodos(o.todos), questions: asStrArr(o.questions, 10),
  };
}

async function finalMinutes({ transcript, meta }) {
  const text = String(transcript || '');
  if (text.trim().length < 20) throw new HttpError(400, '文字起こしが短すぎて議事録を作れません');
  let body = text;
  // 長時間会議: 分割して要点化 → 統合（1リクエストに収まらないケースの失敗を避ける）
  if (text.length > 90000) {
    const parts = [];
    for (let i = 0; i < text.length; i += 60000) parts.push(text.slice(i, i + 60000));
    const partial = [];
    for (const [i, p] of parts.entries()) {
      const o = await liveSummary({ previous: null, delta: p });
      partial.push(`## 第${i + 1}部\n${JSON.stringify(o)}`);
    }
    body = `（長時間の会議のため、区間ごとの要点メモを統合してください）\n${partial.join('\n')}`;
  }
  const head = `会議情報: ${meta?.date || ''} / 参加者ラベル: ${(meta?.speakers || []).join('、') || '不明'}\n\n`;
  const o = parseJsonLoose(await claude({ model: CONF.modelFinal, system: FINAL_SYSTEM, user: head + body, maxTokens: 4000 }));
  return {
    title: String(o.title ?? '').slice(0, 80),
    overview: String(o.overview ?? ''),
    topics: (Array.isArray(o.topics) ? o.topics : []).map((t) => ({ heading: String(t?.heading ?? ''), bullets: asStrArr(t?.bullets) })).filter((t) => t.heading || t.bullets.length).slice(0, 20),
    decisions: asStrArr(o.decisions), todos: asTodos(o.todos), open_issues: asStrArr(o.open_issues), next: String(o.next ?? ''),
  };
}

// ---------- Notion ----------
const NOTION_VERSION = '2022-06-28';
// URL は「タイトル-<32桁ID>?v=..」の形。タイトル末尾が a〜f だと ID と混ざるので、パス末尾に固定して取る。
const notionId = (s) => {
  const seg = String(s || '').trim().split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() || '';
  const m = seg.match(/([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})$/i);
  return m ? m[1].replace(/-/g, '') : '';
};

async function notion(method, p, body) {
  if (!CONF.notionToken) throw new HttpError(503, 'NOTION_TOKEN が未設定です');
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${CONF.notionBase}${p}`, {
      method,
      headers: { authorization: `Bearer ${CONF.notionToken}`, 'notion-version': NOTION_VERSION, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const hint = r.status === 404 ? '（保存先のページ/DBをインテグレーションに「接続」しているか確認してください）' : '';
      throw new HttpError(502, `Notion エラー: ${j.message || r.status}${hint}`);
    }
    return j;
  }
  throw new HttpError(502, 'Notion のレート制限に達しました。少し待って再実行してください');
}

const rich = (t) => {
  const s = String(t ?? '');
  const out = [];
  for (let i = 0; i < s.length; i += 1900) out.push({ type: 'text', text: { content: s.slice(i, i + 1900) } });
  return out.length ? out : [{ type: 'text', text: { content: '' } }];
};
const blk = (type, text, extra = {}) => ({ object: 'block', type, [type]: { rich_text: rich(text), ...extra } });

export function buildBlocks({ minutes: m, meta }) {
  const b = [];
  const info = [
    meta.date && `日時: ${meta.date}`,
    meta.duration && `所要: ${meta.duration}`,
    meta.participants?.length && `話者: ${meta.participants.join('、')}`,
  ].filter(Boolean).join('\n');
  if (info) b.push(blk('callout', info, { icon: { type: 'emoji', emoji: '🗓️' }, color: 'gray_background' }));
  if (m.overview) { b.push(blk('heading_2', '概要')); b.push(blk('paragraph', m.overview)); }
  if (m.decisions?.length) { b.push(blk('heading_2', '決定事項')); m.decisions.forEach((d) => b.push(blk('bulleted_list_item', d))); }
  if (m.todos?.length) {
    b.push(blk('heading_2', 'アクションアイテム'));
    m.todos.forEach((t) => b.push(blk('to_do', `${t.who ? `【${t.who}】` : ''}${t.what}${t.due ? `（期限: ${t.due}）` : ''}`, { checked: false })));
  }
  if (m.topics?.length) {
    b.push(blk('heading_2', '議題ごとの内容'));
    m.topics.forEach((t) => { if (t.heading) b.push(blk('heading_3', t.heading)); t.bullets.forEach((x) => b.push(blk('bulleted_list_item', x))); });
  }
  if (m.open_issues?.length) { b.push(blk('heading_2', '未解決・持ち越し')); m.open_issues.forEach((d) => b.push(blk('bulleted_list_item', d))); }
  if (m.next) { b.push(blk('heading_2', '次回')); b.push(blk('paragraph', m.next)); }
  return b;
}

async function saveToNotion({ title, minutes, transcript, meta }) {
  const parent = notionId(CONF.notionParent);
  if (!parent) throw new HttpError(503, 'NOTION_PARENT が未設定です（保存先の URL か ID）');
  if (!minutes) throw new HttpError(400, '議事録がありません');

  // 保存先がデータベースかページかを判定。DB はタイトル列名が固定でないので取得して探す。
  let parentObj; let props;
  try {
    const db = await notion('GET', `/v1/databases/${parent}`);
    const titleKey = Object.entries(db.properties || {}).find(([, v]) => v.type === 'title')?.[0] || 'Name';
    parentObj = { database_id: parent };
    props = { [titleKey]: { title: rich(title) } };
    // 「日付」型の列が1つだけあれば、会議日を入れる
    const dateCols = Object.entries(db.properties || {}).filter(([, v]) => v.type === 'date');
    if (dateCols.length === 1 && meta.dateISO) props[dateCols[0][0]] = { date: { start: meta.dateISO } };
  } catch (e) {
    if (!/is a page|not a database|Could not find database|接続/.test(String(e.message))) throw e;
    parentObj = { page_id: parent };
    props = { title: { title: rich(title) } };
  }

  const blocks = buildBlocks({ minutes, meta });
  const page = await notion('POST', '/v1/pages', { parent: parentObj, properties: props, children: blocks.slice(0, 100) });
  for (let i = 100; i < blocks.length; i += 100) {
    await sleep(350);
    await notion('PATCH', `/v1/blocks/${page.id}/children`, { children: blocks.slice(i, i + 100) });
  }

  // 全文は折りたたみ(toggle)の中へ。本文の可読性を保ったまま原文にも辿れる。
  const lines = (transcript || []).filter(Boolean);
  if (lines.length) {
    await sleep(350);
    const t = await notion('PATCH', `/v1/blocks/${page.id}/children`, {
      children: [
        { object: 'block', type: 'divider', divider: {} },
        { object: 'block', type: 'toggle', toggle: { rich_text: rich('文字起こし全文'), children: [] } },
      ],
    });
    const toggleId = t.results?.find((x) => x.type === 'toggle')?.id;
    for (let i = 0; toggleId && i < lines.length; i += 100) {
      await sleep(350);
      await notion('PATCH', `/v1/blocks/${toggleId}/children`, { children: lines.slice(i, i + 100).map((l) => blk('paragraph', l)) });
    }
  }
  return { url: page.url, id: page.id };
}

// ---------- ルーティング ----------
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

export async function handleApi(req, res, pathname, query) {
  if (pathname === '/api/config' && req.method === 'GET') {
    return send(res, 200, {
      stt: !!CONF.dgKey, llm: !!CONF.anthropicKey, notion: !!(CONF.notionToken && CONF.notionParent),
      authRequired: !!CONF.token, authorized: authorized(req),
    });
  }
  if (!authorized(req)) throw new HttpError(401, '合言葉が違います');
  if (req.method !== 'POST') throw new HttpError(405, 'Method Not Allowed');

  switch (pathname) {
    case '/api/stt-token': return send(res, 200, await dgToken());
    case '/api/transcribe': return send(res, 200, await dgTranscribe(req, /^[a-z-]{2,8}$/i.test(query.get('lang') || '') ? query.get('lang') : 'ja'));
    case '/api/summarize': return send(res, 200, await liveSummary(await readJson(req)));
    case '/api/minutes': return send(res, 200, await finalMinutes(await readJson(req, 8 * 1024 * 1024)));
    case '/api/notion': return send(res, 200, await saveToNotion(await readJson(req, 8 * 1024 * 1024)));
    default: throw new HttpError(404, 'Not Found');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    try {
      if (u.pathname.startsWith('/api/')) await handleApi(req, res, u.pathname, u.searchParams);
      else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(req, res, u.pathname);
      else send(res, 405, 'Method Not Allowed');
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500 && !e.status) console.error(e);
      if (!res.headersSent) send(res, status, { error: e.message || 'Internal Error' });
      else res.end();
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer().listen(CONF.port, CONF.host, () => {
    const on = (b) => (b ? '✔' : '✘ 未設定');
    console.log(`議事録アプリ http://${CONF.host === '0.0.0.0' ? 'localhost' : CONF.host}:${CONF.port}`);
    console.log(`  文字起こし(Deepgram) ${on(CONF.dgKey)} / 要約(Claude) ${on(CONF.anthropicKey)} / Notion ${on(CONF.notionToken && CONF.notionParent)}`);
    if (CONF.host !== '127.0.0.1' && !CONF.token) console.warn('  ⚠ 外部に公開する設定ですが ACCESS_TOKEN が未設定です。APIキーの課金を第三者に使われる恐れがあります。');
  });
}

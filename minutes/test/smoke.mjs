// サーバーの結合テスト。Deepgram / Claude / Notion を偽サーバーに差し替えて、
// 認証・要約のJSON解釈・Notionのブロック生成/分割送信・文字起こしの整形を検証する。
import http from 'node:http';
import assert from 'node:assert/strict';

const calls = [];
const mock = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks); let body; try { body = JSON.parse(raw.toString()); } catch { body = null; }
  calls.push({ m: req.method, u: req.url, body, len: raw.length, h: req.headers });
  const out = (o, s = 200) => { res.writeHead(s, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url.startsWith('/v1/auth/grant')) return out({ access_token: 'tmp-token', expires_in: 120 });
  if (req.url.startsWith('/v1/listen')) return out({ results: { utterances: [{ speaker: 0, start: 0, end: 2, transcript: 'こんにちは 、 始めます' }, { speaker: 1, start: 2, end: 3, transcript: 'はい' }] } });
  if (req.url === '/v1/messages') {
    const sys = body.system;
    const j = sys.includes('リアルタイム書記')
      ? { topic: '議題', points: ['要点1'], decisions: [], todos: [{ who: '話者A', what: 'やる' }], questions: [] }
      : { title: '定例', overview: '概要', topics: [{ heading: 'H', bullets: ['b'] }], decisions: ['d'], todos: [{ who: '話者A', what: 't', due: '明日' }], open_issues: [], next: '' };
    return out({ content: [{ type: 'text', text: '```json\n' + JSON.stringify(j) + '\n```' }] });
  }
  if (req.url.startsWith('/v1/databases/')) return out({ properties: { 名前: { type: 'title' }, 日付: { type: 'date' } } });
  if (req.url === '/v1/pages') return out({ id: 'page1', url: 'https://notion.so/page1' });
  if (req.url === '/v1/blocks/page1/children') return out({ results: [{ id: 'tog', type: 'toggle' }] });
  if (req.url === '/v1/blocks/tog/children') return out({ results: [] });
  out({ message: 'nf' }, 404);
});
await new Promise((r) => mock.listen(0, r));
const base = `http://127.0.0.1:${mock.address().port}`;
Object.assign(process.env, {
  DEEPGRAM_API_KEY: 'dg', ANTHROPIC_API_KEY: 'an', NOTION_TOKEN: 'nt', NOTION_PARENT: 'https://www.notion.so/My-DB-0123456789abcdef0123456789abcdef?v=1',
  ACCESS_TOKEN: 'secret', DEEPGRAM_BASE: base, ANTHROPIC_BASE: base, NOTION_BASE: base,
});
const { createServer, buildBlocks } = await import('../server.js');
const srv = createServer(); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;
const post = (p, body, tok = 'secret', raw) => fetch(url + p, { method: 'POST', headers: { 'x-access-token': tok, ...(raw ? { 'content-type': 'audio/webm' } : { 'content-type': 'application/json' }) }, body: raw || JSON.stringify(body) });

// 認証
assert.equal((await post('/api/summarize', {}, 'wrong')).status, 401);
const cfg = await (await fetch(url + '/api/config')).json();
assert.deepEqual([cfg.stt, cfg.llm, cfg.notion, cfg.authRequired, cfg.authorized], [true, true, true, true, false]);
// 静的ファイル: .env や server.js は配信されない
assert.ok([403, 404].includes((await fetch(url + '/..%2fserver.js')).status));
assert.equal((await fetch(url + '/')).status, 200);
// STT トークン
assert.equal((await (await post('/api/stt-token', {})).json()).token, 'tmp-token');
// 高精度再解析: CJK間の空白が詰まる
const tr = await (await post('/api/transcribe?lang=ja', null, 'secret', Buffer.from('audio'))).json();
assert.equal(tr.segments[0].text, 'こんにちは、始めます');
assert.equal(tr.segments[1].spk, '1');
// ライブ要約 / 議事録（コードフェンス付きでも解釈できる）
const live = await (await post('/api/summarize', { previous: null, delta: '話者A: こんにちは' })).json();
assert.equal(live.points[0], '要点1'); assert.equal(live.todos[0].who, '話者A');
const min = await (await post('/api/minutes', { transcript: '話者A: '.padEnd(60, 'あ'), meta: { speakers: ['話者A'] } })).json();
assert.equal(min.decisions[0], 'd');
assert.equal((await post('/api/minutes', { transcript: '短い' })).status, 400);
// Notion: DB判定→タイトル列名→日付列→全文toggleを100件ずつ
const lines = Array.from({ length: 230 }, (_, i) => `行${i}`);
const sv = await (await post('/api/notion', { title: 'T', minutes: min, transcript: lines, meta: { date: 'd', dateISO: '2026-09-30T00:00:00Z', participants: ['山田'] } })).json();
assert.equal(sv.url, 'https://notion.so/page1');
const page = calls.find((c) => c.u === '/v1/pages').body;
assert.equal(page.parent.database_id, '0123456789abcdef0123456789abcdef');
assert.ok(page.properties['名前'] && page.properties['日付'].date.start);
assert.equal(calls.filter((c) => c.u === '/v1/blocks/tog/children').length, 3);   // 230行 → 100/100/30
// 長文は2000字制限を超えないよう分割
const big = buildBlocks({ minutes: { overview: 'あ'.repeat(4500), topics: [], decisions: [], todos: [], open_issues: [], next: '' }, meta: {} });
assert.ok(big.every((b) => b[b.type].rich_text.every((r) => r.text.content.length <= 2000)));
console.log('smoke: all passed');
srv.close(); mock.close();

// 集計先（lib/core.js）のテスト。本物の PostgreSQL を使う（Neon と同じ種類のデータベース）。
// 実行：TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db node tests/core.test.js
// ※ テストのたびにテーブルの中身を消すので、本番のデータベースには絶対につながないこと
'use strict';
const assert = require('assert');
const { Pool } = require('pg');
const { createCore, parseCookies, MINE_COOKIE, OFFICER_COOKIE, _test } = require('../lib/core');

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.log('TEST_DATABASE_URL がないので、データベースのテストは飛ばします'); process.exit(0); }
if (/neon\.tech|vercel/i.test(url)) { console.error('本番らしいデータベースにはつながない'); process.exit(1); }

const C = (o) => Object.assign({ '0104-adult': 0, '0104-student': 0, '0105-adult': 0, '0105-student': 0, '0106-adult': 0, '0106-student': 0 }, o);

(async () => {
  const pool = new Pool({ connectionString: url, max: 5 });
  await pool.query('drop table if exists entries, settings, counters');
  let clock = new Date();
  const core = createCore({ db: pool, env: { ADMIN_PASS: 'ビビビ' }, now: () => clock });
  // ブラウザの代わり：届いた Set-Cookie を覚えて、次の問い合わせで送る
  function browser() {
    const jar = {};
    return {
      jar,
      async call(d) {
        const r = await core.handle(Object.assign({ app: 'ticket' }, d), { cookies: Object.assign({}, jar) });
        r.cookies.forEach((c) => {
          const [kv, ...attrs] = c.split('; ');
          const i = kv.indexOf('='), k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
          if (attrs.indexOf('Max-Age=0') >= 0) delete jar[k]; else jar[k] = v;
          assert.ok(attrs.indexOf('HttpOnly') >= 0 && attrs.indexOf('Secure') >= 0 && attrs.indexOf('SameSite=Lax') >= 0, 'クッキーは HttpOnly・Secure・SameSite=Lax');
        });
        return r.body;
      }
    };
  }
  const fam = browser(), other = browser(), officer = browser();
  let r, a;

  // 申し込み
  r = await fam.call({ action: 'submit', name: '山田 花子', courtname: 'ニコ', counts: C({ '0104-adult': 2, '0104-student': 1, '0106-adult': 2 }), requestId: 'q1' });
  assert.ok(r.ok && r.item.id === 1 && r.token);
  assert.strictEqual(r.item.total, 5); assert.strictEqual(r.item.amount, 2000 * 4 + 1500);
  a = r;
  assert.ok(fam.jar[MINE_COOKIE], '申し込むと合札のクッキーが渡る');
  console.log('ok 申し込むと受付番号1・合鍵・合札のクッキーが返り、枚数5・金額 ¥9,500 になる');

  // 同じ requestId は1件にまとまる
  r = await fam.call({ action: 'submit', name: '山田 花子', courtname: 'ニコ', counts: C({ '0104-adult': 2 }), requestId: 'q1' });
  assert.strictEqual(r.item.id, 1);
  assert.strictEqual((await pool.query('select count(*)::int n from entries')).rows[0].n, 1);
  console.log('ok 通信のやり直しで同じ申し込みが2回届いても1件');

  // 端末の保存が消えても、クッキーの合札から自分の申し込みが戻る（合鍵も返る）
  r = await fam.call({ action: 'mine', items: [] });
  assert.strictEqual(r.items.length, 1); assert.strictEqual(r.items[0].id, 1); assert.strictEqual(r.items[0].token, a.token);
  r = await other.call({ action: 'mine', items: [] });
  assert.strictEqual(r.items.length, 0, 'ほかの人のスマホには出ない');
  r = await other.call({ action: 'mine', items: [{ id: 1, token: 'wrong' }] });
  assert.strictEqual(r.items.length, 0, '合鍵が違えば見られない');
  console.log('ok ページの保存が消えても、クッキーの合札から自分の申し込みが戻る（他人のは見えない）');

  // 修正・取り消し
  r = await other.call({ action: 'update', id: 1, token: 'wrong', name: 'x', counts: C({ '0104-adult': 1 }) });
  assert.strictEqual(r.error, 'not_found');
  r = await fam.call({ action: 'update', id: 1, token: a.token, name: '山田 花子', courtname: 'ニコ', counts: C({ '0105-adult': 3 }) });
  assert.ok(r.ok); assert.strictEqual(r.item.total, 3); assert.strictEqual(r.item.amount, 6000);
  r = await fam.call({ action: 'cancel', id: 1, token: a.token });
  assert.strictEqual(r.item.status, 'cancelled');
  r = await fam.call({ action: 'update', id: 1, token: a.token, name: '山田 花子', counts: C({ '0105-adult': 1 }) });
  assert.strictEqual(r.item.status, 'active', '取り消し後に直すと有効に戻る');
  console.log('ok 修正・取り消しは合鍵がある人だけ、修正すると有効に戻る');

  // 入力のチェック
  for (const bad of [
    { name: '', counts: C({ '0104-adult': 1 }) }, { name: 'x'.repeat(41), counts: C({ '0104-adult': 1 }) },
    { name: 'a', counts: C({}) }, { name: 'a', counts: C({ '0104-adult': 51 }) }, { name: 'a', counts: C({ '0104-adult': -1 }) },
    { name: 'a', counts: C({ '0104-adult': '1e2' }) }, { name: 'a', grade: 4, counts: C({ '0104-adult': 1 }) }
  ]) assert.strictEqual((await other.call(Object.assign({ action: 'submit' }, bad))).error, 'invalid', JSON.stringify(bad));
  r = await other.call({ action: 'submit', name: '全角', counts: C({ '0104-adult': '２' }), grade: '１年' });
  assert.ok(r.ok); assert.strictEqual(r.item.total, 2); assert.strictEqual(r.item.grade, 1);
  r = await other.call({ action: 'submit', name: 'ボット', website: 'http://spam', counts: C({ '0104-adult': 1 }) });
  assert.ok(r.ok && r.item.id === 0, 'ボット（見えない欄に入力）は保存しない');
  console.log('ok おかしな入力は受け付けない・全角数字は読める・ボットは保存しない');

  // 学年：送らない修正では消えない
  r = await other.call({ action: 'mine', items: [] });
  const g = r.items.find((x) => x.name === '全角');
  r = await other.call({ action: 'update', id: g.id, token: g.token, name: '全角', counts: C({ '0104-adult': 1 }) });
  assert.strictEqual(r.item.grade, 1);
  console.log('ok 学年を送らない修正では、入っている学年は消えない');

  // 役員
  assert.strictEqual((await officer.call({ action: 'admin_list', pass: 'ちがう' })).error, 'wrong_pass');
  r = await officer.call({ action: 'admin_list', pass: 'びびび' });
  assert.ok(r.ok, 'ひらがな・カタカナの違いは同じとみなす'); assert.strictEqual(r.items.length, 2); assert.strictEqual(r.version, 3);
  assert.strictEqual(r.items[0].paid, false); assert.ok(!('token' in r.items[0]), '役員の一覧に合鍵は出さない');
  r = await officer.call({ action: 'admin_save', pass: 'ビビビ', officer: '佐藤', id: 1, patch: { paid: true, memo: '=1+1' } });
  assert.ok(r.item.paid && /^佐藤 \d+\/\d+ \d+:\d\d$/.test(r.item.paidBy)); assert.strictEqual(r.item.memo, '=1+1');
  r = await officer.call({ action: 'admin_save', pass: 'ビビビ', id: 1, patch: { name: '山田 花子', counts: C({ '0106-student': 2 }) } });
  assert.strictEqual(r.item.amount, 3000); assert.ok(r.item.paid, '内容を直しても集金の記録は残る');
  r = await officer.call({ action: 'admin_add', pass: 'ビビビ', officer: '佐藤', name: '代わり', counts: C({ '0104-adult': 1 }), memo: 'LINEで受付', requestId: 'z1' });
  assert.strictEqual(r.item.source, 'admin'); assert.strictEqual(r.item.memo, 'LINEで受付');
  assert.strictEqual((await officer.call({ action: 'admin_save', pass: 'ビビビ', id: 999, patch: { paid: true } })).error, 'not_found');
  console.log('ok 役員：合言葉の表記ゆれは同じとみなす・集金の記録に名前と日時・修正・代わりに追加ができる');

  // 役員の名前を覚える／消す
  await officer.call({ action: 'admin_list', pass: 'ビビビ', remember: '佐藤' });
  assert.strictEqual(officer.jar[OFFICER_COOKIE], '佐藤');
  assert.strictEqual((await officer.call({ action: 'officer' })).officer, '佐藤');
  await officer.call({ action: 'admin_list', pass: 'ビビビ', remember: '' });
  assert.ok(!(OFFICER_COOKIE in officer.jar));
  assert.strictEqual((await other.call({ action: 'admin_list', pass: 'ちがう', remember: '悪者' })).error, 'wrong_pass');
  assert.ok(!(OFFICER_COOKIE in other.jar), '合言葉が違えば名前も残さない');
  console.log('ok 役員の名前だけをクッキーに覚える／外せる（合言葉は覚えない）');

  // 締め切り
  const ymd = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
  assert.strictEqual((await fam.call({ action: 'admin_settings', pass: 'ちがう', deadline: ymd(Date.now()) })).error, 'wrong_pass');
  assert.strictEqual((await officer.call({ action: 'admin_settings', pass: 'ビビビ', deadline: '2026-02-30' })).error, 'invalid');
  r = await officer.call({ action: 'admin_settings', pass: 'ビビビ', deadline: ymd(Date.now()) });
  assert.strictEqual(r.deadline, ymd(Date.now()));
  assert.strictEqual((await fam.call({ action: 'ping' })).deadline, ymd(Date.now()));
  assert.ok((await other.call({ action: 'submit', name: '当日', counts: C({ '0104-adult': 1 }) })).ok);
  await officer.call({ action: 'admin_settings', pass: 'ビビビ', deadline: ymd(Date.now() - 86400e3) });
  assert.strictEqual((await other.call({ action: 'submit', name: '締切後', counts: C({ '0104-adult': 1 }) })).error, 'closed');
  assert.strictEqual((await fam.call({ action: 'update', id: 1, token: a.token, name: 'x', counts: C({ '0104-adult': 1 }) })).error, 'closed');
  assert.strictEqual((await fam.call({ action: 'cancel', id: 1, token: a.token })).error, 'closed');
  assert.ok((await officer.call({ action: 'admin_save', pass: 'ビビビ', id: 1, patch: { handed: true } })).ok, '役員は締め切り後も操作できる');
  assert.ok((await fam.call({ action: 'mine', items: [] })).items.length, '締め切り後も自分の申し込みは見られる');
  await officer.call({ action: 'admin_settings', pass: 'ビビビ', deadline: '' });
  assert.ok((await other.call({ action: 'submit', name: '再開後', counts: C({ '0104-adult': 1 }) })).ok);
  console.log('ok 締め切り：当日 23:59 までは受付・過ぎたら家庭の申し込み/修正/取り消しを止める（役員はできる）・なくせば再開');

  // 合言葉の総当たり：10分に20回まで
  for (let i = 0; i < 25; i++) await other.call({ action: 'admin_login', pass: 'x' + i });
  assert.strictEqual((await officer.call({ action: 'admin_login', pass: 'ビビビ' })).error, 'locked');
  await pool.query("update counters set expires = now() - interval '1 second' where key = 'fail'");
  assert.ok((await officer.call({ action: 'admin_login', pass: 'ビビビ' })).ok);
  console.log('ok 合言葉を何度も間違えると10分止まり、時間がたてば戻る');

  // 合言葉が未設定なら誰も入れない・知らない操作は断る
  const noPass = createCore({ db: pool, env: {} });
  assert.strictEqual((await noPass.handle({ app: 'ticket', action: 'admin_list', pass: '' }, { cookies: {} })).body.error, 'no_pass');
  assert.strictEqual((await core.handle({ app: 'towel', action: 'ping' }, { cookies: {} })).body.error, 'bad_request');
  assert.strictEqual((await core.handle({ app: 'ticket', action: 'drop_all' }, { cookies: {} })).body.error, 'bad_request');
  // 壊れたクッキーは無視する
  assert.deepStrictEqual((await core.handle({ app: 'ticket', action: 'mine', items: [] }, { cookies: { [MINE_COOKIE]: '%%%' } })).body.items, []);
  assert.deepStrictEqual(parseCookies('a=1; b=%E3%81%82; bad'), { a: '1', b: 'あ' });
  console.log('ok 合言葉が未設定なら誰も入れない・別アプリや知らない操作は断る・壊れたクッキーは無視');

  // 同時に申し込んでも番号が重ならない
  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => browser().call({ action: 'submit', name: '同時' + i, counts: C({ '0104-adult': 1 }), requestId: 'p' + i })));
  const ids = many.map((x) => x.item.id);
  assert.strictEqual(new Set(ids).size, 20);
  console.log('ok 20人が同時に申し込んでも、受付番号は重ならない');

  assert.strictEqual(_test.tokyo(new Date('2026-11-05T23:59:00Z')), '11/6 8:59');
  console.log('ok 記録の日時は日本時間');

  await pool.end();
  console.log('\nすべて成功');
})().catch((e) => { console.error(e); process.exit(1); });

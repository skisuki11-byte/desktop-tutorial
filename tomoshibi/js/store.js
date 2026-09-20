/* store.js — ともしび の保存層。
 *
 * 前の版は写真が入らなかった。原因は2つで、どちらもここで直している:
 *   1. IndexedDB が使えない環境（埋め込み表示、iOS Safari のサードパーティ制限）で
 *      保存が失敗していた → 使えるかを起動時に必ず確かめ、写真は localStorage に逃がす
 *   2. 失敗しても誰も受け取っていなかった → すべての保存は必ず解決し、
 *      失敗は {ok:false, reason} で返す。黙って止まる経路をなくす
 *
 * 通信は一切しない。すべて端末の中だけで完結する。
 */
(function (global) {
  'use strict';

  var KEY = 'tomoshibi.v2';

  function blank() {
    return {
      onboarded: false,
      pet: {
        name: '', kind: 'dog', deathISO: '', birthISO: '', faves: [],
        kaimyo: '',        // お寺からいただいたものがあれば、ここへ。空ならアプリが選んだ名
        kaimyoOff: false,  // 戒名になじみのない人もいる。出さないこともできる
        scene: 'auto',     // トップの絵の配色。auto=実際の今の季節／spring/summer/autumn/winter
        message: '',       // トップいちばん上の一言。空なら既定の「いつまでも家族だよ」を出す
        ashesShowPhoto: false, // 納骨のお骨の写真の見せ方。false=骨壺のイラスト（既定）、true=登録した実物の写真
        faceX: 0.5, faceY: 0.5, faceZoom: 1   // 遺影の位置・大きさ（0〜1・1〜2.5）。既定は中央・そのまま
      },
      selfLog: {},         // { "2026-09-14": 3 } その日の自分。1〜5
      letters: [],         // 飼い主からあの子へ書いた手紙 [{at, text}]
      faveDone: {},        // { "2026-09-14": ["さつまいも"] } その日そなえたもの
      visits: [],          // お参りした日 "YYYY-MM-DD"。通算回数はこの長さ
      videoThumbs: {},     // { mediaId: "data:image/jpeg;base64,…" } 最初のコマの静止画
      chapterTitles: {},
      theme: 'light',
      openingOff: false,  // オープニング画面。既定は毎回表示、設定でoffにできる
      notifyMilestones: false, // 大事な日のお知らせ（ネイティブ版のみ）。既定はオフ
      echoDismissedOn: '' // 手紙のこだまを、その日だけ閉じた日付。翌日以降は関係なく戻る
    };
  }

  var stale = false;       // 古い設定を落としたら、その場で書き戻す
  var state = load();
  if (stale) save();

  /* 保存の中身が期待した形かを確かめ、違えば既定値に戻す（追記67）。
     保存が壊れる道は現実にある——書き込みの途中で端末の空きが尽きた、
     古い版の保存が残っている、他の端末で書いたバックアップを読み込んだ、など。
     形が違うまま画面を描くと `visits.forEach is not a function` のように
     途中で落ち、その画面がまるごと出なくなる。ここで直しておけば、
     壊れたぶんだけ既定に戻って、残りは今まで通り開ける。 */
  function coerce(v, base) {
    Object.keys(base).forEach(function (k) {
      var want = base[k], got = v[k];
      var ok;
      if (Array.isArray(want)) ok = Array.isArray(got);
      else if (want === null) ok = true;                     // 形を決めていないもの
      else if (typeof want === 'object') ok = got !== null && typeof got === 'object' && !Array.isArray(got);
      else ok = typeof got === typeof want;
      if (!ok) { v[k] = Array.isArray(want) ? [] : (typeof want === 'object' ? {} : want); stale = true; }
    });
    return v;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      var v = JSON.parse(raw), base = blank();
      if (!v || typeof v !== 'object' || Array.isArray(v)) return blank();
      if (!v.pet || typeof v.pet !== 'object' || Array.isArray(v.pet)) { v.pet = blank().pet; stale = true; }
      // 章ごとに隠す機能はやめた。古い保存に残っていても、もう見ない。
      // 消して書き戻さないと、バックアップに死んだ設定が混ざり続ける。
      if ('photoHidden' in v) { delete v.photoHidden; stale = true; }
      // 季節のおそなえ機能はやめた（追記56）。古い保存に残っていても、もう見ない。
      if ('seasonal' in v) { delete v.seasonal; stale = true; }
      // 好きだったものの上限を3つから2つにした（追記57）。それより前に
      // 3つ登録していた保存が残っていれば、先頭2つだけ残す。
      if (v.pet && Array.isArray(v.pet.faves) && v.pet.faves.length > 2) {
        v.pet.faves = v.pet.faves.slice(0, 2);
        stale = true;
      }
      // おうちの背景は既定が「夏」固定だったが、実際の季節に自動で
      // 合わせる「自動」を既定にした（追記65）。既定のまま一度も
      // 触っていない保存（scene==='summer'）は「自動」に引き上げる。
      // 明示的に夏を選び直した場合も同じ値になってしまうが、設定画面
      // からいつでも選び直せるので実害は小さいと判断した。
      if (v.pet && v.pet.scene === 'summer') { v.pet.scene = 'auto'; stale = true; }
      // 背景を「庭・夕空・桜・雪」から、春夏秋冬の4つに作り直した。
      // 前の名のまま残っていると、どのCSSにも一致せず既定色に戻ってしまう
      // ため、対応する季節へ付け替える。
      var SCENE_RENAME = { garden: 'summer', sunset: 'autumn', sakura: 'spring', snow: 'winter' };
      if (v.pet && SCENE_RENAME[v.pet.scene]) { v.pet.scene = SCENE_RENAME[v.pet.scene]; stale = true; }
      Object.keys(base).forEach(function (k) { if (!(k in v)) v[k] = base[k]; });
      Object.keys(base.pet).forEach(function (k) { if (!(k in v.pet)) v.pet[k] = base.pet[k]; });
      coerce(v, base);
      coerce(v.pet, base.pet);
      // 日付として読めない記録は、置いておくと日付の計算のたびに落ちる。
      v.visits = v.visits.filter(function (d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); });
      v.letters = v.letters.filter(function (m) { return m && typeof m === 'object' && typeof m.text === 'string'; });
      return v;
    } catch (e) { return blank(); }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

  /* ============ 日付 ============
     ローカル時刻の「日」として扱う。UTCに直すと日本時間の朝が前日になる。 */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) {
    if (!s) return null;
    var p = String(s).split('-');
    if (p.length < 3) return null;
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function addMonths(d, n) {
    var y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
    var last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, last));
  }
  function addYears(d, n) { return addMonths(d, n * 12); }
  function diffDays(a, b) {
    var x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    var y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((y - x) / 86400000);
  }
  function today() {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  var WEEK = ['日', '月', '火', '水', '木', '金', '土'];
  function formatJP(d, w) {
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日' + (w ? '（' + WEEK[d.getDay()] + '）' : '');
  }
  function formatMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '曜日'; }
  function formatShort(d) { return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(); }

  /* ============ 節目 ============ */
  function nextAnniversary(base, from) {
    for (var i = 0; i < 3; i++) {
      var last = new Date(from.getFullYear() + i, base.getMonth() + 1, 0).getDate();
      var c = new Date(from.getFullYear() + i, base.getMonth(), Math.min(base.getDate(), last));
      if (diffDays(from, c) >= 0) return c;
    }
    return null;
  }
  function nextMonthly(death, from) {
    var c = new Date(from.getFullYear(), from.getMonth(), 1);
    for (var i = 0; i < 14; i++) {
      var last = new Date(c.getFullYear(), c.getMonth() + 1, 0).getDate();
      var cand = new Date(c.getFullYear(), c.getMonth(), Math.min(death.getDate(), last));
      if (diffDays(from, cand) >= 0 && diffDays(death, cand) > 0) return cand;
      c = addMonths(c, 1);
    }
    return null;
  }

  /* 四十九日＝命日の48日後、三回忌＝満2年。日本の数え方に合わせる。 */
  function milestones(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return [];
    var out = [];
    function push(key, label, date, note) {
      if (!date) return;
      var n = diffDays(from, date);
      if (n < 0) return;
      out.push({ key: key, label: label, date: date, days: n, note: note || '' });
    }
    push('d49', '四十九日', addDays(death, 48), formatJP(addDays(death, 48), true));
    push('d100', '百か日', addDays(death, 99), formatJP(addDays(death, 99), true));
    var mm = nextMonthly(death, from);
    push('monthly', '月命日', mm, mm ? '毎月' + death.getDate() + '日／次は' + (mm.getMonth() + 1) + '月' + mm.getDate() + '日' : '');
    push('y1', '一周忌', addYears(death, 1), formatJP(addYears(death, 1), true));
    push('y3', '三回忌', addYears(death, 2), formatJP(addYears(death, 2), true));
    var b = parseISO(state.pet.birthISO);
    if (b) {
      var nb = nextAnniversary(b, from);
      push('birthday', 'お誕生日', nb, nb ? formatJP(nb, true) + '・' + b.getFullYear() + '年うまれ' : '');
    }
    out.sort(function (a, c) { return a.days - c.days; });
    // 月命日が大きい節目と重なったら、大きいほうだけ残す
    var big = {};
    out.forEach(function (m) { if (m.key !== 'monthly') big[ymd(m.date)] = true; });
    out = out.filter(function (m) { return !(m.key === 'monthly' && big[ymd(m.date)]); });
    // 四十九日がまだ先なら先頭に。この時期に数えているのは四十九日なので
    var i49 = -1;
    out.forEach(function (m, i) { if (m.key === 'd49') i49 = i; });
    if (i49 > 0) out.unshift(out.splice(i49, 1)[0]);
    return out;
  }

  function daysTogether() {
    var b = parseISO(state.pet.birthISO), d = parseISO(state.pet.deathISO);
    if (!b || !d) return 0;
    return Math.max(0, diffDays(b, d));
  }

  /* 大きな節目（四十九日・百か日・一周忌・三回忌）だけを扱う。月命日・お誕生日は
     毎月・毎年来て頻度が高すぎるので、ここには含めない。追記46。 */
  var BIG_KEYS = { d49: 1, d100: 1, y1: 1, y3: 1, birthday: 1 };
  /* 今日がちょうどその大きな節目にあたるか。手紙のこだま（追記46）で、
     節目の日だけ過去の手紙を1通そっと差し出すために使う。 */
  function milestoneToday(from) {
    var hit = milestones(from).filter(function (m) { return m.days === 0 && BIG_KEYS[m.key]; });
    return hit[0] || null;
  }
  /* すでに過ぎた大きな節目（新しい順）。ふりかえり画面（追記46）を、
     その節目を過ぎたあとはいつでも開けるようにするために使う。 */
  function pastMilestones(from) {
    var death = parseISO(state.pet.deathISO);
    if (!death) return [];
    var list = [
      { key: 'd49', label: '四十九日', date: addDays(death, 48) },
      { key: 'd100', label: '百か日', date: addDays(death, 99) },
      { key: 'y1', label: '一周忌', date: addYears(death, 1) },
      { key: 'y3', label: '三回忌', date: addYears(death, 2) }
    ];
    return list.filter(function (m) { return diffDays(m.date, from) >= 0; })
      .sort(function (a, b) { return b.date - a.date; });
  }

  /* 享年。満年齢で数える。1年に満たない子は月で返す。
     0歳と出すより、7か月と出すほうがその子の時間に近い。 */
  function ageAtDeath() {
    var b = parseISO(state.pet.birthISO), d = parseISO(state.pet.deathISO);
    if (!b || !d || d < b) return null;
    var y = d.getFullYear() - b.getFullYear();
    var m = d.getMonth() - b.getMonth();
    if (d.getDate() < b.getDate()) m--;
    if (m < 0) { y--; m += 12; }
    return y >= 1 ? { years: y } : { months: m };
  }

  /* ============ 戒名 ============
     お寺が授けるものを、アプリが代わりに出せるはずがない。
     ここで作るのは「この子のために選んだ名」であって、授戒ではない。
     だからどの字がどこから来たかを必ず開いて見せるし、書きかえられる。

     組み立ては人の戒名にならい、道号2字＋法号2字＋位号2字。
       道号  旅立った季節から
       法号  この子の名の頭の一字 ＋ 生まれた季節の一字
       位号  霊位（ペット供養で広く使われる形）
     生まれた季節と旅立った季節が両端にくるので、
     名前がその子の一生をそのまま包む形になる。 */

  // 名の頭の音を一字にする。万葉仮名のように音を借りる、昔からのやり方。
  var ONE = {
    'あ':'安','い':'伊','う':'羽','え':'永','お':'桜',
    'か':'香','き':'樹','く':'空','け':'慶','こ':'幸',
    'さ':'咲','し':'志','す':'翠','せ':'誠','そ':'爽',
    'た':'太','ち':'千','つ':'月','て':'天','と':'灯',
    'な':'那','に':'日','ぬ':'温','ね':'寧','の':'希',
    'は':'晴','ひ':'陽','ふ':'風','へ':'平','ほ':'穂',
    'ま':'真','み':'美','む':'夢','め':'芽','も':'望',
    'や':'弥','ゆ':'優','よ':'好',
    'ら':'楽','り':'理','る':'瑠','れ':'玲','ろ':'朗',
    'わ':'和','ゐ':'和','ゑ':'永','を':'和','ん':'音'
  };
  var DAKU = {
    'が':'か','ぎ':'き','ぐ':'く','げ':'け','ご':'こ','ざ':'さ','じ':'し','ず':'す','ぜ':'せ','ぞ':'そ',
    'だ':'た','ぢ':'ち','づ':'つ','で':'て','ど':'と','ば':'は','び':'ひ','ぶ':'ふ','べ':'へ','ぼ':'ほ',
    'ぱ':'は','ぴ':'ひ','ぷ':'ふ','ぺ':'へ','ぽ':'ほ',
    'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お','ゃ':'や','ゅ':'ゆ','ょ':'よ','っ':'つ','ゎ':'わ'
  };
  /* ローマ字の名前（Coco・Momo・Charlie など）からも頭の音を拾う。
     長い綴りから先に照合しないと、"cho" が "c" に化けるような取りこぼしが起きる。
     l は日本語の音では r と区別しないので、先に r に寄せる。
     c は h が続かない限り k の音として使われることが多い（Coco→Koko）。
     これで完璧な発音になるわけではないが、「先頭がどの行の音か」さえ合えば十分。 */
  var ROMA = [
    ['kya', 'き'], ['kyu', 'き'], ['kyo', 'き'],
    ['sha', 'し'], ['shu', 'し'], ['sho', 'し'], ['sya', 'し'], ['syu', 'し'], ['syo', 'し'],
    ['cha', 'ち'], ['chu', 'ち'], ['cho', 'ち'], ['tya', 'ち'], ['tyu', 'ち'], ['tyo', 'ち'],
    ['nya', 'に'], ['nyu', 'に'], ['nyo', 'に'],
    ['hya', 'ひ'], ['hyu', 'ひ'], ['hyo', 'ひ'],
    ['mya', 'み'], ['myu', 'み'], ['myo', 'み'],
    ['rya', 'り'], ['ryu', 'り'], ['ryo', 'り'],
    ['gya', 'き'], ['gyu', 'き'], ['gyo', 'き'],
    ['bya', 'ひ'], ['byu', 'ひ'], ['byo', 'ひ'],
    ['pya', 'ひ'], ['pyu', 'ひ'], ['pyo', 'ひ'],
    ['ja', 'し'], ['ju', 'し'], ['jo', 'し'],
    ['shi', 'し'], ['chi', 'ち'], ['tsu', 'つ'],
    ['ka', 'か'], ['ki', 'き'], ['ku', 'く'], ['ke', 'け'], ['ko', 'こ'],
    ['sa', 'さ'], ['su', 'す'], ['se', 'せ'], ['so', 'そ'],
    ['ta', 'た'], ['te', 'て'], ['to', 'と'],
    ['na', 'な'], ['ni', 'に'], ['nu', 'ぬ'], ['ne', 'ね'], ['no', 'の'],
    ['ha', 'は'], ['hi', 'ひ'], ['fu', 'ふ'], ['he', 'へ'], ['ho', 'ほ'],
    ['ma', 'ま'], ['mi', 'み'], ['mu', 'む'], ['me', 'め'], ['mo', 'も'],
    ['ya', 'や'], ['yu', 'ゆ'], ['yo', 'よ'],
    ['ra', 'ら'], ['ri', 'り'], ['ru', 'る'], ['re', 'れ'], ['ro', 'ろ'],
    ['wa', 'わ'], ['wo', 'を'],
    ['ga', 'か'], ['gi', 'き'], ['gu', 'く'], ['ge', 'け'], ['go', 'こ'],
    ['za', 'さ'], ['zi', 'し'], ['ji', 'し'], ['zu', 'す'], ['ze', 'せ'], ['zo', 'そ'],
    ['da', 'た'], ['di', 'ち'], ['du', 'つ'], ['de', 'て'], ['do', 'と'],
    ['ba', 'は'], ['bi', 'ひ'], ['bu', 'ふ'], ['be', 'へ'], ['bo', 'ほ'],
    ['pa', 'は'], ['pi', 'ひ'], ['pu', 'ふ'], ['pe', 'へ'], ['po', 'ほ'],
    ['a', 'あ'], ['i', 'い'], ['u', 'う'], ['e', 'え'], ['o', 'お'],
    ['n', 'ん']
  ];
  function romaHead(name) {
    var s = String(name || '').trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return '';
    s = s.replace(/l/g, 'r').replace(/^c(?!h)/, 'k');
    for (var i = 0; i < ROMA.length; i++) {
      if (s.indexOf(ROMA[i][0]) === 0) return ROMA[i][1];
    }
    return '';
  }
  // 旅立った季節。2か月ずつ6つに分ける。
  var MICHI = ['寒月','寒月','春光','春光','薫風','薫風','夏雲','夏雲','秋水','秋水','冬晴','冬晴'];
  var MICHI_WHY = ['冬の月のころ','冬の月のころ','春の光のころ','春の光のころ','初夏の風のころ','初夏の風のころ','夏の雲のころ','夏の雲のころ','秋の水のころ','秋の水のころ','冬の晴れたころ','冬の晴れたころ'];
  // 生まれた季節。
  var UMARE = { 0:'清', 1:'清', 2:'和', 3:'和', 4:'和', 5:'陽', 6:'陽', 7:'陽', 8:'実', 9:'実', 10:'実', 11:'清' };
  var UMARE_WHY = { '和':'春に生まれた', '陽':'夏に生まれた', '実':'秋に生まれた', '清':'冬に生まれた' };
  var KIND_CHAR = { dog:'睦', cat:'静', other:'円' };
  var KIND_WHY = { '睦':'犬とむつまじく過ごした', '静':'猫としずかに寄りそった', '円':'まるく穏やかに過ごした' };

  function headChar(name) {
    var n = String(name || '').trim();
    if (!n) return '';
    var c = n.charAt(0);
    // 漢字ならその字をそのまま使う。人の戒名でも名の一字を採る。
    if (/[\u4E00-\u9FFF]/.test(c)) return c;
    // カタカナはひらがなに寄せる
    if (/[\u30A1-\u30F6]/.test(c)) c = String.fromCharCode(c.charCodeAt(0) - 0x60);
    if (DAKU[c]) c = DAKU[c];
    if (ONE[c]) return ONE[c];
    // 仮名で読めない名前（Coco・Momo のようなローマ字）は、音を拾って同じ表を引く。
    // ここで拾えないと戒名そのものが出ない（Coco で実際に起きていた）ので、
    // 仮名の道が外れたときだけ通す最後の手段。
    var r = romaHead(n);
    return r ? (ONE[r] || '') : '';
  }

  /* 戒名の部品。画面で「どの字がどこから来たか」を見せるために使う。 */
  function kaimyoParts(pet) {
    var p = pet || state.pet;
    var d = parseISO(p.deathISO), b = parseISO(p.birthISO);
    var head = headChar(p.name);
    if (!d || !head) return null;
    var mi = d.getMonth();
    var sue = b ? UMARE[b.getMonth()] : (KIND_CHAR[p.kind] || '円');
    return {
      michi: MICHI[mi],
      michiWhy: MICHI_WHY[mi] + 'に旅立った',
      head: head,
      headWhy: '「' + p.name + '」の頭の一字',
      sue: sue,
      sueWhy: b ? UMARE_WHY[sue] : KIND_WHY[sue],
      kurai: '霊位'
    };
  }
  function kaimyoAuto(pet) {
    var k = kaimyoParts(pet);
    return k ? k.michi + k.head + k.sue + k.kurai : '';
  }
  /* 表に出す戒名。お寺からいただいたものがあれば、そちらが優先される。 */
  function kaimyo() {
    if (state.pet.kaimyoOff) return '';
    return (state.pet.kaimyo || '').trim() || kaimyoAuto();
  }
  function setKaimyo(v) {
    // 14字あれば院号つきの戒名も入る。それ以上は遺影の横に立てると小さくなりすぎる。
    state.pet.kaimyo = String(v == null ? '' : v).trim().slice(0, 14);
    save();
  }
  function setKaimyoOff(off) { state.pet.kaimyoOff = !!off; save(); }

  /* ============ おまいり ============
     数えるのは通算。連続記録ではない。
     連続は1日休むと途切れて罪悪感になるが、通算は減らず、途切れない。 */
  function visitCount() { return state.visits.length; }
  function visitedOn(d) { return state.visits.indexOf(ymd(d)) >= 0; }
  function recordVisit(d) {
    var k = ymd(d);
    if (state.visits.indexOf(k) >= 0) return false;   // 1日1回。回数は稼げない
    state.visits.push(k); state.visits.sort(); save();
    return true;
  }

  /* この子の好きだったもの。おまいりのときにそなえる。
     チェック表示は画面側（app.js）がそのおまいりの間だけ覚えている
     もので判定し、ここでは記録だけする（追記63）。 */
  function putFave(d, name) {
    var k = ymd(d);
    if (!state.faveDone[k]) state.faveDone[k] = [];
    if (state.faveDone[k].indexOf(name) < 0) state.faveDone[k].push(name);
    save();
  }

  /* いまの気分。1〜5。点数ではなく、波を見るための記録。
     死別への対処は行ったり来たりしながら進む（Dual Process Model,
     Stroebe & Schut 1999）。上がり続けるのが正常なのではない。
     だから平均も目標も出さないし、良し悪しの判定もしない。 */
  function selfOn(d) { return state.selfLog[ymd(d)] || 0; }
  function putSelf(d, v) {
    v = Math.max(1, Math.min(5, v | 0));
    state.selfLog[ymd(d)] = v; save();
  }
  /* 古い順に並べて返す。直近 n 件。 */
  function selfSeries(n) {
    var keys = Object.keys(state.selfLog).sort();
    if (n && keys.length > n) keys = keys.slice(keys.length - n);
    return keys.map(function (k) { return { day: k, v: state.selfLog[k] }; });
  }

  /* 手紙。新しいものが先に来るように入れる。 */
  function addLetter(text) {
    state.letters.unshift({ at: Date.now(), text: String(text).slice(0, 2000) });
    save();
  }
  function deleteLetter(i) {
    if (!state.letters[i]) return false;
    state.letters.splice(i, 1);
    save(); return true;
  }

  /* 書きかけの手紙（追記67）。打っている途中でアプリが閉じられることは
     ある——iOSが裏に回ったアプリを落とす、うっかり別のアプリへ移る、
     サービスワーカーが新しい版に切り替わる。あの子へ宛てた言葉が
     それで消えるのは、このアプリでいちばん避けたいことなので、
     打つそばから控えておいて、次に開いたときに戻す。
     送るか、自分で閉じたときに消える。本文の保存(state.letters)とは
     別のキーに置く——書きかけはバックアップに混ぜない。 */
  var DRAFT_KEY = 'tomoshibi.draft.v1';
  function draft() {
    try { return localStorage.getItem(DRAFT_KEY) || ''; } catch (e) { return ''; }
  }
  function setDraft(text) {
    try {
      if (text) localStorage.setItem(DRAFT_KEY, String(text).slice(0, 2000));
      else localStorage.removeItem(DRAFT_KEY);
    } catch (e) { /* 空きが無いなら諦める。書きかけのために本体を壊さない */ }
  }
  function dismissEcho(d) { state.echoDismissedOn = ymd(d); save(); }

  /* ============ 写真と動画 ============
     保存先は、この端末の中だけ。どこにも送らない。
     外に預けないので流出しようがなく、こちらの容量も気にしなくていい。
     そのかわり端末を変えるときは、バックアップを書き出して読み込ませる。

       IndexedDB   … 本命。写真も動画も、形式・大きさの制限なく入る
       localStorage … IndexedDB が使えないときの保険。写真1枚ぶん

     どこに何があるかは索引(index)に持つ。

     【重要】IndexedDB には Blob をそのまま入れない。
     iOS Safari は Blob を一時ファイルへの参照として持つため、アプリを閉じると
     実体だけが消え、記録は残るのに中身が空になる。実際にそれが起きた。
     中身は ArrayBuffer で持ち、読むときに Blob へ組み直す。 */

  var DB = 'tomoshibi-media', STORE = 'media', dbp = null;
  var INDEX_KEY = 'tomoshibi.index.v1';
  var back = { idb: false };
  var dlNS = null;
  /* 埋め込み(iframe)で開かれているか。Safari はこの状態だと保存を
     一時的なものとして扱い、閉じたときに消すことがある。 */
  var embedded = (function () {
    try { return global.self !== global.top; } catch (e) { return true; }
  })();
  var durable = false;

  function getIndex() {
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { return []; }
  }
  function setIndex(a) {
    try { localStorage.setItem(INDEX_KEY, JSON.stringify(a)); } catch (e) {}
  }
  function indexPut(entry) {
    var a = getIndex().filter(function (x) { return x.id !== entry.id; });
    a.push(entry); a.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
    setIndex(a);
  }
  function indexDel(id) { setIndex(getIndex().filter(function (x) { return x.id !== id; })); }
  function indexGet(id) {
    var a = getIndex();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  }

  /* ---- IndexedDB ---- */
  function openDB() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      var idb = null;
      try { idb = global.indexedDB; } catch (e) { idb = null; }
      if (!idb) { rej(new Error('no-store')); return; }
      var r;
      try { r = idb.open(DB, 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error || new Error('idb-error')); };
      r.onblocked = function () { rej(new Error('no-store')); };
      setTimeout(function () { rej(new Error('no-store')); }, 6000);
    });
    return dbp;
  }
  function tx(mode) { return openDB().then(function (d) { return d.transaction(STORE, mode).objectStore(STORE); }); }
  function wrap(req) {
    return new Promise(function (res, rej) {
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error || new Error('req-error')); };
    });
  }

  /* ---- localStorage ---- */
  var LS_PREFIX = 'tomoshibi.media.';
  var LS_LIMIT = 1400000;
  /* Blob のまま入れると iOS で中身が失われるので、生のバイト列にしてから入れる */
  function blobToBuf(b) {
    if (b.arrayBuffer) return b.arrayBuffer();
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('unreadable')); };
      r.readAsArrayBuffer(b);
    });
  }

  function blobToDataURL(b) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('unreadable')); };
      r.readAsDataURL(b);
    });
  }
  function dataURLToBlob(u) {
    try {
      var i = u.indexOf(','), head = u.slice(0, i), body = u.slice(i + 1);
      var mime = (head.match(/data:([^;]+)/) || [, 'image/jpeg'])[1];
      var bin = atob(body), arr = new Uint8Array(bin.length);
      for (var k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  /* ---- 起動時のしらべ ----
     open が通っても書き込みで落ちる環境があるので、実際に書いて消すところまでやる。 */
  function probe() {
    var jobs = [];

    jobs.push(openDB().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, 'readwrite'), s = t.objectStore(STORE);
        var r = s.put({ id: '__probe__', buf: new ArrayBuffer(4), type: 'text/plain', at: Date.now() });
        r.onsuccess = function () { s.delete('__probe__'); res(); };
        r.onerror = function () { rej(r.error || new Error('probe')); };
      });
    }).then(function () { back.idb = true; }).catch(function () { back.idb = false; }));

    /* ブラウザに「この保存を勝手に消さないでほしい」と頼む。
       Chrome/Edge/Firefox はここで許可が下りる。Safari は
       ホーム画面に追加してあるかどうかなどで自分で判断する。 */
    jobs.push(new Promise(function (res) {
      try {
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(function (ok) { durable = !!ok; res(); }, function () { res(); });
          setTimeout(res, 3000);
          return;
        }
      } catch (e) {}
      res();
    }));

    // 書き出し口（claude.ai の画面で使う）。保存先ではなく、持ち出しにだけ使う。
    jobs.push(new Promise(function (res) {
      if (!(global.claude && typeof global.claude.use === 'function')) { res(); return; }
      var settled = false;
      var done = function () { if (!settled) { settled = true; res(); } };
      setTimeout(done, 4000);
      global.claude.use('downloads').then(function (d) { dlNS = d || null; done(); }, done);
    }));

    return Promise.all(jobs).then(migrate);
  }

  /* 索引を入れる前に保存したものを拾う。すでに入れた写真を見失わないため。 */
  function migrate() {
    if (getIndex().length) return;
    var found = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(LS_PREFIX) === 0) {
          var o = JSON.parse(localStorage.getItem(k));
          found.push({ id: k.slice(LS_PREFIX.length), kind: o.kind || 'photo', at: o.at || 0, store: 'ls' });
        }
      }
    } catch (e) {}
    var p = back.idb
      ? tx('readonly').then(function (s) { return wrap(s.getAll()); }).catch(function () { return []; })
      : Promise.resolve([]);
    return p.then(function (list) {
      (list || []).forEach(function (r) {
        if (r.id === '__probe__') return;
        found.push({ id: r.id, kind: r.kind || 'photo', at: r.at || 0, store: 'idb' });
      });
      found.sort(function (x, y) { return (x.at || 0) - (y.at || 0); });
      if (found.length) setIndex(found);
    });
  }

  /* 記録は残っているのに中身が失われたもの。画面で知らせるために数える。 */
  var lost = {};
  function lostCount() { return Object.keys(lost).length; }
  function clearLost() {
    var ids = Object.keys(lost);
    ids.forEach(function (id) { indexDel(id); delete lost[id]; });
    return ids.length;
  }

  function idbAvailable() { return back.idb; }
  function downloader() { return dlNS; }
  /* どこに保存できて、それが消されない保存かを、画面で説明するために返す。
     embedded（埋め込み表示）のときは、閉じると消えることがある。 */
  function storeInfo() {
    return { idb: back.idb, video: back.idb, photo: true,
             embedded: embedded, durable: durable && !embedded };
  }

  /* 保存。必ず解決する。失敗は {ok:false, reason} で返す。 */
  function putMedia(rec) {
    var order = rec.kind === 'video' ? ['idb'] : ['idb', 'ls'];
    return tryStores(rec, order, 0, null);
  }

  function tryStores(rec, order, i, lastReason) {
    if (i >= order.length) return Promise.resolve({ ok: false, reason: lastReason || 'no-store' });
    var next = function (reason) { return tryStores(rec, order, i + 1, reason || lastReason); };
    var w = order[i];

    if (w === 'idb') {
      if (!back.idb) return next(null);
      return blobToBuf(rec.blob).then(function (buf) {
        return tx('readwrite').then(function (s) {
          return wrap(s.put({ id: rec.id, buf: buf, type: rec.blob.type || '',
                             size: rec.blob.size, at: rec.at, kind: rec.kind }));
        });
      }).then(function () {
        indexPut({ id: rec.id, kind: rec.kind, at: rec.at, addedAt: rec.addedAt, store: 'idb' });
        return { ok: true, where: 'idb' };
      }).catch(function (e) { return next(reasonOf(e)); });
    }

    return blobToDataURL(rec.blob).then(function (u) {
      if (u.length > LS_LIMIT) return next('too-large');
      try {
        localStorage.setItem(LS_PREFIX + rec.id, JSON.stringify({ u: u, at: rec.at, kind: rec.kind }));
        indexPut({ id: rec.id, kind: rec.kind, at: rec.at, addedAt: rec.addedAt, store: 'ls' });
        return { ok: true, where: 'ls' };
      } catch (e) { return next('quota'); }
    }).catch(function (e) { return next(reasonOf(e)); });
  }

  function reasonOf(e) {
    var n = (e && (e.name || e.message)) || '';
    if (/Quota|quota/.test(n)) return 'quota';
    if (/no-store/.test(n)) return 'no-store';
    if (/unreadable/.test(n)) return 'unreadable';
    return 'unknown';
  }

  /* 読み出し */
  function loadEntry(e) {
    if (!e) return Promise.resolve(null);
    if (e.store === 'ls') {
      try {
        var raw = localStorage.getItem(LS_PREFIX + e.id);
        if (!raw) return Promise.resolve(null);
        var o = JSON.parse(raw), b = dataURLToBlob(o.u);
        return Promise.resolve(b ? { id: e.id, kind: e.kind, at: e.at, addedAt: e.addedAt, blob: b } : null);
      } catch (x) { return Promise.resolve(null); }
    }
    if (!back.idb) return Promise.resolve(null);
    return tx('readonly').then(function (s) { return wrap(s.get(e.id)); })
      .then(function (r) {
        if (!r) { lost[e.id] = 1; return null; }
        // 新しい形（buf）と、古い形（blob）の両方を受ける
        var b = r.buf ? new Blob([r.buf], { type: r.type || '' }) : r.blob;
        if (!b || !b.size) { lost[e.id] = 1; return null; }   // 中身だけ失われている
        return { id: e.id, kind: e.kind, at: e.at, addedAt: e.addedAt, blob: b };
      })
      .catch(function () { lost[e.id] = 1; return null; });
  }

  function getMedia(id) { return loadEntry(indexGet(id)); }

  function allMedia(kind) {
    var entries = getIndex().filter(function (e) { return !kind || e.kind === kind; });
    return Promise.all(entries.map(loadEntry)).then(function (list) {
      return list.filter(Boolean).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    });
  }

  function deleteMedia(id) {
    var e = indexGet(id);
    indexDel(id);
    if (!e) return Promise.resolve();
    if (e.store === 'ls') { try { localStorage.removeItem(LS_PREFIX + id); } catch (x) {} return Promise.resolve(); }
    if (!back.idb) return Promise.resolve();
    return tx('readwrite').then(function (s) { return wrap(s.delete(id)); }).catch(function () {});
  }

  function newId(kind) {
    return kind + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* バックアップからの復元。機種を変えたときの受け口。
     いまの中身は全部消してから入れ直す。混ざるほうが分かりにくいため。 */
  function restoreAll(pack) {
    if (!pack || pack.app !== 'ともしび' || !pack.data) {
      return Promise.resolve({ ok: false, reason: 'not-tomoshibi' });
    }
    var media = pack.media || [];
    return allMedia().then(function (old) {
      return Promise.all(old.map(function (m) { return deleteMedia(m.id); }));
    }).catch(function () {}).then(function () {
      setIndex([]);
      var fails = 0;
      return media.reduce(function (p, m) {
        return p.then(function () {
          var blob = dataURLToBlob(m.dataURL);
          if (!blob) { fails++; return; }
          return putMedia({ id: m.id, blob: blob, at: m.at || Date.now(), kind: m.kind, playable: true })
            .then(function (r) { if (!r.ok) fails++; });
        });
      }, Promise.resolve()).then(function () {
        var base = blank();
        Object.keys(base).forEach(function (k) { if (k in pack.data) state[k] = pack.data[k]; });
        Object.keys(base.pet).forEach(function (k) {
          if (pack.data.pet && k in pack.data.pet) state.pet[k] = pack.data.pet[k];
        });
        save();
        return { ok: true, restored: media.length - fails, failed: fails };
      });
    });
  }

  /* ============ アルバムの章立て ============ */
  function chapters(photos) {
    var out = [], cur = null;
    photos.forEach(function (p) {
      if (!cur || (p.at - cur.to) > 90 * 86400000) { cur = { from: p.at, to: p.at, photos: [p] }; out.push(cur); }
      else { cur.to = p.at; cur.photos.push(p); }
    });
    return out.map(function (c) {
      c.id = c.from + '|' + c.to;
      c.title = state.chapterTitles[c.id] || '';
      return c;
    });
  }

  global.Store = {
    state: state, save: save, probe: probe,
    idbAvailable: idbAvailable, storeInfo: storeInfo, downloader: downloader, restoreAll: restoreAll,
    lostCount: lostCount, clearLost: clearLost,
    reset: function () { state = blank(); setDraft(''); save(); },
    ymd: ymd, parseISO: parseISO, addDays: addDays, addYears: addYears, diffDays: diffDays,
    today: today, formatJP: formatJP, formatMD: formatMD, formatShort: formatShort,
    milestones: milestones, daysTogether: daysTogether, ageAtDeath: ageAtDeath,
    milestoneToday: milestoneToday, pastMilestones: pastMilestones,
    kaimyo: kaimyo, kaimyoAuto: kaimyoAuto, kaimyoParts: kaimyoParts,
    setKaimyo: setKaimyo, setKaimyoOff: setKaimyoOff,
    visitCount: visitCount, visitedOn: visitedOn, recordVisit: recordVisit,
    putFave: putFave, addLetter: addLetter,
    deleteLetter: deleteLetter, draft: draft, setDraft: setDraft, dismissEcho: dismissEcho,
    selfOn: selfOn, putSelf: putSelf, selfSeries: selfSeries,
    putMedia: putMedia, getMedia: getMedia, allMedia: allMedia, deleteMedia: deleteMedia, newId: newId,
    chapters: chapters
  };
})(window);

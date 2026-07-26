/* 世界史 一問一答 — 土浦日大 基礎学力到達度テスト対策
   大問①〜⑤は令和5・6・7の3年とも同じ並びで出題された「鉄板」。章番号はその実際の出題順。 */
(function () {
  "use strict";

  // 実物の表紙にある「必須／選択」の区分をそのまま章立てにしている。
  // 令和5＝大問Ⅰ〜Ⅵが必須＋Ⅶ(ロシア史)かⅧ(19世紀半ば以降)を選択、
  // 令和7＝大問1〜5が必須＋6(世界史探究)か7(歴史総合)を選択。
  var CHAPTERS = [
    { id: 1, key: "ch1", badge: "①", name: "古代ギリシア・ローマ", sub: "＋中世西欧の入口", note: "必須・3年連続 大問1", req: true },
    { id: 2, key: "ch2", badge: "②", name: "古代インド・古代中国", sub: "＋東南アジア", note: "必須・3年連続 大問2", req: true },
    { id: 3, key: "ch3", badge: "③", name: "古代オリエント・イスラーム世界", sub: "オスマン帝国まで", note: "必須・3年連続 大問3", req: true },
    { id: 4, key: "ch4", badge: "④", name: "モンゴル帝国・中世〜近世東アジア", sub: "宋・元・明・清", note: "必須・3年連続 大問4", req: true },
    { id: 5, key: "ch5", badge: "⑤", name: "近世ヨーロッパ", sub: "大航海〜宗教改革〜市民革命", note: "必須・3年連続 大問5", req: true },
    { id: 6, key: "ch6", badge: "⑥", name: "近代欧米", sub: "産業革命〜19世紀の国民国家", note: "必須・令和5 大問Ⅵ", req: true },
    { id: 8, key: "ch8", badge: "選", name: "ロシア史", sub: "キエフ公国〜ロシア革命", note: "選択・令和5 大問Ⅶ", req: false },
    { id: 9, key: "ch9", badge: "選", name: "19世紀半ば以降〜現代", sub: "アヘン戦争・帝国主義・二つの大戦・冷戦", note: "選択・令和5 大問Ⅷ", req: false },
    { id: 7, key: "ch7", badge: "探", name: "テーマ史・史料型", sub: "世界史探究の選択問題", note: "選択・令和7 大問6", req: false }
  ];

  var LEVELS = { 1: "基本", 2: "標準", 3: "やや難" };
  var STORE_KEY = "sekaishi.v1";
  var REQUIRED_IDS = [1, 2, 3, 4, 5, 6];
  // 本番は選択問題を1題しか解かない。選ばない枠を出題しても得点にならないので、
  // どれを解くかを決めてもらい、全範囲の出題は「必須6章＋選んだ1枠」に限定する。
  var ELECTIVES = [
    { id: 7, label: "テーマ史・史料型", note: "世界史探究を履修しているならこれ" },
    { id: 8, label: "ロシア史", note: "令和5 大問Ⅶ 型" },
    { id: 9, label: "19世紀半ば以降〜現代", note: "令和5 大問Ⅷ 型" }
  ];
  // 令和7は必須40問・選択20問。全範囲の出題もこの 7:3 に合わせる。
  var REQUIRED_RATIO = 2 / 3;

  // 目標ライン。Notion の「80点設計図」＝必須9割・選択6〜7割 に合わせている。
  var GOAL_REQUIRED = 0.9;
  var GOAL_ELECTIVE = 0.7;
  // 1問を「覚えた」にするまでに平均何回解くかの実測値。
  // 38日間のシミュレーションで、この係数だと必要なペースがちょうど出る。
  // 理屈だけだと 2.8 程度だが、間違えて振り出しに戻るぶんを含めると約4回かかる。
  var TRIES_PER_MASTER = 4;
  var DEFAULT_EXAM_DATE = "2026-09-24";
  var OLD_DEFAULT_EXAM_DATES = ["2026-09-01"];

  var ALL = [];
  var BY_ID = {};
  // 模擬試験の称号。1回クリアするごとに次へ進む。
  var BADGES = [
    { name: "ポリスの市民", icon: "🏛" },
    { name: "ローマの執政官", icon: "🦅" },
    { name: "シルクロードの旅人", icon: "🐫" },
    { name: "大航海の航海士", icon: "⛵" },
    { name: "革命の目撃者", icon: "🔥" },
    { name: "世界史マスター", icon: "👑" }
  ];
  var MOCK_PASS = 80; // 本番の目標と同じ80点でクリア

  // 初回だけ聞くあいことば。中身を隠すためのものではなく、他の人に触られないための目印。
  var PASSCODE = "0402";

  var store = {
    stats: {}, last: null, elective: 7, examDate: DEFAULT_EXAM_DATE,
    days: {}, mock: { round: 1, cleared: [] }, unlocked: false
  };
  var session = null;

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }

  /* ---------- 記録の保存 ----------
     保存先が1か所だけだと消えることがある。LINE内ブラウザは閉じると中身ごと消え、
     iOS Safari には「7日間開かないと消す」規則がある。
     そこで localStorage・sessionStorage・Cookie・IndexedDB・URL の5か所へ毎回同時に書き、
     起動時はいちばん進んでいるものを自動で読み込んで、消えていた保存先に書き戻す。
     どれか1つでも生き残っていれば記録は続く。 */

  var COOKIE_KEY = "sk1";
  var IDB_NAME = "sekaishi";
  var HASH_PREFIX = "#s=";
  var EPOCH = Date.UTC(2020, 0, 1); // 日付を通算日で持つと文字数が減る

  function b36(n, len) {
    var s = Math.max(0, Math.round(n || 0)).toString(36);
    while (s.length < len) s = "0" + s;
    return s.length > len ? s.slice(-len) : s;
  }
  function n36(s) { var v = parseInt(s, 36); return v === v ? v : 0; }
  function dayNum(iso) {
    var t = Date.parse(String(iso) + "T00:00:00Z");
    return t === t ? Math.round((t - EPOCH) / 86400000) : 0;
  }
  function dayIso(n) {
    var d = new Date(EPOCH + n * 86400000);
    return d.getUTCFullYear() + "-" + ("0" + (d.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + d.getUTCDate()).slice(-2);
  }

  /* 434問ぶんの記録を数KBの文字列に詰める。URL に丸ごと載る長さにするため。
     1問あたり6文字＝章1・番号2・正答数1・誤答数1・連続正解1。 */
  function packState(st) {
    var ids = Object.keys(st.stats).sort(), rec = [], i;
    for (i = 0; i < ids.length; i++) {
      var m = /^c(\d+)-(\d+)$/.exec(ids[i]);
      if (!m) continue;
      var s = st.stats[ids[i]];
      if (!s || (s.c + s.w) === 0) continue;
      rec.push(b36(+m[1], 1) + b36(+m[2], 2) + b36(Math.min(35, s.c), 1)
        + b36(Math.min(35, s.w), 1) + b36(Math.min(35, s.run || 0), 1));
    }
    var dk = Object.keys(st.days).sort(), base = dk.length ? dayNum(dk[0]) : 0, days = [];
    for (i = 0; i < dk.length; i++) {
      days.push(b36(dayNum(dk[i]) - base, 2) + b36(Math.min(1295, st.days[dk[i]]), 2));
    }
    // 合格した回は {round, pct, date, …} の形。称号名と絵文字は round から引き直せるので、
    // 回・点数・日付の3つだけを 6文字（1＋2＋3）に詰める。
    var mock = st.mock || { round: 1, cleared: [] };
    var cleared = (mock.cleared || []).map(function (c) {
      if (!c || typeof c !== "object") return "";
      return b36(c.round, 1) + b36(Math.min(1295, c.pct || 0), 2) + b36(dayNum(c.date), 3);
    }).join("");
    return [
      "3",
      b36(Math.round(Date.now() / 60000), 0),
      b36(dayNum(st.examDate), 0),
      b36(st.elective, 0),
      b36(mock.round || 1, 0) + "." + cleared,
      b36(base, 0) + "." + days.join(""),
      rec.join(""),
      st.unlocked ? "1" : "0"
    ].join("~");
  }

  function unpackState(text) {
    var f = String(text).split("~");
    var v = f[0];
    if ((v !== "3" && v !== "2") || f.length < 7) return null;
    var stats = {}, rec = f[6], i;
    for (i = 0; i + 6 <= rec.length; i += 6) {
      var id = "c" + n36(rec.charAt(i)) + "-" + ("0" + n36(rec.substr(i + 1, 2))).slice(-2);
      var run = n36(rec.charAt(i + 5));
      stats[id] = { c: n36(rec.charAt(i + 3)), w: n36(rec.charAt(i + 4)), run: run, lastWrong: run === 0 };
    }
    var days = {}, dp = f[5].split("."), dbase = n36(dp[0]), ds = dp[1] || "";
    for (i = 0; i + 4 <= ds.length; i += 4) {
      days[dayIso(dbase + n36(ds.substr(i, 2)))] = n36(ds.substr(i + 2, 2));
    }
    // 版2は合格記録を詰められていなかった（回だけの想定で、実際は入っていない）。
    // 統計と日付はそのまま読めるので、称号だけ空で受け入れる。
    var mp = f[4].split("."), cs = v === "3" ? (mp[1] || "") : "", cleared = [];
    for (i = 0; i + 6 <= cs.length; i += 6) {
      var round = n36(cs.charAt(i)), b = badgeFor(round);
      cleared.push({
        round: round, pct: n36(cs.substr(i + 1, 2)), date: dayIso(n36(cs.substr(i + 3, 3))),
        name: b.name, icon: b.icon
      });
    }
    var exam = dayIso(n36(f[2]));
    return {
      t: n36(f[1]) * 60000,
      state: {
        stats: stats, last: null,
        elective: n36(f[3]) || 7,
        examDate: OLD_DEFAULT_EXAM_DATES.indexOf(exam) >= 0 ? DEFAULT_EXAM_DATE : exam,
        days: days,
        mock: { round: n36(mp[0]) || 1, cleared: cleared },
        unlocked: f[7] === "1"
      }
    };
  }

  // 新しい詰め方も、前の版が書いた JSON も、どちらも読めるようにしておく。
  function parseCandidate(text) {
    if (!text) return null;
    var s = String(text).trim();
    if (!s) return null;
    if (s.slice(0, 2) === "3~" || s.slice(0, 2) === "2~") return unpackState(s);
    if (s.charAt(0) !== "{") return null;
    var p;
    try { p = JSON.parse(s); } catch (e) { return null; }
    if (!p) return null;
    var stats = {};
    if (Array.isArray(p.s)) {
      p.s.forEach(function (row) {
        var a = String(row).split(",");
        if (a.length < 4) return;
        stats[a[0]] = { c: +a[1] || 0, w: +a[2] || 0, run: +a[3] || 0, lastWrong: (+a[3] || 0) === 0 };
      });
    } else if (p.stats) {
      stats = p.stats;
    } else { return null; }
    var exam = p.examDate || p.d || DEFAULT_EXAM_DATE;
    return {
      t: p._savedAt || 0,
      state: {
        stats: stats, last: null,
        elective: p.elective || p.e || 7,
        examDate: OLD_DEFAULT_EXAM_DATES.indexOf(exam) >= 0 ? DEFAULT_EXAM_DATE : exam,
        days: p.days || p.day || {},
        mock: p.mock || p.m || { round: 1, cleared: [] },
        unlocked: !!p.unlocked
      }
    };
  }

  /* 5か所への読み書き。どれが失敗しても他が動けばいいので、1つずつ try で囲む。 */

  function writeWebStorage(packed) {
    try { localStorage.setItem(STORE_KEY, packed); } catch (e) {}
    try { sessionStorage.setItem(STORE_KEY, packed); } catch (e) {}
  }

  function writeCookie(packed) {
    try {
      if (packed.length > 3500) return; // Cookie は約4KBまで。あふれる分は他の保存先に任せる
      var exp = new Date(Date.now() + 400 * 86400000).toUTCString();
      document.cookie = COOKIE_KEY + "=" + packed + ";expires=" + exp + ";path=/;SameSite=Lax";
    } catch (e) {}
  }
  function readCookie() {
    try {
      var m = new RegExp("(?:^|; *)" + COOKIE_KEY + "=([^;]*)").exec(document.cookie || "");
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }

  var idb, idbTried = false;
  function idbOpen(cb) {
    if (idb || idbTried) { cb(idb || null); return; }
    try {
      var req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore("kv"); };
      req.onsuccess = function () { idbTried = true; idb = req.result; cb(idb); };
      req.onerror = function () { idbTried = true; cb(null); };
    } catch (e) { idbTried = true; cb(null); }
  }
  function writeIDB(packed) {
    idbOpen(function (db) {
      if (!db) return;
      try { db.transaction("kv", "readwrite").objectStore("kv").put(packed, STORE_KEY); } catch (e) {}
    });
  }
  function readIDB(cb) {
    idbOpen(function (db) {
      if (!db) { cb(null); return; }
      try {
        var r = db.transaction("kv", "readonly").objectStore("kv").get(STORE_KEY);
        r.onsuccess = function () { cb(r.result || null); };
        r.onerror = function () { cb(null); };
      } catch (e) { cb(null); }
    });
  }

  // アドレスバーの URL 自体を、つねに最新のバックアップにしておく。
  // こうしておけば、ホーム画面に追加する・ブックマークする・自分にリンクを送る、
  // どれをしても記録つきのリンクが手元に残る。
  // 枠（iframe）の中で開かれているときは、アドレスバーに出るのは外側の URL。
  // こちらで書き換えた URL は本人に見えないので、リンクとしては配れない。
  var inFrame = false;
  try { inFrame = window.top !== window.self; } catch (e) { inFrame = true; }

  var hashOk = true, lastWritten = "";
  function writeHash(packed) {
    if (!hashOk) return;
    try {
      lastWritten = packed;
      history.replaceState(null, "", location.pathname + location.search + HASH_PREFIX + packed);
    } catch (e) {
      hashOk = false; // file:// など replaceState が使えない環境では諦める
    }
  }
  function readHash() {
    var h = String(location.hash || "");
    if (h.indexOf(HASH_PREFIX) === 0) return decodeURIComponent(h.slice(HASH_PREFIX.length));
    if (h.indexOf("#state=") === 0) { // 前の版で配ったリンクも読める
      try { return atob(h.slice(7)); } catch (e) { return null; }
    }
    return null;
  }

  /* 解いた回数の合計。どの記録がいちばん進んでいるかの物差しにする。
     解答数は減ることがないので、これが多いほうを残せば取りこぼしがない。 */
  function weigh(state) {
    var n = 0, k;
    for (k in state.stats) {
      var s = state.stats[k];
      if (s) n += (s.c || 0) + (s.w || 0);
    }
    return n;
  }

  function persist() {
    var packed = packState(store);
    store._savedAt = Date.now();
    writeWebStorage(packed);
    writeCookie(packed);
    writeIDB(packed);
    writeHash(packed);
  }

  // 1問ごとに5か所へ書くと重いので少しまとめる。
  // ただし閉じられるときは取りこぼさないよう、その場で書き切る（save(true)）。
  var saveTimer = null;
  function save(now) {
    if (now) { clearTimeout(saveTimer); saveTimer = null; persist(); return; }
    if (saveTimer) return;
    saveTimer = setTimeout(function () { saveTimer = null; persist(); }, 400);
  }

  // 起動時。すぐ読める4か所を見て、いちばん進んでいる記録を自動で採用する。
  function load() {
    var cands = [parseCandidate(readHash()), parseCandidate(readCookie())];
    try { cands.push(parseCandidate(localStorage.getItem(STORE_KEY))); } catch (e) {}
    try { cands.push(parseCandidate(sessionStorage.getItem(STORE_KEY))); } catch (e) {}
    var best = null, bestW = 0, everUnlocked = false;
    cands.forEach(function (c) {
      if (!c) return;
      if (c.state.unlocked) everUnlocked = true; // 一度入っていれば、もう聞かない
      var w = weigh(c.state);
      if (w > bestW || (w === bestW && best && c.t > best.t)) { best = c; bestW = w; }
    });
    if (best && bestW > 0) { store = best.state; store._savedAt = best.t; }
    if (everUnlocked) store.unlocked = true;
  }

  // IndexedDB だけは非同期。あとから届いた記録のほうが進んでいれば乗り換える。
  // 最後に必ず書き戻して、消えていた保存先を復旧させる。
  function loadAsync(done) {
    var finish = function () {
      persist();
      done();
    };
    var settled = false;
    var once = function () { if (!settled) { settled = true; finish(); } };
    setTimeout(once, 1500); // IndexedDB が固まる環境でも起動を止めない
    readIDB(function (text) {
      var c = parseCandidate(text);
      if (c && weigh(c.state) > weigh(store)) { store = c.state; store._savedAt = c.t; }
      once();
    });
  }


  /* ---------- 記録の持ち出し ----------
     端末を変えるときのために、記録を短いテキストに書き出して読み込めるようにする。
     読み込みは、この文字列でも、記録つきのリンクをまるごと貼っても効く。 */

  function exportCode() { return packState(store); }

  function importCode(text) {
    var s = String(text).trim();
    var at = s.indexOf(HASH_PREFIX);
    if (at >= 0) {
      s = decodeURIComponent(s.slice(at + HASH_PREFIX.length));
    } else if (s.indexOf("#state=") >= 0) {
      try { s = atob(s.slice(s.indexOf("#state=") + 7)); } catch (e) {}
    }
    var c = parseCandidate(s);
    if (!c) throw new Error("形式が違います");
    // すでに中に入っている人を、読み込んだ記録の都合で閉め出さない
    var wasUnlocked = store.unlocked;
    store = c.state;
    store.unlocked = store.unlocked || wasUnlocked;
    save(true);
  }

  function stat(id) {
    var s = store.stats[id];
    if (!s) return { c: 0, w: 0, lastWrong: false, run: 0 };
    if (s.run == null) s.run = s.lastWrong ? 0 : Math.min(s.c, 2);
    return s;
  }

  function record(id, ok) {
    var s = store.stats[id] || { c: 0, w: 0, lastWrong: false, run: 0 };
    if (s.run == null) s.run = 0;
    if (ok) { s.c++; s.run++; } else { s.w++; s.run = 0; }
    s.lastWrong = !ok;
    store.stats[id] = s;
    var k = todayKey();
    store.days[k] = (store.days[k] || 0) + 1;
    save();
  }

  /* ---------- 習得の段階 ----------
     mikan の「覚えた／ほぼ覚えた／うろ覚え／苦手」に相当する4段階。
     1回正解しただけでは覚えたことにせず、2回続けて正解できたらマスター扱いにする。 */
  var MASTERY = { NEW: 0, SHAKY: 1, ALMOST: 2, MASTERED: 3 };

  function masteryOf(item) {
    var s = stat(item.id);
    if (s.c + s.w === 0) return MASTERY.NEW;
    if (s.run >= 2) return MASTERY.MASTERED;
    if (s.run === 1) return MASTERY.ALMOST;
    return MASTERY.SHAKY;
  }

  // 自分で「もう覚えた」と宣言できるようにする。判定を待たずに進捗へ反映される。
  // 外したときは元の状態に戻せるよう、直前の連続正解数を控えておく。
  function setMastered(id, on) {
    var s = store.stats[id] || { c: 0, w: 0, lastWrong: false, run: 0 };
    if (on) {
      if (s.prev == null) s.prev = s.run || 0;
      s.run = 2;
      s.lastWrong = false;
      if (s.c + s.w === 0) s.c = 1; // 未着手のまま覚えた扱いにしない
    } else {
      s.run = s.prev != null ? s.prev : 0;
      delete s.prev;
    }
    store.stats[id] = s;
    save();
  }

  /* ---------- 目標からの逆算 ---------- */

  function inScope(item) {
    return REQUIRED_IDS.indexOf(item.ch) >= 0 || item.ch === store.elective;
  }

  // 一度解いた問題は「まだ0」ではなく途中まで進んだものとして数える。
  // 2回続けて正解して初めて満点、というのが実感と合う。
  var MASTERY_WEIGHT = [0, 0.2, 0.6, 1];

  function goalStats() {
    var req = 0, opt = 0, mReq = 0, mOpt = 0, counts = [0, 0, 0, 0], progress = 0;
    ALL.forEach(function (it) {
      if (!inScope(it)) return;
      var m = masteryOf(it);
      counts[m]++;
      progress += MASTERY_WEIGHT[m];
      var isReq = REQUIRED_IDS.indexOf(it.ch) >= 0;
      if (isReq) { req++; if (m === MASTERY.MASTERED) mReq++; }
      else { opt++; if (m === MASTERY.MASTERED) mOpt++; }
    });
    var goal = Math.round(req * GOAL_REQUIRED) + Math.round(opt * GOAL_ELECTIVE);
    var mastered = mReq + mOpt;
    return {
      total: req + opt, goal: goal, mastered: mastered,
      remaining: Math.max(0, goal - mastered),
      counts: counts,
      // 1問解いただけだと四捨五入で0%になり「進んでいない」ように見えるので、
      // 少しでも進んでいれば最低1%を表示する
      pct: goal && progress > 0 ? Math.max(1, Math.min(100, Math.round((progress / goal) * 100))) : 0
    };
  }

  function daysLeft() {
    var exam = new Date(store.examDate + "T00:00:00");
    var now = new Date();
    now = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((exam - now) / 86400000));
  }

  function dailyTarget() {
    var g = goalStats();
    var d = Math.max(1, daysLeft());
    var need = Math.ceil((g.remaining * TRIES_PER_MASTER) / d);
    // 上限45問。これ以上を毎日課すと続かないので、遅れたら増やすより
    // 「間に合わない」と正直に伝える方向にする。
    // 5問単位に切り上げる。切り捨てると必要量にわずかに届かない
    return Math.max(20, Math.min(45, Math.ceil(need / 5) * 5 || 20));
  }

  // いまのペースで間に合うか。間に合わないなら早めに気づけるようにする。
  function onTrack() {
    var g = goalStats();
    var d = Math.max(1, daysLeft());
    var capacity = 45 * d;                       // 上限ペースで解ける総回数
    var needed = g.remaining * TRIES_PER_MASTER; // 必要と見込まれる総回数
    return needed <= capacity;
  }

  function todayCount() { return store.days[todayKey()] || 0; }

  /* ---------- 模擬試験 ---------- */

  function badgeFor(round) {
    if (round <= BADGES.length) return BADGES[round - 1];
    // 6回を超えたら「世界史マスター」を周回でつづける
    return { name: BADGES[BADGES.length - 1].name + "（" + (round - BADGES.length + 1) + "周目）", icon: "👑" };
  }

  function startMock(round) {
    round = round || store.mock.round;
    start({
      chapters: null, mode: "mc", count: 60, isMock: true, mockRound: round,
      title: "第" + round + "回 模擬試験"
    });
  }

  function clearedMock(round) {
    var found = null;
    (store.mock.cleared || []).forEach(function (c) { if (c && c.round === round) found = c; });
    return found;
  }

  // 選べる回。称号のぶんは常に出し、それを超えて進んでいればその先も出す。
  function mockRounds() {
    var max = Math.max(BADGES.length, store.mock.round);
    var out = [];
    for (var r = 1; r <= max; r++) out.push(r);
    return out;
  }

  // 80点以上で合格。どの回からでも受けられ、受け直して点を伸ばすこともできる。
  function finishMock(pctScore) {
    if (pctScore < MOCK_PASS) return null;
    var round = session.mockRound || store.mock.round;
    var b = badgeFor(round);
    var prev = clearedMock(round);
    if (prev) {
      if (pctScore > prev.pct) { prev.pct = pctScore; prev.date = todayKey(); }
    } else {
      store.mock.cleared.push({ round: round, pct: pctScore, date: todayKey(), name: b.name, icon: b.icon });
      store.mock.cleared.sort(function (x, y) { return x.round - y.round; });
    }
    // まだ受けていない回まで飛ばさない。合格した回の次を「つぎの回」にする。
    if (round >= store.mock.round) store.mock.round = round + 1;
    save();
    return b;
  }

  function streakDays() {
    var n = 0, d = new Date();
    if (!store.days[todayKey(d)]) d.setDate(d.getDate() - 1); // 今日まだなら昨日から数える
    while (store.days[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // 一本道の3ステップ。いまどこにいるかを1つだけ示す。
  function currentStep() {
    var g = goalStats();
    if (g.counts[MASTERY.NEW] > 0) {
      return { n: 1, label: "ぜんぶ一度は解く", rest: g.counts[MASTERY.NEW], unit: "問が未着手" };
    }
    if (g.remaining > 0) {
      return { n: 2, label: "あやふやな問題をマスターにする", rest: g.remaining, unit: "問でゴール" };
    }
    return { n: 3, label: "模擬試験で80点を確認する", rest: 0, unit: "" };
  }

  /* ---------- 小道具 ---------- */

  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

  var toastTimer = null;
  function toast(msg) {
    var n = $("#toast");
    n.textContent = msg;
    n.classList.add("is-shown");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { n.classList.remove("is-shown"); }, 2800);
  }
  function chapterOf(id) {
    for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return CHAPTERS[i];
    return CHAPTERS[0];
  }

  /* ---------- データ読み込み ---------- */

  function build() {
    var data = window.SEKAISHI || {};
    CHAPTERS.forEach(function (ch) {
      (data[ch.key] || []).forEach(function (item) {
        item.ch = ch.id;
        ALL.push(item);
        BY_ID[item.id] = item;
      });
    });
  }

  /* ---------- 出題を選ぶ ---------- */

  // 「あと一歩（前回正解・もう1回正解すれば覚えたことになる）」を最優先にする。
  // 38日間のシミュレーションでは、新規優先にした場合と比べて
  // 覚えられる問題数が約3倍になった（1日20問・正答率80%で 73問 → 195問）。
  // 新規を追いかけ続けると「あと一歩」が滞留して、いつまでも定着しない。
  function score(item) {
    var m = masteryOf(item);
    var base;
    if (m === MASTERY.ALMOST) base = 1.9;
    else if (m === MASTERY.NEW) base = 1.5;
    else if (m === MASTERY.SHAKY) base = 1.3;
    else base = 0.10;
    var s = stat(item.id);
    if (s.lastWrong) base += 0.3;
    return base * (0.55 + Math.random());
  }

  function isWeak(item) {
    var m = masteryOf(item);
    return m === MASTERY.SHAKY || m === MASTERY.ALMOST;
  }

  function take(pool, n) {
    return pool.map(function (it) { return { it: it, s: score(it) }; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, n)
      .map(function (o) { return o.it; });
  }

  // 必須の6大問は本番でどれも同じ配点なので、収録数の多い章に偏らないよう
  // 章ごとに順番に取っていく。収録30問の⑥と67問の①が同じ重みになる。
  function takeBalanced(pool, n) {
    var byCh = {};
    pool.forEach(function (it) { (byCh[it.ch] = byCh[it.ch] || []).push(it); });
    var chapters = Object.keys(byCh);
    chapters.forEach(function (c) {
      byCh[c] = take(byCh[c], byCh[c].length);
    });
    shuffle(chapters);
    var out = [], i = 0;
    while (out.length < n) {
      var progressed = false;
      for (var k = 0; k < chapters.length && out.length < n; k++) {
        var list = byCh[chapters[k]];
        if (i < list.length) { out.push(list[i]); progressed = true; }
      }
      if (!progressed) break;
      i++;
    }
    return out;
  }

  function pool(opts) {
    if (opts.items) return opts.items.slice(); // 一覧から「この中から解く」で来たとき
    return ALL.filter(function (it) {
      if (opts.chapters) {
        if (opts.chapters.indexOf(it.ch) < 0) return false;
      } else if (REQUIRED_IDS.indexOf(it.ch) < 0 && it.ch !== store.elective) {
        // 章を指定しない出題では、選んでいない選択枠は最初から除く
        return false;
      }
      if (opts.mode === "qa" && it.t !== "qa") return false;
      if (opts.weakOnly && !isWeak(it)) return false;
      return true;
    });
  }

  function prepare(item) {
    var view = {
      item: item,
      choices: item.c,
      answer: item.ans
    };
    // 語句問題だけ選択肢を並べ替える。正誤・年代整序は選択肢の順序自体に意味があるので触らない。
    if (item.t === "qa") {
      var idx = item.c.map(function (_, i) { return i; });
      shuffle(idx);
      view.choices = idx.map(function (i) { return item.c[i]; });
      view.answer = idx.indexOf(item.ans);
    }
    return view;
  }

  function start(opts) {
    var p = pool(opts);
    if (!p.length) {
      // サンドボックス内では alert/confirm が無視されるため、画面内で知らせる
      toast(opts.weakOnly
        ? "苦手な問題はまだありません。まずは何問か解いてみてください。"
        : "この条件に合う問題がありません。");
      return;
    }
    var picked;
    if (opts.count === "all") {
      picked = shuffle(p.slice());
    } else if (!opts.chapters && !opts.items) {
      // 全範囲のときは本番の配点比に合わせ、必須と選択枠を分けて抽出する
      var reqPool = p.filter(function (it) { return REQUIRED_IDS.indexOf(it.ch) >= 0; });
      var optPool = p.filter(function (it) { return REQUIRED_IDS.indexOf(it.ch) < 0; });
      var nReq = Math.min(Math.round(opts.count * REQUIRED_RATIO), reqPool.length);
      var nOpt = Math.min(opts.count - nReq, optPool.length);
      nReq = Math.min(opts.count - nOpt, reqPool.length);
      picked = takeBalanced(reqPool, nReq).concat(take(optPool, nOpt));
      shuffle(picked);
    } else {
      picked = take(p, Math.min(opts.count, p.length));
      shuffle(picked);
    }

    session = {
      views: picked.map(prepare),
      idx: 0,
      mode: opts.mode,
      title: opts.title,
      chapters: opts.chapters || null,
      isMock: !!opts.isMock,
      mockRound: opts.mockRound || 0,
      results: [],
      answered: false
    };
    store.last = { chapters: opts.chapters || null, mode: opts.mode, count: opts.count, title: opts.title };
    save();
    show("quiz");
    renderQuestion();
  }

  /* ---------- 画面切替 ---------- */

  function show(name) {
    ["login", "home", "chapter", "quiz", "result", "stats", "list", "mock"].forEach(function (v) {
      $("#view-" + v).classList.toggle("is-active", v === name);
    });
    window.scrollTo(0, 0);
  }

  function accentFor(chId) { return "var(--ch" + chId + ")"; }

  /* ---------- ホーム ---------- */

  function renderHome() {
    $("#backup-note").textContent = inFrame
      ? "記録は解くたびに自動で保存されますが、いまは枠の中で開かれているため、閉じたときに消えることがあります。心配なときは下の「文字でコピー」でメモアプリに貼っておいてください。貼りつけて読み込めば元に戻せます。"
      : "記録は解くたびに自動で保存され、次に開いたときに自動で読み込まれます。保存先は5か所（この端末の保存領域が4つと、いま開いている URL）に分けてあるので、どれかが消えても残ったものから元に戻ります。いま開いている URL そのものが記録つきのリンクです。ホーム画面に追加しておくと、そのアイコンから開くだけで記録つきで立ち上がります。";

    var g = goalStats();
    var d = daysLeft();
    var target = dailyTarget();
    var done = todayCount();

    // ゴールのリング
    var C = 2 * Math.PI * 52;
    var arc = $("#goal-arc");
    arc.style.strokeDasharray = C;
    arc.style.strokeDashoffset = C * (1 - g.pct / 100);
    $("#goal-pct").textContent = g.pct;
    $("#goal-days").textContent = d > 0 ? "試験まで あと " + d + "日" : "試験日です";
    // 見出しは今いるステップに合わせる。1周目から数字が毎日動くようにするため。
    var st = currentStep();
    $("#goal-headline").textContent =
      st.n === 1 ? "あと " + st.rest + "問"
      : st.n === 2 ? "あと " + g.remaining + "問"
      : "仕上げ。本番形式で確認しよう";
    $("#goal-detail").textContent =
      "覚えた " + g.mastered + " / " + g.goal + "問　（全" + g.total + "問中）";

    // 4段階の内訳。ここが動くと「進んでいる」ことが分かる。
    var BREAK = [
      { i: MASTERY.MASTERED, label: "覚えた", cls: "chip--mastered" },
      { i: MASTERY.ALMOST, label: "あと一歩", cls: "chip--almost" },
      { i: MASTERY.SHAKY, label: "あやふや", cls: "chip--shaky" },
      { i: MASTERY.NEW, label: "まだ", cls: "chip--new" }
    ];
    var chips = $("#goal-chips");
    chips.textContent = "";
    BREAK.forEach(function (b) {
      var c = el("button", "chip " + b.cls);
      c.type = "button";
      c.appendChild(el("span", "chip__n", String(g.counts[b.i])));
      c.appendChild(el("span", null, b.label));
      c.addEventListener("click", function () { openList(b.i); });
      chips.appendChild(c);
    });

    // 今日のミッション
    $("#mission-label").textContent = "今日の" + target + "問";
    $("#mission-count").textContent = done + " / " + target + "問";
    $("#mission-fill").style.width = Math.min(100, Math.round((done / target) * 100)) + "%";
    var cta = $("#mission-cta");
    cta.textContent = done === 0 ? "はじめる"
      : done < target ? "つづきをやる（あと " + (target - done) + "問）"
      : "今日のぶんは完了。もう少しやる？";
    cta.className = "mission__cta" + (done >= target ? " is-done" : "");
    $("#btn-today").classList.toggle("is-done", done >= target);

    // 逆算したペース。間に合うかどうかをその場で示す。
    var ep = store.examDate.split("-");
    var examLabel = Number(ep[1]) + "月" + Number(ep[2]) + "日";
    var pace = $("#pace");
    if (d <= 0) {
      pace.textContent = "試験当日です。落ち着いていきましょう";
      pace.className = "pace";
    } else if (onTrack()) {
      pace.textContent = "このペース（1日" + target + "問）なら " + examLabel + " に間に合う計算です";
      pace.className = "pace";
    } else {
      pace.textContent = "1日" + target + "問でも全部は間に合わない計算です。必須の①〜⑥を優先しましょう";
      pace.className = "pace is-warn";
    }

    // 模擬試験（家でやる用）。押すと回を選ぶ画面へ。
    var round = store.mock.round;
    var cleared = (store.mock.cleared || []).length;
    $("#mock-label").textContent = "模擬試験";
    $("#mock-desc").textContent = "60問・本番と同じ構成。" + MOCK_PASS + "点で合格し、称号がもらえます";
    var next = badgeFor(round);
    $("#mock-next").textContent = cleared
      ? cleared + "回 合格ずみ ・ つぎは第" + round + "回（" + next.icon + " " + next.name + "）"
      : "第1回から挑戦できます（" + next.icon + " " + next.name + "）";

    var bl = $("#badge-list");
    bl.textContent = "";
    if (store.mock.cleared.length) {
      $("#badge-section").style.display = "";
      store.mock.cleared.forEach(function (c) {
        var b = el("div", "badge");
        b.appendChild(el("span", "badge__icon", c.icon));
        var t = el("span");
        t.appendChild(el("span", "badge__name", c.name));
        t.appendChild(el("span", "badge__meta", "第" + c.round + "回 ・ " + c.pct + "点"));
        b.appendChild(t);
        bl.appendChild(b);
      });
    } else {
      $("#badge-section").style.display = "none";
    }

    var sd = streakDays();
    $("#streak").textContent = sd >= 2 ? "🔥 " + sd + "日つづいています" : "";

    // すすめ方（3ステップ・現在地を1つだけ強調）
    var step = currentStep();
    var STEPS = [
      { n: 1, label: "ぜんぶ一度は解く", desc: "まず全問に触れて、知らないものを洗い出す" },
      { n: 2, label: "あやふやな問題をマスターにする", desc: "2回続けて正解できたら「覚えた」" },
      { n: 3, label: "模擬試験で80点を確認する", desc: "60問・令和7と同じ構成。合格すると称号がもらえる" }
    ];
    var list = $("#steps");
    list.textContent = "";
    STEPS.forEach(function (s) {
      var li = el("li", "step" + (s.n === step.n ? " is-now" : s.n < step.n ? " is-done" : ""));
      li.appendChild(el("span", "step__no", s.n < step.n ? "✓" : String(s.n)));
      var body = el("span", "step__body");
      body.appendChild(el("span", "step__label", s.label));
      body.appendChild(el("span", "step__desc",
        s.n === step.n && step.rest ? "残り " + step.rest + step.unit : s.desc));
      li.appendChild(body);
      list.appendChild(li);
    });

    var weakCount = ALL.filter(function (it) { return inScope(it) && isWeak(it); }).length;
    $("#btn-weak").disabled = weakCount === 0;
    $("#btn-weak-desc").textContent = weakCount === 0 ? "まだありません" : weakCount + "問";
    $("#exam-date").value = store.examDate;

    var seg = $("#elective-seg");
    seg.textContent = "";
    ELECTIVES.forEach(function (e) {
      var b = el("button", "seg" + (store.elective === e.id ? " is-on" : ""));
      b.style.setProperty("--accent", accentFor(e.id));
      b.appendChild(el("span", "seg__label", e.label));
      b.addEventListener("click", function () {
        store.elective = e.id;
        save();
        renderHome();
      });
      seg.appendChild(b);
    });
    var chosen = ELECTIVES.filter(function (e) { return e.id === store.elective; })[0];
    $("#elective-note").textContent = chosen.note;

    var list = $("#chapter-list");
    list.textContent = "";
    var groupShown = { req: false, opt: false };
    CHAPTERS.forEach(function (ch) {
      // 必須と選択の切り替わりに見出しを挟む。実際の問題冊子と同じ区分。
      var key = ch.req ? "req" : "opt";
      if (!groupShown[key]) {
        groupShown[key] = true;
        var h = el("div", "grouphead");
        h.appendChild(el("span", "grouphead__label", ch.req ? "必須問題" : "選択問題"));
        h.appendChild(el("span", "grouphead__note",
          ch.req ? "全員がここを解く" : "この中から1題を選んで解答"));
        list.appendChild(h);
      }
      var items = ALL.filter(function (it) { return it.ch === ch.id; });
      var right = 0, tries = 0, touched = 0;
      items.forEach(function (it) {
        var s = stat(it.id);
        if (s.c + s.w > 0) touched++;
        right += s.c; tries += s.c + s.w;
      });
      var accuracy = pct(right, tries);

      var row = el("button", "chrow");
      row.style.setProperty("--accent", accentFor(ch.id));
      row.appendChild(el("span", "chrow__num", ch.badge));

      var mid = el("span");
      mid.appendChild(el("span", "chrow__name", ch.name));
      mid.appendChild(el("span", "chrow__meta",
        items.length + "問 ・ " + ch.note + (touched ? " ・ " + touched + "問ふれた" : "")));
      row.appendChild(mid);

      var right_ = el("span", "chrow__right");
      var pctEl = el("span", tries ? "chrow__pct" : "chrow__pct chrow__pct--none", tries ? accuracy + "％" : "未着手");
      right_.appendChild(pctEl);
      var meter = el("span", "meter");
      var fill = el("span", "meter__fill");
      fill.style.width = (tries ? accuracy : 0) + "%";
      meter.appendChild(fill);
      right_.appendChild(meter);
      row.appendChild(right_);

      row.addEventListener("click", function () { openChapter(ch); });
      list.appendChild(row);
    });
  }

  /* ---------- 章メニュー ---------- */

  var currentChapter = null;

  function openChapter(ch) {
    currentChapter = ch;
    var items = ALL.filter(function (it) { return it.ch === ch.id; });
    var qaCount = items.filter(function (it) { return it.t === "qa"; }).length;
    var weak = items.filter(isWeak).length;

    $("#chapter-title").textContent = ch.badge + "　" + ch.name;
    $("#chapter-name").textContent = ch.name;
    $("#chapter-sub").textContent = ch.sub ? ch.sub + " ／ " + ch.note : ch.note;
    $("#chapter-count").textContent = "全" + items.length + "問（うち一問一答むき " + qaCount + "問）";
    $("#chapter-head").style.setProperty("--accent", accentFor(ch.id));

    var w = $("#chapter-weak");
    w.disabled = weak === 0;
    $("#chapter-weak-desc").textContent = weak === 0 ? "まだありません" : weak + "問";

    show("chapter");
  }

  /* ---------- 出題 ---------- */

  function renderQuestion() {
    var view = session.views[session.idx];
    var item = view.item;
    var ch = chapterOf(item.ch);
    session.answered = false;

    $("#quiz-title").textContent = session.title;
    $("#quiz-counter").textContent = (session.idx + 1) + " / " + session.views.length;
    $("#quiz-rail").style.width = ((session.idx) / session.views.length * 100) + "%";
    $("#quiz-rail").style.setProperty("--accent", accentFor(item.ch));

    var card = $("#quiz-card");
    card.textContent = "";
    card.style.setProperty("--accent", accentFor(item.ch));

    var eyebrow = el("div", "qcard__eyebrow");
    eyebrow.appendChild(el("span", null, ch.badge + " " + ch.name));
    eyebrow.appendChild(el("span", "tag", LEVELS[item.lv] || "標準"));
    if (item.t !== "qa") eyebrow.appendChild(el("span", "tag", "本番形式"));
    card.appendChild(eyebrow);
    card.appendChild(el("p", "qcard__q", item.q));

    var body = $("#quiz-body");
    body.textContent = "";

    if (session.mode === "mc") {
      body.appendChild(buildChoices(view));
      setActions([]);
    } else {
      // 一問一答：まず思い出す。出てこなければ選択肢をヒントに使える。
      setActions([
        { label: "選択肢を見る", cls: "btn", fn: showChoices },
        { label: "答えを見る", cls: "btn btn--primary", fn: revealQA }
      ]);
    }
  }

  function buildChoices(view, extraClass) {
    var wrap = el("div", "choices" + (extraClass ? " " + extraClass : ""));
    view.choices.forEach(function (text, i) {
      var b = el("button", "choice");
      b.appendChild(el("span", "choice__no", String(i + 1)));
      b.appendChild(el("span", null, text));
      b.addEventListener("click", function () { answerMC(i); });
      wrap.appendChild(b);
    });
    return wrap;
  }

  function showChoices() {
    if (session.answered || $("#quiz-body").querySelector(".choice")) return;
    var view = session.views[session.idx];
    $("#quiz-body").appendChild(buildChoices(view, "fadein"));
    setActions([{ label: "わからない・答えを見る", cls: "btn btn--primary", fn: revealQA }]);
  }

  function setActions(buttons) {
    var bar = $("#quiz-actions");
    bar.textContent = "";
    buttons.forEach(function (b) {
      var n = el("button", b.cls, b.label);
      n.addEventListener("click", b.fn);
      bar.appendChild(n);
    });
  }

  function answerMC(chosen) {
    if (session.answered) return;
    session.answered = true;
    var view = session.views[session.idx];
    var ok = chosen === view.answer;

    var nodes = $("#quiz-body").querySelectorAll(".choice");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].disabled = true;
      if (i === view.answer) nodes[i].classList.add("is-correct");
      else if (i === chosen) nodes[i].classList.add("is-wrong");
      else nodes[i].classList.add("is-dim");
    }
    finish(ok);
  }

  function revealQA() {
    if (session.answered) return;
    var view = session.views[session.idx];
    var item = view.item;

    // 選択肢をヒントに出していた場合は、正解の位置も示してから答えを見せる
    var nodes = $("#quiz-body").querySelectorAll(".choice");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].disabled = true;
      nodes[i].classList.add(i === view.answer ? "is-correct" : "is-dim");
    }

    var box = el("div", "reveal fadein");
    box.appendChild(el("div", "reveal__label", "こたえ"));
    box.appendChild(el("p", "reveal__answer", item.a));
    $("#quiz-body").appendChild(box);
    appendExplain(item);
    setActions([
      { label: "できなかった", cls: "btn btn--bad", fn: function () { finishQA(false); } },
      { label: "できた", cls: "btn btn--good", fn: function () { finishQA(true); } }
    ]);
  }

  function finishQA(ok) {
    if (session.answered) return;
    session.answered = true;
    finish(ok, true);
  }

  function appendExplain(item) {
    var ex = el("div", "explain fadein");
    ex.style.setProperty("--accent", accentFor(item.ch));
    var head = el("div", "explain__head");
    head.appendChild(el("span", "explain__label", "解説"));
    if (item.y) {
      // 実物の過去問と一致する知識かどうかを示す。類題＝同じ範囲・レベルの想定問題。
      var isReal = item.y !== "類題";
      var tag = el("span", "yeartag" + (isReal ? " yeartag--real" : ""),
        isReal ? "令和" + item.y : "類題");
      head.appendChild(tag);
    }
    ex.appendChild(head);
    ex.appendChild(el("p", "explain__body", item.e));
    $("#quiz-body").appendChild(ex);
    // 解説の下端が操作バーに隠れることがあるので、出したら見える位置まで送る
    if (ex.scrollIntoView) {
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      try {
        ex.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
      } catch (e) {
        ex.scrollIntoView(false);
      }
    }
  }

  function finish(ok, skipExplain) {
    var view = session.views[session.idx];
    var item = view.item;
    record(item.id, ok);
    session.results.push({ item: item, ok: ok });

    if (!skipExplain) {
      var v = el("div", "verdict fadein " + (ok ? "verdict--good" : "verdict--bad"),
        ok ? "◯　正解" : "×　不正解");
      // 間違えたときは、どれが正解だったかを番号で言い切る。
      // 色分けだけだと、選択肢まで目を戻さないと分からない。
      if (!ok) v.appendChild(el("span", "verdict__answer", "正解は " + (view.answer + 1) + "番"));
      $("#quiz-body").appendChild(v);
      appendExplain(item);
    }

    appendMasterToggle(item);

    var isLast = session.idx === session.views.length - 1;
    setActions([{
      label: isLast ? "結果を見る" : "次の問題へ",
      cls: "btn btn--primary",
      fn: next
    }]);
  }

  // 「もう覚えた」チェック。押した瞬間に覚えた扱いになり、以後ほとんど出題されなくなる。
  function appendMasterToggle(item) {
    var box = el("button", "masterchk");
    box.type = "button";
    var mark = el("span", "masterchk__box");
    var text = el("span", "masterchk__text");
    var note = el("span", "masterchk__note");
    box.appendChild(mark);
    var body = el("span");
    body.appendChild(text);
    body.appendChild(note);
    box.appendChild(body);

    function paint() {
      var on = masteryOf(item) === MASTERY.MASTERED;
      box.classList.toggle("is-on", on);
      box.setAttribute("aria-pressed", on ? "true" : "false");
      mark.textContent = on ? "✓" : "";
      text.textContent = on ? "覚えた" : "もう覚えた";
      note.textContent = on
        ? "この問題はほとんど出なくなります（押すと取り消し）"
        : "チェックすると、覚えた問題として進捗に入ります";
    }
    box.addEventListener("click", function () {
      setMastered(item.id, masteryOf(item) !== MASTERY.MASTERED);
      paint();
    });
    paint();
    $("#quiz-body").appendChild(box);
  }

  function next() {
    if (session.idx >= session.views.length - 1) {
      renderResult();
      show("result");
      return;
    }
    session.idx++;
    renderQuestion();
  }

  /* ---------- 結果 ---------- */

  function renderResult() {
    var right = session.results.filter(function (r) { return r.ok; }).length;
    var total = session.results.length;
    var p = pct(right, total);

    $("#result-value").textContent = p;
    $("#result-detail").textContent = total + "問中 " + right + "問正解　（" + session.title + "）";

    var awarded = session.isMock ? finishMock(p) : null;
    var banner = $("#result-badge");
    banner.textContent = "";
    banner.className = "resultbadge";
    if (session.isMock) {
      if (awarded) {
        banner.classList.add("is-cleared");
        banner.appendChild(el("div", "resultbadge__icon", awarded.icon));
        banner.appendChild(el("div", "resultbadge__title", "第" + session.mockRound + "回 合格！"));
        banner.appendChild(el("div", "resultbadge__name", "称号「" + awarded.name + "」を獲得"));
        banner.appendChild(el("div", "resultbadge__next", "次は第" + store.mock.round + "回 模擬試験に挑戦できます"));
      } else {
        banner.classList.add("is-failed");
        var needMore = Math.ceil(total * MOCK_PASS / 100) - right;
        banner.appendChild(el("div", "resultbadge__icon", "◔"));
        banner.appendChild(el("div", "resultbadge__title", "合格まで あと " + needMore + "問"));
        banner.appendChild(el("div", "resultbadge__name", "合格ラインは" + MOCK_PASS + "点。第" + session.mockRound + "回にもう一度挑戦できます"));
      }
    }

    var isMock = session.isMock;
    var msg;
    if (isMock) {
      var diff = right - Math.round(total * 0.8);
      if (p >= MOCK_PASS) msg = "この精度を試験まで保てば十分です。間違えた問題だけ読み直しておきましょう。";
      else msg = "下の「まちがえた問題」がそのまま伸びしろです。必須の①〜⑥から先に潰すと点が動きます。";
    } else if (p >= 90) msg = "この精度なら十分。9月まで落とさないことだけ考えれば大丈夫です。";
    else if (p >= 80) msg = "目標の80点ライン。あとは間違えた問題の解説を読んで、取りこぼしを潰していきましょう。";
    else if (p >= 60) msg = "あと一歩。下に出ている間違えた問題だけ、もう一周してみてください。";
    else msg = "いまは覚える段階。解説を読んでから「まちがい直し」でもう一度解くと、次はぐっと上がります。";
    $("#result-msg").textContent = msg;

    // 今日のノルマの残りを結果画面でも示し、そのまま続けられるようにする
    var target = dailyTarget();
    var doneToday = todayCount();
    var note = $("#result-today");
    if (doneToday >= target) {
      note.textContent = "今日のぶん（" + target + "問）は完了です。よくやりました。";
      note.className = "resulttoday is-done";
    } else {
      note.textContent = "今日はあと " + (target - doneToday) + "問で完了です。";
      note.className = "resulttoday";
    }

    var wrong = session.results.filter(function (r) { return !r.ok; });
    $("#result-review-head").style.display = wrong.length ? "" : "none";
    var list = $("#result-review");
    list.textContent = "";
    if (!wrong.length) {
      var done = el("div", "empty", "全問正解。間違い直しはありません。");
      list.appendChild(done);
    }
    wrong.forEach(function (r) {
      var n = el("div", "reviewitem");
      n.appendChild(el("p", "reviewitem__q", r.item.q));
      n.appendChild(el("div", "reviewitem__a", "こたえ：" + r.item.a));
      n.appendChild(el("p", "reviewitem__e", r.item.e));
      list.appendChild(n);
    });

    $("#result-again").onclick = function () {
      if (session.isMock) { startMock(); return; }
      start({
        chapters: session.chapters, mode: session.mode,
        count: session.views.length, title: session.title
      });
    };
    $("#result-weak").onclick = function () {
      start({ chapters: null, mode: "mc", count: 20, weakOnly: true, title: "苦手だけ 20問" });
    };
  }

  /* ---------- 記録 ---------- */

  function renderStats() {
    var list = $("#stats-list");
    list.textContent = "";

    var gTries = 0, gRight = 0, gTouched = 0;
    CHAPTERS.forEach(function (ch) {
      var items = ALL.filter(function (it) { return it.ch === ch.id; });
      var right = 0, tries = 0, touched = 0;
      items.forEach(function (it) {
        var s = stat(it.id);
        right += s.c; tries += s.c + s.w;
        if (s.c + s.w > 0) touched++;
      });
      gTries += tries; gRight += right; gTouched += touched;

      var row = el("div", "statrow");
      row.style.setProperty("--accent", accentFor(ch.id));
      var name = el("div");
      name.appendChild(el("div", "statrow__name", ch.badge + " " + ch.name));
      name.appendChild(el("div", "statrow__sub", touched + " / " + items.length + "問にふれた"));
      row.appendChild(name);

      var bar = el("div", "statrow__bar");
      var fill = el("span");
      fill.style.width = (tries ? pct(right, tries) : 0) + "%";
      bar.appendChild(fill);
      row.appendChild(bar);

      row.appendChild(el("div", "statrow__pct", tries ? pct(right, tries) + "％" : "—"));
      list.appendChild(row);
    });

    $("#stats-overall").textContent = gTries
      ? "通算 " + gTries + "回解答・正答率 " + pct(gRight, gTries) + "％　（" + gTouched + " / " + ALL.length + "問にふれた）"
      : "まだ記録がありません。";

    var weak = ALL.filter(isWeak).map(function (it) {
      var s = stat(it.id);
      return { it: it, acc: s.c / (s.c + s.w), tries: s.c + s.w };
    }).sort(function (a, b) { return a.acc - b.acc || b.tries - a.tries; }).slice(0, 12);

    var wl = $("#stats-weak");
    wl.textContent = "";
    if (!weak.length) {
      wl.appendChild(el("div", "empty", "苦手リストは空です。問題を解くと、間違えたものがここにたまります。"));
    }
    weak.forEach(function (w) {
      var n = el("div", "reviewitem");
      n.appendChild(el("p", "reviewitem__q", w.it.q));
      n.appendChild(el("div", "reviewitem__a", "こたえ：" + w.it.a));
      n.appendChild(el("p", "reviewitem__e", w.it.e));
      wl.appendChild(n);
    });
  }

  /* ---------- 段階べつの問題一覧 ----------
     ホームの「覚えた／あと一歩／あやふや／まだ」を押すと、その中身を見られる。
     数字だけ見えても、どの問題のことなのか分からないままなので。 */

  var LIST_INFO = {};
  LIST_INFO[MASTERY.MASTERED] = { label: "覚えた", desc: "2回続けて正解できた問題" };
  LIST_INFO[MASTERY.ALMOST] = { label: "あと一歩", desc: "あと1回正解すれば「覚えた」になる問題" };
  LIST_INFO[MASTERY.SHAKY] = { label: "あやふや", desc: "解いたことはあるが、直近で間違えた問題" };
  LIST_INFO[MASTERY.NEW] = { label: "まだ", desc: "まだ一度も解いていない問題" };

  var LIST_CAP = 100; // 多すぎると開くのが重いので、先頭だけ出して残りは件数で伝える
  var listItems = [], listLabel = "";

  function openList(level) {
    var info = LIST_INFO[level];
    listLabel = info.label;
    listItems = ALL.filter(function (it) {
      return inScope(it) && masteryOf(it) === level;
    }).sort(function (a, b) {
      return a.ch - b.ch || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });

    $("#list-title").textContent = "「" + info.label + "」の問題";
    $("#list-desc").textContent = info.desc;
    $("#list-count").textContent = listItems.length + "問";

    var box = $("#list-items");
    box.textContent = "";
    if (!listItems.length) {
      box.appendChild(el("div", "empty", "この段階の問題はまだありません。"));
    }
    listItems.slice(0, LIST_CAP).forEach(function (it) {
      var ch = chapterOf(it.ch);
      var n = el("div", "reviewitem reviewitem--plain");
      n.style.setProperty("--accent", accentFor(it.ch));
      n.appendChild(el("div", "reviewitem__ch", ch.badge + " " + ch.name));
      n.appendChild(el("p", "reviewitem__q", it.q));
      n.appendChild(el("div", "reviewitem__a", "こたえ：" + it.a));
      n.appendChild(el("p", "reviewitem__e", it.e));
      box.appendChild(n);
    });
    if (listItems.length > LIST_CAP) {
      box.appendChild(el("div", "empty",
        "ほか " + (listItems.length - LIST_CAP) + "問。多いので先頭 " + LIST_CAP + "問だけ出しています。"));
    }

    var solve = $("#list-solve");
    solve.style.display = listItems.length ? "" : "none";
    solve.textContent = "この中から " + Math.min(20, listItems.length) + "問 解く";
    show("list");
  }

  /* ---------- 模擬試験の回をえらぶ ---------- */

  function renderMockList() {
    var list = $("#mock-list");
    list.textContent = "";
    mockRounds().forEach(function (round) {
      var b = badgeFor(round);
      var done = clearedMock(round);
      var row = el("button", "chrow");
      row.type = "button";
      // 称号ごとに色を変える。6回を超えたら先頭の色に戻す。
      row.style.setProperty("--accent", accentFor(((round - 1) % 6) + 1));
      row.appendChild(el("span", "chrow__num", done ? "✓" : String(round)));

      var body = el("span");
      body.appendChild(el("span", "chrow__name", "第" + round + "回 模擬試験"));
      body.appendChild(el("span", "chrow__meta", b.icon + " " + b.name
        + (done ? " ・ " + done.date + " に合格" : " ・ 60問")));
      row.appendChild(body);

      var right = el("span", "chrow__right");
      right.appendChild(el("span", "chrow__pct" + (done ? "" : " chrow__pct--none"),
        done ? done.pct + "点" : "—"));
      right.appendChild(el("span", "chrow__meta", done ? "受け直す" : "挑戦する"));
      row.appendChild(right);

      row.addEventListener("click", function () { startMock(round); });
      list.appendChild(row);
    });
  }

  /* ---------- テーマ ---------- */

  function initTheme() {
    var btn = $("#theme-toggle");
    btn.addEventListener("click", function () {
      var root = document.documentElement;
      var current = root.getAttribute("data-theme");
      if (!current) {
        current = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      var nextTheme = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", nextTheme);
      try { localStorage.setItem("sekaishi.theme", nextTheme); } catch (e) {}
    });
    try {
      var saved = localStorage.getItem("sekaishi.theme");
      if (saved) document.documentElement.setAttribute("data-theme", saved);
    } catch (e) {}
  }

  /* ---------- 起動 ---------- */

  function bind() {
    $("#btn-today").addEventListener("click", function () {
      // 今日の残りぶんだけ出す。終わっていたら追加で10問。
      var target = dailyTarget();
      var rest = target - todayCount();
      var n = rest > 0 ? rest : 10;
      start({ chapters: null, mode: "mc", count: n, title: "今日の" + n + "問" });
    });
    $("#exam-date").addEventListener("change", function () {
      if (this.value) { store.examDate = this.value; save(); renderHome(); }
    });
    $("#btn-mock-main").addEventListener("click", function () { renderMockList(); show("mock"); });

    $("#list-solve").addEventListener("click", function () {
      if (!listItems.length) return;
      start({
        items: listItems, mode: "mc", count: Math.min(20, listItems.length),
        title: "「" + listLabel + "」から " + Math.min(20, listItems.length) + "問"
      });
    });

    function tryLogin() {
      var input = $("#login-input");
      if ((input.value || "").trim() === PASSCODE) {
        store.unlocked = true;
        save(true);
        input.value = "";
        $("#login-error").textContent = "";
        renderHome();
        show("home");
      } else {
        $("#login-error").textContent = "ちがうようです。もう一度入れてください。";
        input.select();
      }
    }
    $("#login-go").addEventListener("click", tryLogin);
    $("#login-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); tryLogin(); }
    });
    $("#btn-qa").addEventListener("click", function () {
      start({ chapters: null, mode: "qa", count: 20, title: "一問一答 20問（全範囲）" });
    });
    $("#btn-weak").addEventListener("click", function () {
      start({ chapters: null, mode: "mc", count: 20, weakOnly: true, title: "苦手だけ 20問" });
    });
    $("#btn-stats").addEventListener("click", function () { renderStats(); show("stats"); });

    // 記録の書き出し・読み込み
    $("#btn-export").addEventListener("click", function () {
      var code = exportCode();
      $("#backup-box").value = code;
      $("#backup-box").style.display = "";
      // ファイルとして保存できる環境ではファイルに、だめならテキストをコピーする
      try {
        var blob = new Blob([code], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "sekaishi-kiroku-" + todayKey() + ".txt";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        toast("記録を書き出しました。ファイルが保存できないときは、下の文字をコピーしてメモに貼ってください");
      } catch (e) {
        toast("下の文字をすべてコピーして、メモアプリに貼って保存してください");
      }
    });
    $("#btn-copy").addEventListener("click", function () {
      var box = $("#backup-box");
      if (!box.value) box.value = exportCode();
      box.style.display = "";
      box.select();
      box.setSelectionRange(0, 999999);
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) {}
      if (!done && navigator.clipboard) {
        navigator.clipboard.writeText(box.value).then(function () { toast("記録をコピーしました"); });
        return;
      }
      toast(done ? "記録をコピーしました。メモアプリに貼って保存してください" : "下の文字を長押しして全部コピーしてください");
    });
    $("#btn-import").addEventListener("click", function () {
      var box = $("#backup-box");
      box.style.display = "";
      if (!box.value.trim()) { toast("先に、保存しておいた記録を下の欄に貼りつけてください"); box.focus(); return; }
      try {
        importCode(box.value.trim());
        renderHome();
        toast("記録を読み込みました");
      } catch (e) {
        toast("読み込めませんでした。書き出したときの文字を、そのまま全部貼りつけてください");
      }
    });
    $("#import-file").addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          importCode(String(r.result).trim());
          renderHome();
          toast("記録を読み込みました");
        } catch (e) { toast("このファイルは読み込めませんでした"); }
      };
      r.readAsText(f);
      this.value = "";
    });

    // いま開いている URL がそのまま記録つきのリンクになっている。それを渡すだけ。
    $("#btn-share-link").addEventListener("click", function () {
      save(true);
      var asLink = hashOk && !inFrame;
      var box = $("#backup-box");
      box.value = asLink ? location.href : exportCode();
      box.style.display = "";
      box.select();
      box.setSelectionRange(0, 999999);
      var what = asLink ? "記録つきのリンク" : "記録";
      var done = false;
      try { done = document.execCommand("copy"); } catch (e) {}
      if (!done && navigator.clipboard) {
        navigator.clipboard.writeText(box.value).then(function () { toast(what + "をコピーしました"); });
        return;
      }
      toast(done
        ? what + "をコピーしました。自分あてに送って保存しておくと安心です"
        : "下の文字を長押しして全部コピーしてください");
    });

    // アプリを開いたまま記録つきリンクを踏んだときのため。
    // ハッシュだけが違うリンクではページが読み直されないので、ここで取り込む。
    window.addEventListener("hashchange", function () {
      var raw = readHash();
      if (!raw || raw === lastWritten) return;
      var c = parseCandidate(raw);
      if (c && weigh(c.state) > weigh(store)) {
        store = c.state;
        store._savedAt = c.t;
        save(true);
        renderHome();
        show("home");
        toast("リンクから記録を読み込みました");
      } else {
        save(true); // 進んでいない記録で上書きされないよう、いまの記録を書き戻す
      }
    });

    // 閉じられる・別のアプリに切り替わるときは、書きかけを取りこぼさないよう即座に保存する。
    window.addEventListener("pagehide", function () { save(true); });
    window.addEventListener("beforeunload", function () { save(true); });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") save(true);
    });

    $("#chapter-mc").addEventListener("click", function () {
      start({ chapters: [currentChapter.id], mode: "mc", count: 20, title: currentChapter.name + "・本番形式 20問" });
    });
    $("#chapter-qa").addEventListener("click", function () {
      start({ chapters: [currentChapter.id], mode: "qa", count: 20, title: currentChapter.name + "・一問一答 20問" });
    });
    $("#chapter-weak").addEventListener("click", function () {
      start({ chapters: [currentChapter.id], mode: "mc", count: 20, weakOnly: true, title: currentChapter.name + "・苦手だけ" });
    });
    $("#chapter-all").addEventListener("click", function () {
      start({ chapters: [currentChapter.id], mode: "mc", count: "all", title: currentChapter.name + "・全問通し" });
    });

    document.querySelectorAll("[data-home]").forEach(function (b) {
      b.addEventListener("click", function () { renderHome(); show("home"); });
    });
    $("#chapter-back").addEventListener("click", function () { renderHome(); show("home"); });
    // 解答は1問ごとに保存ずみなので、確認をはさまずそのまま戻る
    $("#quiz-back").addEventListener("click", function () {
      renderHome();
      show("home");
    });

    document.addEventListener("keydown", function (e) {
      if (!$("#view-quiz").classList.contains("is-active")) return;
      if (e.key >= "1" && e.key <= "4" && !session.answered) {
        var nodes = $("#quiz-body").querySelectorAll(".choice");
        var i = parseInt(e.key, 10) - 1;
        if (nodes[i]) nodes[i].click();
      } else if (e.key === "Enter" || e.key === " ") {
        var btn = $("#quiz-actions").querySelector(".btn--primary");
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
  }

  // JavaScript が動いた＝ちゃんと開けている。静的な案内は消す。
  var nojs = document.getElementById("nojs");
  if (nojs && nojs.parentNode) nojs.parentNode.removeChild(nojs);

  load();
  build();
  initTheme();
  bind();
  renderHome();
  show(store.unlocked ? "home" : "login");
  if (!store.unlocked) $("#login-input").focus();
  // IndexedDB の記録は少し遅れて届く。届いたら画面を描き直し、
  // 生き残っていた記録をすべての保存先へ書き戻す（自動バックアップ復元）。
  loadAsync(function () {
    renderHome();
    // 遅れて届いた記録に「入ったことがある」と書いてあれば、あいことばは省く
    if (store.unlocked && $("#view-login").classList.contains("is-active")) show("home");
  });
})();

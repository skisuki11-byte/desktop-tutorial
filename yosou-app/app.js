/* 予想問題アプリ。SETS（3回分の問題データ）は build.js が先に埋め込む。
   設計メモ：
   ・紙の予想問題と中身は同一。違うのは「解いて採点し、弱点を出す」ところだけ。
   ・モードは2つ。学習＝1問ずつその場で答え合わせ、本番＝60分通しであとで採点。
     記録はモードごとに別に持つ（本番の記録は昔の鍵のままにして、消えないようにしている）。
   ・設問の「下線部a」を押すとリード文が開いて該当箇所が光る。ここが画面版の一番の利点。
   ・記録は localStorage に置き、書けない環境では sessionStorage に落とす。 */
"use strict";

var VERSION = "__BUILD__";
var CIRCLE = "①②③④⑤⑥";
var LIMIT = 60 * 60;           // 本番モードの制限時間（秒）
var KEY = "yosou-v1";
var THEME_KEY = "sekaishi.theme";   // 一問一答アプリと同じ鍵。同じ置き場所なので片方で切り替えると両方に効く

/* ───────── 明るさ ─────────
   既定はダーク。端末の設定は見ない（暗いほうを既定にしてほしいという指定のため）。
   CSS の素の :root が暗い値なので、選ばれていないうちは何も足さなくてよい。 */
function readTheme() {
  try {
    var v = localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch (e) {}
  return "dark";
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "dark" ? "#101119" : "#f1f1f4");
}
var theme = readTheme();
applyTheme(theme);

/* ───────── 保存 ───────── */
function readStore() {
  var raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) {}
  if (!raw) { try { raw = sessionStorage.getItem(KEY); } catch (e) {} }
  if (!raw) return {};
  try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
}
function writeStore() {
  var raw = JSON.stringify(store);
  try { localStorage.setItem(KEY, raw); } catch (e) {}
  try { sessionStorage.setItem(KEY, raw); } catch (e) {}
}
var store = readStore();

/* 本番モードは "1"〜"3"、学習モードは "L1"〜"L3"。
   本番を昔のままの鍵にしてあるので、モードを足しても前の記録が残る。 */
function keyOf(m, id) { return m === "real" ? String(id) : "L" + id; }
function rec(m, id) {
  var k = keyOf(m, id);
  if (!store[k]) store[k] = { answers: {}, pos: 0, elapsed: 0, done: false };
  if (!store[k].answers) store[k].answers = {};
  /* hist は「はじめから解き直す」で消さない記録。苦手分野はここから集計するので、
     何度リセットしても、これまで解いた分は積み上がったままになる。
     まだ hist を持たない古いデータは、いまの answers をそのまま引き継ぐ（初回だけ）。 */
  if (!store[k].hist) {
    store[k].hist = {};
    for (var n in store[k].answers) if (store[k].answers.hasOwnProperty(n)) store[k].hist[n] = store[k].answers[n];
  }
  return store[k];
}
function clearRec(m, id) {
  var k = keyOf(m, id);
  var hist = (store[k] && store[k].hist) || {};
  store[k] = { answers: {}, pos: 0, elapsed: 0, done: false, hist: hist };
  writeStore();
}

var mode = store.mode === "real" ? "real" : "learn";

/* ───────── 便利 ───────── */
function $(id) { return document.getElementById(id); }
function show(view) {
  var all = document.querySelectorAll(".view");
  for (var i = 0; i < all.length; i++) all[i].classList.remove("is-active");
  $(view).classList.add("is-active");
  window.scrollTo(0, 0);
}
function setOf(id) { return SETS[id - 1]; }
function flat(id) {
  var out = [];
  setOf(id).dai.forEach(function (d) {
    d.qs.forEach(function (q) { out.push({ q: q, dai: d }); });
  });
  return out;
}
function color(no) { return "var(--ch" + no + ")"; }
function paint(id) { document.documentElement.style.setProperty("--c", color(id * 2)); }
function mmss(s) {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function countRight(m, id, list) {
  var r = rec(m, id);
  return list.filter(function (x) { return r.answers[x.q.n] === x.q.a; }).length;
}
function wrongOf(m, id, list) {
  var r = rec(m, id);
  return list.filter(function (x) { return r.answers[x.q.n] && r.answers[x.q.n] !== x.q.a; });
}

/* ───────── ホーム ───────── */
function renderModes() {
  var bs = $("modes").querySelectorAll(".mode");
  for (var i = 0; i < bs.length; i++) {
    bs[i].classList.toggle("is-on", bs[i].getAttribute("data-mode") === mode);
  }
  $("modes-hint").textContent = mode === "learn"
    ? "答えと解説をその場で見ながら進みます。時間は計りません。"
    : "60分を計って通しで解きます。途中で答えは見られません。";
}

function renderHome() {
  renderModes();
  var wrap = $("home-cards");
  wrap.innerHTML = "";
  SETS.forEach(function (s) {
    var list = flat(s.id), n = list.length;
    var r = rec(mode, s.id);
    var picked = Object.keys(r.answers).length;
    /* 学習モードは、全問答えたなら結果を見ずに閉じていても「終わった」扱いにする。
       50問すべて答えたのに「途中（50／50問）」と出るのはおかしいため。 */
    var finished = mode === "real" ? !!r.done : (r.done || picked === n);
    var state, cls = "", right, go;

    if (mode === "real") {
      if (finished) {
        state = "採点ずみ"; cls = "card__state--done";
        right = '<span class="card__go">結果を見る ›</span>' +
                '<span class="card__score">' + r.score + '<small> 点</small></span>';
        go = function () { renderResult(s.id); };
      } else if (picked > 0) {
        state = "途中（" + picked + "／" + n + "問）"; cls = "card__state--mid";
        right = '<span class="card__go">つづきから ›</span>';
        go = function () { startExam(s.id); };
      } else {
        state = "未着手";
        right = '<span class="card__go">はじめる ›</span>';
        go = function () { startExam(s.id); };
      }
    } else {
      var ok = countRight("learn", s.id, list);
      var ng = wrongOf("learn", s.id, list).length;
      if (finished) {
        state = ng ? "間違い " + ng + " 問" : "全問正解";
        cls = ng ? "card__state--mid" : "card__state--done";
        right = '<span class="card__go">結果を見る ›</span>' +
                '<span class="card__score">' + ok + '<small> ／' + n + '問</small></span>';
        go = function () { renderLResult(s.id, list, false); };
      } else if (picked > 0) {
        state = "途中（" + picked + "／" + n + "問）"; cls = "card__state--mid";
        right = '<span class="card__go">つづきから ›</span>';
        go = function () { startLearn(s.id, list, false); };
      } else {
        state = "未着手";
        right = '<span class="card__go">はじめる ›</span>';
        go = function () { startLearn(s.id, list, false); };
      }
    }

    var card = document.createElement("div");
    card.className = "card";
    card.style.setProperty("--c", color(s.id * 2));

    var main = document.createElement("button");
    main.type = "button";
    main.className = "card__main";
    main.innerHTML =
      '<span class="card__top"><span class="card__name">' + s.name + '</span>' +
      '<span class="card__sub">' + s.sub + '</span></span>' +
      '<span class="card__note">' + s.note + '</span>' +
      '<span class="card__foot"><span class="card__state ' + cls + '">' + state + '</span>' + right + '</span>';
    main.addEventListener("click", go);
    card.appendChild(main);

    /* 学習モードで解きかけ・解き終わりのときは、問1から解き直す道も出す。
       答えを残したまま1問目に戻っても答え合わせが見えるだけなので、記録は消す。
       押し間違えると解いた分が消えるため、必ず確かめてから。 */
    if (mode === "learn" && picked > 0) {
      var again = document.createElement("button");
      again.type = "button";
      again.className = "card__again";
      again.textContent = "はじめから解き直す";
      again.addEventListener("click", function () {
        if (!confirm(s.name + "（学習モード）を問1から解き直しますか。苦手分野の集計にはこれまでの分も残ります。")) return;
        clearRec("learn", s.id);
        startLearn(s.id, flat(s.id), false);
      });
      card.appendChild(again);
    }

    wrap.appendChild(card);
  });
  renderTotal();
  var wst = weakStats();
  var wbtn = $("weak-open");
  wbtn.hidden = !wst.total;
  if (wst.total) {
    $("weak-open-sub").textContent = "延べ" + wst.total + "問から集計・正答率" + Math.round(wst.ok / wst.total * 100) + "%";
  }
  $("ver").textContent = "版 " + VERSION;
}

function renderTotal() {
  var t = $("home-total");
  var done = SETS.filter(function (s) { return rec(mode, s.id).done; });
  if (mode === "real") {
    if (!done.length) {
      t.innerHTML = "まだ採点した回はありません。学習モードをひと通り終えてから、60分を計って挑んでください。";
      return;
    }
    var avg = Math.round(done.reduce(function (a, s) { return a + rec("real", s.id).score; }, 0) / done.length);
    t.innerHTML = "採点ずみ <b>" + done.length + "</b> 回／平均 <b>" + avg + "</b> 点" +
      (done.length < 3 ? "　残り " + (3 - done.length) + " 回。3回とも解いてはじめて必要知識の全体に触れます。"
                       : "　3回とも終わりました。間違えた問題の見直しへ。");
    return;
  }
  var ng = 0, tot = 0, ok = 0;
  done.forEach(function (s) {
    var list = flat(s.id);
    tot += list.length; ok += countRight("learn", s.id, list); ng += wrongOf("learn", s.id, list).length;
  });
  if (!done.length) {
    t.innerHTML = "まずは第1回から。1問ずつ答え合わせをしながら、150問すべてに触れるのが目標です。";
  } else {
    t.innerHTML = "終えた回 <b>" + done.length + "</b>／3　正解 <b>" + ok + "</b>／" + tot + "問" +
      (ng ? "　間違いは <b>" + ng + "</b> 問。各回の結果から、そこだけやり直せます。" : "　間違いはありません。");
  }
}


/* ───────── 設問の描画（学習・本番・見直しで共通） ───────── */
function fillLead(dai, bodyEl, sumEl) {
  bodyEl.innerHTML = dai.lead;
  sumEl.textContent = "第" + dai.no + "問　" + dai.title + "　リード文を読む";
}
function litRef(detailsEl, bodyEl, ref) {
  var us = bodyEl.querySelectorAll("u, .bk");
  for (var i = 0; i < us.length; i++) us[i].classList.remove("is-lit");
  if (!ref) return;
  var hit = null;
  if (ref.indexOf("下線部") === 0) {
    var L = ref.replace(/[^a-i]/g, "");
    var subs = bodyEl.querySelectorAll("u sub");
    for (var j = 0; j < subs.length; j++) {
      if (subs[j].textContent === L) { subs[j].parentNode.classList.add("is-lit"); hit = subs[j].parentNode; }
    }
  } else {
    var letters = ref.match(/[Ａ-Ｇ]/g) || [];
    var bks = bodyEl.querySelectorAll(".bk");
    for (var k = 0; k < bks.length; k++) {
      if (letters.indexOf(bks[k].textContent) >= 0) { bks[k].classList.add("is-lit"); if (!hit) hit = bks[k]; }
    }
  }
  detailsEl.open = true;
  if (hit) setTimeout(function () { hit.scrollIntoView({ block: "center", behavior: "smooth" }); }, 60);
}

/* p は "learn" / "exam" / "review" のいずれか。同じ形の要素をまとめて埋める。 */
function fillStem(p, setId, item) {
  var q = item.q, d = item.dai;
  var lead = $(p + "-lead"), body = $(p + "-leadbody");
  fillLead(d, body, lead.querySelector(".lead__sum"));

  $(p + "-qnum").textContent = "問" + q.n;
  var refBtn = $(p + "-qref");
  refBtn.hidden = !q.ref;
  if (q.ref) { refBtn.textContent = q.ref; refBtn.onclick = function () { litRef(lead, body, q.ref); }; }
  $(p + "-qtag").textContent = q.fmt;
  $(p + "-qbody").innerHTML = q.q;

  var f = $(p + "-fig");
  if (q.figKey && setOf(setId).fig[q.figKey]) { f.hidden = false; f.innerHTML = setOf(setId).fig[q.figKey]; }
  else { f.hidden = true; f.innerHTML = ""; }
}

/* 解説の中身。正誤の見出し・本文・予想の根拠。 */
function exHTML(q, your) {
  var hit = your === q.a;
  return '<div class="ex__head ' + (hit ? "is-ok" : "is-ng") + '">' +
      (hit ? "正解" : (your ? "不正解　正解は " + CIRCLE[q.a - 1] : "未解答　正解は " + CIRCLE[q.a - 1])) + '</div>' +
    '<p class="ex__body">' + q.ex + '</p>' +
    (q.src ? '<p class="ex__src"><span>予想の根拠</span>' + q.src + '</p>' : "");
}
/* 答え合わせずみの選択肢を並べる（押せない） */
function lockedOpts(ol, q, your) {
  ol.innerHTML = "";
  q.c.forEach(function (text, i) {
    var li = document.createElement("li");
    var cls = "opt", mark = "";
    if (i + 1 === q.a) { cls += " is-correct"; mark = '<span class="opt__mark">正解</span>'; }
    if (i + 1 === your && your !== q.a) { cls += " is-yours"; mark = '<span class="opt__mark">あなたの答え</span>'; }
    li.innerHTML = '<div class="' + cls + '"><span class="opt__n">' + CIRCLE[i] + '</span>' +
      '<span class="opt__t">' + text + '</span>' + mark + '</div>';
    ol.appendChild(li);
  });
}

/* ───────── 学習モード ───────── */
/* cur は解いている最中の状態。list は今回まわす問題（やり直しのときは間違えた分だけ）。 */
var cur = { mode: "learn", id: 0, idx: 0, list: [], again: false, redone: {}, leadDai: 0, t0: 0, tick: null };

/* やり直しのときは、記録の答えは消さずに「この回で答え直したか」だけを別に持つ。
   消してしまうと、途中でやめたときに「間違い◯問」が分からなくなるため。 */
function answeredIn(n) { return cur.again ? !!cur.redone[n] : !!rec("learn", cur.id).answers[n]; }

function startLearn(id, list, again) {
  var r = rec("learn", id);
  cur.mode = "learn"; cur.id = id; cur.list = list; cur.again = again; cur.redone = {}; cur.leadDai = 0;
  cur.idx = again ? 0 : Math.min(r.pos || 0, list.length - 1);
  if (cur.tick) { clearInterval(cur.tick); cur.tick = null; }
  paint(id);
  show("view-learn");
  renderLearn(true);
}

function renderLearn(force) {
  var item = cur.list[cur.idx], q = item.q, d = item.dai;
  var r = rec("learn", cur.id);
  var your = r.answers[q.n];
  var shown = answeredIn(q.n);

  fillStem("learn", cur.id, item);
  /* 大問が変わったときだけリード文を開く。読まないと解けないので、たたんだままにしない。
     一度きりにしておかないと、答えるたびに開き直して読んでいる場所を見失う。 */
  if (force === true || cur.leadDai !== d.no) { $("learn-lead").open = true; cur.leadDai = d.no; }

  $("learn-dai").textContent = "第" + d.no + "問　" + d.title;
  $("learn-prog").style.width = ((cur.idx + 1) / cur.list.length * 100) + "%";
  var ok = cur.list.filter(function (x) { return answeredIn(x.q.n) && r.answers[x.q.n] === x.q.a; }).length;
  $("learn-count").innerHTML = (cur.idx + 1) + '<small>／' + cur.list.length + '</small>' +
    '<span class="bar__ok">正解 ' + ok + '</span>';

  var ol = $("learn-opts"), ex = $("learn-ex"), next = $("learn-next");
  if (shown) {
    ol.className = "opts opts--locked";
    lockedOpts(ol, q, your);
    ex.hidden = false;
    ex.className = "ex " + (your === q.a ? "is-ok" : "is-ng");
    ex.innerHTML = exHTML(q, your);
  } else {
    ol.className = "opts";
    ol.innerHTML = "";
    q.c.forEach(function (text, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opt";
      b.innerHTML = '<span class="opt__n">' + CIRCLE[i] + '</span><span class="opt__t">' + text + '</span>';
      b.addEventListener("click", function () { answerLearn(q.n, i + 1); });
      li.appendChild(b);
      ol.appendChild(li);
    });
    ex.hidden = true;
    ex.innerHTML = "";
  }

  $("learn-prev").disabled = cur.idx === 0;
  var last = cur.idx === cur.list.length - 1;
  next.textContent = shown ? (last ? "結果を見る →" : "次の問題 →") : (last ? "結果を見る →" : "とばす →");
  next.classList.toggle("is-hot", shown);
}

function answerLearn(n, a) {
  var r = rec("learn", cur.id);
  if (answeredIn(n)) return;
  if (cur.again) cur.redone[n] = true;
  r.answers[n] = a;
  r.hist[n] = a;
  if (!cur.again) r.pos = cur.idx;
  writeStore();
  renderLearn(false);
  var ex = $("learn-ex");
  setTimeout(function () { ex.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 120);
}

function moveLearn(d) {
  if (d > 0 && cur.idx === cur.list.length - 1) { finishLearn(); return; }
  cur.idx = Math.max(0, Math.min(cur.list.length - 1, cur.idx + d));
  if (!cur.again) { rec("learn", cur.id).pos = cur.idx; writeStore(); }
  renderLearn(false);
  window.scrollTo(0, 0);
}

function finishLearn() {
  var r = rec("learn", cur.id);
  if (!cur.again) { r.done = true; r.pos = 0; }
  r.at = Date.now();
  writeStore();
  renderLResult(cur.id, cur.list, cur.again);
}

function renderLResult(id, list, again) {
  cur.mode = "learn"; cur.id = id; cur.list = list; cur.again = again;
  paint(id);
  var r = rec("learn", id);
  var ok = list.filter(function (x) { return r.answers[x.q.n] === x.q.a; }).length;
  var blank = list.filter(function (x) { return !r.answers[x.q.n]; }).length;
  var wrong = list.filter(function (x) { return r.answers[x.q.n] && r.answers[x.q.n] !== x.q.a; });
  var pct = Math.round(ok / list.length * 100);

  $("lresult-name").textContent = setOf(id).name + (again ? "　やり直し" : "　学習モード");
  $("lresult-score").innerHTML =
    '<div class="score__pt">' + ok + '<small> ／ ' + list.length + '問</small></div>' +
    '<div class="score__judge ' + (pct >= 80 ? "is-ok" : "is-ng") + '">正答率 ' + pct + '％' +
      (pct >= 80 ? "　この調子です" : "") + '</div>' +
    '<div class="score__meta">' +
      (wrong.length ? "間違い " + wrong.length + " 問" : "間違いなし") +
      (blank ? "　未解答 " + blank + " 問" : "") + '</div>';

  breakdown(list, r, $("lresult-dai"), $("lresult-fmt"));

  var again2 = $("lresult-again");
  var pool = wrongOf("learn", id, flat(id));
  again2.hidden = !pool.length;
  again2.textContent = "間違えた " + pool.length + " 問をやり直す";
  $("lresult-reset").hidden = !!again;
  show("view-lresult");
}

/* 大問ごと・形式ごとの内訳。学習と本番で同じものを使う。 */
function breakdown(list, r, daiEl, fmtEl) {
  var byDai = {}, byFmt = {};
  list.forEach(function (x) {
    var hit = r.answers[x.q.n] === x.q.a;
    var dk = "第" + x.dai.no + "問　" + x.dai.title;
    (byDai[dk] = byDai[dk] || [0, 0]);
    byDai[dk][0] += hit ? 1 : 0; byDai[dk][1]++;
    var fk = x.q.fmt.replace(/^資料・/, "");
    if (/地図|図表|系図|図版/.test(fk)) fk = "図版・略地図";
    (byFmt[fk] = byFmt[fk] || [0, 0]);
    byFmt[fk][0] += hit ? 1 : 0; byFmt[fk][1]++;
  });
  daiEl.innerHTML = "<h2>大問ごと</h2>" + rows(byDai);
  fmtEl.innerHTML = "<h2>設問の形式ごと　—　弱い形式がそのまま伸びしろです</h2>" + rows(byFmt, true);
}

/* ───────── 本番モード ───────── */
function startExam(id) {
  var r = rec("real", id);
  cur.mode = "real"; cur.id = id; cur.list = flat(id); cur.again = false;
  cur.idx = Math.min(r.pos || 0, cur.list.length - 1);
  cur.t0 = Date.now();
  paint(id);
  show("view-exam");
  renderQ();
  if (cur.tick) clearInterval(cur.tick);
  cur.tick = setInterval(tickTime, 1000);
  tickTime();
}
function elapsed() { return rec("real", cur.id).elapsed + (Date.now() - cur.t0) / 1000; }
function tickTime() {
  var left = LIMIT - elapsed();
  var el = $("exam-time");
  el.textContent = (left < 0 ? "+" : "") + mmss(Math.abs(left));
  el.classList.toggle("is-over", left < 0);
  var s = $("sheet-time");
  if (s) { s.textContent = el.textContent; s.classList.toggle("is-over", left < 0); }
}
function saveProgress() {
  var r = rec("real", cur.id);
  r.elapsed = elapsed(); r.pos = cur.idx;
  cur.t0 = Date.now();
  writeStore();
}

function renderQ() {
  var item = cur.list[cur.idx], q = item.q, d = item.dai;
  var r = rec("real", cur.id);
  fillStem("exam", cur.id, item);
  $("exam-lead").open = false;
  $("exam-dai").textContent = "第" + d.no + "問　" + d.title;
  $("exam-prog").style.width = ((cur.idx + 1) / cur.list.length * 100) + "%";

  var ol = $("exam-opts");
  ol.innerHTML = "";
  q.c.forEach(function (text, i) {
    var li = document.createElement("li");
    var b = document.createElement("button");
    b.type = "button";
    b.className = "opt" + (r.answers[q.n] === i + 1 ? " is-picked" : "");
    b.innerHTML = '<span class="opt__n">' + CIRCLE[i] + '</span><span class="opt__t">' + text + '</span>';
    b.addEventListener("click", function () { pick(q.n, i + 1); });
    li.appendChild(b);
    ol.appendChild(li);
  });

  $("exam-prev").disabled = cur.idx === 0;
  $("exam-next").textContent = cur.idx === cur.list.length - 1 ? "解答一覧 →" : "次 →";
}

function pick(n, a) {
  var r = rec("real", cur.id);
  r.answers[n] = a;
  r.hist[n] = a;
  saveProgress();
  var opts = $("exam-opts").querySelectorAll(".opt");
  for (var i = 0; i < opts.length; i++) opts[i].classList.toggle("is-picked", i + 1 === a);
  setTimeout(function () { if (cur.idx < cur.list.length - 1) { cur.idx++; renderQ(); window.scrollTo(0, 0); } else renderSheet(); }, 180);
}
function move(d) {
  if (d > 0 && cur.idx === cur.list.length - 1) { renderSheet(); return; }
  cur.idx = Math.max(0, Math.min(cur.list.length - 1, cur.idx + d));
  saveProgress(); renderQ(); window.scrollTo(0, 0);
}

/* ───────── 解答一覧 ───────── */
function renderSheet() {
  saveProgress();
  var r = rec("real", cur.id), list = cur.list;
  var blank = list.filter(function (x) { return !r.answers[x.q.n]; }).length;
  $("sheet-lead").innerHTML = blank
    ? "未解答が <b>" + blank + "</b> 問あります。番号を押すとその問題に戻れます。"
    : "全問に解答しました。番号を押すと見直せます。";
  var g = $("sheet-grid");
  g.innerHTML = "";
  list.forEach(function (x, i) {
    var a = r.answers[x.q.n];
    var c = document.createElement("button");
    c.type = "button";
    c.className = "cell " + (a ? "is-done" : "is-blank");
    c.innerHTML = '<span class="cell__n">' + x.q.n + '</span><span class="cell__a">' + (a ? CIRCLE[a - 1] : "—") + '</span>';
    c.addEventListener("click", function () { cur.idx = i; show("view-exam"); renderQ(); });
    g.appendChild(c);
  });
  show("view-sheet");
  tickTime();
}

/* ───────── 採点 ───────── */
function submit() {
  var r = rec("real", cur.id), list = cur.list;
  var right = list.filter(function (x) { return r.answers[x.q.n] === x.q.a; }).length;
  r.score = right * 2;
  r.right = right;
  r.done = true;
  r.elapsed = elapsed();
  r.at = Date.now();
  writeStore();
  if (cur.tick) { clearInterval(cur.tick); cur.tick = null; }
  renderResult(cur.id);
}

function renderResult(id) {
  cur.mode = "real"; cur.id = id; cur.list = flat(id); cur.again = false;
  var r = rec("real", id), list = cur.list;
  paint(id);
  $("result-name").textContent = setOf(id).name + "　採点結果";
  var ok = r.score >= 80;
  $("result-score").innerHTML =
    '<div class="score__pt">' + r.score + '<small> ／ 100点</small></div>' +
    '<div class="score__judge ' + (ok ? "is-ok" : "is-ng") + '">' +
      (ok ? "目標の80点に到達しました" : "80点まであと " + Math.ceil((80 - r.score) / 2) + " 問") + '</div>' +
    '<div class="score__meta">' + r.right + "／50問正解　　所要 " + mmss(r.elapsed) +
      (r.elapsed > LIMIT ? "（制限時間を超過）" : "") + '</div>';

  breakdown(list, r, $("result-dai"), $("result-fmt"));
  show("view-result");
}
/* ───────── 苦手分野（3回・2モードをまとめて見る） ─────────
   大問の具体的なタイトルは回によって違うが、大問番号ごとの範囲は3回とも同じ
   （例：第1問はどの回も古代地中海〜西欧）なので、番号でまとめて集計できる。 */
var DAI_ERA = ["古代地中海・西欧", "古代インド・中国", "オリエント世界", "東アジア（宋〜清）", "近世ヨーロッパ", "テーマ史（選択）"];

function weakStats() {
  var byDai = {}, byFmt = {}, total = 0, ok = 0;
  SETS.forEach(function (s) {
    ["learn", "real"].forEach(function (m) {
      var r = rec(m, s.id);
      flat(s.id).forEach(function (x) {
        /* hist を見る。「はじめから解き直す」をしても answers だけが空になるので、
           ここは今の一発分ではなく、これまでで最後に答えた分がずっと反映される。 */
        var your = r.hist[x.q.n];
        if (!your) return;
        var hit = your === x.q.a;
        total++; if (hit) ok++;

        var dk = "第" + x.dai.no + "問　" + DAI_ERA[x.dai.no - 1];
        (byDai[dk] = byDai[dk] || [0, 0]); byDai[dk][0] += hit ? 1 : 0; byDai[dk][1]++;

        var fk = x.q.fmt.replace(/^資料・/, "");
        if (/地図|図表|系図|図版/.test(fk)) fk = "図版・略地図";
        (byFmt[fk] = byFmt[fk] || [0, 0]); byFmt[fk][0] += hit ? 1 : 0; byFmt[fk][1]++;
      });
    });
  });
  return { byDai: byDai, byFmt: byFmt, total: total, ok: ok };
}

/* 3問未満は誤差が大きいので、いちばん弱い1件を選ぶときだけ除く。表には出す。 */
function worstOf(obj) {
  var keys = Object.keys(obj).filter(function (k) { return obj[k][1] >= 3; });
  if (!keys.length) return null;
  keys.sort(function (a, b) { return obj[a][0] / obj[a][1] - obj[b][0] / obj[b][1]; });
  var k = keys[0], v = obj[k];
  return k.replace(/^第\d問　/, "") + "（正答率" + Math.round(v[0] / v[1] * 100) + "%）";
}

function renderWeak() {
  var st = weakStats();
  if (!st.total) {
    $("weak-lead").textContent = "まだ解答がありません。学習モードで解き進めると、ここに弱点が出てきます。";
    $("weak-dai").innerHTML = "";
    $("weak-fmt").innerHTML = "";
    show("view-weak");
    return;
  }
  var pct = Math.round(st.ok / st.total * 100);
  var worst = [worstOf(st.byDai), worstOf(st.byFmt)].filter(Boolean);
  $("weak-lead").innerHTML =
    "学習モード・本番モードの解答をあわせて<b>" + st.total + "問</b>ぶん、正答率<b>" + pct + "%</b>。" +
    (worst.length ? "いちばん弱いのは" + worst.join("と") + "です。" : "");
  $("weak-dai").innerHTML = "<h2>大問ごと（3回まとめて）</h2>" + rows(st.byDai, true);
  $("weak-fmt").innerHTML = "<h2>設問の形式ごと　—　弱い形式がそのまま伸びしろです</h2>" + rows(st.byFmt, true);
  show("view-weak");
}

function rows(obj, sort) {
  var keys = Object.keys(obj);
  if (sort) keys.sort(function (a, b) { return obj[a][0] / obj[a][1] - obj[b][0] / obj[b][1]; });
  return keys.map(function (k) {
    var v = obj[k], p = Math.round(v[0] / v[1] * 100);
    var cls = p >= 80 ? "" : (p >= 60 ? " is-mid" : " is-low");
    return '<div class="row"><span class="row__name">' + k + '</span>' +
      '<span class="row__bar"><span class="row__fill' + cls + '" style="width:' + p + '%"></span></span>' +
      '<span class="row__pct">' + v[0] + "／" + v[1] + '</span></div>';
  }).join("");
}

/* ───────── 見直し（解説を順に読む） ───────── */
var rv = { list: [], idx: 0, back: "view-result" };
function startReview(onlyWrong, back) {
  var r = rec(cur.mode, cur.id);
  var base = cur.mode === "learn" ? flat(cur.id) : cur.list;
  rv.list = base.filter(function (x) { return onlyWrong ? r.answers[x.q.n] !== x.q.a : true; });
  rv.back = back;
  if (!rv.list.length) { alert("全問正解です。見直す問題はありません。"); return; }
  rv.idx = 0;
  show("view-review");
  renderReview();
}
function renderReview() {
  var item = rv.list[rv.idx], q = item.q, r = rec(cur.mode, cur.id);
  var your = r.answers[q.n];
  $("review-pos").textContent = (rv.idx + 1) + " ／ " + rv.list.length + " 問目";
  fillStem("review", cur.id, item);
  $("review-lead").open = false;
  lockedOpts($("review-opts"), q, your);
  $("review-ex").innerHTML = exHTML(q, your);
  $("review-prev").disabled = rv.idx === 0;
  $("review-next").disabled = rv.idx === rv.list.length - 1;
}
function backFromReview() {
  if (rv.back === "view-lresult") renderLResult(cur.id, flat(cur.id), false);
  else renderResult(cur.id);
}

/* ───────── 配線 ───────── */
$("theme-toggle").addEventListener("click", function () {
  theme = theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
});
$("modes").addEventListener("click", function (e) {
  var b = e.target.closest ? e.target.closest(".mode") : null;
  if (!b) return;
  mode = b.getAttribute("data-mode");
  store.mode = mode;
  writeStore();
  renderHome();
});
function goHome() {
  if (cur.tick) { clearInterval(cur.tick); cur.tick = null; }
  renderHome(); show("view-home");
}
$("weak-open").addEventListener("click", renderWeak);
$("weak-home").addEventListener("click", goHome);

/* 学習モード */
$("learn-prev").addEventListener("click", function () { moveLearn(-1); });
$("learn-next").addEventListener("click", function () { moveLearn(1); });
$("learn-quit").addEventListener("click", function () {
  if (!cur.again) { rec("learn", cur.id).pos = cur.idx; writeStore(); }
  goHome();
});
$("lresult-home").addEventListener("click", goHome);
$("lresult-again").addEventListener("click", function () {
  var pool = wrongOf("learn", cur.id, flat(cur.id));
  if (!pool.length) return;
  startLearn(cur.id, pool, true);
});
$("lresult-all").addEventListener("click", function () { startReview(false, "view-lresult"); });
$("lresult-real").addEventListener("click", function () {
  mode = "real"; store.mode = "real"; writeStore();
  var r = rec("real", cur.id);
  if (r.done) { renderResult(cur.id); return; }
  startExam(cur.id);
});
$("lresult-reset").addEventListener("click", function () {
  if (!confirm(setOf(cur.id).name + " の学習モードを最初からやり直しますか。苦手分野の集計にはこれまでの分も残ります。")) return;
  clearRec("learn", cur.id);
  startLearn(cur.id, flat(cur.id), false);
});

/* 本番モード */
$("exam-prev").addEventListener("click", function () { move(-1); });
$("exam-next").addEventListener("click", function () { move(1); });
$("exam-sheet").addEventListener("click", renderSheet);
$("exam-quit").addEventListener("click", function () { saveProgress(); goHome(); });
$("sheet-back").addEventListener("click", function () { show("view-exam"); renderQ(); });
$("sheet-submit").addEventListener("click", function () {
  var r = rec("real", cur.id);
  var blank = cur.list.filter(function (x) { return !r.answers[x.q.n]; }).length;
  if (blank && !confirm("未解答が " + blank + " 問あります。このまま採点しますか。")) return;
  submit();
});
$("result-home").addEventListener("click", goHome);
$("result-wrong").addEventListener("click", function () { startReview(true, "view-result"); });
$("result-all").addEventListener("click", function () { startReview(false, "view-result"); });
$("result-retry").addEventListener("click", function () {
  if (!confirm(setOf(cur.id).name + " をもう一度はじめから解きますか。苦手分野の集計にはこれまでの分も残ります。")) return;
  clearRec("real", cur.id);
  startExam(cur.id);
});

/* 見直し */
$("review-back").addEventListener("click", backFromReview);
$("review-jump").addEventListener("click", backFromReview);
$("review-prev").addEventListener("click", function () { if (rv.idx > 0) { rv.idx--; renderReview(); window.scrollTo(0, 0); } });
$("review-next").addEventListener("click", function () { if (rv.idx < rv.list.length - 1) { rv.idx++; renderReview(); window.scrollTo(0, 0); } });

window.addEventListener("pagehide", function () { if (cur.tick) saveProgress(); });
document.addEventListener("visibilitychange", function () { if (document.hidden && cur.tick) saveProgress(); });

renderHome();

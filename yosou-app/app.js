/* 予想問題アプリ。SETS（3回分の問題データ）は build.js が先に埋め込む。
   設計メモ：
   ・紙の予想問題と中身は同一。違うのは「通しで解いて採点し、弱点を出す」ところだけ。
   ・設問の「下線部a」を押すとリード文が開いて該当箇所が光る。ここが画面版の一番の利点。
   ・記録は localStorage に置き、書けない環境では sessionStorage に落とす。 */
"use strict";

var VERSION = "__BUILD__";
var CIRCLE = "①②③④⑤⑥";
var LIMIT = 60 * 60;           // 制限時間（秒）
var KEY = "yosou-v1";

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
function rec(id) {
  if (!store[id]) store[id] = { answers: {}, pos: 0, elapsed: 0, done: false };
  if (!store[id].answers) store[id].answers = {};
  return store[id];
}

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
function mmss(s) {
  s = Math.max(0, Math.round(s));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

/* ───────── ホーム ───────── */
function renderHome() {
  var wrap = $("home-cards");
  wrap.innerHTML = "";
  SETS.forEach(function (s) {
    var r = rec(s.id), n = flat(s.id).length;
    var picked = Object.keys(r.answers).length;
    var state, cls, right = "";
    if (r.done) {
      state = "採点ずみ"; cls = "card__state--done";
      right = '<span class="card__score">' + r.score + '<small> 点</small></span>';
    } else if (picked > 0) {
      state = "途中（" + picked + "／" + n + "問）"; cls = "card__state--mid";
      right = '<span class="card__go">つづきから ›</span>';
    } else {
      state = "未着手"; cls = "";
      right = '<span class="card__go">はじめる ›</span>';
    }
    var b = document.createElement("button");
    b.type = "button";
    b.className = "card";
    b.style.setProperty("--c", color(s.id * 2));
    b.innerHTML =
      '<span class="card__top"><span class="card__name">' + s.name + '</span>' +
      '<span class="card__sub">' + s.sub + '</span></span>' +
      '<span class="card__note">' + s.note + '</span>' +
      '<span class="card__foot"><span class="card__state ' + cls + '">' + state + '</span>' + right + '</span>';
    b.addEventListener("click", function () { openSet(s.id); });
    wrap.appendChild(b);
  });

  var done = SETS.filter(function (s) { return rec(s.id).done; });
  var t = $("home-total");
  if (!done.length) {
    t.innerHTML = "まだ採点した回はありません。まずは第1回から、60分を計って通しで解いてみてください。";
  } else {
    var avg = Math.round(done.reduce(function (a, s) { return a + rec(s.id).score; }, 0) / done.length);
    t.innerHTML = "採点ずみ <b>" + done.length + "</b> 回／平均 <b>" + avg + "</b> 点" +
      (done.length < 3 ? "　残り " + (3 - done.length) + " 回。3回とも解いてはじめて必要知識の全体に触れます。"
                       : "　3回とも終わりました。間違えた問題の見直しへ。");
  }
  $("ver").textContent = "版 " + VERSION;
}

function openSet(id) {
  var r = rec(id);
  if (r.done) { renderResult(id); return; }
  startExam(id);
}

/* ───────── 解答中 ───────── */
var cur = { id: 0, idx: 0, list: [], t0: 0, tick: null };

function startExam(id) {
  var r = rec(id);
  cur.id = id; cur.list = flat(id); cur.idx = Math.min(r.pos || 0, cur.list.length - 1);
  cur.t0 = Date.now();
  document.documentElement.style.setProperty("--c", color(id * 2));
  show("view-exam");
  renderQ();
  if (cur.tick) clearInterval(cur.tick);
  cur.tick = setInterval(tickTime, 1000);
  tickTime();
}
function elapsed() { return rec(cur.id).elapsed + (Date.now() - cur.t0) / 1000; }
function tickTime() {
  var left = LIMIT - elapsed();
  var el = $("exam-time");
  el.textContent = (left < 0 ? "+" : "") + mmss(Math.abs(left));
  el.classList.toggle("is-over", left < 0);
  var s = $("sheet-time");
  if (s) { s.textContent = el.textContent; s.classList.toggle("is-over", left < 0); }
}
function saveProgress() {
  var r = rec(cur.id);
  r.elapsed = elapsed(); r.pos = cur.idx;
  cur.t0 = Date.now();
  writeStore();
}

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

function renderQ() {
  var item = cur.list[cur.idx], q = item.q, d = item.dai;
  var r = rec(cur.id);
  $("exam-dai").textContent = "第" + d.no + "問　" + d.title;
  $("exam-prog").style.width = ((cur.idx + 1) / cur.list.length * 100) + "%";
  fillLead(d, $("exam-leadbody"), $("exam-lead").querySelector(".lead__sum"));
  $("exam-lead").open = false;

  $("exam-qnum").textContent = "問" + q.n;
  var refBtn = $("exam-qref");
  refBtn.hidden = !q.ref;
  if (q.ref) { refBtn.textContent = q.ref; refBtn.onclick = function () { litRef($("exam-lead"), $("exam-leadbody"), q.ref); }; }
  $("exam-qtag").textContent = q.fmt;
  $("exam-qbody").innerHTML = q.q;

  var f = $("exam-fig");
  if (q.figKey && setOf(cur.id).fig[q.figKey]) { f.hidden = false; f.innerHTML = setOf(cur.id).fig[q.figKey]; }
  else { f.hidden = true; f.innerHTML = ""; }

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
  var r = rec(cur.id);
  r.answers[n] = a;
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
  var r = rec(cur.id), list = cur.list;
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
  var r = rec(cur.id), list = cur.list;
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
  cur.id = id; cur.list = flat(id);
  var r = rec(id), list = cur.list;
  document.documentElement.style.setProperty("--c", color(id * 2));
  $("result-name").textContent = setOf(id).name + "　採点結果";
  var ok = r.score >= 80;
  $("result-score").innerHTML =
    '<div class="score__pt">' + r.score + '<small> ／ 100点</small></div>' +
    '<div class="score__judge ' + (ok ? "is-ok" : "is-ng") + '">' +
      (ok ? "目標の80点に到達しました" : "80点まであと " + Math.ceil((80 - r.score) / 2) + " 問") + '</div>' +
    '<div class="score__meta">' + r.right + "／50問正解　　所要 " + mmss(r.elapsed) +
      (r.elapsed > LIMIT ? "（制限時間を超過）" : "") + '</div>';

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
  $("result-dai").innerHTML = "<h2>大問ごと</h2>" + rows(byDai);
  $("result-fmt").innerHTML = "<h2>設問の形式ごと　—　弱い形式がそのまま伸びしろです</h2>" + rows(byFmt, true);

  show("view-result");
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

/* ───────── 復習 ───────── */
var rv = { list: [], idx: 0 };
function startReview(onlyWrong) {
  var r = rec(cur.id);
  rv.list = cur.list.filter(function (x) { return onlyWrong ? r.answers[x.q.n] !== x.q.a : true; });
  if (!rv.list.length) { alert("全問正解です。見直す問題はありません。"); return; }
  rv.idx = 0;
  show("view-review");
  renderReview();
}
function renderReview() {
  var item = rv.list[rv.idx], q = item.q, d = item.dai, r = rec(cur.id);
  var your = r.answers[q.n], hit = your === q.a;
  $("review-pos").textContent = (rv.idx + 1) + " ／ " + rv.list.length + " 問目";
  fillLead(d, $("review-leadbody"), $("review-lead").querySelector(".lead__sum"));
  $("review-lead").open = false;

  $("review-qnum").textContent = "問" + q.n;
  var refBtn = $("review-qref");
  refBtn.hidden = !q.ref;
  if (q.ref) { refBtn.textContent = q.ref; refBtn.onclick = function () { litRef($("review-lead"), $("review-leadbody"), q.ref); }; }
  $("review-qtag").textContent = q.fmt;
  $("review-qbody").innerHTML = q.q;

  var f = $("review-fig");
  if (q.figKey && setOf(cur.id).fig[q.figKey]) { f.hidden = false; f.innerHTML = setOf(cur.id).fig[q.figKey]; }
  else { f.hidden = true; f.innerHTML = ""; }

  var ol = $("review-opts");
  ol.innerHTML = "";
  q.c.forEach(function (text, i) {
    var li = document.createElement("li");
    var cls = "opt";
    var mark = "";
    if (i + 1 === q.a) { cls += " is-correct"; mark = '<span class="opt__mark">正解</span>'; }
    if (i + 1 === your && !hit) { cls += " is-yours"; mark = '<span class="opt__mark">あなたの答え</span>'; }
    li.innerHTML = '<div class="' + cls + '"><span class="opt__n">' + CIRCLE[i] + '</span>' +
      '<span class="opt__t">' + text + '</span>' + mark + '</div>';
    ol.appendChild(li);
  });

  $("review-ex").innerHTML =
    '<div class="ex__head ' + (hit ? "is-ok" : "is-ng") + '">' +
      (hit ? "正解" : (your ? "不正解　正解は " + CIRCLE[q.a - 1] : "未解答　正解は " + CIRCLE[q.a - 1])) + '</div>' +
    '<p class="ex__body">' + q.ex + '</p>' +
    (q.src ? '<p class="ex__src"><span>予想の根拠</span>' + q.src + '</p>' : "");

  $("review-prev").disabled = rv.idx === 0;
  $("review-next").disabled = rv.idx === rv.list.length - 1;
}

/* ───────── 配線 ───────── */
$("exam-prev").addEventListener("click", function () { move(-1); });
$("exam-next").addEventListener("click", function () { move(1); });
$("exam-sheet").addEventListener("click", renderSheet);
$("exam-quit").addEventListener("click", function () {
  saveProgress();
  if (cur.tick) { clearInterval(cur.tick); cur.tick = null; }
  renderHome(); show("view-home");
});
$("sheet-back").addEventListener("click", function () { show("view-exam"); renderQ(); });
$("sheet-submit").addEventListener("click", function () {
  var r = rec(cur.id);
  var blank = cur.list.filter(function (x) { return !r.answers[x.q.n]; }).length;
  if (blank && !confirm("未解答が " + blank + " 問あります。このまま採点しますか。")) return;
  submit();
});
$("result-home").addEventListener("click", function () { renderHome(); show("view-home"); });
$("result-wrong").addEventListener("click", function () { startReview(true); });
$("result-all").addEventListener("click", function () { startReview(false); });
$("result-retry").addEventListener("click", function () {
  if (!confirm(setOf(cur.id).name + " の記録を消して、もう一度はじめから解きますか。")) return;
  store[cur.id] = { answers: {}, pos: 0, elapsed: 0, done: false };
  writeStore();
  startExam(cur.id);
});
$("review-back").addEventListener("click", function () { renderResult(cur.id); });
$("review-jump").addEventListener("click", function () { renderResult(cur.id); });
$("review-prev").addEventListener("click", function () { if (rv.idx > 0) { rv.idx--; renderReview(); window.scrollTo(0, 0); } });
$("review-next").addEventListener("click", function () { if (rv.idx < rv.list.length - 1) { rv.idx++; renderReview(); window.scrollTo(0, 0); } });

window.addEventListener("pagehide", function () { if (cur.tick) saveProgress(); });
document.addEventListener("visibilitychange", function () { if (document.hidden && cur.tick) saveProgress(); });

renderHome();

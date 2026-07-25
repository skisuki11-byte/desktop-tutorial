/* 世界史 一問一答 — 土浦日大 基礎学力到達度テスト対策
   大問①〜⑤は令和5・6・7の3年とも同じ並びで出題された「鉄板」。章番号はその実際の出題順。 */
(function () {
  "use strict";

  var CHAPTERS = [
    { id: 1, key: "ch1", badge: "①", name: "古代ギリシア・ローマ", sub: "＋中世西欧の入口", note: "3年連続 大問1" },
    { id: 2, key: "ch2", badge: "②", name: "古代インド・古代中国", sub: "＋東南アジア", note: "3年連続 大問2" },
    { id: 3, key: "ch3", badge: "③", name: "古代オリエント・イスラーム世界", sub: "", note: "3年連続 大問3" },
    { id: 4, key: "ch4", badge: "④", name: "モンゴル帝国・中世〜近世東アジア", sub: "宋・元・明・清", note: "3年連続 大問4" },
    { id: 5, key: "ch5", badge: "⑤", name: "近世ヨーロッパ", sub: "大航海〜宗教改革〜市民革命", note: "3年連続 大問5" },
    { id: 6, key: "ch6", badge: "⑥", name: "近代欧米・ロシア・19〜20世紀", sub: "変動枠", note: "出る年は丸ごと1〜3大問" },
    { id: 7, key: "ch7", badge: "探", name: "テーマ史・史料型", sub: "世界史探究の選択問題", note: "令和7 大問6 対応" }
  ];

  var LEVELS = { 1: "基本", 2: "標準", 3: "やや難" };
  var STORE_KEY = "sekaishi.v1";

  var ALL = [];
  var BY_ID = {};
  var store = { stats: {}, last: null };
  var session = null;

  /* ---------- 保存 ---------- */

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && p.stats) store = { stats: p.stats, last: p.last || null };
      }
    } catch (e) { /* 保存が使えない環境でも動かす */ }
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function stat(id) {
    return store.stats[id] || { c: 0, w: 0, lastWrong: false };
  }

  function record(id, ok) {
    var s = store.stats[id] || { c: 0, w: 0, lastWrong: false };
    if (ok) s.c++; else s.w++;
    s.lastWrong = !ok;
    store.stats[id] = s;
    save();
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

  // 未出題を最優先、次に間違えた問題。同じ問題ばかり出ないよう乱数で散らす。
  function score(item) {
    var s = stat(item.id);
    var total = s.c + s.w;
    var base;
    if (total === 0) base = 1.7;
    else base = 0.55 + 1.8 * ((s.w + 0.4) / (total + 0.8));
    if (s.lastWrong) base += 0.7;
    return base * (0.55 + Math.random());
  }

  function isWeak(item) {
    var s = stat(item.id);
    var total = s.c + s.w;
    if (!total) return false;
    return s.lastWrong || s.c / total < 0.7;
  }

  function pool(opts) {
    var p = ALL.filter(function (it) {
      if (opts.chapters && opts.chapters.indexOf(it.ch) < 0) return false;
      if (opts.mode === "qa" && it.t !== "qa") return false;
      if (opts.weakOnly && !isWeak(it)) return false;
      return true;
    });
    return p;
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
      alert(opts.weakOnly
        ? "苦手な問題はまだありません。まずは何問か解いてみてください。"
        : "この条件に合う問題がありません。");
      return;
    }
    var picked;
    if (opts.count === "all") {
      picked = shuffle(p.slice());
    } else {
      picked = p.map(function (it) { return { it: it, s: score(it) }; })
        .sort(function (a, b) { return b.s - a.s; })
        .slice(0, Math.min(opts.count, p.length))
        .map(function (o) { return o.it; });
      shuffle(picked);
    }

    session = {
      views: picked.map(prepare),
      idx: 0,
      mode: opts.mode,
      title: opts.title,
      chapters: opts.chapters || null,
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
    ["home", "chapter", "quiz", "result", "stats"].forEach(function (v) {
      $("#view-" + v).classList.toggle("is-active", v === name);
    });
    window.scrollTo(0, 0);
  }

  function accentFor(chId) { return "var(--ch" + chId + ")"; }

  /* ---------- ホーム ---------- */

  function renderHome() {
    var totalSeen = 0, totalRight = 0, answeredCount = 0;
    ALL.forEach(function (it) {
      var s = stat(it.id);
      if (s.c + s.w > 0) { answeredCount++; totalSeen += s.c + s.w; totalRight += s.c; }
    });

    $("#home-sub").textContent = answeredCount === 0
      ? "全" + ALL.length + "問。大問①〜⑤の鉄板テーマを軸に、過去問と同じ出題形式でつくってあります。"
      : "全" + ALL.length + "問中 " + answeredCount + "問に挑戦ずみ・通算正答率 " + pct(totalRight, totalSeen) + "％";

    var weakCount = ALL.filter(isWeak).length;
    var weakBtn = $("#btn-weak");
    weakBtn.disabled = weakCount === 0;
    $("#btn-weak-desc").textContent = weakCount === 0 ? "まだありません" : weakCount + "問たまっています";

    var resumeBtn = $("#btn-resume");
    if (store.last) {
      resumeBtn.disabled = false;
      $("#btn-resume-desc").textContent = store.last.title;
    } else {
      resumeBtn.disabled = true;
      $("#btn-resume-desc").textContent = "まだ記録がありません";
    }

    var list = $("#chapter-list");
    list.textContent = "";
    CHAPTERS.forEach(function (ch) {
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
      var choices = el("div", "choices");
      view.choices.forEach(function (text, i) {
        var b = el("button", "choice");
        b.appendChild(el("span", "choice__no", String(i + 1)));
        b.appendChild(el("span", null, text));
        b.addEventListener("click", function () { answerMC(i); });
        choices.appendChild(b);
      });
      body.appendChild(choices);
      setActions([]);
    } else {
      setActions([{ label: "答えを見る", cls: "btn btn--primary", fn: revealQA }]);
    }
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
    var view = session.views[session.idx];
    var item = view.item;
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
    ex.appendChild(el("div", "explain__label", "解説"));
    ex.appendChild(el("p", "explain__body", item.e));
    $("#quiz-body").appendChild(ex);
  }

  function finish(ok, skipExplain) {
    var view = session.views[session.idx];
    var item = view.item;
    record(item.id, ok);
    session.results.push({ item: item, ok: ok });

    if (!skipExplain) {
      var v = el("div", "verdict fadein " + (ok ? "verdict--good" : "verdict--bad"),
        ok ? "◯　正解" : "×　不正解");
      $("#quiz-body").appendChild(v);
      appendExplain(item);
    }

    var isLast = session.idx === session.views.length - 1;
    setActions([{
      label: isLast ? "結果を見る" : "次の問題へ",
      cls: "btn btn--primary",
      fn: next
    }]);
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

    var msg;
    if (p >= 90) msg = "この精度なら十分。9月まで落とさないことだけ考えれば大丈夫です。";
    else if (p >= 80) msg = "目標の80点ライン。あとは間違えた問題の解説を読んで、取りこぼしを潰していきましょう。";
    else if (p >= 60) msg = "あと一歩。下に出ている間違えた問題だけ、もう一周してみてください。";
    else msg = "いまは覚える段階。解説を読んでから「まちがい直し」でもう一度解くと、次はぐっと上がります。";
    $("#result-msg").textContent = msg;

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
      start({ chapters: null, mode: "mc", count: 20, title: "今日の20問（全範囲・本番形式）" });
    });
    $("#btn-qa").addEventListener("click", function () {
      start({ chapters: null, mode: "qa", count: 20, title: "一問一答 20問（全範囲）" });
    });
    $("#btn-weak").addEventListener("click", function () {
      start({ chapters: null, mode: "mc", count: 20, weakOnly: true, title: "苦手だけ 20問" });
    });
    $("#btn-resume").addEventListener("click", function () {
      if (store.last) start(store.last);
    });
    $("#btn-stats").addEventListener("click", function () { renderStats(); show("stats"); });

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
    $("#quiz-back").addEventListener("click", function () {
      if (session && session.results.length && !confirm("ここまでの結果は保存されます。ホームに戻りますか？")) return;
      renderHome(); show("home");
    });

    document.addEventListener("keydown", function (e) {
      if (!$("#view-quiz").classList.contains("is-active")) return;
      if (e.key >= "1" && e.key <= "4" && session.mode === "mc" && !session.answered) {
        var nodes = $("#quiz-body").querySelectorAll(".choice");
        var i = parseInt(e.key, 10) - 1;
        if (nodes[i]) nodes[i].click();
      } else if (e.key === "Enter" || e.key === " ") {
        var btn = $("#quiz-actions").querySelector(".btn--primary");
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
  }

  load();
  build();
  initTheme();
  bind();
  renderHome();
  show("home");
})();

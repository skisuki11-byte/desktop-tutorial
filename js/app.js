/* ==========================================================
   日大基礎学 英単語 一問一答  —  アプリ本体
   ========================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'nichidai-eigo-v1';
  var AUTH_KEY = 'nichidai-eigo-auth';
  var LOGIN_PIN = '0402';
  var MASTER_LV = 2;   // このレベル以上で「習得済み」

  /* ---------------------------------------------------------
     1. デッキ定義
     --------------------------------------------------------- */
  // トップ画面はレベル別の3択に絞る（各レベルは複数デッキの合算）
  var LEVEL_DECKS = [
    { id: 'beginner', ico: '①', name: '初級',
      desc: '基礎単語＋英英定義｜まずはここから' },
    { id: 'intermediate', ico: '②', name: '中級',
      desc: '基本熟語・連語・長文頻出単語｜得点力を伸ばす' },
    { id: 'advanced', ico: '③', name: '上級',
      desc: '応用単語・文法・長文の空所補充｜差がつく範囲' }
  ];

  // 出題形式で絞りたい人向けのオプション（折りたたみ表示）
  var OPTION_DECKS = [
    { id: 'def', ico: '🔍', name: '英英定義 → 単語', desc: '4月型 大問2(A)' },
    { id: 'idiom', ico: '🔗', name: '連語・イディオム', desc: '4月型 大問2(B)' },
    { id: 'grammar', ico: '📐', name: '文法・語法', desc: '大問3 / 大問2(A)' },
    { id: 'cloze', ico: '📝', name: '長文の空所補充', desc: '9月型 大問4' },
    { id: 'vocab', ico: '📚', name: '長文頻出単語', desc: '統計・社会・科学の長文' }
  ];

  // 元デッキ（過去問カテゴリ／基礎単語レベル）→ 表示レベルの対応
  var LEVEL_OF_DECK = {
    def: 'beginner',        lv1: 'beginner',  'idiom-basic': 'beginner',
    idiom: 'intermediate',  lv2: 'intermediate', vocab: 'intermediate',
    grammar: 'advanced',    lv3: 'advanced',  cloze: 'advanced'
  };

  /* ---------------------------------------------------------
     2. データの正規化
     --------------------------------------------------------- */
  var items = [];   // 全設問（正規化済み）
  var byDeck = {};  // deckId or levelId -> [item]

  function pushItem(it) {
    it.level = LEVEL_OF_DECK[it.deck] || null;
    items.push(it);
    (byDeck[it.deck] = byDeck[it.deck] || []).push(it);
    if (it.level) (byDeck[it.level] = byDeck[it.level] || []).push(it);
  }

  function buildExamItems() {
    (window.EXAM_ITEMS || []).forEach(function (row, i) {
      var tag = row.src + (row.no ? ' ' + row.no : '');
      if (row.real) tag += '（実出題）';

      // 4択クイズは元の出題文脈（英文空所補充・英英定義など）をそのまま使う。
      // 一問一答は「英語→日本語」で統一し、かつ長文を出さないため、
      // 常に短い英語の語句を表、短い日本語の意味を裏にする。
      // 熟語の一部（誤答選択肢・予想）だけ短い意味が q 側に入っているため、
      // その場合だけ q を意味として使い、ja（用例文）は補足に回す。
      var shortMeaningInQ = row.cat === 'idiom' && /^[^\x00-\x7F]/.test(row.q.trim());
      var flashA, flashNote;
      if (shortMeaningInQ) {
        flashA = row.q;
        flashNote = [row.ja, row.note].filter(Boolean).join('\n');
      } else {
        flashA = row.ja || row.a;
        flashNote = row.note || '';
      }

      pushItem({
        id: 'e' + i,
        deck: row.cat,
        tag: tag,
        real: !!row.real,
        q: row.q,
        qIsEn: /[A-Za-z].*[A-Za-z]/.test(row.q) && row.q.split(' ').length > 2,
        a: row.a,
        ja: row.ja || '',
        note: row.note || '',
        choices: (row.choices || []).slice(),
        flashQ: row.a,
        flashA: flashA,
        flashNote: flashNote
      });
    });
  }

  function buildBasicItems() {
    var vocab = window.VOCAB || [];
    // 同じ品詞のプールから誤答選択肢を作る
    var pools = {};
    vocab.forEach(function (w) {
      (pools[w.pos] = pools[w.pos] || []).push(w.ja);
    });

    vocab.forEach(function (w, i) {
      var deck = (w.cat === 'idiom') ? 'idiom-basic' : 'lv' + w.lv;
      var pool = pools[w.pos] || [];
      var choices = [w.ja];
      var guard = 0;
      while (choices.length < 4 && guard < 300) {
        var cand = pool[Math.floor(Math.random() * pool.length)];
        if (cand && choices.indexOf(cand) === -1) choices.push(cand);
        guard++;
      }
      shuffle(choices);

      var basicNote = w.ex ? w.ex + '\n' + w.exJa : '';
      pushItem({
        id: 'w' + i,
        deck: deck,
        tag: w.pos + '｜' + (w.cat === 'idiom' ? '熟語' : 'レベル' + w.lv),
        real: false,
        q: w.en,
        qIsEn: false,
        a: w.ja,
        ja: '',
        note: basicNote,
        choices: choices,
        flashQ: w.en,
        flashA: w.ja,
        flashNote: basicNote
      });
    });
  }

  /* ---------------------------------------------------------
     3. 学習記録（localStorage）
     --------------------------------------------------------- */
  var store = { recs: {}, streak: { last: '', count: 0 } };

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          store.recs = parsed.recs || {};
          store.streak = parsed.streak || { last: '', count: 0 };
        }
      }
    } catch (e) { /* 保存が使えない環境でも動作させる */ }
  }

  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {}
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function touchStreak() {
    var t = today();
    if (store.streak.last === t) return;
    var y = new Date();
    y.setDate(y.getDate() - 1);
    var yStr = y.getFullYear() + '-' + pad(y.getMonth() + 1) + '-' + pad(y.getDate());
    store.streak.count = (store.streak.last === yStr) ? store.streak.count + 1 : 1;
    store.streak.last = t;
    saveStore();
  }

  function rec(id) { return store.recs[id] || null; }

  function judge(id, kind) {
    var r = store.recs[id] || { lv: 0, miss: 0 };
    if (kind === 'ok')       r.lv = Math.min(3, r.lv + 1);
    else if (kind === 'mid') r.lv = 1;
    else                   { r.lv = 0; r.miss++; }
    store.recs[id] = r;
    touchStreak();
    saveStore();
  }

  function isMastered(id) { var r = rec(id); return !!r && r.lv >= MASTER_LV; }
  function isWeak(id)     { var r = rec(id); return !!r && r.miss > 0 && r.lv < MASTER_LV; }
  function isNew(id)      { return !rec(id); }

  /* ---------------------------------------------------------
     4. 小道具
     --------------------------------------------------------- */
  function $(sel) { return document.querySelector(sel); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var VIEWS = ['login', 'home', 'mode', 'flash', 'quiz', 'result', 'list', 'analysis'];
  function show(name) {
    VIEWS.forEach(function (v) {
      var node = $('#view-' + v);
      if (node) node.hidden = (v !== name);
    });
    var header = document.querySelector('.app-header');
    if (header) header.hidden = (name === 'login');
    $('#btn-home').hidden = (name === 'home' || name === 'login');
    window.scrollTo(0, 0);
  }

  function goHome() { renderHome(); show('home'); }

  /* ---------------------------------------------------------
     4.5. ログイン（暗証番号）
     --------------------------------------------------------- */
  function isAuthed() {
    try { return localStorage.getItem(AUTH_KEY) === '1'; } catch (e) { return false; }
  }

  function tryLogin() {
    var input = $('#login-pin');
    var val = (input.value || '').trim();
    if (val === LOGIN_PIN) {
      try { localStorage.setItem(AUTH_KEY, '1'); } catch (e) {}
      renderHome();
      show('home');
      return;
    }
    $('#login-error').hidden = false;
    input.value = '';
    input.focus();
    var card = document.querySelector('.login-card');
    card.classList.remove('shake');
    void card.offsetWidth; // reflow でアニメーションを再トリガー
    card.classList.add('shake');
  }

  /* ---------------------------------------------------------
     5. ホーム画面
     --------------------------------------------------------- */
  function renderHome() {
    var total = items.length;
    var mastered = 0, weak = 0, fresh = 0;
    items.forEach(function (it) {
      if (isMastered(it.id)) mastered++;
      else if (isWeak(it.id)) weak++;
      if (isNew(it.id)) fresh++;
    });

    $('#stat-mastered').textContent = mastered;
    $('#stat-total').textContent = '/' + total;
    $('#stat-weak').textContent = weak;
    $('#stat-new').textContent = fresh;
    $('#stat-streak').textContent = store.streak.count || 0;

    var circ = 2 * Math.PI * 52;
    var ratio = total ? mastered / total : 0;
    var ring = $('#ring-fg');
    ring.style.strokeDasharray = circ;
    ring.style.strokeDashoffset = circ * (1 - ratio);

    renderDeckGrid('#deck-grid', LEVEL_DECKS);
    renderDeckGrid('#deck-grid-options', OPTION_DECKS);
  }

  function renderDeckGrid(sel, decks) {
    var wrap = $(sel);
    wrap.innerHTML = '';
    decks.forEach(function (d) {
      var list = byDeck[d.id] || [];
      if (!list.length) return;
      var done = list.filter(function (it) { return isMastered(it.id); }).length;
      var pct = list.length ? Math.round(done / list.length * 100) : 0;

      var card = el('button', 'deck-card');
      card.type = 'button';

      var ico = el('span', 'deck-ico', d.ico);
      var body = el('div', 'deck-body');
      body.appendChild(el('div', 'deck-name', d.name));
      body.appendChild(el('div', 'deck-desc', d.desc));
      var mini = el('div', 'deck-mini');
      var fill = el('i');
      fill.style.width = pct + '%';
      mini.appendChild(fill);
      body.appendChild(mini);

      var stat = el('div', 'deck-stat');
      stat.appendChild(el('b', null, done + '/' + list.length));
      stat.appendChild(document.createTextNode(pct + '%'));

      card.appendChild(ico);
      card.appendChild(body);
      card.appendChild(stat);
      card.addEventListener('click', function () { openMode(d); });
      wrap.appendChild(card);
    });
  }

  /* ---------------------------------------------------------
     6. モード選択
     --------------------------------------------------------- */
  var currentDeck = null;

  function openMode(deck) {
    currentDeck = deck;
    var list = byDeck[deck.id] || [];
    var weakCount = list.filter(function (it) { return isWeak(it.id); }).length;
    $('#mode-deck-title').textContent = deck.name;
    $('#mode-deck-desc').textContent = deck.desc + '（全' + list.length + '問／苦手' + weakCount + '問）';
    show('mode');
  }

  /* ---------------------------------------------------------
     7. セッション管理
     --------------------------------------------------------- */
  var session = null;

  function startSession(mode) {
    var list = (byDeck[currentDeck.id] || []).slice();
    if (mode === 'weak') {
      list = list.filter(function (it) { return isWeak(it.id); });
      if (!list.length) {
        alert('このデッキに苦手問題はまだありません。まず「一問一答」か「4択クイズ」で解いてみてください。');
        return;
      }
      mode = 'flash';
    }
    if ($('#chk-shuffle').checked) shuffle(list);

    session = { mode: mode, list: list, i: 0, correct: 0, missed: [], answered: {} };

    if (mode === 'flash') { show('flash'); renderFlash(); }
    else                  { show('quiz');  renderQuiz();  }
  }

  function startCustomSession(list, mode) {
    session = { mode: mode, list: list.slice(), i: 0, correct: 0, missed: [], answered: {} };
    if (mode === 'flash') { show('flash'); renderFlash(); }
    else                  { show('quiz');  renderQuiz();  }
  }

  function advance() {
    session.i++;
    if (session.i >= session.list.length) { renderResult(); return; }
    if (session.mode === 'flash') renderFlash();
    else renderQuiz();
  }

  // 同じ問題を2回以上採点しても結果画面の集計が二重にならないようにする
  function scoreOnce(it, ok) {
    if (session.answered[it.id]) return;
    session.answered[it.id] = true;
    if (ok) session.correct++;
    else session.missed.push(it);
  }

  function goToPrevQuestion() {
    if (session.i <= 0) return;
    session.i--;
    if (session.mode === 'flash') renderFlash();
    else renderQuiz();
  }

  /* ---------------------------------------------------------
     8. 一問一答（カード）
     --------------------------------------------------------- */
  function renderFlash() {
    var it = session.list[session.i];
    var n = session.list.length;

    $('#flash-bar').style.width = (session.i / n * 100) + '%';
    $('#flash-count').textContent = (session.i + 1) + ' / ' + n;

    $('#flash-tag').textContent = it.tag;
    var q = $('#flash-q');
    // 一問一答は常に「英語→日本語」。短い英語の語句だけを表示し、
    // 出題時の長い英文（空所補充・定義文など）は出さない。
    q.textContent = it.flashQ;
    q.className = 'card-q card-q-flash';

    $('#flash-answer').textContent = it.flashA;
    $('#flash-ja').textContent = '';
    $('#flash-note').textContent = it.flashNote;

    $('#flash-a').hidden = true;
    $('#btn-reveal').hidden = false;
    $('#judge-row').hidden = true;
    $('#btn-prev-flash').disabled = (session.i === 0);
  }

  function revealFlash() {
    $('#flash-a').hidden = false;
    $('#btn-reveal').hidden = true;
    $('#judge-row').hidden = false;
  }

  /* ---------------------------------------------------------
     9. 4択クイズ
     --------------------------------------------------------- */
  function renderQuiz() {
    var it = session.list[session.i];
    var n = session.list.length;

    $('#quiz-bar').style.width = (session.i / n * 100) + '%';
    $('#quiz-count').textContent = (session.i + 1) + ' / ' + n;

    $('#quiz-tag').textContent = it.tag;
    var q = $('#quiz-q');
    q.textContent = it.q;
    q.className = 'card-q' + (it.qIsEn ? ' is-en' : '');

    var choices = it.choices.slice();
    if (choices.indexOf(it.a) === -1) choices.push(it.a);
    shuffle(choices);

    var wrap = $('#choice-list');
    wrap.innerHTML = '';
    choices.forEach(function (c, idx) {
      var b = el('button', 'choice');
      b.type = 'button';
      b.appendChild(el('span', 'choice-no', String(idx + 1)));
      b.appendChild(el('span', null, c));
      b.addEventListener('click', function () { answerQuiz(b, c, it, wrap); });
      wrap.appendChild(b);
    });

    $('#quiz-feedback').hidden = true;
    $('#btn-prev-quiz').disabled = (session.i === 0);
  }

  function answerQuiz(btn, picked, it, wrap) {
    var ok = (picked === it.a);
    judge(it.id, ok ? 'ok' : 'ng');
    scoreOnce(it, ok);

    Array.prototype.forEach.call(wrap.children, function (b) {
      b.disabled = true;
      var label = b.lastChild.textContent;
      if (label === it.a) b.classList.add('correct');
    });
    if (!ok) btn.classList.add('wrong');

    $('#quiz-ja').textContent = it.ja || it.a;
    $('#quiz-note').textContent = it.note;
    $('#quiz-feedback').hidden = false;
  }

  /* ---------------------------------------------------------
     10. 結果
     --------------------------------------------------------- */
  function renderResult() {
    var n = session.list.length;
    var isQuiz = (session.mode === 'quiz');

    $('#result-correct').textContent = isQuiz ? session.correct : (n - session.missed.length);
    $('#result-total').textContent = '/' + n;

    var rate = n ? Math.round((isQuiz ? session.correct : n - session.missed.length) / n * 100) : 0;
    var msg = rate === 100 ? '全問正解。この範囲は仕上がっています。'
            : rate >= 80   ? 'あと少し。間違えた問題だけもう一周しましょう。'
            : rate >= 50   ? '半分は取れています。苦手リストを重点的に。'
                           : 'まずは答えを見ながら3周。回数で必ず定着します。';
    $('#result-msg').textContent = msg;

    $('#btn-retry-weak').hidden = (session.missed.length === 0);

    var ul = $('#review-list');
    ul.innerHTML = '';
    if (session.missed.length) {
      // 一覧・一問一答と同じく「英語→日本語」で統一して表示する
      session.missed.forEach(function (it) {
        var li = el('li');
        li.appendChild(el('div', 'review-a', it.flashQ));
        if (it.flashA) li.appendChild(el('div', 'review-ja', it.flashA));
        ul.appendChild(li);
      });
    }
    show('result');
  }

  /* ---------------------------------------------------------
     11. 一覧
     --------------------------------------------------------- */
  function renderList(filter) {
    var list = byDeck[currentDeck.id] || [];
    var q = (filter || '').trim().toLowerCase();
    if (q) {
      list = list.filter(function (it) {
        return (it.flashQ + ' ' + it.flashA + ' ' + it.q + ' ' + it.a + ' ' + it.ja + ' ' + it.note).toLowerCase().indexOf(q) !== -1;
      });
    }

    var ul = $('#word-list');
    ul.innerHTML = '';
    if (!list.length) {
      ul.appendChild(el('li', 'empty', '該当する項目がありません。'));
      return;
    }
    // 一覧も一問一答と同じ「英語→日本語」表示に統一する。
    // 短い英語の語句・短い日本語の意味は必ず flashQ/flashA を使い、
    // カテゴリによって用例文の長さがばらついて見た目が揃わないのを防ぐ。
    list.forEach(function (it) {
      var li = el('li');
      var head = el('div', 'wl-head');
      head.appendChild(el('span', 'wl-a', it.flashQ));
      if (it.flashA) head.appendChild(el('span', 'wl-ja', it.flashA));
      head.appendChild(el('span', 'wl-src', it.tag));
      li.appendChild(head);
      if (it.flashNote) li.appendChild(el('div', 'wl-q', it.flashNote));
      ul.appendChild(li);
    });
  }

  /* ---------------------------------------------------------
     12. 出題分析
     --------------------------------------------------------- */
  var ANALYSIS_HTML = [
    '<h2>収録した過去問（7回分）</h2>',
    '<p>Google Drive の画像56枚を解析し、令和2年度9月〜令和5年度9月の7回分を特定しました。',
    '令和2年度4月はコロナ禍で未実施です。</p>',

    '<h2>最重要：4月型と9月型で構成が違う</h2>',
    '<h3>4月型（語彙が独立大問で出る）</h3>',
    '<div class="tbl-wrap"><table><tr><th>大問</th><th>内容</th><th>問数</th></tr>',
    '<tr><td>1</td><td>リスニング</td><td>6</td></tr>',
    '<tr><td><b>2(A)</b></td><td><b>英英定義 → 単語</b></td><td><b>4</b></td></tr>',
    '<tr><td><b>2(B)</b></td><td><b>連語（イディオム）</b></td><td><b>4</b></td></tr>',
    '<tr><td>3</td><td>文法・語法</td><td>5</td></tr>',
    '<tr><td>4</td><td>語句整序</td><td>4</td></tr>',
    '<tr><td>5</td><td>対話文の空所補充</td><td>4</td></tr>',
    '<tr><td>6</td><td>グラフ＋長文／不要文削除</td><td>8</td></tr>',
    '<tr><td>7</td><td>長文読解</td><td>8</td></tr></table></div>',

    '<h3>9月型（長文の比重が上がる）</h3>',
    '<div class="tbl-wrap"><table><tr><th>大問</th><th>内容</th><th>問数</th></tr>',
    '<tr><td>1</td><td>リスニング（Part A/B/C）</td><td>10</td></tr>',
    '<tr><td><b>2(A)</b></td><td><b>文法・語法</b></td><td><b>4</b></td></tr>',
    '<tr><td>2(B)</td><td>対話の応答選択</td><td>4</td></tr>',
    '<tr><td>2(C)</td><td>語句整序</td><td>5</td></tr>',
    '<tr><td>3</td><td>グラフ＋長文</td><td>4</td></tr>',
    '<tr><td><b>4</b></td><td><b>長文の空所補充（語彙力勝負）</b></td><td><b>9</b></td></tr>',
    '<tr><td>5</td><td>長文読解</td><td>8</td></tr></table></div>',

    '<h2>どこで差がつくか</h2>',

    '<h3>① 英英定義（4月型 大問2A）</h3>',
    '<p>定義文が平易なので、<b>単語の意味を知っていれば確実に取れる唯一の大問</b>。',
    '誤答選択肢が似た綴りで揃えられるのが特徴です。</p>',
    '<ul><li><code>competition / completion / corporation / contradiction</code></li>',
    '<li><code>cooperate / communicate / concentrate / correlate</code></li></ul>',
    '<p>→ <b>綴りが似た語をセットで覚える</b>のが対策。</p>',

    '<h3>② 連語・イディオム（4月型 大問2B）</h3>',
    '<p>過去3回の正解＋誤答選択肢＝<b>48個</b>。誤答選択肢は次年度に正解として出る可能性が高いので、',
    'このアプリでは<b>誤答選択肢も全て収録</b>しています。</p>',
    '<p>句動詞（take / bring / hand / turn / pay ＋ 副詞）と前置詞句（in 〜 of）の2系統に整理できます。</p>',

    '<h3>③ 長文の空所補充（9月型 大問4）＝ 配点最大</h3>',
    '<p>9問すべてが実質<b>語彙問題</b>。とくに<b>接続表現が毎回1〜2問</b>出ます。</p>',
    '<ul><li><code>while</code>（〜する間／〜だが）… R2-9・R4-9・R5-9 で<b>3回</b></li>',
    '<li><code>unless</code> / <code>because of</code> / <code>by comparison</code> / <code>in other words</code></li></ul>',
    '<p>→ 意味を知っていれば文脈から即決できるので<b>最優先</b>。</p>',

    '<h3>④ 文法・語法 ＝ 論点が完全に固定</h3>',
    '<p>7回分で問われた論点は13個に集約されます。</p>',
    '<ul>',
    '<li>付帯状況 <code>with + O + 分詞</code>（<b>2回</b>：arms crossed / legs crossed）</li>',
    '<li>知覚動詞 + O + 原形（saw a woman cross）</li>',
    '<li><code>have + O + 過去分詞</code>（had her blood taken）</li>',
    '<li>形式目的語 it（found it difficult to）</li>',
    '<li>強調構文 It is 〜 that/who</li>',
    '<li>仮定法倒置（Had I known）</li>',
    '<li>大過去（had forgotten）</li>',
    '<li>不定詞の完了形（to have been born）</li>',
    '<li>関係副詞 when / how、疑問形容詞 which</li>',
    '<li>反復を避ける that（不可算名詞）</li>',
    '<li>自動詞 talk about vs 他動詞 discuss / mention</li>',
    '<li>分詞の後置修飾（written / playing）</li>',
    '<li>結果の不定詞 only to do</li>',
    '</ul>',
    '<p>→ <b>この13個を潰せば文法は満点圏</b>。</p>',

    '<h3>⑤ 長文の頻出テーマ</h3>',
    '<ul>',
    '<li>統計・調査：結婚観／海外居住意識／メディア信頼度／コロナ後の高校生意識</li>',
    '<li>テクノロジー：AI／チェスとDeep Blue／DeLorean</li>',
    '<li>環境・社会：プラスチックごみ／食料自給率／最低賃金／ガラスの天井／Xジェンダー</li>',
    '<li>生物・科学：睡眠／ナマケモノ／チーター／感情と表情／ホラー映画</li>',
    '</ul>',
    '<p><code>survey / percentage / participant / reveal / indicate / figure / decrease / majority</code> など',
    '<b>統計を語る語彙</b>が全年度で繰り返し出ます。「長文頻出単語」デッキに収録しました。</p>'
  ].join('');

  /* ---------------------------------------------------------
     13. イベント配線
     --------------------------------------------------------- */
  function wire() {
    $('#btn-login').addEventListener('click', tryLogin);
    $('#login-pin').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); tryLogin(); }
    });
    $('#login-pin').addEventListener('input', function () { $('#login-error').hidden = true; });

    $('#btn-home').addEventListener('click', goHome);

    $('#btn-back-mode').addEventListener('click', goHome);
    $('#btn-back-analysis').addEventListener('click', goHome);
    $('#btn-menu-flash').addEventListener('click', function () { openMode(currentDeck); });
    $('#btn-menu-quiz').addEventListener('click', function () { openMode(currentDeck); });
    $('#btn-back-result').addEventListener('click', function () { openMode(currentDeck); });
    $('#btn-back-list').addEventListener('click', function () { openMode(currentDeck); });
    $('#btn-prev-flash').addEventListener('click', goToPrevQuestion);
    $('#btn-prev-quiz').addEventListener('click', goToPrevQuestion);

    $('#link-analysis').addEventListener('click', function (e) {
      e.preventDefault();
      $('#analysis-body').innerHTML = ANALYSIS_HTML;
      show('analysis');
    });

    Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function (b) {
      b.addEventListener('click', function () {
        var mode = b.getAttribute('data-mode');
        if (mode === 'list') { renderList(''); show('list'); return; }
        startSession(mode);
      });
    });

    $('#btn-reveal').addEventListener('click', revealFlash);

    Array.prototype.forEach.call(document.querySelectorAll('#judge-row .btn'), function (b) {
      b.addEventListener('click', function () {
        var kind = b.getAttribute('data-judge');
        var it = session.list[session.i];
        judge(it.id, kind);
        scoreOnce(it, kind === 'ok');
        advance();
      });
    });

    $('#btn-next').addEventListener('click', advance);

    $('#btn-retry').addEventListener('click', function () {
      startCustomSession(session.list, session.mode);
    });
    $('#btn-retry-weak').addEventListener('click', function () {
      startCustomSession(session.missed, session.mode);
    });
    $('#btn-back-home').addEventListener('click', goHome);

    $('#list-search').addEventListener('input', function () { renderList(this.value); });

    $('#btn-reset').addEventListener('click', function () {
      if (!confirm('習得状況・苦手リスト・連続日数をすべて消します。よろしいですか？')) return;
      store = { recs: {}, streak: { last: '', count: 0 } };
      saveStore();
      renderHome();
    });

    // キーボード操作
    document.addEventListener('keydown', function (e) {
      if (!$('#view-flash').hidden) {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          if ($('#flash-a').hidden) revealFlash();
        } else if (!$('#judge-row').hidden) {
          if (e.key === '1') $('#judge-row .btn-ng').click();
          if (e.key === '2') $('#judge-row .btn-mid').click();
          if (e.key === '3') $('#judge-row .btn-ok').click();
        }
      } else if (!$('#view-quiz').hidden) {
        var n = parseInt(e.key, 10);
        var list = $('#choice-list').children;
        if (n >= 1 && n <= list.length && !list[0].disabled) list[n - 1].click();
        else if ((e.key === ' ' || e.key === 'Enter') && !$('#quiz-feedback').hidden) {
          e.preventDefault(); advance();
        }
      }
    });
  }

  /* ---------------------------------------------------------
     14. 起動
     --------------------------------------------------------- */
  buildExamItems();
  buildBasicItems();
  loadStore();
  wire();
  if (isAuthed()) {
    renderHome();
    show('home');
  } else {
    show('login');
    setTimeout(function () { $('#login-pin').focus(); }, 50);
  }
})();

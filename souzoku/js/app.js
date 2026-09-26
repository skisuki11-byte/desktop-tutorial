/* app.js — つぐいえの画面と遷移。
 *
 * 画面は design/*.dc.html（Claude Design）をそのまま移したもの。
 * ハッシュで画面を切り替える（#/home, #/learn, #/sim, #/consult …）。
 *
 * 保存の方針：
 *   - 相続開始日・手続きの「済」・試算結果 → 端末の中（store.js）
 *   - 相談フォームの入力 → メモリだけ。送ったら消す。どこにも保存しない
 */
(function () {
  'use strict';

  var CFG = window.TG_CONFIG, S = window.TGStore, CALC = window.TGCalc,
      DL = window.TGDeadlines, ARTS = window.TG_ARTICLES;
  var view = document.getElementById('view');
  var tabbar = document.getElementById('tabbar');

  /* ---------- 小さな道具 ---------- */
  function h(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function comma(n) { return Math.round(n).toLocaleString('ja-JP'); }
  /* 円 → 「1,897万円」「72.6万円」「5,000円」 */
  function yen(y) {
    var neg = y < 0; y = Math.abs(Math.round(y));
    var s;
    if (y < 10000) s = comma(y) + '円';
    else {
      var man = y / 10000;
      if (man >= 100) s = comma(Math.round(man)) + '万円';
      else s = (Math.round(man * 10) / 10).toLocaleString('ja-JP') + '万円';
    }
    return (neg ? '−' : '') + s;
  }
  function manFloor(y) { return comma(Math.floor(Math.max(0, y) / 10000)); }
  function dateJP(iso) {
    if (!iso) return '';
    var p = iso.split('-').map(Number);
    return p[0] + '年' + p[1] + '月' + p[2] + '日';
  }
  function num(v) {
    var n = parseFloat(String(v).replace(/[,，\s]/g, '').replace(/[０-９．]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }));
    return isFinite(n) ? n : NaN;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function expertById(id) {
    for (var i = 0; i < CFG.experts.length; i++) if (CFG.experts[i].id === id) return CFG.experts[i];
    return null;
  }
  function articleById(id) {
    for (var i = 0; i < ARTS.length; i++) if (ARTS[i].id === id) return ARTS[i];
    return null;
  }
  var toastTimer = null;
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2400);
  }
  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  var ICON = {
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    check: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'
  };
  var DISCLAIMER = '概算です。実際の税額や手取りは、取得費・特例の要件・売却時期などで変わります。個別の判断は税理士・宅建士にご確認ください。';
  var KIND = { house: '戸建て', land: '土地だけ', condo: 'マンション' };

  /* ======================================================
     ホーム
     ====================================================== */
  function vHome() {
    var st = S.get();
    if (!st.deathISO) {
      return '' +
        '<div class="head"><div class="eyebrow">つぐいえ</div><h1 class="title">はじめに</h1></div>' +
        '<p class="lead">亡くなった日（相続が始まった日）を入れると、これからの手続きの期限と、残りの日数を出します。日付はこの端末の中にだけ保存されます。</p>' +
        '<div class="card"><div class="field">' +
          '<label for="death">亡くなった日</label>' +
          '<input id="death" class="input" type="date" max="' + DL.todayISO() + '">' +
          '<p class="err" id="death-err" hidden>日付を入れてください。</p>' +
        '</div></div>' +
        '<button class="btn" data-act="set-death">期限を計算する</button>' +
        '<a class="btn ghost" href="#/learn">日付を入れずに記事を読む</a>' +
        '<p class="note">このアプリは無料です。<a href="#/learn/senmonka">運営のしくみ（紹介料について）</a></p>';
    }
    var s = DL.status(st.deathISO, st.done);
    var hero;
    if (s.next) {
      var left = s.next.left === 0 ? '今日まで' : 'あと ' + comma(s.next.left) + '<small>日</small>';
      hero = '<div class="hero"><div class="sub">次の期限　' + h(s.next.title) + '</div>' +
        '<div class="big">' + left + '</div>' +
        '<div class="sub">' + dateJP(s.next.date) + 'まで' + (s.next.id === 'akiya' ? '・最大3,000万円の控除' : '') + '</div></div>';
    } else {
      hero = '<div class="hero"><div class="sub">期限のある手続き</div><div class="big" style="font-size:24px">ひととおり過ぎました</div>' +
        '<div class="sub">売却や相続税の相談は、いつでもできます</div></div>';
    }
    var rows = s.items.map(function (it) {
      var pill;
      if (it.done) pill = '<span class="pill done">済</span>';
      else if (it.passed) pill = '<span class="pill past">過ぎました</span>';
      else pill = '<span class="pill ' + (s.next && s.next.id === it.id ? 'next' : 'wait') + '">あと' + comma(it.left) + '日</span>';
      return '<button class="dl-row" data-act="toggle" data-id="' + it.id + '" aria-pressed="' + it.done + '">' + pill +
        '<span class="t">' + h(it.title) + '<span class="d">' + dateJP(it.date) + '</span></span></button>';
    }).join('');
    var art = (s.next && articleById(s.next.article)) || pickArticle();
    return '' +
      '<div class="head-row"><div class="head"><div class="eyebrow">相続開始日 ' + dateJP(st.deathISO) + '</div><h1 class="title">ホーム</h1></div>' +
        '<a class="icon-btn" href="#/settings" aria-label="設定">' + ICON.gear + '</a></div>' +
      hero +
      '<div class="card tight"><div class="card-label" style="padding:8px 0 2px">手続きの進み具合</div>' + rows + '</div>' +
      '<p class="note">タップすると「済」にできます。期限は目安です。くわしくは各記事でご確認ください。</p>' +
      (art ? '<a class="card" href="#/learn/' + art.id + '" style="text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:2px">' +
        '<span class="card-label">いまの時期に読む</span><span class="card-title">' + h(art.title) + '</span>' +
        '<span class="card-label">' + art.min + '分で読めます</span></a>' : '') +
      '<a class="btn ghost" href="#/consult">相続の専門家にそうだんする</a>';
  }
  function pickArticle() {
    var stg = DL.stage(S.get().deathISO);
    for (var i = 0; i < ARTS.length; i++) if (ARTS[i].stages.indexOf(stg) >= 0) return ARTS[i];
    return ARTS[0];
  }

  /* ======================================================
     設定
     ====================================================== */
  var confirmClear = false;
  function vSettings() {
    var st = S.get();
    return '' +
      '<a class="back" href="#/home">‹ ホームにもどる</a>' +
      '<div class="head"><h1 class="title">設定</h1></div>' +
      (S.isPersistent() ? '' : '<div class="notice shu"><p>この環境では端末に保存できません。アプリを閉じると入力が消えます。</p></div>') +
      '<div class="card"><div class="field"><label for="death2">亡くなった日（相続開始日）</label>' +
        '<input id="death2" class="input" type="date" max="' + DL.todayISO() + '" value="' + h(st.deathISO) + '"></div>' +
        '<div style="margin-top:12px"><button class="btn small" data-act="save-death">日付を保存する</button></div></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card-title">バックアップ</div>' +
        '<p class="note">機種変更に備えて、試算結果と手続きの記録をファイルに書き出せます。相談の内容は保存していないので含まれません。</p>' +
        '<button class="btn ghost" data-act="export">ファイルに書き出す</button>' +
        '<label class="btn ghost" for="import-file" style="cursor:pointer">ファイルから読み込む</label>' +
        '<input id="import-file" type="file" accept="application/json,.json" class="sr-only">' +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:10px">' +
        '<div class="card-title">すべて消す</div>' +
        '<p class="note">相続開始日、手続きの記録、試算結果をこの端末から消します。元に戻せません。</p>' +
        (confirmClear
          ? '<button class="btn danger" data-act="clear-yes">本当に消す</button><button class="btn ghost" data-act="clear-no">やめる</button>'
          : '<button class="btn danger" data-act="clear">すべて消す</button>') +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:6px">' +
        '<div class="card-title">このアプリについて</div>' +
        '<p class="note">つぐいえは無料です。運営者（' + h(CFG.operator) + '）は相続の専門家をご紹介するだけで、仲介や交渉はしません。宅建士への相談が売買の成約につながったときだけ、その会社から紹介料を受け取ります（あなたの支払いは増えません）。弁護士・税理士からは受け取りません。</p>' +
        '<a href="privacy.html">プライバシーポリシー</a>' +
      '</div>';
  }

  /* ======================================================
     まなぶ
     ====================================================== */
  var learnFilter = 'now';
  function vLearn() {
    var stg = DL.stage(S.get().deathISO);
    var list = ARTS;
    if (learnFilter === 'now' && stg !== 'none') {
      list = ARTS.filter(function (a) { return a.stages.indexOf(stg) >= 0; });
    }
    var rows = list.map(function (a, i) {
      return '<a class="art-row" href="#/learn/' + a.id + '"><span class="art-no">' + (i + 1) + '</span>' +
        '<span class="art-text"><b>' + h(a.title) + '</b><span>' + h(a.tag) + '・' + a.min + '分</span></span></a>';
    }).join('');
    return '' +
      '<div class="head"><div class="eyebrow">相続の基本知識</div><h1 class="title">まなぶ</h1></div>' +
      '<div class="seg" role="tablist" aria-label="記事の絞り込み">' +
        '<button role="tab" data-act="filter" data-v="now" aria-selected="' + (learnFilter === 'now') + '">いまの時期</button>' +
        '<button role="tab" data-act="filter" data-v="all" aria-selected="' + (learnFilter === 'all') + '">すべて（' + ARTS.length + '本）</button>' +
      '</div>' +
      (learnFilter === 'now' && stg === 'none' ? '<p class="note">ホームで亡くなった日を入れると、いまの時期に合う記事にしぼります。</p>' : '') +
      '<div class="card tight">' + rows + '</div>' +
      '<p class="note">記事は一般的な情報です。あなたの場合の税額や法的な判断は、税理士・弁護士などの専門家にご確認ください。</p>';
  }
  function vArticle(id) {
    var a = articleById(id);
    if (!a) return vNotFound();
    var cta = '';
    if (a.cta === 'sim') cta = '<a class="btn" href="#/sim/new">手取りを試算する</a>';
    if (a.cta === 'consult') cta = '<a class="btn" href="#/consult">相続の専門家にそうだんする</a>';
    return '' +
      '<a class="back" href="#/learn">‹ まなぶ</a>' +
      '<div class="head"><div class="eyebrow">' + h(a.tag) + '・' + a.min + '分で読めます</div><h1 class="title">' + h(a.title) + '</h1></div>' +
      '<article class="article">' + a.body + '</article>' +
      '<p class="note">2026年9月時点の制度にもとづく一般的な説明です。制度は改正されることがあります。</p>' + cta;
  }

  /* ======================================================
     はかる
     ====================================================== */
  function vSimList() {
    var ests = S.get().estimates;
    var list = ests.map(function (e) {
      var r = CALC.estimate(e.input);
      return '<a class="card" href="#/sim/' + h(e.id) + '" style="text-decoration:none;color:inherit;display:flex;justify-content:space-between;align-items:center;gap:12px">' +
        '<span style="display:flex;flex-direction:column"><span class="card-title">' + h(e.name) + '</span>' +
        '<span class="card-label">' + dateJP(e.createdISO) + 'の試算・' + h(KIND[e.input.kind] || '') + '</span></span>' +
        '<span style="text-align:right"><span class="card-label">手取り</span><br><b class="num" style="font-size:18px">' + manFloor(r.main.net) + '万円</b></span></a>';
    }).join('');
    return '' +
      '<div class="head"><div class="eyebrow">売却シミュレーション</div><h1 class="title">はかる</h1></div>' +
      '<p class="lead">相続した家を売った場合の手取りと、持ち続けた場合の費用を試算します。計算は端末の中だけで行い、結果もこの端末にだけ保存します。</p>' +
      '<a class="btn" href="#/sim/new">新しく試算する</a>' +
      (list ? '<div class="card-label" style="margin-top:8px">保存した試算</div>' + list : '');
  }

  var draft = null, simStep = 0, simErr = '';
  function newDraft() {
    return { name: '', kind: 'house', price: '', acqKnown: '', acqPrice: '', acqYear: '', acqYearUnknown: false,
      heirs: '2', vacant: null, builtBefore1981: null, livedAlone: null, renovateOrDemolish: null,
      otherCost: '', holdTaxYear: '', holdOtherYear: '' };
  }
  var SIM_STEPS = ['basic', 'price', 'acq', 'heirs', 'cond', 'cost'];

  function yn(key, q) {
    var v = draft[key];
    function b(val, label) {
      return '<button type="button" data-act="yn" data-k="' + key + '" data-v="' + val + '" aria-pressed="' + (v === val) + '">' + label + '</button>';
    }
    return '<div class="yn"><div class="yn-q">' + q + '</div><div class="yn-btns">' +
      b(true, 'はい') + b(false, 'いいえ') + b('unk', '不明') + '</div></div>';
  }
  function vSimNew() {
    if (!draft) { draft = newDraft(); simStep = 0; }
    var step = SIM_STEPS[simStep], body = '';
    if (step === 'basic') {
      body = '<h1 class="title">どんな不動産ですか</h1>' +
        '<div class="field"><label for="s-name">名前 <span class="tag-opt">任意</span></label>' +
        '<input id="s-name" class="input" data-bind="name" maxlength="30" placeholder="例：静岡の実家" value="' + h(draft.name) + '"></div>' +
        '<fieldset class="field"><legend class="label">種類</legend><div class="choices">' +
        ['house', 'land', 'condo'].map(function (k) {
          return '<label class="choice"><input type="radio" name="s-kind" data-bind="kind" value="' + k + '"' + (draft.kind === k ? ' checked' : '') + '>' + KIND[k] + '</label>';
        }).join('') + '</div></fieldset>';
    } else if (step === 'price') {
      body = '<h1 class="title">いくらで売れそうですか</h1>' +
        '<div class="field"><label for="s-price">売れそうな価格</label>' +
        '<div class="suffix"><input id="s-price" class="input big" data-bind="price" inputmode="decimal" placeholder="2000" value="' + h(draft.price) + '"><span>万円</span></div>' +
        '<p class="hint">わからなければ、近くの似た物件の成約価格を国土交通省の「不動産情報ライブラリ」で調べられます。結果は±10%の幅でも表示します。正確な価格は宅建士の査定でわかります。</p></div>';
    } else if (step === 'acq') {
      body = '<h1 class="title">親が買ったときのこと</h1>' +
        '<fieldset class="field"><legend class="label">買ったときの価格を知っていますか</legend><div class="choices">' +
          '<label class="choice"><input type="radio" name="s-acq" data-bind="acqKnown" value="yes"' + (draft.acqKnown === 'yes' ? ' checked' : '') + '>知っている</label>' +
          '<label class="choice"><input type="radio" name="s-acq" data-bind="acqKnown" value="no"' + (draft.acqKnown === 'no' ? ' checked' : '') + '>わからない（売却価格の5%で計算）</label>' +
        '</div></fieldset>' +
        '<div class="field"' + (draft.acqKnown === 'yes' ? '' : ' hidden') + ' id="acq-price-field"><label for="s-acqp">買ったときの価格（土地と建物の合計）</label>' +
          '<div class="suffix"><input id="s-acqp" class="input" data-bind="acqPrice" inputmode="decimal" value="' + h(draft.acqPrice) + '"><span>万円</span></div></div>' +
        '<div class="field"><label for="s-acqy">買った年（西暦）</label>' +
          '<div class="suffix"><input id="s-acqy" class="input" data-bind="acqYear" inputmode="numeric" maxlength="4" placeholder="1985" value="' + h(draft.acqYear) + '"' + (draft.acqYearUnknown ? ' disabled' : '') + '><span>年</span></div>' +
          '<label class="check"><input type="checkbox" data-bind="acqYearUnknown"' + (draft.acqYearUnknown ? ' checked' : '') + '>わからない（かなり前に買った）</label>' +
          '<p class="hint">相続した家は、親が買った日を引き継ぎます。売る年の1月1日で5年を超えていれば、税率が低くなります（20.315%）。</p></div>';
    } else if (step === 'heirs') {
      var opts = '';
      for (var i = 1; i <= 8; i++) opts += '<option value="' + i + '"' + (String(draft.heirs) === String(i) ? ' selected' : '') + '>' + i + '人</option>';
      body = '<h1 class="title">何人で相続しましたか</h1>' +
        '<div class="field"><label for="s-heirs">この不動産を受け継いだ人の数</label>' +
        '<select id="s-heirs" class="select" data-bind="heirs">' + opts + '</select>' +
        '<p class="hint">等分で受け継いだとして計算します。空き家特例の控除は1人ごとで、3人以上だと1人2,000万円になります。</p></div>';
    } else if (step === 'cond') {
      body = '<h1 class="title">いまの状態</h1>' +
        '<p class="lead">空き家特例（最大3,000万円の控除）が使えるかを確かめます。</p>' +
        '<div class="card tight">' +
          yn('vacant', '相続してから、住んだり貸したり事業に使ったりしていない') +
          (draft.kind === 'house'
            ? yn('builtBefore1981', '昭和56年（1981年）5月31日以前に建てられた') +
              yn('livedAlone', '亡くなる直前、ほかに住んでいる人はいなかった') +
              yn('renovateOrDemolish', '耐震改修か取り壊しをする（買主が行う場合を含む）')
            : '') +
        '</div>' +
        (draft.kind !== 'house' ? '<p class="note">空き家特例は、戸建て（区分所有でない家）だけが対象です。</p>' : '') +
        '<p class="note">「不明」は要件を満たさないものとして計算し、結果の画面で確認のしかたを案内します。</p>';
    } else if (step === 'cost') {
      body = '<h1 class="title">費用のこと</h1>' +
        '<div class="field"><label for="s-other">売るときのその他の費用 <span class="tag-opt">任意</span></label>' +
          '<div class="suffix"><input id="s-other" class="input" data-bind="otherCost" inputmode="decimal" placeholder="0" value="' + h(draft.otherCost) + '"><span>万円</span></div>' +
          '<p class="hint">測量、残っている家財の片付け、解体など。仲介手数料と印紙税は自動で計算します。</p></div>' +
        '<div class="card-label" style="margin-top:8px">持ち続けた場合の費用（年額）</div>' +
        '<div class="field"><label for="s-htax">固定資産税・都市計画税 <span class="tag-opt">任意</span></label>' +
          '<div class="suffix"><input id="s-htax" class="input" data-bind="holdTaxYear" inputmode="decimal" placeholder="0" value="' + h(draft.holdTaxYear) + '"><span>万円/年</span></div>' +
          '<p class="hint">毎年届く納税通知書に書いてあります。</p></div>' +
        '<div class="field"><label for="s-hother">管理・保険・交通費など <span class="tag-opt">任意</span></label>' +
          '<div class="suffix"><input id="s-hother" class="input" data-bind="holdOtherYear" inputmode="decimal" placeholder="0" value="' + h(draft.holdOtherYear) + '"><span>万円/年</span></div></div>';
    }
    var last = simStep === SIM_STEPS.length - 1;
    return '' +
      '<a class="back" href="#/sim">‹ やめる</a>' +
      '<div class="step">' + (simStep + 1) + ' / ' + SIM_STEPS.length + '</div>' +
      '<div class="progress" aria-hidden="true"><i style="width:' + ((simStep + 1) / SIM_STEPS.length * 100) + '%"></i></div>' +
      body +
      (simErr ? '<p class="err" role="alert">' + h(simErr) + '</p>' : '') +
      '<div class="btn-row" style="margin-top:8px">' +
        '<button class="btn" data-act="sim-next">' + (last ? '試算する' : '次へ') + '</button>' +
        (simStep > 0 ? '<button class="btn ghost" data-act="sim-back">もどる</button>' : '') +
      '</div>';
  }
  function simValidate() {
    var step = SIM_STEPS[simStep];
    if (step === 'price') {
      var p = num(draft.price);
      if (!(p > 0)) return '売れそうな価格を万円で入れてください。';
      if (p > 1000000) return '価格が大きすぎます。万円の単位で入れてください（例：2000）。';
    }
    if (step === 'acq') {
      if (!draft.acqKnown) return '買ったときの価格を知っているか、選んでください。';
      if (draft.acqKnown === 'yes' && !(num(draft.acqPrice) >= 0)) return '買ったときの価格を入れてください。';
      if (!draft.acqYearUnknown) {
        var y = num(draft.acqYear), now = new Date().getFullYear();
        if (!(y >= 1900 && y <= now)) return '買った年を西暦で入れるか、「わからない」を選んでください。';
      }
    }
    if (step === 'cost') {
      var bad = ['otherCost', 'holdTaxYear', 'holdOtherYear'].some(function (k) {
        return draft[k] !== '' && !(num(draft[k]) >= 0);
      });
      if (bad) return '費用は数字（万円）で入れてください。わからなければ空のままで大丈夫です。';
    }
    return '';
  }
  function simFinish() {
    var d = draft, st = S.get();
    function manToYen(v) { var n = num(v); return n > 0 ? Math.round(n * 10000) : 0; }
    var input = {
      kind: d.kind,
      price: manToYen(d.price),
      acqKnown: d.acqKnown === 'yes',
      acqPrice: manToYen(d.acqPrice),
      acqYear: d.acqYearUnknown ? 0 : (num(d.acqYear) | 0),
      heirs: Number(d.heirs) || 1,
      vacant: d.vacant === true,
      unusedAfter: d.vacant === true,
      builtBefore1981: d.builtBefore1981 === true,
      livedAlone: d.livedAlone === true,
      renovateOrDemolish: d.renovateOrDemolish === true,
      otherCost: manToYen(d.otherCost),
      holdTaxYear: manToYen(d.holdTaxYear),
      holdOtherYear: manToYen(d.holdOtherYear),
      deathISO: st.deathISO,
      saleISO: DL.todayISO()
    };
    var e = { id: uid(), name: d.name.trim() || '相続した' + (KIND[d.kind] === '土地だけ' ? '土地' : KIND[d.kind]),
      createdISO: DL.todayISO(), input: input };
    S.addEstimate(e);
    draft = null; simStep = 0; simErr = '';
    go('#/sim/' + e.id);
  }

  var confirmDelEst = false;
  function vSimResult(id) {
    var e = S.getEstimate(id);
    if (!e) return vNotFound();
    var r = CALC.estimate(e.input), m = r.main, inp = e.input;
    var total = Math.max(1, m.price);
    var pNet = Math.max(0, m.net) / total * 100, pFee = (m.fee + m.stamp + m.other) / total * 100, pTax = m.tax / total * 100;
    var exLabel = r.exemptionApplied ? '（空き家特例あり）' : '';
    var html = '' +
      '<a class="back" href="#/sim">‹ はかる</a>' +
      '<div class="head"><div class="eyebrow">' + h(e.name) + '・' + dateJP(e.createdISO) + 'の試算</div><h1 class="title">試算結果</h1></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:2px">' +
        '<div class="card-label">売却した場合の手取り' + exLabel + '</div>' +
        '<div class="money-big">' + manFloor(m.net) + '<small>万円</small></div>' +
        '<div class="card-label num">幅 ' + manFloor(r.rangeLow) + '万〜' + manFloor(r.rangeHigh) + '万円（売却価格±10%）</div>' +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:6px">' +
        '<div class="bar" aria-hidden="true"><i style="width:' + pNet + '%;background:var(--ai)"></i><i style="width:' + pFee + '%;background:var(--ai-mid)"></i><i style="width:' + pTax + '%;background:var(--shu)"></i></div>' +
        '<div class="kv"><span>売却価格</span><b>' + yen(m.price) + '</b></div>' +
        '<div class="kv"><span>仲介手数料（上限）</span><b>−' + yen(m.fee) + '</b></div>' +
        '<div class="kv"><span>印紙税</span><b>−' + yen(m.stamp) + '</b></div>' +
        (m.other ? '<div class="kv"><span>その他の費用</span><b>−' + yen(m.other) + '</b></div>' : '') +
        '<div class="kv"><span>譲渡所得税（' + (m.longTerm ? '長期 20.315%' : '短期 39.63%') + '）</span><b>' + (m.tax ? '−' + yen(m.tax) : '0円') + '</b></div>' +
        (inp.heirs > 1 ? '<div class="kv" style="border-top:1px solid var(--line);padding-top:6px"><span>1人あたり（' + inp.heirs + '人で等分）</span><b>' + yen(m.perHeir) + '</b></div>' : '') +
        (m.acqRough ? '<div class="kv sub"><span>取得費は売却価格の5%（' + yen(m.acqUsed) + '）で計算しました</span></div>' : '') +
        (inp.vacant && inp.price <= 8000000 ? '<div class="kv sub"><span>800万円以下の空き家等は、仲介手数料の上限が33万円です（事前の合意が前提）</span></div>' : '') +
      '</div>';
    if (r.exemptionApplied) {
      html += '<div class="notice shu"><div class="compare"><span>特例が使えない場合</span><span class="num">' + manFloor(r.without.net) + '万円</span></div>' +
        '<p style="font-size:13px;color:var(--muted)">差は約' + manFloor(r.without.tax - m.tax) + '万円。特例を使えるかは、税理士に確認できます。</p></div>';
    } else if (inp.kind === 'house' && r.without.gain > 0) {
      html += '<div class="card" style="display:flex;flex-direction:column;gap:6px"><div class="card-title">空き家特例は、まだ使えるか確認できていません</div>' +
        '<p class="note">次の要件がそろうと、最大3,000万円（相続人3人以上は1人2,000万円）を差し引けます。</p>' +
        '<ul class="reasons">' + r.akiya.reasons.map(function (x) { return '<li>' + h(x) + '</li>'; }).join('') + '</ul>' +
        '<a href="#/learn/akiya" style="font-size:14px">空き家特例の要件を読む</a></div>';
    }
    if (r.holdYear > 0) {
      html += '<div class="card" style="display:flex;flex-direction:column;gap:2px"><div class="card-label">持ち続けた場合の費用</div>' +
        '<div style="font-size:24px;font-weight:700" class="num">10年で約' + manFloor(r.hold10) + '万円</div>' +
        '<div class="card-label num">年' + yen(r.holdYear) + '×10年。修繕費や、管理不全空家になった場合の税の増加は含みません。</div></div>';
    }
    html += '<button class="btn" data-act="consult-with" data-id="' + h(e.id) + '">この結果を添えて専門家にそうだんする</button>' +
      '<p class="note center">この試算は端末にだけ保存しています。</p>' +
      '<p class="note">' + DISCLAIMER + '</p>' +
      (confirmDelEst
        ? '<div class="btn-row"><button class="btn danger" data-act="del-est-yes" data-id="' + h(e.id) + '">本当に削除する</button><button class="btn ghost" data-act="del-est-no">やめる</button></div>'
        : '<button class="btn danger" data-act="del-est">この試算を削除</button>');
    return html;
  }
  function estimateSummary(e) {
    var r = CALC.estimate(e.input);
    return e.name + '（' + (KIND[e.input.kind] || '') + '）' +
      '／売却想定 ' + yen(e.input.price) +
      '／手取り 約' + manFloor(r.main.net) + '万円（' + (r.exemptionApplied ? '空き家特例あり' : '空き家特例なし') + '）' +
      '／相続人 ' + e.input.heirs + '人／' + dateJP(e.createdISO) + 'の試算';
  }

  /* ======================================================
     そうだん（相談先 → 入力 → 確認 → 完了）
     入力はメモリにだけ持ち、送ったら消す。
     ====================================================== */
  var TOPICS = ['売るか迷っている', 'いくらで売れるか知りたい', '空き家特例を使えるか', '相続税が心配',
    '相続人で話がまとまらない', '相続放棄を考えている', '遠方で管理できない'];
  var cs;
  function resetConsult() {
    cs = { experts: {}, name: '', email: '', area: '', topics: {}, body: '', attachId: '', agree: false,
      website: '', sending: false, error: '', errors: {}, ref: '', sentRoles: [], sentEmail: '', sentText: '' };
  }
  resetConsult();
  function chosen() { return CFG.experts.filter(function (x) { return cs.experts[x.id]; }); }
  function topicsChosen() { return TOPICS.filter(function (t) { return cs.topics[t]; }); }

  function vConsult() {
    var cards = CFG.experts.map(function (x) {
      return '<label class="expert" for="ex-' + x.id + '">' +
        '<input id="ex-' + x.id + '" type="checkbox" data-exp="' + x.id + '"' + (cs.experts[x.id] ? ' checked' : '') + '>' +
        '<span class="expert-body">' +
          '<span class="expert-role">' + h(x.role) + (x.sub ? '<small>' + h(x.sub) + '</small>' : '') + '</span>' +
          '<span class="expert-topics">' + h(x.topics) + '</span>' +
          '<span class="expert-org">' + h(x.org) + (x.license ? '・' + h(x.license) : '') + '</span>' +
          (x.fee
            ? '<span class="fee-yes">売買が成約したとき、運営者はこの会社から紹介料を受け取ります。あなたの支払いは増えません。</span>'
            : '<span class="fee-no">紹介料は受け取りません</span>') +
        '</span></label>';
    }).join('');
    var n = chosen().length;
    return '' +
      '<div class="head"><div class="step">1 / 3　相談先をえらぶ</div><h1 class="title">相続の専門家にそうだん</h1>' +
      '<p class="lead">相続にくわしい3つの専門家に、メールで相談できます。いくつでも選べます。<b style="color:var(--ink)">電話はかかってきません。</b></p></div>' +
      cards +
      '<p class="note">運営者は専門家をご紹介するだけです。売買の仲介や、交渉・手続きの代行はしません。<a href="#/learn/senmonka">どの専門家に相談する？</a></p>' +
      '<button class="btn" id="to-form" data-act="to-form"' + (n ? '' : ' disabled') + '>' + nextLabel(n) + '</button>';
  }
  function nextLabel(n) { return n ? '次へ（' + n + '件を選択中）' : '相談先を選んでください'; }

  function vConsultForm() {
    var ch = chosen();
    if (!ch.length) { go('#/consult'); return ''; }
    var ests = S.get().estimates, er = cs.errors;
    var attach = '';
    if (ests.length) {
      attach = '<div class="field"><label for="c-attach">試算結果を添える <span class="tag-opt">任意</span></label>' +
        '<select id="c-attach" class="select" data-cbind="attachId"><option value="">添えない</option>' +
        ests.map(function (e) {
          var r = CALC.estimate(e.input);
          return '<option value="' + h(e.id) + '"' + (cs.attachId === e.id ? ' selected' : '') + '>' + h(e.name) + '・手取り' + manFloor(r.main.net) + '万円</option>';
        }).join('') + '</select></div>';
    }
    return '' +
      '<a class="back" href="#/consult">‹ 相談先にもどる</a>' +
      '<div class="head"><div class="step">2 / 3　相談内容の入力</div><h1 class="title">ご相談の内容</h1></div>' +
      '<div class="sel-chips"><span class="card-label">相談先</span>' + ch.map(function (x) { return '<span class="sel-chip">' + h(x.role) + '</span>'; }).join('') + '</div>' +
      '<div class="field"><label for="c-name">お名前 <span class="tag-opt">任意・ニックネーム可</span></label>' +
        '<input id="c-name" class="input" data-cbind="name" maxlength="40" autocomplete="nickname" value="' + h(cs.name) + '">' +
        '<p class="hint">空欄なら「匿名」として送ります。</p></div>' +
      '<div class="field"><label for="c-mail">メールアドレス <span class="tag-req">必須</span></label>' +
        '<input id="c-mail" class="input" type="email" data-cbind="email" maxlength="120" autocomplete="email" inputmode="email" value="' + h(cs.email) + '"' + (er.email ? ' aria-invalid="true" aria-describedby="e-mail"' : '') + '>' +
        (er.email ? '<p class="err" id="e-mail">' + h(er.email) + '</p>' : '') +
        '<p class="hint">専門家からの返信はこのアドレスに届きます。返信にはメールアドレスが必要なため、完全な匿名ではありません。</p></div>' +
      '<div class="field"><label for="c-area">物件の場所 <span class="tag-opt">任意・市区町村まで</span></label>' +
        '<input id="c-area" class="input" data-cbind="area" maxlength="40" placeholder="例：静岡県 静岡市葵区" value="' + h(cs.area) + '"></div>' +
      '<fieldset class="field"><legend class="label">相談したいこと <span class="tag-req">必須</span></legend>' +
        '<div class="chips">' + TOPICS.map(function (t) {
          return '<button type="button" class="chip" data-act="topic" data-v="' + h(t) + '" aria-pressed="' + !!cs.topics[t] + '">' + h(t) + '</button>';
        }).join('') + '</div>' +
        '<label for="c-body" class="hint" style="margin-top:6px">くわしく（1,000字まで）</label>' +
        '<textarea id="c-body" class="textarea" data-cbind="body" maxlength="1000" rows="5">' + h(cs.body) + '</textarea>' +
        (er.body ? '<p class="err">' + h(er.body) + '</p>' : '') +
      '</fieldset>' +
      attach +
      '<div class="hp" aria-hidden="true"><label for="c-web">ウェブサイト</label><input id="c-web" tabindex="-1" autocomplete="off" data-cbind="website"></div>' +
      '<button class="btn" data-act="to-confirm" style="margin-top:4px">入力内容を確認する</button>' +
      '<p class="note center">まだ送信されません。次の画面で内容を確認できます。</p>';
  }
  function consultValidate() {
    var e = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cs.email.trim())) e.email = 'メールアドレスを正しく入れてください（例：name@example.jp）。';
    if (!topicsChosen().length && !cs.body.trim()) e.body = '相談したいことを選ぶか、くわしく書いてください。';
    cs.errors = e;
    return !Object.keys(e).length;
  }

  function vConsultConfirm() {
    var ch = chosen();
    if (!ch.length || !cs.email) { go('#/consult'); return ''; }
    var est = cs.attachId ? S.getEstimate(cs.attachId) : null;
    function row(k, v, cls) {
      return '<div class="review-row"><div class="review-body"><span class="k">' + k + '</span><span class="v' + (cls ? ' ' + cls : '') + '">' + v + '</span>' +
        (cls === 'mail' ? '<span class="err" style="font-weight:500;font-size:12px">打ち間違いがあると返信が届きません</span>' : '') +
        '</div><a class="link-btn" href="#/consult/form">修正</a></div>';
    }
    var topics = topicsChosen().join('／');
    var fallbacks = ch.filter(function (x) { return x.fallbackEmail; });
    return '' +
      '<a class="back" href="#/consult/form">‹ 入力にもどる</a>' +
      '<div class="head"><div class="step">3 / 3　送信前の確認</div><h1 class="title">送信内容の確認</h1>' +
      '<p class="lead">まだ送信されていません。内容をご確認ください。</p></div>' +
      '<div class="card tight">' +
        row('お名前', h(cs.name.trim() || '匿名')) +
        row('メールアドレス（返信先）', h(cs.email.trim()), 'mail') +
        row('物件の場所', h(cs.area.trim() || '未記入')) +
        row('相談したいこと', h([topics, cs.body.trim()].filter(Boolean).join('\n'))) +
        row('添える試算', est ? h(estimateSummary(est)) : '添えない') +
      '</div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:8px"><div class="card-label">送信先（' + ch.length + '件）</div>' +
        ch.map(function (x) {
          return '<div class="dest"><b>' + h(x.role) + '　' + h(x.org) + '</b><span>' +
            (x.license ? h(x.license) + '・' : '') +
            (x.fee ? '成約時に運営者へ紹介料あり（あなたの支払いは増えません）' : '紹介料なし') + '</span></div>';
        }).join('') +
        '<p class="note" style="border-top:1px solid var(--line);padding-top:8px">運営者は紹介するだけで、仲介や交渉はしません。</p></div>' +
      '<div class="notice ai"><div class="notice-title">送信したあとのこと</div>' +
        '<ul style="margin:0;padding-left:1.2em;display:flex;flex-direction:column;gap:4px">' +
          '<li>後日、選んだ専門家から、上のメールアドレスあてに<b>それぞれメールが届きます</b>。</li>' +
          '<li>この送信に対する<b>自動返信メール（受付完了メール）は送られません</b>。次の画面の受付番号をお控えください。</li>' +
        '</ul></div>' +
      '<label class="check" for="c-agree"><input id="c-agree" type="checkbox" data-act-change="agree"' + (cs.agree ? ' checked' : '') + '>' +
        '<span>上の送信先に、入力した内容を送ることに同意します（<a href="privacy.html">プライバシーポリシー</a>）</span></label>' +
      (cs.error ? '<div class="notice shu" role="alert"><div class="notice-title">送信できませんでした</div><p>' + h(cs.error) + '</p>' +
        (fallbacks.length ? '<a class="btn ghost" href="' + h(mailtoHref(fallbacks)) + '">メールアプリで送る</a>' : '') + '</div>' : '') +
      '<div class="btn-row">' +
        '<button class="btn" id="send-btn" data-act="send"' + (cs.agree && !cs.sending ? '' : ' disabled') + '>' + (cs.sending ? '送信中…' : 'この内容で送信する') + '</button>' +
        '<a class="btn ghost" href="#/consult/form">入力にもどって修正する</a>' +
      '</div>';
  }

  function makeRef() {
    var d = new Date();
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    return 'TG-' + String(d.getFullYear()).slice(2) + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' +
      String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }
  function consultText(ref) {
    var est = cs.attachId ? S.getEstimate(cs.attachId) : null;
    return [
      '受付番号：' + ref,
      '相談先：' + chosen().map(function (x) { return x.role; }).join('・'),
      'お名前：' + (cs.name.trim() || '匿名'),
      'メールアドレス：' + cs.email.trim(),
      '物件の場所：' + (cs.area.trim() || '未記入'),
      '相談したいこと：' + (topicsChosen().join('／') || 'なし'),
      '',
      cs.body.trim() || '（くわしい内容なし）',
      '',
      '添える試算：' + (est ? estimateSummary(est) : 'なし')
    ].join('\n');
  }
  function mailtoHref(list) {
    var ref = cs.ref || makeRef();
    return 'mailto:' + list.map(function (x) { return x.fallbackEmail; }).join(',') +
      '?subject=' + encodeURIComponent('【つぐいえ相談 ' + ref + '】' + (cs.area.trim() || 'エリア未記入')) +
      '&body=' + encodeURIComponent(consultText(ref));
  }

  function send() {
    if (cs.sending) return;
    if (!CFG.endpoint) {
      cs.error = '送信先がまだ設定されていません（運営者の設定待ちです）。時間をおいてお試しください。';
      render(); return;
    }
    var ref = makeRef();
    var est = cs.attachId ? S.getEstimate(cs.attachId) : null;
    var payload = {
      app: 'tsuguie', v: 1, ref: ref,
      experts: chosen().map(function (x) { return x.id; }),
      name: cs.name.trim(), email: cs.email.trim(), area: cs.area.trim(),
      topics: topicsChosen(), body: cs.body.trim(),
      estimate: est ? estimateSummary(est) : '',
      website: cs.website
    };
    cs.sending = true; cs.error = ''; render();
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    fetch(CFG.endpoint, {
      method: 'POST',
      // text/plain にして、ブラウザの事前確認（CORS preflight）を避ける
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'bad_response' }; });
    }).then(function (j) {
      clearTimeout(timer);
      if (!j || !j.ok) throw new Error(j && j.error ? j.error : 'failed');
      cs.sentText = consultText(ref);
      cs.ref = ref;
      cs.sentRoles = chosen().map(function (x) { return x.role; });
      cs.sentEmail = cs.email.trim();
      // 送ったら入力は消す（完了画面に出す分だけ残す）
      cs.name = ''; cs.email = ''; cs.area = ''; cs.body = ''; cs.topics = {}; cs.attachId = '';
      cs.sending = false;
      go('#/consult/done');
    }).catch(function (err) {
      clearTimeout(timer);
      cs.sending = false;
      var code = err && err.message;
      cs.error = code === 'busy' ? '送信が混み合っています。少し時間をおいてから、もう一度お試しください。'
        : code === 'email' ? 'メールアドレスの形式を確認してください。'
        : '通信できませんでした。電波の良いところで、もう一度「この内容で送信する」を押してください。';
      render();
    });
  }

  function vConsultDone() {
    if (!cs.ref) { go('#/consult'); return ''; }
    var fallbacks = CFG.experts.filter(function (x) { return x.fallbackEmail && cs.sentRoles.indexOf(x.role) >= 0; });
    return '' +
      '<div class="done-mark">' + ICON.check + '</div>' +
      '<h1 class="title center">送信しました</h1>' +
      '<div class="ref"><span>受付番号</span><b>' + h(cs.ref) + '</b></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:6px"><div class="card-title">このあとの流れ</div>' +
        '<p style="margin:0;font-size:14.5px;line-height:1.8">後日、' + cs.sentRoles.map(function (r) { return '<b>' + h(r) + '</b>'; }).join('と') +
        'から、<b style="word-break:break-all">' + h(cs.sentEmail) + '</b> あてにそれぞれメールでご連絡します（目安 ' + h(CFG.replyDays) + '営業日以内）。</p></div>' +
      '<div class="notice shu"><div class="notice-title">自動返信メールは届きません</div>' +
        '<p>この送信に対する受付完了メールは送られません。受付番号と送信内容は、この画面でお控えください。</p>' +
        '<button class="btn small ghost" data-act="copy" style="align-self:flex-start">送信内容をコピーする</button></div>' +
      '<div class="card" style="display:flex;flex-direction:column;gap:6px"><div class="card-title">このアプリに残るもの</div>' +
        '<p style="margin:0;font-size:14.5px;line-height:1.8">ありません。送信した内容は、このアプリにも運営者のサーバーにも保存されません。</p></div>' +
      '<div style="display:flex;flex-direction:column;gap:6px"><div class="card-title" style="font-size:14px">返信が来ないとき</div>' +
        '<p class="note">迷惑メールフォルダをご確認ください。' + h(CFG.replyDays) + '営業日を過ぎても届かない場合は、もう一度そうだんから送ってください。</p>' +
        (fallbacks.length ? '<a class="btn ghost" href="mailto:' + h(fallbacks.map(function (x) { return x.fallbackEmail; }).join(',')) +
          '?subject=' + h(encodeURIComponent('【つぐいえ相談 ' + cs.ref + '】再送')) + '&body=' + h(encodeURIComponent(cs.sentText)) + '">メールアプリで送り直す</a>' : '') +
      '</div>' +
      '<a class="btn" href="#/home">ホームにもどる</a>';
  }

  function vNotFound() {
    return '<div class="head"><h1 class="title">ページが見つかりません</h1></div><a class="btn" href="#/home">ホームにもどる</a>';
  }

  /* ======================================================
     ルーター
     ====================================================== */
  var NO_TAB = /^(sim\/new|consult\/(form|confirm|done))$/;
  var lastPath = null;
  function route() {
    var p = (location.hash || '#/home').replace(/^#\/?/, '');
    return p || 'home';
  }
  function render() {
    var p = route(), parts = p.split('/'), html;
    if (lastPath !== p) { confirmClear = false; confirmDelEst = false; simErr = ''; }
    if (lastPath === 'consult/done' && p !== 'consult/done') resetConsult();
    if (parts[0] !== 'sim' || parts[1] !== 'new') { if (lastPath === 'sim/new' && p !== 'sim/new') { draft = null; simStep = 0; } }
    switch (parts[0]) {
      case 'home': html = vHome(); break;
      case 'settings': html = vSettings(); break;
      case 'learn': html = parts[1] ? vArticle(parts[1]) : vLearn(); break;
      case 'sim': html = parts[1] === 'new' ? vSimNew() : parts[1] ? vSimResult(parts[1]) : vSimList(); break;
      case 'consult':
        html = parts[1] === 'form' ? vConsultForm() : parts[1] === 'confirm' ? vConsultConfirm()
          : parts[1] === 'done' ? vConsultDone() : vConsult();
        break;
      default: html = vNotFound();
    }
    if (html === '' ) return; // go() で別の画面へ移った
    view.innerHTML = html;
    var noTab = NO_TAB.test(p);
    view.classList.toggle('no-tab', noTab);
    tabbar.hidden = noTab;
    var tab = parts[0] === 'settings' ? 'home' : parts[0];
    Array.prototype.forEach.call(tabbar.querySelectorAll('a'), function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (lastPath !== p) {
      window.scrollTo(0, 0);
      try { view.focus({ preventScroll: true }); } catch (e) { /* 古い端末 */ }
    }
    lastPath = p;
  }

  /* ======================================================
     操作
     ====================================================== */
  view.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el || !view.contains(el)) return;
    var act = el.getAttribute('data-act');
    switch (act) {
      case 'set-death': {
        var v = document.getElementById('death').value;
        if (!v) { document.getElementById('death-err').hidden = false; return; }
        S.setDeath(v); render(); break;
      }
      case 'save-death': {
        var v2 = document.getElementById('death2').value;
        if (!v2) { toast('日付を入れてください'); return; }
        S.setDeath(v2); toast('保存しました'); break;
      }
      case 'toggle': S.toggleDone(el.getAttribute('data-id')); render(); break;
      case 'filter': learnFilter = el.getAttribute('data-v'); render(); break;
      case 'export': {
        var blob = new Blob([S.exportJSON()], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tsuguie-backup-' + DL.todayISO() + '.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        break;
      }
      case 'clear': confirmClear = true; render(); break;
      case 'clear-no': confirmClear = false; render(); break;
      case 'clear-yes': S.clearAll(); confirmClear = false; toast('すべて消しました'); go('#/home'); break;
      case 'yn': {
        var raw = el.getAttribute('data-v');
        draft[el.getAttribute('data-k')] = raw === 'true' ? true : raw === 'false' ? false : 'unk';
        render(); break;
      }
      case 'sim-next': {
        simErr = simValidate();
        if (simErr) { render(); return; }
        if (simStep === SIM_STEPS.length - 1) { simFinish(); return; }
        simStep++; render(); window.scrollTo(0, 0); break;
      }
      case 'sim-back': simErr = ''; simStep = Math.max(0, simStep - 1); render(); break;
      case 'del-est': confirmDelEst = true; render(); break;
      case 'del-est-no': confirmDelEst = false; render(); break;
      case 'del-est-yes': S.removeEstimate(el.getAttribute('data-id')); toast('削除しました'); go('#/sim'); break;
      case 'consult-with': cs.attachId = el.getAttribute('data-id'); go('#/consult'); break;
      case 'to-form': if (chosen().length) go('#/consult/form'); break;
      case 'topic': {
        var t = el.getAttribute('data-v');
        if (cs.topics[t]) delete cs.topics[t]; else cs.topics[t] = true;
        el.setAttribute('aria-pressed', String(!!cs.topics[t]));
        break;
      }
      case 'to-confirm':
        if (consultValidate()) { cs.agree = false; cs.error = ''; go('#/consult/confirm'); }
        else { render(); var bad = view.querySelector('[aria-invalid="true"], .err'); if (bad) bad.scrollIntoView({ block: 'center' }); }
        break;
      case 'send': send(); break;
      case 'copy': {
        var text = cs.sentText;
        var done = function () { toast('コピーしました'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text) ? done() : toast('コピーできませんでした'); });
        } else if (fallbackCopy(text)) done(); else toast('コピーできませんでした');
        break;
      }
    }
  });
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  /* 入力：画面を描き直さずに状態だけ更新する（フォーカスを失わないため） */
  function onInput(ev) {
    var el = ev.target;
    var k = el.getAttribute('data-bind');
    if (k && draft) {
      if (el.type === 'checkbox') {
        draft[k] = el.checked;
        if (k === 'acqYearUnknown') { var y = document.getElementById('s-acqy'); if (y) y.disabled = el.checked; }
      } else if (el.type === 'radio') {
        if (el.checked) draft[k] = el.value;
        if (k === 'acqKnown') { var f = document.getElementById('acq-price-field'); if (f) f.hidden = el.value !== 'yes'; }
        if (k === 'kind') { ['builtBefore1981', 'livedAlone', 'renovateOrDemolish'].forEach(function (x) { if (el.value !== 'house') draft[x] = null; }); }
      } else draft[k] = el.value;
    }
    var ck = el.getAttribute('data-cbind');
    if (ck) cs[ck] = el.value;
    var ex = el.getAttribute('data-exp');
    if (ex) {
      if (el.checked) cs.experts[ex] = true; else delete cs.experts[ex];
      var b = document.getElementById('to-form');
      if (b) { var n = chosen().length; b.disabled = !n; b.textContent = nextLabel(n); }
    }
    if (el.getAttribute('data-act-change') === 'agree') {
      cs.agree = el.checked;
      var sb = document.getElementById('send-btn');
      if (sb) sb.disabled = !cs.agree || cs.sending;
    }
    if (el.id === 'import-file' && el.files && el.files[0]) {
      var reader = new FileReader();
      reader.onload = function () {
        try { S.importJSON(String(reader.result)); toast('読み込みました'); render(); }
        catch (e) { toast(e.message || '読み込めませんでした'); }
      };
      reader.readAsText(el.files[0]);
      el.value = '';
    }
  }
  view.addEventListener('input', onInput);
  view.addEventListener('change', onInput);

  window.addEventListener('hashchange', render);
  render();
})();

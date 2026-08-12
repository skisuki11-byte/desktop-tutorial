/* app.js — 画面。数字は作らない（作るのは store.js）。
 * 依存ライブラリなし。書き換えたら描き直す、それだけの作り。
 */
(function () {
  'use strict';

  var S = window.Store;
  var P = window.DIV_PLAN;
  var C = window.Chart;

  /* ---------- 小道具 ---------- */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function yen(n) { return Math.round(Number(n) || 0).toLocaleString('ja-JP'); }
  function pct(n, d) { return (Number(n) || 0).toFixed(d === undefined ? 1 : d) + '%'; }
  function signed(n) { return (n > 0 ? '+' : '') + yen(n); }
  function man(n) {
    var v = Math.round(Number(n) || 0);
    if (Math.abs(v) < 10000) return yen(v) + '円';
    return (v / 10000).toFixed(v % 10000 === 0 ? 0 : 1) + '万円';
  }

  /* 銘柄の色。並び順で割り当てる（CSSのトークンと対応） */
  var PALETTE = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
  function colorOf(ticker) {
    var plan = S.getPlan();
    for (var i = 0; i < plan.length; i++) if (plan[i].ticker === ticker) return PALETTE[i % PALETTE.length];
    return 'var(--muted)';
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  /* ---------- タブ ---------- */
  var current = 'home';
  function show(view) {
    current = view;
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.toggle('active', views[i].id === 'view-' + view);
    var tabs = document.querySelectorAll('.tab');
    for (i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].dataset.view === view);
    try { localStorage.setItem('div.view', view); } catch (e) { /* 使えない環境は覚えないだけ */ }
    render();
    window.scrollTo(0, 0);
  }

  /* ============ ホーム ============ */
  function renderHome() {
    var s = S.summary();
    var set = S.getSettings();
    var accountLabel = set.account === 'nisa' ? 'NISA成長投資枠' : '特定口座';
    var started = s.value > 0;

    var cards = [
      {
        label: '評価額', value: yen(s.value), unit: '円', cls: '',
        sub: started ? ('取得 ' + yen(s.cost) + '円　' +
          '<span class="delta ' + (s.gain >= 0 ? 'up' : 'down') + '">' + signed(s.gain) + '円（' +
          (s.gainPct >= 0 ? '+' : '') + s.gainPct.toFixed(1) + '%）</span>')
          : 'まだ入力がありません。「保有」タブで入れてください'
      },
      {
        label: '年間の配当（手取り・' + accountLabel + '）',
        value: yen(s.netDiv), unit: '円', cls: 'up',
        sub: '税引前 ' + yen(s.grossDiv) + '円'
      },
      {
        label: 'ならすと月あたり', value: yen(s.monthlyNet), unit: '円', cls: 'up',
        sub: started ? '入金は四半期ごと。カレンダータブを参照' : '—'
      },
      {
        label: started ? '取得利回り（YoC）' : '計画の表面利回り',
        value: started ? s.yoc.toFixed(2) : s.planYield.toFixed(2), unit: '%', cls: '',
        sub: started
          ? ('いまの表面利回り ' + pct(s.grossYield, 2) + '　目標YoC ' + pct(P.meta.targetYoC, 1))
          : ('目標は取得利回り ' + pct(P.meta.targetYoC, 1) + '。年' + pct(set.dividendGrowth, 1) + 'の増配が続けば3〜4年で届く')
      }
    ];
    $('homeCards').innerHTML = cards.map(function (c) {
      return '<div class="card"><div class="card-label">' + c.label + '</div>' +
        '<div class="card-value ' + c.cls + '">' + c.value + '<span class="unit">' + c.unit + '</span></div>' +
        '<div class="card-sub">' + c.sub + '</div></div>';
    }).join('');

    // 気をつけること
    var al = S.alerts();
    $('homeAlerts').innerHTML = al.length
      ? '<ul class="alerts">' + al.map(function (a) {
          return '<li class="al-' + a.level + '"><span class="al-mark">' +
            (a.level === 'bad' ? '!' : a.level === 'warn' ? '▲' : 'i') + '</span>' + esc(a.text) + '</li>';
        }).join('') + '</ul>'
      : '<p class="hint">いまのところルール違反はありません。</p>';

    // 配分
    var rs = S.rows();
    var useActual = s.value > 0;
    var items = rs.map(function (r) {
      return { label: r.ticker, value: useActual ? r.value : r.target, color: colorOf(r.ticker) };
    });
    $('homeAllocHint').textContent = useActual ? 'いまの評価額の内訳' : 'まだ買っていないので目標配分を出しています';
    $('homeDonut').innerHTML = C.donut(items, {
      center: useActual ? man(s.value) : pct(s.planYield, 2),
      centerSub: useActual ? '評価額' : '表面利回り'
    });
    $('homeLegend').innerHTML = rs.map(function (r) {
      var v = useActual ? r.actual : r.target;
      return '<li><span class="sw" style="background:' + colorOf(r.ticker) + '"></span>' +
        '<span class="grow"><strong>' + esc(r.ticker) + '</strong> ' + esc(r.name) + '</span>' +
        '<span class="num">' + pct(v) + '</span></li>';
    }).join('');

    // 銘柄ごと
    $('homeTable').innerHTML =
      '<thead><tr><th>銘柄</th><th>評価額</th><th>配分</th><th>目標</th><th>ズレ</th><th>利回り</th><th>年間配当（手取り）</th></tr></thead>' +
      '<tbody>' + rs.map(function (r) {
        return '<tr><td>' + esc(r.ticker) + '<span class="sub-name">' + esc(r.name) + '</span></td>' +
          '<td>' + yen(r.value) + '</td>' +
          '<td>' + pct(r.actual) + '</td>' +
          '<td>' + pct(r.target, 0) + '</td>' +
          '<td class="' + (Math.abs(r.drift) >= P.thresholds.driftWarn ? (r.drift > 0 ? 'down' : 'warnc') : '') + '">' +
            (s.value > 0 ? (r.drift > 0 ? '+' : '') + r.drift.toFixed(1) + 'pt' : '—') + '</td>' +
          '<td>' + pct(r.yield, 2) + '</td>' +
          '<td>' + yen(r.netDiv) + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>合計</td><td>' + yen(s.value) + '</td><td>' + (s.value > 0 ? '100.0%' : '—') +
      '</td><td>100%</td><td></td><td>' + pct(s.value > 0 ? s.grossYield : s.planYield, 2) + '</td><td>' +
      yen(s.netDiv) + '</td></tr></tbody>';
  }

  /* ============ 保有 ============ */
  function renderHoldings() {
    var rs = S.rows();
    $('holdingsList').innerHTML = rs.map(function (r) {
      return '<div class="panel holding">' +
        '<div class="panel-head">' +
          '<h2><span class="sw" style="background:' + colorOf(r.ticker) + '"></span>' +
          esc(r.ticker) + '　' + esc(r.name) + '</h2>' +
          '<span class="hint">' + esc(r.sector) + '／利回り ' + pct(r.yield, 2) + '</span>' +
        '</div>' +
        '<div class="grid2">' +
          '<label class="field"><span>いまの評価額（円）</span>' +
          '<input type="number" step="1000" min="0" inputmode="numeric" data-pos="value" data-ticker="' +
          esc(r.ticker) + '" value="' + Math.round(r.value) + '"></label>' +
          '<label class="field"><span>取得額の合計（円）</span>' +
          '<input type="number" step="1000" min="0" inputmode="numeric" data-pos="cost" data-ticker="' +
          esc(r.ticker) + '" value="' + Math.round(r.cost) + '"></label>' +
        '</div>' +
        '<ul class="list">' +
          '<li><span class="grow">含み損益</span><span class="num ' + (r.gain >= 0 ? 'up' : 'down') + '">' +
            (r.cost > 0 ? signed(r.gain) + '円' : '—') + '</span></li>' +
          '<li><span class="grow">年間の配当（手取り）</span><span class="num">' + yen(r.netDiv) + '円</span></li>' +
          '<li><span class="grow">取得利回り（YoC）</span><span class="num">' +
            (r.cost > 0 ? pct(r.yoc, 2) : '—') + '</span></li>' +
          '<li><span class="grow">配分（目標 ' + pct(r.target, 0) + '）</span><span class="num">' +
            (r.value > 0 ? pct(r.actual) : '—') + '</span></li>' +
        '</ul>' +
      '</div>';
    }).join('');

    $('holdingsWhy').innerHTML = S.getPlan().map(function (h) {
      var flags = [];
      if (h.payout) flags.push('配当性向 ' + h.payout + '%' + (h.isReit ? '（AFFO）' : ''));
      if (h.cfCover) flags.push('営業CF÷配当 ' + h.cfCover.toFixed(2));
      if (h.streak) flags.push(h.streak + '年連続増配');
      if (h.maxWeight) flags.push('上限 ' + h.maxWeight + '%');
      return '<details class="why"><summary><strong>' + esc(h.ticker) + '</strong> ' + esc(h.name) +
        '<span class="hint">　' + esc(flags.join('／')) + '</span></summary>' +
        '<p>' + esc(h.why || '') + '</p>' +
        (h.risk ? '<p class="risk"><strong>リスク：</strong>' + esc(h.risk) + '</p>' : '') +
        '</details>';
    }).join('');
  }

  /* ============ 今月の積立 ============ */
  var budgetOverride = null;
  function renderBuy() {
    var set = S.getSettings();
    var budget = budgetOverride === null ? set.monthly : budgetOverride;
    if ($('buyBudget') !== document.activeElement) $('buyBudget').value = budget;

    var items = S.buyPlan(budget);
    var total = items.reduce(function (s, i) { return s + i.amount; }, 0);
    $('buyTable').innerHTML =
      '<thead><tr><th>銘柄</th><th>買付額</th><th>今回の比率</th><th>目標配分</th></tr></thead><tbody>' +
      items.map(function (i) {
        return '<tr><td><span class="sw" style="background:' + colorOf(i.ticker) + '"></span>' +
          esc(i.ticker) + '</td><td>' + yen(i.amount) + '</td><td>' + pct(i.share) +
          '</td><td>' + pct(i.target, 0) + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>合計</td><td>' + yen(total) + '</td><td>100.0%</td><td>100%</td></tr></tbody>';

    var s = S.summary();
    $('buyNote').innerHTML = s.value > 0
      ? '目標配分から離れている銘柄に多めに寄せています。売却はしません（NISA枠は売ると翌年まで戻らないため）。'
      : 'まだ保有がないので、目標配分どおりに割り振っています。この金額をPayPay証券のつみたて設定に入れてください。';

    // コスト
    var c = S.buyCostParts();
    var modeLabel = set.buyMode === 'auto' ? 'つみたて（自動買付）' : '立会時間内に手動発注';
    var lost = budget * c.total / 100;
    $('buyCost').innerHTML =
      '<ul class="list">' +
        '<li><span class="grow">買い方</span><span class="num">' + esc(modeLabel) + '</span></li>' +
        '<li><span class="grow">スプレッド</span><span class="num">' + pct(c.spread, 2) + '</span></li>' +
        '<li><span class="grow">為替（1ドル' + P.costs.fxYenPerDollar + '銭 ÷ ' + set.usdJpy + '円）</span><span class="num">' + pct(c.fx, 2) + '</span></li>' +
        '<li><span class="grow"><strong>合計</strong></span><span class="num"><strong>' + pct(c.total, 2) + '</strong></span></li>' +
        '<li><span class="grow">今月ぶんの目減り</span><span class="num down">−' + yen(lost) + '円</span></li>' +
      '</ul>' +
      (set.buyMode === 'auto'
        ? '<div class="note mt">つみたては米国市場が開く日の日本時間0時以降に約定し、スプレッドは一律' +
          P.costs.spreadAutoBuy + '%です。立会時間内に自分で発注すれば' + P.costs.spreadInHours +
          '%になります。差がどれくらいになるかは「試算」タブの一番下で比べられます。</div>'
        : '<div class="note mt">日本時間 夏22:30〜翌5:00／冬23:30〜翌6:00 の間に発注してください。時間外は' +
          P.costs.spreadOutHours + '%になります。</div>');

    // 記録
    var log = S.getLog().slice().reverse();
    $('logHint').textContent = log.length ? '新しい順に' + log.length + '件' : '';
    $('buyLog').innerHTML = log.length
      ? '<div class="table-wrap"><table><thead><tr><th>日付</th><th>銘柄</th><th>金額</th><th></th></tr></thead><tbody>' +
        log.map(function (l, i) {
          var realIndex = S.getLog().length - 1 - i;
          return '<tr><td>' + esc(l.date) + '</td><td>' + esc(l.ticker) + '</td><td>' + yen(l.amount) +
            '</td><td><button class="btn btn-sm btn-danger" data-dellog="' + realIndex + '" type="button">取消</button></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<p class="hint">まだ記録がありません。買付が約定したら上のボタンで記録すると、取得額と評価額に足されます。</p>';
  }

  /* ============ 入金カレンダー ============ */
  function renderCalendar() {
    var cal = S.calendar();
    var year = cal.reduce(function (s, m) { return s + m.total; }, 0);
    $('calHint').textContent = year > 0 ? '年間 ' + yen(year) + '円（手取り）' : 'まだ保有の入力がありません';
    $('calChart').innerHTML = year > 0
      ? C.calendarBars(cal, colorOf)
      : '<p class="hint">「保有」タブで評価額を入れると、月ごとの入金額が出ます。</p>';

    $('calLegend').innerHTML = S.getPlan().map(function (h) {
      return '<li><span class="sw" style="background:' + colorOf(h.ticker) + '"></span>' +
        '<span class="grow"><strong>' + esc(h.ticker) + '</strong></span>' +
        '<span class="num">' + (h.payMonths || []).join('・') + '月</span></li>';
    }).join('');

    $('calTable').innerHTML =
      '<thead><tr><th>月</th><th>入金される銘柄</th><th>金額（手取り）</th></tr></thead><tbody>' +
      cal.map(function (m) {
        var names = m.items.map(function (i) { return i.ticker; }).join('・');
        return '<tr' + (m.items.length ? '' : ' class="future"') + '><td>' + m.month + '月</td>' +
          '<td class="left">' + esc(names || '—') + '</td><td>' + (m.total > 0 ? yen(m.total) : '—') + '</td></tr>';
      }).join('') +
      '<tr class="total"><td>年間</td><td class="left"></td><td>' + (year > 0 ? yen(year) : '—') + '</td></tr></tbody>';
  }

  /* ============ 試算 ============ */
  var cuts = { CPB: 50, PFE: 30 };
  function renderSim() {
    var set = S.getSettings();
    var series = S.simulate({});
    var last = series[series.length - 1];
    var c = S.buyCostParts();

    $('simHint').textContent = '毎月' + yen(set.monthly) + '円・配当は全額再投資・増配' + pct(set.dividendGrowth, 1) +
      '・株価' + (set.priceGrowth >= 0 ? '+' : '') + pct(set.priceGrowth, 1) + '・買付コスト' + pct(c.total, 2);
    $('simChart').innerHTML = C.growth(series);

    $('simTable').innerHTML =
      '<thead><tr><th>経過</th><th>累計投資</th><th>残高</th><th>含み損益</th><th>年間配当（手取り）</th><th>月あたり</th></tr></thead><tbody>' +
      series.map(function (r, i) {
        var isLast = i === series.length - 1;
        return '<tr' + (isLast ? ' class="total"' : '') + '><td>' + r.year + '年後</td>' +
          '<td>' + yen(r.invested) + '</td><td>' + yen(r.balance) + '</td>' +
          '<td class="' + (r.gain >= 0 ? 'up' : 'down') + '">' + signed(r.gain) + '</td>' +
          '<td>' + yen(r.annualNet) + '</td><td>' + yen(r.monthlyNet) + '</td></tr>';
      }).join('') + '</tbody>';

    if (last) {
      $('simFoot').innerHTML = set.years + '年間の受取配当の累計は約' + man(last.divTotal) +
        '（全額再投資）。取得利回りは税引前で約' + pct(last.yoc, 1) + '。' +
        '<strong>' + (set.years + 1) + '年目から配当を使う運用に切り替えると手取り月およそ' +
        man(last.monthlyNet) + '。</strong>';
    }

    // シナリオ
    var sc = S.scenarios();
    $('scenTable').innerHTML =
      '<thead><tr><th>株価の前提</th><th>' + set.years + '年後の残高</th><th>' + (set.years + 1) + '年目の月収入</th></tr></thead><tbody>' +
      sc.map(function (r) {
        return '<tr><td>' + esc(r.label) + '</td><td>' + yen(r.balance) + '</td><td>' + yen(r.monthlyNet) + '</td></tr>';
      }).join('') + '</tbody>';

    // 減配
    $('cutInputs').innerHTML = S.getPlan().map(function (h) {
      return '<label class="field"><span>' + esc(h.ticker) + ' の減配率（%）</span>' +
        '<input type="number" step="5" min="0" max="100" inputmode="numeric" data-cut="' + esc(h.ticker) +
        '" value="' + (cuts[h.ticker] || 0) + '"></label>';
    }).join('');

    // 減配は「いつ起きるか」で痛み方が変わるので、両端を出す
    var lateLast = S.simulate({ cuts: cuts, cutAtEnd: true }).slice(-1)[0];
    var earlyLast = S.simulate({ cuts: cuts }).slice(-1)[0];
    function drop(x) { return last && x ? (1 - x.annualNet / last.annualNet) * 100 : 0; }
    $('cutTable').innerHTML =
      '<thead><tr><th></th><th>' + set.years + '年後の年間配当</th><th>月あたり</th><th>減少</th></tr></thead><tbody>' +
      '<tr><td>減配なし</td><td>' + yen(last ? last.annualNet : 0) + '</td><td>' +
        yen(last ? last.monthlyNet : 0) + '</td><td>—</td></tr>' +
      '<tr><td>' + set.years + '年目に減配<span class="sub-name">配当が減るだけ</span></td><td>' +
        yen(lateLast ? lateLast.annualNet : 0) + '</td><td>' + yen(lateLast ? lateLast.monthlyNet : 0) +
        '</td><td class="down">−' + pct(drop(lateLast)) + '</td></tr>' +
      '<tr><td>初年度から減配<span class="sub-name">再投資できる額も減るぶん重い</span></td><td>' +
        yen(earlyLast ? earlyLast.annualNet : 0) + '</td><td>' + yen(earlyLast ? earlyLast.monthlyNet : 0) +
        '</td><td class="down">−' + pct(drop(earlyLast)) + '</td></tr></tbody>';

    var cpb = S.getPlan().filter(function (h) { return h.ticker === 'CPB'; })[0];
    $('cutNote').innerHTML = 'CPBを10%・PFEを20%で止めているので、半減配が出ても全体の減少は1割台にとどまります。' +
      (cpb ? 'CPBを30%入れていたら、同じ減配で2割以上が飛びます。' : '');

    // 買い方の差
    var fx = c.fx;
    var autoS = S.simulate({ costPct: P.costs.spreadAutoBuy + fx });
    var manS = S.simulate({ costPct: P.costs.spreadInHours + fx });
    var a = autoS[autoS.length - 1], m = manS[manS.length - 1];
    $('costTable').innerHTML =
      '<thead><tr><th>買い方</th><th>コスト</th><th>' + set.years + '年後の残高</th><th>差</th></tr></thead><tbody>' +
      '<tr><td>つみたて（自動）</td><td>' + pct(P.costs.spreadAutoBuy + fx, 2) + '</td><td>' + yen(a ? a.balance : 0) +
        '</td><td class="down">−' + yen((m ? m.balance : 0) - (a ? a.balance : 0)) + '</td></tr>' +
      '<tr><td>立会時間内に手動</td><td>' + pct(P.costs.spreadInHours + fx, 2) + '</td><td>' + yen(m ? m.balance : 0) +
        '</td><td>—</td></tr></tbody>';
  }

  /* ============ 確認事項 ============ */
  function renderCheck() {
    var chk = S.getChecks();
    var labels = { ok: '確認できた', warn: '計画と違った', todo: 'アプリで要確認' };
    $('checkList').innerHTML = P.confirmations.map(function (c) {
      var done = !!chk[c.id];
      return '<div class="panel conf conf-' + c.status + (done ? ' done' : '') + '">' +
        '<div class="panel-head">' +
          '<h2>' + esc(c.title) + '</h2>' +
          '<span class="badge b-' + c.status + '">' + labels[c.status] + '</span>' +
        '</div>' +
        '<p>' + esc(c.body) + '</p>' +
        '<p class="do"><strong>やること：</strong>' + esc(c.action) + '</p>' +
        '<div class="conf-foot">' +
          '<label class="chk"><input type="checkbox" data-conf="' + esc(c.id) + '"' + (done ? ' checked' : '') +
            '> 確認した</label>' +
          (c.url ? '<a class="hint" href="' + esc(c.url) + '" target="_blank" rel="noopener">PayPay証券のページ</a>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    // 銘柄ごとの取扱い状況。自分で確かめたらチェックを付けて潰していく
    var av = P.availability;
    var mark = {
      likely: '<span class="pill p-likely">ほぼ確実</span>',
      unknown: '<span class="pill p-unknown">未確認</span>',
      yes: '<span class="pill p-yes">確認済み</span>'
    };
    $('availTable').innerHTML =
      '<thead><tr><th>銘柄</th><th>PayPay証券で買えるか</th><th>NISAで買えるか</th><th>根拠</th></tr></thead><tbody>' +
      av.items.map(function (a) {
        var h = S.getPlan().filter(function (x) { return x.ticker === a.ticker; })[0];
        var done = !!chk['avail-' + a.ticker];
        return '<tr><td><span class="sw" style="background:' + colorOf(a.ticker) + '"></span>' +
          esc(a.ticker) + (h ? '<span class="sub-name">' + esc(h.name) + '</span>' : '') + '</td>' +
          '<td>' + (done ? mark.yes : mark[a.handled]) + '</td>' +
          '<td>' + (done ? mark.yes : mark.unknown) + '</td>' +
          '<td class="left"><span class="hint">' + esc(a.evidence) + '</span>' +
          '<label class="chk mt"><input type="checkbox" data-conf="avail-' + esc(a.ticker) + '"' +
          (done ? ' checked' : '') + '> アプリで両方とも確認した</label></td></tr>';
      }).join('') + '</tbody>';
    $('availNote').innerHTML = '調査日 ' + esc(av.asOf) +
      '。<strong>NISAで買えるかは公開情報からは誰も断定できません。</strong>' +
      '取扱銘柄一覧に「NISA対象」の絞り込みがある＝銘柄ごとに可否が決まっているためです。' +
      'アプリで1銘柄ずつ確かめて、確認できたらチェックを付けてください。';

    $('ruleList').innerHTML = P.rules.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');

    $('failTable').innerHTML =
      '<thead><tr><th>銘柄</th><th>年</th><th>結果</th></tr></thead><tbody>' +
      P.failures.map(function (f) {
        return '<tr><td>' + esc(f.name) + '</td><td>' + f.year + '</td>' +
          '<td class="left">' + esc(f.cut) + (f.note ? '<span class="sub-name">' + esc(f.note) + '</span>' : '') + '</td></tr>';
      }).join('') + '</tbody>';

    $('failSigns').innerHTML = '<strong>共通の予兆は3点：</strong>' +
      P.failureSigns.map(function (s) { return esc(s); }).join('／') +
      '。「利回りが高い」ではなく「なぜ高いのか」を毎回問う。';
  }

  /* ============ 設定 ============ */
  function renderSettings() {
    var set = S.getSettings();
    $('setMonthly').value = set.monthly;
    $('setAccount').value = set.account;
    $('setBuyMode').value = set.buyMode;
    $('setUsdJpy').value = set.usdJpy;
    $('setDivGrowth').value = set.dividendGrowth;
    $('setPriceGrowth').value = set.priceGrowth;
    $('setYears').value = set.years;
    $('setReitTax').value = set.reitWithholding;

    var plan = S.getPlan();
    $('planEditor').innerHTML = plan.map(function (h, i) {
      return '<div class="row-edit">' +
        '<span class="sw" style="background:' + colorOf(h.ticker) + '"></span>' +
        '<span class="grow"><strong>' + esc(h.ticker) + '</strong> ' + esc(h.name) + '</span>' +
        '<label class="inline"><span>配分</span>' +
          '<input type="number" step="1" min="0" max="100" inputmode="numeric" data-plan="weight" data-i="' + i +
          '" value="' + h.weight + '"><span class="suffix">%</span></label>' +
        '<label class="inline"><span>利回り</span>' +
          '<input type="number" step="0.01" min="0" inputmode="decimal" data-plan="yield" data-i="' + i +
          '" value="' + h.yield + '"><span class="suffix">%</span></label>' +
      '</div>';
    }).join('');

    var sum = plan.reduce(function (s, h) { return s + Number(h.weight || 0); }, 0);
    $('planSum').innerHTML = '配分の合計：<strong>' + sum + '%</strong>' +
      (Math.abs(sum - 100) < 0.01 ? '' : '　← 100%になるように直してください');

    $('swapFrom').innerHTML = plan.map(function (h) {
      return '<option value="' + esc(h.ticker) + '">' + esc(h.ticker) + '　' + esc(h.name) + '</option>';
    }).join('');
    $('swapTo').innerHTML = P.candidates.map(function (c) {
      return '<option value="' + esc(c.ticker) + '">' + esc(c.ticker) + '　' + esc(c.name) +
        '（' + c.yield.toFixed(2) + '%・' + esc(c.verdict) + '）</option>';
    }).join('');

    $('candidateList').innerHTML =
      '<div class="table-wrap"><table><thead><tr><th>候補</th><th>利回り</th><th>判断</th><th>理由</th></tr></thead><tbody>' +
      P.candidates.map(function (c) {
        return '<tr><td>' + esc(c.ticker) + '<span class="sub-name">' + esc(c.name) + '</span></td>' +
          '<td>' + pct(c.yield, 2) + '</td><td>' + esc(c.verdict) + '</td>' +
          '<td class="left">' + esc(c.note) + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    $('aboutText').innerHTML = esc(P.meta.source) + ' をもとにしています（' + esc(P.meta.createdAt) +
      '作成）。利回り・株価は作成時点の公開データによる概算で、実際の値とはズレます。' +
      'PayPay証券との自動連携はありません（2026年8月時点で提供が無いため）。売買はアプリで手動、このアプリは記録と試算だけを行います。' +
      '<strong>投資判断は自己責任で。</strong>';
  }

  /* ---------- 描き直し ---------- */
  function render() {
    if (current === 'home') renderHome();
    else if (current === 'holdings') renderHoldings();
    else if (current === 'buy') renderBuy();
    else if (current === 'calendar') renderCalendar();
    else if (current === 'sim') renderSim();
    else if (current === 'check') renderCheck();
    else if (current === 'settings') renderSettings();
  }

  /* ---------- 出来事 ---------- */

  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (b) show(b.dataset.view);
  });

  // 明暗の切り替え
  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  $('btnTheme').addEventListener('click', function () {
    var t = S.getSettings().theme;
    var next = t === 'dark' ? 'light' : t === 'light' ? '' : 'dark';
    S.setSettings({ theme: next });
    applyTheme(next);
  });

  /* 入力は「打ち終わってから」ではなく打つたびに保存する。
     ただし描き直すと入力欄が作り直されてカーソルが飛ぶので、
     input のときは保存だけして、描き直しは他のタブに移ったときに任せる。 */
  document.addEventListener('input', function (e) {
    var el = e.target;

    if (el.dataset.pos) {
      var patch = {};
      patch[el.dataset.pos] = Number(el.value) || 0;
      S.setPos(el.dataset.ticker, patch);
      return;
    }
    if (el.id === 'buyBudget') { budgetOverride = Number(el.value) || 0; return; }
    if (el.dataset.cut) { cuts[el.dataset.cut] = Number(el.value) || 0; return; }

    if (el.dataset.plan) {
      var plan = S.getPlan().slice();
      var i = Number(el.dataset.i);
      plan[i] = Object.assign({}, plan[i]);
      plan[i][el.dataset.plan] = Number(el.value) || 0;
      S.setPlan(plan);
      return;
    }

    var map = {
      setMonthly: 'monthly', setUsdJpy: 'usdJpy', setDivGrowth: 'dividendGrowth',
      setPriceGrowth: 'priceGrowth', setYears: 'years', setReitTax: 'reitWithholding'
    };
    if (map[el.id]) {
      var p = {};
      p[map[el.id]] = Number(el.value) || 0;
      S.setSettings(p);
    }
  });

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.id === 'setAccount') { S.setSettings({ account: el.value }); render(); }
    if (el.id === 'setBuyMode') { S.setSettings({ buyMode: el.value }); render(); }
    if (el.dataset.conf) { S.toggleCheck(el.dataset.conf, el.checked); }
    if (el.id === 'fileImport' && el.files && el.files[0]) {
      var fr = new FileReader();
      fr.onload = function () {
        try {
          S.importAll(String(fr.result));
          budgetOverride = null;
          applyTheme(S.getSettings().theme);
          render();
          toast('取り込みました');
        } catch (err) {
          toast('読み込めませんでした：' + err.message);
        }
      };
      fr.readAsText(el.files[0]);
      el.value = '';
    }
  });

  document.addEventListener('click', function (e) {
    var el = e.target;

    if (el.id === 'btnRecord') {
      var set = S.getSettings();
      var budget = budgetOverride === null ? set.monthly : budgetOverride;
      var items = S.buyPlan(budget);
      if (!items.some(function (i) { return i.amount > 0; })) { toast('買付額が0円です'); return; }
      if (!confirm('この内容で買ったことにします。取得額と評価額に足されます。よろしいですか？')) return;
      S.recordBuys(items);
      renderBuy();
      toast('記録しました');
      return;
    }

    if (el.id === 'btnCopy') {
      var s = S.getSettings();
      var b = budgetOverride === null ? s.monthly : budgetOverride;
      var text = S.buyPlan(b).map(function (i) { return i.ticker + '\t' + i.amount; }).join('\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(
          function () { toast('コピーしました'); },
          function () { toast('コピーできませんでした'); }
        );
      } else { toast('この環境ではコピーできません'); }
      return;
    }

    if (el.dataset.dellog !== undefined) {
      if (!confirm('この記録を取り消します。取得額と評価額から引かれます。')) return;
      S.removeLog(Number(el.dataset.dellog));
      renderBuy();
      return;
    }

    if (el.id === 'btnSwap') {
      var from = $('swapFrom').value;
      var to = $('swapTo').value;
      var cand = P.candidates.filter(function (c) { return c.ticker === to; })[0];
      if (!cand) return;
      var plan2 = S.getPlan().slice();
      var idx = -1;
      for (var i = 0; i < plan2.length; i++) if (plan2[i].ticker === from) idx = i;
      if (idx < 0) return;
      if (plan2.some(function (h) { return h.ticker === to; })) { toast(to + ' はすでに入っています'); return; }
      if (!confirm(from + ' を ' + to + ' に差し替えます。配分 ' + plan2[idx].weight + '% はそのままにします。')) return;
      plan2[idx] = {
        ticker: cand.ticker, name: cand.name, weight: plan2[idx].weight, yield: cand.yield,
        sector: cand.sector, payMonths: cand.payMonths, maxWeight: null,
        payout: cand.payout, cfCover: cand.cfCover, isReit: !!cand.isReit,
        why: cand.note, risk: ''
      };
      S.setPlan(plan2);
      render();
      toast(from + ' を ' + to + ' に差し替えました');
      return;
    }

    if (el.id === 'btnExport') {
      var blob = new Blob([S.exportAll()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dividend-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      return;
    }
    if (el.id === 'btnImport') { $('fileImport').click(); return; }
    if (el.id === 'btnReset') {
      if (!confirm('入力した保有額・記録・設定をすべて消して、最初の計画に戻します。よろしいですか？')) return;
      S.resetAll();
      budgetOverride = null;
      applyTheme('');
      render();
      toast('戻しました');
    }
  });

  /* ---------- 起動 ---------- */
  applyTheme(S.getSettings().theme);
  var saved = 'home';
  try { saved = localStorage.getItem('div.view') || 'home'; } catch (e) { /* 使えなければホーム */ }
  if (!document.getElementById('view-' + saved)) saved = 'home';
  show(saved);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* オフライン対応が無いだけ */ });
    });
  }

})();

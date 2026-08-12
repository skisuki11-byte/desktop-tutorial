/* store.js — 数字を作るところ。画面（app.js）は計算しない。
 *
 *  ・計画（data.js の DIV_PLAN）は読むだけ。
 *  ・保有額・買付の記録・設定は端末の中（localStorage）だけに貯める。
 *    サーバーには何も送らない。PayPay証券との自動連携も無い（2026年8月時点で提供が無いため）。
 *  ・「銘柄の差し替え」をしても計画そのものは壊さず、手元の写し（plan）を書き換える形にしている。
 */
(function (global) {
  'use strict';

  var KEY_SET = 'div.settings.v1';
  var KEY_POS = 'div.positions.v1';
  var KEY_PLAN = 'div.plan.v1';
  var KEY_LOG = 'div.log.v1';
  var KEY_CHK = 'div.checks.v1';

  var P = global.DIV_PLAN;
  var changed = null;

  var settings, positions, plan, log, checks;

  /* ---------- 出し入れ ---------- */

  function defaults() {
    return {
      monthly: P.meta.monthly,
      account: P.assumptions.account,      // 'nisa' | 'tokutei'
      buyMode: 'auto',                     // 'auto'=つみたて(0.7%) / 'manual'=立会時間内の手動(0.5%)
      usdJpy: P.costs.usdJpy,
      dividendGrowth: P.assumptions.dividendGrowth,
      priceGrowth: P.assumptions.priceGrowth,
      years: P.assumptions.years,
      reitWithholding: P.costs.usWithholding, // REITだけ税率を変えられる（30%だった場合用）
      theme: ''
    };
  }

  function readJSON(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
  }

  function load() {
    settings = Object.assign(defaults(), readJSON(KEY_SET, {}));
    positions = readJSON(KEY_POS, {});
    log = readJSON(KEY_LOG, []);
    checks = readJSON(KEY_CHK, {});
    plan = readJSON(KEY_PLAN, null);
    if (!plan || !plan.length) plan = P.holdings.map(function (h) { return Object.assign({}, h); });
  }

  function save(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
    if (changed) changed();
  }

  function onChange(fn) { changed = fn; }

  function getSettings() { return settings; }
  function setSettings(patch) {
    Object.assign(settings, patch || {});
    save(KEY_SET, settings);
  }

  function getPlan() { return plan; }
  function setPlan(next) { plan = next; save(KEY_PLAN, plan); }

  function getChecks() { return checks; }
  function toggleCheck(id, on) { checks[id] = !!on; save(KEY_CHK, checks); }

  /* 保有額（円）。value=いまの評価額、cost=取得額の合計 */
  function pos(ticker) {
    return positions[ticker] || { value: 0, cost: 0 };
  }
  function setPos(ticker, patch) {
    var cur = Object.assign({ value: 0, cost: 0 }, positions[ticker]);
    Object.assign(cur, patch);
    cur.value = Math.max(0, Number(cur.value) || 0);
    cur.cost = Math.max(0, Number(cur.cost) || 0);
    positions[ticker] = cur;
    save(KEY_POS, positions);
  }

  /* ---------- 税金 ---------- */

  /* 手取り率。NISAでも米国源泉10%は必ず引かれる（租税条約の税率で、これは避けられない）。
     特定口座はさらに国内20.315%。REITだけ税率を変えられるようにしてある。 */
  function netRate(h) {
    var us = (h && h.isReit) ? Number(settings.reitWithholding) : P.costs.usWithholding;
    var r = 1 - (us / 100);
    if (settings.account !== 'nisa') r *= (1 - P.costs.jpTax / 100);
    return r;
  }

  /* 買付コスト（%）。スプレッド＋為替。 */
  function buyCostPct() {
    var spread = settings.buyMode === 'manual' ? P.costs.spreadInHours : P.costs.spreadAutoBuy;
    var fx = (P.costs.fxYenPerDollar / Number(settings.usdJpy || P.costs.usdJpy)) * 100;
    return spread + fx;
  }
  function buyCostParts() {
    return {
      spread: settings.buyMode === 'manual' ? P.costs.spreadInHours : P.costs.spreadAutoBuy,
      fx: (P.costs.fxYenPerDollar / Number(settings.usdJpy || P.costs.usdJpy)) * 100,
      total: buyCostPct()
    };
  }

  /* ---------- いまの持ち高 ---------- */

  function rows() {
    var total = totalValue();
    return plan.map(function (h) {
      var p = pos(h.ticker);
      var gross = p.value * (h.yield / 100);          // 年間配当（税引前）
      var net = gross * netRate(h);                   // 手取り
      var actual = total > 0 ? (p.value / total) * 100 : 0;
      return {
        h: h,
        ticker: h.ticker,
        name: h.name,
        sector: h.sector,
        value: p.value,
        cost: p.cost,
        gain: p.value - p.cost,
        target: h.weight,
        actual: actual,
        drift: actual - h.weight,
        yield: h.yield,
        yoc: p.cost > 0 ? (gross / p.cost) * 100 : 0,   // 取得利回り
        grossDiv: gross,
        netDiv: net
      };
    });
  }

  function totalValue() {
    return plan.reduce(function (s, h) { return s + pos(h.ticker).value; }, 0);
  }
  function totalCost() {
    return plan.reduce(function (s, h) { return s + pos(h.ticker).cost; }, 0);
  }

  function summary() {
    var rs = rows();
    var value = 0, cost = 0, gross = 0, net = 0;
    rs.forEach(function (r) { value += r.value; cost += r.cost; gross += r.grossDiv; net += r.netDiv; });
    return {
      value: value,
      cost: cost,
      gain: value - cost,
      gainPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      grossDiv: gross,
      netDiv: net,
      monthlyNet: net / 12,
      grossYield: value > 0 ? (gross / value) * 100 : planYield(),
      netYield: value > 0 ? (net / value) * 100 : 0,
      yoc: cost > 0 ? (gross / cost) * 100 : 0,
      planYield: planYield()
    };
  }

  /* 計画上の加重平均利回り（まだ何も持っていないときはこれを出す） */
  function planYield() {
    var w = 0, y = 0;
    plan.forEach(function (h) { w += h.weight; y += h.weight * h.yield; });
    return w > 0 ? y / w : 0;
  }

  /* ---------- 今月いくらどれに入れるか ---------- */

  /* 売らずに買い増しだけで目標配分へ寄せる。
     「配分どおりに買う」のではなく、足りていない銘柄から埋める（水を張るイメージ）。
     λ を動かして Σ max(0, λ*w_i - v_i) = 予算 になる点を二分探索で探す。 */
  function buyPlan(budget) {
    var b = Math.max(0, Number(budget) || 0);
    var vs = plan.map(function (h) { return pos(h.ticker).value; });
    var ws = plan.map(function (h) { return h.weight / 100; });
    var sumW = ws.reduce(function (s, x) { return s + x; }, 0);
    if (sumW <= 0) return plan.map(function (h) { return { ticker: h.ticker, name: h.name, amount: 0, share: 0 }; });
    ws = ws.map(function (x) { return x / sumW; });   // 合計が100%でなくても割り切れるように直す

    function need(lam) {
      var s = 0;
      for (var i = 0; i < vs.length; i++) s += Math.max(0, lam * ws[i] - vs[i]);
      return s;
    }
    var lo = 0, hi = (vs.reduce(function (s, x) { return s + x; }, 0) + b) / Math.min.apply(null, ws.filter(function (x) { return x > 0; })) + b + 1;
    for (var k = 0; k < 100; k++) {
      var mid = (lo + hi) / 2;
      if (need(mid) < b) lo = mid; else hi = mid;
    }
    var lam = (lo + hi) / 2;
    var raw = ws.map(function (w, i) { return Math.max(0, lam * w - vs[i]); });
    var sum = raw.reduce(function (s, x) { return s + x; }, 0);
    // 端数で予算とズレるので、比率を保ったまま予算ぴったりに直して1000円単位に丸める
    // 全部が目標に届いているときは sum が 0 になるので、そのときは配分どおりに配る
    var scaled = raw.map(function (x, i) { return sum > 0 ? (x / sum) * b : b * ws[i]; });
    var rounded = scaled.map(function (x) { return Math.round(x / 1000) * 1000; });
    var diff = b - rounded.reduce(function (s, x) { return s + x; }, 0);
    if (diff !== 0) {
      var big = 0;
      for (var j = 1; j < rounded.length; j++) if (rounded[j] > rounded[big]) big = j;
      rounded[big] = Math.max(0, rounded[big] + diff);
    }
    return plan.map(function (h, i) {
      return {
        ticker: h.ticker, name: h.name, amount: rounded[i],
        share: b > 0 ? (rounded[i] / b) * 100 : 0,
        target: h.weight
      };
    });
  }

  /* ---------- 入金カレンダー ---------- */

  /* 各月に入る配当（手取り）。いまの保有額をもとにした概算。 */
  function calendar() {
    var months = [];
    for (var m = 1; m <= 12; m++) months.push({ month: m, items: [], total: 0 });
    plan.forEach(function (h) {
      var p = pos(h.ticker);
      var perYear = p.value * (h.yield / 100) * netRate(h);
      var n = (h.payMonths || []).length || 4;
      var per = perYear / n;
      (h.payMonths || []).forEach(function (m) {
        months[m - 1].items.push({ ticker: h.ticker, amount: per });
        months[m - 1].total += per;
      });
    });
    return months;
  }

  /* ---------- 5年シミュレーション ---------- */

  /* 前提：毎月 monthly 円を買い増し、配当は手取りを翌月まとめて再投資。
     株価は年 priceGrowth%、1株あたり配当は年 dividendGrowth% で伸びる。
     opts.priceGrowth / opts.cuts（{ティッカー:減配率%}）で条件を差し替えられる。 */
  function simulate(opts) {
    opts = opts || {};
    var years = Number(opts.years || settings.years) || 5;
    var g = (opts.priceGrowth !== undefined ? opts.priceGrowth : settings.priceGrowth) / 100;
    var d = (opts.dividendGrowth !== undefined ? opts.dividendGrowth : settings.dividendGrowth) / 100;
    var monthly = Number(opts.monthly !== undefined ? opts.monthly : settings.monthly) || 0;
    var cost = (opts.costPct !== undefined ? opts.costPct : buyCostPct()) / 100;
    var cuts = opts.cuts || {};
    var startMonth = opts.startMonth || (new Date().getMonth() + 1);

    var mg = Math.pow(1 + g, 1 / 12);
    var md = Math.pow(1 + d, 1 / 12);

    // 1口＝1円で始める。価格が動けば評価額も動く。
    var units = plan.map(function () { return 0; });
    var price = 1;
    var divPerUnit = plan.map(function (h) { return h.yield / 100; });  // 1口あたりの年間配当（税引前）
    /* 減配をいつ織り込むか。
       cutAtEnd … 最後に起きたとして、そのときの年間配当だけを減らす（＝「いま減配が起きたら」）
       それ以外 … 初月から減配が続いたとして、再投資できる額も減る（＝痛手はもっと大きい） */
    var cutAtEnd = !!opts.cutAtEnd;
    var cf = plan.map(function (h) { return 1 - (Number(cuts[h.ticker] || 0) / 100); });
    var ws = plan.map(function (h) { return h.weight / 100; });
    var wsum = ws.reduce(function (s, x) { return s + x; }, 0) || 1;
    ws = ws.map(function (x) { return x / wsum; });

    var invested = 0, cash = 0, divTotal = 0;
    var series = [];
    var months = years * 12;

    for (var t = 1; t <= months; t++) {
      // 1) 積立ぶんと、前月までに受け取った配当を入れる
      var inflow = monthly + cash;
      invested += monthly;
      cash = 0;
      var buy = inflow * (1 - cost);
      for (var i = 0; i < plan.length; i++) units[i] += (buy * ws[i]) / price;

      // 2) 値動き
      price *= mg;
      for (i = 0; i < plan.length; i++) divPerUnit[i] *= md;

      // 3) 配当の入金（四半期）
      var cal = ((startMonth - 1 + t - 1) % 12) + 1;
      for (i = 0; i < plan.length; i++) {
        var pm = plan[i].payMonths || [];
        if (pm.indexOf(cal) >= 0) {
          var amt = units[i] * divPerUnit[i] * (cutAtEnd ? 1 : cf[i]) / (pm.length || 4) * netRate(plan[i]);
          cash += amt;
          divTotal += amt;
        }
      }

      if (t % 12 === 0) {
        var balance = units.reduce(function (s, u) { return s + u * price; }, 0);
        var runRate = 0;
        for (i = 0; i < plan.length; i++) runRate += units[i] * divPerUnit[i] * cf[i] * netRate(plan[i]);
        series.push({
          year: t / 12,
          invested: Math.round(invested),
          balance: Math.round(balance + cash),
          gain: Math.round(balance + cash - invested),
          annualNet: Math.round(runRate),
          monthlyNet: Math.round(runRate / 12),
          divTotal: Math.round(divTotal),
          yoc: invested > 0 ? (runRate / netRateAvg()) / invested * 100 : 0
        });
      }
    }
    return series;
  }

  /* 表示用のならし手取り率（取得利回りを税引前に戻すのに使う） */
  function netRateAvg() {
    var w = 0, s = 0;
    plan.forEach(function (h) { w += h.weight; s += h.weight * netRate(h); });
    return w > 0 ? s / w : 0.9;
  }

  /* 株価シナリオ別（+3% / 横ばい / -2%） */
  function scenarios() {
    return [
      { label: '年 +3%', g: 3 },
      { label: '横ばい', g: 0 },
      { label: '年 −2%', g: -2 }
    ].map(function (s) {
      var r = simulate({ priceGrowth: s.g });
      var last = r[r.length - 1] || { balance: 0, monthlyNet: 0 };
      return { label: s.label, balance: last.balance, monthlyNet: last.monthlyNet };
    });
  }

  /* ---------- 運用ルールの自動チェック ---------- */

  function alerts() {
    var out = [];
    var th = P.thresholds;
    var rs = rows();
    var total = totalValue();

    // 1銘柄の上限
    plan.forEach(function (h) {
      var cap = h.maxWeight || th.maxWeightPerStock;
      if (h.weight > cap) {
        out.push({ level: 'bad', ticker: h.ticker, text: h.ticker + ' の配分 ' + h.weight + '% が上限 ' + cap + '% を超えている。' });
      }
    });

    // 利回り7%超の合計
    var hi = plan.filter(function (h) { return h.yield > th.highYieldLine; });
    var hiSum = hi.reduce(function (s, h) { return s + h.weight; }, 0);
    if (hiSum > th.highYieldBudget) {
      out.push({
        level: 'bad',
        text: '利回り' + th.highYieldLine + '%超の銘柄（' + hi.map(function (h) { return h.ticker; }).join('・') +
          '）の合計が ' + hiSum + '%。上限は ' + th.highYieldBudget + '%。'
      });
    }

    // 減配の予兆
    plan.forEach(function (h) {
      if (h.cfCover && h.cfCover < th.cfCoverWarn) {
        out.push({ level: 'bad', ticker: h.ticker, text: h.ticker + '：営業CF÷配当が ' + h.cfCover.toFixed(2) + '。1.0割れは減配の予兆。' });
      }
      if (h.payout && h.payout > th.payoutWarn) {
        out.push({
          level: 'warn', ticker: h.ticker,
          text: h.ticker + '：配当性向 ' + h.payout + '%' + (h.isReit ? '（AFFOベース）' : '') + 'が警戒線 ' + th.payoutWarn + '% 超。'
        });
      }
    });

    // 目標配分からのズレ（買い増しで直す）
    if (total > 0) {
      rs.forEach(function (r) {
        if (Math.abs(r.drift) >= th.driftWarn) {
          out.push({
            level: 'warn', ticker: r.ticker,
            text: r.ticker + ' が目標 ' + r.target + '% に対して ' + r.actual.toFixed(1) + '%（' +
              (r.drift > 0 ? '+' : '') + r.drift.toFixed(1) + 'pt）。売らずに買い増しで寄せる。'
          });
        }
      });
    }

    // 配分の合計
    var wsum = plan.reduce(function (s, h) { return s + h.weight; }, 0);
    if (Math.abs(wsum - 100) > 0.01) {
      out.push({ level: 'warn', text: '配分の合計が ' + wsum + '%。100%になるように直す。' });
    }

    // つみたてのスプレッド
    if (settings.buyMode === 'auto') {
      out.push({
        level: 'info',
        text: 'つみたてでの買付はスプレッド ' + P.costs.spreadAutoBuy + '%。立会時間内に手動で発注すれば ' +
          P.costs.spreadInHours + '% になる（差額は試算タブの一番下で確認できる）。'
      });
    }
    if (settings.account !== 'nisa') {
      out.push({ level: 'warn', text: '特定口座で計算している。NISA成長投資枠なら手取りが約2割増える。' });
    }
    return out;
  }

  /* ---------- 買付の記録 ---------- */

  function getLog() { return log; }

  /* 今月の買付を記録する。取得額と評価額の両方に足す（買った直後は同じ額なので）。 */
  function recordBuys(items, date) {
    var d = date || new Date().toISOString().slice(0, 10);
    items.forEach(function (it) {
      if (!it.amount) return;
      var p = pos(it.ticker);
      setPos(it.ticker, { value: p.value + it.amount, cost: p.cost + it.amount });
      log.push({ date: d, ticker: it.ticker, amount: it.amount });
    });
    save(KEY_LOG, log);
  }
  function removeLog(index) {
    var it = log[index];
    if (!it) return;
    var p = pos(it.ticker);
    setPos(it.ticker, { value: Math.max(0, p.value - it.amount), cost: Math.max(0, p.cost - it.amount) });
    log.splice(index, 1);
    save(KEY_LOG, log);
  }

  /* ---------- 書き出し・取り込み ---------- */

  function exportAll() {
    return JSON.stringify({
      app: 'dividend', version: 1, savedAt: new Date().toISOString(),
      settings: settings, positions: positions, plan: plan, log: log, checks: checks
    }, null, 2);
  }
  function importAll(text) {
    var o = JSON.parse(text);
    if (!o || o.app !== 'dividend') throw new Error('このアプリのファイルではありません');
    if (o.settings) { settings = Object.assign(defaults(), o.settings); save(KEY_SET, settings); }
    if (o.positions) { positions = o.positions; save(KEY_POS, positions); }
    if (o.plan && o.plan.length) { plan = o.plan; save(KEY_PLAN, plan); }
    if (o.log) { log = o.log; save(KEY_LOG, log); }
    if (o.checks) { checks = o.checks; save(KEY_CHK, checks); }
  }
  function resetAll() {
    [KEY_SET, KEY_POS, KEY_PLAN, KEY_LOG, KEY_CHK].forEach(function (k) { localStorage.removeItem(k); });
    load();
    if (changed) changed();
  }

  load();

  global.Store = {
    plan: P,
    onChange: onChange,
    getSettings: getSettings, setSettings: setSettings,
    getPlan: getPlan, setPlan: setPlan,
    getChecks: getChecks, toggleCheck: toggleCheck,
    pos: pos, setPos: setPos,
    rows: rows, summary: summary, planYield: planYield,
    netRate: netRate, netRateAvg: netRateAvg,
    buyCostPct: buyCostPct, buyCostParts: buyCostParts,
    buyPlan: buyPlan, calendar: calendar,
    simulate: simulate, scenarios: scenarios,
    alerts: alerts,
    getLog: getLog, recordBuys: recordBuys, removeLog: removeLog,
    exportAll: exportAll, importAll: importAll, resetAll: resetAll
  };

})(window);

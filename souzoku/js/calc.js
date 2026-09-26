/* calc.js — 売却シミュレーションの計算。画面にも保存にも触れない純粋な関数だけ。
 *
 * 金額はすべて円（整数）で扱い、画面の入力（万円）との変換は app.js 側でする。
 * 制度の数字は2026年9月時点。改正があったらこのファイルの定数だけを直す。
 * tests/calc.test.js を node で実行して確かめられる。
 */
(function (root) {
  'use strict';

  var RATE_LONG = 0.20315;   // 所有5年超（所得税15%＋復興特別所得税0.315%＋住民税5%）
  var RATE_SHORT = 0.39630;  // 所有5年以下（同30%＋0.63%＋9%）
  var AKIYA_LIMIT_PRICE = 100000000;   // 空き家特例：売却代金1億円以下
  var AKIYA_SYSTEM_END = '2027-12-31'; // 空き家特例：制度の適用期限（延長されることがある）
  var LOWCOST_PRICE = 8000000;         // 低廉な空家等の媒介特例：800万円以下
  var LOWCOST_FEE_CAP = 330000;        // 同：30万円＋消費税

  /* 仲介手数料の上限（宅建業法の報酬規程、消費税10%込み）。
     800万円以下の空き家等は、2024年7月からの特例で上限33万円（事前の合意が前提）。 */
  function brokerFee(price, vacant) {
    if (price <= 0) return 0;
    if (vacant && price <= LOWCOST_PRICE) return LOWCOST_FEE_CAP;
    var base;
    if (price <= 2000000) base = price * 0.05;
    else if (price <= 4000000) base = price * 0.04 + 20000;
    else base = price * 0.03 + 60000;
    return Math.floor(base * 1.1);
  }

  /* 不動産の譲渡契約書の印紙税（軽減措置後、2027年3月31日までに作成するもの）。 */
  function stampTax(price) {
    if (price <= 100000) return 200;
    if (price <= 500000) return 200;
    if (price <= 1000000) return 500;
    if (price <= 5000000) return 1000;
    if (price <= 10000000) return 5000;
    if (price <= 50000000) return 10000;
    if (price <= 100000000) return 30000;
    if (price <= 500000000) return 60000;
    return 160000;
  }

  /* 長期か短期か。相続した不動産は、亡くなった人の取得日を引き継ぐ。
     売った年の1月1日時点で所有5年超なら長期。年だけで判定すると
     「売った年 − 取得した年 ≥ 6」なら確実に長期、5以下なら短期になる。 */
  function isLongTerm(acqYear, saleYear) {
    if (!acqYear) return true; // わからない＝かなり前に買った、とみなす（画面で説明する）
    return saleYear - acqYear >= 6;
  }

  /* 相続開始日から、空き家特例で売らなければならない期限を出す。
     「相続開始日から3年を経過する日の属する年の12月31日」と、制度の期限の早いほう。 */
  function akiyaDeadline(deathISO) {
    if (!deathISO) return AKIYA_SYSTEM_END;
    var y = Number(deathISO.slice(0, 4)) + 3;
    var byRule = y + '-12-31';
    return byRule < AKIYA_SYSTEM_END ? byRule : AKIYA_SYSTEM_END;
  }

  /* 空き家特例の要件チェック。満たさない理由を日本語で返す。 */
  function akiyaCheck(inp) {
    var reasons = [];
    if (inp.kind !== 'house') reasons.push('戸建て（区分所有でない家）であること');
    if (inp.builtBefore1981 !== true) reasons.push('昭和56年（1981年）5月31日以前に建てた古い家であること');
    if (inp.livedAlone !== true) reasons.push('親が亡くなるまで、この家に一人で住んでいたこと（同居の家族がいない）');
    if (inp.unusedAfter !== true) reasons.push('相続してから、ずっと空き家のままであること（住む・貸す・お店などに使うはNG）');
    if (inp.renovateOrDemolish !== true) reasons.push('売るときに、取り壊すか耐震リフォームをすること（買った人が売った翌年2月15日までにする場合も含む）');
    if (inp.price > AKIYA_LIMIT_PRICE) reasons.push('売却代金が1億円以下であること');
    var deadline = akiyaDeadline(inp.deathISO);
    if (inp.saleISO && inp.saleISO > deadline) reasons.push(deadline.replace(/-/g, '/') + ' までに売ること');
    return { ok: reasons.length === 0, reasons: reasons, deadline: deadline };
  }

  /* 譲渡所得税（相続人ごとに等分した持分で計算して合計する）。
     空き家特例の控除は相続人1人ごと。3人以上で相続したら1人2,000万円。 */
  function capitalGainsTax(gainTotal, heirs, exemptionOn, longTerm) {
    if (gainTotal <= 0) return { tax: 0, taxable: 0, exemptionEach: 0 };
    var n = Math.max(1, heirs | 0);
    var exEach = exemptionOn ? (n >= 3 ? 20000000 : 30000000) : 0;
    var share = gainTotal / n;
    var taxableEach = Math.max(0, share - exEach);
    taxableEach = Math.floor(taxableEach / 1000) * 1000; // 千円未満切り捨て
    var rate = longTerm ? RATE_LONG : RATE_SHORT;
    var taxEach = Math.floor(taxableEach * rate / 100) * 100;
    return { tax: taxEach * n, taxable: taxableEach * n, exemptionEach: exEach };
  }

  /* 手取りの計算の本体。
     inp: { price, acqKnown, acqPrice, acqYear（不明なら0）, heirs, kind, vacant, otherCost,
            builtBefore1981, livedAlone, unusedAfter, renovateOrDemolish,
            deathISO, saleISO, holdTaxYear, holdOtherYear } */
  function takeHome(inp, useExemption) {
    var price = Math.max(0, Math.round(inp.price || 0));
    var acq = inp.acqKnown ? Math.max(0, Math.round(inp.acqPrice || 0)) : 0;
    var roughAcq = Math.floor(price * 0.05);          // 概算取得費：売却価格の5%
    var acqUsed = Math.max(acq, roughAcq);            // 実額が5%より小さいときも5%を使える
    var fee = brokerFee(price, !!inp.vacant);
    var stamp = stampTax(price);
    var other = Math.max(0, Math.round(inp.otherCost || 0));
    var saleYear = Number((inp.saleISO || '').slice(0, 4)) || new Date().getFullYear();
    var longTerm = isLongTerm(inp.acqYear || 0, saleYear);
    var gain = price - acqUsed - fee - stamp - other;
    var t = capitalGainsTax(gain, inp.heirs, !!useExemption, longTerm);
    var net = price - fee - stamp - other - t.tax;
    return {
      price: price, fee: fee, stamp: stamp, other: other,
      acqUsed: acqUsed, acqRough: acqUsed === roughAcq && acq < roughAcq,
      gain: Math.max(0, gain), tax: t.tax, longTerm: longTerm,
      exemptionEach: t.exemptionEach, net: net,
      perHeir: Math.floor(net / Math.max(1, inp.heirs | 0))
    };
  }

  function estimate(inp) {
    var check = akiyaCheck(inp);
    var withEx = check.ok ? takeHome(inp, true) : null;
    var without = takeHome(inp, false);
    var main = withEx || without;
    var lo = takeHome(Object.assign({}, inp, { price: inp.price * 0.9 }), check.ok);
    var hi = takeHome(Object.assign({}, inp, { price: inp.price * 1.1 }), check.ok);
    var holdYear = Math.max(0, Math.round(inp.holdTaxYear || 0)) + Math.max(0, Math.round(inp.holdOtherYear || 0));
    return {
      main: main,
      without: without,
      exemptionApplied: check.ok,
      akiya: check,
      rangeLow: lo.net,
      rangeHigh: hi.net,
      hold10: holdYear * 10,
      holdYear: holdYear
    };
  }

  var api = {
    brokerFee: brokerFee, stampTax: stampTax, isLongTerm: isLongTerm,
    akiyaDeadline: akiyaDeadline, akiyaCheck: akiyaCheck,
    capitalGainsTax: capitalGainsTax, takeHome: takeHome, estimate: estimate,
    RATE_LONG: RATE_LONG, RATE_SHORT: RATE_SHORT
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TGCalc = api;
})(this);

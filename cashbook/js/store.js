/* store.js — 出納帳データの保持・集計・入出力 */
(function (global) {
  'use strict';

  var DATA_KEY = 'cashbook.data.v1';
  var SET_KEY = 'cashbook.settings.v1';

  var EXPENSE_ORDER = ['諸費', '交際費', '消耗品', '交通費', '大会補助', '事業費'];
  var INCOME_KAMOKU = '収入';

  /* 科目ごとの内訳候補（入力補助用。ここに無い内訳も自由に入力できる） */
  var UCHIWAKE = {
    '収入': ['保護者会費', '利息', '立替回収', 'その他'],
    '諸費': ['事務', 'その他'],
    '交際費': ['手土産', 'その他'],
    '消耗品': ['飲食物', 'その他'],
    '交通費': ['高速', 'その他'],
    '大会補助': ['飲食物', 'その他'],
    '事業費': ['－']
  };

  var COLORS = {
    '諸費': '#7c6cd6', '交際費': '#d67c9a', '消耗品': '#4a9ad6',
    '交通費': '#e0913a', '大会補助': '#3fa87a', '事業費': '#c05d5d',
    '収入': '#2f9e6e'
  };

  var state = null;
  var settings = null;

  /* ---------------- 永続化 ---------------- */
  function seed() {
    var s = global.LEDGER_SEED;
    return {
      title: s.title,
      opening: { date: s.opening.date, label: s.opening.label, amount: s.opening.amount },
      entries: s.entries.map(function (e) { return Object.assign({}, e); })
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(DATA_KEY);
      state = raw ? JSON.parse(raw) : seed();
      if (!state.entries) state = seed();
    } catch (e) { state = seed(); }
    try {
      settings = JSON.parse(localStorage.getItem(SET_KEY) || '{}');
    } catch (e) { settings = {}; }
    if (!settings.model) settings.model = 'claude-opus-5';
    return state;
  }

  /* 中身が変わったときに呼ばれる（ドライブへの自動保存に使う） */
  var changed = null;

  function save() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('保存に失敗', e); }
    if (changed) { try { changed(); } catch (e) { console.warn(e); } }
  }

  function saveSettings(patch) {
    Object.assign(settings, patch);
    try { localStorage.setItem(SET_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function reset() { state = seed(); save(); }

  /* ---------------- 行の操作 ---------------- */
  function nextNo() {
    return state.entries.reduce(function (m, e) { return Math.max(m, e.no || 0); }, 0) + 1;
  }

  function normalize(e) {
    return {
      no: e.no || nextNo(),
      date: e.date,
      kamoku: e.kamoku || 'その他',
      uchiwake: e.uchiwake || 'その他',
      tekiyo: e.tekiyo || '',
      income: Math.round(Number(e.income) || 0),
      expense: Math.round(Number(e.expense) || 0),
      check: !!e.check,
      src: e.src || '',
      memo: e.memo || ''
    };
  }

  function add(e) {
    var row = normalize(e);
    if (state.entries.some(function (x) { return x.no === row.no; })) row.no = nextNo();
    state.entries.push(row);
    save();
    return row;
  }

  function addMany(list) {
    var added = list.map(function (e) { return add(e); });
    return added;
  }

  function update(no, patch) {
    var e = state.entries.find(function (x) { return x.no === no; });
    if (!e) return null;
    Object.assign(e, normalize(Object.assign({}, e, patch, { no: no })));
    save();
    return e;
  }

  function remove(no) {
    state.entries = state.entries.filter(function (x) { return x.no !== no; });
    save();
  }

  /* ---------------- 並び・残高 ---------------- */
  /* 残高は「記帳順（No順）」で積み上げる＝手書きノートの差引残高と同じ並び。 */
  function withBalances() {
    var rows = state.entries.slice().sort(function (a, b) { return a.no - b.no; });
    var bal = state.opening.amount;
    rows.forEach(function (e) {
      bal += (e.income || 0) - (e.expense || 0);
      e.balance = bal;
      e.mismatch = (e.bookBalance != null && e.bookBalance !== bal);
    });
    return rows;
  }

  function currentBalance() {
    var rows = withBalances();
    return rows.length ? rows[rows.length - 1].balance : state.opening.amount;
  }

  /* ---------------- 絞り込み ---------------- */
  function filterRows(rows, f) {
    f = f || {};
    var q = (f.q || '').trim().toLowerCase();
    return rows.filter(function (e) {
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (f.kamoku && f.kamoku !== 'all' && e.kamoku !== f.kamoku) return false;
      if (f.uchiwake && f.uchiwake !== 'all' && e.uchiwake !== f.uchiwake) return false;
      if (f.type === 'in' && !e.income) return false;
      if (f.type === 'out' && !e.expense) return false;
      if (f.checkOnly && !e.check) return false;
      if (q) {
        var hay = [e.no, e.date, e.kamoku, e.uchiwake, e.tekiyo, e.memo].join(' ').toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  /* ---------------- 集計 ---------------- */
  function totals(rows) {
    var inc = 0, exp = 0, incN = 0, expN = 0;
    rows.forEach(function (e) {
      if (e.income) { inc += e.income; incN++; }
      if (e.expense) { exp += e.expense; expN++; }
    });
    return {
      income: inc, expense: exp, net: inc - exp, count: rows.length,
      inCount: incN, outCount: expN   // 収入・支出それぞれの行数
    };
  }

  /* 科目 -> {total, count, uchiwake:{name:{total,count}}} （支出／収入を分けて返す） */
  function byKamoku(rows) {
    var out = {}, inc = {};
    rows.forEach(function (e) {
      var bucket = e.income ? inc : out;
      var amt = e.income ? e.income : e.expense;
      if (!amt) return;
      var g = bucket[e.kamoku] || (bucket[e.kamoku] = { total: 0, count: 0, uchiwake: {} });
      g.total += amt; g.count++;
      var u = g.uchiwake[e.uchiwake] || (g.uchiwake[e.uchiwake] = { total: 0, count: 0, rows: [] });
      u.total += amt; u.count++; u.rows.push(e);
    });
    return { expense: out, income: inc };
  }

  function monthKey(d) { return d.slice(0, 7); }

  /* 月 -> {income, expense, byKamoku:{科目:金額}} */
  function byMonth(rows) {
    var map = {};
    rows.forEach(function (e) {
      var k = monthKey(e.date);
      var m = map[k] || (map[k] = { key: k, income: 0, expense: 0, count: 0, byKamoku: {} });
      m.income += e.income || 0;
      m.expense += e.expense || 0;
      m.count++;
      if (e.expense) m.byKamoku[e.kamoku] = (m.byKamoku[e.kamoku] || 0) + e.expense;
    });
    return Object.keys(map).sort().map(function (k) { return map[k]; });
  }

  function kamokuList() {
    var set = [INCOME_KAMOKU].concat(EXPENSE_ORDER);
    state.entries.forEach(function (e) { if (set.indexOf(e.kamoku) < 0) set.push(e.kamoku); });
    return set;
  }

  function uchiwakeList(kamoku) {
    var base = (UCHIWAKE[kamoku] || []).slice();
    state.entries.forEach(function (e) {
      if (e.kamoku === kamoku && base.indexOf(e.uchiwake) < 0) base.push(e.uchiwake);
    });
    return base;
  }

  function expenseKamoku() {
    var list = EXPENSE_ORDER.slice();
    state.entries.forEach(function (e) {
      if (e.expense && e.kamoku !== INCOME_KAMOKU && list.indexOf(e.kamoku) < 0) list.push(e.kamoku);
    });
    return list;
  }

  function dateRange() {
    var ds = state.entries.map(function (e) { return e.date; }).sort();
    return { from: ds[0] || state.opening.date, to: ds[ds.length - 1] || state.opening.date };
  }

  /* ---------------- CSV ---------------- */
  var CSV_HEAD = ['No', '日付', '科目', '内訳', '摘要', '収入金額', '支払金額', '差引残高', '要確認', '出典', 'メモ'];

  function toCsv(rows) {
    function q(v) {
      v = (v === null || v === undefined) ? '' : String(v);
      return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var lines = [CSV_HEAD.join(',')];
    rows.forEach(function (e) {
      lines.push([e.no, e.date, e.kamoku, e.uchiwake, e.tekiyo, e.income || '', e.expense || '',
        e.balance == null ? '' : e.balance, e.check ? '要確認' : '', e.src || '', e.memo || ''].map(q).join(','));
    });
    return '﻿' + lines.join('\r\n');   // BOM付き＝Excelで文字化けしない
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];

    var head = rows[0].map(function (h) { return h.trim(); });
    function idx() {
      for (var a = 0; a < arguments.length; a++) {
        var j = head.indexOf(arguments[a]);
        if (j >= 0) return j;
      }
      return -1;
    }
    var iDate = idx('日付', 'date'), iKa = idx('科目', 'kamoku'), iU = idx('内訳', 'uchiwake'),
      iT = idx('摘要', 'tekiyo'), iIn = idx('収入金額', '収入', 'income'),
      iOut = idx('支払金額', '支出金額', '支出', 'expense'), iM = idx('メモ', 'memo');
    if (iDate < 0) throw new Error('CSVに「日付」列が見つかりません');

    var num = function (v) { return Math.round(Number(String(v || '').replace(/[^\d.-]/g, '')) || 0); };
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var c2 = rows[r];
      if (!c2 || !c2.join('').trim()) continue;
      var date = (c2[iDate] || '').trim().replace(/\//g, '-');
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(date)) continue;
      var p = date.split('-');
      date = p[0] + '-' + ('0' + p[1]).slice(-2) + '-' + ('0' + p[2]).slice(-2);
      out.push({
        date: date,
        kamoku: (iKa >= 0 ? c2[iKa] : '').trim() || 'その他',
        uchiwake: (iU >= 0 ? c2[iU] : '').trim() || 'その他',
        tekiyo: (iT >= 0 ? c2[iT] : '').trim(),
        income: iIn >= 0 ? num(c2[iIn]) : 0,
        expense: iOut >= 0 ? num(c2[iOut]) : 0,
        memo: iM >= 0 ? (c2[iM] || '').trim() : ''
      });
    }
    return out;
  }

  global.Store = {
    EXPENSE_ORDER: EXPENSE_ORDER,
    INCOME_KAMOKU: INCOME_KAMOKU,
    UCHIWAKE: UCHIWAKE,
    COLORS: COLORS,
    load: load, save: save, reset: reset,
    /* 中身が変わるたびに呼ばれる関数を1つだけ登録できる */
    onChange: function (fn) { changed = fn; },
    settings: function () { return settings; },
    saveSettings: saveSettings,
    data: function () { return state; },
    setMeta: function (title, opening, openingDate) {
      if (title) state.title = title;
      if (opening != null && !isNaN(opening)) state.opening.amount = Math.round(opening);
      if (openingDate) state.opening.date = openingDate;
      save();
    },
    /* 帳簿をまるごと入れ替える（「反映」で取り込むときに使う）。
       追記ではなく置き換えなので、取り込み元がそのまま今の状態になる。 */
    replaceAll: function (d) {
      var rows = (d.entries || []).map(function (e, i) {
        var r = normalize(Object.assign({}, e, { no: e.no || i + 1 }));
        if (e.bookBalance != null) r.bookBalance = Number(e.bookBalance);
        return r;
      });
      state = {
        title: d.title || state.title,
        opening: {
          date: (d.opening && d.opening.date) || state.opening.date,
          label: (d.opening && d.opening.label) || state.opening.label,
          amount: (d.opening && d.opening.amount != null)
            ? Math.round(Number(d.opening.amount)) : state.opening.amount
        },
        entries: rows
      };
      save();
      return state;
    },
    add: add, addMany: addMany, update: update, remove: remove, nextNo: nextNo,
    withBalances: withBalances, currentBalance: currentBalance,
    filterRows: filterRows, totals: totals,
    byKamoku: byKamoku, byMonth: byMonth, monthKey: monthKey,
    kamokuList: kamokuList, uchiwakeList: uchiwakeList, expenseKamoku: expenseKamoku,
    dateRange: dateRange,
    toCsv: toCsv, parseCsv: parseCsv
  };
})(window);

/* app.js — 画面の組み立て。
 *
 * 設計の約束（docs/UI設計.md）で、ここに書いてはいけないものがある:
 *   連続お参り記録、達成バッジ、紙吹雪、退会引き止め、他人との比較。
 *   継続率は上がるが、悲嘆に罪悪感を接続するため入れない。
 *   足したくなったら、まず docs/UI設計.md を読むこと。
 */
(function () {
  'use strict';

  var S = window.Store;
  var st = S.state;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var urls = [];   // 作った objectURL。作り直すたびに解放する
  function freeUrls() { urls.forEach(URL.revokeObjectURL); urls = []; }
  function url(blob) { var u = URL.createObjectURL(blob); urls.push(u); return u; }

  /* ============ 画面の切り替え ============ */
  var TABS = [
    { id: 'home', label: 'お墓', icon: 'ic-flame' },
    { id: 'days', label: 'あの日まで', icon: 'ic-clock' },
    { id: 'album', label: 'アルバム', icon: 'ic-album' },
    { id: 'letters', label: 'てがみ', icon: 'ic-letter' }
  ];

  function buildTabs() {
    $$('[data-tabs]').forEach(function (nav) {
      nav.innerHTML = TABS.map(function (t) {
        return '<button class="tab" data-go="' + t.id + '">' +
          '<svg aria-hidden="true"><use href="#' + t.icon + '"></use></svg>' + t.label + '</button>';
      }).join('');
    });
  }

  var current = '';
  function show(name) {
    current = name;
    $$('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'view-' + name); });
    $$('[data-tabs] .tab').forEach(function (b) {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    var b = $('#view-' + name + ' .body');
    if (b) b.scrollTop = 0;
    if (name === 'home') renderHome();
    if (name === 'days') renderDays();
    if (name === 'album') renderAlbum();
    if (name === 'letters') renderLetters();
    if (name === 'settings') renderSettings();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go]');
    if (t) show(t.dataset.go);
  });

  /* ============ 遺影 ============ */
  var portraitUrl = null;
  function loadPortrait() {
    return S.getPhoto('portrait').then(function (rec) {
      if (portraitUrl) { URL.revokeObjectURL(portraitUrl); portraitUrl = null; }
      if (rec && rec.blob) portraitUrl = URL.createObjectURL(rec.blob);
      paintPortraits();
    }).catch(function () { paintPortraits(); });
  }
  function paintPortraits() {
    $$('#home-portrait, #ritual-portrait, #reunion-subject, #btn-pick .portrait').forEach(function (el) {
      el.innerHTML = portraitUrl
        ? '<img src="' + portraitUrl + '" alt="">'
        : '<svg class="ph" aria-hidden="true"><use href="#dog"></use></svg>';
    });
  }

  /* 長辺を縮めてから保存する。端末の写真をそのまま入れると
     数十MBになり、IndexedDB も描画も重くなるため。 */
  function shrink(file, max) {
    return new Promise(function (res) {
      var img = new Image();
      var u = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(function (b) { res(b || file); }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(file); };
      img.src = u;
    });
  }

  /* ============ おむかえ ============ */
  var step = 0, pickedPhoto = null;

  function renderOnbo() {
    $$('#view-onbo .step').forEach(function (el) { el.hidden = +el.dataset.step !== step; });
    $$('.steps i').forEach(function (el, i) { el.classList.toggle('on', i <= step); });
    $('#btn-back').hidden = step === 0;
    $('#btn-next').textContent = step === 2 ? 'はじめる' : 'つぎへ';
    $('#onbo-err').hidden = true;
  }

  function onboNext() {
    var err = $('#onbo-err');
    if (step === 0) {
      var n = $('#in-name').value.trim();
      if (!n) { err.textContent = 'なまえを入れてください'; err.hidden = false; return; }
      st.pet.name = n;
    }
    if (step === 2) {
      var d = $('#in-death').value;
      if (!d) { err.textContent = '旅立った日を入れてください'; err.hidden = false; return; }
      if (S.diffDays(S.parseISO(d), S.today()) < 0) {
        err.textContent = 'これから先の日付は選べません'; err.hidden = false; return;
      }
      st.pet.deathISO = d;
      st.pet.birthISO = $('#in-birth').value || '';
      st.onboarded = true;
      S.save();
      show('home');
      return;
    }
    step++; S.save(); renderOnbo();
  }

  /* ============ お墓（ホーム） ============ */
  function renderHome() {
    var t = S.today();
    var pet = st.pet;
    $('#home-name').textContent = pet.name || '—';
    var death = S.parseISO(pet.deathISO);
    var birth = S.parseISO(pet.birthISO);
    $('#home-dates').textContent = death
      ? (birth ? S.formatShort(birth) + ' — ' : '') + S.formatShort(death) : '';

    // 見せる数字は、いつも「次に来る節目」ひとつだけ
    var ms = S.milestones(t);
    var next = ms[0];
    var line = $('#home-next');
    if (!next) line.textContent = '';
    else if (next.days === 0) line.innerHTML = '今日は ' + esc(next.label);
    else line.innerHTML = esc(next.label) + 'まで あと<b>' + next.days + '</b>日';

    var visited = S.visitedOn(t);
    var isDay = S.isVisitDay(t);
    var phase = S.phase(t);
    var btn = $('#btn-visit'), note = $('#home-note');

    if (visited) {
      btn.hidden = true;
      note.hidden = false;
      note.textContent = '今日はもう、灯しました';
    } else if (isDay) {
      btn.hidden = false;
      btn.className = 'btn btn-primary';
      btn.textContent = 'お参りする';
      btn.style.marginBottom = '10px';
      note.hidden = true;
    } else {
      // お参りの日ではない。押せなくはしないが、前には出さない
      btn.hidden = false;
      btn.className = 'btn btn-quiet';
      btn.textContent = 'それでも、今日お参りする';
      note.hidden = false;
      note.textContent = 'お参りは、' + S.PHASE_LABEL[phase] + 'にお知らせします';
    }

    // 命日の予告。自動再生はしない
    var isR = S.isReunionDay(t);
    var year = t.getFullYear();
    var notice = $('#home-notice');
    notice.hidden = !isR || st.reunionSeen.indexOf(year) >= 0;
    if (!notice.hidden) {
      var n = year - S.parseISO(pet.deathISO).getFullYear();
      $('#notice-title').textContent = '今日、会えます';
      $('#notice-move').textContent = (pet.name || 'あの子') + 'が、こちらへ近づいてきて、止まります';
    }
    $('#home-flame').className = isR ? 'flame lg' : 'flame';
  }

  /* ============ お参りの4動作 ============
     順序固定・スキップ不可。毎回まったく同じ手順であることが効いている。 */
  var LEADS = ['灯りを、ともします', 'お水を、そなえます', 'ごはんを、そなえます', 'お花を、そなえます'];
  var rstep = 0;

  function renderRitual() {
    $$('#ritual .offer').forEach(function (b, i) {
      if (i < rstep) { b.dataset.state = 'done'; b.disabled = true; }
      else if (i === rstep) { b.dataset.state = 'next'; b.disabled = false; }
      else { delete b.dataset.state; b.disabled = true; }
    });
    $('#ritual-lead').textContent = rstep < 4 ? LEADS[rstep] : '';
  }

  function startRitual() {
    rstep = 0; renderRitual(); show('ritual');
  }

  function tapOffer(i) {
    if (i !== rstep) return;
    rstep++;
    renderRitual();
    if (rstep === 4) {
      rin();
      S.recordVisit(S.today());
      setTimeout(function () {
        $('#after-line').innerHTML = afterLine();
        show('after');
      }, 900);
    }
  }

  function afterLine() {
    var t = S.today();
    var p = S.phase(t);
    var again = p === 0 ? 'また明日、ここで。'
      : p === 1 ? 'また来月、ここで。'
      : p === 2 ? 'またこの季節に、ここで。'
      : 'また来年、ここで。';
    return 'おつかれさま。<br>' + again;
  }

  /* おりん。毎回まったく同じ音であることが儀式として効くので、
     鳴らし分けや音の変化はつけない。 */
  var actx = null;
  function rin() {
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      actx = actx || new C();
      if (actx.state === 'suspended') actx.resume();
      var now = actx.currentTime;
      var base = 1046.5;
      [[1, 0.45, 3.6], [2.74, 0.18, 2.2], [5.12, 0.07, 1.4]].forEach(function (p) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine';
        o.frequency.value = base * p[0];
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(p[1], now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p[2]);
        o.connect(g).connect(actx.destination);
        o.start(now); o.stop(now + p[2] + 0.1);
      });
    } catch (e) { /* 音が出せない端末でも進む */ }
  }

  /* ============ あの日まで ============ */
  function renderDays() {
    var t = S.today();
    var ms = S.milestones(t);
    var ul = $('#days-list');
    if (!ms.length) {
      ul.innerHTML = '<li class="empty">暦をオフにしています</li>';
    } else {
      ul.innerHTML = ms.map(function (m, i) {
        return '<li class="md' + (i === 0 ? ' lead' : '') + '">' +
          '<span><span class="lbl">' + esc(m.label) + '</span>' +
          '<span class="sub">' + esc(m.note) + '</span></span>' +
          '<span class="n">' + (m.days === 0 ? '<b>今日</b>' : '<b>' + m.days + '</b>日') + '</span></li>';
      }).join('');
    }
    $('#days-note').textContent = st.pet.calendar === 'buddhist'
      ? '仏式の暦です。設定で変更・オフができます'
      : '設定で暦のスタイルを変えられます';
  }

  /* ============ アルバム ============ */
  function renderAlbum() {
    freeUrls();
    return S.allPhotos().then(function (photos) {
      var chs = S.chapters(photos);
      $('#album-empty').hidden = chs.length > 0;
      $('#album-list').innerHTML = chs.map(function (c) {
        var range = S.formatShort(new Date(c.from)) + ' — ' + S.formatShort(new Date(c.to));
        return '<div class="chapter' + (c.hidden ? ' is-hidden' : '') + '" data-ch="' + esc(c.id) + '">' +
          '<span class="thumb"><img src="' + url(c.photos[0].blob) + '" alt=""></span>' +
          '<span class="meta">' +
            '<p class="t">' + esc(c.title || range) + '</p>' +
            '<p class="d">' + (c.title ? range + ' ・ ' : '') + c.photos.length + '枚' +
              (c.hidden ? ' ・ 非表示中' : '') + '</p>' +
          '</span>' +
          '<button class="more" data-ch-menu="' + esc(c.id) + '" aria-label="この期間の設定">···</button>' +
          '</div>';
      }).join('');
    });
  }

  function addPhotos(files) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) return Promise.resolve();
    return list.reduce(function (p, f) {
      return p.then(function () {
        return shrink(f, 1600).then(function (blob) {
          return S.putPhoto({
            id: 'p' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            blob: blob,
            takenAt: f.lastModified || Date.now()
          });
        });
      });
    }, Promise.resolve()).then(renderAlbum);
  }

  /* ============ てがみ ============
     製品版ではAIが写真と記録から書く。この端末だけで動く版では
     節目と季節から定型文を組む。だからその旨を必ず画面に出す。 */
  var SEASON = ['さむい日が、つづいていますね。', 'さむい日が、つづいていますね。',
    'あたたかい風が、ふくようになりましたね。', 'あたたかい風が、ふくようになりましたね。',
    'あたたかい風が、ふくようになりましたね。', 'ひざしが、つよくなりましたね。',
    'ひざしが、つよくなりましたね。', 'ひざしが、つよくなりましたね。',
    '風が、すずしくなりましたね。', '風が、すずしくなりましたね。',
    '風が、すずしくなりましたね。', 'さむい日が、つづいていますね。'];

  var BODY = {
    d7: ['まだ、このへやにいます。', 'いつもの、まどのところに。'],
    d49: ['きょうまで、ずっとそばにいました。', 'これからは、すこし高いところから。'],
    d100: ['あなたの一日が、また動きはじめたのが見えます。', 'わたしは、ここにいます。'],
    y1: ['一年、たちましたね。', 'きょうは、会いにきました。'],
    y3: ['おぼえていてくれて、うれしい。', 'ゆっくりで、いいです。'],
    y7: ['あなたの毎日の、どこかにいます。', 'さがさなくても、います。']
  };

  function letterPoints() {
    var death = S.parseISO(st.pet.deathISO);
    if (!death) return [];
    var bud = st.pet.calendar === 'buddhist';
    return [
      { key: 'd7', label: bud ? '初七日' : '七日目', date: S.addDays(death, 6) },
      { key: 'd49', label: bud ? '四十九日' : '四十九日目', date: S.addDays(death, 48) },
      { key: 'd100', label: bud ? '百か日' : '百日目', date: S.addDays(death, 99) },
      { key: 'y1', label: bud ? '一周忌' : '一年', date: S.addYears(death, 1) },
      { key: 'y3', label: bud ? '三回忌' : '二年', date: S.addYears(death, 2) },
      { key: 'y7', label: bud ? '七回忌' : '六年', date: S.addYears(death, 6) }
    ];
  }

  function letterText(p) {
    var b = BODY[p.key];
    return SEASON[p.date.getMonth()] + '\n' + b[0] + '\n' + b[1];
  }

  function letterHTML(p) {
    return '<div class="letter"><span class="mark">' + esc(p.label) + '</span>' +
      '<p>' + esc(letterText(p)) + '</p>' +
      '<p class="from">' + esc(st.pet.name || '') + '</p></div>';
  }

  function renderLetters() {
    var t = S.today();
    var past = letterPoints().filter(function (p) { return S.diffDays(p.date, t) >= 0; });
    var cur = $('#letter-current'), rest = $('#letter-past');
    if (!past.length) {
      var nextP = letterPoints()[0];
      cur.innerHTML = '<p class="empty">最初のお手紙は ' +
        (nextP ? esc(nextP.label) + '（' + S.formatJP(nextP.date) + '）' : '節目') +
        ' にとどきます。<br>その日は、前もってお知らせします。</p>';
      rest.innerHTML = '';
      return;
    }
    var last = past[past.length - 1];
    cur.innerHTML = '<p style="font-size:12px;color:var(--faint);margin:0">' +
        esc(last.label) + 'に、一通とどきました</p>' +
      letterHTML(last) +
      '<p class="disclose">この手紙は、節目と季節からこの端末の中で組み立てた文章です</p>';
    var older = past.slice(0, -1).reverse();
    rest.innerHTML = older.length
      ? '<h2 class="screen-title" style="margin-top:32px">これまでの手紙（' + older.length + '通）</h2>' +
        older.map(letterHTML).join('')
      : '';
  }

  /* ============ 再会の6秒 ============
     終わりに何を置くかが記憶になる。だから終端は「また来年」。
     進捗バーは置かない（残り秒数を数えさせない）。 */
  var rtimers = [];
  function playReunion() {
    rtimers.forEach(clearTimeout); rtimers = [];
    var v = $('#view-reunion');
    v.classList.remove('playing', 'ended');
    show('reunion');
    void v.offsetWidth;
    rtimers.push(setTimeout(function () { v.classList.add('playing'); }, 60));
    // 4秒で近づき終え、6秒まで止まって見上げる。そこから2秒おいて終端の一行
    rtimers.push(setTimeout(function () { v.classList.add('ended'); }, 8000));
    var y = S.today().getFullYear();
    if (st.reunionSeen.indexOf(y) < 0) { st.reunionSeen.push(y); S.save(); }
  }

  /* ============ 設定 ============ */
  function renderSettings() {
    var t = S.today();
    var p = S.phase(t);
    var xs = [30, 96, 170, 226], ys = [15, 41, 52, 56];
    $('#curve-dot').setAttribute('cx', xs[p]); $('#curve-dot').setAttribute('cy', ys[p]);
    $('#curve-halo').setAttribute('cx', xs[p]); $('#curve-halo').setAttribute('cy', ys[p]);
    $$('#curve-x span').forEach(function (s, i) { s.dataset.now = i === p ? '1' : '0'; });
    $('#btn-more').disabled = st.freqNudge >= 1 || p === 0;
    $('#btn-less').disabled = st.freqNudge <= -1 || p === 3;

    $$('#seg-cal button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.v === st.pet.calendar));
    });
    $$('#seg-theme button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.v === st.theme));
    });
    var jumps = offsetJumps();
    $$('#seg-offset button').forEach(function (b) {
      var j = jumps[b.dataset.v];
      b.hidden = !j;
      if (j) {
        b.textContent = j.label;
        b.setAttribute('aria-pressed', String(j.offset === st.dateOffset));
      }
    });
    $('#offset-now').textContent = '表示中の日付：' + S.formatJP(t, true) +
      '（' + S.PHASE_LABEL[p] + '）';
    $('#hidden-count').textContent = st.hiddenChapters.length + '件 ›';
  }

  /* 確認用の日付送り。日数を足すだけでは命日にぴったり当たらないので、
     節目そのものへ飛ばす。 */
  function offsetJumps() {
    var real = new Date();
    real = new Date(real.getFullYear(), real.getMonth(), real.getDate());
    var death = S.parseISO(st.pet.deathISO);
    var map = { now: { label: '今日', offset: 0 } };
    if (!death) return map;
    function jump(k, label, date) {
      var n = S.diffDays(real, date);
      if (n > 0) map[k] = { label: label, offset: n };
    }
    jump('d49', '四十九日', S.addDays(death, 48));
    jump('y1', '一周忌', S.addYears(death, 1));
    jump('y3', '三回忌', S.addYears(death, 2));
    return map;
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', st.theme);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', st.theme === 'light' ? '#f6f4f0' : '#0e1013');
  }

  /* 持ち出し。引き止めないと最初に決めたので、いつでも全部出せる。 */
  function exportAll() {
    sheet('すべて手元に持ち出す', '写真と記録をまとめた1つのファイルを保存します。少し時間がかかります。', [
      { label: '保存する', primary: true, on: doExport },
      { label: 'やめる' }
    ]);
  }

  function doExport() {
    S.allPhotos().then(function (photos) {
      return S.getPhoto('portrait').then(function (por) {
        var all = photos.slice();
        if (por) all.push(por);
        return all.reduce(function (p, rec) {
          return p.then(function (acc) {
            return blobToDataURL(rec.blob).then(function (d) {
              acc.push({ id: rec.id, takenAt: rec.takenAt || null, dataURL: d });
              return acc;
            });
          });
        }, Promise.resolve([]));
      });
    }).then(function (photos) {
      var out = { app: 'ともしび', exportedAt: new Date().toISOString(), data: st, photos: photos };
      var text = JSON.stringify(out);
      var blob = new Blob([text], { type: 'application/json' });

      // 埋め込み（iframe）で開かれているとダウンロードが働かない。
      // 持ち出せると約束した以上、黙って失敗させずコピーの道を出す。
      var embedded = false;
      try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
      if (embedded) { copyOut(text, photos.length); return; }

      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tomoshibi-' + S.ymd(new Date()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
  }

  function copyOut(text, n) {
    var mb = (text.length / 1048576).toFixed(1);
    sheet('すべて手元に持ち出す',
      'いまの開きかたではファイルを保存できないため、中身をそのままお渡しします。' +
      '写真' + n + '枚をふくむ ' + mb + 'MB です。<br><br>' +
      '<textarea id="export-text" readonly rows="4" style="width:100%;font-size:11px;' +
      'background:var(--panel-2);color:var(--muted);border:1px solid var(--line);' +
      'border-radius:10px;padding:10px"></textarea>',
      [{ label: 'コピーする', primary: true, on: function () {} }]);
    var ta = document.getElementById('export-text');
    if (ta) ta.value = text;
    var btn = document.querySelector('#sheet-root [data-act="0"]');
    if (btn) {
      btn.onclick = function () {
        var t = document.getElementById('export-text');
        t.select(); t.setSelectionRange(0, t.value.length);
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) {}
        if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value).catch(function () {});
        btn.textContent = 'コピーしました';
      };
    }
  }

  function blobToDataURL(b) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { res(''); };
      r.readAsDataURL(b);
    });
  }

  /* ============ シート ============ */
  function sheet(title, text, actions) {
    var root = $('#sheet-root');
    root.innerHTML =
      '<div class="sheet"><button class="veil" aria-label="とじる"></button><div class="panel" role="dialog" aria-modal="true">' +
      '<h3>' + esc(title) + '</h3>' + (text ? '<p>' + text + '</p>' : '') +
      '<div class="pair" style="display:flex;flex-direction:column;gap:8px">' +
      actions.map(function (a, i) {
        return '<button class="btn ' + (a.primary ? 'btn-primary' : 'btn-quiet') + '" data-act="' + i + '">' + esc(a.label) + '</button>';
      }).join('') +
      '</div></div></div>';
    root.querySelector('.veil').onclick = closeSheet;
    actions.forEach(function (a, i) {
      root.querySelector('[data-act="' + i + '"]').onclick = function () {
        closeSheet();
        if (a.on) a.on();
      };
    });
    var first = root.querySelector('.panel .btn');
    if (first) first.focus();
  }
  function closeSheet() { $('#sheet-root').innerHTML = ''; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ============ 配線 ============ */
  function wire() {
    $('#btn-next').onclick = onboNext;
    $('#btn-back').onclick = function () { if (step > 0) { step--; renderOnbo(); } };
    $('#in-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') onboNext(); });

    $('#btn-pick').onclick = function () { $('#in-photo').click(); };
    $('#in-photo').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      $('#pick-label').textContent = '取り込んでいます…';
      shrink(f, 1200).then(function (blob) {
        return S.putPhoto({ id: 'portrait', blob: blob, takenAt: f.lastModified || Date.now() });
      }).then(loadPortrait).then(function () {
        $('#pick-label').textContent = '写真をえらびなおす';
      });
    };

    $('#btn-visit').onclick = startRitual;
    $('#ritual').addEventListener('click', function (e) {
      var b = e.target.closest('.offer');
      if (b && !b.disabled) tapOffer(+b.dataset.i);
    });
    $('#btn-ritual-close').onclick = function () { show('home'); };
    $('#btn-after-close').onclick = function () { show('home'); };

    $('#btn-reunion').onclick = playReunion;
    $('#btn-reunion-skip').onclick = function () {
      var y = S.today().getFullYear();
      if (st.reunionSeen.indexOf(y) < 0) { st.reunionSeen.push(y); S.save(); }
      renderHome();
    };
    $('#btn-reunion-again').onclick = playReunion;
    $('#btn-reunion-close').onclick = function () { show('home'); };

    $('#btn-add-photos').onclick = function () { $('#in-photos').click(); };
    $('#in-photos').onchange = function (e) { addPhotos(e.target.files); e.target.value = ''; };

    $('#album-list').addEventListener('click', function (e) {
      var m = e.target.closest('[data-ch-menu]');
      if (!m) return;
      var id = m.dataset.chMenu;
      var hidden = st.hiddenChapters.indexOf(id) >= 0;
      sheet('この期間', 'アルバムに出すかどうかを選べます。出さない期間は、再会や季節の一枚にも使われません。', [
        { label: hidden ? 'また出す' : 'この期間は出さない', on: function () { S.toggleHidden(id); renderAlbum(); } },
        { label: '名前をつける', on: function () { renameChapter(id); } },
        { label: 'とじる' }
      ]);
    });

    $('#btn-settings').onclick = function () { show('settings'); };
    $('#btn-settings-close').onclick = function () { show('home'); };
    $('#btn-more').onclick = function () { st.freqNudge = 1; S.save(); renderSettings(); };
    $('#btn-less').onclick = function () { st.freqNudge = -1; S.save(); renderSettings(); };
    $('#btn-export').onclick = exportAll;

    $('#seg-cal').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      st.pet.calendar = b.dataset.v; S.save(); renderSettings();
    });
    $('#seg-theme').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      st.theme = b.dataset.v; S.save(); applyTheme(); renderSettings();
    });
    $('#seg-offset').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      var j = offsetJumps()[b.dataset.v];
      if (!j) return;
      st.dateOffset = j.offset; S.save(); renderSettings();
    });

    $('#btn-hidden').onclick = function () {
      if (!st.hiddenChapters.length) {
        sheet('出さない写真・期間', 'いまは1件もありません。アルバムの「···」から、出さない期間を選べます。', [{ label: 'とじる' }]);
        return;
      }
      sheet('出さない写真・期間', st.hiddenChapters.length + '件あります。アルバムの「···」から戻せます。', [{ label: 'とじる' }]);
    };

    $('#btn-profile').onclick = function () {
      step = 0; pickedPhoto = null;
      $('#in-name').value = st.pet.name;
      $('#in-death').value = st.pet.deathISO;
      $('#in-birth').value = st.pet.birthISO;
      $('#pick-label').textContent = portraitUrl ? '写真をえらびなおす' : '写真をえらぶ';
      renderOnbo(); show('onbo');
    };

    $('#btn-help').onclick = function () {
      sheet('つらいときの相談先',
        'ひとりで抱えなくて大丈夫です。まずは、こういうところがあります。<br><br>' +
        '・かかりつけだった動物病院<br>' +
        '・お住まいの自治体の こころの健康相談窓口<br>' +
        '・ペットロスの相談を受けている カウンセリング機関<br><br>' +
        '<span style="color:var(--faint);font-size:12px">※ 具体的な窓口名と連絡先は、実在と受付状況を確認できしだいここに載せます。確認できていないものは載せません。</span>',
        [{ label: 'とじる' }]);
    };

    $('#btn-reset').onclick = function () {
      sheet('この端末のデータを消す',
        'なまえ・日付・お参りの記録・写真を、この端末から消します。取り消せません。<br><br>先に「すべて手元に持ち出す」で保存しておけます。',
        [{ label: '消す', on: hardReset }, { label: 'やめる', primary: true }]);
    };
  }

  function renameChapter(id) {
    var name = window.prompt('この期間の名前', st.chapterTitles[id] || '');
    if (name === null) return;
    if (name.trim()) st.chapterTitles[id] = name.trim();
    else delete st.chapterTitles[id];
    S.save(); renderAlbum();
  }

  function hardReset() {
    S.allPhotos().then(function (ps) {
      return Promise.all(ps.map(function (p) { return S.deletePhoto(p.id); }))
        .then(function () { return S.deletePhoto('portrait'); });
    }).catch(function () {}).then(function () {
      S.reset();
      location.reload();
    });
  }

  /* ============ 起動 ============ */
  buildTabs();
  wire();
  applyTheme();
  loadPortrait();
  if (st.onboarded && st.pet.deathISO) {
    show('home');
  } else {
    step = 0; renderOnbo(); show('onbo');
  }
})();

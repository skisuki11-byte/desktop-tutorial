/* app.js — 画面の組み立て。
 *
 * ここに書いてはいけないもの（docs/UI設計.md）:
 *   連続記録（ストリーク）／達成バッジ・紙吹雪／ランダム配信／
 *   退会引き止め／他人との比較／常時対話AI。
 *   数えるのは「通算」だけ。減らず、途切れず、休んでも何も失われない。
 */
(function () {
  'use strict';

  /* 表に出すバージョン。設定画面のいちばん下に「Ver ◯.◯」として出る。
   *
   * 付けかた（利用者の決めごと。こちらの判断では上げない）:
   *   ・軽微な修正（不具合直し・文言・見た目の微調整）では上げない
   *   ・小さな機能追加は +0.1
   *   ・大幅な機能変更は +1
   *
   * 上げるときは、ここと合わせて次も同じ数字にそろえる:
   *   ・package.json の "version"
   *   ・ios/App/App.xcodeproj/project.pbxproj の MARKETING_VERSION（2か所）
   * （ストアの審査で使われるのはiOS側の値。ここはアプリ内の表示用） */
  var APP_VERSION = '1.0';

  var S = window.Store, st = S.state;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* 「ホーム画面に追加」の手順は、iOSとAndroidでボタンの場所が違う。
     iOS Safariは下の共有ボタン（□↑）から。Androidのブラウザに共有ボタンの列はなく、
     右上の「⋮」メニューから追加する。「共有ボタンから」と決め打ちすると、
     Androidの人には存在しないボタンを探させてしまう。実機の文言をここで出し分ける。 */
  function isIOS() {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
    // iPadOS はデスクトップ名で名乗るので、タッチ対応の Mac として見分ける
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }
  function homeHint() {
    if (isIOS()) return '共有ボタン（<span aria-hidden="true">⬆️</span>）から<b>「ホーム画面に追加」</b>して、そちらで開いてください。';
    if (/Android/.test(navigator.userAgent)) return '右上の「⋮」メニューから<b>「ホーム画面に追加」</b>して、そちらで開いてください。';
    return 'ブラウザのメニューから<b>「ホーム画面に追加」</b>して、そちらで開いてください。';
  }
  function fillHomeHints() {
    $$('#hint-onbo, #hint-home, #hint-settings').forEach(function (el) { el.innerHTML = homeHint(); });
  }
  function artRef() {
    return st.pet.kind === 'cat' ? '#art-cat'
         : st.pet.kind === 'other' ? '#art-paw' : '#art-dog';
  }
  /* おうち画面、日付の横のマーク。灯りは毎回使うにはこの画面では
     重く見えるという指摘を受け、この子がいぬ・ねこ・そのほかの
     どれかで変えることにした（追記69）。「どちらですか」（#kindpick）
     で選ぶときの絵と同じものにする（追記73）——犬猫は同じ絵
     （#art-dog／#art-cat）、そのほかはハート（#mark-other、
     #kindpickと共通）。 */
  function markRef() {
    return st.pet.kind === 'cat' ? '#art-cat'
         : st.pet.kind === 'other' ? '#mark-other' : '#art-dog';
  }

  /* トップの絵の配色。図形は共通、色だけをCSS変数で差し替える（css/style.css の
     [data-scene="…"]）。ここでは選択肢の一覧と、選ぶボタンのHTMLだけを持つ。
     将来、有料版で動く背景を足すときもこの配列に足すだけでよいようにしてある。
     既定は「自動」＝実際の今の季節（気象庁の区分＝3-5月春・6-8月夏・
     9-11月秋・12-2月冬）に合わせる。手動で選べば、それが自動に戻す
     までずっと優先される（追記65）。 */
  var SCENES = [
    { id: 'auto', label: '自動（今の季節）' },
    { id: 'spring', label: '春' },
    { id: 'summer', label: '夏' },
    { id: 'autumn', label: '秋' },
    { id: 'winter', label: '冬' }
  ];
  function seasonNow() {
    var m = new Date().getMonth() + 1;   // 1〜12
    if (m >= 3 && m <= 5) return 'spring';
    if (m >= 6 && m <= 8) return 'summer';
    if (m >= 9 && m <= 11) return 'autumn';
    return 'winter';
  }
  function sceneOf() {
    var v = st.pet.scene;
    return (!v || v === 'auto') ? seasonNow() : v;
  }
  function sceneRaw() { return st.pet.scene || 'auto'; }   // 選択肢の表示（どのボタンを選んだ状態にするか）用
  function scenePickHTML(cur) {
    return SCENES.map(function (s) {
      return '<button type="button" data-scene="' + s.id + '" aria-pressed="' + (s.id === cur) + '">' +
        '<span class="sw" data-scene="' + s.id + '"></span>' + s.label + '</button>';
    }).join('');
  }

  /* 作った objectURL は必ず覚えて、作り直すときに解放する */
  var urlCache = {};
  function mediaURL(rec) {
    if (rec.url) return rec.url;          // assets に置いたものは、そのまま参照できる
    if (!urlCache[rec.id]) urlCache[rec.id] = URL.createObjectURL(rec.blob);
    return urlCache[rec.id];
  }
  function freeURL(id) { if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } }

  /* ============ 画面 ============ */
  /* 5つ並ぶと、狭い端末では1列60pxしか取れない。
     「おまいりの庭」は収まらないので、タブでは「にわ」と短く呼ぶ。
     画面の見出しは「おまいりの庭」のままにしてある。 */
  var TABS = [
    { id: 'home', label: 'おうち', icon: 't-home' },
    { id: 'niwa', label: 'にわ', icon: 't-niwa' },
    { id: 'jibun', label: 'じぶん', icon: 't-jibun' },
    { id: 'album', label: 'アルバム', icon: 't-album' },
    { id: 'ugoku', label: 'うごく', icon: 't-ugoku' }
  ];
  function buildTabs() {
    $$('[data-tabs]').forEach(function (nav) {
      nav.innerHTML = TABS.map(function (t) {
        // 「じぶん」だけ、他のタブより一段目立つ丸いボタンにする
        // （利用者の依頼：支払いアプリの中央ボタンのような見た目に）。
        var hero = t.id === 'jibun';
        return '<button class="tab' + (hero ? ' tab-hero' : '') + '" data-go="' + t.id + '">' +
          '<span class="tab-ic"><svg aria-hidden="true"><use href="#' + t.icon + '"></use></svg></span>' +
          t.label + '</button>';
      }).join('');
    });
  }
  function show(name) {
    $$('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'view-' + name); });
    // 表示された瞬間に、遺影の位置をもう一度計算しなおす（非表示中は幅0で測れないため）。
    facePlacers.forEach(function (f) { f(); });
    // 章のなかみはアルバムの一部。タブはアルバムを選んだままにする。
    var tabName = name === 'chapter' ? 'album' : name;
    $$('[data-tabs] .tab').forEach(function (b) {
      if (b.dataset.go === tabName) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var b = $('#view-' + name + ' .body'); if (b) b.scrollTop = 0;
    if (name !== 'player') stopPlayer();
    if (name === 'home') renderHome();
    if (name === 'niwa') renderNiwa();
    if (name === 'review') renderReview();
    if (name === 'jibun') renderJibun();
    if (name === 'album') renderAlbum();
    if (name === 'ugoku') renderVideos();
    if (name === 'settings') renderSettings();
    if (name === 'write') renderWrite();
    if (name === 'mails') renderMails();
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go]');
    if (t) show(t.dataset.go);
  });

  /* ============ 遺影 ============
     写真が入ればイラストは消える。イラストは代役。 */
  var faceURL = null;
  function loadFace() {
    return S.getMedia('portrait').then(function (rec) {
      if (faceURL && faceURL.indexOf('blob:') === 0) URL.revokeObjectURL(faceURL);
      faceURL = null;
      if (rec) faceURL = rec.url || URL.createObjectURL(rec.blob);
      paintFaces();
      return !!faceURL;
    }).catch(function () { paintFaces(); return false; });
  }
  /* ============ 納骨のときのお骨の写真 ============
     任意。遺影とは別枠（kind:'ashes'）で持ち、アルバムには出さない。
     位置あわせ・大きさ調整はしない（遺影ほど頻繁に見返すものではないため）。 */
  var ashesURL = null;
  function loadAshes() {
    return S.getMedia('ashes').then(function (rec) {
      if (ashesURL && ashesURL.indexOf('blob:') === 0) URL.revokeObjectURL(ashesURL);
      ashesURL = null;
      if (rec) ashesURL = rec.url || URL.createObjectURL(rec.blob);
      paintAshes();
      return !!ashesURL;
    }).catch(function () { paintAshes(); return false; });
  }
  function paintAshes() {
    var ap = $('#ashes-pick'); if (!ap) return;
    ap.innerHTML = (ashesURL ? '<img src="' + ashesURL + '" alt="">' : '') +
      '<span class="badge-ok" id="ashes-ok"' + (ashesURL ? '' : ' hidden') +
      '><svg width="16" height="16"><use href="#ic-check"></use></svg></span>';
    // おまいりでの見せ方は、骨壺のイラスト（既定）か登録した実物の写真かを
    // 設定（#seg-ashes-display）で選べる（追記44）。おうち画面には出さない
    // （追記45：利用者の判断で、おまいり画面だけにした）。
    var showPhoto = !!(ashesURL && st.pet.ashesShowPhoto);
    var ra = $('#reien-ashes');
    if (ra) {
      ra.hidden = !ashesURL;
      ra.innerHTML = showPhoto ? '<img src="' + ashesURL + '" alt="お骨の写真">' : '<svg width="16" height="16"><use href="#of-urn"></use></svg>';
    }
    var bd = $('#box-ashes-display'); if (bd) bd.hidden = !ashesURL;
  }
  function pickAshes(file) {
    if (!file) return;
    $('#ashes-msg').innerHTML = '<span class="busy"></span> 取りこんでいます…';
    shrink(file, 1200, 0.85)
      .then(function (blob) {
        return S.putMedia({ id: 'ashes', blob: blob, at: file.lastModified || Date.now(), kind: 'ashes' });
      })
      .then(function (r) {
        if (!r.ok) { $('#ashes-msg').textContent = ''; onboErr(reasonText(r.reason)); return; }
        return loadAshes().then(function () {
          $('#ashes-msg').innerHTML = '<span style="color:var(--grass-ink)">とりこみました</span>';
          $('#btn-ashes-pick').textContent = 'えらびなおす';
          $('#onbo-err').hidden = true;
        });
      })
      .catch(function (e) {
        $('#ashes-msg').textContent = '';
        onboErr(reasonText((e && e.message) || 'unknown'));
      });
  }
  /* 1枚の遺影を、home/おまいり/おまいりのあと/写真えらび の4つの丸枠すべてに出す。
     枠の大きさが場所ごとに違う（154px・124px・168px、しかも home は端末の高さで
     可変）ため、object-fit の位置指定だけでは合わせにくい。枠の実寸を測って
     width/height/left/top を自前で計算し、どこでも同じ縮尺・同じ位置に見えるようにする。
     x/y は0〜1（0＝写真の左端／上端が見える、1＝右端／下端が見える）、
     zoom は1が「枠にぴったり収まる最小倍率」。 */
  function placeFaceImg(img) {
    var box = img.parentElement;
    function place() {
      var nw = img.naturalWidth, nh = img.naturalHeight, bw = box.clientWidth, bh = box.clientHeight;
      if (!nw || !nh || !bw || !bh) return;
      var x = st.pet.faceX != null ? st.pet.faceX : 0.5;
      var y = st.pet.faceY != null ? st.pet.faceY : 0.5;
      var z = st.pet.faceZoom || 1;
      var scale = Math.max(bw / nw, bh / nh) * z;
      var rw = nw * scale, rh = nh * scale;
      var maxX = Math.max(0, rw - bw), maxY = Math.max(0, rh - bh);
      img.style.position = 'absolute';
      img.style.width = rw + 'px'; img.style.height = rh + 'px';
      img.style.left = (-maxX * x) + 'px'; img.style.top = (-maxY * y) + 'px';
    }
    if (img.complete && img.naturalWidth) place(); else img.onload = place;
    return place;
  }
  var pickPlace = null;    // 写真えらび画面のimgの再配置関数。ドラッグ中はこれだけ呼ぶ
  var facePlacers = [];    // home/おまいり/おまいりのあと の再配置関数。
                           // 非表示（display:none）の画面は幅が測れず配置できないため、
                           // その画面を開く瞬間（show()）にもう一度呼び直す。
  function paintFaces() {
    var html = faceURL ? '<img src="' + faceURL + '" alt="">'
                       : '<svg class="art" aria-hidden="true"><use href="' + artRef() + '"></use></svg>';
    facePlacers = [];
    ['#home-face', '#omairi-face', '#after-face'].forEach(function (sel) {
      var el = $(sel); if (!el) return;
      el.innerHTML = html;
      if (faceURL) facePlacers.push(placeFaceImg(el.querySelector('img')));
    });
    var pf = $('#pick-face');
    if (pf) {
      pf.innerHTML = html + '<span class="badge-ok" id="pick-ok"' + (faceURL ? '' : ' hidden') +
        '><svg width="16" height="16"><use href="#ic-check"></use></svg></span>';
      pickPlace = faceURL ? placeFaceImg(pf.querySelector('img')) : null;
    }
    var pc = $('#pick-crop');
    if (pc) { pc.hidden = !faceURL; $('#in-facezoom').value = Math.round((st.pet.faceZoom || 1) * 100); }
  }
  var faceResizeT = null;
  window.addEventListener('resize', function () {
    clearTimeout(faceResizeT);
    faceResizeT = setTimeout(function () { if (faceURL) paintFaces(); }, 150);
  });

  /* 端末の写真はそのままだと数十MBある。長辺を縮めてから保存する。 */
  function shrink(file, max, quality) {
    return new Promise(function (res, rej) {
      var img = new Image(), u = URL.createObjectURL(file), done = false;
      var t = setTimeout(function () { if (!done) { done = true; URL.revokeObjectURL(u); rej(new Error('decode-timeout')); } }, 12000);
      img.onload = function () {
        if (done) return; done = true; clearTimeout(t);
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) throw new Error('decode-failed');
          var s = Math.min(1, max / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(u);
          c.toBlob(function (b) { b ? res(b) : rej(new Error('encode-failed')); }, 'image/jpeg', quality || 0.85);
        } catch (e) { URL.revokeObjectURL(u); rej(e); }
      };
      img.onerror = function () {
        if (done) return; done = true; clearTimeout(t);
        URL.revokeObjectURL(u);
        rej(new Error('decode-failed'));   // HEIC など、この端末で開けない形式
      };
      img.src = u;
    });
  }

  /* 保存できなかった理由を、そのまま人の言葉にする。黙って止めない。 */
  var REASON = {
    'decode-failed': 'この写真の形式は、この端末では開けませんでした。iPhoneの設定でHEICになっている場合は「互換性優先」で撮り直すか、一度スクリーンショットを撮ると入ります。',
    'decode-timeout': '写真の読み込みに時間がかかりすぎました。もう一度おためしください。',
    'encode-failed': '写真を変換できませんでした。別の写真でおためしください。',
    'quota': 'この端末の保存領域がいっぱいです。アルバムの写真を減らすと入ります。',
    'too-large': 'この写真は大きすぎて、いまの保存先に入りませんでした。',
    'no-store': 'このブラウザでは保存先が使えませんでした。アプリをホーム画面に追加してから開くと入ります。',
    'video-format': 'この動画は、この端末では開けませんでした。写真アプリで書き出し直すと入ることがあります。',
    'video-too-large': 'この動画を入れるだけの空きが端末にありませんでした。',
    'unreadable': 'ファイルを読み取れませんでした。',
    'unknown': '保存できませんでした。'
  };
  function reasonText(r) { return REASON[r] || REASON.unknown; }

  /* ============ おむかえ ============ */
  var step = 0;
  // 設定の「なまえ・写真・日づけ」から開いたときだけ true。
  // 初回のおむかえには「戻る先」が存在しないため、この場合だけ
  // 「とじる」を出し、途中の段でも設定に戻れるようにする。
  var onboEditMode = false;
  function renderOnbo() {
    $$('#view-onbo .step').forEach(function (el) { el.hidden = +el.dataset.step !== step; });
    $$('#onbo-steps i').forEach(function (el, i) { el.classList.toggle('on', i <= step); });
    $('#onbo-topbar').hidden = !onboEditMode;
    $('#btn-back').hidden = step === 0;
    $('#btn-skip').hidden = step !== 2;
    $('#btn-next').textContent = step === 7 ? 'はじめる' : 'つぎへ';
    if (step === 5) renderFaveEdit();
    if (step === 6) $('#scenepick-onbo').innerHTML = scenePickHTML(sceneRaw());
    if (step === 7) {
      $('#in-message').value = (st.pet.message || '').slice(0, 14);
      $('#in-message-count').textContent = $('#in-message').value.length;
    }
    $('#onbo-err').hidden = true;
    var pa = $('#pick-art'); if (pa) pa.innerHTML = '<use href="' + artRef() + '"></use>';
    var ow = $('#onbo-warn'); if (ow) ow.hidden = !S.storeInfo().embedded;
    if (step === 2) paintFaces();
    if (step === 3) paintAshes();
  }
  function onboErr(msg) {
    var e = $('#onbo-err');
    e.innerHTML = '<svg width="19" height="19" style="color:#9A4A2E"><use href="#ic-info"></use></svg><p>' + esc(msg) + '</p>';
    e.hidden = false;
  }
  function onboNext() {
    if (step === 0) {
      var n = $('#in-name').value.trim();
      if (!n) { onboErr('なまえを入れてください'); return; }
      st.pet.name = n;
    }
    if (step === 4) {
      var d = $('#in-death').value;
      if (d && S.diffDays(S.parseISO(d), S.today()) < 0) { onboErr('これから先の日づけは選べません'); return; }
      st.pet.deathISO = d || '';
      st.pet.birthISO = $('#in-birth').value || '';
      S.save();
    }
    if (step === 5) {
      addFave($('#in-fave').value);      // 入力途中のものも拾う
    }
    if (step === 7) {
      st.pet.message = $('#in-message').value.trim().slice(0, 14);
      st.onboarded = true; S.save();
      var toSettings = onboEditMode; onboEditMode = false;
      show(toSettings ? 'settings' : 'home');
      return;
    }
    step++; S.save(); renderOnbo();
  }

  /* 好きだったもの。2つまで。 */
  function addFave(name) {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return false;
    if (!st.pet.faves) st.pet.faves = [];
    if (st.pet.faves.length >= 2 || st.pet.faves.indexOf(name) >= 0) return false;
    st.pet.faves.push(name); S.save();
    return true;
  }
  function faveChip(name, opts) {
    opts = opts || {};
    return '<button class="fave' + (opts.offering ? ' offering' : '') + '"' +
      (opts.done ? ' data-done="1"' : '') +
      (opts.act ? ' data-fave="' + esc(name) + '" aria-pressed="' + !!opts.done + '"' + (opts.done ? ' disabled' : '') : ' data-favedel="' + esc(name) + '"') +
      '><svg aria-hidden="true"><use href="#of-dish"></use></svg>' + esc(name) +
      (opts.act
        ? '<span class="chk"><svg width="12" height="12"><use href="#ic-check"></use></svg></span>'
        : ' <span style="color:var(--faint);font-weight:400">×</span>') + '</button>';
  }
  function renderFaveEdit() {
    var f = st.pet.faves || [];
    $('#fave-list').innerHTML = f.map(function (n) { return faveChip(n, {}); }).join('');
    $('#in-fave').disabled = f.length >= 2;
    $('#in-fave').placeholder = f.length >= 2 ? '2つまでです' : 'さつまいも';
  }

  function pickPortrait(file) {
    if (!file) return;
    $('#pick-msg').innerHTML = '<span class="busy"></span> 取りこんでいます…';
    shrink(file, 1200, 0.85)
      .then(function (blob) {
        return S.putMedia({ id: 'portrait', blob: blob, at: file.lastModified || Date.now(), kind: 'photo' });
      })
      .then(function (r) {
        if (!r.ok) { $('#pick-msg').textContent = ''; onboErr(reasonText(r.reason)); return; }
        // 前の写真の切り抜き位置は、新しい写真には合わない。中央・そのままに戻す。
        st.pet.faceX = 0.5; st.pet.faceY = 0.5; st.pet.faceZoom = 1; S.save();
        return loadFace().then(function () {
          $('#pick-msg').innerHTML = '<span style="color:var(--grass-ink)">とりこみました</span>';
          $('#btn-pick').textContent = 'えらびなおす';
          $('#onbo-err').hidden = true;
        });
      })
      .catch(function (e) {
        $('#pick-msg').textContent = '';
        onboErr(reasonText((e && e.message) || 'unknown'));
      });
  }

  /* ============ おうち ============ */

  /* 手紙のこだま。日付とその日の手紙数から必ず同じ1通を選ぶ（乱数を保存しない）。
     節目が変わらない限り、開き直しても同じ手紙のまま。追記46。 */
  function pickEchoLetter(dateKey, letters) {
    var h = 0;
    for (var i = 0; i < dateKey.length; i++) h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
    return letters[h % letters.length];
  }
  var ECHO_KICKER = {
    d49: '四十九日に、あなたが書いた手紙', d100: '百か日に、あなたが書いた手紙',
    y1: '一周忌に、あなたが書いた手紙', y3: '三回忌に、あなたが書いた手紙',
    birthday: 'お誕生日に、あなたが書いた手紙'
  };
  function paintLetterEcho(t) {
    var echo = $('#letter-echo'); if (!echo) return;
    var todayKey = S.ymd(t);
    var big = S.milestoneToday(t);
    var letters = st.letters || [];
    var dismissed = st.echoDismissedOn === todayKey;
    if (!big || !letters.length || dismissed) { echo.hidden = true; return; }
    var letter = pickEchoLetter(todayKey, letters);
    echo.hidden = false;
    $('#echo-kicker').textContent = ECHO_KICKER[big.key] || 'その日、あなたが書いた手紙';
    $('#echo-date').textContent = S.formatJP(new Date(letter.at));
    var text = letter.text.length > 56 ? letter.text.slice(0, 56) + '…' : letter.text;
    $('#echo-text').textContent = text;
  }

  function renderHome() {
    // 消える環境なら、写真を入れる前に知らせる。あとから「消えました」では遅い。
    $('#home-warn').hidden = !S.storeInfo().embedded;
    $('#home-title').textContent = st.pet.message || 'いつまでも家族だよ';
    var t = S.today();
    $('#home-date').textContent = S.formatMD(t);
    $('#home-mark').setAttribute('href', markRef());
    $('#home-name').textContent = st.pet.name || '—';
    $('#home-scene').dataset.scene = sceneOf();
    // おうちを開くたび、遺影がそっと現れる（戒名のkaimyo-inより一拍先に）。
    var hf = $('#home-face');
    hf.classList.remove('face-in');
    void hf.offsetWidth;
    hf.classList.add('face-in');

    var death = S.parseISO(st.pet.deathISO), birth = S.parseISO(st.pet.birthISO);
    // 上の行は享年と命日。この子が何年生きて、いつ旅立ったか。
    var meta = [];
    var age = S.ageAtDeath();
    if (age) meta.push('享年 ' + (age.years != null ? age.years + '歳' : age.months + 'か月'));
    if (death) meta.push((death.getMonth() + 1) + '月' + death.getDate() + '日 没');
    $('#home-meta').textContent = meta.join(' ・ ');
    // 下の行は生まれた日といっしょにいた日数。控えめに添える。
    var sub = [];
    if (birth) sub.push(S.formatShort(birth) + ' 生');
    var tg = S.daysTogether();
    if (tg) sub.push('いっしょに ' + tg.toLocaleString('ja-JP') + '日');
    $('#home-meta2').textContent = sub.join(' ・ ');

    var km = S.kaimyo();
    var kb = $('#home-kaimyo');
    kb.hidden = !km;
    if (km) {
      // 縦書きの毛筆だけだと、はじめて見た人には何の文字か分からない。
      // 「戒名」の2字はUIの注記であって本文ではないので、毛筆ではなく地の書体で小さく出す。
      kb.innerHTML = '<b class="kaimyo-label">戒名</b>' + brushHTML(km);
      // 縦に立てるので、字数が増えるほど下へ伸びる。絵からはみ出さない大きさに合わせる。
      kb.style.fontSize = fitBrush(Array.from(km).length) + 'px';
      // おうちを開くたび（タブを行き来したときも含めて）、そっと浮かび上がらせる。
      kb.classList.remove('kaimyo-in');
      void kb.offsetWidth;
      kb.classList.add('kaimyo-in');
    }

    var n = S.visitCount(), done = S.visitedOn(t);
    $('#omairi-label').textContent = done ? 'もう一度おまいりする' : 'おまいりする';
    $('#home-count').innerHTML = done
      ? '今日はもう灯しました ・ 通算 <b>' + n + '</b> 回'
      : 'きょうで <b>' + (n + 1) + '</b> 回目';

    renderHomeVideos();

    // 手紙カード
    var nm = st.pet.name || 'あの子';
    var n2 = (st.letters || []).length;
    $('#write-t').textContent = nm + 'へ てがみを書く';
    $('#write-s').textContent = 'いま伝えたいことを、そのまま';
    // 過去の手紙は、書く画面の中から開く。カードに2つの意味を重ねない。
    var mb = $('#btn-mails');
    mb.hidden = !n2;
    $('#mails-n').textContent = n2;

    paintLetterEcho(t);

    // 中身が失われたものがあれば、黙って見せずに知らせる
    var lost = S.lostCount();
    $('#lost-note').innerHTML = lost
      ? '<div class="tip tip-warn"><svg width="19" height="19" style="color:#9A4A2E"><use href="#ic-info"></use></svg>' +
        '<p><b>' + lost + '件の写真・動画が読めなくなっていました。</b>記録だけが残り、中身が失われています。' +
        'iPhoneが保存領域を整理したときに起きます。<br>' +
        '<button id="btn-lost-clear" style="margin-top:8px;min-height:40px;padding:0 14px;border-radius:999px;' +
        'border:2px solid #F2CFC4;background:transparent;color:#9A4A2E;font-size:var(--fs-2);font-weight:700;cursor:pointer">' +
        '読めない記録を消す</button></p></div>'
      : '';
    var lb = $('#btn-lost-clear');
    if (lb) lb.onclick = function () {
      var n = S.clearLost();
      sheet('消しました', n + '件の読めない記録を消しました。<br><br>お手数ですが、写真と動画を入れ直してください。',
        [{ label: 'わかりました', primary: true, on: function () { renderHome(); } }]);
    };
  }

  function renderHomeVideos() {
    S.allMedia('video').then(function (vs) {
      var box = $('#home-vids');
      box.hidden = false;
      if (!vs.length) {
        // 動画がまだ無いときは空けたままにしない。ここがこの製品の中心なので誘う。
        box.innerHTML = '<button class="btn btn-dash" data-go="ugoku" style="min-height:86px;flex-direction:column;gap:6px">' +
          '<span style="display:flex;align-items:center;gap:9px"><svg width="20" height="20"><use href="#ic-plus"></use></svg>' +
          'うごくすがたを入れる</span>' +
          '<span style="font-size:var(--fs-2);font-weight:400;color:var(--muted)">1本あるだけで、いつでも会えます</span></button>';
        return;
      }
      box.innerHTML = '<div style="display:flex;align-items:baseline;justify-content:space-between">' +
        '<p style="margin:0;font-family:var(--round);font-weight:700;font-size:var(--fs-4)">うごく' + esc(st.pet.name || 'あの子') + '</p>' +
        '<button class="btn btn-ghost" style="width:auto;min-height:auto;font-size:var(--fs-2);font-weight:700;color:var(--sky-ink)" data-go="ugoku">ぜんぶ見る</button></div>' +
        '<div class="grid2" id="home-vid-list" style="margin-top:8px"></div>';
      var latest = vs.slice(-2);
      $('#home-vid-list').innerHTML = latest.map(function (v) {
        return tileHTML(v, latest.length === 1);
      }).join('');
      ensureVideoThumbs(latest);
    });
  }

  /* 動画の最初のコマを、一度だけ静止画（JPEG・dataURL）にして保存しておく。
     <video preload="metadata"> をタイルにそのまま並べてコマを描かせる方式を
     最初に試したが、実機（特にiOS Safari）では metadata だけ読んだ状態から
     currentTime を動かしても実際のコマが描かれず、黒いままのことがあった。
     一度だけ確実にコマを取り出し、以後はふつうの<img>として出せば、
     ブラウザやOSの「動画をどこまで読み込むか」の違いに左右されない。 */
  function grabFirstFrame(url) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, 8000);
      function finish(ok) {
        if (done) return; done = true; clearTimeout(t);
        if (!ok) { reject(new Error('decode-failed')); return; }
        try {
          var w = v.videoWidth, h = v.videoHeight;
          if (!w || !h) { reject(new Error('decode-failed')); return; }
          var s = Math.min(1, 360 / Math.max(w, h));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.75));
        } catch (e) { reject(e); }
      }
      // loadeddata＝最初のコマのデータが実際にそろった合図。そこから
      // ごくわずかに先へシークして確定させる（0のままだと「動いていない」と
      // 見なされ、seeked が来ない実装があるため）。
      v.addEventListener('loadeddata', function () {
        try { v.currentTime = 0.05; } catch (e) { finish(true); }
      });
      v.addEventListener('seeked', function () { finish(true); });
      v.addEventListener('error', function () { finish(false); });
      v.src = url;
    });
  }
  /* サムネイルをまだ持たない動画があれば裏で作る。1本失敗しても他は続け、
     できたぶんから保存して、home・うごく一覧を作り直す。 */
  function ensureVideoThumbs(vs) {
    var missing = vs.filter(function (v) { return !st.videoThumbs[v.id]; });
    if (!missing.length) return;
    var p = Promise.resolve();
    missing.forEach(function (v) {
      p = p.then(function () {
        return grabFirstFrame(mediaURL(v)).then(function (dataURL) {
          st.videoThumbs[v.id] = dataURL; S.save();
        }).catch(function () { /* この1本はあきらめる。タイルは動画のまま残る */ });
      });
    });
    p.then(function () {
      renderHomeVideos();
      if ($('#view-ugoku').classList.contains('on')) renderVideos();
    });
  }

  function tileHTML(v, big) {
    var title = st.videoTitles[v.id] || 'うごくすがた';
    var d = v.at ? S.formatShort(new Date(v.at)) : '';
    var thumb = st.videoThumbs[v.id];
    var pic = thumb ? '<img src="' + thumb + '" alt="">'
                    : '<video src="' + mediaURL(v) + '" muted playsinline preload="metadata"></video>';
    return '<div class="tile' + (big ? ' big' : '') + '" data-vid="' + esc(v.id) + '">' +
      pic +
      '<svg class="play" viewBox="0 0 24 24"><use href="#ic-play"></use></svg>' +
      '<span class="cap"><b>' + esc(title) + '</b><span>' + esc(d) + '</span></span>' +
      '</div>';
  }

  /* ============ おまいりの4動作 ============
     順序固定・スキップ不可。毎回まったく同じ手順であることが効いている。 */
  var LEADS = ['灯りを、ともします', 'お水を、そなえます', 'ごはんを、そなえます', 'お花を、そなえます'];
  var rstep = 0, rcounted = false;
  /* 好きだったものは、4動作とは別枠。順序を問わず、気になるものを
     タップしたその場でそなえる（4動作と同じ、選んで即・確定の1タップ）。
     justOffered＝そなえた直後のもの（このおまいり画面を開いている間だけ、
     次の再描画で一度だけ光らせるための印）
     sessionFaves＝このおまいりで自分がタップしたもの。チェックは
     これだけを見て付ける。保存(S.faveDoneOn)は「今日すでにそなえた
     か」を持っているが、それをそのままチェックの根拠にすると、
     今日すでに一度そなえていた場合に画面を開いた瞬間から最初から
     チェック済みに見えてしまい、「自分で選んだらチェックが付く」
     という手応えにならない。4動作（rstep）も毎回0から始まるのと
     同じく、好きだったものの見た目も毎回のおまいりでまっさらから
     始める（追記63）。 */
  var justOffered = {}, sessionFaves = {};
  function renderRitual() {
    $$('#ritual .offer').forEach(function (b, i) {
      if (i < rstep) { b.dataset.state = 'done'; b.disabled = true; }
      else if (i === rstep) { b.dataset.state = 'next'; b.disabled = false; }
      else { delete b.dataset.state; b.disabled = true; }
    });
    // そなえた4つは、台座の上にひとつずつ増えていく（見た目の裏づけ）。
    $$('#reien-offerings .r-placed').forEach(function (el, i) { el.classList.toggle('on', i < rstep); });
    var reien = $('.reien'); if (reien) reien.classList.toggle('lit', rstep >= 4);
    var faves = st.pet.faves || [];
    $('#ritual-lead').textContent = rstep < 4
      ? LEADS[rstep]
      : (faves.length ? 'ほかにも、どうぞ' : 'そなえました');
    $('#ritual-sub').textContent = rstep < 4
      ? 'じゅんばんに、4つ'
      : '終わったら、下のボタンで';
    $('#ritual-pill').textContent = rstep + ' / 4';

    // 4つ終わるまでは「また、あとで」、終わったら「おまいりを終える」
    var b = $('#btn-omairi-close');
    if (rstep < 4) {
      b.className = 'btn btn-line';
      b.textContent = 'また、あとで';
    } else {
      b.className = 'btn btn-amber btn-lg';
      b.textContent = 'おまいりを終える';
    }
    var f = st.pet.faves || [];
    $('#faves-h').hidden = false;
    $('#faves-h').textContent = f.length ? (st.pet.name || 'あの子') + 'の好きだったもの' : '';
    $('#faves-hint').hidden = !f.length;
    $('#omairi-faves').innerHTML =
      f.map(function (n) {
        return faveChip(n, { act: true, done: !!sessionFaves[n], offering: !!justOffered[n] });
      }).join('') +
      (f.length < 2
        ? '<button class="fave add" id="btn-fave-add"><svg aria-hidden="true"><use href="#ic-plus"></use></svg>' +
          (f.length ? '足す' : '好きだったものを足す') + '</button>'
        : '');
    justOffered = {};   // 光らせるのは直後の1回だけ
  }
  function startRitual() { rstep = 0; rcounted = false; justOffered = {}; sessionFaves = {}; renderRitual(); show('omairi'); }
  function tapOffer(i) {
    if (i !== rstep) return;
    rstep++;
    if (rstep === 4) {
      // 4つそろった時点でおまいりは成立。数えるのはここ。
      // ただし画面は終わらせない。好きだったものをそなえる余地を残す。
      rin();
      rcounted = S.recordVisit(S.today());
      if (window.TomoshibiNative) window.TomoshibiNative.hapticSuccess();
    }
    renderRitual();
  }

  /* 四十九日・百か日・一周忌・三回忌・お誕生日、ちょうどその日だけ、
     ここの一言と絵をほんの少し特別にする（追記46）。ストア配信版では
     設定「大事な日のお知らせ」でこの日を教えることもできるが（下の
     scheduleMilestoneNotifications）、それをオフにしていても・その日
     アプリを開かなくても、お参りに来たその瞬間だけそっと気づける
     演出として、これは変わらず残す。 */
  /* 節目ごとの一言（追記70・71）。すべて「あの子からあなたへ」の
     向きで統一する——飼い主がこの子に語りかける言葉ではなく、
     この子が飼い主にかける言葉にする（追記71：「生まれてきてくれて、
     ありがとう」が逆向きだったとの指摘を受けて全体を見直した）。
     四十九日・百か日・一周忌・三回忌は一生に一度しか来ないので1本
     ずつ。月命日は毎月来るため、同じ言葉が続いて色あせないよう
     何本も用意し、毎回くじで選ぶ。お誕生日も毎年来るので少しだけ
     選べるようにした。 */
  var MILESTONE_LINE = {
    d49: ['ここまで、そばにいてくれてありがとう。'],
    d100: ['もう、やすらかな場所にいるよ。'],
    monthly: [
      'また、ひと月、いっしょにすごせたね。',
      '今月も、思い出してくれてありがとう。',
      '変わらず、そばにいるよ。',
      'ひと月分、あなたは強くなったね。',
      '今月も、あなたを見守っていたよ。',
      'ずっと応援しているよ。',
      '今日も、ちゃんと見ているよ。',
      '忘れないでいてくれるだけで、じゅうぶんだよ。',
      '今日という日を、選んでくれてありがとう。',
      'また、会いに来てくれたね。',
      'ひと月、よくがんばったね。',
      '今日の気持ちも、そのままでいいんだよ。',
      'あなたとの思い出は、色あせていないよ。',
      'あなたのペースで、いいんだよ。',
      'あの日から、また少し進めたね。',
      '今月も、ここに来てくれてうれしいよ。'
    ],
    y1: ['1年間、忘れずにいてくれてありがとう。'],
    y3: ['ずっと、そばにいるよ。'],
    birthday: ['うまれてきて、よかったよ。', '今日は、うまれた日だね。', '何歳になっても、そばにいるよ。', '今日もいっしょに、お祝いしよう。']
  };
  /* くじではなく、その日1日は同じ一言になるようにする（追記72）。
     1日に何度おまいりしても言葉が変わると、選んでいるように見えて
     しまう。日付＋節目の種類を種にした簡易ハッシュで選び、同じ日
     なら必ず同じ番号を引く（手紙のこだま・pickEchoLetterと同じ
     考え方）。 */
  function pickMilestoneLine(key, dateKey) {
    var arr = MILESTONE_LINE[key]; if (!arr) return null;
    if (arr.length <= 1) return arr[0];
    var seed = key + dateKey, h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return arr[h % arr.length];
  }
  function showAfter(counted) {
    var name = st.pet.name || 'あの子';
    // 大きな節目（四十九日・百か日・一周忌・三回忌・お誕生日）を優先し、
    // 無ければ月命日かどうかを見る。月命日は「手紙のこだま」の対象には
    // 含めない（毎月では、こだまとしては出過ぎてしまうため）ので、
    // S.milestoneToday()とは別に確かめる。
    var big = S.milestoneToday(S.today());
    if (!big) {
      big = S.milestones(S.today()).filter(function (m) { return m.key === 'monthly' && m.days === 0; })[0] || null;
    }
    var line = big && pickMilestoneLine(big.key, S.ymd(S.today()));
    $('#after-line').innerHTML = (big && line) ? (big.label + 'です。<br>' + line) : 'ありがとう。<br>またね。';
    var heaven = $('.heaven'); if (heaven) heaven.classList.toggle('milestone', !!big);
    $('#after-count').textContent = S.visitCount();
    var tally = $('.tally .g');
    tally.innerHTML = counted
      ? '<svg width="26" height="26"><use href="#of-flower"></use></svg>' +
        '<p>庭に<br><b style="color:var(--grass-ink)">花が1つ</b> ふえました</p>'
      : '<svg width="26" height="26"><use href="#of-flower"></use></svg>' +
        '<p>今日の花は<br><b style="color:var(--grass-ink)">もう咲いています</b></p>';
    drawPetals();
    renderSelfAsk();
    S.allMedia('video').then(function (vs) {
      var b = $('#btn-after-vid');
      b.hidden = !vs.length;
      if (vs.length) {
        $('#after-vid-label').textContent = 'うごく' + name + 'を見る';
        b.onclick = function () { playVideo(vs[vs.length - 1]); };
      }
    });
    show('after');
  }

  /* いまの気分。1〜5。1日に1つで、押しなおせば上書きされる。
     この記録がこのアプリの要になる。控えめに扱わない。 */
  function renderSelfAsk() {
    var t = S.today(), v = S.selfOn(t);
    // 目盛りはおまいりのあとと、じぶんの画面の2か所にある。まとめて揃える。
    $$('[data-self] button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(+b.dataset.v === v));
    });
    $$('.selfask').forEach(function (box) {
      box.classList.toggle('done', !!v);
      // 「記録しました」は、こちらが処理を終えた報告に聞こえる。
      // ここで扱っているのはその人の気持ちなので、気持ちの言葉で、誘うように言う。
      // 誘いと、その返事。同じ言葉づかいで対にする。
      box.querySelector('.q').textContent = v ? 'きょうの気持ちを 伝えました'
                                              : 'きょうの気持ちを 伝えましょう';
      var qs = box.querySelector('.qs');
      // 同じ日をもう一度押せば、後から押したほうで上書きされる。それを先に伝える。
      if (qs) qs.textContent = v ? '押しなおせば、あとから変えられます。'
                                 : '良し悪しはありません。いまの感じに近いものを。';
    });
  }

  /* じぶんの画面。この子の画面（にわ）と分けた。
     悲嘆は、失った相手に向き合う時間と、自分の生活を建て直す時間を
     行き来しながら進む（Dual Process Model）。画面を分けたのはその形に合わせたもの。 */
  function renderJibun() {
    renderSelfAsk();
    renderSelfChart();
    var death = S.parseISO(st.pet.deathISO), sp = $('#jibun-since');
    sp.hidden = !death;
    if (death) sp.textContent = 'あれから ' + S.diffDays(death, S.today()).toLocaleString('ja-JP') + '日';
    // 波のグラフの説明を、この子の名で締める。「乗り越える」ではなく
    // 「向き合っていく」にする。悲嘆を終わらせるべきものとして急かさない
    // ため（グラフに目標線を出さないのと同じ考え方）。
    var nw = $('#jibun-note-warm');
    if (nw) nw.textContent = 'あなたがこの悲しみとゆっくり向き合っていく日々を、' + (st.pet.name || 'あの子') + 'もそばで見守っています。';
    var all = S.selfSeries(0);
    // 数えるのは日数と、はじめた日だけ。良し悪しになる数は出さない。
    var first = all.length ? new Date(all[0].day.replace(/-/g, '/')) : null;
    $('#self-stats').innerHTML = all.length
      ? '<div class="stat"><p class="n" style="color:var(--amber-ink)">' + all.length +
        '</p><p class="l">記録した日</p></div>' +
        '<div class="stat"><p class="n" style="color:var(--grass-ink);font-size:var(--fs-6)">' +
        (first.getMonth() + 1) + '/' + first.getDate() + '</p><p class="l">はじめた日</p></div>'
      : '';
  }

  /* 波のグラフ。1本だけなので凡例はいらない。
     平均も目標線も出さない。出すと「上がるべきもの」に見えてしまう。 */
  function renderSelfChart() {
    var data = S.selfSeries(30);
    var box = $('#self-chart'), cap = $('#self-cap');
    if (data.length < 2) {
      box.innerHTML = '<p class="chart-empty">おまいりのあとに、いまの気分を<br>記録できます。' +
        (data.length ? '<br>2回めから、波が見えてきます。' : '') + '</p>';
      cap.textContent = '';
      return;
    }
    // 左の余白は軸の文字にあわせる。「前を向けた」は5文字あり、40pxでは収まらない。
    var W = 320, H = 138, L = 70, R = 12, T = 14, B = 28;
    var iw = W - L - R, ih = H - T - B;
    var x = function (i) { return L + (data.length === 1 ? iw / 2 : iw * i / (data.length - 1)); };
    var y = function (v) { return T + ih - (v - 1) / 4 * ih; };

    var o = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="いまの気分の記録">'];
    // 目盛りは控えめに。5段のうち上下だけ名前をつける
    for (var g = 1; g <= 5; g++) {
      o.push('<line x1="' + L + '" y1="' + y(g) + '" x2="' + (W - R) + '" y2="' + y(g) +
        '" stroke="currentColor" stroke-width="1" opacity="' + (g === 1 || g === 5 ? '.18' : '.08') + '"/>');
    }
    o.push('<text x="' + (L - 8) + '" y="' + (y(5) + 4) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".55">前を向けた</text>');
    o.push('<text x="' + (L - 8) + '" y="' + (y(1) + 4) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".55">重い</text>');

    var pts = data.map(function (d, i) { return x(i).toFixed(1) + ',' + y(d.v).toFixed(1); }).join(' ');
    o.push('<polyline points="' + pts + '" fill="none" stroke="#4B8340" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>');
    data.forEach(function (d, i) {
      o.push('<circle class="pt" data-i="' + i + '" cx="' + x(i).toFixed(1) + '" cy="' + y(d.v).toFixed(1) +
        '" r="4.5" fill="#4B8340" stroke="var(--panel)" stroke-width="2"/>');
      // 触りやすいように、見えない当たり判定を重ねる
      o.push('<circle class="hit" data-i="' + i + '" cx="' + x(i).toFixed(1) + '" cy="' + y(d.v).toFixed(1) +
        '" r="16" fill="transparent"/>');
    });
    var f = new Date(data[0].day.replace(/-/g, '/')), l = new Date(data[data.length - 1].day.replace(/-/g, '/'));
    o.push('<text x="' + L + '" y="' + (H - 8) + '" font-size="11" fill="currentColor" opacity=".55">' +
      (f.getMonth() + 1) + '/' + f.getDate() + '</text>');
    o.push('<text x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".55">' +
      (l.getMonth() + 1) + '/' + l.getDate() + '</text>');
    o.push('</svg>');
    box.innerHTML = o.join('');
    box.style.color = 'var(--muted)';

    var LV = ['', '重かった', 'すこし 重かった', 'ふつう', 'すこし 前を向けた', '前を向けた'];
    var say = function (i) {
      var d = data[i], dd = new Date(d.day.replace(/-/g, '/'));
      cap.textContent = (dd.getMonth() + 1) + '月' + dd.getDate() + '日 ・ ' + LV[d.v];
    };
    say(data.length - 1);
    box.onclick = function (e) {
      var c = e.target.closest('[data-i]'); if (!c) return;
      say(+c.dataset.i);
    };
  }

  /* おまいりのあとに庭へ舞う5つの柄。花びら・紅葉・雪・灯りの粒・ちょうちょ
     ——4動作（灯り・水・ごはん・花）と季節の背景、「見送る」ことにまつわる
     言い伝えなど、すでにこのアプリの中にある題材だけを使う。灯りの粒と
     ちょうちょだけ下から上へ昇らせ、灯籠流しのような見送りの動きにした。
     毎回この中から1つ、直前と同じ柄にならないように選ぶ。 */
  var AFTER_FX = [
    { sym: '#pt-petal', colors: ['#F0B6C4', '#FFD98A', '#CFE6BC'], motion: 'fall' },
    { sym: '#pt-leaf', colors: ['#E58B6D', '#D9A24A', '#C9862A'], motion: 'fall' },
    { sym: '#pt-snow', colors: ['#9FC3DC', '#FFFFFF', '#9CA9A0'], motion: 'fall' },
    { sym: '#pt-light', colors: ['#FFD98A', '#E8A33D', '#F4C67A'], motion: 'rise' },
    { sym: '#pt-fly', colors: ['#F0B6C4', '#FFD98A', '#C9A8DE'], motion: 'flutter' }
  ];
  var lastFx = -1;
  function drawPetals() {
    var i;
    if (lastFx < 0) {
      i = Math.floor(Math.random() * AFTER_FX.length);
    } else {
      i = Math.floor(Math.random() * (AFTER_FX.length - 1));
      if (i >= lastFx) i++;         // 直前と同じ柄を候補から外す
    }
    lastFx = i;
    var fx = AFTER_FX[i];
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 「もっと多く」という要望を受けて7→13に増やした。演出が1画面に
    // 出るのはこのあとの数秒だけなので、多めでも賑やかさが勝る。
    var n = 13, out = [];
    for (var k = 0; k < n; k++) {
      var x = 20 + Math.random() * 300;
      var size = 14 + Math.random() * 9;
      var col = fx.colors[k % fx.colors.length];
      var y0, style;
      if (reduced) {
        // 動かせないときは、以前と同じく画面内に静かに置くだけにする。
        y0 = 20 + Math.random() * 300;
        style = 'color:' + col;
      } else {
        var startsLow = fx.motion === 'rise' || fx.motion === 'flutter';
        y0 = startsLow ? (340 + Math.random() * 40) : (-20 - Math.random() * 60);
        var dur = (3.6 + Math.random() * 2.4).toFixed(2);
        var delay = (Math.random() * 2.6).toFixed(2);
        var sway = Math.round((Math.random() - 0.5) * 60);
        var spin = Math.round((Math.random() - 0.5) * 70);
        style = 'color:' + col + ';--sway:' + sway + 'px;--spin:' + spin + 'deg;' +
          'animation-name:pt-' + fx.motion + ';animation-duration:' + dur + 's;' +
          'animation-delay:' + delay + 's;animation-timing-function:ease-in-out';
      }
      out.push('<g transform="translate(' + x.toFixed(1) + ' ' + y0.toFixed(1) + ')">' +
        '<g class="pt" style="' + style + '">' +
        '<svg width="' + size.toFixed(0) + '" height="' + size.toFixed(0) + '" viewBox="0 0 24 24">' +
        '<use href="' + fx.sym + '"></use></svg></g></g>');
    }
    $('#petals').innerHTML = out.join('');
  }

  /* おりん。毎回まったく同じ音であることが儀式として効くので、鳴らし分けない。 */
  var actx = null;
  function rin() {
    try {
      var C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      actx = actx || new C();
      if (actx.state === 'suspended') actx.resume();
      var now = actx.currentTime, base = 1046.5;
      [[1, 0.45, 3.6], [2.74, 0.18, 2.2], [5.12, 0.07, 1.4]].forEach(function (p) {
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = base * p[0];
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(p[1], now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p[2]);
        o.connect(g).connect(actx.destination);
        o.start(now); o.stop(now + p[2] + 0.1);
      });
    } catch (e) { /* 音が出せない端末でも進む */ }
  }

  /* ============ おまいりの庭 ============
     花は枯れない・減らない・他人と比べない。
     何年も続くと1日ずつでは並べきれなくなるため、3段階でまとめる：
     今月＝1日ごとの花（そなえた実感を、その日のうちに）、
     今年のそれより前の月＝月ごとに1つの中くらいの花、
     去年より前＝年ごとに1つの大きな花。年が変わるたびに、今年の
     月の花たちも自動でその年1つの花へとまとまっていく。どの段階でも
     大きさはその期間どれだけおまいりしたかで決まる（毎日そなえた
     期間ほど大きく咲く）。どの日の分も消えたり隠れたりはしない
     ——数えられ方が変わるだけ（追記54・55）。 */
  var FCOL = ['#F0B6C4', '#FFD98A', '#CFE6BC', '#BEDCEA', '#E8A0A0', '#F5C98C'];
  function renderNiwa() {
    var n = S.visitCount();
    $('#stat-flowers').textContent = n;
    var tg = S.daysTogether();
    $('#stat-days').textContent = tg ? tg.toLocaleString('ja-JP') : '—';

    var visits = st.visits || [];
    var todayISO = S.ymd(S.today());
    var curYear = +todayISO.slice(0, 4), curMonthKey = todayISO.slice(0, 7);

    var yearCounts = {}, yearOrder = [], monthCounts = {}, monthOrder = [], curMonthDays = [];
    visits.forEach(function (v) {
      var y = +v.slice(0, 4), mk = v.slice(0, 7);
      if (mk === curMonthKey) { curMonthDays.push(v); return; }
      if (y === curYear) {
        if (!(mk in monthCounts)) { monthCounts[mk] = 0; monthOrder.push(mk); }
        monthCounts[mk]++;
        return;
      }
      if (!(y in yearCounts)) { yearCounts[y] = 0; yearOrder.push(y); }
      yearCounts[y]++;
    });

    function daysInMonth(mk) { return new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate(); }
    function daysInYear(y) { return ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 366 : 365; }
    function tierScale(ratio, a, b, c) { return ratio >= 0.6 ? c : ratio >= 0.25 ? b : a; }
    function monthScale(mk) { return tierScale(monthCounts[mk] / daysInMonth(mk), 1.35, 1.65, 2.0); }
    function yearScale(y) { return tierScale(yearCounts[y] / daysInYear(y), 2.3, 2.7, 3.2); }
    function monthLabel(mk) { return (+mk.slice(0, 4)) + '年' + (+mk.slice(5, 7)) + '月・' + monthCounts[mk] + '回'; }
    function yearLabel(y) { return y + '年・' + yearCounts[y] + '回'; }
    // 他の画面と同じ花びらの形。丸を2つ重ねただけだと、花ではなく輪に見える
    function flowerG(x, y, scale, col, title) {
      return '<g transform="translate(' + x.toFixed(1) + ' ' + y + ') scale(' + scale + ')">' +
        (title ? '<title>' + esc(title) + '</title>' : '') +
        '<g fill="' + col + '" stroke="#5A4A3A" stroke-width="1.3">' +
        '<ellipse cy="-5.6" rx="3.4" ry="4.2"/><ellipse cx="5" cy="-2" rx="4.2" ry="3.4"/>' +
        '<ellipse cx="3.1" cy="4" rx="3.4" ry="4.2"/><ellipse cx="-3.1" cy="4" rx="3.4" ry="4.2"/>' +
        '<ellipse cx="-5" cy="-2" rx="4.2" ry="3.4"/></g>' +
        '<circle r="3" fill="#FFF6E2" stroke="#5A4A3A" stroke-width="1.2"/></g>';
    }

    var W = 350, colorAt = 0;
    function nextCol() { return FCOL[colorAt++ % FCOL.length]; }
    var yearItems = yearOrder.map(function (y) { return { scale: yearScale(y), col: nextCol(), title: yearLabel(y) }; });
    var monthItems = monthOrder.map(function (mk) { return { scale: monthScale(mk), col: nextCol(), title: monthLabel(mk) }; });
    var dayItems = curMonthDays.map(function (v, i) { return { scale: (1.05 + (i % 3) * 0.11).toFixed(2), col: nextCol() }; });

    // 段ごとに大きさが違うので、それぞれ専用の列数・間隔でレイアウトする
    // （年の花はいちばん大きいので、間隔を広く取って重ならないようにする）。
    function layoutTier(items, perRow, pitch, rowH, topY) {
      var count = items.length, html = '';
      items.forEach(function (it, i) {
        var r = Math.floor(i / perRow), c = i % perRow;
        var inRow = Math.min(perRow, count - r * perRow);
        var startX = (W - inRow * pitch) / 2 + pitch / 2;
        var x = startX + c * pitch, y = topY + r * rowH;
        html += flowerG(x, y, it.scale, it.col, it.title);
      });
      var rows = count ? Math.ceil(count / perRow) : 0;
      return { html: html, height: rows * rowH };
    }
    var yTier = layoutTier(yearItems, 5, 64, 72, 30);
    var mTier = layoutTier(monthItems, 8, 40, 44, 30 + yTier.height);
    var dTier = layoutTier(dayItems, 11, 30, 32, 30 + yTier.height + mTier.height);

    var H = 30 + yTier.height + mTier.height + dTier.height + (n ? 0 : 64) + 34;
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">',
      '<path d="M0 ' + (H - 52) + ' C70 ' + (H - 62) + ' 120 ' + (H - 44) + ' 190 ' + (H - 52) +
      ' C250 ' + (H - 59) + ' 300 ' + (H - 42) + ' ' + W + ' ' + (H - 52) + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="#CFE6BC"/>',
      yTier.html, mTier.html, dTier.html];

    if (!n) out.push('<text x="' + (W / 2) + '" y="' + (H / 2) + '" text-anchor="middle" fill="#7E9B6C" font-size="13">' +
      'はじめてのおまいりで、花が1つ咲きます</text>');
    out.push('</svg>');
    $('#garden').innerHTML = out.join('');

    var ms = S.milestones(S.today());
    renderSelfChart();

    $('#niwa-days').innerHTML = ms.length
      ? '<p style="margin:0 0 10px;font-family:var(--round);font-weight:700;font-size:var(--fs-4)">あの日まで</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' + ms.slice(0, 4).map(function (m, i) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px;' +
            'background:' + (i === 0 ? 'var(--amber-soft)' : 'var(--panel)') + ';border:2px solid ' +
            (i === 0 ? 'var(--amber)' : 'var(--line)') + ';border-radius:16px">' +
            '<span><span style="font-family:var(--round);font-weight:700;font-size:var(--fs-4)">' + esc(m.label) + '</span>' +
            '<span style="display:block;font-size:var(--fs-1);color:var(--muted)">' + esc(m.note) + '</span></span>' +
            '<span style="font-size:var(--fs-2);color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums">' +
            (m.days === 0 ? '<b style="font-size:var(--fs-5);color:var(--amber-ink)">今日</b>'
                          : '<b style="font-family:var(--round);font-size:var(--fs-6);color:var(--ink)">' + m.days + '</b>日') +
            '</span></div>';
        }).join('') + '</div>'
      : '';
    $('#btn-ics').hidden = !ms.length;

    // 大きな節目をすでに過ぎていれば、ふりかえりへの入口を出す。
    // 節目のその日だけでなく、過ぎたあとはいつでも開けるようにする
    // （その日にアプリを開くとは限らないため）。追記46。
    var pm = S.pastMilestones(S.today());
    var rv = $('#niwa-review');
    if (rv) {
      rv.innerHTML = pm.length
        ? '<button class="letter-card" id="btn-review-open" data-go="review" style="margin-top:20px">' +
          '<svg width="26" height="26"><use href="#of-light"></use></svg>' +
          '<span style="flex:1"><span class="t">' + esc(pm[0].label) + 'を迎えて</span>' +
          '<span class="s">これまでの日々を、そっとふりかえる</span></span>' +
          '<span class="arw">›</span></button>'
        : '';
    }
  }

  /* ============ ふりかえり ============
     大きな節目を過ぎたら開ける、これまでの日々の物語。回数を人と比べる
     ためではなく、「ちゃんと続いていた」とだけ気づくためのもの。だから
     見出しにするのは回数そのものではなく、その先の一言（confirm-note）。追記46。 */
  function renderReview() {
    var pm = S.pastMilestones(S.today());
    var top = pm[0], nm = st.pet.name || 'あの子';
    $('#review-title').textContent = (top ? top.label : 'ふりかえり') + 'を迎えて';
    var death = S.parseISO(st.pet.deathISO);
    var days = death ? S.diffDays(death, S.today()) : 0;
    $('#review-sub').textContent = nm + 'を見送ってから、' + days.toLocaleString('ja-JP') + '日。';
    var visits = S.visitCount(), letters = (st.letters || []).length, selfDays = S.selfSeries(0).length;
    $('#review-stats').innerHTML =
      '<div class="stat"><p class="n" style="color:var(--amber-ink)">' + visits + '</p><p class="l">おまいりした回数</p></div>' +
      '<div class="stat"><p class="n" style="color:var(--rose)">' + letters + '</p><p class="l">書いた手紙</p></div>' +
      '<div class="stat"><p class="n" style="color:var(--grass-ink)">' + selfDays + '</p><p class="l">じぶんを記録した日</p></div>';
  }

  /* ============ アルバム ============ */
  function renderAlbum() {
    return S.allMedia('photo').then(function (all) {
      var photos = all.filter(function (p) { return p.id !== 'portrait'; });
      var chs = S.chapters(photos);
      $('#album-empty').hidden = chs.length > 0;
      var tg = S.daysTogether();
      $('#album-sub').textContent = photos.length
        ? photos.length + '枚 ・ ' + chs.length + 'つの章' + (tg ? ' ・ いっしょだった' + tg.toLocaleString('ja-JP') + '日' : '')
        : (tg ? 'いっしょだった' + tg.toLocaleString('ja-JP') + '日' : '写真をくわえてください');
      $('#album-list').innerHTML = chs.map(function (c) {
        var range = S.formatShort(new Date(c.from)) + ' — ' + S.formatShort(new Date(c.to));
        return '<div class="chapter">' +
          '<button class="open" data-open="' + esc(c.id) + '">' +
            '<span class="th"><img src="' + mediaURL(c.photos[0]) + '" alt=""></span>' +
            '<span class="meta"><span class="t">' + esc(c.title || range) + '</span>' +
            '<span class="d">' + (c.title ? range + ' ・ ' : '') + c.photos.length + '枚</span></span>' +
            '<span class="go" aria-hidden="true">›</span>' +
          '</button>' +
          '<button class="more" data-ch="' + esc(c.id) + '" aria-label="この期間の設定">···</button></div>';
      }).join('');
    });
  }

  /* ============ 章のなかみ・写真を大きく ============
     入れた写真は、いつでも自由に見られること。
     アルバムは仕舞い込むためではなく、開くためにある。 */
  var chOpen = null;     // いま開いている章
  var chPhotos = [];     // その章の写真
  var pIndex = 0;        // 大きく見ている写真の位置

  function allPhotos() {
    return S.allMedia('photo').then(function (all) {
      return all.filter(function (p) { return p.id !== 'portrait'; });
    });
  }
  function fillChapter(c) {
    chOpen = c; chPhotos = c.photos;
    var range = S.formatShort(new Date(c.from)) + ' — ' + S.formatShort(new Date(c.to));
    $('#ch-title').textContent = c.title || range;
    $('#ch-sub').textContent = (c.title ? range + ' ・ ' : '') + c.photos.length + '枚';
    $('#ch-grid').innerHTML = c.photos.map(function (ph, i) {
      return '<button class="pcell" data-i="' + i + '">' +
        '<img src="' + mediaURL(ph) + '" alt="' + S.formatShort(new Date(ph.at)) + '" loading="lazy"></button>';
    }).join('');
  }
  function openChapter(id) {
    return allPhotos().then(function (photos) {
      var c = S.chapters(photos).filter(function (x) { return x.id === id; })[0];
      if (!c) return show('album');
      fillChapter(c);
      show('chapter');
    });
  }
  /* 1枚を手がかりに、その写真が入っている章を開き直す。
     章のidは期間から作るので、端の写真を消すとidのほうが変わってしまう。
     消したあとにidで探すと章を見失う。実際に見失った。 */
  function reopenAt(photoId) {
    return allPhotos().then(function (photos) {
      var found = null, at = 0;
      S.chapters(photos).forEach(function (c) {
        c.photos.forEach(function (ph, i) { if (ph.id === photoId) { found = c; at = i; } });
      });
      if (!found) return show('album');
      fillChapter(found);
      openPhoto(at);
    });
  }

  function openPhoto(i) {
    if (!chPhotos.length) return;
    if (!$('#view-photo').classList.contains('on')) chScroll = $('#view-chapter .body').scrollTop;
    pIndex = Math.max(0, Math.min(chPhotos.length - 1, i));
    var ph = chPhotos[pIndex];
    $('#photo-big').src = mediaURL(ph);
    $('#photo-cap').textContent = S.formatShort(new Date(ph.at)) + '  ' + (pIndex + 1) + ' / ' + chPhotos.length;
    // 端では矢印を消す。押せないものを出しておくのは不親切。
    $('#btn-photo-prev').hidden = pIndex === 0;
    $('#btn-photo-next').hidden = pIndex === chPhotos.length - 1;
    show('photo');
  }
  function stepPhoto(d) { openPhoto(pIndex + d); }

  /* 写真をとじたら、一覧の見ていた位置に戻す。
     30枚目を見たあとで先頭に戻されると、探し直しになる。 */
  var chScroll = 0;
  function backToChapter() {
    show('chapter');
    $('#view-chapter .body').scrollTop = chScroll;
  }

  function deletePhoto() {
    var ph = chPhotos[pIndex];
    if (!ph) return;
    // 消したあとに戻る先は、隣の写真そのもの。位置ではなく写真で覚えておく。
    var near = chPhotos[pIndex + 1] || chPhotos[pIndex - 1];
    sheet('この写真を消す', '取り消せません。', [
      { label: '消す', primary: true, on: function () {
          S.deleteMedia(ph.id).then(function () {
            freeURL(ph.id);
            if (!near) return show('album');   // 章ごと空になった
            return reopenAt(near.id);
          });
        } },
      { label: 'やめる' }
    ]);
  }

  /* 追加できたときの、ごく短い手応え。てがみやおまいりのような専用画面を
     作るほどの操作ではないので、上に一瞬出るだけにする。 */
  var toastT = null;
  function toast(msg) {
    var el = $('#toast'); if (!el) return;
    $('#toast-msg').textContent = msg;
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.hidden = true; }, 240);
    }, 1500);
  }

  /* 1枚ずつ順に入れる。1枚失敗しても残りは入れ、最後にまとめて理由を出す。 */
  function addPhotos(files) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) return;
    var btn = $('#btn-add-photos'), orig = btn.innerHTML;
    btn.disabled = true;
    var okCount = 0, fails = {};
    var p = Promise.resolve();
    list.forEach(function (f, i) {
      p = p.then(function () {
        btn.innerHTML = '<span class="busy"></span> ' + (i + 1) + ' / ' + list.length;
        return shrink(f, 1600, 0.84)
          .then(function (blob) {
            return S.putMedia({ id: S.newId('p'), blob: blob, at: f.lastModified || Date.now(), kind: 'photo' });
          })
          .then(function (r) { if (r.ok) okCount++; else fails[r.reason] = (fails[r.reason] || 0) + 1; })
          .catch(function (e) { var k = (e && e.message) || 'unknown'; fails[k] = (fails[k] || 0) + 1; });
      });
    });
    p.then(function () {
      btn.disabled = false; btn.innerHTML = orig;
      return renderAlbum();
    }).then(function () {
      var keys = Object.keys(fails);
      if (okCount && !keys.length) toast(okCount + '枚くわえました');
      if (!keys.length) return;
      sheet('入らなかった写真があります',
        keys.map(function (k) { return '<b>' + fails[k] + '枚</b>：' + esc(reasonText(k)); }).join('<br><br>') +
        (okCount ? '<br><br>' + okCount + '枚は入りました。' : ''),
        [{ label: 'わかりました', primary: true }]);
    });
  }

  /* ============ うごくあの子 ============ */
  function renderVideos() {
    var name = st.pet.name || 'あの子';
    $('#ugoku-h').textContent = 'うごく' + name;
    return S.allMedia('video').then(function (vs) {
      $('#vid-empty').hidden = vs.length > 0;
      $('#ugoku-sub').textContent = vs.length ? vs.length + '本 ・ いつでも、なんども' : 'いつでも、なんども';
      $('#vid-list').innerHTML = vs.map(function (v, i) {
        return tileHTML(v, vs.length === 1 || (i === 0 && vs.length % 2 === 1)).replace('<span class="cap">',
          '<button class="menu" data-vmenu="' + esc(v.id) + '" aria-label="この動画の設定">···</button><span class="cap">');
      }).join('');
      ensureVideoThumbs(vs);
      $('#vid-warn').innerHTML = S.storeInfo().idb ? '' :
        '<div class="tip tip-warn"><svg width="19" height="19" style="color:#9A4A2E"><use href="#ic-info"></use></svg>' +
        '<p>いまの開きかたでは動画を保存できません。ホーム画面に追加してから開くか、SafariやChromeで直接開いてください。</p></div>';
    });
  }

  /* このブラウザで開けるかを先に確かめる。開けないものを保存しても、
     あとで真っ黒な動画が残るだけなので。 */
  function canPlay(file) {
    return new Promise(function (res) {
      var v = document.createElement('video'), u = URL.createObjectURL(file), done = false;
      var end = function (ok) { if (done) return; done = true; clearTimeout(t); URL.revokeObjectURL(u); res(ok); };
      var t = setTimeout(function () { end(false); }, 9000);
      v.onloadedmetadata = function () { end(v.videoWidth > 0 || v.duration > 0); };
      v.onerror = function () { end(false); };
      v.preload = 'metadata';
      v.muted = true;
      v.src = u;
    });
  }

  function addVideos(files) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) return;
    if (!S.storeInfo().video) {
      sheet('動画を保存できません',
        'いまの開きかたでは、動画の置き場所がありません。<br><br>' +
        'アプリをホーム画面に追加してから開くか、SafariやChromeで直接開くと保存できます。',
        [{ label: 'わかりました', primary: true }]);
      return;
    }
    var btn = $('#btn-add-vids'), orig = btn.innerHTML;
    btn.disabled = true;
    var fails = {}, okCount = 0;
    var p = Promise.resolve();
    list.forEach(function (f, i) {
      p = p.then(function () {
        btn.innerHTML = '<span class="busy"></span> ' + (i + 1) + ' / ' + list.length;
        var id = S.newId('v');
        return canPlay(f).then(function (playable) {
          if (!playable) { fails['video-format'] = (fails['video-format'] || 0) + 1; return null; }
          return S.putMedia({ id: id, blob: f, at: f.lastModified || Date.now(), kind: 'video', playable: true });
        })
          .then(function (r) {
            if (!r) return;
            if (r.ok) {
              okCount++;
              st.videoTitles[id] = videoName(f);
              S.save();
            } else fails[r.reason] = (fails[r.reason] || 0) + 1;
          });
      });
    });
    p.then(function () {
      btn.disabled = false; btn.innerHTML = orig;
      return renderVideos();
    }).then(function () {
      var keys = Object.keys(fails);
      if (okCount && !keys.length) toast(okCount + '本くわえました');
      if (!keys.length) return;
      sheet('入らなかった動画があります',
        keys.map(function (k) { return '<b>' + fails[k] + '本</b>：' + esc(reasonText(k)); }).join('<br><br>'),
        [{ label: 'わかりました', primary: true }]);
    });
  }

  /* iPhone はカメラロールの動画に "_users_0484f8d0-…" のようなパスを付けてくる。
     そのまま見出しにすると意味がないので、読めない名前は既定名にする。 */
  function videoName(f) {
    var n = String(f && f.name || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
    if (!n || n.length > 40 || /^_?users?[_-]/i.test(n) || /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(n)) {
      return 'うごくすがた';
    }
    return n.slice(0, 24);
  }

  function playVideo(v) {
    var p = $('#player');
    p.src = mediaURL(v);
    $('#player-title').textContent = st.videoTitles[v.id] || 'うごくすがた';
    show('player');
    var pr = p.play();
    if (pr && pr.catch) pr.catch(function () { /* 自動再生できなければ操作で */ });
  }
  function stopPlayer() {
    var p = $('#player');
    if (p && !p.paused) { try { p.pause(); } catch (e) {} }
  }
  /* ブラウザ既定の再生UIは消したので、画面タップだけで再生／一時停止する。
     何が起きたかは、中央に一瞬だけ出すアイコンで示す（常設のボタンは置かない）。 */
  var flashT = null;
  function showPlayerFlash(playing) {
    var el = $('#player-flash');
    el.querySelector('use').setAttribute('href', playing ? '#ic-pause' : '#ic-play');
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(flashT);
    flashT = setTimeout(function () { el.classList.remove('show'); }, 260);
  }

  /* ============ てがみ（飼い主 → あの子） ============
     お別れの挨拶を、自分の言葉で渡せるようにする。
     書き出しの候補は出すが、何を書くべきかは指定しない。
     すでに「とどけた」ものを書きなおす機能は持たない。届いたあとの手紙を
     直すのは筋が通らないため（消すことだけはできる）。 */
  function renderWrite() {
    var nm = st.pet.name || 'あの子';
    $('#write-to').textContent = nm + ' へ';
    var n = (st.letters || []).length;
    $('#btn-mails2').hidden = !n;
    $('#mails-n2').textContent = n;
    var ta = $('#write-text');
    // 前に打ちかけて閉じてしまったぶんがあれば、そのまま戻す（追記67）
    if (!ta.value) ta.value = S.draft();
    $('#write-count').textContent = ta.value.length;
    $('#btn-send').disabled = !ta.value.trim();
  }

  function renderMails() {
    var list = st.letters || [];
    $('#mail-list').innerHTML = list.length
      ? list.map(function (m, i) {
          var d = new Date(m.at);
          return '<div class="mail"><div class="mail-head"><p class="d">' + S.formatJP(d, true) + '</p>' +
            '<button class="more" data-mail="' + i + '" aria-label="この手紙を消す">···</button></div>' +
            '<p>' + esc(m.text) + '</p></div>';
        }).join('')
      : '<p class="empty">まだ一通もありません。</p>';
  }

  function sendLetter() {
    var ta = $('#write-text'), text = ta.value.trim();
    if (!text) return;
    S.addLetter(text);
    ta.value = '';
    S.setDraft('');
    $('#sent-line').textContent = (st.pet.name || 'あの子') + 'に、とどきました。';
    show('sent');
    // 演出をやり直せるよう、入るたびに掛け直す
    var env = $('#fly-env'), line = $('#sent-line');
    [env, line].forEach(function (el) {
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    });
  }

  /* ============ 設定 ============ */
  function applyTheme() {
    var night = st.theme === 'night';
    document.documentElement.setAttribute('data-theme', night ? 'night' : 'day');
    if (window.TomoshibiNative) window.TomoshibiNative.setStatusBarStyle(night);
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', night ? '#1B1A18' : '#FDFAF2');
    // color-scheme を明示しないと、Androidの「ウェブサイトを自動的に暗くする」機能が
    // 宣言のないページをヒューリスティックに反転させ、このクリーム地が意図せず
    // 黒っぽく壊れることがある。iOSにはこの挙動がなく気づきにくい。
    // 設定の昼/夜どちらかを必ず明示して、その勝手な色替えを止める。
    // ついでにフォーム部品（日付選択・スクロールバーなど）の既定色も画面のテーマに揃う。
    document.documentElement.style.colorScheme = night ? 'dark' : 'light';
  }
  function renderSettings() {
    $$('#seg-theme button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === (st.theme === 'night' ? 'night' : 'day'))); });
    var boxNotify = $('#box-notify');
    if (boxNotify) boxNotify.hidden = !(window.TomoshibiNative && window.TomoshibiNative.isNative);
    $$('#seg-notify button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === (st.notifyMilestones ? 'on' : 'off'))); });
    $$('#seg-opening button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === (st.openingOff ? 'off' : 'on'))); });
    $$('#seg-ashes-display button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === (st.pet.ashesShowPhoto ? 'photo' : 'illust'))); });
    var si = S.storeInfo();
    $('#store-state').textContent =
      (si.embedded ? '試し用（消えます）' : si.durable ? 'この端末の中・保護あり' : si.idb ? 'この端末の中' : '写真のみ') + ' ›';
    $('#warn-ephemeral').hidden = !si.embedded;
    $('#app-version').textContent = 'Ver ' + APP_VERSION;
    $('#scenepick-set').innerHTML = scenePickHTML(sceneRaw());
    renderKaimyo();
  }

  /* 戒名を1字ずつの箱にして縦に積む。書体に縦書きの字送りが無くても、これなら必ず立つ。 */
  function brushHTML(text) {
    return Array.from(String(text || '')).map(function (c) {
      return '<i>' + esc(c) + '</i>';
    }).join('');
  }
  /* 絵の高さは端末によって変わるので、決め打ちにせず実際に測る。
     上下に22pxずつ残したぶんに字数を収める。1字の高さは字の大きさの1.16倍
     （.kaimyo-v i の行送り）。 */
  function fitBrush(len) {
    var sc = $('#view-home .scene');
    // 「戒名」の注記（10px + 下の余白5px）ぶんも、絵の高さの予算から先に差し引く。
    // ここを引かないと、注記を足した高さで本文の字がはみ出しうる。
    var h = (sc && sc.clientHeight ? sc.clientHeight : 224) - 44 - 15;
    return Math.max(9, Math.min(21, Math.floor(h / (Math.max(1, len) * 1.16))));
  }

  /* 戒名の欄。どの字がどこから来たかを開いて見せる。
     由来の分からない名を押しつけるのは、贈りものではなく押しつけになる。 */
  function renderKaimyo() {
    var own = (st.pet.kaimyo || '').trim();
    var off = !!st.pet.kaimyoOff;
    var shown = off ? '' : (own || S.kaimyoAuto());
    var box = $('#set-kaimyo');
    var blank = off || !shown;
    box.classList.toggle('off', blank);
    if (blank) box.textContent = off ? '出していません' : '（なまえと命日を入れると決まります）';
    else box.innerHTML = brushHTML(shown);

    var why = $('#set-kaimyo-why');
    var k = (!off && !own) ? S.kaimyoParts() : null;
    why.innerHTML = k
      ? '<div class="whylist">' +
        '<div class="whyrow"><b>' + esc(k.michi) + '</b><span>' + esc(k.michiWhy) + '</span></div>' +
        '<div class="whyrow"><b>' + esc(k.head) + '</b><span>' + esc(k.headWhy) + '</span></div>' +
        '<div class="whyrow"><b>' + esc(k.sue) + '</b><span>' + esc(k.sueWhy) + '</span></div>' +
        '<div class="whyrow"><b>' + esc(k.kurai) + '</b><span>ペットの供養で広く使われる結び</span></div>' +
        '</div>'
      : own && !off ? '<p class="cap" style="margin:10px 0 0">あなたが書いた名です。</p>' : '';

    $('#btn-kaimyo-auto').hidden = !own;
    $('#kaimyo-off-label').textContent = off ? '出す' : '出さない';
  }

  function editKaimyo() {
    var now = (st.pet.kaimyo || '').trim() || S.kaimyoAuto();
    var v = window.prompt('戒名', now);
    if (v === null) return;
    // アプリが選んだ名と同じなら、書いたことにしない。以後も生年月日にあわせて変わる。
    S.setKaimyo(v.trim() === S.kaimyoAuto() ? '' : v);
    renderKaimyo();
  }

  function exportAll() {
    sheet('バックアップを書き出す',
      '写真・動画・記録をまとめた1つのファイルにします。動画があると大きくなるので、少し時間がかかります。<br><br>' +
      '端末を変えるときは、このファイルを新しい端末で読み込ませてください。',
      [{ label: '書き出す', primary: true, on: doExport }, { label: 'やめる' }]);
  }
  function doExport() {
    sheet('書き出しています', '<span class="busy"></span> しばらくお待ちください', []);
    S.allMedia().then(function (all) {
      return all.reduce(function (p, rec) {
        return p.then(function (acc) {
          // assets に置いたものは手元に blob がないので、取り直してから書き出す
          var get = rec.blob ? Promise.resolve(rec.blob)
                             : fetch(rec.url).then(function (r) { return r.blob(); });
          return get.then(function (b) {
            return new Promise(function (res) {
              var r = new FileReader();
              r.onload = function () { acc.push({ id: rec.id, at: rec.at, kind: rec.kind, dataURL: r.result }); res(acc); };
              r.onerror = function () { res(acc); };
              r.readAsDataURL(b);
            });
          }).catch(function () { return acc; });
        });
      }, Promise.resolve([]));
    }).then(function (media) {
      var out = { app: 'ともしび', exportedAt: new Date().toISOString(), data: st, media: media };
      var text = JSON.stringify(out);
      closeSheet();
      var name = 'tomoshibi-' + S.ymd(new Date()) + '.json';
      var blob = new Blob([text], { type: 'application/json' });
      var okMsg = function () {
        sheet('書き出しました',
          media.length + '件の写真・動画をふくむファイルを保存しました。<br><br>' +
          '新しい端末では、設定の<b>「バックアップから戻す」</b>でこのファイルを読み込ませてください。',
          [{ label: 'とじる', primary: true }]);
      };

      // claude.ai の画面ではブラウザのダウンロードが効かないので、用意された保存口を使う
      var dl = S.downloader();
      if (dl) {
        dl.save({ filename: name, data: blob }).then(okMsg).catch(function (e) {
          if (e && e.code === 'declined') return;
          copyOut(text, media.length);
        });
        return;
      }
      var embedded = false;
      try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
      if (embedded) { copyOut(text, media.length); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
      okMsg();
    });
  }
  /* 埋め込みで開かれているとダウンロードが働かない。
     持ち出せると約束した以上、黙って失敗させずコピーの道を出す。 */
  function copyOut(text, n) {
    var mb = (text.length / 1048576).toFixed(1);
    sheet('バックアップを書き出す',
      'いまの開きかたではファイルを保存できないため、中身をそのままお渡しします。' +
      n + '件をふくむ ' + mb + 'MB です。<br><br>' +
      '<textarea id="export-text" readonly rows="4" style="width:100%;font-size:var(--fs-1);background:var(--bg);' +
      'color:var(--muted);border:2px solid var(--line);border-radius:12px;padding:10px"></textarea>',
      [{ label: 'コピーする', primary: true, keep: true, on: function () {} }]);
    var ta = $('#export-text'); if (ta) ta.value = text;
    var btn = $('#sheet-root [data-act="0"]');
    if (btn) btn.onclick = function () {
      var t = $('#export-text');
      t.select(); t.setSelectionRange(0, t.value.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value).catch(function () {});
      btn.textContent = 'コピーしました';
    };
  }

  /* ============ だいじな日をカレンダーに ============
     節目の通知はプッシュ通知では作らない。バックグラウンド配信には自前サーバーが要り、
     「どこにも送らない」という core の約束と衝突する。かわりに、端末の中だけで
     .ics ファイルを組み立て、OS標準のカレンダーアプリに登録先を任せる。
     月命日・お誕生日は繰り返し（RRULE）、四十九日などその子だけの日は単発にする。 */
  function icsPad(n) { return (n < 10 ? '0' : '') + n; }
  function icsDateStamp(d) {
    return d.getUTCFullYear() + icsPad(d.getUTCMonth() + 1) + icsPad(d.getUTCDate()) +
      'T' + icsPad(d.getUTCHours()) + icsPad(d.getUTCMinutes()) + icsPad(d.getUTCSeconds()) + 'Z';
  }
  function icsDate(d) { return d.getFullYear() + icsPad(d.getMonth() + 1) + icsPad(d.getDate()); }
  function icsText(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }

  function buildICS() {
    var death = S.parseISO(st.pet.deathISO);
    if (!death) return null;
    var name = st.pet.name || 'あの子';
    var stamp = icsDateStamp(new Date());
    var uidBase = 'tomoshibi-' + (st.pet.deathISO || '') + '-';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//tomoshibi//ja', 'CALSCALE:GREGORIAN'];
    function vevent(key, date, summary, rrule) {
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + uidBase + key + '@tomoshibi.local');
      lines.push('DTSTAMP:' + stamp);
      lines.push('DTSTART;VALUE=DATE:' + icsDate(date));
      lines.push('SUMMARY:' + icsText(summary));
      if (rrule) lines.push('RRULE:' + rrule);
      lines.push('END:VEVENT');
    }
    vevent('d49', S.addDays(death, 48), name + 'の四十九日');
    vevent('d100', S.addDays(death, 99), name + 'の百か日');
    vevent('y1', S.addYears(death, 1), name + 'の一周忌');
    vevent('y3', S.addYears(death, 2), name + 'の三回忌');
    vevent('monthly', death, name + 'の月命日', 'FREQ=MONTHLY');
    var birth = S.parseISO(st.pet.birthISO);
    if (birth) vevent('birthday', birth, name + 'のお誕生日', 'FREQ=YEARLY');
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  function icsCopyOut(ics) {
    sheet('カレンダーに追加する',
      'いまの開きかたではファイルを保存できないため、中身をそのままお渡しします。<br><br>' +
      '<textarea id="ics-text" readonly rows="4" style="width:100%;font-size:var(--fs-1);background:var(--bg);' +
      'color:var(--muted);border:2px solid var(--line);border-radius:12px;padding:10px"></textarea>',
      [{ label: 'コピーする', primary: true, keep: true, on: function () {} }]);
    var ta = $('#ics-text'); if (ta) ta.value = ics;
    var btn = $('#sheet-root [data-act="0"]');
    if (btn) btn.onclick = function () {
      var t = $('#ics-text');
      t.select(); t.setSelectionRange(0, t.value.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (!ok && navigator.clipboard) navigator.clipboard.writeText(t.value).catch(function () {});
      btn.textContent = 'コピーしました';
    };
  }

  function downloadICS() {
    var ics = buildICS();
    if (!ics) return;
    var name = 'tomoshibi-' + (st.pet.name || 'pet') + '.ics';
    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var okMsg = function () {
      sheet('カレンダーに追加しました',
        '月命日・お誕生日・四十九日などの日を書き出しました。<br><br>' +
        'お使いのカレンダーアプリ（カレンダー・Googleカレンダーなど）で、届いたファイルを開いて取りこんでください。',
        [{ label: 'とじる', primary: true }]);
    };
    var dl = S.downloader();
    if (dl) {
      dl.save({ filename: name, data: blob }).then(okMsg).catch(function (e) {
        if (e && e.code === 'declined') return;
        icsCopyOut(ics);
      });
      return;
    }
    var embedded = false;
    try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
    if (embedded) { icsCopyOut(ics); return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    okMsg();
  }

  /* ============ 大事な日のお知らせ（ストア配信版のみ） ============
     サーバーを使わず、端末のOSに予定を渡すだけ（buildICS()と同じ発想の通知版）。
     トグルを変えるたび・アプリを開くたびに、いったん全部キャンセルしてから
     今日の日付で組みなおす。月命日・お誕生日は「次の1回」だけを組み、
     次にアプリを開いたときにまた次の1回へ張り替えていく。 */
  function syncMilestoneNotifications() {
    var nat = window.TomoshibiNative;
    if (!nat || !nat.isNative) return;
    if (!st.notifyMilestones) { nat.cancelMilestoneNotifications(); return; }
    var name = st.pet.name || 'あの子';
    var LABEL = {
      d49: name + 'の四十九日です', d100: name + 'の百か日です', monthly: name + 'の月命日です',
      y1: name + 'の一周忌です', y3: name + 'の三回忌です', birthday: name + 'のお誕生日です'
    };
    var ORDER = ['d49', 'd100', 'monthly', 'y1', 'y3', 'birthday'];
    var byKey = {};
    S.milestones(S.today()).forEach(function (m) { byKey[m.key] = m; });
    var items = [];
    ORDER.forEach(function (key) {
      var m = byKey[key]; if (!m) return;
      items.push({
        title: 'ともしび',
        body: LABEL[key],
        date: new Date(m.date.getFullYear(), m.date.getMonth(), m.date.getDate(), 9, 0, 0)
      });
    });
    nat.cancelMilestoneNotifications().then(function () { return nat.scheduleMilestoneNotifications(items); });
  }

  /* ============ シート ============ */
  function sheet(title, html, actions) {
    var root = $('#sheet-root');
    root.innerHTML = '<div class="sheet"><button class="veil" aria-label="とじる"></button>' +
      '<div class="panel" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3>' +
      (html ? '<p>' + html + '</p>' : '') + '<div class="acts">' +
      actions.map(function (a, i) {
        return '<button class="btn ' + (a.primary ? 'btn-amber' : 'btn-line') + '" data-act="' + i + '">' + esc(a.label) + '</button>';
      }).join('') + '</div></div></div>';
    root.querySelector('.veil').onclick = closeSheet;
    actions.forEach(function (a, i) {
      var b = root.querySelector('[data-act="' + i + '"]');
      if (!b) return;
      b.onclick = function () { if (!a.keep) closeSheet(); if (a.on) a.on(); };
    });
    var f = root.querySelector('.panel .btn'); if (f) f.focus();
  }
  function closeSheet() { $('#sheet-root').innerHTML = ''; }

  /* ============ 配線 ============ */
  function wire() {
    $('#btn-next').onclick = onboNext;
    $('#btn-back').onclick = function () { if (step > 0) { step--; renderOnbo(); } };
    $('#btn-skip').onclick = function () { step++; renderOnbo(); };
    $('#btn-onbo-close').onclick = function () { onboEditMode = false; show('settings'); };
    $('#in-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') onboNext(); });
    $('#kindpick').addEventListener('click', function (e) {
      var b = e.target.closest('[data-kind]'); if (!b) return;
      st.pet.kind = b.dataset.kind; S.save();
      $$('#kindpick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      paintFaces();
      var pa = $('#pick-art'); if (pa) pa.innerHTML = '<use href="' + artRef() + '"></use>';
    });
    $('#scenepick-onbo').addEventListener('click', function (e) {
      // .sw（丸い見本）にも data-scene があるため、closest は button に絞る
      var b = e.target.closest('button[data-scene]'); if (!b) return;
      st.pet.scene = b.dataset.scene; S.save();
      $$('#scenepick-onbo button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
    $('#in-fave').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (addFave(this.value)) { this.value = ''; renderFaveEdit(); }
    });
    $('#fave-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-favedel]'); if (!b) return;
      var n = b.dataset.favedel;
      st.pet.faves = (st.pet.faves || []).filter(function (x) { return x !== n; });
      S.save(); renderFaveEdit();
    });
    $('#in-message').addEventListener('input', function () { $('#in-message-count').textContent = this.value.length; });
    $('#in-message').addEventListener('keydown', function (e) { if (e.key === 'Enter') onboNext(); });

    // ストア配信版ではOS標準のカメラ／フォト選択を使う。ブラウザ・PWAでは
    // 従来どおり隠しinputへ。isNativeでしか分岐しないので、この端末での
    // 挙動はどちらか一方に決まり、切り替わったりはしない。
    $('#btn-pick').onclick = function () {
      var nat = window.TomoshibiNative;
      if (nat && nat.isNative) { nat.takePhoto().then(function (f) { if (f) pickPortrait(f); }); return; }
      $('#in-photo').click();
    };
    $('#in-photo').onchange = function (e) { pickPortrait(e.target.files && e.target.files[0]); e.target.value = ''; };
    $('#btn-ashes-pick').onclick = function () {
      var nat = window.TomoshibiNative;
      if (nat && nat.isNative) { nat.takePhoto().then(function (f) { if (f) pickAshes(f); }); return; }
      $('#in-ashes').click();
    };
    $('#in-ashes').onchange = function (e) { pickAshes(e.target.files && e.target.files[0]); e.target.value = ''; };

    /* 写真の位置あわせ。指（マウス）でなぞって動かす。ドラッグ中は pick-face だけ
       その場で動かし（毎回 paintFaces で作り直すと重い・ちらつく）、離した瞬間に
       保存して他の3か所（home/おまいり/おまいりのあと）にも反映する。 */
    var faceDrag = null;
    $('#pick-face').addEventListener('pointerdown', function (e) {
      if (!faceURL) return;
      var img = $('#pick-face img'); if (!img || !img.naturalWidth) return;
      e.preventDefault();
      if (this.setPointerCapture) this.setPointerCapture(e.pointerId);
      faceDrag = {
        x0: e.clientX, y0: e.clientY,
        fx: st.pet.faceX != null ? st.pet.faceX : 0.5,
        fy: st.pet.faceY != null ? st.pet.faceY : 0.5,
        nw: img.naturalWidth, nh: img.naturalHeight,
        bw: img.parentElement.clientWidth, bh: img.parentElement.clientHeight
      };
    });
    $('#pick-face').addEventListener('pointermove', function (e) {
      if (!faceDrag) return;
      var z = st.pet.faceZoom || 1;
      var scale = Math.max(faceDrag.bw / faceDrag.nw, faceDrag.bh / faceDrag.nh) * z;
      var rw = faceDrag.nw * scale, rh = faceDrag.nh * scale;
      var maxX = Math.max(0, rw - faceDrag.bw), maxY = Math.max(0, rh - faceDrag.bh);
      var dx = e.clientX - faceDrag.x0, dy = e.clientY - faceDrag.y0;
      // 右へなぞる＝写真を右へ動かす＝見えるのは写真の左側が増える、なのでxは減らす
      st.pet.faceX = Math.max(0, Math.min(1, maxX ? faceDrag.fx - dx / maxX : 0.5));
      st.pet.faceY = Math.max(0, Math.min(1, maxY ? faceDrag.fy - dy / maxY : 0.5));
      if (pickPlace) pickPlace();
    });
    function faceDragEnd() {
      if (!faceDrag) return;
      faceDrag = null;
      S.save(); paintFaces();
    }
    $('#pick-face').addEventListener('pointerup', faceDragEnd);
    $('#pick-face').addEventListener('pointercancel', faceDragEnd);

    $('#in-facezoom').addEventListener('input', function () {
      st.pet.faceZoom = (+this.value) / 100;
      if (pickPlace) pickPlace();
    });
    $('#in-facezoom').addEventListener('change', function () { S.save(); paintFaces(); });

    $('#btn-omairi').onclick = startRitual;
    $('#ritual').addEventListener('click', function (e) {
      var b = e.target.closest('.offer');
      if (b && !b.disabled) tapOffer(+b.dataset.i);
    });
    $('#omairi-faves').addEventListener('click', function (e) {
      if (e.target.closest('#btn-fave-add')) {
        var n = window.prompt('好きだったもの', '');
        if (n && addFave(n)) renderRitual();
        return;
      }
      var b = e.target.closest('button[data-fave]'); if (!b) return;
      var n2 = b.dataset.fave;
      if (sessionFaves[n2]) return;
      // 4動作と同じ、タップしたその場でそなえる（選ぶ→確定の2段階にしない）。
      S.putFave(S.today(), n2);
      sessionFaves[n2] = true;
      justOffered[n2] = true;
      renderRitual();
      toast(n2 + '、そなえました');
    });
    $('#btn-omairi-close').onclick = function () {
      if (rstep >= 4) showAfter(rcounted); else show('home');
    };
    $('#btn-after-close').onclick = function () { show('home'); };

    $('#btn-add-photos').onclick = function () { $('#in-photos').click(); };
    $('#in-photos').onchange = function (e) { addPhotos(e.target.files); e.target.value = ''; };
    $('#btn-add-vids').onclick = function () { $('#in-vids').click(); };
    $('#in-vids').onchange = function (e) { addVideos(e.target.files); e.target.value = ''; };

    $('#album-list').addEventListener('click', function (e) {
      var o = e.target.closest('[data-open]');
      if (o) return openChapter(o.dataset.open);
      var m = e.target.closest('[data-ch]'); if (!m) return;
      sheet('この期間', '', [
        { label: '写真を見る', primary: true, on: function () { openChapter(m.dataset.ch); } },
        { label: '名前をつける', on: function () { renameChapter(m.dataset.ch); } },
        { label: 'とじる' }
      ]);
    });

    $('#ch-grid').addEventListener('click', function (e) {
      var c = e.target.closest('[data-i]'); if (!c) return;
      openPhoto(parseInt(c.dataset.i, 10));
    });
    $('#btn-photo-prev').onclick = function () { stepPhoto(-1); };
    $('#btn-photo-next').onclick = function () { stepPhoto(1); };
    $('#btn-photo-close').onclick = function () { backToChapter(); };
    $('#btn-photo-menu').onclick = function () {
      sheet('この写真', '', [
        { label: '消す', on: deletePhoto },
        { label: 'とじる' }
      ]);
    };
    // 指では左右に払って送り、パソコンでは矢印と矢印キーで送る。
    var tx = null;
    $('#photo-big').addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    $('#photo-big').addEventListener('touchend', function (e) {
      if (tx === null) return;
      var dx = e.changedTouches[0].clientX - tx; tx = null;
      if (Math.abs(dx) > 45) stepPhoto(dx < 0 ? 1 : -1);
    });
    document.addEventListener('keydown', function (e) {
      if (!$('#view-photo').classList.contains('on')) return;
      if (e.key === 'ArrowLeft') stepPhoto(-1);
      if (e.key === 'ArrowRight') stepPhoto(1);
      if (e.key === 'Escape') backToChapter();
    });

    document.addEventListener('click', function (e) {
      var menu = e.target.closest('[data-vmenu]');
      if (menu) {
        e.stopPropagation();
        var id = menu.dataset.vmenu;
        sheet('この動画', '', [
          { label: '名前をつける', on: function () { renameVideo(id); } },
          { label: '消す', on: function () {
              sheet('この動画を消す', '取り消せません。', [
                { label: '消す', primary: true, on: function () {
                    freeURL(id); delete st.videoTitles[id]; delete st.videoThumbs[id]; S.save();
                    S.deleteMedia(id).then(renderVideos).then(renderHomeVideos);
                  } },
                { label: 'やめる' }
              ]);
            } },
          { label: 'とじる' }
        ]);
        return;
      }
      var tile = e.target.closest('[data-vid]');
      if (tile) S.getMedia(tile.dataset.vid).then(function (v) { if (v) playVideo(v); });
    });
    $('#btn-player-close').onclick = function () { show(lastTab); };
    $('#player').addEventListener('click', function () {
      var p = $('#player');
      if (p.paused) { var pr = p.play(); if (pr && pr.catch) pr.catch(function () {}); }
      else p.pause();
      showPlayerFlash(!p.paused);
    });

    // 「てがみを書く」は、いつ押しても書く画面へ。
    // 以前は1通でもあると一覧が開いていた。押した言葉と起きることが違っていた。
    $('#btn-write').onclick = function () { show('write'); };
    $('#btn-mails').onclick = function () { show('mails'); };
    $('#btn-echo-close').onclick = function () { S.dismissEcho(S.today()); paintLetterEcho(S.today()); };
    $('#btn-write2').onclick = function () { show('write'); };
    $('#btn-mails2').onclick = function () { show('mails'); };
    $('#btn-mails-close2').onclick = function () { show('home'); };
    $('#btn-write-close').onclick = function () { $('#write-text').value = ''; S.setDraft(''); show('home'); };
    $('#btn-mails-close').onclick = function () { show('home'); };
    $('#mail-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mail]'); if (!b) return;
      var i = +b.dataset.mail;
      sheet('この手紙を消す', '取り消せません。', [
        { label: '消す', primary: true, on: function () { S.deleteLetter(i); renderMails(); } },
        { label: 'やめる' }
      ]);
    });
    $('#btn-sent-close').onclick = function () { show('home'); };
    $('#write-text').addEventListener('input', function () {
      $('#write-count').textContent = this.value.length;
      $('#btn-send').disabled = !this.value.trim();
      S.setDraft(this.value);
    });
    $('#starters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var ta = $('#write-text');
      ta.value = ta.value ? ta.value.replace(/\s*$/, '') + '\n' + b.dataset.t : b.dataset.t;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      $('#write-count').textContent = ta.value.length;
      $('#btn-send').disabled = false;
      S.setDraft(ta.value);
    });
    $('#btn-send').onclick = sendLetter;

    $('#btn-settings').onclick = function () { show('settings'); };
    $('#btn-settings-close').onclick = function () { show('home'); };
    $('#seg-theme').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      st.theme = b.dataset.v; S.save(); applyTheme(); renderSettings();
    });
    $('#seg-opening').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      st.openingOff = b.dataset.v === 'off'; S.save(); renderSettings();
    });
    var segNotify = $('#seg-notify');
    if (segNotify) segNotify.addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      var on = b.dataset.v === 'on';
      if (!on) { st.notifyMilestones = false; S.save(); renderSettings(); syncMilestoneNotifications(); return; }
      window.TomoshibiNative.requestNotifyPermission().then(function (granted) {
        st.notifyMilestones = !!granted;
        S.save(); renderSettings(); syncMilestoneNotifications();
        if (!granted) {
          sheet('通知が許可されていません',
            '端末の設定アプリから、ともしびの通知を許可してください。',
            [{ label: 'わかった', primary: true }]);
        }
      });
    });
    $('#seg-ashes-display').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      st.pet.ashesShowPhoto = b.dataset.v === 'photo'; S.save(); renderSettings(); paintAshes();
    });
    $('#scenepick-set').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-scene]'); if (!b) return;
      st.pet.scene = b.dataset.scene; S.save(); renderSettings();
    });
    $('#btn-export').onclick = exportAll;
    $('#btn-ics').onclick = downloadICS;
    $('#btn-import').onclick = function () {
      sheet('バックアップから戻す',
        'いま入っているものは、いったん全部消してから入れ直します。<br><br>' +
        '先に「バックアップを書き出す」で、いまの中身を保存しておけます。',
        [{ label: 'ファイルをえらぶ', primary: true, on: function () { $('#in-backup').click(); } },
         { label: 'やめる' }]);
    };
    $('#in-backup').onchange = function (e) {
      var f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      sheet('戻しています', '<span class="busy"></span> 写真や動画の数だけ時間がかかります', []);
      var r = new FileReader();
      r.onload = function () {
        var pack = null;
        try { pack = JSON.parse(r.result); } catch (x) {}
        if (!pack) { closeSheet(); sheet('戻せませんでした', 'このファイルは読み取れませんでした。', [{ label: 'とじる', primary: true }]); return; }
        S.restoreAll(pack).then(function (res) {
          closeSheet();
          if (!res.ok) {
            sheet('戻せませんでした', 'このファイルは、ともしびのバックアップではないようです。', [{ label: 'とじる', primary: true }]);
            return;
          }
          sheet('戻しました',
            res.restored + '件の写真・動画を入れ直しました。' +
            (res.failed ? '<br><br>' + res.failed + '件は入りませんでした（端末の空きが足りないか、開けない形式でした）。' : ''),
            [{ label: 'はじめる', primary: true, on: function () { location.reload(); } }]);
        });
      };
      r.onerror = function () { closeSheet(); sheet('戻せませんでした', 'ファイルを読み取れませんでした。', [{ label: 'とじる', primary: true }]); };
      r.readAsText(f);
    };
    $('#btn-profile').onclick = function () {
      step = 0;
      onboEditMode = true;
      $('#in-name').value = st.pet.name;
      $('#in-death').value = st.pet.deathISO;
      $('#in-birth').value = st.pet.birthISO;
      $$('#kindpick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.kind === st.pet.kind)); });
      $('#btn-pick').textContent = faceURL ? 'えらびなおす' : '写真をえらぶ';
      $('#pick-msg').textContent = faceURL ? '' : 'まだ写真はありません';
      $('#btn-ashes-pick').textContent = ashesURL ? 'えらびなおす' : '写真をえらぶ';
      $('#ashes-msg').textContent = ashesURL ? '' : 'まだ写真はありません';
      $('#in-fave').value = '';
      renderOnbo(); show('onbo');
    };
    $('#btn-kaimyo-edit').onclick = editKaimyo;
    $('#btn-kaimyo-auto').onclick = function () {
      sheet('アプリの名にもどす', '書いた戒名は消えます。', [
        { label: 'もどす', primary: true, on: function () { S.setKaimyo(''); renderKaimyo(); } },
        { label: 'やめる' }
      ]);
    };
    $('#btn-kaimyo-off').onclick = function () {
      S.setKaimyoOff(!st.pet.kaimyoOff);
      renderKaimyo();
    };

    $('#btn-store').onclick = function () {
      var i = S.storeInfo();
      var body = '写真も動画も記録も、<b>この端末の中だけ</b>に保存しています。' +
        'どこにも送っていないので、外に漏れることはありません。<br><br>';
      if (i.embedded) {
        body += '<b>ただし、いまの開きかたは試し用です。</b>アプリを閉じると、入れたものが消えることがあります。' +
          '（この画面は別のページの中に埋め込まれていて、そこでの保存は一時的なものとして扱われるためです）<br><br>' +
          'ずっと残したいときは、<b>ホーム画面に追加してから開いてください。</b>';
      } else if (!i.idb) {
        body += 'いまの開きかたでは、写真1枚ぶんしか保存できません。<br>' +
          'ホーム画面に追加してから開くか、SafariやChromeで直接開いてください。';
      } else if (i.durable) {
        body += '<b>消されない保存になっています。</b>ブラウザが自動で消すことはありません。';
      } else {
        body += '長いあいだ開かないと、ブラウザが自動で消すことがあります。<br>' +
          '<b>ホーム画面に追加しておく</b>と、消されにくくなります。';
      }
      body += '<br><br>端末を変えるときは、設定の「バックアップを書き出す」で持ち出して、新しい端末で読み込ませてください。';
      sheet('保存のようす', body, [{ label: 'とじる', primary: true }]);
    };

    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-self]'); if (!g) return;
      var b = e.target.closest('[data-v]'); if (!b) return;
      S.putSelf(S.today(), +b.dataset.v);
      renderSelfAsk();
      if ($('#view-jibun').classList.contains('on')) renderJibun();
    });

    $('#btn-reset').onclick = function () {
      sheet('この端末のデータを消す',
        'なまえ・日づけ・おまいりの記録・写真・動画を、この端末から消します。取り消せません。<br><br>先に「バックアップを書き出す」で持ち出しておけます。',
        [{ label: '消す', on: confirmHardReset }, { label: 'やめる', primary: true }]);
    };
  }

  function renameChapter(id) {
    var name = window.prompt('この期間の名前', st.chapterTitles[id] || '');
    if (name === null) return;
    if (name.trim()) st.chapterTitles[id] = name.trim().slice(0, 24); else delete st.chapterTitles[id];
    S.save(); renderAlbum();
  }
  function renameVideo(id) {
    var name = window.prompt('この動画の名前', st.videoTitles[id] || '');
    if (name === null) return;
    st.videoTitles[id] = (name.trim() || 'うごくすがた').slice(0, 24);
    S.save(); renderVideos(); renderHomeVideos();
  }
  /* 端末のデータを消すのは、取り消せない・気づいたら押していた、が
     いちばん困る操作。1回の確認では押し間違いを拾いきれないため、
     もう一段、はっきりした言葉で念を押してから実行する。 */
  function confirmHardReset() {
    sheet('本当に消しますか？',
      'この操作は取り消せません。<br>消したあとに戻せるのは、書き出しておいたバックアップからだけです。',
      [{ label: '消す', on: hardReset }, { label: 'やめる', primary: true }]);
  }
  function hardReset() {
    S.allMedia().then(function (all) {
      return Promise.all(all.map(function (m) { return S.deleteMedia(m.id); }));
    }).catch(function () {}).then(function () {
      S.reset();
      try { localStorage.removeItem('tomoshibi.media.portrait'); } catch (e) {}
      location.reload();
    });
  }

  /* 再生からもどる先を覚えておく */
  var lastTab = 'home';
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-go]');
    if (t && t.dataset.go !== 'player') lastTab = t.dataset.go;
  }, true);

  /* ============ 起動 ============ */
  function enterApp() {
    if (st.onboarded) show('home');
    else { step = 0; renderOnbo(); show('onbo'); }
  }
  /* 起動のどこかで例外が起きると、すべての画面がCSSで隠れたまま
     何も表示されない「真っ白」になる。原因調査とは別に、少なくとも
     何が起きたか分かる画面を必ず出す（インライン onclick は使わず
     addEventListenerで付ける。script-srcが'self'のみのCSPのため）。 */
  function showBootError() {
    try {
      var app = $('#app'); if (app) app.style.display = 'none';
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;' +
        'align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;' +
        'background:#FDFAF2;color:#33302A;font-family:sans-serif';
      var p = document.createElement('p');
      p.textContent = '読み込みでうまくいきませんでした。もう一度開いてみてください。';
      p.style.margin = '0';
      var btn = document.createElement('button');
      btn.textContent = '再読み込み';
      btn.style.cssText = 'padding:12px 28px;border-radius:999px;border:none;' +
        'background:#E8A33D;color:#fff;font-size:16px;cursor:pointer';
      btn.addEventListener('click', function () { location.reload(); });
      box.appendChild(p); box.appendChild(btn);
      document.body.appendChild(box);
    } catch (e) { /* ここまで失敗したら、他にできることはない */ }
  }
  try {
    buildTabs();
    wire();
    applyTheme();
    fillHomeHints();
    syncMilestoneNotifications();
    $('#btn-opening-start').onclick = enterApp;
    var chkOpeningOff = $('#chk-opening-off');
    if (chkOpeningOff) chkOpeningOff.onchange = function () {
      st.openingOff = chkOpeningOff.checked; S.save();
    };
    S.probe().then(function () {
      return Promise.all([loadFace(), loadAshes()]);
    }).then(function () {
      if (st.openingOff) enterApp();
      else show('opening');
    }).then(function () {
      if (window.TomoshibiNative) window.TomoshibiNative.hideSplash();
    }).catch(showBootError);
  } catch (e) {
    showBootError();
  }
})();

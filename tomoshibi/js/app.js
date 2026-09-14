/* app.js — 画面の組み立て。
 *
 * ここに書いてはいけないもの（docs/UI設計.md）:
 *   連続記録（ストリーク）／達成バッジ・紙吹雪／ランダム配信／
 *   退会引き止め／他人との比較／常時対話AI。
 *   数えるのは「通算」だけ。減らず、途切れず、休んでも何も失われない。
 */
(function () {
  'use strict';

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

  /* トップの絵の配色。図形は共通、色だけをCSS変数で差し替える（css/style.css の
     [data-scene="…"]）。ここでは選択肢の一覧と、選ぶボタンのHTMLだけを持つ。
     将来、有料版で動く背景を足すときもこの配列に足すだけでよいようにしてある。 */
  var SCENES = [
    { id: 'garden', label: '庭' },
    { id: 'sunset', label: '夕空' },
    { id: 'sakura', label: '桜' },
    { id: 'snow', label: '雪' }
  ];
  function sceneOf() { return st.pet.scene || 'garden'; }
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
        return '<button class="tab" data-go="' + t.id + '"><svg aria-hidden="true"><use href="#' + t.icon + '"></use></svg>' + t.label + '</button>';
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
  function renderOnbo() {
    $$('#view-onbo .step').forEach(function (el) { el.hidden = +el.dataset.step !== step; });
    $$('#onbo-steps i').forEach(function (el, i) { el.classList.toggle('on', i <= step); });
    $('#btn-back').hidden = step === 0;
    $('#btn-skip').hidden = step !== 2;
    $('#btn-next').textContent = step === 5 ? 'はじめる' : 'つぎへ';
    if (step === 4) renderFaveEdit();
    if (step === 5) $('#scenepick-onbo').innerHTML = scenePickHTML(sceneOf());
    $('#onbo-err').hidden = true;
    var pa = $('#pick-art'); if (pa) pa.innerHTML = '<use href="' + artRef() + '"></use>';
    var ow = $('#onbo-warn'); if (ow) ow.hidden = !S.storeInfo().embedded;
    if (step === 2) paintFaces();
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
    if (step === 3) {
      var d = $('#in-death').value;
      if (d && S.diffDays(S.parseISO(d), S.today()) < 0) { onboErr('これから先の日づけは選べません'); return; }
      st.pet.deathISO = d || '';
      st.pet.birthISO = $('#in-birth').value || '';
      S.save();
    }
    if (step === 4) {
      addFave($('#in-fave').value);      // 入力途中のものも拾う
    }
    if (step === 5) {
      st.onboarded = true; S.save(); show('home'); return;
    }
    step++; S.save(); renderOnbo();
  }

  /* 好きだったもの。3つまで。 */
  function addFave(name) {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return false;
    if (!st.pet.faves) st.pet.faves = [];
    if (st.pet.faves.length >= 3 || st.pet.faves.indexOf(name) >= 0) return false;
    st.pet.faves.push(name); S.save();
    return true;
  }
  function faveChip(name, opts) {
    opts = opts || {};
    return '<button class="fave' + (opts.offering ? ' offering' : '') + '"' +
      (opts.done ? ' data-done="1"' : (opts.sel ? ' data-sel="1"' : '')) +
      (opts.act ? ' data-fave="' + esc(name) + '" aria-pressed="' + (opts.done || opts.sel) + '"' : ' data-favedel="' + esc(name) + '"') +
      '><svg aria-hidden="true"><use href="#of-dish"></use></svg>' + esc(name) +
      (opts.act ? '' : ' <span style="color:var(--faint);font-weight:400">×</span>') + '</button>';
  }
  function renderFaveEdit() {
    var f = st.pet.faves || [];
    $('#fave-list').innerHTML = f.map(function (n) { return faveChip(n, {}); }).join('');
    $('#in-fave').disabled = f.length >= 3;
    $('#in-fave').placeholder = f.length >= 3 ? '3つまでです' : 'さつまいも';
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

  function renderHome() {
    // 消える環境なら、写真を入れる前に知らせる。あとから「消えました」では遅い。
    $('#home-warn').hidden = !S.storeInfo().embedded;
    var t = S.today();
    $('#home-date').textContent = S.formatMD(t);
    $('#home-name').textContent = st.pet.name || '—';
    $('#home-scene').dataset.scene = sceneOf();

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
  /* 好きだったものは、4動作とは別枠。順序を問わず気になるものだけ選び、
     まとめて1回でそなえる。faveSel＝まだそなえていない「選んだ」状態、
     justOffered＝そなえた直後のもの（このおまいり画面を開いている間だけ、
     次の再描画で一度だけ光らせるための印） */
  var faveSel = {}, justOffered = {};
  function renderRitual() {
    $$('#ritual .offer').forEach(function (b, i) {
      if (i < rstep) { b.dataset.state = 'done'; b.disabled = true; }
      else if (i === rstep) { b.dataset.state = 'next'; b.disabled = false; }
      else { delete b.dataset.state; b.disabled = true; }
    });
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
    var t = S.today(), sea = S.seasonalFor(t), done = S.seasonalDone(t);
    $('#seasonal-t').textContent = (t.getMonth() + 1) + '月のおそなえ ・ ' + sea.name;
    $('#seasonal-s').textContent = done ? 'そなえました' : '月がわり。置いても置かなくても、いい';
    $('#seasonal').dataset.done = done ? '1' : '0';
    $('#seasonal-p').textContent = done ? '✓' : '+';

    var f = st.pet.faves || [];
    $('#faves-h').hidden = false;
    $('#faves-h').textContent = f.length ? (st.pet.name || 'あの子') + 'の好きだったもの' : '';
    $('#faves-hint').hidden = !f.length;
    $('#omairi-faves').innerHTML =
      f.map(function (n) {
        var done = S.faveDoneOn(t, n);
        return faveChip(n, { act: true, done: done, sel: !done && !!faveSel[n], offering: !!justOffered[n] });
      }).join('') +
      (f.length < 3
        ? '<button class="fave add" id="btn-fave-add"><svg aria-hidden="true"><use href="#ic-plus"></use></svg>' +
          (f.length ? '足す' : '好きだったものを足す') + '</button>'
        : '');
    justOffered = {};   // 光らせるのは直後の1回だけ
    var pend = f.filter(function (n) { return faveSel[n] && !S.faveDoneOn(t, n); });
    $('#btn-fave-offer').hidden = pend.length === 0;
    $('#fave-offer-label').textContent = 'そなえる（' + pend.length + '）';
  }
  function startRitual() { rstep = 0; rcounted = false; faveSel = {}; justOffered = {}; renderRitual(); show('omairi'); }
  function tapOffer(i) {
    if (i !== rstep) return;
    rstep++;
    if (rstep === 4) {
      // 4つそろった時点でおまいりは成立。数えるのはここ。
      // ただし画面は終わらせない。好きだったものをそなえる余地を残す。
      rin();
      rcounted = S.recordVisit(S.today());
    }
    renderRitual();
  }

  function showAfter(counted) {
    var name = st.pet.name || 'あの子';
    $('#after-line').innerHTML = 'ありがとう。<br>またね。';
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
    var all = S.selfSeries(0);
    // 数えるのは日数と、はじめた日だけ。良し悪しになる数は出さない。
    // おもい日が続いていることは、下の相談先の知らせで伝える。
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

    // 重い記録が続いているときだけ、そっと相談先を出す。判定はしない。
    var run = S.heavyRun();
    $('#self-help').innerHTML = run >= 5
      ? '<div class="tip tip-amber" style="margin-top:14px">' +
        '<svg width="19" height="19" style="color:var(--amber-ink)"><use href="#ic-info"></use></svg>' +
        '<p>重い日が' + run + '日つづいています。<br>' +
        '<button id="btn-self-help" style="margin-top:8px;min-height:40px;padding:0 14px;border-radius:999px;' +
        'border:2px solid var(--tomo-line,var(--line));background:transparent;color:var(--amber-ink);' +
        'font-size:var(--fs-2);font-weight:700;cursor:pointer">相談できるところを見る</button></p></div>'
      : '';
    var hb = $('#btn-self-help');
    if (hb) hb.onclick = showHelp;
  }

  function drawPetals() {
    var P = [[26, 54, 20, '#F0B6C4'], [284, 86, 17, '#FFD98A'], [50, 266, 15, '#CFE6BC'],
             [270, 234, 19, '#F0B6C4'], [156, 22, 14, '#FFD98A']];
    $('#petals').innerHTML = P.map(function (p) {
      return '<g transform="translate(' + p[0] + ' ' + p[1] + ')"><svg width="' + p[2] + '" height="' + p[2] +
        '" viewBox="0 0 24 24"><g fill="' + p[3] + '" stroke="#5A4A3A" stroke-width="1.5">' +
        '<ellipse cx="12" cy="6.4" rx="3.4" ry="4.2"/><ellipse cx="17" cy="10" rx="4.2" ry="3.4"/>' +
        '<ellipse cx="15.1" cy="16" rx="3.4" ry="4.2"/><ellipse cx="8.9" cy="16" rx="3.4" ry="4.2"/>' +
        '<ellipse cx="7" cy="10" rx="4.2" ry="3.4"/></g>' +
        '<circle cx="12" cy="12" r="3.2" fill="#FFF6E2" stroke="#5A4A3A" stroke-width="1.5"/></svg></g>';
    }).join('');
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
     花は枯れない・減らない・他人と比べない。 */
  var FCOL = ['#F0B6C4', '#FFD98A', '#CFE6BC', '#BEDCEA', '#E8A0A0', '#F5C98C'];
  function renderNiwa() {
    var n = S.visitCount();
    $('#stat-flowers').textContent = n;
    var tg = S.daysTogether();
    $('#stat-days').textContent = tg ? tg.toLocaleString('ja-JP') : '—';

    var perRow = 11, shown = Math.min(n, 600);
    var rows = Math.max(2, Math.ceil(shown / perRow));
    var W = 350, H = 30 + rows * 32 + 34;
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">',
      '<path d="M0 ' + (H - 52) + ' C70 ' + (H - 62) + ' 120 ' + (H - 44) + ' 190 ' + (H - 52) +
      ' C250 ' + (H - 59) + ' 300 ' + (H - 42) + ' ' + W + ' ' + (H - 52) + ' L' + W + ' ' + H + ' L0 ' + H + ' Z" fill="#CFE6BC"/>'];
    for (var k = 0; k < shown; k++) {
      var r = Math.floor(k / perRow), c = k % perRow;
      var inRow = Math.min(perRow, shown - r * perRow);
      var startX = (W - inRow * 30) / 2 + 15;   // 端数の行も中央に寄せる
      var x = startX + c * 30, y = 30 + r * 32;
      var kk = (1.05 + (k % 3) * 0.11).toFixed(2), col = FCOL[k % FCOL.length];
      // 他の画面と同じ花びらの形。丸を2つ重ねただけだと、花ではなく輪に見える
      out.push('<g transform="translate(' + x.toFixed(1) + ' ' + y + ') scale(' + kk + ')">' +
        '<g fill="' + col + '" stroke="#5A4A3A" stroke-width="1.3">' +
        '<ellipse cy="-5.6" rx="3.4" ry="4.2"/><ellipse cx="5" cy="-2" rx="4.2" ry="3.4"/>' +
        '<ellipse cx="3.1" cy="4" rx="3.4" ry="4.2"/><ellipse cx="-3.1" cy="4" rx="3.4" ry="4.2"/>' +
        '<ellipse cx="-5" cy="-2" rx="4.2" ry="3.4"/></g>' +
        '<circle r="3" fill="#FFF6E2" stroke="#5A4A3A" stroke-width="1.2"/></g>');
    }
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
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', night ? '#1B1A18' : '#FDFAF2');
    // color-scheme を明示しないと、Androidの「ウェブサイトを自動的に暗くする」機能が
    // 宣言のないページをヒューリスティックに反転させ、このクリーム地が意図せず
    // 黒っぽく壊れることがある。iOSにはこの挙動がなく気づきにくい。
    // 設定の昼/夜どちらかを必ず明示して、その勝手な色替えを止める。
    // ついでにフォーム部品（日付選択・スクロールバーなど）の既定色も画面のテーマに揃う。
    document.documentElement.style.colorScheme = night ? 'dark' : 'light';
  }
  function offsetJumps() {
    var real = new Date(); real = new Date(real.getFullYear(), real.getMonth(), real.getDate());
    var death = S.parseISO(st.pet.deathISO);
    var map = { now: { label: '今日', offset: 0 } };
    if (!death) return map;
    [['d49', '四十九日', S.addDays(death, 48)], ['y1', '一周忌', S.addYears(death, 1)]].forEach(function (j) {
      var n = S.diffDays(real, j[2]);
      if (n > 0) map[j[0]] = { label: j[1], offset: n };
    });
    return map;
  }
  function renderSettings() {
    $$('#seg-theme button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === (st.theme === 'night' ? 'night' : 'day'))); });
    var jumps = offsetJumps();
    $$('#seg-offset button').forEach(function (b) {
      var j = jumps[b.dataset.v];
      b.hidden = !j;
      if (j) { b.textContent = j.label; b.setAttribute('aria-pressed', String(j.offset === st.dateOffset)); }
    });
    $('#offset-now').textContent = '表示中の日づけ：' + S.formatJP(S.today(), true);
    var si = S.storeInfo();
    $('#store-state').textContent =
      (si.embedded ? '試し用（消えます）' : si.durable ? 'この端末の中・保護あり' : si.idb ? 'この端末の中' : '写真のみ') + ' ›';
    $('#warn-ephemeral').hidden = !si.embedded;
    $('#scenepick-set').innerHTML = scenePickHTML(sceneOf());
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

  /* 相談先。実在と受付状況を確認できた窓口だけを載せる。
     確認できていないものは絶対に載せない。 */
  function showHelp() {
    sheet('つらいときの相談先',
      'ひとりで抱えなくて大丈夫です。まずは、こういうところがあります。<br><br>' +
      '・かかりつけだった動物病院<br>' +
      '・お住まいの自治体の こころの健康相談窓口<br>' +
      '・ペットロスの相談を受けているカウンセリング機関<br><br>' +
      '<span style="font-size:var(--fs-2);color:var(--faint)">※ 具体的な窓口名と連絡先は、実在と受付状況を確認できしだいここに載せます。確認できていないものは載せません。</span>',
      [{ label: 'とじる', primary: true }]);
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

    $('#btn-pick').onclick = function () { $('#in-photo').click(); };
    $('#in-photo').onchange = function (e) { pickPortrait(e.target.files && e.target.files[0]); e.target.value = ''; };

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
    $('#seasonal').onclick = function () {
      var t = S.today();
      if (S.seasonalDone(t)) return;
      S.putSeasonal(t); renderRitual();
    };
    $('#omairi-faves').addEventListener('click', function (e) {
      if (e.target.closest('#btn-fave-add')) {
        var n = window.prompt('好きだったもの', '');
        if (n && addFave(n)) renderRitual();
        return;
      }
      var b = e.target.closest('button[data-fave]'); if (!b) return;
      var t = S.today(), n2 = b.dataset.fave;
      if (S.faveDoneOn(t, n2)) return;
      // すぐそなえるのではなく、選ぶだけ。まとめて「そなえる」で確定する。
      if (faveSel[n2]) delete faveSel[n2]; else faveSel[n2] = true;
      renderRitual();
    });
    $('#btn-fave-offer').onclick = function () {
      var t = S.today();
      Object.keys(faveSel).forEach(function (n) {
        if (!S.faveDoneOn(t, n)) { S.putFave(t, n); justOffered[n] = true; }
      });
      faveSel = {};
      renderRitual();
    };
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
    $('#btn-write2').onclick = function () { show('write'); };
    $('#btn-mails2').onclick = function () { show('mails'); };
    $('#btn-mails-close2').onclick = function () { show('home'); };
    $('#btn-write-close').onclick = function () { $('#write-text').value = ''; show('home'); };
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
    });
    $('#starters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]'); if (!b) return;
      var ta = $('#write-text');
      ta.value = ta.value ? ta.value.replace(/\s*$/, '') + '\n' + b.dataset.t : b.dataset.t;
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
      $('#write-count').textContent = ta.value.length;
      $('#btn-send').disabled = false;
    });
    $('#btn-send').onclick = sendLetter;

    $('#btn-settings').onclick = function () { show('settings'); };
    $('#btn-settings-close').onclick = function () { show('home'); };
    $('#seg-theme').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      st.theme = b.dataset.v; S.save(); applyTheme(); renderSettings();
    });
    $('#seg-offset').addEventListener('click', function (e) {
      var b = e.target.closest('[data-v]'); if (!b) return;
      var j = offsetJumps()[b.dataset.v]; if (!j) return;
      st.dateOffset = j.offset; S.save(); renderSettings();
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
      $('#in-name').value = st.pet.name;
      $('#in-death').value = st.pet.deathISO;
      $('#in-birth').value = st.pet.birthISO;
      $$('#kindpick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.kind === st.pet.kind)); });
      $('#btn-pick').textContent = faceURL ? 'えらびなおす' : '写真をえらぶ';
      $('#pick-msg').textContent = faceURL ? '' : 'まだ写真はありません';
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
    $('#btn-help').onclick = showHelp;

    document.addEventListener('click', function (e) {
      var g = e.target.closest('[data-self]'); if (!g) return;
      var b = e.target.closest('[data-v]'); if (!b) return;
      S.putSelf(S.today(), +b.dataset.v);
      renderSelfAsk();
      if ($('#view-jibun').classList.contains('on')) renderJibun();
    });

    $('#btn-reset').onclick = function () {
      sheet('この端末のデータを消す',
        'なまえ・日づけ・おまいりの記録・写真・動画を、この端末から消します。取り消せません。<br><br>先に「すべて手元に持ち出す」で保存しておけます。',
        [{ label: '消す', on: hardReset }, { label: 'やめる', primary: true }]);
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
  buildTabs();
  wire();
  applyTheme();
  fillHomeHints();
  S.probe().then(function () {
    return loadFace();
  }).then(function () {
    if (st.onboarded) show('home');
    else { step = 0; renderOnbo(); show('onbo'); }
  });
})();

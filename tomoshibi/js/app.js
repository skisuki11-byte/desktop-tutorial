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
  function artRef() { return st.pet.kind === 'cat' ? '#art-cat' : '#art-dog'; }

  /* 作った objectURL は必ず覚えて、作り直すときに解放する */
  var urlCache = {};
  function mediaURL(rec) {
    if (rec.url) return rec.url;          // assets に置いたものは、そのまま参照できる
    if (!urlCache[rec.id]) urlCache[rec.id] = URL.createObjectURL(rec.blob);
    return urlCache[rec.id];
  }
  function freeURL(id) { if (urlCache[id]) { URL.revokeObjectURL(urlCache[id]); delete urlCache[id]; } }

  /* ============ 画面 ============ */
  var TABS = [
    { id: 'home', label: 'おうち', icon: 't-home' },
    { id: 'niwa', label: 'おまいりの庭', icon: 't-niwa' },
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
    $$('[data-tabs] .tab').forEach(function (b) {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var b = $('#view-' + name + ' .body'); if (b) b.scrollTop = 0;
    if (name !== 'player') stopPlayer();
    if (name === 'home') renderHome();
    if (name === 'niwa') renderNiwa();
    if (name === 'album') renderAlbum();
    if (name === 'ugoku') renderVideos();
    if (name === 'settings') renderSettings();
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
  function paintFaces() {
    var html = faceURL ? '<img src="' + faceURL + '" alt="">'
                       : '<svg class="art" aria-hidden="true"><use href="' + artRef() + '"></use></svg>';
    ['#home-face', '#omairi-face', '#after-face'].forEach(function (sel) {
      var el = $(sel); if (el) el.innerHTML = html;
    });
    var pf = $('#pick-face');
    if (pf) {
      pf.innerHTML = html + '<span class="badge-ok" id="pick-ok"' + (faceURL ? '' : ' hidden') +
        '><svg width="16" height="16"><use href="#ic-check"></use></svg></span>';
    }
  }

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
    'video-format': 'この動画の形式は保存できませんでした。いまの画面では mp4 と webm だけが入ります。iPhoneの .mov はそのままでは入らないので、写真アプリで「ビデオを書き出す」か、アプリをホーム画面に追加してから開くと、そのまま入ります。',
    'video-too-large': 'この動画は大きすぎました。いまの画面では1本20MBまでです。短く切り出すか、アプリをホーム画面に追加してから開くと、大きいままでも入ります。',
    'rate': '短い時間に何本も入れたため、いったん止められました。少し待ってからもう一度おためしください。',
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
    $('#btn-next').textContent = step === 3 ? 'はじめる' : 'つぎへ';
    $('#onbo-err').hidden = true;
    var pa = $('#pick-art'); if (pa) pa.innerHTML = '<use href="' + artRef() + '"></use>';
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
      st.onboarded = true; S.save(); show('home'); return;
    }
    step++; S.save(); renderOnbo();
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
  function greeting(h) { return h < 4 ? 'こんばんは' : h < 11 ? 'おはよう' : h < 17 ? 'こんにちは' : 'こんばんは'; }

  function renderHome() {
    var t = S.today();
    $('#home-date').textContent = S.formatMD(t);
    $('#home-greet').textContent = greeting(new Date().getHours());
    $('#home-name').textContent = st.pet.name || '—';

    var death = S.parseISO(st.pet.deathISO), birth = S.parseISO(st.pet.birthISO);
    var meta = [];
    if (birth && death) meta.push(S.formatShort(birth) + ' — ' + S.formatShort(death));
    else if (death) meta.push(S.formatShort(death));
    var tg = S.daysTogether();
    if (tg) meta.push('いっしょに ' + tg.toLocaleString('ja-JP') + '日');
    $('#home-meta').textContent = meta.join(' ・ ');

    var n = S.visitCount(), done = S.visitedOn(t);
    $('#omairi-label').textContent = done ? 'もう一度おまいりする' : 'おまいりする';
    $('#home-count').innerHTML = done
      ? '今日はもう灯しました ・ 通算 <b>' + n + '</b> 回'
      : 'きょうで <b>' + (n + 1) + '</b> 回目';

    renderHomeVideos();
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
          '<span style="font-size:11.5px;font-weight:400;color:var(--muted)">1本あるだけで、いつでも会えます</span></button>';
        return;
      }
      box.innerHTML = '<div style="display:flex;align-items:baseline;justify-content:space-between">' +
        '<p style="margin:0;font-family:var(--round);font-weight:700;font-size:15px">うごく' + esc(st.pet.name || 'あの子') + '</p>' +
        '<button class="btn btn-ghost" style="width:auto;min-height:auto;font-size:12px;font-weight:700;color:var(--sky-ink)" data-go="ugoku">ぜんぶ見る</button></div>' +
        '<div class="grid2" id="home-vid-list" style="margin-top:8px"></div>';
      var latest = vs.slice(-2);
      $('#home-vid-list').innerHTML = latest.map(function (v) {
        return tileHTML(v, latest.length === 1);
      }).join('');
    });
  }

  function tileHTML(v, big) {
    var title = st.videoTitles[v.id] || 'うごくすがた';
    var d = v.at ? S.formatShort(new Date(v.at)) : '';
    return '<div class="tile' + (big ? ' big' : '') + '" data-vid="' + esc(v.id) + '">' +
      '<video src="' + mediaURL(v) + '" muted playsinline preload="metadata"></video>' +
      '<svg class="play" viewBox="0 0 24 24"><use href="#ic-play"></use></svg>' +
      '<span class="cap"><b>' + esc(title) + '</b><span>' + esc(d) + '</span></span>' +
      '</div>';
  }

  /* ============ おまいりの4動作 ============
     順序固定・スキップ不可。毎回まったく同じ手順であることが効いている。 */
  var LEADS = ['灯りを、ともします', 'お水を、そなえます', 'ごはんを、そなえます', 'お花を、そなえます'];
  var rstep = 0;
  function renderRitual() {
    $$('#ritual .offer').forEach(function (b, i) {
      if (i < rstep) { b.dataset.state = 'done'; b.disabled = true; }
      else if (i === rstep) { b.dataset.state = 'next'; b.disabled = false; }
      else { delete b.dataset.state; b.disabled = true; }
    });
    $('#ritual-lead').textContent = rstep < 4 ? LEADS[rstep] : 'ありがとう';
    $('#ritual-pill').textContent = rstep + ' / 4';
    var t = S.today(), sea = S.seasonalFor(t), done = S.seasonalDone(t);
    $('#seasonal-t').textContent = (t.getMonth() + 1) + '月のおそなえ ・ ' + sea.name;
    $('#seasonal-s').textContent = done ? 'そなえました' : '月がわり。置いても置かなくても、いい';
    $('#seasonal').dataset.done = done ? '1' : '0';
    $('#seasonal-p').textContent = done ? '✓' : '+';
  }
  function startRitual() { rstep = 0; renderRitual(); show('omairi'); }
  function tapOffer(i) {
    if (i !== rstep) return;
    rstep++; renderRitual();
    if (rstep === 4) {
      rin();
      var t = S.today();
      var counted = S.recordVisit(t);
      setTimeout(function () { showAfter(counted); }, 850);
    }
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
    $('#niwa-days').innerHTML = ms.length
      ? '<p style="margin:0 0 10px;font-family:var(--round);font-weight:700;font-size:15px">あの日まで</p>' +
        '<div style="display:flex;flex-direction:column;gap:8px">' + ms.slice(0, 4).map(function (m, i) {
          return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 16px;' +
            'background:' + (i === 0 ? 'var(--amber-soft)' : 'var(--panel)') + ';border:2px solid ' +
            (i === 0 ? 'var(--amber)' : 'var(--line)') + ';border-radius:16px">' +
            '<span><span style="font-family:var(--round);font-weight:700;font-size:14.5px">' + esc(m.label) + '</span>' +
            '<span style="display:block;font-size:10.5px;color:var(--muted)">' + esc(m.note) + '</span></span>' +
            '<span style="font-size:12px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums">' +
            (m.days === 0 ? '<b style="font-size:17px;color:var(--amber-ink)">今日</b>'
                          : '<b style="font-family:var(--round);font-size:18px;color:var(--ink)">' + m.days + '</b>日') +
            '</span></div>';
        }).join('') + '</div>'
      : '';
  }

  /* ============ アルバム ============ */
  function renderAlbum() {
    return S.allMedia('photo').then(function (all) {
      var photos = all.filter(function (p) { return p.id !== 'portrait'; });
      var chs = S.chapters(photos);
      $('#album-empty').hidden = chs.length > 0;
      $('#album-sub').textContent = photos.length ? photos.length + '枚 ・ ' + chs.length + 'つの章' : '写真をくわえてください';
      $('#album-list').innerHTML = chs.map(function (c) {
        var range = S.formatShort(new Date(c.from)) + ' — ' + S.formatShort(new Date(c.to));
        return '<div class="chapter' + (c.hidden ? ' is-hidden' : '') + '">' +
          '<span class="th"><img src="' + mediaURL(c.photos[0]) + '" alt=""></span>' +
          '<span class="meta"><p class="t">' + esc(c.title || range) + '</p>' +
          '<p class="d">' + (c.title ? range + ' ・ ' : '') + c.photos.length + '枚' + (c.hidden ? ' ・ 非表示中' : '') + '</p></span>' +
          '<button class="more" data-ch="' + esc(c.id) + '" aria-label="この期間の設定">···</button></div>';
      }).join('');
    });
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
      var info = S.storeInfo();
      $('#vid-warn').innerHTML =
        info.idb ? ''
        : info.assets
          ? '<div class="tip tip-amber"><svg width="19" height="19" style="color:var(--amber-ink)"><use href="#ic-info"></use></svg>' +
            '<p>いまの画面では、mp4とwebmの動画を1本20MBまで保存できます。<br>' +
            'iPhoneの .mov や大きい動画も入れたいときは、ホーム画面に追加してから開いてください。</p></div>'
          : '<div class="tip tip-warn"><svg width="19" height="19" style="color:#9A4A2E"><use href="#ic-info"></use></svg>' +
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
    var fails = {};
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
              st.videoTitles[id] = (f.name || '').replace(/\.[^.]+$/, '').slice(0, 24) || 'うごくすがた';
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
      if (!keys.length) return;
      sheet('入らなかった動画があります',
        keys.map(function (k) { return '<b>' + fails[k] + '本</b>：' + esc(reasonText(k)); }).join('<br><br>'),
        [{ label: 'わかりました', primary: true }]);
    });
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

  /* ============ 設定 ============ */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', st.theme === 'night' ? 'night' : 'day');
    var m = document.querySelector('meta[name=theme-color]');
    if (m) m.setAttribute('content', st.theme === 'night' ? '#1B1A18' : '#FDFAF2');
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
    $('#store-state').textContent = (si.idb ? 'この端末の中' : si.assets ? 'アプリの保管場所' : '写真のみ') + ' ›';
  }

  function exportAll() {
    sheet('すべて手元に持ち出す',
      '写真・動画・記録をまとめた1つのファイルにします。動画があると大きくなるので、少し時間がかかります。',
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
        sheet('書き出しました', media.length + '件の写真・動画をふくむファイルを保存しました。', [{ label: 'とじる', primary: true }]);
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
    sheet('すべて手元に持ち出す',
      'いまの開きかたではファイルを保存できないため、中身をそのままお渡しします。' +
      n + '件をふくむ ' + mb + 'MB です。<br><br>' +
      '<textarea id="export-text" readonly rows="4" style="width:100%;font-size:11px;background:var(--bg);' +
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
    $('#btn-pick').onclick = function () { $('#in-photo').click(); };
    $('#in-photo').onchange = function (e) { pickPortrait(e.target.files && e.target.files[0]); e.target.value = ''; };

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
    $('#btn-omairi-close').onclick = function () { show('home'); };
    $('#btn-after-close').onclick = function () { show('home'); };

    $('#btn-add-photos').onclick = function () { $('#in-photos').click(); };
    $('#in-photos').onchange = function (e) { addPhotos(e.target.files); e.target.value = ''; };
    $('#btn-add-vids').onclick = function () { $('#in-vids').click(); };
    $('#in-vids').onchange = function (e) { addVideos(e.target.files); e.target.value = ''; };

    $('#album-list').addEventListener('click', function (e) {
      var m = e.target.closest('[data-ch]'); if (!m) return;
      var id = m.dataset.ch, hidden = st.photoHidden.indexOf(id) >= 0;
      sheet('この期間', 'アルバムに出すかどうかを選べます。あとからいつでも戻せます。', [
        { label: hidden ? 'また出す' : 'この期間は出さない', on: function () { S.toggleHidden(id); renderAlbum(); } },
        { label: '名前をつける', on: function () { renameChapter(id); } },
        { label: 'とじる' }
      ]);
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
                    freeURL(id); delete st.videoTitles[id]; S.save();
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
    $('#btn-export').onclick = exportAll;
    $('#btn-profile').onclick = function () {
      step = 0;
      $('#in-name').value = st.pet.name;
      $('#in-death').value = st.pet.deathISO;
      $('#in-birth').value = st.pet.birthISO;
      $$('#kindpick button').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.kind === st.pet.kind)); });
      $('#btn-pick').textContent = faceURL ? 'えらびなおす' : '写真をえらぶ';
      $('#pick-msg').textContent = faceURL ? '' : 'まだ写真はありません';
      renderOnbo(); show('onbo');
    };
    $('#btn-store').onclick = function () {
      var i = S.storeInfo();
      var body = i.idb
        ? 'この端末の中に、写真も動画もそのまま保存しています。<br>どこにも送られません。'
        : i.assets
          ? 'いまの画面では、この端末の大きな保存先が使えないため、写真と動画をこのアプリの保管場所に置いています。<br><br>' +
            '動画は mp4・webm で1本20MBまでです。<br><br>' +
            'ホーム画面に追加してから開くと、端末の中だけに、形式や大きさの制限なく保存できます。'
          : 'いまの開きかたでは、写真しか保存できません（1枚ぶん）。<br><br>' +
            'ホーム画面に追加してから開くか、SafariやChromeで直接開くと、すべて使えるようになります。';
      sheet('保存のようす', body, [{ label: 'とじる', primary: true }]);
    };
    $('#btn-help').onclick = function () {
      sheet('つらいときの相談先',
        'ひとりで抱えなくて大丈夫です。まずは、こういうところがあります。<br><br>' +
        '・かかりつけだった動物病院<br>・お住まいの自治体の こころの健康相談窓口<br>' +
        '・ペットロスの相談を受けているカウンセリング機関<br><br>' +
        '<span style="font-size:12px;color:var(--faint)">※ 具体的な窓口名と連絡先は、実在と受付状況を確認できしだいここに載せます。確認できていないものは載せません。</span>',
        [{ label: 'とじる', primary: true }]);
    };
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
  S.probe().then(function () {
    return loadFace();
  }).then(function () {
    if (st.onboarded) show('home');
    else { step = 0; renderOnbo(); show('onbo'); }
  });
})();

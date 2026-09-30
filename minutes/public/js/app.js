import * as api from './api.js';
import * as store from './store.js';
import { Capture, canCaptureSystemAudio } from './audio.js';
import { LiveTranscriber } from './stt.js';
import { SCRIPT, LIVE_SUMMARIES, MINUTES } from './demo.js';

// ---------------------------------------------------------------- 小道具
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const pad = (n) => String(n).padStart(2, '0');
const fmtT = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600); const mi = Math.floor((sec % 3600) / 60); const s = sec % 60;
  return h ? `${h}:${pad(mi)}:${pad(s)}` : `${pad(mi)}:${pad(s)}`;
};
const fmtDate = (ms) => { const d = new Date(ms); return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDur = (sec) => { const mi = Math.round(sec / 60); return mi >= 60 ? `${Math.floor(mi / 60)}時間${mi % 60}分` : `${Math.max(mi, sec > 0 ? 1 : 0)}分`; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ICON = {
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 16.9 5.9 20.4l1.5-6.8L2.2 9l6.9-.7L12 2Z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.6 7.6 0 0 0 1.7 1L11 21h4l.4-2.9a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.5L19.4 13ZM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z" transform="translate(-1 0)"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.4 5.4 14 4l-8 8 8 8 1.4-1.4L8.8 12l6.6-6.6Z"/></svg>',
  ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v2h3.6l-8.8 8.8 1.4 1.4L19 6.4V10h2V3h-7ZM5 5h6v2H7v10h10v-4h2v6H5V5Z"/></svg>',
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="5" y="12" width="3" height="8" rx="1.5"/><rect x="10.5" y="7" width="3" height="18" rx="1.5"/><rect x="16" y="10" width="3" height="12" rx="1.5"/><rect x="21.5" y="5" width="3" height="22" rx="1.5"/></svg>',
};

let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = `toast ${kind}`; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 7000 : 3200);
}

// ---------------------------------------------------------------- 話者まわり
const letter = (i) => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));
function spkCtx(m) {
  const list = [];
  for (const s of m.segments) if (!s.kind && !list.includes(s.spk)) list.push(s.spk);
  const idx = (spk) => Math.max(0, list.indexOf(spk));
  const custom = (spk) => (m.names[spk] || '').trim();
  return {
    list, idx, custom,
    def: (spk) => `話者${letter(idx(spk))}`,
    name(spk) { return custom(spk) || this.def(spk); },
  };
}
// AI には「話者A」等のラベルのまま渡し、表示・保存のときに現在の名前へ置換する。
// → 名前を後から付けても、議事録を作り直さずに反映できる。
function applyNames(m, text, c = spkCtx(m)) {
  return String(text ?? '').replace(/話者([A-Z])(?![A-Za-z])/g, (mt, l) => {
    const spk = c.list[l.charCodeAt(0) - 65];
    return spk !== undefined && c.custom(spk) ? c.custom(spk) : mt;
  });
}
function chip(c, spk, segId) {
  const name = c.name(spk);
  const ini = c.custom(spk) ? [...c.custom(spk)][0] : letter(c.idx(spk));
  const attrs = segId ? `data-act="reassign" data-seg="${esc(segId)}" title="この発言の話者を変更"` : 'tabindex="-1"';
  return `<button type="button" class="spk" data-h="${c.idx(spk) % 8}" ${attrs}><i>${esc(ini)}</i>${esc(name)}</button>`;
}

function pushSegment(m, seg) {
  const last = m.segments[m.segments.length - 1];
  if (last && !last.kind && last.spk === seg.spk && seg.start - last.end < 3) {
    last.text += (/[A-Za-z0-9,.!?]$/.test(last.text) && /^[A-Za-z0-9]/.test(seg.text) ? ' ' : '') + seg.text;
    last.end = seg.end;
  } else {
    m.segments.push({ id: uid(), spk: seg.spk, start: seg.start, end: seg.end, text: seg.text });
  }
}

// 文字起こし → AI に渡すテキスト（ラベルのまま）
function transcriptForAI(m) {
  const c = spkCtx(m);
  return m.segments.map((s) => (s.kind ? `★ [${fmtT(s.start)}] （参加者が重要マークを付けた地点）` : `[${fmtT(s.start)}] ${c.def(s.spk)}: ${s.text}`)).join('\n');
}
// 保存・コピー用（名前を反映）
function transcriptLines(m) {
  const c = spkCtx(m);
  return m.segments.map((s) => (s.kind ? `★ 重要マーク [${fmtT(s.start)}]` : `[${fmtT(s.start)}] ${c.name(s.spk)}: ${s.text}`));
}
function namedMinutes(m) {
  const c = spkCtx(m); const n = (x) => applyNames(m, x, c); const mi = m.minutes;
  return {
    title: n(mi.title), overview: n(mi.overview), next: n(mi.next),
    topics: mi.topics.map((t) => ({ heading: n(t.heading), bullets: t.bullets.map(n) })),
    decisions: mi.decisions.map(n), open_issues: mi.open_issues.map(n),
    todos: mi.todos.map((t) => ({ who: n(t.who), what: n(t.what), due: t.due })),
  };
}
function toMarkdown(m) {
  const x = namedMinutes(m); const c = spkCtx(m);
  const L = [`# ${m.title}`, '', `- 日時: ${fmtDate(m.createdAt)}（${fmtDur(m.durationSec)}）`, `- 話者: ${c.list.map((s) => c.name(s)).join('、') || '-'}`, ''];
  if (x.overview) L.push('## 概要', x.overview, '');
  if (x.decisions.length) L.push('## 決定事項', ...x.decisions.map((d) => `- ${d}`), '');
  if (x.todos.length) L.push('## アクションアイテム', ...x.todos.map((t) => `- [ ] ${t.who ? `【${t.who}】` : ''}${t.what}${t.due ? `（期限: ${t.due}）` : ''}`), '');
  if (x.topics.length) { L.push('## 議題ごとの内容'); x.topics.forEach((t) => L.push(`### ${t.heading}`, ...t.bullets.map((b) => `- ${b}`), '')); }
  if (x.open_issues.length) L.push('## 未解決・持ち越し', ...x.open_issues.map((d) => `- ${d}`), '');
  if (x.next) L.push('## 次回', x.next, '');
  L.push('## 文字起こし', ...transcriptLines(m).map((l) => `- ${l}`));
  return L.join('\n');
}

// ---------------------------------------------------------------- 状態
let cfg = { stt: false, llm: false, notion: false, authRequired: false, authorized: true };
let m = null;        // 現在開いている会議
let live = null;     // 録音中のランタイム
let dv = { busy: null, error: '', tab: 'minutes', audioUrl: '' };
const app = $('#app');
const dlg = $('#dlg');

// ---------------------------------------------------------------- ダイアログ
function openDlg(html, wire) {
  dlg.innerHTML = `<form class="sheet" autocomplete="off">${html}</form>`;
  const f = $('form', dlg);
  f.addEventListener('submit', (e) => e.preventDefault());
  f.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
  wire?.(f);
  if (!dlg.open) dlg.showModal();
}
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { dlg.innerHTML = ''; });

// ---------------------------------------------------------------- ホーム
async function showHome() {
  view = 'home'; m = null;
  document.title = '議事録';
  const list = await store.listMeetings();
  for (const x of list) {
    if (x.status === 'recording' && !(live && live.m === x)) { x.status = 'interrupted'; x.endedAt ||= Date.now(); await store.saveMeeting(x); }
  }
  const stat = (ok, label, hint) => `<li class="${ok ? 'ok' : 'ng'}"><b>${ok ? '✓' : '！'}</b><span>${label}${ok ? '' : `<small>${hint}</small>`}</span></li>`;
  app.innerHTML = `
  <header class="topbar"><div class="brand"><span class="mark">${ICON.logo}</span><b>議事録</b></div>
    <button class="icon-btn" data-act="settings" aria-label="設定">${ICON.gear}</button></header>
  <main class="home">
    <section class="hero">
      <p class="eyebrow">話すだけで、議事録まで</p>
      <h1>会議中は要点が見え、<br>終わったらNotionに整う。</h1>
      <div class="hero-actions">
        <button class="btn rec xl" data-act="start">${ICON.mic}<span>録音を始める</span></button>
        <button class="btn ghost" data-act="demo">デモで試す</button>
      </div>
      <ul class="status">
        ${stat(cfg.stt, '文字起こし・話者分離', 'サーバーに DEEPGRAM_API_KEY が必要')}
        ${stat(cfg.llm, 'AI要約・議事録', 'サーバーに ANTHROPIC_API_KEY が必要')}
        ${stat(cfg.notion, 'Notion保存', 'NOTION_TOKEN と NOTION_PARENT が必要')}
      </ul>
    </section>
    <section class="history">
      <h2>これまでの会議</h2>
      ${list.length ? `<ul class="hist">${list.map((x) => `
        <li><button data-act="open" data-id="${esc(x.id)}">
          <span class="h-main"><b>${esc(x.title)}</b><small>${fmtDate(x.createdAt)} ・ ${fmtDur(x.durationSec || 0)}</small></span>
          <span class="h-tags">${x.status === 'interrupted' ? '<em class="tag warn">中断</em>' : ''}${x.mode === 'demo' ? '<em class="tag">デモ</em>' : ''}${x.minutes ? '<em class="tag">議事録</em>' : ''}${x.notion ? '<em class="tag ok">Notion済</em>' : ''}</span>
        </button></li>`).join('')}</ul>`
    : '<div class="empty-card"><p>まだ会議がありません。<br>「録音を始める」か「デモで試す」から。</p></div>'}
    </section>
  </main>`;
}
let view = 'home';

// ---------------------------------------------------------------- 開始シート
function openStart() {
  if (!cfg.stt) { toast('文字起こしのAPIキーが未設定です。まず「デモで試す」で動きを確認できます', 'err'); return; }
  const sysOk = canCaptureSystemAudio();
  const now = new Date();
  const defTitle = `会議 ${now.getMonth() + 1}/${now.getDate()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  openDlg(`
    <h2>録音を始める</h2>
    <label class="field"><span>タイトル（あとで自動で付けられます）</span><input name="title" placeholder="${esc(defTitle)}" maxlength="80"></label>
    <fieldset class="choices">
      <legend>何を録音しますか？</legend>
      <label class="choice"><input type="radio" name="src" value="mic" ${sysOk ? '' : 'checked'}><span><b>マイクだけ</b><small>対面の会議、スマホでの録音、スピーカー通話</small></span></label>
      <label class="choice ${sysOk ? '' : 'disabled'}"><input type="radio" name="src" value="both" ${sysOk ? 'checked' : 'disabled'}><span><b>マイク ＋ PCの音声</b><small>Teams・Zoom・Meet など（自分の声と相手の声を両方）${sysOk ? '' : '<br>※PCのブラウザで利用できます'}</small></span></label>
    </fieldset>
    <div class="howto" data-when="both" ${sysOk ? '' : 'hidden'}>
      <b>開始後の共有ダイアログで</b>
      <ol><li>Teams を<b>ブラウザで開いている</b>なら「<b>タブ</b>」からそのタブを選択<br>Teams<b>アプリ</b>なら「<b>画面全体</b>」（Windows）</li>
      <li>左下の「<b>音声を共有</b>」にチェックして共有</li></ol>
      <small>Mac ではタブの音声のみ共有できます。ヘッドホン利用時も相手の声を拾えます。</small>
    </div>
    <label class="check"><input type="checkbox" name="consent" ${api.settings.consent ? 'checked' : ''}><span>参加者に<b>録音とAI要約を行うこと</b>を伝えました</span></label>
    <p class="note">音声は文字起こしのため Deepgram、要約のため Anthropic に送信されます。</p>
    <div class="row end"><button type="button" class="btn ghost" data-close>キャンセル</button><button type="submit" class="btn rec" id="go">${ICON.mic}<span>開始</span></button></div>`,
  (f) => {
    const sync = () => { $('.howto', f).hidden = f.src.value !== 'both'; };
    f.addEventListener('change', sync); sync();
    f.addEventListener('submit', () => {
      if (!f.consent.checked) { toast('参加者への告知を確認してチェックしてください', 'err'); return; }
      api.settings.consent = true;
      const title = f.title.value.trim();
      dlg.close();
      startLive({ title, system: f.src.value === 'both' });
    });
  });
}

// ---------------------------------------------------------------- 録音（ライブ）
function newMeeting(o) {
  return {
    id: uid(), title: o.title || `会議 ${fmtDate(Date.now())}`, titleAuto: !o.title, createdAt: Date.now(), endedAt: 0, durationSec: 0,
    status: 'recording', mode: o.mode, lang: api.settings.lang, mime: '', segments: [], names: {}, rev: 0,
    summary: null, summaryAt: 0, sumChars: 0, minutes: null, minutesRev: -1, notion: null,
  };
}

async function startLive({ title, system, demo = false }) {
  m = newMeeting({ title, mode: demo ? 'demo' : 'live' });
  m.title = title || (demo ? 'デモ：新プラン リリース準備 定例' : m.title);
  live = {
    m, t0: performance.now(), clock: () => (performance.now() - live.t0) / 1000, interim: '', stt: 'connecting', dirty: true,
    lastSum: 0, inflight: false, sumErr: '', prevSum: new Set(), pinned: true, timers: [], demo, silentWarned: false,
  };
  showLiveSkeleton();
  try {
    if (demo) runDemo();
    else await beginRealCapture(system);
  } catch (e) {
    cleanupLive(); toast(e.message, 'err'); await store.deleteMeeting(m.id).catch(() => {}); showHome(); return;
  }
  await store.saveMeeting(m);
  live.timers.push(setInterval(tick, 1000), setInterval(autosave, 5000), setInterval(() => maybeSummarize(false), 5000));
  window.addEventListener('beforeunload', warnUnload);
}
const warnUnload = (e) => { if (live) { e.preventDefault(); e.returnValue = ''; } };

async function beginRealCapture(system) {
  live.cap = new Capture({
    mic: true, system,
    onPcm: (b) => live.tr?.sendPcm(b),
    onChunk: (b) => { store.addAudio(m.id, b).catch(() => {}); },
    onSourceLost: (k) => toast(k === 'system' ? 'PCの音声の共有が止まりました。録音はマイクのみ続きます' : 'マイクが切断されました', 'err'),
  });
  await live.cap.start();
  m.mime = live.cap.mime;
  live.tr = new LiveTranscriber({
    lang: api.settings.lang, clock: live.clock,
    getToken: api.sttToken,
    onInterim: (t) => { live.interim = t; paintTranscript(); },
    onFinal: (seg) => { pushSegment(m, seg); live.dirty = true; paintTranscript(); },
    onStatus: (s, msg) => { live.stt = s; live.sttMsg = msg; paintStatus(); },
  });
  await live.tr.start();
}

// デモ: 台本を順に流す。実際の録音と同じ経路(pushSegment/paint*)を通る。
function runDemo() {
  live.stt = 'live'; paintStatus();
  let i = 0; let t = 0;
  const step = async () => {
    if (!live || live.m !== m) return;
    if (i >= SCRIPT.length) { toast('デモの会話はここまで。「終了」で議事録を作成します'); return; }
    const [spk, text] = SCRIPT[i];
    live.interim = text.slice(0, Math.ceil(text.length / 2)); paintTranscript();
    await sleep(900);
    if (!live || live.m !== m) return;
    live.interim = '';
    pushSegment(m, { spk: String(spk), start: t, end: t + 6, text });
    t += 7; i++;
    const snap = [...LIVE_SUMMARIES].reverse().find(([n]) => i >= n);
    if (snap && m.summary?.topic !== snap[1].topic) { m.summary = snap[1]; m.summaryAt = Date.now(); paintSummary(true); }
    paintTranscript();
    live.timers.push(setTimeout(step, 1700));
  };
  live.timers.push(setTimeout(step, 800));
  live.clock = () => Math.max(0, (performance.now() - live.t0) / 1000) * 3.5;   // 時計も早回し
}

function cleanupLive() {
  if (!live) return;
  live.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
  live.cap?.stop();
  window.removeEventListener('beforeunload', warnUnload);
}

async function stopLive() {
  if (!live || live.stopping) return;
  live.stopping = true;
  const btn = $('[data-act="stop"]'); if (btn) { btn.disabled = true; btn.querySelector('span').textContent = '終了処理中…'; }
  try { await live.tr?.stop(); } catch { /* noop */ }
  const dur = live.clock();
  cleanupLive();
  m.status = 'done'; m.endedAt = Date.now(); m.durationSec = Math.round(dur);
  live = null;
  await store.saveMeeting(m);
  openDetail(m, { autoMinutes: true });
}

function tick() {
  if (!live) return;
  const el = $('#lv-timer'); if (el) el.textContent = fmtT(live.clock());
  const lv = $('#lv-level'); if (lv && live.cap) lv.style.setProperty('--lv', Math.min(1, live.cap.level * 2.2).toFixed(2));
  const upd = $('#sum-upd'); if (upd) upd.textContent = updText();
  if (live.cap) {
    const quiet = Date.now() - live.cap.lastSound;
    $('#lv-warn').hidden = quiet < 20000;
    if (quiet > 300000 && !live.silentWarned) { live.silentWarned = true; toast('5分以上、音が入っていません。会議は終わっていませんか？', 'err'); }
  }
}
async function autosave() {
  if (live?.dirty) { live.dirty = false; await store.saveMeeting(m).catch(() => {}); }
}
const updText = () => {
  if (!cfg.llm && m.mode !== 'demo') return '要約は未設定';
  if (live?.sumErr) return '更新できません（再試行します）';
  if (!m.summaryAt) return '発言を待っています';
  const s = Math.round((Date.now() - m.summaryAt) / 1000);
  return s < 5 ? '更新しました' : s < 90 ? `${s}秒前に更新` : `${Math.round(s / 60)}分前に更新`;
};

async function maybeSummarize(force) {
  if (!live || live.inflight || m.mode === 'demo' || !cfg.llm) return;
  const total = m.segments.reduce((n, s) => n + (s.text?.length || 0), 0);
  if (total - m.sumChars < (force ? 10 : 60)) return;
  if (!force && Date.now() - live.lastSum < 20000) return;
  // 直前の1発言は重ねて渡す（発言の途中で区切らないため）
  const from = Math.max(0, (m.sumCursor ?? 0));
  const delta = m.segments.slice(from);
  const text = delta.map((s) => (s.kind ? '★ 重要マーク' : `${spkCtx(m).def(s.spk)}: ${s.text}`)).join('\n');
  live.inflight = true; live.lastSum = Date.now();
  try {
    const r = await api.summarize(m.summary, text);
    m.summary = r; m.summaryAt = Date.now(); m.sumChars = total; m.sumCursor = Math.max(0, m.segments.length - 1);
    live.sumErr = '';
    paintSummary(true);
  } catch (e) {
    live.sumErr = e.message; if (e.code === 'auth') toast(e.message, 'err');
  } finally { live.inflight = false; }
}

// ---------------------------------------------------------------- ライブ画面の描画
function showLiveSkeleton() {
  view = 'live';
  document.title = '● 録音中';
  app.innerHTML = `
  <div class="live">
    <header class="livebar">
      <div class="recstat"><i class="dot"></i><b id="lv-timer">00:00</b><span class="meter" id="lv-level" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>
      <div class="pill" id="lv-status" role="status"></div>
      <button class="btn danger sm" data-act="stop">${ICON.stop}<span>終了</span></button>
    </header>
    <div class="warn-bar" id="lv-warn" hidden>音が入っていません。マイクやPC音声の共有を確認してください</div>
    <div class="live-grid">
      <section class="card summary" aria-label="リアルタイム要点">
        <div class="sum-top"><span class="eyebrow">いまの要点</span><span class="upd" id="sum-upd"></span></div>
        <div id="lv-sum"></div>
      </section>
      <section class="card transcript" aria-label="文字起こし">
        <div class="tr-top"><span class="eyebrow">文字起こし</span><button class="link" data-act="speakers">話者名</button></div>
        <div class="tr-scroll" id="lv-tr"></div>
        <button class="jump" id="lv-jump" data-act="jump" hidden>最新へ ↓</button>
      </section>
    </div>
    <footer class="dock">
      <button class="btn ghost" data-act="mark">${ICON.pin}<span>重要マーク</span></button>
      <p class="dock-note">${live?.demo ? 'デモ実行中' : 'この画面を開いたままにしてください'}</p>
    </footer>
  </div>`;
  const tr = $('#lv-tr');
  tr.addEventListener('scroll', () => {
    live.pinned = tr.scrollHeight - tr.scrollTop - tr.clientHeight < 80;
    $('#lv-jump').hidden = live.pinned;
  }, { passive: true });
  paintStatus(); paintSummary(false); paintTranscript();
}

function paintStatus() {
  const el = $('#lv-status'); if (!el || !live) return;
  const map = {
    connecting: ['warn', '接続中…'], live: ['ok', live.demo ? 'デモ' : '文字起こし中'],
    reconnecting: ['warn', '再接続中（録音は継続）'], error: ['bad', '文字起こし停止（録音は継続）'],
  };
  const [cls, label] = map[live.stt] || map.connecting;
  el.className = `pill ${cls}`; el.textContent = label; el.title = live.sttMsg || '';
}

let rafT = 0;
function paintTranscript() {
  if (rafT) return;
  rafT = requestAnimationFrame(() => {
    rafT = 0;
    const el = $('#lv-tr'); if (!el || !live) return;
    el.innerHTML = transcriptHTML(m, live.interim) || '<p class="empty">話し始めると、ここに文字が流れます</p>';
    if (live.pinned) el.scrollTop = el.scrollHeight;
  });
}

function transcriptHTML(mt, interim = '') {
  const c = spkCtx(mt);
  let html = '';
  for (const s of mt.segments) {
    if (s.kind) { html += `<div class="mark"><span>★ 重要マーク</span><time>${fmtT(s.start)}</time></div>`; continue; }
    html += `<article class="seg"><header>${chip(c, s.spk, s.id)}<time>${fmtT(s.start)}</time></header><p>${esc(s.text)}</p></article>`;
  }
  if (interim) html += `<article class="seg interim"><p>${esc(interim)}</p></article>`;
  return html;
}

function summaryHTML(mt, prev = new Set()) {
  const s = mt.summary; const c = spkCtx(mt);
  if (!s) return '<div class="sum-empty"><i></i><i></i><i></i><p>話し始めると、要点がここに現れます</p></div>';
  const li = (t) => `<li class="${prev.size && !prev.has(t) ? 'new' : ''}">${esc(applyNames(mt, t, c))}</li>`;
  const sec = (h, arr, cls = '') => (arr?.length ? `<h3>${h}</h3><ul class="${cls}">${arr.map(li).join('')}</ul>` : '');
  return `
    ${s.topic ? `<h2 class="topic">${esc(applyNames(mt, s.topic, c))}</h2>` : ''}
    ${sec('要点', s.points, 'points')}
    ${sec('決定', s.decisions, 'decisions')}
    ${s.todos?.length ? `<h3>TODO</h3><ul class="todos">${s.todos.map((t) => `<li class="${prev.size && !prev.has(t.what) ? 'new' : ''}">${t.who ? `<b>${esc(applyNames(mt, t.who, c))}</b>` : ''}${esc(applyNames(mt, t.what, c))}${t.due ? `<small>${esc(t.due)}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${sec('未解決', s.questions, 'questions')}`;
}
function summaryKeys(s) { return new Set(s ? [...s.points, ...s.decisions, ...s.todos.map((t) => t.what), ...s.questions] : []); }

function paintSummary(highlight) {
  const el = $('#lv-sum'); if (!el || !live) return;
  const prev = highlight ? live.prevSum : new Set();
  el.innerHTML = summaryHTML(m, prev);
  live.prevSum = summaryKeys(m.summary);
  $('#sum-upd').textContent = updText();
}

// ---------------------------------------------------------------- 詳細（終了後）
async function openDetail(mt, opts = {}) {
  m = mt; view = 'detail';
  if (dv.audioUrl) URL.revokeObjectURL(dv.audioUrl);
  dv = { busy: null, error: '', tab: 'minutes', audioUrl: '', hasAudio: false };
  document.title = m.title;
  try {
    if (m.mode !== 'demo' && (await store.hasAudio(m.id))) {
      dv.hasAudio = true;
      dv.audioUrl = URL.createObjectURL(new Blob(await store.getAudio(m.id), { type: m.mime || 'audio/webm' }));
    }
  } catch { /* 音声が無くても続行 */ }
  renderDetail();
  if (opts.autoMinutes && !m.minutes && (cfg.llm || m.mode === 'demo')) genMinutes();
}

function minutesHTML(mt) {
  const x = namedMinutes(mt);
  const stale = mt.minutesRev !== mt.rev;
  return `
  ${stale ? '<div class="banner warn">話者の割り当てを変更しました。「作り直す」で議事録に反映できます。</div>' : ''}
  <article class="doc">
    <h2 class="doc-title">${esc(x.title || mt.title)}</h2>
    ${x.overview ? `<p class="lead">${esc(x.overview)}</p>` : ''}
    ${x.decisions.length ? `<h3><span class="tick">✓</span>決定事項</h3><ul class="decisions">${x.decisions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
    ${x.todos.length ? `<h3><span class="tick sq">☐</span>アクションアイテム</h3><ul class="todos">${x.todos.map((t) => `<li>${t.who ? `<b>${esc(t.who)}</b>` : '<b class="none">担当未定</b>'}${esc(t.what)}${t.due ? `<small>期限 ${esc(t.due)}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${x.topics.length ? `<h3>議題ごとの内容</h3>${x.topics.map((t) => `<section class="topic-blk"><h4>${esc(t.heading)}</h4><ul>${t.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></section>`).join('')}` : ''}
    ${x.open_issues.length ? `<h3>未解決・持ち越し</h3><ul>${x.open_issues.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
    ${x.next ? `<h3>次回</h3><p>${esc(x.next)}</p>` : ''}
  </article>`;
}

function renderDetail() {
  if (view !== 'detail' || !m) return;
  const c = spkCtx(m);
  const canMake = cfg.llm || m.mode === 'demo';
  const busyMin = dv.busy === 'minutes';
  const notionOk = cfg.notion && m.mode !== 'demo';
  const empty = !m.segments.some((s) => !s.kind);
  const keepScroll = window.scrollY;
  app.innerHTML = `
  <header class="topbar"><button class="icon-btn" data-act="home" aria-label="一覧に戻る">${ICON.back}</button>
    <div class="brand"><b>会議の記録</b></div><button class="icon-btn" data-act="settings" aria-label="設定">${ICON.gear}</button></header>
  <main class="detail" data-tab="${dv.tab}">
    <section class="d-head">
      <input class="title-in" id="d-title" value="${esc(m.title)}" aria-label="タイトル" maxlength="80">
      <p class="meta">${fmtDate(m.createdAt)} ・ ${fmtDur(m.durationSec)}${m.status === 'interrupted' ? ' ・ <em class="tag warn">中断された録音</em>' : ''}${m.mode === 'demo' ? ' ・ <em class="tag">デモ</em>' : ''}</p>
      <div class="spk-strip">
        ${c.list.map((s) => chip(c, s)).join('') || '<span class="muted">話者なし</span>'}
        ${c.list.length ? '<button class="btn ghost sm" data-act="speakers">話者に名前を付ける</button>' : ''}
      </div>
    </section>
    <nav class="tabs" role="tablist">
      <button role="tab" data-act="tab" data-tab="minutes" aria-selected="${dv.tab === 'minutes'}">議事録</button>
      <button role="tab" data-act="tab" data-tab="transcript" aria-selected="${dv.tab === 'transcript'}">文字起こし</button>
    </nav>
    <div class="d-cols">
      <section class="col col-min" aria-label="議事録">
        <div class="actions">
          <button class="btn primary" data-act="minutes" ${busyMin || !canMake || empty ? 'disabled' : ''}>${busyMin ? '作成中…' : m.minutes ? '作り直す' : '議事録を作成'}</button>
          ${m.notion ? `<a class="btn ok" href="${esc(m.notion.url)}" target="_blank" rel="noopener">${ICON.ext}<span>Notionで開く</span></a>` : ''}
          <button class="btn ${m.notion ? 'ghost' : 'notion'}" data-act="notion" ${!m.minutes || dv.busy || !notionOk ? 'disabled' : ''} ${!notionOk ? `title="${m.mode === 'demo' ? 'デモは保存できません' : 'Notionの設定が必要です'}"` : ''}>${dv.busy === 'notion' ? '保存中…' : m.notion ? 'もう一度保存' : 'Notionに保存'}</button>
          ${m.minutes ? '<button class="btn ghost sm" data-act="copy">コピー</button><button class="btn ghost sm" data-act="md">.md</button>' : ''}
        </div>
        ${!canMake ? '<div class="banner warn">議事録の作成には、サーバーの ANTHROPIC_API_KEY が必要です。</div>' : ''}
        ${!notionOk && m.minutes && m.mode !== 'demo' ? '<div class="banner">Notionへ保存するには、サーバーに NOTION_TOKEN と NOTION_PARENT を設定してください（README参照）。</div>' : ''}
        ${dv.error ? `<div class="banner err">${esc(dv.error)} <button class="link" data-act="minutes">再試行</button></div>` : ''}
        ${busyMin ? '<div class="skel"><i></i><i></i><i></i><i></i></div>'
    : m.minutes ? minutesHTML(m)
      : `<div class="empty-card"><p>${empty ? '文字起こしがありません。' : '「議事録を作成」を押すと、決定事項・アクション・議題ごとの内容にまとめます。'}</p></div>`}
        ${m.notion ? `<p class="saved-note">✓ ${fmtDate(m.notion.at)} にNotionへ保存しました（保存は手動のみ・自動共有はしません）</p>` : ''}
      </section>
      <section class="col col-tr" aria-label="文字起こし">
        ${dv.hasAudio && m.mode !== 'demo' ? `<div class="audio"><audio controls src="${dv.audioUrl}" preload="metadata"></audio>
          <button class="btn ghost sm" data-act="reanalyze" ${dv.busy || !cfg.stt ? 'disabled' : ''}>${dv.busy === 'reanalyze' ? '解析中…' : '高精度で再解析'}</button></div>
          <p class="hint">ライブ中の話者分けは暫定です。終了後に録音全体から再解析すると、話者の判別が安定します。</p>` : ''}
        <div class="tr-list">${transcriptHTML(m) || '<p class="empty">文字起こしはありません</p>'}</div>
        <div class="danger-zone"><button class="link danger" data-act="delete">この会議を削除</button></div>
      </section>
    </div>
  </main>`;
  window.scrollTo(0, keepScroll);
  $('#d-title').addEventListener('change', async (e) => {
    m.title = e.target.value.trim() || m.title; m.titleAuto = false; await store.saveMeeting(m); document.title = m.title;
  });
}

async function genMinutes() {
  if (dv.busy) return;
  dv.busy = 'minutes'; dv.error = ''; renderDetail();
  try {
    let r;
    if (m.mode === 'demo') { await sleep(1400); r = structuredClone(MINUTES); }
    else {
      const c = spkCtx(m);
      r = await api.makeMinutes(transcriptForAI(m), { date: fmtDate(m.createdAt), speakers: c.list.map((s) => c.def(s)) });
    }
    m.minutes = r; m.minutesRev = m.rev;
    if (m.titleAuto && r.title) m.title = r.title;
    await store.saveMeeting(m);
  } catch (e) { dv.error = e.message; }
  dv.busy = null; renderDetail();
}

async function saveNotionPage() {
  if (dv.busy || !m.minutes) return;
  if (m.notion && !confirm('すでにNotionへ保存済みです。新しいページとしてもう一度保存しますか？')) return;
  dv.busy = 'notion'; dv.error = ''; renderDetail();
  try {
    const c = spkCtx(m);
    const r = await api.saveNotion({
      title: m.title, minutes: namedMinutes(m), transcript: transcriptLines(m),
      meta: {
        date: fmtDate(m.createdAt), dateISO: new Date(m.createdAt).toISOString(), duration: fmtDur(m.durationSec),
        participants: c.list.map((s) => c.name(s)),
      },
    });
    m.notion = { url: r.url, at: Date.now() };
    await store.saveMeeting(m);
    toast('Notionに保存しました ✓', 'ok');
  } catch (e) { dv.error = e.message; toast(e.message, 'err'); }
  dv.busy = null; renderDetail();
}

async function reanalyze() {
  if (dv.busy) return;
  if (Object.keys(m.names).length && !confirm('再解析すると話者が振り直されるため、付けた名前はリセットされます。続けますか？')) return;
  dv.busy = 'reanalyze'; dv.error = ''; renderDetail();
  try {
    const blob = new Blob(await store.getAudio(m.id), { type: m.mime || 'audio/webm' });
    const r = await api.transcribeAudio(blob, m.lang);
    if (!r.segments.length) throw new Error('音声から発言を検出できませんでした');
    const marks = m.segments.filter((s) => s.kind);
    m.segments = [];
    for (const s of r.segments) pushSegment(m, { spk: s.spk, start: s.start, end: s.end, text: s.text });
    m.segments.push(...marks); m.segments.sort((a, b) => a.start - b.start);
    m.names = {}; m.rev++; m.summary = null;
    await store.saveMeeting(m);
    toast('高精度で再解析しました。議事録を作り直します', 'ok');
    dv.busy = null; renderDetail();
    if (cfg.llm) await genMinutes();
    return;
  } catch (e) { dv.error = e.message; toast(e.message, 'err'); }
  dv.busy = null; renderDetail();
}

// ---------------------------------------------------------------- 話者ダイアログ
function openSpeakers() {
  const c = spkCtx(m);
  if (!c.list.length) { toast('まだ発言がありません'); return; }
  const rows = c.list.map((spk) => {
    const segs = m.segments.filter((s) => s.spk === spk);
    const sample = segs.reduce((a, b) => (b.text.length > a.text.length ? b : a), segs[0]).text;
    return `<div class="spk-row" data-spk="${esc(spk)}">
      <div class="spk-head">${chip(c, spk)}<small>${segs.length}回の発言</small></div>
      <p class="sample">「${esc(sample.length > 44 ? `${sample.slice(0, 44)}…` : sample)}」</p>
      <div class="row">
        <input name="n_${esc(spk)}" value="${esc(c.custom(spk))}" placeholder="名前（例: 山田さん）" maxlength="20" aria-label="${esc(c.def(spk))}の名前">
        ${c.list.length > 1 ? `<select name="m_${esc(spk)}" aria-label="他の話者と統合"><option value="">統合しない</option>${c.list.filter((x) => x !== spk).map((x) => `<option value="${esc(x)}">→ ${esc(c.name(x))} と同一人物</option>`).join('')}</select>` : ''}
      </div></div>`;
  }).join('');
  openDlg(`
    <h2>話者に名前を付ける</h2>
    <p class="note">発言の内容を手がかりに名前を入力してください。同じ人が分かれて認識されている場合は「同一人物」で統合できます。議事録・Notionには現在の名前が反映されます。</p>
    <div class="spk-rows">${rows}</div>
    <div class="row end"><button type="button" class="btn ghost" data-close>キャンセル</button><button type="submit" class="btn primary">保存</button></div>`,
  (f) => f.addEventListener('submit', async () => {
    let merged = false;
    for (const spk of c.list) {
      const name = f.elements[`n_${spk}`].value.trim();
      if (name) m.names[spk] = name; else delete m.names[spk];
    }
    for (const spk of c.list) {
      const to = f.elements[`m_${spk}`]?.value;
      if (to && to !== spk) {
        m.segments.forEach((s) => { if (s.spk === spk) s.spk = to; });
        if (!m.names[to] && m.names[spk]) m.names[to] = m.names[spk];
        delete m.names[spk]; merged = true;
      }
    }
    if (merged) { m.rev++; m.segments = mergeAdjacent(m.segments); }
    dlg.close(); await store.saveMeeting(m);
    view === 'live' ? (paintTranscript(), paintSummary(false)) : renderDetail();
  }));
}
const mergeAdjacent = (segs) => {
  const out = [];
  for (const s of segs) {
    const l = out[out.length - 1];
    if (l && !l.kind && !s.kind && l.spk === s.spk && s.start - l.end < 3) { l.text += s.text; l.end = s.end; } else out.push(s);
  }
  return out;
};

function openReassign(segId) {
  const c = spkCtx(m); const seg = m.segments.find((s) => s.id === segId); if (!seg) return;
  openDlg(`
    <h2>この発言は誰ですか？</h2>
    <p class="sample">「${esc(seg.text.length > 60 ? `${seg.text.slice(0, 60)}…` : seg.text)}」</p>
    <div class="pick">${c.list.map((s) => `<button type="button" class="pick-btn ${s === seg.spk ? 'cur' : ''}" data-to="${esc(s)}">${chip(c, s)}</button>`).join('')}
    <button type="button" class="pick-btn" data-to="__new">＋ 新しい話者</button></div>
    <div class="row end"><button type="button" class="btn ghost" data-close>閉じる</button></div>`,
  (f) => f.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-to]'); if (!b) return;
    seg.spk = b.dataset.to === '__new' ? `x${uid()}` : b.dataset.to;
    m.segments = mergeAdjacent(m.segments); m.rev++;
    dlg.close(); await store.saveMeeting(m);
    view === 'live' ? paintTranscript() : renderDetail();
  }));
}

// ---------------------------------------------------------------- 設定・認証
function openSettings() {
  openDlg(`
    <h2>設定</h2>
    <label class="field"><span>会話の言語</span>
      <select name="lang"><option value="ja">日本語</option><option value="en">English</option><option value="multi">日本語＋英語が混在</option></select></label>
    ${cfg.authRequired ? '<label class="field"><span>合言葉（サーバーの ACCESS_TOKEN）</span><input name="token" type="password" autocomplete="off"></label>' : ''}
    <ul class="status compact">
      <li class="${cfg.stt ? 'ok' : 'ng'}"><b>${cfg.stt ? '✓' : '！'}</b><span>文字起こし</span></li>
      <li class="${cfg.llm ? 'ok' : 'ng'}"><b>${cfg.llm ? '✓' : '！'}</b><span>AI要約</span></li>
      <li class="${cfg.notion ? 'ok' : 'ng'}"><b>${cfg.notion ? '✓' : '！'}</b><span>Notion</span></li>
    </ul>
    <p class="note">APIキーはサーバー側にだけ保存され、ブラウザには渡りません。会議データはこの端末のブラウザ内に保存されます。</p>
    <div class="row end"><button type="button" class="btn ghost" data-close>閉じる</button><button type="submit" class="btn primary">保存</button></div>`,
  (f) => {
    f.lang.value = api.settings.lang;
    if (f.token) f.token.value = api.settings.token;
    f.addEventListener('submit', async () => {
      api.settings.lang = f.lang.value;
      if (f.token) { api.settings.token = f.token.value; await refreshConfig(); }
      dlg.close(); toast('保存しました', 'ok'); if (view === 'home') showHome();
    });
  });
}

function askAuth(msg = '') {
  openDlg(`
    <h2>合言葉を入力</h2>
    <p class="note">このサーバーは合言葉で保護されています。${esc(msg)}</p>
    <label class="field"><span>合言葉</span><input name="token" type="password" autocomplete="current-password" autofocus></label>
    <div class="row end"><button type="submit" class="btn primary">開く</button></div>`,
  (f) => {
    dlg.addEventListener('cancel', (e) => e.preventDefault(), { once: true });
    f.addEventListener('submit', async () => {
      api.settings.token = f.token.value;
      await refreshConfig();
      if (cfg.authorized) { dlg.close(); showHome(); } else askAuth('合言葉が違います。');
    });
  });
}
async function refreshConfig() {
  try { cfg = await api.getConfig(); } catch (e) { toast(e.message, 'err'); }
}

// ---------------------------------------------------------------- イベント
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  switch (b.dataset.act) {
    case 'start': openStart(); break;
    case 'demo': startLive({ title: '', system: false, demo: true }); break;
    case 'settings': openSettings(); break;
    case 'home': showHome(); break;
    case 'open': { const x = await store.getMeeting(b.dataset.id); if (x) openDetail(x); break; }
    case 'stop': stopLive(); break;
    case 'mark':
      if (live) { m.segments.push({ id: uid(), kind: 'mark', start: live.clock(), end: live.clock() }); live.dirty = true; paintTranscript(); toast('★ 重要マークを付けました', 'ok'); }
      break;
    case 'jump': { const el = $('#lv-tr'); el.scrollTop = el.scrollHeight; live.pinned = true; $('#lv-jump').hidden = true; break; }
    case 'speakers': openSpeakers(); break;
    case 'reassign': openReassign(b.dataset.seg); break;
    case 'tab': dv.tab = b.dataset.tab; $('.detail').dataset.tab = dv.tab; document.querySelectorAll('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === dv.tab))); break;
    case 'minutes': genMinutes(); break;
    case 'notion': saveNotionPage(); break;
    case 'reanalyze': reanalyze(); break;
    case 'copy': await navigator.clipboard.writeText(toMarkdown(m)).then(() => toast('コピーしました', 'ok'), () => toast('コピーできませんでした', 'err')); break;
    case 'md': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([toMarkdown(m)], { type: 'text/markdown' }));
      a.download = `${m.title.replace(/[\\/:*?"<>|]/g, '_')}.md`; a.click(); URL.revokeObjectURL(a.href); break;
    }
    case 'delete':
      if (confirm('この会議の記録と録音を端末から削除します。よろしいですか？（Notionに保存済みのページは消えません）')) { await store.deleteMeeting(m.id); showHome(); }
      break;
    default:
  }
});

// ---------------------------------------------------------------- 起動
(async function boot() {
  await refreshConfig();
  if (cfg.authRequired && !cfg.authorized) { askAuth(); return; }
  showHome();
})();

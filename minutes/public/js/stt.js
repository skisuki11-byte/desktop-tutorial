// Deepgram のリアルタイム文字起こし（話者分離つき）。
// 切断されても録音は止めず、音声を溜めて自動再接続する（失敗事例: 通信が切れた瞬間に記録が欠ける）。
const CJK = '\\u3000-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef';
const RE_CJK_GAP = new RegExp(`(?<=[${CJK}])\\s+(?=[${CJK}])`, 'g');
export const tidy = (s) => s.replace(RE_CJK_GAP, '');

// 単語列 → 文字列。日本語は詰め、英数字どうしの間だけスペースを入れる。
function joinWords(words) {
  let out = '';
  for (const w of words) {
    const t = w.punctuated_word || w.word || '';
    if (out && /[A-Za-z0-9,.!?]$/.test(out) && /^[A-Za-z0-9]/.test(t)) out += ' ';
    out += t;
  }
  return tidy(out);
}

export class LiveTranscriber {
  /** @param {{getToken:()=>Promise<string>, lang:string, clock:()=>number, onInterim:(t:string)=>void, onFinal:(seg:{spk:string,start:number,end:number,text:string})=>void, onStatus:(s:'connecting'|'live'|'reconnecting'|'error', msg?:string)=>void}} o */
  constructor(o) { this.o = o; this.queue = []; this.session = 0; this.closed = false; this.fails = 0; }

  async start() { this.closed = false; await this._connect(); }

  async _connect() {
    this.o.onStatus(this.session === 0 ? 'connecting' : 'reconnecting');
    let token;
    try { token = await this.o.getToken(); }
    catch (e) { return this._retry(e.message); }
    const q = new URLSearchParams({
      model: 'nova-3', language: this.o.lang, encoding: 'linear16', sample_rate: '16000', channels: '1',
      diarize: 'true', punctuate: 'true', smart_format: 'true', interim_results: 'true', endpointing: '600', utterance_end_ms: '1500',
    });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, ['bearer', token]);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.offset = this.o.clock();          // この接続の 0 秒 = 会議時計のこの時点
    const sess = this.session;
    ws.onopen = () => {
      this.fails = 0;
      this.o.onStatus('live');
      for (const b of this.queue.splice(0)) ws.send(b);
      this._ka = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'KeepAlive' })); }, 8000);
    };
    ws.onmessage = (ev) => { if (typeof ev.data === 'string') this._msg(JSON.parse(ev.data), sess); };
    ws.onclose = () => {
      clearInterval(this._ka);
      if (this.closed || this.ws !== ws) return;
      this._retry('接続が切れました');
    };
    ws.onerror = () => { /* onclose で処理 */ };
  }

  _retry(msg) {
    if (this.closed) return;
    this.fails++;
    this.session++;                         // 再接続後は話者番号が振り直されるため区別する
    this.o.onStatus(this.fails > 5 ? 'error' : 'reconnecting', msg);
    setTimeout(() => this._connect(), Math.min(1000 * 2 ** Math.min(this.fails, 4), 15000));
  }

  _msg(m, sess) {
    if (m.type !== 'Results') return;
    const alt = m.channel?.alternatives?.[0];
    if (!alt || !alt.transcript) return;
    if (!m.is_final) { this.o.onInterim(tidy(alt.transcript)); return; }
    this.o.onInterim('');
    const words = alt.words || [];
    if (!words.length) return;
    // 話者が切り替わる位置で分割
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const text = joinWords(cur.words);
      if (text.trim()) this.o.onFinal({
        spk: sess === 0 ? String(cur.spk) : `${sess}_${cur.spk}`,
        start: this.offset + cur.words[0].start, end: this.offset + cur.words[cur.words.length - 1].end, text,
      });
    };
    for (const w of words) {
      const spk = w.speaker ?? 0;
      if (!cur || cur.spk !== spk) { flush(); cur = { spk, words: [] }; }
      cur.words.push(w);
    }
    flush();
  }

  sendPcm(buf) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(buf);
    else if (this.queue.length < 3000) this.queue.push(buf);   // 約5分ぶんまで保持
  }

  async stop() {
    this.closed = true;
    clearInterval(this._ka);
    const ws = this.ws;
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify({ type: 'Finalize' })); } catch { /* noop */ }
      await new Promise((r) => setTimeout(r, 1200));     // 最後の確定結果を待つ
      try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch { /* noop */ }
      await new Promise((r) => setTimeout(r, 300));
    }
    try { ws?.close(); } catch { /* noop */ }
  }
}

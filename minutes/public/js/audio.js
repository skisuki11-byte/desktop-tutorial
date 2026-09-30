// 音声の取り込み。マイク(自分/対面) と PCの音声(Teams等の相手の声) を1本にミックスし、
//  - 文字起こし用に 16kHz/16bit の PCM を流す
//  - 保管用に MediaRecorder で圧縮音声を残す（クラッシュ復旧・高精度再解析のため）
const WORKLET = `
class PCM extends AudioWorkletProcessor {
  constructor(){ super(); this.ratio = sampleRate/16000; this.pos = 0; this.acc = 0; this.cnt = 0; this.out = new Int16Array(1600); this.o = 0; }
  process(inputs){
    const ch = inputs[0] && inputs[0][0];
    if(!ch) return true;
    for(let i=0;i<ch.length;i++){
      this.acc += ch[i]; this.cnt++; this.pos++;
      if(this.pos >= this.ratio){
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc/this.cnt));
        this.out[this.o++] = v < 0 ? v*32768 : v*32767;
        this.acc = 0; this.cnt = 0;
        if(this.o === this.out.length){ this.port.postMessage(this.out.slice().buffer); this.o = 0; }
      }
    }
    return true;
  }
}
registerProcessor('pcm16k', PCM);`;

export const canCaptureSystemAudio = () =>
  !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !/Android|iPhone|iPad/i.test(navigator.userAgent);

export function pickMime() {
  const c = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
}

export class Capture {
  /** @param {{mic:boolean, system:boolean, onPcm:(b:ArrayBuffer)=>void, onChunk:(b:Blob)=>void, onSourceLost:(kind:string)=>void}} o */
  constructor(o) { this.o = o; this.streams = []; this.level = 0; this.lastSound = Date.now(); }

  async start() {
    const { mic, system } = this.o;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.mix = this.ctx.createGain();
    this.mix.channelCount = 1; this.mix.channelCountMode = 'explicit';
    this.dest = this.ctx.createMediaStreamDestination();

    if (system) {
      let s;
      try {
        s = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          systemAudio: 'include', selfBrowserSurface: 'exclude',
        });
      } catch (e) {
        throw new Error(e.name === 'NotAllowedError' ? 'PCの音声の共有がキャンセルされました' : `PCの音声を取得できませんでした（${e.message}）`);
      }
      if (!s.getAudioTracks().length) {
        s.getTracks().forEach((t) => t.stop());
        throw new Error('音声が共有されませんでした。共有ダイアログで「タブの音声も共有」または「システム音声も共有」にチェックしてください');
      }
      this.streams.push(s);
      s.getVideoTracks().forEach((t) => t.addEventListener('ended', () => this.o.onSourceLost('system')));
      s.getAudioTracks().forEach((t) => t.addEventListener('ended', () => this.o.onSourceLost('system')));
      this.ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(this.mix);
    }
    if (mic) {
      let m;
      try {
        m = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) {
        this.stop();
        throw new Error(e.name === 'NotAllowedError' ? 'マイクの使用が許可されていません（ブラウザのアドレスバー左の設定から許可してください）' : `マイクを使えません（${e.message}）`);
      }
      this.streams.push(m);
      m.getAudioTracks().forEach((t) => t.addEventListener('ended', () => this.o.onSourceLost('mic')));
      this.ctx.createMediaStreamSource(m).connect(this.mix);
    }

    const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    this.node = new AudioWorkletNode(this.ctx, 'pcm16k', { numberOfInputs: 1, numberOfOutputs: 0 });
    this.node.port.onmessage = (e) => this.o.onPcm(e.data);
    this.mix.connect(this.node);
    this.mix.connect(this.dest);

    // 入力レベル（無音のまま録音していることに気づけるように）
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 512;
    this.mix.connect(this.an);
    const buf = new Uint8Array(this.an.fftSize);
    this._lv = setInterval(() => {
      this.an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      this.level = peak / 128;
      if (this.level > 0.02) this.lastSound = Date.now();
    }, 100);

    const mime = pickMime();
    this.mime = mime || 'audio/webm';
    this.rec = new MediaRecorder(this.dest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined);
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.o.onChunk(e.data); };
    this.rec.start(5000);
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    // 画面消灯で録音が止まるのを防ぐ
    this._wake = null;
    const lock = async () => { try { this._wake = await navigator.wakeLock?.request('screen'); } catch { /* 非対応でも続行 */ } };
    this._vis = () => { if (document.visibilityState === 'visible' && this.rec?.state === 'recording') lock(); };
    document.addEventListener('visibilitychange', this._vis);
    lock();
  }

  stop() {
    clearInterval(this._lv);
    document.removeEventListener('visibilitychange', this._vis);
    try { this._wake?.release(); } catch { /* noop */ }
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); } catch { /* noop */ }
    this.streams.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    this.streams = [];
    try { this.node?.disconnect(); this.ctx?.close(); } catch { /* noop */ }
  }
}

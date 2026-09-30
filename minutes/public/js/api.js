// サーバーAPIの呼び出し。合言葉は端末に保存し、毎回ヘッダーで送る。
export const settings = {
  get token() { try { return localStorage.getItem('m.token') || ''; } catch { return ''; } },
  set token(v) { try { localStorage.setItem('m.token', v); } catch { /* noop */ } },
  get lang() { try { return localStorage.getItem('m.lang') || 'ja'; } catch { return 'ja'; } },
  set lang(v) { try { localStorage.setItem('m.lang', v); } catch { /* noop */ } },
  get consent() { try { return localStorage.getItem('m.consent') === '1'; } catch { return false; } },
  set consent(v) { try { localStorage.setItem('m.consent', v ? '1' : '0'); } catch { /* noop */ } },
};

async function call(path, { body, raw, headers } = {}) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'x-access-token': settings.token, ...(raw ? {} : { 'content-type': 'application/json' }), ...headers },
    body: raw ?? JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { const e = new Error(j.error || '合言葉が違います'); e.code = 'auth'; throw e; }
  if (!r.ok) throw new Error(j.error || `通信エラー (${r.status})`);
  return j;
}

export const getConfig = async () => {
  const r = await fetch('/api/config', { headers: { 'x-access-token': settings.token } });
  if (!r.ok) throw new Error('サーバーに接続できません');
  return r.json();
};
export const sttToken = async () => (await call('/api/stt-token')).token;
export const summarize = (previous, delta) => call('/api/summarize', { body: { previous, delta } });
export const makeMinutes = (transcript, meta) => call('/api/minutes', { body: { transcript, meta } });
export const saveNotion = (payload) => call('/api/notion', { body: payload });
export const transcribeAudio = (blob, lang) => call(`/api/transcribe?lang=${encodeURIComponent(lang)}`, { raw: blob, headers: { 'content-type': blob.type || 'audio/webm' } });

const fs=require('fs'), vm=require('vm'), assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../gas/Code.gs'),'utf8');
function env(to){
  const sent=[]; const cache={};
  const ctx={console:{log:console.log,error(){}},JSON,Date,Number,String,Array,
    MailApp:{sendEmail:o=>sent.push(o)},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='TO_MADOGUCHI'?to:null})},
    LockService:{getScriptLock:()=>({waitLock(){},tryLock(){return true},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v}})},
    Utilities:{formatDate:(d,tz,f)=> f==='yyyy'?'2026':'2026092615'},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return {c:t}}})},
  };
  vm.createContext(ctx); vm.runInContext(src,ctx); return {ctx,sent};
}
const call=(e,d)=>JSON.parse(e.ctx.doPost({postData:{contents:typeof d==='string'?d:JSON.stringify(d)}}).c);
const base={app:'tsuguie',ref:'TG-260926-1234',topics:['売るか迷っている'],who:['不動産'],email:'a@b.jp',area:'静岡市',body:'本文\n2行目',estimate:''};
let e=env('halufuway@gmail.com'), r;
r=call(e,base); assert.deepStrictEqual(r,{ok:true}); assert.strictEqual(e.sent[0].to,'halufuway@gmail.com'); assert.strictEqual(e.sent[0].replyTo,'a@b.jp');
assert.ok(e.sent[0].body.includes('本文\n2行目')); console.log('ok 正常送信（宛先は窓口、返信先は相談者、本文の改行は残る）');
r=call(e,Object.assign({},base,{area:'静岡\r\nBcc: evil@x.jp'})); assert.ok(!/[\r\n]/.test(e.sent[1].subject)); console.log('ok 件名に改行を入れられない:', e.sent[1].subject);
r=call(e,Object.assign({},base,{email:'x@y.jp\nBcc: z@w.jp'})); assert.strictEqual(r.error,'email'); console.log('ok メール欄への改行入りは拒否');
r=call(e,Object.assign({},base,{email:'not-mail'})); assert.strictEqual(r.error,'email'); console.log('ok 不正なメールは拒否');
const n=e.sent.length; r=call(e,Object.assign({},base,{website:'spam'})); assert.ok(r.ok && e.sent.length===n); console.log('ok 見えない欄に入力（ボット）は送らない');
r=call(e,Object.assign({},base,{app:'other'})); assert.strictEqual(r.error,'bad_request'); console.log('ok 別アプリからは拒否');
r=call(e,'{broken'); assert.strictEqual(r.error,'bad_request'); console.log('ok 壊れたJSONは拒否');
r=call(e,Object.assign({},base,{body:'',topics:[]})); assert.strictEqual(r.error,'empty'); console.log('ok 空の相談は拒否');
r=call(e,Object.assign({},base,{ref:'<script>'})); assert.ok(e.sent.at(-1).subject.includes('TG-UNKNOWN')); console.log('ok 受付番号の形式チェック');
r=call(e,Object.assign({},base,{body:'x'.repeat(5000)})); assert.ok(e.sent.at(-1).body.length<2000); console.log('ok 長すぎる本文は切り詰め');
let e2=env('m@x.jp'); let last; for(let i=0;i<35;i++) last=call(e2,base); assert.strictEqual(last.error,'busy'); assert.strictEqual(e2.sent.length,30); console.log('ok 1時間30通で止まる（悪用対策）');
let e3=env(null); r=call(e3,base); assert.strictEqual(r.error,'failed'); console.log('ok 宛先未設定なら送らずエラー');
r=call(e,Object.assign({},base,{email:'a@b.jp,evil@x.jp'})); assert.strictEqual(r.error,'email'); console.log('ok 返信先に複数アドレスを入れられない');
r=call(e,Object.assign({},base,{email:'"x" <a@b.jp>'})); assert.strictEqual(r.error,'email'); console.log('ok 表示名つきアドレスは拒否');
r=call(e,Object.assign({},base,{email:'taro..y.@docomo.ne.jp'})); assert.ok(r.ok); console.log('ok 携帯の古い形式のアドレスは通す');
r=call(e,JSON.stringify(Object.assign({},base,{body:'x'.repeat(30000)}))); assert.strictEqual(r.error,'bad_request'); console.log('ok 20KBを超える送信は読まない');
const e4=env('m@x.jp'); e4.ctx.LockService={getScriptLock:()=>({tryLock(){return false},releaseLock(){throw new Error('not held')}})};
r=call(e4,base); assert.strictEqual(r.error,'busy'); assert.strictEqual(e4.sent.length,0); console.log('ok ロックを取れないときは busy（例外にしない）');
r=call(e,{app:'tsuguie',action:'cities',pref:'99'}); assert.strictEqual(r.error,'bad_request'); console.log('ok 存在しない都道府県コードは拒否');

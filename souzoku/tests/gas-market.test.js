const fs=require('fs'), vm=require('vm'), assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../gas/Code.gs'),'utf8');
function env(key, rowsByYear, opts){
  opts=opts||{}; const calls=[]; const cache={};
  const ctx={console:{log:console.log,error(){}},JSON,Date,Number,String,Array,Math,isFinite,parseFloat,encodeURIComponent,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='REINFOLIB_KEY'?key:null})},
    CacheService:{getScriptCache:()=>({get:k=>cache[k]||null,put:(k,v)=>{cache[k]=v},putAll:(o)=>{Object.assign(cache,o)}})},
    Utilities:{formatDate:(d,tz,f)=> f==='yyyy'?'2026':'2026092615'},
    UrlFetchApp:{fetchAll:function(reqs){return reqs.map(r=>this.fetch(r.url,r));},fetch:(url,o)=>{calls.push({url,o}); const m=url.match(/year=(\d+)/); const api=url.match(/external\/(\w+)/)[1];
      if (opts.code) return {getResponseCode:()=>opts.code,getContentText:()=>''};
      const body= api==='XIT002'? {status:'OK',data:[{id:'22101',name:'静岡市葵区'},{id:'22102',name:'静岡市駿河区'}]} : {status:'OK',data:rowsByYear[m[1]]||[]};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(body)};}},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:t=>({setMimeType(){return {c:t}}})},
  };
  vm.createContext(ctx); vm.runInContext(src,ctx); return {ctx,calls};
}
const call=(e,d)=>JSON.parse(e.ctx.doPost({postData:{contents:JSON.stringify(Object.assign({app:'tsuguie'},d))}}).c);
const H='宅地(土地と建物)';
const mk=(price,area,dist,type)=>({Type:type||H,TradePrice:String(price),Area:String(area),DistrictName:dist,Municipality:'静岡市葵区'});
const rows={'2025':[mk(10000000,100,'安東'),mk(20000000,200,'安東'),mk(30000000,150,'安東'),mk(15000000,100,'安東'),mk(25000000,250,'安東'),mk(99000000,300,'呉服町','中古マンション等')],
            '2024':[mk(12000000,120,'城東'),mk(18000000,90,'城東'),mk(22000000,110,'千代田')]};
let e=env('KEY',rows), r;
r=call(e,{action:'cities',pref:'22'}); assert.ok(r.ok && r.cities.length===2); console.log('ok 市区町村一覧');
assert.strictEqual(e.calls[0].o.headers['Ocp-Apim-Subscription-Key'],'KEY'); console.log('ok APIキーはヘッダで送る（アプリに出ない）');
r=call(e,{action:'market',city:'22101',kind:'house'});
assert.ok(r.ok && r.count===8 && r.scope==='city'); assert.ok(e.calls.some(c=>/year=2025/.test(c.url)) && e.calls.some(c=>/year=2024/.test(c.url)));
console.log('ok 市区町村全体（戸建てだけ8件、2年分）: 中央値', r.median, '/㎡単価中央値', r.unitMedian);
r=call(e,{action:'market',city:'22101',kind:'house',district:'安東'}); assert.ok(r.scope==='district' && r.count===5 && r.median===20000000); console.log('ok 地区で絞る（5件以上）: 中央値', r.median);
r=call(e,{action:'market',city:'22101',kind:'house',district:'城東'}); assert.strictEqual(r.scope,'city'); console.log('ok 地区が少ないときは市区町村全体');
r=call(e,{action:'market',city:'22101',kind:'condo'}); assert.ok(r.ok && !r.median && r.count===1); console.log('ok 取引が少ないと相場を出さない');
const n=e.calls.length; call(e,{action:'market',city:'22101',kind:'house'}); assert.strictEqual(e.calls.length,n); console.log('ok 同じ条件はキャッシュ（APIを呼ばない）');
r=call(e,{action:'market',city:'2210',kind:'house'}); assert.strictEqual(r.error,'bad_request');
r=call(e,{action:'market',city:'22101',kind:'x'}); assert.strictEqual(r.error,'bad_request');
r=call(e,{action:'cities',pref:'2&x=1'}); assert.strictEqual(r.error,'bad_request'); console.log('ok 不正なコードは拒否（URLに混ぜられない）');
r=call(env(null,rows),{action:'market',city:'22101',kind:'house'}); assert.strictEqual(r.error,'no_key'); console.log('ok キー未設定なら no_key');
r=call(env('K',rows,{code:500}),{action:'market',city:'22101',kind:'house'}); assert.strictEqual(r.error,'upstream_500'); console.log('ok API障害はエラーで返す');
r=call(env('K',rows,{code:404}),{action:'market',city:'22101',kind:'house'}); assert.ok(r.ok && r.count===0); console.log('ok 該当なし(404)は0件');
e=env('KEY',rows); r=call(e,{action:'market',city:'22101',kind:'house'});
assert.deepStrictEqual(r.districts.map(x=>x.name+x.count),['安東5','城東2','千代田1']); console.log('ok 町名の一覧（件数の多い順）:',r.districts.map(x=>x.name+'('+x.count+')').join(' '));
const c1=e.calls.length; r=call(e,{action:'market',city:'22101',kind:'house',district:'安東'}); assert.ok(r.scope==='district'&&r.count===5); assert.strictEqual(e.calls.length,c1); console.log('ok 町名を選んでも国のAPIは呼び直さない');
r=call(e,{action:'market',city:'22101',kind:'house',district:'安東一丁目'}); assert.ok(r.scope==='district'&&r.district==='安東'); console.log('ok 手で入れた「安東一丁目」も「安東」に合わせる');
e=env('KEY',rows); r=call(e,{action:'market',city:'22101',kind:'house',district:'安東'}); assert.ok(r.scope==='district'&&r.count===5); console.log('ok いきなり町名つきで聞いても答えられる');
r=call(e,{action:'market',city:'22101',kind:'house',district:'安東'}); assert.ok(r.districts&&r.districts.length===3); console.log('ok 町名の相場にも一覧がつく');
e=env('KEY',rows); e.ctx.CacheService.getScriptCache().put('market-v2-22101-house-',JSON.stringify({ok:true,count:8,scope:'city',years:'2024〜2025',median:1}));
const c0=e.calls.length; r=call(e,{action:'market',city:'22101',kind:'house'}); assert.ok(Array.isArray(r.districts)&&r.districts.length===3&&e.calls.length>c0); console.log('ok 町名の一覧がない古い形式の保存は使わず取り直す');

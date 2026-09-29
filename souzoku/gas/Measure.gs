/* 県ごとの相場ファイルを作ったときの大きさを測る（一度だけ手で実行する調査用。アプリからは呼ばれない）。
   GAS の編集画面で関数「measurePrefSizes」を選んで「実行」→「実行ログ」に結果が出る。デプロイし直す必要はない。
   東京都（最大）・千葉県・島根県（小さい県）で、2年分の戸建て・土地・マンションの取引を取り、
   アプリに置く形（価格・面積・建築年・町名番号・種類・市区町村番号だけの配列）にしたときの大きさと、圧縮後の大きさを出す。 */
function measurePrefSizes() {
  var y = Number(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy'));
  var years = [y - 1, y - 2];
  var types = [KIND_TYPE.house, KIND_TYPE.land, KIND_TYPE.condo];
  ['13', '12', '32'].forEach(function (pref) {
    var t0 = Date.now(), params = [];
    // 1回の返事が大きくなりすぎないよう、四半期ごとに分けて同時に取る
    years.forEach(function (yr) { [1, 2, 3, 4].forEach(function (q) { params.push({ year: yr, quarter: q, area: pref, priceClassification: '01' }); }); });
    var results = reinfolibAll_('XIT001', params), raw = 0, rows = [], err = '';
    results.forEach(function (r) { if (r.error) err = r.error; else rows = rows.concat(r.data || []); });
    if (err) { Logger.log(pref + ': 失敗 ' + err); return; }
    raw = JSON.stringify(rows).length;
    rows = rows.filter(function (x) { return types.indexOf(x.Type) >= 0 && num_(x.TradePrice) > 0; });
    var cities = [], cIdx = {}, names = [], nIdx = {};
    var packed = rows.map(function (x) {
      var c = String(x.MunicipalityCode || ''), n = c + '|' + String(x.DistrictName || '').trim();
      if (!(c in cIdx)) { cIdx[c] = cities.length; cities.push([c, String(x.Municipality || '')]); }
      if (!(n in nIdx)) { nIdx[n] = names.length; names.push(n); }
      return [Math.round(num_(x.TradePrice) / 10000), num_(x.Area) || 0, yearOf_(x.BuildingYear), nIdx[n], types.indexOf(x.Type), cIdx[c]];
    });
    var text = JSON.stringify({ cities: cities, names: names, rows: packed });
    var gz = Utilities.gzip(Utilities.newBlob(text, 'application/json')).getBytes().length;
    Logger.log(pref + ': 取引 ' + rows.length + '件（全種類 ' + results.reduce(function (s, r) { return s + (r.data || []).length; }, 0) + '件）'
      + ' / 国の返事 ' + Math.round(raw / 1024) + 'KB / アプリに置く形 ' + Math.round(text.length / 1024) + 'KB / 圧縮後 ' + Math.round(gz / 1024) + 'KB'
      + ' / 市区町村 ' + cities.length + ' / 町名 ' + names.length + ' / ' + ((Date.now() - t0) / 1000).toFixed(1) + '秒');
  });
}

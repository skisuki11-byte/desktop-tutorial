/* data.js — 計画そのもの。Notion「高配当ポートフォリオ設計（PayPay証券・2026年8月）」の内容を
 * そのまま持ってきた「台本」。ここは読むだけで、アプリが書き換えることはない。
 *
 * 保有額や実際の買付は端末の中（localStorage）に別で貯める（store.js）。
 * こうしておくと、計画を作り直してもこれまでの入力が消えない。
 *
 * 利回り・株価は2026年8月12日時点の公開データによる概算。投資判断は自己責任。
 */
var DIV_PLAN = {
  meta: {
    title: '高配当ポートフォリオ',
    source: 'Notion「高配当ポートフォリオ設計（PayPay証券・2026年8月）」',
    createdAt: '2026-08-12',
    broker: 'PayPay証券',
    monthly: 100000,          // 毎月の積立額（円）
    grossYield: 6.39,         // 表面利回り（加重平均・%）
    targetYoC: 7.0            // 取得利回りの目標（%）
  },

  /* ---------- 確定ポートフォリオ ---------- */
  /* payMonths … 配当が入金される月（1〜12）
   * maxWeight … この銘柄に置く上限（運用ルール）。null は個別の上限なし＝全体ルールの30%
   * payout    … 配当性向(%)。REITはAFFOベース
   * cfCover   … 営業CF ÷ 配当支払額。1.0割れは減配の予兆
   */
  holdings: [
    {
      ticker: 'MO', name: 'アルトリア', weight: 25, yield: 6.20,
      sector: 'タバコ', payMonths: [1, 4, 7, 10], maxWeight: null,
      payout: 87, cfCover: 1.15, streak: 56,
      why: '56年連続増配。会社が「中位一桁％の増配」を目標として明示。配当性向87%は高めだがキャッシュフローでカバー。シーゲル『株式投資の未来』で1957〜2003年のS&P500最優秀銘柄が前身のフィリップ・モリス。',
      risk: '喫煙率の構造的低下と規制・訴訟。'
    },
    {
      ticker: 'VZ', name: 'ベライゾン', weight: 25, yield: 6.00,
      sector: '通信', payMonths: [2, 5, 8, 11], maxWeight: null,
      payout: 68, cfCover: 1.45, streak: 20,
      why: '配当性向68%と候補中もっとも余裕がある。20年連続増配。',
      risk: '増配率は年2%前後と鈍い。'
    },
    {
      ticker: 'VICI', name: 'VICIプロパティーズ', weight: 20, yield: 6.73,
      sector: '不動産（REIT）', payMonths: [1, 4, 7, 10], maxWeight: null,
      payout: 74, cfCover: 1.35, streak: 8, isReit: true,
      why: 'AFFO配当性向は約74%（年間配当1.80ドル ÷ 2026年AFFOガイダンス2.42〜2.45ドル）。2018年の上場以来8年連続増配。シーザーズ・パレスやMGMグランドを保有する長期三重ネットリース。',
      risk: 'テナント集中（「じわじわ」ではなく「飛ぶかどうか」の二択）と金利感応度。総負債約171億ドル／総資産約467億ドル。'
    },
    {
      ticker: 'PFE', name: 'ファイザー', weight: 20, yield: 6.40,
      sector: '医薬', payMonths: [3, 6, 9, 12], maxWeight: 20,
      payout: 92, cfCover: 0.95, streak: 16,
      why: '16年連続増配。',
      risk: '2026年上期の営業CFが配当支払額を下回った。第三者の配当安全性スコアは最低水準の評価。2028年前後の特許切れが重荷。20%を上限とし増やさない。'
    },
    {
      ticker: 'CPB', name: 'キャンベルズ', weight: 10, yield: 7.10,
      sector: '食品', payMonths: [1, 4, 8, 11], maxWeight: 10,
      payout: 78, cfCover: 1.10, streak: 0,
      why: '株価が1年で約4割下落した結果の7%。',
      risk: 'GuruFocusは「Possible Value Trap」判定。10%止まり。減配が出たら即見直す枠。'
    }
  ],

  /* ---------- 除外・次点にした候補 ---------- */
  /* VICIがPayPay証券で買えなかった場合は AMCR → UPS の順で差し替える */
  candidates: [
    {
      ticker: 'AMCR', name: 'アムコア', yield: 6.13, sector: '包装', verdict: '次点',
      payMonths: [3, 6, 9, 12], payout: 72, cfCover: 1.20,
      note: '買い推奨・安定増配だがCPBと景気感応度が重なる。VICIが買えないときの第1代替。'
    },
    {
      ticker: 'UPS', name: 'ユナイテッド・パーセル・サービス', yield: 5.81, sector: '物流', verdict: '次点',
      payMonths: [3, 6, 9, 12], payout: 80, cfCover: 1.05,
      note: '16年連続増配だが物量減少局面で配当余力が論点。第2代替。'
    },
    {
      ticker: 'O', name: 'リアルティ・インカム', yield: 5.07, sector: '不動産（REIT）', verdict: '保留',
      payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], payout: 75, cfCover: 1.25, isReit: true,
      note: '毎月分配は魅力だが利回りが目標から遠い。'
    },
    {
      ticker: '2253', name: 'グローバルX スーパーディビィデンド-US ETF', yield: 5.41, sector: 'ETF（東証）', verdict: '除外',
      payMonths: [1, 4, 7, 10], payout: 0, cfCover: 0,
      note: '候補中最低利回り。信託報酬0.475%＋原資産DIVの経費で二重コスト。'
    },
    {
      ticker: 'GIS', name: 'ゼネラル・ミルズ', yield: 6.67, sector: '食品', verdict: '除外',
      payMonths: [2, 5, 8, 11], payout: 72, cfCover: 0.98,
      note: 'BofAが「配当性向70%超・高レバレッジ・EPS下方修正」と警告。CPBとリスク重複。'
    },
    {
      ticker: 'KHC', name: 'クラフト・ハインツ', yield: 6.34, sector: '食品', verdict: '除外',
      payMonths: [3, 6, 9, 12], payout: 85, cfCover: 1.00,
      note: '同上。2019年に減配履歴。'
    },
    {
      ticker: 'T', name: 'AT&T', yield: 5.15, sector: '通信', verdict: '除外',
      payMonths: [2, 5, 8, 11], payout: 60, cfCover: 1.30,
      note: 'VZと通信で完全重複。2022年半減配の当事者。'
    }
  ],

  /* ---------- 運用ルール ---------- */
  rules: [
    '1銘柄の上限は30%。利回り7%超の銘柄は合計10%まで。',
    '四半期ごとに「営業CF ÷ 配当支払額」を確認。1.0割れは減配の予兆。',
    'REITはEPSではなくAFFOで配当性向を見る。VICIは74%で健全だが100%に近づいたら警戒。',
    '配当は受け取ったら再投資。毎月入金があるので月1回まとめて買い増す。',
    'リバランスは売却ではなく買い増しで行う。NISA枠は売ると翌年まで戻らないため。',
    '発注は必ず米国の現地取引時間内（日本時間 夏22:30〜翌5:00、冬23:30〜翌6:00）。時間外はスプレッドが0.5%→0.7%になる。'
  ],

  /* 自動判定に使うしきい値（運用ルールを数字にしたもの） */
  thresholds: {
    maxWeightPerStock: 30,     // 1銘柄の上限（%）
    highYieldLine: 7.0,        // 「高利回り」とみなす線（%）
    highYieldBudget: 10,       // 高利回り銘柄の合計上限（%）
    payoutWarn: 80,            // 配当性向の警戒線（%）
    cfCoverWarn: 1.0,          // 営業CF÷配当 の警戒線
    driftWarn: 5               // 目標配分からのズレの警戒線（ポイント）
  },

  /* ---------- コストと税金（PayPay証券） ---------- */
  costs: {
    spreadInHours: 0.5,        // 米国市場の立会時間内に手動発注したとき（%）
    spreadOutHours: 0.7,       // 時間外（%）
    spreadAutoBuy: 0.7,        // つみたて（自動買付）のとき（%）— 下の confirmations 参照
    fxYenPerDollar: 0.35,      // 為替スプレッド（1ドルあたり・円）
    usdJpy: 150,               // 想定為替
    usWithholding: 10,         // 米国源泉（%）
    jpTax: 20.315              // 国内課税（特定口座・%）
  },

  /* ---------- 5年シミュレーションの前提 ---------- */
  assumptions: {
    years: 5,
    dividendGrowth: 3.0,       // 増配率（年%）
    priceGrowth: 3.0,          // 株価（年%）
    account: 'nisa'            // 'nisa' | 'tokutei'
  },

  /* ---------- PayPay証券への確認結果（2026-08-12 調査） ---------- */
  /* status: 'ok' 確認できた／'warn' 計画と食い違う／'todo' アプリでの実機確認が必要 */
  confirmations: [
    {
      id: 'spread-autobuy',
      status: 'warn',
      title: 'つみたてのスプレッドは0.7%。0.5%は手動発注のときだけ',
      body: 'PayPay証券の「つみたてロボ貯蓄」は、米国市場開場日の日本時間0時以降に最初に取得した株価・為替を参考に、買付価格へ一律 0.70% のスプレッドを加算する。計画が前提にしていた 0.5%（立会時間内の手動発注）は自動買付では取れない。積立で買う限り、買付コストは 0.7%＋為替0.23% ＝ 約0.93%。',
      action: '「買い方」を「つみたて（0.7%）」に設定して試算する。手動0.5%との差は試算タブで比較できる。',
      url: 'https://www.paypay-sec.co.jp/support/faq/faq_tsumikabu.html'
    },
    {
      id: 'cost',
      status: 'ok',
      title: 'スプレッドと為替手数料は計画どおり',
      body: '米国株は日本時間22:30〜翌5:00（冬時間23:30〜翌6:00）が0.5%、それ以外の時間帯が0.7%。為替は1ドルあたり35銭（片道）。計画の前提と一致する。',
      action: '手動で買う日は必ず立会時間内に発注する。',
      url: 'https://www.paypay-sec.co.jp/us-stock/rule/'
    },
    {
      id: 'nisa',
      status: 'ok',
      title: 'NISA成長投資枠で米国株を買える',
      body: 'PayPay証券は2024年開始の新NISAに対応済みで、成長投資枠では日本株・米国株の個別銘柄・ETF・投資信託が対象。アプリのつみたて投資も米国株に対応している。',
      action: '注文画面で口座区分が「NISA成長投資枠」になっているか、毎回確認する。',
      url: 'https://www.paypay-sec.co.jp/nisa/growth.html'
    },
    {
      id: 'nisa-autobuy',
      status: 'todo',
      title: 'つみたて設定をNISA口座で組めるか（アプリで要確認）',
      body: 'PayPay証券には「つみたてロボ貯蓄」（専用アプリ）と、PayPay証券アプリ内の「つみたて投資」の2系統がある。NISA口座を指定したつみたてが両方で組めるかは公開情報だけでは確定できなかった。ここが特定口座扱いになると、手取りは 5.75% → 4.58% に落ちる（年間で約18%減）。',
      action: 'アプリのつみたて設定画面で口座区分にNISAが選べるか確認する。選べない場合は、つみたてを使わず月1回の手動発注に切り替える（立会時間内なら0.5%なのでコストも下がる）。',
      url: 'https://www.paypay-sec.co.jp/service/reserve/'
    },
    {
      id: 'vici',
      status: 'todo',
      title: 'VICIの取扱いがあるか（アプリの銘柄検索で要確認）',
      body: 'PayPay証券の米国株は2024年12月時点で681銘柄、S&P500の売買代金・時価総額ベースで約8割をカバーするが、VICIが含まれるかは公開の一覧では確認できなかった。',
      action: 'アプリの銘柄一覧で「VICI」を検索する。無ければ AMCR（6.13%）、次いで UPS（5.81%）へ差し替える。設定タブの「候補と差し替える」から入れ替えられる。',
      url: 'https://www.paypay-sec.co.jp/us-stock/list/'
    },
    {
      id: 'reit-tax',
      status: 'todo',
      title: '米国REIT分配金の実際の源泉税率（初回入金時に要確認）',
      body: '日米租税条約の一般的な配当の軽減税率は10%だが、REITの分配金は条約上の扱いが異なり30%が引かれる場合がある。VICIの分だけ手取りが想定より2割強少なくなる可能性がある。',
      action: '初回の配当入金時に取引報告書で税率を確認する。30%だった場合は、設定タブの「VICIの源泉税率」を30に変えて試算し直し、想定と大きく違えば配分を見直す。',
      url: 'https://www.paypay-sec.co.jp/us-stock/rule/'
    }
  ],

  /* ---------- 減配事故のパターン（10章） ---------- */
  failures: [
    { name: 'LyondellBasell', year: 2026, cut: '50%減配', note: '2025年に株価が40%超下落 → 利回りが一時11%近くに → ゴールドマンが配当政策の不透明さを指摘 → 数週間後に半減。' },
    { name: 'AT&T', year: 2022, cut: '約半減', note: 'スピンオフに伴う減配。' },
    { name: 'ウォルグリーン', year: 2024, cut: '48%減配→停止', note: '' },
    { name: '3M', year: 2024, cut: '約半減', note: '' },
    { name: 'インテル', year: 2024, cut: '停止', note: '' }
  ],
  failureSigns: [
    '配当性向80%超',
    '営業CFが配当を賄えない',
    '純有利子負債EBITDA倍率3倍超'
  ]
};

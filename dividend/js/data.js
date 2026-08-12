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
    /* VICI（不動産REIT・20%）の差し替え枠。
       2026年8月、PayPay証券でVICIの取扱いが無いことを確認したため2銘柄に割った。
       米国REITは日本では外国投資信託扱いで個別の届出が要り、O や SPG でも同じ結果になる公算が高い。
       そこでREITは諦め、税制で利回りの穴を埋めるBTIと、セクターを新しく足すOKEを10%ずつ。 */
    {
      ticker: 'BTI', name: 'ブリティッシュ・アメリカン・タバコ', weight: 10, yield: 5.60,
      sector: 'タバコ（英ADR）', payMonths: [2, 5, 8, 11], maxWeight: null,
      payout: 65, cfCover: 1.30, withholding: 0,
      why: '英国籍のADRなので米国源泉税10%がかからない。NISAなら配当が完全に非課税で、表面5.60%がそのまま手取りになる。同じ手取りを米国株で得るには表面6.22%が必要で、VICIが抜けた穴を税制で埋められる唯一の候補。たばこ市場で世界シェア3位、営業利益率は5年間40%超を維持。',
      risk: 'MOとタバコで重なる。合計35%なので上限内だが、規制強化と喫煙率低下という同じ理由で2銘柄が同時に傷む。BTIを増やすときはMOを減らすこと。'
    },
    {
      ticker: 'OKE', name: 'ONEOK', weight: 10, yield: 4.80,
      sector: 'エネルギー（パイプライン）', payMonths: [2, 5, 8, 11], maxWeight: null,
      payout: 76, cfCover: 1.25,
      why: '天然ガスのパイプライン7.8万マイルを運営するエネルギーインフラ。2023年にMagellan Midstreamを約188億ドルで買収済み。配当性向76%で余裕があり、ポートフォリオにまだ無いセクターを足せる。',
      risk: '天然ガス価格と金利の両方に感応する。増配率は年2%程度と鈍く、利回りも4.80%と目標から遠い。'
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
  /* 2026-08-12 追記：VICIはPayPay証券で買えないことが分かった（本人確認済み）。
   * 米国REITは日本では「外国投資信託」扱いで金融庁への個別の届出が要るため、
   * 銘柄を絞っている証券会社では扱いが無いことが多い。O や SPG に逃げても
   * 同じ結果になる公算が高い。**REIT枠は諦めて別セクターで埋める**前提で候補を組み直した。
   *
   * withholding … 米国源泉税率(%)。省略時は costs.usWithholding(10%)。
   *               BTIは英国籍のADRで米国源泉がかからないため 0。 */
  candidates: [
    {
      ticker: 'BTI', name: 'ブリティッシュ・アメリカン・タバコ', yield: 5.60, sector: 'タバコ（英ADR）', verdict: '本命',
      payMonths: [2, 5, 8, 11], payout: 65, cfCover: 1.30, withholding: 0,
      note: '英国籍ADRのため米国源泉税10%がかからない。NISAなら配当が完全非課税になり、' +
        '手取りでは米国株の6.2%相当。利回りの穴をほぼ埋められる唯一の候補。' +
        'ただしMOとタバコで重複するため、MO25%と合わせて45%になる点は要注意。'
    },
    {
      ticker: 'OKE', name: 'ONEOK', yield: 4.80, sector: 'エネルギー（パイプライン）', verdict: '次点',
      payMonths: [2, 5, 8, 11], payout: 76, cfCover: 1.25,
      note: '天然ガスパイプライン7.8万マイル。配当性向76%で健全、セクターも完全に新規。' +
        '利回りは目標から遠いが、運用ルールにいちばん忠実に埋められる候補。'
    },
    {
      ticker: 'USB', name: 'USバンコープ', yield: 4.73, sector: '金融', verdict: '次点',
      payMonths: [1, 4, 7, 10], payout: 42, cfCover: 1.60,
      note: 'PayPay証券の配当利回りランキングに登場しており、取扱いが確認できている数少ない候補。' +
        '配当性向42%と余裕は大きい。増配率2.1%と鈍く、利回りも低い。'
    },
    {
      ticker: 'O', name: 'リアルティ・インカム', yield: 5.16, sector: '不動産（REIT）', verdict: '保留',
      payMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], payout: 73, cfCover: 1.35, isReit: true,
      note: '115四半期連続増配・AFFO配当性向73%・毎月分配と財務は候補中で最優秀。' +
        'ただしREITなのでPayPay証券にある可能性が低い（VICIと同じ理由）。買えたら有力。'
    },
    {
      ticker: 'VICI', name: 'VICIプロパティーズ', yield: 6.73, sector: '不動産（REIT）', verdict: '除外',
      payMonths: [1, 4, 7, 10], payout: 74, cfCover: 1.35, isReit: true,
      note: '2026年8月、PayPay証券で取扱いが無いことを確認。買えないため除外。'
    },
    {
      ticker: 'UPS', name: 'ユナイテッド・パーセル・サービス', yield: 6.28, sector: '物流', verdict: '除外',
      payMonths: [3, 6, 9, 12], payout: 100, cfCover: 1.02,
      note: '当初は第2代替だったが調べ直して除外。GAAP配当性向100%、FCF約55億ドルに対し配当支払い約54億ドルで' +
        'ほぼ余裕がない。「2026年末までに1/2〜1/3へ減配」との観測もある。' +
        '第9章の予兆（営業CFが配当を賄えない）にそのまま当てはまる。'
    },
    {
      ticker: 'AMCR', name: 'アムコア', yield: 5.28, sector: '包装', verdict: '除外',
      payMonths: [3, 6, 9, 12], payout: 175, cfCover: 0.95,
      note: '当初は第1代替だったが調べ直して除外。2025年4月のBerry Global合併で負債が膨らみ、' +
        'GAAP配当性向は175%。外部評価も「高レバレッジ・低財務健全性・持続不可能な配当性向」を指摘。' +
        '利回りもNotion作成時の6.13%から低下している。CPBと景気感応度が重なる点も当初のまま。'
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
    '同じセクターの合計は40%まで。MO＋BTIのタバコが35%あるので、片方を増やすならもう片方を減らす。',
    '四半期ごとに「営業CF ÷ 配当支払額」を確認。1.0割れは減配の予兆。',
    'REITはEPSではなくAFFOで配当性向を見る。VICIは74%で健全だが100%に近づいたら警戒。',
    '配当は受け取ったら再投資。毎月入金があるので月1回まとめて買い増す。',
    'リバランスは売却ではなく買い増しで行う。NISA枠は売ると翌年まで戻らないため。',
    '発注は必ず米国の現地取引時間内（日本時間 夏22:30〜翌5:00、冬23:30〜翌6:00）。時間外はスプレッドが0.5%→0.7%になる。'
  ],

  /* 自動判定に使うしきい値（運用ルールを数字にしたもの） */
  thresholds: {
    maxWeightPerStock: 30,     // 1銘柄の上限（%）
    maxWeightPerSector: 40,    // 同じセクターの合計上限（%）
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
      id: 'robo-nisa',
      status: 'warn',
      title: 'つみたてロボ貯蓄はNISA口座で取引できない（特定口座のみ）',
      body: 'PayPay証券は「つみたてロボ貯蓄アプリでのお取引は特定口座（源泉徴収あり）のため、NISA口座でお取引いただくことはできません」と明記している。米国株の自動積立で真っ先に挙がるのがこのアプリだが、これを使うとNISAではなく特定口座になる。手取りは 5.75% → 4.58%、残高750万円なら年間で約9万円の差。',
      action: 'つみたてロボ貯蓄は使わない。NISAで積み立てるならPayPay証券アプリ内の「つみたて投資」でNISAが選べるかを確認し、選べなければ月1回の手動発注に切り替える（立会時間内ならスプレッドも0.5%に下がる）。',
      url: 'https://www.paypay-sec.co.jp/support/faq/faq_tsumikabu.html'
    },
    {
      id: 'nisa-autobuy',
      status: 'todo',
      title: 'PayPay証券アプリのつみたて投資でNISAを選べるか（アプリで要確認）',
      body: 'PayPay証券アプリの「つみたて投資」は米国株に対応し、毎月（月3日まで）または毎週（週5日まで）で日を指定できる。ただしこのつみたてで口座区分にNISAを指定できるかは、公開情報だけでは確定できなかった。つみたてロボ貯蓄がNISA不可と明記されている以上、ここは自分の目で確かめる必要がある。',
      action: 'PayPay証券アプリのつみたて設定画面で、口座区分にNISA成長投資枠が選べるか確認する。選べなければ月1回の手動発注に切り替える。',
      url: 'https://www.paypay-sec.co.jp/tool/trade/reserve/'
    },
    {
      id: 'nisa-per-stock',
      status: 'todo',
      title: 'NISAで買えるかは銘柄ごとに違う（一覧に「NISA対象」の絞り込みがある）',
      body: 'PayPay証券の米国株取扱銘柄一覧には「NISA対象」での絞り込みがあり、銘柄ごとにNISAマークで可否が示されている。制度上は米国の個別株も成長投資枠の対象（整理・監理銘柄を除く）だが、PayPay証券では取扱いがあってもNISAでは買えない銘柄がありうる。つまり「取扱いがある＝NISAで買える」ではない。',
      action: '取扱銘柄一覧を「NISA対象」で絞り込み、MO・VZ・VICI・PFE・CPB の5銘柄すべてにNISAマークが付いているか確認する。下の一覧に結果を書き込むつもりで1銘柄ずつ見ること。',
      url: 'https://www.paypay-sec.co.jp/us-stock/list/'
    },
    {
      id: 'vici',
      status: 'warn',
      title: 'VICIは買えない。米国REITは全般に扱いが無いとみておく',
      body: '2026年8月、PayPay証券でVICIの取扱いが無いことを確認した。米国REITは日本では「外国投資信託」の扱いになり、銘柄ごとに金融庁への届出が要る。銘柄を絞っている証券会社では扱いが無いことが多く、O（リアルティ・インカム）やSPGに替えても同じ結果になる公算が高い。VICIはS&P500構成銘柄でもあるので、「S&P500に入っている＝買える」も成り立たない。',
      action: 'REIT枠は諦め、20%を BTI 10% ＋ OKE 10% に振り替えた。REITをどうしても入れたい場合は、先にアプリの銘柄一覧でOを検索して存在を確かめること。',
      url: 'https://www.paypay-sec.co.jp/us-stock/list/'
    },
    {
      id: 'bti-oke',
      status: 'todo',
      title: '差し替えた BTI・OKE の取扱いを確認する',
      body: 'VICIの穴を埋めた2銘柄は、どちらも取扱いを確認できていない。BTIは英国籍のADRで、PayPay証券はS&P500中心の品揃えのためADRを扱うかが不明。OKEはS&P500構成銘柄だが、VICIも同じくS&P500で取扱いが無かったため根拠にならない。',
      action: 'アプリの銘柄一覧で「BTI」「OKE」を検索する。BTIが無い場合、税制の利点を持つ代わりが他に無いため、OKEを20%にするかUSB（取扱い確認済み・4.73%）で埋める。OKEが無い場合はUSBで埋める。',
      url: 'https://www.paypay-sec.co.jp/us-stock/list/'
    },
    {
      id: 'bti-tax',
      status: 'ok',
      title: 'BTIは米国源泉税がかからない（英国籍ADR）',
      body: 'ブリティッシュ・アメリカン・タバコは英国籍のADRで、英国は配当に源泉税を課さないため米国株の10%が引かれない。NISA口座なら配当が完全に非課税になる。表面5.60%がそのまま手取り5.60%で、同じ手取りを米国株で得るには表面6.22%が必要。',
      action: '初回の配当入金時に取引報告書で、実際に源泉徴収が0であることを確認する。違っていたら設定タブでBTIの利回りを実態に合わせる。',
      url: ''
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

  /* ---------- 銘柄ごとの取扱い状況（2026-08-12 調査） ---------- */
  /* handled … PayPay証券で買えるか  nisa … NISA口座で買えるか
   * 'likely' 公開情報で強く示唆される／'unknown' 確認できなかった／'yes' 自分で確認済み
   * NISA可否は銘柄一覧の「NISA対象」絞り込みで銘柄ごとに決まるため、公開情報からは誰も断定できない。
   * アプリで確かめたら、確認事項タブのチェックで自分の目で見た結果に更新する。 */
  availability: {
    asOf: '2026-08-12',
    items: [
      { ticker: 'MO', handled: 'likely', nisa: 'unknown',
        evidence: 'PayPay証券の自社メディアの配当利回りランキング（当社取扱銘柄が対象）に繰り返し掲載。2026年6月 6.23%、2026年3月 6.27%' },
      { ticker: 'VZ', handled: 'likely', nisa: 'unknown',
        evidence: '同ランキングに繰り返し掲載。2026年7月 6.68%' },
      { ticker: 'BTI', handled: 'unknown', nisa: 'unknown',
        evidence: '英国籍のADR。PayPay証券はS&P500中心の品揃えでADRの扱いは確認できていない。VICIの代替として入れた銘柄なので、まずここを確かめる' },
      { ticker: 'PFE', handled: 'likely', nisa: 'unknown',
        evidence: '同ランキングの上位常連。2026年7月 7.29%、2026年6月 6.71%' },
      { ticker: 'OKE', handled: 'unknown', nisa: 'unknown',
        evidence: 'S&P500構成銘柄だが公開情報では確認できず。VICIもS&P500で取扱いが無かったため、S&P500入りは根拠にならない' },
      { ticker: 'CPB', handled: 'likely', nisa: 'unknown',
        evidence: '同ランキングに掲載。予想配当利回り7.10%で計画の数値と一致' }
    ]
  },

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

/**
 * 設定のまとめ。
 *
 * 鍵やIDはコードに書かず、すべて「スクリプト プロパティ」に入れます。
 * （エディタ左の ⚙ プロジェクトの設定 → スクリプト プロパティ）
 *
 * 入れるもの：
 *   GEMINI_API_KEY             … Google AI Studio のAPIキー（無料。既定はこちら）
 *   LINE_CHANNEL_ACCESS_TOKEN  … LINE Developers の「長期のアクセストークン」
 *   WEBHOOK_TOKEN              … 自分で決めた合言葉（Webhook URLの ?token= に付ける）
 *   SPREADSHEET_ID             … 記録用スプレッドシートのID（setup() が自動で入れます）
 *   OWNER_USER_ID              … 持ち主のLINE userId（初回メッセージで自動で入ります）
 *
 * 任意：
 *   PROVIDER      … 頭脳をどれにするか。gemini（既定・無料）または claude（有料）
 *   GEMINI_MODEL  … 既定 gemini-3-flash。違うと言われたら listGeminiModels で確かめる
 *   CALENDAR_ID   … 使うカレンダー。既定は自分のメインカレンダー
 *   OWNER_NAME    … 呼びかたに使う名前。既定「あなた」
 *   MORNING_HOUR  … 朝のお知らせの時刻（0-23）。既定 7
 *   PUSH_LIMIT    … こちらから送る通数の月あたり上限。既定 190（LINE無料枠は200）
 *
 * PROVIDER = claude にするときだけ：
 *   ANTHROPIC_API_KEY … Claude のAPIキー（sk-ant-... ）
 *   MODEL             … 既定 claude-opus-5。速さと安さなら claude-sonnet-5
 *   EFFORT            … どこまで考えさせるか low/medium/high/xhigh/max。既定 medium
 */

var CFG_DEFAULTS = {
  PROVIDER: 'gemini',
  GEMINI_MODEL: 'gemini-3-flash',
  CALENDAR_ID: 'primary',
  MODEL: 'claude-opus-5',
  EFFORT: 'medium',
  OWNER_NAME: 'あなた',
  MORNING_HOUR: '7',
  PUSH_LIMIT: '190'
};

/* Claude API */
var ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_VERSION = '2023-06-01';

/* 考えた分もここに含まれる。予定の登録程度なら十分だが、絞りすぎると途中で切れる */
var MAX_TOKENS = 8000;

/* 断られたときに別のモデルで引き受け直させる（安全側の判定に触れたとき用） */
var FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/* 道具を使わせる往復の上限。増やすほど賢いが、LINEの返信が遅くなる */
var MAX_TOOL_TURNS = 6;

/* 会話の文脈として読み返す直近の発言数（往復ではなく件数） */
var HISTORY_TURNS = 20;

/* やり残しの催促のしかた */
var NUDGE_LEAD_MIN = 60;      // 期限の何分前に最初の声かけをするか
var NUDGE_INTERVAL_H = 3;     // 期限を過ぎたあと、何時間おきに催促するか
var NUDGE_MAX = 8;            // 何回まで催促するか（これを超えたら「まだ要る？」と聞く）
var QUIET_START_HOUR = 22;    // この時刻から翌朝まで催促しない
var QUIET_END_HOUR = 8;

var TZ = 'Asia/Tokyo';

/** プロパティを1つ読む。無ければ既定値、それも無ければ '' */
function cfg_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (v !== null && v !== '') return v;
  return CFG_DEFAULTS[key] || '';
}

/** プロパティを1つ書く */
function cfgSet_(key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
}

/** 必須の設定が入っているか確かめる。足りなければ例外 */
function cfgRequire_(keys) {
  var missing = keys.filter(function (k) { return !cfg_(k); });
  if (missing.length) {
    throw new Error('スクリプト プロパティが足りません: ' + missing.join(', '));
  }
}

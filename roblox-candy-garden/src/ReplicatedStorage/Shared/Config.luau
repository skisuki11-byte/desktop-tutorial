-- ゲーム全体の数値設定。数字は仮。遊んで調整する（遊んだ感想をもとに直していく）。
local Config = {}

Config.DataStoreName = "CandyGardenV1"
Config.AutoSaveSeconds = 60

Config.StartCoins = 30

-- キャラクターの動き。Robloxの標準は 歩く速さ16・ジャンプ7.2。
-- 広い庭と広場を行き来するので、少し速く・少し高く跳べるようにして軽快にする
Config.WalkSpeed = 24
Config.JumpHeight = 8.5
Config.StartSeeds = { gummyberry = 3 }

Config.MaxPlots = 8 -- 同時に遊べる人数分の庭。StudioのMax Playersも8にする
Config.PlotTiles = 6 -- 最初の畑の枚数
Config.PlotMaxTiles = 12 -- 広げたときの最大（4列×3段）
-- 畑を広げる（コインの大きな使い道）。値段は「慣れた人が1分に2,400〜7,000コイン稼ぐ」ことを基準に決めた:
--   6→9マス: 慣れた人で約10分 / はじめたばかりの人で1〜2時間の目標
--   9→12マス: 慣れた人で約30〜40分の目標
Config.PlotUpgrades = {
	{ tiles = 9, price = 30000 },
	{ tiles = 12, price = 150000 },
}

-- 庭の飾り（柵のまわりの6か所に置ける。8種類あるので、どれを飾るか選ぶ楽しさがある）。
-- 値段は「慣れた人が1分に2,400〜7,000コイン稼ぐ」を基準に、すぐ買える物から、何日も目標にする物まで
-- points: にぎやかさの点数
Config.Decor = {
	{ id = "candylamp", icon = "🕯️", price = 2000, points = 1 },
	{ id = "flowerbed", icon = "🌷", price = 4000, points = 2 },
	{ id = "cupcakehouse", icon = "🧁", price = 8000, points = 3 },
	{ id = "lollitree", icon = "🍭", price = 15000, points = 4 },
	{ id = "fountain", icon = "⛲", price = 30000, points = 6 },
	{ id = "bearstatue", icon = "🧸", price = 60000, points = 8 },
	{ id = "rainbowarch", icon = "🌈", price = 120000, points = 12 },
	{ id = "castle", icon = "🏰", price = 300000, points = 20 },
}
Config.DecorById = {}
for _, item in Config.Decor do
	Config.DecorById[item.id] = item
end
-- にぎやかさのランク（🌱→🌸→🌟→👑）。飾りの点数＋畑の広さのボーナス
Config.DecorRank = {
	thresholds = { 0, 5, 15, 35 },
	tileBonus = { { tiles = 9, points = 2 }, { tiles = 12, points = 5 } },
}

Config.SparkleChance = 0.1 -- 収穫時の「きらきら」確率

-- 水やり（あげなくても普通に育つ。あげると少し早く・きらきらが出やすくなる。忘れても損はしない）
-- 自分の畑にも、ほかの人の畑にもあげられる（手伝うと、お礼にコイン）。1回植えるごとに1回まで
Config.Water = {
	speedUp = 0.25, -- 育つ時間の25%ぶん、早く実る
	sparkleBonus = 0.15, -- 収穫のきらきら確率が+15%
	helperCoins = 10, -- ほかの人の畑に水をあげたときのお礼
	-- じょうろ: 水やり1回で1つ減る。からっぽになったら、いちごミルクの池のポンプで水をくむ（タダ。でも歩く手間がかかる）
	-- ショップで大きくできる（たまったコインの使い道）
	-- 大きくしても1回分ずつしか増やさない（快適にしすぎない。ちょっと面倒だけど、やると後が少し楽になる程度）。
	-- いちばん大きくても6回分＝畑6マスにやっと1周。池には何度も通う
	cans = { 3, 4, 5, 6 }, -- じょうろの大きさごとの回数
	canPrices = { 0, 1500, 6000, 20000 }, -- その大きさにするのに必要なコイン
}

-- キャンディひりょう: ショップで買う使い切りのアイテム。育っている途中の作物に、植えるごとに1回使える。
-- 水やりより よく効く（育つ時間の40%ぶん早く実る）。ほかの人の畑にも使える（手伝い）
Config.Fertilizer = {
	price = 300,
	speedUp = 0.4,
	max = 99, -- 持てる数
}

-- ふしぎのしずく: どうぐ屋だけで買える。育っている途中の作物に使うと、実ったときに ふしぎな姿（ジャンボ・きんいろ・にじいろ）が
-- 出やすくなる（確率が multiplier 倍）。植えるごとに1回まで。ほかの人の畑にも使える
Config.Drop = {
	price = 1500,
	multiplier = 3,
	max = 20,
}

-- 遠くのお店（そこでしか買えない）。近くにいないと買えない（サーバーが距離を確かめる）
Config.ShopReach = 22

-- ペットのお手伝い: 連れているペットが、ときどき自分の畑に水をあげてくれる（じょうろの水は使わない）。
-- 20秒ごとに、ペット1匹ずつ この確率で手伝う。珍しいペットほど よく手伝う（rarity 1〜6）
Config.PetHelp = {
	interval = 20,
	chance = { 0.06, 0.09, 0.13, 0.18, 0.25, 0.35 },
}
Config.SparkleMultiplier = 2

-- ふしぎな作物: 実った瞬間に、まれに特別な姿になる（何になるかは実ったときに決まるので、畑を見に来るのが楽しみになる）。
-- 畑の上でも見た目が変わるので、ほかの人にも見せられる。上から順に抽選する。
-- chance=ふだんの確率 / weather=その天気の間に実ったときの確率 / wateredBonus・fertilizedBonus=世話をした作物は出やすい
-- sparkle（きらきら）の確率は今までどおり Weather.sparkleChance ＋ 水やりのボーナス
Config.Variants = {
	{ id = "rainbow", icon = "🌈", multiplier = 10, chance = 0.01, weather = { rainbow = 0.08 } },
	{ id = "golden", icon = "👑", multiplier = 5, chance = 0.03, weather = { starfall = 0.12 }, wateredBonus = 0.03 },
	{
		id = "jumbo",
		icon = "🍭",
		multiplier = 3,
		chance = 0.05,
		weather = { sprinkles = 0.12 },
		fertilizedBonus = 0.1,
		scale = 1.6, -- ジャンボは大きく実る
	},
	{ id = "sparkle", icon = "✨", multiplier = 2 },
}
Config.VariantById = {}
for _, v in Config.Variants do
	Config.VariantById[v.id] = v
end
-- 作物ずかんに並べる順（ふつう → きらきら → ジャンボ → きんいろ → にじいろ）
Config.VariantOrder = { "normal", "sparkle", "jumbo", "golden", "rainbow" }

-- 作物ずかん: 作物 × 姿（ふつう・きらきら・ジャンボ・きんいろ・にじいろ）を集める。集めた数でごほうび（1回ずつ）
Config.CropDex = {
	rewards = {
		{ count = 5, coins = 500 },
		{ count = 10, coins = 3000, fertilizer = 3 },
		{ count = 18, coins = 15000, fertilizer = 5 },
		{ count = 30, coins = 100000 }, -- ぜんぶ（6しゅるい × 5つの姿）
	},
}

-- icon: 絵文字 / color: 実の色
-- 育つ時間は、水やり・ひりょう・ペットのお手伝いで早められる前提で、少し長め（もとの1.5倍）。
-- ムーンキャンディは「寝る前に植えて翌朝」のための作物なので、8時間のまま
Config.Crops = {
	{ id = "gummyberry", icon = "🍓", seedPrice = 10, growTime = 30, sellPrice = 18, color = Color3.fromRGB(255, 92, 138) },
	{ id = "peropero", icon = "🌸", seedPrice = 50, growTime = 90, sellPrice = 110, color = Color3.fromRGB(255, 140, 214) },
	{ id = "wataame", icon = "☁️", seedPrice = 250, growTime = 270, sellPrice = 600, color = Color3.fromRGB(176, 206, 255) },
	{ id = "nijimelon", icon = "🍈", seedPrice = 1200, growTime = 720, sellPrice = 3200, color = Color3.fromRGB(120, 230, 170) },
	{ id = "starcake", icon = "🍰", seedPrice = 6000, growTime = 1800, sellPrice = 18000, color = Color3.fromRGB(255, 214, 90) },
	-- 寝る前に植えて、翌日に収穫する作物（8時間）。オフライン中も育つので「明日また来る理由」になる
	{ id = "mooncandy", icon = "🌙", seedPrice = 2000, growTime = 28800, sellPrice = 20000, color = Color3.fromRGB(150, 140, 255) },
}

-- 種屋の入れ替わり（Grow a Garden の種屋と同じ考え方）。restockSeconds ごとに品ぞろえが変わる。
-- 品ぞろえは時刻から決まるので、どのサーバーでも同じ（「いま スターケーキが 入ってるよ」と話せる）。
-- 数は ひとりずつ別（取り合いにならない）。グミベリーは毎回かならず入る（種がなくて困らないように）
-- chance=その回に入荷する確率 / min〜max=入荷する数
Config.SeedShop = {
	restockSeconds = 300,
	stock = {
		gummyberry = { chance = 1, min = 10, max = 20 },
		peropero = { chance = 1, min = 4, max = 8 },
		wataame = { chance = 0.8, min = 2, max = 5 },
		nijimelon = { chance = 0.5, min = 1, max = 3 },
		mooncandy = { chance = 0.35, min = 1, max = 2 },
		starcake = { chance = 0.25, min = 1, max = 2 },
	},
	rare = { starcake = true, mooncandy = true }, -- 入荷したら、みんなにお知らせする
}

-- いまの入荷の回（時刻から計算。サーバーとクライアントで同じ値になる）
function Config.seedRound(serverTime: number): number
	return math.floor(serverTime / Config.SeedShop.restockSeconds)
end

-- その回の品ぞろえ [cropId] = 入荷した数（入荷しなかった種は入らない）
function Config.seedStock(round: number): { [string]: number }
	local rng = Random.new(round * 7919 + 104729)
	local stock = {}
	for _, cropId in Config.CropOrder do
		local rule = Config.SeedShop.stock[cropId]
		-- 抽選の回数をそろえるため、入荷しない種でも乱数を2回引く
		local roll = rng:NextNumber()
		local count = rng:NextInteger(rule and rule.min or 0, rule and rule.max or 0)
		if rule and roll < rule.chance then
			stock[cropId] = count
		end
	end
	return stock
end

Config.CropById = {}
Config.CropOrder = {}
for _, crop in Config.Crops do
	Config.CropById[crop.id] = crop
	table.insert(Config.CropOrder, crop.id)
end

-- ペット（Pals）。bonus は売値に足される割合（連れている分の合計）
Config.MaxPets = 20
Config.MaxEquipped = 3

-- rarity: 1=ふつう 2=めずらしい 3=レア 4=すごいレア 5=でんせつ 6=まもりがみ 7=ゆめいろ / ears: 見た目の型
-- giftOnly: たまごからは出ない（ほしぞらのおくりものでだけ会える）
Config.Pets = {
	{ id = "gummybear", icon = "🐻", rarity = 1, bonus = 0.05, color = Color3.fromRGB(255, 120, 140), ears = "round" },
	{ id = "lollibunny", icon = "🐰", rarity = 2, bonus = 0.10, color = Color3.fromRGB(255, 170, 215), ears = "long" },
	{ id = "cottoncat", icon = "🐱", rarity = 3, bonus = 0.20, color = Color3.fromRGB(185, 215, 255), ears = "point" },
	{ id = "rainbowunicorn", icon = "🦄", rarity = 4, bonus = 0.40, color = Color3.fromRGB(235, 200, 255), ears = "horn" },
	{ id = "starcakedragon", icon = "🐉", rarity = 5, bonus = 1.00, color = Color3.fromRGB(255, 214, 90), ears = "wings" },
	-- ほしのたまご（Config.Eggs）からだけ出る、超レア
	{ id = "cottonwhale", icon = "🐋", rarity = 5, bonus = 1.20, color = Color3.fromRGB(150, 200, 255), ears = "whale" },
	{ id = "dreamphoenix", icon = "🐦", rarity = 7, bonus = 2.00, color = Color3.fromRGB(255, 150, 220), ears = "phoenix" },
	{
		id = "starguardian",
		icon = "🌠",
		rarity = 6,
		bonus = 0.50,
		color = Color3.fromRGB(110, 100, 220),
		ears = "guardian",
		giftOnly = true,
	},
}

-- weight の合計に対する割合が出る確率。画面にそのまま表示する
Config.Eggs = {
	{
		id = "candyegg",
		icon = "🥚",
		price = 250,
		odds = {
			{ pet = "gummybear", weight = 60 },
			{ pet = "lollibunny", weight = 25 },
			{ pet = "cottoncat", weight = 10 },
			{ pet = "rainbowunicorn", weight = 4 },
			{ pet = "starcakedragon", weight = 1 },
		},
	},
	-- ほしのたまご: 高いけれど、レアなペットだけが出る。超レアの わたあめクジラ・ゆめいろフェニックス はここだけ
	{
		id = "staregg",
		icon = "🌟",
		price = 5000,
		odds = {
			{ pet = "cottoncat", weight = 40 },
			{ pet = "rainbowunicorn", weight = 30 },
			{ pet = "starcakedragon", weight = 20 },
			{ pet = "cottonwhale", weight = 8 },
			{ pet = "dreamphoenix", weight = 2 },
		},
	},
}

-- ペット図鑑: 見つけた（一度でも持った）ペットの種類の数で、ごほうび（1回ずつ）
Config.Dex = {
	rewards = {
		{ count = 3, coins = 1000 },
		{ count = 5, coins = 5000, fertilizer = 3 },
		{ count = 7, coins = 20000, fertilizer = 10 },
		{ count = 8, coins = 100000 }, -- ぜんぶ（8しゅるい。まもりがみ も入る）
	},
}

-- ペットの交換: Robloxで友だちの人とだけ（知らない人からだまし取られないように）。
-- おたがいに中身を見て、2人とも「OK」を押してから少し待って交換する。中身が変わったら OK はやりなおし
Config.Trade = {
	maxOffer = 3, -- 1回に出せるペットの数
	countdown = 3, -- 2人がOKしてから交換するまでの秒数（最後に確かめる時間）
	requestSeconds = 30, -- おさそいの有効時間
}

-- お天気イベント。天気の間は、収穫のきらきら確率が sparkleChance に上がる
Config.Weather = {
	FirstDelay = 60, -- 最初の天気までの秒数（早く体験してもらう）
	Interval = 300, -- 天気の開始から次の開始までの秒数
	Duration = 90,
	Types = {
		{
			id = "sprinkles",
			icon = "🍬",
			sparkleChance = 0.35,
			tint = Color3.fromRGB(255, 232, 244),
			particle = Color3.fromRGB(255, 130, 190),
		},
		{
			id = "rainbow",
			icon = "🌈",
			sparkleChance = 0.5,
			tint = Color3.fromRGB(240, 236, 255),
			particle = Color3.fromRGB(150, 200, 255),
		},
		{
			id = "starfall",
			icon = "⭐",
			sparkleChance = 0.6,
			tint = Color3.fromRGB(255, 244, 214),
			particle = Color3.fromRGB(255, 220, 90),
		},
	},
}
Config.WeatherById = {}
for _, w in Config.Weather.Types do
	Config.WeatherById[w.id] = w
end

-- コミュニティの木。サーバー全員の収穫が成長ポイントになり、レベルが上がると全員にごほうび
Config.Tree = {
	BaseGoal = 20, -- レベル1に必要なポイント
	-- レベルごとに必要ポイントが増える倍率。1.25 だとレベル20まで合計 約6,800ポイント（みんなで数時間遊べば届く）。
	-- 1.5 だと約88,000ポイントになり、レベル20の見た目に誰も届かなかった
	GoalGrowth = 1.25,
	RewardBase = 100, -- レベル1のごほうびコイン（全員）
	RewardGrowth = 1.2, -- レベル20で約3,200コイン
	MaxVisualLevel = 10, -- 形が変わるのはレベル10まで。そのあとは色が変わる（Tree.Themes）
	-- 色のテーマ: このレベルから切り替わる（パステル → 金色の夕焼け → 星空）
	Themes = { { from = 1, id = "pastel" }, { from = 10, id = "golden" }, { from = 20, id = "galaxy" } },
	Points = { gummyberry = 1, peropero = 3, wataame = 8, nijimelon = 18, starcake = 40, mooncandy = 30 },
}

-- ほしぞらのおくりもの: みんなの木がこのレベルになったら、全員に1回だけ。あとから来た人にも渡す
-- （その場にいた人だけのごほうびにすると、子供が「見逃したくない」と遊び続けるよう追い立ててしまうため）
Config.StarGift = {
	level = 20,
	coins = 10000,
	cosmetics = { "starcrown", "starwings" },
	pet = "starguardian", -- ほしぞらの まもりがみ
	festivalSeconds = 24 * 3600, -- ほしぞらまつり（全サーバーで星が降り、きらきらが出やすい）
	sparkleBonus = 0.25,
}

function Config.treeGoal(level: number): number
	return math.floor(Config.Tree.BaseGoal * Config.Tree.GoalGrowth ^ (level - 1) + 0.5)
end

function Config.treeReward(level: number): number
	return math.floor(Config.Tree.RewardBase * Config.Tree.RewardGrowth ^ (level - 1))
end

-- おしゃれ（アバターアイテム）。ぜんぶコードで作る見た目。コインで買える（無料の道）。
-- price=0 は最初からもらえる。pass=... は、そのゲームパスを持っている人が使える（コインでは買えない）。
Config.CosmeticSlots = { "hat", "back", "trail" }
Config.Cosmetics = {
	{ id = "bunnyears", slot = "hat", icon = "🐰", price = 0 },
	{ id = "catears", slot = "hat", icon = "🐱", price = 150 },
	{ id = "candyhat", slot = "hat", icon = "🍭", price = 250 },
	{ id = "icecream", slot = "hat", icon = "🍦", price = 400 },
	{ id = "chefhat", slot = "hat", icon = "🧁", price = 600 },
	{ id = "starhalo", slot = "hat", icon = "⭐", price = 1200 },
	{ id = "crown", slot = "hat", icon = "👑", price = 2500 },
	{ id = "cottoncloud", slot = "back", icon = "☁️", price = 200 },
	{ id = "candycane", slot = "back", icon = "🍬", price = 450 },
	{ id = "fairywings", slot = "back", icon = "🦋", price = 900 },
	{ id = "rainbowcape", slot = "back", icon = "🌈", price = 1800 },
	{ id = "goldwings", slot = "back", icon = "🌟", pass = "gold" },
	{ id = "ribbon", slot = "hat", icon = "🎀", codeOnly = true }, -- ログインコードでだけ手に入る
	-- シーズンパスのごほうび（コインでは買えない）
	{ id = "berryhat", slot = "hat", icon = "🍓", seasonOnly = true },
	{ id = "lollipopback", slot = "back", icon = "🍭", seasonOnly = true },
	{ id = "startrail", slot = "trail", icon = "🌟", seasonOnly = true },
	{ id = "gemcrown", slot = "hat", icon = "💎", seasonOnly = true },
	-- 期間限定ショップの品（ふつうのおしゃれ画面では買えない。日替わりで並ぶ）
	{ id = "puddinghat", slot = "hat", icon = "🍮", shopOnly = true },
	{ id = "donutback", slot = "back", icon = "🍩", shopOnly = true },
	{ id = "heartwings", slot = "back", icon = "💕", shopOnly = true },
	{ id = "candytrail", slot = "trail", icon = "🍬", shopOnly = true },
	-- ほしぞらの木（みんなの木 レベル20）のごほうびでだけ手に入る
	{ id = "starcrown", slot = "hat", icon = "👑", starOnly = true },
	{ id = "starwings", slot = "back", icon = "🌌", starOnly = true },
	-- やくそくの花が さいたときだけ もらえる（友だちとの やくそくの しるし）
	{ id = "flowercrown", slot = "hat", icon = "🌼", friendOnly = true },
	{ id = "sparkletrail", slot = "trail", icon = "✨", price = 300 },
	{ id = "hearttrail", slot = "trail", icon = "💗", price = 700 },
	{ id = "rainbowtrail", slot = "trail", icon = "🌈", price = 1500 },
}
Config.CosmeticById = {}
for _, item in Config.Cosmetics do
	Config.CosmeticById[item.id] = item
end

-- ロバックスの商品（ゲームパス）。id を 0 のままにすると、画面に出ない・買えない。
-- 作ったゲームパスのIDをここに入れる（README参照）。ランダム要素は入れない（中身が決まった商品だけ）。
Config.Passes = {
	coins2x = { id = 0, icon = "💰", multiplier = 2 }, -- 売値2倍（便利さ）
	gold = { id = 0, icon = "🌟" }, -- ゴールドのつばさ（限定の見た目）
	season = { id = 0, icon = "🎫" }, -- シーズンパスのスペシャルの道（中身は決まっている）
}

-- 期間限定ショップ（日替わり）。毎日 UTC 0時（日本時間 朝9時）に、pool から slots 個を選んで並べる。
-- 子供向けの配慮: コインだけで買える（ロバックスは使わない）。品物は何日かすると戻ってくる（「二度と手に入らない」で焦らせない）。
-- regular: 種のセットの、ふつうに買ったときの値段（「○%おとく」の表示に使う）
Config.LimitedShop = {
	slots = 3,
	pool = {
		{ cosmetic = "puddinghat", price = 900 },
		{ cosmetic = "donutback", price = 1200 },
		{ cosmetic = "heartwings", price = 2000 },
		{ cosmetic = "candytrail", price = 1500 },
		{ seeds = { peropero = 10 }, price = 400, regular = 500 },
		{ seeds = { wataame = 3 }, price = 600, regular = 750 },
		{ seeds = { nijimelon = 2 }, price = 1900, regular = 2400 },
		{ seeds = { starcake = 1 }, price = 4800, regular = 6000 },
	},
}

-- その日の品ぞろえ（pool の番号の一覧）。サーバーとクライアントで同じ結果になるよう、日付だけで決める
function Config.limitedSelection(day: number): { number }
	local pool = Config.LimitedShop.pool
	local order = {}
	for i = 1, #pool do
		order[i] = i
	end
	local rng = Random.new(day * 7919 + 17)
	for i = #order, 2, -1 do
		local j = rng:NextInteger(1, i)
		order[i], order[j] = order[j], order[i]
	end
	local picked = {}
	for i = 1, math.min(Config.LimitedShop.slots, #order) do
		picked[i] = order[i]
	end
	return picked
end

-- きょうのおねがい（デイリークエスト）。毎日 UTC 0時に、pool から3つ選ぶ。達成したら「もらう」でごほうび。
-- kind: harvest=収穫した数 / harvestCrop=決まった作物の収穫数 / plant=植えた数 / sell=売って得たコイン / sparkle=きらきら / egg=たまご
-- なかよしレベル（Robloxの友だちごと）。同じサーバーで いっしょに遊ぶ・畑を手伝うと ポイントがたまる。
-- 1日にたまる量に上限をつけて、「長くいるほど得」ではなく「毎日ちょっとずつ」にする（ポケモンGOのなかよし度と同じ考え方）
Config.Friendship = {
	levels = { 0, 10, 30, 60, 100 }, -- Lv1〜Lv5 に必要なポイント
	togetherEvery = 60, -- いっしょにいると、この秒数ごとに 1ポイント
	helpPoints = 2, -- 友だちの畑に 水やり・ひりょう・しずく をあげると（あげた人も、もらった人も）
	dailyCap = { together = 10, helped = 10 }, -- 1日にたまる上限（友だちごと）
	rewards = { -- そのレベルになったときの ごほうび
		[2] = { coins = 300 },
		[3] = { coins = 800, fertilizer = 2 },
		[4] = { coins = 1500, drops = 1 },
		[5] = { coins = 3000, fertilizer = 3, drops = 1 },
	},
}
-- やくそくの種: 友だちと いっしょに遊ぶと 2人の庭に 1つずつ植わる。
-- 次の日から、それぞれが自分の鉢に水をあげると「ゆうじょうの花」がさく。来られない日があっても 枯れずに待つ（休んでも損をしない）
Config.Promise = {
	togetherMinutes = 3, -- その日に いっしょに いた時間（分）がこれをこえると もらえる
	coins = 1500, -- さいたときの ごほうび（2人とも）
	cosmetic = "flowercrown", -- さいたときの ごほうびの おしゃれ（はじめての1回）
	replaceAfterDays = 7, -- さかないまま この日数がすぎたら、べつの友だちとの やくそくに かえられる
}

Config.Quests = {
	count = 3,
	pool = {
		{ id = "harvest10", kind = "harvest", goal = 10, icon = "🧺", reward = { coins = 150, xp = 30 } },
		{ id = "harvest25", kind = "harvest", goal = 25, icon = "🧺", reward = { coins = 400, xp = 50 } },
		{ id = "plant8", kind = "plant", goal = 8, icon = "🌱", reward = { coins = 120, xp = 25 } },
		{ id = "sell500", kind = "sell", goal = 500, icon = "💰", reward = { coins = 200, xp = 30 } },
		{ id = "sell2000", kind = "sell", goal = 2000, icon = "💰", reward = { coins = 500, xp = 60 } },
		{ id = "sparkle1", kind = "sparkle", goal = 1, icon = "✨", reward = { coins = 250, xp = 40 } },
		{ id = "egg1", kind = "egg", goal = 1, icon = "🥚", reward = { coins = 150, xp = 30 } },
		{ id = "peropero5", kind = "harvestCrop", crop = "peropero", goal = 5, icon = "🌸", reward = { coins = 300, xp = 40 } },
	},
}

-- その日のおねがい（pool の番号の一覧）。日付だけで決まる（期間限定ショップとは別の並び）
function Config.questSelection(day: number): { number }
	local pool = Config.Quests.pool
	local order = {}
	for i = 1, #pool do
		order[i] = i
	end
	local rng = Random.new(day * 104729 + 3)
	for i = #order, 2, -1 do
		local j = rng:NextInteger(1, i)
		order[i], order[j] = order[j], order[i]
	end
	local picked = {}
	for i = 1, math.min(Config.Quests.count, #order) do
		picked[i] = order[i]
	end
	return picked
end

-- おかえりメッセージを出す、いなかった時間の下限（秒）
Config.WelcomeBackSeconds = 600

-- シーズンパス（キャンディパス）。収穫などで経験値(XP)がたまり、段に届くと自動でごほうびがもらえる。
-- free=無料の道 / premium=スペシャルの道（Passes.season を持っている人）。中身は全て決まっていて、ランダムは無し。
-- 数字は仮。遊んで調整する。
Config.Season = {
	id = "S1",
	-- 終わり: 2026/12/31 23:59 日本時間（UTCで指定）
	endsAt = DateTime.fromUniversalTime(2026, 12, 31, 14, 59, 0).UnixTimestamp,
	xpPerTier = 150,
	xp = {
		harvest = { gummyberry = 2, peropero = 5, wataame = 12, nijimelon = 25, starcake = 50, mooncandy = 60 },
		daily = 30, -- デイリーボーナスを受け取った
		tree = 20, -- みんなの木がレベルアップした（その場にいた全員）
	},
	tiers = {
		{ free = { coins = 100 }, premium = { coins = 300 } },
		{ free = { seeds = { gummyberry = 5 } }, premium = { seeds = { peropero = 3 } } },
		{ free = { coins = 150 }, premium = { coins = 400 } },
		{ free = { seeds = { peropero = 2 } }, premium = { cosmetic = "startrail" } },
		{ free = { coins = 200 }, premium = { coins = 500 } },
		{ free = { seeds = { peropero = 3 } }, premium = { seeds = { wataame = 2 } } },
		{ free = { coins = 250 }, premium = { coins = 600 } },
		{ free = { seeds = { wataame = 1 } }, premium = { seeds = { nijimelon = 1 } } },
		{ free = { coins = 300 }, premium = { coins = 700 } },
		{ free = { cosmetic = "berryhat" }, premium = { coins = 1000 } },
		{ free = { coins = 350 }, premium = { coins = 800 } },
		{ free = { seeds = { wataame = 2 } }, premium = { seeds = { nijimelon = 2 } } },
		{ free = { coins = 400 }, premium = { coins = 900 } },
		{ free = { seeds = { nijimelon = 1 } }, premium = { seeds = { starcake = 1 } } },
		{ free = { coins = 500 }, premium = { coins = 1000 } },
		{ free = { seeds = { wataame = 3 } }, premium = { seeds = { nijimelon = 2 } } },
		{ free = { coins = 600 }, premium = { coins = 1200 } },
		{ free = { seeds = { nijimelon = 2 } }, premium = { seeds = { starcake = 1 } } },
		{ free = { coins = 800 }, premium = { coins = 1500 } },
		{ free = { cosmetic = "lollipopback" }, premium = { cosmetic = "gemcrown" } },
	},
}

-- デイリーボーナス。1日1回、ログインしたらもらえる。7日で一巡し、7日目がいちばん豪華。
-- 日付はサーバーのUTCの日付で数える。1日休んでも、1日目に戻らず1日だけ戻る（やさしい連続記録）。
Config.Daily = {
	{ coins = 100 }, -- 1日目
	{ coins = 150 },
	{ coins = 200, seeds = { peropero = 2 } }, -- 3日目: ペロペロフラワーの種
	{ coins = 300 },
	{ coins = 400, seeds = { wataame = 1 } }, -- 5日目: わたあめブッシュの種
	{ coins = 600 },
	{ coins = 1000, seeds = { nijimelon = 1 } }, -- 7日目: いちばん豪華（中身は決まっていて、ランダムではない）
}
Config.DailySecondsPerDay = 86400

Config.PetById = {}
for _, pet in Config.Pets do
	Config.PetById[pet.id] = pet
end
Config.EggById = {}
for _, egg in Config.Eggs do
	Config.EggById[egg.id] = egg
end

function Config.eggOddsPercent(egg, petId: string): number
	local total = 0
	local weight = 0
	for _, entry in egg.odds do
		total += entry.weight
		if entry.pet == petId then
			weight = entry.weight
		end
	end
	return math.floor(weight / total * 1000 + 0.5) / 10
end

-- variant: ふしぎな姿のid（"sparkle" / "golden" など）。true は きらきら（前からの書き方）。nil・false・"normal" はふつう
function Config.sellValue(cropId: string, variant: any): number
	local crop = Config.CropById[cropId]
	local price = crop.sellPrice
	if variant == true then
		variant = "sparkle"
	end
	local v = type(variant) == "string" and Config.VariantById[variant]
	if v then
		price *= v.multiplier
	end
	return math.floor(price)
end

-- かごの中身（ふつう・きらきら・ふしぎな作物）を1つずつ数える。fn(cropId, variantId?, 個数)
function Config.eachBasket(state, fn: (string, string?, number) -> ())
	for cropId, n in state.basket or {} do
		fn(cropId, nil, n)
	end
	for cropId, n in state.basketSparkle or {} do
		fn(cropId, "sparkle", n)
	end
	for variant, crops in state.basketV or {} do
		for cropId, n in crops do
			fn(cropId, variant, n)
		end
	end
end

-- かごの売値の合計（ペット・ゲームパスのボーナスをかける前）と、個数
function Config.basketValue(state): (number, number)
	local total, count = 0, 0
	Config.eachBasket(state, function(cropId, variant, n)
		if Config.CropById[cropId] then
			total += Config.sellValue(cropId, variant) * n
			count += n
		end
	end)
	return total, count
end

return Config

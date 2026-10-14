-- ゲーム全体の数値設定。数字は仮。遊んで調整する（遊んだ感想をもとに直していく）。
local Config = {}

Config.DataStoreName = "CandyGardenV1"
Config.AutoSaveSeconds = 60

Config.StartCoins = 30
Config.StartSeeds = { gummyberry = 3 }

Config.MaxPlots = 8 -- 同時に遊べる人数分の庭。StudioのMax Playersも8にする
Config.PlotTiles = 6 -- 最初の畑の枚数（最大24まで拡張予定）

Config.SparkleChance = 0.1 -- 収穫時の「きらきら」確率
Config.SparkleMultiplier = 2

-- icon: 絵文字 / color: 実の色
Config.Crops = {
	{ id = "gummyberry", icon = "🍓", seedPrice = 10, growTime = 20, sellPrice = 18, color = Color3.fromRGB(255, 92, 138) },
	{ id = "peropero", icon = "🌸", seedPrice = 50, growTime = 60, sellPrice = 110, color = Color3.fromRGB(255, 140, 214) },
	{ id = "wataame", icon = "☁️", seedPrice = 250, growTime = 180, sellPrice = 600, color = Color3.fromRGB(176, 206, 255) },
	{ id = "nijimelon", icon = "🍈", seedPrice = 1200, growTime = 480, sellPrice = 3200, color = Color3.fromRGB(120, 230, 170) },
	{ id = "starcake", icon = "🍰", seedPrice = 6000, growTime = 1200, sellPrice = 18000, color = Color3.fromRGB(255, 214, 90) },
	-- 寝る前に植えて、翌日に収穫する作物（8時間）。オフライン中も育つので「明日また来る理由」になる
	{ id = "mooncandy", icon = "🌙", seedPrice = 2000, growTime = 28800, sellPrice = 20000, color = Color3.fromRGB(150, 140, 255) },
}

Config.CropById = {}
Config.CropOrder = {}
for _, crop in Config.Crops do
	Config.CropById[crop.id] = crop
	table.insert(Config.CropOrder, crop.id)
end

-- ペット（Pals）。bonus は売値に足される割合（連れている分の合計）
Config.MaxPets = 20
Config.MaxEquipped = 3

-- rarity: 1=ふつう 2=めずらしい 3=レア 4=すごいレア 5=でんせつ / ears: 見た目の型
Config.Pets = {
	{ id = "gummybear", icon = "🐻", rarity = 1, bonus = 0.05, color = Color3.fromRGB(255, 120, 140), ears = "round" },
	{ id = "lollibunny", icon = "🐰", rarity = 2, bonus = 0.10, color = Color3.fromRGB(255, 170, 215), ears = "long" },
	{ id = "cottoncat", icon = "🐱", rarity = 3, bonus = 0.20, color = Color3.fromRGB(185, 215, 255), ears = "point" },
	{ id = "rainbowunicorn", icon = "🦄", rarity = 4, bonus = 0.40, color = Color3.fromRGB(235, 200, 255), ears = "horn" },
	{ id = "starcakedragon", icon = "🐉", rarity = 5, bonus = 1.00, color = Color3.fromRGB(255, 214, 90), ears = "wings" },
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
	GoalGrowth = 1.5, -- レベルごとに必要ポイントが増える倍率
	RewardBase = 100, -- レベル1のごほうびコイン（全員）
	RewardGrowth = 1.4,
	MaxVisualLevel = 6, -- 見た目が大きくなるのはここまで（それ以降は数字だけ増える）
	Points = { gummyberry = 1, peropero = 3, wataame = 8, nijimelon = 18, starcake = 40, mooncandy = 30 },
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

function Config.sellValue(cropId: string, sparkle: boolean): number
	local crop = Config.CropById[cropId]
	local price = crop.sellPrice
	if sparkle then
		price *= Config.SparkleMultiplier
	end
	return math.floor(price)
end

return Config

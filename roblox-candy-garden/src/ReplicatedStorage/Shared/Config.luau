-- ゲーム全体の数値設定。数字は仮。遊んで調整する。
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
}

Config.CropById = {}
Config.CropOrder = {}
for _, crop in Config.Crops do
	Config.CropById[crop.id] = crop
	table.insert(Config.CropOrder, crop.id)
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

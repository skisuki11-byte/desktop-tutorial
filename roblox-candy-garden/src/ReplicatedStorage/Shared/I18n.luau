-- 日本語/英語。LocalizationService.RobloxLocaleId の先頭が "ja" なら日本語。
local LocalizationService = game:GetService("LocalizationService")

local STRINGS = {
	ja = {
		["crop.gummyberry"] = "グミベリー",
		["crop.peropero"] = "ペロペロフラワー",
		["crop.wataame"] = "わたあめブッシュ",
		["crop.nijimelon"] = "にじメロン",
		["crop.starcake"] = "スターケーキの木",
		["ui.shop"] = "ショップ",
		["ui.sellAll"] = "ぜんぶ売る",
		["ui.harvestAll"] = "ぜんぶ収穫",
		["ui.buy"] = "買う",
		["ui.close"] = "とじる",
		["ui.growTime"] = "育つ時間 %d秒",
		["ui.sellPrice"] = "売値 %d",
		["ui.plotOf"] = "%s の庭",
		["prompt.plant"] = "植える",
		["prompt.harvest"] = "収穫",
		["toast.sold"] = "+%d コイン！",
		["toast.sparkle"] = "✨ きらきら！ 売値 ×2",
		["toast.noCoins"] = "コインが足りないよ",
		["toast.nothingToSell"] = "売るものがないよ",
		["toast.noSeeds"] = "種がないよ。ショップで買おう",
		["toast.bought"] = "種を買ったよ！",
		["tutorial.plant"] = "畑をタッチして、種を植えよう！",
		["tutorial.wait"] = "育つのを待とう… あと %d 秒",
		["tutorial.harvest"] = "実がなった！タッチして収穫しよう",
		["tutorial.sell"] = "「ぜんぶ売る」を押して、コインにしよう",
		["tutorial.buy"] = "ショップで種を買おう",
	},
	en = {
		["crop.gummyberry"] = "Gummy Berry",
		["crop.peropero"] = "Lollipop Flower",
		["crop.wataame"] = "Cotton Candy Bush",
		["crop.nijimelon"] = "Rainbow Melon",
		["crop.starcake"] = "Star Cake Tree",
		["ui.shop"] = "Shop",
		["ui.sellAll"] = "Sell All",
		["ui.harvestAll"] = "Harvest All",
		["ui.buy"] = "Buy",
		["ui.close"] = "Close",
		["ui.growTime"] = "Grows in %ds",
		["ui.sellPrice"] = "Sells for %d",
		["ui.plotOf"] = "%s's Garden",
		["prompt.plant"] = "Plant",
		["prompt.harvest"] = "Harvest",
		["toast.sold"] = "+%d coins!",
		["toast.sparkle"] = "✨ Sparkle! Value x2",
		["toast.noCoins"] = "Not enough coins",
		["toast.nothingToSell"] = "Nothing to sell",
		["toast.noSeeds"] = "No seeds. Buy some in the shop",
		["toast.bought"] = "Seed bought!",
		["tutorial.plant"] = "Touch a plot to plant a seed!",
		["tutorial.wait"] = "Wait for it to grow… %ds left",
		["tutorial.harvest"] = "It's ready! Touch it to harvest",
		["tutorial.sell"] = "Press Sell All to get coins",
		["tutorial.buy"] = "Buy seeds in the shop",
	},
}

local I18n = {}

function I18n.language(): string
	local ok, id = pcall(function()
		return LocalizationService.RobloxLocaleId
	end)
	if ok and type(id) == "string" and string.sub(id, 1, 2) == "ja" then
		return "ja"
	end
	return "en"
end

function I18n.t(key: string, ...): string
	local text = STRINGS[I18n.language()][key] or STRINGS.en[key] or key
	if select("#", ...) > 0 then
		local ok, formatted = pcall(string.format, text, ...)
		if ok then
			return formatted
		end
	end
	return text
end

return I18n

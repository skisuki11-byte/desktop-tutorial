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
		["pet.gummybear"] = "グミベア",
		["pet.lollibunny"] = "ロリバニー",
		["pet.cottoncat"] = "わたあめネコ",
		["pet.rainbowunicorn"] = "にじユニコーン",
		["pet.starcakedragon"] = "スターケーキドラゴン",
		["egg.candyegg"] = "キャンディたまご",
		["rarity.1"] = "ふつう",
		["rarity.2"] = "めずらしい",
		["rarity.3"] = "レア",
		["rarity.4"] = "すごいレア",
		["rarity.5"] = "でんせつ",
		["ui.pals"] = "ペット",
		["ui.palsCount"] = "ペット %d / %d",
		["ui.odds"] = "でる確率",
		["ui.equipped"] = "いっしょ",
		["ui.petBonus"] = "売値 +%d%%",
		["ui.totalBonus"] = "いまの売値ボーナス +%d%%",
		["ui.noPets"] = "まだペットがいないよ。たまごを買ってみよう！",
		["ui.tapToEquip"] = "タップで いっしょに連れていく / はずす（最大%d匹）",
		["hatch.title"] = "うまれた！",
		["hatch.ok"] = "やったー！",
		["toast.petFull"] = "ペットがいっぱいだよ",
		["weather.sprinkles"] = "キャンディシャワー",
		["weather.rainbow"] = "にじいろタイム",
		["weather.starfall"] = "ほしふりタイム",
		["weather.announce"] = "%s！ きらきらが出やすいよ",
		["ui.weatherNow"] = "✨%d%%  あと%d秒",
		["ui.weatherNext"] = "次の天気まで %s",
		["ui.tree"] = "みんなの木",
		["tree.levelUp"] = "🌳 みんなの木が Lv.%d に育った！ ぜんいんに +%d コイン",
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
		["pet.gummybear"] = "Gummy Bear",
		["pet.lollibunny"] = "Lolli Bunny",
		["pet.cottoncat"] = "Cotton Cat",
		["pet.rainbowunicorn"] = "Rainbow Unicorn",
		["pet.starcakedragon"] = "Star Cake Dragon",
		["egg.candyegg"] = "Candy Egg",
		["rarity.1"] = "Common",
		["rarity.2"] = "Uncommon",
		["rarity.3"] = "Rare",
		["rarity.4"] = "Epic",
		["rarity.5"] = "Legendary",
		["ui.pals"] = "Pals",
		["ui.palsCount"] = "Pals %d / %d",
		["ui.odds"] = "Drop chances",
		["ui.equipped"] = "With you",
		["ui.petBonus"] = "Sells +%d%%",
		["ui.totalBonus"] = "Sell bonus now +%d%%",
		["ui.noPets"] = "No pals yet. Try buying an egg!",
		["ui.tapToEquip"] = "Tap to bring along / put away (max %d)",
		["hatch.title"] = "It hatched!",
		["hatch.ok"] = "Yay!",
		["toast.petFull"] = "Your pal list is full",
		["weather.sprinkles"] = "Candy Shower",
		["weather.rainbow"] = "Rainbow Time",
		["weather.starfall"] = "Starfall",
		["weather.announce"] = "%s! Sparkles are more likely",
		["ui.weatherNow"] = "✨%d%%  %ds left",
		["ui.weatherNext"] = "Next weather in %s",
		["ui.tree"] = "Community Tree",
		["tree.levelUp"] = "🌳 The tree grew to Lv.%d! Everyone gets +%d coins",
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

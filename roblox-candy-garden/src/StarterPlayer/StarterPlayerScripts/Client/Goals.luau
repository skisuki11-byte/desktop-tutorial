-- 「つぎの もくひょう」と「あしたの たのしみ」を、お知らせ（上の 帯）で そっと 出す。画面に カードは ふやさない。
-- A. つぎの もくひょう: やることが 見えなくなると あきる。いつも「あと少しで 届く もの」を 1つだけ 見せる
--    ・コインが ふえて 届いたとき → 「〇〇が 買えるよ！」（届いた うれしさを その場で）
--    ・しばらく お知らせが ないとき（4分ごと） → 「あと 🟡N で 〇〇」（いちばん 近い もの）
-- B. あしたの たのしみ: 区切りを「やめる」ではなく「また来る」に する（どうぶつの森の 考え方）
--    ・長く 育つ 作物（1時間〜）を 植えたら「〇時間で できるよ。あした 見にきてね」
--    ・25分 遊んだら、あしたの まいにちボーナスと、ムーンキャンディ（8時間）を 植えておく 案内
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)

local Goals = {}

local t = I18n.t
local HINT_EVERY = 240 -- 「あと 🟡N で 〇〇」を 出す 間かく（秒）。うるさく ならない ように
local TOMORROW_AT = 25 * 60 -- 「あしたの たのしみ」を 出す 時間（遊びはじめて 何秒後）
local LONG_CROP = 3600 -- これより 長く 育つ 作物は「あした 見にきてね」

local ui = nil
local latest = nil
local lastCoins = nil
local lastPlots = nil
local lastHintAt = 0
local startedAt = os.clock()
local toldLong: { [string]: boolean } = {} -- この 遊びの あいだに もう 言った 作物
local toldTomorrow = false

-- いま 目ざせる もの（値段つき）。まだ 育てたことの ない 種・畑を ひろげる・じょうろを 大きく
local function goalList(state): { { name: string, price: number } }
	local list = {}
	local dex = state.cropDex or {}
	for _, cropId in Config.CropOrder do
		local crop = Config.CropById[cropId]
		if crop and not Config.SeedShop.rare[cropId] and dex[cropId] == nil and Config.SeedShop.stock[cropId] then
			table.insert(list, { name = t("goal.seed", t("crop." .. cropId)), price = crop.seedPrice })
		end
	end
	local tiles = state.plotTiles or Config.PlotTiles
	for _, upgrade in Config.PlotUpgrades do
		if upgrade.tiles > tiles then
			table.insert(list, { name = t("goal.expand"), price = upgrade.price })
			break
		end
	end
	local water = state.water
	local nextCan = water and Config.Water.canPrices[water.level + 1]
	if nextCan then
		table.insert(list, { name = t("goal.can"), price = nextCan })
	end
	return list
end

-- 今 お知らせを 出して よいか（説明の 途中・画面を 開いている ときは 出さない）
local function calm(state): boolean
	return state.tutorialDone == true and ui.currentPanel == nil
end

local function say(text: string)
	lastHintAt = os.clock()
	ui.toastText(text)
end

-- コインが ふえて、目ざしていた ものに 届いた
local function checkReached(state)
	local coins = state.coins or 0
	if lastCoins and coins > lastCoins and calm(state) then
		local best = nil
		for _, goal in goalList(state) do
			if goal.price > lastCoins and goal.price <= coins and (best == nil or goal.price > best.price) then
				best = goal
			end
		end
		if best then
			-- 「〇コインで 売れたよ」の お知らせを 読みおわってから
			local text = t("goal.reached", best.name)
			task.delay(3, function()
				say(text)
			end)
		end
	end
	lastCoins = coins
end

-- 長く 育つ 作物を 植えた
local function checkLongCrop(state)
	local plots = state.plots or {}
	if lastPlots then
		for index, plot in plots do
			local before = lastPlots[index]
			local crop = plot.crop and Config.CropById[plot.crop]
			if crop and (before == nil or before.crop ~= plot.crop) and crop.growTime >= LONG_CROP and not toldLong[plot.crop] then
				toldLong[plot.crop] = true
				say(t("goal.longCrop", t("crop." .. plot.crop), math.ceil(crop.growTime / 3600)))
				break
			end
		end
	end
	-- 次と くらべるため、作物の 名前だけ 写しておく
	local copy = {}
	for index, plot in plots do
		copy[index] = { crop = plot.crop }
	end
	lastPlots = copy
end

function Goals.update(state)
	latest = state
	if not ui then
		return
	end
	checkReached(state)
	checkLongCrop(state)
end

-- しばらく 何も 出ていないときの「あと 🟡N で 〇〇」と、25分の「あしたの たのしみ」
local function tick()
	local state = latest
	if not state or not calm(state) then
		return
	end
	local now = os.clock()
	-- Studio での 確認用: workspace の 属性 DebugGoals を つけると 早送り（25分 → 40秒、4分 → 20秒）
	local fast = RunService:IsStudio() and workspace:GetAttribute("DebugGoals") == true
	local tomorrowAt = if fast then 40 else TOMORROW_AT
	local every = if fast then 20 else HINT_EVERY
	if not toldTomorrow and now - startedAt >= tomorrowAt then
		toldTomorrow = true
		local daily = state.daily
		local count = #Config.Daily
		-- きょうの ぶんを まだ もらっていないときは、きょうの 次が あした
		local nextIndex = if daily and daily.canClaim then ((daily.index or 1) % count) + 1
			elseif daily then ((daily.streak or 0) % count) + 1
			else 1
		local bonus = Config.Daily[nextIndex] and Config.Daily[nextIndex].coins or 0
		if (state.seeds and (state.seeds.mooncandy or 0) > 0) then
			say(t("goal.tomorrowPlant", bonus, t("crop.mooncandy")))
		else
			say(t("goal.tomorrow", bonus))
		end
		return
	end
	if now - lastHintAt < every or now - startedAt < (if fast then 10 else 180) then
		return
	end
	local coins = state.coins or 0
	local nearest = nil
	for _, goal in goalList(state) do
		if goal.price > coins and (nearest == nil or goal.price < nearest.price) then
			nearest = goal
		end
	end
	if nearest then
		say(t("goal.next", nearest.price - coins, nearest.name))
	end
end

function Goals.init(uiModule)
	ui = uiModule
	-- ほかの お知らせが 出たら、もくひょうの 案内は しばらく 休む（かさならない ように）
	local original = ui.toastText
	ui.toastText = function(text, seconds)
		lastHintAt = os.clock()
		return original(text, seconds)
	end
	task.spawn(function()
		while true do
			task.wait(if RunService:IsStudio() and workspace:GetAttribute("DebugGoals") == true then 2 else 15)
			tick()
		end
	end)
end

return Goals

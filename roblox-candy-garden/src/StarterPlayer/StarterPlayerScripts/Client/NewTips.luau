-- あたらしい遊びの ひとこと（1回だけ）。使えるようになった ちょうどいいときに、ルルが そっと教える。
--   tipBase:   コインが ひみつきち（テント）を たてられるくらい たまったとき
--   tipRoom:   ひみつきちを たてたあと（中に入れる・家具を置ける）
--   tipOutfit: きぐるみを 買えるくらい たまったとき
-- 出したら「見た」をサーバーに送るので、次からは出ない。一度に たくさん出さない（1分に1つまで）
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local NewTips = {}

local toast: ((string, number?) -> ())? = nil
local lastShown = os.clock() - 40 -- 入ってすぐは出さない（あいさつ・まいにちボーナスと重ならないよう 20秒あける）
local sent: { [string]: boolean } = {} -- サーバーの返事を待つあいだ、同じものを出さない

local function cheapestOutfit(): number
	local price = math.huge
	for _, item in Config.Cosmetics do
		if item.slot == "outfit" and type(item.price) == "number" then
			price = math.min(price, item.price)
		end
	end
	return price
end

local function ownsOutfit(state): boolean
	for id in (state.cosmetics and state.cosmetics.owned) or {} do
		local item = Config.CosmeticById[id]
		if item and item.slot == "outfit" then
			return true
		end
	end
	return false
end

-- 上から順に、いま出してよい ひとこと を1つ選ぶ
local function pick(state): string?
	local base = (state.decor and state.decor.reform and state.decor.reform.base) or 0
	local coins = state.coins or 0
	local baseItem = Config.ReformById.base
	local candidates = {
		{ key = "tipRoom", ok = base >= 1 },
		{ key = "tipBase", ok = base == 0 and coins >= baseItem.levels[1].price },
		{ key = "tipOutfit", ok = coins >= cheapestOutfit() and not ownsOutfit(state) },
	}
	local seen = state.seen or {}
	for _, c in candidates do
		if c.ok and not sent[c.key] and (seen[c.key] or 0) < (Config.NewThings[c.key] or 0) then
			return c.key
		end
	end
	return nil
end

local latest = nil

local function check()
	local state = latest
	if not toast or not state or not state.tutorialDone or os.clock() - lastShown < 60 then
		return
	end
	local key = pick(state)
	if not key then
		return
	end
	lastShown = os.clock()
	sent[key] = true
	toast(I18n.t("newtip." .. key), 7)
	Remotes.MarkSeen:FireServer(key)
end

function NewTips.init(toastFn: (string, number?) -> ())
	toast = toastFn
	-- 何も起きていなくても ときどき見る（状態が届くのを待たない）
	task.spawn(function()
		while true do
			task.wait(5)
			check()
		end
	end)
end

function NewTips.update(state)
	latest = state
	check()
end

return NewTips

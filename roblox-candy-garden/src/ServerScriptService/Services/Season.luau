-- シーズンパス（キャンディパス）。収穫・デイリーボーナス・みんなの木でXPがたまり、段に届くと自動でごほうび。
-- 方針:
--   ・無料の道だけでも、コイン・種・限定のおしゃれがもらえる（課金しない子も楽しめる）
--   ・スペシャルの道（ゲームパス）は中身が決まっている。ランダムは入れない
--   ・自動で受け取る（押し忘れで損をしない）。あとからスペシャルを買っても、届いた段の分はさかのぼってもらえる
--   ・シーズンが変わったら（Config.Season.id が変わったら）、XPと受け取り状況をリセットする
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Cosmetics = require(script.Parent.Cosmetics)
local Monetization = require(script.Parent.Monetization)

local Season = {}

local S = Config.Season

local function isActive(): boolean
	return os.time() < S.endsAt
end

-- データを今のシーズンに合わせる（新しいシーズンならリセット）
local function current(d)
	if d.season.id ~= S.id then
		d.season = { id = S.id, xp = 0, free = 0, premium = 0 }
	end
	return d.season
end

local function levelOf(xp: number): number
	return math.min(#S.tiers, math.floor(xp / S.xpPerTier))
end

local function give(player: Player, d, reward)
	if not reward then
		return
	end
	if reward.coins then
		d.coins += reward.coins
	end
	if reward.seeds then
		for cropId, n in reward.seeds do
			if Config.CropById[cropId] then
				d.seeds[cropId] = (d.seeds[cropId] or 0) + n
			end
		end
	end
	if reward.cosmetic and Config.CosmeticById[reward.cosmetic] then
		Cosmetics.grant(player, reward.cosmetic)
	end
end

-- 届いている段のうち、まだ受け取っていないごほうびを全部渡す。渡した段の番号の一覧を返す
local function grantReached(player: Player): { number }
	local d = Data.get(player)
	if not d then
		return {}
	end
	local season = current(d)
	local level = levelOf(season.xp)
	local granted = {}
	for tier = season.free + 1, level do
		give(player, d, S.tiers[tier].free)
		table.insert(granted, tier)
	end
	season.free = math.max(season.free, level)
	if Monetization.owns(player, "season") then
		for tier = season.premium + 1, level do
			give(player, d, S.tiers[tier].premium)
			if not table.find(granted, tier) then
				table.insert(granted, tier)
			end
		end
		season.premium = math.max(season.premium, level)
	end
	return granted
end

local function notify(player: Player, granted: { number })
	if #granted > 0 then
		Remotes.SeasonReward:FireClient(player, granted[#granted])
		Data.push(player)
		Data.saveSoon(player)
	end
end

-- XPを足す（収穫などから呼ぶ）。シーズン中だけ
function Season.addXp(player: Player, amount: number)
	if not isActive() or amount <= 0 then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local season = current(d)
	-- 最後の段に届いたら、それ以上は数字だけ増やさない
	season.xp = math.min(season.xp + amount, #S.tiers * S.xpPerTier)
	notify(player, grantReached(player))
end

-- 参加したとき: シーズンの切り替えと、取りこぼしの受け取り
function Season.sync(player: Player)
	notify(player, grantReached(player))
end

function Season.init()
	Monetization.onPurchased(function(player, key)
		if key == "season" then
			notify(player, grantReached(player)) -- 届いている段のスペシャルを、さかのぼって渡す
		end
	end)
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		local season = current(d)
		return {
			season = {
				xp = season.xp,
				level = levelOf(season.xp),
				free = season.free,
				premium = season.premium,
				premiumOwned = Monetization.owns(player, "season"),
				active = isActive(),
			},
		}
	end)
end

return Season

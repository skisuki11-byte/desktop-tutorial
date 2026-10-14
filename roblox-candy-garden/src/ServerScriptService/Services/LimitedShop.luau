-- 期間限定ショップ（日替わり）。毎日 UTC 0時（日本時間 朝9時）に、品ぞろえが入れ替わる。
-- 参考: Grow a Garden の期間限定の商人、Fortnite などの日替わりアイテムショップ。
-- 子供向けの配慮:
--   ・コインだけで買える（ロバックスは使わない）
--   ・品物は何日かすると戻ってくる（「二度と手に入らない」で焦らせない）
--   ・1日1枠1回まで（種のセットを買い占めて、経済が崩れないように）
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Cosmetics = require(script.Parent.Cosmetics)
local RateLimit = require(script.Parent.RateLimit)

local LimitedShop = {}

local DAY = 86400

local function today(): number
	return math.floor(os.time() / DAY)
end

-- その日のぶんの「買った枠」を返す（日が変わっていたらリセット）
local function boughtToday(d)
	local day = today()
	if d.limited.day ~= day then
		d.limited = { day = day, bought = {} }
	end
	return d.limited.bought
end

local function buy(player: Player, slot: any)
	if type(slot) ~= "number" or slot ~= math.floor(slot) or slot < 1 or slot > Config.LimitedShop.slots then
		return
	end
	if not RateLimit.ok(player, "buyLimited", 0.4) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	-- 何が並んでいるかは、サーバーが今日の日付から決める（クライアントの言う品物は信用しない）
	local entry = Config.LimitedShop.pool[Config.limitedSelection(today())[slot]]
	if not entry then
		return
	end
	local bought = boughtToday(d)
	if bought[tostring(slot)] then
		Remotes.Toast:FireClient(player, "toast.limitedAlready")
		return
	end
	if entry.cosmetic and Cosmetics.owns(player, entry.cosmetic) then
		Remotes.Toast:FireClient(player, "toast.alreadyOwned")
		return
	end
	if d.coins < entry.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end

	d.coins -= entry.price
	bought[tostring(slot)] = true
	if entry.seeds then
		for cropId, n in entry.seeds do
			if Config.CropById[cropId] then
				d.seeds[cropId] = (d.seeds[cropId] or 0) + n
			end
		end
	end
	if entry.cosmetic then
		Cosmetics.grant(player, entry.cosmetic)
	end
	Remotes.Toast:FireClient(player, "toast.limitedBought")
	Data.push(player)
	Data.saveSoon(player)
end

function LimitedShop.init()
	Remotes.BuyLimited.OnServerEvent:Connect(buy)
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		local day = today()
		return {
			limited = {
				day = day,
				items = Config.limitedSelection(day),
				endsAt = (day + 1) * DAY, -- 次に入れ替わる時刻（UTCのUnix秒）
				bought = boughtToday(d),
			},
		}
	end)
end

return LimitedShop

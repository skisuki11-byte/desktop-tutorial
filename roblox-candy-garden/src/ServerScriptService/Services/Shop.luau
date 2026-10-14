-- 買う・選ぶ・売る。お金と在庫の変更はここだけで行い、クライアントの値は信用しない。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Garden = require(script.Parent.Garden)
local RateLimit = require(script.Parent.RateLimit)

local Shop = {}

local function isCropId(value: any): boolean
	return type(value) == "string" and Config.CropById[value] ~= nil
end

local function buySeed(player: Player, cropId: any, qty: any)
	if not isCropId(cropId) or type(qty) ~= "number" or qty ~= qty then
		return
	end
	qty = math.clamp(math.floor(qty), 1, 10)
	if not RateLimit.ok(player, "buy", 0.1) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local cost = Config.CropById[cropId].seedPrice * qty
	if d.coins < cost then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= cost
	d.seeds[cropId] = (d.seeds[cropId] or 0) + qty
	Remotes.Toast:FireClient(player, "toast.bought")
	Data.push(player)
end

local function selectSeed(player: Player, cropId: any)
	if not isCropId(cropId) or not RateLimit.ok(player, "select", 0.1) then
		return
	end
	local d = Data.get(player)
	if not d or (d.seeds[cropId] or 0) <= 0 then
		return
	end
	Data.setSelected(player, cropId)
	Data.push(player)
end

local function sellAll(player: Player)
	if not RateLimit.ok(player, "sell", 0.3) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local total = 0
	for cropId, n in d.basket do
		total += Config.sellValue(cropId, false) * n
	end
	for cropId, n in d.basketSparkle do
		total += Config.sellValue(cropId, true) * n
	end
	if total <= 0 then
		Remotes.Toast:FireClient(player, "toast.nothingToSell")
		return
	end
	total = math.floor(total * (1 + Data.petBonus(d)))
	d.basket = {}
	d.basketSparkle = {}
	d.coins += total
	d.tutorialDone = true
	Remotes.Toast:FireClient(player, "toast.sold", total)
	Data.push(player)
	Data.save(player) -- 初回の売却は大事な節目なので即保存
end

function Shop.init()
	Remotes.BuySeed.OnServerEvent:Connect(buySeed)
	Remotes.SelectSeed.OnServerEvent:Connect(selectSeed)
	Remotes.SellAll.OnServerEvent:Connect(sellAll)
	Remotes.HarvestAll.OnServerEvent:Connect(Garden.harvestAll)
end

return Shop

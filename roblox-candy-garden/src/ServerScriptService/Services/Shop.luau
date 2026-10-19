-- 買う・選ぶ・売る。お金と在庫の変更はここだけで行い、クライアントの値は信用しない。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Garden = require(script.Parent.Garden)
local RateLimit = require(script.Parent.RateLimit)
local Monetization = require(script.Parent.Monetization)
local Quests = require(script.Parent.Quests)
local Tree = require(script.Parent.Tree)

local Shop = {}

local function now(): number
	return workspace:GetServerTimeNow()
end

-- この人の、いまの入荷の回の「買った数」。回が変わっていたら 0 にもどす
local function seedShopOf(d)
	local round = Config.seedRound(now())
	if d.seedShop.round ~= round then
		d.seedShop = { round = round, bought = {} }
	end
	return d.seedShop
end

-- のこりの数 [cropId] = 個数（入荷していない種は 0）
function Shop.seedsLeft(d): { [string]: number }
	local shop = seedShopOf(d)
	local left = {}
	for cropId, count in Config.seedStock(shop.round) do
		left[cropId] = math.max(0, count - (shop.bought[cropId] or 0))
	end
	return left
end

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
	-- 入荷している数までしか買えない
	local left = Shop.seedsLeft(d)[cropId] or 0
	if left <= 0 then
		Remotes.Toast:FireClient(player, "toast.soldOut")
		return
	end
	qty = math.min(qty, left)
	local cost = Config.CropById[cropId].seedPrice * qty
	if d.coins < cost then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= cost
	d.seeds[cropId] = (d.seeds[cropId] or 0) + qty
	local shop = seedShopOf(d)
	shop.bought[cropId] = (shop.bought[cropId] or 0) + qty
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
	local total = Config.basketValue(d)
	if total <= 0 then
		Remotes.Toast:FireClient(player, "toast.nothingToSell")
		return
	end
	total = math.floor(total * (1 + Data.petBonus(d)))
	d.basket = {}
	d.basketSparkle = {}
	d.basketV = {}
	d.coins += total
	local firstSale = not d.tutorialDone
	d.tutorialDone = true
	if firstSale then
		-- 案内が終わったので、ほしぞらの木の おくりもの（あれば）。ルルの「やったね！」のあいさつを聞き終わるころに出す
		task.delay(20, function()
			if player.Parent then
				Tree.onPlayerReady(player)
			end
		end)
	end
	Remotes.Toast:FireClient(player, "toast.sold", total)
	Data.push(player)
	Quests.progress(player, "sell", total)
	Data.saveSoon(player) -- 売却は、数秒以内に保存する
end

-- 入荷の回が変わったら、みんなの画面の品ぞろえを新しくして、お知らせする
local function startRestockLoop()
	task.spawn(function()
		local lastRound = Config.seedRound(now())
		while true do
			task.wait(1)
			local round = Config.seedRound(now())
			if round ~= lastRound then
				lastRound = round
				local stock = Config.seedStock(round)
				local rareId = nil
				for _, cropId in Config.CropOrder do
					if Config.SeedShop.rare[cropId] and stock[cropId] then
						rareId = cropId
					end
				end
				for _, player in Players:GetPlayers() do
					if Data.get(player) then
						Data.push(player)
						if rareId then
							Remotes.Toast:FireClient(player, "toast.restockRare", Config.CropById[rareId].icon, "@crop." .. rareId)
						else
							Remotes.Toast:FireClient(player, "toast.restock")
						end
					end
				end
			end
		end
	end)
end

function Shop.init()
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		return { seedShop = { round = Config.seedRound(now()), left = Shop.seedsLeft(d) } }
	end)
	startRestockLoop()
	Remotes.BuySeed.OnServerEvent:Connect(buySeed)
	Remotes.SelectSeed.OnServerEvent:Connect(selectSeed)
	Remotes.SellAll.OnServerEvent:Connect(sellAll)
	Remotes.HarvestAll.OnServerEvent:Connect(Garden.harvestAll)
end

return Shop

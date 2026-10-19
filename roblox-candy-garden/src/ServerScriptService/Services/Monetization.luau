-- ロバックスの商品（ゲームパス）。Config.Passes の id が 0 の間は何も出ず、買えない。
-- 方針: 序盤に課金を迫らない／ランダム要素は入れない（中身が決まった商品だけ）／
--       ロバックスで コイン・種・たまご・ペットは 渡さない（MONETIZATION.md）。
-- デベロッパー製品（Config.Products）は ProcessReceipt で 1回ずつ 確実に渡す（同じ レシートを 2回 渡さない）。
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local RateLimit = require(script.Parent.RateLimit)

local Monetization = {}

local owned: { [Player]: { [string]: boolean } } = {}
local purchaseHandlers: { (Player, string) -> () } = {}
local ownedHandlers: { (Player, string) -> () } = {}
local productHandlers: { [string]: (Player) -> () } = {}

-- パスを買ったときに、ほかのサービスが続きの処理をする（シーズンパスのさかのぼり付与など）
function Monetization.onPurchased(fn: (Player, string) -> ())
	table.insert(purchaseHandlers, fn)
end

-- パスを持っていると分かったとき（参加したとき・買ったとき）に毎回呼ぶ（家具を わたす など、何回呼ばれても 同じ結果になる処理）
function Monetization.onOwned(fn: (Player, string) -> ())
	table.insert(ownedHandlers, fn)
end

-- デベロッパー製品を買ったときの処理（key は Config.Products のキー）
function Monetization.onProduct(key: string, fn: (Player) -> ())
	productHandlers[key] = fn
end

function Monetization.owns(player: Player, key: string): boolean
	local set = owned[player]
	return set ~= nil and set[key] == true
end

-- 参加時に、持っているパスを調べる（IDが0のものは調べない）
function Monetization.load(player: Player)
	local set = {}
	for key, pass in Config.Passes do
		if pass.id > 0 then
			local ok, result = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.id)
			end)
			set[key] = ok and result == true
			if not ok then
				warn("[Monetization] パスの確認に失敗: " .. key)
			end
		end
	end
	owned[player] = set
	for key, has in set do
		if has then
			for _, handler in ownedHandlers do
				handler(player, key)
			end
		end
	end
end

function Monetization.release(player: Player)
	owned[player] = nil
end

local function buyPass(player: Player, key: any)
	if type(key) ~= "string" then
		return
	end
	local pass = Config.Passes[key]
	if not pass or pass.id <= 0 or not RateLimit.ok(player, "buyPass", 1) then
		return
	end
	if Monetization.owns(player, key) then
		return
	end
	MarketplaceService:PromptGamePassPurchase(player, pass.id)
end

local function buyProduct(player: Player, key: any)
	if type(key) ~= "string" then
		return
	end
	local product = Config.Products[key]
	if not product or product.id <= 0 or not RateLimit.ok(player, "buyProduct", 1) then
		return
	end
	MarketplaceService:PromptProductPurchase(player, product.id)
end

-- 買ったものを わたす。わたせたら PurchaseGranted、まだ わたせないなら NotProcessedYet（Roblox が あとで もう一度 呼ぶ）
local function processReceipt(info)
	local player = game:GetService("Players"):GetPlayerByUserId(info.PlayerId)
	local d = player and Data.get(player)
	if not d then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	d.receipts = d.receipts or {}
	if table.find(d.receipts, info.PurchaseId) then
		return Enum.ProductPurchaseDecision.PurchaseGranted -- もう わたしてある
	end
	local handler
	for key, product in Config.Products do
		if product.id == info.ProductId then
			handler = productHandlers[key]
		end
	end
	if not handler then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local ok = pcall(handler, player)
	if not ok then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	table.insert(d.receipts, info.PurchaseId)
	while #d.receipts > 50 do
		table.remove(d.receipts, 1) -- 古いものから わすれる（Roblox が 同じものを 何度も 送るのは しばらくの間だけ）
	end
	Data.push(player)
	Data.save(player, true) -- 買ったものは すぐ保存する
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

function Monetization.init()
	Data.addStateExtender(function(player)
		local waterBonus = if Monetization.owns(player, "bigcan") then Config.Passes.bigcan.extraWater else 0
		return { passes = owned[player] or {}, waterBonus = waterBonus }
	end)
	Remotes.BuyPass.OnServerEvent:Connect(buyPass)
	Remotes.BuyProduct.OnServerEvent:Connect(buyProduct)
	MarketplaceService.ProcessReceipt = processReceipt

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased or not owned[player] then
			return
		end
		for key, pass in Config.Passes do
			if pass.id == passId then
				owned[player][key] = true
				for _, handler in purchaseHandlers do
					handler(player, key)
				end
				for _, handler in ownedHandlers do
					handler(player, key)
				end
				Data.push(player)
				Remotes.Toast:FireClient(player, "toast.styleBought")
			end
		end
	end)
end

return Monetization

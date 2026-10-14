-- ロバックスの商品（ゲームパス）。Config.Passes の id が 0 の間は何も出ず、買えない。
-- 方針: 序盤に課金を迫らない／ランダム要素は入れない（中身が決まった商品だけ）／
--       全ての見た目はコインでも手に入る（パスで買うのは「便利さ」と「限定の見た目」だけ）。
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local RateLimit = require(script.Parent.RateLimit)

local Monetization = {}

local owned: { [Player]: { [string]: boolean } } = {}

function Monetization.owns(player: Player, key: string): boolean
	local set = owned[player]
	return set ~= nil and set[key] == true
end

-- 売値にかける倍率（2倍パスを持っていれば2）
function Monetization.coinMultiplier(player: Player): number
	if Monetization.owns(player, "coins2x") then
		return Config.Passes.coins2x.multiplier
	end
	return 1
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

function Monetization.init()
	Data.addStateExtender(function(player)
		return { passes = owned[player] or {}, coinMultiplier = Monetization.coinMultiplier(player) }
	end)
	Remotes.BuyPass.OnServerEvent:Connect(buyPass)

	MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
		if not purchased or not owned[player] then
			return
		end
		for key, pass in Config.Passes do
			if pass.id == passId then
				owned[player][key] = true
				Data.push(player)
				Remotes.Toast:FireClient(player, "toast.styleBought")
			end
		end
	end)
end

return Monetization

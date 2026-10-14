-- RemoteEvent を1か所にまとめる。サーバーが作り、クライアントは待って受け取る。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local NAMES = {
	"State",
	"Toast",
	"BuySeed",
	"SelectSeed",
	"SellAll",
	"HarvestAll",
	"BuyEgg",
	"EquipPet",
	"EggResult",
	"TreeLevelUp",
	"BuyCosmetic",
	"EquipCosmetic",
	"BuyPass",
	"ClaimDaily",
	"RedeemCode",
	"CodeResult",
	"Teleport",
	"SeasonReward",
	"BuyLimited",
	"ClaimQuest",
	"WelcomeBack",
	"SetMusic",
}

local folder
if RunService:IsServer() then
	folder = ReplicatedStorage:FindFirstChild("Remotes")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Remotes"
		folder.Parent = ReplicatedStorage
	end
	for _, name in NAMES do
		if not folder:FindFirstChild(name) then
			local event = Instance.new("RemoteEvent")
			event.Name = name
			event.Parent = folder
		end
	end
else
	folder = ReplicatedStorage:WaitForChild("Remotes")
	for _, name in NAMES do
		folder:WaitForChild(name)
	end
end

local Remotes = {}
for _, name in NAMES do
	Remotes[name] = folder[name]
end
return Remotes

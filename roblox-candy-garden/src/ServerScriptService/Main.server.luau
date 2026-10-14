-- 起動。マップ生成 → Remote待ち受け → 参加者ごとにデータ読込・庭の割り当て。
local Players = game:GetService("Players")

local Services = script.Parent.Services
local Data = require(Services.Data)
local World = require(Services.World)
local Garden = require(Services.Garden)
local Shop = require(Services.Shop)
local RateLimit = require(Services.RateLimit)

-- データ読込と庭の準備が終わってからキャラクターを出す
Players.CharacterAutoLoads = false

World.build(Garden.interact)
Shop.init()
Garden.startGrowthLoop()
Data.startAutoSave()

local function spawnCharacter(player: Player)
	if player.Parent == Players then
		player:LoadCharacter()
	end
end

local function onPlayerAdded(player: Player)
	Data.load(player)
	if player.Parent ~= Players then
		return
	end

	local plotIndex = World.claim(player)
	if not plotIndex then
		warn("[Main] 空いている庭がありません: " .. player.Name)
	end
	Garden.attach(player)

	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid")
		humanoid.Died:Connect(function()
			task.wait(3)
			spawnCharacter(player)
		end)
	end)

	Data.push(player)
	spawnCharacter(player)
end

local function onPlayerRemoving(player: Player)
	Data.release(player)
	World.release(player)
	RateLimit.clear(player)
end

Players.PlayerAdded:Connect(onPlayerAdded)
Players.PlayerRemoving:Connect(onPlayerRemoving)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

game:BindToClose(function()
	for _, player in Players:GetPlayers() do
		Data.save(player)
	end
end)

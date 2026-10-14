-- 起動。マップ生成 → Remote待ち受け → 参加者ごとにデータ読込・庭の割り当て。
local Players = game:GetService("Players")

local Services = script.Parent.Services
local Data = require(Services.Data)
local World = require(Services.World)
local Garden = require(Services.Garden)
local Shop = require(Services.Shop)
local RateLimit = require(Services.RateLimit)
local Pals = require(Services.Pals)
local Weather = require(Services.Weather)
local Tree = require(Services.Tree)
local Monetization = require(Services.Monetization)
local Cosmetics = require(Services.Cosmetics)
local Daily = require(Services.Daily)
local Codes = require(Services.Codes)
local Season = require(Services.Season)
local LimitedShop = require(Services.LimitedShop)
local Quests = require(Services.Quests)
local Config = require(game:GetService("ReplicatedStorage").Shared.Config)
local Remotes = require(game:GetService("ReplicatedStorage").Shared.Remotes)

-- データ読込と庭の準備が終わってからキャラクターを出す
Players.CharacterAutoLoads = false

World.build(Garden.interact)
Tree.build()
Shop.init()
Pals.init()
Monetization.init()
Cosmetics.init()
Daily.init()
Codes.init()
Season.init()
LimitedShop.init()
Quests.init()
Weather.start()

Remotes.Teleport.OnServerEvent:Connect(function(player, dest)
	if (dest == "home" or dest == "tree") and RateLimit.ok(player, "teleport", 1.5) then
		World.teleport(player, dest)
	end
end)
-- BGMのオン/オフ。保存して、次に来たときも同じにする
Remotes.SetMusic.OnServerEvent:Connect(function(player, on)
	local d = Data.get(player)
	if d and type(on) == "boolean" and RateLimit.ok(player, "music", 0.5) then
		d.music = on
		Data.saveSoon(player)
	end
end)
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
	Monetization.load(player)
	Season.sync(player) -- シーズンの切り替えと、取りこぼしの受け取り
	Garden.attach(player)
	Pals.refreshAttribute(player)
	Cosmetics.track(player)

	player.CharacterAdded:Connect(function(character)
		local humanoid = character:WaitForChild("Humanoid")
		humanoid.Died:Connect(function()
			task.wait(3)
			spawnCharacter(player)
		end)
	end)

	Data.push(player)
	spawnCharacter(player)

	-- おかえりメッセージ: しばらくぶりに来た人に「いない間に ○こ 実ったよ」を見せる（翌日また来る理由）
	-- （初めての人のチュートリアル中は出さない）
	local d = Data.get(player)
	if d and d.tutorialDone and Data.awaySeconds(player) >= Config.WelcomeBackSeconds then
		Remotes.WelcomeBack:FireClient(player, Garden.readyCount(player))
	end
end

local function onPlayerRemoving(player: Player)
	Data.release(player)
	World.release(player)
	Monetization.release(player)
	Codes.release(player)
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

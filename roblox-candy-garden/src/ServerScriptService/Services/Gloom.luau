-- しょんぼり雲（Config.Gloom）: ときどき みんなの木（この土地の まもりがみ）に くらい雲がかかる。
-- 木のそばで「げんきを あげる」を みんなで押すと、雲が小さくなって はれる。
-- はれたら: 木が育つ（みんなのため）・押した人にコイン・しばらく きらきらが出やすい（おひさまタイム）。
-- 間に合わなくても 罰はなし（雲が とおくへ行くだけ）。来られなかった子が 損をしない。
-- 状態は workspace の属性（GloomEndsAt / GloomHp / GloomMax / SunnyUntil）で みんなの画面に知らせる
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Tree = require(script.Parent.Tree)
local RateLimit = require(script.Parent.RateLimit)

local Gloom = {}

local G = Config.Gloom
local C = Color3.fromRGB
local rng = Random.new()

local active = false
local hp, maxHp = 0, 0
local helpers: { [Player]: number } = {}
local cloud: Model? = nil
local spot: Part? = nil -- 「げんきを あげる」の場所（雲とは別。雲は小さくなって動くので）
local round = 0
local cloudBase: CFrame = CFrame.new()

local function now(): number
	return workspace:GetServerTimeNow()
end

local function part(parent: Instance, props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		p[k] = v
	end
	p.Parent = parent
	return p
end

local function ball(parent: Instance, d: number, pos: Vector3, color: Color3, material: Enum.Material?)
	return part(parent, { Shape = Enum.PartType.Ball, Size = Vector3.one * d, Position = pos, Color = color, Material = material or Enum.Material.SmoothPlastic })
end

local function tree(): Model?
	return workspace:FindFirstChild("CommunityTree") :: Model?
end

-- しょんぼりした顔の 雲（こわくない。ちょっと かわいそう、くらい）
local function buildCloud(): Model?
	local t = tree()
	if not t then
		return nil
	end
	-- 木の いちばん上と 根もと（向きのある箱ではなく、ふつうの高さで測る）
	local minY, maxY = math.huge, -math.huge
	for _, p in t:GetDescendants() do
		if p:IsA("BasePart") and p.Transparency < 1 then
			minY = math.min(minY, p.Position.Y - p.Size.Y / 2)
			maxY = math.max(maxY, p.Position.Y + p.Size.Y / 2)
		end
	end
	local trunk = t:GetPivot().Position
	-- 木の上のほうに かぶさるように（上すぎると、ひろばから見上げても 画面に入らない）。ひろばの入口がわ（+Z）に少し出す
	local top = Vector3.new(trunk.X, maxY - 6, trunk.Z + 8)
	local m = Instance.new("Model")
	m.Name = "GloomCloud"
	local grey = C(150, 148, 175)
	local puffs = {
		{ 9, Vector3.new(0, 0, 0) }, { 7, Vector3.new(-5, -0.8, 0.5) }, { 7, Vector3.new(5, -0.8, -0.5) },
		{ 6, Vector3.new(-2.5, 2.2, 1) }, { 6, Vector3.new(2.8, 2, -1) }, { 5, Vector3.new(-8, -1.6, 0) }, { 5, Vector3.new(8, -1.6, 0) },
	}
	for _, puff in puffs do
		ball(m, puff[1], top + puff[2], grey)
	end
	-- 顔（木のほうからも、ひろばからも見えるよう 前とうしろに）
	for _, side in { -1, 1 } do
		local z = side * 4.4
		ball(m, 0.9, top + Vector3.new(-1.6, 0.4, z), C(70, 60, 90))
		ball(m, 0.9, top + Vector3.new(1.6, 0.4, z), C(70, 60, 90))
		ball(m, 0.5, top + Vector3.new(-2.3, 1.3, z), C(70, 60, 90)) -- ハの字の まゆ
		ball(m, 0.5, top + Vector3.new(2.3, 1.3, z), C(70, 60, 90))
		ball(m, 0.6, top + Vector3.new(0, -1.2, z), C(70, 60, 90)) -- への字の口
		ball(m, 0.5, top + Vector3.new(-0.6, -1, z), C(70, 60, 90))
		ball(m, 0.5, top + Vector3.new(0.6, -1, z), C(70, 60, 90))
	end
	-- しとしと雨
	local rain = part(m, { Name = "Rain", Size = Vector3.new(14, 1, 8), Position = top + Vector3.new(0, -3, 0), Transparency = 1 })
	local drops = Instance.new("ParticleEmitter")
	drops.Name = "Drops"
	drops.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	drops.Color = ColorSequence.new(C(160, 180, 230))
	drops.Rate = 12
	drops.Lifetime = NumberRange.new(1, 1.4)
	drops.Speed = NumberRange.new(10, 14)
	drops.EmissionDirection = Enum.NormalId.Bottom
	drops.Size = NumberSequence.new(0.25)
	drops.Parent = rain
	-- げんきが とどいたときの きらきら
	local cheer = Instance.new("ParticleEmitter")
	cheer.Name = "Cheer"
	cheer.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	cheer.Color = ColorSequence.new(C(255, 180, 220), C(255, 240, 160))
	cheer.Rate = 0
	cheer.Lifetime = NumberRange.new(0.6, 1)
	cheer.Speed = NumberRange.new(6, 10)
	cheer.SpreadAngle = Vector2.new(180, 180)
	cheer.Size = NumberSequence.new(0.6, 0)
	cheer.LightEmission = 0.8
	cheer.Parent = rain
	m.WorldPivot = CFrame.new(top)
	m:ScaleTo(1.4) -- 遠くからでも 見えるように 大きく
	cloudBase = m.WorldPivot
	m.Parent = workspace
	-- 「げんきを あげる」ボタン（木の正面。「ひろば」ボタンで来ると降りる場所（0, 42）の すぐ先）
	spot = part(workspace, { Name = "GloomCheerSpot", Size = Vector3.new(2, 2, 2), Position = Vector3.new(trunk.X, minY + 3, trunk.Z + 32), Transparency = 1 })
	local prompt = Instance.new("ProximityPrompt")
	prompt.Name = "CheerPrompt"
	prompt.ActionText = "げんきを あげる"
	prompt.ObjectText = ""
	prompt.HoldDuration = 0
	prompt.MaxActivationDistance = 16
	prompt.RequiresLineOfSight = false
	prompt.Style = Enum.ProximityPromptStyle.Custom
	prompt:SetAttribute("I18n", "prompt.cheer")
	prompt:SetAttribute("Icon", "💖")
	prompt.Parent = spot :: Part
	prompt.Triggered:Connect(function(player)
		Gloom.cheer(player)
	end)
	return m
end

local function publish()
	workspace:SetAttribute("GloomHp", hp)
	workspace:SetAttribute("GloomMax", maxHp)
end

local function finish(cleared: boolean)
	if not active then
		return
	end
	active = false
	workspace:SetAttribute("GloomEndsAt", 0)
	if cloud then
		cloud:Destroy()
		cloud = nil
	end
	if spot then
		spot:Destroy()
		spot = nil
	end
	if cleared then
		-- 木が育つ（つぎのレベルまでの 一部）
		local goal = workspace:GetAttribute("TreeGoal") or 20
		Tree.addPoints(goal * G.treeShare)
		workspace:SetAttribute("SunnyUntil", now() + G.sunnySeconds)
		local level = workspace:GetAttribute("TreeLevel") or 1
		local coins = math.min(G.coinsMax, G.coinsBase + G.coinsPerLevel * level)
		for _, player in Players:GetPlayers() do
			Remotes.Toast:FireClient(player, "gloom.clear")
			local d = Data.get(player)
			if d and helpers[player] then
				d.coins += coins
				Remotes.Toast:FireClient(player, "gloom.reward", coins)
				Data.push(player)
				Data.saveSoon(player)
			end
		end
	else
		for _, player in Players:GetPlayers() do
			Remotes.Toast:FireClient(player, "gloom.gone")
		end
	end
	helpers = {}
end

function Gloom.start()
	if active or not tree() then
		return
	end
	active = true
	helpers = {}
	maxHp = math.max(G.minHp, G.hpPerPlayer * #Players:GetPlayers())
	hp = maxHp
	cloud = buildCloud()
	publish()
	workspace:SetAttribute("GloomEndsAt", now() + G.duration)
	for _, player in Players:GetPlayers() do
		Remotes.Toast:FireClient(player, "gloom.announce")
	end
	round += 1
	local myRound = round
	task.delay(G.duration, function()
		if round == myRound then
			finish(false)
		end
	end)
end

function Gloom.cheer(player: Player)
	if not active or not RateLimit.ok(player, "cheer", G.cheerEvery) then
		return
	end
	helpers[player] = (helpers[player] or 0) + 1
	hp = math.max(0, hp - 1)
	publish()
	if cloud then
		-- 雲が だんだん 小さく・明るくなる
		local ratio = hp / math.max(1, maxHp)
		cloud:ScaleTo(1.4 * (0.5 + 0.5 * ratio))
		cloud:PivotTo(cloudBase)
		local rain = cloud:FindFirstChild("Rain")
		local burst = rain and rain:FindFirstChild("Cheer")
		if burst then
			burst:Emit(10)
		end
		local drops = rain and rain:FindFirstChild("Drops") :: ParticleEmitter?
		if drops then
			drops.Rate = 12 * ratio
		end
	end
	if hp <= 0 then
		finish(true)
	end
end

function Gloom.init()
	workspace:SetAttribute("GloomEndsAt", 0)
	workspace:SetAttribute("SunnyUntil", 0)
	task.spawn(function()
		task.wait(rng:NextNumber(G.firstMin, G.firstMax))
		while true do
			if #Players:GetPlayers() > 0 then
				Gloom.start()
			end
			task.wait(G.duration + rng:NextNumber(G.everyMin, G.everyMax))
		end
	end)
	-- Studioでの確認用（本番では動かない）: workspace の属性 DebugGloom を オンにすると、すぐ雲が来る
	if RunService:IsStudio() then
		workspace:GetAttributeChangedSignal("DebugGloom"):Connect(function()
			if workspace:GetAttribute("DebugGloom") then
				Gloom.start()
			end
		end)
	end
	Players.PlayerRemoving:Connect(function(player)
		helpers[player] = nil
	end)
end

return Gloom

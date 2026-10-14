-- コミュニティの木。サーバー全員の収穫が成長ポイントになる協力要素。
-- 奪い合いの代わりに、みんなで育てて、レベルが上がると全員にごほうびを出す。
-- 状態は workspace の属性（TreeLevel / TreeProgress / TreeGoal）で全員に共有する。
-- 進み具合はサーバーごと（サーバーが閉じるとリセット）。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)

local Tree = {}

local level = 1
local progress = 0
local model: Model
local emitter: ParticleEmitter

local CANOPY = {
	Color3.fromRGB(255, 170, 205),
	Color3.fromRGB(190, 235, 215),
	Color3.fromRGB(215, 190, 255),
}
local ORNAMENT = {
	Color3.fromRGB(255, 226, 120),
	Color3.fromRGB(255, 255, 255),
	Color3.fromRGB(255, 140, 190),
}

local function block(props: { [string]: any }): Part
	local base = {
		Anchored = true,
		CanCollide = false,
		CastShadow = true,
		TopSurface = Enum.SurfaceType.Smooth,
		BottomSurface = Enum.SurfaceType.Smooth,
		Material = Enum.Material.SmoothPlastic,
	}
	for k, v in props do
		base[k] = v
	end
	local part = Instance.new("Part")
	for k, v in base do
		part[k] = v
	end
	part.Parent = model
	return part
end

local function publish()
	workspace:SetAttribute("TreeLevel", level)
	workspace:SetAttribute("TreeProgress", progress)
	workspace:SetAttribute("TreeGoal", Config.treeGoal(level))
end

-- レベルに合わせて木を作り直す（大きく・飾りが増える）
local function rebuild()
	model:ClearAllChildren()
	local visual = math.min(level, Config.Tree.MaxVisualLevel)
	local s = 1 + (visual - 1) * 0.3
	local trunkHeight = 9 * s

	local trunk = block({
		Name = "Trunk",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(trunkHeight, 3.2 * s, 3.2 * s),
		CFrame = CFrame.new(0, trunkHeight / 2 + 0.4, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = Color3.fromRGB(176, 120, 96),
		CanCollide = true,
	})
	model.PrimaryPart = trunk

	-- わたあめの葉っぱ
	local top = trunkHeight + 3 * s
	local canopyCenter = Vector3.new(0, top, 0)
	local canopy = block({
		Name = "Canopy",
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * 13 * s,
		Position = canopyCenter,
		Color = CANOPY[1],
	})
	for i = 1, 5 do
		local angle = (i / 5) * math.pi * 2
		block({
			Name = "Puff",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 8 * s,
			Position = canopyCenter + Vector3.new(math.cos(angle) * 5.5 * s, -1.5 * s, math.sin(angle) * 5.5 * s),
			Color = CANOPY[(i % #CANOPY) + 1],
		})
	end

	-- 飾り（レベルが上がるほど増える）
	local count = 6 * visual
	for i = 1, count do
		local y = 1 - ((i - 0.5) / count) * 1.7 -- 上から下へ
		local radius = math.sqrt(math.max(0, 1 - y * y))
		local angle = i * 2.39996 -- 黄金角
		local r = 6.6 * s
		local ornament = block({
			Name = "Ornament",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 0.9 * s,
			Position = canopyCenter + Vector3.new(math.cos(angle) * radius * r, y * r, math.sin(angle) * radius * r),
			Color = ORNAMENT[(i % #ORNAMENT) + 1],
			Material = Enum.Material.Neon,
		})
		if visual >= 2 and i % 6 == 0 then
			local light = Instance.new("PointLight")
			light.Color = ornament.Color
			light.Range = 8
			light.Brightness = 0.8
			light.Parent = ornament
		end
	end

	-- 3レベル以上で、てっぺんに星
	if visual >= 3 then
		local star = block({
			Name = "Star",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 2.6 * s,
			Position = canopyCenter + Vector3.new(0, 7.2 * s, 0),
			Color = Color3.fromRGB(255, 226, 90),
			Material = Enum.Material.Neon,
		})
		local glow = Instance.new("PointLight")
		glow.Color = star.Color
		glow.Range = 18
		glow.Brightness = 1.5
		glow.Parent = star
	end

	-- 看板の位置（クライアントが看板を作る）
	block({
		Name = "SignAnchor",
		Size = Vector3.one,
		Position = canopyCenter + Vector3.new(0, 10 * s + 2, 0),
		Transparency = 1,
		CanQuery = false,
		CanTouch = false,
	})

	-- お祝いの粒子（普段は止めておく）
	emitter = Instance.new("ParticleEmitter")
	emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	emitter.Rate = 90
	emitter.Lifetime = NumberRange.new(1.5, 2.4)
	emitter.Speed = NumberRange.new(14, 26)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Acceleration = Vector3.new(0, -12, 0)
	emitter.LightEmission = 0.7
	emitter.Size = NumberSequence.new(1.2, 0.2)
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 226, 120)),
		ColorSequenceKeypoint.new(0.5, Color3.fromRGB(255, 140, 190)),
		ColorSequenceKeypoint.new(1, Color3.fromRGB(170, 215, 255)),
	})
	emitter.Enabled = false
	emitter.Parent = canopy
end

local function celebrate()
	emitter.Enabled = true
	local current = emitter
	task.delay(4, function()
		if current.Parent then
			current.Enabled = false
		end
	end)
end

function Tree.build()
	model = Instance.new("Model")
	model.Name = "CommunityTree"
	model.Parent = workspace
	rebuild()
	publish()
end

-- 収穫のたびに呼ぶ。points は作物ごとの成長ポイント
function Tree.add(cropId: string)
	local points = Config.Tree.Points[cropId] or 1
	progress += points

	local reached = 0
	local rewardTotal = 0
	while progress >= Config.treeGoal(level) do
		progress -= Config.treeGoal(level)
		reached = level + 1
		rewardTotal = Config.treeReward(level)
		level += 1
	end
	publish()

	if reached > 0 then
		-- 上がった最後のレベルのごほうびを全員に配る（まとめて上がっても多重取りにならない）
		for _, player in Players:GetPlayers() do
			local d = Data.get(player)
			if d then
				d.coins += rewardTotal
				Data.push(player)
			end
		end
		rebuild()
		celebrate()
		Remotes.TreeLevelUp:FireAllClients(level, rewardTotal)
	end
end

return Tree

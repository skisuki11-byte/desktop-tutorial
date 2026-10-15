-- コミュニティの木。サーバー全員の収穫が成長ポイントになる協力要素。
-- 奪い合いの代わりに、みんなで育てて、レベルが上がると全員にごほうびを出す。
-- 状態は workspace の属性（TreeLevel / TreeProgress / TreeGoal）で全員に共有する。
-- 進み具合はサーバーごと（サーバーが閉じるとリセット）。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Season = require(script.Parent.Season)

local Tree = {}

local level = 1
local progress = 0
local model: Model
local emitter: ParticleEmitter

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

-- 色のテーマ（Config.Tree.Themes で、どのレベルから切り替わるかを決める）
-- canopy: わたあめの葉っぱ / ornament: 飾り / trunk: 幹 / star: てっぺん / glow: 光の色
local THEMES = {
	pastel = {
		canopy = { Color3.fromRGB(255, 170, 205), Color3.fromRGB(190, 235, 215), Color3.fromRGB(215, 190, 255) },
		ornament = { Color3.fromRGB(255, 226, 120), Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 140, 190) },
		trunk = Color3.fromRGB(160, 110, 84),
		star = Color3.fromRGB(255, 226, 90),
		glow = Color3.fromRGB(255, 200, 230),
	},
	-- レベル10から: 金色の夕焼け
	golden = {
		canopy = { Color3.fromRGB(255, 200, 120), Color3.fromRGB(255, 160, 150), Color3.fromRGB(255, 225, 160) },
		ornament = { Color3.fromRGB(255, 240, 170), Color3.fromRGB(255, 120, 120), Color3.fromRGB(255, 180, 80) },
		trunk = Color3.fromRGB(150, 95, 70),
		star = Color3.fromRGB(255, 210, 60),
		glow = Color3.fromRGB(255, 200, 120),
	},
	-- レベル20から: 星空（夜空色のわたあめに、光る星）
	galaxy = {
		canopy = { Color3.fromRGB(120, 110, 220), Color3.fromRGB(80, 170, 230), Color3.fromRGB(190, 120, 230) },
		ornament = { Color3.fromRGB(255, 255, 255), Color3.fromRGB(150, 240, 255), Color3.fromRGB(255, 170, 240) },
		trunk = Color3.fromRGB(110, 80, 120),
		star = Color3.fromRGB(200, 240, 255),
		glow = Color3.fromRGB(170, 200, 255),
	},
}

local function themeFor(lv: number)
	local id = "pastel"
	for _, entry in Config.Tree.Themes do
		if lv >= entry.from then
			id = entry.id
		end
	end
	return THEMES[id]
end

local function light(parent: Instance, color: Color3, range: number, brightness: number)
	local l = Instance.new("PointLight")
	l.Color = color
	l.Range = range
	l.Brightness = brightness
	l.Parent = parent
end

-- レベルに合わせて木を作り直す。レベル10までは毎回なにかが増える（形）。そのあとは色が変わる（テーマ）。
-- スマホの縦持ちでも収まるよう、横より縦に伸ばす（幅はレベル10で約2倍、高さは約2.8倍）
--   2: 飾りが光る / 3: てっぺんに星 / 4: 下に花のわ / 5: キャンディケーンの飾り
--   6: 葉っぱが二段に / 7: ちょうちんの灯り / 8: いつもキラキラ / 9: まわるペロペロキャンディ / 10: 金の冠
local function rebuild()
	model:ClearAllChildren()
	local visual = math.min(level, Config.Tree.MaxVisualLevel)
	local theme = themeFor(level)
	local sw = 1 + (visual - 1) * 0.12 -- 幅
	local sh = 1 + (visual - 1) * 0.2 -- 高さ
	local trunkHeight = 9 * sh

	local trunk = block({
		Name = "Trunk",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(trunkHeight, 3.2 * sw, 3.2 * sw),
		CFrame = CFrame.new(0, trunkHeight / 2 + 0.4, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = theme.trunk,
		Material = Enum.Material.Wood, -- 木目の幹（リアルな質感）
		CanCollide = true,
	})
	model.PrimaryPart = trunk

	-- わたあめの葉っぱ
	local radius = 6.5 * sw
	local top = trunkHeight + radius * 0.45
	local canopyCenter = Vector3.new(0, top, 0)
	local canopy = block({
		Name = "Canopy",
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * radius * 2,
		Position = canopyCenter,
		Color = theme.canopy[1],
		Material = Enum.Material.Fabric, -- ふわふわのわたあめ
	})
	for i = 1, 5 do
		local angle = (i / 5) * math.pi * 2
		block({
			Name = "Puff",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * radius * 1.25,
			Position = canopyCenter + Vector3.new(math.cos(angle) * radius * 0.85, -radius * 0.25, math.sin(angle) * radius * 0.85),
			Color = theme.canopy[(i % #theme.canopy) + 1],
			Material = Enum.Material.Fabric,
		})
	end
	-- 6: 葉っぱが二段に（上にもう一段のせて、背が高くなる）
	local crownTop = canopyCenter + Vector3.new(0, radius * 0.95, 0)
	if visual >= 6 then
		block({
			Name = "UpperCanopy",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * radius * 1.35,
			Position = canopyCenter + Vector3.new(0, radius * 0.95, 0),
			Color = theme.canopy[3],
			Material = Enum.Material.Fabric,
		})
		crownTop = canopyCenter + Vector3.new(0, radius * 1.6, 0)
	end

	-- 飾り（レベルが上がるほど増える）
	local count = 6 * visual
	for i = 1, count do
		local y = 1 - ((i - 0.5) / count) * 1.7 -- 上から下へ
		local ring = math.sqrt(math.max(0, 1 - y * y))
		local angle = i * 2.39996 -- 黄金角
		local r = radius * 1.02
		local ornament = block({
			Name = "Ornament",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 0.9 * sw,
			Position = canopyCenter + Vector3.new(math.cos(angle) * ring * r, y * r, math.sin(angle) * ring * r),
			Color = theme.ornament[(i % #theme.ornament) + 1],
			Material = Enum.Material.Neon,
		})
		-- 2: 飾りの一部が光る
		if visual >= 2 and i % 6 == 0 then
			light(ornament, ornament.Color, 8, 0.8)
		end
	end

	-- 3: てっぺんに星
	if visual >= 3 then
		local star = block({
			Name = "Star",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 2.6 * sw,
			Position = crownTop + Vector3.new(0, 1.2 * sw, 0),
			Color = theme.star,
			Material = Enum.Material.Neon,
		})
		light(star, star.Color, 18, 1.5)
		-- 10: 金の冠（星のまわりに光る輪）
		if visual >= 10 then
			for i = 1, 8 do
				local a = (i / 8) * math.pi * 2
				block({
					Name = "Crown",
					Shape = Enum.PartType.Ball,
					Size = Vector3.one * 1.1 * sw,
					Position = star.Position + Vector3.new(math.cos(a) * 2.6 * sw, -0.6 * sw, math.sin(a) * 2.6 * sw),
					Color = Color3.fromRGB(255, 215, 90),
					Material = Enum.Material.Neon,
				})
			end
		end
	end

	-- 4: 根元に花のわ（グミの花）
	if visual >= 4 then
		for i = 1, 14 do
			local a = (i / 14) * math.pi * 2
			block({
				Name = "Flower",
				Shape = Enum.PartType.Ball,
				Size = Vector3.new(1.4, 0.9, 1.4),
				Position = Vector3.new(math.cos(a) * 4.5 * sw, 0.7, math.sin(a) * 4.5 * sw),
				Color = theme.ornament[(i % #theme.ornament) + 1],
				Material = Enum.Material.Glass,
			})
		end
	end

	-- 5: キャンディケーンの飾り（葉っぱの下に、ぐるりと）
	if visual >= 5 then
		for i = 1, 6 do
			local a = (i / 6) * math.pi * 2 + 0.3
			local base = canopyCenter + Vector3.new(math.cos(a) * radius * 1.05, -radius * 0.55, math.sin(a) * radius * 1.05)
			for k = 0, 3 do
				block({
					Name = "Cane",
					Shape = Enum.PartType.Cylinder,
					Size = Vector3.new(0.6, 0.45, 0.45),
					CFrame = CFrame.new(base - Vector3.new(0, k * 0.6, 0)) * CFrame.Angles(0, 0, math.pi / 2),
					Color = if k % 2 == 0 then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(240, 70, 100),
				})
			end
		end
	end

	-- 7: ちょうちんの灯り（夜もきれい）
	if visual >= 7 then
		for i = 1, 4 do
			local a = (i / 4) * math.pi * 2 + 0.8
			local lantern = block({
				Name = "Lantern",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * 1.6,
				Position = canopyCenter + Vector3.new(math.cos(a) * radius * 0.95, -radius * 0.9, math.sin(a) * radius * 0.95),
				Color = theme.glow,
				Material = Enum.Material.Neon,
			})
			light(lantern, theme.glow, 14, 1.2)
		end
	end

	-- 9: ペロペロキャンディが木のまわりに浮かぶ
	if visual >= 9 then
		for i = 1, 5 do
			local a = (i / 5) * math.pi * 2
			local pos = canopyCenter + Vector3.new(math.cos(a) * radius * 1.55, radius * 0.1, math.sin(a) * radius * 1.55)
			local candy = block({
				Name = "Lollipop",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.5, 2.6, 2.6),
				CFrame = CFrame.lookAt(pos, Vector3.new(0, pos.Y, 0)) * CFrame.Angles(0, math.pi / 2, 0),
				Color = theme.ornament[(i % #theme.ornament) + 1],
				Material = Enum.Material.Glass,
			})
			light(candy, candy.Color, 8, 0.6)
		end
	end

	-- 看板の位置（クライアントが看板を作る）
	block({
		Name = "SignAnchor",
		Size = Vector3.one,
		Position = crownTop + Vector3.new(0, 7 * sw, 0),
		Transparency = 1,
		CanQuery = false,
		CanTouch = false,
	})

	-- 8: いつも静かにキラキラ
	if visual >= 8 then
		local ambient = Instance.new("ParticleEmitter")
		ambient.Name = "Ambient"
		ambient.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		ambient.Rate = 6
		ambient.Lifetime = NumberRange.new(2, 3)
		ambient.Speed = NumberRange.new(1, 2)
		ambient.SpreadAngle = Vector2.new(180, 180)
		ambient.LightEmission = 0.8
		ambient.Size = NumberSequence.new(0.6, 0)
		ambient.Color = ColorSequence.new(theme.glow)
		ambient.Parent = canopy
	end

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
		ColorSequenceKeypoint.new(0, theme.star),
		ColorSequenceKeypoint.new(0.5, theme.ornament[3]),
		ColorSequenceKeypoint.new(1, theme.glow),
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
				Season.addXp(player, Config.Season.xp.tree)
			end
		end
		rebuild()
		celebrate()
		Remotes.TreeLevelUp:FireAllClients(level, rewardTotal)
	end
end

return Tree

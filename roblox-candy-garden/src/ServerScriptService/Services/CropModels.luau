-- 作物の見た目。全てコードで作る（素材は使わない）。
-- 方針「かわいい形 × リアルな質感」:
--   ・グミ・飴はガラスの質感（つやつや・少し透ける）、わたあめは布の質感（ふわふわ）、幹は木の質感
--   ・育ち方: 芽（sprout）→ 作物の形が大きくなる → 実ったらキラキラ
-- 原点(0,0,0)が土の表面。Garden が Model:ScaleTo で大きさを変え、PivotTo で畑に置く。
local CropModels = {}

local C = Color3.fromRGB
local LEAF = C(96, 178, 96)
local LEAF_LIGHT = C(132, 206, 112)

local function part(model: Model, props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.CastShadow = true
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		p[k] = v
	end
	p.Parent = model
	return p
end

local function ball(model: Model, d: number, pos: Vector3, color: Color3, material: Enum.Material?, transparency: number?)
	return part(model, {
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * d,
		CFrame = CFrame.new(pos),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
		Transparency = transparency or 0,
	})
end

-- 楕円体（Block + SpecialMesh Sphere）。葉っぱやメロンに使う
local function ellipsoid(model: Model, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?)
	local p = part(model, { Size = size, CFrame = cf, Color = color, Material = material or Enum.Material.SmoothPlastic })
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = p
	return p
end

-- 軸が縦(Y)の円柱
local function pillar(model: Model, height: number, d: number, cf: CFrame, color: Color3, material: Enum.Material?)
	return part(model, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, d, d),
		CFrame = cf * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- 葉っぱ（平たい楕円を少し傾ける）
local function leaf(model: Model, length: number, at: Vector3, yaw: number, tilt: number, color: Color3?)
	return ellipsoid(
		model,
		Vector3.new(length * 0.55, 0.12, length),
		CFrame.new(at) * CFrame.Angles(0, yaw, 0) * CFrame.Angles(tilt, 0, 0) * CFrame.new(0, 0, -length * 0.4),
		color or LEAF
	)
end

local BUILD: { [string]: (Model) -> () } = {}

-- 芽（どの作物も最初はこれ）
BUILD.sprout = function(m)
	pillar(m, 0.7, 0.16, CFrame.new(0, 0.35, 0), LEAF)
	leaf(m, 0.9, Vector3.new(0, 0.7, 0), 0, math.rad(25), LEAF_LIGHT)
	leaf(m, 0.9, Vector3.new(0, 0.7, 0), math.pi, math.rad(25), LEAF_LIGHT)
end

-- グミベリー: こんもりした茂みに、つやつやのグミの実
BUILD.gummyberry = function(m)
	ellipsoid(m, Vector3.new(3.2, 1.9, 3.2), CFrame.new(0, 0.9, 0), LEAF, Enum.Material.Grass)
	ellipsoid(m, Vector3.new(2.4, 1.6, 2.4), CFrame.new(0.5, 1.6, -0.3), LEAF_LIGHT, Enum.Material.Grass)
	local red = C(255, 70, 110)
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		ball(m, 0.85, Vector3.new(math.cos(a) * 1.1, 1.7 + (i % 2) * 0.35, math.sin(a) * 1.1), red, Enum.Material.Glass, 0.15)
	end
end

-- ペロペロフラワー: くきの先に、うずまきの飴の花
BUILD.peropero = function(m)
	pillar(m, 3.2, 0.28, CFrame.new(0, 1.6, 0), LEAF)
	leaf(m, 1.4, Vector3.new(0, 1.0, 0), 0.4, math.rad(35))
	leaf(m, 1.3, Vector3.new(0, 1.5, 0), 0.4 + math.pi, math.rad(35))
	local face = CFrame.new(0, 3.9, 0) * CFrame.Angles(math.rad(-12), 0, 0) * CFrame.Angles(0, math.pi / 2, 0)
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.45, 2.6, 2.6), CFrame = face, Color = C(255, 120, 190), Material = Enum.Material.Glass, Transparency = 0.1 })
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.5, 1.7, 1.7), CFrame = face, Color = C(255, 250, 252), Material = Enum.Material.Glass, Transparency = 0.1 })
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.55, 0.9, 0.9), CFrame = face, Color = C(255, 120, 190), Material = Enum.Material.Glass, Transparency = 0.1 })
end

-- わたあめブッシュ: 木の枝に、ふわふわのわたあめ
BUILD.wataame = function(m)
	pillar(m, 1.8, 0.4, CFrame.new(0, 0.9, 0), C(170, 120, 90), Enum.Material.Wood)
	local colors = { C(190, 222, 255), C(255, 200, 228), C(220, 205, 255) }
	local spots = {
		Vector3.new(0, 2.6, 0),
		Vector3.new(1.1, 2.2, 0.4),
		Vector3.new(-1.0, 2.3, -0.5),
		Vector3.new(0.2, 3.3, -0.3),
		Vector3.new(-0.3, 2.1, 1.0),
	}
	for i, at in spots do
		ball(m, i == 1 and 2.4 or 1.7, at, colors[(i % #colors) + 1], Enum.Material.Fabric)
	end
end

-- にじメロン: 地面をはうツルと葉っぱに、にじ色のしまのメロン
BUILD.nijimelon = function(m)
	for i = 1, 4 do
		leaf(m, 1.7, Vector3.new(0, 0.15, 0), (i / 4) * math.pi * 2, math.rad(5), LEAF)
	end
	local r = 1.25
	local center = Vector3.new(0.2, r, 0.1)
	ball(m, r * 2, center, C(150, 225, 160))
	-- しま（球の高さごとに直径を合わせた輪）
	local bands = { { -0.6, C(255, 130, 160) }, { 0, C(255, 220, 110) }, { 0.6, C(130, 200, 255) } }
	for _, band in bands do
		local dy = band[1]
		local d = 2 * math.sqrt(math.max(0.05, r * r - dy * dy)) + 0.06
		pillar(m, 0.22, d, CFrame.new(center + Vector3.new(0, dy, 0)), band[2])
	end
	pillar(m, 0.35, 0.18, CFrame.new(center + Vector3.new(0, r + 0.1, 0)), C(110, 160, 90))
end

-- スターケーキの木: 木の幹に、クリームの葉っぱと小さなケーキ、てっぺんに星
BUILD.starcake = function(m)
	pillar(m, 3.0, 0.6, CFrame.new(0, 1.5, 0), C(150, 104, 78), Enum.Material.Wood)
	local cream = C(255, 236, 244)
	ball(m, 2.8, Vector3.new(0, 3.6, 0), cream, Enum.Material.Fabric)
	ball(m, 2.0, Vector3.new(1.2, 3.2, 0.3), C(255, 214, 230), Enum.Material.Fabric)
	ball(m, 2.0, Vector3.new(-1.1, 3.3, -0.4), C(255, 214, 230), Enum.Material.Fabric)
	-- 小さなケーキ（2段＋いちご）
	for i = 1, 3 do
		local a = (i / 3) * math.pi * 2 + 0.3
		local at = Vector3.new(math.cos(a) * 1.5, 2.5, math.sin(a) * 1.5)
		pillar(m, 0.35, 0.8, CFrame.new(at), C(255, 220, 160))
		pillar(m, 0.3, 0.6, CFrame.new(at + Vector3.new(0, 0.32, 0)), C(255, 250, 245))
		ball(m, 0.28, at + Vector3.new(0, 0.6, 0), C(235, 50, 80), Enum.Material.Glass)
	end
	local star = ball(m, 0.9, Vector3.new(0, 5.2, 0), C(255, 224, 90), Enum.Material.Neon)
	local glow = Instance.new("PointLight")
	glow.Color = star.Color
	glow.Range = 8
	glow.Brightness = 0.8
	glow.Parent = star
end

-- ムーンキャンディ: 夜空色の飴の実が、ほんのり光る
BUILD.mooncandy = function(m)
	pillar(m, 2.6, 0.26, CFrame.new(0, 1.3, 0), C(120, 150, 110))
	leaf(m, 1.3, Vector3.new(0, 0.9, 0), 1.2, math.rad(35), C(110, 160, 130))
	leaf(m, 1.2, Vector3.new(0, 1.4, 0), 1.2 + math.pi, math.rad(35), C(110, 160, 130))
	local moon = ball(m, 1.9, Vector3.new(0, 3.3, 0), C(168, 156, 255), Enum.Material.Glass, 0.1)
	local glow = Instance.new("PointLight")
	glow.Color = C(190, 180, 255)
	glow.Range = 9
	glow.Brightness = 1
	glow.Parent = moon
	for i = 1, 3 do
		local a = (i / 3) * math.pi * 2
		ball(m, 0.32, Vector3.new(math.cos(a) * 1.4, 3.5 + (i % 2) * 0.4, math.sin(a) * 1.4), C(255, 240, 160), Enum.Material.Neon)
	end
end

-- 作物の Model を作る。kind は "sprout" か 作物のid
function CropModels.build(kind: string): Model
	local model = Instance.new("Model")
	local builder = BUILD[kind] or BUILD.sprout
	builder(model)
	model.WorldPivot = CFrame.new() -- 原点（土の表面）を中心に大きさを変える
	return model
end

-- 実ったときのキラキラ。いちばん高い部品の上に付ける
function CropModels.setReady(model: Model, ready: boolean)
	local existing = model:FindFirstChild("ReadySparkle", true)
	if ready and not existing then
		local top: BasePart? = nil
		for _, p in model:GetDescendants() do
			if p:IsA("BasePart") and (not top or p.Position.Y > top.Position.Y) then
				top = p
			end
		end
		if top then
			local emitter = Instance.new("ParticleEmitter")
			emitter.Name = "ReadySparkle"
			emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
			emitter.Rate = 4
			emitter.Lifetime = NumberRange.new(0.8, 1.3)
			emitter.Speed = NumberRange.new(1, 2.5)
			emitter.SpreadAngle = Vector2.new(180, 180)
			emitter.Size = NumberSequence.new(0.5, 0.1)
			emitter.LightEmission = 0.8
			emitter.Color = ColorSequence.new(C(255, 240, 160), C(255, 255, 255))
			emitter.Parent = top
		end
	elseif not ready and existing then
		existing:Destroy()
	end
end

return CropModels

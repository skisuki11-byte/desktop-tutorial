local MiscVisuals=require(game:GetService("ReplicatedStorage").Shared.MiscVisuals)
-- お菓子の庭のマップを全てコードで生成する（素材は使わない）。
-- 方針「かわいい形 × リアルな光と質感」（例: あつまれ どうぶつの森）。
--   ・形と色はかわいいまま（明るいパステル、丸い形）
--   ・光・影・空・草・水・木目などの質感はリアルに（地形の草、立体の雲、池の水、木の板）
--   ・スマホでも重くならないよう、部品の数は抑える（飾りは数を決めて、固定の並び）
-- 地面・飾り・ライティング・プレイヤーごとの庭（Plot）を作り、庭の割り当ても担当する。
local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local World = {}

local C = Color3.fromRGB

local PASTELS = {
	C(255, 170, 205),
	C(255, 210, 120),
	C(170, 220, 255),
	C(200, 170, 255),
	C(160, 235, 195),
}
local WOOD = C(214, 168, 120) -- 畑の木の板（明るいクッキー色）
local SOIL = C(120, 82, 60) -- ふかふかの土
local FENCE = C(255, 250, 244) -- 白い柵
local COOKIE = C(226, 178, 120) -- 飛び石のクッキー

local PLOT_RADIUS = 70 -- 畑を広げられるようにしたので、庭どうしの間も少し広げた
local TILE_SIZE = Vector3.new(7, 0.6, 7)
local PLOT_HALF = Vector3.new(19, 0, 16.5) -- 庭の床の半分の大きさ（4列×3段の畑＋入口・名札のすき間）

-- 畑の番号 → 庭の中の位置（1〜6: まん中の2列 / 7〜9: 左の列 / 10〜12: 右の列）
local function tileOffset(i: number): (number, number)
	local columns = { -4.5, 4.5, -13.5, 13.5 }
	local column, row
	if i <= 6 then
		column = columns[((i - 1) % 2) + 1]
		row = math.floor((i - 1) / 2)
	elseif i <= 9 then
		column = columns[3]
		row = i - 7
	else
		column = columns[4]
		row = i - 10
	end
	return column, (row - 1) * 9
end
local pumpPrompt: ProximityPrompt
local POND = { angle = math.rad(22.5), radius = 108, size = 15 } -- 池（庭と庭のあいだの外側。景色）
-- みんなの広場: 「みんなの木」へ移動したときに降りる場所（+Z がわ）の左右に、ふんすい（水くみ）と たねや。
-- どの庭からも同じくらいの近さで、みんなが同じ場所に集まる
local PLAZA_RADIUS = 32
local FOUNTAIN_ANGLE = math.rad(67.5)
local function plazaSpot(angle: number): Vector3
	return Vector3.new(math.cos(angle) * PLAZA_RADIUS, 0, math.sin(angle) * PLAZA_RADIUS)
end
-- 遠くのお店: 左（西）に たまごの森、右（東）に どうぐ屋。庭の外がわの広い野原
-- たまごの森・どうぐ屋は、庭と庭の「あいだ」の外がわ（庭のうしろの ひみつきちと 重ならない場所）。
-- 庭は 0°・45°… の向きにあるので、その まん中（22.5°ずれ）に置く
local function between(angleDeg: number, radius: number): Vector3
	local a = math.rad(angleDeg)
	return Vector3.new(math.cos(a) * radius, 0, math.sin(a) * radius)
end
local EGG_FOREST = between(157.5, 125)
local TOOL_SHOP = between(-22.5, 118)

local plots = {} -- { model, tiles, spawn, label, owner }

local function make(className: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(className)
	for k, v in props do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

local function block(props: { [string]: any }, parent: Instance?): any
	local base = {
		Anchored = true,
		TopSurface = Enum.SurfaceType.Smooth,
		BottomSurface = Enum.SurfaceType.Smooth,
		Material = Enum.Material.SmoothPlastic,
	}
	for k, v in props do
		base[k] = v
	end
	return make("Part", base, parent)
end

-- 飾り用: 当たり判定なし・影あり
local function deco(props: { [string]: any }, parent: Instance?): any
	props.CanCollide = props.CanCollide or false
	props.CanTouch = false
	props.CanQuery = false
	return block(props, parent)
end

local function ball(parent: Instance, diameter: number, position: Vector3, color: Color3, material: Enum.Material?)
	return deco({
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * diameter,
		Position = position,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	}, parent)
end

-- 軸が縦(Y)の円柱
local function pillar(parent: Instance, height: number, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?, collide: boolean?)
	return deco({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, diameter, diameter),
		CFrame = cf * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
		CanCollide = collide or false,
	}, parent)
end

-- ---- 光と空 ----

local function setupLighting()
	-- 昼すぎのやわらかい光。影がきれいに出る太陽の角度にする
	Lighting.ClockTime = 14.3
	Lighting.GeographicLatitude = 35
	Lighting.Brightness = 2.4
	Lighting.Ambient = C(120, 105, 130)
	Lighting.OutdoorAmbient = C(150, 140, 165)
	Lighting.EnvironmentDiffuseScale = 1 -- 空の色が物にうつる（リアルな質感）
	Lighting.EnvironmentSpecularScale = 1 -- つやのある物に景色が映りこむ
	Lighting.GlobalShadows = true
	Lighting.ShadowSoftness = 0.3
	Lighting.ExposureCompensation = 0
	for _, child in Lighting:GetChildren() do
		if child:IsA("Atmosphere") or child:IsA("BloomEffect") or child:IsA("ColorCorrectionEffect")
			or child:IsA("SunRaysEffect") or child:IsA("DepthOfFieldEffect") then
			child:Destroy()
		end
	end
	-- 遠くがうっすらピンクにかすむ空気（奥行きが出る）
	make("Atmosphere", {
		Color = C(255, 222, 236),
		Decay = C(200, 178, 236),
		Density = 0.3,
		Offset = 0.18,
		Glare = 0.4,
		Haze = 1.4,
	}, Lighting)
	make("BloomEffect", { Intensity = 0.45, Size = 26, Threshold = 1.6 }, Lighting)
	make("ColorCorrectionEffect", { Name = "Tint", Saturation = 0.18, Contrast = 0.06, Brightness = 0.01 }, Lighting)
	make("SunRaysEffect", { Intensity = 0.05, Spread = 0.7 }, Lighting)

	-- 立体的な雲（ふわふわ・少しピンク）
	local terrain = workspace.Terrain
	local clouds = terrain:FindFirstChildOfClass("Clouds") or make("Clouds", {}, terrain)
	clouds.Cover = 0.55
	clouds.Density = 0.55
	clouds.Color = C(255, 244, 250)
end

-- ---- 地形（草・丘・池） ----

local function pondCenter(): Vector3
	return Vector3.new(math.cos(POND.angle) * POND.radius, 0, math.sin(POND.angle) * POND.radius)
end

local function buildTerrain()
	local terrain = workspace.Terrain
	terrain:Clear()
	terrain:SetMaterialColor(Enum.Material.Grass, C(120, 205, 118))
	terrain:SetMaterialColor(Enum.Material.LeafyGrass, C(122, 204, 116))
	terrain:SetMaterialColor(Enum.Material.Sand, C(255, 214, 226)) -- 砂糖の砂（池のまわり）
	terrain.WaterColor = C(255, 150, 200) -- いちごミルクの池
	terrain.WaterReflectance = 0.45
	terrain.WaterTransparency = 0.4
	terrain.WaterWaveSize = 0.08
	terrain.WaterWaveSpeed = 6

	-- 草の地面（上の面が y=0）。
	-- ふさふさの長い草（Grass）は、畑や道や飾りを埋めてしまうので、遊ぶ範囲は短い芝（LeafyGrass）にする。
	-- 遠くの野原と丘だけ長い草にして、景色のリアルさを出す。
	-- 地形は4studのブロック単位。ぎっしり埋めたブロックの表面は、そのブロックの上端より2stud上に描かれる。
	-- そこで y=-4 まではぎっしり、いちばん上の一段(-4〜0)だけ「半分埋め」にして、表面を y=0 にそろえる（実測で確認）。
	terrain:FillBlock(CFrame.new(0, -10, 0), Vector3.new(440, 12, 440), Enum.Material.Grass)
	terrain:FillCylinder(CFrame.new(0, -10, 0), 12, 160, Enum.Material.LeafyGrass)
	local p = pondCenter()
	local region = Region3.new(Vector3.new(-220, -4, -220), Vector3.new(220, 0, 220)):ExpandToGrid(4)
	local cells = region.Size / 4
	local minX = region.CFrame.Position.X - region.Size.X / 2
	local minZ = region.CFrame.Position.Z - region.Size.Z / 2
	local materials, occupancies = {}, {}
	for x = 1, cells.X do
		materials[x], occupancies[x] = { {} }, { {} }
		local wx = minX + (x - 0.5) * 4
		for z = 1, cells.Z do
			local wz = minZ + (z - 0.5) * 4
			local fromPond = Vector2.new(wx - p.X, wz - p.Z).Magnitude
			local material, occupancy
			if fromPond < POND.size then
				material, occupancy = Enum.Material.Air, 0 -- 池のくぼみ
			elseif fromPond < POND.size + 4 then
				material, occupancy = Enum.Material.Sand, 0.5 -- 池のまわりの砂糖の砂
			elseif wx * wx + wz * wz < 160 * 160 then
				material, occupancy = Enum.Material.LeafyGrass, 0.5
			else
				material, occupancy = Enum.Material.Grass, 0.5
			end
			materials[x][1][z] = material
			occupancies[x][1][z] = occupancy
		end
	end
	terrain:WriteVoxels(region, 4, materials, occupancies)

	-- まわりの小さな丘（奥行きと「庭の外にも世界がある」感じ）
	local rng = Random.new(77)
	for i = 1, 12 do
		local angle = (i / 12) * math.pi * 2 + rng:NextNumber(-0.15, 0.15)
		local radius = rng:NextNumber(186, 200)
		local size = rng:NextNumber(18, 28)
		local center = Vector3.new(math.cos(angle) * radius, -size * 0.45, math.sin(angle) * radius)
		terrain:FillBall(center, size, Enum.Material.Grass)
	end

	-- 池の水: くぼみの一段下(-8〜-4)を水にする → 水面は y=-2（地面より少し低い）
	-- 地形は、ぎっしり埋まった場所には水が入らないので、先に空けてから水を入れる
	terrain:FillCylinder(CFrame.new(p.X, -6, p.Z), 4, POND.size, Enum.Material.Air)
	terrain:FillCylinder(CFrame.new(p.X, -6, p.Z), 4, POND.size, Enum.Material.Water)
end

-- ---- 飾り（お菓子の自然） ----

local function lollipop(parent: Instance, position: Vector3, color: Color3, scale: number)
	local height = 9 * scale
	pillar(parent, height, 0.7 * scale, CFrame.new(position + Vector3.new(0, height / 2, 0)), C(255, 250, 245), nil, true)
	local face = CFrame.new(position + Vector3.new(0, height + 2.2 * scale, 0)) * CFrame.Angles(0, math.pi / 2, 0)
	-- つやつやの飴（ガラスの質感）
	deco({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.2 * scale, 6 * scale, 6 * scale), CFrame = face, Color = color, Material = Enum.Material.Glass, Transparency = 0.1 }, parent)
	deco({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.4 * scale, 3.4 * scale, 3.4 * scale), CFrame = face, Color = C(255, 255, 255), Material = Enum.Material.Glass, Transparency = 0.1 }, parent)
	deco({ Shape = Enum.PartType.Cylinder, Size = Vector3.new(1.5 * scale, 1.4 * scale, 1.4 * scale), CFrame = face, Color = color, Material = Enum.Material.Glass, Transparency = 0.1 }, parent)
end

local function cottonTree(parent: Instance, position: Vector3, color: Color3, scale: number)
	local height = 7 * scale
	pillar(parent, height, 1.4 * scale, CFrame.new(position + Vector3.new(0, height / 2, 0)), C(150, 104, 78), Enum.Material.Wood, true)
	local top = position + Vector3.new(0, height + 1.5 * scale, 0)
	-- わたあめの葉っぱ（ふわふわの布の質感）
	ball(parent, 6 * scale, top, color, Enum.Material.Fabric)
	ball(parent, 4.2 * scale, top + Vector3.new(2.6, -0.8, 0.6) * scale, color:Lerp(C(255, 255, 255), 0.25), Enum.Material.Fabric)
	ball(parent, 4.2 * scale, top + Vector3.new(-2.4, -0.6, -0.8) * scale, color:Lerp(C(255, 255, 255), 0.15), Enum.Material.Fabric)
	ball(parent, 3.6 * scale, top + Vector3.new(0.4, 2.2, 0.2) * scale, color:Lerp(C(255, 255, 255), 0.35), Enum.Material.Fabric)
end

local function candyCane(parent: Instance, position: Vector3, scale: number)
	local red, white = C(240, 70, 100), C(255, 252, 248)
	local segment = 1.1 * scale
	for i = 0, 6 do
		pillar(parent, segment, 0.9 * scale, CFrame.new(position + Vector3.new(0, segment * (i + 0.5), 0)), i % 2 == 0 and red or white, nil, i == 0)
	end
	local topY = segment * 7
	-- 曲がった持ち手
	for i = 1, 4 do
		local a = (i / 4) * math.pi
		local offset = Vector3.new((1 - math.cos(a)) * 1.1 * scale, math.sin(a) * 1.1 * scale, 0)
		ball(parent, 0.95 * scale, position + Vector3.new(0, topY, 0) + offset, i % 2 == 0 and red or white)
	end
end

local function gumdrops(parent: Instance, position: Vector3, rng: Random)
	-- 半分うまったグミの粒（つやつや・半透明）
	for i = 1, 3 do
		local d = rng:NextNumber(2.2, 3.4)
		local offset = Vector3.new(rng:NextNumber(-2.5, 2.5), 0, rng:NextNumber(-2.5, 2.5))
		local gum = ball(parent, d, position + offset + Vector3.new(0, d * 0.15, 0), PASTELS[rng:NextInteger(1, #PASTELS)], Enum.Material.Glass)
		gum.Transparency = 0.15
	end
end

local function cupcake(parent: Instance, position: Vector3, color: Color3, scale: number)
	-- カップケーキのきのこ（カップ・クリーム・さくらんぼ）
	pillar(parent, 1.6 * scale, 2.6 * scale, CFrame.new(position + Vector3.new(0, 0.8 * scale, 0)), C(255, 210, 160), Enum.Material.Fabric, true)
	ball(parent, 3.2 * scale, position + Vector3.new(0, 2.2 * scale, 0), color, Enum.Material.SmoothPlastic)
	ball(parent, 2.0 * scale, position + Vector3.new(0, 3.3 * scale, 0), color:Lerp(C(255, 255, 255), 0.4), Enum.Material.SmoothPlastic)
	ball(parent, 0.7 * scale, position + Vector3.new(0, 4.4 * scale, 0), C(230, 50, 80), Enum.Material.Glass)
end

local function flowerPatch(parent: Instance, position: Vector3, rng: Random)
	-- 小さな花畑（花と葉だけ。部品を少なく）
	for _ = 1, 5 do
		local offset = Vector3.new(rng:NextNumber(-3.5, 3.5), 0, rng:NextNumber(-3.5, 3.5))
		local height = rng:NextNumber(0.8, 1.4)
		ball(parent, 0.7, position + offset + Vector3.new(0, 0.25, 0), C(96, 176, 96))
		ball(parent, 0.75, position + offset + Vector3.new(0, height, 0), PASTELS[rng:NextInteger(1, #PASTELS)])
	end
end

-- 庭・広場・池・道 と重ならない場所か
local function isFree(pos: Vector3, taken: { Vector3 }, spacing: number): boolean
	local flat = Vector3.new(pos.X, 0, pos.Z)
	if flat.Magnitude < 26 then
		return false -- 広場とみんなの木
	end
	for i = 1, Config.MaxPlots do
		local a = ((i - 1) / Config.MaxPlots) * math.pi * 2
		local center = Vector3.new(math.cos(a) * PLOT_RADIUS, 0, math.sin(a) * PLOT_RADIUS)
		if (flat - center).Magnitude < 28 then
			return false -- 庭
		end
		-- 広場から庭への道
		local dir = Vector3.new(math.cos(a), 0, math.sin(a))
		local along = flat:Dot(dir)
		-- 庭のうしろの ひみつきち（家）の場所
		if along > PLOT_RADIUS + 14 and along < PLOT_RADIUS + 45 and (flat - dir * along).Magnitude < 20 then
			return false
		end
		if along > 15 and along < PLOT_RADIUS - 16 and (flat - dir * along).Magnitude < 5 then
			return false
		end
	end
	if (flat - pondCenter()).Magnitude < POND.size + 6 then
		return false
	end
	-- ふんすいと たねや のまわり
	if (flat - plazaSpot(FOUNTAIN_ANGLE)).Magnitude < 12 then
		return false
	end
	if (flat - EGG_FOREST).Magnitude < 30 or (flat - TOOL_SHOP).Magnitude < 22 then
		return false
	end
	-- ひろばの道しるべ
	if (flat - Vector3.new(5, 0, 47)).Magnitude < 5 or (flat - Vector3.new(-5, 0, -47)).Magnitude < 5 then
		return false
	end
	for _, other in taken do
		if (flat - other).Magnitude < spacing then
			return false
		end
	end
	return true
end

local function scatter(rng: Random, taken: { Vector3 }, minRadius: number, maxRadius: number, spacing: number): Vector3?
	for _ = 1, 40 do
		local angle = rng:NextNumber(0, math.pi * 2)
		local radius = rng:NextNumber(minRadius, maxRadius)
		local pos = Vector3.new(math.cos(angle) * radius, 0, math.sin(angle) * radius)
		if isFree(pos, taken, spacing) then
			table.insert(taken, pos)
			return pos
		end
	end
	return nil
end

local function buildScenery(parent: Instance)
	-- 中央の広場（つやのある大理石）
	block({
		Name = "Plaza",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.4, 36, 36),
		CFrame = CFrame.new(0, 0.2, 0) * CFrame.Angles(0, 0, math.pi / 2),
		-- 大理石は少し暗く出るので、明るめのピンクにする（画面で確認して調整）
		Color = C(255, 232, 242),
		Material = Enum.Material.Marble,
	}, parent)
	block({
		Name = "PlazaRing",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.5, 12, 12),
		CFrame = CFrame.new(0, 0.25, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = C(255, 190, 220),
		Material = Enum.Material.Marble,
	}, parent)

	-- 広場から各庭へ、クッキーの飛び石の道
	local paths = make("Folder", { Name = "Paths" }, parent)
	for i = 1, Config.MaxPlots do
		local a = ((i - 1) / Config.MaxPlots) * math.pi * 2
		local dir = Vector3.new(math.cos(a), 0, math.sin(a))
		for step = 0, 8 do
			local r = 20 + step * 3.8
			local wobble = (step % 2 == 0) and 0.5 or -0.5
			local side = Vector3.new(-dir.Z, 0, dir.X) * wobble
			deco({
				Name = "Stone",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.3, 3, 3),
				CFrame = CFrame.new(dir * r + side + Vector3.new(0, 0.12, 0)) * CFrame.Angles(0, 0, math.pi / 2),
				Color = COOKIE,
				Material = Enum.Material.Sandstone, -- クッキーのざらざら
			}, paths)
		end
	end

	-- 飾り（毎回同じ配置になる固定シード）
	local rng = Random.new(2026)
	local taken = {}
	local decor = make("Folder", { Name = "Decor" }, parent)
	for _ = 1, 16 do
		local pos = scatter(rng, taken, 96, 150, 13)
		if pos then
			cottonTree(decor, pos, PASTELS[rng:NextInteger(1, #PASTELS)], rng:NextNumber(0.9, 1.4))
		end
	end
	for _ = 1, 16 do
		local pos = scatter(rng, taken, 96, 155, 10)
		if pos then
			lollipop(decor, pos, PASTELS[rng:NextInteger(1, #PASTELS)], rng:NextNumber(0.9, 1.6))
		end
	end
	for _ = 1, 8 do
		local pos = scatter(rng, taken, 96, 150, 10)
		if pos then
			candyCane(decor, pos, rng:NextNumber(1.0, 1.6))
		end
	end
	for _ = 1, 10 do
		local pos = scatter(rng, taken, 90, 150, 9)
		if pos then
			gumdrops(decor, pos, rng)
		end
	end
	for _ = 1, 10 do
		local pos = scatter(rng, taken, 90, 150, 9)
		if pos then
			cupcake(decor, pos, PASTELS[rng:NextInteger(1, #PASTELS)], rng:NextNumber(1.0, 1.5))
		end
	end
	-- 庭と庭のあいだに小さな花畑（内側と外側）
	for i = 1, Config.MaxPlots do
		local a = ((i - 0.5) / Config.MaxPlots) * math.pi * 2
		for _, r in { 38, 88 } do
			local pos = Vector3.new(math.cos(a) * r, 0, math.sin(a) * r)
			if isFree(pos, {}, 0) then
				flowerPatch(decor, pos, rng)
			end
		end
	end

	-- 外周の壁（落下・迷子防止）
	for _, info in {
		{ Vector3.new(0, 10, 210), Vector3.new(420, 20, 2) },
		{ Vector3.new(0, 10, -210), Vector3.new(420, 20, 2) },
		{ Vector3.new(210, 10, 0), Vector3.new(2, 20, 420) },
		{ Vector3.new(-210, 10, 0), Vector3.new(2, 20, 420) },
	} do
		block({ Name = "Wall", Size = info[2], Position = info[1], Transparency = 1, CanCollide = true }, parent)
	end
end

-- ---- 庭（Plot） ----

-- 白い柵。前（広場がわ、-Z）のまん中は入口、うしろ（+Z）のまん中は ひみつきちへの出入り口として あける。
-- ふだんは通り抜けられない。ジャンプすれば乗り越えられる高さ（3stud）にして、横からでも入れる
local function buildFence(model: Model, origin: CFrame, color: Color3)
	local fence = make("Folder", { Name = "Fence" }, model)
	local halfX, halfZ = PLOT_HALF.X, PLOT_HALF.Z
	local postHeight = 2.6
	local function post(x: number, z: number)
		pillar(fence, postHeight, 0.55, origin * CFrame.new(x, 1 + postHeight / 2, z), FENCE)
		ball(fence, 0.75, (origin * CFrame.new(x, 1 + postHeight + 0.2, z)).Position, color) -- パステルの玉
	end
	local function rail(x1: number, z1: number, x2: number, z2: number)
		local a = (origin * CFrame.new(x1, 0, z1)).Position
		local b = (origin * CFrame.new(x2, 0, z2)).Position
		local length = (b - a).Magnitude
		-- 当たり判定は、見えない板1枚にまとめる（横木と柱のすき間に引っかからず、なめらかにぶつかる）
		local wallMid = (a + b) / 2 + Vector3.new(0, 1 + 1.5, 0)
		block({
			Name = "FenceWall",
			Size = Vector3.new(0.4, 3, length),
			CFrame = CFrame.lookAt(wallMid, wallMid + (b - a)),
			Transparency = 1,
			CanCollide = true,
			CanTouch = false,
			CanQuery = false,
		}, fence)
		for _, y in { 1.9, 3.0 } do
			local mid = (a + b) / 2 + Vector3.new(0, y, 0)
			deco({
				Size = Vector3.new(0.25, 0.3, length),
				CFrame = CFrame.lookAt(mid, mid + (b - a)),
				Color = FENCE,
			}, fence)
		end
	end
	-- 柱（6studごと）
	-- 柱は、各辺に だいたい6studごと（はしにも必ず立てる）
	local nx = math.ceil(halfX * 2 / 6)
	for k = 0, nx do
		local x = -halfX + k * (halfX * 2 / nx)
		-- うしろ（+Z）のまん中も あける（ひみつきちへの 出入り口）
		if math.abs(x) > 4 then
			post(x, halfZ)
			post(x, -halfZ)
		end
	end
	local nz = math.ceil(halfZ * 2 / 6)
	for k = 1, nz - 1 do
		local z = -halfZ + k * (halfZ * 2 / nz)
		post(-halfX, z)
		post(halfX, z)
	end
	post(-4, -halfZ)
	post(4, -halfZ)
	post(-4, halfZ)
	post(4, halfZ)
	-- 横木
	rail(-halfX, halfZ, -4, halfZ)
	rail(4, halfZ, halfX, halfZ)
	rail(-halfX, -halfZ, -halfX, halfZ)
	rail(halfX, -halfZ, halfX, halfZ)
	rail(-halfX, -halfZ, -4, -halfZ)
	rail(4, -halfZ, halfX, -halfZ)
end

local function buildPlot(index: number, parent: Instance, onTile: (Player, BasePart) -> ())
	local angle = ((index - 1) / Config.MaxPlots) * math.pi * 2
	local center = Vector3.new(math.cos(angle) * PLOT_RADIUS, 0, math.sin(angle) * PLOT_RADIUS)
	local origin = CFrame.lookAt(center, Vector3.new(0, 0, 0)) -- 中心を向く（-Zが前）
	local accent = PASTELS[(index % #PASTELS) + 1]

	local model = make("Model", { Name = "Plot_" .. index }, parent)
	model:SetAttribute("PlotIndex", index)
	model:SetAttribute("OwnerUserId", 0)

	-- 木の板の床（木目の質感）
	local platform = block({
		Name = "Platform",
		Size = Vector3.new(PLOT_HALF.X * 2, 1, PLOT_HALF.Z * 2),
		CFrame = origin * CFrame.new(0, 0.5, 0),
		Color = WOOD,
		Material = Enum.Material.WoodPlanks,
	}, model)
	model.PrimaryPart = platform
	buildFence(model, origin, accent)

	-- 畑のタイル（4列×3段＝最大12枚）。ふかふかの土＋まわりの木枠
	-- 番号の順番: 1〜6 が まん中の2列（最初から使える）、7〜9 が左の列、10〜12 が右の列（広げると使える）
	local tiles = {}
	for i = 1, Config.PlotMaxTiles do
		local x, z = tileOffset(i)
		block({
			Name = "Bed_" .. i,
			Size = Vector3.new(TILE_SIZE.X + 0.8, 0.5, TILE_SIZE.Z + 0.8),
			CFrame = origin * CFrame.new(x, 1.15, z),
			Color = C(176, 126, 86),
			Material = Enum.Material.Wood,
			CanCollide = false, -- 畑の上を、段差に引っかからずに歩けるように
		}, model)
		local tile = block({
			Name = "Tile_" .. i,
			Size = TILE_SIZE,
			CFrame = origin * CFrame.new(x, 1.0 + TILE_SIZE.Y / 2 + 0.1, z),
			Color = SOIL,
			Material = Enum.Material.Ground,
			CanCollide = false,
		}, model)
		tile:SetAttribute("IsTile", true)
		tile:SetAttribute("TileIndex", i)
		tile:SetAttribute("Ready", false)

		local prompt = make("ProximityPrompt", {
			Name = "Prompt",
			ActionText = "",
			ObjectText = "",
			HoldDuration = 0,
			-- タイルの間隔(9)より短くして、足元のタイルだけが選ばれるようにする
			MaxActivationDistance = 7,
			RequiresLineOfSight = false,
			KeyboardKeyCode = Enum.KeyCode.E,
			Enabled = true,
			-- 見た目はクライアントの小さなボタン（PromptUI）。標準の大きな吹き出しは畑をふさぐため使わない
			Style = Enum.ProximityPromptStyle.Custom,
		}, tile)
		prompt.Triggered:Connect(function(player)
			onTile(player, tile)
		end)
		tiles[i] = tile
	end

	local spawn = make("SpawnLocation", {
		Name = "Spawn",
		Anchored = true,
		Neutral = true,
		CanCollide = false,
		Duration = 0,
		Size = Vector3.new(6, 0.2, 3),
		-- 庭の中（畑の方）を向いて出てくる。入口がわを向くと、畑がカメラのうしろになって「どこに植えるの？」となる
		CFrame = origin * CFrame.new(0, 1.1, -(PLOT_HALF.Z - 2)) * CFrame.Angles(0, math.pi, 0),
		Color = accent,
		Material = Enum.Material.SmoothPlastic,
		Transparency = 0.5,
		TopSurface = Enum.SurfaceType.Smooth,
	}, model)

	-- 庭の名札（木の立て札＋持ち主の名前）
	local signPost = block({
		Name = "SignPost",
		Size = Vector3.new(0.8, 6, 0.8),
		CFrame = origin * CFrame.new(-9, 4, PLOT_HALF.Z - 1.5), -- うしろの まん中は ひみつきちへの通り道なので、左へ
		Color = C(170, 120, 84),
		Material = Enum.Material.Wood,
	}, model)
	-- 大きさは stud 単位（遠くでは小さく見える）。画面の大きさで決めると、スマホでは近くで画面をふさぐため
	local gui = make("BillboardGui", {
		Name = "OwnerLabel",
		Size = UDim2.fromScale(9, 2),
		StudsOffset = Vector3.new(0, 4.2, 0),
		AlwaysOnTop = false,
		MaxDistance = 140,
	}, signPost)
	local label = make("TextLabel", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = C(255, 246, 251),
		TextColor3 = C(74, 43, 92),
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		Text = "",
		Visible = false,
	}, gui)
	make("UITextSizeConstraint", { MaxTextSize = 26 }, label)
	make("UIPadding", { PaddingLeft = UDim.new(0.06, 0), PaddingRight = UDim.new(0.06, 0), PaddingTop = UDim.new(0.12, 0), PaddingBottom = UDim.new(0.12, 0) }, label)
	make("UICorner", { CornerRadius = UDim.new(0, 18) }, label)
	make("UIStroke", { Color = C(255, 111, 168), Thickness = 3 }, label)

	plots[index] = { model = model, tiles = tiles, spawn = spawn, label = label, owner = nil }
end

-- ---- みんなの広場: いちごミルクのふんすい（水くみ）と たねや ----

-- 広場のものを置く CFrame。ひろばの入口から木へ向かう道（x=0 の線）のほうを向く（-Z が道がわ）
local function facingTree(spot: Vector3, y: number): CFrame
	return CFrame.lookAt(spot + Vector3.new(0, y, 0), Vector3.new(0, y, spot.Z))
end

local function addPrompt(parent: Model, at: CFrame, distance: number): ProximityPrompt
	local spot = block({
		Name = "Spot",
		Size = Vector3.new(1, 1, 1),
		CFrame = at,
		Transparency = 1,
		CanCollide = false,
		CanQuery = false,
		CanTouch = false,
	}, parent)
	return make("ProximityPrompt", {
		Name = "Prompt",
		ActionText = "",
		ObjectText = "",
		HoldDuration = 0,
		MaxActivationDistance = distance,
		RequiresLineOfSight = false,
		KeyboardKeyCode = Enum.KeyCode.E,
		Style = Enum.ProximityPromptStyle.Custom, -- 見た目はクライアントの小さなボタン（PromptUI）
	}, spot)
end

-- いちごミルクのふんすい。まわりのどこからでも水をくめる
local function buildFountain()
	local spot = plazaSpot(FOUNTAIN_ANGLE)
	local model = make("Model", { Name = "WaterFountain" }, workspace)
	local base = facingTree(spot, 0)
	-- 石のふち（ジャンプしなくても近づけるよう、低め）
	pillar(model, 1.4, 11, base * CFrame.new(0, 0.7, 0), C(255, 240, 246), Enum.Material.Marble, true)
	-- いちごミルクの水
	deco({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.3, 9.6, 9.6),
		CFrame = base * CFrame.new(0, 1.35, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = C(255, 170, 210),
		Material = Enum.Material.Glass,
		Transparency = 0.15,
	}, model)
	-- まん中の柱と、上の小さなお皿
	pillar(model, 4.2, 1.2, base * CFrame.new(0, 3.2, 0), C(255, 230, 240), Enum.Material.Marble, true)
	pillar(model, 0.6, 4.2, base * CFrame.new(0, 5.3, 0), C(255, 240, 246), Enum.Material.Marble)
	pillar(model, 0.2, 3.6, base * CFrame.new(0, 5.62, 0), C(255, 170, 210), Enum.Material.Glass)
	local top = ball(model, 1.4, (base * CFrame.new(0, 6.3, 0)).Position, C(255, 120, 170), Enum.Material.Glass)
	-- 上から ふき出す しぶき
	local spray = Instance.new("ParticleEmitter")
	spray.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	spray.Color = ColorSequence.new(C(255, 190, 220), C(255, 255, 255))
	spray.Rate = 25
	spray.Speed = NumberRange.new(5, 8)
	spray.SpreadAngle = Vector2.new(25, 25)
	spray.EmissionDirection = Enum.NormalId.Top
	spray.Acceleration = Vector3.new(0, -22, 0)
	spray.Lifetime = NumberRange.new(0.7, 1)
	spray.Size = NumberSequence.new(0.45, 0.15)
	spray.LightEmission = 0.4
	spray.Parent = top
	pumpPrompt = addPrompt(model, base * CFrame.new(0, 3, 0), 11)
end

-- ---- 立て看板 ----

-- 文字はクライアントが、その人の言語で入れる（TextLabel の属性 I18n に、言葉のキーを入れておく）
local function signText(parent: Instance, face: Enum.NormalId, key: string, arrow: string?, arrowFirst: boolean?)
	local gui = make("SurfaceGui", {
		Face = face,
		SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud,
		PixelsPerStud = 40,
		LightInfluence = 0.3,
	}, parent)
	local label = make("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		TextColor3 = C(92, 52, 110),
		Text = "",
	}, gui)
	make("UIPadding", {
		PaddingLeft = UDim.new(0.04, 0),
		PaddingRight = UDim.new(0.04, 0),
		PaddingTop = UDim.new(0.12, 0),
		PaddingBottom = UDim.new(0.12, 0),
	}, label)
	label:SetAttribute("I18n", key)
	if arrow then
		label:SetAttribute("Arrow", arrow)
		label:SetAttribute("ArrowFirst", arrowFirst == true)
	end
	return label
end

-- 矢印の看板（道しるべ）。targets = { { 言葉のキー, 行き先の位置 } }。板は行き先の向きに伸びる
local function signpost(parent: Instance, at: Vector3, targets: { { any } })
	local model = make("Model", { Name = "Signpost" }, parent)
	local height = 4.5 + #targets * 1.5
	pillar(model, height, 0.6, CFrame.new(at + Vector3.new(0, height / 2, 0)), C(170, 120, 90), Enum.Material.Wood, true)
	ball(model, 1, at + Vector3.new(0, height + 0.3, 0), C(255, 150, 190))
	for i, target in targets do
		local dir = (target[2] - at) * Vector3.new(1, 0, 1)
		dir = if dir.Magnitude > 0.01 then dir.Unit else Vector3.xAxis
		local y = height - 1 - (i - 1) * 1.5
		-- 板の +X が行き先。前の面から見ると行き先は左、うしろの面から見ると右
		local board = deco({
			Name = "Board",
			Size = Vector3.new(6.4, 1.2, 0.25),
			CFrame = CFrame.fromMatrix(at + dir * 3 + Vector3.new(0, y, 0), dir, Vector3.yAxis),
			Color = C(255, 236, 200),
			Material = Enum.Material.Wood,
		}, model)
		signText(board, Enum.NormalId.Front, target[1], "←", true)
		signText(board, Enum.NormalId.Back, target[1], "→", false)
	end
	return model
end

-- お店の前の、名前の立て看板（2本の足と板）
local function shopSign(parent: Instance, cf: CFrame, key: string)
	for _, x in { -2.6, 2.6 } do
		pillar(parent, 4, 0.4, cf * CFrame.new(x, 2, 0), C(170, 120, 90), Enum.Material.Wood, true)
	end
	local board = deco({
		Name = "NameBoard",
		Size = Vector3.new(6.6, 2, 0.3),
		CFrame = cf * CFrame.new(0, 4, 0),
		Color = C(255, 236, 200),
		Material = Enum.Material.Wood,
	}, parent)
	signText(board, Enum.NormalId.Front, key)
	signText(board, Enum.NormalId.Back, key)
end

local function sparkles(parent: BasePart, rate: number)
	local sparkle = Instance.new("ParticleEmitter")
	sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	sparkle.Rate = rate
	sparkle.Lifetime = NumberRange.new(0.8, 1.4)
	sparkle.Speed = NumberRange.new(1, 2)
	sparkle.SpreadAngle = Vector2.new(180, 180)
	sparkle.Size = NumberSequence.new(0.5, 0.1)
	sparkle.LightEmission = 0.8
	sparkle.Color = ColorSequence.new(C(255, 240, 160), C(255, 255, 255))
	sparkle.Parent = parent
end

-- 建物にとりつける名前の板（足なし。入口をふさがない）
local function wallSign(parent: Instance, cf: CFrame, key: string)
	local board = deco({
		Name = "NameBoard",
		Size = Vector3.new(9, 2.2, 0.3),
		CFrame = cf,
		Color = C(255, 236, 200),
		Material = Enum.Material.Wood,
	}, parent)
	signText(board, Enum.NormalId.Front, key)
end

-- ---- たまごの森（左）: わたあめの木にかこまれた広場に、大きな たまごの家 ----
local function buildEggForest()
	local model = make("Model", { Name = "EggForest" }, workspace)
	local base = CFrame.lookAt(EGG_FOREST, Vector3.zero) -- -Z が ひろばのほう
	-- 森の地面（こけ色の丸い広場）
	deco({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.3, 40, 40),
		CFrame = base * CFrame.new(0, 0.12, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = C(150, 210, 150),
		Material = Enum.Material.Grass,
	}, model)
	-- まわりの わたあめの木（ひろばがわは あけておく）
	local colors = { C(255, 190, 220), C(200, 180, 255), C(180, 220, 255), C(255, 214, 170) }
	for i = 0, 9 do
		local a = math.rad(70 + i * 22)
		local at = (base * CFrame.new(math.sin(a) * 19, 0, -math.cos(a) * 19)).Position
		cottonTree(model, at, colors[(i % #colors) + 1], 1.1 + (i % 3) * 0.2)
	end
	-- 大きな たまごの家（白に水玉）
	local house = base * CFrame.new(0, 0, 6)
	local shell = block({
		Name = "EggHouse",
		Size = Vector3.new(16, 21, 16),
		CFrame = house * CFrame.new(0, 10.5, 0),
		Color = C(255, 250, 240),
	}, model)
	make("SpecialMesh", { MeshType = Enum.MeshType.Sphere }, shell) -- たて長の たまごの形
	-- 水玉もよう（たまごの表面に）
	for i = 1, 16 do
		local a = i * 2.4
		local y = 3 + (i % 8) * 2.2
		local r = 8 * math.sqrt(math.max(0, 1 - ((y - 10.5) / 10.5) ^ 2))
		ball(model, 1.7, (house * CFrame.new(math.cos(a) * r, y, math.sin(a) * r)).Position, colors[(i % #colors) + 1])
	end
	-- 入口（ひろばがわ）
	deco({
		Size = Vector3.new(4, 6, 1),
		CFrame = house * CFrame.new(0, 3, -7.6),
		Color = C(190, 130, 100),
		Material = Enum.Material.Wood,
	}, model)
	-- 入口の前の、たまごの台（ふつうのたまご・ほしのたまご）
	for i, egg in { { C(255, 245, 220), -5 }, { C(255, 214, 90), 5 } } do
		local at = house * CFrame.new(egg[2], 0, -12)
		pillar(model, 2.4, 2.6, at * CFrame.new(0, 1.2, 0), C(255, 236, 244), Enum.Material.Marble, true)
		local visual=MiscVisuals.build(if i==2 then "egg_staregg" else "egg_candyegg")
		visual:ScaleTo(1.2);visual.WorldPivot=CFrame.identity;visual:PivotTo(at*CFrame.new(0,2.4,0));visual.Parent=model
	end
	-- 名前の立て看板は、入口の横に（入口の前はあけておく）
	shopSign(model, house * CFrame.new(10, 0, -13) * CFrame.Angles(0, math.rad(-20), 0), "place.eggForest")
	addPrompt(model, house * CFrame.new(0, 3, -12), 10)
end

-- ---- どうぐ屋（右）: 木の小屋。屋根の上に大きな じょうろ ----
local function buildToolShop()
	local model = make("Model", { Name = "ToolShop" }, workspace)
	local base = CFrame.lookAt(TOOL_SHOP, Vector3.zero) -- -Z が ひろばのほう
	block({
		Name = "Floor",
		Size = Vector3.new(18, 0.4, 14),
		CFrame = base * CFrame.new(0, 0.2, 0),
		Color = C(214, 168, 120),
		Material = Enum.Material.WoodPlanks,
	}, model)
	-- 小屋（うしろと左右の壁。前は大きく あけたお店）
	local wall = C(255, 228, 196)
	block({ Size = Vector3.new(18, 9, 0.8), CFrame = base * CFrame.new(0, 4.9, 6.6), Color = wall, Material = Enum.Material.WoodPlanks }, model)
	for _, x in { -8.6, 8.6 } do
		block({ Size = Vector3.new(0.8, 9, 14), CFrame = base * CFrame.new(x, 4.9, 0), Color = wall, Material = Enum.Material.WoodPlanks }, model)
	end
	-- 三角屋根（2枚の板）
	for _, side in { -1, 1 } do
		deco({
			Size = Vector3.new(10.6, 0.6, 16),
			CFrame = base * CFrame.new(side * 4.6, 11.4, 0) * CFrame.Angles(0, 0, side * math.rad(-28)),
			Color = C(120, 190, 140),
			CanCollide = true,
		}, model)
	end
	-- カウンター
	block({ Size = Vector3.new(14, 3, 2), CFrame = base * CFrame.new(0, 1.9, -4), Color = C(190, 130, 100), Material = Enum.Material.Wood }, model)
	block({ Size = Vector3.new(14.6, 0.4, 2.6), CFrame = base * CFrame.new(0, 3.6, -4), Color = C(120, 190, 140) }, model)
	-- The shop and guide use the same complete 3D tool models.
	for i,key in {"tool_water","tool_fertilizer","tool_drop"} do
		local visual=MiscVisuals.build(key);visual.WorldPivot=CFrame.identity;visual:PivotTo(base*CFrame.new((i-2)*4,3.85,-4));visual.Parent=model
	end
	-- 屋根の上の大きな じょうろ（遠くからでも分かる目印）
	local can = base * CFrame.new(0, 15.5, 0)
	pillar(model, 3.4, 3.2, can, C(150, 200, 255))
	deco({
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(4, 0.6, 0.6),
		CFrame = can * CFrame.new(2.6, 0.6, 0) * CFrame.Angles(0, 0, math.rad(35)),
		Color = C(150, 200, 255),
	}, model)
	ball(model, 1, (can * CFrame.new(4.2, 1.8, 0)).Position, C(110, 170, 240))
	-- 名前の板は、小屋の正面（屋根の下）に つける
	wallSign(model, base * CFrame.new(0, 10.2, -7.1), "place.toolShop")
	addPrompt(model, base * CFrame.new(0, 3, -5), 10)
end

function World.build(onTile: (Player, BasePart) -> ())
	setupLighting()

	local existing = workspace:FindFirstChild("Baseplate")
	if existing then
		existing:Destroy()
	end
	for _, child in workspace:GetChildren() do
		if child:IsA("SpawnLocation") then
			child:Destroy()
		end
	end

	buildTerrain()
	local scenery = make("Folder", { Name = "Scenery" }, workspace)
	buildScenery(scenery)

	local plotsFolder = make("Folder", { Name = "Plots" }, workspace)
	for i = 1, Config.MaxPlots do
		buildPlot(i, plotsFolder, onTile)
		World.resetLocks(plots[i])
	end

	buildFountain()
	-- 種は 右の 🛒ショップ（ボタン）で 買う。ひろばの 種屋の 建物は 置かない（同じものが 2か所に あると まよう）
	buildEggForest()
	buildToolShop()
	-- ひろばの道しるべ（入口と、反対がわ）
	for _, at in { Vector3.new(5, 0, 47), Vector3.new(-5, 0, -47) } do
		signpost(scenery, at, {
			{ "place.tree", Vector3.zero },
			{ "place.eggForest", EGG_FOREST },
			{ "place.toolShop", TOOL_SHOP },
		})
	end
end

-- 畑1枚を「使える / まだ使えない」にする。まだ使えない畑は見えなくする（広げたときに、ポンと現れる）
local function setLockLook(tile: BasePart, locked: boolean, animate: boolean?)
	local wasLocked = tile:GetAttribute("Locked")
	tile:SetAttribute("Locked", locked)
	tile:SetAttribute("DryColor", SOIL)
	tile:SetAttribute("Watered", false)
	tile:SetAttribute("Fertilized", false)
	tile.Color = SOIL
	tile.Material = Enum.Material.Ground
	local bed = tile.Parent and tile.Parent:FindFirstChild("Bed_" .. tile:GetAttribute("TileIndex"))
	for _, part in { tile, bed } do
		if part then
			part.Transparency = if locked then 1 else 0
		end
	end
	-- 広げた瞬間: 土が下からせり上がって、キラキラが出る
	if animate and wasLocked and not locked then
		local goal = tile.CFrame
		tile.CFrame = goal * CFrame.new(0, -1.2, 0)
		TweenService:Create(tile, TweenInfo.new(0.6, Enum.EasingStyle.Back), { CFrame = goal }):Play()
		local sparkle = Instance.new("ParticleEmitter")
		sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		sparkle.Color = ColorSequence.new(Color3.fromRGB(180, 255, 190), Color3.fromRGB(255, 240, 160))
		sparkle.Speed = NumberRange.new(4, 8)
		sparkle.SpreadAngle = Vector2.new(70, 70)
		sparkle.EmissionDirection = Enum.NormalId.Top
		sparkle.Lifetime = NumberRange.new(0.6, 1)
		sparkle.Size = NumberSequence.new(0.6, 0.1)
		sparkle.LightEmission = 0.7
		sparkle.Rate = 0
		sparkle.Parent = tile
		sparkle:Emit(40)
		task.delay(1.5, function()
			sparkle:Destroy()
		end)
	end
end

-- 使える畑の枚数に合わせて、畑を見せる（animate=true なら、新しく使えるようになった畑がポンと現れる）
function World.setUnlocked(player: Player, count: number, animate: boolean?)
	local plot = World.plotOf(player)
	if not plot then
		return
	end
	for i, tile in plot.tiles do
		setLockLook(tile, i > count, animate)
	end
end

-- 持ち主がいない庭は、最初の枚数に戻す
function World.resetLocks(plot)
	for i, tile in plot.tiles do
		setLockLook(tile, i > Config.PlotTiles)
	end
end

-- 水くみポンプのボタン（Main で、押されたら水をくむ処理につなぐ）
function World.pumpPrompt(): ProximityPrompt
	return pumpPrompt
end

-- 空いている庭を割り当てる。満員ならnil。
function World.claim(player: Player): number?
	for index, plot in plots do
		if plot.owner == nil then
			plot.owner = player
			plot.model:SetAttribute("OwnerUserId", player.UserId)
			plot.label.Text = ("%s"):format(player.DisplayName)
			plot.label.Visible = true
			player:SetAttribute("PlotId", index)
			player.RespawnLocation = plot.spawn
			return index
		end
	end
	return nil
end

function World.release(player: Player)
	for _, plot in plots do
		if plot.owner == player then
			plot.owner = nil
			plot.model:SetAttribute("OwnerUserId", 0)
			plot.label.Visible = false
			for _, tile in plot.tiles do
				tile:SetAttribute("Crop", nil)
				tile:SetAttribute("PlantedAt", nil)
				tile:SetAttribute("GrowTime", nil)
				tile:SetAttribute("Ready", false)
				local visual = tile:FindFirstChild("Plant")
				if visual then
					visual:Destroy()
				end
			end
			World.resetLocks(plot)
		end
	end
end

function World.plotOf(player: Player)
	local index = player:GetAttribute("PlotId")
	return index and plots[index] or nil
end

-- 移動ボタン（Grow a Garden 2 の「庭・売り場・店」へ飛ぶボタンと同じ考え方）
-- dest: "home"=じぶんの庭 / "tree"=みんなの木。行き先はサーバーが決める
function World.teleport(player: Player, dest: string)
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not root then
		return
	end
	local target: CFrame?
	if dest == "home" then
		local plot = World.plotOf(player)
		if plot then
			target = plot.spawn.CFrame * CFrame.new(0, 3.5, 0)
		end
	elseif dest == "tree" then
		-- 広場の入口に降りる。ふんすい と 正面の みんなの木 が見える
		target = CFrame.lookAt(Vector3.new(0, 4, 42), Vector3.new(0, 4, 0))
	end
	if target then
		character:PivotTo(target)
	end
end

-- お店の近くにいるか（そこでしか買えないお店を、サーバーで確かめる）。name = "EggForest" / "ToolShop" など
function World.isNear(player: Player, name: string): boolean
	local model = workspace:FindFirstChild(name)
	local spot = model and model:FindFirstChild("Spot")
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	if not spot or not root then
		return false
	end
	return (root.Position - spot.Position).Magnitude <= Config.ShopReach
end

function World.allPlots()
	return plots
end

return World

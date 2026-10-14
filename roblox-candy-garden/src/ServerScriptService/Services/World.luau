-- お菓子の庭のマップを全てコードで生成する（素材は使わない）。
-- 方針「かわいい形 × リアルな光と質感」（例: あつまれ どうぶつの森）。
--   ・形と色はかわいいまま（明るいパステル、丸い形）
--   ・光・影・空・草・水・木目などの質感はリアルに（地形の草、立体の雲、池の水、木の板）
--   ・スマホでも重くならないよう、部品の数は抑える（飾りは数を決めて、固定の並び）
-- 地面・飾り・ライティング・プレイヤーごとの庭（Plot）を作り、庭の割り当ても担当する。
local Lighting = game:GetService("Lighting")
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

local PLOT_RADIUS = 62
local TILE_SIZE = Vector3.new(7, 0.6, 7)
local POND = { angle = math.rad(22.5), radius = 108, size = 15 } -- 池（庭と庭のあいだの外側）

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
		if (flat - center).Magnitude < 24 then
			return false -- 庭
		end
		-- 広場から庭への道
		local dir = Vector3.new(math.cos(a), 0, math.sin(a))
		local along = flat:Dot(dir)
		if along > 15 and along < 52 and (flat - dir * along).Magnitude < 5 then
			return false
		end
	end
	if (flat - pondCenter()).Magnitude < POND.size + 6 then
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

-- 白い柵。前（広場がわ、-Z）のまん中は入口としてあける
local function buildFence(model: Model, origin: CFrame, color: Color3)
	local fence = make("Folder", { Name = "Fence" }, model)
	local halfX, halfZ = 15, 12
	local postHeight = 2.6
	local function post(x: number, z: number)
		pillar(fence, postHeight, 0.55, origin * CFrame.new(x, 1 + postHeight / 2, z), FENCE, nil, true)
		ball(fence, 0.75, (origin * CFrame.new(x, 1 + postHeight + 0.2, z)).Position, color) -- パステルの玉
	end
	local function rail(x1: number, z1: number, x2: number, z2: number)
		local a = (origin * CFrame.new(x1, 0, z1)).Position
		local b = (origin * CFrame.new(x2, 0, z2)).Position
		local length = (b - a).Magnitude
		for _, y in { 1.9, 3.0 } do
			local mid = (a + b) / 2 + Vector3.new(0, y, 0)
			deco({
				Size = Vector3.new(0.25, 0.3, length),
				CFrame = CFrame.lookAt(mid, mid + (b - a)),
				Color = FENCE,
				CanCollide = true,
			}, fence)
		end
	end
	-- 柱（6studごと）
	for x = -halfX, halfX, 6 do
		post(x, halfZ)
		if math.abs(x) > 4 then
			post(x, -halfZ)
		end
	end
	for z = -halfZ + 6, halfZ - 6, 6 do
		post(-halfX, z)
		post(halfX, z)
	end
	post(-4, -halfZ)
	post(4, -halfZ)
	-- 横木
	rail(-halfX, halfZ, halfX, halfZ)
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
		Size = Vector3.new(30, 1, 24),
		CFrame = origin * CFrame.new(0, 0.5, 0),
		Color = WOOD,
		Material = Enum.Material.WoodPlanks,
	}, model)
	model.PrimaryPart = platform
	buildFence(model, origin, accent)

	-- 畑のタイル（3列×最大2段から開始）。ふかふかの土＋まわりの木枠
	local tiles = {}
	local perRow = 3
	for i = 1, Config.PlotTiles do
		local col = (i - 1) % perRow
		local row = math.floor((i - 1) / perRow)
		local x = (col - 1) * 9
		local z = (row - 0.5) * 9
		block({
			Name = "Bed",
			Size = Vector3.new(TILE_SIZE.X + 0.8, 0.5, TILE_SIZE.Z + 0.8),
			CFrame = origin * CFrame.new(x, 1.15, z),
			Color = C(176, 126, 86),
			Material = Enum.Material.Wood,
		}, model)
		local tile = block({
			Name = "Tile_" .. i,
			Size = TILE_SIZE,
			CFrame = origin * CFrame.new(x, 1.0 + TILE_SIZE.Y / 2 + 0.1, z),
			Color = SOIL,
			Material = Enum.Material.Ground,
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
		Size = Vector3.new(6, 0.2, 6),
		CFrame = origin * CFrame.new(0, 1.1, -9.5),
		Color = accent,
		Material = Enum.Material.SmoothPlastic,
		Transparency = 0.5,
		TopSurface = Enum.SurfaceType.Smooth,
	}, model)

	-- 庭の名札（木の立て札＋持ち主の名前）
	local signPost = block({
		Name = "SignPost",
		Size = Vector3.new(0.8, 6, 0.8),
		CFrame = origin * CFrame.new(0, 4, 11),
		Color = C(170, 120, 84),
		Material = Enum.Material.Wood,
	}, model)
	local gui = make("BillboardGui", {
		Name = "OwnerLabel",
		Size = UDim2.fromOffset(260, 56),
		StudsOffset = Vector3.new(0, 4.2, 0),
		AlwaysOnTop = false,
		MaxDistance = 140,
	}, signPost)
	local label = make("TextLabel", {
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = C(255, 246, 251),
		TextColor3 = C(74, 43, 92),
		Font = Enum.Font.FredokaOne,
		TextSize = 26,
		Text = "",
		Visible = false,
	}, gui)
	make("UICorner", { CornerRadius = UDim.new(0, 18) }, label)
	make("UIStroke", { Color = C(255, 111, 168), Thickness = 3 }, label)

	plots[index] = { model = model, tiles = tiles, spawn = spawn, label = label, owner = nil }
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
	end
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
		target = CFrame.lookAt(Vector3.new(0, 4, 16), Vector3.new(0, 4, 0))
	end
	if target then
		character:PivotTo(target)
	end
end

function World.allPlots()
	return plots
end

return World

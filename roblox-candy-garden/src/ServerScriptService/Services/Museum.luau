-- ペットの はくぶつかん（ひみつきちの へやの おくの とびらから 入る、自分だけの 展示ホール）。
-- 出会った ペットを 台に 飾る。高級な 博物館のように:
--   ・くらい むらさきの かべ・大理石の ゆか・赤い じゅうたん・金の ふち
--   ・かべの 上の 間接照明（天井を てらす）と、1体ずつ 天井から スポットライト
--   ・★8 きせきの ペットは おくの 舞台の ガラスケースに 入れて、左右の 下から ライトで てらす
--   ・まだ 会っていない 子の 台・ケースは 空けておく（かげも 置かない。出てからの 楽しみに。ユーザーの 希望）
-- 参考: あつまれ どうぶつの森の はくぶつかん（暗い 館内に 照明で 展示を うかび上がらせる）、
--       実在の 美術館・宝物館（スポットライト＋間接照明、宝物は ガラスケース）
-- 文字は 絵文字と 数字・★だけ（どの ことばでも 読める。名前は ペットずかんで 見られる）
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local PetVisuals = require(ReplicatedStorage.Shared.PetVisuals)

local Museum = {}

local C = Color3.fromRGB
local W, D, H = 36, 30, 16 -- よこ・おく・天井の高さ
local LIFT = 60 -- へやの 上の どこに置くか（外からも へやからも 見えない 場所）
local GOLD = C(232, 192, 96)
local VELVET = C(70, 36, 72)
local PANEL = C(78, 44, 46)
local FLOOR = C(44, 36, 58)
local CARPET = C(150, 28, 58)
local MARBLE = C(246, 242, 236)
local SPOT = C(255, 240, 215)

local function part(parent: Instance, props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CastShadow = false
	for k, v in props do
		p[k] = v
	end
	p.Parent = parent
	return p
end

local function label(target: BasePart, face: Enum.NormalId, text: string, color: Color3, background: Color3?)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.CanvasSize = Vector2.new(400, 200)
	gui.LightInfluence = 0
	local t = Instance.new("TextLabel")
	t.Size = UDim2.fromScale(1, 1)
	t.BackgroundTransparency = if background then 0 else 1
	t.BackgroundColor3 = background or C(0, 0, 0)
	t.Text = text
	t.TextScaled = true
	t.Font = Enum.Font.FredokaOne
	t.TextColor3 = color
	t.Parent = gui
	gui.Parent = target
	return t
end

-- 天井から 1つの 展示を てらす スポットライト（器具は 天井の 小さな 黒い つつ）
local function spotlight(parent: Instance, origin: CFrame, at: Vector3, brightness: number, color: Color3?)
	local fixture = part(parent, {
		Name = "SpotFixture",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.9, 0.9, 0.9),
		CFrame = origin * CFrame.new(at.X, H - 0.45, at.Z) * CFrame.Angles(0, 0, math.pi / 2),
		Color = C(25, 22, 30),
		Material = Enum.Material.Metal,
	})
	local lens = part(parent, {
		Name = "SpotLens",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.08, 0.7, 0.7),
		CFrame = origin * CFrame.new(at.X, H - 0.92, at.Z) * CFrame.Angles(0, 0, math.pi / 2),
		Color = color or SPOT,
		Material = Enum.Material.Neon,
	})
	local light = Instance.new("SpotLight")
	light.Face = Enum.NormalId.Left -- 横に たおした つつの 下がわ（-Y）
	light.Angle = 34
	light.Range = H + 2
	light.Brightness = brightness
	light.Color = color or SPOT
	light.Shadows = true
	light.Parent = lens
end

-- ---- たてもの（中身が かわっても 作りなおさない） ----
local function buildHall(hall: Model, o: CFrame)
	local floor = part(hall, {
		Name = "Floor",
		Size = Vector3.new(W, 1, D),
		CFrame = o * CFrame.new(0, -0.5, 0),
		Color = FLOOR,
		Material = Enum.Material.Marble,
		Reflectance = 0.12,
		CanCollide = true,
	})
	hall.PrimaryPart = floor
	-- 入口から 舞台まで 赤い じゅうたん（金の ふち）
	part(hall, { Size = Vector3.new(5, 0.06, D - 9), CFrame = o * CFrame.new(0, 0.03, -4.5), Color = CARPET, Material = Enum.Material.Fabric })
	for _, x in { -2.65, 2.65 } do
		part(hall, { Size = Vector3.new(0.3, 0.07, D - 9), CFrame = o * CFrame.new(x, 0.035, -4.5), Color = GOLD, Material = Enum.Material.Metal })
	end
	-- かべ（ベルベット）・天井
	local walls = {
		{ size = Vector3.new(W + 2, H, 1), at = Vector3.new(0, H / 2, D / 2 + 0.5), inward = Vector3.new(0, 0, -1) },
		{ size = Vector3.new(W + 2, H, 1), at = Vector3.new(0, H / 2, -D / 2 - 0.5), inward = Vector3.new(0, 0, 1) },
		{ size = Vector3.new(1, H, D), at = Vector3.new(-W / 2 - 0.5, H / 2, 0), inward = Vector3.new(1, 0, 0) },
		{ size = Vector3.new(1, H, D), at = Vector3.new(W / 2 + 0.5, H / 2, 0), inward = Vector3.new(-1, 0, 0) },
	}
	for _, wall in walls do
		part(hall, { Size = wall.size, CFrame = o * CFrame.new(wall.at), Color = VELVET, Material = Enum.Material.Fabric, CanCollide = true })
		-- こしかべ（木の パネル）と 金の ライン、天井ちかくの 金の ふち
		local alongX = wall.size.X > wall.size.Z
		local length = if alongX then W else D
		local function strip(y: number, height: number, thick: number, color: Color3, material: Enum.Material)
			local offset = wall.inward * (0.5 + thick / 2)
			local size = if alongX then Vector3.new(length, height, thick) else Vector3.new(thick, height, length)
			return part(hall, { Size = size, CFrame = o * CFrame.new(Vector3.new(wall.at.X, y, wall.at.Z) + offset), Color = color, Material = material })
		end
		strip(1.6, 3.2, 0.25, PANEL, Enum.Material.Wood)
		strip(3.25, 0.18, 0.35, GOLD, Enum.Material.Metal)
		strip(H - 0.3, 0.3, 0.3, GOLD, Enum.Material.Metal)
		-- 間接照明: かべの 上の たな（コーブ）に かくした 光の すじが、天井を あたたかく てらす
		strip(H - 2.6, 0.25, 1.0, C(40, 24, 42), Enum.Material.SmoothPlastic)
		local glow = strip(H - 2.4, 0.12, 0.25, C(255, 196, 140), Enum.Material.Neon)
		glow.Transparency = 0.15
		local wash = Instance.new("SurfaceLight")
		wash.Face = Enum.NormalId.Top
		wash.Angle = 120
		wash.Range = 8
		wash.Brightness = 1.4
		wash.Color = C(255, 196, 150)
		wash.Parent = glow
		-- ゆかの きわの ほのかな 光（足もとの 間接照明）
		local foot = strip(0.08, 0.06, 0.15, C(255, 150, 200), Enum.Material.Neon)
		foot.Transparency = 0.35
	end
	part(hall, { Name = "Ceiling", Size = Vector3.new(W + 2, 1, D + 2), CFrame = o * CFrame.new(0, H + 0.5, 0), Color = C(34, 26, 44), CanCollide = true })
	-- おくの 舞台（★8 の ガラスケースを のせる）
	local stage = o * CFrame.new(0, 0, D / 2 - 7.5)
	part(hall, { Name = "Stage", Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.8, 15, 15), CFrame = stage * CFrame.new(0, 0.4, 0) * CFrame.Angles(0, 0, math.pi / 2), Color = MARBLE, Material = Enum.Material.Marble, CanCollide = true })
	part(hall, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.2, 15.4, 15.4), CFrame = stage * CFrame.new(0, 0.7, 0) * CFrame.Angles(0, 0, math.pi / 2), Color = GOLD, Material = Enum.Material.Metal })
	-- 出口の とびら（入口がわ）。金の わく
	part(hall, { Name = "ExitDoor", Size = Vector3.new(4, 7, 0.4), CFrame = o * CFrame.new(0, 3.5, -D / 2 + 0.2), Color = C(70, 40, 30), Material = Enum.Material.Wood })
	part(hall, { Size = Vector3.new(4.8, 0.4, 0.5), CFrame = o * CFrame.new(0, 7.2, -D / 2 + 0.25), Color = GOLD, Material = Enum.Material.Metal })
	for _, x in { -2.2, 2.2 } do
		part(hall, { Size = Vector3.new(0.4, 7.2, 0.5), CFrame = o * CFrame.new(x, 3.6, -D / 2 + 0.25), Color = GOLD, Material = Enum.Material.Metal })
	end
	part(hall, { Name = "ExitMat", Size = Vector3.new(4, 0.1, 2.4), CFrame = o * CFrame.new(0, 0.05, -D / 2 + 1.4), Color = GOLD, Transparency = 0.4 })
end

-- ---- 展示（出会った ペットが ふえたら 作りなおす） ----
local function collectionKey(d): string
	local best = {}
	for _, entry in d.pets or {} do
		best[entry.pet] = math.max(best[entry.pet] or 0, entry.tier or 0)
	end
	local out = {}
	for _, cfg in Config.Pets do
		table.insert(out, if (d.dex or {})[cfg.id] then tostring(best[cfg.id] or 0) else "x")
	end
	return table.concat(out, ",")
end

-- ペットを cf の 上に、背の高さ height で のせる（足が cf の 高さに つく）
local function placePet(model: Model, cf: CFrame, height: number)
	local _, bounds = model:GetBoundingBox()
	model:ScaleTo(model:GetScale() * (height / bounds.Y))
	model:PivotTo(cf)
	local box, size = model:GetBoundingBox()
	model:PivotTo(model:GetPivot() + Vector3.new(0, cf.Position.Y - (box.Position.Y - size.Y / 2), 0))
	return size
end

-- 飾る ペット（会った 子だけ。まだの子は 何も 置かない。出てからの 楽しみに）
local function petModel(cfg, tier: number?): Model?
	local model = PetVisuals.create(cfg, 2)
	if not model then
		return nil
	end
	PetVisuals.applyTier(model, tier)
	for _, object in model:GetDescendants() do
		-- 照明は スポットライトに まかせる（明かりが かさなると まっしろに なる）。
		-- ★8 の 足もとから のぼる 光の 粒も、ケースの 中では うるさいので 出さない
		if object:IsA("Light") or object.Name == "MiracleStars" then
			object:Destroy()
		end
	end
	return model
end

-- ケースの 左右の 下から ペットを 見上げて てらす 小さな ライト（美術館の アップライト）
local function uplight(parent: Instance, from: Vector3, target: Vector3)
	local body = part(parent, {
		Name = "Uplight",
		Size = Vector3.new(0.5, 0.5, 0.7),
		CFrame = CFrame.lookAt(from, target),
		Color = C(25, 22, 30),
		Material = Enum.Material.Metal,
	})
	local lens = part(parent, {
		Name = "UplightLens",
		Size = Vector3.new(0.38, 0.38, 0.06),
		CFrame = CFrame.lookAt(from, target) * CFrame.new(0, 0, -0.36),
		Color = SPOT,
		Material = Enum.Material.Neon,
	})
	local light = Instance.new("SpotLight")
	light.Face = Enum.NormalId.Front -- ペットの ほう（-Z）
	light.Angle = 45
	light.Range = 9
	light.Brightness = 3.5
	light.Color = SPOT
	light.Shadows = false
	light.Parent = lens
	return body
end

-- 台の 前の 小さな ふだ（絵文字と ★の数）
local function plaque(parent: Instance, cf: CFrame, cfg)
	local p = part(parent, { Name = "Plaque", Size = Vector3.new(2, 1, 0.12), CFrame = cf, Color = C(30, 22, 34), Material = Enum.Material.Metal })
	-- 上に 絵文字、下に ★の数（小さく ならないよう 2つに 分ける）
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.CanvasSize = Vector2.new(400, 200)
	gui.LightInfluence = 0
	for _, row in { { text = cfg.icon, y = 0.04, h = 0.56 }, { text = string.rep("★", cfg.rarity), y = 0.62, h = 0.32 } } do
		local t = Instance.new("TextLabel")
		t.Position = UDim2.fromScale(0.05, row.y)
		t.Size = UDim2.fromScale(0.9, row.h)
		t.BackgroundTransparency = 1
		t.Text = row.text
		t.TextScaled = true
		t.Font = Enum.Font.FredokaOne
		t.TextColor3 = GOLD
		t.Parent = gui
	end
	gui.Parent = p
end

local function placeDisplays(museum: Model, d)
	local key = collectionKey(d)
	if museum:GetAttribute("CollectionKey") == key and museum:FindFirstChild("Displays") then
		return
	end
	local old = museum:FindFirstChild("Displays")
	if old then
		old:Destroy()
	end
	museum:SetAttribute("CollectionKey", key)
	local o = museum:GetPivot() * CFrame.new(0, 0.5, 0)
	local folder = Instance.new("Folder")
	folder.Name = "Displays"
	local best = {}
	for _, entry in d.pets or {} do
		best[entry.pet] = math.max(best[entry.pet] or 0, entry.tier or 0)
	end
	local dex = d.dex or {}
	local regular, miracle = {}, {}
	for _, cfg in Config.Pets do
		table.insert(if cfg.fusionOnly then miracle else regular, cfg)
	end
	table.sort(regular, function(a, b)
		if a.rarity ~= b.rarity then
			return a.rarity < b.rarity
		end
		return table.find(Config.Pets, a) < table.find(Config.Pets, b)
	end)
	local found = 0
	-- 左右の かべぞいに 大理石の 台。入口に 近い ほうから ★の 少ない 順
	local perSide = math.ceil(#regular / 2)
	for i, cfg in regular do
		local side = if i <= perSide then -1 else 1
		local index = if i <= perSide then i else i - perSide
		local z = -D / 2 + 7 + (index - 1) * ((D - 17) / math.max(1, perSide - 1))
		local x = side * (W / 2 - 3.4)
		local have = dex[cfg.id] == true
		if have then
			found += 1
		end
		local base = o * CFrame.new(x, 0, z)
		part(folder, { Size = Vector3.new(2.8, 0.35, 2.8), CFrame = base * CFrame.new(0, 0.175, 0), Color = GOLD, Material = Enum.Material.Metal })
		part(folder, { Size = Vector3.new(2.3, 2.4, 2.3), CFrame = base * CFrame.new(0, 1.55, 0), Color = MARBLE, Material = Enum.Material.Marble, CanCollide = true })
		part(folder, { Size = Vector3.new(2.6, 0.2, 2.6), CFrame = base * CFrame.new(0, 2.85, 0), Color = GOLD, Material = Enum.Material.Metal })
		-- へやの まん中を 向く（ペットの 前は -Z）
		local facing = CFrame.Angles(0, if side < 0 then -math.pi / 2 else math.pi / 2, 0)
		-- まだ 会っていない 子の 台は 空けておく（あかりも つけない）
		local model = have and petModel(cfg, best[cfg.id])
		if model then
			placePet(model, base * CFrame.new(0, 2.95, 0) * facing, 2.6 * (cfg.scale or 1))
			model.Parent = folder
			plaque(folder, base * facing * CFrame.new(0, 1.4, -1.22) * CFrame.Angles(math.rad(-20), 0, 0), cfg)
			spotlight(folder, o, Vector3.new(x, 0, z), 3.2)
		end
	end
	-- ★8 は おくの 舞台の ガラスケース
	local stage = o * CFrame.new(0, 0.8, D / 2 - 7.5)
	for i, cfg in miracle do
		local x = (i - (#miracle + 1) / 2) * 4.6
		local base = stage * CFrame.new(x, 0, if i == math.ceil(#miracle / 2) then 1 else 0)
		local have = dex[cfg.id] == true
		if have then
			found += 1
		end
		part(folder, { Size = Vector3.new(2.7, 1.4, 2.7), CFrame = base * CFrame.new(0, 0.7, 0), Color = MARBLE, Material = Enum.Material.Marble, CanCollide = true })
		part(folder, { Size = Vector3.new(3, 0.2, 3), CFrame = base * CFrame.new(0, 1.5, 0), Color = GOLD, Material = Enum.Material.Metal })
		-- ガラスと 金の わく
		part(folder, { Name = "CaseGlass", Size = Vector3.new(2.7, 4.6, 2.7), CFrame = base * CFrame.new(0, 3.9, 0), Color = C(210, 230, 255), Material = Enum.Material.Glass, Transparency = 0.82, CanCollide = true })
		for _, cx in { -1.35, 1.35 } do
			for _, cz in { -1.35, 1.35 } do
				part(folder, { Size = Vector3.new(0.16, 4.6, 0.16), CFrame = base * CFrame.new(cx, 3.9, cz), Color = GOLD, Material = Enum.Material.Metal })
			end
		end
		part(folder, { Size = Vector3.new(3, 0.3, 3), CFrame = base * CFrame.new(0, 6.35, 0), Color = GOLD, Material = Enum.Material.Metal })
		local model = have and petModel(cfg, best[cfg.id])
		if model then
			placePet(model, base * CFrame.new(0, 1.6, 0), 3.4)
			model.Parent = folder
			plaque(folder, base * CFrame.new(0, 1.1, -1.42) * CFrame.Angles(math.rad(-20), 0, 0), cfg)
			-- 左右の 前・下から、ケースの 中の ペットを 見上げて てらす
			local target = (base * CFrame.new(0, 3.2, 0)).Position
			for _, sx in { -1, 1 } do
				uplight(folder, (base * CFrame.new(sx * 2.1, 0.3, -2.1)).Position, target)
			end
		end
	end
	-- おくの かべの 金の かんばん「🐾 集めた数 / ぜんぶ」
	local sign = part(folder, { Name = "CollectionSign", Size = Vector3.new(9, 2.2, 0.2), CFrame = o * CFrame.new(0, 10.5, D / 2 - 0.15), Color = C(30, 22, 34), Material = Enum.Material.Metal })
	label(sign, Enum.NormalId.Front, ("🐾 %d / %d"):format(found, #Config.Pets), GOLD)
	spotlight(folder, o, Vector3.new(0, 0, D / 2 - 2.5), 1.5)
	folder.Parent = museum
end

-- へや（Room.build が 作った もの）に あわせて はくぶつかんを 作る
function Museum.build(room: Model, d, parent: Instance): Model
	local museum = Instance.new("Model")
	museum.Name = "Museum"
	museum:SetAttribute("Width", W)
	museum:SetAttribute("Depth", D)
	local o = room:GetPivot() * CFrame.new(0, LIFT + 0.5, 0)
	buildHall(museum, o)
	museum.Parent = parent
	if d then
		placeDisplays(museum, d)
	end
	return museum
end

-- 中身が かわったら 展示を 作りなおす（同じなら 何もしない）
function Museum.refresh(museum: Model?, d)
	if museum and d then
		placeDisplays(museum, d)
	end
end

-- 入ったときに 立つ 場所（入口の 少し 中で、おくの 舞台を 向く）
function Museum.spawnCFrame(museum: Model): CFrame
	return museum:GetPivot() * CFrame.new(0, 3.5, -D / 2 + 5) * CFrame.Angles(0, math.pi, 0)
end

return Museum

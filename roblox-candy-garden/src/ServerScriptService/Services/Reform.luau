-- おにわリフォーム（Config.Reform）: 柵・名札・ゆか を豪華にする / 庭のうしろに じぶんだけの「ひみつきち」を建てる。
-- 畑を広げきったあとの、大きなコインの使い道。どれも ほかの人に見える（見せたくなる＝続ける理由になる）。
-- 参考: あつまれ どうぶつの森（家を段階的に大きくする長い目標）/ Adopt Me!（家を豪華にして友だちに見せる）。
-- 庭は ほかの人も使い回すので、見た目は「もとの形を覚えておいて 塗り替える」→ 帰ったら もとにもどす
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)
local RateLimit = require(script.Parent.RateLimit)
local Room = require(script.Parent.Room)
local Funnel = require(script.Parent.Funnel)

local Reform = {}
Reform.onChanged = nil :: ((Player) -> ())? -- 段が上がったとき（名札のランクを直す。Decor がつなぐ）

local C = Color3.fromRGB
local BASE_FRONT = 18 -- ひみつきちの 前のかべの位置（庭の床の中心から。+Z が庭のうしろ＝外がわ）。柵（16.5）の すぐうしろ。とびらは 柵の出入り口の まん前

-- ---- 部品づくり ----
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

local function wedge(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?)
	local w = Instance.new("WedgePart")
	w.Anchored = true
	w.CanCollide = false
	w.CanTouch = false
	w.CanQuery = false
	w.Size = size
	w.CFrame = cf
	w.Color = color
	w.Material = material or Enum.Material.SmoothPlastic
	w.TopSurface = Enum.SurfaceType.Smooth
	w.BottomSurface = Enum.SurfaceType.Smooth
	w.Parent = parent
	return w
end

local function ball(parent: Instance, d: number, pos: Vector3, color: Color3, material: Enum.Material?)
	return part(parent, { Shape = Enum.PartType.Ball, Size = Vector3.one * d, Position = pos, Color = color, Material = material or Enum.Material.SmoothPlastic })
end

-- 軸が縦の円柱（足元 y から高さ h）
local function pillar(parent: Instance, h: number, d: number, pos: Vector3, color: Color3, material: Enum.Material?, collide: boolean?)
	return part(parent, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(h, d, d),
		CFrame = CFrame.new(pos + Vector3.new(0, h / 2, 0)) * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
		CanCollide = collide or false,
	})
end

local function box(parent: Instance, size: Vector3, pos: Vector3, color: Color3, material: Enum.Material?, collide: boolean?)
	return part(parent, { Size = size, Position = pos, Color = color, Material = material or Enum.Material.SmoothPlastic, CanCollide = collide or false })
end

-- 切妻の屋根（棟は X 方向）。y = 屋根の下の高さ
local function roof(parent: Instance, width: number, depth: number, height: number, y: number, color: Color3)
	wedge(parent, Vector3.new(width, height, depth / 2), CFrame.new(0, y + height / 2, -depth / 4), color)
	wedge(parent, Vector3.new(width, height, depth / 2), CFrame.new(0, y + height / 2, depth / 4) * CFrame.Angles(0, math.pi, 0), color)
end

local function window(parent: Instance, pos: Vector3, size: Vector2?)
	local s = size or Vector2.new(1.4, 1.4)
	box(parent, Vector3.new(s.X + 0.3, s.Y + 0.3, 0.2), pos + Vector3.new(0, 0, 0.05), C(255, 255, 255))
	box(parent, Vector3.new(s.X, s.Y, 0.2), pos, C(255, 236, 160), Enum.Material.Neon) -- 夜も あかりがついて見える
end


-- 入口の上の かざり（リボン）。名前は 畑の名札にあるので、ここには出さない（名前を1か所にする）
local function ribbon(parent: Instance, pos: Vector3)
	local pink = C(255, 120, 175)
	local function loop(x: number, tilt: number)
		part(parent, {
			Shape = Enum.PartType.Ball,
			Size = Vector3.new(1.3, 0.9, 0.45),
			CFrame = CFrame.new(pos + Vector3.new(x, 0.05, 0)) * CFrame.Angles(0, 0, tilt),
			Color = pink,
		})
	end
	loop(-0.75, math.rad(15))
	loop(0.75, math.rad(-15))
	for _, side in { -1, 1 } do -- たれている 2本
		part(parent, {
			Size = Vector3.new(0.35, 1, 0.2),
			CFrame = CFrame.new(pos + Vector3.new(side * 0.35, -0.6, 0)) * CFrame.Angles(0, 0, math.rad(side * 20)),
			Color = pink,
		})
	end
	ball(parent, 0.6, pos, C(255, 200, 225)) -- まん中の むすびめ
end

-- ---- ひみつきち（外から見た家）。床の まん中が原点。前（-Z）が庭のほう ----
-- 段ごとに 大きさ（よこ w・おく d・かべの高さ h）と 見た目が変わる。
-- 中には入れない（とびらは しまっている）。持ち主が とびらの前に来ると、画面が切りかわって へや（別の場所）に入る（Room）
local DOOR_W, DOOR_H = 5, 6.5
local HOUSES = {
	{ w = 14, d = 12, h = 7, wall = C(255, 240, 246), trim = C(255, 150, 190), floor = C(245, 225, 205) }, -- テント
	{ w = 16, d = 14, h = 8, wall = C(255, 175, 205), trim = C(255, 250, 252), floor = C(240, 220, 210) }, -- カップケーキのこや
	{ w = 20, d = 18, h = 9, wall = C(255, 236, 200), trim = C(140, 85, 60), floor = C(214, 168, 120) }, -- キャンディのおうち
	{ w = 22, d = 20, h = 12, wall = C(255, 214, 230), trim = C(255, 120, 170), floor = C(230, 200, 160) }, -- 2かいだて
	{ w = 26, d = 22, h = 13, wall = C(255, 228, 240), trim = C(190, 150, 255), floor = C(245, 215, 235) }, -- パレス
}

local function roofPart(p: BasePart): BasePart
	p:SetAttribute("Roof", true)
	return p
end

-- 屋根（段ごと）。どれも かべの上（y = h）に のせる
local ROOFS = {}

ROOFS[1] = function(m, w, d, h) -- しましまの テント屋根
	local stripes = { C(255, 150, 190), C(255, 255, 255) }
	local n = 6
	for i = 1, n do
		local z = -d / 2 - 1 + (i - 0.5) * ((d + 2) / n)
		local color = stripes[(i % 2) + 1]
		roofPart(wedge(m, Vector3.new((d + 2) / n, 5, w / 2 + 1), CFrame.new(-(w / 2 + 1) / 2, h + 2.5, z) * CFrame.Angles(0, math.pi / 2, 0), color))
		roofPart(wedge(m, Vector3.new((d + 2) / n, 5, w / 2 + 1), CFrame.new((w / 2 + 1) / 2, h + 2.5, z) * CFrame.Angles(0, -math.pi / 2, 0), color))
	end
	roofPart(pillar(m, 2, 0.2, Vector3.new(0, h + 5, 0), C(255, 255, 255)))
	roofPart(box(m, Vector3.new(0.1, 1, 1.4), Vector3.new(0, h + 6.4, 0.7), C(255, 210, 90))) -- はた
end

ROOFS[2] = function(m, w, d, h) -- クリームの まるい屋根＋さくらんぼ
	local dome = roofPart(part(m, { Size = Vector3.new(w + 3, 7, d + 3), Position = Vector3.new(0, h + 1, 0), Color = C(255, 250, 252) }))
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = dome
	roofPart(ball(m, 2, Vector3.new(0, h + 5, 0), C(230, 40, 70)))
	for i = 1, 10 do
		local a = i * math.pi / 5
		roofPart(ball(m, 0.6, Vector3.new(math.cos(a) * (w / 2 + 0.5), h + 1.6, math.sin(a) * (d / 2 + 0.5)), if i % 2 == 0 then C(120, 200, 255) else C(255, 220, 100), Enum.Material.Neon))
	end
end

ROOFS[3] = function(m, w, d, h) -- チョコの屋根＋クリームのふち＋キャンディケインの えんとつ
	local roofH = 5
	roofPart(wedge(m, Vector3.new(w + 3, roofH, d / 2 + 1.5), CFrame.new(0, h + roofH / 2, -(d / 2 + 1.5) / 2), C(140, 85, 60)))
	roofPart(wedge(m, Vector3.new(w + 3, roofH, d / 2 + 1.5), CFrame.new(0, h + roofH / 2, (d / 2 + 1.5) / 2) * CFrame.Angles(0, math.pi, 0), C(140, 85, 60)))
	for x = -w / 2, w / 2, 2 do
		roofPart(ball(m, 1, Vector3.new(x, h + 0.2, -d / 2 - 1.4), C(255, 250, 252)))
	end
	roofPart(pillar(m, 4, 1.2, Vector3.new(w / 4, h + 2, d / 4), C(255, 255, 255)))
	roofPart(pillar(m, 0.7, 1.3, Vector3.new(w / 4, h + 3, d / 4), C(230, 50, 70)))
	roofPart(pillar(m, 0.7, 1.3, Vector3.new(w / 4, h + 4.6, d / 4), C(230, 50, 70)))
end

ROOFS[4] = function(m, w, d, h) -- ピンクの屋根（2かいだて。かべの まん中に 2かいの線と まど）
	local roofH = 6
	roofPart(wedge(m, Vector3.new(w + 3, roofH, d / 2 + 1.5), CFrame.new(0, h + roofH / 2, -(d / 2 + 1.5) / 2), C(255, 120, 170)))
	roofPart(wedge(m, Vector3.new(w + 3, roofH, d / 2 + 1.5), CFrame.new(0, h + roofH / 2, (d / 2 + 1.5) / 2) * CFrame.Angles(0, math.pi, 0), C(255, 120, 170)))
end

ROOFS[5] = function(m, w, d, h) -- パレス: たいらな屋根の上に まるい塔と 星
	roofPart(box(m, Vector3.new(w + 2.6, 1, d + 2.6), Vector3.new(0, h + 0.5, 0), C(255, 214, 236), Enum.Material.Marble))
	roofPart(pillar(m, 6, 6, Vector3.new(0, h + 1, 0), C(245, 225, 255), Enum.Material.Marble))
	roofPart(ball(m, 6.6, Vector3.new(0, h + 8, 0), C(255, 130, 190)))
	local star = roofPart(ball(m, 1.6, Vector3.new(0, h + 12, 0), C(255, 240, 150), Enum.Material.Neon))
	local sparkle = Instance.new("ParticleEmitter")
	sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	sparkle.Color = ColorSequence.new(C(255, 240, 170), C(200, 180, 255))
	sparkle.Rate = 3
	sparkle.Lifetime = NumberRange.new(1, 1.6)
	sparkle.Speed = NumberRange.new(1, 2)
	sparkle.SpreadAngle = Vector2.new(180, 180)
	sparkle.Size = NumberSequence.new(0.5, 0)
	sparkle.LightEmission = 0.8
	sparkle.Parent = star
end

-- 段ごとの 外の かざり（屋根いがい。中に入っても 消さない）
local EXTRAS = {}
EXTRAS[4] = function(m, w, d, h)
	-- 2かいの線（白い帯）と 上のまど
	box(m, Vector3.new(w + 2.2, 0.5, d + 2.2), Vector3.new(0, h / 2 + 0.5, 0), C(255, 255, 255))
	for _, x in { -w / 4, w / 4 } do
		window(m, Vector3.new(x, h * 0.75, -d / 2 - 1.05), Vector2.new(2, 2))
	end
	for _, x in { -w / 2 - 3, w / 2 + 3 } do -- ペロペロキャンディの あかり
		pillar(m, 5, 0.35, Vector3.new(x, 0, -d / 2 - 1), C(255, 255, 255))
		ball(m, 1.5, Vector3.new(x, 5.7, -d / 2 - 1), C(255, 200, 230), Enum.Material.Neon)
	end
end
EXTRAS[5] = function(m, w, d, h)
	-- 4すみの 塔
	for _, x in { -w / 2 - 1, w / 2 + 1 } do
		for _, z in { -d / 2 - 1, d / 2 + 1 } do
			pillar(m, h + 4, 3, Vector3.new(x, 0, z), C(255, 200, 225), Enum.Material.Marble, true)
			ball(m, 3.4, Vector3.new(x, h + 5, z), C(190, 150, 255))
			ball(m, 0.9, Vector3.new(x, h + 7, z), C(255, 236, 150), Enum.Material.Neon)
		end
	end
	-- にじの かいだん（入口の前）
	local rainbow = { C(255, 110, 140), C(255, 180, 100), C(255, 235, 120), C(140, 225, 160), C(130, 190, 255) }
	for i, c in rainbow do
		box(m, Vector3.new(DOOR_W + 1, 0.12, 0.8), Vector3.new(0, 0.06, -d / 2 - 1.5 - (i - 1) * 0.8), c, Enum.Material.Neon)
	end
end

-- 家を作る（足元＝地面の高さ）。返す: Model, 中の広さ（w, d）
local function buildHouse(level: number): (Model, number, number)
	local look = HOUSES[math.clamp(level, 1, #HOUSES)]
	local w, d, h = look.w, look.d, look.h
	local m = Instance.new("Model")
	m.Name = "SecretBase"
	local marble = if level == 5 then Enum.Material.Marble else Enum.Material.SmoothPlastic
	-- ゆか（中）
	-- かべの 外の 面と そろうと ちらちら するので、少しだけ 外に 出す（家の 土台）
	part(m, { Name = "Floor", Size = Vector3.new(w + 2.3, 0.6, d + 2.3), Position = Vector3.new(0, 0.3, 0), Color = look.floor, Material = if level == 3 or level == 4 then Enum.Material.WoodPlanks else Enum.Material.SmoothPlastic, CanCollide = true })
	-- かべ（ぶつかる）。前のかべは まん中を とびらの分 あける
	local function wall(size: Vector3, pos: Vector3)
		part(m, { Size = size, Position = pos, Color = look.wall, Material = marble, CanCollide = true })
	end
	wall(Vector3.new(w + 2, h, 1), Vector3.new(0, h / 2, d / 2 + 0.5))
	wall(Vector3.new(1, h, d), Vector3.new(-w / 2 - 0.5, h / 2, 0))
	wall(Vector3.new(1, h, d), Vector3.new(w / 2 + 0.5, h / 2, 0))
	local side = (w + 2 - DOOR_W) / 2
	wall(Vector3.new(side, h, 1), Vector3.new(-(DOOR_W / 2 + side / 2), h / 2, -d / 2 - 0.5))
	wall(Vector3.new(side, h, 1), Vector3.new(DOOR_W / 2 + side / 2, h / 2, -d / 2 - 0.5))
	wall(Vector3.new(DOOR_W, h - DOOR_H, 1), Vector3.new(0, DOOR_H + (h - DOOR_H) / 2, -d / 2 - 0.5))
	-- とびら（ふだんは しまっている。持ち主の画面でだけ あく）
	part(m, { Name = "Door", Size = Vector3.new(DOOR_W, DOOR_H, 0.4), Position = Vector3.new(0, DOOR_H / 2, -d / 2 - 0.5), Color = look.trim, Material = Enum.Material.Wood, CanCollide = true })
	-- かべの ふち（外の 角と 上）
	for _, x in { -w / 2 - 1, w / 2 + 1 } do
		for _, z in { -d / 2 - 1, d / 2 + 1 } do
			part(m, { Size = Vector3.new(0.6, h, 0.6), Position = Vector3.new(x, h / 2, z), Color = look.trim })
		end
	end
	-- まど（左右のかべ。外からは 中が見えない くもりガラス）
	for _, x in { -w / 2 - 0.5, w / 2 + 0.5 } do
		for _, z in { -d / 4, d / 4 } do
			part(m, { Size = Vector3.new(1.3, 3.6, 4), Position = Vector3.new(x, h / 2 + 0.5, z), Color = look.trim })
			part(m, { Size = Vector3.new(1.4, 3, 3.4), Position = Vector3.new(x, h / 2 + 0.5, z), Color = C(200, 230, 255), Material = Enum.Material.Glass })
		end
	end
	ROOFS[math.clamp(level, 1, #ROOFS)](m, w, d, h)
	local extra = EXTRAS[level]
	if extra then
		extra(m, w, d, h)
	end
	-- とびらの上の リボン
	ribbon(m, Vector3.new(0, DOOR_H + 0.9, -d / 2 - 1.2))
	m:SetAttribute("Width", w)
	m:SetAttribute("Depth", d)
	return m, w, d
end

-- ---- 柵・名札・ゆか の塗り替え ----
-- もとの見た目を属性に覚えておく（帰ったら もどす）
local function remember(p: BasePart)
	if p:GetAttribute("OrigColor") == nil then
		p:SetAttribute("OrigColor", p.Color)
		p:SetAttribute("OrigMaterial", p.Material.Name)
		p:SetAttribute("OrigSize", p.Size)
		p:SetAttribute("OrigReflectance", p.Reflectance)
	end
end

local function restore(p: BasePart)
	if p:GetAttribute("OrigColor") ~= nil then
		p.Color = p:GetAttribute("OrigColor")
		p.Material = Enum.Material[p:GetAttribute("OrigMaterial")]
		p.Size = p:GetAttribute("OrigSize")
		p.Reflectance = p:GetAttribute("OrigReflectance")
	end
end

local function fenceParts(plot)
	local fence = plot.model:FindFirstChild("Fence")
	local posts, tops, rails = {}, {}, {}
	if fence then
		for _, p in fence:GetChildren() do
			if p:IsA("Part") and p.Name ~= "FenceWall" then
				if p.Shape == Enum.PartType.Ball then
					table.insert(tops, p)
				elseif p.Shape == Enum.PartType.Cylinder then
					table.insert(posts, p)
				else
					table.insert(rails, p)
				end
			end
		end
	end
	return posts, tops, rails
end

local function styleFence(plot, level: number, extra: Instance)
	local posts, tops, rails = fenceParts(plot)
	for _, list in { posts, tops, rails } do
		for _, p in list do
			remember(p)
			restore(p)
		end
	end
	if level == 2 then -- キャンディケインの さく
		for _, p in posts do
			p.Color = C(255, 255, 255)
			for _, dx in { -0.5, 0.6 } do -- 赤いしま（柱の軸は ローカルX）
				part(extra, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.35, 0.62, 0.62), CFrame = p.CFrame * CFrame.new(dx, 0, 0), Color = C(230, 50, 70) })
			end
		end
		for i, p in tops do
			p.Color = if i % 2 == 0 then C(230, 50, 70) else C(255, 255, 255)
		end
		for _, p in rails do
			p.Color = C(255, 160, 190)
		end
	elseif level == 3 then -- クッキーと マシュマロの さく
		for _, p in posts do
			p.Color = C(205, 150, 95)
			p.Material = Enum.Material.Sand
		end
		for i, p in tops do
			p.Size = Vector3.one * 1.15
			p.Color = if i % 2 == 0 then C(255, 190, 215) else C(255, 252, 245)
		end
		for _, p in rails do
			p.Color = C(115, 70, 50)
		end
	elseif level >= 4 then -- きらきら ゴールドの さく
		for _, p in posts do
			p.Color = C(245, 185, 50)
			p.Reflectance = 0.1
		end
		for i, p in tops do
			p.Size = Vector3.one * 0.95
			p.Color = C(255, 244, 190)
			p.Material = Enum.Material.Neon
			if i % 5 == 0 then -- きらきらは ところどころだけ（重くしない）
				local sparkle = Instance.new("ParticleEmitter")
				sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
				sparkle.Color = ColorSequence.new(C(255, 240, 170))
				sparkle.Rate = 1
				sparkle.Lifetime = NumberRange.new(0.8, 1.2)
				sparkle.Speed = NumberRange.new(0.5, 1)
				sparkle.Size = NumberSequence.new(0.35, 0)
				sparkle.LightEmission = 1
				sparkle.Name = "ReformSparkle"
				sparkle.Parent = p
			end
		end
		for _, p in rails do
			p.Color = C(240, 190, 70)
			p.Reflectance = 0.1
		end
	end
end

local function styleFloor(plot, level: number)
	local floor = plot.model.PrimaryPart
	remember(floor)
	restore(floor)
	local old = floor:FindFirstChild("ReformSparkle")
	if old then
		old:Destroy()
	end
	if level == 2 then -- クッキーの タイル
		floor.Color = C(232, 184, 125)
		floor.Material = Enum.Material.Cobblestone
	elseif level == 3 then -- いちごチョコの ゆか
		floor.Color = C(255, 175, 205)
		floor.Material = Enum.Material.SmoothPlastic
	elseif level >= 4 then -- ゆめかわ マーブル（ときどき きらっ）
		floor.Color = C(250, 232, 255)
		floor.Material = Enum.Material.Marble
		local sparkle = Instance.new("ParticleEmitter")
		sparkle.Name = "ReformSparkle"
		sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		sparkle.Color = ColorSequence.new(C(255, 200, 240), C(190, 220, 255))
		sparkle.Rate = 4
		sparkle.Lifetime = NumberRange.new(0.6, 1)
		sparkle.Speed = NumberRange.new(0.5, 1.5)
		sparkle.EmissionDirection = Enum.NormalId.Top
		sparkle.Size = NumberSequence.new(0.4, 0)
		sparkle.LightEmission = 0.8
		sparkle.Parent = floor
	end
end

local function styleSign(plot, level: number, extra: Instance)
	local post = plot.model:FindFirstChild("SignPost") :: BasePart?
	local label = plot.label :: TextLabel
	local gui = label.Parent :: BillboardGui
	local stroke = label:FindFirstChildOfClass("UIStroke")
	if not post or not stroke then
		return
	end
	remember(post)
	restore(post)
	if label:GetAttribute("OrigBg") == nil then
		label:SetAttribute("OrigBg", label.BackgroundColor3)
		label:SetAttribute("OrigText", label.TextColor3)
		label:SetAttribute("OrigStroke", stroke.Color)
		label:SetAttribute("OrigThickness", stroke.Thickness)
		label:SetAttribute("OrigGuiSize", gui.Size)
	end
	label.BackgroundColor3 = label:GetAttribute("OrigBg")
	label.TextColor3 = label:GetAttribute("OrigText")
	stroke.Color = label:GetAttribute("OrigStroke")
	stroke.Thickness = label:GetAttribute("OrigThickness")
	gui.Size = label:GetAttribute("OrigGuiSize")
	gui.LightInfluence = 1
	local gradient = stroke:FindFirstChild("ReformGradient")
	if gradient then
		gradient:Destroy()
	end
	local top = post.Position + Vector3.new(0, post.Size.Y / 2, 0)
	if level == 2 then -- ハートの かんばん
		post.Color = C(255, 150, 190)
		label.BackgroundColor3 = C(255, 228, 240)
		stroke.Color = C(255, 90, 150)
		stroke.Thickness = 4
		ball(extra, 1.2, top + Vector3.new(0, 0.4, 0), C(255, 110, 160))
	elseif level == 3 then -- ひかる ネオンの かんばん
		post.Color = C(90, 70, 140)
		label.BackgroundColor3 = C(70, 45, 110)
		label.TextColor3 = C(255, 205, 240)
		stroke.Color = C(120, 230, 255)
		stroke.Thickness = 5
		gui.LightInfluence = 0
		ball(extra, 1.2, top + Vector3.new(0, 0.4, 0), C(120, 230, 255), Enum.Material.Neon)
	elseif level >= 4 then -- にじいろの おうかん かんばん
		post.Color = C(255, 205, 90)
		post.Reflectance = 0.25
		label.BackgroundColor3 = C(255, 255, 255)
		stroke.Thickness = 6
		stroke.Color = C(255, 255, 255)
		gui.LightInfluence = 0
		gui.Size = UDim2.fromScale(11, 2.4)
		local g = Instance.new("UIGradient")
		g.Name = "ReformGradient"
		g.Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, C(255, 110, 140)),
			ColorSequenceKeypoint.new(0.25, C(255, 220, 110)),
			ColorSequenceKeypoint.new(0.5, C(140, 225, 160)),
			ColorSequenceKeypoint.new(0.75, C(130, 190, 255)),
			ColorSequenceKeypoint.new(1, C(200, 150, 255)),
		})
		g.Parent = stroke
		-- おうかん
		ball(extra, 1.3, top + Vector3.new(0, 0.5, 0), C(255, 215, 100), Enum.Material.Neon)
		for i = 0, 4 do
			local a = i * math.pi * 2 / 5
			ball(extra, 0.5, top + Vector3.new(math.cos(a) * 0.7, 1.2, math.sin(a) * 0.7), C(255, 240, 160), Enum.Material.Neon)
		end
	end
end

-- ひみつきちを 庭のうしろに建てる。前（とびら）が 庭のほうを向く。とびらの前に「入口」の しるし
local function buildBase(plot, level: number, ownerUserId: number, d, extra: Instance)
	local m, _, depth = buildHouse(level)
	m:SetAttribute("OwnerUserId", ownerUserId)
	m.WorldPivot = CFrame.new()
	local pivot = plot.model.PrimaryPart.CFrame * CFrame.new(0, -0.5, BASE_FRONT + depth / 2 + 1)
	-- 入口（とびらの すぐ前。ここに 持ち主が来たら へやへ）
	part(m, { Name = "Entrance", Size = Vector3.new(4, 4, 1), Position = Vector3.new(0, 2, -depth / 2 - 1.6), Transparency = 1 })
	m:PivotTo(pivot)
	m.Parent = extra
	Room.build(plot, level, d, extra)
end

-- ---- 公開する関数 ----
function Reform.level(d, id: string): number
	local item = Config.ReformById[id]
	return (d.reform and d.reform[id]) or (item and item.start) or 0
end

-- リフォームの にぎやかさの点数
function Reform.points(d): number
	local points = 0
	for _, item in Config.Reform do
		points += math.max(0, Reform.level(d, item.id) - item.start) * item.points
	end
	return points
end

function Reform.render(player: Player)
	local d = Data.get(player)
	local plot = World.plotOf(player)
	if not d or not plot then
		return
	end
	local old = plot.model:FindFirstChild("Reform")
	-- ひみつきちが なくなるときは、へやの中にいる人を先に外へ
	if old and Reform.level(d, "base") <= 0 then
		Room.evacuate(plot)
	end
	if old then
		old:Destroy()
	end
	local extra = Instance.new("Folder")
	extra.Name = "Reform"
	styleFence(plot, Reform.level(d, "fence"), extra)
	styleSign(plot, Reform.level(d, "sign"), extra)
	styleFloor(plot, Reform.level(d, "floor"))
	local baseLevel = Reform.level(d, "base")
	if baseLevel > 0 then
		buildBase(plot, baseLevel, player.UserId, d, extra)
	end
	extra.Parent = plot.model
end

-- 帰ったら、庭を もとの見た目にもどす（次の人が使うため）
function Reform.clear(player: Player)
	local plot = World.plotOf(player)
	if not plot then
		return
	end
	Room.evacuate(plot) -- へやにいる人を 落とさないように、先に外へ
	local old = plot.model:FindFirstChild("Reform")
	if old then
		old:Destroy()
	end
	local posts, tops, rails = fenceParts(plot)
	for _, list in { posts, tops, rails } do
		for _, p in list do
			restore(p)
			local s = p:FindFirstChild("ReformSparkle")
			if s then
				s:Destroy()
			end
		end
	end
	styleSign(plot, 1, plot.model)
	styleFloor(plot, 1)
end

local function buy(player: Player, id: any)
	local item = type(id) == "string" and Config.ReformById[id]
	if not item or not RateLimit.ok(player, "reform", 0.5) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	d.reform = d.reform or {}
	local current = Reform.level(d, id)
	local nextIndex = current + 1
	local nextLevel = item.levels[nextIndex]
	if not nextLevel then
		return -- もう いちばん上
	end
	if d.coins < nextLevel.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= nextLevel.price
	d.reform[id] = nextIndex
	Reform.render(player)
	if Reform.onChanged then
		Reform.onChanged(player)
	end
	Remotes.Toast:FireClient(player, "toast.reformDone", "@reform." .. id .. "." .. nextIndex)
	if id == "base" then
		Funnel.step(player, "BuiltBase")
	end
	Data.push(player)
	Data.save(player) -- 大きな買い物は、すぐ保存する
end

function Reform.init()
	Remotes.BuyReform.OnServerEvent:Connect(buy)
	Room.init()
	-- Studioでの確認用（本番では動かない）: workspace の属性 DebugReform に "fence=4,sign=4,floor=4,base=5" のように入れると、その段にする
	if RunService:IsStudio() then
		workspace:GetAttributeChangedSignal("DebugReform"):Connect(function()
			local text = workspace:GetAttribute("DebugReform")
			if type(text) ~= "string" then
				return
			end
			for _, player in Players:GetPlayers() do
				local d = Data.get(player)
				if d then
					d.reform = d.reform or {}
					for id, n in string.gmatch(text, "(%w+)=(%d+)") do
						local item = Config.ReformById[id]
						if item then
							d.reform[id] = math.clamp(tonumber(n) or item.start, item.start, #item.levels)
						end
					end
					Reform.render(player)
					if Reform.onChanged then
						Reform.onChanged(player)
					end
					Data.push(player)
				end
			end
		end)
	end
end

return Reform

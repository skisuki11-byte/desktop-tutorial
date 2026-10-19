-- ひみつきちの へやに置く家具（Config.Furniture）の形。足元の中心が原点、前（-Z）が部屋のまん中のほう。
-- どれも 4×4 stud くらいに収める（置き場所の間が 5〜6 stud）。部品は少なめ（重くしない）
local C = Color3.fromRGB

local function part(model: Model, props: { [string]: any }): Part
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
	p.Parent = model
	return p
end

local function box(m: Model, size: Vector3, pos: Vector3, color: Color3, material: Enum.Material?)
	return part(m, { Size = size, Position = pos, Color = color, Material = material or Enum.Material.SmoothPlastic })
end

local function ball(m: Model, d: number, pos: Vector3, color: Color3, material: Enum.Material?)
	return part(m, { Shape = Enum.PartType.Ball, Size = Vector3.one * d, Position = pos, Color = color, Material = material or Enum.Material.SmoothPlastic })
end

-- 軸が縦の円柱（足元 y から高さ h）
local function pillar(m: Model, h: number, d: number, pos: Vector3, color: Color3, material: Enum.Material?)
	return part(m, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(h, d, d),
		CFrame = CFrame.new(pos + Vector3.new(0, h / 2, 0)) * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

local function legs(m: Model, w: number, d: number, h: number, color: Color3)
	for _, x in { -w / 2, w / 2 } do
		for _, z in { -d / 2, d / 2 } do
			pillar(m, h, 0.35, Vector3.new(x, 0, z), color)
		end
	end
end

local BUILD = {}

BUILD.flowerpot = function(m)
	pillar(m, 1.4, 1.6, Vector3.zero, C(255, 170, 200))
	pillar(m, 0.2, 1.5, Vector3.new(0, 1.4, 0), C(120, 85, 60))
	local colors = { C(255, 110, 160), C(255, 220, 100), C(170, 150, 255) }
	for i, c in colors do
		local a = i * math.pi * 2 / 3
		local at = Vector3.new(math.cos(a) * 0.35, 0, math.sin(a) * 0.35)
		pillar(m, 1.4, 0.12, at + Vector3.new(0, 1.5, 0), C(90, 180, 90))
		ball(m, 0.7, at + Vector3.new(0, 3, 0), c)
	end
end

BUILD.candyrug = function(m)
	pillar(m, 0.1, 4.6, Vector3.zero, C(255, 255, 255))
	pillar(m, 0.12, 3.6, Vector3.zero, C(255, 120, 170))
	pillar(m, 0.14, 2.4, Vector3.zero, C(255, 255, 255))
	pillar(m, 0.16, 1.2, Vector3.zero, C(130, 210, 255))
end

BUILD.caketable = function(m)
	pillar(m, 1.6, 0.7, Vector3.zero, C(255, 240, 246))
	pillar(m, 0.5, 3.6, Vector3.new(0, 1.6, 0), C(255, 200, 225))
	pillar(m, 0.2, 3.8, Vector3.new(0, 2.1, 0), C(255, 255, 255))
	ball(m, 0.6, Vector3.new(0, 2.6, 0), C(230, 40, 70))
	-- お皿とケーキ
	pillar(m, 0.1, 1, Vector3.new(0.9, 2.3, -0.5), C(255, 255, 255))
	pillar(m, 0.5, 0.6, Vector3.new(0.9, 2.4, -0.5), C(255, 214, 90))
end

BUILD.lollichair = function(m)
	box(m, Vector3.new(2.2, 0.5, 2.2), Vector3.new(0, 1.6, 0), C(255, 150, 200))
	legs(m, 1.8, 1.8, 1.4, C(255, 255, 255))
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.4, 2.4, 2.4), CFrame = CFrame.new(0, 3.2, 1) * CFrame.Angles(0, math.pi / 2, 0), Color = C(120, 220, 255), Material = Enum.Material.Glass })
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.45, 1.4, 1.4), CFrame = CFrame.new(0, 3.2, 1) * CFrame.Angles(0, math.pi / 2, 0), Color = C(255, 120, 190), Material = Enum.Material.Glass })
end

BUILD.gummybed = function(m)
	box(m, Vector3.new(3.4, 1, 4.6), Vector3.new(0, 0.5, 0), C(255, 110, 140))
	box(m, Vector3.new(3.2, 0.6, 4.2), Vector3.new(0, 1.3, 0), C(255, 250, 252)) -- おふとん
	box(m, Vector3.new(3.2, 0.5, 2.4), Vector3.new(0, 1.65, -0.9), C(150, 210, 255)) -- かけぶとん
	ball(m, 1.2, Vector3.new(0, 1.9, 1.5), C(255, 255, 255)) -- まくら
	box(m, Vector3.new(3.6, 2.8, 0.5), Vector3.new(0, 1.4, 2.4), C(255, 90, 120), Enum.Material.Glass) -- グミのヘッドボード
	ball(m, 0.9, Vector3.new(-1.2, 3, 2.4), C(255, 200, 80), Enum.Material.Glass)
	ball(m, 0.9, Vector3.new(1.2, 3, 2.4), C(140, 230, 150), Enum.Material.Glass)
end

BUILD.starlamp = function(m)
	pillar(m, 0.3, 1.4, Vector3.zero, C(255, 220, 120))
	pillar(m, 4, 0.25, Vector3.new(0, 0.3, 0), C(255, 255, 255))
	local star = ball(m, 1.4, Vector3.new(0, 4.8, 0), C(255, 240, 150), Enum.Material.Neon)
	local light = Instance.new("PointLight")
	light.Color = C(255, 230, 170)
	light.Range = 12
	light.Brightness = 1
	light.Parent = star
	for i = 0, 4 do
		local a = i * math.pi * 2 / 5
		ball(m, 0.5, Vector3.new(math.cos(a) * 0.9, 4.8 + math.sin(a) * 0.9, 0), C(255, 240, 150), Enum.Material.Neon)
	end
end

BUILD.cottonsofa = function(m)
	box(m, Vector3.new(4.4, 1, 2.2), Vector3.new(0, 0.9, 0), C(200, 225, 255))
	for _, x in { -1.4, 0, 1.4 } do
		ball(m, 1.8, Vector3.new(x, 1.6, 0.1), C(240, 248, 255)) -- わたあめの すわる所
		ball(m, 2.2, Vector3.new(x, 2.6, 1), C(225, 238, 255)) -- せもたれ
	end
	ball(m, 1.6, Vector3.new(-2.3, 1.9, 0), C(255, 200, 230))
	ball(m, 1.6, Vector3.new(2.3, 1.9, 0), C(255, 200, 230))
end

BUILD.donutshelf = function(m)
	box(m, Vector3.new(3.6, 4.6, 1.2), Vector3.new(0, 2.3, 0.6), C(214, 168, 120), Enum.Material.Wood)
	box(m, Vector3.new(3.2, 0.2, 1), Vector3.new(0, 1.6, 0.4), C(180, 130, 90), Enum.Material.Wood)
	box(m, Vector3.new(3.2, 0.2, 1), Vector3.new(0, 3.1, 0.4), C(180, 130, 90), Enum.Material.Wood)
	local colors = { C(255, 140, 190), C(140, 90, 60), C(255, 220, 110), C(150, 210, 255), C(255, 255, 255), C(170, 230, 160) }
	for i, c in colors do
		local x = -1.1 + ((i - 1) % 3) * 1.1
		local y = if i <= 3 then 2.1 else 3.6
		part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.35, 0.9, 0.9), CFrame = CFrame.new(x, y, 0.1) * CFrame.Angles(0, math.pi / 2, 0), Color = c })
	end
end

BUILD.teddypile = function(m)
	local function bear(at: Vector3, s: number, color: Color3)
		ball(m, 1.4 * s, at + Vector3.new(0, 0.7 * s, 0), color)
		ball(m, 1.1 * s, at + Vector3.new(0, 1.8 * s, 0), color)
		ball(m, 0.45 * s, at + Vector3.new(-0.45 * s, 2.3 * s, 0), color)
		ball(m, 0.45 * s, at + Vector3.new(0.45 * s, 2.3 * s, 0), color)
		ball(m, 0.15 * s, at + Vector3.new(-0.2 * s, 1.9 * s, -0.5 * s), C(60, 30, 50))
		ball(m, 0.15 * s, at + Vector3.new(0.2 * s, 1.9 * s, -0.5 * s), C(60, 30, 50))
	end
	bear(Vector3.new(-0.9, 0, 0.3), 1.1, C(220, 170, 120))
	bear(Vector3.new(1, 0, 0.4), 1, C(255, 170, 210))
	bear(Vector3.new(0, 0, -0.6), 0.8, C(170, 210, 255))
end

BUILD.cupcaketv = function(m)
	pillar(m, 1.6, 3.4, Vector3.zero, C(255, 165, 200))
	box(m, Vector3.new(3.6, 2.4, 0.5), Vector3.new(0, 3, 0.3), C(255, 250, 252))
	box(m, Vector3.new(3, 1.8, 0.2), Vector3.new(0, 3, 0.05), C(120, 200, 255), Enum.Material.Neon) -- 画面
	ball(m, 0.6, Vector3.new(-1.2, 4.5, 0.3), C(230, 40, 70))
	ball(m, 0.6, Vector3.new(1.2, 4.5, 0.3), C(230, 40, 70))
end

BUILD.chocofridge = function(m)
	box(m, Vector3.new(2.6, 5, 2.2), Vector3.new(0, 2.5, 0.3), C(120, 75, 55))
	box(m, Vector3.new(2.4, 0.15, 0.1), Vector3.new(0, 3.2, -0.82), C(90, 55, 40))
	-- 板チョコの みぞ
	for _, y in { 1.2, 2.3, 4.1 } do
		box(m, Vector3.new(2.4, 0.08, 0.1), Vector3.new(0, y, -0.82), C(95, 58, 42))
	end
	pillar(m, 1.4, 0.2, Vector3.new(0.95, 3.4, -0.95), C(255, 230, 150))
	ball(m, 0.9, Vector3.new(0, 5.4, 0.3), C(255, 250, 252)) -- クリーム
end

BUILD.jellypiano = function(m)
	box(m, Vector3.new(4.2, 1.8, 2), Vector3.new(0, 2.6, 0.4), C(170, 120, 255), Enum.Material.Glass)
	box(m, Vector3.new(4.2, 2.4, 0.5), Vector3.new(0, 3.9, 1.2), C(150, 100, 240), Enum.Material.Glass)
	legs(m, 3.6, 1.4, 1.7, C(255, 255, 255))
	for k = 0, 9 do -- けんばん
		box(m, Vector3.new(0.36, 0.15, 0.8), Vector3.new(-1.65 + k * 0.37, 3.55, -0.3), C(255, 255, 255))
	end
	for _, k in { 0, 1, 3, 4, 5, 7, 8 } do
		box(m, Vector3.new(0.2, 0.15, 0.45), Vector3.new(-1.47 + k * 0.37, 3.65, -0.1), C(60, 40, 70))
	end
end

BUILD.bubblebath = function(m)
	box(m, Vector3.new(4.4, 1.6, 2.8), Vector3.new(0, 0.8, 0), C(255, 255, 255))
	for _, x in { -2, 2 } do -- すみは 玉で まるく
		for _, z in { -1.2, 1.2 } do
			ball(m, 1.2, Vector3.new(x, 1, z), C(255, 255, 255))
		end
	end
	for i = 1, 9 do -- あわ
		local x = -1.6 + ((i - 1) % 3) * 1.6
		local z = -0.8 + math.floor((i - 1) / 3) * 0.8
		ball(m, 1 + (i % 3) * 0.2, Vector3.new(x, 1.8, z), C(220, 240, 255), Enum.Material.Glass)
	end
	ball(m, 1, Vector3.new(1.3, 2.4, 0.4), C(255, 220, 80)) -- アヒル
	ball(m, 0.6, Vector3.new(1.3, 3.1, 0.2), C(255, 220, 80))
end

BUILD.rainbowslide = function(m)
	local colors = { C(255, 110, 140), C(255, 180, 100), C(255, 235, 120), C(140, 225, 160), C(130, 190, 255), C(190, 150, 255) }
	-- かいだん（うしろ）
	for i = 1, 5 do
		box(m, Vector3.new(1.6, 0.3, 0.6), Vector3.new(0, i * 0.9, 1.8 - i * 0.05), C(255, 255, 255))
	end
	pillar(m, 5, 0.3, Vector3.new(-0.9, 0, 1.8), C(255, 255, 255))
	pillar(m, 5, 0.3, Vector3.new(0.9, 0, 1.8), C(255, 255, 255))
	-- すべり台（前にむかって下がる、にじいろの すじ）
	for i, c in colors do
		local x = -0.85 + (i - 1) * 0.34
		local top = Vector3.new(x, 4.6, 1.4)
		local bottom = Vector3.new(x, 0.4, -2.2)
		local mid = (top + bottom) / 2
		part(m, { Size = Vector3.new(0.34, 0.2, (top - bottom).Magnitude), CFrame = CFrame.lookAt(mid, top), Color = c, Material = Enum.Material.Neon })
	end
end

BUILD.moonbed = function(m)
	box(m, Vector3.new(4, 1, 4.8), Vector3.new(0, 0.5, 0), C(110, 100, 200))
	box(m, Vector3.new(3.8, 0.7, 4.4), Vector3.new(0, 1.35, 0), C(240, 235, 255))
	box(m, Vector3.new(3.8, 0.5, 2.6), Vector3.new(0, 1.7, -0.8), C(150, 140, 255))
	ball(m, 1.2, Vector3.new(0, 1.95, 1.6), C(255, 255, 255))
	-- てんがい（4本の柱と、上の布）
	for _, x in { -1.9, 1.9 } do
		for _, z in { -2.3, 2.3 } do
			pillar(m, 5.6, 0.3, Vector3.new(x, 0, z), C(255, 230, 150))
		end
	end
	local canopy = box(m, Vector3.new(4.2, 0.3, 5), Vector3.new(0, 5.7, 0), C(190, 180, 255))
	canopy.Transparency = 0.2
	-- お月さまと 星
	ball(m, 1.3, Vector3.new(0, 6.4, 0), C(255, 240, 160), Enum.Material.Neon)
	for i = 0, 3 do
		local a = i * math.pi / 2 + 0.4
		ball(m, 0.4, Vector3.new(math.cos(a) * 1.6, 6.2, math.sin(a) * 2), C(255, 255, 220), Enum.Material.Neon)
	end
end

local FurnitureVisuals = {}

-- ここから スペシャル家具（パス）。ほかより 少し 大きく、金色や 光る部分で「とくべつ」と 分かるように
BUILD.kingsofa = function(m)
	local red, gold = C(200, 40, 90), C(245, 190, 60)
	box(m, Vector3.new(4.6, 1, 2.2), Vector3.new(0, 1, 0.2), red, Enum.Material.Fabric) -- すわる所
	box(m, Vector3.new(4.6, 2.6, 0.6), Vector3.new(0, 2.3, 1.1), red, Enum.Material.Fabric) -- せもたれ
	for _, x in { -2.5, 2.5 } do
		box(m, Vector3.new(0.6, 1.6, 2.4), Vector3.new(x, 1.3, 0.2), red, Enum.Material.Fabric) -- ひじかけ
		ball(m, 0.6, Vector3.new(x, 2.3, -0.8), gold, Enum.Material.Metal)
	end
	box(m, Vector3.new(4.8, 0.25, 0.7), Vector3.new(0, 3.7, 1.1), gold, Enum.Material.Metal) -- 金のふち
	-- せもたれの上の かんむり
	box(m, Vector3.new(1.4, 0.5, 0.3), Vector3.new(0, 4.1, 1.1), gold, Enum.Material.Metal)
	for _, x in { -0.5, 0, 0.5 } do
		ball(m, 0.4, Vector3.new(x, 4.5, 1.1), gold, Enum.Material.Metal)
	end
	ball(m, 0.35, Vector3.new(0, 4.1, 0.9), C(120, 220, 255), Enum.Material.Glass)
	legs(m, 4.2, 1.8, 0.5, gold)
end

BUILD.starfountain = function(m)
	pillar(m, 0.6, 4.4, Vector3.zero, C(235, 225, 255), Enum.Material.Marble) -- 池のふち
	pillar(m, 0.1, 3.8, Vector3.new(0, 0.6, 0), C(150, 210, 255), Enum.Material.Glass) -- 水
	pillar(m, 2.2, 0.6, Vector3.new(0, 0.6, 0), C(235, 225, 255), Enum.Material.Marble) -- はしら
	pillar(m, 0.3, 2, Vector3.new(0, 2.8, 0), C(235, 225, 255), Enum.Material.Marble) -- 上のおさら
	pillar(m, 0.1, 1.7, Vector3.new(0, 3.1, 0), C(150, 210, 255), Enum.Material.Glass)
	ball(m, 0.9, Vector3.new(0, 3.9, 0), C(255, 220, 90), Enum.Material.Neon) -- 光る星の玉
	for i = 1, 5 do
		local a = i * math.pi * 2 / 5
		ball(m, 0.3, Vector3.new(math.cos(a) * 1.6, 0.9, math.sin(a) * 1.6), C(255, 240, 150), Enum.Material.Neon)
	end
end

BUILD.dreamshelf = function(m)
	local wood = C(190, 160, 255)
	box(m, Vector3.new(3.6, 4.6, 1.2), Vector3.new(0, 2.3, 0.4), wood) -- 本だなの 箱
	for i, y in { 1.1, 2.3, 3.5 } do
		box(m, Vector3.new(3.2, 0.15, 1), Vector3.new(0, y - 0.55, 0.3), C(240, 230, 255)) -- たな板
		-- 本（色ちがい）
		local colors = { C(255, 140, 180), C(130, 200, 255), C(255, 215, 110), C(150, 230, 170), C(255, 170, 120) }
		for k = 1, 5 do
			local h = 0.7 + ((k + i) % 3) * 0.1
			box(m, Vector3.new(0.45, h, 0.8), Vector3.new(-1.2 + (k - 1) * 0.6, y - 0.47 + h / 2, 0.2), colors[(k + i) % #colors + 1])
		end
	end
	-- 上の 雲と 月
	ball(m, 1, Vector3.new(-0.8, 5, 0.4), C(255, 255, 255))
	ball(m, 1.2, Vector3.new(0, 5.1, 0.4), C(255, 255, 255))
	ball(m, 0.9, Vector3.new(0.9, 5, 0.4), C(255, 255, 255))
	ball(m, 0.6, Vector3.new(0.4, 5.8, 0.2), C(255, 230, 120), Enum.Material.Neon)
end

function FurnitureVisuals.build(id: string): Model?
	local f = BUILD[id]
	if not f then
		return nil
	end
	local m = Instance.new("Model")
	m.Name = id
	f(m)
	return m
end

return FurnitureVisuals

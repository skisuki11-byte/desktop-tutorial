local C = Color3.fromRGB
local WHITE = C(255, 255, 255)
local PINK = C(255, 150, 200)
local GOLD = C(255, 214, 90)

-- ---- 部品づくり。原点に作って、あとで体に付ける ----

local function part(model: Model, props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.CastShadow = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		p[k] = v
	end
	p.Parent = model
	return p
end

-- 楕円体（Block + SpecialMesh Sphere なら、縦横の大きさを別々にできる）
local function ellipsoid(model: Model, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?)
	local p = part(model, { Size = size, CFrame = cf, Color = color, Material = material or Enum.Material.SmoothPlastic })
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = p
	return p
end

local function ball(model: Model, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?)
	return part(model, {
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * diameter,
		CFrame = cf,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- 軸が縦(Y)の円柱
local function pillar(model: Model, height: number, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?)
	return part(model, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, diameter, diameter),
		CFrame = cf * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- 頭のてっぺんが原点(y=0)。back は背中の中心が原点（背中側が +Z）
local BUILD: { [string]: (Model) -> () } = {}

BUILD.bunnyears = function(m)
	for _, x in { -0.45, 0.45 } do
		local tilt = CFrame.Angles(0, 0, -x * 0.35)
		ellipsoid(m, Vector3.new(0.6, 2.2, 0.5), CFrame.new(x, 1.2, 0) * tilt, WHITE)
		ellipsoid(m, Vector3.new(0.32, 1.6, 0.3), CFrame.new(x, 1.2, -0.12) * tilt, PINK)
	end
end

BUILD.catears = function(m)
	for _, x in { -0.62, 0.62 } do
		part(m, { Size = Vector3.new(0.75, 0.75, 0.25), CFrame = CFrame.new(x, 0.55, 0) * CFrame.Angles(0, 0, math.rad(45)), Color = C(200, 180, 255) })
		part(m, { Size = Vector3.new(0.4, 0.4, 0.28), CFrame = CFrame.new(x, 0.52, -0.04) * CFrame.Angles(0, 0, math.rad(45)), Color = PINK })
	end
end

BUILD.candyhat = function(m)
	pillar(m, 0.35, 2.4, CFrame.new(0, 0.3, 0), PINK)
	pillar(m, 0.4, 1.6, CFrame.new(0, 0.32, 0), WHITE)
	pillar(m, 0.45, 0.8, CFrame.new(0, 0.34, 0), C(255, 110, 170))
	ball(m, 0.5, CFrame.new(0, 0.75, 0), C(255, 226, 120), Enum.Material.Neon)
end

BUILD.icecream = function(m)
	ball(m, 1.9, CFrame.new(0, 0.75, 0), PINK)
	ball(m, 1.45, CFrame.new(0, 1.55, 0), C(170, 235, 205))
	ball(m, 1.0, CFrame.new(0, 2.2, 0), C(255, 240, 200))
	ball(m, 0.5, CFrame.new(0.15, 2.8, 0), C(230, 60, 90))
end

BUILD.chefhat = function(m)
	pillar(m, 1.0, 1.7, CFrame.new(0, 0.5, 0), WHITE)
	ball(m, 2.3, CFrame.new(0, 1.55, 0), WHITE)
	ball(m, 1.3, CFrame.new(-0.9, 1.2, 0), WHITE)
	ball(m, 1.3, CFrame.new(0.9, 1.2, 0), WHITE)
	pillar(m, 0.18, 1.78, CFrame.new(0, 0.1, 0), PINK)
end

BUILD.starhalo = function(m)
	for i = 1, 8 do
		local a = (i / 8) * math.pi * 2
		ball(m, i % 2 == 0 and 0.55 or 0.4, CFrame.new(math.cos(a) * 1.25, 1.1, math.sin(a) * 1.25), GOLD, Enum.Material.Neon)
	end
end

BUILD.crown = function(m)
	pillar(m, 0.6, 2.0, CFrame.new(0, 0.3, 0), GOLD, Enum.Material.Neon)
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		local x, z = math.cos(a) * 0.85, math.sin(a) * 0.85
		part(m, { Size = Vector3.new(0.4, 0.8, 0.4), CFrame = CFrame.new(x, 0.9, z), Color = GOLD, Material = Enum.Material.Neon })
		ball(m, 0.42, CFrame.new(x, 1.4, z), i % 2 == 0 and C(255, 120, 190) or C(130, 200, 255), Enum.Material.Neon)
	end
end

BUILD.ribbon = function(m)
	local red = C(255, 90, 140)
	ball(m, 0.6, CFrame.new(0, 0.35, 0), red)
	for _, side in { -1, 1 } do
		ellipsoid(m, Vector3.new(1.3, 0.9, 0.35), CFrame.new(side * 0.75, 0.4, 0) * CFrame.Angles(0, 0, side * math.rad(18)), red)
		ellipsoid(m, Vector3.new(0.6, 0.45, 0.4), CFrame.new(side * 0.75, 0.4, -0.02), C(255, 170, 200))
	end
end

-- ゆうじょうの花かんむり（やくそくの花が さいたときの ごほうび。お店では買えない）
BUILD.flowercrown = function(m)
	local colors = { C(255, 150, 190), C(255, 220, 120), C(170, 200, 255), C(255, 170, 120), C(200, 160, 255), C(255, 255, 255), C(150, 225, 170) }
	for i = 1, 14 do
		local a = (i / 14) * math.pi * 2
		ball(m, 0.32, CFrame.new(math.cos(a) * 1.0, 0.25, math.sin(a) * 1.0), C(110, 200, 120))
	end
	for i = 1, 7 do
		local a = (i / 7) * math.pi * 2
		local center = CFrame.new(math.cos(a) * 1.02, 0.42, math.sin(a) * 1.02)
		for k = 1, 5 do
			local b = (k / 5) * math.pi * 2
			ball(m, 0.24, center * CFrame.new(math.cos(b) * 0.15, math.sin(b) * 0.15, 0), colors[i])
		end
		ball(m, 0.16, center * CFrame.new(0, 0, -0.04), C(255, 210, 80))
	end
end

BUILD.berryhat = function(m)
	local red = C(240, 60, 90)
	ellipsoid(m, Vector3.new(1.9, 1.7, 1.9), CFrame.new(0, 0.7, 0), red)
	-- つぶつぶ
	for i = 1, 8 do
		local a = (i / 8) * math.pi * 2
		ball(m, 0.18, CFrame.new(math.cos(a) * 0.9, 0.75 + (i % 2) * 0.25, math.sin(a) * 0.9), C(255, 236, 150))
	end
	-- へた
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		part(m, {
			Size = Vector3.new(0.7, 0.12, 0.3),
			CFrame = CFrame.new(math.cos(a) * 0.35, 1.55, math.sin(a) * 0.35) * CFrame.Angles(0, -a, math.rad(-20)),
			Color = C(90, 190, 90),
		})
	end
	pillar(m, 0.4, 0.18, CFrame.new(0, 1.75, 0), C(90, 170, 80))
end

BUILD.lollipopback = function(m)
	pillar(m, 3.2, 0.25, CFrame.new(0.4, -0.2, 0.7) * CFrame.Angles(0, 0, math.rad(-12)), WHITE)
	-- 円盤（円柱の軸を背中の向き=Zにする）
	part(m, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.3, 2.6, 2.6),
		CFrame = CFrame.new(0.75, 1.7, 0.75) * CFrame.Angles(0, math.pi / 2, 0),
		Color = C(255, 120, 190),
	})
	part(m, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.34, 1.6, 1.6),
		CFrame = CFrame.new(0.75, 1.7, 0.75) * CFrame.Angles(0, math.pi / 2, 0),
		Color = C(255, 220, 240),
	})
	ball(m, 0.7, CFrame.new(0.75, 1.7, 0.75), C(130, 210, 255), Enum.Material.Neon)
end

BUILD.gemcrown = function(m)
	pillar(m, 0.55, 2.0, CFrame.new(0, 0.3, 0), C(200, 220, 255), Enum.Material.Neon)
	local gems = { C(255, 90, 140), C(120, 200, 255), C(150, 240, 170), C(255, 220, 90), C(200, 150, 255) }
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		local x, z = math.cos(a) * 0.85, math.sin(a) * 0.85
		part(m, {
			Size = Vector3.new(0.45, 0.45, 0.45),
			CFrame = CFrame.new(x, 0.95, z) * CFrame.Angles(math.rad(45), 0, math.rad(45)),
			Color = gems[i],
			Material = Enum.Material.Neon,
		})
	end
	ball(m, 0.6, CFrame.new(0, 1.2, 0), C(255, 255, 255), Enum.Material.Neon)
end

-- ほしぞらのかんむり: 夜空色の輪に、光る星を5つ。まん中に大きな星
BUILD.starcrown = function(m)
	pillar(m, 0.5, 2.1, CFrame.new(0, 0.28, 0), C(70, 60, 160), Enum.Material.Neon)
	pillar(m, 0.18, 2.15, CFrame.new(0, 0.55, 0), C(255, 230, 120), Enum.Material.Neon)
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		ball(m, 0.42, CFrame.new(math.cos(a) * 0.9, 0.85, math.sin(a) * 0.9), C(200, 235, 255), Enum.Material.Neon)
	end
	part(m, {
		Size = Vector3.new(0.75, 0.75, 0.75),
		CFrame = CFrame.new(0, 1.25, 0) * CFrame.Angles(math.rad(45), 0, math.rad(45)),
		Color = C(255, 240, 150),
		Material = Enum.Material.Neon,
	})
	local glow = Instance.new("PointLight")
	glow.Color = C(170, 200, 255)
	glow.Range = 8
	glow.Brightness = 1
	glow.Parent = m:GetChildren()[1]
end

-- ほしぞらのつばさ: 夜空色の大きなはね。小さな星がちりばめてある
BUILD.starwings = function(m)
	for _, side in { -1, 1 } do
		local base = CFrame.new(side * 1.7, 0.6, 0.7) * CFrame.Angles(0, side * math.rad(-22), side * math.rad(-12))
		ellipsoid(m, Vector3.new(2.4, 1.5, 0.18), base * CFrame.new(side * 0.2, 0.45, 0), C(90, 80, 200), Enum.Material.Neon)
		ellipsoid(m, Vector3.new(1.9, 1.1, 0.2), base * CFrame.new(side * 0.05, -0.55, 0), C(130, 90, 220), Enum.Material.Neon)
		for k = 1, 4 do
			ball(m, 0.22, base * CFrame.new(side * (k * 0.35 - 0.6), 0.3 + (k % 2) * 0.4, -0.12), C(255, 255, 255), Enum.Material.Neon)
		end
	end
end

BUILD.puddinghat = function(m)
	-- プリン（下が広い円柱を2段）＋カラメル＋さくらんぼ
	pillar(m, 0.7, 2.0, CFrame.new(0, 0.35, 0), C(255, 222, 120))
	pillar(m, 0.5, 1.7, CFrame.new(0, 0.95, 0), C(255, 230, 140))
	pillar(m, 0.25, 1.75, CFrame.new(0, 1.3, 0), C(170, 95, 40))
	ball(m, 0.5, CFrame.new(0, 1.65, 0), C(230, 50, 80))
	pillar(m, 0.4, 0.08, CFrame.new(0.1, 2.0, 0) * CFrame.Angles(0, 0, math.rad(-20)), C(90, 160, 70))
end

BUILD.donutback = function(m)
	-- ドーナツのうきわ（玉を輪に並べる）＋チョコの粒
	local center = Vector3.new(0, 0.2, 0.9)
	for i = 1, 14 do
		local a = (i / 14) * math.pi * 2
		local pos = center + Vector3.new(math.cos(a) * 1.0, math.sin(a) * 1.0, 0)
		ball(m, 0.85, CFrame.new(pos), C(240, 190, 120))
		ball(m, 0.55, CFrame.new(pos + Vector3.new(0, 0, 0.3)), i % 2 == 0 and C(255, 130, 190) or C(255, 160, 210))
		if i % 3 == 0 then
			ball(m, 0.18, CFrame.new(pos + Vector3.new(0.1, 0.1, 0.55)), i % 2 == 0 and C(120, 200, 255) or C(255, 236, 120))
		end
	end
end

BUILD.heartwings = function(m)
	-- ハートの形のはね（玉2つ＋三角の代わりに傾けた四角）
	for _, side in { -1, 1 } do
		local base = CFrame.new(side * 1.5, 0.5, 0.7) * CFrame.Angles(0, side * math.rad(-20), 0)
		local pink = C(255, 110, 160)
		ellipsoid(m, Vector3.new(1.3, 1.3, 0.2), base * CFrame.new(-0.45, 0.35, 0), pink, Enum.Material.Neon)
		ellipsoid(m, Vector3.new(1.3, 1.3, 0.2), base * CFrame.new(0.45, 0.35, 0), pink, Enum.Material.Neon)
		part(m, {
			Size = Vector3.new(1.25, 1.25, 0.2),
			CFrame = base * CFrame.new(0, -0.15, 0) * CFrame.Angles(0, 0, math.rad(45)),
			Color = pink,
			Material = Enum.Material.Neon,
		})
	end
end

BUILD.cottoncloud = function(m)
	ball(m, 1.9, CFrame.new(0, 0, 0.5), C(235, 245, 255))
	ball(m, 1.4, CFrame.new(-0.9, -0.3, 0.45), C(215, 235, 255))
	ball(m, 1.4, CFrame.new(0.9, -0.3, 0.45), C(255, 225, 240))
	ball(m, 1.1, CFrame.new(0, 0.7, 0.4), WHITE)
end

BUILD.candycane = function(m)
	local pink, white = C(255, 100, 160), WHITE
	for i = 0, 5 do
		pillar(m, 0.6, 0.5, CFrame.new(0.9, -1.6 + i * 0.6, 0.75) * CFrame.Angles(0, 0, 0), i % 2 == 0 and pink or white)
	end
	ball(m, 0.5, CFrame.new(0.9, 2.15, 0.75), pink)
	pillar(m, 0.6, 0.5, CFrame.new(0.55, 2.3, 0.75) * CFrame.Angles(0, 0, math.rad(90)), white)
	pillar(m, 0.6, 0.5, CFrame.new(0.2, 2.15, 0.75) * CFrame.Angles(0, 0, math.rad(90)), pink)
end

local function wings(m: Model, big: Color3, small: Color3, material: Enum.Material?)
	for _, side in { -1, 1 } do
		ellipsoid(m, Vector3.new(2.6, 2.2, 0.2), CFrame.new(side * 1.6, 0.7, 0.7) * CFrame.Angles(0, side * math.rad(-20), side * math.rad(-25)), big, material)
		ellipsoid(m, Vector3.new(1.8, 1.5, 0.2), CFrame.new(side * 1.3, -0.7, 0.7) * CFrame.Angles(0, side * math.rad(-20), side * math.rad(20)), small, material)
	end
end

BUILD.fairywings = function(m)
	wings(m, C(255, 190, 230), C(190, 230, 255), Enum.Material.Neon)
end

BUILD.goldwings = function(m)
	wings(m, GOLD, C(255, 170, 70), Enum.Material.Neon)
end

BUILD.rainbowcape = function(m)
	local colors = { C(255, 110, 130), C(255, 175, 90), C(255, 230, 100), C(130, 220, 140), C(120, 190, 255), C(190, 150, 255) }
	for i, color in colors do
		part(m, { Size = Vector3.new(1.9 - i * 0.08, 0.45, 0.12), CFrame = CFrame.new(0, 0.9 - i * 0.42, 0.6 + i * 0.05), Color = color, Material = Enum.Material.Neon })
	end
end


-- ---- かお（頭の前の まん中が原点。前が -Z） ----
local function lens(m: Model, x: number, color: Color3, frame: Color3)
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.08, 0.5, 0.5), CFrame = CFrame.new(x, 0.15, -0.1) * CFrame.Angles(0, math.pi / 2, 0), Color = frame })
	local glass = part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.09, 0.4, 0.4), CFrame = CFrame.new(x, 0.15, -0.11) * CFrame.Angles(0, math.pi / 2, 0), Color = color, Material = Enum.Material.Glass })
	glass.Transparency = 0.35
end

BUILD.roundglasses = function(m)
	local frame = C(255, 140, 190)
	lens(m, -0.3, C(200, 230, 255), frame)
	lens(m, 0.3, C(200, 230, 255), frame)
	part(m, { Size = Vector3.new(0.2, 0.06, 0.06), CFrame = CFrame.new(0, 0.18, -0.1), Color = frame })
end

BUILD.heartglasses = function(m)
	local pink = C(255, 90, 150)
	for _, x in { -0.3, 0.3 } do
		ball(m, 0.26, CFrame.new(x - 0.08, 0.22, -0.12), pink, Enum.Material.Neon)
		ball(m, 0.26, CFrame.new(x + 0.08, 0.22, -0.12), pink, Enum.Material.Neon)
		part(m, { Size = Vector3.new(0.24, 0.24, 0.08), CFrame = CFrame.new(x, 0.1, -0.12) * CFrame.Angles(0, 0, math.rad(45)), Color = pink, Material = Enum.Material.Neon })
	end
	part(m, { Size = Vector3.new(0.2, 0.05, 0.05), CFrame = CFrame.new(0, 0.2, -0.1), Color = C(255, 255, 255) })
end

BUILD.starglasses = function(m)
	local gold = C(255, 214, 90)
	for _, x in { -0.32, 0.32 } do
		for k = 0, 4 do
			local a = k * math.pi * 2 / 5 + math.pi / 2
			ball(m, 0.16, CFrame.new(x + math.cos(a) * 0.17, 0.16 + math.sin(a) * 0.17, -0.12), gold, Enum.Material.Neon)
		end
		ball(m, 0.24, CFrame.new(x, 0.16, -0.12), C(255, 250, 220), Enum.Material.Neon)
	end
	part(m, { Size = Vector3.new(0.2, 0.05, 0.05), CFrame = CFrame.new(0, 0.18, -0.1), Color = gold })
end

BUILD.cheekhearts = function(m)
	for _, x in { -0.38, 0.38 } do
		ball(m, 0.13, CFrame.new(x - 0.05, -0.12, -0.05), C(255, 120, 170))
		ball(m, 0.13, CFrame.new(x + 0.05, -0.12, -0.05), C(255, 120, 170))
		part(m, { Size = Vector3.new(0.11, 0.11, 0.05), CFrame = CFrame.new(x, -0.17, -0.05) * CFrame.Angles(0, 0, math.rad(45)), Color = C(255, 120, 170) })
	end
end

-- ---- て（左手の にぎるところが原点。手の上（+Y）が うでのほう。前が -Z） ----
local FORWARD = CFrame.Angles(math.rad(-70), 0, 0) -- 手から 前の上へ のびる向き

BUILD.lollipophand = function(m)
	local base = FORWARD
	pillar(m, 1.6, 0.12, base * CFrame.new(0, 0.6, 0), WHITE)
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.15, 1.1, 1.1), CFrame = base * CFrame.new(0, 1.55, 0) * CFrame.Angles(0, math.pi / 2, 0), Color = C(255, 120, 190) })
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.17, 0.65, 0.65), CFrame = base * CFrame.new(0, 1.55, 0) * CFrame.Angles(0, math.pi / 2, 0), Color = C(255, 230, 245) })
	ball(m, 0.25, base * CFrame.new(0, 1.55, 0), C(130, 210, 255), Enum.Material.Neon)
end

BUILD.cottonstick = function(m)
	local base = FORWARD
	pillar(m, 1.4, 0.1, base * CFrame.new(0, 0.5, 0), C(240, 220, 190))
	ball(m, 1.0, base * CFrame.new(0, 1.45, 0), C(255, 200, 230))
	ball(m, 0.75, base * CFrame.new(0.3, 1.25, 0.1), C(200, 225, 255))
	ball(m, 0.7, base * CFrame.new(-0.28, 1.3, -0.1), C(255, 230, 245))
end

BUILD.starwand = function(m)
	local base = FORWARD
	pillar(m, 1.6, 0.12, base * CFrame.new(0, 0.6, 0), C(255, 214, 90), Enum.Material.Neon)
	local tip = base * CFrame.new(0, 1.6, 0)
	ball(m, 0.4, tip, C(255, 245, 170), Enum.Material.Neon)
	for k = 0, 4 do
		local a = k * math.pi * 2 / 5 + math.pi / 2
		ball(m, 0.24, tip * CFrame.new(math.cos(a) * 0.3, math.sin(a) * 0.3, 0), C(255, 214, 90), Enum.Material.Neon)
	end
	ball(m, 0.18, tip * CFrame.new(0.35, 0.4, 0), C(255, 150, 210), Enum.Material.Neon)
end

BUILD.heartballoon = function(m)
	-- ひもは 手から上へ。先に ハートの ふうせん
	pillar(m, 3.2, 0.05, CFrame.new(0, 0, 0), WHITE)
	local top = CFrame.new(0, 3.9, 0)
	local pink = C(255, 100, 160)
	ellipsoid(m, Vector3.new(0.9, 0.9, 0.6), top * CFrame.new(-0.28, 0.2, 0), pink)
	ellipsoid(m, Vector3.new(0.9, 0.9, 0.6), top * CFrame.new(0.28, 0.2, 0), pink)
	part(m, { Size = Vector3.new(0.75, 0.75, 0.55), CFrame = top * CFrame.new(0, -0.2, 0) * CFrame.Angles(0, 0, math.rad(45)), Color = pink })
	ball(m, 0.18, top * CFrame.new(-0.3, 0.35, -0.3), WHITE, Enum.Material.Neon)
end

-- ---- せなか（追加） ----
BUILD.candybackpack = function(m)
	ellipsoid(m, Vector3.new(1.5, 1.7, 0.9), CFrame.new(0, 0, 0.55), C(255, 170, 200))
	ellipsoid(m, Vector3.new(1.1, 0.7, 0.4), CFrame.new(0, -0.35, 0.95), C(255, 230, 240)) -- ポケット
	ball(m, 0.35, CFrame.new(-0.35, 0.65, 0.95), C(255, 90, 120)) -- グミ
	ball(m, 0.35, CFrame.new(0.05, 0.75, 0.95), C(140, 230, 160))
	ball(m, 0.35, CFrame.new(0.4, 0.62, 0.95), C(255, 220, 90))
end

-- ---- いしょう（きぐるみ・ドレス）。体の部分ごとに、その部分の大きさに合わせて付ける ----
-- bone: 付ける体の部分 / shape: ball・ellipsoid・cylinder / size・at は その部分の大きさに対する倍率（アバターの体型に合わせる）
-- LowerTorso は うすいので、高さの倍率は「よこはば × 0.2」を 1 として測る。前は -Z（顔のむき）
local OUTFITS: { [string]: { any } } = {
	bearsuit = {
		{ bone = "UpperTorso", shape = "ellipsoid", size = Vector3.new(1.3, 1.25, 1.6), at = Vector3.new(0, 0, 0), color = C(255, 110, 140) },
		{ bone = "UpperTorso", shape = "ellipsoid", size = Vector3.new(0.75, 0.8, 0.3), at = Vector3.new(0, -0.05, -0.72), color = C(255, 200, 210) }, -- おなか
		{ bone = "LowerTorso", shape = "ellipsoid", size = Vector3.new(1.3, 2.4, 1.6), at = Vector3.new(0, 0, 0), color = C(255, 110, 140) },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.4, 0.4, 0.4), at = Vector3.new(0, 0, 0.75), color = C(255, 140, 165) }, -- しっぽ
		{ bone = "Head", shape = "ellipsoid", size = Vector3.new(1.25, 1.2, 1.15), at = Vector3.new(0, 0.12, 0.12), color = C(255, 110, 140) }, -- フード
		{ bone = "Head", shape = "ball", size = Vector3.new(0.45, 0.45, 0.45), at = Vector3.new(-0.42, 0.62, 0.05), color = C(255, 110, 140) }, -- 耳
		{ bone = "Head", shape = "ball", size = Vector3.new(0.45, 0.45, 0.45), at = Vector3.new(0.42, 0.62, 0.05), color = C(255, 110, 140) },
		{ bone = "Head", shape = "ball", size = Vector3.new(0.22, 0.22, 0.22), at = Vector3.new(-0.42, 0.62, -0.12), color = C(255, 200, 210) },
		{ bone = "Head", shape = "ball", size = Vector3.new(0.22, 0.22, 0.22), at = Vector3.new(0.42, 0.62, -0.12), color = C(255, 200, 210) },
	},
	strawberrysuit = {
		{ bone = "UpperTorso", shape = "ellipsoid", size = Vector3.new(1.35, 1.3, 1.65), at = Vector3.new(0, 0, 0), color = C(240, 60, 90) },
		{ bone = "LowerTorso", shape = "ellipsoid", size = Vector3.new(1.15, 2.6, 1.45), at = Vector3.new(0, -0.1, 0), color = C(240, 60, 90) },
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.1, 0.1, 0.1), at = Vector3.new(-0.3, 0.2, -0.83), color = C(255, 236, 150) }, -- つぶつぶ
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.1, 0.1, 0.1), at = Vector3.new(0.3, 0.1, -0.83), color = C(255, 236, 150) },
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.1, 0.1, 0.1), at = Vector3.new(0, -0.2, -0.85), color = C(255, 236, 150) },
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.1, 0.1, 0.1), at = Vector3.new(-0.35, -0.3, -0.8), color = C(255, 236, 150) },
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.1, 0.1, 0.1), at = Vector3.new(0.38, -0.32, -0.8), color = C(255, 236, 150) },
		{ bone = "Head", shape = "ellipsoid", size = Vector3.new(1.2, 0.35, 1.2), at = Vector3.new(0, 0.55, 0), color = C(90, 190, 90) }, -- へたの ぼうし
		{ bone = "Head", shape = "cylinder", size = Vector3.new(0.12, 0.45, 0.12), at = Vector3.new(0, 0.85, 0), color = C(90, 170, 80) },
	},
	cottondress = {
		{ bone = "UpperTorso", shape = "ellipsoid", size = Vector3.new(1.15, 1.05, 1.3), at = Vector3.new(0, 0, 0), color = C(255, 220, 238) },
		{ bone = "LowerTorso", shape = "ellipsoid", size = Vector3.new(1.7, 6, 2.4), at = Vector3.new(0, -2.6, 0), color = C(255, 200, 230) }, -- ふわふわの スカート
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.7, 0.7, 0.7), at = Vector3.new(-0.7, -4.8, -0.7), color = C(200, 225, 255) },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.7, 0.7, 0.7), at = Vector3.new(0.7, -4.8, -0.7), color = C(255, 240, 250) },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.7, 0.7, 0.7), at = Vector3.new(0, -5, 0.9), color = C(200, 225, 255) },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.7, 0.7, 0.7), at = Vector3.new(-0.8, -4.8, 0.5), color = C(255, 240, 250) },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.7, 0.7, 0.7), at = Vector3.new(0.8, -4.8, 0.5), color = C(200, 225, 255) },
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.14, 0.14, 0.14), at = Vector3.new(0, 0.25, -0.68), color = C(255, 120, 180), material = Enum.Material.Neon }, -- むねの リボン
	},
	cupcakedress = {
		{ bone = "UpperTorso", shape = "ellipsoid", size = Vector3.new(1.2, 1.1, 1.35), at = Vector3.new(0, 0.05, 0), color = C(255, 250, 252) }, -- クリーム
		{ bone = "UpperTorso", shape = "ball", size = Vector3.new(0.15, 0.15, 0.15), at = Vector3.new(0, 0.5, -0.6), color = C(230, 40, 70) }, -- さくらんぼ
		{ bone = "LowerTorso", shape = "cylinder", size = Vector3.new(1.6, 5.2, 1.6), at = Vector3.new(0, -2.4, 0), color = C(255, 165, 200) }, -- カップ
		{ bone = "LowerTorso", shape = "cylinder", size = Vector3.new(1.75, 0.5, 1.75), at = Vector3.new(0, 0.5, 0), color = C(255, 250, 252) },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.09, 0.09, 0.09), at = Vector3.new(-0.5, 0.6, -0.85), color = C(120, 200, 255), material = Enum.Material.Neon },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.09, 0.09, 0.09), at = Vector3.new(0.4, 0.55, -0.88), color = C(255, 220, 100), material = Enum.Material.Neon },
		{ bone = "LowerTorso", shape = "ball", size = Vector3.new(0.09, 0.09, 0.09), at = Vector3.new(0, 0.62, -0.9), color = C(160, 230, 160), material = Enum.Material.Neon },
	},
}

-- 体の部分の かわり（R6 の体には UpperTorso などが ないので）
local FALLBACK = { UpperTorso = "Torso", LowerTorso = "Torso", Head = "Head" }
-- ふつうの大きさ（見本の3Dで使う）
local STANDARD = {
	UpperTorso = { cf = CFrame.new(0, 0.8, 0), size = Vector3.new(2, 1.6, 1) },
	LowerTorso = { cf = CFrame.new(0, -0.2, 0), size = Vector3.new(2, 0.4, 1) },
	Head = { cf = CFrame.new(0, 2.2, 0), size = Vector3.new(1.2, 1.2, 1.2) },
}

-- いしょうを作る。boneOf(name) は その体の部分の (CFrame, Size, 本当の名前) を返す（なければ nil）
-- 返す: いしょうの Model と、部品ごとの「くっつける体の部分の名前」
local function buildOutfit(id: string, boneOf: (string) -> (CFrame?, Vector3?, string?)): (Model?, { [BasePart]: string })
	local spec = OUTFITS[id]
	if not spec then
		return nil, {}
	end
	local m = Instance.new("Model")
	m.Name = id
	local bones = {}
	for _, piece in spec do
		local cf, size, name = boneOf(piece.bone)
		if cf and size then
			-- R6 の Torso 1つに、UpperTorso・LowerTorso の両方を付けるときは、上と下に分ける
			if name == "Torso" and piece.bone == "UpperTorso" then
				cf = cf * CFrame.new(0, size.Y * 0.2, 0)
				size = Vector3.new(size.X, size.Y * 0.8, size.Z)
			elseif name == "Torso" and piece.bone == "LowerTorso" then
				cf = cf * CFrame.new(0, -size.Y * 0.4, 0)
				size = Vector3.new(size.X, size.Y * 0.2, size.Z)
			end
			local scale = Vector3.new(size.X, if piece.bone == "LowerTorso" then size.X * 0.2 else size.Y, size.Z)
			local pieceSize = piece.size * scale
			local at = cf * CFrame.new(piece.at * scale)
			local p
			if piece.shape == "ball" then
				p = ball(m, math.max(0.1, pieceSize.X), at, piece.color, piece.material)
			elseif piece.shape == "cylinder" then
				p = pillar(m, pieceSize.Y, math.max(pieceSize.X, pieceSize.Z), at, piece.color, piece.material)
			else
				p = ellipsoid(m, pieceSize, at, piece.color, piece.material)
			end
			bones[p] = name or piece.bone
		end
	end
	return m, bones
end

local CosmeticVisuals = {}

function CosmeticVisuals.isOutfit(id: string): boolean
	return OUTFITS[id] ~= nil
end

-- キャラクターに着せる いしょうを作る（部品は もう体の位置に置いてある。あとは体に くっつけるだけ）
function CosmeticVisuals.buildOutfitFor(id: string, character: Model): (Model?, { [BasePart]: string })
	return buildOutfit(id, function(bone)
		local body = character:FindFirstChild(bone) or character:FindFirstChild(FALLBACK[bone] or "")
		if body and body:IsA("BasePart") then
			return body.CFrame, body.Size, body.Name
		end
		return nil
	end)
end

function CosmeticVisuals.build(id: string): Model?
	if OUTFITS[id] then
		-- 見本（おしゃれ画面の3D）は、ふつうの体の大きさで作る
		local m = buildOutfit(id, function(bone)
			local std = STANDARD[bone]
			return std.cf, std.size, bone
		end)
		return m
	end
	local f = BUILD[id]
	if not f then
		return nil
	end
	local m = Instance.new("Model")
	m.Name = id
	f(m)
	return m
end
return CosmeticVisuals

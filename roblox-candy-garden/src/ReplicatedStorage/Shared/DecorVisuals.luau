local C = Color3.fromRGB

-- ---- 部品づくり ----
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

local function ball(model: Model, d: number, pos: Vector3, color: Color3, material: Enum.Material?)
	return part(model, { Shape = Enum.PartType.Ball, Size = Vector3.one * d, Position = pos, Color = color, Material = material or Enum.Material.SmoothPlastic })
end

-- 軸が縦の円柱（足元 y から高さ h）
local function pillar(model: Model, h: number, d: number, pos: Vector3, color: Color3, material: Enum.Material?, collide: boolean?)
	return part(model, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(h, d, d),
		CFrame = CFrame.new(pos + Vector3.new(0, h / 2, 0)) * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
		CanCollide = collide or false,
	})
end

local function glow(p: BasePart, color: Color3, range: number)
	local l = Instance.new("PointLight")
	l.Color = color
	l.Range = range
	l.Brightness = 1.2
	l.Parent = p
end

-- ---- 飾りの形（足元の中心が原点。前は -Z） ----
local BUILD = {}

BUILD.candylamp = function(m)
	for k = 0, 4 do
		pillar(m, 1, 0.5, Vector3.new(0, k, 0), if k % 2 == 0 then C(255, 255, 255) else C(255, 110, 160))
	end
	local bulb = ball(m, 1.4, Vector3.new(0, 5.6, 0), C(255, 236, 170), Enum.Material.Neon)
	glow(bulb, C(255, 220, 160), 14) -- 夜は あかりになる
end

BUILD.flowerbed = function(m)
	part(m, { Size = Vector3.new(4.5, 1, 2.2), Position = Vector3.new(0, 0.5, 0), Color = C(190, 135, 95), Material = Enum.Material.Wood })
	local colors = { C(255, 120, 170), C(255, 220, 100), C(170, 150, 255), C(130, 220, 255), C(255, 160, 120) }
	for i, c in colors do
		local x = -1.8 + (i - 1) * 0.9
		pillar(m, 1, 0.15, Vector3.new(x, 1, 0), C(90, 180, 90))
		ball(m, 0.8, Vector3.new(x, 2.1, 0), c)
	end
end

BUILD.cupcakehouse = function(m)
	pillar(m, 1.6, 3.2, Vector3.zero, C(255, 160, 200), nil, true)
	ball(m, 3.4, Vector3.new(0, 2, 0), C(255, 248, 252))
	ball(m, 0.8, Vector3.new(0, 3.7, 0), C(230, 40, 70))
	for i = 1, 6 do
		local a = i * math.pi / 3
		ball(m, 0.3, Vector3.new(math.cos(a) * 1.3, 2.7, math.sin(a) * 1.3), C(120, 200, 255), Enum.Material.Neon)
	end
end

BUILD.lollitree = function(m)
	pillar(m, 6, 0.4, Vector3.zero, C(255, 255, 255))
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.5, 4, 4), CFrame = CFrame.new(0, 7.5, 0) * CFrame.Angles(0, math.pi / 2, 0), Color = C(120, 220, 255), Material = Enum.Material.Glass })
	part(m, { Shape = Enum.PartType.Cylinder, Size = Vector3.new(0.55, 2.6, 2.6), CFrame = CFrame.new(0, 7.5, 0) * CFrame.Angles(0, math.pi / 2, 0), Color = C(255, 130, 200), Material = Enum.Material.Glass })
	ball(m, 0.9, Vector3.new(0, 7.5, -0.2), C(255, 255, 255), Enum.Material.Neon)
end

BUILD.fountain = function(m)
	pillar(m, 0.8, 6.5, Vector3.zero, C(255, 225, 238), Enum.Material.Marble, true)
	pillar(m, 0.3, 5.6, Vector3.new(0, 0.8, 0), C(140, 200, 255), Enum.Material.Glass) -- 水
	pillar(m, 2.2, 0.8, Vector3.new(0, 0.8, 0), C(255, 200, 225), Enum.Material.Marble)
	pillar(m, 0.4, 2.6, Vector3.new(0, 3, 0), C(255, 225, 238), Enum.Material.Marble)
	local top = ball(m, 1.1, Vector3.new(0, 3.9, 0), C(170, 220, 255), Enum.Material.Glass)
	local spray = Instance.new("ParticleEmitter")
	spray.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	spray.Color = ColorSequence.new(C(170, 220, 255), C(255, 255, 255))
	spray.Rate = 14
	spray.Lifetime = NumberRange.new(0.8, 1.2)
	spray.Speed = NumberRange.new(5, 7)
	spray.SpreadAngle = Vector2.new(25, 25)
	spray.EmissionDirection = Enum.NormalId.Top
	spray.Acceleration = Vector3.new(0, -14, 0)
	spray.Size = NumberSequence.new(0.35, 0.1)
	spray.LightEmission = 0.5
	spray.Parent = top
end

BUILD.bearstatue = function(m)
	pillar(m, 1.2, 3, Vector3.zero, C(255, 240, 246), Enum.Material.Marble, true)
	local red = C(255, 90, 120)
	local function gummy(d, pos)
		local b = ball(m, d, pos, red, Enum.Material.Glass)
		b.Transparency = 0.15
	end
	gummy(2.6, Vector3.new(0, 2.6, 0))
	gummy(2, Vector3.new(0, 4.6, 0))
	gummy(0.8, Vector3.new(-0.75, 5.5, 0))
	gummy(0.8, Vector3.new(0.75, 5.5, 0))
	gummy(0.9, Vector3.new(-1.3, 2.9, -0.2))
	gummy(0.9, Vector3.new(1.3, 2.9, -0.2))
	ball(m, 0.25, Vector3.new(-0.4, 4.8, -0.9), C(60, 30, 50))
	ball(m, 0.25, Vector3.new(0.4, 4.8, -0.9), C(60, 30, 50))
end

BUILD.rainbowarch = function(m)
	local colors = { C(255, 110, 140), C(255, 180, 100), C(255, 235, 120), C(140, 225, 160), C(130, 190, 255), C(190, 150, 255) }
	for band, c in colors do
		local radius = 5 - band * 0.45
		for k = 0, 14 do
			local a = math.pi * k / 14
			ball(m, 0.6, Vector3.new(math.cos(a) * radius, math.sin(a) * radius + 0.3, 0), c, Enum.Material.Neon)
		end
	end
	for _, x in { -5.2, 5.2 } do
		ball(m, 1.6, Vector3.new(x, 0.6, 0), C(255, 255, 255)) -- 雲のくつした
	end
end

BUILD.castle = function(m)
	part(m, { Size = Vector3.new(7, 5, 6), Position = Vector3.new(0, 2.5, 0), Color = C(255, 225, 238), Material = Enum.Material.Marble, CanCollide = true })
	part(m, { Size = Vector3.new(2, 2.6, 0.4), Position = Vector3.new(0, 1.3, -3.05), Color = C(180, 120, 90), Material = Enum.Material.Wood }) -- とびら
	for _, x in { -3.8, 3.8 } do
		for _, z in { -3.2, 3.2 } do
			pillar(m, 7, 2, Vector3.new(x, 0, z), C(255, 200, 225), Enum.Material.Marble, true)
			ball(m, 2.4, Vector3.new(x, 7.6, z), C(255, 120, 180))
			ball(m, 0.6, Vector3.new(x, 9, z), C(255, 230, 120), Enum.Material.Neon)
		end
	end
	pillar(m, 9, 2.6, Vector3.new(0, 0, 0.5), C(255, 210, 230), Enum.Material.Marble)
	local top = ball(m, 3, Vector3.new(0, 9.8, 0.5), C(200, 150, 255))
	local star = ball(m, 0.9, Vector3.new(0, 11.6, 0.5), C(255, 240, 150), Enum.Material.Neon)
	glow(star, C(255, 230, 160), 16)
	local _ = top
end


local DecorVisuals = {}
function DecorVisuals.build(id: string): Model?
 local f=BUILD[id];if not f then return nil end
 local m=Instance.new("Model");m.Name=id;f(m);return m
end
return DecorVisuals

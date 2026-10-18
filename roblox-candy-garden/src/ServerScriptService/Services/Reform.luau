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

local Reform = {}
Reform.onChanged = nil :: ((Player) -> ())? -- 段が上がったとき（名札のランクを直す。Decor がつなぐ）

local C = Color3.fromRGB
local BASE_SPOT = Vector3.new(0, 0, 24.5) -- ひみつきちの場所（庭の床の中心から。+Z が庭のうしろ＝外がわ）

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

local function door(parent: Instance, pos: Vector3, color: Color3)
	box(parent, Vector3.new(1.8, 2.8, 0.3), pos + Vector3.new(0, 1.4, 0), color, Enum.Material.Wood)
	ball(parent, 0.25, pos + Vector3.new(0.55, 1.4, -0.2), C(255, 220, 120))
end

-- 入口の上の名札「〇〇の ひみつきち」（自分だけの物だと ひと目で分かる）
local function nameplate(parent: Instance, pos: Vector3, owner: string, width: number)
	local board = box(parent, Vector3.new(width, 1.1, 0.25), pos, C(255, 248, 252))
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 40
	gui.LightInfluence = 0
	gui.Parent = board
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = C(200, 70, 130)
	label.Text = owner
	label.Parent = gui
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0.1, 0)
	pad.PaddingBottom = UDim.new(0.1, 0)
	pad.Parent = label
end

-- ---- ひみつきちの形（足元の中心が原点。前（-Z）が庭のほう） ----
local BASE = {}

-- 1: テント
BASE[1] = function(m)
	local stripes = { C(255, 150, 190), C(255, 255, 255) }
	for i = 1, 4 do
		local z = -3 + (i - 0.5) * 1.5
		local color = stripes[(i % 2) + 1]
		wedge(m, Vector3.new(1.5, 4, 2.5), CFrame.new(-1.25, 2, z) * CFrame.Angles(0, math.pi / 2, 0), color)
		wedge(m, Vector3.new(1.5, 4, 2.5), CFrame.new(1.25, 2, z) * CFrame.Angles(0, -math.pi / 2, 0), color)
	end
	box(m, Vector3.new(1.4, 2.2, 0.2), Vector3.new(0, 1.1, -3.05), C(110, 70, 110)) -- 入口
	pillar(m, 2, 0.15, Vector3.new(0, 4, 0), C(255, 255, 255))
	box(m, Vector3.new(0.1, 0.8, 1.2), Vector3.new(0, 5.5, 0.6), C(255, 210, 90)) -- はた
	-- 入口の前に 立て札
	pillar(m, 1.2, 0.25, Vector3.new(0, 0, -4.4), C(170, 120, 84))
	return 1.6, 4, -4.6
end

-- 2: カップケーキの こや
BASE[2] = function(m)
	pillar(m, 4, 7, Vector3.zero, C(255, 165, 200), nil, true)
	for k = 0, 11 do -- カップのひだ
		local a = k * math.pi / 6
		pillar(m, 4, 0.5, Vector3.new(math.cos(a) * 3.45, 0, math.sin(a) * 3.45), C(255, 195, 220))
	end
	ball(m, 7.6, Vector3.new(0, 5, 0), C(255, 250, 252))
	ball(m, 1.4, Vector3.new(0, 8.8, 0), C(230, 40, 70))
	for i = 1, 8 do
		local a = i * math.pi / 4
		ball(m, 0.45, Vector3.new(math.cos(a) * 3.2, 6.6, math.sin(a) * 3.2), if i % 2 == 0 then C(120, 200, 255) else C(255, 220, 100), Enum.Material.Neon)
	end
	door(m, Vector3.new(0, 0, -3.5), C(170, 110, 80))
	window(m, Vector3.new(2.1, 2.4, -2.85))
	return 4.6, 6, -3.95
end

-- 3: キャンディの おうち
BASE[3] = function(m)
	box(m, Vector3.new(9, 5, 7), Vector3.new(0, 2.5, 0), C(255, 236, 200), nil, true)
	roof(m, 10, 8.4, 3.2, 5, C(140, 85, 60)) -- チョコの屋根
	for x = -4.5, 4.5, 1.5 do -- 屋根のふちの クリーム
		ball(m, 0.9, Vector3.new(x, 5.1, -4.1), C(255, 250, 252))
	end
	pillar(m, 3.5, 1, Vector3.new(2.8, 5.5, 1.5), C(255, 255, 255)) -- えんとつ（キャンディケイン）
	pillar(m, 0.6, 1.1, Vector3.new(2.8, 6.4, 1.5), C(230, 50, 70))
	pillar(m, 0.6, 1.1, Vector3.new(2.8, 7.8, 1.5), C(230, 50, 70))
	door(m, Vector3.new(0, 0, -3.55), C(230, 90, 120))
	window(m, Vector3.new(-2.7, 2.8, -3.55))
	window(m, Vector3.new(2.7, 2.8, -3.55))
	box(m, Vector3.new(2, 0.5, 0.6), Vector3.new(-2.7, 1.8, -3.8), C(150, 105, 75), Enum.Material.Wood) -- 花だん
	for k = -1, 1 do
		ball(m, 0.5, Vector3.new(-2.7 + k * 0.6, 2.2, -3.8), ({ C(255, 120, 170), C(255, 220, 100), C(170, 150, 255) })[k + 2])
	end
	return 4.4, 7, -3.7
end

-- 4: 2かいだての おうち
BASE[4] = function(m)
	box(m, Vector3.new(10, 4.5, 8), Vector3.new(0, 2.25, 0), C(255, 214, 230), nil, true)
	box(m, Vector3.new(9, 4, 7.4), Vector3.new(0, 6.5, 0.3), C(220, 240, 255), nil, true)
	roof(m, 10.6, 9, 3.4, 8.5, C(255, 120, 170))
	box(m, Vector3.new(6, 0.4, 1.6), Vector3.new(0, 4.7, -4.6), C(255, 255, 255)) -- バルコニー
	for x = -2.8, 2.8, 0.7 do
		pillar(m, 1, 0.15, Vector3.new(x, 4.9, -5.3), C(255, 255, 255))
	end
	door(m, Vector3.new(0, 0, -4.05), C(170, 110, 80))
	window(m, Vector3.new(-3.2, 2.5, -4.05))
	window(m, Vector3.new(3.2, 2.5, -4.05))
	window(m, Vector3.new(-2.6, 6.6, -3.45), Vector2.new(1.6, 1.8))
	window(m, Vector3.new(2.6, 6.6, -3.45), Vector2.new(1.6, 1.8))
	for _, x in { -6.2, 6.2 } do -- ペロペロキャンディの あかり
		pillar(m, 4, 0.3, Vector3.new(x, 0, -3.5), C(255, 255, 255))
		ball(m, 1.3, Vector3.new(x, 4.6, -3.5), C(255, 200, 230), Enum.Material.Neon)
	end
	return 3.95, 7, -4.25
end

-- 5: ゆめの キャンディパレス
BASE[5] = function(m)
	box(m, Vector3.new(11, 6, 8), Vector3.new(0, 3, 0), C(255, 228, 240), Enum.Material.Marble, true)
	box(m, Vector3.new(7, 3, 6), Vector3.new(0, 7.5, 0.5), C(245, 225, 255), Enum.Material.Marble, true)
	for _, x in { -5.5, 5.5 } do
		for _, z in { -4, 4 } do
			pillar(m, 9, 2.2, Vector3.new(x, 0, z), C(255, 200, 225), Enum.Material.Marble, true)
			ball(m, 2.6, Vector3.new(x, 9.6, z), C(190, 150, 255))
			ball(m, 0.7, Vector3.new(x, 11.2, z), C(255, 236, 150), Enum.Material.Neon)
		end
	end
	pillar(m, 13, 3, Vector3.new(0, 0, 1), C(255, 214, 236), Enum.Material.Marble)
	ball(m, 3.6, Vector3.new(0, 13.6, 1), C(255, 130, 190))
	local star = ball(m, 1.3, Vector3.new(0, 16, 1), C(255, 240, 150), Enum.Material.Neon)
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
	local light = Instance.new("PointLight") -- 夜に ひかる（ひとつだけ。重くしない）
	light.Color = C(255, 230, 170)
	light.Range = 18
	light.Brightness = 1.2
	light.Parent = star
	-- にじの かいだん
	local rainbow = { C(255, 110, 140), C(255, 180, 100), C(255, 235, 120), C(140, 225, 160), C(130, 190, 255) }
	for i, c in rainbow do
		box(m, Vector3.new(4, 0.4, 1), Vector3.new(0, 0.2 * i - 0.2, -4.2 - (5 - i) * 0.6 + 0.6), c, Enum.Material.Neon)
	end
	door(m, Vector3.new(0, 0, -4.05), C(255, 120, 170))
	window(m, Vector3.new(-3, 3.2, -4.05))
	window(m, Vector3.new(3, 3.2, -4.05))
	window(m, Vector3.new(0, 7.6, -2.55), Vector2.new(2, 1.6))
	return 5, 6.4, -4.2
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

-- ひみつきちの とびらの位置（前のかべ。段ごと）
local DOOR_Z = { -3.2, -3.6, -3.7, -4.2, -4.3 }

local function buildBase(plot, level: number, owner: string, d, extra: Instance)
	local build = BASE[math.min(level, #BASE)]
	if not build then
		return
	end
	local m = Instance.new("Model")
	m.Name = "SecretBase"
	local signY, signWidth, signZ = build(m)
	-- 名札「〇〇の ひみつきち」
	nameplate(m, Vector3.new(0, signY, signZ), owner, signWidth)
	m.WorldPivot = CFrame.new()
	local base = plot.model.PrimaryPart.CFrame * CFrame.new(0, -0.5, 0) * CFrame.new(BASE_SPOT)
	-- 前（-Z）を庭の中へ向ける
	local center = plot.model.PrimaryPart.Position
	local pivot = CFrame.lookAt(base.Position, Vector3.new(center.X, base.Position.Y, center.Z))
	m:PivotTo(pivot)
	m.Parent = extra
	-- 中に入れる（とびらの前で「はいる」）
	local doorZ = DOOR_Z[math.min(level, #DOOR_Z)]
	local entrance = part(m, { Name = "Entrance", Size = Vector3.new(3, 3, 0.5), CFrame = pivot * CFrame.new(0, 1.5, doorZ - 0.4), Transparency = 1 })
	local outside = pivot * CFrame.new(0, 3, doorZ - 4) -- 出たら、とびらの前で 庭のほうを向く
	local room = Room.build(plot, level, d, extra, outside)
	Room.addEntrance(entrance, room)
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
	-- ひみつきちが なくなるときは、中にいる人を先に外へ
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
		buildBase(plot, baseLevel, "🏠 " .. player.DisplayName, d, extra)
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

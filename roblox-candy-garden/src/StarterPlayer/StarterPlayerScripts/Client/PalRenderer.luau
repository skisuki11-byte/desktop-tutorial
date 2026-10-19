-- ペットの見た目と連れ歩き。各クライアントが自分の画面で描画する（サーバーの負荷を増やさない）。
-- 連れているペットの種類は、サーバーが Player の属性 EquippedPals に入れてくれる。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local PetVisuals = require(ReplicatedStorage.Shared.PetVisuals)
local PetAnimator = require(ReplicatedStorage.Shared.PetAnimator)

local PalRenderer = {}

-- ペットは キャラの ななめうしろの 左右に ならぶ（まうしろだと カメラとキャラの あいだに入って 前が見えなくなる）
local SLOTS = { Vector3.new(-3.6, 0, 2.5), Vector3.new(3.6, 0, 2.5) } -- 連れられるのは2匹まで（3匹だと ごちゃごちゃする）
local FOLLOW_SPEED = 9

local folder
local entries: { [Player]: { key: string, pals: { { model: Model, pos: Vector3?, size: number } }, away: boolean? } } = {}

local function part(parent: Instance, name: string, shape: Enum.PartType, size: Vector3, cf: CFrame, color: Color3)
	local p = Instance.new("Part")
	p.Name = name
	p.Shape = shape
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

-- 原点に作って、体(Body)を基準にしてあとで動かす。前は -Z。
local function buildPet(cfg): (Model, number)
	local size = 1.8 + cfg.rarity * 0.25
	local meshModel = PetVisuals.create(cfg, size)
	if meshModel then
		return meshModel, size
	end
	local model = Instance.new("Model")
	model.Name = cfg.id
	local ball = Enum.PartType.Ball
	local cyl = Enum.PartType.Cylinder
	local block = Enum.PartType.Block
	local color = cfg.color
	local light = color:Lerp(Color3.new(1, 1, 1), 0.5)

	local body = part(model, "Body", ball, Vector3.one * size, CFrame.new(), color)
	model.PrimaryPart = body
	local r = size / 2

	-- 顔
	for _, x in { -0.32, 0.32 } do
		part(model, "Eye", ball, Vector3.one * (size * 0.16), CFrame.new(x * size, r * 0.25, -r * 0.88), Color3.fromRGB(60, 35, 75))
	end
	part(model, "Cheek", ball, Vector3.new(size * 0.7, size * 0.18, size * 0.1), CFrame.new(0, -r * 0.05, -r * 0.93), light)
	-- しっぽ
	part(model, "Tail", ball, Vector3.one * (size * 0.34), CFrame.new(0, -r * 0.25, r * 0.95), light)

	if cfg.ears == "round" then
		for _, x in { -1, 1 } do
			part(model, "Ear", ball, Vector3.one * (size * 0.34), CFrame.new(x * r * 0.62, r * 0.82, 0), color)
		end
	elseif cfg.ears == "long" then
		for _, x in { -1, 1 } do
			part(
				model,
				"Ear",
				cyl,
				Vector3.new(size * 0.8, size * 0.24, size * 0.24),
				CFrame.new(x * r * 0.42, r * 1.35, 0) * CFrame.Angles(0, 0, math.pi / 2),
				color
			)
		end
	elseif cfg.ears == "point" then
		for _, x in { -1, 1 } do
			part(
				model,
				"Ear",
				block,
				Vector3.new(size * 0.3, size * 0.3, size * 0.1),
				CFrame.new(x * r * 0.58, r * 0.86, 0) * CFrame.Angles(0, 0, math.rad(45)),
				color
			)
		end
	elseif cfg.ears == "horn" then
		local horn = part(
			model,
			"Horn",
			cyl,
			Vector3.new(size * 0.6, size * 0.14, size * 0.14),
			CFrame.new(0, r * 1.15, -r * 0.35) * CFrame.Angles(0, 0, math.pi / 2) * CFrame.Angles(math.rad(-20), 0, 0),
			Color3.fromRGB(255, 220, 110)
		)
		horn.Material = Enum.Material.Neon
	elseif cfg.ears == "wings" then
		for _, x in { -1, 1 } do
			part(model, "Wing", ball, Vector3.new(size * 0.1, size * 0.7, size * 0.5), CFrame.new(x * r * 1.05, r * 0.3, r * 0.2), light)
		end
		local horn = part(
			model,
			"Horn",
			cyl,
			Vector3.new(size * 0.4, size * 0.12, size * 0.12),
			CFrame.new(0, r * 1.0, -r * 0.4) * CFrame.Angles(0, 0, math.pi / 2),
			Color3.fromRGB(255, 120, 150)
		)
		horn.Material = Enum.Material.Neon
		-- でんせつは光る
		local glow = Instance.new("PointLight")
		glow.Color = color
		glow.Range = 10
		glow.Brightness = 1.5
		glow.Parent = body
	end
	-- わたあめクジラ: 横に長い体、しっぽのひれ、頭の上の潮ふき（水色の玉）
	if cfg.ears == "whale" then
		-- 横長の体（Ball は縦横を別にできないので、四角＋球のメッシュにする）
		body.Shape = Enum.PartType.Block
		body.Size = Vector3.new(size * 1.35, size, size * 1.1)
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere
		mesh.Parent = body
		for _, x in { -1, 1 } do
			part(model, "Fin", ball, Vector3.new(size * 0.5, size * 0.12, size * 0.35), CFrame.new(x * r * 1.2, -r * 0.2, r * 0.1) * CFrame.Angles(0, 0, x * math.rad(-30)), light)
		end
		part(model, "Tail", block, Vector3.new(size * 0.8, size * 0.12, size * 0.35), CFrame.new(0, r * 0.2, r * 1.15) * CFrame.Angles(math.rad(-25), 0, 0), color)
		for k = 0, 2 do
			local drop = part(model, "Spout", ball, Vector3.one * (size * (0.22 - k * 0.04)), CFrame.new((k - 1) * r * 0.2, r * (1.05 + k * 0.25), -r * 0.1), Color3.fromRGB(190, 230, 255))
			drop.Material = Enum.Material.Glass
			drop.Transparency = 0.2
		end
	end
	-- ゆめいろフェニックス: 虹色に光る大きなはねと、頭のかざり。ふわっと光る
	if cfg.ears == "phoenix" then
		local rainbow = {
			Color3.fromRGB(255, 120, 160), Color3.fromRGB(255, 190, 110), Color3.fromRGB(255, 240, 140),
			Color3.fromRGB(150, 235, 170), Color3.fromRGB(140, 200, 255), Color3.fromRGB(200, 150, 255),
		}
		for _, x in { -1, 1 } do
			for k, c in rainbow do
				local feather = part(
					model,
					"Feather",
					ball,
					Vector3.new(size * 0.12, size * (0.75 - k * 0.07), size * 0.32),
					CFrame.new(x * r * (1.0 + k * 0.12), r * (0.55 - k * 0.12), r * (0.1 + k * 0.08)) * CFrame.Angles(0, 0, x * math.rad(-35 - k * 6)),
					c
				)
				feather.Material = Enum.Material.Neon
			end
		end
		for k = 1, 3 do
			local crest = part(model, "Crest", ball, Vector3.one * (size * 0.18), CFrame.new(0, r * (0.95 + k * 0.18), r * (k * 0.12)), rainbow[k * 2])
			crest.Material = Enum.Material.Neon
		end
		local glow = Instance.new("PointLight")
		glow.Color = Color3.fromRGB(255, 180, 230)
		glow.Range = 12
		glow.Brightness = 1.6
		glow.Parent = body
	end
	-- ほしぞらの まもりがみ: 夜空色の体に、頭の上の光の輪・おでこの星・大きなはね。自分で光る
	if cfg.ears == "guardian" then
		for i = 1, 10 do
			local a = (i / 10) * math.pi * 2
			local halo = part(
				model,
				"Halo",
				ball,
				Vector3.one * (size * 0.12),
				CFrame.new(math.cos(a) * r * 0.55, r * 1.25, math.sin(a) * r * 0.55),
				Color3.fromRGB(255, 240, 160)
			)
			halo.Material = Enum.Material.Neon
		end
		local star = part(
			model,
			"Star",
			block,
			Vector3.one * (size * 0.2),
			CFrame.new(0, r * 0.62, -r * 0.82) * CFrame.Angles(math.rad(45), 0, math.rad(45)),
			Color3.fromRGB(255, 245, 190)
		)
		star.Material = Enum.Material.Neon
		for _, x in { -1, 1 } do
			local wing = part(
				model,
				"Wing",
				ball,
				Vector3.new(size * 0.12, size * 0.95, size * 0.6),
				CFrame.new(x * r * 1.15, r * 0.35, r * 0.25) * CFrame.Angles(0, 0, x * math.rad(-25)),
				Color3.fromRGB(170, 200, 255)
			)
			wing.Material = Enum.Material.Neon
			wing.Transparency = 0.25
		end
		local glow = Instance.new("PointLight")
		glow.Color = Color3.fromRGB(160, 180, 255)
		glow.Range = 14
		glow.Brightness = 2
		glow.Parent = body
		local twinkle = Instance.new("ParticleEmitter")
		twinkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		twinkle.Rate = 8
		twinkle.Lifetime = NumberRange.new(0.8, 1.4)
		twinkle.Speed = NumberRange.new(0.5, 1.5)
		twinkle.SpreadAngle = Vector2.new(180, 180)
		twinkle.LightEmission = 1
		twinkle.Size = NumberSequence.new(0.35, 0)
		twinkle.Color = ColorSequence.new(Color3.fromRGB(200, 220, 255))
		twinkle.Parent = body
		body.Material = Enum.Material.Neon -- 夜空のように、ほんのり光る体
	end
	-- 質感: グミベアは本物のグミのように、つやつやで少し透ける。ほかの子は、つやのあるお菓子の質感
	for _, p in model:GetChildren() do
		if p:IsA("BasePart") and p.Name ~= "Eye" then
			if cfg.id == "gummybear" then
				-- ガラスの質感だと暗く出たので、明るい半透明＋つやにする（画面で確認して調整）
				p.Transparency = 0.15
				p.Reflectance = 0.08
				p.Color = p.Color:Lerp(Color3.fromRGB(255, 255, 255), 0.15)
			elseif p.Material == Enum.Material.SmoothPlastic then
				p.Reflectance = 0.05
			end
		elseif p:IsA("BasePart") and p.Name == "Eye" then
			p.Material = Enum.Material.Glass -- 目にきらっと光が入る
		end
	end
	return model, size
end

local function clear(player: Player)
	local entry = entries[player]
	if entry then
		for _, pal in entry.pals do
			PetAnimator.release(pal.model)
			pal.model:Destroy()
		end
		entries[player] = nil
	end
end

local function sync(player: Player)
	local key = player:GetAttribute("EquippedPals") or ""
	local entry = entries[player]
	if entry and entry.key == key then
		return
	end
	clear(player)
	local pals = {}
	if key ~= "" then
		for id in string.gmatch(key, "[^,]+") do
			local cfg = Config.PetById[id]
			if cfg and #pals < Config.MaxEquipped then
				local model, size = buildPet(cfg)
				model.Parent = folder
				table.insert(pals, { model = model, pos = nil, size = size })
			end
		end
	end
	entries[player] = { key = key, pals = pals }
end

local function track(player: Player)
	sync(player)
	player:GetAttributeChangedSignal("EquippedPals"):Connect(function()
		sync(player)
	end)
end

function PalRenderer.init()
	folder = Instance.new("Folder")
	folder.Name = "LocalPals"
	folder.Parent = workspace

	for _, player in Players:GetPlayers() do
		track(player)
	end
	Players.PlayerAdded:Connect(track)
	Players.PlayerRemoving:Connect(clear)

	RunService.RenderStepped:Connect(function(dt)
		local now = os.clock()
		for player, entry in entries do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			if root and root:IsA("BasePart") then
				-- ほかの子が ひみつきち（上空のへや）にいるあいだは、その子のペットも かくす
				local away = player ~= Players.LocalPlayer and root.Position.Y > 250
				if entry.away ~= away then
					entry.away = away
					for _, pal in entry.pals do
						for _, d in pal.model:GetDescendants() do
							if d:IsA("BasePart") or d:IsA("Decal") then
								d.LocalTransparencyModifier = if away then 1 else 0
							end
						end
					end
				end
				local moving = root.AssemblyLinearVelocity.Magnitude > 2
				local alpha = 1 - math.exp(-FOLLOW_SPEED * dt)
				for i, pal in entry.pals do
					local offset = SLOTS[i] or SLOTS[1]
					local ground = root.Position.Y - 2.6 + pal.size / 2
					local goal = root.CFrame.Position + root.CFrame:VectorToWorldSpace(Vector3.new(offset.X, 0, offset.Z))
					goal = Vector3.new(goal.X, ground, goal.Z)
					local bob = moving and math.abs(math.sin(now * 7 + i)) * 0.7 or math.sin(now * 2 + i) * 0.12
					local pos = pal.pos and pal.pos:Lerp(goal, alpha) or goal
					pal.pos = pos
					local look = root.CFrame.LookVector
					look = Vector3.new(look.X, 0, look.Z)
					if look.Magnitude < 0.01 then
						look = Vector3.new(0, 0, -1)
					end
					pal.model:PivotTo(CFrame.lookAt(pos + Vector3.new(0, bob, 0), pos + Vector3.new(0, bob, 0) + look))
					PetAnimator.step(pal.model,now+i,moving)
				end
			end
		end
	end)
end

return PalRenderer

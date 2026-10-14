-- ペットの見た目と連れ歩き。各クライアントが自分の画面で描画する（サーバーの負荷を増やさない）。
-- 連れているペットの種類は、サーバーが Player の属性 EquippedPals に入れてくれる。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)

local PalRenderer = {}

local SLOTS = { Vector3.new(-3.4, 0, 4), Vector3.new(3.4, 0, 4), Vector3.new(0, 0, 7.5) }
local FOLLOW_SPEED = 9

local folder
local entries: { [Player]: { key: string, pals: { { model: Model, pos: Vector3?, size: number } } } } = {}

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
	return model, size
end

local function clear(player: Player)
	local entry = entries[player]
	if entry then
		for _, pal in entry.pals do
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
				end
			end
		end
	end)
end

return PalRenderer

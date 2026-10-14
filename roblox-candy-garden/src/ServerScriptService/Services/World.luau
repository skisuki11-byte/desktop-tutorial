-- お菓子の庭のマップを全てコードで生成する（素材は使わない）。
-- 地面・飾り・ライティング・プレイヤーごとの庭（Plot）を作り、庭の割り当ても担当する。
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local World = {}

local PASTELS = {
	Color3.fromRGB(255, 170, 205),
	Color3.fromRGB(255, 210, 120),
	Color3.fromRGB(170, 220, 255),
	Color3.fromRGB(200, 170, 255),
	Color3.fromRGB(160, 235, 195),
}
local GROUND = Color3.fromRGB(140, 222, 178)
local PATH = Color3.fromRGB(255, 205, 225)
local SOIL = Color3.fromRGB(139, 94, 78)
local PLATFORM = Color3.fromRGB(255, 236, 190)

local PLOT_RADIUS = 62
local TILE_SIZE = Vector3.new(7, 0.6, 7)

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

local function setupLighting()
	Lighting.ClockTime = 15
	-- 明るすぎると地面が白く飛ぶので、少し抑えて色を出す（画面を見て調整）
	Lighting.Brightness = 1.6
	Lighting.Ambient = Color3.fromRGB(200, 175, 205)
	Lighting.OutdoorAmbient = Color3.fromRGB(190, 170, 205)
	Lighting.EnvironmentDiffuseScale = 0.6
	Lighting.EnvironmentSpecularScale = 0.3
	for _, child in Lighting:GetChildren() do
		if child:IsA("Atmosphere") or child:IsA("BloomEffect") or child:IsA("ColorCorrectionEffect") then
			child:Destroy()
		end
	end
	make("Atmosphere", {
		Color = Color3.fromRGB(255, 214, 235),
		Decay = Color3.fromRGB(255, 190, 220),
		Density = 0.28,
		Offset = 0.25,
		Glare = 0,
		Haze = 1.2,
	}, Lighting)
	make("BloomEffect", { Intensity = 0.25, Size = 24, Threshold = 1.3 }, Lighting)
	make("ColorCorrectionEffect", { Name = "Tint", Saturation = 0.3, Contrast = 0.08 }, Lighting)
end

local function lollipop(position: Vector3, color: Color3, scale: number, parent: Instance)
	local height = 9 * scale
	block({
		Name = "Stick",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, 0.7 * scale, 0.7 * scale),
		CFrame = CFrame.new(position + Vector3.new(0, height / 2, 0)) * CFrame.Angles(0, 0, math.pi / 2),
		Color = Color3.fromRGB(255, 250, 245),
	}, parent)
	block({
		Name = "Candy",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(1.2 * scale, 6 * scale, 6 * scale),
		CFrame = CFrame.new(position + Vector3.new(0, height + 2.2 * scale, 0)) * CFrame.Angles(0, math.pi / 2, 0),
		Color = color,
	}, parent)
	block({
		Name = "CandyCenter",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(1.5 * scale, 3 * scale, 3 * scale),
		CFrame = CFrame.new(position + Vector3.new(0, height + 2.2 * scale, 0)) * CFrame.Angles(0, math.pi / 2, 0),
		Color = Color3.fromRGB(255, 255, 255),
	}, parent)
end

local function buildScenery(parent: Instance)
	block({ Name = "Ground", Size = Vector3.new(420, 2, 420), Position = Vector3.new(0, -1, 0), Color = GROUND }, parent)
	-- 中央の広場
	block({
		Name = "Plaza",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.4, 36, 36),
		CFrame = CFrame.new(0, 0.2, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = PATH,
	}, parent)
	block({
		Name = "PlazaRing",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(0.5, 12, 12),
		CFrame = CFrame.new(0, 0.25, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = Color3.fromRGB(255, 160, 200),
	}, parent)

	-- 外周のキャンディ飾り（毎回同じ配置になる固定シード）
	local rng = Random.new(2026)
	local decor = make("Folder", { Name = "Decor" }, parent)
	for i = 1, 46 do
		local angle = (i / 46) * math.pi * 2 + rng:NextNumber(-0.05, 0.05)
		local radius = rng:NextNumber(112, 190)
		local pos = Vector3.new(math.cos(angle) * radius, 0, math.sin(angle) * radius)
		lollipop(pos, PASTELS[rng:NextInteger(1, #PASTELS)], rng:NextNumber(0.9, 1.9), decor)
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

local function buildPlot(index: number, parent: Instance, onTile: (Player, BasePart) -> ())
	local angle = ((index - 1) / Config.MaxPlots) * math.pi * 2
	local center = Vector3.new(math.cos(angle) * PLOT_RADIUS, 0, math.sin(angle) * PLOT_RADIUS)
	local origin = CFrame.lookAt(center, Vector3.new(0, 0, 0)) -- 中心を向く（-Zが前）

	local model = make("Model", { Name = "Plot_" .. index }, parent)
	model:SetAttribute("PlotIndex", index)
	model:SetAttribute("OwnerUserId", 0)

	local platform = block({
		Name = "Platform",
		Size = Vector3.new(30, 1, 24),
		CFrame = origin * CFrame.new(0, 0.5, 0),
		Color = PLATFORM,
	}, model)
	model.PrimaryPart = platform
	block({
		Name = "Border",
		Size = Vector3.new(31.5, 0.6, 25.5),
		CFrame = origin * CFrame.new(0, 0.3, 0),
		Color = PASTELS[(index % #PASTELS) + 1],
	}, model)

	-- 畑のタイル（3列×最大2段から開始）
	local tiles = {}
	local perRow = 3
	for i = 1, Config.PlotTiles do
		local col = (i - 1) % perRow
		local row = math.floor((i - 1) / perRow)
		local x = (col - 1) * 9
		local z = (row - 0.5) * 9
		local tile = block({
			Name = "Tile_" .. i,
			Size = TILE_SIZE,
			CFrame = origin * CFrame.new(x, 1.0 + TILE_SIZE.Y / 2, z),
			Color = SOIL,
			Material = Enum.Material.Mud,
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
		Size = Vector3.new(6, 0.4, 6),
		CFrame = origin * CFrame.new(0, 1.2, -9.5),
		Color = Color3.fromRGB(255, 160, 200),
		Material = Enum.Material.SmoothPlastic,
		Transparency = 0.35,
		TopSurface = Enum.SurfaceType.Smooth,
	}, model)

	-- 庭の名札（持ち主の名前）
	local signPost = block({
		Name = "SignPost",
		Size = Vector3.new(0.8, 6, 0.8),
		CFrame = origin * CFrame.new(0, 4, 11),
		Color = Color3.fromRGB(255, 250, 245),
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
		BackgroundColor3 = Color3.fromRGB(255, 246, 251),
		TextColor3 = Color3.fromRGB(74, 43, 92),
		Font = Enum.Font.GothamBold,
		TextSize = 26,
		Text = "",
		Visible = false,
	}, gui)
	make("UICorner", { CornerRadius = UDim.new(0, 18) }, label)
	make("UIStroke", { Color = Color3.fromRGB(255, 111, 168), Thickness = 3 }, label)

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

function World.allPlots()
	return plots
end

return World

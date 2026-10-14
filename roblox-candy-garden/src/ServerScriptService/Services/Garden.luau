-- 植える・育てる・収穫するの本体。乱数・在庫・時間は全てサーバーが決める。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)
local RateLimit = require(script.Parent.RateLimit)
local Weather = require(script.Parent.Weather)
local Tree = require(script.Parent.Tree)

local Garden = {}

local STEM_COLOR = Color3.fromRGB(120, 205, 130)
local rng = Random.new()

local function now(): number
	return workspace:GetServerTimeNow()
end

-- ---- 見た目（実と茎。育つほど大きくなる） ----

local function ensureVisual(tile: BasePart, cropCfg)
	local visual = tile:FindFirstChild("Plant")
	if visual then
		return visual
	end
	visual = Instance.new("Model")
	visual.Name = "Plant"

	local stem = Instance.new("Part")
	stem.Name = "Stem"
	stem.Shape = Enum.PartType.Cylinder
	stem.Anchored = true
	stem.CanCollide = false
	stem.Material = Enum.Material.SmoothPlastic
	stem.Color = STEM_COLOR
	stem.Size = Vector3.new(1, 0.5, 0.5)
	stem.Parent = visual

	local fruit = Instance.new("Part")
	fruit.Name = "Fruit"
	fruit.Shape = Enum.PartType.Ball
	fruit.Anchored = true
	fruit.CanCollide = false
	fruit.Material = Enum.Material.SmoothPlastic
	fruit.Color = cropCfg.color
	fruit.Size = Vector3.new(1, 1, 1)
	fruit.Parent = visual

	visual.PrimaryPart = fruit
	visual.Parent = tile
	return visual
end

local function renderTile(tile: BasePart, cropCfg, progress: number)
	local visual = ensureVisual(tile, cropCfg)
	local scale = 0.25 + 0.75 * progress
	local stemHeight = 1.8 * scale
	local diameter = 4.4 * scale
	local topY = tile.Position.Y + tile.Size.Y / 2

	local stem = visual.Stem
	stem.Size = Vector3.new(stemHeight, 0.5, 0.5)
	stem.CFrame = CFrame.new(tile.Position.X, topY + stemHeight / 2, tile.Position.Z) * CFrame.Angles(0, 0, math.pi / 2)

	local fruit = visual.Fruit
	fruit.Size = Vector3.new(diameter, diameter, diameter)
	fruit.Position = Vector3.new(tile.Position.X, topY + stemHeight + diameter * 0.45, tile.Position.Z)
	-- 熟したらネオンで光らせる（色だけに頼らない合図）
	fruit.Material = progress >= 1 and Enum.Material.Neon or Enum.Material.SmoothPlastic
end

-- profile.plots[i] の内容をタイルの属性と見た目に反映する
local function syncTile(player: Player, tileIndex: number)
	local plot = World.plotOf(player)
	local d = Data.get(player)
	if not plot or not d then
		return
	end
	local tile = plot.tiles[tileIndex]
	if not tile then
		return
	end
	local slot = d.plots[tostring(tileIndex)]
	if slot and Config.CropById[slot.crop] then
		local cropCfg = Config.CropById[slot.crop]
		local progress = math.clamp((now() - slot.plantedAt) / cropCfg.growTime, 0, 1)
		tile:SetAttribute("Crop", slot.crop)
		tile:SetAttribute("PlantedAt", slot.plantedAt)
		tile:SetAttribute("GrowTime", cropCfg.growTime)
		tile:SetAttribute("Ready", progress >= 1)
		renderTile(tile, cropCfg, progress)
	else
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

function Garden.attach(player: Player)
	local plot = World.plotOf(player)
	if not plot then
		return
	end
	for i = 1, #plot.tiles do
		syncTile(player, i)
	end
end

-- ---- 操作 ----

local function isReady(slot): boolean
	local cropCfg = Config.CropById[slot.crop]
	-- 通信の遅れを考えて0.5秒だけ甘くする
	return cropCfg ~= nil and now() - slot.plantedAt >= cropCfg.growTime - 0.5
end

local function harvest(player: Player, tileIndex: number): boolean
	local d = Data.get(player)
	if not d then
		return false
	end
	local slot = d.plots[tostring(tileIndex)]
	if not slot or not isReady(slot) then
		return false
	end
	local sparkle = rng:NextNumber() < Weather.sparkleChance()
	local bucket = sparkle and d.basketSparkle or d.basket
	local cropId = slot.crop
	bucket[cropId] = (bucket[cropId] or 0) + 1
	d.plots[tostring(tileIndex)] = nil
	syncTile(player, tileIndex)
	Tree.add(cropId) -- みんなの木の成長ポイントになる
	if sparkle then
		Remotes.Toast:FireClient(player, "toast.sparkle")
	end
	return true
end

local function plant(player: Player, tileIndex: number)
	local d = Data.get(player)
	if not d then
		return
	end
	local cropId = Data.selected(player)
	if not cropId then
		Remotes.Toast:FireClient(player, "toast.noSeeds")
		return
	end
	d.seeds[cropId] -= 1
	if d.seeds[cropId] <= 0 then
		d.seeds[cropId] = nil
	end
	d.plots[tostring(tileIndex)] = { crop = cropId, plantedAt = now() }
	syncTile(player, tileIndex)
end

-- ProximityPrompt から呼ばれる
function Garden.interact(player: Player, tile: BasePart)
	local model = tile.Parent
	if not model or model:GetAttribute("OwnerUserId") ~= player.UserId then
		return
	end
	if not RateLimit.ok(player, "interact", 0.12) then
		return
	end
	local d = Data.get(player)
	local tileIndex = tile:GetAttribute("TileIndex")
	if not d or type(tileIndex) ~= "number" then
		return
	end
	local slot = d.plots[tostring(tileIndex)]
	if slot == nil then
		plant(player, tileIndex)
	else
		harvest(player, tileIndex)
	end
	Data.push(player)
end

function Garden.harvestAll(player: Player)
	if not RateLimit.ok(player, "harvestAll", 0.3) then
		return
	end
	local plot = World.plotOf(player)
	if not plot then
		return
	end
	for i = 1, #plot.tiles do
		harvest(player, i)
	end
	Data.push(player)
end

-- 毎秒、全員の庭の成長を見た目に反映する（オフライン中の分も plantedAt から計算される）
function Garden.startGrowthLoop()
	task.spawn(function()
		while true do
			task.wait(1)
			for _, player in Players:GetPlayers() do
				local plot = World.plotOf(player)
				local d = Data.get(player)
				if plot and d then
					for i, tile in plot.tiles do
						local slot = d.plots[tostring(i)]
						if slot and Config.CropById[slot.crop] then
							local cropCfg = Config.CropById[slot.crop]
							local progress = math.clamp((now() - slot.plantedAt) / cropCfg.growTime, 0, 1)
							local ready = progress >= 1
							if not ready or not tile:GetAttribute("Ready") then
								tile:SetAttribute("Ready", ready)
								renderTile(tile, cropCfg, progress)
							end
						end
					end
				end
			end
		end
	end)
end

return Garden

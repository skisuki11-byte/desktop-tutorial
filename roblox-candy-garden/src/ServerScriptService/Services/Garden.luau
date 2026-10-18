-- 植える・育てる・収穫するの本体。乱数・在庫・時間は全てサーバーが決める。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)
local RateLimit = require(script.Parent.RateLimit)
local Weather = require(script.Parent.Weather)
local Tree = require(script.Parent.Tree)
local Season = require(script.Parent.Season)
local Quests = require(script.Parent.Quests)
local CropModels = require(script.Parent.CropModels)
local Friends = require(script.Parent.Friends)

local Garden = {}

local rng = Random.new()

-- 芽のあいだ（育ちはじめの割合）。そのあと作物の形になって、大きくなっていく
local SPROUT_UNTIL = 0.2

local function now(): number
	return workspace:GetServerTimeNow()
end

-- ---- 見た目（芽 → 作物の形が大きくなる → 実ったらキラキラ） ----

local function ensureVisual(tile: BasePart, kind: string): (Model, boolean)
	local visual = tile:FindFirstChild("Plant")
	if visual and visual:GetAttribute("Kind") ~= kind then
		visual:Destroy()
		visual = nil
	end
	if visual then
		return visual, false
	end
	visual = CropModels.build(kind)
	visual.Name = "Plant"
	visual:SetAttribute("Kind", kind)
	-- 畑ごとに向きを少し変えて、並んだときに自然に見えるようにする
	local yaw = (tile:GetAttribute("TileIndex") or 1) * 1.3
	visual:PivotTo(tile.CFrame * CFrame.new(0, tile.Size.Y / 2, 0) * CFrame.Angles(0, yaw, 0))
	visual.Parent = tile
	return visual, true
end

local function renderTile(tile: BasePart, cropCfg, progress: number, variant: string?)
	local sprout = progress < SPROUT_UNTIL
	local visual, created = ensureVisual(tile, sprout and "sprout" or cropCfg.id)
	local scale
	if sprout then
		scale = 0.7 + 1.3 * (progress / SPROUT_UNTIL)
	else
		scale = 0.45 + 0.55 * math.clamp((progress - SPROUT_UNTIL) / (1 - SPROUT_UNTIL), 0, 1)
	end
	-- 実ったら、ふしぎな姿を見せる（ジャンボは大きく）
	local v = progress >= 1 and variant and Config.VariantById[variant]
	if v and v.scale then
		scale *= v.scale
	end
	-- 大きさは 5%きざみにして、変わったときだけ ScaleTo（毎秒 全部の部品を送り直すと、みんなの通信が重くなる）
	scale = math.floor(scale * 20 + 0.5) / 20
	if created or math.abs(visual:GetScale() - scale) > 0.01 then
		visual:ScaleTo(scale)
	end
	CropModels.setReady(visual, progress >= 1)
	CropModels.setVariant(visual, if v then v.id else nil)
end

-- 水をあげた土は、しっとり濃い色にする（もとの色は属性に覚えておく）
local function setWet(tile: BasePart, wet: boolean)
	if tile:GetAttribute("DryColor") == nil then
		tile:SetAttribute("DryColor", tile.Color)
	end
	local dry = tile:GetAttribute("DryColor")
	tile.Color = if wet then dry:Lerp(Color3.fromRGB(60, 40, 45), 0.45) else dry
	tile:SetAttribute("Watered", wet)
end

-- 水しぶき（みんなに見える）
local function splash(tile: BasePart, color: Color3?)
	local emitter = Instance.new("ParticleEmitter")
	emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	local c = color or Color3.fromRGB(140, 200, 255)
	emitter.Color = ColorSequence.new(c, c:Lerp(Color3.new(1, 1, 1), 0.6))
	emitter.Speed = NumberRange.new(4, 8)
	emitter.SpreadAngle = Vector2.new(60, 60)
	emitter.EmissionDirection = Enum.NormalId.Top
	emitter.Acceleration = Vector3.new(0, -20, 0)
	emitter.Lifetime = NumberRange.new(0.5, 0.9)
	emitter.Size = NumberSequence.new(0.5, 0.1)
	emitter.LightEmission = 0.5
	emitter.Rate = 0
	emitter.Parent = tile
	emitter:Emit(30)
	task.delay(1.5, function()
		emitter:Destroy()
	end)
end

-- ---- ふしぎな作物（Config.Variants） ----

-- 実ったときに、どの姿になるかを決める（1回だけ。決まった姿は slot.variant に保存する。ふつうは "none"）
local function pickVariant(slot): string
	-- Studioでの確認用: workspace の属性 DebugVariant に姿のidを入れると、必ずその姿になる（本番では効かない）
	local debugVariant = RunService:IsStudio() and workspace:GetAttribute("DebugVariant")
	if debugVariant and (Config.VariantById[debugVariant] or debugVariant == "none") then
		return debugVariant
	end
	local weather = workspace:GetAttribute("Weather")
	for _, v in Config.Variants do
		local chance
		if v.id == "sparkle" then
			chance = Weather.sparkleChance()
			if slot.watered then
				chance = math.min(0.9, chance + Config.Water.sparkleBonus) -- 水をあげた作物は、きらきらが出やすい
			end
		else
			chance = (weather and v.weather and v.weather[weather]) or v.chance
			if slot.watered and v.wateredBonus then
				chance += v.wateredBonus
			end
			if slot.fertilized and v.fertilizedBonus then
				chance += v.fertilizedBonus
			end
			if slot.drop then
				chance *= Config.Drop.multiplier -- ふしぎのしずくを使った作物は、ふしぎな姿が出やすい
			end
		end
		if rng:NextNumber() < chance then
			return v.id
		end
	end
	return "none"
end

-- announce: 実った瞬間なら、持ち主に知らせる（にじいろは、サーバーのみんなにも）
function Garden.rollVariant(player: Player, slot, announce: boolean)
	if slot.variant ~= nil then
		return
	end
	slot.variant = pickVariant(slot)
	local v = Config.VariantById[slot.variant]
	if not v then
		return
	end
	Data.saveSoon(player)
	-- きらきらは よく出るので、実ったときのお知らせはしない（収穫したときに知らせる）
	if announce and v.id ~= "sparkle" then
		Remotes.Toast:FireClient(player, "toast.variantReady", v.icon, "@variant." .. v.id, "@crop." .. slot.crop)
		if v.id == "rainbow" then
			for _, other in Players:GetPlayers() do
				if other ~= player then
					Remotes.Toast:FireClient(other, "toast.rainbowNews", player.DisplayName, "@crop." .. slot.crop)
				end
			end
		end
	end
end

-- 作物ずかん: 集めた（作物 × 姿）の数でごほうび（1回ずつ）
local function checkCropDexRewards(player: Player, d)
	local count = 0
	for _, variants in d.cropDex do
		for _ in variants do
			count += 1
		end
	end
	local rewards = Config.CropDex.rewards
	while rewards[d.cropDexClaimed + 1] and count >= rewards[d.cropDexClaimed + 1].count do
		d.cropDexClaimed += 1
		local reward = rewards[d.cropDexClaimed]
		d.coins += reward.coins or 0
		d.fertilizer = math.min(Config.Fertilizer.max, (d.fertilizer or 0) + (reward.fertilizer or 0))
		Remotes.Toast:FireClient(player, "toast.cropDexReward", reward.coins or 0)
	end
end

local function markCropDex(player: Player, d, cropId: string, variant: string)
	d.cropDex[cropId] = d.cropDex[cropId] or {}
	if d.cropDex[cropId][variant] then
		return false
	end
	d.cropDex[cropId][variant] = true
	checkCropDexRewards(player, d)
	return true
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
		if progress >= 1 then
			Garden.rollVariant(player, slot, false) -- いない間に実った作物も、ここで姿が決まる
		end
		tile:SetAttribute("Crop", slot.crop)
		tile:SetAttribute("PlantedAt", slot.plantedAt)
		tile:SetAttribute("GrowTime", cropCfg.growTime)
		tile:SetAttribute("Ready", progress >= 1)
		setWet(tile, slot.watered == true)
		tile:SetAttribute("Fertilized", slot.fertilized == true)
		tile:SetAttribute("Drop", slot.drop == true)
		tile:SetAttribute("Variant", if slot.variant ~= "none" then slot.variant else nil)
		renderTile(tile, cropCfg, progress, slot.variant)
	else
		setWet(tile, false)
		tile:SetAttribute("Fertilized", false)
		tile:SetAttribute("Drop", false)
		tile:SetAttribute("Variant", nil)
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
	local d = Data.get(player)
	World.setUnlocked(player, (d and d.plotTiles) or Config.PlotTiles)
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
	-- 姿は実ったときに決まっている（まだなら、ここで決める）
	Garden.rollVariant(player, slot, false)
	local variant = slot.variant
	local sparkle = variant == "sparkle"
	local bucket
	if variant == "sparkle" then
		bucket = d.basketSparkle
	elseif Config.VariantById[variant] then
		d.basketV[variant] = d.basketV[variant] or {}
		bucket = d.basketV[variant]
	else
		bucket = d.basket
	end
	local cropId = slot.crop
	bucket[cropId] = (bucket[cropId] or 0) + 1
	local isNew = markCropDex(player, d, cropId, if Config.VariantById[variant] then variant else "normal")
	d.plots[tostring(tileIndex)] = nil
	syncTile(player, tileIndex)
	Tree.add(cropId) -- みんなの木の成長ポイントになる
	Season.addXp(player, Config.Season.xp.harvest[cropId] or 1) -- キャンディパスのXP
	-- きょうのおねがい
	Quests.progress(player, "harvest", 1)
	Quests.progress(player, "harvestCrop", 1, cropId)
	if sparkle then
		Quests.progress(player, "sparkle", 1)
	end
	local v = Config.VariantById[variant]
	if v and v.id ~= "sparkle" then
		Remotes.Toast:FireClient(player, "toast.variantHarvest", v.icon, "@variant." .. v.id, "@crop." .. cropId, v.multiplier)
		Data.saveSoon(player) -- めずらしい作物は、すぐ保存する
	elseif sparkle then
		Remotes.Toast:FireClient(player, "toast.sparkle")
	elseif isNew then
		Remotes.Toast:FireClient(player, "toast.cropDexNew", "@crop." .. cropId)
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
	Quests.progress(player, "plant", 1)
	syncTile(player, tileIndex)
end

-- 育つ時間を早める（実る1秒前まで）。水やり・ひりょう・ペットのお手伝いで使う
local function speedUp(slot, cropCfg, ratio: number)
	local remaining = cropCfg.growTime - (now() - slot.plantedAt)
	local skip = math.max(0, math.min(cropCfg.growTime * ratio, remaining - 1))
	slot.plantedAt -= skip
end

-- ひりょう: 育っている途中の作物に、植えるごとに1回まで。持っている ひりょうを1つ使う
local function fertilize(helper: Player, owner: Player, tileIndex: number): boolean
	local d = Data.get(owner)
	local slot = d and d.plots[tostring(tileIndex)]
	local cropCfg = slot and Config.CropById[slot.crop]
	local hd = Data.get(helper)
	if not cropCfg or not hd or slot.fertilized or isReady(slot) or (hd.fertilizer or 0) <= 0 then
		return false
	end
	hd.fertilizer -= 1
	speedUp(slot, cropCfg, Config.Fertilizer.speedUp)
	slot.fertilized = true
	syncTile(owner, tileIndex)
	local plot = World.plotOf(owner)
	if plot and plot.tiles[tileIndex] then
		splash(plot.tiles[tileIndex], Color3.fromRGB(255, 220, 120))
	end
	if helper == owner then
		Remotes.Toast:FireClient(helper, "toast.fertilized")
	else
		hd.coins += Config.Water.helperCoins
		Remotes.Toast:FireClient(helper, "toast.fertilizedFriend", Config.Water.helperCoins)
		Remotes.Toast:FireClient(owner, "toast.helpedFertilizer", helper.DisplayName)
		Friends.onHelp(helper, owner) -- 友だちなら、なかよしポイント
	end
	Data.push(helper)
	Data.push(owner)
	Data.saveSoon(helper)
	Data.saveSoon(owner)
	return true
end

-- ふしぎのしずく: 育っている途中の作物に、植えるごとに1回まで。実ったときに ふしぎな姿が出やすくなる
local function useDrop(helper: Player, owner: Player, tileIndex: number): boolean
	local d = Data.get(owner)
	local slot = d and d.plots[tostring(tileIndex)]
	local cropCfg = slot and Config.CropById[slot.crop]
	local hd = Data.get(helper)
	if not cropCfg or not hd or slot.drop or isReady(slot) or (hd.drops or 0) <= 0 then
		return false
	end
	hd.drops -= 1
	slot.drop = true
	syncTile(owner, tileIndex)
	local plot = World.plotOf(owner)
	if plot and plot.tiles[tileIndex] then
		splash(plot.tiles[tileIndex], Color3.fromRGB(200, 160, 255))
	end
	if helper == owner then
		Remotes.Toast:FireClient(helper, "toast.dropUsed")
	else
		Remotes.Toast:FireClient(helper, "toast.dropUsedFriend")
		Remotes.Toast:FireClient(owner, "toast.helpedDrop", helper.DisplayName)
		Friends.onHelp(helper, owner) -- 友だちなら、なかよしポイント
	end
	Data.push(helper)
	Data.push(owner)
	Data.saveSoon(helper)
	Data.saveSoon(owner)
	return true
end

-- 水やり: 育っている途中の作物に、1回植えるごとに1回まで。育つ時間の一部を早める（実る1秒前まで）
-- helper: 水をあげた人 / owner: 畑の持ち主（同じ人のこともある）
local function water(helper: Player, owner: Player, tileIndex: number): boolean
	local d = Data.get(owner)
	local slot = d and d.plots[tostring(tileIndex)]
	local cropCfg = slot and Config.CropById[slot.crop]
	local hd = Data.get(helper)
	if not cropCfg or not hd or slot.watered or isReady(slot) then
		return false
	end
	-- じょうろの水を1つ使う（からっぽなら、池でくむように案内する）
	if hd.water.amount <= 0 then
		Remotes.Toast:FireClient(helper, "toast.noWater")
		return false
	end
	hd.water.amount -= 1
	Data.push(helper)
	speedUp(slot, cropCfg, Config.Water.speedUp)
	slot.watered = true
	syncTile(owner, tileIndex)
	local plot = World.plotOf(owner)
	if plot and plot.tiles[tileIndex] then
		splash(plot.tiles[tileIndex])
	end
	if helper == owner then
		-- 最後の1回なら、じょうろをしまったことと、池でくむことを伝える
		Remotes.Toast:FireClient(helper, if hd.water.amount <= 0 then "toast.canEmptied" else "toast.watered")
	else
		-- ほかの人の畑を手伝った: 手伝った人にお礼、持ち主には「○○さんが水をあげてくれた」
		hd.coins += Config.Water.helperCoins
		Data.push(helper)
		Remotes.Toast:FireClient(helper, "toast.wateredFriend", Config.Water.helperCoins)
		Remotes.Toast:FireClient(owner, "toast.helped", helper.DisplayName)
		Friends.onHelp(helper, owner) -- 友だちなら、なかよしポイント
	end
	Data.push(owner)
	Data.saveSoon(owner)
	return true
end

-- ProximityPrompt から呼ばれる
-- 自分の畑: 空なら植える / 実っていたら収穫 / 育っている途中は、持っている道具（じょうろ・ひりょう）を使う
-- ほかの人の畑: 道具を持っていれば水やり・ひりょう（手伝い）だけ。植える・収穫はできない（奪い合いをしない）
-- 道具を持っていないときは、水やり・ひりょうはしない（自分で道具を選んで世話をする）
function Garden.interact(player: Player, tile: BasePart)
	local model = tile.Parent
	if not model then
		return
	end
	if not RateLimit.ok(player, "interact", 0.12) then
		return
	end
	local tileIndex = tile:GetAttribute("TileIndex")
	if type(tileIndex) ~= "number" or tile:GetAttribute("Locked") then
		return -- まだ広げていない畑は使えない
	end
	if model:GetAttribute("OwnerUserId") ~= player.UserId then
		local owner = Players:GetPlayerByUserId(model:GetAttribute("OwnerUserId") or 0)
		local od = owner and Data.get(owner)
		local slot = od and od.plots[tostring(tileIndex)]
		local tool = Data.tool(player)
		if slot and tool == "water" then
			water(player, owner, tileIndex)
		elseif slot and tool == "fertilizer" then
			fertilize(player, owner, tileIndex)
		elseif slot and tool == "drop" then
			useDrop(player, owner, tileIndex)
		end
		Data.push(player)
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local slot = d.plots[tostring(tileIndex)]
	local tool = Data.tool(player)
	if slot == nil then
		if tool == nil then
			plant(player, tileIndex)
		end
	elseif isReady(slot) then
		harvest(player, tileIndex)
	elseif tool == "water" then
		water(player, player, tileIndex)
	elseif tool == "fertilizer" then
		fertilize(player, player, tileIndex)
	elseif tool == "drop" then
		useDrop(player, player, tileIndex)
	end
	Data.push(player)
end

-- 畑を広げる（Config.PlotUpgrades の次の段階）
function Garden.expand(player: Player)
	if not RateLimit.ok(player, "expand", 0.5) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local nextUpgrade
	for _, upgrade in Config.PlotUpgrades do
		if upgrade.tiles > d.plotTiles then
			nextUpgrade = upgrade
			break
		end
	end
	if not nextUpgrade then
		return
	end
	if d.coins < nextUpgrade.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= nextUpgrade.price
	d.plotTiles = nextUpgrade.tiles
	World.setUnlocked(player, d.plotTiles, true)
	if Garden.onExpanded then
		Garden.onExpanded(player) -- 名札のランクを更新（畑の広さもランクに入る）
	end
	Remotes.Toast:FireClient(player, "toast.expanded", d.plotTiles)
	Data.push(player)
	Data.save(player) -- 大きな買い物は、すぐ保存する
end

-- ひりょうを1つ買う
-- 道具を持つ / しまう（同じ道具をもう一度えらぶと、しまって種にもどる）
function Garden.selectTool(player: Player, tool: any)
	if not RateLimit.ok(player, "selectTool", 0.1) then
		return
	end
	local d = Data.get(player)
	if not d or (tool ~= "water" and tool ~= "fertilizer" and tool ~= "drop" and tool ~= nil) then
		return
	end
	if tool ~= nil and Data.tool(player) == tool then
		tool = nil
	end
	if tool == "fertilizer" and (d.fertilizer or 0) <= 0 then
		Remotes.Toast:FireClient(player, "toast.noFertilizer")
		return
	end
	if tool == "drop" and (d.drops or 0) <= 0 then
		Remotes.Toast:FireClient(player, "toast.noDrop")
		return
	end
	if tool == "water" and d.water.amount <= 0 then
		Remotes.Toast:FireClient(player, "toast.noWater") -- からっぽのじょうろは持てない（池でくもう）
		return
	end
	Data.setTool(player, tool)
	if tool then
		local key = if tool == "water" then "toast.holdWater" elseif tool == "drop" then "toast.holdDrop" else "toast.holdFertilizer"
		Remotes.Toast:FireClient(player, key)
	end
	Data.push(player)
end

function Garden.buyFertilizer(player: Player)
	if not RateLimit.ok(player, "buyFertilizer", 0.25) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	if not World.isNear(player, "ToolShop") then
		Remotes.Toast:FireClient(player, "toast.goToolShop")
		return
	end
	if (d.fertilizer or 0) >= Config.Fertilizer.max then
		Remotes.Toast:FireClient(player, "toast.fertilizerFull")
		return
	end
	if d.coins < Config.Fertilizer.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= Config.Fertilizer.price
	d.fertilizer = (d.fertilizer or 0) + 1
	Remotes.Toast:FireClient(player, "toast.boughtFertilizer", d.fertilizer)
	Data.push(player)
	Data.saveSoon(player)
end

-- ふしぎのしずくを買う（どうぐ屋の近くでだけ）
function Garden.buyDrop(player: Player)
	if not RateLimit.ok(player, "buyDrop", 0.25) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	if not World.isNear(player, "ToolShop") then
		Remotes.Toast:FireClient(player, "toast.goToolShop")
		return
	end
	if (d.drops or 0) >= Config.Drop.max then
		Remotes.Toast:FireClient(player, "toast.dropFull")
		return
	end
	if d.coins < Config.Drop.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= Config.Drop.price
	d.drops = (d.drops or 0) + 1
	Remotes.Toast:FireClient(player, "toast.boughtDrop", d.drops)
	Data.push(player)
	Data.saveSoon(player)
end

-- ペットのお手伝い: 連れているペットが、ときどき自分の畑の まだ水をあげていない作物に水をあげる
local function petHelp(player: Player)
	local d = Data.get(player)
	local plot = World.plotOf(player)
	if not d or not plot then
		return
	end
	for _, uid in d.equipped do
		local petId
		for _, entry in d.pets do
			if entry.uid == uid then
				petId = entry.pet
			end
		end
		local pet = petId and Config.PetById[petId]
		if pet and rng:NextNumber() < (Config.PetHelp.chance[pet.rarity] or 0.05) then
			-- まだ水をあげていない、育っている途中の作物を1つ選ぶ
			local candidates = {}
			for i = 1, #plot.tiles do
				local slot = d.plots[tostring(i)]
				if slot and Config.CropById[slot.crop] and not slot.watered and not isReady(slot) then
					table.insert(candidates, i)
				end
			end
			if #candidates == 0 then
				return
			end
			local tileIndex = candidates[rng:NextInteger(1, #candidates)]
			local slot = d.plots[tostring(tileIndex)]
			speedUp(slot, Config.CropById[slot.crop], Config.Water.speedUp)
			slot.watered = true
			syncTile(player, tileIndex)
			splash(plot.tiles[tileIndex])
			Remotes.Toast:FireClient(player, "toast.petWatered", pet.icon, "@pet." .. pet.id)
			Data.push(player)
		end
	end
end

-- 池のポンプで、じょうろに水をくむ（タダ。いっぱいまで）
function Garden.refill(player: Player)
	if not RateLimit.ok(player, "refill", 0.5) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local cap = Config.Water.cans[d.water.level] or Config.Water.cans[1]
	if d.water.amount >= cap then
		Remotes.Toast:FireClient(player, "toast.waterFull")
		return
	end
	d.water.amount = cap
	Remotes.Toast:FireClient(player, "toast.refilled", cap)
	Data.push(player)
	Data.saveSoon(player)
end

-- じょうろを大きくする（コインを使う）。大きくしたら、そのまま満タンにする
function Garden.upgradeCan(player: Player)
	if not RateLimit.ok(player, "upgradeCan", 0.5) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local nextLevel = d.water.level + 1
	local price = Config.Water.canPrices[nextLevel]
	if not price then
		return
	end
	if not World.isNear(player, "ToolShop") then
		Remotes.Toast:FireClient(player, "toast.goToolShop")
		return
	end
	if d.coins < price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= price
	d.water.level = nextLevel
	d.water.amount = Config.Water.cans[nextLevel]
	Remotes.Toast:FireClient(player, "toast.canUpgraded", Config.Water.cans[nextLevel])
	Data.push(player)
	Data.saveSoon(player)
end

-- 収穫できる（熟した）作物の数（おかえりメッセージ用）
function Garden.readyCount(player: Player): number
	local d = Data.get(player)
	if not d then
		return 0
	end
	local count = 0
	for _, slot in d.plots do
		if isReady(slot) then
			count += 1
		end
	end
	return count
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
	-- ペットのお手伝い（Config.PetHelp.interval 秒ごと）
	task.spawn(function()
		while true do
			task.wait(Config.PetHelp.interval)
			for _, player in Players:GetPlayers() do
				petHelp(player)
			end
		end
	end)
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
								if ready then
									Garden.rollVariant(player, slot, true) -- 実った瞬間に、ふしぎな姿が決まる
									tile:SetAttribute("Variant", if slot.variant ~= "none" then slot.variant else nil)
								end
								tile:SetAttribute("Ready", ready)
								renderTile(tile, cropCfg, progress, slot.variant)
							end
						end
					end
				end
			end
		end
	end)
end

return Garden

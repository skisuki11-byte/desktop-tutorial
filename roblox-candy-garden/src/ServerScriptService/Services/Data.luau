-- プレイヤーデータ（DataStore保存）と、クライアントへの状態配信。
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = {}

local profiles: { [Player]: { data: any, runtime: any, canSave: boolean } } = {}

local store
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.DataStoreName)
	end)
	if ok then
		store = result
	end
end

local function newData()
	local seeds = {}
	for id, n in Config.StartSeeds do
		seeds[id] = n
	end
	return {
		coins = Config.StartCoins,
		seeds = seeds, -- [cropId] = 個数
		basket = {}, -- [cropId] = 通常の個数
		basketSparkle = {}, -- [cropId] = きらきらの個数
		plots = {}, -- [tostring(tileIndex)] = { crop, plantedAt }
		tutorialDone = false,
		pets = {}, -- { { uid, pet } }
		equipped = {}, -- 連れているペットの uid（最大 Config.MaxEquipped）
		nextPetUid = 1,
	}
end

local function reconcile(data)
	local base = newData()
	for key, value in base do
		if data[key] == nil then
			data[key] = value
		end
	end
	return data
end

local function key(player: Player)
	return "u_" .. player.UserId
end

-- 読み込み。失敗時は上書き事故を避けるため保存を無効にして遊ばせる。
function Data.load(player: Player)
	local data
	local canSave = false
	if store then
		for attempt = 1, 3 do
			local ok, result = pcall(function()
				return store:GetAsync(key(player))
			end)
			if ok then
				data = result
				canSave = true
				break
			end
			warn(("[Data] load failed (%d/3): %s"):format(attempt, tostring(result)))
			task.wait(1)
		end
	end
	if not canSave then
		warn("[Data] 保存は無効です（Studioで「Enable Studio Access to API Services」がオフ、またはDataStore障害）")
	end
	data = reconcile(type(data) == "table" and data or {})
	profiles[player] = { data = data, runtime = { selected = nil }, canSave = canSave }
end

function Data.get(player: Player)
	local profile = profiles[player]
	return profile and profile.data
end

function Data.save(player: Player)
	local profile = profiles[player]
	if not profile or not profile.canSave or not store then
		return
	end
	local ok, err = pcall(function()
		store:SetAsync(key(player), profile.data)
	end)
	if not ok then
		warn("[Data] save failed: " .. tostring(err))
	end
end

function Data.release(player: Player)
	Data.save(player)
	profiles[player] = nil
end

-- 選択中の種。在庫が切れていたら自動で別の種に切り替える。
function Data.selected(player: Player): string?
	local profile = profiles[player]
	if not profile then
		return nil
	end
	local current = profile.runtime.selected
	if current and (profile.data.seeds[current] or 0) > 0 then
		return current
	end
	for _, id in Config.CropOrder do
		if (profile.data.seeds[id] or 0) > 0 then
			profile.runtime.selected = id
			return id
		end
	end
	profile.runtime.selected = nil
	return nil
end

function Data.setSelected(player: Player, cropId: string)
	local profile = profiles[player]
	if profile then
		profile.runtime.selected = cropId
	end
end

-- 連れているペットの売値ボーナスの合計（0.15 = +15%）。ここで1か所だけ計算する
function Data.petBonus(d): number
	local bonus = 0
	for _, uid in d.equipped do
		for _, entry in d.pets do
			if entry.uid == uid and Config.PetById[entry.pet] then
				bonus += Config.PetById[entry.pet].bonus
			end
		end
	end
	return bonus
end

function Data.push(player: Player)
	local profile = profiles[player]
	if not profile then
		return
	end
	local d = profile.data
	Remotes.State:FireClient(player, {
		pets = d.pets,
		equipped = d.equipped,
		sellBonus = 1 + Data.petBonus(d),
		coins = d.coins,
		seeds = d.seeds,
		basket = d.basket,
		basketSparkle = d.basketSparkle,
		selected = Data.selected(player),
		tutorialDone = d.tutorialDone,
		plotId = player:GetAttribute("PlotId"),
	})
end

function Data.startAutoSave()
	task.spawn(function()
		while true do
			task.wait(Config.AutoSaveSeconds)
			for _, player in Players:GetPlayers() do
				Data.save(player)
			end
		end
	end)
end

return Data

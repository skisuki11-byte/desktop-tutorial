-- プレイヤーデータ（DataStore保存）と、クライアントへの状態配信。
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = {}

local profiles: { [Player]: { data: any, runtime: any, canSave: boolean } } = {}

-- 保存場所の名前。Studio で遊んだデータが本番に混ざらないよう、Studio では別の場所に保存する
-- （本番: CandyGardenV1 / Studio: CandyGardenV1_Studio）
function Data.storeName(): string
	if RunService:IsStudio() then
		return Config.DataStoreName .. "_Studio"
	end
	return Config.DataStoreName
end

local store
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Data.storeName())
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
		-- おしゃれ。うさみみを最初にプレゼントして、すぐ着せる（最初の5分の小さなごほうび）
		cosmetics = {
			owned = { bunnyears = true },
			equipped = { hat = "bunnyears" },
		},
		-- デイリーボーナス: lastDay=最後にもらった日(UTCの日数) / streak=連続日数
		daily = { lastDay = 0, streak = 0 },
		redeemedCodes = {}, -- 使ったログインコード [CODE] = true
		-- シーズンパス: id=どのシーズンか / xp / free・premium=どの段まで受け取ったか
		season = { id = "", xp = 0, free = 0, premium = 0 },
		-- 期間限定ショップ: その日に買った枠 [tostring(slot)] = true（日が変わったらリセット）
		limited = { day = 0, bought = {} },
		-- きょうのおねがい: progress・claimed は [tostring(slot)]（日が変わったらリセット）
		quests = { day = 0, progress = {}, claimed = {} },
		lastSeen = 0, -- 最後に保存した時刻（おかえりメッセージ用）
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
	if canSave and RunService:IsStudio() then
		print("[Data] Studio用の保存場所を使っています: " .. Data.storeName())
	end
	if not canSave then
		warn("[Data] 保存は無効です（Studioで「Enable Studio Access to API Services」がオフ、またはDataStore障害）")
	end
	data = reconcile(type(data) == "table" and data or {})
	-- いなかった時間（前回の保存から今まで）。初めての人は 0
	local away = data.lastSeen > 0 and math.max(0, os.time() - data.lastSeen) or 0
	profiles[player] = { data = data, runtime = { selected = nil, awaySeconds = away }, canSave = canSave }
end

-- 前回からいなかった秒数（おかえりメッセージ用）
function Data.awaySeconds(player: Player): number
	local profile = profiles[player]
	return profile and profile.runtime.awaySeconds or 0
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
	profile.data.lastSeen = os.time()
	local ok, err = pcall(function()
		store:SetAsync(key(player), profile.data)
	end)
	if not ok then
		warn("[Data] save failed: " .. tostring(err))
	end
end

-- 連続した操作（買い物など）は、数秒おきにまとめて保存する。DataStoreの回数制限を守るため。
local savePending: { [Player]: boolean } = {}
function Data.saveSoon(player: Player)
	if savePending[player] then
		return
	end
	savePending[player] = true
	task.delay(4, function()
		savePending[player] = nil
		if profiles[player] then
			Data.save(player)
		end
	end)
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

-- ほかのサービス（ゲームパスなど）が、クライアントへ送る状態に項目を足せる
local stateExtenders: { (Player) -> { [string]: any } } = {}
function Data.addStateExtender(fn: (Player) -> { [string]: any })
	table.insert(stateExtenders, fn)
end

function Data.push(player: Player)
	local profile = profiles[player]
	if not profile then
		return
	end
	local d = profile.data
	local extra = {}
	for _, extend in stateExtenders do
		for k, v in extend(player) do
			extra[k] = v
		end
	end
	Remotes.State:FireClient(player, {
		cosmetics = d.cosmetics,
		passes = extra.passes or {},
		coinMultiplier = extra.coinMultiplier or 1,
		daily = extra.daily,
		season = extra.season,
		limited = extra.limited,
		quests = extra.quests,
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

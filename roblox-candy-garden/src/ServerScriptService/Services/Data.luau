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
		basketV = {}, -- ふしぎな作物 [variantId] = { [cropId] = 個数 }（きらきらは basketSparkle）
		cropDex = {}, -- 作物ずかん [cropId] = { [variantId か "normal"] = true }
		cropDexClaimed = 0, -- 受け取った作物ずかんのごほうびの数
		seedShop = { round = 0, bought = {} }, -- 種屋: いまの入荷の回で買った数 [cropId] = 個数
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
		music = true, -- BGMを流すか（次に来たときも同じ設定にする）
		starGift = false, -- ほしぞらのおくりものを受け取ったか
		water = { amount = 3, level = 1 }, -- じょうろの水（残り回数）と大きさ（Config.Water.cans）
		fertilizer = 0, -- キャンディひりょうの数
		drops = 0, -- ふしぎのしずくの数
		plotTiles = 6, -- 使える畑の枚数（Config.PlotUpgrades で広がる）
		-- 庭の飾り: owned=持っている [id]=true / slots=置いてある場所（6か所、空きは ""）
		decor = { owned = {}, slots = { "", "", "", "", "", "" } },
		-- おにわリフォーム: いまの段（Config.Reform）。ひみつきちは 0＝まだない
		reform = { fence = 1, sign = 1, floor = 1, base = 0 },
		-- ひみつきちの へや: owned=持っている家具 [id]=true / slots=置き場所ごとの家具（空きは ""）
		room = { owned = {}, slots = {} },
		seen = {}, -- 見た おしらせ（Config.NewThings）[key] = 見たときの数字
		dex = {}, -- ペット図鑑: 見つけたペット [petId] = true
		dexClaimed = 0, -- 受け取った図鑑のごほうびの数（Config.Dex.rewards の何番目まで）
		-- なかよしレベル: [tostring(userId)] = { name, pts, lv, day, together, helped }（together・helped は その日にたまった数）
		friendship = {},
		-- やくそくの種（1つだけ）: id がなければ なし。{ id, partner, partnerName, day=植えた日, watered, bloomed }
		promise = {},
		promiseDay = 0, -- 最後に やくそくの種を もらった日（1日1回）
	}
end

local function reconcile(data)
	local base = newData()
	for key, value in base do
		if data[key] == nil then
			data[key] = value
		end
	end
	-- 連れられるペットの数を減らしたとき（3→2）、前のデータの多い分は 連れるのをやめる（ペットは残る）。
	-- 売値ボーナスの大きい子を残す（損をしたと感じないように）
	if #data.equipped > Config.MaxEquipped then
		local bonusOf = {}
		for _, entry in data.pets do
			local cfg = Config.PetById[entry.pet]
			bonusOf[entry.uid] = cfg and cfg.bonus or 0
		end
		table.sort(data.equipped, function(a, b)
			return (bonusOf[a] or 0) > (bonusOf[b] or 0)
		end)
		while #data.equipped > Config.MaxEquipped do
			table.remove(data.equipped)
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
	-- Studioでの確認用: workspace の属性 DebugFreshData を オンにすると、はじめての人として遊べる（保存はしない。本番では効かない）
	if RunService:IsStudio() and workspace:GetAttribute("DebugFreshData") then
		data = nil
		canSave = false
	end
	data = reconcile(type(data) == "table" and data or {})
	-- いなかった時間（前回の保存から今まで）。初めての人は 0
	local away = data.lastSeen > 0 and math.max(0, os.time() - data.lastSeen) or 0
	profiles[player] = { data = data, runtime = { selected = nil, tool = nil, awaySeconds = away }, canSave = canSave }
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

-- 同じ人のデータは、Robloxのきまりで 6秒に1回までしか書けない。
-- それより早く頼まれたら、少しあとに まとめて1回だけ書く（書きこみが詰まって 遅くなるのを防ぐ）
local MIN_SAVE_GAP = 7
local savePending: { [Player]: boolean } = {}

function Data.save(player: Player, force: boolean?)
	local profile = profiles[player]
	if not profile or not profile.canSave or not store then
		return
	end
	if not force and (profile.saving or os.clock() - (profile.lastSaved or 0) < MIN_SAVE_GAP) then
		Data.saveSoon(player)
		return
	end
	profile.saving = true
	profile.lastSaved = os.clock()
	profile.data.lastSeen = os.time()
	local ok, err = pcall(function()
		store:SetAsync(key(player), profile.data)
	end)
	profile.saving = false
	if not ok then
		warn("[Data] save failed: " .. tostring(err))
	end
end

-- 連続した操作（買い物など）は、少しあとに まとめて保存する。DataStoreの回数制限を守るため。
function Data.saveSoon(player: Player)
	if savePending[player] then
		return
	end
	savePending[player] = true
	local profile = profiles[player]
	local wait = math.max(4, MIN_SAVE_GAP - (os.clock() - (profile and profile.lastSaved or 0)))
	task.delay(wait, function()
		savePending[player] = nil
		if profiles[player] then
			Data.save(player)
		end
	end)
end

function Data.release(player: Player)
	Data.save(player, true)
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
		profile.runtime.tool = nil -- 種を持ったら、道具はしまう（手に持つのは1つだけ）
	end
end

-- 手に持っている道具（"water" = じょうろ / "fertilizer" = ひりょう / nil = 種）。
-- 水やり・ひりょうは、自分で道具を選んだときだけできる（植えたらすぐ出てくるのではなく、自分で世話をする）
function Data.tool(player: Player): string?
	local profile = profiles[player]
	if not profile then
		return nil
	end
	-- ひりょうを使い切ったら・じょうろの水がなくなったら、自動でしまう
	local tool = profile.runtime.tool
	if
		(tool == "fertilizer" and (profile.data.fertilizer or 0) <= 0)
		or (tool == "drop" and (profile.data.drops or 0) <= 0)
		or (tool == "water" and (profile.data.water == nil or profile.data.water.amount <= 0))
	then
		profile.runtime.tool = nil
	end
	return profile.runtime.tool
end

function Data.setTool(player: Player, tool: string?)
	local profile = profiles[player]
	if profile then
		profile.runtime.tool = tool
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

-- 同じ瞬間に何回 push されても、送るのは1回だけにする（全部の状態を毎回送ると、通信も画面の作り直しも重い）
local pushPending: { [Player]: boolean } = {}
local sendState

function Data.push(player: Player)
	player:SetAttribute("HeldGardenTool", Data.tool(player) or "")
	if pushPending[player] then
		return
	end
	pushPending[player] = true
	task.defer(function()
		pushPending[player] = nil
		if player.Parent then
			sendState(player)
		end
	end)
end

sendState = function(player: Player)
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
		friends = extra.friends,
		promise = extra.promise,
		decor = extra.decor,
		room = extra.room,
		seen = d.seen,
		seedShop = extra.seedShop,
		pets = d.pets,
		equipped = d.equipped,
		sellBonus = 1 + Data.petBonus(d),
		coins = d.coins,
		seeds = d.seeds,
		basket = d.basket,
		basketSparkle = d.basketSparkle,
		basketV = d.basketV,
		cropDex = d.cropDex,
		selected = Data.selected(player),
		tool = Data.tool(player),
		tutorialDone = d.tutorialDone,
		music = d.music,
		water = d.water,
		fertilizer = d.fertilizer,
		drops = d.drops,
		plotTiles = d.plotTiles,
		dex = d.dex,
		plotId = player:GetAttribute("PlotId"),
	})
end

function Data.startAutoSave()
	task.spawn(function()
		while true do
			task.wait(Config.AutoSaveSeconds)
			for _, player in Players:GetPlayers() do
				-- 少し前に保存したばかりの人は とばす（むだな書きこみを減らす）
				local profile = profiles[player]
				if profile and os.clock() - (profile.lastSaved or 0) >= Config.AutoSaveSeconds / 2 then
					task.spawn(Data.save, player)
				end
			end
		end
	end)
end

return Data

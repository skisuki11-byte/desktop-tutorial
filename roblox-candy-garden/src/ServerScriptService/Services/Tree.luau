-- コミュニティの木。サーバー全員の収穫が成長ポイントになる協力要素。
-- 奪い合いの代わりに、みんなで育てて、レベルが上がると全員にごほうびを出す。
-- 状態は workspace の属性（TreeLevel / TreeProgress / TreeGoal）で全員に共有する。
-- 進み具合は全サーバー共通（下の「全サーバー共通の進み具合」）。サーバーが閉じても育ちは残る。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Season = require(script.Parent.Season)
local Cosmetics = require(script.Parent.Cosmetics)
local Pals = require(script.Parent.Pals)

local Tree = {}

local level = 1
local progress = 0
local model: Model
local emitter: ParticleEmitter

local function block(props: { [string]: any }): Part
	local base = {
		Anchored = true,
		CanCollide = false,
		CastShadow = true,
		TopSurface = Enum.SurfaceType.Smooth,
		BottomSurface = Enum.SurfaceType.Smooth,
		Material = Enum.Material.SmoothPlastic,
	}
	for k, v in props do
		base[k] = v
	end
	local part = Instance.new("Part")
	for k, v in base do
		part[k] = v
	end
	part.Parent = model
	return part
end

local function publish()
	workspace:SetAttribute("TreeLevel", level)
	workspace:SetAttribute("TreeProgress", progress)
	workspace:SetAttribute("TreeGoal", Config.treeGoal(level))
end

-- 色のテーマ（Config.Tree.Themes で、どのレベルから切り替わるかを決める）
-- canopy: わたあめの葉っぱ / ornament: 飾り / trunk: 幹 / star: てっぺん / glow: 光の色
local THEMES = {
	pastel = {
		canopy = { Color3.fromRGB(255, 170, 205), Color3.fromRGB(190, 235, 215), Color3.fromRGB(215, 190, 255) },
		ornament = { Color3.fromRGB(255, 226, 120), Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 140, 190) },
		trunk = Color3.fromRGB(160, 110, 84),
		star = Color3.fromRGB(255, 226, 90),
		glow = Color3.fromRGB(255, 200, 230),
	},
	-- レベル10から: 金色の夕焼け
	golden = {
		canopy = { Color3.fromRGB(255, 200, 120), Color3.fromRGB(255, 160, 150), Color3.fromRGB(255, 225, 160) },
		ornament = { Color3.fromRGB(255, 240, 170), Color3.fromRGB(255, 120, 120), Color3.fromRGB(255, 180, 80) },
		trunk = Color3.fromRGB(150, 95, 70),
		star = Color3.fromRGB(255, 210, 60),
		glow = Color3.fromRGB(255, 200, 120),
	},
	-- レベル20から: 星空（夜空色のわたあめに、光る星）
	galaxy = {
		canopy = { Color3.fromRGB(120, 110, 220), Color3.fromRGB(80, 170, 230), Color3.fromRGB(190, 120, 230) },
		ornament = { Color3.fromRGB(255, 255, 255), Color3.fromRGB(150, 240, 255), Color3.fromRGB(255, 170, 240) },
		trunk = Color3.fromRGB(110, 80, 120),
		star = Color3.fromRGB(200, 240, 255),
		glow = Color3.fromRGB(170, 200, 255),
	},
}

local function themeFor(lv: number)
	local id = "pastel"
	for _, entry in Config.Tree.Themes do
		if lv >= entry.from then
			id = entry.id
		end
	end
	return THEMES[id]
end

local function light(parent: Instance, color: Color3, range: number, brightness: number)
	local l = Instance.new("PointLight")
	l.Color = color
	l.Range = range
	l.Brightness = brightness
	l.Parent = parent
end

-- レベルに合わせて木を作り直す。レベル10までは毎回なにかが増える（形）。そのあとは色が変わる（テーマ）。
-- スマホの縦持ちでも収まるよう、横より縦に伸ばす（幅はレベル10で約2倍、高さは約2.8倍）
--   2: 飾りが光る / 3: てっぺんに星 / 4: 下に花のわ / 5: キャンディケーンの飾り
--   6: 葉っぱが二段に / 7: ちょうちんの灯り / 8: いつもキラキラ / 9: まわるペロペロキャンディ / 10: 金の冠
local function rebuild()
	model:ClearAllChildren()
	local visual = math.min(level, Config.Tree.MaxVisualLevel)
	local theme = themeFor(level)
	local sw = 1 + (visual - 1) * 0.12 -- 幅
	local sh = 1 + (visual - 1) * 0.2 -- 高さ
	local trunkHeight = 9 * sh

	local trunk = block({
		Name = "Trunk",
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(trunkHeight, 3.2 * sw, 3.2 * sw),
		CFrame = CFrame.new(0, trunkHeight / 2 + 0.4, 0) * CFrame.Angles(0, 0, math.pi / 2),
		Color = theme.trunk,
		Material = Enum.Material.Wood, -- 木目の幹（リアルな質感）
		CanCollide = true,
	})
	model.PrimaryPart = trunk

	-- わたあめの葉っぱ
	local radius = 6.5 * sw
	local top = trunkHeight + radius * 0.45
	local canopyCenter = Vector3.new(0, top, 0)
	local canopy = block({
		Name = "Canopy",
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * radius * 2,
		Position = canopyCenter,
		Color = theme.canopy[1],
		Material = Enum.Material.Fabric, -- ふわふわのわたあめ
	})
	for i = 1, 5 do
		local angle = (i / 5) * math.pi * 2
		block({
			Name = "Puff",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * radius * 1.25,
			Position = canopyCenter + Vector3.new(math.cos(angle) * radius * 0.85, -radius * 0.25, math.sin(angle) * radius * 0.85),
			Color = theme.canopy[(i % #theme.canopy) + 1],
			Material = Enum.Material.Fabric,
		})
	end
	-- 6: 葉っぱが二段に（上にもう一段のせて、背が高くなる）
	local crownTop = canopyCenter + Vector3.new(0, radius * 0.95, 0)
	if visual >= 6 then
		block({
			Name = "UpperCanopy",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * radius * 1.35,
			Position = canopyCenter + Vector3.new(0, radius * 0.95, 0),
			Color = theme.canopy[3],
			Material = Enum.Material.Fabric,
		})
		crownTop = canopyCenter + Vector3.new(0, radius * 1.6, 0)
	end

	-- 飾り（レベルが上がるほど増える）
	local count = 6 * visual
	for i = 1, count do
		local y = 1 - ((i - 0.5) / count) * 1.7 -- 上から下へ
		local ring = math.sqrt(math.max(0, 1 - y * y))
		local angle = i * 2.39996 -- 黄金角
		local r = radius * 1.02
		local ornament = block({
			Name = "Ornament",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 0.9 * sw,
			Position = canopyCenter + Vector3.new(math.cos(angle) * ring * r, y * r, math.sin(angle) * ring * r),
			Color = theme.ornament[(i % #theme.ornament) + 1],
			Material = Enum.Material.Neon,
		})
		-- 2: 飾りの一部が光る
		if visual >= 2 and i % 6 == 0 then
			light(ornament, ornament.Color, 8, 0.8)
		end
	end

	-- 3: てっぺんに星
	if visual >= 3 then
		local star = block({
			Name = "Star",
			Shape = Enum.PartType.Ball,
			Size = Vector3.one * 2.6 * sw,
			Position = crownTop + Vector3.new(0, 1.2 * sw, 0),
			Color = theme.star,
			Material = Enum.Material.Neon,
		})
		light(star, star.Color, 18, 1.5)
		-- 10: 金の冠（星のまわりに光る輪）
		if visual >= 10 then
			for i = 1, 8 do
				local a = (i / 8) * math.pi * 2
				block({
					Name = "Crown",
					Shape = Enum.PartType.Ball,
					Size = Vector3.one * 1.1 * sw,
					Position = star.Position + Vector3.new(math.cos(a) * 2.6 * sw, -0.6 * sw, math.sin(a) * 2.6 * sw),
					Color = Color3.fromRGB(255, 215, 90),
					Material = Enum.Material.Neon,
				})
			end
		end
	end

	-- 4: 根元に花のわ（グミの花）
	if visual >= 4 then
		for i = 1, 14 do
			local a = (i / 14) * math.pi * 2
			block({
				Name = "Flower",
				Shape = Enum.PartType.Ball,
				Size = Vector3.new(1.4, 0.9, 1.4),
				Position = Vector3.new(math.cos(a) * 4.5 * sw, 0.7, math.sin(a) * 4.5 * sw),
				Color = theme.ornament[(i % #theme.ornament) + 1],
				Material = Enum.Material.Glass,
			})
		end
	end

	-- 5: キャンディケーンの飾り（葉っぱの下に、ぐるりと）
	if visual >= 5 then
		for i = 1, 6 do
			local a = (i / 6) * math.pi * 2 + 0.3
			local base = canopyCenter + Vector3.new(math.cos(a) * radius * 1.05, -radius * 0.55, math.sin(a) * radius * 1.05)
			for k = 0, 3 do
				block({
					Name = "Cane",
					Shape = Enum.PartType.Cylinder,
					Size = Vector3.new(0.6, 0.45, 0.45),
					CFrame = CFrame.new(base - Vector3.new(0, k * 0.6, 0)) * CFrame.Angles(0, 0, math.pi / 2),
					Color = if k % 2 == 0 then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(240, 70, 100),
				})
			end
		end
	end

	-- 7: ちょうちんの灯り（夜もきれい）
	if visual >= 7 then
		for i = 1, 4 do
			local a = (i / 4) * math.pi * 2 + 0.8
			local lantern = block({
				Name = "Lantern",
				Shape = Enum.PartType.Ball,
				Size = Vector3.one * 1.6,
				Position = canopyCenter + Vector3.new(math.cos(a) * radius * 0.95, -radius * 0.9, math.sin(a) * radius * 0.95),
				Color = theme.glow,
				Material = Enum.Material.Neon,
			})
			light(lantern, theme.glow, 14, 1.2)
		end
	end

	-- 9: ペロペロキャンディが木のまわりに浮かぶ
	if visual >= 9 then
		for i = 1, 5 do
			local a = (i / 5) * math.pi * 2
			local pos = canopyCenter + Vector3.new(math.cos(a) * radius * 1.55, radius * 0.1, math.sin(a) * radius * 1.55)
			local candy = block({
				Name = "Lollipop",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.5, 2.6, 2.6),
				CFrame = CFrame.lookAt(pos, Vector3.new(0, pos.Y, 0)) * CFrame.Angles(0, math.pi / 2, 0),
				Color = theme.ornament[(i % #theme.ornament) + 1],
				Material = Enum.Material.Glass,
			})
			light(candy, candy.Color, 8, 0.6)
		end
	end

	-- 看板の位置（クライアントが看板を作る）
	block({
		Name = "SignAnchor",
		Size = Vector3.one,
		Position = crownTop + Vector3.new(0, 7 * sw, 0),
		Transparency = 1,
		CanQuery = false,
		CanTouch = false,
	})

	-- 8: いつも静かにキラキラ
	if visual >= 8 then
		local ambient = Instance.new("ParticleEmitter")
		ambient.Name = "Ambient"
		ambient.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		ambient.Rate = 6
		ambient.Lifetime = NumberRange.new(2, 3)
		ambient.Speed = NumberRange.new(1, 2)
		ambient.SpreadAngle = Vector2.new(180, 180)
		ambient.LightEmission = 0.8
		ambient.Size = NumberSequence.new(0.6, 0)
		ambient.Color = ColorSequence.new(theme.glow)
		ambient.Parent = canopy
	end

	-- お祝いの粒子（普段は止めておく）
	emitter = Instance.new("ParticleEmitter")
	emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	emitter.Rate = 90
	emitter.Lifetime = NumberRange.new(1.5, 2.4)
	emitter.Speed = NumberRange.new(14, 26)
	emitter.SpreadAngle = Vector2.new(180, 180)
	emitter.Acceleration = Vector3.new(0, -12, 0)
	emitter.LightEmission = 0.7
	emitter.Size = NumberSequence.new(1.2, 0.2)
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, theme.star),
		ColorSequenceKeypoint.new(0.5, theme.ornament[3]),
		ColorSequenceKeypoint.new(1, theme.glow),
	})
	emitter.Enabled = false
	emitter.Parent = canopy
end

local function celebrate()
	emitter.Enabled = true
	local current = emitter
	task.delay(4, function()
		if current.Parent then
			current.Enabled = false
		end
	end)
end

-- ---- 全サーバー共通の進み具合 ----
-- 木の育ち具合は「これまでに集まったポイントの合計（total）」1つの数だけで表す。レベルと進み具合は合計から計算する。
--   ・集計: MemoryStore（全サーバーで共有する高速な記録）に、10秒ごとにまとめて足す。
--           UpdateAsync で足すので、たくさんのサーバーが同時に書いても数が失われない
--   ・保存: 1分ごとに DataStore（ずっと残る保存場所）にも控えを書く。MemoryStore は最長45日で消えるため
--   ・Studio では本番と別の木を使う（プレイヤーデータと同じ考え方）
local MemoryStoreService = game:GetService("MemoryStoreService")
local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local STORE_NAME = "CandyTree" .. (if RunService:IsStudio() then "_Studio" else "")
local TOTAL_KEY = "total"
local MEMORY_TTL = 30 * 24 * 3600 -- 30日（MemoryStore の上限は45日）
local SYNC_SECONDS = 10
local SAVE_SECONDS = 60

local STAR_KEY = "starAt" -- ほしぞらの木になった時刻（全サーバー共通。ほしぞらまつりの始まり）
local starAt = 0
local total = 0 -- 全サーバーで集まった合計（最後に確かめた値）
local pending = 0 -- このサーバーで集まって、まだ足していないポイント
local shownLevel = 1 -- 画面に出している（お祝い済みの）レベル

local memoryMap = nil
local dataStore = nil
pcall(function()
	memoryMap = MemoryStoreService:GetSortedMap(STORE_NAME)
end)
pcall(function()
	dataStore = DataStoreService:GetDataStore(STORE_NAME)
end)

-- 合計ポイントから、レベルと次のレベルまでの進み具合を出す
local function fromTotal(points: number): (number, number)
	local lv = 1
	local rest = points
	while rest >= Config.treeGoal(lv) and lv < 999 do
		rest -= Config.treeGoal(lv)
		lv += 1
	end
	return lv, rest
end

-- ---- ほしぞらのおくりもの（Config.StarGift） ----
-- みんなの木がレベル20になったら、全員に1回だけ: 限定のおしゃれ・まもりがみのペット・コイン。
-- あとから来た人にも、来たときに渡す（見逃しを作らない）。
-- コインは「木を てつだった おれい」: 自分で しゅうかくした回数が Config.StarGift.thanksHarvests に とどいた人にだけ。
-- まだの人（はじめての子など）には、おしゃれと ペットを先に わたし、コインは とどいたときに 木から とどける。
-- （来た時期ではなく「どれだけ てつだったか」で決める。はじめての子には「あと何回」が つぎの目標になる）
local function thanksReady(d): boolean
	return not d.starCoins and (d.harvests or 0) >= Config.StarGift.thanksHarvests
end

local function giveStarGift(player: Player)
	local d = Data.get(player)
	if not d or d.starGift or level < Config.StarGift.level then
		return
	end
	-- はじめての人は、案内（植える→収穫→売る）が終わってから わたす（最初の1分は「何をするか」に集中してもらう）
	if not d.tutorialDone then
		return
	end
	d.starGift = true
	local coins = 0
	if thanksReady(d) then
		coins = Config.StarGift.coins
		d.starCoins = true
		d.coins += coins
	end
	for _, id in Config.StarGift.cosmetics do
		Cosmetics.grant(player, id)
	end
	Pals.grant(player, Config.StarGift.pet)
	Data.push(player)
	Data.saveSoon(player)
	-- コインが まだなら「あと何回」も いっしょに送る（お祝いの画面を 閉じたときに つぎの目標として 知らせる）
	local left = if d.starCoins then 0 else math.max(0, Config.StarGift.thanksHarvests - (d.harvests or 0))
	Remotes.StarGift:FireClient(player, Config.StarGift.level, coins, nil, left)
end

local function publishFestival()
	workspace:SetAttribute("StarFestivalEndsAt", if starAt > 0 then starAt + Config.StarGift.festivalSeconds else 0)
end

-- ほしぞらの木になった時刻を、全サーバー共通の記録とずっと残る控えに書く（先に書かれていれば、そちらを使う）
local function markStar()
	if starAt > 0 then
		return
	end
	starAt = os.time()
	publishFestival()
	task.spawn(function()
		if memoryMap then
			local ok, value = pcall(function()
				return memoryMap:UpdateAsync(STAR_KEY, function(old)
					return if tonumber(old) and tonumber(old) > 0 then old else starAt
				end, MEMORY_TTL)
			end)
			if ok and type(value) == "number" then
				starAt = value
			end
		end
		if dataStore then
			pcall(function()
				dataStore:UpdateAsync(STAR_KEY, function(old)
					return if tonumber(old) and tonumber(old) > 0 then old else starAt
				end)
			end)
		end
		publishFestival()
	end)
end

-- ほかのサーバーが先にほしぞらの木にしていたら、その時刻を読む
local function readStar()
	if starAt > 0 then
		return
	end
	for _, store in { memoryMap, dataStore } do
		if store then
			local ok, value = pcall(function()
				return store:GetAsync(STAR_KEY)
			end)
			if ok and type(value) == "number" and value > 0 then
				starAt = value
				publishFestival()
				return
			end
		end
	end
end

-- 合計（＋このサーバーのまだ足していない分）から表示を更新し、レベルが上がっていたらお祝いする
local starAnnounced = false -- このサーバーで ほしぞらの木の おくりものを 配ったか
local function refresh(celebrateLevelUp: boolean)
	local lv, rest = fromTotal(total + pending)
	level, progress = lv, rest
	publish()
	if lv > shownLevel then
		local reward = Config.treeReward(lv - 1) -- 上がった最後のレベルのごほうび（まとめて上がっても多重取りにならない）
		shownLevel = lv
		rebuild()
		if celebrateLevelUp then
			for _, player in Players:GetPlayers() do
				local d = Data.get(player)
				if d then
					d.coins += reward
					Data.push(player)
					Data.saveSoon(player)
					Season.addXp(player, Config.Season.xp.tree)
				end
			end
			celebrate()
			Remotes.TreeLevelUp:FireAllClients(lv, reward)
		end
	end
	-- ほしぞらの木に なった瞬間だけ: まつりを始めて、ここにいる全員におくりもの
	-- （毎回の更新で配ると、案内を終えたばかりの子に ルルのあいさつより先に 出てしまう。
	--   あとから来た人・案内を終えた人には、Tree.onPlayerReady で ちょうどいいときに渡す）
	if lv >= Config.StarGift.level and not starAnnounced then
		starAnnounced = true
		markStar()
		for _, player in Players:GetPlayers() do
			giveStarGift(player)
		end
	end
end

-- 全サーバー共通の合計に、このサーバーの分を足す（足す物が無いときは、ほかのサーバーの進みを読むだけ）
local function sync()
	if not memoryMap then
		return
	end
	local flush = pending
	local ok, result = pcall(function()
		if flush > 0 then
			return memoryMap:UpdateAsync(TOTAL_KEY, function(old)
				return (tonumber(old) or total) + flush
			end, MEMORY_TTL)
		end
		return memoryMap:GetAsync(TOTAL_KEY)
	end)
	if ok then
		pending -= flush
		if type(result) == "number" then
			total = math.max(total, result)
		end
	else
		warn("[Tree] 共通の木を更新できませんでした（あとでもう一度）: " .. tostring(result))
	end
	if level >= Config.StarGift.level then
		readStar()
	end
	refresh(true)
end

-- ずっと残る保存場所に控えを書く（大きい方を残すので、古い値で上書きしない）
local function save()
	if not dataStore then
		return
	end
	local value = total
	local ok, err = pcall(function()
		dataStore:UpdateAsync(TOTAL_KEY, function(old)
			return math.max(tonumber(old) or 0, value)
		end)
	end)
	if not ok then
		warn("[Tree] 木の控えを保存できませんでした: " .. tostring(err))
	end
end

-- 起動時: 控え（DataStore）と共通の記録（MemoryStore）の大きい方から始める。お祝いはしない
local function load()
	local saved, live = 0, 0
	if dataStore then
		local ok, value = pcall(function()
			return dataStore:GetAsync(TOTAL_KEY)
		end)
		if ok and type(value) == "number" then
			saved = value
		end
	end
	if memoryMap then
		local ok, value = pcall(function()
			return memoryMap:GetAsync(TOTAL_KEY)
		end)
		if ok and type(value) == "number" then
			live = value
		end
		-- 共通の記録が消えていた（長いあいだ誰も来なかった）ときは、控えから戻す
		if saved > live then
			pcall(function()
				memoryMap:UpdateAsync(TOTAL_KEY, function(old)
					return math.max(tonumber(old) or 0, saved)
				end, MEMORY_TTL)
			end)
		end
	end
	total = math.max(saved, live)
	shownLevel = fromTotal(total)
	readStar()
	refresh(false)
	rebuild()
end

function Tree.build()
	model = Instance.new("Model")
	model.Name = "CommunityTree"
	model.Parent = workspace
	rebuild()
	publish()
	task.spawn(function()
		load()
		local sinceSave = 0
		while true do
			task.wait(SYNC_SECONDS)
			sync()
			sinceSave += SYNC_SECONDS
			if sinceSave >= SAVE_SECONDS then
				sinceSave = 0
				save()
			end
		end
	end)
	-- サーバーが閉じるときは、残りを足して控えも書く
	game:BindToClose(function()
		sync()
		save()
	end)
end

-- 収穫のたびに呼ぶ。points は作物ごとの成長ポイント。
-- 画面にはすぐ反映し（待たせない）、全サーバー共通の合計には10秒ごとにまとめて足す
function Tree.add(cropId: string)
	pending += Config.Tree.Points[cropId] or 1
	refresh(true)
end

-- しょんぼり雲を はらしたときなど、作物いがいで木を育てる
function Tree.addPoints(points: number)
	pending += math.max(0, math.floor(points))
	refresh(true)
end

-- 参加した人の準備ができたら呼ぶ。すでにほしぞらの木なら、おくりものを渡す
function Tree.onPlayerReady(player: Player)
	task.delay(3, function() -- 画面が出そろってから
		if player.Parent == Players then
			giveStarGift(player)
		end
	end)
end

-- しゅうかくしたら 呼ぶ（Garden）。おくりものを もらっていて、しゅうかくの回数が とどいたら、木から おれいの コイン
function Tree.onHarvest(player: Player)
	local d = Data.get(player)
	if not d or not d.starGift or d.starCoins or level < Config.StarGift.level then
		return
	end
	local left = Config.StarGift.thanksHarvests - (d.harvests or 0)
	if left <= 0 then
		d.starCoins = true
		d.coins += Config.StarGift.coins
		Data.saveSoon(player)
		Remotes.StarGift:FireClient(player, Config.StarGift.level, Config.StarGift.coins, "thanks")
	elseif left == 50 or left == 10 then
		Remotes.Toast:FireClient(player, "toast.starThanksLeft", left)
	end
end

-- 画面の「おれいまで あと何回」（おくりものを もらっていて、コインが まだの人だけ）
Data.addStateExtender(function(player: Player)
	local d = Data.get(player)
	if not d or not d.starGift or d.starCoins or level < Config.StarGift.level then
		return {}
	end
	return { starThanksLeft = math.max(0, Config.StarGift.thanksHarvests - (d.harvests or 0)) }
end)

-- Studioでの確認用（本番では動かない）: workspace の属性 DebugHarvests に 数を入れると、全員の しゅうかく回数を その数にする
if game:GetService("RunService"):IsStudio() then
	workspace:GetAttributeChangedSignal("DebugHarvests"):Connect(function()
		local n = workspace:GetAttribute("DebugHarvests")
		if type(n) ~= "number" then
			return
		end
		for _, player in Players:GetPlayers() do
			local d = Data.get(player)
			if d then
				d.harvests = n
				Data.push(player)
			end
		end
	end)
end

-- 今の木の合計ポイント（テスト・確認用）
function Tree.total(): number
	return total + pending
end

return Tree

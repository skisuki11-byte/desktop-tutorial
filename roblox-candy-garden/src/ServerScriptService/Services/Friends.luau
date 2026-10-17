-- なかよしレベル と やくそくの種（Robloxの友だちと、いっしょに遊ぶほど楽しくなる仕掛け）
--
-- なかよしレベル（ポケモンGOの「なかよし度」と同じ考え方）
--   ・同じサーバーで いっしょにいると、1分ごとに 1ポイント
--   ・友だちの畑に 水やり・ひりょう・しずく をあげると、あげた人にも もらった人にも ポイント
--   ・1日にたまる量に上限がある（長くいるほど得、ではなく「毎日ちょっとずつ」）。レベルが上がると ごほうび
--
-- やくそくの種（あつまれ どうぶつの森の「また来てね」の約束を、ゲームの仕組みにしたもの）
--   ・友だちと その日に 3分 いっしょに遊ぶと、2人の庭に 1つずつ「やくそくの鉢」が置かれる
--   ・次の日から、それぞれが 自分の鉢に水をあげる。2人ともあげると「ゆうじょうの花」がさいて、2人に ごほうび
--   ・別のサーバーにいても届くように、2人が水をあげたかは DataStore（やくそくごとの記録）に書く
--   ・来られない日があっても 枯れない（Duolingo の連続記録のような「休むと損」はつくらない）
--
-- 子供の安全のため、相手は Robloxで友だちになっている人だけ（知らない人とは つながらない）
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)

local Friends = {}

local DAY = 86400
local C = Color3.fromRGB
local POT_SPOT = Vector3.new(-23.5, 0, 8) -- 庭の床の中心から見た 鉢の場所（左の柵の外。飾りの場所とは重ならない）

local function today(): number
	return math.floor(os.time() / DAY)
end

local promiseStore
do
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Data.storeName() .. "_Promise")
	end)
	if ok then
		promiseStore = result
	end
end

-- ---- Robloxの友だちかどうか（ネットにたずねるので、答えを覚えておく） ----
local friendCache = {}
local function areFriends(a: Player, b: Player): boolean
	local key = if a.UserId < b.UserId then a.UserId .. "_" .. b.UserId else b.UserId .. "_" .. a.UserId
	local known = friendCache[key]
	if known ~= nil then
		return known
	end
	local ok, result = pcall(function()
		return a:IsFriendsWith(b.UserId)
	end)
	-- Studio のテスト用プレイヤー（マイナスのID）どうしは、友だちとして試せるようにする
	if a.UserId < 0 and b.UserId < 0 then
		ok, result = true, true
	end
	if ok then
		friendCache[key] = result == true
	end
	return ok and result == true
end

-- ---- なかよしレベル ----
local function levelFor(points: number): number
	local level = 1
	for i, need in Config.Friendship.levels do
		if points >= need then
			level = i
		end
	end
	return level
end

-- その友だちの記録（日が変わっていたら、その日の数をリセット）
local function record(d, other: Player)
	local key = tostring(other.UserId)
	local r = d.friendship[key]
	if not r then
		r = { name = other.DisplayName, pts = 0, lv = 1, day = 0, together = 0, helped = 0 }
		d.friendship[key] = r
	end
	r.name = other.DisplayName
	if r.day ~= today() then
		r.day = today()
		r.together = 0
		r.helped = 0
	end
	return r
end

local function addPoints(player: Player, other: Player, amount: number, kind: string)
	local d = Data.get(player)
	if not d then
		return
	end
	local r = record(d, other)
	local give = math.min(amount, Config.Friendship.dailyCap[kind] - r[kind])
	if give <= 0 then
		return
	end
	r[kind] += give
	r.pts += give
	local newLevel = levelFor(r.pts)
	while r.lv < newLevel do
		r.lv += 1
		local reward = Config.Friendship.rewards[r.lv]
		if reward then
			d.coins += reward.coins or 0
			d.fertilizer = math.min(Config.Fertilizer.max, (d.fertilizer or 0) + (reward.fertilizer or 0))
			d.drops = (d.drops or 0) + (reward.drops or 0)
		end
		Remotes.Toast:FireClient(player, "toast.friendLevel", other.DisplayName, r.lv)
	end
	Data.push(player)
	Data.saveSoon(player)
end

-- 友だちの畑を手伝ったとき（Garden から呼ぶ）
function Friends.onHelp(helper: Player, owner: Player)
	if helper == owner or not areFriends(helper, owner) then
		return
	end
	addPoints(helper, owner, Config.Friendship.helpPoints, "helped")
	addPoints(owner, helper, Config.Friendship.helpPoints, "helped")
end

-- ---- やくそくの鉢（庭に置く。ほかの人にも見える） ----
local function part(parent: Instance, props): Part
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

local function ball(parent: Instance, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?)
	return part(parent, {
		Shape = Enum.PartType.Ball,
		Size = Vector3.new(diameter, diameter, diameter),
		CFrame = cf,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

local function cylinder(parent: Instance, height: number, diameter: number, cf: CFrame, color: Color3)
	return part(parent, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, diameter, diameter),
		CFrame = cf * CFrame.Angles(0, 0, math.rad(90)),
		Color = color,
	})
end

function Friends.renderPot(player: Player)
	local plot = World.plotOf(player)
	if not plot then
		return
	end
	local old = plot.model:FindFirstChild("PromisePot")
	if old then
		old:Destroy()
	end
	local d = Data.get(player)
	local promise = d and d.promise
	if not promise or not promise.id then
		return
	end
	local model = Instance.new("Model")
	model.Name = "PromisePot"
	local base = plot.model.PrimaryPart.CFrame * CFrame.new(0, -0.5, 0)
	local spot = (base * CFrame.new(POT_SPOT)).Position
	local center = base.Position
	local at = CFrame.lookAt(spot, Vector3.new(center.X, spot.Y, center.Z))
	-- 鉢と土（水をあげると、土が しっとり濃い色）
	cylinder(model, 1.6, 2.2, at * CFrame.new(0, 0.8, 0), C(240, 150, 175))
	cylinder(model, 0.3, 2.5, at * CFrame.new(0, 1.6, 0), C(250, 185, 205))
	cylinder(model, 0.1, 2.0, at * CFrame.new(0, 1.62, 0), if promise.watered then C(70, 45, 35) else C(120, 85, 60))
	local leaf = C(110, 200, 120)
	if promise.bloomed then
		-- ゆうじょうの花: 長い くき、虹色の大きな花びら、光る まんなか、ときどき 小さなキラキラ
		cylinder(model, 2.4, 0.26, at * CFrame.new(0, 2.8, 0), leaf)
		ball(model, 0.75, at * CFrame.new(-0.42, 2.5, 0), leaf)
		ball(model, 0.75, at * CFrame.new(0.42, 2.9, 0), leaf)
		local petals = { C(255, 150, 190), C(255, 210, 120), C(170, 200, 255), C(200, 160, 255), C(150, 225, 170), C(255, 170, 120) }
		local flower = at * CFrame.new(0, 4.3, 0) * CFrame.Angles(math.rad(-25), 0, 0)
		for i = 1, 6 do
			local a = (i / 6) * math.pi * 2
			ball(model, 1.05, flower * CFrame.new(math.cos(a) * 0.78, math.sin(a) * 0.78, 0), petals[i])
		end
		local heart = ball(model, 0.8, flower * CFrame.new(0, 0, -0.2), C(255, 225, 120), Enum.Material.Neon)
		local attachment = Instance.new("Attachment")
		attachment.Parent = heart
		local sparkle = Instance.new("ParticleEmitter")
		sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		sparkle.Color = ColorSequence.new(C(255, 230, 245))
		sparkle.Size = NumberSequence.new(0.35, 0)
		sparkle.Lifetime = NumberRange.new(0.8, 1.4)
		sparkle.Speed = NumberRange.new(0.5, 1.2)
		sparkle.SpreadAngle = Vector2.new(180, 180)
		sparkle.Rate = 4
		sparkle.LightEmission = 0.6
		sparkle.Parent = attachment
	else
		-- 芽（水をあげたら、ふくらんだ つぼみ）
		cylinder(model, 0.9, 0.16, at * CFrame.new(0, 2.1, 0), leaf)
		ball(model, 0.5, at * CFrame.new(-0.28, 2.3, 0), leaf)
		ball(model, 0.5, at * CFrame.new(0.28, 2.45, 0), leaf)
		if promise.watered then
			ball(model, 0.55, at * CFrame.new(0, 2.7, 0), C(255, 150, 190))
		end
	end
	-- 名札「🤝 ○○」（だれとの やくそくか）
	local tag = part(model, { Name = "Tag", Size = Vector3.new(0.2, 0.2, 0.2), Transparency = 1, CFrame = at * CFrame.new(0, 6, 0) })
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromScale(6, 1.1)
	gui.LightInfluence = 0
	gui.MaxDistance = 60
	gui.Parent = tag
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Size = UDim2.fromScale(1, 1)
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = C(214, 70, 128)
	label.TextStrokeColor3 = C(255, 255, 255)
	label.TextStrokeTransparency = 0
	label.Text = "🤝 " .. (promise.partnerName or "")
	label.Parent = gui
	-- 水やりのボタン（持ち主だけ。文字と見た目はクライアントの PromptUI が入れる）
	if not promise.watered and not promise.bloomed then
		local hit = part(model, { Name = "Spot", Size = Vector3.new(2.4, 3, 2.4), Transparency = 1, CFrame = at * CFrame.new(0, 1.5, 0) })
		local prompt = Instance.new("ProximityPrompt")
		prompt.Name = "PromisePrompt"
		prompt.ActionText = ""
		prompt.ObjectText = ""
		prompt.HoldDuration = 0
		prompt.MaxActivationDistance = 10
		prompt.RequiresLineOfSight = false
		prompt.KeyboardKeyCode = Enum.KeyCode.E
		prompt.Style = Enum.ProximityPromptStyle.Custom
		prompt:SetAttribute("OwnerUserId", player.UserId)
		prompt.Parent = hit
		prompt.Triggered:Connect(function(who)
			Friends.water(who)
		end)
	end
	model.Parent = plot.model
end

-- ---- やくそくの種 ----
local function canStartPromise(d): boolean
	if d.promiseDay == today() then
		return false -- 1日1回
	end
	local promise = d.promise
	if not promise or not promise.id or promise.bloomed then
		return true
	end
	-- さかないまま 長くたった やくそくは、新しい やくそくに かえてよい
	return today() - (promise.day or 0) >= Config.Promise.replaceAfterDays
end

local function startPromise(a: Player, b: Player)
	local da, db = Data.get(a), Data.get(b)
	if not da or not db or not canStartPromise(da) or not canStartPromise(db) then
		return
	end
	local id = HttpService:GenerateGUID(false)
	local day = today()
	da.promise = { id = id, partner = b.UserId, partnerName = b.DisplayName, day = day, watered = false, bloomed = false }
	db.promise = { id = id, partner = a.UserId, partnerName = a.DisplayName, day = day, watered = false, bloomed = false }
	da.promiseDay = day
	db.promiseDay = day
	for _, pair in { { a, b }, { b, a } } do
		Remotes.Toast:FireClient(pair[1], "toast.promiseSeed", pair[2].DisplayName)
		Friends.renderPot(pair[1])
		Data.push(pair[1])
		Data.saveSoon(pair[1])
	end
end

-- 2人とも 水をあげていたら さかせる（自分の記録と、DataStore の やくそくの記録を見る）
function Friends.checkBloom(player: Player)
	local d = Data.get(player)
	local promise = d and d.promise
	if not promise or not promise.id or not promise.watered or promise.bloomed or not promiseStore then
		return
	end
	local ok, record = pcall(function()
		return promiseStore:GetAsync(promise.id)
	end)
	if not ok or type(record) ~= "table" or type(record.watered) ~= "table" then
		return
	end
	if not record.watered[tostring(promise.partner)] then
		return
	end
	promise.bloomed = true
	d.coins += Config.Promise.coins
	local cosmetic = Config.Promise.cosmetic
	if cosmetic and Config.CosmeticById[cosmetic] then
		d.cosmetics.owned[cosmetic] = true
	end
	Remotes.Toast:FireClient(player, "toast.promiseBloom", promise.partnerName or "", Config.Promise.coins)
	Friends.renderPot(player)
	Data.push(player)
	Data.saveSoon(player)
end

-- 自分の鉢に 水をあげる（次の日から）
function Friends.water(player: Player)
	local d = Data.get(player)
	local promise = d and d.promise
	if not promise or not promise.id or promise.watered or promise.bloomed then
		return
	end
	if today() <= (promise.day or 0) then
		Remotes.Toast:FireClient(player, "toast.promiseTooEarly")
		return
	end
	if not promiseStore then
		return
	end
	local ok = pcall(function()
		promiseStore:UpdateAsync(promise.id, function(old)
			old = type(old) == "table" and old or {}
			old.watered = type(old.watered) == "table" and old.watered or {}
			old.watered[tostring(player.UserId)] = true
			return old
		end)
	end)
	if not ok then
		return
	end
	promise.watered = true
	Remotes.Toast:FireClient(player, "toast.promiseWatered")
	Friends.renderPot(player)
	Data.push(player)
	Data.saveSoon(player)
	Friends.checkBloom(player)
	-- 相手が同じサーバーにいれば、相手の花も すぐ さかせる
	local partner = Players:GetPlayerByUserId(promise.partner)
	if partner then
		Friends.checkBloom(partner)
	end
end

-- いっしょにいる時間を数える（1分ごと）
local function tick()
	local players = Players:GetPlayers()
	for i = 1, #players do
		for j = i + 1, #players do
			local a, b = players[i], players[j]
			if Data.get(a) and Data.get(b) and areFriends(a, b) then
				addPoints(a, b, 1, "together")
				addPoints(b, a, 1, "together")
				local ra = Data.get(a).friendship[tostring(b.UserId)]
				if ra and ra.together >= Config.Promise.togetherMinutes then
					startPromise(a, b)
				end
			end
		end
	end
end

-- 帰るときに、庭から鉢を片づける（次にその庭を使う人のため）
function Friends.clear(player: Player)
	local plot = World.plotOf(player)
	local pot = plot and plot.model:FindFirstChild("PromisePot")
	if pot then
		pot:Destroy()
	end
end

function Friends.onPlayerReady(player: Player)
	Friends.renderPot(player)
	task.spawn(Friends.checkBloom, player)
end

function Friends.init()
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		local list = {}
		for userId, r in d.friendship do
			local fresh = r.day == today()
			table.insert(list, {
				userId = tonumber(userId),
				name = r.name,
				pts = r.pts,
				lv = r.lv,
				today = if fresh then r.together + r.helped else 0,
			})
		end
		table.sort(list, function(x, y)
			return x.pts > y.pts
		end)
		local promise = d.promise
		return {
			friends = list,
			promise = if promise and promise.id
				then {
					partnerName = promise.partnerName,
					canWater = today() > (promise.day or 0),
					watered = promise.watered == true,
					bloomed = promise.bloomed == true,
				}
				else nil,
		}
	end)
	task.spawn(function()
		local elapsed = 0
		while true do
			task.wait(Config.Friendship.togetherEvery)
			pcall(tick)
			-- ときどき、別のサーバーの友だちが 水をあげたかを見る
			elapsed += Config.Friendship.togetherEvery
			if elapsed >= 120 then
				elapsed = 0
				for _, player in Players:GetPlayers() do
					pcall(Friends.checkBloom, player)
				end
			end
		end
	end)
	-- Studioでの確認用（本番では動かない）: workspace の属性 DebugFriends に
	--   "seed"    → 友だち2人の記録と、きのう植えた やくそくの種を入れる
	--   "partner" → 相手が水をあげたことにして、さくか確かめる
	if RunService:IsStudio() then
		workspace:GetAttributeChangedSignal("DebugFriends"):Connect(function()
			local mode = workspace:GetAttribute("DebugFriends")
			for _, player in Players:GetPlayers() do
				local d = Data.get(player)
				if d and mode == "seed" then
					local day = today()
					d.friendship["111"] = { name = "さくら", pts = 42, lv = 3, day = day, together = 4, helped = 2 }
					d.friendship["222"] = { name = "ゆうと", pts = 8, lv = 1, day = day - 1, together = 0, helped = 0 }
					d.promise = { id = "TEST-" .. player.UserId, partner = 111, partnerName = "さくら", day = day - 1, watered = false, bloomed = false }
					Friends.renderPot(player)
					Data.push(player)
				elseif d and mode == "partner" and promiseStore and d.promise and d.promise.id then
					pcall(function()
						promiseStore:UpdateAsync(d.promise.id, function(old)
							old = type(old) == "table" and old or {}
							old.watered = type(old.watered) == "table" and old.watered or {}
							old.watered[tostring(d.promise.partner)] = true
							return old
						end)
					end)
					Friends.checkBloom(player)
				end
			end
		end)
	end
	Players.PlayerRemoving:Connect(function(player)
		for key in friendCache do
			if string.find(key, tostring(player.UserId), 1, true) then
				friendCache[key] = nil
			end
		end
	end)
end

return Friends

-- ひみつきちの へや。庭のうしろの家（Reform が建てる）の とびらの前に 持ち主が来ると、
-- 画面が ふわっと暗くなって へやに切りかわる（へやは 庭の上空 HEIGHT の 別の場所。外からは見えないよう、画面でかくす）。
-- へやの中の とびらの前に来ると、同じように 家の前（庭がわ）に もどる。
-- 入れるのは 持ち主だけ（友だちを呼んだり、ほかの人の へやに入ったりは できない。自分だけの へや）。
-- 家具（Config.Furniture）は「決まった置き場所」に置く。置き場所の数は ひみつきちの段で増える（Config.RoomSlots）。
-- 参考: あつまれ どうぶつの森・Adopt Me!（家の中は 別の場所。とびらで 画面が切りかわる）
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local FurnitureVisuals = require(ReplicatedStorage.Shared.FurnitureVisuals)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)
local RateLimit = require(script.Parent.RateLimit)

local Room = {}

local C = Color3.fromRGB
local HEIGHT = 300 -- 庭の上空の どこに へやを置くか
local WALL = 12
local DOOR_REACH = 9 -- とびらの前の「近い」の はんい（サーバーで確かめる）
local FURNITURE_SCALE = 1.25 -- へやの広さに合わせて、家具を少し大きく
-- 段ごとの へやの広さ（よこ, おく）と 色（かべ, ゆか, ふち）
local ROOMS = {
	{ size = Vector2.new(18, 16), wall = C(255, 225, 238), floor = C(245, 225, 205), trim = C(255, 150, 190) }, -- テント
	{ size = Vector2.new(22, 18), wall = C(255, 214, 230), floor = C(240, 220, 210), trim = C(230, 90, 130) }, -- カップケーキのこや
	{ size = Vector2.new(26, 20), wall = C(255, 240, 210), floor = C(214, 168, 120), trim = C(140, 85, 60) }, -- キャンディのおうち
	{ size = Vector2.new(30, 24), wall = C(220, 238, 255), floor = C(230, 200, 160), trim = C(255, 120, 170) }, -- 2かいだて
	{ size = Vector2.new(34, 28), wall = C(240, 228, 255), floor = C(245, 215, 235), trim = C(190, 150, 255) }, -- パレス
}

local function part(parent: Instance, props: { [string]: any }): Part
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

local function info(level: number)
	return ROOMS[math.clamp(level, 1, #ROOMS)]
end

function Room.capacity(level: number): number
	if level <= 0 then
		return 0
	end
	return Config.RoomSlots[math.clamp(level, 1, #Config.RoomSlots)]
end

-- 置き場所: うしろの かべぞいに半分、左右の かべぞいに残り。前（とびらがわ）は あけておく
local function slotFrames(level: number): { CFrame }
	local n = Room.capacity(level)
	local size = info(level).size
	local w, d = size.X, size.Y
	local frames = {}
	local back = math.ceil(n / 2)
	local side = n - back
	local left = math.ceil(side / 2)
	local right = side - left
	for i = 1, back do
		local x = if back == 1 then 0 else -(w / 2 - 4) + (i - 1) * ((w - 8) / (back - 1))
		table.insert(frames, CFrame.new(x, 0, d / 2 - 3)) -- 前（-Z）が とびらを向く
	end
	local function sideRow(count: number, x: number, yaw: number)
		for i = 1, count do
			local z = if count == 1 then 0 else -(d / 2 - 7) + (i - 1) * ((d - 12) / (count - 1))
			table.insert(frames, CFrame.new(x, 0, z) * CFrame.Angles(0, yaw, 0))
		end
	end
	sideRow(left, -(w / 2 - 3), -math.pi / 2) -- 左のかべ: 右（+X）を向く
	sideRow(right, w / 2 - 3, math.pi / 2) -- 右のかべ: 左（-X）を向く
	return frames
end

local function placeFurniture(room: Model, level: number, slots: { string })
	local old = room:FindFirstChild("Furniture")
	if old then
		old:Destroy()
	end
	local folder = Instance.new("Folder")
	folder.Name = "Furniture"
	local base = room:GetPivot()
	for i, frame in slotFrames(level) do
		local id = slots[i] or ""
		local model = id ~= "" and FurnitureVisuals.build(id)
		if model then
			model.WorldPivot = CFrame.new()
			model:ScaleTo(FURNITURE_SCALE)
			model:PivotTo(base * frame)
			model.Parent = folder
		else
			-- あいている置き場所: うすい丸で「ここに置けるよ」と見せる
			part(folder, {
				Name = "EmptySlot",
				Shape = Enum.PartType.Cylinder,
				Size = Vector3.new(0.12, 3.4, 3.4),
				CFrame = base * frame * CFrame.new(0, 0.06, 0) * CFrame.Angles(0, 0, math.pi / 2),
				Color = C(255, 170, 210),
				Transparency = 0.55,
			})
		end
	end
	folder.Parent = room
end

-- ひみつきちの段に合わせて へやを作る（Reform から呼ぶ）
function Room.build(plot, level: number, d, parent: Instance)
	local look = info(level)
	local w, depth = look.size.X, look.size.Y
	local room = Instance.new("Model")
	room.Name = "Room"
	room:SetAttribute("Width", w)
	room:SetAttribute("Depth", depth)
	local origin = plot.model.PrimaryPart.CFrame * CFrame.new(0, HEIGHT, 0) -- 庭と同じ向き（-Z が とびらがわ）
	local floor = part(room, { Name = "Floor", Size = Vector3.new(w, 1, depth), CFrame = origin * CFrame.new(0, -0.5, 0), Color = look.floor, Material = if level == 3 or level == 4 then Enum.Material.WoodPlanks else Enum.Material.SmoothPlastic, CanCollide = true })
	room.PrimaryPart = floor
	local function wall(size: Vector3, at: Vector3)
		part(room, { Size = size, CFrame = origin * CFrame.new(at), Color = look.wall, CanCollide = true })
	end
	wall(Vector3.new(w + 2, WALL, 1), Vector3.new(0, WALL / 2, depth / 2 + 0.5))
	wall(Vector3.new(w + 2, WALL, 1), Vector3.new(0, WALL / 2, -depth / 2 - 0.5))
	wall(Vector3.new(1, WALL, depth), Vector3.new(-w / 2 - 0.5, WALL / 2, 0))
	wall(Vector3.new(1, WALL, depth), Vector3.new(w / 2 + 0.5, WALL / 2, 0))
	-- 天井（屋根）。中から見て 家の中だと分かるように
	part(room, { Name = "Ceiling", Size = Vector3.new(w + 2, 1, depth + 2), CFrame = origin * CFrame.new(0, WALL + 0.5, 0), Color = look.wall:Lerp(Color3.new(1, 1, 1), 0.4), CanCollide = true })
	-- はばき（かべの下の線）と、上のふち
	for _, y in { 0.3, WALL - 0.3 } do
		part(room, { Size = Vector3.new(w, 0.6, 0.2), CFrame = origin * CFrame.new(0, y, depth / 2 - 0.05), Color = look.trim })
		part(room, { Size = Vector3.new(0.2, 0.6, depth), CFrame = origin * CFrame.new(-w / 2 + 0.05, y, 0), Color = look.trim })
		part(room, { Size = Vector3.new(0.2, 0.6, depth), CFrame = origin * CFrame.new(w / 2 - 0.05, y, 0), Color = look.trim })
		part(room, { Size = Vector3.new(w, 0.6, 0.2), CFrame = origin * CFrame.new(0, y, -depth / 2 + 0.05), Color = look.trim })
	end
	-- まど（左右のかべ）
	for _, x in { -w / 2 + 0.1, w / 2 - 0.1 } do
		for _, z in { -depth / 4, depth / 4 } do
			part(room, { Size = Vector3.new(0.3, 3.6, 4), CFrame = origin * CFrame.new(x, 6.5, z), Color = look.trim })
			part(room, { Size = Vector3.new(0.4, 3, 3.4), CFrame = origin * CFrame.new(x, 6.5, z), Color = C(185, 225, 255), Material = Enum.Material.Glass, Transparency = 0.15 })
		end
	end
	-- 天井の あかり（ひとつだけ）
	local lamp = part(room, { Name = "Lamp", Shape = Enum.PartType.Ball, Size = Vector3.one * 1.6, CFrame = origin * CFrame.new(0, WALL - 0.6, 0), Color = C(255, 245, 220), Material = Enum.Material.Neon })
	local light = Instance.new("PointLight")
	light.Range = math.max(w, depth)
	light.Brightness = 0.6
	light.Color = C(255, 240, 225)
	light.Parent = lamp
	-- 出口の とびら（とびらの前に来ると 外へ）
	part(room, { Name = "ExitDoor", Size = Vector3.new(4, 6.5, 0.4), CFrame = origin * CFrame.new(0, 3.25, -depth / 2 + 0.1), Color = look.trim, Material = Enum.Material.Wood })
	part(room, { Name = "ExitMat", Size = Vector3.new(4, 0.1, 2.4), CFrame = origin * CFrame.new(0, 0.05, -depth / 2 + 1.4), Color = look.trim, Transparency = 0.3 })
	placeFurniture(room, level, (d.room and d.room.slots) or {})
	room.Parent = parent
	return room
end

-- ---- 出入り（画面の切りかえは クライアント。ここでは 本当に とびらの前か・持ち主か を確かめて 動かす） ----
local function rootOf(player: Player): BasePart?
	local character = player.Character
	local root = character and character:FindFirstChild("HumanoidRootPart")
	return if root and root:IsA("BasePart") then root else nil
end

local function partsOf(player: Player): (Model?, Model?)
	local plot = World.plotOf(player)
	local reform = plot and plot.model:FindFirstChild("Reform")
	if not reform then
		return nil, nil
	end
	return reform:FindFirstChild("SecretBase") :: Model?, reform:FindFirstChild("Room") :: Model?
end

local function onDoor(player: Player, action: any)
	if not RateLimit.ok(player, "roomDoor", 0.8) then
		return
	end
	local root = rootOf(player)
	local house, room = partsOf(player) -- 自分の庭の ひみつきち だけ（ほかの人の へやには 入れない）
	if not root or not house or not room then
		return
	end
	local entrance = house:FindFirstChild("Entrance") :: BasePart?
	-- "warp": 上の 🏠 ボタン（どこからでも 自分の へやへ）。入れるのは 自分の へや だけ（partsOf）なので ほかの人には 関係しない
	local near = entrance ~= nil and (root.Position - entrance.Position).Magnitude < DOOR_REACH
	if entrance and ((action == "enter" and near) or action == "warp") then
		local depth = room:GetAttribute("Depth") or 16
		World.standUp(player.Character) -- いこいの ひろばの いすから そのまま ワープしても、すわった まま に ならない
		root.AssemblyLinearVelocity = Vector3.zero
		-- とびらから少し中に入った所で、へやを向く（うしろのカメラが かべに つかえないよう すき間をあける）
		root.CFrame = room:GetPivot() * CFrame.new(0, 3, -(depth / 2 - 7)) * CFrame.Angles(0, math.pi, 0)
	elseif action == "exit" then
		local exitMat = room:FindFirstChild("ExitMat") :: BasePart?
		if exitMat and entrance and (root.Position - exitMat.Position).Magnitude < DOOR_REACH then
			World.standUp(player.Character)
			root.AssemblyLinearVelocity = Vector3.zero
			-- 家の前（庭がわ）に出て、庭のほうを向く（入口の しるしから 少し はなれた所）
			local out = entrance.CFrame * CFrame.new(0, 1, -5)
			root.CFrame = CFrame.lookAt(out.Position, out.Position + entrance.CFrame.LookVector)
		end
	end
end

-- へやが消える前に、中にいる人を 自分の庭へもどす（落ちないように）
function Room.evacuate(plot)
	local reform = plot.model:FindFirstChild("Reform")
	local room = reform and reform:FindFirstChild("Room") :: Model?
	if not room then
		return
	end
	local center = room:GetPivot().Position
	local w = room:GetAttribute("Width") or 20
	for _, player in game:GetService("Players"):GetPlayers() do
		local root = rootOf(player)
		if root and math.abs(root.Position.Y - center.Y) < 30 and (root.Position - center).Magnitude < w + 10 then
			World.teleport(player, "home")
		end
	end
end

local function houseOf(player: Player): Model?
	local _, room = partsOf(player)
	return room
end

-- ---- 家具を買う・置く・しまう ----
local function slotsOf(d): { string }
	d.room = d.room or { owned = {}, slots = {} }
	d.room.owned = d.room.owned or {}
	d.room.slots = d.room.slots or {}
	-- すき間（nil）があると 送ったときに 並びがくずれるので、"" でうめておく
	for i = 1, Config.RoomSlots[#Config.RoomSlots] do
		if d.room.slots[i] == nil then
			d.room.slots[i] = ""
		end
	end
	return d.room.slots
end

local function baseLevel(d): number
	return (d.reform and d.reform.base) or 0
end

local function firstEmpty(d): number?
	local slots = slotsOf(d)
	for i = 1, Room.capacity(baseLevel(d)) do
		if (slots[i] or "") == "" then
			return i
		end
	end
	return nil
end

local function isPlaced(d, id: string): boolean
	for _, value in slotsOf(d) do
		if value == id then
			return true
		end
	end
	return false
end

local function refresh(player: Player, d)
	local room = houseOf(player)
	if room then
		placeFurniture(room, baseLevel(d), slotsOf(d))
	end
	Data.push(player)
end

local function buy(player: Player, id: any)
	local item = type(id) == "string" and Config.FurnitureById[id]
	if not item or item.pass or not RateLimit.ok(player, "furniture", 0.3) then
		return -- パスの家具は コインでは買えない（パスを持っていれば 自動で もらえる）
	end
	local d = Data.get(player)
	if not d then
		return
	end
	slotsOf(d)
	if d.room.owned[id] then
		return
	end
	if d.coins < item.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= item.price
	d.room.owned[id] = true
	local slot = firstEmpty(d)
	if slot then
		d.room.slots[slot] = id
		Remotes.Toast:FireClient(player, "toast.furnBought", "@furn." .. id)
	elseif baseLevel(d) <= 0 then
		Remotes.Toast:FireClient(player, "toast.furnNeedBase")
	else
		Remotes.Toast:FireClient(player, "toast.roomFull")
	end
	refresh(player, d)
	Data.saveSoon(player)
end

local function place(player: Player, id: any)
	if type(id) ~= "string" or not RateLimit.ok(player, "furniture", 0.3) then
		return
	end
	local d = Data.get(player)
	if not d or not slotsOf(d) or not d.room.owned[id] or isPlaced(d, id) then
		return
	end
	local slot = firstEmpty(d)
	if not slot then
		Remotes.Toast:FireClient(player, if baseLevel(d) <= 0 then "toast.furnNeedBase" else "toast.roomFull")
		return
	end
	d.room.slots[slot] = id
	refresh(player, d)
	Data.saveSoon(player)
end

local function remove(player: Player, id: any)
	if type(id) ~= "string" or not RateLimit.ok(player, "furniture", 0.3) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	for i, value in slotsOf(d) do
		if value == id then
			d.room.slots[i] = ""
		end
	end
	refresh(player, d)
	Data.saveSoon(player)
end

function Room.init()
	Remotes.RoomDoor.OnServerEvent:Connect(onDoor)
	Remotes.BuyFurniture.OnServerEvent:Connect(buy)
	-- スペシャル家具パス: 持っている人に、パスの家具を わたす（参加したとき・買ったとき）
	require(script.Parent.Monetization).onOwned(function(player, key)
		local d = Data.get(player)
		if not d then
			return
		end
		slotsOf(d)
		local changed = false
		for _, item in Config.Furniture do
			if item.pass == key and not d.room.owned[item.id] then
				d.room.owned[item.id] = true
				changed = true
			end
		end
		if changed then
			Data.push(player)
		end
	end)
	Remotes.PlaceFurniture.OnServerEvent:Connect(place)
	Remotes.RemoveFurniture.OnServerEvent:Connect(remove)
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		local slots = slotsOf(d)
		return { room = { owned = d.room.owned, slots = slots, capacity = Room.capacity(baseLevel(d)) } }
	end)
end

return Room

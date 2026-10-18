-- ひみつきちの へや（家具）。ひみつきちは 中に歩いて入れる家（Reform が建てる）。その中に 家具を置く。
-- 入れるのは 持ち主だけ（とびらは 持ち主の画面でだけ あく。友だちを呼んだり、ほかの人の家に入ったりは できない）。
-- 家具（Config.Furniture）は「決まった置き場所」に置く。置き場所の数は ひみつきちの段で増える（Config.RoomSlots）。
-- へやは「がんばったごほうびを飾る場所」。畑の遊びが中心で、へやは 自分で楽しむ ごほうび。
-- 参考: あつまれ どうぶつの森（家具を集めて部屋を作る）
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local FurnitureVisuals = require(ReplicatedStorage.Shared.FurnitureVisuals)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)
local RateLimit = require(script.Parent.RateLimit)

local Room = {}

local C = Color3.fromRGB
local FLOOR_Y = 0.6 -- 家の ゆかの上の高さ
local FURNITURE_SCALE = 1.15 -- 家の広さに合わせて 少し大きく

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

function Room.capacity(level: number): number
	if level <= 0 then
		return 0
	end
	return Config.RoomSlots[math.clamp(level, 1, #Config.RoomSlots)]
end

-- 置き場所: うしろの かべぞいに半分、左右の かべぞいに残り。前（とびらがわ）は あけておく
local function slotFrames(level: number, w: number, d: number): { CFrame }
	local n = Room.capacity(level)
	local frames = {}
	local back = math.ceil(n / 2)
	local side = n - back
	local left = math.ceil(side / 2)
	local right = side - left
	for i = 1, back do
		local x = if back == 1 then 0 else -(w / 2 - 3) + (i - 1) * ((w - 6) / (back - 1))
		table.insert(frames, CFrame.new(x, FLOOR_Y, d / 2 - 2.5)) -- 前（-Z）が とびらを向く
	end
	local function sideRow(count: number, x: number, yaw: number)
		for i = 1, count do
			local z = if count == 1 then 0 else -(d / 2 - 5) + (i - 1) * ((d - 10) / (count - 1))
			table.insert(frames, CFrame.new(x, FLOOR_Y, z) * CFrame.Angles(0, yaw, 0))
		end
	end
	sideRow(left, -(w / 2 - 2.5), -math.pi / 2) -- 左のかべ: 右（+X）を向く
	sideRow(right, w / 2 - 2.5, math.pi / 2) -- 右のかべ: 左（-X）を向く
	return frames
end

-- 家の中に 家具を ならべる（Reform から呼ぶ。家具を置き換えたときも）
local function placeFurniture(house: Model, level: number, slots: { string })
	local old = house:FindFirstChild("Furniture")
	if old then
		old:Destroy()
	end
	local w = house:GetAttribute("Width") or 14
	local d = house:GetAttribute("Depth") or 12
	local folder = Instance.new("Folder")
	folder.Name = "Furniture"
	local base = house:GetPivot()
	for i, frame in slotFrames(level, w, d) do
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
				Size = Vector3.new(0.1, 3, 3),
				CFrame = base * frame * CFrame.new(0, 0.05, 0) * CFrame.Angles(0, 0, math.pi / 2),
				Color = C(255, 170, 210),
				Transparency = 0.55,
			})
		end
	end
	folder.Parent = house
end

function Room.furnish(house: Model, level: number, _w: number, _d: number, d)
	placeFurniture(house, level, (d.room and d.room.slots) or {})
end

local function houseOf(player: Player): Model?
	local plot = World.plotOf(player)
	local reform = plot and plot.model:FindFirstChild("Reform")
	return reform and reform:FindFirstChild("SecretBase") :: Model?
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
	local house = houseOf(player)
	if house then
		placeFurniture(house, baseLevel(d), slotsOf(d))
	end
	Data.push(player)
end

local function buy(player: Player, id: any)
	local item = type(id) == "string" and Config.FurnitureById[id]
	if not item or not RateLimit.ok(player, "furniture", 0.3) then
		return
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
	Remotes.BuyFurniture.OnServerEvent:Connect(buy)
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

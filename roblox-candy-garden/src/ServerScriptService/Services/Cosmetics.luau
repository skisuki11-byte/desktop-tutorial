-- おしゃれ（アバターアイテム）。ぼうし・せなか・キラキラ(トレイル)を、全てコードで作ってキャラクターに付ける。
-- サーバーで付けるので、ほかのプレイヤーにも見える。買う・着る は全てサーバーで検証する。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Monetization = require(script.Parent.Monetization)
local RateLimit = require(script.Parent.RateLimit)

local Cosmetics = {}

local C = Color3.fromRGB
local WHITE = C(255, 255, 255)
local PINK = C(255, 150, 200)
local GOLD = C(255, 214, 90)

-- ---- 部品づくり。原点に作って、あとで体に付ける ----

local function part(model: Model, props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	p.Massless = true
	p.CastShadow = false
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for k, v in props do
		p[k] = v
	end
	p.Parent = model
	return p
end

-- 楕円体（Block + SpecialMesh Sphere なら、縦横の大きさを別々にできる）
local function ellipsoid(model: Model, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?)
	local p = part(model, { Size = size, CFrame = cf, Color = color, Material = material or Enum.Material.SmoothPlastic })
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = p
	return p
end

local function ball(model: Model, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?)
	return part(model, {
		Shape = Enum.PartType.Ball,
		Size = Vector3.one * diameter,
		CFrame = cf,
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- 軸が縦(Y)の円柱
local function pillar(model: Model, height: number, diameter: number, cf: CFrame, color: Color3, material: Enum.Material?)
	return part(model, {
		Shape = Enum.PartType.Cylinder,
		Size = Vector3.new(height, diameter, diameter),
		CFrame = cf * CFrame.Angles(0, 0, math.pi / 2),
		Color = color,
		Material = material or Enum.Material.SmoothPlastic,
	})
end

-- 頭のてっぺんが原点(y=0)。back は背中の中心が原点（背中側が +Z）
local BUILD: { [string]: (Model) -> () } = {}

BUILD.bunnyears = function(m)
	for _, x in { -0.45, 0.45 } do
		local tilt = CFrame.Angles(0, 0, -x * 0.35)
		ellipsoid(m, Vector3.new(0.6, 2.2, 0.5), CFrame.new(x, 1.2, 0) * tilt, WHITE)
		ellipsoid(m, Vector3.new(0.32, 1.6, 0.3), CFrame.new(x, 1.2, -0.12) * tilt, PINK)
	end
end

BUILD.catears = function(m)
	for _, x in { -0.62, 0.62 } do
		part(m, { Size = Vector3.new(0.75, 0.75, 0.25), CFrame = CFrame.new(x, 0.55, 0) * CFrame.Angles(0, 0, math.rad(45)), Color = C(200, 180, 255) })
		part(m, { Size = Vector3.new(0.4, 0.4, 0.28), CFrame = CFrame.new(x, 0.52, -0.04) * CFrame.Angles(0, 0, math.rad(45)), Color = PINK })
	end
end

BUILD.candyhat = function(m)
	pillar(m, 0.35, 2.4, CFrame.new(0, 0.3, 0), PINK)
	pillar(m, 0.4, 1.6, CFrame.new(0, 0.32, 0), WHITE)
	pillar(m, 0.45, 0.8, CFrame.new(0, 0.34, 0), C(255, 110, 170))
	ball(m, 0.5, CFrame.new(0, 0.75, 0), C(255, 226, 120), Enum.Material.Neon)
end

BUILD.icecream = function(m)
	ball(m, 1.9, CFrame.new(0, 0.75, 0), PINK)
	ball(m, 1.45, CFrame.new(0, 1.55, 0), C(170, 235, 205))
	ball(m, 1.0, CFrame.new(0, 2.2, 0), C(255, 240, 200))
	ball(m, 0.5, CFrame.new(0.15, 2.8, 0), C(230, 60, 90))
end

BUILD.chefhat = function(m)
	pillar(m, 1.0, 1.7, CFrame.new(0, 0.5, 0), WHITE)
	ball(m, 2.3, CFrame.new(0, 1.55, 0), WHITE)
	ball(m, 1.3, CFrame.new(-0.9, 1.2, 0), WHITE)
	ball(m, 1.3, CFrame.new(0.9, 1.2, 0), WHITE)
	pillar(m, 0.18, 1.78, CFrame.new(0, 0.1, 0), PINK)
end

BUILD.starhalo = function(m)
	for i = 1, 8 do
		local a = (i / 8) * math.pi * 2
		ball(m, i % 2 == 0 and 0.55 or 0.4, CFrame.new(math.cos(a) * 1.25, 1.1, math.sin(a) * 1.25), GOLD, Enum.Material.Neon)
	end
end

BUILD.crown = function(m)
	pillar(m, 0.6, 2.0, CFrame.new(0, 0.3, 0), GOLD, Enum.Material.Neon)
	for i = 1, 5 do
		local a = (i / 5) * math.pi * 2
		local x, z = math.cos(a) * 0.85, math.sin(a) * 0.85
		part(m, { Size = Vector3.new(0.4, 0.8, 0.4), CFrame = CFrame.new(x, 0.9, z), Color = GOLD, Material = Enum.Material.Neon })
		ball(m, 0.42, CFrame.new(x, 1.4, z), i % 2 == 0 and C(255, 120, 190) or C(130, 200, 255), Enum.Material.Neon)
	end
end

BUILD.cottoncloud = function(m)
	ball(m, 1.9, CFrame.new(0, 0, 0.5), C(235, 245, 255))
	ball(m, 1.4, CFrame.new(-0.9, -0.3, 0.45), C(215, 235, 255))
	ball(m, 1.4, CFrame.new(0.9, -0.3, 0.45), C(255, 225, 240))
	ball(m, 1.1, CFrame.new(0, 0.7, 0.4), WHITE)
end

BUILD.candycane = function(m)
	local pink, white = C(255, 100, 160), WHITE
	for i = 0, 5 do
		pillar(m, 0.6, 0.5, CFrame.new(0.9, -1.6 + i * 0.6, 0.75) * CFrame.Angles(0, 0, 0), i % 2 == 0 and pink or white)
	end
	ball(m, 0.5, CFrame.new(0.9, 2.15, 0.75), pink)
	pillar(m, 0.6, 0.5, CFrame.new(0.55, 2.3, 0.75) * CFrame.Angles(0, 0, math.rad(90)), white)
	pillar(m, 0.6, 0.5, CFrame.new(0.2, 2.15, 0.75) * CFrame.Angles(0, 0, math.rad(90)), pink)
end

local function wings(m: Model, big: Color3, small: Color3, material: Enum.Material?)
	for _, side in { -1, 1 } do
		ellipsoid(m, Vector3.new(2.6, 2.2, 0.2), CFrame.new(side * 1.6, 0.7, 0.7) * CFrame.Angles(0, side * math.rad(-20), side * math.rad(-25)), big, material)
		ellipsoid(m, Vector3.new(1.8, 1.5, 0.2), CFrame.new(side * 1.3, -0.7, 0.7) * CFrame.Angles(0, side * math.rad(-20), side * math.rad(20)), small, material)
	end
end

BUILD.fairywings = function(m)
	wings(m, C(255, 190, 230), C(190, 230, 255), Enum.Material.Neon)
end

BUILD.goldwings = function(m)
	wings(m, GOLD, C(255, 170, 70), Enum.Material.Neon)
end

BUILD.rainbowcape = function(m)
	local colors = { C(255, 110, 130), C(255, 175, 90), C(255, 230, 100), C(130, 220, 140), C(120, 190, 255), C(190, 150, 255) }
	for i, color in colors do
		part(m, { Size = Vector3.new(1.9 - i * 0.08, 0.45, 0.12), CFrame = CFrame.new(0, 0.9 - i * 0.42, 0.6 + i * 0.05), Color = color, Material = Enum.Material.Neon })
	end
end

-- トレイル（動くと線が残る）。色の並びだけ決める
local TRAILS = {
	sparkletrail = ColorSequence.new({
		ColorSequenceKeypoint.new(0, C(255, 236, 130)),
		ColorSequenceKeypoint.new(1, C(255, 255, 255)),
	}),
	hearttrail = ColorSequence.new({
		ColorSequenceKeypoint.new(0, C(255, 110, 170)),
		ColorSequenceKeypoint.new(1, C(255, 200, 225)),
	}),
	rainbowtrail = ColorSequence.new({
		ColorSequenceKeypoint.new(0, C(255, 100, 120)),
		ColorSequenceKeypoint.new(0.25, C(255, 220, 90)),
		ColorSequenceKeypoint.new(0.5, C(120, 230, 150)),
		ColorSequenceKeypoint.new(0.75, C(110, 180, 255)),
		ColorSequenceKeypoint.new(1, C(200, 140, 255)),
	}),
}

-- ---- 体に付ける ----

local function weldTo(model: Model, root: BasePart, origin: CFrame)
	local first: Part? = nil
	for _, p in model:GetChildren() do
		if p:IsA("BasePart") then
			p.CFrame = origin * p.CFrame
			p.Anchored = false
			local weld = Instance.new("WeldConstraint")
			weld.Part0 = root
			weld.Part1 = p
			weld.Parent = p
			first = first or p
		end
	end
	return first
end

local function attach(character: Model, slot: string, id: string)
	local root = character:FindFirstChild("HumanoidRootPart")

	if slot == "trail" then
		local colors = TRAILS[id]
		if not colors or not root then
			return
		end
		-- Attachment は BasePart の下に置く。名前で探して付け替える
		local a0 = Instance.new("Attachment")
		a0.Name = "CosmeticTrailA0"
		a0.Position = Vector3.new(0, 1.0, 0.4)
		a0.Parent = root
		local a1 = Instance.new("Attachment")
		a1.Name = "CosmeticTrailA1"
		a1.Position = Vector3.new(0, -1.2, 0.4)
		a1.Parent = root
		local trail = Instance.new("Trail")
		trail.Name = "CosmeticTrail"
		trail.Attachment0 = a0
		trail.Attachment1 = a1
		trail.Color = colors
		trail.Lifetime = 0.8
		trail.LightEmission = 0.8
		trail.FaceCamera = true
		trail.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.1), NumberSequenceKeypoint.new(1, 1) })
		trail.WidthScale = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(1, 0.2) })
		trail.Parent = root
		return
	end

	local build = BUILD[id]
	if not build then
		return
	end
	local model = Instance.new("Model")
	model.Name = "Cosmetic_" .. slot
	build(model)

	local body, origin
	if slot == "hat" then
		body = character:FindFirstChild("Head")
		origin = body and body.CFrame * CFrame.new(0, body.Size.Y / 2, 0)
	else
		body = character:FindFirstChild("UpperTorso") or character:FindFirstChild("Torso")
		origin = body and body.CFrame * CFrame.new(0, 0.1, body.Size.Z / 2 + 0.1)
	end
	if not body or not origin then
		model:Destroy()
		return
	end
	weldTo(model, body, origin)
	model.Parent = character
end

local function clearTrail(character: Model)
	for _, name in { "CosmeticTrailA0", "CosmeticTrailA1", "CosmeticTrail" } do
		local inst = character:FindFirstChild(name, true)
		if inst then
			inst:Destroy()
		end
	end
end

-- いま着ている内容をキャラクターに反映する
function Cosmetics.apply(player: Player)
	local character = player.Character
	local d = Data.get(player)
	if not character or not d then
		return
	end
	for _, slot in Config.CosmeticSlots do
		if slot == "trail" then
			clearTrail(character)
		else
			local old = character:FindFirstChild("Cosmetic_" .. slot)
			if old then
				old:Destroy()
			end
		end
		local id = d.cosmetics.equipped[slot]
		if id and Cosmetics.owns(player, id) then
			attach(character, slot, id)
		end
	end
end

function Cosmetics.owns(player: Player, id: string): boolean
	local item = Config.CosmeticById[id]
	local d = Data.get(player)
	if not item or not d then
		return false
	end
	if d.cosmetics.owned[id] then
		return true
	end
	return item.pass ~= nil and Monetization.owns(player, item.pass)
end

local function buy(player: Player, id: any)
	if type(id) ~= "string" then
		return
	end
	local item = Config.CosmeticById[id]
	if not item or not RateLimit.ok(player, "buyCosmetic", 0.3) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	if Cosmetics.owns(player, id) then
		Remotes.Toast:FireClient(player, "toast.alreadyOwned")
		return
	end
	-- パス限定のものは、コインでは買えない
	if item.pass or type(item.price) ~= "number" then
		return
	end
	if d.coins < item.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end
	d.coins -= item.price
	d.cosmetics.owned[id] = true
	d.cosmetics.equipped[item.slot] = id -- 買ったらすぐ着る
	Cosmetics.apply(player)
	Remotes.Toast:FireClient(player, "toast.styleBought")
	Data.push(player)
	Data.saveSoon(player)
end

local function equip(player: Player, slot: any, id: any)
	if type(slot) ~= "string" or not table.find(Config.CosmeticSlots, slot) then
		return
	end
	if id ~= nil and type(id) ~= "string" then
		return
	end
	if not RateLimit.ok(player, "equipCosmetic", 0.2) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	if id == nil then
		d.cosmetics.equipped[slot] = nil
	else
		local item = Config.CosmeticById[id]
		if not item or item.slot ~= slot or not Cosmetics.owns(player, id) then
			return
		end
		d.cosmetics.equipped[slot] = id
	end
	Cosmetics.apply(player)
	Data.push(player)
end

function Cosmetics.init()
	Remotes.BuyCosmetic.OnServerEvent:Connect(buy)
	Remotes.EquipCosmetic.OnServerEvent:Connect(equip)
end

-- キャラクターが出るたびに付け直す
function Cosmetics.track(player: Player)
	player.CharacterAdded:Connect(function(character)
		character:WaitForChild("HumanoidRootPart")
		character:WaitForChild("Head")
		task.wait(0.2) -- 体のパーツが揃うのを待つ
		if player.Parent == Players then
			Cosmetics.apply(player)
		end
	end)
end

return Cosmetics

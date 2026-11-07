-- おしゃれ（アバターアイテム）。ぼうし・かお・せなか・て・いしょう・キラキラ(トレイル)を、全てコードで作ってキャラクターに付ける。
-- 形は Shared.CosmeticVisuals（おしゃれ画面の3Dと同じ形）。
-- サーバーで付けるので、ほかのプレイヤーにも見える。買う・着る は全てサーバーで検証する。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Monetization = require(script.Parent.Monetization)
local RateLimit = require(script.Parent.RateLimit)

local CosmeticVisuals = require(ReplicatedStorage.Shared.CosmeticVisuals)
local Cosmetics = {}

local C = Color3.fromRGB

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
	candytrail = ColorSequence.new({
		ColorSequenceKeypoint.new(0, C(255, 120, 180)),
		ColorSequenceKeypoint.new(0.33, C(255, 255, 255)),
		ColorSequenceKeypoint.new(0.66, C(255, 120, 180)),
		ColorSequenceKeypoint.new(1, C(255, 255, 255)),
	}),
	startrail = ColorSequence.new({
		ColorSequenceKeypoint.new(0, C(255, 255, 255)),
		ColorSequenceKeypoint.new(0.5, C(255, 226, 120)),
		ColorSequenceKeypoint.new(1, C(150, 200, 255)),
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

	-- いしょう（きぐるみ・ドレス）: 体の部分ごとに、その人の体の大きさに合わせて付ける
	if slot == "outfit" then
		local model, bones = CosmeticVisuals.buildOutfitFor(id, character)
		if not model then
			return
		end
		model.Name = "Cosmetic_outfit"
		for p, boneName in bones do
			local bone = character:FindFirstChild(boneName)
			if bone and bone:IsA("BasePart") then
				p.Anchored = false
				local weld = Instance.new("WeldConstraint")
				weld.Part0 = bone
				weld.Part1 = p
				weld.Parent = p
			else
				p:Destroy()
			end
		end
		model.Parent = character
		return
	end

	local model = CosmeticVisuals.build(id)
	if not model then
		return
	end
	model.Name = "Cosmetic_" .. slot

	local body, origin
	if slot == "hat" then
		body = character:FindFirstChild("Head")
		origin = body and body.CFrame * CFrame.new(0, body.Size.Y / 2, 0)
	elseif slot == "face" then
		-- 顔の前（-Z）の まん中。少し上が目の高さ
		body = character:FindFirstChild("Head")
		origin = body and body.CFrame * CFrame.new(0, 0, -body.Size.Z / 2)
	elseif slot == "hand" then
		-- 左手（右手は じょうろ などの道具を もつ）
		body = character:FindFirstChild("LeftHand") or character:FindFirstChild("Left Arm")
		origin = body and body.CFrame * CFrame.new(0, -body.Size.Y / 2, 0)
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
	-- パス限定・コード限定・シーズンパスのごほうびは、コインでは買えない
	if item.pass or item.codeOnly or item.seasonOnly or item.shopOnly or item.starOnly or item.friendOnly or type(item.price) ~= "number" then
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

-- ログインコード・シーズンパスなど、お金を使わずに渡すとき。もらったらすぐ着る（新しい物を見せる）
function Cosmetics.grant(player: Player, id: string)
	local item = Config.CosmeticById[id]
	local d = Data.get(player)
	if not item or not d or d.cosmetics.owned[id] then
		return
	end
	d.cosmetics.owned[id] = true
	d.cosmetics.equipped[item.slot] = id
	Cosmetics.apply(player)
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

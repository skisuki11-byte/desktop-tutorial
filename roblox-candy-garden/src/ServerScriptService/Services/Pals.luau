-- ペット（Pals）。たまごの抽選・所持・連れ歩きの管理。抽選はサーバーだけで行う。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local RateLimit = require(script.Parent.RateLimit)

local Pals = {}

local rng = Random.new()

-- 他のプレイヤーの画面にもペットを出すため、連れているペットの種類を属性で共有する
function Pals.refreshAttribute(player: Player)
	local d = Data.get(player)
	if not d then
		return
	end
	local ids = {}
	for _, uid in d.equipped do
		for _, entry in d.pets do
			if entry.uid == uid and Config.PetById[entry.pet] then
				table.insert(ids, entry.pet)
			end
		end
	end
	player:SetAttribute("EquippedPals", table.concat(ids, ","))
end

local function roll(egg): string
	local total = 0
	for _, entry in egg.odds do
		total += entry.weight
	end
	local pick = rng:NextNumber() * total
	for _, entry in egg.odds do
		pick -= entry.weight
		if pick < 0 then
			return entry.pet
		end
	end
	return egg.odds[#egg.odds].pet
end

local function isEquipped(d, uid: number): number?
	for i, value in d.equipped do
		if value == uid then
			return i
		end
	end
	return nil
end

local function buyEgg(player: Player, eggId: any)
	if type(eggId) ~= "string" or not Config.EggById[eggId] then
		return
	end
	if not RateLimit.ok(player, "buyEgg", 0.5) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local egg = Config.EggById[eggId]
	if #d.pets >= Config.MaxPets then
		Remotes.Toast:FireClient(player, "toast.petFull")
		return
	end
	if d.coins < egg.price then
		Remotes.Toast:FireClient(player, "toast.noCoins")
		return
	end

	d.coins -= egg.price
	local petId = roll(egg)
	local uid = d.nextPetUid
	d.nextPetUid += 1
	table.insert(d.pets, { uid = uid, pet = petId })
	-- 連れていける枠が空いていれば、そのまま連れていく
	if #d.equipped < Config.MaxEquipped then
		table.insert(d.equipped, uid)
	end

	Pals.refreshAttribute(player)
	Data.push(player)
	Remotes.EggResult:FireClient(player, petId)
	Data.saveSoon(player) -- 抽選結果は、すぐ(数秒以内に)保存する
end

local function equipPet(player: Player, uid: any)
	if type(uid) ~= "number" or uid ~= uid then
		return
	end
	if not RateLimit.ok(player, "equip", 0.2) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local owned = false
	for _, entry in d.pets do
		if entry.uid == uid then
			owned = true
			break
		end
	end
	if not owned then
		return
	end

	local index = isEquipped(d, uid)
	if index then
		table.remove(d.equipped, index)
	else
		if #d.equipped >= Config.MaxEquipped then
			table.remove(d.equipped, 1) -- いちばん前に連れた子と入れ替える
		end
		table.insert(d.equipped, uid)
	end
	Pals.refreshAttribute(player)
	Data.push(player)
end

function Pals.init()
	Remotes.BuyEgg.OnServerEvent:Connect(buyEgg)
	Remotes.EquipPet.OnServerEvent:Connect(equipPet)
end

return Pals

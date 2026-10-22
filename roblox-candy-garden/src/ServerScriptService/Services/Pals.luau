-- ペット（Pals）。たまごの抽選・所持・連れ歩きの管理。抽選はサーバーだけで行う。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Players = game:GetService("Players")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local World = require(script.Parent.World)
local RateLimit = require(script.Parent.RateLimit)
local Quests = require(script.Parent.Quests)

local Pals = {}

local rng = Random.new()

-- ペット図鑑: 見つけたペットを記録し、集めた種類の数でごほうび（1回ずつ）
local function checkDexRewards(player: Player, d)
	local count = 0
	for _ in d.dex do
		count += 1
	end
	local rewards = Config.Dex.rewards
	while rewards[d.dexClaimed + 1] and count >= rewards[d.dexClaimed + 1].count do
		d.dexClaimed += 1
		local reward = rewards[d.dexClaimed]
		d.coins += reward.coins or 0
		d.fertilizer = math.min(Config.Fertilizer.max, (d.fertilizer or 0) + (reward.fertilizer or 0))
		Remotes.Toast:FireClient(player, "toast.dexReward", reward.coins or 0)
	end
end

function Pals.markDex(player: Player, petId: string, announce: boolean?)
	local d = Data.get(player)
	if not d or not Config.PetById[petId] or d.dex[petId] then
		return
	end
	d.dex[petId] = true
	if announce then
		Remotes.Toast:FireClient(player, "toast.dexNew", "@pet." .. petId)
	end
	checkDexRewards(player, d)
	Data.saveSoon(player)
end

-- 他のプレイヤーの画面にもペットを出すため、連れているペットの種類を属性で共有する
function Pals.refreshAttribute(player: Player)
	local d = Data.get(player)
	if not d then
		return
	end
	-- 図鑑ができる前から持っているペットも、図鑑にのせる
	for _, entry in d.pets do
		if Config.PetById[entry.pet] and not d.dex[entry.pet] then
			d.dex[entry.pet] = true
		end
	end
	checkDexRewards(player, d)
	local ids = {}
	for _, uid in d.equipped do
		for _, entry in d.pets do
			if entry.uid == uid and Config.PetById[entry.pet] then
				-- がったいした子は「id@ランク」（きらきら・にじいろの 見た目を ほかの人の 画面にも 出す）
				table.insert(ids, if entry.tier then entry.pet .. "@" .. entry.tier else entry.pet)
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
	-- たまごは、たまごの森でだけ買える
	if not World.isNear(player, "EggForest") then
		Remotes.Toast:FireClient(player, "toast.goEggForest")
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

	Pals.markDex(player, petId, false) -- 孵化の演出で見せるので、お知らせは出さない
	-- 先に たまごの演出を始めてもらい、そのあとで 画面の数字などを送る（演出が待たされないように）
	Remotes.EggResult:FireClient(player, petId, eggId)
	Pals.refreshAttribute(player)
	Data.push(player)
	Quests.progress(player, "egg", 1)
	Data.saveSoon(player) -- 抽選結果は、すぐ(数秒以内に)保存する
end

-- たまご以外でペットを渡す（ほしぞらのおくりもの など）。ペットの数が上限でも渡す
function Pals.grant(player: Player, petId: string)
	local d = Data.get(player)
	if not d or not Config.PetById[petId] then
		return
	end
	local uid = d.nextPetUid
	d.nextPetUid += 1
	table.insert(d.pets, { uid = uid, pet = petId })
	if #d.equipped < Config.MaxEquipped then
		table.insert(d.equipped, uid)
	end
	Pals.markDex(player, petId, false)
	Pals.refreshAttribute(player)
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

-- がったい: 同じペット・同じランクの 子を Config.Fusion.count 匹 あわせて、1つ上の ランクの 1匹に する。
-- かならず 成功。ごくまれに 超超レアが おまけで もう1匹 来る（確率は Config.Fusion.secretChance）
local function fusePet(player: Player, petId: any, tier: any)
	if type(petId) ~= "string" or not Config.PetById[petId] then
		return
	end
	tier = if tier == nil then 0 else tier
	if type(tier) ~= "number" or tier ~= math.floor(tier) or tier < 0 or tier >= #Config.Fusion.tiers then
		return
	end
	if not RateLimit.ok(player, "fusePet", 0.5) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	-- あわせる 子を えらぶ。連れていない 子から 先に つかう
	local picked = {}
	for _, wantEquipped in { false, true } do
		for _, entry in d.pets do
			if #picked < Config.Fusion.count and entry.pet == petId and (entry.tier or 0) == tier
				and (isEquipped(d, entry.uid) ~= nil) == wantEquipped then
				table.insert(picked, entry.uid)
			end
		end
	end
	if #picked < Config.Fusion.count then
		return
	end

	local newTier = tier + 1
	local uid = d.nextPetUid
	d.nextPetUid += 1
	-- 連れていた子を つかったときは、その 場所に できあがった 子を 連れる
	local slot = nil
	for _, old in picked do
		local index = isEquipped(d, old)
		if index then
			if slot == nil then
				slot = index
				d.equipped[index] = uid
			else
				table.remove(d.equipped, index)
			end
		end
		for i, entry in d.pets do
			if entry.uid == old then
				table.remove(d.pets, i)
				break
			end
		end
	end
	table.insert(d.pets, { uid = uid, pet = petId, tier = newTier })

	-- おまけの 超超レア
	local secretId = nil
	-- Studioでの確認用（本番では動かない）: workspace の属性 DebugSecretChance（0〜1）で おまけの 確率を かえる
	local chance = Config.Fusion.secretChance[newTier] or 0
	if RunService:IsStudio() and type(workspace:GetAttribute("DebugSecretChance")) == "number" then
		chance = workspace:GetAttribute("DebugSecretChance")
	end
	if rng:NextNumber() < chance then
		local list = Config.Fusion.secretPets
		secretId = list[rng:NextInteger(1, #list)]
		local secretUid = d.nextPetUid
		d.nextPetUid += 1
		table.insert(d.pets, { uid = secretUid, pet = secretId })
		if #d.equipped < Config.MaxEquipped then
			table.insert(d.equipped, secretUid)
		end
		Pals.markDex(player, secretId, false)
	end

	Remotes.FuseResult:FireClient(player, petId, newTier, secretId)
	Pals.refreshAttribute(player)
	Data.push(player)
	Data.saveSoon(player)
end

function Pals.init()
	Remotes.BuyEgg.OnServerEvent:Connect(buyEgg)
	Remotes.EquipPet.OnServerEvent:Connect(equipPet)
	Remotes.FusePet.OnServerEvent:Connect(fusePet)
	-- Studioでの確認用（本番では動かない）: workspace の属性 DebugPets に "gummybear=3,gummybear@1=3" のように入れると、そのペットを もらえる
	if RunService:IsStudio() then
		workspace:GetAttributeChangedSignal("DebugPets"):Connect(function()
			local text = workspace:GetAttribute("DebugPets")
			if type(text) ~= "string" then
				return
			end
			for _, player in Players:GetPlayers() do
				local d = Data.get(player)
				if d then
					for id, tier, n in string.gmatch(text, "(%w+)@?(%d*)=(%d+)") do
						if Config.PetById[id] then
							for _ = 1, tonumber(n) or 0 do
								local uid = d.nextPetUid
								d.nextPetUid += 1
								table.insert(d.pets, { uid = uid, pet = id, tier = tonumber(tier) })
							end
						end
					end
					Pals.refreshAttribute(player)
					Data.push(player)
				end
			end
		end)
	end
end

return Pals

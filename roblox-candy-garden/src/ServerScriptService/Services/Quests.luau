-- きょうのおねがい（デイリークエスト）。毎日 UTC 0時（日本時間 朝9時）に3つ入れ替わる。
-- 「あしたも新しいおねがいが来る」ことが、翌日また来る理由になる。
-- 達成したら「もらう！」で、コインとキャンディパスのXPがもらえる（受け取る瞬間を楽しみにしてもらう）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Season = require(script.Parent.Season)
local RateLimit = require(script.Parent.RateLimit)
local Funnel = require(script.Parent.Funnel)

local Quests = {}

local DAY = 86400

local function today(): number
	return math.floor(os.time() / DAY)
end

-- 今日のおねがいの状態（日が変わっていたらリセット）
local function current(d)
	local day = today()
	if d.quests.day ~= day then
		d.quests = { day = day, progress = {}, claimed = {} }
	end
	return d.quests
end

-- 何かをしたときに呼ぶ。kind が合うおねがいの進み具合を足す
-- amount: 足す量 / cropId: harvestCrop のときの作物
function Quests.progress(player: Player, kind: string, amount: number, cropId: string?)
	-- はじめての人が どこまで遊んだかの記録も ここで（植えた・しゅうかくした・たまごを かえした）
	local funnelStep = ({ plant = "Planted", harvest = "Harvested", egg = "HatchedEgg" })[kind]
	if funnelStep then
		Funnel.step(player, funnelStep)
	end
	local d = Data.get(player)
	if not d or amount <= 0 then
		return
	end
	local state = current(d)
	local completedNow = false
	for slot, poolIndex in Config.questSelection(state.day) do
		local quest = Config.Quests.pool[poolIndex]
		if quest.kind == kind and (quest.crop == nil or quest.crop == cropId) then
			local key = tostring(slot)
			local before = state.progress[key] or 0
			if before < quest.goal then
				local after = math.min(quest.goal, before + amount)
				state.progress[key] = after
				if after >= quest.goal then
					completedNow = true
				end
			end
		end
	end
	if completedNow then
		Remotes.Toast:FireClient(player, "toast.questDone")
		Data.push(player)
	end
end

local function claim(player: Player, slot: any)
	if type(slot) ~= "number" or slot ~= math.floor(slot) or slot < 1 or slot > Config.Quests.count then
		return
	end
	if not RateLimit.ok(player, "claimQuest", 0.4) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local state = current(d)
	local key = tostring(slot)
	local quest = Config.Quests.pool[Config.questSelection(state.day)[slot]]
	if not quest or state.claimed[key] or (state.progress[key] or 0) < quest.goal then
		return
	end
	state.claimed[key] = true
	d.coins += quest.reward.coins or 0
	Data.push(player)
	Data.saveSoon(player)
	if quest.reward.xp then
		Season.addXp(player, quest.reward.xp)
	end
end

function Quests.init()
	Remotes.ClaimQuest.OnServerEvent:Connect(claim)
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		local state = current(d)
		return {
			quests = {
				day = state.day,
				items = Config.questSelection(state.day),
				progress = state.progress,
				claimed = state.claimed,
				endsAt = (state.day + 1) * DAY,
			},
		}
	end)
end

return Quests

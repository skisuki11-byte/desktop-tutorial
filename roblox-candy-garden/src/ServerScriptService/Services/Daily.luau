-- デイリーボーナス。1日1回、ログインしてもらう。連続日数が増えるとごほうびが豪華になる（7日で一巡）。
-- 方針（Duolingo型の連続記録の教訓）: 途切れたら全部消すのではなく、やさしく戻す。
--   休んだ日があった → 連続日数が半分になって再開（0には戻さない）
-- 日付は os.time()（UTC）を86400秒で割った日数。サーバーが決めるので、端末の時計は関係ない。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local RateLimit = require(script.Parent.RateLimit)
local Season = require(script.Parent.Season)

local Daily = {}

local function today(): number
	return math.floor(os.time() / Config.DailySecondsPerDay)
end

-- いま受け取ったら、連続何日目で、どのごほうびか
local function preview(d)
	local daily = d.daily
	local day = today()
	local count = #Config.Daily
	if daily.lastDay == day then
		return { canClaim = false, streak = daily.streak, index = ((daily.streak - 1) % count) + 1, restarted = false }
	end
	local streak
	local restarted = false
	if daily.lastDay == day - 1 then
		streak = daily.streak + 1
	elseif daily.lastDay == 0 then
		streak = 1
	else
		streak = math.floor(daily.streak / 2) + 1 -- 休んだ日があっても、半分は残る
		restarted = true
	end
	return { canClaim = true, streak = streak, index = ((streak - 1) % count) + 1, restarted = restarted }
end

local function claim(player: Player)
	if not RateLimit.ok(player, "daily", 1) then
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end
	local info = preview(d)
	if not info.canClaim then
		return
	end

	local reward = Config.Daily[info.index]
	d.coins += reward.coins
	if reward.seeds then
		for cropId, n in reward.seeds do
			if Config.CropById[cropId] then
				d.seeds[cropId] = (d.seeds[cropId] or 0) + n
			end
		end
	end
	d.daily.lastDay = today()
	d.daily.streak = info.streak

	Remotes.Toast:FireClient(player, "toast.dailyGot")
	Data.push(player)
	Data.saveSoon(player)
	Season.addXp(player, Config.Season.xp.daily)
end

function Daily.init()
	Remotes.ClaimDaily.OnServerEvent:Connect(claim)
	Data.addStateExtender(function(player)
		local d = Data.get(player)
		if not d then
			return {}
		end
		local info = preview(d)
		return {
			daily = {
				canClaim = info.canClaim,
				streak = info.streak, -- 受け取れるときは「受け取ったあとの連続日数」
				index = info.index, -- 今日（または直近）のごほうびの番号（1〜7）
				restarted = info.restarted,
			},
		}
	end)
end

return Daily

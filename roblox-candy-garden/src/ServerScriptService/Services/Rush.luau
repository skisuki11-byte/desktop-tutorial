-- キャンディラッシュ: 決まった時刻に 全サーバーで いっしょに はじまる おまつり。
-- 「◯時に また来よう」と 思える 約束の時間を作る（Grow a Garden の「みんなが同じ時間に集まる」入荷・イベントと同じ考え）。
-- 時刻は Config.rush() で 計算するので、どのサーバーでも同じ。ラッシュの間は:
--   ・売るとき コインが Config.Rush.sellBonus ぶん ふえる
--   ・きらきら が 出やすい（Weather.sparkleChance で 足す）
--   ・めずらしい種（スターケーキ・ムーンキャンディ）が かならず 入荷する（Config.seedStock）
-- はじまる 5分前と、はじまった ときに 全員に お知らせ
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Funnel = require(script.Parent.Funnel)

local Rush = {}

local function now(): number
	return workspace:GetServerTimeNow()
end

function Rush.active(): boolean
	return (Config.rush(now())) ~= nil
end

function Rush.start()
	task.spawn(function()
		local lastWarned, lastStarted = nil, nil
		while true do
			local t = now()
			local endsAt, nextAt = Config.rush(t)
			if endsAt then
				local startedAt = endsAt - Config.Rush.durationSeconds
				if lastStarted ~= startedAt then
					lastStarted = startedAt
					-- サーバーが 立ち上がった ばかりで 途中から のときも、いる人には 知らせる
					for _, player in Players:GetPlayers() do
						if Data.get(player) then
							Remotes.Toast:FireClient(player, "rush.start", math.floor(Config.Rush.sellBonus * 100 + 0.5))
							Funnel.event(player, "RushJoined")
						end
					end
				end
			elseif nextAt - t <= Config.Rush.warnSeconds and lastWarned ~= nextAt then
				lastWarned = nextAt
				for _, player in Players:GetPlayers() do
					if Data.get(player) then
						Remotes.Toast:FireClient(player, "rush.soon")
					end
				end
			end
			task.wait(1)
		end
	end)
end

return Rush

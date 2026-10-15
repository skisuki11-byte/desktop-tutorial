-- お天気イベント。約5分ごとに90秒、きらきらが出やすくなる。
-- 状態は workspace の属性（Weather / WeatherEndsAt / NextWeatherAt）で全員に共有する。
-- 時刻は GetServerTimeNow() で統一する。
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)

local Weather = {}

local rng = Random.new()
local WHITE = Color3.new(1, 1, 1)

local function now(): number
	return workspace:GetServerTimeNow()
end

-- いまの収穫できらきらが出る確率
function Weather.sparkleChance(): number
	local id = workspace:GetAttribute("Weather")
	local weather = id and Config.WeatherById[id]
	local chance = if weather then weather.sparkleChance else Config.SparkleChance
	-- ほしぞらまつりの間は、さらに出やすい
	if (workspace:GetAttribute("StarFestivalEndsAt") or 0) > now() then
		chance = math.min(0.9, chance + Config.StarGift.sparkleBonus)
	end
	return chance
end

local function setTint(color: Color3)
	local tint = Lighting:FindFirstChild("Tint")
	if tint then
		TweenService:Create(tint, TweenInfo.new(2.5), { TintColor = color }):Play()
	end
end

local function pick(last: string?)
	local candidates = {}
	for _, w in Config.Weather.Types do
		if w.id ~= last then
			table.insert(candidates, w)
		end
	end
	return candidates[rng:NextInteger(1, #candidates)]
end

function Weather.start()
	workspace:SetAttribute("NextWeatherAt", now() + Config.Weather.FirstDelay)
	task.spawn(function()
		local last: string? = nil
		while true do
			-- 属性を毎秒読むので、サーバー側から次の開始時刻を変えて確認もできる
			while now() < (workspace:GetAttribute("NextWeatherAt") or 0) do
				task.wait(1)
			end
			local startedAt = now()
			local weather = pick(last)
			last = weather.id

			workspace:SetAttribute("WeatherEndsAt", startedAt + Config.Weather.Duration)
			workspace:SetAttribute("Weather", weather.id)
			setTint(weather.tint)

			while now() < startedAt + Config.Weather.Duration do
				task.wait(1)
			end

			workspace:SetAttribute("Weather", nil)
			workspace:SetAttribute("WeatherEndsAt", nil)
			setTint(WHITE)
			workspace:SetAttribute("NextWeatherAt", startedAt + Config.Weather.Interval)
		end
	end)
end

return Weather

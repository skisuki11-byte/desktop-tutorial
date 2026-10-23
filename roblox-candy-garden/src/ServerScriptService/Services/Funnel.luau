-- 「はじめての人が どこまで遊んだか」の記録（クリエイターハブ → 解析 → ファネル で見られる）。
-- 広告や紹介で人を連れてきたとき、どこで やめてしまうかが分かれば、そこを直せる。
-- 1人1回ずつ（d.funnel に 記録ずみの段を入れて、2回は送らない）
local AnalyticsService = game:GetService("AnalyticsService")
local RunService = game:GetService("RunService")

local Data = require(script.Parent.Data)

local Funnel = {}

-- 段の番号と名前（順番は 遊ぶ順。あとから 変えない＝前の記録と くらべられなくなる）
Funnel.Steps = {
	Joined = 1,
	Planted = 2,
	Harvested = 3,
	Sold = 4,
	BoughtSeed = 5,
	HatchedEgg = 6,
	BuiltBase = 7,
}

function Funnel.step(player: Player, name: string)
	local step = Funnel.Steps[name]
	local d = Data.get(player)
	if not step or not d then
		return
	end
	d.funnel = d.funnel or {}
	if d.funnel[name] then
		return
	end
	d.funnel[name] = true
	if RunService:IsStudio() then
		return -- Studio の テストは 記録しない（数字が まざらないように）
	end
	pcall(function()
		AnalyticsService:LogOnboardingFunnelStepEvent(player, step, name)
	end)
end

-- 1回きりではない できごと（キャンディラッシュに 来ていた など）
function Funnel.event(player: Player, name: string)
	if RunService:IsStudio() then
		return
	end
	pcall(function()
		AnalyticsService:LogCustomEvent(player, name)
	end)
end

return Funnel

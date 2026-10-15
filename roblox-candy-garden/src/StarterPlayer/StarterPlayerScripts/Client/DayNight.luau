-- 朝・昼・夕方・夜の空。遊んでいる人の「本当の時刻」に合わせる（あつまれ どうぶつの森と同じ考え方）。
-- 朝に来れば朝焼け、夜に来れば月夜。「また違う時間にも来てみたい」理由になる。
-- 夜も暗くしすぎない（子供が畑や作物を見分けられる明るさを保つ）。
-- 空は各自の画面だけで変える（サーバーの設定は変えない。住んでいる国が違っても、その人の時刻になる）。
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local DayNight = {}

local function C(r: number, g: number, b: number): Color3
	return Color3.fromRGB(r, g, b)
end

-- 時刻ごとの見た目。あいだの時刻は、前後をなめらかにまぜる
local NIGHT = {
	brightness = 1.1,
	ambient = C(96, 88, 145),
	outdoor = C(112, 104, 175),
	atmosphere = C(140, 128, 196),
	decay = C(82, 72, 145),
	tint = 0.05,
}
local SUNRISE = {
	brightness = 1.9,
	ambient = C(140, 112, 128),
	outdoor = C(178, 145, 165),
	atmosphere = C(255, 204, 196),
	decay = C(232, 165, 196),
	tint = 0.02,
}
local DAY = {
	brightness = 2.4,
	ambient = C(120, 105, 130),
	outdoor = C(150, 140, 165),
	atmosphere = C(255, 222, 236),
	decay = C(200, 178, 236),
	tint = 0.01,
}
local SUNSET = {
	brightness = 1.8,
	ambient = C(150, 106, 118),
	outdoor = C(186, 136, 152),
	atmosphere = C(255, 184, 172),
	decay = C(222, 142, 182),
	tint = 0.02,
}
local KEYS = {
	{ hour = 0, look = NIGHT },
	{ hour = 5, look = NIGHT },
	{ hour = 6.5, look = SUNRISE },
	{ hour = 9, look = DAY },
	{ hour = 16, look = DAY },
	{ hour = 17.8, look = SUNSET },
	{ hour = 19.5, look = NIGHT },
	{ hour = 24, look = NIGHT },
}

local function mix(a, b, alpha: number)
	return {
		brightness = a.brightness + (b.brightness - a.brightness) * alpha,
		ambient = a.ambient:Lerp(b.ambient, alpha),
		outdoor = a.outdoor:Lerp(b.outdoor, alpha),
		atmosphere = a.atmosphere:Lerp(b.atmosphere, alpha),
		decay = a.decay:Lerp(b.decay, alpha),
		tint = a.tint + (b.tint - a.tint) * alpha,
	}
end

local function lookAt(hour: number)
	for i = 1, #KEYS - 1 do
		local a, b = KEYS[i], KEYS[i + 1]
		if hour >= a.hour and hour <= b.hour then
			local span = b.hour - a.hour
			return mix(a.look, b.look, if span > 0 then (hour - a.hour) / span else 0)
		end
	end
	return DAY
end

-- 今の時刻（時）。Studioで試すときは、プレイヤーの属性 ForceHour（0〜24）で決められる
local function currentHour(): number
	local forced = Players.LocalPlayer:GetAttribute("ForceHour")
	if type(forced) == "number" then
		return forced % 24
	end
	local now = os.date("*t")
	return now.hour + now.min / 60 + now.sec / 3600
end

local function apply(seconds: number)
	local hour = currentHour()
	local look = lookAt(hour)
	local info = TweenInfo.new(seconds, Enum.EasingStyle.Sine)
	Lighting.ClockTime = hour -- 太陽と月の位置は、本当の時刻どおり
	TweenService:Create(Lighting, info, {
		Brightness = look.brightness,
		Ambient = look.ambient,
		OutdoorAmbient = look.outdoor,
	}):Play()
	local atmosphere = Lighting:FindFirstChildOfClass("Atmosphere")
	if atmosphere then
		TweenService:Create(atmosphere, info, { Color = look.atmosphere, Decay = look.decay }):Play()
	end
	local tint = Lighting:FindFirstChild("Tint")
	if tint and tint:IsA("ColorCorrectionEffect") then
		TweenService:Create(tint, info, { Brightness = look.tint }):Play()
	end
end

function DayNight.init()
	-- サーバーが最初の空を作り終えるのを少し待ってから、自分の時刻の空にする
	task.delay(1, function()
		apply(1.5)
		while true do
			task.wait(20)
			apply(18) -- 20秒ごとに、気づかないくらいゆっくり変える
		end
	end)
	Players.LocalPlayer:GetAttributeChangedSignal("ForceHour"):Connect(function()
		apply(1)
	end)
end

return DayNight

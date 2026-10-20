-- お天気の表示。サーバーが workspace の属性に入れた状態を読んで、
-- 開始のお知らせと 降る粒子を出す（左上の カードは 出さない。画面を すっきりさせる）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)

local WeatherClient = {}

local t = I18n.t

local anchor: Part?
local emitter: ParticleEmitter?
local currentId: string? = nil
local ui

local function buildFx()
	anchor = Instance.new("Part")
	anchor.Name = "WeatherAnchor"
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanTouch = false
	anchor.CanQuery = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(110, 1, 110)
	anchor.Parent = workspace

	emitter = Instance.new("ParticleEmitter")
	emitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	emitter.Shape = Enum.ParticleEmitterShape.Box
	emitter.EmissionDirection = Enum.NormalId.Bottom
	emitter.Rate = 55
	emitter.Lifetime = NumberRange.new(2.8, 3.6)
	emitter.Speed = NumberRange.new(14, 22)
	emitter.Acceleration = Vector3.new(0, -10, 0)
	emitter.Size = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.9),
		NumberSequenceKeypoint.new(1, 0.4),
	})
	emitter.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.1),
		NumberSequenceKeypoint.new(0.8, 0.2),
		NumberSequenceKeypoint.new(1, 1),
	})
	emitter.LightEmission = 0.6
	emitter.RotSpeed = NumberRange.new(-90, 90)
	emitter.Rotation = NumberRange.new(0, 360)
	emitter.Enabled = false
	emitter.Parent = anchor
end

local function onWeatherChanged(id: string?)
	if id == currentId then
		return
	end
	currentId = id
	local weather = id and Config.WeatherById[id]
	if weather then
		emitter.Color = ColorSequence.new(weather.particle, weather.particle:Lerp(Color3.new(1, 1, 1), 0.6))
		emitter.Enabled = true
		-- この 天気の あいだに 実ると なりやすい ふしぎな作物（にじいろ・きんいろ・ジャンボ）と、その 売値の 倍率も 出す。
		-- 「きらきら」だけでは 何が うれしいのか 伝わらないので、売値が 何倍に なるかを 書く
		local special, multiplier = "", 1
		for _, variant in Config.Variants do
			if variant.weather and variant.weather[weather.id] then
				special = variant.icon .. t("variant." .. variant.id)
				multiplier = variant.multiplier
				break
			end
		end
		ui.toastText(weather.icon .. " " .. t("weather.announce", t("weather." .. weather.id), special, multiplier))
	else
		emitter.Enabled = false
	end
end

function WeatherClient.init(uiModule)
	ui = uiModule
	buildFx()

	task.spawn(function()
		while true do
			onWeatherChanged(workspace:GetAttribute("Weather"))
			task.wait(0.5)
		end
	end)

	-- 粒子の発生源はカメラの上に置く（どこにいても降って見える）
	RunService.RenderStepped:Connect(function()
		local camera = workspace.CurrentCamera
		if camera and anchor then
			anchor.CFrame = CFrame.new(camera.CFrame.Position + Vector3.new(0, 38, 0))
		end
	end)
end

return WeatherClient

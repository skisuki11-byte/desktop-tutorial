-- お天気の表示。サーバーが workspace の属性に入れた状態を読んで、
-- 開始のお知らせ・残り時間のチップ・降る粒子を出す。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)

local WeatherClient = {}

local C = Style.Color
local t = I18n.t

local chip, chipLabel
local anchor: Part?
local emitter: ParticleEmitter?
local currentId: string? = nil
local ui

local function formatClock(seconds: number): string
	seconds = math.max(0, math.ceil(seconds))
	return ("%d:%02d"):format(seconds // 60, seconds % 60)
end

local function buildChip(gui: ScreenGui)
	chip = Style.make("Frame", {
		Name = "WeatherChip",
		Position = UDim2.fromOffset(16, 80),
		Size = UDim2.fromOffset(0, 40),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = C.Surface,
	}, gui)
	Style.round(chip, 20)
	Style.stroke(chip, C.Dim, 3)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 16), PaddingRight = UDim.new(0, 16) }, chip)
	chipLabel = Style.label({
		Size = UDim2.fromOffset(0, 40),
		AutomaticSize = Enum.AutomaticSize.X,
		TextSize = 18,
		TextWrapped = false,
		Text = "",
	}, chip)
end

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
		ui.toastText(weather.icon .. " " .. t("weather.announce", t("weather." .. weather.id)), 4)
	else
		emitter.Enabled = false
	end
end

local function refreshChip()
	local id = workspace:GetAttribute("Weather")
	local weather = id and Config.WeatherById[id]
	local serverNow = workspace:GetServerTimeNow()
	-- お天気の表示は、お天気の間だけ出す（ふだんの画面をすっきりさせる）
	chip.Visible = weather ~= nil
	if weather then
		local left = (workspace:GetAttribute("WeatherEndsAt") or serverNow) - serverNow
		chipLabel.Text = weather.icon
			.. " "
			.. t("weather." .. weather.id)
			.. "  "
			.. t("ui.weatherNow", math.floor(weather.sparkleChance * 100 + 0.5), math.max(0, math.ceil(left)))
		chip.BackgroundColor3 = Color3.fromRGB(255, 233, 244)
		chipLabel.TextColor3 = C.Text
	else
		local untilNext = (workspace:GetAttribute("NextWeatherAt") or serverNow) - serverNow
		chipLabel.Text = "☀️ " .. t("ui.weatherNext", formatClock(untilNext))
		chip.BackgroundColor3 = C.Surface
		chipLabel.TextColor3 = C.TextMuted
	end
end

function WeatherClient.init(uiModule)
	ui = uiModule
	buildChip(ui.gui())
	buildFx()

	task.spawn(function()
		while true do
			onWeatherChanged(workspace:GetAttribute("Weather"))
			refreshChip()
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

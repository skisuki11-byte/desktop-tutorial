-- ほしぞらのおくりもの（みんなの木 レベル20）のお祝い画面と、ほしぞらまつりの表示。
--   ・お祝い画面: 画面いっぱいの夜空に、降る星と「ほしぞらの木が さいた！」、もらった物の一覧、ファンファーレ
--   ・ほしぞらまつり: まつりの間は、全サーバーで星が降り、左上に残り時間を出す（Config.StarGift.festivalSeconds）
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)
local Sounds = require(script.Parent.Sounds)

local StarGiftUI = {}

local C = Style.Color
local t = I18n.t

local ui
local festivalChip, festivalLabel
local starAnchor: Part
local starEmitter: ParticleEmitter
local announced = false

local function formatLeft(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(seconds // 3600, (seconds % 3600) // 60)
end

-- 画面いっぱいのお祝い
local function showCelebration(level: number)
	local gui = ui.gui()
	local overlay = Style.make("Frame", {
		Name = "StarGift",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(30, 26, 70),
		BackgroundTransparency = 0.08,
		ZIndex = 50,
	}, gui)
	Style.make("UIGradient", {
		Color = ColorSequence.new(Color3.fromRGB(40, 30, 110), Color3.fromRGB(120, 60, 160)),
		Rotation = 90,
	}, overlay)

	-- 降る星
	local falling = true
	task.spawn(function()
		while falling and overlay.Parent do
			local star = Style.label({
				Position = UDim2.new(math.random(), 0, -0.05, 0),
				Size = UDim2.fromOffset(28, 28),
				Text = if math.random() < 0.5 then "⭐" else "✨",
				TextSize = 24,
				ZIndex = 51,
			}, overlay)
			TweenService:Create(star, TweenInfo.new(2.2 + math.random(), Enum.EasingStyle.Linear), {
				Position = UDim2.new(star.Position.X.Scale + (math.random() - 0.5) * 0.15, 0, 1.05, 0),
				Rotation = math.random(-180, 180),
			}):Play()
			task.delay(3.5, function()
				star:Destroy()
			end)
			task.wait(0.12)
		end
	end)

	local card = Style.make("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.9, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 52,
	}, overlay)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(520, math.huge) }, card)
	-- 低い画面（スマホの横向き）でも「やったー！」が はみ出さないよう、画面の高さに 収まるまで ちぢめる
	local fit = Instance.new("UIScale")
	fit.Parent = card
	local function refit()
		local natural = card.AbsoluteSize.Y / math.max(fit.Scale, 0.01)
		local room = overlay.AbsoluteSize.Y - 24
		if natural > 0 then
			fit.Scale = math.clamp(room / natural, 0.5, 1)
		end
	end
	card:GetPropertyChangedSignal("AbsoluteSize"):Connect(refit)
	overlay:GetPropertyChangedSignal("AbsoluteSize"):Connect(refit)
	task.defer(refit)
	Style.make("UIListLayout", {
		Padding = UDim.new(0, 10),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, card)

	Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 90),
		Text = "🌳🌌",
		TextSize = 72,
		TextWrapped = false,
		ZIndex = 53,
	}, card)
	Style.label({
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 50),
		Text = t("star.title"),
		TextSize = 38,
		TextColor3 = Color3.fromRGB(255, 240, 170),
		TextWrapped = false,
		ZIndex = 53,
	}, card)
	Style.label({
		LayoutOrder = 3,
		Size = UDim2.new(1, 0, 0, 56),
		Text = t("star.body", level),
		TextSize = 20,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 53,
	}, card)

	-- もらった物の一覧（絵＋名前）
	local gifts = Style.make("Frame", {
		LayoutOrder = 4,
		Size = UDim2.new(1, 0, 0, 120),
		BackgroundTransparency = 1,
		ZIndex = 53,
	}, card)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, gifts)
	local items = {}
	local pet = Config.PetById[Config.StarGift.pet]
	table.insert(items, { icon = pet.icon, key = "pet_" .. pet.id, name = t("pet." .. pet.id) })
	for _, id in Config.StarGift.cosmetics do
		local item = Config.CosmeticById[id]
		table.insert(items, { icon = item.icon, key = "cos_" .. id, name = t("cos." .. id) })
	end
	table.insert(items, { icon = "🟡", key = "ui_coins", name = Style.formatNumber(Config.StarGift.coins) })
	for i, gift in items do
		local box = Style.make("Frame", {
			LayoutOrder = i,
			Size = UDim2.new(1 / #items, -8, 1, 0),
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			ZIndex = 54,
		}, gifts)
		Style.round(box, 18)
		Style.stroke(box, Color3.fromRGB(255, 220, 120), 4)
		Style.setIcon(Style.label({
			Position = UDim2.fromScale(0, 0.06),
			Size = UDim2.fromScale(1, 0.5),
			Text = gift.icon,
			TextSize = 40,
			TextWrapped = false,
			ZIndex = 55,
		}, box), gift.key, gift.icon)
		Style.label({
			Position = UDim2.new(0, 4, 0.58, 0),
			Size = UDim2.new(1, -8, 0.38, 0),
			Text = gift.name,
			TextSize = 14,
			ZIndex = 55,
		}, box)
		Style.pop(box, 0.3 + i * 0.1)
	end

	local ok = Style.button({
		LayoutOrder = 5,
		Size = UDim2.fromOffset(220, 60),
		BackgroundColor3 = Color3.fromRGB(255, 200, 80),
		TextColor3 = C.Text,
		Text = t("star.ok"),
		TextSize = 26,
		ZIndex = 55,
	}, card)
	ok.Activated:Connect(function()
		falling = false
		overlay:Destroy()
	end)

	Style.pop(card, 0.6)
	Sounds.play("jingle")
	task.delay(0.6, Sounds.play, "jingle")
end

local function buildFestival()
	local gui = ui.gui()
	festivalChip = Style.make("Frame", {
		Name = "FestivalChip",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -12), -- 下のまん中（ボタンの無い場所）
		Size = UDim2.fromOffset(0, 36),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = Color3.fromRGB(60, 50, 140),
		Visible = false,
	}, gui)
	Style.round(festivalChip, 18)
	Style.stroke(festivalChip, Color3.fromRGB(255, 220, 120), 3)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14) }, festivalChip)
	festivalLabel = Style.label({
		Size = UDim2.fromOffset(0, 36),
		AutomaticSize = Enum.AutomaticSize.X,
		TextSize = 16,
		TextColor3 = Color3.fromRGB(255, 245, 200),
		TextWrapped = false,
		Text = "",
	}, festivalChip)

	-- 降る星（カメラの上から）
	starAnchor = Instance.new("Part")
	starAnchor.Name = "StarFestivalAnchor"
	starAnchor.Anchored = true
	starAnchor.CanCollide = false
	starAnchor.CanTouch = false
	starAnchor.CanQuery = false
	starAnchor.Transparency = 1
	starAnchor.Size = Vector3.new(120, 1, 120)
	starAnchor.Parent = workspace
	starEmitter = Instance.new("ParticleEmitter")
	starEmitter.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	starEmitter.Shape = Enum.ParticleEmitterShape.Box
	starEmitter.EmissionDirection = Enum.NormalId.Bottom
	starEmitter.Rate = 30
	starEmitter.Lifetime = NumberRange.new(3, 4)
	starEmitter.Speed = NumberRange.new(18, 26)
	starEmitter.Size = NumberSequence.new(1.1, 0.3)
	starEmitter.LightEmission = 1
	starEmitter.Color = ColorSequence.new(Color3.fromRGB(255, 240, 170), Color3.fromRGB(170, 200, 255))
	starEmitter.Enabled = false
	starEmitter.Parent = starAnchor
	RunService.RenderStepped:Connect(function()
		local camera = workspace.CurrentCamera
		if camera then
			starAnchor.CFrame = CFrame.new(camera.CFrame.Position + Vector3.new(0, 40, 0))
		end
	end)
end

local function refreshFestival()
	local left = (workspace:GetAttribute("StarFestivalEndsAt") or 0) - workspace:GetServerTimeNow()
	local active = left > 0
	festivalChip.Visible = active and ui.currentPanel == nil
	starEmitter.Enabled = active
	if active then
		festivalLabel.Text = t("star.festival", math.floor(Config.StarGift.sparkleBonus * 100 + 0.5), formatLeft(left))
		if not announced then
			announced = true
			ui.toastText(t("star.announce"), 5)
		end
	end
end

function StarGiftUI.init(uiModule)
	ui = uiModule
	buildFestival()
	Remotes.StarGift.OnClientEvent:Connect(function(level)
		if type(level) == "number" then
			-- ルルが話している あいだ（「つぎへ」が出ている あいだ）は まつ。
			-- お別れの あいさつの とちゅうで 割りこむと、子どもが 押した「つぎへ」が お祝いの画面に 吸われてしまう
			local banner = ui.gui():FindFirstChild("TutorialBanner", true)
			local buttons = banner and banner:FindFirstChild("Buttons", true)
			local waited = 0
			while banner and buttons and banner.Visible and buttons.Visible and waited < 90 do
				waited += task.wait(0.5)
			end
			ui.showPanel(nil)
			showCelebration(level)
		end
	end)
	task.spawn(function()
		while true do
			refreshFestival()
			task.wait(1)
		end
	end)
end

return StarGiftUI

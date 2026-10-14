-- HUD・ショップ・トースト。すべてコードで生成する。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)
local PalsUI = require(script.Parent.PalsUI)

local UI = {}

local C = Style.Color
local t = I18n.t

local gui
local coinLabel, coinPill
local seedBar
local sellButton, harvestButton, shopButton, palsButton
local shopPanel
local toastLabel
local bannerLabel, banner
local lastCoins = nil
local toastToken = 0

local function basketValue(state): number
	local total = 0
	for cropId, n in state.basket do
		total += Config.sellValue(cropId, false) * n
	end
	for cropId, n in state.basketSparkle do
		total += Config.sellValue(cropId, true) * n
	end
	return math.floor(total * (state.sellBonus or 1))
end

local function buildCoinPill()
	coinPill = Style.make("Frame", {
		Name = "CoinPill",
		Position = UDim2.fromOffset(16, 16),
		Size = UDim2.fromOffset(190, 56),
		BackgroundColor3 = C.Surface,
	}, gui)
	Style.round(coinPill, 28)
	Style.stroke(coinPill, C.Yellow, 4)
	coinLabel = Style.label({
		Size = UDim2.fromScale(1, 1),
		Text = "🪙 0",
		TextSize = 28,
		TextXAlignment = Enum.TextXAlignment.Center,
	}, coinPill)
end

local function buildSeedBar()
	seedBar = Style.make("Frame", {
		Name = "SeedBar",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -16),
		Size = UDim2.fromOffset(0, 92),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundTransparency = 1,
	}, gui)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, seedBar)
end

local function refreshSeedBar(state)
	for _, child in seedBar:GetChildren() do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	for order, cropId in Config.CropOrder do
		local count = state.seeds[cropId] or 0
		if count > 0 then
			local crop = Config.CropById[cropId]
			local selected = state.selected == cropId
			local button = Style.button({
				Name = cropId,
				LayoutOrder = order,
				Size = UDim2.fromOffset(selected and 92 or 80, selected and 92 or 80),
				BackgroundColor3 = selected and C.Surface or C.Dim,
			}, seedBar)
			Style.stroke(button, selected and C.Accent or C.Surface, selected and 5 or 2)
			Style.label({
				Size = UDim2.new(1, 0, 0, 44),
				Position = UDim2.fromOffset(0, 6),
				Text = crop.icon,
				TextSize = 36,
			}, button)
			Style.label({
				Size = UDim2.new(1, 0, 0, 24),
				Position = UDim2.new(0, 0, 1, -30),
				Text = "×" .. count,
				TextSize = 22,
			}, button)
			button.Activated:Connect(function()
				Remotes.SelectSeed:FireServer(cropId)
			end)
		end
	end
end

local function buildActions()
	local column = Style.make("Frame", {
		Name = "Actions",
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, -16, 1, -16),
		Size = UDim2.fromOffset(210, 290),
		BackgroundTransparency = 1,
	}, gui)
	Style.make("UIListLayout", {
		Padding = UDim.new(0, 10),
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, column)

	palsButton = Style.button({
		Name = "Pals",
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, Style.TapSize),
		BackgroundColor3 = Color3.fromRGB(190, 160, 255),
		TextColor3 = C.Text,
		Text = "🐾 " .. t("ui.pals"),
	}, column)
	palsButton.Activated:Connect(function()
		UI.setShopVisible(false)
		PalsUI.toggle()
	end)

	shopButton = Style.button({
		Name = "Shop",
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, Style.TapSize),
		BackgroundColor3 = C.Mint,
		TextColor3 = C.Text,
		Text = "🛒 " .. t("ui.shop"),
	}, column)

	harvestButton = Style.button({
		Name = "HarvestAll",
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, Style.TapSize),
		BackgroundColor3 = C.Yellow,
		TextColor3 = C.Text,
		Text = "🧺 " .. t("ui.harvestAll"),
	}, column)

	sellButton = Style.button({
		Name = "SellAll",
		LayoutOrder = 3,
		Size = UDim2.new(1, 0, 0, 64),
		BackgroundColor3 = C.Accent,
		Text = "💰 " .. t("ui.sellAll"),
		TextSize = 24,
	}, column)
	Style.stroke(sellButton, C.Surface, 3)

	shopButton.Activated:Connect(function()
		PalsUI.setVisible(false)
		UI.setShopVisible(not shopPanel.Visible)
	end)
	harvestButton.Activated:Connect(function()
		Remotes.HarvestAll:FireServer()
	end)
	sellButton.Activated:Connect(function()
		Remotes.SellAll:FireServer()
	end)
end

local function buildShop()
	shopPanel = Style.make("Frame", {
		Name = "ShopPanel",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(460, 420),
		BackgroundColor3 = C.Surface,
		Visible = false,
		ZIndex = 10,
	}, gui)
	Style.round(shopPanel, 24)
	Style.stroke(shopPanel, C.Accent, 5)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(460, 420) }, shopPanel)

	Style.label({
		Position = UDim2.fromOffset(20, 12),
		Size = UDim2.new(1, -100, 0, 48),
		Text = "🛒 " .. t("ui.shop"),
		TextSize = 30,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 11,
	}, shopPanel)

	local close = Style.button({
		Name = "Close",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -14, 0, 12),
		Size = UDim2.fromOffset(Style.TapSize, 48),
		BackgroundColor3 = C.Dim,
		TextColor3 = C.Text,
		Text = "✕",
		ZIndex = 11,
	}, shopPanel)
	close.Activated:Connect(function()
		UI.setShopVisible(false)
	end)

	local list = Style.make("ScrollingFrame", {
		Name = "List",
		Position = UDim2.fromOffset(14, 72),
		Size = UDim2.new(1, -28, 1, -86),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ZIndex = 11,
	}, shopPanel)
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, list)

	for order, cropId in Config.CropOrder do
		local crop = Config.CropById[cropId]
		local row = Style.make("Frame", {
			Name = cropId,
			LayoutOrder = order,
			Size = UDim2.new(1, -8, 0, 72),
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			ZIndex = 11,
		}, list)
		Style.round(row, 16)
		Style.stroke(row, C.Dim, 2)
		Style.label({
			Position = UDim2.fromOffset(8, 0),
			Size = UDim2.fromOffset(52, 72),
			Text = crop.icon,
			TextSize = 36,
			ZIndex = 12,
		}, row)
		Style.label({
			Position = UDim2.fromOffset(64, 8),
			Size = UDim2.new(1, -200, 0, 28),
			Text = t("crop." .. cropId),
			TextSize = 20,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 12,
		}, row)
		Style.label({
			Position = UDim2.fromOffset(64, 38),
			Size = UDim2.new(1, -200, 0, 26),
			Text = t("ui.growTime", crop.growTime) .. "・" .. t("ui.sellPrice", crop.sellPrice),
			TextSize = 14,
			TextColor3 = C.TextMuted,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 12,
		}, row)
		local buy = Style.button({
			Name = "Buy",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -8, 0.5, 0),
			Size = UDim2.fromOffset(112, 52),
			Text = "🪙 " .. Style.formatNumber(crop.seedPrice),
			TextSize = 20,
			ZIndex = 12,
		}, row)
		buy.Activated:Connect(function()
			Remotes.BuySeed:FireServer(cropId, 1)
		end)
	end
end

local function buildToast()
	toastLabel = Style.label({
		Name = "Toast",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 84),
		Size = UDim2.fromOffset(0, 48),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundTransparency = 1,
		BackgroundColor3 = C.Surface,
		TextSize = 24,
		TextWrapped = false,
		Visible = false,
		ZIndex = 20,
	}, gui)
	Style.round(toastLabel, 24)
	Style.stroke(toastLabel, C.Accent, 3)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 24), PaddingRight = UDim.new(0, 24) }, toastLabel)
end

local function buildBanner()
	banner = Style.make("Frame", {
		Name = "TutorialBanner",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 16),
		Size = UDim2.fromOffset(0, 56),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = C.Accent,
		Visible = false,
	}, gui)
	Style.round(banner, 28)
	Style.stroke(banner, C.Surface, 4)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 26), PaddingRight = UDim.new(0, 26) }, banner)
	bannerLabel = Style.label({
		Size = UDim2.fromOffset(0, 56),
		AutomaticSize = Enum.AutomaticSize.X,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 24,
		TextWrapped = false,
	}, banner)
end

function UI.setShopVisible(visible: boolean)
	if visible == shopPanel.Visible then
		return
	end
	shopPanel.Visible = visible
	if visible then
		Style.pop(shopPanel, 0.92)
	end
end

function UI.toast(key: string, ...)
	toastToken += 1
	local token = toastToken
	toastLabel.Text = t(key, ...)
	toastLabel.Visible = true
	toastLabel.BackgroundTransparency = 0
	toastLabel.TextTransparency = 0
	Style.pop(toastLabel, 1.15)
	task.delay(1.8, function()
		if token ~= toastToken then
			return
		end
		toastLabel.Visible = false
	end)
end

function UI.setBanner(text: string?)
	if text then
		bannerLabel.Text = text
		if not banner.Visible then
			banner.Visible = true
			Style.pop(banner, 0.9)
		end
	else
		banner.Visible = false
	end
end

-- チュートリアルで光らせるボタン。nilで解除
local highlighted: GuiObject? = nil
local pulseTween: Tween? = nil
function UI.highlight(target: GuiObject?)
	if target == highlighted then
		return
	end
	if pulseTween then
		pulseTween:Cancel()
		pulseTween = nil
	end
	if highlighted then
		local old = highlighted:FindFirstChild("Pulse")
		if old then
			old:Destroy()
		end
	end
	highlighted = target
	if target then
		local stroke = Style.stroke(target, C.Yellow, 6)
		stroke.Name = "Pulse"
		pulseTween = TweenService:Create(
			stroke,
			TweenInfo.new(0.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
			{ Thickness = 12 }
		)
		pulseTween:Play()
	end
end

function UI.buttons()
	return { shop = shopButton, sell = sellButton, harvest = harvestButton }
end

function UI.update(state)
	local coins = state.coins
	coinLabel.Text = "🪙 " .. Style.formatNumber(coins)
	if lastCoins and coins > lastCoins then
		Style.pop(coinPill, 1.15)
	end
	lastCoins = coins

	local value = basketValue(state)
	sellButton.Text = value > 0 and ("💰 %s  +%s"):format(t("ui.sellAll"), Style.formatNumber(value))
		or ("💰 " .. t("ui.sellAll"))
	sellButton.BackgroundColor3 = value > 0 and C.Accent or C.AccentDark
	refreshSeedBar(state)
	PalsUI.update(state)
end

function UI.playHatch(petId: string)
	UI.setShopVisible(false)
	PalsUI.playHatch(petId)
end

function UI.init()
	local player = Players.LocalPlayer
	gui = Style.make("ScreenGui", {
		Name = "CandyUI",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		IgnoreGuiInset = false,
	}, player:WaitForChild("PlayerGui"))

	local camera = workspace.CurrentCamera
	if camera and camera.ViewportSize.Y < 500 then
		Style.make("UIScale", { Scale = 0.85 }, gui)
	end

	buildCoinPill()
	buildSeedBar()
	buildActions()
	buildShop()
	PalsUI.build(gui)
	buildToast()
	buildBanner()
end

return UI

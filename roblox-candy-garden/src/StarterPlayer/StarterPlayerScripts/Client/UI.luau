-- HUD・下の操作ドック・ショップ・トースト。すべてコードで生成する。
-- 配置の方針（モバイルの親指とジャンプボタンを避ける）:
--   左上: コインと状況 / 中央上: 案内 / 下の中央: 種えらび＋大きな操作ボタン（ドック）
--   画面の左右の下すみは、Robloxの移動スティックとジャンプボタンの場所なので空けておく。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)
local PalsUI = require(script.Parent.PalsUI)
local CosmeticsUI = require(script.Parent.CosmeticsUI)
local DailyUI = require(script.Parent.DailyUI)
local CodesUI = require(script.Parent.CodesUI)
local SeasonUI = require(script.Parent.SeasonUI)

local UI = {}

local C = Style.Color
local t = I18n.t

local gui
local coinLabel, coinPill
local seedBar, bottom, side
local sellButton, harvestButton, shopButton, palsButton, styleButton
local palsBadge
local sellWiggling = false
local shopPanel
local toastLabel
local bannerLabel, banner
local lastCoins = nil
local toastToken = 0

local DOCK_WIDTH = 480 -- ドックの基準の幅。画面が狭いときは縮める

local function basketValue(state): number
	local total = 0
	for cropId, n in state.basket do
		total += Config.sellValue(cropId, false) * n
	end
	for cropId, n in state.basketSparkle do
		total += Config.sellValue(cropId, true) * n
	end
	return math.floor(total * (state.sellBonus or 1) * (state.coinMultiplier or 1))
end

-- ---- 左上のコイン ----

local function buildCoinPill()
	coinPill = Style.make("Frame", {
		Name = "CoinPill",
		Position = UDim2.fromOffset(16, 12),
		Size = UDim2.fromOffset(210, 60),
		BackgroundColor3 = C.Surface,
	}, gui)
	Style.round(coinPill, 30)
	Style.stroke(coinPill, C.Outline, 5)
	Style.make("Frame", {
		Name = "Shine",
		Position = UDim2.fromOffset(14, 7),
		Size = UDim2.new(1, -28, 0, 6),
		BackgroundColor3 = C.Yellow,
		BorderSizePixel = 0,
	}, coinPill)
	Style.round(coinPill.Shine, 3)
	coinLabel = Style.label({
		Position = UDim2.fromOffset(0, 8),
		Size = UDim2.new(1, 0, 1, -8),
		Text = "🟡 0",
		TextSize = 32,
		TextWrapped = false,
	}, coinPill)
end

-- コインが増えたとき、ふわっと上がる「+N」
local function floatCoins(amount: number)
	local label = Style.label({
		Position = UDim2.new(0, 36, 0, 78),
		Size = UDim2.fromOffset(180, 40),
		Text = "+" .. Style.formatNumber(amount) .. " 🟡",
		TextSize = 30,
		TextColor3 = Color3.fromRGB(255, 226, 90),
		TextWrapped = false,
		ZIndex = 25,
	}, gui)
	TweenService:Create(label, TweenInfo.new(1.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Position = UDim2.new(0, 36, 0, 40),
		TextTransparency = 1,
	}):Play()
	local stroke = label:FindFirstChild("TextStroke")
	if stroke then
		TweenService:Create(stroke, TweenInfo.new(1.1), { Transparency = 1 }):Play()
	end
	task.delay(1.2, function()
		label:Destroy()
	end)
end

-- ---- 下の中央: 種えらび + ドック ----

local function buildBottom()
	bottom = Style.make("Frame", {
		Name = "Bottom",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -10),
		Size = UDim2.fromOffset(DOCK_WIDTH, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
	}, gui)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		Padding = UDim.new(0, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, bottom)
	Style.make("UIScale", { Name = "FitScale" }, bottom)

	seedBar = Style.make("Frame", {
		Name = "SeedBar",
		LayoutOrder = 1,
		Size = UDim2.fromOffset(DOCK_WIDTH, 0),
		AutomaticSize = Enum.AutomaticSize.Y, -- 種が無いときは高さ0（場所を取らない）
		BackgroundTransparency = 1,
	}, bottom)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, seedBar)

	local dock = Style.make("Frame", {
		Name = "Dock",
		LayoutOrder = 2,
		Size = UDim2.fromOffset(DOCK_WIDTH, 88),
		BackgroundTransparency = 1,
	}, bottom)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, dock)

	local function nav(name: string, order: number, icon: string, caption: string, color: Color3, width: number?)
		return Style.navButton({
			Name = name,
			LayoutOrder = order,
			Size = UDim2.fromOffset(width or 76, 88),
			BackgroundColor3 = color,
			Icon = icon,
			Caption = caption,
		}, dock)
	end

	shopButton = nav("Shop", 1, "🛒", t("ui.shop"), C.Mint)
	palsButton = nav("Pals", 2, "🐾", t("ui.pals"), C.Lilac)
	styleButton = nav("Style", 3, "👗", t("ui.style"), Color3.fromRGB(255, 190, 220))
	harvestButton = nav("HarvestAll", 4, "🧺", t("ui.harvest"), C.Yellow)
	sellButton = nav("SellAll", 5, "💰", t("ui.sell"), C.Accent, 132)
	-- 売るボタンは主役。文字は白＋縁取り
	sellButton.Caption.TextColor3 = Color3.fromRGB(255, 255, 255)
	Style.textStroke(sellButton.Caption)

	-- もう一度押すと閉じる
	local function toggle(name: string, isOpen: boolean)
		if isOpen then
			UI.showPanel(nil)
		else
			UI.showPanel(name)
		end
	end
	shopButton.Activated:Connect(function()
		toggle("shop", shopPanel.Visible)
	end)
	palsButton.Activated:Connect(function()
		toggle("pals", PalsUI.isVisible())
	end)
	styleButton.Activated:Connect(function()
		toggle("style", CosmeticsUI.isVisible())
	end)
	harvestButton.Activated:Connect(function()
		Remotes.HarvestAll:FireServer()
	end)
	sellButton.Activated:Connect(function()
		Remotes.SellAll:FireServer()
	end)
end

-- ---- 右の列: 移動ボタン（じぶんの庭・みんなの木）、ボーナス、コード ----
-- Grow a Garden 2 の「庭・売り場・店へ飛ぶボタン」と同じ考え方。迷子になっても1タップで戻れる。
local function buildSide()
	side = Style.make("Frame", {
		Name = "Side",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -14, 0.45, 0),
		Size = UDim2.fromOffset(76, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
	}, gui)
	Style.make("UIListLayout", {
		Padding = UDim.new(0, 10),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, side)
	Style.make("UIScale", { Name = "FitScale" }, side)

	local function place(name: string, order: number, icon: string, caption: string, color: Color3, dest: string)
		local button = Style.navButton({
			Name = name,
			LayoutOrder = order,
			Size = UDim2.fromOffset(76, 78),
			BackgroundColor3 = color,
			Icon = icon,
			IconSize = 32,
			Caption = caption,
			CaptionSize = 13,
		}, side)
		button.Activated:Connect(function()
			Remotes.Teleport:FireServer(dest)
		end)
	end
	place("GoHome", 1, "🏡", t("ui.home"), Color3.fromRGB(255, 226, 150), "home")
	place("GoTree", 2, "🌳", t("ui.toTree"), C.Mint, "tree")
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
				Size = UDim2.fromOffset(selected and 84 or 72, selected and 76 or 66),
				BackgroundColor3 = selected and C.Yellow or C.Surface,
			}, seedBar)
			if selected then
				button:FindFirstChildOfClass("UIStroke").Color = C.Accent
			end
			Style.label({
				Position = UDim2.fromOffset(0, 2),
				Size = UDim2.new(1, 0, 0.6, 0),
				Text = crop.icon,
				TextSize = 34,
				TextWrapped = false,
			}, button)
			Style.label({
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -2),
				Size = UDim2.new(1, 0, 0.36, 0),
				Text = "×" .. count,
				TextSize = 20,
				TextWrapped = false,
			}, button)
			button.Activated:Connect(function()
				Remotes.SelectSeed:FireServer(cropId)
			end)
		end
	end
end

-- 画面の大きさに合わせて、下のドックを縮める（スマホの縦持ちでも収まる）
local function fitBottom()
	local camera = workspace.CurrentCamera
	if not camera or not bottom then
		return
	end
	local view = camera.ViewportSize
	-- 縦の基準は、種えらび(76)＋ドック(88)＋余白＋上の案内の分。低い画面ほど小さくする
	local scale = math.min(1, (view.X - 24) / DOCK_WIDTH, (view.Y - 20) / 440)
	bottom.FitScale.Scale = math.max(0.5, scale)
	-- 右の列は縦に並ぶので、低い画面では縮める（下のドックとぶつからない高さに）
	if side then
		local count = 0
		for _, child in side:GetChildren() do
			if child:IsA("GuiButton") then
				count += 1
			end
		end
		local height = count * 78 + math.max(0, count - 1) * 10
		side.FitScale.Scale = math.clamp((view.Y * 0.66) / math.max(height, 1), 0.5, 1)
	end
end

-- ---- ショップ ----

local function buildShop()
	local scroll
	shopPanel, scroll = Style.modal(gui, "ShopPanel", "🛒 " .. t("ui.shop"), function()
		UI.showPanel(nil)
	end, C.Mint)
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	for order, cropId in Config.CropOrder do
		local crop = Config.CropById[cropId]
		local row = Style.make("Frame", {
			Name = cropId,
			LayoutOrder = order,
			Size = UDim2.new(1, -10, 0, 88),
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			ZIndex = 11,
		}, scroll)
		Style.round(row, 20)
		Style.stroke(row, C.Dim, 3)
		Style.label({
			Position = UDim2.fromOffset(8, 0),
			Size = UDim2.fromOffset(64, 88),
			Text = crop.icon,
			TextSize = 46,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		Style.label({
			Position = UDim2.fromOffset(78, 10),
			Size = UDim2.new(1, -240, 0, 32),
			Text = t("crop." .. cropId),
			TextSize = 22,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		Style.label({
			Position = UDim2.fromOffset(78, 46),
			Size = UDim2.new(1, -240, 0, 30),
			Text = "⏱ " .. t("ui.growTime", crop.growTime) .. "  💰 " .. crop.sellPrice,
			TextSize = 15,
			TextColor3 = C.TextMuted,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		local buy = Style.button({
			Name = "Buy",
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -10, 0.5, 0),
			Size = UDim2.fromOffset(136, 64),
			Text = "🟡 " .. Style.formatNumber(crop.seedPrice),
			TextSize = 22,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		buy.Activated:Connect(function()
			Remotes.BuySeed:FireServer(cropId, 1)
		end)
	end
end

-- ---- トーストと案内バナー ----

local function buildToast()
	toastLabel = Style.label({
		Name = "Toast",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 92),
		Size = UDim2.fromOffset(0, 54),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundTransparency = 1,
		BackgroundColor3 = C.Surface,
		TextSize = 26,
		TextWrapped = false,
		Visible = false,
		ZIndex = 20,
	}, gui)
	Style.round(toastLabel, 27)
	Style.stroke(toastLabel, C.Accent, 5)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 28), PaddingRight = UDim.new(0, 28) }, toastLabel)
end

local function buildBanner()
	banner = Style.make("Frame", {
		Name = "TutorialBanner",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 12),
		Size = UDim2.fromOffset(0, 64),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = C.Accent,
		Visible = false,
	}, gui)
	Style.round(banner, 32)
	Style.stroke(banner, C.Outline, 5)
	Style.gloss(banner)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 30), PaddingRight = UDim.new(0, 30) }, banner)
	bannerLabel = Style.label({
		Size = UDim2.fromOffset(0, 64),
		AutomaticSize = Enum.AutomaticSize.X,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 26,
		TextWrapped = false,
	}, banner)
end

-- ---- 公開する関数 ----

-- どのパネルを開くか。同時に開くのは1つだけ（nil で全部閉じる）
function UI.showPanel(name: string?)
	-- パネルを開いている間は、下と右の操作ボタンを隠して画面を広く使う
	bottom.Visible = name == nil
	side.Visible = name == nil
	CodesUI.setVisible(name == "codes")
	SeasonUI.setVisible(name == "season")
	local wasShop = shopPanel.Visible
	shopPanel.Visible = name == "shop"
	if shopPanel.Visible and not wasShop then
		Style.pop(shopPanel, 0.92)
	end
	PalsUI.setVisible(name == "pals")
	CosmeticsUI.setVisible(name == "style")
	DailyUI.setVisible(name == "daily")
end

function UI.setShopVisible(visible: boolean)
	if visible then
		UI.showPanel("shop")
	elseif shopPanel.Visible then
		UI.showPanel(nil)
	end
end

function UI.toastText(text: string, seconds: number?)
	toastToken += 1
	local token = toastToken
	toastLabel.Text = text
	toastLabel.Visible = true
	toastLabel.BackgroundTransparency = 0
	toastLabel.TextTransparency = 0
	Style.pop(toastLabel, 1.15)
	task.delay(seconds or 1.8, function()
		if token ~= toastToken then
			return
		end
		toastLabel.Visible = false
	end)
end

function UI.toast(key: string, ...)
	UI.toastText(t(key, ...))
end

function UI.gui(): ScreenGui
	return gui
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
		local stroke = Style.stroke(target, C.Yellow, 8)
		stroke.Name = "Pulse"
		stroke.LineJoinMode = Enum.LineJoinMode.Round
		pulseTween = TweenService:Create(
			stroke,
			TweenInfo.new(0.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
			{ Thickness = 16 }
		)
		pulseTween:Play()
	end
end

function UI.buttons()
	return { shop = shopButton, sell = sellButton, harvest = harvestButton }
end

function UI.playHatch(petId: string)
	UI.showPanel(nil)
	PalsUI.playHatch(petId)
end

function UI.update(state)
	local coins = state.coins
	local function coinText(n: number): string
		return "🟡 " .. Style.formatNumber(n)
	end
	if lastCoins and coins > lastCoins then
		-- 増えたときは、数字が数え上がる＋「+N」がふわっと出る
		Style.countTo(coinLabel, lastCoins, coins, coinText)
		Style.pop(coinPill, 1.12)
		floatCoins(coins - lastCoins)
	else
		coinLabel.Text = coinText(coins)
	end
	lastCoins = coins

	local value = basketValue(state)
	local caption = sellButton:FindFirstChild("Caption")
	caption.Text = value > 0 and ("+" .. Style.formatNumber(value)) or t("ui.sell")
	sellButton.BackgroundColor3 = value > 0 and C.Accent or C.AccentDark
	-- 売れる物があるときは、売るボタンがときどき弾む（次にやることを目で示す）
	if value > 0 and not sellWiggling then
		sellWiggling = true
		task.spawn(function()
			while sellWiggling do
				Style.pop(sellButton, 1.1)
				task.wait(2.2)
			end
		end)
	elseif value <= 0 then
		sellWiggling = false
	end

	-- はじめてのたまごが買えるようになったら、ペットに「!」（1回目だけの案内。出しすぎない）
	local egg = Config.Eggs[1]
	palsBadge.Visible = #(state.pets or {}) == 0 and coins >= egg.price
	refreshSeedBar(state)
	PalsUI.update(state)
	CosmeticsUI.update(state)
	DailyUI.update(state)
	SeasonUI.update(state)
end

function UI.init()
	local player = Players.LocalPlayer
	gui = Style.make("ScreenGui", {
		Name = "CandyUI",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		-- Robloxの上バー・端末の切り欠きを避ける（公式のセーフエリア）
		ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets,
	}, player:WaitForChild("PlayerGui"))

	buildCoinPill()
	buildBottom()
	buildShop()
	local function closeAll()
		UI.showPanel(nil)
	end
	PalsUI.build(gui, closeAll)
	CosmeticsUI.build(gui, closeAll)
	buildSide()
	DailyUI.build(gui, closeAll, function()
		UI.showPanel("daily")
	end, side)
	CodesUI.build(gui, closeAll, function()
		UI.showPanel("codes")
	end, side)
	SeasonUI.build(gui, closeAll, function()
		UI.showPanel("season")
	end, side)
	SeasonUI.setCelebrate(function(text)
		UI.toastText(text, 3)
	end)
	palsBadge = Style.badge(palsButton)
	buildToast()
	buildBanner()

	fitBottom()
	local camera = workspace.CurrentCamera
	if camera then
		camera:GetPropertyChangedSignal("ViewportSize"):Connect(fitBottom)
	end
end

return UI

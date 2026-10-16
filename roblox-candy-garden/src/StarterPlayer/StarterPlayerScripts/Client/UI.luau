-- HUD・下の操作ドック・上の移動ボタン・ショップ・トースト。すべてコードで生成する。
-- 配置の方針（モバイルの親指とジャンプボタンを避ける）:
--   左上: コインと状況 / 中央上: 案内 / 下の中央: 種えらび＋大きな操作ボタン（ドック）
--   画面の左右の下すみは、Robloxの移動スティックとジャンプボタンの場所なので空けておく。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)
local PalsUI = require(script.Parent.PalsUI)
local CosmeticsUI = require(script.Parent.CosmeticsUI)
local DailyUI = require(script.Parent.DailyUI)
local CodesUI = require(script.Parent.CodesUI)
local SeasonUI = require(script.Parent.SeasonUI)
local LimitedShopUI = require(script.Parent.LimitedShopUI)
local QuestsUI = require(script.Parent.QuestsUI)
local Sounds = require(script.Parent.Sounds)

local UI = {}

local C = Style.Color
local t = I18n.t

local gui
local coinLabel, coinPill
local seedBar, bottom, side, travel
local sellButton, harvestButton, shopButton, palsButton, styleButton
local palsBadge
local sellWiggling = false
local shopPanel
local toastLabel
local bannerLabel, banner
local lastCoins = nil
local toastToken = 0
local menuButton, menuBadge
-- 画面の下（畑と足元）は何も置かずに広く見せる。種えらびは上のまん中（空のあたり）。
-- よく使う3つ（ショップ・収穫・売る）は、パソコンでは左の列、スマホでは右手の親指の近く（ジャンプボタンの上）。
-- スマホの左下は移動スティック専用に空けておく。
-- 配置の種類: "pc"（パソコン・タブレット）/ "phone"（スマホ。縦持ち・横持ちとも同じ並び）
local layoutMode = "pc"
local compact = false -- スマホのとき true
local portrait = false -- スマホの縦持ち
local actionStack, topSeeds
local treeChipUntil = 0 -- みんなの木の表示を、この時刻まで出す（進んだときだけ少し見せる）

local COMPACT_MAX_HEIGHT = 600 -- これより低いタッチ画面をスマホとみなす
local DOCK_WIDTH = 480 -- ドックの基準の幅。画面が狭いときは縮める
-- パソコンでは、左上にRobloxのチャット欄が出る。左の列（コイン・メニュー）はその下から始める
-- （スマホのチャットはボタンに畳まれているので、上から使える）
local LEFT_TOP_PC = 196
local leftTop = 12
local JUMP_RESERVE = 100
local PHONE_ROW = 44 -- スマホの上の段の高さ（指で押せる大きさの目安44pt） -- タッチ端末で、右下のジャンプボタンのために空ける高さ

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

-- メニューの中の、BGMのオン/オフ（設定はふだん使わないので、メニューにしまう）。
-- 消したときは赤い斜め線（「🔇」はフォントに無いかもしれないので線で描く）
local function buildMusicButton()
	local button = Style.navButton({
		Name = "Music",
		LayoutOrder = 8,
		Size = UDim2.fromOffset(76, 78),
		BackgroundColor3 = C.Surface,
		Icon = "🎵",
		IconSize = 32,
		Caption = t("ui.music"),
		CaptionSize = 13,
	}, side)
	local slash = Style.make("Frame", {
		Name = "Off",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 40, 0, 5),
		Rotation = -45,
		BackgroundColor3 = Color3.fromRGB(255, 80, 100),
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 3,
	}, button.Icon)
	Style.round(slash, 3)
	local function refresh()
		slash.Visible = not Sounds.isMusicOn()
	end
	button.Activated:Connect(function()
		local on = not Sounds.isMusicOn()
		Sounds.setMusic(on)
		Remotes.SetMusic:FireServer(on)
		refresh()
	end)
	UI.refreshMusic = refresh
end

-- コインが増えたとき、ふわっと上がる「+N」
local function floatCoins(amount: number)
	local label = Style.label({
		Position = UDim2.new(0, 36, 0, leftTop + 66),
		Size = UDim2.fromOffset(180, 40),
		Text = "+" .. Style.formatNumber(amount) .. " 🟡",
		TextSize = 30,
		TextColor3 = Color3.fromRGB(255, 226, 90),
		TextWrapped = false,
		ZIndex = 25,
	}, gui)
	TweenService:Create(label, TweenInfo.new(1.1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
		Position = UDim2.new(0, 36, 0, leftTop + 28),
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
	Style.setScale(bottom, 1)

	-- 種えらび: 横にスライドできる列。種が多くても1つ1つを小さくしない（入りきらない分は指で横に送る）
	seedBar = Style.make("ScrollingFrame", {
		Name = "SeedBar",
		LayoutOrder = 1,
		Size = UDim2.fromOffset(DOCK_WIDTH, 84),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollingDirection = Enum.ScrollingDirection.X,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollBarThickness = 3, -- 細い線で「まだ横にある」と分かる
		ScrollBarImageColor3 = C.Outline,
		ElasticBehavior = Enum.ElasticBehavior.Always,
	}, bottom)
	Style.make("UIPadding", {
		PaddingLeft = UDim.new(0, 4),
		PaddingRight = UDim.new(0, 4),
		PaddingTop = UDim.new(0, 4),
		PaddingBottom = UDim.new(0, 6),
	}, seedBar)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 6),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		VerticalAlignment = Enum.VerticalAlignment.Center,
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

	-- いつも出すのは、毎回使う3つだけ（ペット・おしゃれ・パスなどは「メニュー」にしまう）
	shopButton = nav("Shop", 1, "🛒", t("ui.shop"), C.Mint)
	harvestButton = nav("HarvestAll", 2, "🧺", t("ui.harvest"), C.Yellow)
	sellButton = nav("SellAll", 3, "💰", t("ui.sell"), C.Accent, 132)
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
	harvestButton.Activated:Connect(function()
		Remotes.HarvestAll:FireServer()
	end)
	sellButton.Activated:Connect(function()
		Remotes.SellAll:FireServer()
	end)
end

-- ---- 左上の「メニュー」: ふだん使わないもの（ペット・おしゃれ・パス・おねがい・ボーナス・コード・音楽）をしまう ----
-- 選べる物が少ないほど早く選べる（ヒックの法則）。よく使う物だけを常に出し、残りは必要なときに開く（段階的な表示）。
-- 受け取れる物があるときは、メニューのボタンに「!」を出して、しまっていても気づけるようにする。
local function setMenuOpen(open: boolean)
	side.Visible = open
	menuButton.BackgroundColor3 = open and C.Accent or C.Lilac
	if open then
		Style.pop(side, 0.9)
	end
end

local function buildMenu()
	menuButton = Style.navButton({
		Name = "Menu",
		Position = UDim2.fromOffset(16, 80), -- コインのすぐ下
		Size = UDim2.fromOffset(76, 78),
		BackgroundColor3 = C.Lilac,
		Icon = "",
		Caption = t("ui.menu"),
		CaptionSize = 13,
	}, gui)
	-- 三本線のアイコン（「☰」はフォントに無いかもしれないので線で描く）
	for i = 0, 2 do
		local bar = Style.make("Frame", {
			Name = "Bar",
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0.17 + i * 0.13, 0),
			Size = UDim2.fromOffset(32, 5),
			BackgroundColor3 = C.Text,
			BorderSizePixel = 0,
		}, menuButton)
		Style.round(bar, 3)
	end
	menuBadge = Style.badge(menuButton)

	-- 開いたときに出る、ボタンの一覧（メニューの右に出る）
	side = Style.make("Frame", {
		Name = "Side",
		Position = UDim2.fromOffset(102, 80),
		Size = UDim2.fromOffset(0, 0),
		AutomaticSize = Enum.AutomaticSize.XY,
		BackgroundColor3 = C.Surface,
		Visible = false,
		ZIndex = 8,
	}, gui)
	Style.round(side, 24)
	Style.stroke(side, C.Outline, 5)
	Style.shadow(side)
	Style.make("UIPadding", {
		PaddingLeft = UDim.new(0, 12),
		PaddingRight = UDim.new(0, 12),
		PaddingTop = UDim.new(0, 12),
		PaddingBottom = UDim.new(0, 12),
	}, side)
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(76, 78),
		CellPadding = UDim2.fromOffset(10, 10),
		FillDirectionMaxCells = 4,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, side)
	Style.setScale(side, 1)

	local function item(name: string, order: number, icon: string, caption: string, color: Color3)
		return Style.navButton({
			Name = name,
			LayoutOrder = order,
			Size = UDim2.fromOffset(76, 78),
			BackgroundColor3 = color,
			Icon = icon,
			IconSize = 32,
			Caption = caption,
			CaptionSize = 13,
		}, side)
	end
	palsButton = item("Pals", 5, "🐾", t("ui.pals"), C.Lilac)
	styleButton = item("Style", 6, "👗", t("ui.style"), Color3.fromRGB(255, 190, 220))
	palsButton.Activated:Connect(function()
		UI.showPanel(if PalsUI.isVisible() then nil else "pals")
	end)
	styleButton.Activated:Connect(function()
		UI.showPanel(if CosmeticsUI.isVisible() then nil else "style")
	end)
	menuButton.Activated:Connect(function()
		setMenuOpen(not side.Visible)
	end)
end

-- ---- 上のまん中: 移動ボタン（じぶんの庭・みんなの木） ----
-- Grow a Garden 2 の「画面の上に並んだ、庭・売り場・店へ飛ぶボタン」と同じ配置。迷子になっても1タップで戻れる。
local function buildTravel()
	travel = Style.make("Frame", {
		Name = "Travel",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 8),
		Size = UDim2.fromOffset(0, 46),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundTransparency = 1,
	}, gui)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, travel)
	local function place(name: string, order: number, text: string, color: Color3, dest: string)
		local button = Style.button({
			Name = name,
			LayoutOrder = order,
			Size = UDim2.fromOffset(150, 46),
			BackgroundColor3 = color,
			TextColor3 = C.Text,
			Text = text,
			TextSize = 18,
			TextWrapped = false,
		}, travel)
		button.Activated:Connect(function()
			Remotes.Teleport:FireServer(dest)
		end)
	end
	place("GoHome", 1, "🏡 " .. t("ui.home"), Color3.fromRGB(255, 226, 150), "home")
	place("GoTree", 2, "🌳 " .. t("ui.toTree"), C.Mint, "tree")
end

local SEED_PHONE = 54 -- スマホの種カード（縮めない。指で押せる44以上）
local latestState = nil -- 配置が変わったときに、種カードを作り直すため
local seedCount = 0

local function refreshSeedBar(state)
	for _, child in seedBar:GetChildren() do
		if child:IsA("TextButton") then
			child:Destroy()
		end
	end
	seedCount = 0
	local selectedButton = nil
	for order, cropId in Config.CropOrder do
		local count = state.seeds[cropId] or 0
		if count > 0 then
			seedCount += 1
			local crop = Config.CropById[cropId]
			local selected = state.selected == cropId
			local size = if compact
				then UDim2.fromOffset(SEED_PHONE, SEED_PHONE)
				else UDim2.fromOffset(selected and 84 or 72, selected and 76 or 66)
			local button = Style.button({
				Name = cropId,
				LayoutOrder = order,
				Size = size,
				BackgroundColor3 = selected and C.Yellow or C.Surface,
			}, seedBar)
			if selected then
				button:FindFirstChildOfClass("UIStroke").Color = C.Accent
				selectedButton = button
			end
			Style.label({
				Position = UDim2.fromScale(0, 0.04),
				Size = UDim2.fromScale(1, 0.58),
				Text = crop.icon,
				TextSize = if compact then 28 else 34,
				TextWrapped = false,
			}, button)
			Style.label({
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -2),
				Size = UDim2.fromScale(1, 0.38),
				Text = "×" .. count,
				TextSize = if compact then 16 else 20,
				TextWrapped = false,
			}, button)
			button.Activated:Connect(function()
				Remotes.SelectSeed:FireServer(cropId)
			end)
		end
	end
	-- 選んでいる種が見える位置まで、列を送る
	if selectedButton then
		task.defer(function()
			if not selectedButton.Parent then
				return
			end
			local left = selectedButton.AbsolutePosition.X - seedBar.AbsolutePosition.X + seedBar.CanvasPosition.X
			local view = seedBar.AbsoluteSize.X
			local x = seedBar.CanvasPosition.X
			if left < x then
				x = left - 4
			elseif left + selectedButton.AbsoluteSize.X > x + view then
				x = left + selectedButton.AbsoluteSize.X - view + 8
			end
			seedBar.CanvasPosition = Vector2.new(math.max(0, x), 0)
		end)
	end
end

-- よく使う3つのボタンの入れ物と、上の種えらびの入れ物
local function buildCompactFrames()
	actionStack = Style.make("Frame", {
		Name = "ActionStack",
		Size = UDim2.fromOffset(66, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Visible = false,
	}, gui)
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(66, 66),
		CellPadding = UDim2.fromOffset(8, 8),
		FillDirectionMaxCells = 1,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, actionStack)
	Style.setScale(actionStack, 1)

	topSeeds = Style.make("Frame", {
		Name = "TopSeeds",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 58), -- 上の移動ボタンの下（空のあたり）
		Size = UDim2.fromOffset(DOCK_WIDTH, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
	}, gui)
	Style.setScale(topSeeds, 0.72)
end

-- スマホでの大きさの倍率。画面の短い辺に合わせる（390pt ならおよそ0.75。指で押せる44pt以上は保つ）
local function phoneScale(): number
	local size = gui.AbsoluteSize
	return math.clamp(math.min(size.X, size.Y) / 520, 0.62, 0.85)
end

-- 配置を切り替える（パソコン / スマホ）
-- スマホは、上のはしに小さく1段（左: コイン・メニュー / 右: 庭・木）、その下に種えらび。
-- よく使う3つ（ショップ・収穫・売る）は右手の親指の近く。左下は移動スティック、まん中は畑のために空ける。
local function applyLayout(mode: string)
	layoutMode = mode
	compact = mode == "phone"
	local size = gui.AbsoluteSize
	portrait = compact and (size.Y > size.X or gui:GetAttribute("ForcePortrait") == true) -- ForcePortrait: Studioで試すとき用
	for i, button in { shopButton, harvestButton, sellButton } do
		button.LayoutOrder = i
		button.Parent = actionStack
		Style.setTextSize(button.Icon, 30)
		Style.setTextSize(button.Caption, 13)
	end
	seedBar.Parent = topSeeds
	seedBar.AnchorPoint = Vector2.new(0.5, 0)
	seedBar.Position = UDim2.fromScale(0.5, 0)
	leftTop = if compact then 8 else LEFT_TOP_PC

	local sideGrid = side:FindFirstChildOfClass("UIGridLayout")
	sideGrid.FillDirectionMaxCells = if portrait then 3 else 4

	-- 移動ボタン: スマホでは絵だけの小さいボタン
	local travelLayout = travel:FindFirstChildOfClass("UIListLayout")
	for _, button in travel:GetChildren() do
		if button:IsA("TextButton") then
			if not button:GetAttribute("FullText") then
				button:SetAttribute("FullText", button.Text)
			end
			local full = button:GetAttribute("FullText")
			if compact then
				button.Text = string.match(full, "^(%S+)") or full -- 先頭の絵文字だけ
				button.Size = UDim2.fromOffset(54, 54)
				Style.setTextSize(button, 28)
			else
				button.Text = full
				button.Size = UDim2.fromOffset(150, 46)
				Style.setTextSize(button, 18)
			end
		end
	end
	travelLayout.Padding = UDim.new(0, if compact then 6 else 10)

	local weatherChip = gui:FindFirstChild("WeatherChip")
	local treeChip = gui:FindFirstChild("TreeChip")
	local bars = {}
	for _, bar in menuButton:GetChildren() do
		if bar.Name == "Bar" then
			table.insert(bars, bar)
		end
	end

	local seedLayout = seedBar:FindFirstChildOfClass("UIListLayout")
	if compact then
		-- 上の段は、どれも同じ高さ（PHONE_ROW）にそろえる（大きさのバランス）。主役の3つのボタンだけ少し大きい
		local coinWidth = 210 * PHONE_ROW / 60
		Style.setScale(coinPill, PHONE_ROW / 60)
		coinPill.Position = UDim2.fromOffset(12, leftTop)
		-- メニュー: スマホでは三本線だけ（小さいボタンに文字を入れると見切れるため）
		menuButton.Size = UDim2.fromOffset(PHONE_ROW, PHONE_ROW)
		Style.setScale(menuButton, 1)
		menuButton.Position = UDim2.fromOffset(12 + coinWidth + 6, leftTop)
		menuButton.Caption.Visible = false
		for i, bar in bars do
			bar.Size = UDim2.fromOffset(24, 4)
			bar.Position = UDim2.new(0.5, 0, 0.3 + (i - 1) * 0.16, 0)
		end
		side.AnchorPoint = Vector2.new(0, 0)
		side.Position = UDim2.fromOffset(12, leftTop + PHONE_ROW + 8)
		travel.AnchorPoint = Vector2.new(1, 0)
		travel.Position = UDim2.new(1, -12, 0, leftTop)
		Style.setScale(travel, PHONE_ROW / 54)
		local travelWidth = (54 * 2 + 6) * PHONE_ROW / 54
		if treeChip then
			treeChip.Size = UDim2.fromOffset(150, 58) -- スマホでは細く（種えらびの場所を広げる）
			Style.setScale(treeChip, PHONE_ROW / 58) -- レベル表示も同じ高さ
		end
		if portrait then
			-- 縦持ち: 1段目 [コイン][メニュー] … [庭][木]
			--         2段目 [種えらび] … [みんなの木のレベル]
			--         3段目 [お天気]（お天気のときだけ）
			local row2 = leftTop + PHONE_ROW + 8
			if treeChip then
				treeChip.AnchorPoint = Vector2.new(1, 0)
				treeChip.Position = UDim2.new(1, -12, 0, row2)
			end
			topSeeds.AnchorPoint = Vector2.new(0, 0)
			topSeeds.Position = UDim2.fromOffset(12, row2)
			seedBar.AnchorPoint = Vector2.new(0, 0)
			seedBar.Position = UDim2.new()
			seedLayout.HorizontalAlignment = Enum.HorizontalAlignment.Left
			if weatherChip then
				weatherChip.AnchorPoint = Vector2.new(0, 0)
				weatherChip.Position = UDim2.fromOffset(12, row2 + SEED_PHONE + 18) -- 種えらびの列の下
				Style.setScale(weatherChip, 36 / 40)
			end
		else
			-- 横持ち: 1段目 [コイン][メニュー] … [種えらび] … [みんなの木のレベル][庭][木]
			--         2段目 [お天気]（お天気のときだけ）
			-- 右側の縦は、ショップ・収穫・売るのために空けておく
			if treeChip then
				treeChip.AnchorPoint = Vector2.new(1, 0)
				treeChip.Position = UDim2.new(1, -12 - travelWidth - 8, 0, leftTop)
			end
			topSeeds.AnchorPoint = Vector2.new(0.5, 0)
			topSeeds.Position = UDim2.new(0.5, 0, 0, leftTop)
			seedBar.AnchorPoint = Vector2.new(0.5, 0)
			seedBar.Position = UDim2.fromScale(0.5, 0)
			seedLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
			if weatherChip then
				weatherChip.AnchorPoint = Vector2.new(0, 0)
				weatherChip.Position = UDim2.fromOffset(12, leftTop + PHONE_ROW + 8)
				Style.setScale(weatherChip, 36 / 40)
			end
		end
		actionStack.AnchorPoint = Vector2.new(1, 1)
		actionStack.Position = UDim2.new(1, -14, 1, -JUMP_RESERVE)
	else
		Style.setScale(coinPill, 1)
		coinPill.Position = UDim2.fromOffset(16, leftTop)
		menuButton.Size = UDim2.fromOffset(76, 78)
		Style.setScale(menuButton, 1)
		menuButton.Position = UDim2.fromOffset(234, leftTop - 9)
		menuButton.Caption.Visible = true
		Style.setTextSize(menuButton.Caption, 13)
		for i, bar in bars do
			bar.Size = UDim2.fromOffset(32, 5)
			bar.Position = UDim2.new(0.5, 0, 0.17 + (i - 1) * 0.13, 0)
		end
		side.AnchorPoint = Vector2.new(0, 0)
		side.Position = UDim2.fromOffset(318, leftTop - 9)
		travel.AnchorPoint = Vector2.new(0.5, 0)
		travel.Position = UDim2.new(0.5, 0, 0, 8)
		Style.setScale(travel, 1)
		if weatherChip then
			weatherChip.AnchorPoint = Vector2.new(0, 0)
			weatherChip.Position = UDim2.fromOffset(94, leftTop + 76)
			Style.setScale(weatherChip, 1)
		end
		if treeChip then
			-- みんなの木のレベルは、上の移動ボタンの右（右上より）
			treeChip.AnchorPoint = Vector2.new(0, 0)
			treeChip.Size = UDim2.fromOffset(230, 58)
			treeChip.Position = UDim2.new(0.5, 170, 0, 2)
			Style.setScale(treeChip, 0.85)
		end
		topSeeds.AnchorPoint = Vector2.new(0.5, 0)
		topSeeds.Position = UDim2.new(0.5, 0, 0, 58)
		seedBar.AnchorPoint = Vector2.new(0.5, 0)
		seedBar.Position = UDim2.fromScale(0.5, 0)
		seedLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
		actionStack.AnchorPoint = Vector2.new(0, 0)
		actionStack.Position = UDim2.fromOffset(16, leftTop + 72)
	end
	-- 案内とお知らせは、種えらびの下に
	local bannerY = if compact
		then (if portrait then leftTop + PHONE_ROW + SEED_PHONE + 36 else leftTop + SEED_PHONE + 20)
		else 130
	banner.Position = UDim2.new(0.5, 0, 0, bannerY)
	toastLabel.Position = UDim2.new(0.5, 0, 0, bannerY + 60)
	Style.setScale(banner, if compact then 0.8 else 1)
	Style.setScale(toastLabel, if compact then 0.8 else 1)
	if latestState then
		refreshSeedBar(latestState)
	end
	UI.showPanel(UI.currentPanel)
end

local function wantedMode(): string
	local forced = gui:GetAttribute("ForceLayout") -- Studioで試すとき用（"pc" / "phone"）
	if forced == "pc" or forced == "phone" then
		return forced
	end
	local size = gui.AbsoluteSize
	if UserInputService.TouchEnabled and math.min(size.X, size.Y) < COMPACT_MAX_HEIGHT then
		return "phone"
	end
	return "pc"
end

local lastSize = Vector2.zero
-- 画面の大きさ・向きに合わせて、配置を選び、ボタンを縮める
local function fitBottom()
	local camera = workspace.CurrentCamera
	if not camera or not bottom then
		return
	end
	local view = camera.ViewportSize
	local size = gui.AbsoluteSize
	if actionStack and banner then
		local mode = wantedMode()
		local turned = compact and (size.Y > size.X or gui:GetAttribute("ForcePortrait") == true) ~= portrait -- スマホの向きが変わった
		if mode ~= layoutMode or turned or (compact and size ~= lastSize) then
			lastSize = size
			applyLayout(mode)
		end
	end
	local screenY = size.Y
	if actionStack then
		-- 3つのボタン: スマホは画面に合わせて小さく（ジャンプボタンの上に収める）、パソコンはコインの下に収まる大きさ
		if compact then
			local room = (screenY - JUMP_RESERVE - (if portrait then 200 else leftTop + 52)) / 214
			Style.setScale(actionStack, math.clamp(math.min(phoneScale(), room), 0.55, 0.85))
		else
			Style.setScale(actionStack, math.clamp((screenY - leftTop - 72 - 12) / 214, 0.6, 1))
		end
	end
	local scale = math.min(1, (view.X - 24) / DOCK_WIDTH, (view.Y - 20) / 440)
	Style.setScale(bottom, math.max(0.5, scale))
	-- お知らせと案内は、画面幅の9割まで（それ以上は折り返す）
	local width = size.X
	if toastLabel then
		toastLabel.MaxWidth.MaxSize = Vector2.new(math.max(200, width * 0.9), math.huge)
	end
	if bannerLabel then
		bannerLabel.MaxWidth.MaxSize = Vector2.new(math.max(160, width * 0.9 - 60), math.huge)
	end
	-- 種えらび: スマホは縮めずに、使える幅に合わせて列の幅を決める（入りきらない分は横にスライド）
	if topSeeds then
		local chipWidth = 150 * PHONE_ROW / 58
		if compact then
			local room = if portrait then width - 24 - chipWidth - 12
				else width - 2 * (12 + chipWidth + 8 + 114 * PHONE_ROW / 54 + 8)
			local content = seedCount * (SEED_PHONE + 6) + 8
			Style.setScale(topSeeds, 1)
			seedBar.Size = UDim2.fromOffset(math.max(SEED_PHONE + 8, math.min(room, content)), SEED_PHONE + 12)
		else
			Style.setScale(topSeeds, 0.85)
			seedBar.Size = UDim2.fromOffset(math.min(DOCK_WIDTH, width / 0.85 - 24), 84)
		end
	end
	-- メニューの一覧は、画面に収まる大きさに
	if side then
		local byHeight = (screenY - leftTop - 90) / 200
		local byWidth = (width - 24) / (if portrait then 290 else 380)
		Style.setScale(side, math.clamp(math.min(byHeight, byWidth), 0.55, 1))
	end
end

-- ---- ショップ ----

local function buildShop()
	local scroll
	shopPanel, scroll = Style.modal(gui, "ShopPanel", "🛒 " .. t("ui.shop"), function()
		UI.showPanel(nil)
	end, C.Mint)
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	-- いちばん上に「きょうの とくべつ」（日替わり）、その下に いつもの種屋
	LimitedShopUI.build(scroll)
	Style.label({
		Name = "SeedTitle",
		LayoutOrder = 0,
		Size = UDim2.new(1, -10, 0, 30),
		Text = t("ui.seedTitle"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)

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
			-- 名前と説明は、買うボタンの左の残り幅に（狭い画面では文字が自動で小さくなる）
			Size = UDim2.new(0.68, -102, 0, 32), -- 買うボタンの縁取りと重ならないよう、すき間を空ける
			Text = t("crop." .. cropId),
			TextSize = 22,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		Style.label({
			Position = UDim2.fromOffset(78, 46),
			Size = UDim2.new(0.68, -102, 0, 30),
			Text = "⏱ " .. t("ui.growTimeText", I18n.duration(crop.growTime)) .. "  💰 " .. Style.formatNumber(crop.sellPrice),
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
			Size = UDim2.new(0.32, 0, 0, 64), -- 画面の幅に合わせる（最大136）
			Text = "🟡 " .. Style.formatNumber(crop.seedPrice),
			TextSize = 22,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		Style.make("UISizeConstraint", { MaxSize = Vector2.new(136, 64) }, buy)
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
		Position = UDim2.new(0.5, 0, 0, 120), -- 上の移動ボタンと案内バナーの下
		Size = UDim2.fromOffset(0, 0),
		-- 文の長さに合わせて広がり、画面幅の9割（fitBottomで設定）を超えたら折り返す
		AutomaticSize = Enum.AutomaticSize.XY,
		BackgroundTransparency = 1,
		BackgroundColor3 = C.Surface,
		TextSize = 26,
		TextWrapped = true,
		Visible = false,
		ZIndex = 20,
	}, gui)
	Style.round(toastLabel, 27)
	Style.stroke(toastLabel, C.Accent, 5)
	Style.make("UIPadding", {
		PaddingLeft = UDim.new(0, 28),
		PaddingRight = UDim.new(0, 28),
		PaddingTop = UDim.new(0, 12),
		PaddingBottom = UDim.new(0, 12),
	}, toastLabel)
	Style.make("UISizeConstraint", { Name = "MaxWidth" }, toastLabel)
end

local function buildBanner()
	banner = Style.make("Frame", {
		Name = "TutorialBanner",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 62), -- 上の移動ボタンの下
		ZIndex = 5,
		Size = UDim2.fromOffset(0, 0),
		AutomaticSize = Enum.AutomaticSize.XY,
		BackgroundColor3 = C.Accent,
		Visible = false,
	}, gui)
	Style.round(banner, 32)
	Style.stroke(banner, C.Outline, 5)
	Style.gloss(banner)
	Style.make("UIPadding", {
		PaddingLeft = UDim.new(0, 30),
		PaddingRight = UDim.new(0, 30),
		PaddingTop = UDim.new(0, 14),
		PaddingBottom = UDim.new(0, 14),
	}, banner)
	bannerLabel = Style.label({
		Size = UDim2.fromOffset(0, 0),
		-- 長い案内は、画面幅に合わせて折り返す（fitBottomで上限を設定）
		AutomaticSize = Enum.AutomaticSize.XY,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 26,
		TextWrapped = true,
	}, banner)
	Style.make("UISizeConstraint", { Name = "MaxWidth" }, bannerLabel)
end

-- ---- 公開する関数 ----

-- どのパネルを開くか。同時に開くのは1つだけ（nil で全部閉じる）
function UI.showPanel(name: string?)
	UI.currentPanel = name
	-- パネルを開いている間は、下と右の操作ボタンを隠して画面を広く使う
	bottom.Visible = false -- 下はいつも空けておく（畑と足元を見やすく）
	if actionStack then
		actionStack.Visible = name == nil
		topSeeds.Visible = name == nil
	end
	setMenuOpen(false) -- 何かを開いたら、メニューの一覧は閉じる
	menuButton.Visible = name == nil
	travel.Visible = name == nil
	CodesUI.setVisible(name == "codes")
	QuestsUI.setVisible(name == "quests")
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
	latestState = state
	refreshSeedBar(state)
	fitBottom() -- 種の数が変わったら、種えらびの大きさを合わせ直す
	UI.refreshMusic()
	PalsUI.update(state)
	CosmeticsUI.update(state)
	DailyUI.update(state)
	SeasonUI.update(state)
	LimitedShopUI.update(state)
	QuestsUI.update(state)
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
	buildMenu()
	buildMusicButton()
	buildTravel()
	QuestsUI.build(gui, closeAll, function()
		UI.showPanel("quests")
	end, side)
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
	buildCompactFrames()

	fitBottom()
	local camera = workspace.CurrentCamera
	if camera then
		camera:GetPropertyChangedSignal("ViewportSize"):Connect(fitBottom)
	end
	gui:GetAttributeChangedSignal("ForceLayout"):Connect(fitBottom)
	-- スマホを回したとき（画面の向きが変わったとき）にも配置を合わせ直す
	gui:GetPropertyChangedSignal("AbsoluteSize"):Connect(fitBottom)

	-- みんなの木が進んだら、左の表示を少しのあいだ出す
	for _, name in { "TreeProgress", "TreeLevel" } do
		workspace:GetAttributeChangedSignal(name):Connect(function()
			treeChipUntil = os.clock() + 6
		end)
	end
	task.spawn(function()
		while gui.Parent do
			-- メニューの中に「!」があれば、閉じているメニューのボタンにも「!」を出す
			local any = false
			for _, d in side:GetDescendants() do
				if d.Name == "Badge" and d:IsA("GuiObject") and d.Visible then
					any = true
					break
				end
			end
			menuBadge.Visible = any and not side.Visible
			-- みんなの木の表示は、木の近く（広場）にいるときと、進んだ直後だけ
			local treeChip = gui:FindFirstChild("TreeChip")
			if treeChip then
				local character = player.Character
				local root = character and character:FindFirstChild("HumanoidRootPart")
				local nearTree = root ~= nil and (root.Position * Vector3.new(1, 0, 1)).Magnitude < 45
				treeChip.Visible = nearTree or os.clock() < treeChipUntil
			end
			task.wait(0.5)
		end
	end)
end

-- お天気・みんなの木の表示ができたあとに呼ぶ（スマホの配置にそろえる）
function UI.relayout()
	applyLayout(wantedMode())
	fitBottom()
end

return UI

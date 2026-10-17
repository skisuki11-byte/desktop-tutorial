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
local DecorUI = require(script.Parent.DecorUI)
local CropDexUI = require(script.Parent.CropDexUI)
local Fairy = require(script.Parent.Fairy)

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
local toolPanel -- どうぐ屋の画面（ひりょう・じょうろ・ふしぎのしずく）
local dropDetail
local seedRows = {} -- 種屋の行 [cropId] = { row, info, buy }（入荷の数に合わせて表示を変える）
local restockLabel -- 「つぎの入荷まで 3:12」
local toastLabel
local bannerLabel, banner, bannerButtons
local toastY = 120 -- お知らせのふだんの高さ（画面の大きさで変わる）
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
local waterMeter, waterLabel -- じょうろの残り（3つのボタンの上）
local canDetail, canButton -- ショップの「じょうろ」の行
local fertDetail -- ショップの「ひりょう」の行
local expandDetail, expandButton -- ショップの「はたけを ひろげる」の行
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
	local total = Config.basketValue(state)
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
	local cropDexButton = item("CropDex", 8, "📖", t("ui.cropDex"), Color3.fromRGB(255, 210, 150))
	cropDexButton.Activated:Connect(function()
		UI.showPanel(if CropDexUI.isVisible() then nil else "cropdex")
	end)
	local decorButton = item("Decor", 7, "🏡", t("ui.decorate"), Color3.fromRGB(150, 210, 160))
	decorButton.Activated:Connect(function()
		UI.showPanel(if DecorUI.isVisible() then nil else "decor")
	end)
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
	-- 列の先頭に、道具（じょうろ・ひりょう）。選んだときだけ、畑に「水やり」「ひりょう」が出る
	local cans = Config.Water.cans
	local water = state.water
	local tools = {
		{ id = "water", icon = "💧", count = if water then water.amount .. "/" .. (cans[water.level] or cans[1]) else "" },
		{ id = "fertilizer", icon = "🌟", count = "×" .. (state.fertilizer or 0) },
		{ id = "drop", icon = "🔮", count = "×" .. (state.drops or 0) },
	}
	for order, tool in tools do
		seedCount += 1
		local holding = state.tool == tool.id
		local button = Style.button({
			Name = "Tool_" .. tool.id,
			LayoutOrder = order - 10,
			Size = if compact
				then UDim2.fromOffset(SEED_PHONE, SEED_PHONE)
				else UDim2.fromOffset(holding and 84 or 72, holding and 76 or 66),
			-- 道具は水色の札で、種と見分けやすく
			BackgroundColor3 = if holding then C.Yellow else Color3.fromRGB(215, 236, 255),
		}, seedBar)
		if holding then
			button:FindFirstChildOfClass("UIStroke").Color = C.Accent
			selectedButton = button
		end
		Style.label({
			Position = UDim2.fromScale(0, 0.04),
			Size = UDim2.fromScale(1, 0.58),
			Text = tool.icon,
			TextSize = if compact then 28 else 34,
			TextWrapped = false,
		}, button)
		Style.label({
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 1, -2),
			Size = UDim2.fromScale(1, 0.38),
			Text = tool.count,
			TextSize = if compact then 14 else 18,
			TextWrapped = false,
		}, button)
		button.Activated:Connect(function()
			Remotes.SelectTool:FireServer(tool.id)
		end)
	end
	for order, cropId in Config.CropOrder do
		local count = state.seeds[cropId] or 0
		if count > 0 then
			seedCount += 1
			local crop = Config.CropById[cropId]
			local selected = state.tool == nil and state.selected == cropId
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
-- じょうろの残りの表示。3つのボタン（ショップ・収穫・売る）のすぐ上について回る
local function buildWaterMeter()
	waterMeter = Style.make("Frame", {
		Name = "WaterMeter",
		AnchorPoint = Vector2.new(0.5, 1),
		Size = UDim2.fromOffset(74, 30),
		BackgroundColor3 = Color3.fromRGB(215, 236, 255),
	}, gui)
	Style.round(waterMeter, 15)
	Style.stroke(waterMeter, C.Outline, 3)
	waterLabel = Style.label({
		Size = UDim2.fromScale(1, 1),
		Text = "💧",
		TextSize = 17,
		TextWrapped = false,
	}, waterMeter)
	local function follow()
		local at = actionStack.AbsolutePosition - gui.AbsolutePosition
		waterMeter.Position = UDim2.fromOffset(at.X + actionStack.AbsoluteSize.X / 2, at.Y - 6)
		waterMeter.Visible = actionStack.Visible
	end
	actionStack:GetPropertyChangedSignal("AbsolutePosition"):Connect(follow)
	actionStack:GetPropertyChangedSignal("AbsoluteSize"):Connect(follow)
	actionStack:GetPropertyChangedSignal("Visible"):Connect(follow)
	follow()
end

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
		-- 種えらびの列は、横はばを いっぱいに使う（道具と種が スライドしなくても見えるように）。
		-- みんなの木のレベルは、広場にいるときだけ出る表示なので、種の列の横には置かない
		local row2 = leftTop + PHONE_ROW + 8
		if portrait then
			-- 縦持ち: 1段目 [コイン][メニュー] … [庭][木]
			--         2段目 [種えらび（はしからはしまで）]
			--         3段目 [お天気] … [みんなの木のレベル]
			local row3 = row2 + SEED_PHONE + 18
			if treeChip then
				treeChip.AnchorPoint = Vector2.new(1, 0)
				treeChip.Position = UDim2.new(1, -12, 0, row3)
			end
			topSeeds.AnchorPoint = Vector2.new(0, 0)
			topSeeds.Position = UDim2.fromOffset(12, row2)
			seedBar.AnchorPoint = Vector2.new(0, 0)
			seedBar.Position = UDim2.new()
			seedLayout.HorizontalAlignment = Enum.HorizontalAlignment.Left
			if weatherChip then
				weatherChip.AnchorPoint = Vector2.new(0, 0)
				weatherChip.Position = UDim2.fromOffset(12, row3)
				Style.setScale(weatherChip, 36 / 40)
			end
		else
			-- 横持ち: 1段目 [コイン][メニュー][種えらび（庭のボタンの手前まで）][庭][木]
			--         2段目 [みんなの木のレベル]（広場にいるときだけ）
			--         3段目 [お天気]（お天気のときだけ）
			-- 左はしの縦にまとめる。右側の縦は、ショップ・収穫・売るのために空けておく
			if treeChip then
				treeChip.AnchorPoint = Vector2.new(0, 0)
				treeChip.Position = UDim2.fromOffset(12, row2)
			end
			-- 列は、メニューの右と 庭のボタンの左の あいだの まん中に置く
			local leftEdge = 12 + coinWidth + 6 + PHONE_ROW + 8
			local rightEdge = 12 + travelWidth + 8
			topSeeds.AnchorPoint = Vector2.new(0.5, 0)
			topSeeds.Position = UDim2.new(0.5, (leftEdge - rightEdge) / 2, 0, leftTop)
			seedBar.AnchorPoint = Vector2.new(0.5, 0)
			seedBar.Position = UDim2.fromScale(0.5, 0)
			seedLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
			if weatherChip then
				weatherChip.AnchorPoint = Vector2.new(0, 0)
				weatherChip.Position = UDim2.fromOffset(12, row2 + PHONE_ROW + 8)
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
		actionStack.Position = UDim2.fromOffset(16, leftTop + 108) -- 上に じょうろの残り（💧）を出す すき間
	end
	-- 案内とお知らせは、種えらびの下に
	local bannerY = if compact
		then (if portrait then leftTop + PHONE_ROW + SEED_PHONE + 36 + PHONE_ROW + 8 else leftTop + SEED_PHONE + 20)
		else 130
	banner.Position = UDim2.new(0.5, 0, 0, bannerY)
	toastY = bannerY + 60
	toastLabel.Position = UDim2.new(0.5, 0, 0, toastY)
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
			local room = (screenY - JUMP_RESERVE - (if portrait then 200 else leftTop + 52) - 40) / 214
			Style.setScale(actionStack, math.clamp(math.min(phoneScale(), room), 0.55, 0.85))
		else
			Style.setScale(actionStack, math.clamp((screenY - leftTop - 108 - 12) / 214, 0.6, 1))
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
		if compact then
			-- 使える幅: 縦持ちは はしからはしまで、横持ちはメニューの右から 庭のボタンの左まで
			local room = if portrait then width - 24
				else width - (12 + 210 * PHONE_ROW / 60 + 6 + PHONE_ROW + 8) - (12 + 114 * PHONE_ROW / 54 + 8)
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
	-- 入荷の時計（5分ごとに品ぞろえが変わる）
	restockLabel = Style.label({
		Name = "RestockTimer",
		LayoutOrder = 0,
		Size = UDim2.new(1, -10, 0, 22),
		Text = "",
		TextSize = 16,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	task.spawn(function()
		while restockLabel.Parent do
			local now = workspace:GetServerTimeNow()
			local nextAt = (Config.seedRound(now) + 1) * Config.SeedShop.restockSeconds
			local left = math.max(0, math.ceil(nextAt - now))
			restockLabel.Text = "🕒 " .. t("ui.restockIn", string.format("%d:%02d", left // 60, left % 60))
			task.wait(1)
		end
	end)

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
		local info = Style.label({
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
		seedRows[cropId] = { row = row, info = info, buy = buy }
	end

	-- 種屋の画面のいちばん下に「どうぐは どうぐ屋で」の案内
	Style.label({
		Name = "ToolsHint",
		LayoutOrder = 200,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = t("ui.toolsAtShop") .. "\n" .. t("ui.eggsAtForest"),
		TextSize = 16,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = true,
		ZIndex = 12,
	}, scroll)

	-- ---- どうぐ屋（ひろばの右の小屋でだけ開く）----
	local shopScroll = scroll
	toolPanel, scroll = Style.modal(gui, "ToolShopPanel", t("place.toolShop"), function()
		UI.showPanel(nil)
	end, Color3.fromRGB(120, 190, 140))
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	-- じょうろを大きくする（コインの使い道。1回分ずつしか増えないので、快適にしすぎない）
	local row = Style.make("Frame", {
		Name = "CanRow",
		LayoutOrder = 100,
		Size = UDim2.new(1, -10, 0, 88),
		BackgroundColor3 = Color3.fromRGB(235, 245, 255),
		ZIndex = 11,
	}, scroll)
	Style.round(row, 20)
	Style.stroke(row, Color3.fromRGB(150, 200, 255), 3)
	Style.label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.fromOffset(64, 88),
		Text = "💧",
		TextSize = 44,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	Style.label({
		Position = UDim2.fromOffset(78, 10),
		Size = UDim2.new(0.68, -102, 0, 32),
		Text = t("ui.can"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	canDetail = Style.label({
		Position = UDim2.fromOffset(78, 46),
		Size = UDim2.new(0.68, -102, 0, 30),
		Text = "",
		TextSize = 15,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, row)
	canButton = Style.button({
		Name = "Upgrade",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.32, 0, 0, 64),
		Text = "",
		TextSize = 22,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(136, 64) }, canButton)
	canButton.Activated:Connect(function()
		Remotes.UpgradeCan:FireServer()
	end)

	-- キャンディひりょう（使い切り。育っている途中の作物に使うと、ぐんぐん育つ）
	local fert = Style.make("Frame", {
		Name = "FertilizerRow",
		LayoutOrder = 101,
		Size = UDim2.new(1, -10, 0, 88),
		BackgroundColor3 = Color3.fromRGB(255, 248, 225),
		ZIndex = 11,
	}, scroll)
	Style.round(fert, 20)
	Style.stroke(fert, Color3.fromRGB(240, 200, 100), 3)
	Style.label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.fromOffset(64, 88),
		Text = "🌟",
		TextSize = 44,
		TextWrapped = false,
		ZIndex = 12,
	}, fert)
	Style.label({
		Position = UDim2.fromOffset(78, 10),
		Size = UDim2.new(0.68, -102, 0, 32),
		Text = t("ui.fertilizer"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, fert)
	fertDetail = Style.label({
		Position = UDim2.fromOffset(78, 46),
		Size = UDim2.new(0.68, -102, 0, 30),
		Text = "",
		TextSize = 15,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, fert)
	local fertBuy = Style.button({
		Name = "Buy",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.32, 0, 0, 64),
		Text = "🟡 " .. Style.formatNumber(Config.Fertilizer.price),
		TextSize = 22,
		TextWrapped = false,
		ZIndex = 12,
	}, fert)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(136, 64) }, fertBuy)
	fertBuy.Activated:Connect(function()
		Remotes.BuyFertilizer:FireServer()
	end)

	-- ふしぎのしずく（どうぐ屋だけ。ふしぎな作物が出やすくなる）
	local drop = Style.make("Frame", {
		Name = "DropRow",
		LayoutOrder = 102,
		Size = UDim2.new(1, -10, 0, 88),
		BackgroundColor3 = Color3.fromRGB(242, 234, 255),
		ZIndex = 11,
	}, scroll)
	Style.round(drop, 20)
	Style.stroke(drop, Color3.fromRGB(190, 160, 255), 3)
	Style.label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.fromOffset(64, 88),
		Text = "🔮",
		TextSize = 44,
		TextWrapped = false,
		ZIndex = 12,
	}, drop)
	Style.label({
		Position = UDim2.fromOffset(78, 10),
		Size = UDim2.new(0.68, -102, 0, 32),
		Text = t("ui.drop"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, drop)
	dropDetail = Style.label({
		Position = UDim2.fromOffset(78, 46),
		Size = UDim2.new(0.68, -102, 0, 30),
		Text = "",
		TextSize = 15,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, drop)
	local dropBuy = Style.button({
		Name = "Buy",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.32, 0, 0, 64),
		Text = "🟡 " .. Style.formatNumber(Config.Drop.price),
		TextSize = 22,
		TextWrapped = false,
		ZIndex = 12,
	}, drop)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(136, 64) }, dropBuy)
	dropBuy.Activated:Connect(function()
		Remotes.BuyDrop:FireServer()
	end)
	scroll = shopScroll -- ここから下は、また種屋の画面

	-- はたけを ひろげる（大きな目標。いちばん上に出す）
	local expand = Style.make("Frame", {
		Name = "ExpandRow",
		LayoutOrder = -20,
		Size = UDim2.new(1, -10, 0, 88),
		BackgroundColor3 = Color3.fromRGB(232, 250, 238),
		ZIndex = 11,
	}, scroll)
	Style.round(expand, 20)
	Style.stroke(expand, Color3.fromRGB(120, 200, 150), 3)
	Style.label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.fromOffset(64, 88),
		Text = "🌱",
		TextSize = 44,
		TextWrapped = false,
		ZIndex = 12,
	}, expand)
	Style.label({
		Position = UDim2.fromOffset(78, 10),
		Size = UDim2.new(0.68, -102, 0, 32),
		Text = t("ui.expand"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, expand)
	expandDetail = Style.label({
		Position = UDim2.fromOffset(78, 46),
		Size = UDim2.new(0.68, -102, 0, 30),
		Text = "",
		TextSize = 15,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, expand)
	expandButton = Style.button({
		Name = "Expand",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.32, 0, 0, 64),
		Text = "",
		TextSize = 22,
		TextWrapped = false,
		ZIndex = 12,
	}, expand)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(136, 64) }, expandButton)
	expandButton.Activated:Connect(function()
		Remotes.ExpandPlot:FireServer()
	end)
end

-- 種屋の行: のこりの数 / うりきれ / こんかいは なし
local function refreshSeedShop(state)
	local shop = state.seedShop
	if not shop then
		return
	end
	for cropId, entry in seedRows do
		local crop = Config.CropById[cropId]
		local left = shop.left[cropId]
		local base = "⏱ " .. t("ui.growTimeText", I18n.duration(crop.growTime)) .. "  💰 " .. Style.formatNumber(crop.sellPrice)
		if left == nil then
			-- この回は入荷していない（行を うすくして、ボタンは押せない）
			entry.info.Text = base
			entry.buy.Text = t("ui.notInStock")
			entry.buy.TextSize = 16
			entry.buy.BackgroundColor3 = C.Dim
			entry.buy.Active = false
			entry.row.BackgroundColor3 = Color3.fromRGB(240, 236, 244)
		elseif left <= 0 then
			entry.info.Text = base .. "  ・ " .. t("ui.soldOut")
			entry.buy.Text = t("ui.soldOut")
			entry.buy.TextSize = 18
			entry.buy.BackgroundColor3 = C.Dim
			entry.buy.Active = false
			entry.row.BackgroundColor3 = Color3.fromRGB(240, 236, 244)
		else
			entry.info.Text = base .. "  ・ " .. t("ui.seedLeft", left)
			entry.buy.Text = "🟡 " .. Style.formatNumber(crop.seedPrice)
			entry.buy.TextSize = 22
			entry.buy.BackgroundColor3 = C.Accent
			entry.buy.Active = true
			entry.row.BackgroundColor3 = Color3.fromRGB(255, 255, 255)
		end
	end
end

-- じょうろの表示（残り・ショップの行）を、サーバーから届いた状態に合わせる
local function refreshWater(state)
	fertDetail.Text = t("ui.fertilizerDesc", state.fertilizer or 0)
	dropDetail.Text = t("ui.dropDesc", state.drops or 0)
	-- はたけを ひろげる
	local tiles = state.plotTiles or Config.PlotTiles
	local nextUpgrade
	for _, upgrade in Config.PlotUpgrades do
		if upgrade.tiles > tiles then
			nextUpgrade = upgrade
			break
		end
	end
	if nextUpgrade then
		expandDetail.Text = t("ui.expandNext", tiles, nextUpgrade.tiles)
		expandButton.Text = "🟡 " .. Style.formatNumber(nextUpgrade.price)
		expandButton.BackgroundColor3 = C.Accent
	else
		expandDetail.Text = t("ui.expandMax", tiles)
		expandButton.Text = "⭐"
		expandButton.BackgroundColor3 = C.Mint
	end
	local water = state.water
	if not water then
		return
	end
	local cans = Config.Water.cans
	local cap = cans[water.level] or cans[1]
	waterLabel.Text = "💧 " .. water.amount .. "/" .. cap
	-- からっぽのときは、色で知らせる（池でくもう）
	waterMeter.BackgroundColor3 = if water.amount <= 0 then Color3.fromRGB(255, 205, 210) else Color3.fromRGB(215, 236, 255)
	local nextCap = cans[water.level + 1]
	if nextCap then
		canDetail.Text = t("ui.canNext", cap, nextCap) .. "\n" .. t("ui.canHint")
		canButton.Text = "🟡 " .. Style.formatNumber(Config.Water.canPrices[water.level + 1])
		canButton.BackgroundColor3 = C.Accent
		canButton.Active = true
	else
		canDetail.Text = t("ui.canTimes", cap) .. "\n" .. t("ui.canHint")
		canButton.Text = t("ui.canMax")
		canButton.BackgroundColor3 = C.Mint
		canButton.Active = false
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
		PaddingRight = UDim.new(0, 90), -- 右上に重ねるルルの体に、セリフがかくれないように
		PaddingTop = UDim.new(0, 14),
		PaddingBottom = UDim.new(0, 14),
	}, banner)
	-- 森の妖精「ルル」がしゃべる吹き出し: 名前・セリフ・ボタン（ルルは右上に重ねて出す）
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 14),
		VerticalAlignment = Enum.VerticalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, banner)
	-- ルル本人は、吹き出しの右上に少し重ねて 手前に出す（Fairy）。この子が話している、と分かるように
	Fairy.attach(gui, banner)
	local column = Style.make("Frame", {
		Name = "Column",
		LayoutOrder = 2,
		Size = UDim2.fromOffset(0, 0),
		AutomaticSize = Enum.AutomaticSize.XY,
		BackgroundTransparency = 1,
		ZIndex = 6,
	}, banner)
	Style.make("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, column)
	Style.label({
		Name = "Speaker",
		LayoutOrder = 1,
		Size = UDim2.fromOffset(0, 0),
		AutomaticSize = Enum.AutomaticSize.XY,
		Text = t("fairy.name"),
		TextSize = 16,
		TextColor3 = Color3.fromRGB(255, 240, 160),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 7,
	}, column)
	bannerLabel = Style.label({
		LayoutOrder = 2,
		Size = UDim2.fromOffset(0, 0),
		-- 長い案内は、画面幅に合わせて折り返す（fitBottomで上限を設定）
		AutomaticSize = Enum.AutomaticSize.XY,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 24,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 7,
	}, column)
	Style.make("UISizeConstraint", { Name = "MaxWidth" }, bannerLabel)
	-- ボタンの列: セリフの幅いっぱいにして、右下にそろえる（「つぎへ」がいちばん右。スキップは その左に控えめに）
	bannerButtons = Style.make("Frame", {
		Name = "Buttons",
		LayoutOrder = 3,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Visible = false,
		ZIndex = 6,
	}, column)
	Style.make("UIPadding", { PaddingTop = UDim.new(0, 8) }, bannerButtons)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = Enum.HorizontalAlignment.Right,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Padding = UDim.new(0, 12),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, bannerButtons)
	-- セリフが短くても、ボタンが窮屈にならない幅にする
	Style.make("UISizeConstraint", { MinSize = Vector2.new(300, 0) }, column)
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
	PalsUI.setEggShopVisible(name == "eggs")
	local wasTools = toolPanel.Visible
	toolPanel.Visible = name == "tools"
	if toolPanel.Visible and not wasTools then
		Style.pop(toolPanel, 0.92)
	end
	CosmeticsUI.setVisible(name == "style")
	DailyUI.setVisible(name == "daily")
	DecorUI.setVisible(name == "decor")
	CropDexUI.setVisible(name == "cropdex")
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
	-- 妖精の吹き出しが出ているときは、その下に出す（重ならないように）
	if banner and banner.Visible then
		local y = banner.AbsolutePosition.Y - gui.AbsolutePosition.Y + banner.AbsoluteSize.Y + 8
		toastLabel.Position = UDim2.new(0.5, 0, 0, y)
	else
		toastLabel.Position = UDim2.new(0.5, 0, 0, toastY)
	end
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
	-- 「@pet.gummybear」のような引数は、その人の言語の名前にしてから入れる
	local args = table.pack(...)
	for i = 1, args.n do
		if type(args[i]) == "string" and string.sub(args[i], 1, 1) == "@" then
			args[i] = t(string.sub(args[i], 2))
		end
	end
	UI.toastText(t(key, table.unpack(args, 1, args.n)))
end

function UI.gui(): ScreenGui
	return gui
end

-- 妖精の吹き出し。buttons = { { text, onPress }, ... } を渡すと、セリフの下にボタンを出す（つぎへ・スキップ）
local bannerKey = nil
function UI.setBanner(text: string?, buttons: { { any } }?)
	if text then
		-- 同じセリフ・同じボタンなら作り直さない（0.4秒ごとに呼ばれるため）
		local key = text .. "|" .. tostring(buttons ~= nil and #buttons or 0)
		local changed = key ~= bannerKey
		bannerKey = key
		bannerLabel.Text = text
		if changed then
			for _, child in bannerButtons:GetChildren() do
				if child:IsA("GuiButton") then
					child:Destroy()
				end
			end
			bannerButtons.Visible = buttons ~= nil and #buttons > 0
			for i, entry in buttons or {} do
				-- 1つめ（つぎへ・わかった）が主役: 右はしに大きく。2つめ（スキップ）は左に小さく
				local primary = i == 1
				local button = Style.button({
					Name = "Choice" .. i,
					LayoutOrder = if primary then 2 else 1,
					Size = if primary then UDim2.fromOffset(150, 48) else UDim2.fromOffset(104, 40),
					Text = entry[1],
					TextSize = if primary then 20 else 16,
					BackgroundColor3 = if primary then C.Yellow else C.Surface,
					ZIndex = 7,
				}, bannerButtons)
				button.Activated:Connect(entry[2])
			end
		end
		if not banner.Visible then
			banner.Visible = true
			Style.pop(banner, 0.9)
		end
	else
		bannerKey = nil
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
	refreshWater(state)
	refreshSeedShop(state)
	refreshSeedBar(state)
	fitBottom() -- 種の数が変わったら、種えらびの大きさを合わせ直す
	UI.refreshMusic()
	PalsUI.update(state)
	CosmeticsUI.update(state)
	DecorUI.update(state)
	CropDexUI.update(state)
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
	DecorUI.build(gui, closeAll)
	CropDexUI.build(gui, closeAll)
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
	buildWaterMeter()

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

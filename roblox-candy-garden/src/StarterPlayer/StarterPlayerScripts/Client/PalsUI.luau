-- ペット画面（たまごの購入・確率表示・所持ペット・連れ歩きの切替）と、孵化の演出。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)
local CatalogViewport = require(script.Parent.CatalogViewport)

local PalsUI = {}

local C = Style.Color
local t = I18n.t

-- レア度の色（カタログと同じ。Style.Rarity）
local RARITY_COLOR = Style.Rarity

local panel, scroll, grid, countLabel, bonusLabel, hatchOverlay
local lastState = nil

local function percentText(n: number): string
	if n == math.floor(n) then
		return ("%d%%"):format(n)
	end
	return ("%.1f%%"):format(n)
end

local function buildEggCard(parent: Instance, egg, order: number)
	local card = Style.make("Frame", {
		Name = "EggCard_" .. egg.id,
		LayoutOrder = order,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 11,
	}, parent)
	Style.round(card, 18)
	Style.stroke(card, if egg.id == "staregg" then Color3.fromRGB(255, 200, 80) else C.Accent, 3)
	Style.make("UIPadding", {
		PaddingTop = UDim.new(0, 12),
		PaddingBottom = UDim.new(0, 12),
		PaddingLeft = UDim.new(0, 12),
		PaddingRight = UDim.new(0, 12),
	}, card)
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, card)

	local top = Style.make("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 64),
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, card)
	Style.setIcon(Style.label({
		Size = UDim2.fromOffset(64, 64),
		Text = egg.icon,
		TextSize = 52,
		ZIndex = 12,
	}, top), "egg_" .. egg.id, egg.icon)
	Style.label({
		Position = UDim2.fromOffset(72, 0),
		Size = UDim2.new(0.62, -84, 1, 0), -- 買うボタンの左の残り幅（狭い画面では文字が小さくなる）
		Text = t("egg." .. egg.id),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, top)
	local buy = Style.button({
		Name = "BuyEgg",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, 0, 0.5, 0),
		Size = UDim2.new(0.38, 0, 0, 64), -- 画面の幅に合わせる（最大150）
		Text = "🟡 " .. Style.formatNumber(egg.price),
		TextSize = 22,
		ZIndex = 12,
	}, top)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(150, 64) }, buy)
	buy.Activated:Connect(function()
		Remotes.BuyEgg:FireServer(egg.id)
	end)

	-- 確率の表示（ランダム要素は、でる確率を必ず見せる）
	Style.label({
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 22),
		Text = t("ui.odds"),
		TextSize = 16,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, card)
	for index, entry in egg.odds do
		local pet = Config.PetById[entry.pet]
		local row = Style.make("Frame", {
			LayoutOrder = 2 + index,
			Size = UDim2.new(1, 0, 0, 30),
			BackgroundTransparency = 1,
			ZIndex = 11,
		}, card)
		Style.setIcon(Style.label({
			Size = UDim2.fromOffset(34, 30),
			Text = pet.icon,
			TextSize = 22,
			ZIndex = 12,
		}, row), "pet_" .. pet.id, pet.icon)
		Style.label({
			Position = UDim2.fromOffset(38, 0),
			Size = UDim2.new(1, -150, 1, 0),
			Text = t("pet." .. pet.id) .. "（" .. t("rarity." .. pet.rarity) .. "）",
			TextSize = 16,
			TextColor3 = C.Text,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 12,
		}, row)
		Style.label({
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, 0, 0, 0),
			Size = UDim2.fromOffset(100, 30),
			Text = percentText(Config.eggOddsPercent(egg, pet.id)),
			TextSize = 18,
			TextXAlignment = Enum.TextXAlignment.Right,
			ZIndex = 12,
		}, row)
	end
end

local eggPanel -- たまごの森のお店の画面
local dexTitle, dexNote, dexGrid

-- 図鑑: 全部のペットを、レア度の順に並べる（見つけていないペットは「？」）
local previousDexKey = nil
local function refreshDex()
	if not dexGrid or not lastState then
		return
	end
	local dexKey=""
	for _,cfg in Config.Pets do dexKey ..= if (lastState.dex or {})[cfg.id] then "1" else "0" end
	if dexKey==previousDexKey then return end
	previousDexKey=dexKey
	for _, child in dexGrid:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local dex = lastState.dex or {}
	local found = 0
	for i, cfg in Config.Pets do
		local have = dex[cfg.id] == true
		if have then
			found += 1
		end
		-- ずかんのカード: 絵（3D）が主役。下に名前と、レア度の色の帯（カタログと同じ見せ方）
		local rarityColor = RARITY_COLOR[cfg.rarity]
		local cell = Style.make("Frame", {
			LayoutOrder = cfg.rarity * 100 + i,
			BackgroundColor3 = if have then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(238, 232, 244),
			ZIndex = 12,
		}, dexGrid)
		Style.round(cell, 16)
		Style.stroke(cell, if have then rarityColor else C.Dim, 3)
		if have then
			-- 上から下へ、レア度の色が うっすら にじむ背景
			Style.make("UIGradient", {
				Rotation = 90,
				Color = ColorSequence.new(Color3.new(1, 1, 1), rarityColor:Lerp(Color3.new(1, 1, 1), 0.75)),
			}, cell)
		end
		local face = Style.label({
			Position = UDim2.fromOffset(6, 6),
			Size = UDim2.new(1, -12, 1, -66),
			Text = "？",
			TextSize = 64,
			TextColor3 = if have then C.Text else C.TextMuted,
			ZIndex = 13,
		}, cell)
		-- まだ会っていないペットは、シルエットと「？？？」（形だけ見せて、何が出るかの楽しみは残す）
		Style.setIcon(face, "pet_" .. cfg.id, cfg.icon, not have)
		Style.label({
			Position = UDim2.new(0, 4, 1, -58),
			Size = UDim2.new(1, -8, 0, 24),
			Text = if have then t("pet." .. cfg.id) else t("ui.unknownPet"),
			TextSize = 16,
			TextColor3 = if have then C.Text else C.TextMuted,
			ZIndex = 13,
		}, cell)
		local band = Style.make("Frame", {
			Position = UDim2.new(0, 8, 1, -31),
			Size = UDim2.new(1, -16, 0, 24),
			-- まだのペットも、レア度の色は うすく見せる（「すごいのが いるかも」のわくわく）
			BackgroundColor3 = if have then rarityColor else rarityColor:Lerp(Color3.fromRGB(200, 194, 210), 0.45),
			ZIndex = 13,
		}, cell)
		Style.round(band, 12)
		Style.label({
			Size = UDim2.fromScale(1, 1),
			Text = t("rarity." .. cfg.rarity),
			TextSize = 13,
			TextColor3 = Color3.new(1, 1, 1),
			ZIndex = 14,
		}, band)
	end
	dexTitle.Text = t("ui.dex", found, #Config.Pets)
	local nextReward = nil
	for _, reward in Config.Dex.rewards do
		if reward.count > found then
			nextReward = reward
			break
		end
	end
	dexNote.Text = if nextReward then t("ui.dexNext", nextReward.count - found) else t("ui.dexDone")
end

local function refresh()
	if not lastState or not grid then
		return
	end
	for _, child in grid:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end

	local pets = lastState.pets or {}
	local equippedSet = {}
	for _, uid in lastState.equipped or {} do
		equippedSet[uid] = true
	end
	countLabel.Text = t("ui.palsCount", #pets, Config.MaxPets)
	refreshDex()
	bonusLabel.Text = t("ui.totalBonus", math.floor(((lastState.sellBonus or 1) - 1) * 100 + 0.5))

	if #pets == 0 then
		Style.label({
			Size = UDim2.new(1, 0, 0, 60),
			Text = t("ui.noPets"),
			TextSize = 18,
			TextColor3 = C.TextMuted,
			ZIndex = 12,
		}, grid)
		return
	end

	for order, entry in pets do
		local cfg = Config.PetById[entry.pet]
		if cfg then
			local on = equippedSet[entry.uid] == true
			local card = Style.button({
				Name = "Pet_" .. entry.uid,
				LayoutOrder = order,
				BackgroundColor3 = on and Color3.fromRGB(255, 233, 244) or Color3.fromRGB(255, 255, 255),
				ZIndex = 12,
			}, grid)
			-- ボタンの太い縁取りを、「連れている=ピンク / レア度の色」に変える
			local border = card:FindFirstChildOfClass("UIStroke")
			border.Color = on and C.Accent or RARITY_COLOR[cfg.rarity]
			border.Thickness = on and 6 or 4
			-- 絵（3D）を大きく。カードの上 6わりは ペットの絵
			Style.setIcon(Style.label({
				Position = UDim2.new(0, 6, 0, 6),
				Size = UDim2.new(1, -12, 1, -76),
				Text = cfg.icon,
				TextSize = 48,
				ZIndex = 13,
			}, card), "pet_" .. cfg.id, cfg.icon)
			Style.label({
				Position = UDim2.new(0, 4, 1, -70),
				Size = UDim2.new(1, -8, 0, 22),
				Text = t("pet." .. cfg.id),
				TextSize = 15,
				ZIndex = 13,
			}, card)
			Style.label({
				Position = UDim2.new(0, 4, 1, -49),
				Size = UDim2.new(1, -8, 0, 16),
				Text = t("ui.petBonus", math.floor(cfg.bonus * 100 + 0.5)),
				TextSize = 12,
				TextColor3 = C.TextMuted,
				ZIndex = 13,
			}, card)
			-- いちばん下の帯: 連れているときは ピンクの「★ いっしょ」、それ以外は レア度の色
			local band = Style.make("Frame", {
				Position = UDim2.new(0, 8, 1, -30),
				Size = UDim2.new(1, -16, 0, 24),
				BackgroundColor3 = on and C.Accent or RARITY_COLOR[cfg.rarity],
				ZIndex = 13,
			}, card)
			Style.round(band, 12)
			Style.label({
				Size = UDim2.fromScale(1, 1),
				Text = on and ("★ " .. t("ui.equipped")) or t("rarity." .. cfg.rarity),
				TextSize = 13,
				TextColor3 = Color3.new(1, 1, 1),
				ZIndex = 14,
			}, band)
			card.Activated:Connect(function()
				Remotes.EquipPet:FireServer(entry.uid)
			end)
		end
	end
end

function PalsUI.build(gui: ScreenGui, onClose: () -> ())
	panel, scroll = Style.modal(gui, "PalsPanel", "🐾 " .. t("ui.pals"), onClose, C.Lilac)
	Style.make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	-- たまご（ふつうの たまご・ほしのたまご）は、たまごの森のお店でだけ買える。ここでは案内だけ
	Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = t("ui.eggsAtForest"),
		TextSize = 18,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = true,
		ZIndex = 12,
	}, scroll)
	local eggScroll
	eggPanel, eggScroll = Style.modal(gui, "EggShopPanel", t("place.eggForest"), onClose, Color3.fromRGB(150, 210, 150))
	Style.make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, eggScroll)
	for i, egg in Config.Eggs do
		buildEggCard(eggScroll, egg, i)
	end
	-- 図鑑とこうかんの入り口
	local tools = Style.make("Frame", {
		LayoutOrder = 5,
		Size = UDim2.new(1, -8, 0, 52),
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, tools)
	local tradeButton = Style.button({
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 1, 0),
		BackgroundColor3 = C.Mint,
		TextColor3 = C.Text,
		Text = t("ui.trade"),
		TextSize = 20,
		ZIndex = 12,
	}, tools)
	tradeButton.Activated:Connect(function()
		if PalsUI.onTrade then
			PalsUI.onTrade()
		end
	end)

	local header = Style.make("Frame", {
		LayoutOrder = 10,
		Size = UDim2.new(1, -8, 0, 52),
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	countLabel = Style.label({
		Size = UDim2.new(0.5, 0, 0, 26),
		Text = "",
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, header)
	bonusLabel = Style.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 0, 0, 0),
		Size = UDim2.new(0.5, 0, 0, 26),
		Text = "",
		TextSize = 16,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Right,
		ZIndex = 12,
	}, header)
	Style.label({
		Position = UDim2.fromOffset(0, 28),
		Size = UDim2.new(1, 0, 0, 22),
		Text = t("ui.tapToEquip", Config.MaxEquipped),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, header)

	grid = Style.make("Frame", {
		Name = "Grid",
		LayoutOrder = 11,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	local gridLayout = Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(120, 150),
		CellPadding = UDim2.fromOffset(14, 14),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)
	-- 横はばいっぱいに 3まい（広い画面は 4まい）。指で押しやすい大きさ（たて 150 以上）にする
	local function fitGrid()
		local width = grid.AbsoluteSize.X
		if width < 10 then
			return
		end
		local columns = if width >= 640 then 4 else 3
		local cellWidth = math.floor((width - (columns - 1) * 14) / columns)
		gridLayout.CellSize = UDim2.fromOffset(cellWidth, math.max(150, math.floor(cellWidth * 1.3)))
	end
	grid:GetPropertyChangedSignal("AbsoluteSize"):Connect(fitGrid)
	fitGrid()

	-- ペット図鑑（見つけた種類。まだのペットは「？」）
	dexTitle = Style.label({
		LayoutOrder = 20,
		Size = UDim2.new(1, -8, 0, 30),
		Text = "",
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	dexNote = Style.label({
		LayoutOrder = 21,
		Size = UDim2.new(1, -8, 0, 20),
		Text = "",
		TextSize = 14,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	dexGrid = Style.make("Frame", {
		Name = "DexGrid",
		LayoutOrder = 22,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	local dexLayout = Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(150, 186),
		CellPadding = UDim2.fromOffset(10, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, dexGrid)
	-- ずかんは ここの目玉なので、カードを大きく。横はばいっぱいに 3まい（広い画面は 4まい）ならべる
	local function fitDex()
		local width = dexGrid.AbsoluteSize.X
		if width < 10 then
			return
		end
		local columns = if width >= 640 then 4 else 3
		local cellWidth = math.floor((width - (columns - 1) * 10) / columns)
		dexLayout.CellSize = UDim2.fromOffset(cellWidth, math.floor(cellWidth * 1.22))
	end
	dexGrid:GetPropertyChangedSignal("AbsoluteSize"):Connect(fitDex)
	fitDex()

	-- 孵化の演出（全画面）。中身は PalsUI.playHatch で、画面の高さに合わせて並べる
	hatchOverlay = Style.make("Frame", {
		Name = "HatchOverlay",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromRGB(74, 43, 92),
		BackgroundTransparency = 0.25,
		Visible = false,
		Active = true,
		ZIndex = 30,
	}, gui)
end

function PalsUI.setVisible(visible: boolean)
	if visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		refresh()
	end
end

function PalsUI.toggle()
	PalsUI.setVisible(not panel.Visible)
end

function PalsUI.isVisible(): boolean
	return panel.Visible
end

-- たまごの森のお店の画面
function PalsUI.setEggShopVisible(visible: boolean)
	if not eggPanel or visible == eggPanel.Visible then
		return
	end
	eggPanel.Visible = visible
	if visible then
		Style.pop(eggPanel, 0.92)
	end
end

function PalsUI.update(state)
	lastState = state
	if panel and panel.Visible then
		refresh()
	end
end

-- たまごが揺れて、ペットが出てくる演出
function PalsUI.playHatch(petId: string, eggId: string?)
	local cfg = Config.PetById[petId]
	if not cfg then
		return
	end
	-- たまごが揺れているあいだに、生まれるペットの色を読みこんでおく
	CatalogViewport.preload({ "pet_" .. cfg.id })
	for _, child in hatchOverlay:GetChildren() do
		child:Destroy()
	end
	hatchOverlay.Visible = true

	-- 画面の高さに合わせて、上から「うまれた！」「たまご→ペット」「名前」「売値」「やったー！」を縦に並べる
	-- （スマホの横画面のように低い画面でも、ボタンが下にはみ出さない）
	local screenY = hatchOverlay.AbsoluteSize.Y
	local iconSize = math.clamp(math.floor(screenY * 0.32), 80, 200)
	local column = Style.make("Frame", {
		Name = "Column",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0.9, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 31,
	}, hatchOverlay)
	Style.make("UIListLayout", {
		Padding = UDim.new(0, 6),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, column)

	local function line(order: number, text: string, height: number, size: number, color: Color3)
		return Style.label({
			LayoutOrder = order,
			Size = UDim2.new(1, 0, 0, height),
			Text = text,
			TextSize = size,
			TextColor3 = color,
			Visible = false,
			ZIndex = 32,
		}, column)
	end
	local white = Color3.fromRGB(255, 255, 255)
	local title = line(1, t("hatch.title"), 40, 32, white)
	local egg = Style.label({
		LayoutOrder = 2,
		Size = UDim2.fromOffset(iconSize, iconSize),
		Text = Config.Eggs[1].icon,
		TextSize = math.floor(iconSize * 0.75),
		TextWrapped = false,
		ZIndex = 32,
	}, column)
	-- 割る前のたまご（買った たまごの絵）
	local shownEgg = (eggId and Config.EggById[eggId]) or Config.Eggs[1]
	Style.setIcon(egg, "egg_" .. shownEgg.id, shownEgg.icon)
	local name = line(3, t("pet." .. cfg.id) .. "（" .. t("rarity." .. cfg.rarity) .. "）", 34, 26,
		RARITY_COLOR[cfg.rarity]:Lerp(Color3.new(1, 1, 1), 0.35))
	local bonus = line(4, t("ui.petBonus", math.floor(cfg.bonus * 100 + 0.5)), 26, 20, white)
	local ok = Style.button({
		LayoutOrder = 5,
		Size = UDim2.fromOffset(220, 60),
		Text = t("hatch.ok"),
		TextSize = 26,
		Visible = false,
		ZIndex = 32,
	}, column)
	ok.Activated:Connect(function()
		hatchOverlay.Visible = false
	end)
	-- 文字とボタンは、たまごが割れるまで場所だけ取っておく（並びがガタつかないように透明にしておく）
	for _, item in { title, name, bonus } do
		item.Visible = true
		item.TextTransparency = 1
		local stroke = item:FindFirstChild("TextStroke")
		if stroke then
			stroke.Transparency = 1
		end
	end

	task.spawn(function()
		for i = 1, 6 do
			local angle = (i % 2 == 0) and 14 or -14
			-- 絵のときは絵を回す（親の Rotation は子の絵に伝わらないため）
			TweenService:Create(egg:FindFirstChild("IconImage") or egg, TweenInfo.new(0.12, Enum.EasingStyle.Sine), { Rotation = angle }):Play()
			task.wait(0.14)
		end
		TweenService:Create(egg:FindFirstChild("IconImage") or egg, TweenInfo.new(0.1), { Rotation = 0 }):Play()
		task.wait(0.15)

		Style.setIcon(egg, "pet_" .. cfg.id, cfg.icon)
		Style.pop(egg, 1.5)
		for _, item in { title, name, bonus } do
			item.TextTransparency = 0
			local stroke = item:FindFirstChild("TextStroke")
			if stroke then
				stroke.Transparency = 0
			end
		end
		ok.Visible = true
		Style.pop(ok, 0.6)
	end)
end

return PalsUI

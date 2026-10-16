-- ペット画面（たまごの購入・確率表示・所持ペット・連れ歩きの切替）と、孵化の演出。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local PalsUI = {}

local C = Style.Color
local t = I18n.t

-- レア度の色。色だけに頼らず、必ずレア度の文字も一緒に出す
local RARITY_COLOR = {
	Color3.fromRGB(190, 180, 205),
	Color3.fromRGB(120, 220, 180),
	Color3.fromRGB(120, 170, 255),
	Color3.fromRGB(190, 130, 255),
	Color3.fromRGB(255, 190, 40),
	Color3.fromRGB(140, 160, 255), -- まもりがみ
	Color3.fromRGB(255, 120, 200), -- ゆめいろ
}

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
	Style.label({
		Size = UDim2.fromOffset(64, 64),
		Text = egg.icon,
		TextSize = 52,
		ZIndex = 12,
	}, top)
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
		Style.label({
			Size = UDim2.fromOffset(34, 30),
			Text = pet.icon,
			TextSize = 22,
			ZIndex = 12,
		}, row)
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

local dexTitle, dexNote, dexGrid

-- 図鑑: 全部のペットを、レア度の順に並べる（見つけていないペットは「？」）
local function refreshDex()
	if not dexGrid or not lastState then
		return
	end
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
		local cell = Style.make("Frame", {
			LayoutOrder = cfg.rarity * 100 + i,
			BackgroundColor3 = if have then Color3.fromRGB(255, 255, 255) else Color3.fromRGB(235, 228, 240),
			ZIndex = 12,
		}, dexGrid)
		Style.round(cell, 14)
		Style.stroke(cell, if have then RARITY_COLOR[cfg.rarity] else C.Dim, 3)
		Style.label({
			Position = UDim2.fromOffset(0, 4),
			Size = UDim2.new(1, 0, 0, 40),
			Text = if have then cfg.icon else "？",
			TextSize = 32,
			TextColor3 = if have then C.Text else C.TextMuted,
			ZIndex = 13,
		}, cell)
		Style.label({
			Position = UDim2.fromOffset(3, 46),
			Size = UDim2.new(1, -6, 0, 22),
			Text = if have then t("pet." .. cfg.id) else t("ui.unknownPet"),
			TextSize = 12,
			ZIndex = 13,
		}, cell)
		Style.label({
			Position = UDim2.fromOffset(0, 68),
			Size = UDim2.new(1, 0, 0, 18),
			Text = t("rarity." .. cfg.rarity),
			TextSize = 12,
			TextColor3 = RARITY_COLOR[cfg.rarity]:Lerp(C.Text, 0.5),
			ZIndex = 13,
		}, cell)
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
			Style.label({
				Position = UDim2.fromOffset(0, 4),
				Size = UDim2.new(1, 0, 0, 40),
				Text = cfg.icon,
				TextSize = 34,
				ZIndex = 13,
			}, card)
			Style.label({
				Position = UDim2.fromOffset(2, 44),
				Size = UDim2.new(1, -4, 0, 18),
				Text = t("pet." .. cfg.id),
				TextSize = 12,
				TextScaled = false,
				ZIndex = 13,
			}, card)
			Style.label({
				Position = UDim2.fromOffset(0, 62),
				Size = UDim2.new(1, 0, 0, 16),
				Text = t("ui.petBonus", math.floor(cfg.bonus * 100 + 0.5)),
				TextSize = 12,
				TextColor3 = C.TextMuted,
				ZIndex = 13,
			}, card)
			Style.label({
				Position = UDim2.fromOffset(0, 80),
				Size = UDim2.new(1, 0, 0, 18),
				Text = on and ("⭐ " .. t("ui.equipped")) or t("rarity." .. cfg.rarity),
				TextSize = 13,
				TextColor3 = on and C.AccentDark or RARITY_COLOR[cfg.rarity]:Lerp(C.Text, 0.55),
				ZIndex = 13,
			}, card)
			card.Activated:Connect(function()
				Remotes.EquipPet:FireServer(entry.uid)
			end)
		end
	end
end

function PalsUI.build(gui: ScreenGui, onClose: () -> ())
	panel, scroll = Style.modal(gui, "PalsPanel", "🐾 " .. t("ui.pals"), onClose, C.Lilac)
	Style.make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	-- たまご（ふつうの たまご・ほしのたまご）
	for i, egg in Config.Eggs do
		buildEggCard(scroll, egg, i)
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
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(112, 108),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)

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
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(84, 92),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, dexGrid)

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

function PalsUI.update(state)
	lastState = state
	if panel and panel.Visible then
		refresh()
	end
end

-- たまごが揺れて、ペットが出てくる演出
function PalsUI.playHatch(petId: string)
	local cfg = Config.PetById[petId]
	if not cfg then
		return
	end
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
			TweenService:Create(egg, TweenInfo.new(0.12, Enum.EasingStyle.Sine), { Rotation = angle }):Play()
			task.wait(0.14)
		end
		TweenService:Create(egg, TweenInfo.new(0.1), { Rotation = 0 }):Play()
		task.wait(0.15)

		egg.Text = cfg.icon
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

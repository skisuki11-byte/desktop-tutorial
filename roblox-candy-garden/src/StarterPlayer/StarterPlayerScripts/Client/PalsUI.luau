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
}

local panel, scroll, grid, countLabel, bonusLabel, hatchOverlay
local lastState = nil

local function percentText(n: number): string
	if n == math.floor(n) then
		return ("%d%%"):format(n)
	end
	return ("%.1f%%"):format(n)
end

local function buildEggCard(parent: Instance)
	local egg = Config.Eggs[1]
	local card = Style.make("Frame", {
		Name = "EggCard",
		LayoutOrder = 1,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 11,
	}, parent)
	Style.round(card, 18)
	Style.stroke(card, C.Accent, 3)
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
		Size = UDim2.new(1, -200, 1, 0),
		Text = t("egg." .. egg.id),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, top)
	local buy = Style.button({
		Name = "BuyEgg",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, 0, 0.5, 0),
		Size = UDim2.fromOffset(120, 56),
		Text = "🪙 " .. Style.formatNumber(egg.price),
		TextSize = 22,
		ZIndex = 12,
	}, top)
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
			Style.stroke(card, on and C.Accent or RARITY_COLOR[cfg.rarity], on and 5 or 3)
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
				Text = on and ("✓ " .. t("ui.equipped")) or t("rarity." .. cfg.rarity),
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

function PalsUI.build(gui: ScreenGui)
	panel = Style.make("Frame", {
		Name = "PalsPanel",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(500, 520),
		BackgroundColor3 = C.Surface,
		Visible = false,
		ZIndex = 10,
	}, gui)
	Style.round(panel, 24)
	Style.stroke(panel, C.Accent, 5)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(500, 520) }, panel)

	Style.label({
		Position = UDim2.fromOffset(20, 12),
		Size = UDim2.new(1, -100, 0, 48),
		Text = "🐾 " .. t("ui.pals"),
		TextSize = 30,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 11,
	}, panel)
	local close = Style.button({
		Name = "Close",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -14, 0, 12),
		Size = UDim2.fromOffset(Style.TapSize, 48),
		BackgroundColor3 = C.Dim,
		TextColor3 = C.Text,
		Text = "✕",
		ZIndex = 11,
	}, panel)
	close.Activated:Connect(function()
		PalsUI.setVisible(false)
	end)

	scroll = Style.make("ScrollingFrame", {
		Name = "Scroll",
		Position = UDim2.fromOffset(14, 68),
		Size = UDim2.new(1, -28, 1, -82),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ZIndex = 11,
	}, panel)
	Style.make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	buildEggCard(scroll)

	local header = Style.make("Frame", {
		LayoutOrder = 2,
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
		LayoutOrder = 3,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(104, 102),
		CellPadding = UDim2.fromOffset(8, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)

	-- 孵化の演出（全画面）
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

	local egg = Style.label({
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.45),
		Size = UDim2.fromOffset(200, 200),
		Text = Config.Eggs[1].icon,
		TextSize = 150,
		TextWrapped = false,
		ZIndex = 31,
	}, hatchOverlay)

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
		Style.label({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.fromScale(0.5, 0.18),
			Size = UDim2.fromOffset(400, 44),
			Text = t("hatch.title"),
			TextSize = 34,
			TextColor3 = Color3.fromRGB(255, 255, 255),
			ZIndex = 31,
		}, hatchOverlay)
		Style.label({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.fromScale(0.5, 0.64),
			Size = UDim2.fromOffset(460, 40),
			Text = t("pet." .. cfg.id) .. "（" .. t("rarity." .. cfg.rarity) .. "）",
			TextSize = 28,
			TextColor3 = RARITY_COLOR[cfg.rarity]:Lerp(Color3.new(1, 1, 1), 0.35),
			ZIndex = 31,
		}, hatchOverlay)
		Style.label({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0.64, 46),
			Size = UDim2.fromOffset(460, 30),
			Text = t("ui.petBonus", math.floor(cfg.bonus * 100 + 0.5)),
			TextSize = 20,
			TextColor3 = Color3.fromRGB(255, 255, 255),
			ZIndex = 31,
		}, hatchOverlay)
		local ok = Style.button({
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0.64, 96),
			Size = UDim2.fromOffset(200, 60),
			Text = t("hatch.ok"),
			TextSize = 26,
			ZIndex = 31,
		}, hatchOverlay)
		Style.pop(ok, 0.6)
		ok.Activated:Connect(function()
			hatchOverlay.Visible = false
		end)
	end)
end

return PalsUI

-- 期間限定ショップ（日替わり）の表示。ショップ画面のいちばん上に「⏰ きょうの とくべつ」として出す。
-- 入れ替わりまでの残り時間と「また そのうち もどってくるよ」を必ず出す（子供を焦らせない）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local LimitedShopUI = {}

local C = Style.Color
local t = I18n.t

local section, cards, leftLabel
local lastState = nil
local renderedKey = ""

local function formatLeft(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d:%02d"):format(seconds // 3600, (seconds % 3600) // 60, seconds % 60)
end

local function entryInfo(entry): (string, string, string?)
	if entry.cosmetic then
		local item = Config.CosmeticById[entry.cosmetic]
		return item.icon, t("cos." .. item.id), "cos_" .. item.id
	end
	local parts = {}
	local icon, key = "", nil
	for cropId, n in entry.seeds do
		local crop = Config.CropById[cropId]
		icon, key = crop.icon, "crop_" .. cropId
		table.insert(parts, t("crop." .. cropId) .. " ×" .. n)
	end
	return icon, table.concat(parts, " "), key
end

local function render(state)
	local limited = state.limited
	for _, child in cards:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	for slot, poolIndex in limited.items do
		local entry = Config.LimitedShop.pool[poolIndex]
		if entry then
			local icon, name, iconKey = entryInfo(entry)
			local bought = limited.bought[tostring(slot)] == true
			local owned = entry.cosmetic ~= nil and state.cosmetics.owned[entry.cosmetic] == true
			local card = Style.make("Frame", {
				Name = "Slot" .. slot,
				LayoutOrder = slot,
				Size = UDim2.new(1 / 3, -7, 1, 0),
				BackgroundColor3 = Color3.fromRGB(255, 255, 255),
				ZIndex = 12,
			}, cards)
			Style.round(card, 18)
			Style.stroke(card, C.Outline, 4)
			Style.setIcon(Style.label({
				Position = UDim2.fromOffset(0, 6),
				Size = UDim2.new(1, 0, 0, 44),
				Text = icon,
				TextSize = 38,
				TextWrapped = false,
				ZIndex = 13,
			}, card), iconKey, icon)
			Style.label({
				Position = UDim2.fromOffset(4, 50),
				Size = UDim2.new(1, -8, 0, 34),
				Text = name,
				TextSize = 14,
				ZIndex = 13,
			}, card)
			-- 種のセットは「○% おとく」を出す
			if entry.regular then
				local badge = Style.make("Frame", {
					AnchorPoint = Vector2.new(1, 0),
					Position = UDim2.new(1, 6, 0, -8),
					Size = UDim2.fromOffset(74, 24),
					BackgroundColor3 = Color3.fromRGB(255, 90, 110),
					ZIndex = 15,
				}, card)
				Style.round(badge, 12)
				Style.label({
					Size = UDim2.fromScale(1, 1),
					Text = t("ui.deal", math.floor((1 - entry.price / entry.regular) * 100 + 0.5)),
					TextSize = 13,
					TextColor3 = Color3.fromRGB(255, 255, 255),
					TextWrapped = false,
					ZIndex = 16,
				}, badge)
			end
			local done = bought or owned
			local buy = Style.button({
				Name = "Buy",
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -8),
				Size = UDim2.new(1, -16, 0, 44),
				BackgroundColor3 = done and C.Mint or C.Accent,
				TextColor3 = done and C.Text or Color3.fromRGB(255, 255, 255),
				Text = done and (owned and not bought and t("ui.have") or t("ui.limitedBought"))
					or ("🟡 " .. Style.formatNumber(entry.price)),
				TextSize = 18,
				TextWrapped = false,
				ZIndex = 13,
			}, card)
			buy.Activated:Connect(function()
				if not done then
					Remotes.BuyLimited:FireServer(slot)
				end
			end)
		end
	end
end

function LimitedShopUI.build(scroll: ScrollingFrame)
	section = Style.make("Frame", {
		Name = "Limited",
		LayoutOrder = -10,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(255, 244, 214),
		ZIndex = 11,
	}, scroll)
	Style.round(section, 20)
	Style.stroke(section, Color3.fromRGB(240, 170, 60), 4)
	Style.make("UIPadding", {
		PaddingTop = UDim.new(0, 10),
		PaddingBottom = UDim.new(0, 12),
		PaddingLeft = UDim.new(0, 12),
		PaddingRight = UDim.new(0, 12),
	}, section)
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, section)

	local head = Style.make("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 28),
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, section)
	Style.label({
		Size = UDim2.new(0.55, 0, 1, 0),
		Text = t("ui.limitedTitle"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 13,
	}, head)
	leftLabel = Style.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.new(0.45, 0, 1, 0),
		Text = "",
		TextSize = 15,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextWrapped = false,
		ZIndex = 13,
	}, head)

	cards = Style.make("Frame", {
		Name = "Cards",
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 150),
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, section)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, cards)

	Style.label({
		LayoutOrder = 3,
		Size = UDim2.new(1, 0, 0, 20),
		Text = "🔄 " .. t("ui.limitedReturn"),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, section)

	-- 残り時間は毎秒更新する。日付が変わったら、状態が届いたときに品ぞろえを作り直す
	task.spawn(function()
		while true do
			if lastState and lastState.limited and section.Visible then
				local left = lastState.limited.endsAt - workspace:GetServerTimeNow()
				leftLabel.Text = t("ui.limitedLeft", formatLeft(left))
			end
			task.wait(1)
		end
	end)
end

function LimitedShopUI.update(state)
	if not state.limited or not cards then
		return
	end
	lastState = state
	-- 品ぞろえ・買った枠・持っているおしゃれ が変わったときだけ作り直す
	local owned = {}
	for _, poolIndex in state.limited.items do
		local entry = Config.LimitedShop.pool[poolIndex]
		if entry and entry.cosmetic and state.cosmetics.owned[entry.cosmetic] then
			table.insert(owned, entry.cosmetic)
		end
	end
	local boughtKeys = {}
	for k in state.limited.bought do
		table.insert(boughtKeys, k)
	end
	table.sort(boughtKeys)
	local key = state.limited.day
		.. "|" .. table.concat(state.limited.items, ",")
		.. "|" .. table.concat(boughtKeys, ",")
		.. "|" .. table.concat(owned, ",")
		.. "|" .. tostring(state.coins >= 0)
	if key ~= renderedKey then
		renderedKey = key
		render(state)
	end
end

return LimitedShopUI

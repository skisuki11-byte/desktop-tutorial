-- 「🏡 にわを かざる」の画面。メニューから開く。
-- 上に にぎやかさのランク（つぎのランクまで あと何点か）、
-- その下に おにわリフォーム（柵・名札・ゆか・ひみつきち。段を上げていく）、
-- いちばん下に 飾りの一覧（買う／おく／しまう）。置く場所は空いている所に自動で入る
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local DecorUI = {}

local C = Style.Color
local t = I18n.t

local RANK_ICONS = Config.DecorRank.icons

local panel, scroll, rankLabel, nextRankLabel
local reformRows = {} -- [id] = { now, next, dots, button }
local furnRows = {} -- [id] = { button, status }
local roomHint
local confirming = {} -- [id] = 2回目を待っている時刻（高い買い物）
local rows = {} -- [id] = { button, status }
local lastState = nil

local refreshReform

local function reformLevel(decor, item): number
	return (decor.reform and decor.reform[item.id]) or item.start
end

refreshReform = function(decor)
	for _, item in Config.Reform do
		local row = reformRows[item.id]
		local level = reformLevel(decor, item)
		local nextLevel = item.levels[level + 1]
		row.now.Text = t("ui.reformNow", if level > 0 then t("reform." .. item.id .. "." .. level) else t("ui.reformNone"))
		row.next.Text = if nextLevel
			then t("ui.reformNext", t("reform." .. item.id .. "." .. (level + 1)), item.points)
			else t("ui.reformMax")
		for i, dot in row.dots do
			dot.BackgroundColor3 = if i <= level then C.Accent else C.Dim
		end
		if not nextLevel then
			row.button.Text = t("ui.reformTop")
			row.button.BackgroundColor3 = C.Yellow
			row.button.TextColor3 = C.Text
		elseif confirming[item.id] then
			row.button.Text = t("ui.reformSure")
			row.button.BackgroundColor3 = C.AccentDark
			row.button.TextColor3 = Color3.fromRGB(255, 255, 255)
		else
			local enough = (lastState.coins or 0) >= nextLevel.price
			row.button.Text = "🟡 " .. Style.formatNumber(nextLevel.price)
			row.button.BackgroundColor3 = if enough then C.Accent else C.Dim
			row.button.TextColor3 = if enough then Color3.fromRGB(255, 255, 255) else C.TextMuted
		end
	end
end

local function buildReformRow(item, order: number)
	local row = Style.make("Frame", {
		Name = "Reform_" .. item.id,
		LayoutOrder = order,
		Size = UDim2.new(1, -10, 0, 96),
		BackgroundColor3 = Color3.fromRGB(255, 252, 240),
		ZIndex = 11,
	}, scroll)
	Style.round(row, 18)
	Style.stroke(row, Color3.fromRGB(245, 215, 160), 3)
	Style.label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.fromOffset(56, 96),
		Text = item.icon,
		TextSize = 38,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	Style.label({
		Position = UDim2.fromOffset(68, 6),
		Size = UDim2.new(0.62, -80, 0, 26),
		Text = t("reform." .. item.id),
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	-- 段の ●●○○（どこまで進んだか ひと目で）
	local dots = {}
	for i = 1, #item.levels do
		local dot = Style.make("Frame", {
			Position = UDim2.new(0.62, -12 - (#item.levels - i + 1) * 15, 0, 13),
			Size = UDim2.fromOffset(11, 11),
			BackgroundColor3 = C.Dim,
			ZIndex = 12,
		}, row)
		Style.round(dot, 6)
		dots[i] = dot
	end
	local now = Style.label({
		Position = UDim2.fromOffset(68, 34),
		Size = UDim2.new(0.62, -80, 0, 24),
		Text = "",
		TextSize = 14,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, row)
	local nextText = Style.label({
		Position = UDim2.fromOffset(68, 60),
		Size = UDim2.new(0.62, -80, 0, 30),
		Text = "",
		TextSize = 13,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, row)
	local button = Style.button({
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.36, 0, 0, 60),
		Text = "",
		TextSize = 19,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(160, 60) }, button)
	button.Activated:Connect(function()
		local decor = lastState and lastState.decor
		if not decor then
			return
		end
		local nextLevel = item.levels[reformLevel(decor, item) + 1]
		if not nextLevel then
			return
		end
		-- 高い買い物は「ほんとに？」で もう1回押してもらう（3秒で もとにもどる）
		if nextLevel.price >= Config.ReformConfirmAt and (lastState.coins or 0) >= nextLevel.price and not confirming[item.id] then
			local token = os.clock()
			confirming[item.id] = token
			refreshReform(decor)
	refreshRoom()
			task.delay(3, function()
				if confirming[item.id] == token then
					confirming[item.id] = nil
					if lastState and lastState.decor then
						refreshReform(lastState.decor)
					end
				end
			end)
			return
		end
		confirming[item.id] = nil
		Remotes.BuyReform:FireServer(item.id)
	end)
	reformRows[item.id] = { now = now, next = nextText, dots = dots, button = button }
end

-- ---- ひみつきちの へや（家具） ----
local function refreshRoom()
	local room = lastState and lastState.room
	if not room then
		return
	end
	local placed, count = {}, 0
	for _, id in room.slots or {} do
		if id ~= "" then
			placed[id] = true
			count += 1
		end
	end
	local capacity = room.capacity or 0
	roomHint.Text = if capacity > 0
		then t("ui.roomCount", count, capacity) .. "  ・ " .. t("ui.roomHint")
		else t("ui.roomNeedBase")
	for id, row in furnRows do
		local item = Config.FurnitureById[id]
		if placed[id] then
			row.button.Text = t("ui.decorTakeOff")
			row.button.BackgroundColor3 = C.Surface
			row.button.TextColor3 = C.Text
			row.status.Text = "✅ " .. t("ui.decorPlaced")
		elseif room.owned and room.owned[id] then
			row.button.Text = t("ui.decorPut")
			row.button.BackgroundColor3 = C.Mint
			row.button.TextColor3 = C.Text
			row.status.Text = ""
		else
			local enough = (lastState.coins or 0) >= item.price
			row.button.Text = "🟡 " .. Style.formatNumber(item.price)
			row.button.BackgroundColor3 = if enough then C.Accent else C.Dim
			row.button.TextColor3 = if enough then Color3.fromRGB(255, 255, 255) else C.TextMuted
			row.status.Text = ""
		end
	end
end

local function buildFurnitureRow(item, order: number)
	local row = Style.make("Frame", {
		Name = "Furn_" .. item.id,
		LayoutOrder = order,
		Size = UDim2.new(1, -10, 0, 80),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 11,
	}, scroll)
	Style.round(row, 18)
	Style.stroke(row, C.Dim, 3)
	Style.setIcon(Style.label({
		Position = UDim2.fromOffset(8, 0),
		Size = UDim2.fromOffset(64, 80),
		Text = item.icon,
		TextSize = 40,
		TextWrapped = false,
		ZIndex = 12,
	}, row), "furn_" .. item.id, item.icon)
	Style.label({
		Position = UDim2.fromOffset(76, 12),
		Size = UDim2.new(0.64, -96, 0, 30),
		Text = t("furn." .. item.id),
		TextSize = 19,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	local status = Style.label({
		Position = UDim2.fromOffset(76, 44),
		Size = UDim2.new(0.64, -96, 0, 24),
		Text = "",
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, row)
	local button = Style.button({
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.34, 0, 0, 58),
		Text = "",
		TextSize = 20,
		TextWrapped = false,
		ZIndex = 12,
	}, row)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(140, 58) }, button)
	button.Activated:Connect(function()
		local room = lastState and lastState.room
		if not room then
			return
		end
		local placed = false
		for _, id in room.slots or {} do
			if id == item.id then
				placed = true
			end
		end
		if placed then
			Remotes.RemoveFurniture:FireServer(item.id)
		elseif room.owned and room.owned[item.id] then
			Remotes.PlaceFurniture:FireServer(item.id)
		else
			Remotes.BuyFurniture:FireServer(item.id)
		end
	end)
	furnRows[item.id] = { button = button, status = status }
end

local function refresh()
	if not panel or not lastState or not lastState.decor then
		return
	end
	local decor = lastState.decor
	rankLabel.Text = t("ui.decorRank", RANK_ICONS[decor.rank] or "🌱", decor.points or 0)
	local nextNeed = Config.DecorRank.thresholds[(decor.rank or 1) + 1]
	nextRankLabel.Text = if nextNeed
		then t("ui.decorNextRank", RANK_ICONS[decor.rank + 1], nextNeed - (decor.points or 0))
		else t("ui.decorTopRank")
	refreshReform(decor)
	refreshRoom()
	local placed = {}
	for _, id in decor.slots or {} do
		if id ~= "" then
			placed[id] = true
		end
	end
	for id, row in rows do
		local item = Config.DecorById[id]
		if placed[id] then
			row.button.Text = t("ui.decorTakeOff")
			row.button.BackgroundColor3 = C.Surface
			row.button.TextColor3 = C.Text
			row.status.Text = "✅ " .. t("ui.decorPlaced") .. "  " .. t("ui.decorPoints", item.points)
		elseif decor.owned and decor.owned[id] then
			row.button.Text = t("ui.decorPut")
			row.button.BackgroundColor3 = C.Mint
			row.button.TextColor3 = C.Text
			row.status.Text = t("ui.decorPoints", item.points)
		else
			row.button.Text = "🟡 " .. Style.formatNumber(item.price)
			row.button.BackgroundColor3 = C.Accent
			row.button.TextColor3 = Color3.fromRGB(255, 255, 255)
			row.status.Text = t("ui.decorPoints", item.points)
		end
	end
end

function DecorUI.build(gui: ScreenGui, onClose: () -> ())
	panel, scroll = Style.modal(gui, "DecorPanel", t("ui.decorTitle"), onClose, Color3.fromRGB(150, 210, 160))
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)
	rankLabel = Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, -10, 0, 34),
		Text = "",
		TextSize = 24,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	nextRankLabel = Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, -10, 0, 22),
		Text = "",
		TextSize = 15,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	-- おにわリフォーム
	Style.label({
		LayoutOrder = 2,
		Size = UDim2.new(1, -10, 0, 30),
		Text = t("ui.reformTitle"),
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	Style.label({
		LayoutOrder = 3,
		Size = UDim2.new(1, -10, 0, 20),
		Text = t("ui.reformHint"),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	for order, item in Config.Reform do
		buildReformRow(item, 3 + order)
	end
	-- ひみつきちの へや（家具）
	Style.label({
		LayoutOrder = 100,
		Size = UDim2.new(1, -10, 0, 30),
		Text = t("ui.roomTitle"),
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	roomHint = Style.label({
		LayoutOrder = 101,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = "",
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	for order, item in Config.Furniture do
		buildFurnitureRow(item, 110 + order)
	end
	-- かざり
	Style.label({
		LayoutOrder = 200,
		Size = UDim2.new(1, -10, 0, 30),
		Text = t("ui.decorItemsTitle"),
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	Style.label({
		LayoutOrder = 201,
		Size = UDim2.new(1, -10, 0, 22),
		Text = t("ui.decorHint"),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	for order, item in Config.Decor do
		local row = Style.make("Frame", {
			Name = item.id,
			LayoutOrder = 210 + order,
			Size = UDim2.new(1, -10, 0, 80),
			BackgroundColor3 = Color3.fromRGB(255, 255, 255),
			ZIndex = 11,
		}, scroll)
		Style.round(row, 18)
		Style.stroke(row, C.Dim, 3)
		Style.setIcon(Style.label({
			Position = UDim2.fromOffset(8, 0),
			Size = UDim2.fromOffset(60, 80),
			Text = item.icon,
			TextSize = 40,
			TextWrapped = false,
			ZIndex = 12,
		}, row), "decor_" .. item.id, item.icon)
		Style.label({
			Position = UDim2.fromOffset(72, 10),
			Size = UDim2.new(0.66, -96, 0, 30),
			Text = t("decor." .. item.id),
			TextSize = 20,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		local status = Style.label({
			Position = UDim2.fromOffset(72, 44),
			Size = UDim2.new(0.66, -96, 0, 24),
			Text = "",
			TextSize = 14,
			TextColor3 = C.TextMuted,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 12,
		}, row)
		local button = Style.button({
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -10, 0.5, 0),
			Size = UDim2.new(0.34, 0, 0, 58),
			Text = "",
			TextSize = 20,
			TextWrapped = false,
			ZIndex = 12,
		}, row)
		Style.make("UISizeConstraint", { MaxSize = Vector2.new(140, 58) }, button)
		button.Activated:Connect(function()
			local decor = lastState and lastState.decor
			if not decor then
				return
			end
			local placed = false
			for _, id in decor.slots or {} do
				if id == item.id then
					placed = true
				end
			end
			if placed then
				Remotes.RemoveDecor:FireServer(item.id)
			elseif decor.owned and decor.owned[item.id] then
				Remotes.PlaceDecor:FireServer(item.id)
			else
				Remotes.BuyDecor:FireServer(item.id)
			end
		end)
		rows[item.id] = { button = button, status = status }
	end
end

function DecorUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		refresh()
	end
end

function DecorUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function DecorUI.update(state)
	lastState = state
	if panel and panel.Visible then
		refresh()
	end
end

return DecorUI

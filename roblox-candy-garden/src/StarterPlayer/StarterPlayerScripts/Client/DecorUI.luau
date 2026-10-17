-- 「🏡 にわを かざる」の画面。メニューから開く。
-- 上に にぎやかさのランク、その下に 飾りの一覧（買う／おく／しまう）。置く場所は空いている所に自動で入る
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local DecorUI = {}

local C = Style.Color
local t = I18n.t

local RANK_ICONS = { "🌱", "🌸", "🌟", "👑" }

local panel, scroll, rankLabel
local rows = {} -- [id] = { button, status }
local lastState = nil

local function refresh()
	if not panel or not lastState or not lastState.decor then
		return
	end
	local decor = lastState.decor
	rankLabel.Text = t("ui.decorRank", RANK_ICONS[decor.rank] or "🌱", decor.points or 0)
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
	Style.label({
		LayoutOrder = 1,
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
			LayoutOrder = 10 + order,
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
	refresh()
end

return DecorUI

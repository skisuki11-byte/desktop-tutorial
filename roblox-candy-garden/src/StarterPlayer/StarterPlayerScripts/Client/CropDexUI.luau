-- 「📖 さくもつずかん」の画面。メニューから開く。
-- 作物（たて）× 姿（よこ: ふつう・きらきら・ジャンボ・きんいろ・にじいろ）の表。
-- 見つけた姿は作物の絵、まだの姿は「？」。どの天気で何が出やすいかも書いておく（次に何をすればいいか分かるように）
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)

local CropDexUI = {}

local C = Style.Color
local t = I18n.t

local NAME_WIDTH = 0.27 -- 左の作物の名前の列（横幅の割合）
local CELL_STEP = (1 - NAME_WIDTH) / #Config.VariantOrder

local VARIANT_ICON = { normal = "🌱" }
for _, v in Config.Variants do
	VARIANT_ICON[v.id] = v.icon
end
-- 見つけた姿のマスの色（ふつう=白、ふしぎな姿=その姿らしい色）
local VARIANT_COLOR = {
	normal = Color3.fromRGB(255, 255, 255),
	sparkle = Color3.fromRGB(232, 244, 255),
	jumbo = Color3.fromRGB(255, 226, 240),
	golden = Color3.fromRGB(255, 238, 170),
	rainbow = Color3.fromRGB(232, 222, 255),
}

local panel, scroll, countLabel, noteLabel
local cells = {} -- [cropId] = { [variant] = { frame, icon } }
local lastState = nil

local function total(): number
	return #Config.Crops * #Config.VariantOrder
end

local function refresh()
	if not panel or not lastState then
		return
	end
	local dex = lastState.cropDex or {}
	local found = 0
	for cropId, row in cells do
		local crop = Config.CropById[cropId]
		for variant, cell in row do
			local have = dex[cropId] ~= nil and dex[cropId][variant] == true
			if have then
				found += 1
			end
			cell.frame.BackgroundColor3 = if have then VARIANT_COLOR[variant] else Color3.fromRGB(235, 228, 240)
			cell.icon.Text = if have then crop.icon else "？"
			cell.icon.TextColor3 = if have then C.Text else C.TextMuted
		end
	end
	countLabel.Text = t("ui.cropDexCount", found, total())
	local nextReward = nil
	for _, reward in Config.CropDex.rewards do
		if reward.count > found then
			nextReward = reward
			break
		end
	end
	noteLabel.Text = if nextReward then t("ui.dexNext", nextReward.count - found) else t("ui.dexDone")
end

function CropDexUI.build(gui: ScreenGui, onClose: () -> ())
	panel, scroll = Style.modal(gui, "CropDexPanel", t("ui.cropDexTitle"), onClose, Color3.fromRGB(255, 196, 120))
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)
	countLabel = Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, -10, 0, 32),
		Text = "",
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	noteLabel = Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, -10, 0, 20),
		Text = "",
		TextSize = 14,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	Style.label({
		LayoutOrder = 2,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = t("ui.cropDexHint") .. "\n" .. t("ui.cropDexOdds"),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = true,
		ZIndex = 12,
	}, scroll)

	-- 見出し: 姿のマークと名前
	local head = Style.make("Frame", {
		LayoutOrder = 3,
		Size = UDim2.new(1, -10, 0, 40),
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	for i, variant in Config.VariantOrder do
		Style.label({
			Position = UDim2.new(NAME_WIDTH + (i - 1) * CELL_STEP, 0, 0, 0),
			Size = UDim2.new(CELL_STEP, -4, 1, 0),
			Text = VARIANT_ICON[variant] .. "\n" .. t("variant." .. variant),
			TextSize = 12,
			TextWrapped = true,
			ZIndex = 12,
		}, head)
	end

	-- 作物ごとの行
	for order, crop in Config.Crops do
		local row = Style.make("Frame", {
			Name = crop.id,
			LayoutOrder = 10 + order,
			Size = UDim2.new(1, -10, 0, 58),
			BackgroundTransparency = 1,
			ZIndex = 11,
		}, scroll)
		Style.label({
			Size = UDim2.new(NAME_WIDTH, -4, 1, 0),
			Text = crop.icon .. " " .. t("crop." .. crop.id),
			TextSize = 14,
			TextWrapped = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 12,
		}, row)
		cells[crop.id] = {}
		for i, variant in Config.VariantOrder do
			local frame = Style.make("Frame", {
				Position = UDim2.new(NAME_WIDTH + (i - 1) * CELL_STEP, 0, 0, 2),
				Size = UDim2.new(CELL_STEP, -6, 1, -4),
				BackgroundColor3 = Color3.fromRGB(235, 228, 240),
				ZIndex = 12,
			}, row)
			Style.round(frame, 12)
			Style.stroke(frame, C.Dim, 2)
			local icon = Style.label({
				Size = UDim2.fromScale(1, 1),
				Text = "？",
				TextSize = 26,
				TextWrapped = false,
				ZIndex = 13,
			}, frame)
			-- ふしぎな姿は、右下に小さく姿のマーク
			if variant ~= "normal" then
				Style.label({
					AnchorPoint = Vector2.new(1, 1),
					Position = UDim2.new(1, -2, 1, -1),
					Size = UDim2.fromOffset(18, 18),
					Text = VARIANT_ICON[variant],
					TextSize = 13,
					TextWrapped = false,
					ZIndex = 14,
				}, frame)
			end
			cells[crop.id][variant] = { frame = frame, icon = icon }
		end
	end
end

function CropDexUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		refresh()
	end
end

function CropDexUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function CropDexUI.update(state)
	lastState = state
	refresh()
end

return CropDexUI

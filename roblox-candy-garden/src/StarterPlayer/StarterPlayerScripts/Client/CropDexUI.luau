-- 「📖 さくもつずかん」の画面。メニューから開く。
-- 作物ごとに 1まいのカード: 左に作物の絵（3D）、右に 5つの「すがた」のスタンプ（ふつう・きらきら・ジャンボ・きんいろ・にじいろ）。
-- 見つけたすがたはスタンプに色がつき、まだのすがたは「？」。表（たて×よこ）より「この作物は あと何こ」がひと目で分かる。
-- 上には「すがたの みつけかた」を出して、次に何をすればいいか（どの天気を待つか・水やり・ひりょう）が分かるようにする
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)

local CropDexUI = {}

local C = Style.Color
local t = I18n.t

local VARIANT_ICON = { normal = "🌱" }
for _, v in Config.Variants do
	VARIANT_ICON[v.id] = v.icon
end
-- 見つけたすがたのスタンプの色（その姿らしい色）
local VARIANT_COLOR = {
	normal = Color3.fromRGB(150, 220, 170),
	sparkle = Color3.fromRGB(150, 200, 255),
	jumbo = Color3.fromRGB(255, 150, 200),
	golden = Color3.fromRGB(245, 200, 80),
	rainbow = Color3.fromRGB(190, 160, 255),
}
local EMPTY = Color3.fromRGB(236, 230, 242)

local panel, scroll, countLabel, noteLabel, barFill
local cards = {} -- [cropId] = { picture, name, count, stamps = { [variant] = { frame, mark, stroke } } }
local lastState = nil

local function total(): number
	return #Config.Crops * #Config.VariantOrder
end

local function refresh()
	if not panel or not lastState or not panel.Visible then
		return
	end
	local dex = lastState.cropDex or {}
	local found = 0
	for cropId, card in cards do
		local crop = Config.CropById[cropId]
		local got = dex[cropId] or {}
		local count = 0
		for variant, stamp in card.stamps do
			local have = got[variant] == true
			if have then
				count += 1
			end
			stamp.frame.BackgroundColor3 = if have then VARIANT_COLOR[variant] else EMPTY
			stamp.stroke.Color = if have then VARIANT_COLOR[variant]:Lerp(C.Text, 0.25) else C.Dim
			stamp.mark.Text = if have then VARIANT_ICON[variant] else "？"
			stamp.mark.TextColor3 = if have then C.Text else C.TextMuted
		end
		found += count
		-- まだ1つも育てていない作物は、絵をシルエットに
		Style.setIcon(card.picture, "crop_" .. cropId, crop.icon, count == 0)
		card.count.Text = string.format("%d / %d", count, #Config.VariantOrder)
		card.count.TextColor3 = if count == #Config.VariantOrder then C.AccentDark else C.TextMuted
	end
	countLabel.Text = t("ui.cropDexCount", found, total())
	barFill.Size = UDim2.fromScale(math.clamp(found / total(), 0, 1), 1)
	local nextReward = nil
	for _, reward in Config.CropDex.rewards do
		if reward.count > found then
			nextReward = reward
			break
		end
	end
	noteLabel.Text = if nextReward then t("ui.dexNext", nextReward.count - found) else t("ui.dexDone")
end

-- 「すがたの みつけかた」: 5つのすがたを、スタンプと同じ色・マークで説明する
local function buildGuide(order: number)
	local box = Style.make("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(255, 250, 238),
		ZIndex = 11,
	}, scroll)
	Style.round(box, 14)
	Style.stroke(box, Color3.fromRGB(245, 215, 160), 2)
	Style.make("UIPadding", {
		PaddingTop = UDim.new(0, 8),
		PaddingBottom = UDim.new(0, 8),
		PaddingLeft = UDim.new(0, 10),
		PaddingRight = UDim.new(0, 10),
	}, box)
	Style.make("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, box)
	Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, 24),
		Text = t("ui.cropDexHowTitle"),
		TextSize = 17,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, box)
	for i, variant in Config.VariantOrder do
		local line = Style.make("Frame", {
			LayoutOrder = i,
			Size = UDim2.new(1, 0, 0, 28),
			BackgroundTransparency = 1,
			ZIndex = 12,
		}, box)
		local chip = Style.make("Frame", {
			Size = UDim2.fromOffset(104, 26),
			BackgroundColor3 = VARIANT_COLOR[variant],
			ZIndex = 12,
		}, line)
		Style.round(chip, 13)
		Style.label({
			Size = UDim2.fromScale(1, 1),
			Text = VARIANT_ICON[variant] .. " " .. t("variant." .. variant),
			TextSize = 14,
			ZIndex = 13,
		}, chip)
		Style.label({
			Position = UDim2.fromOffset(112, 0),
			Size = UDim2.new(1, -112, 1, 0),
			Text = t("ui.cropDexHow." .. variant),
			TextSize = 14,
			TextColor3 = C.TextMuted,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 12,
		}, line)
	end
end

-- 作物 1しゅるいの カード
local function buildCard(crop, order: number)
	local card = Style.make("Frame", {
		Name = crop.id,
		LayoutOrder = 10 + order,
		Size = UDim2.new(1, -10, 0, 128),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 11,
	}, scroll)
	Style.round(card, 16)
	Style.stroke(card, C.Dim, 2)
	-- 左: 作物の絵（3D）
	local picture = Style.label({
		Position = UDim2.fromOffset(8, 8),
		Size = UDim2.fromOffset(104, 112),
		Text = crop.icon,
		TextSize = 52,
		ZIndex = 12,
	}, card)
	-- 右上: 名前と「あつめた数」
	Style.label({
		Position = UDim2.fromOffset(120, 8),
		Size = UDim2.new(1, -186, 0, 28),
		Text = t("crop." .. crop.id),
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, card)
	local count = Style.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 8),
		Size = UDim2.fromOffset(60, 28),
		Text = "",
		TextSize = 17,
		TextXAlignment = Enum.TextXAlignment.Right,
		ZIndex = 12,
	}, card)
	-- 右下: 5つのすがたのスタンプ（指で押しやすい大きさ。押して何かが起きるわけではなく、見るためのもの）
	local row = Style.make("Frame", {
		Position = UDim2.fromOffset(120, 42),
		Size = UDim2.new(1, -128, 1, -50),
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, card)
	local stamps = {}
	local n = #Config.VariantOrder
	for i, variant in Config.VariantOrder do
		local cell = Style.make("Frame", {
			Position = UDim2.new((i - 1) / n, 2, 0, 0),
			Size = UDim2.new(1 / n, -4, 1, 0),
			BackgroundTransparency = 1,
			ZIndex = 12,
		}, row)
		local frame = Style.make("Frame", {
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.fromScale(0.5, 0),
			Size = UDim2.new(1, 0, 1, -20),
			BackgroundColor3 = EMPTY,
			ZIndex = 12,
		}, cell)
		Style.make("UIAspectRatioConstraint", { AspectRatio = 1, DominantAxis = Enum.DominantAxis.Width }, frame)
		Style.round(frame, 100)
		local stroke = Style.stroke(frame, C.Dim, 2)
		local mark = Style.label({
			Size = UDim2.fromScale(1, 1),
			Text = "？",
			TextSize = 22,
			TextWrapped = false,
			ZIndex = 13,
		}, frame)
		Style.label({
			AnchorPoint = Vector2.new(0, 1),
			Position = UDim2.fromScale(0, 1),
			Size = UDim2.new(1, 0, 0, 18),
			Text = t("variant." .. variant),
			TextSize = 12,
			TextColor3 = C.TextMuted,
			ZIndex = 12,
		}, cell)
		stamps[variant] = { frame = frame, mark = mark, stroke = stroke }
	end
	cards[crop.id] = { picture = picture, count = count, stamps = stamps }
end

function CropDexUI.build(gui: ScreenGui, onClose: () -> ())
	panel, scroll = Style.modal(gui, "CropDexPanel", t("ui.cropDexTitle"), onClose, Color3.fromRGB(255, 196, 120))
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)
	-- いちばん上: あつめた数と、ごほうびまでの バー
	countLabel = Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, -10, 0, 30),
		Text = "",
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	local bar = Style.make("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, -10, 0, 12),
		BackgroundColor3 = EMPTY,
		ZIndex = 12,
	}, scroll)
	Style.round(bar, 6)
	barFill = Style.make("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = Color3.fromRGB(255, 176, 80),
		ZIndex = 13,
	}, bar)
	Style.round(barFill, 6)
	noteLabel = Style.label({
		LayoutOrder = 2,
		Size = UDim2.new(1, -10, 0, 20),
		Text = "",
		TextSize = 15,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	buildGuide(3)
	for order, crop in Config.Crops do
		buildCard(crop, order)
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

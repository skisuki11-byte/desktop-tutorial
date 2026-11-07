-- 「🤝 なかよし」の画面。メニューから開く。
-- 上: やくそくの花（いま どうなっているか・次に何をすればいいか）
-- まんなか: 友だちを さそうボタン（Robloxの さそう画面を出す）
-- 下: 友だちごとの なかよしレベル（ハート5つ・つぎのレベルまでのバー・きょう たまった分）
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SocialService = game:GetService("SocialService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)

local FriendsUI = {}

local C = Style.Color
local t = I18n.t
local HEART_ON = Color3.fromRGB(255, 111, 168)
local HEART_OFF = Color3.fromRGB(225, 215, 232)

local panel, scroll, promiseIcon, promiseText, list
local lastState = nil

local function promiseView(promise): (string, string)
	if not promise then
		return "🌱", t("ui.promiseNone", Config.Promise.togetherMinutes)
	end
	local name = promise.partnerName or ""
	if promise.bloomed then
		return "🌸", t("ui.promiseBloom", name)
	elseif promise.watered then
		return "🌿", t("ui.promiseWaiting", name)
	elseif promise.canWater then
		return "💧", t("ui.promiseWater", name)
	end
	return "🌱", t("ui.promiseWait", name)
end

local function friendRow(entry, order: number)
	local levels = Config.Friendship.levels
	local row = Style.make("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(1, -10, 0, 84),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 12,
	}, list)
	Style.round(row, 16)
	Style.stroke(row, C.Dim, 2)
	Style.label({
		Position = UDim2.fromOffset(14, 8),
		Size = UDim2.new(1, -150, 0, 26),
		Text = entry.name or "?",
		TextSize = 19,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 13,
	}, row)
	-- ハート5つ（レベルの数だけ ピンク）
	local hearts = Style.make("Frame", {
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 8),
		Size = UDim2.fromOffset(130, 26),
		BackgroundTransparency = 1,
		ZIndex = 13,
	}, row)
	for i = 1, #levels do
		Style.label({
			Position = UDim2.fromOffset((i - 1) * 26, 0),
			Size = UDim2.fromOffset(26, 26),
			Text = "♥",
			TextSize = 24,
			TextColor3 = if i <= entry.lv then HEART_ON else HEART_OFF,
			ZIndex = 13,
		}, hearts)
	end
	-- つぎのレベルまでの バー
	local nextNeed = levels[entry.lv + 1]
	local prevNeed = levels[entry.lv] or 0
	local ratio = if nextNeed then math.clamp((entry.pts - prevNeed) / (nextNeed - prevNeed), 0, 1) else 1
	local bar = Style.make("Frame", {
		Position = UDim2.fromOffset(14, 42),
		Size = UDim2.new(1, -28, 0, 12),
		BackgroundColor3 = HEART_OFF,
		ZIndex = 13,
	}, row)
	Style.round(bar, 6)
	local fill = Style.make("Frame", {
		Size = UDim2.fromScale(ratio, 1),
		BackgroundColor3 = HEART_ON,
		ZIndex = 14,
	}, bar)
	Style.round(fill, 6)
	Style.label({
		Position = UDim2.fromOffset(14, 58),
		Size = UDim2.new(0.6, -14, 0, 20),
		Text = t("ui.friendLevel", entry.lv) .. "  " .. (if nextNeed then t("ui.friendNext", nextNeed - entry.pts) else t("ui.friendMax")),
		TextSize = 13,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 13,
	}, row)
	if (entry.today or 0) > 0 then
		Style.label({
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, -14, 0, 58),
			Size = UDim2.new(0.4, -14, 0, 20),
			Text = t("ui.friendToday", entry.today),
			TextSize = 13,
			TextColor3 = C.AccentDark,
			TextXAlignment = Enum.TextXAlignment.Right,
			ZIndex = 13,
		}, row)
	end
end

local function refresh()
	if not panel or not lastState or not panel.Visible then
		return
	end
	local icon, text = promiseView(lastState.promise)
	promiseIcon.Text = icon
	promiseText.Text = text
	for _, child in list:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local friends = lastState.friends or {}
	if #friends == 0 then
		Style.label({
			Size = UDim2.new(1, -10, 0, 50),
			Text = t("ui.friendsNone"),
			TextSize = 15,
			TextColor3 = C.TextMuted,
			ZIndex = 12,
		}, list)
	end
	for i, entry in friends do
		friendRow(entry, i)
	end
end

local function invite()
	local player = Players.LocalPlayer
	local ok, can = pcall(function()
		return SocialService:CanSendGameInviteAsync(player)
	end)
	if ok and can then
		pcall(function()
			SocialService:PromptGameInvite(player)
		end)
	end
end

function FriendsUI.build(gui: ScreenGui, onClose: () -> ())
	panel, scroll = Style.modal(gui, "FriendsPanel", t("ui.friendsTitle"), onClose, Color3.fromRGB(255, 170, 200))
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)
	-- やくそくの花
	local card = Style.make("Frame", {
		LayoutOrder = 1,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromRGB(255, 240, 246),
		ZIndex = 11,
	}, scroll)
	Style.round(card, 16)
	Style.stroke(card, Color3.fromRGB(255, 190, 215), 2)
	Style.make("UIPadding", {
		PaddingTop = UDim.new(0, 10),
		PaddingBottom = UDim.new(0, 12),
		PaddingLeft = UDim.new(0, 12),
		PaddingRight = UDim.new(0, 12),
	}, card)
	Style.label({
		Size = UDim2.new(1, 0, 0, 26),
		Text = t("ui.promiseTitle"),
		TextSize = 18,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, card)
	promiseIcon = Style.label({
		Position = UDim2.fromOffset(0, 32),
		Size = UDim2.fromOffset(56, 56),
		Text = "🌱",
		TextSize = 40,
		TextWrapped = false,
		ZIndex = 12,
	}, card)
	promiseText = Style.label({
		Position = UDim2.fromOffset(64, 32),
		Size = UDim2.new(1, -64, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = "",
		TextSize = 15,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, card)
	Style.make("UISizeConstraint", { MinSize = Vector2.new(0, 56) }, promiseText)
	-- 友だちを さそう
	local inviteButton = Style.button({
		LayoutOrder = 2,
		Size = UDim2.new(1, -10, 0, 52),
		BackgroundColor3 = C.Mint,
		TextColor3 = C.Text,
		Text = t("ui.invite"),
		TextSize = 20,
		ZIndex = 12,
	}, scroll)
	inviteButton.Activated:Connect(invite)
	Style.label({
		LayoutOrder = 3,
		Size = UDim2.new(1, -10, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = t("ui.friendsHint"),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)
	list = Style.make("Frame", {
		LayoutOrder = 4,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 11,
	}, scroll)
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, list)
end

function FriendsUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		refresh()
	end
end

function FriendsUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function FriendsUI.update(state)
	lastState = state
	refresh()
end

return FriendsUI

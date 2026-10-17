-- きょうのおねがい（デイリークエスト）の画面。右の列の「おねがい」ボタンから開く。
-- 3つの小さな目標と進み具合。達成したら「もらう！」。下に「あしたも新しいおねがいが来るよ（あと○時間）」。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local QuestsUI = {}

local C = Style.Color
local t = I18n.t

local HEADER_COLOR = Color3.fromRGB(255, 196, 120)

local panel, list, nextLabel, button, badge
local lastState = nil

local function questText(quest): string
	if quest.kind == "harvestCrop" then
		return t("quest.harvestCrop", t("crop." .. quest.crop), quest.goal)
	end
	return t("quest." .. quest.kind, quest.goal)
end

local function formatLeft(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d:%02d"):format(seconds // 3600, (seconds % 3600) // 60, seconds % 60)
end

local function claimable(state): boolean
	local q = state.quests
	if not q then
		return false
	end
	for slot, poolIndex in q.items do
		local quest = Config.Quests.pool[poolIndex]
		local key = tostring(slot)
		if quest and not q.claimed[key] and (q.progress[key] or 0) >= quest.goal then
			return true
		end
	end
	return false
end

local function render(state)
	for _, child in list:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local q = state.quests
	for slot, poolIndex in q.items do
		local quest = Config.Quests.pool[poolIndex]
		if quest then
			local key = tostring(slot)
			local value = q.progress[key] or 0
			local done = value >= quest.goal
			local claimed = q.claimed[key] == true
			local card = Style.make("Frame", {
				Name = "Quest" .. slot,
				LayoutOrder = slot,
				Size = UDim2.new(1, 0, 0, 96),
				BackgroundColor3 = claimed and C.Mint or (done and Color3.fromRGB(255, 247, 222) or Color3.fromRGB(255, 255, 255)),
				ZIndex = 12,
			}, list)
			Style.round(card, 18)
			Style.stroke(card, done and not claimed and C.Accent or C.Outline, done and not claimed and 6 or 4)
			Style.label({
				Position = UDim2.fromOffset(8, 0),
				Size = UDim2.fromOffset(56, 96),
				Text = quest.icon,
				TextSize = 38,
				TextWrapped = false,
				ZIndex = 13,
			}, card)
			Style.label({
				Position = UDim2.fromOffset(68, 8),
				Size = UDim2.new(1, -210, 0, 28),
				Text = questText(quest),
				TextSize = 18,
				TextXAlignment = Enum.TextXAlignment.Left,
				ZIndex = 13,
			}, card)
			Style.label({
				Position = UDim2.fromOffset(68, 38),
				Size = UDim2.new(1, -210, 0, 20),
				Text = "🟡 " .. Style.formatNumber(quest.reward.coins or 0) .. "   🎫 +" .. (quest.reward.xp or 0) .. " XP",
				TextSize = 14,
				TextColor3 = C.TextMuted,
				TextXAlignment = Enum.TextXAlignment.Left,
				TextWrapped = false,
				ZIndex = 13,
			}, card)
			-- 進み具合のバー
			local track = Style.make("Frame", {
				Position = UDim2.fromOffset(68, 64),
				Size = UDim2.new(1, -210, 0, 16),
				BackgroundColor3 = C.Dim,
				ZIndex = 13,
			}, card)
			Style.round(track, 8)
			local fill = Style.make("Frame", {
				Size = UDim2.fromScale(math.clamp(value / quest.goal, 0, 1), 1),
				BackgroundColor3 = done and C.Accent or HEADER_COLOR,
				ZIndex = 14,
			}, track)
			Style.round(fill, 8)
			Style.label({
				AnchorPoint = Vector2.new(1, 0),
				Position = UDim2.new(1, -140, 0, 60),
				Size = UDim2.fromOffset(70, 24),
				Text = ("%s/%s"):format(Style.formatNumber(value), Style.formatNumber(quest.goal)),
				TextSize = 14,
				TextXAlignment = Enum.TextXAlignment.Right,
				TextWrapped = false,
				ZIndex = 13,
			}, card)
			-- もらうボタン（達成したら押せる）
			local claim = Style.button({
				AnchorPoint = Vector2.new(1, 0.5),
				Position = UDim2.new(1, -10, 0.5, 0),
				Size = UDim2.fromOffset(118, 60),
				BackgroundColor3 = claimed and C.Mint or (done and C.Accent or C.Dim),
				TextColor3 = (done and not claimed) and Color3.fromRGB(255, 255, 255) or C.TextMuted,
				Text = claimed and ("⭐ " .. t("ui.questDone")) or t("ui.questClaim"),
				TextSize = 20,
				TextWrapped = false,
				ZIndex = 13,
			}, card)
			if done and not claimed then
				claim.Activated:Connect(function()
					Remotes.ClaimQuest:FireServer(slot)
				end)
			end
		end
	end
end

function QuestsUI.build(gui: ScreenGui, onClose: () -> (), onOpen: () -> (), side: Frame)
	button = Style.navButton({
		Name = "QuestsButton",
		LayoutOrder = 2,
		Size = UDim2.fromOffset(76, 78),
		BackgroundColor3 = HEADER_COLOR,
		Icon = "📋",
		IconSize = 32,
		Caption = t("ui.questsShort"),
		CaptionSize = 13,
	}, side)
	button.Activated:Connect(function()
		if panel.Visible then
			onClose()
		else
			onOpen()
		end
	end)
	badge = Style.badge(button)

	local scroll
	panel, scroll = Style.modal(gui, "QuestsPanel", "📋 " .. t("ui.quests"), onClose, HEADER_COLOR)
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)
	list = Style.make("Frame", {
		Name = "List",
		LayoutOrder = 1,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, scroll)
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, list)
	-- 「あしたも新しいおねがいが来る」は、スクロールしなくても見えるよう、タイトルのすぐ下に固定する
	nextLabel = Style.label({
		Position = UDim2.fromOffset(22, 78),
		Size = UDim2.new(1, -44, 0, 24),
		Text = "",
		TextSize = 15,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, panel)
	scroll.Position = UDim2.fromOffset(14, 106)
	scroll.Size = UDim2.new(1, -28, 1, -120)

	task.spawn(function()
		while true do
			if lastState and lastState.quests and panel.Visible then
				nextLabel.Text = "🌅 " .. t("ui.questNext", formatLeft(lastState.quests.endsAt - workspace:GetServerTimeNow()))
			end
			task.wait(1)
		end
	end)
end

function QuestsUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		if lastState and lastState.quests then
			render(lastState)
		end
	end
end

function QuestsUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function QuestsUI.update(state)
	if not state.quests or not panel then
		return
	end
	lastState = state
	badge.Visible = claimable(state) -- 受け取れるおねがいがあるときだけ「!」
	if panel.Visible then
		render(state)
	end
end

return QuestsUI

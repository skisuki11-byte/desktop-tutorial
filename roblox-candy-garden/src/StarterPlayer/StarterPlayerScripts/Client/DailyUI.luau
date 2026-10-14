-- デイリーボーナスの画面。右の中ほどの「ボーナス」ボタンから開く。
-- 受け取れる日は、ボタンがゆれて「!」が出る。ログイン直後に受け取れるときは、自動で開く
-- （ただし、初めて遊ぶ人のチュートリアルの最中は、邪魔しないよう開かない）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local DailyUI = {}

local C = Style.Color
local t = I18n.t

local panel, grid, streakLabel, claimButton, giftButton, badge
local lastState = nil
local autoOpened = false
local wobble: Tween? = nil
local openPanel: (() -> ())? = nil

local function rewardLines(reward): string
	local parts = { "🟡 " .. Style.formatNumber(reward.coins) }
	if reward.seeds then
		for cropId, n in reward.seeds do
			local crop = Config.CropById[cropId]
			if crop then
				table.insert(parts, crop.icon .. "×" .. n)
			end
		end
	end
	return table.concat(parts, "\n")
end

local function refreshGift(daily)
	local can = daily ~= nil and daily.canClaim
	badge.Visible = can
	if can then
		if not wobble then
			giftButton.Rotation = -6
			wobble = TweenService:Create(
				giftButton,
				TweenInfo.new(0.45, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
				{ Rotation = 6 }
			)
			wobble:Play()
		end
	elseif wobble then
		wobble:Cancel()
		wobble = nil
		giftButton.Rotation = 0
	end
end

local function refresh()
	if not lastState or not lastState.daily then
		return
	end
	local daily = lastState.daily
	for _, child in grid:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end

	for i, reward in Config.Daily do
		local done = (daily.canClaim and i < daily.index) or (not daily.canClaim and i <= daily.index)
		local today = daily.canClaim and i == daily.index
		local card = Style.make("Frame", {
			Name = "Day" .. i,
			LayoutOrder = i,
			BackgroundColor3 = today and C.Yellow or (done and C.Mint or Color3.fromRGB(255, 255, 255)),
			ZIndex = 12,
		}, grid)
		Style.round(card, 18)
		Style.stroke(card, today and C.Accent or C.Outline, today and 6 or 4)
		Style.label({
			Position = UDim2.fromOffset(0, 6),
			Size = UDim2.new(1, 0, 0, 24),
			Text = t("ui.dailyDay", i),
			TextSize = 18,
			TextWrapped = false,
			ZIndex = 13,
		}, card)
		Style.label({
			Position = UDim2.fromOffset(4, 34),
			Size = UDim2.new(1, -8, 0, 52),
			Text = rewardLines(reward),
			TextSize = 18,
			ZIndex = 13,
		}, card)
		local caption = today and t("ui.dailyToday") or (done and ("⭐ " .. t("ui.dailyClaimed")) or "")
		if caption ~= "" then
			Style.label({
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -6),
				Size = UDim2.new(1, -8, 0, 22),
				Text = caption,
				TextSize = 15,
				TextWrapped = false,
				TextColor3 = today and C.AccentDark or C.Text,
				ZIndex = 13,
			}, card)
		end
	end

	if daily.canClaim then
		streakLabel.Text = daily.restarted and t("ui.dailyBack") or t("ui.dailyStreak", daily.streak)
		claimButton.Visible = true
		claimButton.Text = "🎁 " .. t("ui.dailyClaim")
		panel.Scroll.Size = UDim2.new(1, -28, 1, -170)
	else
		streakLabel.Text = t("ui.dailyStreak", daily.streak) .. "  ・  " .. t("ui.dailyDone")
		claimButton.Visible = false
		panel.Scroll.Size = UDim2.new(1, -28, 1, -90)
	end
end

function DailyUI.build(gui: ScreenGui, onClose: () -> (), onOpen: () -> ())
	openPanel = onOpen

	-- 右の中ほど（移動スティックとジャンプボタンを避ける）
	giftButton = Style.navButton({
		Name = "DailyButton",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -12, 0.42, 0),
		Size = UDim2.fromOffset(80, 88),
		BackgroundColor3 = Color3.fromRGB(255, 170, 190),
		Icon = "🎁",
		Caption = t("ui.dailyShort"),
	}, gui)
	giftButton.Activated:Connect(function()
		if panel.Visible then
			onClose()
		else
			onOpen()
		end
	end)
	badge = Style.make("Frame", {
		Name = "Badge",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 8, 0, -8),
		Size = UDim2.fromOffset(30, 30),
		BackgroundColor3 = Color3.fromRGB(255, 70, 90),
		Visible = false,
		ZIndex = 5,
	}, giftButton)
	Style.round(badge, 15)
	Style.stroke(badge, Color3.fromRGB(255, 255, 255), 3)
	Style.label({
		Size = UDim2.fromScale(1, 1),
		Text = "!",
		TextSize = 22,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextWrapped = false,
		ZIndex = 6,
	}, badge)

	local scroll
	panel, scroll = Style.modal(gui, "DailyPanel", "🎁 " .. t("ui.daily"), onClose)
	Style.make("UIListLayout", { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	streakLabel = Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, -8, 0, 30),
		Text = "",
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)

	grid = Style.make("Frame", {
		Name = "Grid",
		LayoutOrder = 2,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, scroll)
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(112, 112),
		CellPadding = UDim2.fromOffset(10, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)

	-- いちばん大事なボタンは、スクロールしなくても押せるよう、パネルの下に固定する
	scroll.Size = UDim2.new(1, -28, 1, -170)
	claimButton = Style.button({
		Name = "Claim",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -14),
		Size = UDim2.new(1, -28, 0, 72),
		TextSize = 30,
		Text = "",
		TextWrapped = false,
		ZIndex = 12,
	}, panel)
	claimButton.Activated:Connect(function()
		Remotes.ClaimDaily:FireServer()
	end)
end

function DailyUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		refresh()
	end
end

function DailyUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function DailyUI.update(state)
	lastState = state
	if not state.daily then
		return
	end
	refreshGift(state.daily)
	if panel.Visible then
		refresh()
	end
	-- 受け取れる状態でログインしたら、自動で開く（最初のチュートリアル中は開かない）
	if not autoOpened and state.daily.canClaim and state.tutorialDone and openPanel then
		autoOpened = true
		openPanel()
	end
end

return DailyUI

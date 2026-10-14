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

local CARD_HEIGHT = 88 -- 2段で「もらう！」ボタンの上に収まる高さ（小さい画面でもスクロールなしで見える）
local CARD_GAP = 10

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

	-- 2段の決まった配置: 1段目=1〜4日目 / 2段目=5〜6日目 + 7日目（2マス分の特別なカード）
	-- 幅は割合で決めるので、画面が狭くても端が切れない
	local rows = {}
	for r = 1, 2 do
		local row = Style.make("Frame", {
			Name = "Row" .. r,
			LayoutOrder = r,
			Size = UDim2.new(1, 0, 0, CARD_HEIGHT),
			BackgroundTransparency = 1,
			ZIndex = 12,
		}, grid)
		Style.make("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			Padding = UDim.new(0, CARD_GAP),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}, row)
		rows[r] = row
	end

	local count = #Config.Daily
	for i, reward in Config.Daily do
		local done = (daily.canClaim and i < daily.index) or (not daily.canClaim and i <= daily.index)
		local today = daily.canClaim and i == daily.index
		-- 受け取ったあとは、あしたのごほうびを光らせて予告する（あしたも来る理由）
		local tomorrow = not daily.canClaim and i == (daily.index % count) + 1
		if tomorrow then
			done = false
		end
		local big = i == count -- 最後の日（7日目）は大きく
		-- 4列ぶんの幅: 1マス = (全体 - すきま3つ) / 4
		local width = big and UDim2.new(0.5, -CARD_GAP / 2, 1, 0) or UDim2.new(0.25, -CARD_GAP * 3 / 4, 1, 0)
		local card = Style.make("Frame", {
			Name = "Day" .. i,
			LayoutOrder = i,
			Size = width,
			-- 「きょう」は淡いクリーム色（黄色いコインが背景にまぎれないように）
			BackgroundColor3 = (today or tomorrow) and Color3.fromRGB(255, 247, 222)
				or (done and C.Mint or (big and Color3.fromRGB(255, 236, 246) or Color3.fromRGB(255, 255, 255))),
			ZIndex = 12,
		}, i <= 4 and rows[1] or rows[2])
		Style.round(card, 18)
		local strokeColor = today and C.Accent or (tomorrow and Color3.fromRGB(240, 170, 60) or (big and C.AccentDark or C.Outline))
		Style.stroke(card, strokeColor, (today or tomorrow) and 6 or 4)
		Style.label({
			Position = UDim2.fromOffset(0, 4),
			Size = UDim2.new(1, 0, 0, 24),
			Text = (big and "👑 " or "") .. t("ui.dailyDay", i),
			TextSize = 18,
			TextWrapped = false,
			ZIndex = 13,
		}, card)
		local lines = rewardLines(reward)
		if big then
			lines = string.gsub(lines, "\n", "  ")
		end
		Style.label({
			Position = UDim2.fromOffset(4, 26),
			Size = UDim2.new(1, -8, 1, -48),
			Text = lines,
			TextSize = big and 22 or 16,
			ZIndex = 13,
		}, card)
		local caption = today and t("ui.dailyToday")
			or (tomorrow and t("ui.dailyTomorrow") or (done and ("⭐ " .. t("ui.dailyClaimed")) or ""))
		if caption ~= "" then
			Style.label({
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -3),
				Size = UDim2.new(1, -8, 0, 20),
				Text = caption,
				TextSize = 15,
				TextWrapped = false,
				TextColor3 = (today or tomorrow) and C.AccentDark or C.Text,
				ZIndex = 13,
			}, card)
		end
	end

	if daily.canClaim then
		streakLabel.Text = daily.restarted and t("ui.dailyBack") or t("ui.dailyStreak", daily.streak)
		claimButton.Visible = true
		claimButton.Text = "🎁 " .. t("ui.dailyClaim")
		panel.Scroll.Size = UDim2.new(1, -28, 1, -164)
	else
		streakLabel.Text = t("ui.dailyStreak", daily.streak) .. "  ・  " .. t("ui.dailyDone")
		claimButton.Visible = false
		panel.Scroll.Size = UDim2.new(1, -28, 1, -98)
	end
end

function DailyUI.build(gui: ScreenGui, onClose: () -> (), onOpen: () -> (), side: Frame)
	openPanel = onOpen

	-- 右の列（移動スティックとジャンプボタンを避ける）
	giftButton = Style.navButton({
		Name = "DailyButton",
		LayoutOrder = 3,
		Size = UDim2.fromOffset(76, 78),
		BackgroundColor3 = Color3.fromRGB(255, 170, 190),
		Icon = "🎁",
		IconSize = 32,
		Caption = t("ui.dailyShort"),
		CaptionSize = 13,
	}, side)
	giftButton.Activated:Connect(function()
		if panel.Visible then
			onClose()
		else
			onOpen()
		end
	end)
	badge = Style.badge(giftButton)

	local scroll
	panel, scroll = Style.modal(gui, "DailyPanel", "🎁 " .. t("ui.daily"), onClose, Color3.fromRGB(255, 170, 190))
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	streakLabel = Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, -8, 0, 26),
		Text = "",
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)

	grid = Style.make("Frame", {
		Name = "Grid",
		LayoutOrder = 2,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, scroll)
	Style.make("UIListLayout", {
		Padding = UDim.new(0, CARD_GAP),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)

	-- いちばん大事なボタンは、スクロールしなくても押せるよう、パネルの下に固定する
	scroll.Size = UDim2.new(1, -28, 1, -164)
	claimButton = Style.button({
		Name = "Claim",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -14),
		Size = UDim2.new(1, -28, 0, 64),
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

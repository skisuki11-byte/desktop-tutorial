-- キャンディパス（シーズンパス）の画面。右の列の「パス」ボタンから開く。
-- 上: 残り日数・いまのレベルとXP / 下: 段ごとの「むりょう」「スペシャル」のごほうび一覧
-- ごほうびは段に届くと自動でもらえるので、この画面は「見る」ためのもの（押し忘れで損をしない）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local SeasonUI = {}

local C = Style.Color
local t = I18n.t
local S = Config.Season

local HEADER_COLOR = Color3.fromRGB(176, 150, 255)
local ROW_HEIGHT = 76
local ROW_GAP = 8

local panel, scroll, button
local infoLabel, levelLabel, xpLabel, xpFill, buyButton, list
local lastState = nil
local rendered = false

local function rewardText(reward): string
	if not reward then
		return ""
	end
	local parts = {}
	if reward.coins then
		table.insert(parts, "🟡 " .. Style.formatNumber(reward.coins))
	end
	if reward.seeds then
		for cropId, n in reward.seeds do
			local crop = Config.CropById[cropId]
			if crop then
				table.insert(parts, crop.icon .. "×" .. n)
			end
		end
	end
	if reward.cosmetic then
		local item = Config.CosmeticById[reward.cosmetic]
		if item then
			table.insert(parts, item.icon .. " " .. t("cos." .. item.id))
		end
	end
	return table.concat(parts, "  ")
end

local function premiumVisible(state): boolean
	return Config.Passes.season.id > 0 or (state and state.season and state.season.premiumOwned)
end

-- opts: got=受け取った / locked=スペシャル未購入 / special=スペシャルの道 / width / nextXp=次の段ならあと何XPか
local function rewardCard(parent: Instance, order: number, reward, opts)
	local isNext = opts.nextXp ~= nil
	local background = Color3.fromRGB(255, 255, 255)
	if opts.got then
		background = C.Mint
	elseif isNext then
		background = Color3.fromRGB(255, 247, 222)
	elseif opts.special then
		background = Color3.fromRGB(255, 244, 205)
	end
	local card = Style.make("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(opts.width, 0, 1, 0),
		BackgroundColor3 = background,
		ZIndex = 12,
	}, parent)
	Style.round(card, 16)
	local strokeColor = isNext and C.Accent or (opts.special and Color3.fromRGB(230, 170, 40) or C.Outline)
	Style.stroke(card, strokeColor, isNext and 6 or 4)
	Style.label({
		Position = UDim2.fromOffset(6, 4),
		Size = UDim2.new(1, -12, 1, -26),
		Text = rewardText(reward),
		TextSize = 18,
		ZIndex = 13,
	}, card)
	local caption = ""
	if opts.got then
		caption = "⭐ " .. t("ui.seasonGot")
	elseif opts.locked then
		caption = "🔒"
	elseif isNext then
		caption = t("ui.seasonNext", opts.nextXp)
	end
	Style.label({
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -3),
		Size = UDim2.new(1, -8, 0, 20),
		Text = caption,
		TextSize = 14,
		TextWrapped = false,
		TextColor3 = isNext and C.AccentDark or C.Text,
		ZIndex = 13,
	}, card)
end

local function renderList(state)
	for _, child in list:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local season = state.season
	local showPremium = premiumVisible(state)
	for tier, entry in S.tiers do
		local reached = season.level >= tier
		local row = Style.make("Frame", {
			Name = "Tier" .. tier,
			LayoutOrder = tier,
			Size = UDim2.new(1, 0, 0, ROW_HEIGHT),
			BackgroundTransparency = 1,
			ZIndex = 12,
		}, list)
		Style.make("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			Padding = UDim.new(0, 8),
			VerticalAlignment = Enum.VerticalAlignment.Center,
			SortOrder = Enum.SortOrder.LayoutOrder,
		}, row)
		-- 段の番号（届いた段はピンクで光る）
		local badge = Style.make("Frame", {
			LayoutOrder = 0,
			Size = UDim2.new(0.12, 0, 0, 56),
			BackgroundColor3 = reached and C.Accent or C.Dim,
			ZIndex = 12,
		}, row)
		Style.round(badge, 14)
		Style.stroke(badge, C.Outline, 4)
		Style.label({
			Size = UDim2.fromScale(1, 1),
			Text = tostring(tier),
			TextSize = 24,
			TextWrapped = false,
			TextColor3 = reached and Color3.fromRGB(255, 255, 255) or C.Text,
			ZIndex = 13,
		}, badge)
		-- 次に目指す段は光らせて「あと何XP」を出す（次の目標が見えると続けたくなる）
		local nextXp = nil
		if season.active and tier == season.level + 1 then
			nextXp = tier * S.xpPerTier - season.xp
		end
		-- スペシャルの道が無いときは、むりょうのカードを横いっぱいにする
		rewardCard(row, 1, entry.free, {
			got = season.free >= tier,
			width = showPremium and 0.42 or 0.84,
			nextXp = nextXp,
		})
		if showPremium then
			rewardCard(row, 2, entry.premium, {
				got = season.premium >= tier,
				locked = not season.premiumOwned,
				special = true,
				width = 0.42,
			})
		end
	end
end

local function refresh()
	local state = lastState
	if not state or not state.season or not panel then
		return
	end
	local season = state.season
	local maxLevel = #S.tiers

	-- 右の列のボタン: いまのレベル
	button.Caption.Text = t("ui.seasonShort") .. " Lv." .. season.level

	if not panel.Visible then
		return
	end
	local daysLeft = math.max(0, math.ceil((S.endsAt - os.time()) / 86400))
	infoLabel.Text = season.active and (t("ui.seasonName") .. "  ・  " .. t("ui.seasonLeft", daysLeft))
		or t("ui.seasonEnded")

	levelLabel.Text = "🎫 Lv." .. season.level .. " / " .. maxLevel
	if season.level >= maxLevel then
		xpLabel.Text = "MAX"
		xpFill.Size = UDim2.fromScale(1, 1)
	else
		local inTier = season.xp - season.level * S.xpPerTier
		xpLabel.Text = ("%d / %d XP"):format(inTier, S.xpPerTier)
		TweenService:Create(xpFill, TweenInfo.new(0.35), { Size = UDim2.fromScale(math.clamp(inTier / S.xpPerTier, 0, 1), 1) }):Play()
	end

	buyButton.Visible = Config.Passes.season.id > 0 and not season.premiumOwned
	-- 段の一覧は、固定した上の部分の下から始める
	local top = buyButton.Visible and 262 or 202
	scroll.Position = UDim2.fromOffset(14, top)
	scroll.Size = UDim2.new(1, -28, 1, -(top + 14))
	renderList(state)

	-- 開いたときは、いまの段のあたりまでスクロールする
	if not rendered then
		rendered = true
		task.defer(function()
			-- 少し手前で止めて、カードの上の縁が切れないようにする
			local target = math.max(0, math.max(0, season.level - 1) * (ROW_HEIGHT + ROW_GAP) - 8)
			scroll.CanvasPosition = Vector2.new(0, list.AbsolutePosition.Y - scroll.AbsolutePosition.Y + scroll.CanvasPosition.Y + target)
		end)
	end
end

function SeasonUI.build(gui: ScreenGui, onClose: () -> (), onOpen: () -> (), side: Frame)
	button = Style.navButton({
		Name = "SeasonButton",
		LayoutOrder = 1,
		Size = UDim2.fromOffset(76, 78),
		BackgroundColor3 = HEADER_COLOR,
		Icon = "🎫",
		IconSize = 32,
		Caption = t("ui.seasonShort"),
		CaptionSize = 13,
	}, side)
	button.Activated:Connect(function()
		if panel.Visible then
			onClose()
		else
			onOpen()
		end
	end)

	panel, scroll = Style.modal(gui, "SeasonPanel", "🎫 " .. t("ui.season"), onClose, HEADER_COLOR)
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	-- 上の部分（残り日数・レベル・XPのバー・スペシャル）はスクロールさせず、いつも見えるように固定する
	infoLabel = Style.label({
		Position = UDim2.fromOffset(22, 80),
		Size = UDim2.new(1, -44, 0, 22),
		Text = "",
		TextSize = 16,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 12,
	}, panel)

	-- レベルとXPのバー
	local levelCard = Style.make("Frame", {
		Position = UDim2.fromOffset(14, 106),
		Size = UDim2.new(1, -28, 0, 86),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 12,
	}, panel)
	Style.round(levelCard, 18)
	Style.stroke(levelCard, C.Outline, 4)
	levelLabel = Style.label({
		Position = UDim2.fromOffset(14, 6),
		Size = UDim2.new(0.6, 0, 0, 30),
		Text = "",
		TextSize = 24,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 13,
	}, levelCard)
	xpLabel = Style.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -14, 0, 8),
		Size = UDim2.new(0.4, 0, 0, 26),
		Text = "",
		TextSize = 17,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextWrapped = false,
		ZIndex = 13,
	}, levelCard)
	local track = Style.make("Frame", {
		Position = UDim2.fromOffset(14, 40),
		Size = UDim2.new(1, -28, 0, 18),
		BackgroundColor3 = C.Dim,
		ZIndex = 13,
	}, levelCard)
	Style.round(track, 9)
	xpFill = Style.make("Frame", {
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = HEADER_COLOR,
		ZIndex = 14,
	}, track)
	Style.round(xpFill, 9)
	Style.label({
		Position = UDim2.fromOffset(14, 62),
		Size = UDim2.new(1, -28, 0, 20),
		Text = t("ui.seasonHowTo"),
		TextSize = 14,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 13,
	}, levelCard)

	-- スペシャルの道（パスのIDが入っていて、まだ持っていないときだけ出る）
	buyButton = Style.button({
		Name = "BuyPremium",
		Position = UDim2.fromOffset(14, 200),
		Size = UDim2.new(1, -28, 0, 52),
		BackgroundColor3 = C.Yellow,
		TextColor3 = C.Text,
		Text = t("ui.seasonGetPremium"),
		TextSize = 22,
		TextWrapped = false,
		Visible = false,
		ZIndex = 12,
	}, panel)
	buyButton.Activated:Connect(function()
		Remotes.BuyPass:FireServer("season")
	end)

	list = Style.make("Frame", {
		Name = "Tiers",
		LayoutOrder = 5,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, scroll)
	Style.make("UIListLayout", { Padding = UDim.new(0, ROW_GAP), SortOrder = Enum.SortOrder.LayoutOrder }, list)

	-- 段に届いたときのお祝い
	Remotes.SeasonReward.OnClientEvent:Connect(function(tier)
		if type(tier) == "number" then
			SeasonUI.celebrate(tier)
		end
	end)
end

local celebrateHandler: ((string) -> ())? = nil
function SeasonUI.setCelebrate(fn: (string) -> ())
	celebrateHandler = fn
end

function SeasonUI.celebrate(tier: number)
	if celebrateHandler then
		celebrateHandler(t("season.reward", tier))
	end
	Style.pop(button, 1.3)
end

function SeasonUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		rendered = false
		Style.pop(panel, 0.92)
		refresh()
	end
end

function SeasonUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function SeasonUI.update(state)
	lastState = state
	refresh()
end

return SeasonUI

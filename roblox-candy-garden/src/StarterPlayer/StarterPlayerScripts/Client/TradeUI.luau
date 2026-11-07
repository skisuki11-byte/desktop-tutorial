-- ペットの交換の画面。中身はいつもサーバーが決めて送ってくる（TradeState）。この画面は見せて、押したことを伝えるだけ。
--   1) 相手えらび: このサーバーにいる Roblox の友だちだけ選べる
--   2) おさそい: 相手の画面に「○○さんから こうかんの おさそい」
--   3) 交換の画面: 左に「あなたが あげる」、右に「○○さんが くれる」。下の自分のペットをタップで出す・もどす。
--      2人とも OK → 少し待って交換。中身が変わったら OK はやりなおし
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local TradeUI = {}

local C = Style.Color
local t = I18n.t

local ui
local lastState = nil -- サーバーからの状態（自分のペットの一覧）
local trade = nil -- 交換中の中身（TradeState）
local picker, pickerList
local window, windowScroll
local inviteBox

local function petCard(parent: Instance, petId: string, order: number, size: number, tier: number?): TextButton
	local cfg = Config.PetById[petId]
	local card = Style.button({
		LayoutOrder = order,
		Size = UDim2.fromOffset(size, size),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 42,
	}, parent)
	Style.setIcon(Style.label({
		Size = UDim2.fromScale(1, 0.62),
		Text = cfg and cfg.icon or "?",
		TextSize = 30,
		ZIndex = 43,
	}, card), cfg and ("pet_" .. cfg.id), cfg and cfg.icon or "?")
	Style.label({
		Position = UDim2.fromScale(0.04, 0.62),
		Size = UDim2.fromScale(0.92, 0.34),
		Text = cfg and I18n.petName(cfg.id, tier) or "",
		TextSize = 11,
		ZIndex = 43,
	}, card)
	return card
end

-- ---- 1) 相手えらび ----
local function refreshPicker()
	for _, child in pickerList:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	local me = Players.LocalPlayer
	local count = 0
	for _, other in Players:GetPlayers() do
		if other ~= me then
			local ok, friends = pcall(function()
				-- Studio のテスト用プレイヤー（IDがマイナス）どうしは、友だちとして試せる
				if RunService:IsStudio() and me.UserId < 0 and other.UserId < 0 then
					return true
				end
				return me:IsFriendsWith(other.UserId)
			end)
			if ok and friends then
				count += 1
				local button = Style.button({
					LayoutOrder = count,
					Size = UDim2.new(1, -8, 0, 56),
					BackgroundColor3 = C.Mint,
					TextColor3 = C.Text,
					Text = "🔁 " .. other.DisplayName,
					TextSize = 20,
					ZIndex = 42,
				}, pickerList)
				button.Activated:Connect(function()
					Remotes.TradeRequest:FireServer(other.UserId)
					picker.Visible = false
				end)
			end
		end
	end
	if count == 0 then
		Style.label({
			LayoutOrder = 1,
			Size = UDim2.new(1, -8, 0, 60),
			Text = t("ui.tradeNoFriends"),
			TextSize = 16,
			TextColor3 = C.TextMuted,
			ZIndex = 42,
		}, pickerList)
	end
end

function TradeUI.openPicker()
	ui.showPanel(nil)
	picker.Visible = true
	Style.pop(picker, 0.92)
	refreshPicker()
end

-- ---- 3) 交換の画面 ----
local function offerList(): { number }
	local out = {}
	for _, item in (trade and trade.mine) or {} do
		table.insert(out, item.uid)
	end
	return out
end

local function refreshWindow()
	for _, child in windowScroll:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	if not trade then
		return
	end
	local order = 0
	local function nextOrder(): number
		order += 1
		return order
	end
	local function section(text: string, color: Color3?)
		Style.label({
			LayoutOrder = nextOrder(),
			Size = UDim2.new(1, -8, 0, 26),
			Text = text,
			TextSize = 18,
			TextColor3 = color or C.Text,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 42,
		}, windowScroll)
	end
	local function row(items, onTap)
		local frame = Style.make("Frame", {
			LayoutOrder = nextOrder(),
			Size = UDim2.new(1, -8, 0, 0),
			AutomaticSize = Enum.AutomaticSize.Y,
			BackgroundTransparency = 1,
			ZIndex = 41,
		}, windowScroll)
		Style.make("UIGridLayout", {
			CellSize = UDim2.fromOffset(78, 78),
			CellPadding = UDim2.fromOffset(6, 6),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}, frame)
		for i, item in items do
			local card = petCard(frame, item.pet, i, 78, item.tier)
			if onTap then
				onTap(card, item)
			end
		end
		if #items == 0 then
			Style.label({ Text = "—", TextSize = 22, TextColor3 = C.TextMuted, ZIndex = 42 }, frame)
		end
		return frame
	end

	Style.label({
		LayoutOrder = nextOrder(),
		Size = UDim2.new(1, -8, 0, 36),
		Text = t("ui.tradeRule"),
		TextSize = 13,
		TextColor3 = C.TextMuted,
		ZIndex = 42,
	}, windowScroll)

	-- 相手が出したペット（いつも見える）
	section(t("ui.tradeTheyGive", trade.partnerName), C.AccentDark)
	row(trade.theirs)
	-- 自分が出したペット（タップでもどす）
	section(t("ui.tradeYouGive"))
	row(trade.mine, function(card, item)
		card.Activated:Connect(function()
			local list = {}
			for _, uid in offerList() do
				if uid ~= item.uid then
					table.insert(list, uid)
				end
			end
			Remotes.TradeOffer:FireServer(list)
		end)
	end)

	-- 自分のペット（タップで出す）。おくりもののペットは出せない
	section(t("ui.tradeYourPets"))
	local offered = {}
	for _, uid in offerList() do
		offered[uid] = true
	end
	local mine = {}
	for _, entry in (lastState and lastState.pets) or {} do
		if not offered[entry.uid] then
			table.insert(mine, entry)
		end
	end
	row(mine, function(card, item)
		local cfg = Config.PetById[item.pet]
		if cfg and not Config.canTrade(cfg) then
			card.BackgroundColor3 = C.Dim
			card.AutoButtonColor = false
			Style.label({
				AnchorPoint = Vector2.new(0.5, 0),
				Position = UDim2.new(0.5, 0, 0, 2),
				Size = UDim2.new(1, -4, 0, 14),
				Text = "🔒 " .. t("ui.tradeLocked"),
				TextSize = 10,
				TextColor3 = C.TextMuted,
				ZIndex = 44,
			}, card)
			return
		end
		card.Activated:Connect(function()
			local list = offerList()
			if #list < Config.Trade.maxOffer then
				table.insert(list, item.uid)
				Remotes.TradeOffer:FireServer(list)
			end
		end)
	end)

	-- 状態と OK
	local status = if trade.countingDown then t("ui.tradeCountdown", Config.Trade.countdown)
		elseif trade.theirReady then t("ui.tradeTheyReady")
		elseif trade.myReady then t("ui.tradeWaiting")
		else ""
	if status ~= "" then
		section(status, C.AccentDark)
	end
	local buttons = Style.make("Frame", {
		LayoutOrder = nextOrder(),
		Size = UDim2.new(1, -8, 0, 64),
		BackgroundTransparency = 1,
		ZIndex = 41,
	}, windowScroll)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 10),
	}, buttons)
	local ok = Style.button({
		Size = UDim2.new(0.55, 0, 1, 0),
		BackgroundColor3 = if trade.myReady then Color3.fromRGB(120, 220, 150) else C.Accent,
		Text = (if trade.myReady then "✅ " else "") .. t("ui.tradeOk"),
		TextSize = 24,
		ZIndex = 42,
	}, buttons)
	ok.Activated:Connect(function()
		Remotes.TradeReady:FireServer(not trade.myReady)
	end)
	local cancel = Style.button({
		Size = UDim2.new(0.35, 0, 1, 0),
		BackgroundColor3 = C.Surface,
		TextColor3 = C.Text,
		Text = t("ui.tradeCancel"),
		TextSize = 20,
		ZIndex = 42,
	}, buttons)
	cancel.Activated:Connect(function()
		Remotes.TradeCancel:FireServer()
	end)
end

-- ---- 2) おさそい ----
local function showInvite(fromUserId: number, fromName: string)
	if inviteBox then
		inviteBox:Destroy()
	end
	inviteBox = Style.make("Frame", {
		Name = "TradeInvite",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.45),
		Size = UDim2.fromOffset(340, 170),
		BackgroundColor3 = C.Surface,
		ZIndex = 45,
	}, ui.gui())
	Style.round(inviteBox, 24)
	Style.stroke(inviteBox, C.Outline, 5)
	Style.shadow(inviteBox)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(340, 170) }, inviteBox)
	Style.label({
		Position = UDim2.fromOffset(16, 14),
		Size = UDim2.new(1, -32, 0, 70),
		Text = "🔁 " .. t("ui.tradeInvite", fromName),
		TextSize = 20,
		ZIndex = 46,
	}, inviteBox)
	local function answer(accept: boolean)
		Remotes.TradeRespond:FireServer(fromUserId, accept)
		if inviteBox then
			inviteBox:Destroy()
			inviteBox = nil
		end
	end
	local yes = Style.button({
		Position = UDim2.new(0, 16, 1, -70),
		Size = UDim2.new(0.5, -22, 0, 56),
		BackgroundColor3 = C.Mint,
		TextColor3 = C.Text,
		Text = t("ui.tradeAccept"),
		TextSize = 20,
		ZIndex = 46,
	}, inviteBox)
	yes.Activated:Connect(function()
		answer(true)
	end)
	local no = Style.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -16, 1, -70),
		Size = UDim2.new(0.5, -22, 0, 56),
		BackgroundColor3 = C.Surface,
		TextColor3 = C.Text,
		Text = t("ui.tradeDecline"),
		TextSize = 18,
		ZIndex = 46,
	}, inviteBox)
	no.Activated:Connect(function()
		answer(false)
	end)
	Style.pop(inviteBox, 0.8)
	-- 返事がないまま時間が過ぎたら、消す
	local box = inviteBox
	task.delay(Config.Trade.requestSeconds, function()
		if inviteBox == box then
			answer(false)
		end
	end)
end

function TradeUI.init(uiModule)
	ui = uiModule
	local gui = ui.gui()
	picker, pickerList = Style.modal(gui, "TradePicker", t("ui.tradeTitle"), function()
		picker.Visible = false
	end, C.Mint)
	picker.ZIndex = 40
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, pickerList)
	Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, -8, 0, 44),
		Text = t("ui.tradePick") .. "\n" .. t("ui.tradeFriendsOnly"),
		TextSize = 15,
		TextColor3 = C.TextMuted,
		ZIndex = 42,
	}, pickerList)

	window, windowScroll = Style.modal(gui, "TradeWindow", t("ui.tradeTitle"), function()
		Remotes.TradeCancel:FireServer()
	end, C.Mint)
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, windowScroll)

	Remotes.TradeInvite.OnClientEvent:Connect(function(fromUserId, fromName)
		if type(fromUserId) == "number" and type(fromName) == "string" then
			showInvite(fromUserId, fromName)
		end
	end)
	Remotes.TradeState.OnClientEvent:Connect(function(state)
		if type(state) ~= "table" then
			return
		end
		if state.open then
			trade = state
			if not window.Visible then
				ui.showPanel(nil)
				picker.Visible = false
				window.Visible = true
				Style.pop(window, 0.92)
			end
			refreshWindow()
		else
			trade = nil
			window.Visible = false
		end
	end)
end

function TradeUI.update(state)
	lastState = state
	if trade and window.Visible then
		refreshWindow()
	end
end

return TradeUI

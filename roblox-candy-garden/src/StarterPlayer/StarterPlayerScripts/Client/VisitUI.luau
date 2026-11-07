-- ひみつきちの 見学（しょうたい）の 画面。
--   1) まねく 友だちを えらぶ（Robloxの 友だちだけ。こうかんと 同じ）
--   2) まねかれた子に「見にいく / ことわる」
--   3) 見学中の ふだ（のこり時間と「おわり」「かえる」）
-- 決まりは サーバー（Visit.luau）で 守る。ここは 見せる だけ
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local VisitUI = {}

local C = Style.Color
local t = I18n.t

local ui
local picker, pickerList
local inviteBox
local bar, barLabel, barButton
local state = { role = "none" }

-- ---- 1) まねく 友だちを えらぶ ----
local function refreshPicker()
	for _, child in pickerList:GetChildren() do
		if child:IsA("GuiObject") and child.LayoutOrder > 0 then
			child:Destroy()
		end
	end
	local me = Players.LocalPlayer
	local count = 0
	for _, other in Players:GetPlayers() do
		if other ~= me then
			local ok, friends = pcall(function()
				-- Studio の テスト用プレイヤー（IDが マイナス）どうしは、友だちとして 試せる
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
					BackgroundColor3 = C.Lilac,
					TextColor3 = C.Text,
					Text = "🏛️ " .. other.DisplayName,
					TextSize = 20,
					ZIndex = 42,
				}, pickerList)
				button.Activated:Connect(function()
					Remotes.VisitInvite:FireServer(other.UserId)
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

function VisitUI.openPicker()
	ui.showPanel(nil)
	picker.Visible = true
	Style.pop(picker, 0.92)
	refreshPicker()
end

-- ---- 2) まねかれた ----
local function showInvite(hostUserId: number, hostName: string)
	if inviteBox then
		inviteBox:Destroy()
	end
	inviteBox = Style.make("Frame", {
		Name = "VisitInvite",
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
		Text = "🏛️ " .. t("ui.visitInvite", hostName),
		TextSize = 20,
		ZIndex = 46,
	}, inviteBox)
	local function answer(accept: boolean)
		Remotes.VisitRespond:FireServer(hostUserId, accept)
		if inviteBox then
			inviteBox:Destroy()
			inviteBox = nil
		end
	end
	local yes = Style.button({
		Name = "Accept",
		Position = UDim2.new(0, 16, 1, -70),
		Size = UDim2.new(0.5, -22, 0, 56),
		BackgroundColor3 = C.Lilac,
		TextColor3 = C.Text,
		Text = t("ui.visitAccept"),
		TextSize = 20,
		ZIndex = 46,
	}, inviteBox)
	yes.Activated:Connect(function()
		ui.showPanel(nil)
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
	local box = inviteBox
	task.delay(Config.Visit.requestSeconds, function()
		if inviteBox == box then
			answer(false)
		end
	end)
end

-- ---- 3) 見学中の ふだ ----
local function refreshBar()
	if state.role == "none" then
		bar.Visible = false
		return
	end
	bar.Visible = true
	local left = math.max(0, (state.endsAt or os.time()) - os.time())
	local clock = ("%d:%02d"):format(left // 60, left % 60)
	barLabel.Text = (if state.role == "host" then t("ui.visitHosting", state.partner) else t("ui.visitVisiting", state.partner)) .. "  ⏱ " .. clock
	barButton.Text = if state.role == "host" then t("ui.visitEnd") else t("ui.visitLeave")
end

function VisitUI.init(uiModule)
	ui = uiModule
	local gui = ui.gui()
	picker, pickerList = Style.modal(gui, "VisitPicker", t("ui.visit"), function()
		picker.Visible = false
	end, C.Lilac)
	picker.ZIndex = 40
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, pickerList)
	Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = t("ui.visitPick", Config.Visit.seconds // 60),
		TextSize = 15,
		TextWrapped = true,
		TextColor3 = C.TextMuted,
		ZIndex = 42,
	}, pickerList)

	-- 見学中の ふだ: 上の まん中（畑と ボタンに かからない）
	bar = Style.make("Frame", {
		Name = "VisitBar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 70),
		Size = UDim2.fromOffset(0, 48),
		AutomaticSize = Enum.AutomaticSize.X,
		BackgroundColor3 = C.Surface,
		Visible = false,
		ZIndex = 18,
	}, gui)
	Style.round(bar, 24)
	Style.stroke(bar, C.Lilac, 4)
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 16), PaddingRight = UDim.new(0, 6) }, bar)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Padding = UDim.new(0, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, bar)
	barLabel = Style.label({
		LayoutOrder = 1,
		Size = UDim2.fromOffset(0, 40),
		AutomaticSize = Enum.AutomaticSize.X,
		Text = "",
		TextSize = 18,
		TextWrapped = false,
		ZIndex = 19,
	}, bar)
	barButton = Style.button({
		Name = "VisitEnd",
		LayoutOrder = 2,
		Size = UDim2.fromOffset(96, 38),
		Text = "",
		TextSize = 18,
		ZIndex = 19,
	}, bar)
	barButton.Activated:Connect(function()
		Remotes.VisitEnd:FireServer()
	end)

	Remotes.VisitInvite.OnClientEvent:Connect(function(hostUserId, hostName)
		if type(hostUserId) == "number" and type(hostName) == "string" then
			showInvite(hostUserId, hostName)
		end
	end)
	Remotes.VisitState.OnClientEvent:Connect(function(newState)
		if type(newState) == "table" and type(newState.role) == "string" then
			state = newState
			refreshBar()
		end
	end)
	task.spawn(function()
		while true do
			task.wait(1)
			if state.role ~= "none" then
				refreshBar()
			end
		end
	end)
end

return VisitUI

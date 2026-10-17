-- みんなの木の表示。左上のチップ（レベルと進み具合）、木の上の看板、レベルアップのお知らせ。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local TreeClient = {}

local C = Style.Color
local t = I18n.t

local ui
local chipLevel, chipCount, chipFill, chip
local lastProgress, lastLevel = nil, nil

local function bar(parent: Instance, position: UDim2, size: UDim2)
	local track = Style.make("Frame", {
		Name = "Track",
		Position = position,
		Size = size,
		BackgroundColor3 = C.Dim,
	}, parent)
	Style.round(track, 8)
	local fill = Style.make("Frame", {
		Name = "Fill",
		Size = UDim2.fromScale(0, 1),
		BackgroundColor3 = C.Mint,
	}, track)
	Style.round(fill, 8)
	return fill
end

local function buildChip(gui: ScreenGui)
	chip = Style.make("Frame", {
		Name = "TreeChip",
		Position = UDim2.fromOffset(16, 128),
		Size = UDim2.fromOffset(230, 58),
		BackgroundColor3 = C.Surface,
	}, gui)
	Style.round(chip, 20)
	Style.stroke(chip, C.Mint, 3)
	chipLevel = Style.label({
		Position = UDim2.fromOffset(12, 4),
		Size = UDim2.new(0.5, -16, 0, 28), -- 右の数字と重ならないよう、すき間を空ける
		Text = "",
		TextSize = 18,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
	}, chip)
	chipCount = Style.label({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 4),
		Size = UDim2.new(0.5, -16, 0, 28),
		Text = "",
		TextSize = 16,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextWrapped = false,
	}, chip)
	chipFill = bar(chip, UDim2.fromOffset(12, 36), UDim2.new(1, -24, 0, 12))
end

-- 木の上の看板。木が作り直されて消えたら、付け直す。
local function ensureSign(): Frame?
	local tree = workspace:FindFirstChild("CommunityTree")
	local anchor = tree and tree:FindFirstChild("SignAnchor")
	if not anchor then
		return nil
	end
	local board = anchor:FindFirstChild("Sign")
	if board then
		return board.Board
	end
	board = Style.make("BillboardGui", {
		Name = "Sign",
		-- 大きさは stud 単位（遠くでは小さく見える）。画面の大きさで決めると、スマホでは画面の上をふさぐため
		Size = UDim2.fromScale(12, 4),
		AlwaysOnTop = false,
		MaxDistance = 110,
	}, anchor)
	local frame = Style.make("Frame", {
		Name = "Board",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = C.Surface,
	}, board)
	Style.round(frame, 24)
	Style.stroke(frame, C.Mint, 4)
	Style.label({
		Position = UDim2.fromScale(0, 0.06),
		Size = UDim2.fromScale(1, 0.36),
		Text = "🌳 " .. t("ui.tree"),
		TextSize = 24,
		TextWrapped = false,
	}, frame)
	Style.label({
		Name = "Level",
		Position = UDim2.fromScale(0.06, 0.46),
		Size = UDim2.fromScale(0.44, 0.3),
		Text = "",
		TextSize = 20,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
	}, frame)
	Style.label({
		Name = "Count",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(0.94, 0.46),
		Size = UDim2.fromScale(0.44, 0.3),
		Text = "",
		TextSize = 18,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextWrapped = false,
	}, frame)
	bar(frame, UDim2.fromScale(0.06, 0.8), UDim2.fromScale(0.88, 0.12))
	return frame
end

local function refresh()
	local level = workspace:GetAttribute("TreeLevel") or 1
	local progress = workspace:GetAttribute("TreeProgress") or 0
	local goal = math.max(1, workspace:GetAttribute("TreeGoal") or 1)
	local levelText = "🌳 Lv." .. level
	local countText = ("%d / %d"):format(progress, goal)
	local ratio = math.clamp(progress / goal, 0, 1)

	chipLevel.Text = levelText
	chipCount.Text = countText
	TweenService:Create(chipFill, TweenInfo.new(0.35), { Size = UDim2.fromScale(ratio, 1) }):Play()

	local board = ensureSign()
	if board then
		board.Level.Text = "Lv." .. level
		board.Count.Text = countText
		TweenService:Create(board.Track.Fill, TweenInfo.new(0.35), { Size = UDim2.fromScale(ratio, 1) }):Play()
	end

	if lastProgress and (progress ~= lastProgress or level ~= lastLevel) then
		Style.pop(chip, 1.08)
	end
	lastProgress, lastLevel = progress, level
end

function TreeClient.init(uiModule)
	ui = uiModule
	buildChip(ui.gui())

	workspace:GetAttributeChangedSignal("TreeProgress"):Connect(refresh)
	workspace:GetAttributeChangedSignal("TreeLevel"):Connect(refresh)
	task.spawn(function()
		-- 木が（作り直されて）看板を失っていても、少し待てば付け直す
		while true do
			refresh()
			task.wait(1)
		end
	end)

	Remotes.TreeLevelUp.OnClientEvent:Connect(function(level, reward)
		if type(level) == "number" and type(reward) == "number" then
			ui.toastText(t("tree.levelUp", level, reward), 5)
			Style.pop(chip, 1.3)
		end
	end)
end

return TreeClient

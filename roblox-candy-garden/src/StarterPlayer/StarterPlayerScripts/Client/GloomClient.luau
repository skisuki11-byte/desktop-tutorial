-- しょんぼり雲（サーバーの Gloom）の お知らせ。画面の下のまん中に 小さな札を出す。
--   ・雲が来ている間: 「☁️ しょんぼり雲 のこり N あと 2:30 ▶ たすけにいく」（押すと ひろばの木へ ワープ）
--   ・はれたあと: 「☀️ おひさまタイム ✨+10% あと 4:59」
--   ・どちらでもないとき: キャンディラッシュ（全サーバーで 決まった時刻の おまつり）の 「🍭 あと 12:34」か「つぎは 21:00」
-- はじめての人の案内中は出さない（案内に集中できるように）
local LocalizationService = game:GetService("LocalizationService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local GloomClient = {}

local t = I18n.t
local ui
local chip: TextButton
local tutorialDone = false

local function clock(seconds: number): string
	seconds = math.max(0, math.floor(seconds))
	return ("%d:%02d"):format(seconds // 60, seconds % 60)
end

-- その人の国の 時計の 時刻（例: 21:00 / 9:00 PM）
local function localTime(serverTime: number): string
	local ok, text = pcall(function()
		return DateTime.fromUnixTimestamp(math.floor(serverTime + 0.5)):FormatLocalTime("LT", LocalizationService.RobloxLocaleId)
	end)
	return if ok then text else ""
end

local function refresh()
	-- 文字のふち（白い文字のときだけ。うすい色の札で こい文字に ふちが あると にじんで見える）
	local function edge()
		local stroke = chip:FindFirstChild("TextStroke")
		if stroke then
			stroke.Enabled = chip.TextColor3 == Color3.fromRGB(255, 255, 255)
		end
	end
	task.defer(edge)
	local now = workspace:GetServerTimeNow()
	local endsAt = workspace:GetAttribute("GloomEndsAt") or 0
	local sunny = workspace:GetAttribute("SunnyUntil") or 0
	local free = ui.currentPanel == nil and tutorialDone
	if endsAt > now then
		chip.Text = t("gloom.chip", workspace:GetAttribute("GloomHp") or 0, clock(endsAt - now))
		chip.BackgroundColor3 = Color3.fromRGB(110, 105, 150)
		chip.TextColor3 = Color3.fromRGB(255, 255, 255)
		chip.Active = true
		chip.Visible = free
	elseif sunny > now then
		chip.Text = t("gloom.sunny", math.floor(Config.Gloom.sparkleBonus * 100 + 0.5), clock(sunny - now))
		chip.BackgroundColor3 = Color3.fromRGB(240, 150, 60) -- 白い文字が読める こい オレンジ
		chip.TextColor3 = Color3.fromRGB(255, 255, 255)
		chip.Active = false
		chip.Visible = free
	else
		local rushEnds, rushNext = Config.rush(now)
		chip.Active = false
		chip.Visible = free
		if rushEnds then
			chip.Text = t("rush.chip", math.floor(Config.Rush.sellBonus * 100 + 0.5), clock(rushEnds - now))
			chip.BackgroundColor3 = Color3.fromRGB(235, 90, 160) -- 白い文字が読める こい ピンク
			chip.TextColor3 = Color3.fromRGB(255, 255, 255)
		else
			chip.Text = t("rush.next", localTime(rushNext))
			chip.BackgroundColor3 = Color3.fromRGB(255, 240, 248)
			chip.TextColor3 = Color3.fromRGB(150, 70, 120)
		end
	end
end

function GloomClient.update(state)
	tutorialDone = state.tutorialDone == true
end

function GloomClient.init(uiModule)
	ui = uiModule
	chip = Style.button({
		Name = "GloomChip",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -56), -- 下のまん中（ほしぞらまつりの札の 上）
		Size = UDim2.fromOffset(0, 40),
		AutomaticSize = Enum.AutomaticSize.X,
		Text = "",
		TextSize = 16,
		TextWrapped = false,
		Visible = false,
	}, ui.gui())
	Style.make("UIPadding", { PaddingLeft = UDim.new(0, 14), PaddingRight = UDim.new(0, 14) }, chip)
	chip.Activated:Connect(function()
		if (workspace:GetAttribute("GloomEndsAt") or 0) > workspace:GetServerTimeNow() then
			Remotes.Teleport:FireServer("tree") -- みんなの木へ
		end
	end)
	task.spawn(function()
		while true do
			refresh()
			task.wait(0.5)
		end
	end)
end

return GloomClient

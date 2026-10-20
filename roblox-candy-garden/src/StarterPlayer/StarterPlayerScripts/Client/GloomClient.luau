-- 左上の カード 2まい（UI の InfoStack に入る）
--   GloomChip: しょんぼり雲（サーバーの Gloom）
--     ・雲が来ている間: 「しょんぼり雲 / のこり N  2:30 ▶ たすける」（押すと ひろばの木へ ワープ。色で ぬって 気づかせる）
--     ・はれたあと: 「おひさまタイム / ✨+10%  あと 4:59」
--   RushChip: キャンディラッシュ（全サーバーで 決まった時刻の おまつり）。いつも出す
--     ・ラッシュ中: 「キャンディラッシュ / 売値+50%  あと 12:34」（色で ぬる）
--     ・それ以外: 「キャンディラッシュ / つぎは 21:00」
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
local parts
local rushChip: Frame
local rushParts
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

-- カードの 色（見出しの帯・ふち）を かえる
local function setAccent(card: GuiObject, cardParts, color: Color3)
	cardParts.Accent = color
	local edge = card:FindFirstChild("Edge")
	if edge then
		edge.Color = color
	end
	local stripe = card:FindFirstChild("Stripe")
	if stripe then
		stripe.BackgroundColor3 = color
	end
end

local GLOOM = Color3.fromRGB(110, 105, 150)
local SUNNY = Color3.fromRGB(230, 130, 40)
local RUSH = Color3.fromRGB(230, 80, 155)

local function refresh()
	local now = workspace:GetServerTimeNow()
	local endsAt = workspace:GetAttribute("GloomEndsAt") or 0
	local sunny = workspace:GetAttribute("SunnyUntil") or 0
	local free = ui.currentPanel == nil and tutorialDone
	if endsAt > now then
		parts.Emoji.Text = "☁️"
		parts.Title.Text = t("gloom.title")
		parts.Value.Text = t("gloom.value", workspace:GetAttribute("GloomHp") or 0, clock(endsAt - now))
		setAccent(chip, parts, GLOOM)
		Style.cardTone(chip, parts, "alert")
		chip.Active = true
		chip.Visible = free
	elseif sunny > now then
		parts.Emoji.Text = "☀️"
		parts.Title.Text = t("sunny.title")
		parts.Value.Text = t("card.bonusLeft", math.floor(Config.Gloom.sparkleBonus * 100 + 0.5), clock(sunny - now))
		setAccent(chip, parts, SUNNY)
		Style.cardTone(chip, parts, "normal")
		chip.Active = false
		chip.Visible = free
	else
		chip.Visible = false
	end

	local rushEnds, rushNext = Config.rush(now)
	rushChip.Visible = free
	if rushEnds then
		rushParts.Value.Text = t("rush.active", math.floor(Config.Rush.sellBonus * 100 + 0.5), clock(rushEnds - now))
		Style.cardTone(rushChip, rushParts, "alert")
	else
		rushParts.Value.Text = t("rush.nextAt", localTime(rushNext))
		Style.cardTone(rushChip, rushParts, "normal")
	end
end

function GloomClient.update(state)
	tutorialDone = state.tutorialDone == true
end

function GloomClient.init(uiModule)
	ui = uiModule
	chip, parts = Style.infoCard({ Name = "GloomChip", Accent = GLOOM, Button = true }, ui.gui())
	rushChip, rushParts = Style.infoCard({ Name = "RushChip", Accent = RUSH }, ui.gui())
	rushParts.Emoji.Text = "🍭"
	rushParts.Title.Text = t("rush.title")
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

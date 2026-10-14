-- ログインコードの入力画面。右の列の「コード」ボタンから開く。
-- 大きな入力欄と大きな「つかう！」ボタン。結果は、その場に大きな文字で出す（トーストだけだと見落とす）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local CodesUI = {}

local C = Style.Color
local t = I18n.t

local panel, box, resultLabel, redeemButton

local RESULT_COLOR = {
	ok = Color3.fromRGB(40, 160, 110),
	invalid = Color3.fromRGB(220, 70, 100),
	used = Color3.fromRGB(150, 110, 170),
	expired = Color3.fromRGB(150, 110, 170),
	slow = Color3.fromRGB(150, 110, 170),
}

local function rewardText(reward): string
	if type(reward) ~= "table" then
		return ""
	end
	local parts = {}
	if type(reward.coins) == "number" then
		table.insert(parts, "🟡 +" .. Style.formatNumber(reward.coins))
	end
	if type(reward.seeds) == "table" then
		for cropId, n in reward.seeds do
			local crop = Config.CropById[cropId]
			if crop and type(n) == "number" then
				table.insert(parts, crop.icon .. " ×" .. n)
			end
		end
	end
	if type(reward.cosmetic) == "string" and Config.CosmeticById[reward.cosmetic] then
		table.insert(parts, Config.CosmeticById[reward.cosmetic].icon .. " " .. t("cos." .. reward.cosmetic))
	end
	return table.concat(parts, "   ")
end

function CodesUI.build(gui: ScreenGui, onClose: () -> (), onOpen: () -> (), side: Frame)
	local button = Style.navButton({
		Name = "CodesButton",
		LayoutOrder = 4,
		Size = UDim2.fromOffset(76, 78),
		BackgroundColor3 = Color3.fromRGB(150, 200, 255),
		Icon = "🎟️",
		IconSize = 32,
		Caption = t("ui.codes"),
		CaptionSize = 13,
	}, side)
	button.Activated:Connect(function()
		if panel.Visible then
			onClose()
		else
			onOpen()
		end
	end)

	local scroll
	panel, scroll = Style.modal(gui, "CodesPanel", "🎟️ " .. t("ui.codes"), onClose, Color3.fromRGB(150, 200, 255))
	Style.make("UIListLayout", {
		Padding = UDim.new(0, 14),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, scroll)

	Style.label({
		LayoutOrder = 1,
		Size = UDim2.new(1, -8, 0, 34),
		Text = t("ui.codeTitle"),
		TextSize = 24,
		ZIndex = 12,
	}, scroll)

	box = Style.make("TextBox", {
		Name = "Input",
		LayoutOrder = 2,
		Size = UDim2.new(1, -16, 0, 68),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		Font = Style.Font,
		PlaceholderText = t("ui.codePlaceholder"),
		PlaceholderColor3 = C.TextMuted,
		Text = "",
		TextColor3 = C.Text,
		TextSize = 30,
		ClearTextOnFocus = false,
		ZIndex = 12,
	}, scroll)
	Style.round(box, 18)
	Style.stroke(box, C.Outline, 4)

	redeemButton = Style.button({
		Name = "Redeem",
		LayoutOrder = 3,
		Size = UDim2.new(1, -16, 0, 68),
		BackgroundColor3 = Color3.fromRGB(80, 200, 130),
		Text = "✨ " .. t("ui.codeRedeem"),
		TextSize = 30,
		TextWrapped = false,
		ZIndex = 12,
	}, scroll)
	redeemButton.Activated:Connect(function()
		local text = box.Text
		if #text > 0 then
			Remotes.RedeemCode:FireServer(text)
		end
	end)
	box.FocusLost:Connect(function(enterPressed)
		if enterPressed and #box.Text > 0 then
			Remotes.RedeemCode:FireServer(box.Text)
		end
	end)

	resultLabel = Style.label({
		Name = "Result",
		LayoutOrder = 4,
		Size = UDim2.new(1, -8, 0, 64),
		Text = "",
		TextSize = 22,
		ZIndex = 12,
	}, scroll)

	Style.label({
		LayoutOrder = 5,
		Size = UDim2.new(1, -8, 0, 24),
		Text = t("ui.codeHint"),
		TextSize = 15,
		TextColor3 = C.TextMuted,
		ZIndex = 12,
	}, scroll)

	Remotes.CodeResult.OnClientEvent:Connect(function(status, reward)
		if type(status) ~= "string" or not RESULT_COLOR[status] then
			return
		end
		local text = t("code." .. status)
		if status == "ok" then
			text ..= "\n" .. rewardText(reward)
			box.Text = ""
		end
		resultLabel.Text = text
		resultLabel.TextColor3 = RESULT_COLOR[status]
		Style.pop(resultLabel, 1.2)
	end)
end

function CodesUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		resultLabel.Text = ""
		Style.pop(panel, 0.92)
	end
end

function CodesUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

return CodesUI

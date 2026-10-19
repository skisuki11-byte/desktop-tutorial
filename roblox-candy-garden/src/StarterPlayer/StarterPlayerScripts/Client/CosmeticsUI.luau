-- おしゃれ画面。ぼうし・かお・せなか・て・いしょう・キラキラ を、タブで切り替えて、タップで買う／着る。
-- 方針: 全部コインで手に入る（無料の道）。ロバックスのパスは、持っているか買えるものだけを
--       「スペシャル」に出す（Config.Passes の id が 0 のうちは出さない）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Style = require(script.Parent.Style)

local CosmeticsUI = {}

local C = Style.Color
local t = I18n.t

local SLOT_ICON = { hat = "🎩", face = "👓", back = "🎒", hand = "🍭", outfit = "👗", trail = "✨" }

local panel, tabsFrame, grid, specialFrame, hint
local currentSlot = "hat"
local lastState = nil

local function passesAvailable(): boolean
	for _, pass in Config.Passes do
		if pass.id > 0 then
			return true
		end
	end
	for _, product in Config.Products do
		if product.id > 0 then
			return true
		end
	end
	return false
end

local function owns(state, item): boolean
	if state.cosmetics.owned[item.id] then
		return true
	end
	return item.pass ~= nil and state.passes and state.passes[item.pass] == true
end

local function refreshTabs()
	for _, slot in Config.CosmeticSlots do
		local tab = tabsFrame:FindFirstChild(slot)
		if tab then
			local on = slot == currentSlot
			tab.BackgroundColor3 = on and C.Accent or C.Surface
			tab.Caption.TextColor3 = on and Color3.fromRGB(255, 255, 255) or C.Text
			local stroke = tab:FindFirstChild("TextStroke", true)
			if on and not tab.Caption:FindFirstChild("TextStroke") then
				Style.textStroke(tab.Caption)
			elseif not on and tab.Caption:FindFirstChild("TextStroke") then
				tab.Caption.TextStroke:Destroy()
			end
			tab:FindFirstChildOfClass("UIStroke").Color = on and C.Outline or C.Dim
		end
	end
end

local function refreshGrid()
	for _, child in grid:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	if not lastState then
		return
	end
	local equipped = lastState.cosmetics.equipped
	local order = 0
	for _, item in Config.Cosmetics do
		local have = owns(lastState, item)
		-- パス限定は、持っているか、買える状態(id>0)のときだけ出す
		local passId = item.pass and Config.Passes[item.pass].id or 0
		-- コード限定は、持っているときだけ出す
		local visible = item.slot == currentSlot
			and (item.pass == nil or have or passId > 0)
			and (not (item.codeOnly or item.seasonOnly or item.shopOnly or item.starOnly or item.friendOnly) or have)
		if visible then
			order += 1
			local worn = equipped[item.slot] == item.id
			local card = Style.button({
				Name = item.id,
				LayoutOrder = order,
				BackgroundColor3 = worn and Color3.fromRGB(255, 233, 244) or Color3.fromRGB(255, 255, 255),
				ZIndex = 12,
			}, grid)
			local border = card:FindFirstChildOfClass("UIStroke")
			border.Color = worn and C.Accent or C.Outline
			border.Thickness = worn and 6 or 4

			Style.setIcon(Style.label({
				Position = UDim2.fromOffset(0, 4),
				Size = UDim2.new(1, 0, 0, 52),
				Text = item.icon,
				TextSize = 44,
				TextWrapped = false,
				ZIndex = 13,
			}, card), "cos_" .. item.id, item.icon)
			Style.label({
				Position = UDim2.fromOffset(4, 58),
				Size = UDim2.new(1, -8, 0, 36),
				Text = t("cos." .. item.id),
				TextSize = 14,
				ZIndex = 13,
			}, card)

			-- 下のバッジ: きてる / もってる / 値段
			local badgeText, badgeColor, badgeTextColor
			if worn then
				badgeText, badgeColor, badgeTextColor = "⭐ " .. t("ui.wearing"), C.Accent, Color3.fromRGB(255, 255, 255)
			elseif have then
				badgeText, badgeColor, badgeTextColor = t("ui.have"), C.Mint, C.Text
			elseif item.pass then
				badgeText, badgeColor, badgeTextColor = "⭐ " .. t("ui.special"), C.Yellow, C.Text
			else
				badgeText, badgeColor, badgeTextColor = "🟡 " .. Style.formatNumber(item.price), C.Yellow, C.Text
			end
			local badge = Style.make("Frame", {
				AnchorPoint = Vector2.new(0.5, 1),
				Position = UDim2.new(0.5, 0, 1, -6),
				Size = UDim2.new(1, -16, 0, 28),
				BackgroundColor3 = badgeColor,
				ZIndex = 13,
			}, card)
			Style.round(badge, 14)
			Style.label({
				Size = UDim2.fromScale(1, 1),
				Text = badgeText,
				TextSize = 15,
				TextColor3 = badgeTextColor,
				TextWrapped = false,
				ZIndex = 14,
			}, badge)

			card.Activated:Connect(function()
				if have then
					-- 着ている物をもう一度押すと、はずす
					Remotes.EquipCosmetic:FireServer(item.slot, (not worn) and item.id or nil)
				elseif item.pass then
					Remotes.BuyPass:FireServer(item.pass)
				else
					Remotes.BuyCosmetic:FireServer(item.id)
				end
			end)
		end
	end
end

-- ロバックスのスペシャル（持っているものと、買えるものだけ）
local function refreshSpecial()
	for _, child in specialFrame:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
	if not lastState or not passesAvailable() then
		specialFrame.Visible = false
		return
	end
	specialFrame.Visible = true
	local order = 0
	Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, 0, 0, 30),
		Text = "⭐ " .. t("ui.special"),
		TextSize = 22,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, specialFrame)
	-- 子ども向け: ロバックスを使う物だと はっきり書く（買うときは Roblox の確認画面も出る）
	Style.label({
		LayoutOrder = 0,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		Text = "👪 " .. t("ui.askParents"),
		TextSize = 16,
		TextColor3 = C.AccentDark,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, specialFrame)
	-- 1行: 名前（大きく）＋ 中身（小さく）。買う前に 何が もらえるか 全部 見えるように
	local function specialRow(name: string, order: number, title: string, desc: string, color: Color3, onTap: () -> ())
		local row = Style.button({
			Name = name,
			LayoutOrder = order,
			Size = UDim2.new(1, -8, 0, 78),
			BackgroundColor3 = color,
			TextColor3 = C.Text,
			Text = "",
			ZIndex = 12,
		}, specialFrame)
		Style.label({
			Position = UDim2.fromOffset(14, 6),
			Size = UDim2.new(1, -28, 0, 36),
			Text = title,
			TextSize = 22,
			TextWrapped = false,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 13,
		}, row)
		Style.label({
			Position = UDim2.fromOffset(14, 42),
			Size = UDim2.new(1, -28, 0, 28),
			Text = desc,
			TextSize = 15,
			TextColor3 = C.TextMuted,
			TextXAlignment = Enum.TextXAlignment.Left,
			ZIndex = 13,
		}, row)
		row.Activated:Connect(onTap)
	end
	for key, pass in Config.Passes do
		if pass.id > 0 then
			order += 1
			local have = lastState.passes and lastState.passes[key] == true
			specialRow(
				key,
				order,
				pass.icon .. " " .. t("pass." .. key) .. (have and ("  ⭐ " .. t("ui.passOwned")) or ""),
				t("passDesc." .. key),
				have and C.Mint or C.Yellow,
				function()
					if not have then
						Remotes.BuyPass:FireServer(key)
					end
				end
			)
		end
	end
	for key, product in Config.Products do
		if product.id > 0 then
			order += 1
			specialRow(key, order, product.icon .. " " .. t("product." .. key), t("productDesc." .. key), C.Yellow, function()
				Remotes.BuyProduct:FireServer(key)
			end)
		end
	end
end

local function refresh()
	if not panel then
		return
	end
	refreshTabs()
	refreshGrid()
	refreshSpecial()
end

function CosmeticsUI.build(gui: ScreenGui, onClose: () -> ())
	local scroll
	panel, scroll = Style.modal(gui, "StylePanel", "👗 " .. t("ui.style"), onClose, Color3.fromRGB(255, 150, 200))
	Style.make("UIListLayout", { Padding = UDim.new(0, 10), SortOrder = Enum.SortOrder.LayoutOrder }, scroll)

	tabsFrame = Style.make("Frame", {
		Name = "Tabs",
		LayoutOrder = 1,
		Size = UDim2.new(1, -8, 0, 72),
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, scroll)
	Style.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, tabsFrame)
	for order, slot in Config.CosmeticSlots do
		local tab = Style.navButton({
			Name = slot,
			LayoutOrder = order,
			Size = UDim2.new(1 / #Config.CosmeticSlots, -6, 1, 0),
			BackgroundColor3 = C.Surface,
			Icon = SLOT_ICON[slot],
			Caption = t("slot." .. slot),
			ZIndex = 12,
		}, tabsFrame)
		tab.Activated:Connect(function()
			currentSlot = slot
			refresh()
		end)
	end

	hint = Style.label({
		Name = "Hint",
		LayoutOrder = 2,
		Size = UDim2.new(1, -8, 0, 26),
		Text = t("ui.tapToWear"),
		TextSize = 15,
		TextColor3 = C.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		ZIndex = 12,
	}, scroll)

	grid = Style.make("Frame", {
		Name = "Grid",
		LayoutOrder = 3,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		ZIndex = 12,
	}, scroll)
	Style.make("UIGridLayout", {
		CellSize = UDim2.fromOffset(112, 132),
		CellPadding = UDim2.fromOffset(10, 10),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)

	specialFrame = Style.make("Frame", {
		Name = "Special",
		LayoutOrder = 4,
		Size = UDim2.new(1, -8, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		Visible = false,
		ZIndex = 12,
	}, scroll)
	Style.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, specialFrame)
end

function CosmeticsUI.setVisible(visible: boolean)
	if not panel or visible == panel.Visible then
		return
	end
	panel.Visible = visible
	if visible then
		Style.pop(panel, 0.92)
		refresh()
	end
end

function CosmeticsUI.isVisible(): boolean
	return panel ~= nil and panel.Visible
end

function CosmeticsUI.update(state)
	lastState = state
	if panel and panel.Visible then
		refresh()
	end
end

return CosmeticsUI

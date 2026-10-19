-- 畑の「植える」「収穫」の小さなボタン。Robloxの標準の大きな吹き出しは、スマホでは畑の真ん中をふさぐので、
-- 畑の上に浮かぶ小さなボタンに置きかえる（ProximityPrompt の Style = Custom）。
-- デザイン:
--   ・左に白い丸の「絵」（植えるときは選んでいる種、収穫のときは実った作物）。何が起きるかが絵で分かる
--   ・右に「植える」「収穫」の大きな文字だけ（文字は短く、絵と文字の大きさをそろえる）
--   ・パソコンでは、角に小さな「E」のキー（押すキーを教える）
--   ・ゆっくり上下に浮かんで、目に入りやすくする
-- キーボードの E でも、これまでどおり動く。
local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local TextService = game:GetService("TextService")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage.Shared.Config)
local Icons = require(ReplicatedStorage.Shared.Icons)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)

local PromptUI = {}

local C = Style.Color
local t = I18n.t

local WIDTH, HEIGHT = 138, 50

local shown: { [ProximityPrompt]: { gui: BillboardGui, conns: { RBXScriptConnection }, tween: Tween } } = {}

local function isHarvest(prompt: ProximityPrompt): boolean
	return prompt.ActionText == t("prompt.harvest")
end

local function isWater(prompt: ProximityPrompt): boolean
	return prompt.ActionText == t("prompt.water") or prompt.ActionText == t("prompt.refill")
end

-- 絵: 収穫は畑の作物、植えるは選んでいる種（ObjectText に作物の名前が入っている）
local function isFertilize(prompt: ProximityPrompt): boolean
	return prompt.ActionText == t("prompt.fertilize")
end

local function isShop(prompt: ProximityPrompt): boolean
	return prompt.ActionText == t("prompt.shop")
end

-- お店ごとの絵（プロンプトの親の親が お店の Model）
local SHOP_ICON = { SeedShop = "🛒", EggForest = "🥚", ToolShop = "🔧" }
-- お店の絵（カタログのイラスト）
local SHOP_IMAGE = { SeedShop = "place_seedshop", EggForest = "place_eggforest", ToolShop = "place_toolshop" }

local function isDrop(prompt: ProximityPrompt): boolean
	return prompt.ActionText == t("prompt.drop")
end

-- ボタンの左の絵。（絵文字, イラストの名前）を返す。イラストは軽い 2D の絵（Shared.Icons）を使う
local function iconFor(prompt: ProximityPrompt): (string, string?)
	-- ひみつきちの出入りなど、プロンプトが自分の絵を持っているとき
	local own = prompt:GetAttribute("Icon")
	if type(own) == "string" then
		return own, nil
	end
	if isShop(prompt) then
		local shop = prompt.Parent and prompt.Parent.Parent
		local name = shop and shop.Name
		return name and SHOP_ICON[name] or "🛒", name and SHOP_IMAGE[name]
	end
	if isDrop(prompt) then
		return "🔮", "tool_drop"
	end
	if isWater(prompt) then
		return "💧", "tool_water"
	end
	if isFertilize(prompt) then
		return "🌟", "tool_fertilizer"
	end
	local tile = prompt.Parent
	local crop = tile and tile:GetAttribute("Crop")
	if isHarvest(prompt) and crop and Config.CropById[crop] then
		return Config.CropById[crop].icon, "crop_" .. crop
	end
	for _, c in Config.Crops do
		if t("crop." .. c.id) == prompt.ObjectText then
			return c.icon, "crop_" .. c.id
		end
	end
	return if isHarvest(prompt) then "🧺" else "🌱", nil
end

local function hide(prompt: ProximityPrompt)
	local entry = shown[prompt]
	if entry then
		for _, conn in entry.conns do
			conn:Disconnect()
		end
		entry.tween:Cancel()
		entry.gui:Destroy()
		shown[prompt] = nil
	end
end

local function show(prompt: ProximityPrompt)
	hide(prompt)
	local target = prompt.Parent
	if not (target and target:IsA("BasePart")) then
		return
	end
	local gui = Style.make("BillboardGui", {
		Name = "PromptButton",
		Adornee = target,
		Size = UDim2.fromOffset(WIDTH + 12, HEIGHT + 16), -- キーの印と影がはみ出す分の余白
		StudsOffset = Vector3.new(0, 3, 0),
		AlwaysOnTop = true,
		Active = true,
		ResetOnSpawn = false,
	}, Players.LocalPlayer:WaitForChild("PlayerGui"))

	local button = Style.button({
		Name = "Button",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromOffset(WIDTH, HEIGHT),
		Text = "",
	}, gui)
	button:FindFirstChildOfClass("UICorner").CornerRadius = UDim.new(0.5, 0)

	-- 左の白い丸と絵
	local badge = Style.make("Frame", {
		Name = "IconBadge",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 5, 0.5, 0),
		Size = UDim2.fromOffset(HEIGHT - 10, HEIGHT - 10),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = 2,
	}, button)
	Style.make("UICorner", { CornerRadius = UDim.new(0.5, 0) }, badge)
	Style.stroke(badge, C.Outline, 2)
	local icon = Style.label({
		Name = "Icon",
		Size = UDim2.fromScale(1, 1),
		TextSize = 24,
		TextWrapped = false,
		ZIndex = 3,
	}, badge)
	local iconImage = Style.make("ImageLabel", {
		Name = "IconImage",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.86, 0.86),
		BackgroundTransparency = 1,
		ScaleType = Enum.ScaleType.Fit,
		Visible = false,
		ZIndex = 3,
	}, badge)

	-- 右の文字（「植える」「収穫」だけ。短く大きく）
	local label = Style.label({
		Name = "Action",
		Position = UDim2.fromOffset(HEIGHT, 0),
		Size = UDim2.new(1, -HEIGHT - 10, 1, 0),
		TextSize = 22,
		TextWrapped = false,
		ZIndex = 2,
	}, button)

	-- パソコン: 押すキー「E」を右上の角に
	if UserInputService.KeyboardEnabled and not UserInputService.TouchEnabled then
		local key = Style.make("Frame", {
			Name = "Key",
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.new(1, -6, 0, 4),
			Size = UDim2.fromOffset(24, 24),
			BackgroundColor3 = C.Outline,
			ZIndex = 4,
		}, button)
		Style.round(key, 7)
		Style.stroke(key, Color3.fromRGB(255, 255, 255), 2)
		Style.label({
			Size = UDim2.fromScale(1, 1),
			Text = "E",
			TextSize = 15,
			TextColor3 = Color3.fromRGB(255, 255, 255),
			TextWrapped = false,
			ZIndex = 5,
		}, key)
	end

	local function refresh()
		local harvest = isHarvest(prompt)
		-- 植える=ミント / 収穫=黄色 / 水やり=水色
		button.BackgroundColor3 = if harvest then C.Yellow
			elseif isShop(prompt) then C.Mint
			elseif isDrop(prompt) then Color3.fromRGB(205, 180, 255)
			elseif isWater(prompt) then Color3.fromRGB(140, 200, 255)
			elseif isFertilize(prompt) then Color3.fromRGB(255, 225, 140)
			else C.Mint
		label.Text = prompt.ActionText
		-- 「しゅうかく」など 長い言葉でも 1行に 大きく出るよう、ボタンの はばを 文字に合わせる（2行に折れると読みにくい）
		local textWidth = TextService:GetTextSize(label.Text, 22, label.Font, Vector2.new(1000, 100)).X
		local width = math.max(WIDTH, HEIGHT + textWidth + 22)
		button.Size = UDim2.fromOffset(width, HEIGHT)
		gui.Size = UDim2.fromOffset(width + 12, HEIGHT + 16)
		local emoji, key = iconFor(prompt)
		local image = key and Icons[key]
		iconImage.Image = image or ""
		iconImage.Visible = image ~= nil
		icon.Text = if image then "" else emoji
	end
	refresh()
	Style.pop(button, 0.7)

	button.Activated:Connect(function()
		prompt:InputHoldBegin()
		prompt:InputHoldEnd()
	end)

	-- ゆっくり上下に浮かぶ
	local tween = TweenService:Create(
		gui,
		TweenInfo.new(0.9, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ StudsOffset = Vector3.new(0, 3.35, 0) }
	)
	tween:Play()

	shown[prompt] = {
		gui = gui,
		tween = tween,
		conns = {
			prompt:GetPropertyChangedSignal("ActionText"):Connect(refresh),
			prompt:GetPropertyChangedSignal("ObjectText"):Connect(refresh),
		},
	}
end

local function formatClock(seconds: number): string
	seconds = math.max(0, math.ceil(seconds))
	return string.format("%d:%02d", seconds // 60, seconds % 60)
end

-- ui: お店の画面を開くため（UI.showPanel）
function PromptUI.init(ui)
	-- ひろばの ふんすい（水くみ）の文字（端末の言語で）
	task.spawn(function()
		local fountain = workspace:WaitForChild("WaterFountain", 30)
		local spot = fountain and fountain:WaitForChild("Spot", 30)
		local prompt = spot and spot:WaitForChild("Prompt", 30)
		if prompt then
			prompt.ActionText = t("prompt.refill")
			prompt.ObjectText = ""
		end
	end)
	-- お店: 近づくと「お店」ボタン。押すと、そのお店の画面を開く（たまご・どうぐは、そこでしか買えない）
	for modelName, panelName in { SeedShop = "shop", EggForest = "eggs", ToolShop = "tools" } do
		task.spawn(function()
			local shop = workspace:WaitForChild(modelName, 30)
			local spot = shop and shop:WaitForChild("Spot", 30)
			local prompt = spot and spot:WaitForChild("Prompt", 30)
			if prompt then
				prompt.ActionText = t("prompt.shop")
				prompt.ObjectText = ""
				prompt.Triggered:Connect(function()
					ui.showPanel(panelName)
				end)
				-- たまご・どうぐのお店から はなれたら、画面を閉じる（種屋は🛒ボタンからも開けるので、そのまま）
				ProximityPromptService.PromptHidden:Connect(function(hidden)
					if hidden == prompt and panelName ~= "shop" and ui.currentPanel == panelName then
						ui.showPanel(nil)
					end
				end)
			end
		end)
	end
	-- 看板の文字（TextLabel の属性 I18n）を、その人の言語で入れる。矢印つきの道しるべも
	local function localize(label: Instance)
		if label:IsA("TextLabel") and label:GetAttribute("I18n") then
			local text = t(label:GetAttribute("I18n"))
			local arrow = label:GetAttribute("Arrow")
			if arrow then
				text = if label:GetAttribute("ArrowFirst") then arrow .. " " .. text else text .. " " .. arrow
			end
			label.Text = text
		end
	end
	for _, d in workspace:GetDescendants() do
		localize(d)
	end
	workspace.DescendantAdded:Connect(function(d)
		task.defer(localize, d)
	end)
	-- ひろばの たねや の看板に「つぎの入荷まで」
	task.spawn(function()
		local shop = workspace:WaitForChild("SeedShop", 30)
		local board = shop and shop:WaitForChild("Board", 30)
		local sign = board and board:WaitForChild("Sign", 30)
		if not sign then
			return
		end
		sign:WaitForChild("Title").Text = t("ui.shopSign")
		local timer = sign:WaitForChild("Timer")
		while sign.Parent do
			local now = workspace:GetServerTimeNow()
			local nextAt = (Config.seedRound(now) + 1) * Config.SeedShop.restockSeconds
			timer.Text = t("ui.restockIn", formatClock(nextAt - now))
			task.wait(1)
		end
	end)
	ProximityPromptService.PromptShown:Connect(function(prompt)
		-- やくそくの鉢: 持ち主にだけ「水やり」を出す（ほかの人の鉢には出さない）
		if prompt.Name == "PromisePrompt" then
			if prompt:GetAttribute("OwnerUserId") ~= Players.LocalPlayer.UserId then
				prompt.Enabled = false
				return
			end
			prompt.ActionText = t("prompt.water")
		end
		-- ひみつきちの「はいる」は 持ち主にだけ出す（ほかの人の へやには入れない）
		if prompt.Name == "RoomPrompt" and prompt:GetAttribute("OwnerUserId") ~= nil
			and prompt:GetAttribute("OwnerUserId") ~= Players.LocalPlayer.UserId then
			prompt.Enabled = false
			return
		end
		-- 文字を その人の言葉にする（ひみつきちの「はいる」「でる」など）
		local key = prompt:GetAttribute("I18n")
		if type(key) == "string" then
			prompt.ActionText = t(key)
		end
		if prompt.Style == Enum.ProximityPromptStyle.Custom then
			show(prompt)
		end
	end)
	ProximityPromptService.PromptHidden:Connect(hide)
end

return PromptUI

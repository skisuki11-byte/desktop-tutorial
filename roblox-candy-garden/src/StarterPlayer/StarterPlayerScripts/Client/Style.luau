-- UIの見た目の部品。色・角丸・縁取り・動きをここに集める（一貫性のため）。
-- 方針（子供が触りやすい）:
--   ・太い縁取り＋上が明るい立体感のボタン（押せると分かる）
--   ・丸いフォント、短い文字、大きなアイコン（絵文字）
--   ・タップ領域は大きく（64px前後）、押したら弾む
--   ・アクセントはピンク1色。文字は濃い紫で、背景とのコントラストを確保
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local TextService = game:GetService("TextService")

local Icons = require(ReplicatedStorage.Shared.Icons)

local CatalogViewport = require(script.Parent.CatalogViewport)
local Style = {}

-- レア度（★1〜★7）の色。カタログ（docs/candy-garden-catalog.html の tier-1〜7）と同じ色にそろえる。
-- ★1 グレー、★2 みどり、★3 あお、★4 むらさき、★5 きん、★6 よぞらのこん、★7 ゆめいろピンク。
-- 色だけに頼らず、必ず「★いくつ」の文字も一緒に出す
Style.Rarity = {
	Color3.fromHex("8f99a4"),
	Color3.fromHex("54a57f"),
	Color3.fromHex("538bc3"),
	Color3.fromHex("a576cf"),
	Color3.fromHex("d4a03b"),
	Color3.fromHex("5a4d91"),
	Color3.fromHex("d077a8"),
}

Style.Color = {
	Accent = Color3.fromRGB(255, 111, 168), -- 主役のピンク（1画面に主役は1つ）
	AccentDark = Color3.fromRGB(214, 70, 128),
	Surface = Color3.fromRGB(255, 246, 251),
	Text = Color3.fromRGB(74, 43, 92),
	TextMuted = Color3.fromRGB(134, 100, 150),
	Mint = Color3.fromRGB(120, 220, 180),
	Yellow = Color3.fromRGB(255, 210, 77),
	Lilac = Color3.fromRGB(196, 168, 255),
	Dim = Color3.fromRGB(235, 220, 232),
	Outline = Color3.fromRGB(96, 56, 120), -- 太い縁取りの色
}

Style.Font = Enum.Font.FredokaOne
Style.TapSize = 64 -- タップ領域の最小の目安（モバイルの指でも押しやすい大きさ）

function Style.make(className: string, props: { [string]: any }, parent: Instance?): any
	local inst = Instance.new(className)
	for k, v in props do
		inst[k] = v
	end
	inst.Parent = parent
	return inst
end

function Style.round(target: Instance, radius: number)
	Style.make("UICorner", { CornerRadius = UDim.new(0, radius) }, target)
end

function Style.stroke(target: Instance, color: Color3, thickness: number): UIStroke
	return Style.make("UIStroke", {
		Color = color,
		Thickness = thickness,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	}, target)
end

-- 文字の縁取り（明るい文字を見やすくする）
function Style.textStroke(target: Instance, color: Color3?, thickness: number?): UIStroke
	return Style.make("UIStroke", {
		Name = "TextStroke",
		Color = color or Style.Color.Outline,
		Thickness = thickness or 2,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual,
	}, target)
end

-- 上が明るく下が少し濃い、ふっくらした立体感
function Style.gloss(target: Instance)
	Style.make("UIGradient", {
		Name = "Gloss",
		Color = ColorSequence.new(Color3.fromRGB(255, 255, 255), Color3.fromRGB(214, 206, 220)),
		Rotation = 90,
	}, target)
end

-- 控えめな影（公式の UIShadow）。大きすぎる影は「にじんで見える」ので、小さく・少し下に
function Style.shadow(target: Instance, offsetY: number?, transparency: number?)
	pcall(function()
		Style.make("UIShadow", {
			Name = "Shadow",
			Color = Style.Color.Outline,
			Transparency = transparency or 0.45,
			Offset = UDim2.fromOffset(0, offsetY or 5),
			BlurRadius = UDim.new(0, 3),
		}, target)
	end)
end

-- 注目してほしいときだけ付ける赤い「!」（バッジの乱用は避ける）
function Style.badge(target: GuiObject): Frame
	local badge = Style.make("Frame", {
		Name = "Badge",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, 8, 0, -8),
		Size = UDim2.fromOffset(28, 28),
		BackgroundColor3 = Color3.fromRGB(255, 70, 90),
		Visible = false,
		ZIndex = (target.ZIndex or 1) + 3,
	}, target)
	Style.make("UICorner", { CornerRadius = UDim.new(0.5, 0) }, badge)
	Style.make("UIStroke", { Color = Color3.fromRGB(255, 255, 255), Thickness = 3 }, badge)
	local mark = Style.make("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Font = Style.Font,
		Text = "!",
		TextSize = 20,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		ZIndex = badge.ZIndex + 1,
	}, badge)
	return badge
end

-- 「NEW」の札（Style.badge と同じ名前 "Badge" なので、とじたメニューにも「!」が出る）
function Style.newBadge(target: GuiObject): Frame
	local badge = Style.badge(target)
	badge.Size = UDim2.fromOffset(46, 24)
	badge.BackgroundColor3 = Color3.fromRGB(255, 120, 60)
	local mark = badge:FindFirstChildOfClass("TextLabel")
	if mark then
		mark.Text = "NEW"
		mark.TextSize = 14
	end
	return badge
end

-- 数字がふわっと数え上がる（増えたことが目で分かる）
local counters: { [TextLabel]: NumberValue } = {}
function Style.countTo(label: TextLabel, from: number, to: number, format: (number) -> string)
	local value = counters[label]
	if not value then
		value = Instance.new("NumberValue")
		counters[label] = value
		value.Changed:Connect(function(v)
			label.Text = format(v)
		end)
	end
	value.Value = from
	TweenService:Create(value, TweenInfo.new(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Value = to }):Play()
end

local function isLight(color: Color3): boolean
	return (color.R * 0.299 + color.G * 0.587 + color.B * 0.114) > 0.8
end

-- 文字が枠に入りきらないときだけ、自動で小さくする（スマホの縦持ちなど、狭い画面で見切れないように）。
-- 入るときは指定の大きさのまま。大きさが自動で変わる枠（AutomaticSize）は対象外
function Style.fitText(obj: TextLabel | TextButton)
	if obj.AutomaticSize ~= Enum.AutomaticSize.None then
		return
	end
	local limit = obj:FindFirstChild("FitText")
	if not limit then
		limit = Style.make("UITextSizeConstraint", { Name = "FitText", MinTextSize = 9 }, obj)
	end
	limit.MaxTextSize = math.max(9, obj.TextSize)
	obj.TextScaled = true
end

-- あとから文字の大きさを変えるとき用（fitText をかけた文字は TextSize では変わらないため）
function Style.setTextSize(obj: TextLabel | TextButton, size: number)
	obj.TextSize = size
	local limit = obj:FindFirstChild("FitText")
	if limit then
		limit.MaxTextSize = math.max(9, size)
	end
end

function Style.label(props: { [string]: any }, parent: Instance?): TextLabel
	local base = {
		BackgroundTransparency = 1,
		Font = Style.Font,
		TextColor3 = Style.Color.Text,
		TextSize = 20,
		TextWrapped = true,
	}
	for k, v in props do
		base[k] = v
	end
	local label = Style.make("TextLabel", base, parent)
	if isLight(label.TextColor3) then
		Style.textStroke(label)
	end
	Style.fitText(label)
	return label
end

-- 押したとき・変化したときの小さな弾み
-- 大きさの倍率は1つの UIScale（FitScale）にまとめる（UIScale が2つあると片方しか効かないため）。
-- 「基本の倍率」は属性 Base に持ち、弾む動きはその倍率を中心に動かす
local function scaleObj(target: GuiObject): UIScale
	local scale = target:FindFirstChild("FitScale")
	if not scale then
		local old = target:FindFirstChild("PopScale")
		if old then
			old:Destroy()
		end
		scale = Style.make("UIScale", { Name = "FitScale" }, target)
		scale:SetAttribute("Base", 1)
	end
	return scale
end

-- 画面の大きさに合わせた倍率を決める（弾む動きと両立する）
function Style.setScale(target: GuiObject, value: number)
	local scale = scaleObj(target)
	scale:SetAttribute("Base", value)
	scale.Scale = value
end

local function baseOf(scale: UIScale): number
	return scale:GetAttribute("Base") or 1
end

-- 押したとき・変化したときの小さな弾み
function Style.pop(target: GuiObject, amount: number?)
	local scale = scaleObj(target)
	local base = baseOf(scale)
	scale.Scale = base * (amount or 1.12)
	TweenService:Create(scale, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = base }):Play()
end

local function pressFeedback(button: TextButton)
	button.MouseButton1Down:Connect(function()
		local scale = scaleObj(button)
		TweenService:Create(scale, TweenInfo.new(0.08), { Scale = baseOf(scale) * 0.93 }):Play()
	end)
	local function release()
		local scale = scaleObj(button)
		TweenService:Create(scale, TweenInfo.new(0.18, Enum.EasingStyle.Back), { Scale = baseOf(scale) }):Play()
	end
	button.MouseButton1Up:Connect(release)
	button.MouseLeave:Connect(release)
	-- 押したら小さな音（Sounds が Style.onTap を入れる）
	button.Activated:Connect(function()
		if Style.onTap then
			Style.onTap()
		end
	end)
end

Style.onTap = nil :: (() -> ())?

-- 太い縁取りの押せるボタン。文字が明るい色なら文字にも縁取りを付ける
function Style.button(props: { [string]: any }, parent: Instance?): TextButton
	local base = {
		AutoButtonColor = false,
		BackgroundColor3 = Style.Color.Accent,
		Font = Style.Font,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextSize = 22,
		Text = "",
	}
	for k, v in props do
		base[k] = v
	end
	local button = Style.make("TextButton", base, parent)
	Style.round(button, 18)
	Style.stroke(button, Style.Color.Outline, 4)
	Style.gloss(button)
	Style.shadow(button)
	if isLight(button.TextColor3) then
		Style.textStroke(button)
	end
	Style.fitText(button)
	pressFeedback(button)
	return button
end

-- 下の操作ボタン用。上に大きなアイコン、下に短い名前
function Style.navButton(props: { [string]: any }, parent: Instance?): TextButton
	local icon = props.Icon
	local caption = props.Caption
	local captionColor = props.CaptionColor
	local captionSize = props.CaptionSize
	local iconSize = props.IconSize
	props.Icon, props.Caption, props.CaptionColor, props.CaptionSize, props.IconSize = nil, nil, nil, nil, nil
	props.Text = ""
	props.TextColor3 = props.TextColor3 or Style.Color.Text
	local button = Style.button(props, parent)
	Style.label({
		Name = "Icon",
		Position = UDim2.fromScale(0, 0.04),
		Size = UDim2.fromScale(1, 0.58),
		Text = icon,
		TextSize = iconSize or 36,
		TextWrapped = false,
	}, button)
	local captionLabel = Style.label({
		Name = "Caption",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 0.97),
		Size = UDim2.new(1, -4, 0.34, 0),
		Text = caption,
		TextSize = captionSize or 15,
		TextWrapped = false,
		TextColor3 = captionColor or Style.Color.Text,
	}, button)
	-- 名前は かならず 1行（「しゅうかく」が「しゅうか／く」に ならないように）。
	-- TextScaled は 入りきらないと 改行して しまうので 使わず、はばに 入る 大きさを 自分で 計算する
	local fit = captionLabel:FindFirstChild("FitText")
	if fit then
		fit:Destroy()
	end
	captionLabel.TextScaled = false
	captionLabel.TextWrapped = false
	local maxSize = captionSize or 15
	local function fitCaption()
		local box = captionLabel.AbsoluteSize
		-- UIScale の倍率（ボタンの もとの はば と、画面での はば の比）
		local scale = if button.Size.X.Offset > 0 then button.AbsoluteSize.X / button.Size.X.Offset else 1
		if box.X <= 0 or box.Y <= 0 or scale <= 0 then
			return
		end
		local width = TextService:GetTextSize(captionLabel.Text, 100, captionLabel.Font, Vector2.new(10000, 1000)).X / 100
		-- 字の大きさは UIScale を かける前の 単位（box を scale で わって もどす）
		local size = math.min(maxSize, (box.X / scale) / math.max(width, 0.01), (box.Y / scale) * 0.95)
		captionLabel.TextSize = math.max(6, math.floor(size))
	end
	captionLabel:GetPropertyChangedSignal("AbsoluteSize"):Connect(fitCaption)
	captionLabel:GetPropertyChangedSignal("Text"):Connect(fitCaption)
	task.defer(fitCaption)
	return button
end

-- 左上の「いまの ようす」カード（みんなの木・お天気・ラッシュ など）。どのカードも 同じ形にそろえる:
--   [絵]  小さい見出し（うすい色）        右はしの小さい数字
--         大きい中身（こい色・太字） または 進みぐあいの バー
-- 大きさ・角・すき間は 8 の倍数（8ptグリッド）。色を ぬるのは 気づいてほしい カードだけ（Style.cardTone）
Style.Card = { Width = 248, Height = 56, Radius = 14, Gap = 8 }

function Style.infoCard(props: { Name: string, Accent: Color3, Bar: boolean?, Button: boolean? }, parent: Instance?)
	local card = Style.make(if props.Button then "TextButton" else "Frame", {
		Name = props.Name,
		Size = UDim2.fromOffset(Style.Card.Width, Style.Card.Height),
		BackgroundColor3 = Color3.fromRGB(255, 255, 255),
		Visible = false,
	}, parent)
	if props.Button then
		card.Text = ""
		card.AutoButtonColor = false
	end
	Style.round(card, Style.Card.Radius)
	local stroke = Style.stroke(card, props.Accent, 2)
	stroke.Name = "Edge"
	-- 左の 色の帯（どの種類の カードか 色で わかる。色だけに たよらず 絵と 文字も つける）
	local stripe = Style.make("Frame", {
		Name = "Stripe",
		Position = UDim2.fromOffset(0, 0),
		Size = UDim2.new(0, 6, 1, 0),
		BackgroundColor3 = props.Accent,
		BorderSizePixel = 0,
	}, card)
	Style.round(stripe, 3)
	local icon = Style.make("Frame", {
		Name = "IconBox",
		Position = UDim2.fromOffset(14, 8),
		Size = UDim2.fromOffset(40, 40),
		BackgroundTransparency = 1,
	}, card)
	local emoji = Style.label({ Name = "Emoji", Size = UDim2.fromScale(1, 1), TextSize = 28, Text = "", TextWrapped = false }, icon)
	local image = Style.make("ImageLabel", {
		Name = "Image",
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		ScaleType = Enum.ScaleType.Fit,
		Visible = false,
	}, icon)
	local title = Style.label({
		Name = "Title",
		Position = UDim2.fromOffset(62, 8),
		Size = UDim2.new(1, -70, 0, 17),
		TextSize = 15,
		TextColor3 = Style.Color.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		Text = "",
	}, card)
	local right = Style.label({
		Name = "Right",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 8),
		Size = UDim2.new(0.45, 0, 0, 17),
		TextSize = 14,
		TextColor3 = Style.Color.TextMuted,
		TextXAlignment = Enum.TextXAlignment.Right,
		TextWrapped = false,
		Text = "",
	}, card)
	local value = Style.label({
		Name = "Value",
		Position = UDim2.fromOffset(62, 26),
		Size = UDim2.new(1, -72, 0, 22),
		TextSize = 20,
		TextColor3 = Style.Color.Text,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		Text = "",
	}, card)
	local fill
	if props.Bar then
		value.Visible = false
		local track = Style.make("Frame", {
			Name = "Track",
			Position = UDim2.fromOffset(62, 32),
			Size = UDim2.new(1, -74, 0, 12),
			BackgroundColor3 = Style.Color.Dim,
			BorderSizePixel = 0,
		}, card)
		Style.round(track, 6)
		fill = Style.make("Frame", {
			Name = "Fill",
			Size = UDim2.fromScale(0, 1),
			BackgroundColor3 = props.Accent,
			BorderSizePixel = 0,
		}, track)
		Style.round(fill, 6)
	end
	return card, { Emoji = emoji, Image = image, Title = title, Right = right, Value = value, Fill = fill, Accent = props.Accent }
end

-- カードの色: "normal"（白地）/ "alert"（色でぬる。白い文字）。気づいてほしいとき（ラッシュ中・しょんぼり雲）だけ alert
function Style.cardTone(card: GuiObject, parts, tone: string)
	local alert = tone == "alert"
	card.BackgroundColor3 = if alert then parts.Accent else Color3.fromRGB(255, 255, 255)
	local white = Color3.fromRGB(255, 255, 255)
	parts.Title.TextColor3 = if alert then white else Style.Color.TextMuted
	parts.Value.TextColor3 = if alert then white else Style.Color.Text
	parts.Right.TextColor3 = if alert then white else Style.Color.TextMuted
	for _, label in { parts.Title, parts.Value, parts.Right } do
		local stroke = label:FindFirstChild("TextStroke")
		if stroke then
			stroke.Enabled = alert
		elseif alert then
			Style.textStroke(label, Style.Color.Outline, 1.5)
		end
	end
	local stripe = card:FindFirstChild("Stripe")
	if stripe then
		stripe.Visible = not alert
	end
end

-- ショップ・ペット・おしゃれ等で共通の、大きなパネル。画面の大きさに合わせて広がり、上限で止まる。
-- 上に色帯（リボン）のタイトル。閉じるボタンは、どのパネルでも同じ「右上の角」に置く（一貫性）。
-- color: 色帯の色（下のドックのボタンと同じ色にして、どのボタンから開いたか分かるようにする）
-- 戻り値: パネル, 中身を入れるスクロール枠
function Style.modal(gui: Instance, name: string, title: string, onClose: () -> (), color: Color3?): (Frame, ScrollingFrame)
	local headerColor = color or Style.Color.Accent
	local panel = Style.make("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		-- 開いている間は下のドックを隠す（UI.showPanel）ので、画面の高さを広く使える
		Position = UDim2.fromScale(0.5, 0.52),
		Size = UDim2.fromScale(0.92, 0.84),
		BackgroundColor3 = Style.Color.Surface,
		Visible = false,
		ZIndex = 10,
	}, gui)
	Style.round(panel, 28)
	Style.stroke(panel, Style.Color.Outline, 6)
	Style.shadow(panel, 8, 0.35)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(560, 600) }, panel)
	-- うっすら下がピンクになる背景
	Style.make("UIGradient", {
		Color = ColorSequence.new(Color3.fromRGB(255, 255, 255), Color3.fromRGB(255, 232, 242)),
		Rotation = 90,
	}, panel)

	-- 色帯のタイトル（下側の角は四角くして、パネル本体とつなげる）
	local header = Style.make("Frame", {
		Name = "Header",
		Size = UDim2.new(1, 0, 0, 66),
		BackgroundColor3 = headerColor,
		ZIndex = 11,
	}, panel)
	Style.round(header, 24)
	Style.gloss(header)
	local filler = Style.make("Frame", {
		Name = "Filler",
		Position = UDim2.new(0, 0, 1, -24),
		Size = UDim2.new(1, 0, 0, 24),
		BackgroundColor3 = headerColor,
		BorderSizePixel = 0,
		ZIndex = 11,
	}, header)
	Style.make("UIGradient", {
		Color = ColorSequence.new(Color3.fromRGB(226, 220, 230), Color3.fromRGB(214, 206, 220)),
		Rotation = 90,
	}, filler)
	Style.make("Frame", {
		Name = "Line",
		Position = UDim2.new(0, 0, 1, 0),
		Size = UDim2.new(1, 0, 0, 5),
		BackgroundColor3 = Style.Color.Outline,
		BorderSizePixel = 0,
		ZIndex = 12,
	}, header)
	Style.label({
		Position = UDim2.fromOffset(22, 4),
		Size = UDim2.new(1, -110, 1, -8),
		Text = title,
		TextSize = 32,
		TextColor3 = Color3.fromRGB(255, 255, 255),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 13,
	}, header)

	-- 閉じるボタン: 右上の角に少しはみ出させる（見つけやすく、押しやすい）
	local close = Style.button({
		Name = "Close",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.new(1, -16, 0, 14),
		Size = UDim2.fromOffset(60, 60),
		BackgroundColor3 = Color3.fromRGB(255, 95, 110),
		Text = "X", -- 「✕」はこの環境のフォントに無かったので、ふつうのXにする
		TextSize = 34,
		ZIndex = 15,
	}, panel)
	close:FindFirstChildOfClass("UICorner").CornerRadius = UDim.new(0.5, 0)
	close.Activated:Connect(onClose)

	local scroll = Style.make("ScrollingFrame", {
		Name = "Scroll",
		Position = UDim2.fromOffset(14, 84),
		Size = UDim2.new(1, -28, 1, -98),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ZIndex = 11,
	}, panel)
	-- 内側の余白: カードの太い縁取りと影が、スクロール枠の端で切れないようにする
	Style.make("UIPadding", {
		PaddingLeft = UDim.new(0, 8),
		PaddingRight = UDim.new(0, 14), -- 右はスクロールバーのぶん広め
		PaddingTop = UDim.new(0, 8),
		PaddingBottom = UDim.new(0, 12),
	}, scroll)

	-- スマホの横持ち（横に長く、高さが低い画面）では:
	--   ・カードを画面いっぱいに広げる（はば最大 880）。タイトルの帯を細くして、中身を見える所を広くする
	--   ・行（種・道具・家具 など）を 2列に ならべる（1画面に見える数を ふやす。スクロールを へらす）
	-- 自分で配置を決めている画面（ずかん など）は panel の属性 OwnLayout で のぞく
	local limit = panel:FindFirstChildOfClass("UISizeConstraint")
	local titleLabel = header:FindFirstChildOfClass("TextLabel")
	local shifted = false
	local function isRow(c: Instance): boolean
		if c:GetAttribute("HalfRow") == true then
			return true -- 高さが 中身で決まるカード（たまご など）は、作るときに この印をつける
		end
		if not c:IsA("Frame") or c.AutomaticSize ~= Enum.AutomaticSize.None then
			return false
		end
		local size = c.Size
		return size.X.Scale == 1 and size.Y.Scale == 0 and size.Y.Offset >= 76 and size.Y.Offset <= 160
			and not c:FindFirstChildOfClass("UIGridLayout") and not c:FindFirstChildOfClass("UIListLayout")
	end
	local function setRow(c: Instance, half: boolean)
		if not c:IsA("GuiObject") then
			return
		end
		if half then
			if c:GetAttribute("FullOffsetX") == nil and isRow(c) then
				c:SetAttribute("FullOffsetX", c.Size.X.Offset)
				c.Size = UDim2.new(0.5, -8, 0, c.Size.Y.Offset)
			end
		elseif c:GetAttribute("FullOffsetX") ~= nil then
			c.Size = UDim2.new(1, c:GetAttribute("FullOffsetX"), 0, c.Size.Y.Offset)
			c:SetAttribute("FullOffsetX", nil)
		end
	end
	local twoColumns = false
	local function relayout()
		if panel:GetAttribute("OwnLayout") then
			return
		end
		local screen = gui:IsA("GuiBase2d") and gui.AbsoluteSize or Vector2.new(1000, 800)
		local short = screen.Y < 480 and screen.X > screen.Y
		if short ~= shifted then
			shifted = short
			local shift = if short then 28 else -28
			header.Size = UDim2.new(1, 0, 0, if short then 46 else 66)
			if titleLabel then
				Style.setTextSize(titleLabel, if short then 24 else 32)
			end
			close.Size = UDim2.fromOffset(if short then 46 else 60, if short then 46 else 60)
			close.Position = if short then UDim2.new(1, -18, 0, 23) else UDim2.new(1, -16, 0, 14)
			scroll.Position = scroll.Position - UDim2.fromOffset(0, shift)
			scroll.Size = scroll.Size + UDim2.fromOffset(0, shift)
			-- タイトルの下に 固定している 文字や ボタン（「あした また来るよ」など）も、同じだけ 上へ
			for _, c in panel:GetChildren() do
				if c:IsA("GuiObject") and c ~= header and c ~= close and c ~= scroll
					and c.Position.Y.Scale == 0 and c.Position.Y.Offset >= 60 then
					c.Position = c.Position - UDim2.fromOffset(0, shift)
				end
			end
		end
		panel.Position = if short then UDim2.fromScale(0.5, 0.5) else UDim2.fromScale(0.5, 0.52)
		panel.Size = if short then UDim2.new(1, -36, 1, -14) else UDim2.fromScale(0.92, 0.84)
		if limit then
			limit.MaxSize = if short then Vector2.new(880, 600) else Vector2.new(560, 600)
		end
		-- 2列にするのは、行が ならぶ画面で、はばが じゅうぶんあるときだけ
		local list = scroll:FindFirstChildOfClass("UIListLayout")
		local want = short and list ~= nil and scroll.AbsoluteSize.X >= 600
		if want ~= twoColumns and list then
			twoColumns = want
			list.FillDirection = if want then Enum.FillDirection.Horizontal else Enum.FillDirection.Vertical
			list.Wraps = want
			for _, c in scroll:GetChildren() do
				setRow(c, want)
			end
		end
	end
	scroll.ChildAdded:Connect(function(c)
		if twoColumns then
			task.defer(setRow, c, true) -- あとから作られる行（家具・種の入荷 など）も 2列に
		end
	end)
	if gui:IsA("GuiBase2d") then
		gui:GetPropertyChangedSignal("AbsoluteSize"):Connect(relayout)
	end
	scroll:GetPropertyChangedSignal("AbsoluteSize"):Connect(relayout)
	task.defer(relayout)
	return panel, scroll
end

-- アイコンを出す。イラスト（Shared.Icons）があれば絵を、なければ絵文字（fallback）を出す。
-- label = アイコン用の TextLabel（大きさ・位置はそのまま。絵はその枠いっぱいに、形をくずさず入れる）。
-- dim = まだ会っていない物を、シルエット（黒いかげ）で出すとき
function Style.setIcon(label: TextLabel, key: string?, fallback: string?, dim: boolean?)
	local id = if key then Icons[key] else nil
	if CatalogViewport.attach(label,key,dim) then
		label.Text=""
		local oldImage=label:FindFirstChild("IconImage")
		-- 3Dの色が届くまでは、2Dの絵を出しておく（届いたら 3Dの側で かくす）
		if CatalogViewport.isReady(label) or not id then
			if oldImage then oldImage.Visible=false end
			return
		end
	end
	local image = label:FindFirstChild("IconImage") :: ImageLabel?
	if id then
		label.Text = ""
		if not image then
			image = Style.make("ImageLabel", {
				Name = "IconImage",
				AnchorPoint = Vector2.new(0.5, 0.5),
				Position = UDim2.fromScale(0.5, 0.5),
				Size = UDim2.fromScale(1, 1),
				BackgroundTransparency = 1,
				ScaleType = Enum.ScaleType.Fit,
				ZIndex = label.ZIndex,
			}, label)
		end
		image.Image = id
		image.Visible = true
		image.ImageTransparency = if dim then 0.35 else 0
		image.ImageColor3 = if dim then Color3.new(0, 0, 0) else Color3.new(1, 1, 1)
	else
		label.Text = fallback or ""
		if image then
			image.Visible = false
		end
	end
end

function Style.formatNumber(n: number): string
	local s = tostring(math.floor(n))
	local formatted = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	return (formatted:gsub("^,", ""))
end

return Style

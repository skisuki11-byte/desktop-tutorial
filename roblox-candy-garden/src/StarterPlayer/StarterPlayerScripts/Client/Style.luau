-- UIの見た目の部品。色・角丸・縁取り・動きをここに集める（一貫性のため）。
-- 方針（子供が触りやすい）:
--   ・太い縁取り＋上が明るい立体感のボタン（押せると分かる）
--   ・丸いフォント、短い文字、大きなアイコン（絵文字）
--   ・タップ領域は大きく（64px前後）、押したら弾む
--   ・アクセントはピンク1色。文字は濃い紫で、背景とのコントラストを確保
local TweenService = game:GetService("TweenService")

local Style = {}

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

local function isLight(color: Color3): boolean
	return (color.R * 0.299 + color.G * 0.587 + color.B * 0.114) > 0.8
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
	return label
end

-- 押したとき・変化したときの小さな弾み
function Style.pop(target: GuiObject, amount: number?)
	local scale = target:FindFirstChild("PopScale")
	if not scale then
		scale = Style.make("UIScale", { Name = "PopScale" }, target)
	end
	scale.Scale = amount or 1.12
	TweenService:Create(scale, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = 1 }):Play()
end

local function pressFeedback(button: TextButton)
	local function scale(): UIScale
		local s = button:FindFirstChild("PopScale")
		if not s then
			s = Style.make("UIScale", { Name = "PopScale" }, button)
		end
		return s
	end
	button.MouseButton1Down:Connect(function()
		TweenService:Create(scale(), TweenInfo.new(0.08), { Scale = 0.93 }):Play()
	end)
	local function release()
		TweenService:Create(scale(), TweenInfo.new(0.18, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	end
	button.MouseButton1Up:Connect(release)
	button.MouseLeave:Connect(release)
end

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
	if isLight(button.TextColor3) then
		Style.textStroke(button)
	end
	pressFeedback(button)
	return button
end

-- 下の操作ボタン用。上に大きなアイコン、下に短い名前
function Style.navButton(props: { [string]: any }, parent: Instance?): TextButton
	local icon = props.Icon
	local caption = props.Caption
	local captionColor = props.CaptionColor
	props.Icon, props.Caption, props.CaptionColor = nil, nil, nil
	props.Text = ""
	props.TextColor3 = props.TextColor3 or Style.Color.Text
	local button = Style.button(props, parent)
	Style.label({
		Name = "Icon",
		Position = UDim2.fromScale(0, 0.04),
		Size = UDim2.fromScale(1, 0.58),
		Text = icon,
		TextSize = 36,
		TextWrapped = false,
	}, button)
	Style.label({
		Name = "Caption",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 0.97),
		Size = UDim2.new(1, -6, 0.34, 0),
		Text = caption,
		TextSize = 15,
		TextWrapped = false,
		TextColor3 = captionColor or Style.Color.Text,
	}, button)
	return button
end

-- ショップ・ペット・おしゃれ で共通の、大きなパネル。画面の大きさに合わせて広がり、上限で止まる。
-- 戻り値: パネル, 中身を入れるスクロール枠
function Style.modal(gui: Instance, name: string, title: string, onClose: () -> ()): (Frame, ScrollingFrame)
	local panel = Style.make("Frame", {
		Name = name,
		AnchorPoint = Vector2.new(0.5, 0.5),
		-- 開いている間は下のドックを隠す（UI.showPanel）ので、画面の高さを広く使える
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.94, 0.88),
		BackgroundColor3 = Style.Color.Surface,
		Visible = false,
		ZIndex = 10,
	}, gui)
	Style.round(panel, 28)
	Style.stroke(panel, Style.Color.Outline, 6)
	Style.make("UISizeConstraint", { MaxSize = Vector2.new(560, 600) }, panel)

	Style.label({
		Position = UDim2.fromOffset(20, 10),
		Size = UDim2.new(1, -110, 0, 56),
		Text = title,
		TextSize = 32,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = false,
		ZIndex = 11,
	}, panel)

	local close = Style.button({
		Name = "Close",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -12, 0, 10),
		Size = UDim2.fromOffset(Style.TapSize, 56),
		BackgroundColor3 = Color3.fromRGB(255, 140, 150),
		Text = "X", -- 「✕」はこの環境のフォントに無かったので、ふつうのXにする
		TextSize = 34,
		ZIndex = 11,
	}, panel)
	close.Activated:Connect(onClose)

	local scroll = Style.make("ScrollingFrame", {
		Name = "Scroll",
		Position = UDim2.fromOffset(14, 76),
		Size = UDim2.new(1, -28, 1, -90),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ZIndex = 11,
	}, panel)
	return panel, scroll
end

function Style.formatNumber(n: number): string
	local s = tostring(math.floor(n))
	local formatted = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	return (formatted:gsub("^,", ""))
end

return Style

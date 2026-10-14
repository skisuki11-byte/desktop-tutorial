-- UIの見た目の部品。色・角丸・縁取り・動きをここに集める（一貫性のため）。
-- 方針: 明るいパステル。アクセントはピンク1色。文字は濃い紫で、背景とのコントラストを確保。
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
	Dim = Color3.fromRGB(235, 220, 232),
}

Style.Font = Enum.Font.GothamBold
Style.TapSize = 56 -- タップ領域の最小の目安（44px以上）

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
	return Style.make("TextLabel", base, parent)
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
	Style.round(button, 16)
	button.MouseButton1Down:Connect(function()
		local scale = button:FindFirstChild("PopScale")
		if not scale then
			scale = Style.make("UIScale", { Name = "PopScale" }, button)
		end
		TweenService:Create(scale, TweenInfo.new(0.08), { Scale = 0.94 }):Play()
	end)
	local function release()
		local scale = button:FindFirstChild("PopScale")
		if scale then
			TweenService:Create(scale, TweenInfo.new(0.15, Enum.EasingStyle.Back), { Scale = 1 }):Play()
		end
	end
	button.MouseButton1Up:Connect(release)
	button.MouseLeave:Connect(release)
	return button
end

function Style.formatNumber(n: number): string
	local s = tostring(math.floor(n))
	local formatted = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	return (formatted:gsub("^,", ""))
end

return Style

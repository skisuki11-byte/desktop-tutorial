-- 森の妖精「ルル」の すがた。はじめて遊ぶ人の案内役。
-- 吹き出し（コメントカード）の右上に、少し重ねて 手前に出す（この子が話している、と ひと目で分かるように）。
-- すがたは、カタログと同じイラスト（Shared.Icons の fairy_lulu）。カタログで見たルルが、そのまま話しかけてくる。
-- ふわふわ上下に浮かび、からだを少しゆらす。案内が終わったら、くるっと回って 上へ飛んで帰る。
-- イラストが読めないときは、絵文字の 🧚 で出す
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Icons = require(ReplicatedStorage.Shared.Icons)

local Fairy = {}

local SIZE = 150 -- 画面に出す大きさ（px）

local frame: GuiObject? = nil
local shown = false
local leaving = false

-- 吹き出しを教えて、ルルを用意する（最初は かくしておく）。gui = 画面の ScreenGui
function Fairy.attach(gui: ScreenGui, card: GuiObject)
	local f: GuiObject
	if Icons.fairy_lulu then
		local image = Instance.new("ImageLabel")
		image.Image = Icons.fairy_lulu
		image.ScaleType = Enum.ScaleType.Fit
		f = image
	else
		local label = Instance.new("TextLabel")
		label.Text = "🧚"
		label.TextScaled = true
		f = label
	end
	f.Name = "Lulu"
	f.BackgroundTransparency = 1
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.Size = UDim2.fromOffset(SIZE, SIZE)
	f.ZIndex = card.ZIndex + 10 -- 吹き出しより手前
	f.Visible = false
	f.Parent = gui
	frame = f
	local t0 = os.clock()
	local connection
	connection = RunService.RenderStepped:Connect(function()
		if not f.Parent then
			connection:Disconnect()
			return
		end
		if leaving then
			return
		end
		local visible = shown and card.Visible
		f.Visible = visible
		if not visible then
			return
		end
		local t = os.clock() - t0
		-- 吹き出しの右上の角に、少し重ねる（ルルの体の左下が、吹き出しに かかるくらい）
		local pos = card.AbsolutePosition - gui.AbsolutePosition
		local size = card.AbsoluteSize
		f.Position = UDim2.fromOffset(pos.X + size.X - SIZE * 0.2, pos.Y + SIZE * 0.1 + math.sin(t * 2.2) * 5)
		-- からだを少し ゆらす（話しているように）
		f.Rotation = math.sin(t * 1.6) * 6
	end)
end

-- 出てくる
function Fairy.show()
	if leaving then
		return
	end
	shown = true
end

-- 上へ飛んで帰る（くるっと回りながら、のぼって消える）
function Fairy.leave()
	local f = frame
	if not f or not shown or leaving then
		return
	end
	leaving = true
	f.Visible = true
	local goal = f.Position + UDim2.fromOffset(SIZE * 0.6, -SIZE * 1.6)
	local props = {
		Position = goal,
		Rotation = 360,
		Size = UDim2.fromOffset(SIZE * 0.4, SIZE * 0.4),
	}
	if f:IsA("ImageLabel") then
		props.ImageTransparency = 1
	elseif f:IsA("TextLabel") then
		props.TextTransparency = 1
	end
	TweenService:Create(f, TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), props):Play()
	task.delay(1.5, function()
		f:Destroy()
		frame = nil
		shown = false
	end)
end

function Fairy.isShown(): boolean
	return shown and not leaving
end

return Fairy

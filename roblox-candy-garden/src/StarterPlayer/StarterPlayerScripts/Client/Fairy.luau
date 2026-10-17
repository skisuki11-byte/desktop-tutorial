-- 森の妖精「ルル」の すがた。はじめて遊ぶ人の案内役。
-- 吹き出し（コメントカード）の右上に、少し重ねて 手前に出す（この子が話している、と ひと目で分かるように）。
-- 画面の部品（ViewportFrame）として出すので、吹き出しより手前に出せる（マップの3Dの物は、画面の部品の うしろになる）。
-- 羽を ぱたぱた、ふわふわ上下に浮かぶ。案内が終わったら、くるっと回って 上へ飛んで帰る。
-- すがた: まるい顔（目・ほっぺ）、ピンクの かみの毛、花びらの ドレス、うすい4枚の羽
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Fairy = {}

local C = Color3.fromRGB
local S = 1 -- 部品の大きさの基準
local SIZE = 150 -- 画面に出す大きさ（px）

type Piece = { part: BasePart, offset: CFrame, wing: number? }

local frame: ViewportFrame? = nil
local shown = false
local leaving = false

-- ルルの部品を作る
local function build(): (Model, { Piece })
	local m = Instance.new("Model")
	m.Name = "FairyLulu"
	local list: { Piece } = {}
	local function oval(size: Vector3, color: Color3, offset: CFrame, props: { [string]: any }?, wing: number?): BasePart
		local p = Instance.new("Part")
		p.Anchored = true
		p.CanCollide = false
		p.CanQuery = false
		p.CanTouch = false
		p.CastShadow = false
		p.Material = Enum.Material.SmoothPlastic
		p.Size = size * S
		p.Color = color
		for k, v in props or {} do
			p[k] = v
		end
		local mesh = Instance.new("SpecialMesh")
		mesh.MeshType = Enum.MeshType.Sphere -- だ円の形
		mesh.Parent = p
		p.Parent = m
		table.insert(list, { part = p, offset = offset, wing = wing })
		return p
	end
	-- 顔（-Z が前）
	local head = oval(Vector3.new(0.9, 0.85, 0.85), C(255, 226, 206), CFrame.new())
	head.Name = "Body"
	-- かみの毛（ピンクの ふんわりした お団子）
	oval(Vector3.new(1.0, 0.55, 0.95), C(255, 140, 190), CFrame.new(0, 0.3 * S, 0.06 * S))
	oval(Vector3.new(0.4, 0.4, 0.4), C(255, 120, 180), CFrame.new(0, 0.62 * S, 0.12 * S))
	-- 目とほっぺ
	for _, x in { -0.17, 0.17 } do
		oval(Vector3.new(0.11, 0.17, 0.05), C(70, 45, 80), CFrame.new(x * S, 0, -0.41 * S))
		oval(Vector3.new(0.14, 0.08, 0.04), C(255, 160, 180), CFrame.new(x * 1.5 * S, -0.16 * S, -0.37 * S))
	end
	-- 花びらの ドレス（2段）
	oval(Vector3.new(0.75, 0.55, 0.75), C(255, 182, 214), CFrame.new(0, -0.6 * S, 0))
	oval(Vector3.new(1.05, 0.35, 1.05), C(255, 150, 200), CFrame.new(0, -0.82 * S, 0))
	-- 羽（4枚。うしろがわで ぱたぱた動く）。wing: 1=右上 2=左上 3=右下 4=左下
	local wingProps = { Material = Enum.Material.Glass, Transparency = 0.2 }
	oval(Vector3.new(1.2, 0.85, 0.08), C(180, 225, 255), CFrame.new(0.55 * S, -0.1 * S, 0.35 * S), wingProps, 1)
	oval(Vector3.new(1.2, 0.85, 0.08), C(180, 225, 255), CFrame.new(-0.55 * S, -0.1 * S, 0.35 * S), wingProps, 2)
	oval(Vector3.new(0.8, 0.6, 0.08), C(255, 200, 235), CFrame.new(0.45 * S, -0.55 * S, 0.35 * S), wingProps, 3)
	oval(Vector3.new(0.8, 0.6, 0.08), C(255, 200, 235), CFrame.new(-0.45 * S, -0.55 * S, 0.35 * S), wingProps, 4)
	m.PrimaryPart = head
	return m, list
end

-- 部品を、顔の位置（at）に合わせて並べる。flap = 羽の角度
local function pose(list: { Piece }, at: CFrame, flap: number)
	for _, piece in list do
		local cf = at * piece.offset
		if piece.wing then
			-- 背中の つけねを軸に、左右の羽が開いたり閉じたりする
			local side = if piece.wing % 2 == 1 then 1 else -1
			local hinge = at * CFrame.new(0, piece.offset.Y, 0.3 * S)
			cf = hinge * CFrame.Angles(0, side * flap, 0) * (hinge:Inverse() * cf)
		end
		piece.part.CFrame = cf
	end
end

-- 吹き出しを教えて、ルルを用意する（最初は かくしておく）。gui = 画面の ScreenGui
function Fairy.attach(gui: ScreenGui, card: GuiObject)
	local f = Instance.new("ViewportFrame")
	f.Name = "Lulu"
	f.BackgroundTransparency = 1
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.Size = UDim2.fromOffset(SIZE, SIZE)
	f.Ambient = C(225, 215, 225)
	f.LightColor = C(255, 245, 250)
	f.LightDirection = Vector3.new(-0.4, -1, -0.6)
	f.ZIndex = card.ZIndex + 10 -- 吹き出しより手前
	f.Visible = false
	f.Parent = gui
	frame = f
	local m, list = build()
	m.Parent = f
	local cam = Instance.new("Camera")
	cam.FieldOfView = 30
	cam.CFrame = CFrame.lookAt(Vector3.new(0, -0.12, -4.7), Vector3.new(0, -0.12, 0))
	cam.Parent = f
	f.CurrentCamera = cam
	local face = CFrame.lookAt(Vector3.zero, Vector3.new(0, 0, -1)) -- こちらを向く
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
		f.Position = UDim2.fromOffset(pos.X + size.X - SIZE * 0.2, pos.Y + SIZE * 0.1 + math.sin(t * 2.2) * 4)
		-- 少し体をかたむけて、羽を ぱたぱた
		local tilt = math.rad(-8) + math.sin(t * 1.3) * math.rad(4)
		pose(list, face * CFrame.Angles(0, 0, tilt), math.rad(20) + math.sin(t * 14) * math.rad(28))
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
	TweenService:Create(f, TweenInfo.new(1.4, Enum.EasingStyle.Quad, Enum.EasingDirection.In), {
		Position = goal,
		Rotation = 360,
		ImageTransparency = 1,
		Size = UDim2.fromOffset(SIZE * 0.4, SIZE * 0.4),
	}):Play()
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

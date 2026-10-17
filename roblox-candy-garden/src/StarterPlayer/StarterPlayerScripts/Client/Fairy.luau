-- 森の妖精「ルル」の すがた。はじめて遊ぶ人の画面で、羽をぱたぱたさせて ふわふわ飛ぶ。
-- 自分の画面にだけ出す（ほかの人には見えない）。いつも こちら（カメラ）を向いて、顔が見えるようにする。
-- 話しているときは、吹き出し（コメントカード）の右どなりに浮かぶ（だれが話しているか分かるように）。
-- 吹き出しの中の顔も、同じルルを小さな窓（ViewportFrame）に映して出す。
-- 案内が終わったら、くるっと回って 空へ飛んで帰る。
-- すがた: まるい顔（目・ほっぺ）、ピンクの かみの毛、花びらの ドレス、うすい4枚の羽、ほんのり光る
local RunService = game:GetService("RunService")

local Fairy = {}

local C = Color3.fromRGB
local S = 1.6 -- 大きさ（小さすぎると、キャラクターや吹き出しに隠れて見えない）
local DEPTH = 13 -- カメラから どれくらい前に浮かぶか（遠いほど小さく見える）

type Piece = { part: BasePart, offset: CFrame, wing: number? }

local model: Model? = nil
local pieces: { Piece } = {}
local anchor: GuiObject? = nil -- この吹き出しの右どなりに浮かぶ
local connection: RBXScriptConnection? = nil
local leaving = false

-- ルルの部品を作る。list に部品と位置（顔の中心からのずれ）を入れていく
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
	local wingProps = { Material = Enum.Material.Glass, Transparency = 0.25 }
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

-- 浮かぶ場所: 吹き出しが出ていれば、その右どなり（画面に入りきらなければ、吹き出しの右下）。なければ画面の右下
local function goalPosition(cam: Camera, bob: number): Vector3
	local view = cam.ViewportSize
	if anchor and anchor.Visible and anchor.AbsoluteSize.X > 0 then
		local pos, size = anchor.AbsolutePosition, anchor.AbsoluteSize
		local x = pos.X + size.X + 50
		local y = pos.Y + size.Y * 0.5
		if x > view.X - 50 then
			x = pos.X + size.X - 60
			y = pos.Y + size.Y + 60
		end
		local ray = cam:ScreenPointToRay(x, y + bob * 12) -- GUI と同じ座標（上のバーの分も考える）
		return ray.Origin + ray.Direction * DEPTH
	end
	return (cam.CFrame * CFrame.new(4.8, -3.4 + bob * 0.3, -DEPTH)).Position
end

-- 吹き出しを教える（この右どなりに浮かぶ）
function Fairy.setAnchor(gui: GuiObject?)
	anchor = gui
end

-- 出てくる（もう出ていれば何もしない）
function Fairy.show()
	if model then
		return
	end
	leaving = false
	model, pieces = build()
	local m = model
	local head = m.Body
	local light = Instance.new("PointLight")
	light.Color = C(255, 220, 240)
	light.Range = 7
	light.Brightness = 0.8
	light.Parent = head
	local dust = Instance.new("ParticleEmitter")
	dust.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	dust.Rate = 8
	dust.Lifetime = NumberRange.new(0.6, 1)
	dust.Speed = NumberRange.new(0.2, 0.6)
	dust.SpreadAngle = Vector2.new(180, 180)
	dust.Size = NumberSequence.new(0.22, 0)
	dust.LightEmission = 1
	dust.Color = ColorSequence.new(C(255, 230, 160), C(255, 190, 230))
	dust.Parent = head
	m.Parent = workspace
	local current: Vector3? = nil
	local t0 = os.clock()
	connection = RunService.RenderStepped:Connect(function(dt)
		if not model or leaving then
			return
		end
		local t = os.clock() - t0
		local cam = workspace.CurrentCamera
		local goal = goalPosition(cam, math.sin(t * 2.2))
		-- カメラが動いても置いていかれないよう、すばやく ついていく
		current = if current then current:Lerp(goal, math.clamp(dt * 10, 0, 1)) else goal
		-- いつも カメラのほうを向く（顔が見えるように）
		local eye = cam.CFrame.Position
		local at = CFrame.lookAt(current, Vector3.new(eye.X, current.Y, eye.Z))
		pose(pieces, at, math.rad(20) + math.sin(t * 16) * math.rad(30))
	end)
end

-- 吹き出しの中の顔: 同じルルを、小さな窓に映す（羽も ゆっくり動く）
function Fairy.portrait(parent: GuiObject): ViewportFrame
	local frame = Instance.new("ViewportFrame")
	frame.Name = "LuluPortrait"
	frame.BackgroundTransparency = 1
	frame.Size = UDim2.fromScale(1, 1)
	frame.Ambient = C(220, 210, 220)
	frame.LightColor = C(255, 245, 250)
	frame.LightDirection = Vector3.new(-0.4, -1, -0.6)
	frame.ZIndex = parent.ZIndex + 1
	local m, list = build()
	m.Parent = frame
	local cam = Instance.new("Camera")
	cam.FieldOfView = 30
	cam.Parent = frame
	frame.CurrentCamera = cam
	-- 顔とかみの毛が まるの中に大きく入るように、正面から見る
	local at = CFrame.lookAt(Vector3.zero, Vector3.new(0, 0, -1))
	cam.CFrame = CFrame.lookAt(Vector3.new(0, 0.1 * S, -4.6), Vector3.new(0, 0.1 * S, 0))
	pose(list, at, math.rad(25))
	frame.Parent = parent
	local t0 = os.clock()
	task.spawn(function()
		while frame.Parent do
			if frame.Visible and parent.Visible then
				pose(list, at, math.rad(20) + math.sin((os.clock() - t0) * 6) * math.rad(20))
			end
			task.wait(1 / 20)
		end
	end)
	return frame
end

-- 空へ飛んで帰る（くるっと回って、上へ のぼりながら消える）
function Fairy.leave()
	if not model or leaving then
		return
	end
	leaving = true
	local m = model
	local list = pieces
	local start = m.Body.CFrame
	task.spawn(function()
		local t0 = os.clock()
		while os.clock() - t0 < 1.6 do
			local k = (os.clock() - t0) / 1.6
			local at = start * CFrame.new(-k * 10, k * 18, 0) * CFrame.Angles(0, k * math.pi * 4, 0)
			pose(list, at, math.rad(20) + math.sin(os.clock() * 24) * math.rad(35))
			for _, p in m:GetChildren() do
				if p:IsA("BasePart") then
					p.LocalTransparencyModifier = k
				end
			end
			RunService.RenderStepped:Wait()
		end
		if connection then
			connection:Disconnect()
			connection = nil
		end
		m:Destroy()
		if model == m then
			model = nil
			pieces = {}
		end
	end)
end

function Fairy.isShown(): boolean
	return model ~= nil and not leaving
end

return Fairy

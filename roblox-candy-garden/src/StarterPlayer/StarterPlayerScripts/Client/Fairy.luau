-- 森の妖精「ルル」の すがた。はじめて遊ぶ人の画面の右下あたりを、羽をぱたぱたさせて ふわふわ飛ぶ。
-- 自分の画面にだけ出す（ほかの人には見えない）。いつも こちら（カメラ）を向いて、顔が見えるようにする。
-- 案内が終わったら、くるっと回って 空へ飛んで帰る。
-- すがた: まるい顔（目・ほっぺ）、ピンクの かみの毛、花びらの ドレス、うすい4枚の羽、ほんのり光る
local RunService = game:GetService("RunService")

local Fairy = {}

local C = Color3.fromRGB
local S = 1.6 -- 大きさ（小さすぎると、キャラクターや吹き出しに隠れて見えない）

local model: Model? = nil
local pieces: { { part: BasePart, offset: CFrame, wing: number? } } = {}
local connection: RBXScriptConnection? = nil
local leaving = false

local function part(m: Model, props, offset: CFrame, wing: number?): BasePart
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.SmoothPlastic
	for k, v in props do
		p[k] = v
	end
	p.Parent = m
	table.insert(pieces, { part = p, offset = offset, wing = wing })
	return p
end

-- だ円の部品（Block + 球のメッシュ）
local function oval(m: Model, size: Vector3, color: Color3, offset: CFrame, props: { [string]: any }?, wing: number?)
	local p = part(m, { Size = size * S, Color = color }, offset, wing)
	for k, v in props or {} do
		p[k] = v
	end
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = p
	return p
end

local function build(): Model
	local m = Instance.new("Model")
	m.Name = "FairyLulu"
	pieces = {}
	-- 顔（-Z が前。いつもカメラのほうを向ける）
	local head = oval(m, Vector3.new(0.9, 0.85, 0.85), C(255, 226, 206), CFrame.new())
	head.Name = "Body"
	-- かみの毛（ピンクの ふんわりした お団子）
	oval(m, Vector3.new(1.0, 0.55, 0.95), C(255, 140, 190), CFrame.new(0, 0.3 * S, 0.06 * S))
	oval(m, Vector3.new(0.4, 0.4, 0.4), C(255, 120, 180), CFrame.new(0, 0.62 * S, 0.12 * S))
	-- 目とほっぺ
	for _, x in { -0.17, 0.17 } do
		oval(m, Vector3.new(0.11, 0.17, 0.05), C(70, 45, 80), CFrame.new(x * S, 0, -0.41 * S))
		oval(m, Vector3.new(0.14, 0.08, 0.04), C(255, 160, 180), CFrame.new(x * 1.5 * S, -0.16 * S, -0.37 * S))
	end
	-- 花びらの ドレス（2段）
	oval(m, Vector3.new(0.75, 0.55, 0.75), C(255, 182, 214), CFrame.new(0, -0.6 * S, 0))
	oval(m, Vector3.new(1.05, 0.35, 1.05), C(255, 150, 200), CFrame.new(0, -0.82 * S, 0))
	-- 羽（4枚。うしろがわで ぱたぱた動く）。wing: 1=右上 2=左上 3=右下 4=左下
	local wingProps = { Material = Enum.Material.Glass, Transparency = 0.25 }
	oval(m, Vector3.new(1.2, 0.85, 0.08), C(180, 225, 255), CFrame.new(0.55 * S, -0.1 * S, 0.35 * S), wingProps, 1)
	oval(m, Vector3.new(1.2, 0.85, 0.08), C(180, 225, 255), CFrame.new(-0.55 * S, -0.1 * S, 0.35 * S), wingProps, 2)
	oval(m, Vector3.new(0.8, 0.6, 0.08), C(255, 200, 235), CFrame.new(0.45 * S, -0.55 * S, 0.35 * S), wingProps, 3)
	oval(m, Vector3.new(0.8, 0.6, 0.08), C(255, 200, 235), CFrame.new(-0.45 * S, -0.55 * S, 0.35 * S), wingProps, 4)
	-- ほんのりした光と、ついてくる光の粉
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
	m.PrimaryPart = head
	return m
end

-- 部品を、からだの位置（at）に合わせて並べる。flap = 羽の角度
local function pose(at: CFrame, flap: number)
	for _, piece in pieces do
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

-- 出てくる（もう出ていれば何もしない）
function Fairy.show()
	if model then
		return
	end
	leaving = false
	model = build()
	model.Parent = workspace
	local current: Vector3? = nil
	local t0 = os.clock()
	connection = RunService.RenderStepped:Connect(function(dt)
		if not model or leaving then
			return
		end
		local t = os.clock() - t0
		-- 画面の右下あたり（カメラの少し前）に、ふわふわ浮かぶ。
		-- キャラクターの横に置くと、画面の上の吹き出しやキャラクターに隠れて見えないことがあるため
		local camCF = workspace.CurrentCamera.CFrame
		local goal = (camCF * CFrame.new(3, -2.2 + math.sin(t * 2.2) * 0.25, -8)).Position
		current = if current then current:Lerp(goal, math.clamp(dt * 8, 0, 1)) else goal
		-- いつも カメラのほうを向く（顔が見えるように）
		local cam = camCF.Position
		local at = CFrame.lookAt(current, Vector3.new(cam.X, current.Y, cam.Z))
		pose(at, math.rad(20) + math.sin(t * 16) * math.rad(30))
	end)
end

-- 空へ飛んで帰る（くるっと回って、上へ のぼりながら消える）
function Fairy.leave()
	if not model or leaving then
		return
	end
	leaving = true
	local m = model
	local start = m.Body.CFrame
	task.spawn(function()
		local t0 = os.clock()
		while os.clock() - t0 < 1.6 do
			local k = (os.clock() - t0) / 1.6
			local at = start * CFrame.new(-k * 10, k * 18, 0) * CFrame.Angles(0, k * math.pi * 4, 0)
			pose(at, math.rad(20) + math.sin(os.clock() * 24) * math.rad(35))
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

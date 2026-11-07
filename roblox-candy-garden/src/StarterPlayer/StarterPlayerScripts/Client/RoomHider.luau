-- ひみつきちの 出入り（自分の画面のしかけ）。
--   ・家の とびらの前に来ると、画面が ふわっと暗くなって へやに切りかわる（へやの中の とびらの前で 外へ）
--   ・へやは 庭の上空にある別の場所。外から見上げても 見えないように、中にいるとき以外は 自分の画面で かくす
--   ・ほかの子が 自分のへやに入っているときは、その子（名前の札も）を 自分の画面で かくす（空に うかんで見えないように）
-- 入れるのは 自分の家だけ（サーバーでも 持ち主か・とびらの前か を確かめる）
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Remotes = require(ReplicatedStorage.Shared.Remotes)

local RoomHider = {}

local INSIDE_HEIGHT = 250 -- これより高い所にいたら「へやの中」
local DOOR_NEAR = 3.5 -- とびらの前の「ここに来たら 入る」の はんい
local FADE = 0.3

local hidden: { [Model]: boolean } = {}
local watched: { [Model]: RBXScriptConnection } = {}
local fade: Frame
local busy = false
local armed = { enter = true, exit = true, museum = true, museumExit = true } -- 一度はなれるまで もう一度は 切りかえない

-- その へや（または はくぶつかん）の 中に いるか（高さも 見る。はくぶつかんは へやの 上に ある）
local function isInside(root: BasePart?, model: Model): boolean
	if not root or root.Position.Y <= INSIDE_HEIGHT then
		return false
	end
	local center = model:GetPivot().Position
	local w = model:GetAttribute("Width") or 20
	local flat = (Vector3.new(root.Position.X, 0, root.Position.Z) - Vector3.new(center.X, 0, center.Z)).Magnitude
	return flat < w + 6 and math.abs(root.Position.Y - center.Y) < 25
end

local function apply(d: Instance, hide: boolean)
	if d:IsA("BasePart") then
		d.LocalTransparencyModifier = if hide then 1 else 0
	elseif d:IsA("Light") or d:IsA("ParticleEmitter") then
		d.Enabled = not hide
	end
end

local function setHidden(room: Model, hide: boolean)
	-- あとから足された部品（家具を置いた など）にも 同じようにする
	if not watched[room] then
		watched[room] = room.DescendantAdded:Connect(function(d)
			apply(d, hidden[room] == true)
		end)
	end
	if hidden[room] == hide then
		return
	end
	hidden[room] = hide
	for _, d in room:GetDescendants() do
		apply(d, hide)
	end
end

-- ほかの子の キャラ（へやの中にいる あいだ かくす）
local charHidden: { [Model]: boolean } = {}

local function hideCharacter(character: Model, hide: boolean)
	if charHidden[character] == hide then
		return
	end
	charHidden[character] = hide
	for _, d in character:GetDescendants() do
		if d:IsA("BasePart") or d:IsA("Decal") then
			d.LocalTransparencyModifier = if hide then 1 else 0
		elseif d:IsA("BillboardGui") then
			d.Enabled = not hide
		end
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		humanoid.DisplayDistanceType = if hide then Enum.HumanoidDisplayDistanceType.None else Enum.HumanoidDisplayDistanceType.Viewer
	end
end

local function updateOthers(me: Player)
	for _, other in Players:GetPlayers() do
		local character = other.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		if other ~= me and character and root and root:IsA("BasePart") then
			hideCharacter(character, root.Position.Y > INSIDE_HEIGHT)
		end
	end
	for character in charHidden do
		if not character.Parent then
			charHidden[character] = nil
		end
	end
end

local function reformOf(plot: Instance): Instance?
	return plot:FindFirstChild("Reform")
end

-- 画面を暗くして サーバーに 出入りを たのみ、また明るくする
local function switch(action: string)
	busy = true
	armed[action] = false
	TweenService:Create(fade, TweenInfo.new(FADE), { BackgroundTransparency = 0 }):Play()
	task.wait(FADE)
	Remotes.RoomDoor:FireServer(action)
	task.wait(0.35) -- サーバーが 動かすのを待つ
	TweenService:Create(fade, TweenInfo.new(FADE), { BackgroundTransparency = 1 }):Play()
	task.wait(FADE)
	busy = false
end

function RoomHider.init()
	local player = Players.LocalPlayer
	local gui = Instance.new("ScreenGui")
	gui.Name = "RoomFade"
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 50
	gui.ResetOnSpawn = false
	gui.Parent = player:WaitForChild("PlayerGui")
	fade = Instance.new("Frame")
	fade.Size = UDim2.fromScale(1, 1)
	fade.BackgroundColor3 = Color3.fromRGB(60, 40, 80)
	fade.BackgroundTransparency = 1
	fade.BorderSizePixel = 0
	fade.Active = false
	fade.Parent = gui

	task.spawn(function()
		while true do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			local plots = workspace:FindFirstChild("Plots")
			for _, plot in (plots and plots:GetChildren()) or {} do
				local reform = reformOf(plot)
				local room = reform and reform:FindFirstChild("Room")
				local house = reform and reform:FindFirstChild("SecretBase")
				local museum = reform and reform:FindFirstChild("Museum")
				local rootPart = if root and root:IsA("BasePart") then root else nil
				if museum and museum:IsA("Model") then
					setHidden(museum, not isInside(rootPart, museum))
				end
				if room and room:IsA("Model") then
					setHidden(room, not isInside(rootPart, room))
					-- 自分の家の とびら・へやの とびら
					-- 見学中は、まねいてくれた子の 家の 中の とびらも つかえる（入口からは 入らない）
					local owner = house and house:GetAttribute("OwnerUserId")
					local visiting = owner ~= nil and owner == player:GetAttribute("VisitingUserId")
					if root and root:IsA("BasePart") and house and (owner == player.UserId or visiting) then
						local entrance = house:FindFirstChild("Entrance") :: BasePart?
						local exitMat = room:FindFirstChild("ExitMat") :: BasePart?
						local nearEnter = entrance ~= nil and (root.Position - entrance.Position).Magnitude < DOOR_NEAR
						local nearExit = exitMat ~= nil and (root.Position - exitMat.Position).Magnitude < DOOR_NEAR
						if not nearEnter then
							armed.enter = true
						end
						if not nearExit then
							armed.exit = true
						end
						-- はくぶつかんの 入口（へやの 中）と 出口（はくぶつかんの 中）
						local museumMat = room:FindFirstChild("MuseumMat") :: BasePart?
						local museumExit = museum and museum:FindFirstChild("ExitMat") :: BasePart?
						local nearMuseum = museumMat ~= nil and (root.Position - museumMat.Position).Magnitude < DOOR_NEAR
						local nearMuseumExit = museumExit ~= nil and (root.Position - museumExit.Position).Magnitude < DOOR_NEAR
						if not nearMuseum then
							armed.museum = true
						end
						if not nearMuseumExit then
							armed.museumExit = true
						end
						if not busy and nearEnter and armed.enter and not visiting then
							task.spawn(switch, "enter")
						elseif not busy and nearExit and armed.exit then
							task.spawn(switch, "exit")
						elseif not busy and nearMuseum and armed.museum then
							task.spawn(switch, "museum")
						elseif not busy and nearMuseumExit and armed.museumExit then
							task.spawn(switch, "museumExit")
						end
					end
				end
			end
			updateOthers(player)
			-- なくなった へや（段が上がって 作り直した など）は わすれる
			for room, conn in watched do
				if not room.Parent then
					conn:Disconnect()
					watched[room] = nil
					hidden[room] = nil
				end
			end
			task.wait(0.15)
		end
	end)
end

return RoomHider

-- ひみつきちの 出入り（自分の画面のしかけ）。
--   ・家の とびらの前に来ると、画面が ふわっと暗くなって へやに切りかわる（へやの中の とびらの前で 外へ）
--   ・へやは 庭の上空にある別の場所。外から見上げても 見えないように、中にいるとき以外は 自分の画面で かくす
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
local armed = { enter = true, exit = true } -- 一度はなれるまで もう一度は 切りかえない

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
				if room and room:IsA("Model") then
					local inside = false
					if root and root:IsA("BasePart") and root.Position.Y > INSIDE_HEIGHT then
						local center = room:GetPivot().Position
						local w = room:GetAttribute("Width") or 20
						inside = (Vector3.new(root.Position.X, 0, root.Position.Z) - Vector3.new(center.X, 0, center.Z)).Magnitude < w + 6
					end
					setHidden(room, not inside)
					-- 自分の家の とびら・へやの とびら
					if root and root:IsA("BasePart") and house and house:GetAttribute("OwnerUserId") == player.UserId then
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
						if not busy and nearEnter and armed.enter then
							task.spawn(switch, "enter")
						elseif not busy and nearExit and armed.exit then
							task.spawn(switch, "exit")
						end
					end
				end
			end
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

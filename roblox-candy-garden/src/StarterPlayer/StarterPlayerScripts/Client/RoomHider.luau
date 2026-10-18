-- ひみつきちの へや（庭の上空 300 にある）は、外から見上げると 空に浮かぶ箱に見えてしまう。
-- 自分が へやの中にいるときだけ見えるようにする（自分の画面だけで かくす。ほかの人には関係しない）。
-- へやに入れるのは持ち主だけなので、ほかの人の へやは いつも かくれている
local Players = game:GetService("Players")

local RoomHider = {}

local INSIDE_HEIGHT = 250 -- これより高い所にいたら「へやの中」

local hidden: { [Model]: boolean } = {}
local watched: { [Model]: RBXScriptConnection } = {}

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

local function rooms(): { Model }
	local list = {}
	local plots = workspace:FindFirstChild("Plots")
	if not plots then
		return list
	end
	for _, plot in plots:GetChildren() do
		local reform = plot:FindFirstChild("Reform")
		local room = reform and reform:FindFirstChild("Room", true)
		if room and room:IsA("Model") then
			table.insert(list, room)
		end
	end
	return list
end

function RoomHider.init()
	local player = Players.LocalPlayer
	task.spawn(function()
		while true do
			local character = player.Character
			local root = character and character:FindFirstChild("HumanoidRootPart")
			for _, room in rooms() do
				local inside = false
				if root and root:IsA("BasePart") and root.Position.Y > INSIDE_HEIGHT then
					local center = room:GetPivot().Position
					local w = room:GetAttribute("Width") or 20
					inside = (Vector3.new(root.Position.X, 0, root.Position.Z) - Vector3.new(center.X, 0, center.Z)).Magnitude < w + 6
				end
				setHidden(room, not inside)
			end
			-- なくなった へや（段が上がって 作り直した など）は わすれる
			for room, conn in watched do
				if not room.Parent then
					conn:Disconnect()
					watched[room] = nil
					hidden[room] = nil
				end
			end
			task.wait(0.3)
		end
	end)
end

return RoomHider

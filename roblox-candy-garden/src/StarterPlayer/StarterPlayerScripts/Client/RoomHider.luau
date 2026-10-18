-- ひみつきち（中に歩いて入れる家）の、自分の画面だけの しかけ。
--   ・自分の家の とびらは あいている（とおれる・見えない）。ほかの人の家の とびらは しまったまま（入れない）
--   ・自分の家の中にいるときは 屋根を消して、へやを上から見られるようにする（カメラが 屋根に じゃまされない）
-- どれも 自分の画面の中だけ（ほかの人には関係しない。重くならない）
local Players = game:GetService("Players")

local RoomHider = {}

local function setRoof(house: Model, hide: boolean)
	if house:GetAttribute("RoofHidden") == hide then
		return
	end
	house:SetAttribute("RoofHidden", hide)
	for _, d in house:GetDescendants() do
		if d:IsA("BasePart") and d:GetAttribute("Roof") then
			d.LocalTransparencyModifier = if hide then 1 else 0
		elseif d:IsA("ParticleEmitter") and d.Parent and d.Parent:GetAttribute("Roof") then
			d.Enabled = not hide
		end
	end
end

local function openDoor(house: Model)
	local door = house:FindFirstChild("Door")
	if door and door:IsA("BasePart") and door.CanCollide then
		door.CanCollide = false
		door.LocalTransparencyModifier = 1
	end
end

local function myHouse(userId: number): Model?
	local plots = workspace:FindFirstChild("Plots")
	if not plots then
		return nil
	end
	for _, plot in plots:GetChildren() do
		local reform = plot:FindFirstChild("Reform")
		local house = reform and reform:FindFirstChild("SecretBase")
		if house and house:GetAttribute("OwnerUserId") == userId then
			return house :: Model
		end
	end
	return nil
end

function RoomHider.init()
	local player = Players.LocalPlayer
	task.spawn(function()
		while true do
			local house = myHouse(player.UserId)
			if house then
				openDoor(house)
				-- 家の中（かべの内がわ）にいるか
				local character = player.Character
				local root = character and character:FindFirstChild("HumanoidRootPart")
				local inside = false
				if root and root:IsA("BasePart") then
					local here = house:GetPivot():PointToObjectSpace(root.Position)
					local w = house:GetAttribute("Width") or 14
					local d = house:GetAttribute("Depth") or 12
					inside = math.abs(here.X) < w / 2 + 0.5 and math.abs(here.Z) < d / 2 + 0.5 and here.Y < 15
				end
				setRoof(house, inside)
			end
			task.wait(0.25)
		end
	end)
end

return RoomHider

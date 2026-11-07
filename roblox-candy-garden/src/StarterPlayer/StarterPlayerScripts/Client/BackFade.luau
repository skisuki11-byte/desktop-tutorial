-- 自分の せなかの おしゃれ（つばさ・マント など）を、うしろから見ているときだけ 少し すかす（自分の画面だけ）。
-- ふつうのカメラは キャラの うしろにあるので、大きな つばさが 画面の まん中を ふさいで 畑が見えにくくなる。
-- 前や 横から見る（カメラを回して 見せびらかす）ときは、すかさない。ほかの人の画面では いつも そのまま
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local BackFade = {}

local FADE = 0.5 -- うしろから見ているときの すけぐあい
local BEHIND = 0.35 -- カメラの向きと キャラの向きが これより そろっていたら「うしろから見ている」

function BackFade.init()
	local player = Players.LocalPlayer
	local current = 0
	RunService.RenderStepped:Connect(function()
		local character = player.Character
		local root = character and character:FindFirstChild("HumanoidRootPart")
		local back = character and character:FindFirstChild("Cosmetic_back")
		local camera = workspace.CurrentCamera
		if not (root and back and camera) then
			return
		end
		local look = camera.CFrame.LookVector
		local facing = (root :: BasePart).CFrame.LookVector
		local behind = Vector3.new(look.X, 0, look.Z).Unit:Dot(Vector3.new(facing.X, 0, facing.Z).Unit) > BEHIND
		local goal = if behind then FADE else 0
		-- ふわっと変える（パッと切りかわると ちらついて見える）
		local nextValue = current + (goal - current) * 0.2
		if math.abs(nextValue - goal) < 0.01 then
			nextValue = goal
		end
		if nextValue == current and back:GetAttribute("Faded") == current then
			return
		end
		current = nextValue
		back:SetAttribute("Faded", current)
		for _, d in back:GetDescendants() do
			if d:IsA("BasePart") then
				d.LocalTransparencyModifier = current
			end
		end
	end)
end

return BackFade

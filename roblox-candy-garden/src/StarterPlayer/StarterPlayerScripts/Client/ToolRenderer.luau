local Players=game:GetService("Players")
local RunService=game:GetService("RunService")
local Models=require(game:GetService("ReplicatedStorage").Shared.CatalogModels)
local ToolRenderer={}
local entries={}
function ToolRenderer.init()
	RunService.RenderStepped:Connect(function()
		for _,player in Players:GetPlayers() do
			local key=player:GetAttribute("HeldGardenTool") or ""
			local character=player.Character
			local hand=character and (character:FindFirstChild("RightHand") or character:FindFirstChild("Right Arm"))
			local entry=entries[player]
			if entry and (entry.key~=key or not hand or not entry.model.Parent) then entry.model:Destroy();entries[player]=nil;entry=nil end
			if hand and key~="" then
				if not entry then
					local model=Models.build("tool_"..key)
					if model then model:ScaleTo(.65);model.Parent=character;entry={key=key,model=model};entries[player]=entry end
				end
				if entry then entry.model:PivotTo(hand.CFrame*CFrame.new(0,-.45,-.5)*CFrame.Angles(0,math.pi/2,0)) end
			end
		end
	end)
	Players.PlayerRemoving:Connect(function(player) local e=entries[player];if e then e.model:Destroy();entries[player]=nil end end)
end
return ToolRenderer

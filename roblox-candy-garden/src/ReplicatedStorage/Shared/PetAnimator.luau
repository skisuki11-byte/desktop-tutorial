-- Shared between followers and ViewportFrames. Only detached visual parts move.
local PetAnimator = {}
local states = setmetatable({}, { __mode = "k" })

function PetAnimator.prepare(model: Model)
	local root = model.PrimaryPart
	if not root then return end
	local joints = {}
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") and p ~= root then
			local n = string.lower(p.Name)
			local kind = if n:find("wing") then "wing" elseif n:find("fin") then "fin" elseif n:find("leg") or n:find("paw") then "leg" elseif n:find("arm") then "arm" elseif n:find("tail") then "tail" else nil
			if kind then
				local rest = root.CFrame:ToObjectSpace(p.CFrame)
				local side = if n:find("left") then -1 elseif n:find("right") then 1 elseif rest.X < 0 then -1 else 1
				local pivot = rest.Position
				if kind == "wing" or kind == "fin" then
					pivot -= Vector3.new(side * p.Size.X * 0.36, 0, 0)
				elseif kind == "leg" or kind == "arm" then
					pivot += Vector3.new(0, p.Size.Y * 0.38, 0)
				end
				table.insert(joints, { part=p, rest=rest, pivot=CFrame.new(pivot), kind=kind, side=side, back=n:find("back")~=nil })
			end
		end
	end
	states[model] = { root=root, joints=joints }
	model:SetAttribute("AnimatedJointCount", #joints)
end

function PetAnimator.step(model: Model, time: number, moving: boolean)
	local state = states[model]
	if not state then PetAnimator.prepare(model);state=states[model] end
	if not state then return end
	local rootCF = state.root.CFrame
	for _, joint in state.joints do
		if joint.part.Parent then
			local a = if moving then math.sin(time * 8 + (if joint.back then math.pi else 0)) * 0.42 else math.sin(time * 2) * 0.035
			local rotation
			if joint.kind == "wing" then rotation=CFrame.Angles(0,0,math.sin(time*5)*0.42*joint.side)
			elseif joint.kind == "fin" then rotation=CFrame.Angles(math.sin(time*3)*.18,0,math.sin(time*3)*.15*joint.side)
			elseif joint.kind == "tail" then rotation=CFrame.Angles(0,math.sin(time*3)*.22,0)
			else rotation=CFrame.Angles(a*joint.side,0,0) end
			joint.part.CFrame=rootCF*joint.pivot*rotation*joint.pivot:Inverse()*joint.rest
		end
	end
end

function PetAnimator.release(model: Model)
	states[model]=nil
end

return PetAnimator

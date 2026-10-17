-- Textured pet templates are stored in Shared.CandyPetModels.
-- Returning nil keeps the original procedural pet as a fallback.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PetAnimator = require(script.Parent.PetAnimator)
local PetVisuals = {}

function PetVisuals.create(cfg, size: number): Model?
	local templates = script.Parent:FindFirstChild("CandyPetModels")
	local template = templates and templates:FindFirstChild(cfg.id)
	if not template or not template:IsA("Model") then
		return nil
	end
	local model = template:Clone()
	model.Name = cfg.id
	local boundsCF, bounds = model:GetBoundingBox()
	if math.min(bounds.X, bounds.Y, bounds.Z) <= 0 then
		model:Destroy()
		return nil
	end
	-- 背の高さ: ★1 で 2.5、★ひとつごとに 0.1 ずつ大きく（★7 で 3.1）。
	-- プレイヤー（背 5）の半分くらいにして、畑や足元が かくれないようにする
	local height = 2.4 + cfg.rarity * 0.1
	local factor = math.min(height / bounds.Y, height * 1.6 / bounds.X, height * 1.6 / bounds.Z)
	model:ScaleTo(model:GetScale() * factor)
	boundsCF, bounds = model:GetBoundingBox()
	for _, object in model:GetDescendants() do
		if object:IsA("BasePart") then
			object.Anchored = true
			object.CanCollide = false
			object.CanTouch = false
			object.CanQuery = false
			object.CastShadow = false
            if object:IsA("MeshPart") then
                object.Color=Color3.new(1,1,1)
                object.Material=Enum.Material.SmoothPlastic
                object.Reflectance=0
            end
		end
	end
	-- The follower keeps its pivot size/2 above the ground.
	-- Place the model pivot so the feet touch that same ground plane.
	local root = Instance.new("Part")
	root.Name = "PetPivot"
	root.Size = Vector3.new(0.05, 0.05, 0.05)
	root.Transparency = 1
	root.Anchored = true
	root.CanCollide = false
	root.CanTouch = false
	root.CanQuery = false
	root.CastShadow = false
	root.CFrame = CFrame.new(boundsCF.Position + Vector3.new(0, -bounds.Y / 2 + size / 2, 0))
	root.Parent = model
	model.PrimaryPart = root
	model:PivotTo(CFrame.identity)
	if cfg.rarity >= 5 then
		local attachment = Instance.new("Attachment")
		attachment.Name = "RaritySparkle"
		attachment.Position = Vector3.new(0, size * 0.45, 0)
		attachment.Parent = root
		local sparkle = Instance.new("ParticleEmitter")
		sparkle.Name = "RarePetSparkles"
		sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		sparkle.Color = ColorSequence.new(if cfg.rarity == 5 then Color3.fromRGB(255, 220, 130) else cfg.color)
		sparkle.Size = NumberSequence.new(0.16, 0)
		sparkle.Lifetime = NumberRange.new(0.5, 0.9)
		sparkle.Speed = NumberRange.new(0.1, 0.45)
		sparkle.SpreadAngle = Vector2.new(180, 180)
		sparkle.Rate = if cfg.rarity == 7 then 5 else 3
		sparkle.LightEmission = 0.8
		sparkle.Parent = attachment
	end
	PetAnimator.prepare(model)
	return model
end

return PetVisuals

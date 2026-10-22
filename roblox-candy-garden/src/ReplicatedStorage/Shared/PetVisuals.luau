-- Textured pet templates are stored in Shared.CandyPetModels.
-- Returning nil keeps the original procedural pet as a fallback.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PetAnimator = require(script.Parent.PetAnimator)
local PetVisuals = {}

local RAINBOW = ColorSequence.new({
	ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 130, 170)),
	ColorSequenceKeypoint.new(0.25, Color3.fromRGB(255, 220, 120)),
	ColorSequenceKeypoint.new(0.5, Color3.fromRGB(150, 240, 170)),
	ColorSequenceKeypoint.new(0.75, Color3.fromRGB(140, 200, 255)),
	ColorSequenceKeypoint.new(1, Color3.fromRGB(210, 150, 255)),
})

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
	-- 背の高さ: ★1 で 3.15、★ひとつごとに 0.15 ずつ大きく（★7 で 4.05）。
	-- プレイヤー（背 5）の 6〜8わりくらい。作物の しげみに かくれず、でも畑は ふさがない大きさ
	-- 超超レア（scale つき）は もうひとまわり 大きく
	local height = (3 + cfg.rarity * 0.15) * (cfg.scale or 1)
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
		sparkle.Color = if cfg.rarity >= 8 then RAINBOW else ColorSequence.new(if cfg.rarity == 5 then Color3.fromRGB(255, 220, 130) else cfg.color)
		sparkle.Size = NumberSequence.new(0.16, 0)
		sparkle.Lifetime = NumberRange.new(0.5, 0.9)
		sparkle.Speed = NumberRange.new(0.1, 0.45)
		sparkle.SpreadAngle = Vector2.new(180, 180)
		sparkle.Rate = if cfg.rarity >= 8 then 10 elseif cfg.rarity == 7 then 5 else 3
		sparkle.LightEmission = 0.8
		sparkle.Parent = attachment
	end
	-- 超超レア（★8）: 足もとから 虹色の 星が ふわふわ のぼり、体が ほんのり 光る
	if cfg.rarity >= 8 then
		local feet = Instance.new("Attachment")
		feet.Name = "MiracleAura"
		feet.Position = Vector3.new(0, -size / 2 + 0.2, 0)
		feet.Parent = root
		local aura = Instance.new("ParticleEmitter")
		aura.Name = "MiracleStars"
		aura.Texture = "rbxasset://textures/particles/sparkles_main.dds"
		aura.Color = RAINBOW
		aura.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.15), NumberSequenceKeypoint.new(0.4, 0.55), NumberSequenceKeypoint.new(1, 0) })
		aura.Lifetime = NumberRange.new(1.2, 2)
		aura.Speed = NumberRange.new(1, 2)
		aura.SpreadAngle = Vector2.new(25, 25)
		aura.EmissionDirection = Enum.NormalId.Top
		aura.Shape = Enum.ParticleEmitterShape.Disc
		aura.ShapeStyle = Enum.ParticleEmitterShapeStyle.Surface
		aura.Rate = 14
		aura.LightEmission = 1
		aura.Parent = feet
		local glow = Instance.new("PointLight")
		glow.Color = cfg.color
		glow.Range = 12
		glow.Brightness = 1.8
		glow.Parent = root
	end
	PetAnimator.prepare(model)
	return model
end

-- がったいした子の 見た目（1=きらきら: 金色の きらきら / 2=にじいろ: 虹色の きらきらと 光）。
-- 体の 色は かえない（どの子か わかるように）。まわりの 光で ランクが わかる
function PetVisuals.applyTier(model: Model, tier: number?)
	if not tier or tier <= 0 then
		return
	end
	local root = model.PrimaryPart
	if not root then
		return
	end
	local attachment = Instance.new("Attachment")
	attachment.Name = "TierSparkle"
	attachment.Parent = root
	local _, bounds = model:GetBoundingBox()
	attachment.WorldPosition = root.Position + Vector3.new(0, bounds.Y * 0.1, 0)
	local sparkle = Instance.new("ParticleEmitter")
	sparkle.Name = "TierSparkles"
	sparkle.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	sparkle.Color = if tier >= 2 then RAINBOW else ColorSequence.new(Color3.fromRGB(255, 225, 120))
	sparkle.Size = NumberSequence.new(0.35, 0)
	sparkle.Lifetime = NumberRange.new(0.6, 1.1)
	sparkle.Speed = NumberRange.new(0.3, 0.9)
	sparkle.SpreadAngle = Vector2.new(180, 180)
	sparkle.Shape = Enum.ParticleEmitterShape.Sphere
	sparkle.Rate = if tier >= 2 then 9 else 5
	sparkle.LightEmission = 1
	sparkle.Parent = attachment
	-- 体の まわりに うっすら 光の 枠（にじいろは 光も つける）
	local shine = Instance.new("PointLight")
	shine.Color = if tier >= 2 then Color3.fromRGB(255, 190, 240) else Color3.fromRGB(255, 225, 140)
	shine.Range = if tier >= 2 then 10 else 6
	shine.Brightness = if tier >= 2 then 1.5 else 0.8
	shine.Parent = root
end

return PetVisuals

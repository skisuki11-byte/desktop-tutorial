local Shared=script.Parent
local Config=require(Shared.Config)
local PetVisuals=require(Shared.PetVisuals)
local Crops=require(Shared.CropVisuals)
local Cosmetics=require(Shared.CosmeticVisuals)
local Decor=require(Shared.DecorVisuals)
local Misc=require(Shared.MiscVisuals)
local CatalogModels={}

function CatalogModels.build(key: string): Model?
	local group,id=key:match("^(%w+)_(.+)$")
	local model
	if group=="pet" and Config.PetById[id] then model=PetVisuals.create(Config.PetById[id],2.5)
	elseif group=="crop" then
		local crop,variant=id:match("^([^:]+):(.+)$");crop=crop or id
		if Config.CropById[crop] then model=Crops.build(crop);if variant and variant~="normal" then Crops.setVariant(model,variant) end end
	elseif group=="variant" then model=Crops.build("gummyberry");if id~="normal" then Crops.setVariant(model,id) end
	elseif group=="cos" then model=Cosmetics.build(id) or Misc.build(key)
	elseif group=="decor" then model=Decor.build(id)
	else model=Misc.build(key) end
	if model then
		model.Name=key
		for _,obj in model:GetDescendants() do
			if obj:IsA("BasePart") then obj.Anchored=true;obj.CanCollide=false;obj.CanTouch=false;obj.CanQuery=false end
		end
	end
	return model
end
return CatalogModels

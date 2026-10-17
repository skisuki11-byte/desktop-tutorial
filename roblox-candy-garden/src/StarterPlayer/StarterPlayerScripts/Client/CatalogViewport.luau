local Shared=game:GetService("ReplicatedStorage").Shared
local RunService=game:GetService("RunService")
local Models=require(Shared.CatalogModels)
local Animator=require(Shared.PetAnimator)
local Config=require(Shared.Config)
local ContentProvider=game:GetService("ContentProvider")
local CatalogViewport={}
local entries={}
local lastTick=0

local function supported(key)
	if not key then return false end
	local group,id=key:match("^(%w+)_(.+)$")
	if group=="pet" then return Config.PetById[id]~=nil end
	if group=="crop" then return Config.CropById[id:match("^[^:]+") or id]~=nil end
	if group=="cos" then return Config.CosmeticById[id]~=nil end
	if group=="decor" then return Config.DecorById[id]~=nil end
	return group=="egg" or group=="tool" or group=="variant" or group=="weather" or group=="place" or key=="fairy_lulu" or key=="ui_coins" or key=="ui_dex" or key=="ui_gift" or key=="ui_shop"
end
local function visible(label)
	local pos,size=label.AbsolutePosition,label.AbsoluteSize
	if size.X<1 or size.Y<1 then return false end
	local node=label
	while node do
		if node:IsA("GuiObject") then
			if not node.Visible then return false end
			if node.ClipsDescendants then local p,s=node.AbsolutePosition,node.AbsoluteSize;if pos.X+size.X<p.X or pos.X>p.X+s.X or pos.Y+size.Y<p.Y or pos.Y>p.Y+s.Y then return false end end
		elseif node:IsA("ScreenGui") and not node.Enabled then return false end
		node=node.Parent
	end
	return true
end
local function fit(entry)
	local model=entry.model
	local cf,size=model:GetBoundingBox()
	local aspect=math.max(.25,entry.viewport.AbsoluteSize.X/math.max(1,entry.viewport.AbsoluteSize.Y))
	-- 小窓いっぱいに大きく見せる（.55 で、たて・よこの いちばん大きい所が 小窓の ほぼ全部になる）
	local dist=math.max(size.Y,size.X/aspect,size.Z)*.55/math.tan(math.rad(18))
	entry.camera.CFrame=CFrame.lookAt(cf.Position+Vector3.new(dist*.22,dist*.16,-dist),cf.Position)
	entry.base=model:GetPivot()
end
-- まだ会っていない物は、まっくろなシルエットに（光を消して、かげの形だけ見せる）
local function silhouette(view,dim)
	view:SetAttribute("Undiscovered",dim)
	view.Ambient=if dim then Color3.new(0,0,0) else Color3.fromRGB(200,200,210)
	view.LightColor=if dim then Color3.new(0,0,0) else Color3.fromRGB(255,247,235)
	view.ImageColor3=Color3.new(1,1,1)
	view.ImageTransparency=if dim then .35 else 0
	-- 光る部分（目のキラキラなど）は、光を消しても白く残るので、シルエットの間は かくす
	for _,o in view:GetDescendants() do
		if o:IsA("BasePart") and o.Material==Enum.Material.Neon then
			if dim and o:GetAttribute("ShownTransparency")==nil then o:SetAttribute("ShownTransparency",o.Transparency);o.Transparency=1
			elseif not dim and o:GetAttribute("ShownTransparency")~=nil then o.Transparency=o:GetAttribute("ShownTransparency");o:SetAttribute("ShownTransparency",nil) end
		end
	end
end
function CatalogViewport.clear(label)
	local entry=entries[label]
	if entry then if entry.resizeConnection then entry.resizeConnection:Disconnect() end;if entry.model then Animator.release(entry.model) end;entry.viewport:Destroy();entries[label]=nil end
end
function CatalogViewport.attach(label: GuiObject,key: string?,dim: boolean?,options): boolean
	if not supported(key) then CatalogViewport.clear(label);return false end
	local entry=entries[label]
	if entry and entry.key==key then entry.dim=dim==true;silhouette(entry.viewport,dim==true);entry.options=options or entry.options;return true end
	CatalogViewport.clear(label)
	local view=Instance.new("ViewportFrame")
	view.Name="Catalog3D";view.Size=UDim2.fromScale(1,1);view.BackgroundTransparency=1;view.ZIndex=label.ZIndex;view.Active=false
	view.LightDirection=Vector3.new(-1,-1,-1)
	silhouette(view,dim==true);view.Parent=label
	local camera=Instance.new("Camera");camera.FieldOfView=36;camera.Parent=view;view.CurrentCamera=camera
	entry={key=key,viewport=view,camera=camera,dim=dim==true,options=options or {}}
	entries[label]=entry
	entry.resizeConnection=label:GetPropertyChangedSignal("AbsoluteSize"):Connect(function() if entry.model and label.AbsoluteSize.X>0 and label.AbsoluteSize.Y>0 then fit(entry) end end)
	label.Destroying:Once(function() CatalogViewport.clear(label) end)
	return true
end
function CatalogViewport.setSpin(label,on)
	local entry=entries[label];if entry then entry.options.spin=on end
end
RunService.RenderStepped:Connect(function()
	local now=os.clock();if now-lastTick<1/24 then return end;lastTick=now
	for label,entry in entries do
		if label.Parent and visible(label) then
			if not entry.model then
				local model=Models.build(entry.key)
				if model then
					local world=Instance.new("WorldModel");world.Parent=entry.viewport;model.Parent=world
					for _,o in model:GetDescendants() do if o:IsA("ParticleEmitter") or o:IsA("BillboardGui") then o:Destroy() end end
					entry.model=model;fit(entry);Animator.prepare(model);silhouette(entry.viewport,entry.dim)
 local loading=Instance.new("TextLabel");loading.Name="Loading3D";loading.BackgroundTransparency=1;loading.Size=UDim2.fromScale(1,1);loading.Text="3D…";loading.TextSize=12;loading.TextColor3=Color3.fromRGB(120,110,140);loading.ZIndex=entry.viewport.ZIndex+1;loading.Parent=entry.viewport
 task.spawn(function()
  local ok=pcall(function() ContentProvider:PreloadAsync({model}) end)
  if entry.viewport.Parent then entry.viewport:SetAttribute("AssetsReady",ok);loading:Destroy() end
 end)
				end
			elseif entry.options.animate then
				if entry.options.spin then entry.model:PivotTo(entry.base*CFrame.Angles(0,now*.25,0)) end
				Animator.step(entry.model,now,true)
			end
		end
	end
end)
return CatalogViewport

local Misc = {}
local C=Color3.fromRGB
local PINK=C(255,150,200);local CREAM=C(255,245,220);local GOLD=C(255,215,100);local BLUE=C(170,215,255);local MINT=C(145,225,180)
local rainbow={PINK,C(255,185,125),GOLD,MINT,BLUE,C(200,160,255)}
local function piece(m,n,size,cf,color,shape)
	local p=Instance.new("Part");p.Name=n;p.Size=size;p.CFrame=cf;p.Color=color;p.Material=Enum.Material.SmoothPlastic
	p.Anchored=true;p.CanCollide=false;p.CanTouch=false;p.CanQuery=false;p.TopSurface=Enum.SurfaceType.Smooth;p.BottomSurface=Enum.SurfaceType.Smooth
	if shape=="cylinder" then p.Shape=Enum.PartType.Cylinder;p.Size=Vector3.new(size.Y,size.X,size.Z);p.CFrame=cf*CFrame.Angles(0,0,math.pi/2)
	elseif shape~="block" then local mesh=Instance.new("SpecialMesh");mesh.MeshType=Enum.MeshType.Sphere;mesh.Parent=p end
	p.Parent=m;return p
end
local function ball(m,n,pos,d,col) return piece(m,n,typeof(d)=="number" and Vector3.one*d or d,CFrame.new(pos),col) end
local function rod(m,n,a,b,r,col)
	local delta=b-a
	return piece(m,n,Vector3.new(r,delta.Magnitude,r),CFrame.lookAt((a+b)/2,b)*CFrame.Angles(math.pi/2,0,0),col,"cylinder")
end
local function star(m,n,pos,r,col)
	for i=0,4 do local a=i*math.pi*2/5;piece(m,n,Vector3.new(r*.3,r*.95,r*.2),CFrame.new(pos+Vector3.new(math.sin(a),math.cos(a),0)*r*.25)*CFrame.Angles(0,0,-a),col) end
end
local function ring(m,n,center,r,col,vertical)
	for i=1,18 do local a=i*math.pi*2/18;local b=(i+1)*math.pi*2/18;local function at(t) return center+(if vertical then Vector3.new(math.cos(t),math.sin(t),0) else Vector3.new(math.cos(t),0,math.sin(t)))*r end;rod(m,n,at(a),at(b),.12,col) end
end
local function cloud(m,center,col)
	for i=-1,1 do ball(m,"Cloud",center+Vector3.new(i*.45,if i==0 then .18 else 0,0),Vector3.new(.85,.65,.6),col) end
end
local function tree(m,pos,col)
	rod(m,"Trunk",pos,pos+Vector3.new(0,1.6,0),.32,C(170,115,90));cloud(m,pos+Vector3.new(0,1.7,0),col)
end
local function bow(m,pos)
	for _,s in {-1,1} do piece(m,"Bow",Vector3.new(.55,.5,.18),CFrame.new(pos+Vector3.new(s*.2,0,0))*CFrame.Angles(0,0,s*.3),PINK) end
	ball(m,"Knot",pos,.22,GOLD)
end
local function gift(m)
	piece(m,"Box",Vector3.one*1.5,CFrame.new(0,.75,0),PINK,"block")
	for _,size in {Vector3.new(.22,1.55,1.55),Vector3.new(1.55,1.55,.22)} do piece(m,"Ribbon",size,CFrame.new(0,.75,0),CREAM,"block") end
	bow(m,Vector3.new(0,1.7,0))
end
local function house(m,kind)
	piece(m,"House",Vector3.new(2.6,2,2),CFrame.new(0,1,0),CREAM,"block")
	for _,s in {-1,1} do piece(m,"Roof",Vector3.new(1.6,.25,2.6),CFrame.new(s*.67,2.2,0)*CFrame.Angles(0,0,-s*.45),PINK,"block") end
	piece(m,"Door",Vector3.new(.7,1.3,.1),CFrame.new(0,.65,-1.06),C(185,130,190),"block")
	if kind=="seedshop" then for i=-1,1 do ball(m,"SeedPack",Vector3.new(i*.6,.7,-1.2),.45,rainbow[i+3]) end end
end
function Misc.build(key: string): Model?
	local m=Instance.new("Model");m.Name=key
	if key=="egg_candyegg" or key=="egg_staregg" then
		local golden=key=="egg_staregg"
		ball(m,"Egg",Vector3.new(0,1.1,0),Vector3.new(1.6,2.15,1.6),if golden then GOLD else CREAM)
		for i=0,7 do local a=i*math.pi/4;local pos=Vector3.new(math.sin(a)*.76,.7+(i%3)*.4,math.cos(a)*.76);if golden then star(m,"Star",pos,.23,CREAM) else ball(m,"PolkaDot",pos,.28,rainbow[i%6+1]) end end
	elseif key=="tool_water" then
		piece(m,"Can",Vector3.new(1.15,1.3,1.15),CFrame.new(0,.75,0),PINK,"cylinder")
		ring(m,"Handle",Vector3.new(-.7,1.05,0),.5,PINK,true)
		rod(m,"Spout",Vector3.new(.4,.65,0),Vector3.new(1.4,1.35,0),.22,PINK)
		ball(m,"Rose",Vector3.new(1.45,1.4,0),Vector3.new(.45,.25,.45),CREAM)
	elseif key=="tool_fertilizer" then
		ball(m,"Bag",Vector3.new(0,.8,0),Vector3.new(1.25,1.6,.8),CREAM)
		piece(m,"BagTop",Vector3.new(1.3,.22,.85),CFrame.new(0,1.5,0),PINK,"block")
		ball(m,"CandyBadge",Vector3.new(0,.9,-.42),.45,PINK)
		for i=1,5 do ball(m,"Granule",Vector3.new((i-3)*.2,.12,-.7),.2,rainbow[i]) end
	elseif key=="tool_drop" then
		local p=ball(m,"Bottle",Vector3.new(0,.75,0),Vector3.new(1.1,1.35,1.1),C(195,160,255));p.Material=Enum.Material.Glass;p.Transparency=.22
		ball(m,"Potion",Vector3.new(0,.55,0),.8,BLUE)
		piece(m,"Cork",Vector3.new(.5,.38,.5),CFrame.new(0,1.5,0),C(195,145,100),"cylinder");bow(m,Vector3.new(0,1.25,-.45))
	elseif key=="fairy_lulu" then
		ball(m,"Dress",Vector3.new(0,.5,0),Vector3.new(.9,.9,.7),PINK)
		ball(m,"Head",Vector3.new(0,1.35,0),.9,C(255,226,206))
		ball(m,"Hair",Vector3.new(0,1.6,.12),Vector3.new(.98,.65,.8),C(255,140,190));ball(m,"Bun",Vector3.new(.24,1.97,.15),.48,PINK)
		for _,s in {-1,1} do
		 ball(m,"Eye",Vector3.new(s*.18,1.4,-.4),.11,C(70,40,90));ball(m,"Cheek",Vector3.new(s*.28,1.24,-.35),.14,PINK)
		 rod(m,if s<0 then "left arm" else "right arm",Vector3.new(s*.35,.9,0),Vector3.new(s*.65,.6,0),.17,C(255,226,206))
		 for j=0,1 do local wing=piece(m,if s<0 then "left wing" else "right wing",Vector3.new(.7,.9-j*.22,.15),CFrame.new(s*.6,1-j*.45,.33)*CFrame.Angles(0,0,-s*.4),if j==0 then BLUE else PINK);wing.Material=Enum.Material.Glass;wing.Transparency=.3 end
		end
	elseif key:match("^cos_.*trail$") then
		for i=0,12 do local a=i*.55;local col=if key=="cos_hearttrail" then PINK elseif key=="cos_startrail" then GOLD else rainbow[i%6+1];local pos=Vector3.new(math.sin(a)*.7,.1+i*.12,math.cos(a)*.45);if key=="cos_startrail" or key=="cos_sparkletrail" then star(m,"TrailStar",pos,.14,col) else ball(m,"TrailCandy",pos,.18,col) end end
	elseif key:match("^weather_") then
		cloud(m,Vector3.new(0,2,0),BLUE)
		for i=0,5 do local pos=Vector3.new((i%3-1)*.5,.3+math.floor(i/3)*.6,0);if key=="weather_starfall" then star(m,"FallingStar",pos,.24,GOLD) else ball(m,"CandyRain",pos,.2,rainbow[i+1]) end end
		if key=="weather_rainbow" then for j,col in rainbow do for i=0,10 do local a=i*math.pi/10;ball(m,"Rainbow",Vector3.new(math.cos(a)*(1+j*.08),math.sin(a)*(1+j*.08),.5),.17,col) end end end
	elseif key:match("^place_") then
		piece(m,"Grass",Vector3.new(3.5,.18,3),CFrame.new(0,-.09,0),MINT,"block")
		if key=="place_plaza" then tree(m,Vector3.new(0,0,0),MINT)
		elseif key=="place_garden" then for x=-1,1 do for z=0,1 do piece(m,"Plot",Vector3.new(.8,.12,.8),CFrame.new(x,.08,z-.5),C(155,115,90),"block");ball(m,"Berry",Vector3.new(x,.45,z-.5),.4,PINK) end end
		elseif key=="place_eggforest" then ball(m,"EggHouse",Vector3.new(0,.9,0),Vector3.new(1.6,1.9,1.6),CREAM);tree(m,Vector3.new(-1.2,0,.7),PINK);tree(m,Vector3.new(1.2,0,.7),BLUE)
		else house(m,if key=="place_seedshop" then "seedshop" else "toolshop") end
	elseif key=="ui_coins" then
		for i=0,5 do piece(m,"Coin",Vector3.new(.8,.17,.8),CFrame.new((i%3-1)*.5,.12+math.floor(i/3)*.25,0)*CFrame.Angles(.1,0,.12),GOLD,"cylinder") end
	elseif key=="ui_dex" then
		piece(m,"Book",Vector3.new(1.8,.25,1.4),CFrame.new(0,.3,0)*CFrame.Angles(.2,0,0),PINK,"block");star(m,"BookStar",Vector3.new(0,.5,-.1),.5,GOLD)
	elseif key=="ui_gift" then gift(m)
	elseif key=="ui_shop" then
		piece(m,"ShoppingBag",Vector3.new(1.3,1.35,.75),CFrame.new(0,.7,0),PINK,"block");ring(m,"Handle",Vector3.new(0,1.5,0),.4,CREAM,true)
	else m:Destroy();return nil end
	return m
end
return Misc

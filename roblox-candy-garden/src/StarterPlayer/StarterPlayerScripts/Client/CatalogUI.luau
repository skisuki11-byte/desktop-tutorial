local Shared=game:GetService("ReplicatedStorage").Shared
local I18n=require(Shared.I18n)
local Data=require(Shared.CatalogData)
local Style=require(script.Parent.Style)
local View=require(script.Parent.CatalogViewport)
local CatalogUI={}
local panel,scroll,grid,search,detail,detailView,detailTitle,detailInfo,detailStatus
local category="all"
local state={}
local selected=nil
local compactCards=false
local function ja() return I18n.language()=="ja" end
-- 名前: 日本語・英語は ずかんのデータ、ほかの ことばは I18n の 名前（なければ 英語）。説明文は 日本語以外は 英語
local NAME_KEY={pet="pet.",crop="crop.",cos="cos.",decor="decor.",furn="furn.",egg="egg.",variant="variant.",weather="weather."}
local function localName(entry)
	if ja() then return entry.name end
	local prefix=NAME_KEY[entry.category]
	if prefix and I18n.language()~="en" and I18n.has(prefix..entry.id) then return I18n.t(prefix..entry.id) end
	return entry.en
end
local function owned(entry)
	local id=entry.id
	if entry.category=="variant" then for _,variants in state.cropDex or {} do if variants[id] then return true end end;return false end
	if entry.category=="pet" then return state.dex and state.dex[id]==true end
	if entry.category=="crop" then local d=state.cropDex and state.cropDex[id];return d and next(d)~=nil end
	if entry.category=="cos" then return state.cosmetics and state.cosmetics.owned and state.cosmetics.owned[id]==true end
	if entry.category=="decor" then return state.decor and state.decor.owned and state.decor.owned[id]==true end
	if entry.category=="furn" then return state.room and state.room.owned and state.room.owned[id]==true end
	return nil
end
local function mystery(entry)
	return (entry.category=="variant" or entry.category=="pet" or entry.category=="crop" or entry.category=="cos" or entry.category=="decor" or entry.category=="furn") and owned(entry)~=true
end
-- まだ会っていないペットは、名前も「？？？」（シルエットと同じく、出るまでの楽しみ）
local function displayName(entry)
	if entry.category=="pet" and mystery(entry) then return "???" end
	return localName(entry)
end
local function status(entry)
	local have=owned(entry)
	if have==true then return I18n.t("cat.found") end
	if mystery(entry) then return I18n.t("cat.secret") end
	return I18n.t("cat.tap")
end
local function showDetail(entry)
	selected=entry
	detail.Visible=true;scroll.Visible=false
	detailTitle.Text=displayName(entry)
	detailInfo.Text=if ja() then entry.info else entry.infoEn
	detailStatus.Text=status(entry)
	View.attach(detailView,entry.key,mystery(entry),{animate=true,spin=true})
	panel:SetAttribute("SelectedEntry",entry.key)
end
local function refresh()
	if not scroll then return end
	for _,child in scroll:GetChildren() do if child:IsA("GuiObject") then child:Destroy() end end
	local query=string.lower(search.Text)
	local count=0
	for i,entry in Data.entries do
		if (category=="all" or category==entry.category) and (query=="" or string.find(string.lower(entry.name.." "..entry.en.." "..localName(entry).." "..entry.info),query,1,true)) then
			count+=1
			local card=Style.button({Name="Entry_"..entry.key,LayoutOrder=i,Text="",BackgroundColor3=Color3.new(1,1,1),ZIndex=12},scroll)
			local border=card:FindFirstChildOfClass("UIStroke")
			if entry.rarity then border.Transparency=if mystery(entry) then .65 else 0;border.Color=Style.Rarity[entry.rarity] or Style.Color.Dim end
			local frame=Style.make("Frame",{Name="Preview",Position=UDim2.fromOffset(5,4),Size=UDim2.new(1,-10,1,-58),BackgroundTransparency=1,ZIndex=13},card) -- 絵は カードの のこり ぜんぶ（カードの 高さが かわっても 合う）
			View.attach(frame,entry.key,mystery(entry))
			Style.label({Name="EntryName",Position=UDim2.new(0,5,1,-52),Size=UDim2.new(1,-10,0,26),Text=displayName(entry),TextSize=16,ZIndex=13},card)
			Style.label({Name="CollectionStatus",Position=UDim2.new(0,4,1,-25),Size=UDim2.new(1,-8,0,20),Text=if entry.rarity then string.rep("★",entry.rarity).." · "..status(entry) else status(entry),TextSize=10,TextColor3=Style.Color.TextMuted,ZIndex=13},card)
			card.Activated:Connect(function() showDetail(entry) end)
		end
	end
	panel:SetAttribute("MatchCount",count)
	if count==0 then Style.label({Size=UDim2.new(1,0,0,70),Text=I18n.t("cat.none"),ZIndex=12},scroll) end
end
function CatalogUI.build(gui,onClose)
	panel,scroll=Style.modal(gui,"CatalogPanel",I18n.t("cat.title"),onClose,Style.Color.Mint)
	panel:SetAttribute("OwnLayout",true) -- 配置は このファイルの layout() で決める（Style.modal の 横持ち用の配置は つかわない）
	panel:FindFirstChildOfClass("UISizeConstraint").MaxSize=Vector2.new(960,760)
	for _,label in panel.Header:GetChildren() do if label:IsA("TextLabel") then label.TextScaled=true;Style.make("UITextSizeConstraint",{MaxTextSize=28,MinTextSize=14},label) end end
	scroll.Position=UDim2.fromOffset(14,178);scroll.Size=UDim2.new(1,-28,1,-192)
	grid=Style.make("UIGridLayout",{CellSize=UDim2.new(.3333,-13,0,194),CellPadding=UDim2.fromOffset(12,12),SortOrder=Enum.SortOrder.LayoutOrder},scroll)
	local tabs=Style.make("ScrollingFrame",{Name="Categories",Position=UDim2.fromOffset(14,80),Size=UDim2.new(1,-28,0,42),CanvasSize=UDim2.new(),AutomaticCanvasSize=Enum.AutomaticSize.X,ScrollingDirection=Enum.ScrollingDirection.X,ScrollBarThickness=3,BackgroundTransparency=1,BorderSizePixel=0,ZIndex=12},panel)
	Style.make("UIListLayout",{FillDirection=Enum.FillDirection.Horizontal,Padding=UDim.new(0,8),SortOrder=Enum.SortOrder.LayoutOrder},tabs)
	for order,key in {"all","pet","egg","crop","cos","decor","furn","tool","variant","fairy","weather","place","ui"} do
		local b=Style.button({Name="Category_"..key,LayoutOrder=order,Size=UDim2.fromOffset(84,35),Text=I18n.t("cat.tab."..key),TextSize=13,ZIndex=12},tabs)
		b.Activated:Connect(function() category=key;detail.Visible=false;scroll.Visible=true;scroll.CanvasPosition=Vector2.zero;refresh() end)
	end
	search=Style.make("TextBox",{Name="CatalogSearch",Position=UDim2.fromOffset(20,133),Size=UDim2.new(1,-40,0,34),PlaceholderText=I18n.t("cat.search"),Text="",ClearTextOnFocus=false,Font=Style.Font,TextSize=15,TextColor3=Style.Color.Text,BackgroundColor3=Color3.new(1,1,1),ZIndex=12},panel);Style.round(search,12)
	search:GetPropertyChangedSignal("Text"):Connect(function() detail.Visible=false;scroll.Visible=true;refresh() end)
	detail=Style.make("Frame",{Name="Detail",Position=UDim2.fromOffset(14,178),Size=UDim2.new(1,-28,1,-192),BackgroundColor3=Style.Color.Surface,BorderSizePixel=0,Visible=false,ZIndex=13},panel)
	local back=Style.button({Name="Back",Position=UDim2.fromOffset(6,4),Size=UDim2.fromOffset(100,36),Text=I18n.t("cat.back"),TextSize=14,ZIndex=16},detail)
	back.Activated:Connect(function() detail.Visible=false;scroll.Visible=true end)
	detailTitle=Style.label({Position=UDim2.new(0,114,0,4),Size=UDim2.new(1,-124,0,38),Text="",TextSize=18,ZIndex=15},detail)
	detailView=Style.make("Frame",{Name="DetailPreview",Position=UDim2.fromOffset(10,44),Size=UDim2.new(1,-20,.48,-20),BackgroundTransparency=1,ZIndex=14},detail)
	detailStatus=Style.label({Position=UDim2.new(0,8,.48,26),Size=UDim2.new(1,-16,0,26),Text="",TextSize=13,TextColor3=Style.Color.AccentDark,ZIndex=15},detail)
	local infoScroll=Style.make("ScrollingFrame",{Name="Information",Position=UDim2.new(0,10,.48,58),Size=UDim2.new(1,-20,.52,-64),CanvasSize=UDim2.new(),AutomaticCanvasSize=Enum.AutomaticSize.Y,BackgroundTransparency=1,BorderSizePixel=0,ScrollBarThickness=6,ZIndex=14},detail)
	detailInfo=Style.label({Size=UDim2.new(1,-12,0,0),AutomaticSize=Enum.AutomaticSize.Y,Text="",TextSize=14,TextWrapped=true,TextXAlignment=Enum.TextXAlignment.Left,TextYAlignment=Enum.TextYAlignment.Top,ZIndex=15},infoScroll)
	local function layout()
 -- 横持ちの スマホ（画面の 高さが ひくい）: 画面いっぱいに ひろげ、見出しを 細く、タブと 検索を 1段に まとめて、カードの 場所を 広くする
 local screen=gui.AbsoluteSize
 local short=screen.Y<480
 if short then panel.AnchorPoint=Vector2.new(.5,.5);panel.Position=UDim2.fromScale(.5,.5);panel.Size=UDim2.new(1,-36,1,-14) end
 local condensed=panel.AbsoluteSize.Y<400
 compactCards=condensed
 local headerH=if condensed then 42 else 66
 panel.Header.Size=UDim2.new(1,0,0,headerH)
 local close=panel:FindFirstChild("Close");if close then close.Size=UDim2.fromOffset(if condensed then 40 else 60,if condensed then 40 else 60) end
 local rowY=headerH+8
 local rowH=if condensed then 32 else 42
 local searchW=if condensed then math.clamp(panel.AbsoluteSize.X*0.26,140,220) else 0
 tabs.Position=UDim2.fromOffset(14,rowY);tabs.Size=UDim2.new(1,-28-(if condensed then searchW+8 else 0),0,rowH)
 for _,b in tabs:GetChildren() do if b:IsA("TextButton") then b.Size=UDim2.fromOffset(84,rowH-4) end end
 if condensed then
  search.Position=UDim2.new(1,-14-searchW,0,rowY+2);search.Size=UDim2.fromOffset(searchW,rowH-4)
 else
  search.Position=UDim2.fromOffset(20,rowY+rowH+11);search.Size=UDim2.new(1,-40,0,34)
 end
 local contentY=if condensed then rowY+rowH+8 else rowY+rowH+11+34+11
 scroll.Position=UDim2.fromOffset(14,contentY);scroll.Size=UDim2.new(1,-28,1,-contentY-14)
 detail.Position=UDim2.fromOffset(14,contentY);detail.Size=UDim2.new(1,-28,1,-contentY-14)
 -- カードは、1だん まるごと 見える 高さ（大きいほど 見やすい。上限 210）
 local cols=if panel.AbsoluteSize.X<500 then 2 elseif panel.AbsoluteSize.X<900 then 3 else 4
 local areaH=panel.AbsoluteSize.Y-contentY-14
 local cellH=math.clamp(areaH-8,150,210)
 grid.CellSize=UDim2.new(1/cols,-14,0,cellH)
 local narrow=panel.AbsoluteSize.Y<480
 detailView.Position=UDim2.fromOffset(10,44);detailView.Size=if narrow then UDim2.new(.44,-12,1,-48) else UDim2.new(1,-20,.48,-20)
 detailStatus.Position=if narrow then UDim2.new(.45,0,0,44) else UDim2.new(0,8,.48,26);detailStatus.Size=if narrow then UDim2.new(.55,-10,0,28) else UDim2.new(1,-16,0,26)
 infoScroll.Position=if narrow then UDim2.new(.45,0,0,78) else UDim2.new(0,10,.48,58);infoScroll.Size=if narrow then UDim2.new(.55,-10,1,-84) else UDim2.new(1,-20,.52,-64)
end
	panel:GetPropertyChangedSignal("AbsoluteSize"):Connect(layout);gui:GetPropertyChangedSignal("AbsoluteSize"):Connect(layout);layout();refresh()
end
function CatalogUI.setVisible(on) if panel then panel.Visible=on;if on then refresh() end end end
function CatalogUI.isVisible() return panel and panel.Visible or false end
function CatalogUI.update(value)
 state=value or {}
 -- 閉じているあいだは何もしない（開いたときに refresh で まとめて合わせる）
 if not (panel and panel.Visible) then return end
 if selected then detailStatus.Text=status(selected);View.attach(detailView,selected.key,mystery(selected),{animate=true,spin=true}) end
 if scroll then for _,entry in Data.entries do local card=scroll:FindFirstChild("Entry_"..entry.key);if card then local preview=card:FindFirstChild("Preview");if preview then View.attach(preview,entry.key,mystery(entry)) end;local statusLabel=card:FindFirstChild("CollectionStatus");if statusLabel then statusLabel.Text=if entry.rarity then string.rep("★",entry.rarity).." · "..status(entry) else status(entry) end;local border=card:FindFirstChildOfClass("UIStroke");if border and entry.rarity then border.Transparency=if mystery(entry) then .65 else 0 end end end end
 -- 会えたペットは、名前も見せる
 if selected and detailTitle then detailTitle.Text=displayName(selected) end
 if scroll then for _,entry in Data.entries do local card=scroll:FindFirstChild("Entry_"..entry.key);local name=card and card:FindFirstChild("EntryName");if name then name.Text=displayName(entry) end end end
end
return CatalogUI

-- 畑のプロンプト表示（自分の畑だけ・状態に応じて文言を切替）と、初回チュートリアル。
-- 方針: 10秒以内に次の行動を示し、「植える→待つ→収穫→売る」を矢印と短い文で案内する。
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage.Shared.Config)
local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)
local UI = require(script.Parent.UI)

local Tutorial = {}

local t = I18n.t
local player = Players.LocalPlayer

local state = nil
local arrow: BillboardGui? = nil
local arrowTween: Tween? = nil

local function myTiles()
	local result = {}
	local plots = workspace:FindFirstChild("Plots")
	if not plots then
		return result
	end
	for _, model in plots:GetChildren() do
		if model:GetAttribute("OwnerUserId") == player.UserId then
			for _, child in model:GetChildren() do
				if child:GetAttribute("IsTile") then
					table.insert(result, child)
				end
			end
		end
	end
	return result
end

local function ensureArrow()
	if arrow then
		return arrow
	end
	arrow = Style.make("BillboardGui", {
		Name = "TutorialArrow",
		Size = UDim2.fromOffset(80, 80),
		StudsOffset = Vector3.new(0, 7, 0),
		AlwaysOnTop = true,
		ResetOnSpawn = false,
	}, player:WaitForChild("PlayerGui"))
	local label = Style.label({
		Name = "Arrow",
		Size = UDim2.fromScale(1, 1),
		Text = "⬇️",
		TextSize = 64,
		TextWrapped = false,
	}, arrow)
	arrowTween = TweenService:Create(
		label,
		TweenInfo.new(0.5, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
		{ Position = UDim2.fromOffset(0, 14) }
	)
	arrowTween:Play()
	return arrow
end

local function pointAt(tile: BasePart?)
	if tile then
		local a = ensureArrow()
		a.Adornee = tile
		a.Enabled = true
	elseif arrow then
		arrow.Enabled = false
	end
end

-- 選んだ種を持っているか
local function hasSeed(): boolean
	return state ~= nil and state.selected ~= nil
end

-- ProximityPromptを自分の畑の状態に合わせる（文言は端末の言語で出す）
local function refreshPrompts()
	local plots = workspace:FindFirstChild("Plots")
	if not plots or not state then
		return
	end
	for _, model in plots:GetChildren() do
		local mine = model:GetAttribute("OwnerUserId") == player.UserId
		for _, tile in model:GetChildren() do
			local prompt = tile:FindFirstChild("Prompt")
			if prompt and prompt:IsA("ProximityPrompt") then
				local crop = tile:GetAttribute("Crop")
				if tile:GetAttribute("Locked") then
					prompt.Enabled = false -- まだ広げていない畑
					continue
				end
				-- 水やり・ひりょうは、道具（じょうろ・ひりょう）を自分で選んで持っているときだけ出す
				-- （植えたらすぐ出すと、世話をしなくても進んでしまう。ほかの人の畑も手伝える）
				local growing = crop ~= nil and not tile:GetAttribute("Ready")
				local canWater = growing
					and state.tool == "water"
					and not tile:GetAttribute("Watered")
					and state.water ~= nil
					and state.water.amount > 0
				local canFertilize = growing
					and state.tool == "fertilizer"
					and not tile:GetAttribute("Fertilized")
					and (state.fertilizer or 0) > 0
				local canDrop = growing
					and state.tool == "drop"
					and not tile:GetAttribute("Drop")
					and (state.drops or 0) > 0
				if canWater or canFertilize or canDrop then
					prompt.Enabled = true
					prompt.ActionText = t(if canWater then "prompt.water" elseif canDrop then "prompt.drop" else "prompt.fertilize")
					prompt.ObjectText = t("crop." .. crop)
				elseif not mine then
					prompt.Enabled = false
				else
					if crop == nil then
						prompt.Enabled = hasSeed() and state.tool == nil -- 道具を持っているときは植えない
						prompt.ActionText = t("prompt.plant")
						prompt.ObjectText = state.selected and t("crop." .. state.selected) or ""
					elseif tile:GetAttribute("Ready") then
						prompt.Enabled = true
						prompt.ActionText = t("prompt.harvest")
						prompt.ObjectText = t("crop." .. crop)
					else
						prompt.Enabled = false
					end
				end
			end
		end
	end
end

local function refreshTutorial()
	if not state or state.tutorialDone then
		UI.setBanner(nil)
		UI.highlight(nil)
		pointAt(nil)
		return
	end

	local buttons = UI.buttons()
	local tiles = myTiles()
	local readyTile, emptyTile, growingTile = nil, nil, nil
	local waitLeft = math.huge

	for _, tile in tiles do
		local crop = tile:GetAttribute("Crop")
		if crop == nil then
			emptyTile = emptyTile or tile
		elseif tile:GetAttribute("Ready") then
			readyTile = readyTile or tile
		else
			growingTile = growingTile or tile
			local left = (tile:GetAttribute("PlantedAt") + tile:GetAttribute("GrowTime")) - workspace:GetServerTimeNow()
			waitLeft = math.min(waitLeft, left)
		end
	end

	local _, basketCount = Config.basketValue(state)
	local hasBasket = basketCount > 0

	UI.highlight(nil)
	pointAt(nil)

	if readyTile then
		UI.setBanner("🍓 " .. t("tutorial.harvest"))
		pointAt(readyTile)
	elseif hasBasket then
		UI.setBanner("💰 " .. t("tutorial.sell"))
		UI.highlight(buttons.sell)
	elseif hasSeed() and emptyTile then
		UI.setBanner("🌱 " .. t("tutorial.plant"))
		pointAt(emptyTile)
	elseif growingTile then
		UI.setBanner("⏳ " .. t("tutorial.wait", math.max(0, math.ceil(waitLeft))))
	else
		UI.setBanner("🛒 " .. t("tutorial.buy"))
		UI.highlight(buttons.shop)
	end
end

function Tutorial.update(newState)
	state = newState
	refreshPrompts()
	refreshTutorial()
end

function Tutorial.init()
	-- 属性の変化（育った・収穫した）や残り秒数は、定期的に見直す
	task.spawn(function()
		while true do
			task.wait(0.4)
			refreshPrompts()
			refreshTutorial()
		end
	end)
end

return Tutorial

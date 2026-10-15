-- 畑の「植える」「収穫」の小さなボタン。Robloxの標準の大きな吹き出しは、スマホでは畑の真ん中をふさぐので、
-- 畑の上に浮かぶ小さな丸いボタンに置きかえる（ProximityPrompt の Style = Custom）。
-- キーボードの E でも、これまでどおり動く。
local Players = game:GetService("Players")
local ProximityPromptService = game:GetService("ProximityPromptService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local I18n = require(ReplicatedStorage.Shared.I18n)
local Style = require(script.Parent.Style)

local PromptUI = {}

local C = Style.Color
local t = I18n.t

local shown: { [ProximityPrompt]: { gui: BillboardGui, conn: RBXScriptConnection } } = {}

local function iconFor(prompt: ProximityPrompt): string
	return if prompt.ActionText == t("prompt.harvest") then "🧺" else "🌱"
end

local function textFor(prompt: ProximityPrompt): string
	local text = iconFor(prompt) .. " " .. prompt.ActionText
	-- パソコンでは、押すキーも書く
	if UserInputService.KeyboardEnabled and not UserInputService.TouchEnabled then
		text = "[E] " .. text
	end
	return text
end

local function hide(prompt: ProximityPrompt)
	local entry = shown[prompt]
	if entry then
		entry.conn:Disconnect()
		entry.gui:Destroy()
		shown[prompt] = nil
	end
end

local function show(prompt: ProximityPrompt)
	hide(prompt)
	local target = prompt.Parent
	if not (target and target:IsA("BasePart")) then
		return
	end
	local harvest = prompt.ActionText == t("prompt.harvest")
	local gui = Style.make("BillboardGui", {
		Name = "PromptButton",
		Adornee = target,
		Size = UDim2.fromOffset(118, 44),
		StudsOffset = Vector3.new(0, 3.2, 0),
		AlwaysOnTop = true,
		Active = true,
		ResetOnSpawn = false,
	}, Players.LocalPlayer:WaitForChild("PlayerGui"))
	local button = Style.button({
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = if harvest then C.Yellow else C.Mint,
		TextColor3 = C.Text,
		Text = textFor(prompt),
		TextSize = 18,
		TextWrapped = false,
	}, gui)
	button:FindFirstChildOfClass("UICorner").CornerRadius = UDim.new(0.5, 0)
	Style.pop(button, 0.8)
	button.Activated:Connect(function()
		prompt:InputHoldBegin()
		prompt:InputHoldEnd()
	end)
	local conn = prompt:GetPropertyChangedSignal("ActionText"):Connect(function()
		button.Text = textFor(prompt)
		button.BackgroundColor3 = if prompt.ActionText == t("prompt.harvest") then C.Yellow else C.Mint
	end)
	shown[prompt] = { gui = gui, conn = conn }
end

function PromptUI.init()
	ProximityPromptService.PromptShown:Connect(function(prompt)
		if prompt.Style == Enum.ProximityPromptStyle.Custom then
			show(prompt)
		end
	end)
	ProximityPromptService.PromptHidden:Connect(hide)
end

return PromptUI

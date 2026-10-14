-- クライアント起動。サーバーから届く状態(State)をUIとチュートリアルに渡す。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local UI = require(script.UI)
local Tutorial = require(script.Tutorial)
local PalRenderer = require(script.PalRenderer)
local WeatherClient = require(script.WeatherClient)

UI.init()
Tutorial.init()
PalRenderer.init()
WeatherClient.init(UI)

Remotes.Toast.OnClientEvent:Connect(function(key, ...)
	if type(key) == "string" then
		UI.toast(key, ...)
	end
end)

Remotes.EggResult.OnClientEvent:Connect(function(petId)
	if type(petId) == "string" and Config.PetById[petId] then
		UI.playHatch(petId)
	end
end)

Remotes.State.OnClientEvent:Connect(function(state)
	UI.update(state)
	Tutorial.update(state)
end)

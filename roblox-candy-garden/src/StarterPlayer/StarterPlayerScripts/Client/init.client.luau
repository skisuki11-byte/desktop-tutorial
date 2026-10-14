-- クライアント起動。サーバーから届く状態(State)をUIとチュートリアルに渡す。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local UI = require(script.UI)
local Tutorial = require(script.Tutorial)

UI.init()
Tutorial.init()

Remotes.Toast.OnClientEvent:Connect(function(key, ...)
	if type(key) == "string" then
		UI.toast(key, ...)
	end
end)

Remotes.State.OnClientEvent:Connect(function(state)
	UI.update(state)
	Tutorial.update(state)
end)

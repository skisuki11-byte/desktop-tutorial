-- クライアント起動。サーバーから届く状態(State)をUIとチュートリアルに渡す。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local UI = require(script.UI)
local Tutorial = require(script.Tutorial)
local PalRenderer = require(script.PalRenderer)
local WeatherClient = require(script.WeatherClient)
local TreeClient = require(script.TreeClient)

UI.init()
Tutorial.init()
PalRenderer.init()
WeatherClient.init(UI)
TreeClient.init(UI)

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

-- おかえりメッセージ（しばらくぶりに来たとき）。いない間に実った数を見せる
Remotes.WelcomeBack.OnClientEvent:Connect(function(readyCount)
	if type(readyCount) ~= "number" then
		return
	end
	local I18n = require(ReplicatedStorage.Shared.I18n)
	local text = readyCount > 0 and I18n.t("welcome.ready", readyCount) or I18n.t("welcome.plain")
	task.delay(1.5, function() -- 画面が出そろってから
		UI.toastText(text, 6)
	end)
end)

Remotes.State.OnClientEvent:Connect(function(state)
	UI.update(state)
	Tutorial.update(state)
end)

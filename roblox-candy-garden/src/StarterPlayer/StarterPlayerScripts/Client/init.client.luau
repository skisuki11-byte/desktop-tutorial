-- クライアント起動。サーバーから届く状態(State)をUIとチュートリアルに渡す。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local UI = require(script.UI)
local Tutorial = require(script.Tutorial)
local PalRenderer = require(script.PalRenderer)
local WeatherClient = require(script.WeatherClient)
local TreeClient = require(script.TreeClient)
local Sounds = require(script.Sounds)
local DayNight = require(script.DayNight)
local PromptUI = require(script.PromptUI)
local Style = require(script.Style)

Sounds.init()
Style.onTap = function()
	Sounds.play("tap")
end
UI.init()
Tutorial.init()
PalRenderer.init()
WeatherClient.init(UI)
TreeClient.init(UI)
UI.relayout()
DayNight.init()
PromptUI.init()

Remotes.Toast.OnClientEvent:Connect(function(key, ...)
	if type(key) == "string" then
		UI.toast(key, ...)
		Sounds.toast(key)
	end
end)

Remotes.EggResult.OnClientEvent:Connect(function(petId)
	if type(petId) == "string" and Config.PetById[petId] then
		UI.playHatch(petId)
		Sounds.hatch()
	end
end)

-- みんなの木のレベルアップ・パスの段・ログインコードは、和音でお祝い
Remotes.TreeLevelUp.OnClientEvent:Connect(function()
	Sounds.play("jingle")
end)
Remotes.SeasonReward.OnClientEvent:Connect(function()
	Sounds.play("jingle")
end)
Remotes.CodeResult.OnClientEvent:Connect(function(status)
	Sounds.play(status == "ok" and "jingle" or "nope")
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
	Sounds.onState(state) -- 先に呼ぶ（保存してあるBGMの設定を、UIの表示より先に反映する）
	UI.update(state)
	Tutorial.update(state)
end)

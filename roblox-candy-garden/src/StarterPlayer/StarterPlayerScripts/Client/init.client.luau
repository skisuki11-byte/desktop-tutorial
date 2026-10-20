-- クライアント起動。サーバーから届く状態(State)をUIとチュートリアルに渡す。
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

-- スマホ・タブレットでは、いつも横画面にする（左右どちら向きでも OK）。
-- 縦にすると 畑が せまく見え、ボタンが 画面の上下に ちらばって 押しにくい
local playerGui = Players.LocalPlayer:WaitForChild("PlayerGui")
playerGui.ScreenOrientation = Enum.ScreenOrientation.LandscapeSensor

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
local StarGiftUI = require(script.StarGiftUI)
local RoomHider = require(script.RoomHider)
local BackFade = require(script.BackFade)
local TradeUI = require(script.TradeUI)
local PalsUI = require(script.PalsUI)
local Style = require(script.Style)

Sounds.init()
Style.onTap = function()
	Sounds.play("tap")
end
UI.init()
Tutorial.init()
-- ルルの ひみつきち案内（ボタンを 押すと 🏠 へ）
require(script.NewTips).setTalker(function(key)
	if key == "tipBase" or key == "tipRoom" then
		local I18n = require(game:GetService("ReplicatedStorage").Shared.I18n)
		Tutorial.tip(I18n.t("newtip." .. key), "🏠 " .. I18n.t("tip.go"), UI.goBase)
		return true
	end
	return false
end)
-- ペットとたまごの3Dの色を、遊びはじめて少ししたら 先に読みこんでおく
-- （たまごが割れたとき・ずかんを開いたときに、色のない まっくろな形が出ないように）
task.delay(6, function()
	local keys = {}
	for _, pet in Config.Pets do
		table.insert(keys, "pet_" .. pet.id)
	end
	for _, egg in Config.Eggs do
		table.insert(keys, "egg_" .. egg.id)
	end
	require(script.CatalogViewport).preload(keys)
end)
PalRenderer.init()
require(script.ToolRenderer).init()
WeatherClient.init(UI)
TreeClient.init(UI)
UI.relayout()
DayNight.init()
PromptUI.init(UI)
StarGiftUI.init(UI)
RoomHider.init()
BackFade.init()
TradeUI.init(UI)
PalsUI.onTrade = TradeUI.openPicker

Remotes.Toast.OnClientEvent:Connect(function(key, ...)
	if type(key) == "string" then
		UI.toast(key, ...)
		Sounds.toast(key)
	end
end)

Remotes.EggResult.OnClientEvent:Connect(function(petId, eggId)
	if type(petId) == "string" and Config.PetById[petId] then
		UI.playHatch(petId, if type(eggId) == "string" then eggId else nil)
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
	TradeUI.update(state)
	Sounds.onState(state) -- 先に呼ぶ（保存してあるBGMの設定を、UIの表示より先に反映する）
	UI.update(state)
	Tutorial.update(state)
	TreeClient.update(state)
end)

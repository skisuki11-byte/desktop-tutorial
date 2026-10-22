-- ひみつきちの 見学（しょうたい）。友だちを まねいて、自分の へやと はくぶつかんを 見てもらう。
-- 安全のための 決まり（ひみつきちは「自分だけの 場所」のまま。2人きりの 部屋を 作らない）:
--   ・まねけるのは Roblox で 友だちの 人だけ（こうかんと 同じ）。まねかれた子が「見にいく」を 押したときだけ 入る
--   ・持ち主が ひみつきちの 中に いる あいだは まねけない・見学を はじめない。見学中は 持ち主も 入れない
--     （同じ へやに 2人に ならない）
--   ・一度に 1人だけ。Config.Visit.seconds で 自動で おしまい。持ち主は いつでも「おわり」に できる
--   ・見に来た子は 見るだけ（家具や 飾りは さわれない。とびらで 動く・出る だけ）
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local RateLimit = require(script.Parent.RateLimit)
local Room = require(script.Parent.Room)
local World = require(script.Parent.World)

local Visit = {}

type Session = { host: Player, visitor: Player, token: number, endsAt: number }

local byHost: { [Player]: Session } = {}
local byVisitor: { [Player]: Session } = {}
local invites: { [Player]: { from: Player, at: number } } = {} -- [まねかれた子] = まねいた子
local tokens = 0

local function isFriends(a: Player, b: Player): boolean
	-- Studio の テスト用プレイヤー（IDが マイナス）どうしは、友だちとして 試せる
	if RunService:IsStudio() and a.UserId < 0 and b.UserId < 0 then
		return true
	end
	local ok, result = pcall(function()
		return a:IsFriendsWith(b.UserId)
	end)
	return ok and result == true
end

local function hasBase(player: Player): boolean
	local plot = World.plotOf(player)
	local reform = plot and plot.model:FindFirstChild("Reform")
	return reform ~= nil and reform:FindFirstChild("Room") ~= nil
end

local function sendState(session: Session?, host: Player, visitor: Player)
	if session then
		Remotes.VisitState:FireClient(host, { role = "host", partner = visitor.DisplayName, endsAt = session.endsAt })
		Remotes.VisitState:FireClient(visitor, { role = "visitor", partner = host.DisplayName, endsAt = session.endsAt })
	else
		Remotes.VisitState:FireClient(host, { role = "none" })
		Remotes.VisitState:FireClient(visitor, { role = "none" })
	end
end

local function finish(session: Session, reason: string?)
	if byHost[session.host] ~= session then
		return
	end
	byHost[session.host] = nil
	byVisitor[session.visitor] = nil
	local host, visitor = session.host, session.visitor
	visitor:SetAttribute("VisitingUserId", nil)
	-- まだ 中に いたら、持ち主の 家の 前に 出す
	if visitor.Parent and host.Parent and Room.isInsideBase(visitor, host) then
		Room.putOutside(visitor, host)
	end
	if host.Parent and visitor.Parent then
		sendState(nil, host, visitor)
		Remotes.Toast:FireClient(host, reason or "toast.visitEnded")
		Remotes.Toast:FireClient(visitor, reason or "toast.visitEnded")
	elseif host.Parent then
		Remotes.VisitState:FireClient(host, { role = "none" })
	elseif visitor.Parent then
		Remotes.VisitState:FireClient(visitor, { role = "none" })
	end
end

local function invite(host: Player, targetUserId: any)
	if type(targetUserId) ~= "number" or not RateLimit.ok(host, "visitInvite", 1) then
		return
	end
	local target = Players:GetPlayerByUserId(targetUserId)
	if not target or target == host or not isFriends(host, target) then
		return
	end
	if not hasBase(host) then
		Remotes.Toast:FireClient(host, "toast.visitNoBase")
		return
	end
	if Room.isInsideBase(host, host) then
		Remotes.Toast:FireClient(host, "toast.visitGoOutside")
		return
	end
	if byHost[host] or byVisitor[host] or byHost[target] or byVisitor[target] then
		Remotes.Toast:FireClient(host, "toast.visitCannot")
		return
	end
	invites[target] = { from = host, at = os.clock() }
	Remotes.VisitInvite:FireClient(target, host.UserId, host.DisplayName)
	Remotes.Toast:FireClient(host, "toast.visitSent", target.DisplayName)
end

local function respond(visitor: Player, hostUserId: any, accept: any)
	if type(hostUserId) ~= "number" or type(accept) ~= "boolean" or not RateLimit.ok(visitor, "visitRespond", 0.5) then
		return
	end
	local entry = invites[visitor]
	if not entry or entry.from.UserId ~= hostUserId or os.clock() - entry.at > Config.Visit.requestSeconds then
		return
	end
	invites[visitor] = nil
	local host = entry.from
	if not host.Parent then
		return
	end
	if not accept then
		Remotes.Toast:FireClient(host, "toast.visitDeclined", visitor.DisplayName)
		return
	end
	if byHost[host] or byVisitor[host] or byHost[visitor] or byVisitor[visitor] or not isFriends(host, visitor) then
		Remotes.Toast:FireClient(visitor, "toast.visitCannot")
		return
	end
	-- 持ち主が 中に いたら はじめない（2人きりに ならない）
	if Room.isInsideBase(host, host) then
		Remotes.Toast:FireClient(visitor, "toast.visitHostInside", host.DisplayName)
		Remotes.Toast:FireClient(host, "toast.visitGoOutside")
		return
	end
	tokens += 1
	local session: Session = { host = host, visitor = visitor, token = tokens, endsAt = os.time() + Config.Visit.seconds }
	byHost[host] = session
	byVisitor[visitor] = session
	visitor:SetAttribute("VisitingUserId", host.UserId)
	if not Room.putInRoom(visitor, host) then
		finish(session, "toast.visitCannot")
		return
	end
	sendState(session, host, visitor)
	-- 時間が たったら おしまい
	task.delay(Config.Visit.seconds, function()
		if byHost[host] == session then
			finish(session, "toast.visitTimeUp")
		end
	end)
	-- 見に来た子が 外に 出たら（とびら・ワープ・ほかの 場所へ）おしまい
	task.spawn(function()
		task.wait(2)
		while byHost[host] == session do
			if not visitor.Parent or not host.Parent or not Room.isInsideBase(visitor, host) then
				finish(session)
				break
			end
			task.wait(1)
		end
	end)
end

function Visit.init()
	Room.hostOf = function(player: Player): Player?
		local session = byVisitor[player]
		return session and session.host
	end
	Room.visitorOf = function(player: Player): Player?
		local session = byHost[player]
		return session and session.visitor
	end
	Remotes.VisitInvite.OnServerEvent:Connect(invite)
	Remotes.VisitRespond.OnServerEvent:Connect(respond)
	Remotes.VisitEnd.OnServerEvent:Connect(function(player)
		local session = byHost[player] or byVisitor[player]
		if session then
			finish(session)
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		invites[player] = nil
		local session = byHost[player] or byVisitor[player]
		if session then
			finish(session)
		end
	end)
end

return Visit

-- ペットの交換。全てサーバーで管理する（クライアントは「出したいペット」と「OK」を伝えるだけ）。
-- 安全のための決まり（Adopt Me! などで交換のだまし取りが多かった反省から）:
--   ・Robloxで友だちの人とだけ（知らない人からの おさそい は届かない）
--   ・おたがいの中身は、いつも両方の画面に出す
--   ・2人とも OK を押したら、Config.Trade.countdown 秒待ってから交換。その間に中身が変わったら OK は取り消し
--   ・おくりものでもらった特別なペット（giftOnly）は出せない
--   ・交換の直前に、持ち主・数をもう一度確かめる。交換したら、すぐに2人とも保存する
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Pals = require(script.Parent.Pals)
local RateLimit = require(script.Parent.RateLimit)

local Trade = {}

type Session = {
	a: Player,
	b: Player,
	offers: { [Player]: { number } },
	ready: { [Player]: boolean },
	countdownToken: number,
	countingDown: boolean,
}

local sessions: { [Player]: Session } = {}
local invites: { [Player]: { from: Player, at: number } } = {} -- [誘われた人] = 誘った人

local function partnerOf(session: Session, player: Player): Player
	return if session.a == player then session.b else session.a
end

local function petOf(d, uid: number)
	for _, entry in d.pets do
		if entry.uid == uid then
			return entry
		end
	end
	return nil
end

local function isFriends(a: Player, b: Player): boolean
	-- Studio の「サーバーとクライアント」のテスト用プレイヤー（IDがマイナス）どうしは、友だちとして試せるようにする
	if RunService:IsStudio() and a.UserId < 0 and b.UserId < 0 then
		return true
	end
	local ok, result = pcall(function()
		return a:IsFriendsWith(b.UserId)
	end)
	return ok and result == true
end

-- 2人の画面に、今の中身を送る
local function sendState(session: Session)
	for _, player in { session.a, session.b } do
		local partner = partnerOf(session, player)
		local function list(owner: Player)
			local d = Data.get(owner)
			local out = {}
			for _, uid in session.offers[owner] do
				local entry = d and petOf(d, uid)
				if entry then
					table.insert(out, { uid = uid, pet = entry.pet })
				end
			end
			return out
		end
		Remotes.TradeState:FireClient(player, {
			open = true,
			partnerName = partner.DisplayName,
			mine = list(player),
			theirs = list(partner),
			myReady = session.ready[player],
			theirReady = session.ready[partner],
			countingDown = session.countingDown,
		})
	end
end

local function close(session: Session, toastKey: string?)
	for _, player in { session.a, session.b } do
		sessions[player] = nil
		if player.Parent == Players then
			Remotes.TradeState:FireClient(player, { open = false })
			if toastKey then
				Remotes.Toast:FireClient(player, toastKey)
			end
		end
	end
end

-- 中身が変わったら、OK は2人ともやりなおし
local function resetReady(session: Session)
	session.ready[session.a] = false
	session.ready[session.b] = false
	session.countingDown = false
	session.countdownToken += 1
end

-- 交換する（直前にもう一度、全部確かめる）
local function execute(session: Session)
	local a, b = session.a, session.b
	local da, db = Data.get(a), Data.get(b)
	if not da or not db or sessions[a] ~= session or sessions[b] ~= session then
		return
	end
	local giveA, giveB = session.offers[a], session.offers[b]
	-- 持ち主の確認と、特別なペットでないかの確認
	for _, pair in { { da, giveA }, { db, giveB } } do
		for _, uid in pair[2] do
			local entry = petOf(pair[1], uid)
			if not entry or not Config.PetById[entry.pet] or Config.PetById[entry.pet].giftOnly then
				close(session, "toast.tradeCanceled")
				return
			end
		end
	end
	-- 交換したあとの数が、持てる数をこえないか
	if #da.pets - #giveA + #giveB > Config.MaxPets or #db.pets - #giveB + #giveA > Config.MaxPets then
		close(session, "toast.tradeFull")
		return
	end

	local function take(d, uids)
		local taken = {}
		for _, uid in uids do
			for i, entry in d.pets do
				if entry.uid == uid then
					table.insert(taken, entry.pet)
					table.remove(d.pets, i)
					break
				end
			end
			for i, value in d.equipped do
				if value == uid then
					table.remove(d.equipped, i)
					break
				end
			end
		end
		return taken
	end
	local function give(player: Player, d, petIds)
		for _, petId in petIds do
			local uid = d.nextPetUid
			d.nextPetUid += 1
			table.insert(d.pets, { uid = uid, pet = petId })
			Pals.markDex(player, petId, true)
		end
	end
	local fromA = take(da, giveA)
	local fromB = take(db, giveB)
	give(a, da, fromB)
	give(b, db, fromA)

	close(session, "toast.tradeDone")
	for _, player in { a, b } do
		Pals.refreshAttribute(player)
		Data.push(player)
		task.spawn(Data.save, player, true) -- 交換は、すぐに保存する（2人ぶん いっしょに）
	end
end

local function startCountdown(session: Session)
	session.countingDown = true
	session.countdownToken += 1
	local token = session.countdownToken
	sendState(session)
	task.delay(Config.Trade.countdown, function()
		if session.countdownToken == token and session.countingDown then
			execute(session)
		end
	end)
end

function Trade.init()
	-- おさそいを送る
	Remotes.TradeRequest.OnServerEvent:Connect(function(player, targetUserId)
		if type(targetUserId) ~= "number" or not RateLimit.ok(player, "tradeRequest", 2) then
			return
		end
		local target = Players:GetPlayerByUserId(targetUserId)
		if not target or target == player then
			return
		end
		if sessions[player] or sessions[target] then
			Remotes.Toast:FireClient(player, "toast.tradeBusy")
			return
		end
		if not isFriends(player, target) then
			Remotes.Toast:FireClient(player, "toast.tradeNotFriend")
			return
		end
		invites[target] = { from = player, at = os.clock() }
		Remotes.TradeInvite:FireClient(target, player.UserId, player.DisplayName)
		Remotes.Toast:FireClient(player, "toast.tradeSent", target.DisplayName)
	end)

	-- おさそいに答える
	Remotes.TradeRespond.OnServerEvent:Connect(function(player, fromUserId, accept)
		if type(fromUserId) ~= "number" or type(accept) ~= "boolean" or not RateLimit.ok(player, "tradeRespond", 0.5) then
			return
		end
		local invite = invites[player]
		invites[player] = nil
		if not invite or invite.from.UserId ~= fromUserId or os.clock() - invite.at > Config.Trade.requestSeconds then
			return
		end
		local from = invite.from
		if from.Parent ~= Players then
			return
		end
		if not accept then
			Remotes.Toast:FireClient(from, "toast.tradeDeclined", player.DisplayName)
			return
		end
		if sessions[player] or sessions[from] then
			Remotes.Toast:FireClient(player, "toast.tradeBusy")
			return
		end
		local session: Session = {
			a = from,
			b = player,
			offers = { [from] = {}, [player] = {} },
			ready = { [from] = false, [player] = false },
			countdownToken = 0,
			countingDown = false,
		}
		sessions[from] = session
		sessions[player] = session
		sendState(session)
	end)

	-- 出すペットを決める（毎回、出すペット全部のリストを送ってもらう）
	Remotes.TradeOffer.OnServerEvent:Connect(function(player, uids)
		local session = sessions[player]
		if not session or type(uids) ~= "table" or not RateLimit.ok(player, "tradeOffer", 0.15) then
			return
		end
		local d = Data.get(player)
		local clean, seen = {}, {}
		for _, uid in uids do
			if #clean >= Config.Trade.maxOffer then
				break
			end
			if type(uid) == "number" and not seen[uid] then
				local entry = d and petOf(d, uid)
				local cfg = entry and Config.PetById[entry.pet]
				if cfg and not cfg.giftOnly then
					seen[uid] = true
					table.insert(clean, uid)
				end
			end
		end
		session.offers[player] = clean
		resetReady(session)
		sendState(session)
	end)

	-- OK（もう一度押すと取り消し）
	Remotes.TradeReady.OnServerEvent:Connect(function(player, ready)
		local session = sessions[player]
		if not session or type(ready) ~= "boolean" or not RateLimit.ok(player, "tradeReady", 0.2) then
			return
		end
		session.ready[player] = ready
		if not ready then
			session.countingDown = false
			session.countdownToken += 1
		end
		-- 2人とも何も出していないときは、交換しない
		local any = #session.offers[session.a] + #session.offers[session.b] > 0
		if session.ready[session.a] and session.ready[session.b] and any then
			startCountdown(session)
		else
			sendState(session)
		end
	end)

	Remotes.TradeCancel.OnServerEvent:Connect(function(player)
		local session = sessions[player]
		if session then
			close(session, "toast.tradeCanceled")
		end
	end)

	Players.PlayerRemoving:Connect(function(player)
		invites[player] = nil
		local session = sessions[player]
		if session then
			close(session, "toast.tradeCanceled")
		end
	end)
end

return Trade

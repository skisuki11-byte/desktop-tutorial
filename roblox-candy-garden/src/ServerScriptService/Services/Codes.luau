-- ログインコード（ごほうびコード）。アップデートや節目に発表して、無料のごほうびを配る。
-- コードの表はサーバーだけに置く（ReplicatedStorageに置くと、未発表のコードを覗かれる）。
-- 子供向けの配慮: 大文字/小文字・空白・ハイフンの違いは気にしない（打ち間違いで失敗しにくく）。
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Remotes = require(ReplicatedStorage.Shared.Remotes)

local Data = require(script.Parent.Data)
local Cosmetics = require(script.Parent.Cosmetics)
local RateLimit = require(script.Parent.RateLimit)

local Codes = {}

-- ここに発表するコードを書く。キーは「大文字・空白なし」で書く。
-- expiresAt を入れると、その時刻（UTCのUnix秒）で終わる。入れなければ無期限。
-- reward: coins / seeds / cosmetic（コード限定のおしゃれ）
local CODES = {
	CANDY = { reward = { coins = 300 } }, -- はじめての人向け
	SWEETGARDEN = { reward = { seeds = { peropero = 3 } } },
	RIBBON = { reward = { cosmetic = "ribbon" } }, -- コード限定のおしゃれ
	LAUNCH2026 = {
		reward = { coins = 1000, seeds = { wataame = 1 } },
		-- 2026/12/31 23:59 日本時間 まで
		expiresAt = DateTime.fromUniversalTime(2026, 12, 31, 14, 59, 0).UnixTimestamp,
	},
}

local MAX_FAILS = 5 -- 1分間に5回まちがえたら、少し待ってもらう（総当たり対策）
local fails: { [Player]: { count: number, since: number } } = {}

local function normalize(text: string): string
	text = string.upper(text)
	text = string.gsub(text, "[%s%-_]", "")
	return text
end

local function tooManyFails(player: Player): boolean
	local entry = fails[player]
	if not entry then
		return false
	end
	if os.clock() - entry.since > 60 then
		fails[player] = nil
		return false
	end
	return entry.count >= MAX_FAILS
end

local function addFail(player: Player)
	local entry = fails[player]
	if not entry or os.clock() - entry.since > 60 then
		fails[player] = { count = 1, since = os.clock() }
	else
		entry.count += 1
	end
end

local function redeem(player: Player, raw: any)
	if type(raw) ~= "string" or #raw == 0 or #raw > 40 then
		return
	end
	if not RateLimit.ok(player, "redeemCode", 1) or tooManyFails(player) then
		Remotes.CodeResult:FireClient(player, "slow")
		return
	end
	local d = Data.get(player)
	if not d then
		return
	end

	local code = normalize(raw)
	local entry = CODES[code]
	if not entry then
		addFail(player)
		Remotes.CodeResult:FireClient(player, "invalid")
		return
	end
	if entry.expiresAt and os.time() > entry.expiresAt then
		Remotes.CodeResult:FireClient(player, "expired")
		return
	end
	if d.redeemedCodes[code] then
		Remotes.CodeResult:FireClient(player, "used")
		return
	end

	-- ごほうびを渡す
	local reward = entry.reward
	d.redeemedCodes[code] = true
	if reward.coins then
		d.coins += reward.coins
	end
	if reward.seeds then
		for cropId, n in reward.seeds do
			if Config.CropById[cropId] then
				d.seeds[cropId] = (d.seeds[cropId] or 0) + n
			end
		end
	end
	if reward.cosmetic and Config.CosmeticById[reward.cosmetic] then
		Cosmetics.grant(player, reward.cosmetic)
	end

	Remotes.CodeResult:FireClient(player, "ok", reward)
	Data.push(player)
	Data.saveSoon(player)
end

function Codes.init()
	Remotes.RedeemCode.OnServerEvent:Connect(redeem)
end

function Codes.release(player: Player)
	fails[player] = nil
end

return Codes

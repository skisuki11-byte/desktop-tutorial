-- Remote連打の防止。クライアントは信用しない。
local RateLimit = {}

local last: { [Player]: { [string]: number } } = {}

function RateLimit.ok(player: Player, action: string, interval: number): boolean
	local now = os.clock()
	local perPlayer = last[player]
	if not perPlayer then
		perPlayer = {}
		last[player] = perPlayer
	end
	local prev = perPlayer[action]
	if prev and now - prev < interval then
		return false
	end
	perPlayer[action] = now
	return true
end

function RateLimit.clear(player: Player)
	last[player] = nil
end

return RateLimit

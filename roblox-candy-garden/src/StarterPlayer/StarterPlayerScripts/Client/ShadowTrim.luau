-- 小さな 部品（かざり・ふち・こまかい パーツ）の 影を 自分の画面だけ やめて、スマホの 負担を へらす。
-- 大きな もの（かべ・ゆか・家具の 本体）の 影は そのまま。見た目は ほとんど かわらない
local ShadowTrim = {}

local SMALL = 1.5 -- いちばん 長い辺が これより 小さい 部品は 影を 出さない
local BATCH = 400 -- 最初の 一度は 少しずつ（画面が とまらないように）

local function trim(d: Instance)
	if d:IsA("BasePart") and d.CastShadow and math.max(d.Size.X, d.Size.Y, d.Size.Z) < SMALL then
		d.CastShadow = false
	end
end

local function watch(root: Instance)
	root.DescendantAdded:Connect(trim)
	local n = 0
	for _, d in root:GetDescendants() do
		trim(d)
		n += 1
		if n % BATCH == 0 then
			task.wait()
		end
	end
end

function ShadowTrim.init()
	for _, name in { "Plots", "Scenery", "EggForest", "CommunityTree", "Lounge", "WaterFountain", "ToolShop" } do
		task.spawn(function()
			local root = workspace:WaitForChild(name, 30)
			if root then
				watch(root)
			end
		end)
	end
end

return ShadowTrim

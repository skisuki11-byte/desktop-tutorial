-- 効果音とBGM。音はクライアントだけで鳴らす（自分の操作の音は自分にだけ聞こえる）。
-- 方針（子供向けのベストプラクティス）:
--   ・押したら必ず小さな音が返る（「押せた」が耳でも分かる）
--   ・うれしいこと（収穫・コイン・ごほうび）ほど高くて明るい音、大きな出来事は短い和音
--   ・できなかったときは、こわくない小さな「ブブッ」（怒られた感じにしない）
--   ・BGMは小さめ。オン/オフは保存して、次に来たときも同じにする
-- 素材: 権利のはっきりした無料素材だけを使う（ほかのゲームから取った音は使わない）。
--   効果音 = Daily Sounds（DailySoundsFX。自分で合成した無料の効果音セット）
--   BGM    = DistrokidOfficial（Robloxと提携した、ライセンス済みの曲）
-- 和音は、1つのコインの音の高さを変えて重ねて作る（ド・ミ・ソ・ド = 1, 1.26, 1.5, 2 倍）。
local ContentProvider = game:GetService("ContentProvider")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local SoundService = game:GetService("SoundService")

local Config = require(ReplicatedStorage.Shared.Config)

local Sounds = {}

local IDS = {
	click = 106623224876186, -- Tiny Click - Daily Sounds
	pop = 106984966606682, -- Cartoon Pop - Daily Sounds
	coin = 130378474223829, -- Coin Pickup - Daily Sounds
}
local MUSIC_ID = 114601790730209 -- Sweet Kitchen（DistrokidOfficial）
local MUSIC_VOLUME = 0.22

-- 効果の名前 → { 音, 高さ, 遅れ(秒), 大きさ } の並び
local EFFECTS = {
	tap = { { "click", 1, 0, 0.45 } },
	plant = { { "pop", 0.8, 0, 0.6 } },
	harvest = { { "pop", 1.3, 0, 0.6 } },
	coin = { { "coin", 1, 0, 0.45 } },
	buy = { { "coin", 0.8, 0, 0.45 } },
	nope = { { "click", 0.5, 0, 0.5 }, { "click", 0.42, 0.13, 0.5 } },
	sparkle = { { "coin", 1.5, 0, 0.4 }, { "coin", 2, 0.09, 0.35 } },
	jingle = {
		{ "coin", 1, 0, 0.45 },
		{ "coin", 1.26, 0.11, 0.45 },
		{ "coin", 1.5, 0.22, 0.45 },
		{ "coin", 2, 0.36, 0.55 },
	},
	wobble = { { "pop", 0.65, 0, 0.45 } },
	water = { { "pop", 1.7, 0, 0.45 }, { "pop", 1.9, 0.07, 0.4 }, { "pop", 2.1, 0.14, 0.35 } }, -- ちゃぷちゃぷ
}

-- サーバーからのお知らせ（Toast）のうち、できなかったときのもの
local NOPE_TOASTS = {
	["toast.noCoins"] = true,
	["toast.goEggForest"] = true,
	["toast.goToolShop"] = true,
	["toast.noDrop"] = true,
	["toast.dropFull"] = true,
	["toast.noSeeds"] = true,
	["toast.nothingToSell"] = true,
	["toast.petFull"] = true,
	["toast.alreadyOwned"] = true,
	["toast.limitedAlready"] = true,
	["toast.noWater"] = true,
	["toast.waterFull"] = true,
	["toast.fertilizerFull"] = true,
}
-- ちょっとうれしいもの（キラキラ）と、大きなごほうび（和音）
local SPARKLE_TOASTS = {
	["toast.fertilized"] = true,
	["toast.fertilizedFriend"] = true,
	["toast.helpedFertilizer"] = true,
	["toast.sparkle"] = true,
	["toast.cropDexNew"] = true,
	["toast.boughtDrop"] = true,
	["toast.dropUsed"] = true,
	["toast.dropUsedFriend"] = true,
	["toast.helpedDrop"] = true,
	["toast.styleBought"] = true,
	["toast.limitedBought"] = true,
	["toast.questDone"] = true,
}
local WATER_TOASTS = {
	["toast.petWatered"] = true,
	["toast.refilled"] = true,
	["toast.watered"] = true,
	["toast.wateredFriend"] = true,
	["toast.helped"] = true,
}
local JINGLE_TOASTS = {
	["toast.expanded"] = true,
	["toast.canUpgraded"] = true,
	["toast.dailyGot"] = true,
	["toast.variantReady"] = true,
	["toast.variantHarvest"] = true,
	["toast.rainbowNews"] = true,
	["toast.cropDexReward"] = true,
}

local templates: { [string]: Sound } = {}
local effectsGroup: SoundGroup
local music: Sound
local musicOn = true
local lastPlayed: { [string]: number } = {}
local prev = nil -- 前回の状態（増えた・減ったで音を決める）

local function playOne(name: string, pitch: number, volume: number)
	local template = templates[name]
	if not template then
		return
	end
	local sound = template:Clone()
	sound.PlaybackSpeed = pitch
	sound.Volume = volume
	sound.Parent = SoundService
	sound.Ended:Once(function()
		sound:Destroy()
	end)
	sound:Play()
end

function Sounds.play(effect: string)
	local steps = EFFECTS[effect]
	if not steps then
		return
	end
	-- 同じ音が一度にたくさん重なってうるさくならないように
	local now = os.clock()
	if lastPlayed[effect] and now - lastPlayed[effect] < 0.06 then
		return
	end
	lastPlayed[effect] = now
	for _, step in steps do
		local name, pitch, delay, volume = step[1], step[2], step[3], step[4]
		if delay > 0 then
			task.delay(delay, playOne, name, pitch, volume)
		else
			playOne(name, pitch, volume)
		end
	end
end

-- たまごの演出（PalsUI.playHatch）に合わせる: 0.14秒ごとに6回ゆれて、約1秒後に出てくる
function Sounds.hatch()
	for i = 0, 5 do
		task.delay(i * 0.14, Sounds.play, "wobble")
	end
	task.delay(6 * 0.14 + 0.15, Sounds.play, "jingle")
end

function Sounds.toast(key: string)
	if WATER_TOASTS[key] then
		Sounds.play("water")
	elseif NOPE_TOASTS[key] then
		Sounds.play("nope")
	elseif JINGLE_TOASTS[key] then
		Sounds.play("jingle")
	elseif SPARKLE_TOASTS[key] then
		Sounds.play("sparkle")
	end
end

function Sounds.isMusicOn(): boolean
	return musicOn
end

function Sounds.setMusic(on: boolean)
	musicOn = on
	if not music then
		return
	end
	if on then
		if not music.IsPlaying then
			music:Resume()
			if not music.IsPlaying then
				music:Play()
			end
		end
	else
		music:Pause()
	end
end

local function total(map): number
	local n = 0
	for _, v in map or {} do
		n += v
	end
	return n
end

-- サーバーから状態が届くたびに呼ぶ。数の増え減りで、植えた・収穫した・コインが増えた を聞き分ける
function Sounds.onState(state)
	local now = {
		coins = state.coins or 0,
		seeds = total(state.seeds),
		basket = select(2, Config.basketValue(state)),
	}
	if prev then
		if now.basket > prev.basket then
			Sounds.play("harvest")
		elseif now.seeds < prev.seeds then
			Sounds.play("plant")
		end
		if now.coins > prev.coins then
			Sounds.play("coin")
		elseif now.coins < prev.coins then
			Sounds.play("buy")
		end
	else
		-- 初めての状態で、保存してあるBGMの設定を使う
		if state.music == false then
			Sounds.setMusic(false)
		end
	end
	prev = now
end

function Sounds.init()
	effectsGroup = Instance.new("SoundGroup")
	effectsGroup.Name = "Effects"
	effectsGroup.Volume = 1
	effectsGroup.Parent = SoundService
	local musicGroup = Instance.new("SoundGroup")
	musicGroup.Name = "Music"
	musicGroup.Volume = 1
	musicGroup.Parent = SoundService

	local list = {}
	for name, id in IDS do
		local sound = Instance.new("Sound")
		sound.Name = name
		sound.SoundId = "rbxassetid://" .. id
		sound.SoundGroup = effectsGroup
		templates[name] = sound
		table.insert(list, sound)
	end

	music = Instance.new("Sound")
	music.Name = "BGM"
	music.SoundId = "rbxassetid://" .. MUSIC_ID
	music.Looped = true
	music.Volume = MUSIC_VOLUME
	music.SoundGroup = musicGroup
	music.Parent = SoundService
	table.insert(list, music)

	task.spawn(function()
		-- 最初の1回目の音が遅れないように先に読み込む（失敗しても遊べる）
		pcall(function()
			ContentProvider:PreloadAsync(list)
		end)
		-- 保存された設定（State）が届くのを少し待ってから流す
		task.wait(2)
		if musicOn then
			music:Play()
		end
	end)
end

return Sounds

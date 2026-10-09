<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useGameStore } from './stores/game'
import { professions } from './game/professions'
import { bankLoanCredit, BOARD_SIZE, summarize } from './game/finance'
import { spaces } from './game/board'
import BoardIcon from './components/BoardIcon.vue'
import StockMarket from './components/StockMarket.vue'

const g = useGameStore()
const buildTime = import.meta.env.VITE_BUILD_TIME
const versionUpdatedAt = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
}).format(new Date(buildTime))
const gameSummary = computed(() => g.summary!)
const mode = ref<'menu' | 'local' | 'online'>('menu')
const entries = ref([{ name: '玩家一', prof: 0 }, { name: '玩家二', prof: 1 }])
const myName = ref('')
const myProf = ref(0)
const joinCode = ref('')
const helpOpen = ref(false)
const viewedPlayerIndex = ref<number | null>(null)
const playerDialog = ref<HTMLDialogElement | null>(null)
const viewedPlayer = computed(() => viewedPlayerIndex.value === null ? null : g.players[viewedPlayerIndex.value] ?? null)
const viewedSummary = computed(() => viewedPlayer.value ? summarize(viewedPlayer.value) : null)

async function viewPlayer(index: number) {
  viewedPlayerIndex.value = index
  await nextTick()
  playerDialog.value?.showModal()
}

watch(() => g.inGame, active => {
  if (!active) {
    playerDialog.value?.close()
    viewedPlayerIndex.value = null
  }
})
const bankRepayment = ref<number | string>('')
const repaymentAmount = computed(() => Number(bankRepayment.value))
const bankLoan = computed(() => g.player?.liabilities.find(l => l.name === '銀行貸款'))
const loanCredit = computed(() => g.player ? bankLoanCredit(g.player) : null)
const rescueLoanAmount = computed(() => {
  const cashNeeded = Math.max(0.01, Math.round((-(g.player?.cash ?? 0) + 0.01) * 100) / 100)
  return Math.min(loanCredit.value?.available ?? 0, cashNeeded)
})
const validBankRepayment = computed(() => bankLoan.value && Number.isFinite(repaymentAmount.value)
  && repaymentAmount.value > 0 && repaymentAmount.value <= bankLoan.value.balance
  && repaymentAmount.value <= (g.player?.cash ?? 0)
  && Number.isSafeInteger(Math.round(repaymentAmount.value * 100))
  && Math.abs(repaymentAmount.value * 100 - Math.round(repaymentAmount.value * 100)) < 1e-6)
const remainingBankPayment = computed(() => bankLoan.value && validBankRepayment.value
  ? Math.round(Math.round((bankLoan.value.balance - repaymentAmount.value) * 100) / 100 * 0.02) : null)
const isRolling = ref(false)
const isDiceLanded = ref(false)
const soundEnabled = ref(true)
const musicEnabled = ref(true)
const musicVolume = ref(75)
const selectedMusicTrack = ref('pulse')
const soundError = ref('')
const diceFace = ref(1)
const animatedDice = ref<number[]>([1])
let audioContext: AudioContext | undefined
let diceTimer: ReturnType<typeof setInterval> | undefined
let soundTimer: ReturnType<typeof setInterval> | undefined
let musicTimer: ReturnType<typeof setInterval> | undefined
let musicGain: GainNode | undefined
let musicStep = 0
let rollTimeout: ReturnType<typeof setTimeout> | undefined
let landedTimeout: ReturnType<typeof setTimeout> | undefined

const boardSpaces = computed(() => spaces.slice(0, BOARD_SIZE).map((space, index) => {
  if (index < 6) return { ...space, index, row: 6, col: 6 - index }
  if (index < 12) return { ...space, index, row: 12 - index, col: 0 }
  if (index < 18) return { ...space, index, row: 0, col: index - 12 }
  return { ...space, index, row: index - 18, col: 6 }
}))

const dicePips: Record<number, number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8],
  4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
}
const displayedDice = computed(() => isRolling.value ? animatedDice.value : g.diceResults.length ? g.diceResults : [diceFace.value])
const currentSpace = computed(() => spaces[g.player?.position ?? 0])
const progressPercent = computed(() => Math.round((g.summary?.progress ?? 0) * 100))
const soundButtonLabel = computed(() => soundEnabled.value ? '關閉遊戲音效' : '開啟遊戲音效')
const musicButtonLabel = computed(() => musicEnabled.value ? '關閉背景音樂' : '開啟背景音樂')
const musicTracks = [
  { id: 'pulse', name: '動感節奏', notes: [76, 79, 83, 79, 74, 78, 81, 86, 76, 79, 84, 79, 72, 76, 79, 84], tempo: 220, waveform: 'sawtooth' as OscillatorType, percussion: true },
  { id: 'journey', name: '輕快旅程', notes: [72, 79, 76, 79, 74, 81, 77, 81, 69, 76, 72, 76, 71, 78, 74, 78], tempo: 360, waveform: 'sine' as OscillatorType, percussion: false },
  { id: 'calm', name: '午後漫步', notes: [60, 67, 64, 67, 62, 69, 65, 69, 57, 64, 60, 64, 59, 66, 62, 66], tempo: 480, waveform: 'triangle' as OscillatorType, percussion: false },
  { id: 'jazz', name: '爵士咖啡館', notes: [65, 72, 75, 77, 70, 77, 80, 82, 60, 67, 70, 72, 63, 70, 73, 75], tempo: 400, waveform: 'triangle' as OscillatorType, percussion: false },
  { id: 'focus', name: '星夜專注', notes: [57, 64, 69, 64, 60, 67, 72, 67, 53, 60, 65, 60, 55, 62, 67, 62], tempo: 520, waveform: 'sine' as OscillatorType, percussion: false },
  { id: 'forest', name: '森林晨光（原創）', notes: [74, 69, 76, 78, 73, 76, 69, 66, 71, 78, 76, 73, 69, 71, 66, 69, 74, 81, 78, 76, 73, 69, 71, 78, 76, 74, 69, 66, 71, 73, 69, 74], tempo: 460, waveform: 'sine' as OscillatorType, percussion: false },
  { id: 'sky', name: '雲端探險（原創）', notes: [67, 74, 71, 79, 76, 74, 81, 78, 74, 69, 76, 72, 79, 76, 74, 71, 69, 76, 73, 81, 78, 76, 83, 79, 76, 71, 78, 74, 81, 78, 74, 67], tempo: 310, waveform: 'triangle' as OscillatorType, percussion: false },
  { id: 'lantern', name: '月光小徑（原創）', notes: [65, 72, 69, 76, 74, 67, 72, 69, 62, 69, 65, 72, 70, 64, 69, 65, 67, 74, 70, 77, 76, 69, 74, 70, 64, 71, 67, 74, 72, 65, 69, 65], tempo: 560, waveform: 'sine' as OscillatorType, percussion: false },
] as const
const rollButtonText = computed(() => isRolling.value ? '骰子滾動中'
  : g.skippingTurn ? '失業停玩中'
    : g.lastDice ? `本回合結果：${g.lastDice} 點` : '擲出骰子')

function closeHelpOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') helpOpen.value = false
}

function addPlayer() {
  if (entries.value.length < 6) entries.value.push({ name: '玩家' + (entries.value.length + 1), prof: 0 })
}
function begin() {
  g.start(entries.value.map(e => ({ name: e.name || '無名氏', profession: professions[e.prof] })))
}
const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
const me = () => g.members.find(m => m.id === g.clientId)

function rollDice(extra = false) {
  if (isRolling.value || !(extra ? g.canRollExtra : g.canRoll)) return
  const count = extra ? g.pendingExtraDice : 1
  animatedDice.value = Array.from({ length: count }, () => 1)
  isRolling.value = true
  isDiceLanded.value = false
  soundError.value = ''
  startDiceSound()
  diceTimer = setInterval(() => {
    diceFace.value = 1 + Math.floor(Math.random() * 6)
    animatedDice.value = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6))
  }, 75)
  rollTimeout = setTimeout(() => {
    if (diceTimer) clearInterval(diceTimer)
    diceTimer = undefined
    stopDiceSound()
    if (extra) g.rollExtraDice()
    else g.roll()
    diceFace.value = g.lastDice || 1
    isRolling.value = false
    isDiceLanded.value = true
    if (soundEnabled.value) playDiceLanding()
    landedTimeout = setTimeout(() => { isDiceLanded.value = false }, 620)
  }, 1120)
}

watch([() => g.canRollExtra, isRolling], ([canRollExtra, rolling]) => {
  if (canRollExtra && !rolling) rollDice(true)
}, { flush: 'post', immediate: true })

function startDiceSound() {
  if ((!soundEnabled.value && !musicEnabled.value) || typeof window === 'undefined' || !window.AudioContext) return
  audioContext ??= new AudioContext()
  void audioContext.resume().then(() => {
    if (!audioContext) return
    if (musicEnabled.value && g.inGame && !g.gameOver) startBackgroundMusic()
    if (!isRolling.value || !soundEnabled.value) return
    playDiceTick(audioContext)
    soundTimer = setInterval(() => {
      if (audioContext && isRolling.value && soundEnabled.value) playDiceTick(audioContext)
    }, 95)
  }).catch(() => {
    soundError.value = '音效無法播放，請確認瀏覽器允許音訊。'
  })
}

function startBackgroundMusic() {
  if (!musicEnabled.value || !g.inGame || g.gameOver || !audioContext || audioContext.state !== 'running' || musicTimer) return
  const context = audioContext
  const track = musicTracks.find(item => item.id === selectedMusicTrack.value) ?? musicTracks[0]
  if (!musicGain) {
    musicGain = context.createGain()
    musicGain.connect(context.destination)
  }
  musicGain.gain.cancelScheduledValues(context.currentTime)
  musicGain.gain.setTargetAtTime(musicVolume.value / 100, context.currentTime, 0.12)
  const playNote = (midi: number, start: number, duration: number, volume: number, waveform: OscillatorType) => {
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = waveform
    oscillator.frequency.value = 440 * 2 ** ((midi - 69) / 12)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(volume, start + 0.035)
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
    oscillator.connect(envelope)
    envelope.connect(musicGain!)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.02)
  }
  const playKick = (start: number) => {
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(125, start)
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.12)
    envelope.gain.setValueAtTime(0.42, start)
    envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.16)
    oscillator.connect(envelope)
    envelope.connect(musicGain!)
    oscillator.start(start)
    oscillator.stop(start + 0.17)
  }
  const playNoise = (start: number, duration: number, frequency: number, volume: number) => {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const envelope = context.createGain()
    source.buffer = buffer
    filter.type = 'highpass'
    filter.frequency.value = frequency
    envelope.gain.setValueAtTime(volume, start)
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration)
    source.connect(filter)
    filter.connect(envelope)
    envelope.connect(musicGain!)
    source.start(start)
    source.stop(start + duration)
  }
  const playBeat = () => {
    if (!musicEnabled.value || !g.inGame || g.gameOver || !audioContext || audioContext.state !== 'running') return
    const start = context.currentTime + 0.04
    const note = track.notes[musicStep % track.notes.length]!
    playNote(note, start, track.percussion ? 0.16 : 0.3, track.percussion ? 0.2 : 0.23, track.waveform)
    if (musicStep % (track.percussion ? 2 : 4) === 0) playNote(note - 24, start, track.percussion ? 0.24 : 0.58, 0.16, 'triangle')
    if (track.percussion) {
      const beatInBar = musicStep % 8
      if (beatInBar === 0 || beatInBar === 4) playKick(start)
      if (beatInBar === 2 || beatInBar === 6) playNoise(start, 0.12, 1400, 0.17)
      playNoise(start, 0.035, 7500, 0.045)
    }
    musicStep = (musicStep + 1) % track.notes.length
  }
  playBeat()
  musicTimer = setInterval(playBeat, track.tempo)
}

function stopBackgroundMusic() {
  if (musicTimer) clearInterval(musicTimer)
  musicTimer = undefined
  if (musicGain && audioContext) {
    const now = audioContext.currentTime
    musicGain.gain.cancelScheduledValues(now)
    musicGain.gain.setTargetAtTime(0.0001, now, 0.08)
  }
}

watch(musicVolume, volume => {
  if (!musicGain || !audioContext) return
  musicGain.gain.setTargetAtTime(volume / 100, audioContext.currentTime, 0.08)
})

watch(selectedMusicTrack, () => {
  musicStep = 0
  if (!musicTimer) return
  stopBackgroundMusic()
  startBackgroundMusic()
})

function toggleBackgroundMusic() {
  if (musicEnabled.value && (!audioContext || audioContext.state !== 'running')) {
    if (typeof window === 'undefined' || !window.AudioContext) {
      soundError.value = '此瀏覽器不支援背景音樂播放。'
      return
    }
    audioContext ??= new AudioContext()
    void audioContext.resume().then(startBackgroundMusic).catch(() => {
      soundError.value = '背景音樂無法播放，請確認瀏覽器允許音訊。'
    })
    return
  }
  musicEnabled.value = !musicEnabled.value
  if (!musicEnabled.value) {
    stopBackgroundMusic()
    return
  }
  if (typeof window === 'undefined' || !window.AudioContext) {
    soundError.value = '此瀏覽器不支援背景音樂播放。'
    return
  }
  audioContext ??= new AudioContext()
  void audioContext.resume().then(startBackgroundMusic).catch(() => {
    soundError.value = '背景音樂無法播放，請確認瀏覽器允許音訊。'
  })
}

watch([() => g.inGame, () => g.gameOver], ([active, gameOver]) => {
  if (!active || gameOver) {
    stopBackgroundMusic()
  } else if (musicEnabled.value && audioContext?.state === 'running') {
    startBackgroundMusic()
  }
})

function playDiceTick(context: AudioContext) {
  const duration = 0.045
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length)

  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const volume = context.createGain()
  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.value = 1250 + Math.random() * 900
  filter.Q.value = 0.8
  volume.gain.setValueAtTime(0.16, context.currentTime)
  volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration)
  source.connect(filter)
  filter.connect(volume)
  volume.connect(context.destination)
  source.start()
  source.stop(context.currentTime + duration)
}

function playDiceLanding() {
  if (!soundEnabled.value || !audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  const tone = audioContext.createOscillator()
  const volume = audioContext.createGain()
  tone.type = 'sine'
  tone.frequency.setValueAtTime(150, now)
  tone.frequency.exponentialRampToValueAtTime(62, now + 0.16)
  volume.gain.setValueAtTime(0.2, now)
  volume.gain.exponentialRampToValueAtTime(0.001, now + 0.17)
  tone.connect(volume)
  volume.connect(audioContext.destination)
  tone.start(now)
  tone.stop(now + 0.18)
}

function playCashEffect(type: 'income' | 'expense') {
  if (!soundEnabled.value || !audioContext || audioContext.state !== 'running') return
  const now = audioContext.currentTime
  const notes = type === 'income' ? [523.25, 659.25, 783.99] : [392, 311.13, 220]
  notes.forEach((frequency, index) => {
    const start = now + index * 0.085
    const tone = audioContext!.createOscillator()
    const volume = audioContext!.createGain()
    tone.type = type === 'income' ? 'sine' : 'triangle'
    tone.frequency.setValueAtTime(frequency, start)
    volume.gain.setValueAtTime(0.0001, start)
    volume.gain.exponentialRampToValueAtTime(type === 'income' ? 0.11 : 0.09, start + 0.015)
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.21)
    tone.connect(volume)
    volume.connect(audioContext!.destination)
    tone.start(start)
    tone.stop(start + 0.22)
  })
}

watch(() => g.cashEffect?.id, () => {
  const effect = g.cashEffect
  if (effect) playCashEffect(effect.type)
}, { flush: 'sync' })

function stopDiceSound() {
  if (soundTimer) clearInterval(soundTimer)
  soundTimer = undefined
}

function toggleDiceSound() {
  soundEnabled.value = !soundEnabled.value
  soundError.value = ''
  if (!soundEnabled.value) stopDiceSound()
}

onBeforeUnmount(() => {
  window.removeEventListener('keydown', closeHelpOnEscape)
  if (diceTimer) clearInterval(diceTimer)
  if (rollTimeout) clearTimeout(rollTimeout)
  if (landedTimeout) clearTimeout(landedTimeout)
  stopDiceSound()
  stopBackgroundMusic()
  if (audioContext) void audioContext.close()
})

onMounted(() => window.addEventListener('keydown', closeHelpOnEscape))
</script>

<template>
  <main class="app-shell">
    <div class="ambient ambient-one" aria-hidden="true" />
    <div class="ambient ambient-two" aria-hidden="true" />

    <header class="topbar">
      <a class="brand" href="#" @click.prevent="mode = 'menu'; g.resetGame()">
        <span class="brand-mark">CF</span>
        <span>現金流<span class="brand-en">・CASHFLOW</span></span>
      </a>
      <div class="topbar-note"><span class="status-dot" />讓每一步，都更靠近財務自由</div>
      <div class="topbar-actions">
        <div v-if="g.inGame" class="round-chip">第 {{ g.round }} 輪 · 玩家 {{ g.turn + 1 }} / {{ g.players.length }}</div>
        <button class="help-button" type="button" aria-label="遊戲說明" @click="helpOpen = true">?</button>
      </div>
    </header>

    <div v-if="helpOpen" class="help-overlay" @click.self="helpOpen = false">
      <section class="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-heading">
          <div><span class="eyebrow">HOW TO PLAY</span><h2 id="help-title">遊戲說明</h2></div>
          <button class="help-close" type="button" aria-label="關閉遊戲說明" @click="helpOpen = false">×</button>
        </div>
        <div class="help-content">
          <section>
            <h3>🎯 遊戲目標</h3>
            <p>累積股票股利與房產／事業現金流，讓每月被動收入達到或超過每月總支出。達成時立即獲勝；薪水和一次性收入不計入勝出條件。</p>
          </section>
          <section>
            <h3>🎲 每回合怎麼玩</h3>
            <ol>
              <li>輪到你時擲骰一次，棋子依點數前進；經過發薪日會自動入帳月現金流。</li>
              <li>依停留格處理事件：收入／支出／市場事件自動結算；投資或房產卡需選擇買進或放棄。</li>
              <li>完成事件後按「結束回合，交給下一位」。最後一位交棒後進入下一輪。</li>
            </ol>
          </section>
          <section>
            <h3>📈 股票市場</h3>
            <p>自己回合可在擲骰前後進入市場。選擇股票並輸入股數即可交易；買進需整數股，賣出可使用小數持股。「全數買入」會以現有現金購買該股票可負擔的最多整數股。離開市場後才能擲骰或交棒。</p>
          </section>
          <section>
            <h3>💰 現金與借款</h3>
            <p>買資產或抽到投資卡時若現金不足，可到資產面板賣股或在額度內借款；也可以放棄投資卡。銀行貸款上限為職業月薪的 6 倍，還款後可恢復額度。可用現金若變成負數，必須先賣股或借款補到正數才能繼續；無法補正則破產出局，其他玩家繼續遊戲。</p>
          </section>
          <section>
            <h3>🤝 多人遊戲</h3>
            <p>同一裝置可輪流遊玩，也可建立房間與朋友連線。連線時只有目前回合的玩家能操作；其他玩家可以查看回合與事件結果。</p>
          </section>
        </div>
        <button class="primary-button help-done" type="button" @click="helpOpen = false">知道了</button>
      </section>
    </div>

    <section v-if="!g.inGame" class="lobby-page">
      <div class="lobby-intro">
        <div class="eyebrow"><span /> YOUR FINANCIAL JOURNEY STARTS HERE</div>
        <h1>讓錢為你工作，<br /><span>玩出自由人生。</span></h1>
        <p>擲出下一步，抓住投資機會。從月光族到現金流自由，每一回合都由你決定。</p>
        <div class="intro-stats">
          <div><strong>24</strong><span>格財富旅程</span></div>
          <i />
          <div><strong>6</strong><span>位玩家同樂</span></div>
          <i />
          <div><strong>∞</strong><span>種人生選擇</span></div>
        </div>
        <div class="lobby-art" aria-hidden="true">
          <div class="art-coin coin-a">$</div><div class="art-coin coin-b">$</div>
          <div class="art-orbit orbit-a" /><div class="art-orbit orbit-b" />
          <div class="art-spark spark-a">✦</div><div class="art-spark spark-b">✧</div>
          <div class="art-bar bar-a" /><div class="art-bar bar-b" /><div class="art-bar bar-c" />
          <div class="art-arrow">↗</div>
        </div>
      </div>

      <div class="lobby-card">
        <template v-if="g.online">
          <div class="card-heading">
            <span class="heading-icon">🌐</span>
            <div><span class="eyebrow">MULTIPLAYER ROOM</span><h2>等待玩家加入</h2></div>
          </div>
          <div class="room-code-box"><span>分享房號給朋友</span><strong>{{ g.roomCode }}</strong></div>
          <div class="member-list">
            <div v-for="m in g.members" :key="m.id" class="member-row">
              <span class="member-avatar">{{ m.name.slice(0, 1) }}</span>
              <span class="member-info"><b>{{ m.name }}</b><small>{{ professions[m.prof].title }}</small></span>
              <span v-if="m.id === g.hostId" class="member-tag">房主</span>
              <span v-if="m.id === g.clientId" class="member-tag you-tag">你</span>
            </div>
          </div>
          <label v-if="me()" class="field-label">選擇你的職業
            <select :value="me()!.prof" class="form-field" @change="g.updateMe({ prof: Number(($event.target as HTMLSelectElement).value) })">
              <option v-for="(p, j) in professions" :key="p.title" :value="j">{{ p.title }}</option>
            </select>
          </label>
          <button v-if="g.isHost" class="primary-button" @click="g.startOnline()">開始遊戲 <span>→</span></button>
          <div v-else class="waiting-note"><span class="status-dot" />等待房主開始遊戲…</div>
          <button class="text-button" @click="g.leaveRoom(); mode = 'menu'">離開房間</button>
        </template>

        <template v-else-if="mode === 'menu'">
          <div class="card-heading">
            <span class="heading-icon">🎲</span>
            <div><span class="eyebrow">LET'S PLAY</span><h2>選擇遊戲方式</h2></div>
          </div>
          <button class="mode-card online-mode" @click="mode = 'online'">
            <span class="mode-icon">🌐</span>
            <span class="mode-copy"><b>連線多人</b><small>建立房間，和朋友一起玩</small></span>
            <span class="mode-arrow">→</span>
          </button>
          <button class="mode-card" @click="mode = 'local'">
            <span class="mode-icon">🧑‍🤝‍🧑</span>
            <span class="mode-copy"><b>同一台裝置</b><small>2–6 位玩家輪流挑戰</small></span>
            <span class="mode-arrow">→</span>
          </button>
          <div class="card-footnote"><span>✦</span> 選好你的職業，開始打造被動收入</div>
        </template>

        <template v-else-if="mode === 'online'">
          <div class="card-heading">
            <span class="heading-icon">🌐</span>
            <div><span class="eyebrow">PLAY WITH FRIENDS</span><h2>加入財富旅程</h2></div>
          </div>
          <label class="field-label">你的暱稱
            <input v-model="myName" class="form-field" maxlength="12" placeholder="輸入玩家名稱" />
          </label>
          <label class="field-label">選擇職業
            <select v-model.number="myProf" class="form-field">
              <option v-for="(p, j) in professions" :key="p.title" :value="j">{{ p.title }}（月薪 ${{ fmt(p.salary) }}）</option>
            </select>
          </label>
          <button class="primary-button" @click="g.createRoom(myName, myProf)">建立新房間 <span>→</span></button>
          <div class="divider"><span>或輸入朋友的房號</span></div>
          <div class="join-row">
            <input v-model="joinCode" maxlength="4" inputmode="numeric" class="form-field code-input" placeholder="4 位房號" />
            <button class="secondary-button" @click="g.joinRoom(joinCode.trim(), myName, myProf)">加入房間</button>
          </div>
          <button class="text-button" @click="mode = 'menu'">← 返回選單</button>
        </template>

        <template v-else>
          <div class="card-heading">
            <span class="heading-icon">🧑‍🤝‍🧑</span>
            <div><span class="eyebrow">LOCAL GAME</span><h2>組成你的隊伍</h2></div>
          </div>
          <div class="player-setup-list">
            <div v-for="(e, i) in entries" :key="i" class="player-setup">
              <span class="setup-number">{{ String(i + 1).padStart(2, '0') }}</span>
              <input v-model="e.name" class="form-field name-input" maxlength="12" placeholder="玩家名稱" />
              <select v-model.number="e.prof" class="form-field profession-input">
                <option v-for="(p, j) in professions" :key="p.title" :value="j">{{ p.title }}</option>
              </select>
              <button v-if="entries.length > 1" class="remove-player" aria-label="移除玩家" @click="entries.splice(i, 1)">×</button>
            </div>
          </div>
          <button v-if="entries.length < 6" class="add-player" @click="addPlayer">＋ 新增玩家 <span>{{ entries.length }}/6</span></button>
          <button class="primary-button" @click="begin">開始遊戲 <span>→</span></button>
          <button class="text-button" @click="mode = 'menu'">← 返回選單</button>
        </template>
        <div v-if="g.error" class="error-message">⚠ {{ g.error }}</div>
      </div>
    </section>

    <section v-if="g.inGame && g.gameOver" class="victory-panel finance-panel" role="status" aria-labelledby="victory-title">
      <span class="eyebrow">FINANCIAL FREEDOM</span>
      <h2 id="victory-title">{{ g.winners.length ? `🏆 ${g.winners.length > 1 ? '並列獲勝！' : '財務自由，獲勝！'}` : '破產結局' }}</h2>
      <p v-for="winner in g.winners" :key="winner.playerIndex"><strong>{{ winner.name }}</strong>：每月被動收入 ${{ fmt(winner.passiveIncome) }} ≥ 每月總支出 ${{ fmt(winner.totalExpenses) }}</p>
      <p>{{ g.winners.length ? '遊戲已結束，棋盤與資產保留供查看。薪水與一次性收入不計入勝出條件。' : '所有玩家皆已破產出局，遊戲結束。' }}</p>
      <button class="secondary-button" @click="g.resetGame(); mode = 'menu'">返回選單，開始新遊戲</button>
    </section>
    <div v-if="g.inGame && g.cashRecoveryRequired && g.player" class="cash-recovery-alert" role="alert">
      <div>
        <strong>⚠ 現金危機：必須先補回正數，才能繼續遊戲</strong>
        <span>目前現金 ${{ fmt(g.player.cash) }}。請賣出股票或使用剩餘銀行貸款額度；若無法補正，將破產出局。</span>
      </div>
      <button v-if="!g.stockMarketOpen" class="cash-recovery-action" :disabled="!g.canOpenStockMarket" @click="g.openStockMarket()">立即前往市場賣股 →</button>
    </div>
    <section v-if="g.inGame" class="players-panel player-inspection-panel finance-panel">
      <div class="section-heading"><h3>玩家隊伍</h3><span>點選玩家查看狀態 · {{ g.players.length }} 位玩家</span></div>
      <div class="player-inspection-list">
        <button v-for="(p, i) in g.players" :key="i" type="button" class="player-row player-inspection-button" :class="{ 'player-row-active': i === g.turn }" :aria-label="`查看 ${p.name} 的狀態`" @click="viewPlayer(i)">
          <span class="player-avatar" :class="`avatar-color-${i % 6}`">{{ p.name.slice(0, 1) }}</span>
          <span class="player-row-info"><b>{{ p.name }}{{ i === g.turn ? ' · 目前回合' : '' }}</b><small>{{ p.bankrupt ? '破產出局' : p.cashRecoveryRequired ? '現金危機，待補正' : p.profession.title }}{{ !p.bankrupt && p.skipTurns ? ` · 失業停玩 ${p.skipTurns} 回合` : '' }}</small></span>
          <span class="player-position">查看 →</span>
        </button>
      </div>
    </section>
    <dialog ref="playerDialog" class="player-status-dialog" aria-labelledby="player-status-title" @close="viewedPlayerIndex = null" @click="($event.target === playerDialog) && playerDialog?.close()">
      <template v-if="viewedPlayer && viewedSummary">
        <div class="help-heading">
          <div><span class="eyebrow">PLAYER STATUS · 僅供查看</span><h2 id="player-status-title">{{ viewedPlayer.name }} 的狀態</h2></div>
          <button type="button" class="help-close" aria-label="關閉玩家狀態" @click="playerDialog?.close()">×</button>
        </div>
        <p>{{ viewedPlayer.profession.title }} · 第 {{ viewedPlayer.position + 1 }} 格 · {{ spaces[viewedPlayer.position]?.name }}</p>
        <p v-if="viewedPlayer.bankrupt" class="negative">破產出局</p>
        <p v-else-if="viewedPlayer.cashRecoveryRequired || viewedPlayer.cash < 0" class="negative">現金危機：需補回正數才能繼續</p>
        <p v-if="!viewedPlayer.bankrupt && viewedPlayer.skipTurns">失業停玩：尚餘 {{ viewedPlayer.skipTurns }} 回合</p>
        <div class="player-status-stats">
          <div><span>可用現金</span><b :class="viewedPlayer.cash < 0 ? 'negative' : 'positive'">${{ fmt(viewedPlayer.cash) }}</b></div>
          <div><span>薪資／月</span><b>${{ fmt(viewedSummary.salary) }}</b></div>
          <div><span>被動收入／月</span><b class="positive">${{ fmt(viewedSummary.passiveIncome) }}</b></div>
          <div><span>總支出／月</span><b class="negative">${{ fmt(viewedSummary.totalExpenses) }}</b></div>
          <div><span>淨現金流／月</span><b :class="viewedSummary.monthlyCashFlow < 0 ? 'negative' : 'positive'">${{ fmt(viewedSummary.monthlyCashFlow) }}</b></div>
          <div><span>財務自由進度</span><b>{{ Math.round(viewedSummary.progress * 100) }}%</b></div>
          <div><span>總資產（股票按成本）</span><b>${{ fmt(viewedSummary.totalAssets) }}</b></div>
          <div><span>總負債（含房產貸款）</span><b class="negative">${{ fmt(viewedSummary.totalLiabilities) }}</b></div>
        </div>
        <h3>股票持倉</h3>
        <div v-for="(stock, i) in viewedPlayer.stocks" :key="i" class="asset-row"><span>{{ stock.symbol }} · {{ fmt(stock.shares) }} 股</span><span>每股成本 ${{ fmt(stock.cost) }} · 月股利 ${{ fmt(stock.shares * stock.dividend) }}</span></div>
        <p v-if="!viewedPlayer.stocks.length">尚無股票持倉</p>
        <h3>房產與事業</h3>
        <div v-for="(asset, i) in viewedPlayer.realEstate" :key="i" class="player-status-asset"><b>{{ asset.name }}</b><span>投入 ${{ fmt(asset.downPayment) }} · 貸款 ${{ fmt(asset.mortgage) }} · 月現金流 ${{ fmt(asset.cashFlow) }}</span></div>
        <p v-if="!viewedPlayer.realEstate.length">尚無房產或事業</p>
        <h3>負債明細</h3>
        <div v-for="(liability, i) in viewedPlayer.liabilities" :key="i" class="asset-row"><span>{{ liability.name }} · 餘額 ${{ fmt(liability.balance) }}</span><span>月付 ${{ fmt(liability.monthlyPayment) }}</span></div>
        <p v-if="!viewedPlayer.liabilities.length">尚無其他負債</p>
        <p>子女 {{ viewedPlayer.children }} 位 · 家庭支出 ${{ fmt(viewedPlayer.children * viewedPlayer.childExpensePerKid) }}/月</p>
        <button type="button" class="secondary-button" @click="playerDialog?.close()">關閉，返回遊戲</button>
      </template>
    </dialog>
    <fieldset v-if="g.inGame && g.summary && g.player" :disabled="!g.myTurn || g.gameOver" class="game-page game-fieldset">
      <div class="game-heading">
        <div>
          <div class="eyebrow"><span /> YOUR TURN, YOUR FUTURE</div>
          <h1>財富旅程 <span>／</span> {{ g.player.name }}</h1>
          <p>{{ g.player.profession.title }}<span class="heading-separator">·</span>第 {{ g.round }} 輪 · 歷史交易日 {{ g.marketDate }} · 第 {{ g.turn + 1 }} 位玩家</p>
        </div>
        <div class="cash-card">
          <span>可用現金</span><strong :class="{ negative: g.player.cash < 0 }">${{ fmt(g.player.cash) }}</strong>
          <small>月現金流 <b :class="gameSummary.monthlyCashFlow >= 0 ? 'positive' : 'negative'">{{ gameSummary.monthlyCashFlow >= 0 ? '+' : '' }}${{ fmt(gameSummary.monthlyCashFlow) }}</b></small>
        </div>
      </div>
      <div class="game-layout">
        <section class="board-panel">
          <div class="board-topline">
            <div><span class="board-kicker">THE CASHFLOW JOURNEY</span><h2>財富環形棋盤</h2></div>
            <div class="board-legend"><span><i class="legend-dot opportunity-dot" />投資</span><span><i class="legend-dot event-dot" />事件</span><span><i class="legend-dot expense-dot" />支出</span></div>
          </div>

          <div class="board" aria-label="24 格現金流遊戲棋盤">
            <div
              v-for="space in boardSpaces"
              :key="space.index"
              class="board-tile"
              :class="[`tile-${space.type}`, { 'tile-current': g.player.position === space.index }]"
              :style="{ gridRow: space.row + 1, gridColumn: space.col + 1 }"
              :aria-label="`${space.index + 1} 格：${space.name}${g.player.position === space.index ? '，目前玩家所在位置' : ''}`"
            >
              <span class="tile-number">{{ String(space.index + 1).padStart(2, '0') }}</span>
              <span v-if="g.player.position === space.index" class="tile-current-label">目前</span>
              <BoardIcon :name="space.iconName" class="tile-icon" />
              <span class="tile-name">{{ space.name }}</span>
              <div class="tile-tokens">
                <TransitionGroup name="token">
                  <span
                    v-for="p in g.players.filter(player => player.position === space.index)"
                    :key="p.ownerId || p.name"
                    class="player-token"
                    :class="[`token-color-${g.players.indexOf(p) % 6}`, { 'token-active': g.players.indexOf(p) === g.turn }]"
                    :title="p.name"
                  >{{ p.name.slice(0, 1) }}</span>
                </TransitionGroup>
              </div>
            </div>

            <div class="board-center">
              <div class="center-brand"><span class="center-mark">CF</span><span>CASHFLOW<small>讓現金流動起來</small></span></div>
              <div class="center-player">
                <span class="center-greeting">現在輪到</span>
                <strong>{{ g.player.name }}</strong>
                <span>{{ currentSpace?.icon }} {{ currentSpace?.name }}</span>
              </div>
              <div class="freedom-progress">
                <div class="progress-copy"><span>財務自由進度</span><b>{{ progressPercent }}%</b></div>
                <div class="progress-track"><div class="progress-fill" :style="{ width: progressPercent + '%' }" /></div>
                <small>被動收入 ${{ fmt(gameSummary.passiveIncome) }} <span>/</span> 月支出 ${{ fmt(gameSummary.totalExpenses) }}</small>
              </div>
              <div class="center-hint">依落點抽取事件，每回合擲骰一次後交棒</div>
              <Transition name="dice-stage">
                <div v-if="isRolling || isDiceLanded" class="center-dice-stage" role="status" :aria-label="isRolling ? '骰子正在棋盤中央滾動' : `擲出 ${g.lastDice} 點`">
                  <div class="center-dice-group">
                    <div
                      v-for="(face, index) in displayedDice"
                      :key="index"
                      class="dice center-dice"
                      :class="{ 'dice-rolling': isRolling, 'dice-landed': isDiceLanded }"
                      :style="{ animationDelay: isRolling ? `${index * 45}ms` : '0ms' }"
                      :aria-label="`骰子 ${index + 1}：${face} 點`"
                    >
                      <i v-for="pip in 9" :key="pip" :class="{ 'pip-active': (dicePips[face] ?? dicePips[1])!.includes(pip - 1) }" />
                    </div>
                  </div>
                  <strong>{{ isRolling ? '骰子滾動中…' : `本回合結果：${g.lastDice} 點` }}</strong>
                </div>
              </Transition>
            </div>
          </div>
          <div class="board-caption"><span>✦</span> 讓每一次選擇，都成為通往自由的下一步。</div>
        </section>

        <aside class="game-sidebar">
          <section class="action-panel">
            <div class="panel-heading"><div><span class="eyebrow">MAKE YOUR MOVE</span><h2>輪到 {{ g.player.name }}</h2></div><span class="turn-indicator" /></div>
            <div class="dice-row" :class="{ 'dice-row-rolling': isRolling }">
              <div v-for="(face, index) in displayedDice" :key="index" class="dice" :class="{ 'dice-rolling': isRolling, 'dice-landed': isDiceLanded }" :aria-label="`骰子 ${index + 1}：${face} 點`">
                <i v-for="pip in 9" :key="pip" :class="{ 'pip-active': (dicePips[face] ?? dicePips[1])!.includes(pip - 1) }" />
              </div>
              <div class="dice-description"><b>{{ isRolling ? '命運轉動中…' : g.lastDice ? g.diceResults.length > 1 ? `${g.diceResults.join(' + ')} = ${g.lastDice} 點` : `擲出 ${g.lastDice} 點` : '準備好出發了嗎？' }}</b><span>{{ g.lastDice ? `目前在第 ${g.player.position + 1} 格` : '擲骰決定你的下一步' }}</span></div>
              <button
                type="button"
                class="sound-toggle"
                :class="{ 'sound-off': !soundEnabled }"
                :aria-label="soundButtonLabel"
                :title="soundButtonLabel"
                @click="toggleDiceSound"
              >{{ soundEnabled ? '🔊' : '🔇' }}</button>
              <button
                type="button"
                class="sound-toggle music-toggle"
                :class="{ 'sound-off': !musicEnabled }"
                :aria-label="musicButtonLabel"
                :title="musicButtonLabel"
                @click="toggleBackgroundMusic"
              >{{ musicEnabled ? '♫' : '♪' }}</button>
            </div>
            <div class="music-settings" aria-label="背景音樂設定">
              <label class="music-track-control" for="music-track">
                <span>背景音樂</span>
                <select id="music-track" v-model="selectedMusicTrack" class="form-field">
                  <option v-for="track in musicTracks" :key="track.id" :value="track.id">{{ track.name }}</option>
                </select>
              </label>
              <label class="music-volume-control" for="music-volume">
                <span>音量 <b>{{ musicVolume }}%</b></span>
                <input id="music-volume" v-model.number="musicVolume" type="range" min="0" max="100" step="1" aria-label="背景音樂音量" />
              </label>
            </div>
            <div v-if="soundError" class="sound-error" role="status">{{ soundError }}</div>
            <p v-if="g.quotesLoading" class="waiting-note" role="status">正在取得本輪歷史行情（首次載入月份較久）…</p>
            <p v-if="g.historyComplete" class="waiting-note" role="status">已完成最後可用歷史交易日，本局停止推進；可按右上角重新開始。</p>
            <div v-if="g.quoteError" class="market-error" role="alert">{{ g.quoteError }} <button class="repay-button" @click="g.loadStockQuotes()">重試歷史行情</button></div>
            <button class="roll-button" :disabled="isRolling || !g.canRoll" @click="rollDice()">
              <span>{{ rollButtonText }}</span><span class="roll-arrow">{{ isRolling ? '···' : '↗' }}</span>
            </button>
            <div v-if="g.lastDrawnCard && !g.card && !isRolling" class="roll-card-result" role="status">
              <span>{{ g.lastDrawnCard.kind === 'realEstate' && g.lastDrawnCard.opportunity ? '✨ 個人創業機會（僅你可買進）' : '✨ 抽到事件卡' }}</span>
              <strong>{{ g.lastDrawnCard.title }}</strong>
              <p>{{ g.lastDrawnCard.desc }}</p>
            </div>
            <button class="end-turn-button" :disabled="isRolling || !g.canEndTurn" @click="g.endTurn()">{{ g.skippingTurn ? '跳過回合，交給下一位' : '結束回合，交給下一位' }} <span>→</span></button>
            <p v-if="g.player.skipTurns" class="event-purchase-error" role="status">失業：接下來尚需停玩 {{ g.player.skipTurns }} 回合。{{ g.skippingTurn ? '本回合不能擲骰、交易或借還款，請跳過回合。' : '本回合結束後開始停玩。' }}薪資設定不變。</p>
            <button class="secondary-button" :disabled="isRolling || !g.canOpenStockMarket" @click="g.openStockMarket()">📈 進入股票市場</button>
            <p v-if="g.myTurn" class="waiting-note">自由玩法：自己的回合可在擲骰前後買賣，離開後可再次進入。</p>
            <div v-if="g.myTurn && !g.gameOver && !isRolling && g.lastDice" class="waiting-note" role="status">{{ g.stockMarketOpen ? '可在股票市場買賣，離開市場後再交棒' : g.card ? '請先買進或放棄事件卡' : '本回合已完成，請結束回合交給下一位' }}</div>
            <div v-if="!g.myTurn && !g.gameOver" class="waiting-note"><span class="status-dot" />等待 {{ g.player.name }} 操作中…</div>
            <div v-if="g.card" class="event-card">
              <div class="event-card-top"><span>{{ g.card.kind === 'realEstate' && g.card.opportunity ? '✨ 個人創業機會（僅你可買進）' : '✨ 抽到事件卡' }}</span><span class="event-spark">✦</span></div>
              <h3>{{ g.card.title }}</h3>
              <p>{{ g.card.desc }}</p>
              <p v-if="g.cardPurchaseIssue" class="event-purchase-error" role="alert">{{ g.cardPurchaseIssue }}</p>
              <div class="event-actions">
                <button class="event-accept" :disabled="isRolling || !!g.cardPurchaseIssue" @click="g.acceptCard()">買進</button>
                <button class="event-decline" :disabled="isRolling || !g.myTurn || g.gameOver" @click="g.declineCard()">放棄</button>
              </div>
            </div>
            <div v-if="g.gameOver" class="fast-track-note">🏆 遊戲已結束</div>
            <p class="waiting-note">勝出條件：第一位被動收入 ≥ 每月總支出的玩家獲勝。</p>
          </section>

        </aside>
      </div>

      <StockMarket v-if="g.stockMarketOpen && !isRolling" />
      <div class="finance-grid">
        <section class="finance-panel">
          <div class="section-heading"><h3>每月收支</h3><span>MONTHLY CASH FLOW</span></div>
          <div class="finance-line"><span><i class="finance-icon income-icon">↗</i>薪資收入</span><b class="positive">+${{ fmt(gameSummary.salary) }}</b></div>
          <div class="finance-line"><span><i class="finance-icon income-icon">✦</i>被動收入</span><b class="positive">+${{ fmt(gameSummary.passiveIncome) }}</b></div>
          <div class="finance-line"><span><i class="finance-icon expense-icon">−</i>稅金與其他支出</span><b class="negative">−${{ fmt(g.player.profession.taxes + g.player.profession.otherExpenses) }}</b></div>
          <div v-for="l in g.player.liabilities" :key="l.name" class="finance-line"><span><i class="finance-icon expense-icon">−</i>{{ l.name }}月付</span><b class="negative">−${{ fmt(l.monthlyPayment) }}</b></div>
          <div v-if="g.player.children" class="finance-line"><span><i class="finance-icon expense-icon">−</i>家庭支出 ×{{ g.player.children }}</span><b class="negative">−${{ fmt(g.player.children * g.player.childExpensePerKid) }}</b></div>
          <div class="finance-total"><span>每月淨現金流</span><b :class="gameSummary.monthlyCashFlow >= 0 ? 'positive' : 'negative'">{{ gameSummary.monthlyCashFlow >= 0 ? '+' : '−' }}${{ fmt(Math.abs(gameSummary.monthlyCashFlow)) }}</b></div>
        </section>

        <section class="finance-panel">
          <div class="section-heading"><h3>資產與負債</h3><span>YOUR PORTFOLIO</span></div>
          <div class="portfolio-summary">
            <div><small>總資產（股票按成本）</small><b>${{ fmt(gameSummary.totalAssets) }}</b></div>
            <div><small>總負債</small><b class="negative">${{ fmt(gameSummary.totalLiabilities) }}</b></div>
          </div>
          <div class="asset-list">
            <div v-for="s in g.player.stocks" :key="s.symbol + s.cost" class="asset-row"><span>📈 {{ s.symbol }} × {{ fmt(s.shares) }} · 每股成本 ${{ fmt(s.cost) }}</span><small>成本 ${{ fmt(s.shares * s.cost) }}</small></div>
            <div v-for="r in g.player.realEstate" :key="r.name" class="asset-row"><span>🏠 {{ r.name }}</span><small class="positive">+${{ fmt(r.cashFlow) }}/月</small></div>
            <div v-for="l in g.player.liabilities" :key="l.name">
              <div class="asset-row"><span>💳 {{ l.name }} <small>${{ fmt(l.balance) }}</small></span><button class="repay-button" :disabled="isRolling || !g.myTurn || g.skippingTurn || g.player.cash < l.balance" @click="g.repay(l.name, l.balance)">還清</button></div>
              <div v-if="l.name === '銀行貸款'" class="bank-repayment">
                <label class="field-label" for="bank-repayment-amount">部分還款金額
                  <input id="bank-repayment-amount" v-model="bankRepayment" class="form-field" type="number" min="0.01" :max="Math.max(0, Math.min(l.balance, g.player.cash))" step="0.01" inputmode="decimal" :disabled="isRolling || !g.myTurn || g.skippingTurn" />
                </label>
                <button class="repay-button" :disabled="isRolling || !g.myTurn || g.skippingTurn || !validBankRepayment" @click="g.repay(l.name, repaymentAmount)">部分還款</button>
                <p class="market-disclaimer">目前月付 ${{ fmt(l.monthlyPayment) }}；還款後按剩餘本金 2% 計算（四捨五入至整元）。</p>
                <p v-if="remainingBankPayment !== null" class="market-disclaimer">還款後剩餘本金 ${{ fmt(l.balance - repaymentAmount) }}，月付 ${{ fmt(remainingBankPayment) }}。</p>
                <p v-if="bankRepayment !== '' && !validBankRepayment" class="market-error" role="alert">金額須大於零、最多兩位小數，且不可超過貸款餘額或可用現金。</p>
              </div>
            </div>
            <div v-if="!g.player.stocks.length && !g.player.realEstate.length" class="empty-assets">還沒有投資資產，擲骰尋找機會吧！</div>
          </div>
          <p v-if="loanCredit" class="market-disclaimer">銀行貸款上限為月薪 6 倍：${{ fmt(loanCredit.limit) }}；剩餘額度 ${{ fmt(loanCredit.available) }}。被動收入不增加額度，還款後恢復額度。</p>
          <button v-if="g.cashRecoveryRequired" class="loan-button" :disabled="isRolling || !g.myTurn || g.gameOver || rescueLoanAmount <= 0" @click="g.loan(rescueLoanAmount)">補正現金：借款 ${{ fmt(rescueLoanAmount) }}</button>
          <button v-else class="loan-button" :disabled="isRolling || !g.myTurn || g.gameOver || g.skippingTurn || !loanCredit || loanCredit.available < 50000" @click="g.loan(50000)">＋ 借款 $50,000</button>
          <p v-if="loanCredit && loanCredit.available < 50000" class="market-disclaimer">剩餘額度不足 $50,000，請先還款再借款。</p>
        </section>

        <section class="finance-panel log-panel">
          <div class="section-heading"><h3>旅程紀錄</h3><span>GAME LOG</span></div>
          <div v-if="g.log.length" class="log-list">
            <div v-for="(line, i) in g.log.slice(0, 5)" :key="`${i}-${line}`" class="log-line"><span class="log-dot" />{{ line }}</div>
          </div>
          <div v-else class="empty-assets">擲出第一顆骰子，開始你的財富旅程。</div>
        </section>
      </div>
      <button v-if="g.online" class="leave-game-button" @click="g.leaveRoom()">離開房間</button>
    </fieldset>

    <footer class="site-footer">
      <span>現金流 CASHFLOW</span>
      <span v-if="!g.inGame" class="version-updated">版本更新：<time :datetime="buildTime">{{ versionUpdatedAt }}</time>（台灣時間）</span>
      <span>PLAY SMART. LIVE FREE.</span>
    </footer>
  </main>
</template>

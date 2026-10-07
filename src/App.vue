<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useGameStore } from './stores/game'
import { professions } from './game/professions'
import { BOARD_SIZE } from './game/finance'
import { spaces } from './game/board'
import StockMarket from './components/StockMarket.vue'

const g = useGameStore()
const gameSummary = computed(() => g.summary!)
const mode = ref<'menu' | 'local' | 'online'>('menu')
const entries = ref([{ name: '玩家一', prof: 0 }, { name: '玩家二', prof: 1 }])
const myName = ref('')
const myProf = ref(0)
const joinCode = ref('')
const bankRepayment = ref<number | string>('')
const repaymentAmount = computed(() => Number(bankRepayment.value))
const bankLoan = computed(() => g.player?.liabilities.find(l => l.name === '銀行貸款'))
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
const soundError = ref('')
const diceFace = ref(1)
const animatedDice = ref<number[]>([1])
let audioContext: AudioContext | undefined
let diceTimer: ReturnType<typeof setInterval> | undefined
let soundTimer: ReturnType<typeof setInterval> | undefined
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
const soundButtonLabel = computed(() => soundEnabled.value ? '關閉擲骰音效' : '開啟擲骰音效')

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
  if (!soundEnabled.value || typeof window === 'undefined' || !window.AudioContext) return
  audioContext ??= new AudioContext()
  void audioContext.resume().then(() => {
    if (!isRolling.value || !soundEnabled.value || !audioContext) return
    playDiceTick(audioContext)
    soundTimer = setInterval(() => {
      if (audioContext && isRolling.value && soundEnabled.value) playDiceTick(audioContext)
    }, 95)
  }).catch(() => {
    soundError.value = '音效無法播放，請確認瀏覽器允許音訊。'
  })
}

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
  if (diceTimer) clearInterval(diceTimer)
  if (rollTimeout) clearTimeout(rollTimeout)
  if (landedTimeout) clearTimeout(landedTimeout)
  stopDiceSound()
  if (audioContext) void audioContext.close()
})
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
      <div v-if="g.inGame" class="round-chip">第 {{ g.round }} 輪 · 玩家 {{ g.turn + 1 }} / {{ g.players.length }}</div>
    </header>

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
      <h2 id="victory-title">🏆 {{ g.winners.length > 1 ? '並列獲勝！' : '財務自由，獲勝！' }}</h2>
      <p v-for="winner in g.winners" :key="winner.playerIndex"><strong>{{ winner.name }}</strong>：每月被動收入 ${{ fmt(winner.passiveIncome) }} ≥ 每月總支出 ${{ fmt(winner.totalExpenses) }}</p>
      <p>遊戲已結束，棋盤與資產保留供查看。薪水與一次性收入不計入勝出條件。</p>
      <button class="secondary-button" @click="g.resetGame(); mode = 'menu'">返回選單，開始新遊戲</button>
    </section>
    <fieldset v-if="g.inGame && g.summary && g.player" :disabled="!g.myTurn || g.gameOver" class="game-page game-fieldset">
      <div class="game-heading">
        <div>
          <div class="eyebrow"><span /> YOUR TURN, YOUR FUTURE</div>
          <h1>財富旅程 <span>／</span> {{ g.player.name }}</h1>
          <p>{{ g.player.profession.title }}<span class="heading-separator">·</span>第 {{ g.round }} 輪 · 歷史交易日 {{ g.marketDate }} · 第 {{ g.turn + 1 }} 位玩家</p>
        </div>
        <div class="cash-card">
          <span>可用現金</span><strong>${{ fmt(g.player.cash) }}</strong>
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
            >
              <span class="tile-number">{{ String(space.index + 1).padStart(2, '0') }}</span>
              <span class="tile-icon">{{ space.icon }}</span>
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
            </div>
            <div v-if="soundError" class="sound-error" role="status">{{ soundError }}</div>
            <p v-if="g.quotesLoading" class="waiting-note" role="status">正在取得本輪歷史行情（首次載入月份較久）…</p>
            <p v-if="g.historyComplete" class="waiting-note" role="status">已完成最後可用歷史交易日，本局停止推進；可按右上角重新開始。</p>
            <div v-if="g.quoteError" class="market-error" role="alert">{{ g.quoteError }} <button class="repay-button" @click="g.loadStockQuotes()">重試歷史行情</button></div>
            <button class="roll-button" :disabled="isRolling || !g.canRoll" @click="rollDice()">
              <span>{{ isRolling ? '骰子滾動中' : g.lastDice ? '本回合已擲骰' : '擲出骰子' }}</span><span class="roll-arrow">{{ isRolling ? '···' : '↗' }}</span>
            </button>
            <button class="secondary-button" :disabled="isRolling || !g.canOpenStockMarket" @click="g.openStockMarket()">📈 進入股票市場</button>
            <p v-if="g.myTurn" class="waiting-note">自由玩法：自己的回合可在擲骰前後買賣，離開後可再次進入。</p>
            <div v-if="g.myTurn && !g.gameOver && !isRolling && g.lastDice" class="waiting-note" role="status">{{ g.stockMarketOpen ? '可在股票市場買賣，離開市場後再交棒' : g.card ? '請先買進或放棄事件卡' : '本回合已完成，請結束回合交給下一位' }}</div>
            <div v-if="!g.myTurn && !g.gameOver" class="waiting-note"><span class="status-dot" />等待 {{ g.player.name }} 操作中…</div>
            <div v-if="g.card" class="event-card">
              <div class="event-card-top"><span>{{ g.card.kind === 'realEstate' && g.card.opportunity ? '✨ 個人創業機會（僅你可買進）' : '✨ 抽到事件卡' }}</span><span class="event-spark">✦</span></div>
              <h3>{{ g.card.title }}</h3>
              <p>{{ g.card.desc }}</p>
              <div class="event-actions">
                <button class="event-accept" :disabled="isRolling" @click="g.acceptCard()">買進</button>
                <button class="event-decline" :disabled="isRolling" @click="g.declineCard()">放棄</button>
              </div>
            </div>
            <button class="end-turn-button" :disabled="isRolling || !g.canEndTurn" @click="g.endTurn()">結束回合，交給下一位 <span>→</span></button>
            <div v-if="g.gameOver" class="fast-track-note">🏆 遊戲已結束</div>
            <p class="waiting-note">勝出條件：第一位被動收入 ≥ 每月總支出的玩家獲勝。</p>
          </section>

          <section class="players-panel">
            <div class="section-heading"><h3>玩家隊伍</h3><span>{{ g.players.length }} 位玩家</span></div>
            <div v-for="(p, i) in g.players" :key="p.ownerId || p.name" class="player-row" :class="{ 'player-row-active': i === g.turn }">
              <span class="player-avatar" :class="`avatar-color-${i % 6}`">{{ p.name.slice(0, 1) }}</span>
              <span class="player-row-info"><b>{{ p.name }}</b><small>{{ p.profession.title }}</small></span>
              <span class="player-position">#{{ String(p.position + 1).padStart(2, '0') }}</span>
            </div>
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
              <div class="asset-row"><span>💳 {{ l.name }} <small>${{ fmt(l.balance) }}</small></span><button class="repay-button" :disabled="isRolling || !g.myTurn || g.player.cash < l.balance" @click="g.repay(l.name, l.balance)">還清</button></div>
              <div v-if="l.name === '銀行貸款'" class="bank-repayment">
                <label class="field-label" for="bank-repayment-amount">部分還款金額
                  <input id="bank-repayment-amount" v-model="bankRepayment" class="form-field" type="number" min="0.01" :max="Math.max(0, Math.min(l.balance, g.player.cash))" step="0.01" inputmode="decimal" :disabled="isRolling || !g.myTurn" />
                </label>
                <button class="repay-button" :disabled="isRolling || !g.myTurn || !validBankRepayment" @click="g.repay(l.name, repaymentAmount)">部分還款</button>
                <p class="market-disclaimer">目前月付 ${{ fmt(l.monthlyPayment) }}；還款後按剩餘本金 2% 計算（四捨五入至整元）。</p>
                <p v-if="remainingBankPayment !== null" class="market-disclaimer">還款後剩餘本金 ${{ fmt(l.balance - repaymentAmount) }}，月付 ${{ fmt(remainingBankPayment) }}。</p>
                <p v-if="bankRepayment !== '' && !validBankRepayment" class="market-error" role="alert">金額須大於零、最多兩位小數，且不可超過貸款餘額或可用現金。</p>
              </div>
            </div>
            <div v-if="!g.player.stocks.length && !g.player.realEstate.length" class="empty-assets">還沒有投資資產，擲骰尋找機會吧！</div>
          </div>
          <button class="loan-button" @click="g.loan(50000)">＋ 借款 $50,000</button>
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

    <footer class="site-footer"><span>現金流 CASHFLOW</span><span>PLAY SMART. LIVE FREE.</span></footer>
  </main>
</template>

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { doc, getDoc, onSnapshot, runTransaction, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore'
import type { Player, Profession } from '../game/types'
import * as fin from '../game/finance'
import { applyAutoCard, cards, drawCardForDeck } from '../game/cards'
import { spaces } from '../game/board'
import { professions } from '../game/professions'
import { db, getClientId } from '../firebase'
import { fetchStockQuotes, historicalDividend, stockCatalogue, type StockQuote } from '../game/stockMarket'
import { applyHistoricalActions } from '../game/corporateActions'

export interface Member { id: string; name: string; prof: number }
export type Phase = 'lobby' | 'playing'
export interface Winner {
  playerIndex: number
  name: string
  passiveIncome: number
  totalExpenses: number
}

const MAX_PLAYERS = 6
const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export const useGameStore = defineStore('game', () => {
  const clientId = getClientId()
  const players = ref<Player[]>([])
  const turn = ref(0)
  const cardIdx = ref<number | null>(null)
  const lastCardIdx = ref<number | null>(null)
  const log = ref<string[]>([])
  const lastDice = ref(0)
  const diceResults = ref<number[]>([])
  const pendingExtraDice = ref<0 | 2 | 3>(0)
  const stockMarketOpen = ref(false)
  const stockQuotes = ref<StockQuote[]>([])
  const marketDate = ref('2020-01-01')
  const nextMarketDate = ref<string | null>('2020-01-01')
  const round = ref(1)
  const settledMarketDate = ref('2020-01-01')
  const historyComplete = ref(false)
  const winners = ref<Winner[]>([])
  const cashEffect = ref<{ id: number; type: 'income' | 'expense' } | null>(null)
  let cashEffectId = 0
  const gameOver = computed(() => winners.value.length > 0
    || (players.value.length > 0 && players.value.every(p => p.bankrupt)))
  const quotesLoading = ref(false)
  const quoteError = ref('')
  const tradeMessage = ref('')
  let quoteRequest: AbortController | null = null

  const roomCode = ref<string | null>(null)
  const phase = ref<Phase>('lobby')
  const members = ref<Member[]>([])
  const hostId = ref('')
  const error = ref('')
  let unsub: Unsubscribe | null = null

  const online = computed(() => roomCode.value !== null)
  const player = computed(() => players.value[turn.value] ?? null)
  const cashRecoveryRequired = computed(() => !!player.value
    && (!!player.value.cashRecoveryRequired || player.value.cash < 0))
  const card = computed(() => (cardIdx.value === null ? null : cards[cardIdx.value] ?? null))
  const lastDrawnCard = computed(() => (lastCardIdx.value === null ? null : cards[lastCardIdx.value] ?? null))
  const summary = computed(() => (player.value ? fin.summarize(player.value) : null))
  const isHost = computed(() => hostId.value === clientId)
  const myTurn = computed(() => !online.value || player.value?.ownerId === clientId)
  const inGame = computed(() => players.value.length > 0 && (!online.value || phase.value === 'playing'))
  const skippingTurn = computed(() => lastDice.value === 0 && (player.value?.skipTurns ?? 0) > 0)
  const cardPurchaseIssue = computed(() => {
    const c = card.value
    if (!c || !player.value) return ''
    if (gameOver.value) return '遊戲已結束，無法購買'
    if (!myTurn.value) return '只有目前回合的玩家可以買進或放棄事件卡'
    if (pendingExtraDice.value) return '請先完成追加擲骰'
    const cost = c.kind === 'stock' ? Math.round(c.stock.shares * c.stock.cost * 100) / 100
      : c.kind === 'realEstate' ? c.asset.downPayment : 0
    if (player.value.cash >= cost) return ''
    const money = (value: number) => value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
    return `現金不足：需要 $${money(cost)}，目前現金 $${money(player.value.cash)}，還差 $${money(cost - player.value.cash)}。可賣股或在剩餘額度內借款，也可放棄此卡。`
  })
  const canRollExtra = computed(() => inGame.value && myTurn.value && !gameOver.value && !cashRecoveryRequired.value && pendingExtraDice.value > 0)
  const canRoll = computed(() => inGame.value && myTurn.value && !gameOver.value && !cashRecoveryRequired.value && !skippingTurn.value && !pendingExtraDice.value && lastDice.value === 0 && cardIdx.value === null && !stockMarketOpen.value
    && stockQuotes.value.length > 0 && !quotesLoading.value && !quoteError.value && !historyComplete.value)
  const canEndTurn = computed(() => inGame.value && myTurn.value && !gameOver.value && !cashRecoveryRequired.value && !pendingExtraDice.value && (lastDice.value > 0 || skippingTurn.value) && cardIdx.value === null && !stockMarketOpen.value)
  const canOpenStockMarket = computed(() => inGame.value && myTurn.value && !gameOver.value && (!skippingTurn.value || cashRecoveryRequired.value) && !pendingExtraDice.value && !stockMarketOpen.value
    && stockQuotes.value.length > 0 && !quotesLoading.value && !quoteError.value && (!historyComplete.value || cashRecoveryRequired.value))
  const canTradeStocks = computed(() => inGame.value && myTurn.value && !gameOver.value && (!skippingTurn.value || cashRecoveryRequired.value) && stockMarketOpen.value
    && stockQuotes.value.length > 0 && !quotesLoading.value && !quoteError.value && (!historyComplete.value || cashRecoveryRequired.value))

  function note(msg: string) {
    log.value = [msg, ...log.value].slice(0, 50)
  }

  function markCashEffect(before: number, after: number) {
    if (before === after) return
    cashEffect.value = { id: ++cashEffectId, type: after > before ? 'income' : 'expense' }
  }

  function gameState() {
    return clean({
      players: players.value, turn: turn.value, cardIdx: cardIdx.value, lastCardIdx: lastCardIdx.value, log: log.value, lastDice: lastDice.value,
      stockMarketOpen: stockMarketOpen.value, stockQuotes: stockQuotes.value,
      marketDate: marketDate.value, nextMarketDate: nextMarketDate.value, round: round.value,
      settledMarketDate: settledMarketDate.value,
      historyComplete: historyComplete.value,
      winners: winners.value,
      diceResults: diceResults.value, pendingExtraDice: pendingExtraDice.value,
    })
  }

  function commit() {
    checkVictory()
    const turnChanged = resolveBankruptcies()
    if (roomCode.value) updateDoc(doc(db, 'rooms', roomCode.value), { game: gameState() }).catch(e => (error.value = String(e)))
    if (turnChanged && player.value && !stockQuotes.value.length && !historyComplete.value) void loadStockQuotes()
  }

  function checkVictory() {
    if (gameOver.value) return
    const achieved = players.value.flatMap((p, playerIndex) => {
      const s = fin.summarize(p)
      return !p.bankrupt && p.cash > 0 && s.canFastTrack ? [{ playerIndex, name: p.name, passiveIncome: s.passiveIncome, totalExpenses: s.totalExpenses }] : []
    })
    if (!achieved.length) return
    winners.value = achieved
    cancelQuoteRequest()
    stockMarketOpen.value = false
    cardIdx.value = null
    pendingExtraDice.value = 0
    note(`🏆 ${achieved.map(w => w.name).join('、')}${achieved.length > 1 ? '並列獲勝' : '獲勝'}：被動收入已達每月總支出，遊戲結束`)
  }

  function rescueCapacity(p: Player): number {
    const credit = fin.bankLoanCredit(p).available
    const stockValue = p.stocks.reduce((total, stock) => {
      const quote = stockQuotes.value.find(item => item.symbol === stock.symbol && item.date === marketDate.value)
      return total + stock.shares * (quote?.price ?? 0)
    }, 0)
    return Math.round((p.cash + credit + stockValue) * 100) / 100
  }

  function advanceTurnState(): boolean {
    const current = turn.value
    const next = players.value.findIndex((p, index) => index > current && !p.bankrupt)
    const nextTurn = next >= 0 ? next : players.value.findIndex(p => !p.bankrupt)
    if (nextTurn < 0) return false
    const wrapped = nextTurn <= current
    cardIdx.value = null
    lastCardIdx.value = null
    lastDice.value = 0
    diceResults.value = []
    pendingExtraDice.value = 0
    resetStockMarket()
    if (wrapped) {
      if (nextMarketDate.value === null) {
        historyComplete.value = true
        turn.value = nextTurn
        note('歷史行情已到最後可用交易日，本局停止推進；可重新開始遊戲')
        return true
      }
      marketDate.value = nextMarketDate.value
      stockQuotes.value = []
      round.value++
    }
    turn.value = nextTurn
    note('輪到 ' + player.value!.name)
    return true
  }

  function resolveBankruptcies(): boolean {
    players.value = players.value.map(p => {
      if (p.bankrupt) return p
      const recoveryRequired = p.cash < 0 || (!!p.cashRecoveryRequired && p.cash <= 0)
      if (!recoveryRequired) return p.cashRecoveryRequired ? { ...p, cashRecoveryRequired: false } : p
      return { ...p, cashRecoveryRequired: true }
    })
    let turnChanged = false
    const eliminatedNames: string[] = []
    while (player.value?.cashRecoveryRequired && rescueCapacity(player.value) <= 0) {
      const eliminated = player.value
      players.value[turn.value] = { ...eliminated, bankrupt: true }
      eliminatedNames.push(eliminated.name)
      if (!advanceTurnState()) break
      turnChanged = true
      if (players.value.every(p => p.bankrupt)) break
    }
    if (eliminatedNames.length) note(`${eliminatedNames.join('、')} 無法將現金補回正數，破產出局`)
    return turnChanged
  }

  function begin(list: Player[]) {
    resetStockMarket()
    stockQuotes.value = []
    marketDate.value = '2020-01-01'
    nextMarketDate.value = '2020-01-01'
    round.value = 1
    settledMarketDate.value = '2020-01-01'
    historyComplete.value = false
    winners.value = []
    cashEffect.value = null
    players.value = list
    turn.value = 0
    cardIdx.value = null
    lastCardIdx.value = null
    lastDice.value = 0
    diceResults.value = []
    pendingExtraDice.value = 0
    log.value = []
    note('遊戲開始，輪到 ' + list[0].name)
    checkVictory()
  }

  // ---- 單機 ----
  function start(entries: { name: string; profession: Profession }[]) {
    leaveRoom()
    begin(entries.map(e => fin.createPlayer(e.name, e.profession)))
    void loadStockQuotes()
  }

  // ---- 連線房間 ----
  function listen(code: string) {
    unsub?.()
    unsub = onSnapshot(doc(db, 'rooms', code), snap => {
      if (!snap.exists()) { error.value = '房間不存在'; return }
      if (snap.metadata.hasPendingWrites) return
      const d = snap.data()
      phase.value = d.phase
      members.value = d.members
      hostId.value = d.hostId
      if (d.game) {
        if (quotesLoading.value && (d.game.turn !== turn.value || d.game.round !== round.value || d.game.marketDate !== marketDate.value))
          cancelQuoteRequest()
        players.value = d.game.players
        turn.value = d.game.turn
        cardIdx.value = d.game.cardIdx
        lastCardIdx.value = d.game.lastCardIdx ?? null
        log.value = d.game.log
        lastDice.value = d.game.lastDice
        diceResults.value = d.game.diceResults ?? (d.game.lastDice ? [d.game.lastDice] : [])
        pendingExtraDice.value = d.game.pendingExtraDice ?? 0
        stockMarketOpen.value = d.game.stockMarketOpen ?? false
        stockQuotes.value = d.game.stockQuotes ?? []
        marketDate.value = d.game.marketDate ?? '2020-01-01'
        nextMarketDate.value = d.game.nextMarketDate ?? '2020-01-01'
        round.value = d.game.round ?? 1
        settledMarketDate.value = d.game.settledMarketDate ?? d.game.marketDate ?? '2020-01-01'
        historyComplete.value = d.game.historyComplete ?? false
        winners.value = d.game.winners ?? []
        if (gameOver.value) cancelQuoteRequest()
        if (inGame.value && myTurn.value && !stockQuotes.value.length && !quotesLoading.value) void loadStockQuotes()
      }
    }, e => (error.value = String(e)))
  }

  async function createRoom(name: string, prof: number) {
    error.value = ''
    name = name.trim()
    if (!name) { error.value = '請輸入玩家暱稱'; return }
    for (let i = 0; i < 5; i++) {
      const code = String(Math.floor(1000 + Math.random() * 9000))
      const ref_ = doc(db, 'rooms', code)
      if ((await getDoc(ref_)).exists()) continue
      await setDoc(ref_, { phase: 'lobby', hostId: clientId, members: [{ id: clientId, name, prof }], game: null })
      roomCode.value = code
      listen(code)
      return
    }
    error.value = '建立房間失敗，請重試'
  }

  async function joinRoom(code: string, name: string, prof: number) {
    error.value = ''
    name = name.trim()
    if (!name) { error.value = '請輸入玩家暱稱'; return }
    const ref_ = doc(db, 'rooms', code)
    try {
      await runTransaction(db, async tx => {
        const snap = await tx.get(ref_)
        if (!snap.exists()) throw new Error('找不到房間')
        const d = snap.data()
        const list: Member[] = d.members
        const mine = list.find(m => m.id === clientId)
        if (d.phase !== 'lobby' && !mine) throw new Error('遊戲已開始')
        if (!mine && list.length >= MAX_PLAYERS) throw new Error('房間已滿')
        if (!mine) tx.update(ref_, { members: [...list, { id: clientId, name, prof }] })
        else if (d.phase === 'lobby') {
          tx.update(ref_, { members: list.map(m => m.id === clientId ? { ...m, name, prof } : m) })
        }
      })
      roomCode.value = code
      listen(code)
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  function updateMe(patch: Partial<Member>) {
    if (!roomCode.value) return
    const list = members.value.map(m => (m.id === clientId ? { ...m, ...patch } : m))
    members.value = list
    updateDoc(doc(db, 'rooms', roomCode.value), { members: list }).catch(e => (error.value = String(e)))
  }

  async function startOnline() {
    if (!roomCode.value || !isHost.value || members.value.length < 1) return
    begin(members.value.map(m => ({ ...fin.createPlayer(m.name, professions[m.prof]), ownerId: m.id })))
    phase.value = 'playing'
    await updateDoc(doc(db, 'rooms', roomCode.value), { phase: 'playing', game: gameState() })
    void loadStockQuotes()
  }

  function leaveRoom() {
    resetStockMarket()
    unsub?.()
    unsub = null
    roomCode.value = null
    phase.value = 'lobby'
    members.value = []
    hostId.value = ''
    error.value = ''
  }

  function resetGame() {
    leaveRoom()
    players.value = []
    winners.value = []
    cardIdx.value = null
    lastCardIdx.value = null
    lastDice.value = 0
    pendingExtraDice.value = 0
    diceResults.value = []
  }

  // ---- 遊戲動作（連線時僅輪到的玩家可操作）----
  function guard(allowSkippedTurn = false, allowCashRecovery = false): boolean {
    if (!player.value || player.value.bankrupt || !myTurn.value || gameOver.value || pendingExtraDice.value) return false
    if (cashRecoveryRequired.value && !allowCashRecovery) {
      note('⚠ 現金為負，請先賣股或借款補回正數')
      return false
    }
    if (skippingTurn.value && !allowSkippedTurn && !(allowCashRecovery && cashRecoveryRequired.value)) {
      note('⚠ 失業停玩期間只能跳過回合，不能擲骰、交易或借還款')
      return false
    }
    return true
  }

  function endTurn() {
    if (!guard(true)) return
    if (historyComplete.value) return
    if (!canEndTurn.value) {
      note(lastDice.value === 0 ? '⚠ 請先擲骰，再結束回合'
        : stockMarketOpen.value ? '⚠ 請先離開股票市場，再結束回合'
        : '⚠ 請先買進或放棄事件卡，再結束回合')
      return
    }
    if (skippingTurn.value) {
      const remaining = (player.value!.skipTurns ?? 0) - 1
      players.value[turn.value] = { ...player.value!, skipTurns: remaining }
      note(`${player.value!.name} 失業，跳過本回合；${remaining ? `尚需停玩 ${remaining} 回合` : '下次回合恢復操作'}`)
    }
    advanceTurnState()
    commit()
    if (player.value && !stockQuotes.value.length && !historyComplete.value) void loadStockQuotes()
  }

  function update(fn: (p: Player) => Player, msg: string): boolean {
    if (!player.value) return false
    try {
      players.value[turn.value] = fn(player.value)
      note(msg)
      return true
    } catch (e) {
      note(`⚠ ${(e as Error).message}`)
      return false
    }
  }

  function roll() {
    if (!guard()) return
    if (!canRoll.value) {
      note('⚠ 每位玩家每回合只能擲骰一次，請處理事件並結束回合')
      return
    }
    lastCardIdx.value = null
    const dice = 1 + Math.floor(Math.random() * 6)
    lastDice.value = dice
    diceResults.value = [dice]
    note(`擲出 ${dice}`)
    moveAndResolve(dice)
  }

  function rollExtraDice() {
    if (!canRollExtra.value) return
    const count = pendingExtraDice.value
    pendingExtraDice.value = 0
    diceResults.value = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6))
    const total = diceResults.value.reduce((sum, die) => sum + die, 0)
    lastDice.value = total
    note(`追加 ${count} 顆骰子：${diceResults.value.join(' + ')} = ${total}，前進 ${total} 格`)
    moveAndResolve(total)
  }

  function moveAndResolve(dice: number) {
    const { player: moved, passedPayday } = fin.move(player.value!, dice)
    players.value[turn.value] = moved
    if (passedPayday) {
      const cashBeforePayday = player.value!.cash
      update(fin.payday, '經過發薪日，自動領取月現金流')
      markCashEffect(cashBeforePayday, player.value!.cash)
    }
    const space = spaces[moved.position]
    note(`停在第 ${moved.position + 1} 格・${space.name}`)
    if (space.deck === null) {
      commit()
      return
    }
    if (space.deck === 'investment') {
      openStockMarket()
      return
    }
    const idx = drawCardForDeck(space.deck)
    const c = cards[idx]
    lastCardIdx.value = idx
    if (c.kind === 'extraDice') {
      cardIdx.value = null
      pendingExtraDice.value = c.dice
      note(`${c.title}：${c.desc}`)
    } else if (c.kind === 'stock' || c.kind === 'realEstate') {
      cardIdx.value = idx
    } else {
      cardIdx.value = null
      if ((c.kind === 'market' || c.kind === 'bonus') && c.global) {
        const cashBeforeEvent = players.value.reduce((total, p) => total + p.cash, 0)
        players.value = players.value.map(p => applyAutoCard(p, c))
        const cashAfterEvent = players.value.reduce((total, p) => total + p.cash, 0)
        markCashEffect(cashBeforeEvent, cashAfterEvent)
        note(`全體事件・${c.title}：${c.desc}`)
      } else {
        const cashBeforeEvent = player.value!.cash
        update(p => applyAutoCard(p, c), `${c.title}：${c.desc}`)
        markCashEffect(cashBeforeEvent, player.value!.cash)
      }
    }
    commit()
  }

  function acceptCard() {
    const c = card.value
    if (c && cardPurchaseIssue.value) {
      note(`⚠ ${cardPurchaseIssue.value}`)
      return
    }
    if (!c || !guard()) return
    const cashBeforePurchase = player.value!.cash
    const ok =
      c.kind === 'stock' ? update(p => fin.buyStock(p, c.stock), `買進 ${c.title}`)
      : c.kind === 'realEstate' ? update(p => fin.buyRealEstate(p, c.asset), `買進 ${c.title}`)
      : true
    if (ok) {
      markCashEffect(cashBeforePurchase, player.value!.cash)
      cardIdx.value = null
    }
    commit()
  }

  function cancelQuoteRequest() {
    quoteRequest?.abort()
    quoteRequest = null
    quotesLoading.value = false
  }

  function resetStockMarket() {
    cancelQuoteRequest()
    stockMarketOpen.value = false
    quoteError.value = ''
    tradeMessage.value = ''
  }

  async function loadStockQuotes() {
    if (!inGame.value || !myTurn.value || quotesLoading.value || historyComplete.value || gameOver.value) return
    if (stockQuotes.value.length) return
    const request = new AbortController()
    quoteRequest = request
    quotesLoading.value = true
    quoteError.value = ''
    const timeout = setTimeout(() => request.abort(), 70000)
    const requestedDate = marketDate.value
    const requestedRound = round.value
    const requestedTurn = turn.value
    try {
      const snapshot = await fetchStockQuotes(request.signal, requestedDate)
      if (quoteRequest !== request || !inGame.value || !myTurn.value
        || marketDate.value !== requestedDate || round.value !== requestedRound || turn.value !== requestedTurn) return
      stockQuotes.value = snapshot.quotes
      players.value = players.value.map(p => applyHistoricalActions(p, settledMarketDate.value, snapshot.date))
      if (settledMarketDate.value < '2025-06-18' && snapshot.date >= '2025-06-18')
        note('0050 一拆四：持股 ×4，成本與模擬每股股利 ÷4')
      if (settledMarketDate.value < '2022-09-19' && snapshot.date >= '2022-09-19')
        note('長榮減資：持股 ×0.4，保留小數持股；每舊股 $6 在復牌日入帳（遊戲簡化）')
      settledMarketDate.value = snapshot.date
      marketDate.value = snapshot.date
      nextMarketDate.value = snapshot.nextDate
      note(`第 ${round.value} 輪・歷史交易日 ${snapshot.date}`)
      commit()
    } catch (e) {
      if (quoteRequest !== request) return
      quoteError.value = request.signal.aborted ? '行情載入逾時，請重試。'
        : e instanceof Error ? e.message : String(e)
      note(`⚠ ${quoteError.value}`)
    } finally {
      clearTimeout(timeout)
      if (quoteRequest === request) {
        quoteRequest = null
        quotesLoading.value = false
      }
    }
  }

  function openStockMarket() {
    if (gameOver.value) return
    if (!canOpenStockMarket.value) {
      note('⚠ 只有目前玩家在本輪行情就緒且市場關閉時，才能開啟股票市場')
      return
    }
    stockMarketOpen.value = true
    tradeMessage.value = ''
    note(`進入股票市場，使用第 ${round.value} 輪 ${marketDate.value} 歷史收盤價`)
    commit()
  }

  function tradeStock(side: 'buy' | 'sell', symbol: string, shares: number) {
    if (gameOver.value) return
    tradeMessage.value = ''
    if (!canTradeStocks.value) {
      tradeMessage.value = '⚠ 只有目前玩家在市場開啟且行情就緒時才能交易'
      note(tradeMessage.value)
      return
    }
    if (side === 'buy' && cashRecoveryRequired.value) {
      tradeMessage.value = '⚠ 現金為負時只能賣股或借款，請先將現金補回正數'
      note(tradeMessage.value)
      return
    }
    const quote = stockQuotes.value.find(item => item.symbol === symbol)
    const stock = stockCatalogue.find(item => item.symbol === symbol)
    if (!quote || !stock || quote.date !== marketDate.value || quotesLoading.value || quoteError.value) {
      tradeMessage.value = '⚠ 此股票尚無可用收盤價，請重試行情'
      note(tradeMessage.value)
      return
    }
    const verb = side === 'buy' ? '買進' : '賣出'
    const message = `${verb} ${quote.name}（${symbol}）${shares} 股，每股 $${quote.price}（${quote.date} 收盤價）`
    const ok = update(
      p => side === 'buy'
        ? fin.buyStock(p, { symbol, shares, cost: quote.price, dividend: historicalDividend(symbol, stock.dividend, marketDate.value) })
        : fin.sellStock(p, symbol, shares, quote.price),
      message,
    )
    tradeMessage.value = ok ? message : log.value[0] ?? '⚠ 交易失敗'
    commit()
  }

  function closeStockMarket() {
    if (!guard(true, true) || !stockMarketOpen.value) return
    resetStockMarket()
    note(lastDice.value === 0 ? '離開股票市場，請擲骰繼續回合'
      : cardIdx.value !== null ? '離開股票市場，請先處理事件卡'
      : '離開股票市場，可再次進入或結束回合')
    commit()
  }

  function act(fn: () => void, allowCashRecovery = false) {
    if (!guard(false, allowCashRecovery)) return
    fn()
    commit()
  }

  function declineCard() { act(() => { cardIdx.value = null }) }
  function repay(name: string, amount: number) { act(() => { update(p => fin.repayLiability(p, name, amount), `償還 ${name} ${amount}`) }) }
  function loan(amount: number) { act(() => { update(p => fin.borrow(p, amount), `向銀行借款 ${amount}`) }, true) }
  function enterFastTrack() {
    if (guard()) commit()
  }

  return {
    clientId, players, turn, player, card, lastDrawnCard, cardPurchaseIssue, log, lastDice, summary, winners, gameOver, cashRecoveryRequired, cashEffect, diceResults, pendingExtraDice, canRollExtra, skippingTurn,
    stockMarketOpen, stockQuotes, quotesLoading, quoteError, tradeMessage, canOpenStockMarket, canTradeStocks, marketDate, nextMarketDate, round, historyComplete,
    roomCode, phase, members, hostId, error, online, isHost, myTurn, inGame, canRoll, canEndTurn,
    start, createRoom, joinRoom, updateMe, startOnline, leaveRoom, resetGame,
    roll, rollExtraDice, endTurn, acceptCard, declineCard, repay, loan, enterFastTrack,
    loadStockQuotes, openStockMarket, tradeStock, closeStockMarket,
  }
})

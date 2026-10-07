import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from './game'
import { professions } from '../game/professions'
import { summarize } from '../game/finance'
import { fetchStockQuotes, type HistoricalQuotes } from '../game/stockMarket'
import { updateDoc, runTransaction, setDoc } from 'firebase/firestore'

const roomEvents = vi.hoisted(() => {
  const state: { emit?: (snapshot: { exists(): boolean; metadata: { hasPendingWrites: boolean }; data(): unknown }) => void } = {}
  return state
})

vi.mock('../game/stockMarket', async importOriginal => ({
  ...await importOriginal<typeof import('../game/stockMarket')>(), fetchStockQuotes: vi.fn(),
}))
vi.mock('../firebase', () => ({ db: {}, getClientId: () => 'test-client' }))
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(), getDoc: vi.fn().mockResolvedValue({ exists: () => false }),
  onSnapshot: vi.fn((_reference: unknown, callback: typeof roomEvents.emit) => { roomEvents.emit = callback; return vi.fn() }),
  runTransaction: vi.fn(),
  setDoc: vi.fn(), updateDoc: vi.fn().mockResolvedValue(undefined),
}))

const snapshot = (date = '2020-01-02', nextDate: string | null = '2020-01-03', price = 100.25): HistoricalQuotes => ({
  date, nextDate, quotes: [{ symbol: '2330', name: '台積電', price, date }],
})
async function startGame() {
  const game = useGameStore()
  game.start([{ name: 'A', profession: professions[0] }, { name: 'B', profession: professions[1] }])
  await vi.waitFor(() => expect(game.quotesLoading).toBe(false))
  return game
}
function rollEstate(game: ReturnType<typeof useGameStore>) {
  game.player.position = 2
  vi.spyOn(Math, 'random').mockReturnValue(0)
  game.roll()
}
function finish(game: ReturnType<typeof useGameStore>) {
  game.declineCard()
  if (game.stockMarketOpen) game.closeStockMarket()
  game.endTurn()
}

describe('turn order and historical market', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(fetchStockQuotes).mockReset()
    vi.mocked(fetchStockQuotes).mockResolvedValue(snapshot())
  })
  afterEach(() => vi.restoreAllMocks())

  it('loads the first trading day before allowing a roll', async () => {
    const game = useGameStore()
    game.start([{ name: 'A', profession: professions[0] }])
    expect(game.canRoll).toBe(false)
    await vi.waitFor(() => expect(game.canRoll).toBe(true))
    expect(fetchStockQuotes).toHaveBeenCalledWith(expect.any(AbortSignal), '2020-01-01')
    expect(game.marketDate).toBe('2020-01-02')
  })

  it('does not skip a player before rolling', async () => {
    const game = await startGame()
    game.endTurn()
    expect(game.turn).toBe(0)
    expect(game.canEndTurn).toBe(false)
    expect(game.log[0]).toContain('請先擲骰')
  })

  it('allows only one roll even after resolving a card', async () => {
    const game = await startGame()
    rollEstate(game)
    game.roll()
    expect(game.player.position).toBe(3)
    game.declineCard()
    game.roll()
    expect(game.player.position).toBe(3)
    expect(game.canRoll).toBe(false)
  })

  it('requires card resolution before handing off', async () => {
    const game = await startGame()
    rollEstate(game)
    game.endTurn()
    expect(game.turn).toBe(0)
    expect(game.card).not.toBeNull()
    finish(game)
    expect(game.player.name).toBe('B')
    expect(game.canRoll).toBe(true)
  })

  it('retains the exact same snapshot for every player in a round', async () => {
    const game = await startGame()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    const quotes = [...game.stockQuotes]
    await game.loadStockQuotes()
    game.closeStockMarket()
    game.endTurn()
    game.roll()
    expect(game.marketDate).toBe('2020-01-02')
    expect(game.stockQuotes).toEqual(quotes)
    expect(fetchStockQuotes).toHaveBeenCalledTimes(1)
    expect(game.round).toBe(1)
  })

  it('advances only after the last player finishes, including rounds with no investments', async () => {
    const game = await startGame()
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce(snapshot('2020-01-03', '2020-01-06', 101))
    rollEstate(game)
    finish(game)
    expect(game.marketDate).toBe('2020-01-02')
    rollEstate(game)
    finish(game)
    expect(game.canRoll).toBe(false)
    await vi.waitFor(() => expect(game.quotesLoading).toBe(false))
    expect(game.round).toBe(2)
    expect(game.player.name).toBe('A')
    expect(game.marketDate).toBe('2020-01-03')
    expect(game.stockQuotes[0]?.price).toBe(101)
    expect(fetchStockQuotes).toHaveBeenLastCalledWith(expect.any(AbortSignal), '2020-01-03')
  })

  it('skips weekends using the next historical trading day', async () => {
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce(snapshot('2020-01-03', '2020-01-06'))
    const game = await startGame()
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce(snapshot('2020-01-06', '2020-01-07', 98))
    rollEstate(game)
    finish(game)
    rollEstate(game)
    finish(game)
    await vi.waitFor(() => expect(game.quotesLoading).toBe(false))
    expect(game.marketDate).toBe('2020-01-06')
  })

  it('retains an unaffordable card until declined', async () => {
    const game = await startGame()
    rollEstate(game)
    game.acceptCard()
    expect(game.card).not.toBeNull()
    expect(game.canEndTurn).toBe(false)
    game.player.cash = 500000
    game.acceptCard()
    expect(game.canEndTurn).toBe(true)
  })

  it('preserves expense, family, bonus, and global bonus landing effects', async () => {
    const game = await startGame()
    game.player.position = 4
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.5)
    const cash = game.players.map(p => p.cash)
    game.roll()
    expect(game.players.map(p => p.cash)).toEqual(cash.map(value => value + 10000))
    finish(game)
    game.player.position = 19
    vi.mocked(Math.random).mockReturnValue(0)
    game.roll()
    expect(game.player.children).toBe(1)
    expect(game.canEndTurn).toBe(true)
  })

  it('only awards income on unexpected income and expenses on expense spaces', async () => {
    const game = await startGame()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.player.position = 4
    const cash = game.player.cash
    game.roll()
    expect(game.player.cash).toBe(cash + 50000)
    finish(game)
    game.player.position = 3
    const otherCash = game.player.cash
    game.roll()
    expect(game.player.cash).toBe(otherCash - 30000)
  })

  it('draws an added market message and settles all players without changing historical quotes', async () => {
    const game = await startGame()
    game.player.position = 5
    game.players[0]!.realEstate = [
      { name: '套房', downPayment: 100000, mortgage: 0, cashFlow: 3000 },
      { name: '店面', downPayment: 80000, mortgage: 0, cashFlow: 2500 },
    ]
    game.players[1]!.realEstate = [{ name: '事業', downPayment: 80000, mortgage: 0, cashFlow: 2500 }]
    const cash = game.players.map(p => p.cash)
    const quotes = [...game.stockQuotes]
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(8.5 / 15)
    game.roll()
    expect(game.player.position).toBe(6)
    expect(game.players.map(p => p.cash)).toEqual([cash[0]! - 10000, cash[1]! - 5000])
    expect(game.log[0]).toContain('全體事件・空租期來襲')
    expect(game.stockQuotes).toEqual(quotes)
    expect(game.card).toBeNull()
    expect(game.canEndTurn).toBe(true)
  })

  it('settles a personal opportunity only for the player who landed on it', async () => {
    const game = await startGame()
    game.player.position = 14
    const cash = game.players.map(p => p.cash)
    const quotes = [...game.stockQuotes]
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    expect(game.player.position).toBe(15)
    expect(game.players.map(p => p.cash)).toEqual([cash[0]! + 18000, cash[1]])
    expect(game.log[0]).toContain('專案接案機會')
    expect(game.log[0]).not.toContain('全體事件')
    expect(game.stockQuotes).toEqual(quotes)
    expect(game.canEndTurn).toBe(true)
  })

  it('adds two dice immediately, resolves the new market event, and prevents duplicate rolls', async () => {
    const game = await startGame()
    game.player.position = 14
    const cash = game.player.cash
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(6.5 / 8)
      .mockReturnValueOnce(0).mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    game.roll()
    expect(game.pendingExtraDice).toBe(2)
    expect(game.canRoll).toBe(false)
    expect(game.canEndTurn).toBe(false)
    expect(game.canOpenStockMarket).toBe(false)
    game.endTurn()
    expect(game.turn).toBe(0)
    game.rollExtraDice()
    expect(game.diceResults).toEqual([1, 6])
    expect(game.lastDice).toBe(7)
    expect(game.player.position).toBe(22)
    expect(game.pendingExtraDice).toBe(0)
    expect(game.turn).toBe(0)
    expect(game.marketDate).toBe('2020-01-02')
    expect(game.player.cash).toBe(cash)
    const position = game.player.position
    game.rollExtraDice()
    game.roll()
    expect(game.player.position).toBe(position)
    expect(game.canEndTurn).toBe(true)
  })

  it('sums three dice, pays once when crossing payday, and opens the destination market', async () => {
    const game = await startGame()
    game.player.position = 14
    const cash = game.player.cash
    const flow = summarize(game.player).monthlyCashFlow
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(7.5 / 8)
      .mockReturnValueOnce(0.99).mockReturnValueOnce(0.99).mockReturnValueOnce(0.99)
    game.roll()
    expect(game.pendingExtraDice).toBe(3)
    game.rollExtraDice()
    expect(game.diceResults).toEqual([6, 6, 6])
    expect(game.lastDice).toBe(18)
    expect(game.player.position).toBe(9)
    expect(game.player.cash).toBe(cash + flow)
    expect(game.stockMarketOpen).toBe(true)
    expect(game.log.filter(line => line.includes('自動領取月現金流'))).toHaveLength(1)
    expect(game.round).toBe(1)
  })

  it('keeps a destination purchase pending after extra dice and denies another client the extra roll', async () => {
    const game = await startGame()
    game.player.position = 14
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(6.5 / 8)
      .mockReturnValueOnce(0.99).mockReturnValueOnce(0.99).mockReturnValueOnce(0)
    game.roll()
    game.roomCode = '5852'
    game.phase = 'playing'
    game.player.ownerId = 'other'
    game.rollExtraDice()
    expect(game.pendingExtraDice).toBe(2)
    expect(game.player.position).toBe(15)
    game.player.ownerId = game.clientId
    game.rollExtraDice()
    expect(game.player.position).toBe(3)
    expect(game.card?.kind).toBe('realEstate')
    expect(game.canEndTurn).toBe(false)
    game.declineCard()
    expect(game.canEndTurn).toBe(true)
    expect(game.canRoll).toBe(false)
  })

  it('offers personal business opportunities without automatic purchase and allows decline', async () => {
    const game = await startGame()
    game.player.position = 14
    const cash = game.players.map(p => p.cash)
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(4.5 / 8)
    game.roll()
    expect(game.card?.title).toBe('合夥行動咖啡攤')
    expect(game.players.map(p => p.cash)).toEqual(cash)
    expect(game.canEndTurn).toBe(false)
    game.endTurn()
    expect(game.turn).toBe(0)
    game.declineCard()
    expect(game.player.realEstate).toEqual([])
    expect(game.player.cash).toBe(cash[0])
    expect(game.canEndTurn).toBe(true)
  })

  it('keeps an unaffordable personal offer pending until funded and purchases only for the active player', async () => {
    const game = await startGame()
    game.player.position = 14
    game.player.cash = 10000
    const other = { ...game.players[1]! }
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(5.5 / 8)
    game.roll()
    expect(game.card?.title).toBe('二手自動販賣機經營權')
    game.acceptCard()
    expect(game.card).not.toBeNull()
    expect(game.player.cash).toBe(10000)
    game.loan(50000)
    game.acceptCard()
    expect(game.card).toBeNull()
    expect(game.player.cash).toBe(20000)
    expect(game.player.realEstate[0]?.cashFlow).toBe(1000)
    expect(game.players[1]).toEqual(other)
    expect(game.canEndTurn).toBe(true)
  })

  it('settles payday once with no extra card on payday', async () => {
    const game = await startGame()
    game.player.position = 23
    const cash = game.player.cash
    const flow = summarize(game.player).monthlyCashFlow
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    expect(game.player.cash).toBe(cash + flow)
    expect(game.card).toBeNull()
    expect(random).toHaveBeenCalledTimes(1)
    game.roll()
    expect(game.player.cash).toBe(cash + flow)
  })

  it('settles payday before opening the investment market after crossing', async () => {
    const game = await startGame()
    game.player.position = 23
    const cash = game.player.cash
    const flow = summarize(game.player).monthlyCashFlow
    vi.spyOn(Math, 'random').mockReturnValue(0.2)
    game.roll()
    expect(game.player.cash).toBe(cash + flow)
    expect(game.stockMarketOpen).toBe(true)
  })

  it('blocks ending until the market closes and blocks trading afterwards', async () => {
    const game = await startGame()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    game.endTurn()
    expect(game.turn).toBe(0)
    game.closeStockMarket()
    game.tradeStock('buy', '2330', 1)
    expect(game.player.stocks).toEqual([])
    game.endTurn()
    expect(game.player.name).toBe('B')
    expect(game.stockQuotes).toEqual(snapshot().quotes)
  })

  it('buys and sells at the current historical price', async () => {
    const game = await startGame()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    const cash = game.player.cash
    game.tradeStock('buy', '2330', 3)
    expect(game.player.cash).toBe(cash - 300.75)
    game.tradeStock('sell', '2330', 2)
    expect(game.player.cash).toBe(cash - 100.25)
    expect(game.player.stocks[0]?.shares).toBe(1)
    expect(game.tradeMessage).toContain('2020-01-02')
    game.tradeStock('sell', '2330', 1)
    expect(game.player.cash).toBe(cash)
  })

  it('rejects invalid quantities, missing quotes, overselling, and insufficient cash', async () => {
    const game = await startGame()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    for (const shares of [0, -1, 1.5, NaN, Infinity]) {
      game.tradeStock('buy', '2330', shares)
      expect(game.tradeMessage).toContain('⚠')
    }
    game.tradeStock('buy', '2330', 100000)
    expect(game.tradeMessage).toContain('現金不足')
    game.tradeStock('sell', '2330', 1)
    expect(game.tradeMessage).toContain('持股不足')
    game.tradeStock('buy', '0056', 1)
    expect(game.tradeMessage).toContain('尚無可用收盤價')
    expect(game.player.stocks).toEqual([])
  })

  it('blocks a round on failed history and retries without advancing again', async () => {
    vi.mocked(fetchStockQuotes).mockRejectedValueOnce(new Error('歷史行情錯誤'))
    const game = await startGame()
    expect(game.quoteError).toContain('歷史行情錯誤')
    expect(game.canRoll).toBe(false)
    await game.loadStockQuotes()
    expect(game.marketDate).toBe('2020-01-02')
    expect(game.round).toBe(1)
    expect(game.canRoll).toBe(true)
  })

  it('stops after every player completes the last available day instead of repeating prices', async () => {
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce(snapshot('2026-12-31', null))
    const game = await startGame()
    rollEstate(game)
    finish(game)
    expect(game.canRoll).toBe(true)
    rollEstate(game)
    finish(game)
    expect(game.historyComplete).toBe(true)
    expect(game.canRoll).toBe(false)
    expect(game.round).toBe(1)
    expect(fetchStockQuotes).toHaveBeenCalledTimes(1)
  })

  it('applies a split to all players once and uses adjusted dividends for subsequent buys', async () => {
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce(snapshot('2025-06-10', '2025-06-18'))
    const game = await startGame()
    for (const p of game.players)
      p.stocks = [{ symbol: '0050', shares: 3, cost: 180, dividend: 2 }]
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce({
      date: '2025-06-18', nextDate: '2025-06-19',
      quotes: [{ symbol: '0050', name: '元大台灣50', price: 45, date: '2025-06-18' }],
    })
    rollEstate(game)
    finish(game)
    rollEstate(game)
    finish(game)
    await vi.waitFor(() => expect(game.quotesLoading).toBe(false))
    expect(game.players.map(p => p.stocks[0]?.shares)).toEqual([12, 12])
    await game.loadStockQuotes()
    expect(game.players.map(p => p.stocks[0]?.shares)).toEqual([12, 12])
    game.player.position = 0
    game.roll()
    game.tradeStock('buy', '0050', 1)
    expect(game.player.stocks[0]).toEqual({ symbol: '0050', shares: 13, cost: 45, dividend: 0.5 })
  })

  it('ignores a response after starting a different game', async () => {
    const game = await startGame()
    let resolveQuotes: (data: HistoricalQuotes) => void = () => {}
    vi.mocked(fetchStockQuotes).mockImplementationOnce(() => new Promise(resolve => { resolveQuotes = resolve }))
    game.stockQuotes = []
    const pending = game.loadStockQuotes()
    game.start([{ name: 'New', profession: professions[0] }])
    await vi.waitFor(() => expect(game.quotesLoading).toBe(false))
    resolveQuotes(snapshot('2025-06-18', '2025-06-19', 50))
    await pending
    expect(game.player.name).toBe('New')
    expect(game.marketDate).toBe('2020-01-02')
  })

  it('restores and persists online historical state without reapplying a settled split', async () => {
    const game = await startGame()
    await game.createRoom('A', 0)
    if (!roomEvents.emit) throw new Error('Room listener was not installed')
    const savedPlayers = game.players.map(p => ({
      ...p, ownerId: game.clientId,
      stocks: [{ symbol: '0050', shares: 12, cost: 45, dividend: 0.5 }],
    }))
    vi.mocked(fetchStockQuotes).mockResolvedValueOnce(snapshot('2025-06-18', '2025-06-19'))
    roomEvents.emit({
      exists: () => true, metadata: { hasPendingWrites: false },
      data: () => ({
        phase: 'playing', members: [], hostId: game.clientId,
        game: {
          players: savedPlayers, turn: 0, cardIdx: null, log: [], lastDice: 0,
          stockMarketOpen: false, stockQuotes: [], marketDate: '2025-06-18',
          nextMarketDate: '2025-06-19', settledMarketDate: '2025-06-18', round: 1300,
        },
      }),
    })
    await vi.waitFor(() => expect(game.quotesLoading).toBe(false))
    expect(game.round).toBe(1300)
    expect(game.players.map(p => p.stocks[0]?.shares)).toEqual([12, 12])
    expect(updateDoc).toHaveBeenLastCalledWith(undefined, expect.objectContaining({
      game: expect.objectContaining({
        marketDate: '2025-06-18', settledMarketDate: '2025-06-18',
        nextMarketDate: '2025-06-19', round: 1300,
      }),
    }))
    game.leaveRoom()
  })

  it('blocks trades and turn actions for non-current online players', async () => {
    const game = await startGame()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    game.roll()
    game.roomCode = '1234'
    game.phase = 'playing'
    game.player.ownerId = 'someone-else'
    game.tradeStock('buy', '2330', 1)
    game.closeStockMarket()
    game.endTurn()
    expect(game.player.stocks).toEqual([])
    expect(game.stockMarketOpen).toBe(true)
    expect(game.turn).toBe(0)
    game.player.ownerId = game.clientId
    game.player.position = 3
    game.tradeStock('buy', '2330', 1)
    expect(game.player.stocks[0]?.shares).toBe(1)
  })

  it('trades before rolling and reopens after a non-investment landing without changing quotes', async () => {
    const game = await startGame()
    const cash = game.player.cash
    expect(game.canOpenStockMarket).toBe(true)
    game.openStockMarket()
    expect(game.canRoll).toBe(false)
    game.tradeStock('buy', '2330', 2)
    expect(game.player.cash).toBe(cash - 200.5)
    game.roll()
    game.endTurn()
    expect(game.lastDice).toBe(0)
    expect(game.turn).toBe(0)
    game.closeStockMarket()
    expect(game.canRoll).toBe(true)
    expect(game.canEndTurn).toBe(false)
    game.openStockMarket()
    game.tradeStock('sell', '2330', 1)
    game.closeStockMarket()
    rollEstate(game)
    const card = game.card
    game.openStockMarket()
    game.tradeStock('sell', '2330', 1)
    expect(game.player.cash).toBe(cash)
    game.closeStockMarket()
    expect(game.card).toEqual(card)
    expect(game.canEndTurn).toBe(false)
    finish(game)
    expect(game.player.name).toBe('B')
    expect(game.marketDate).toBe('2020-01-02')
    expect(fetchStockQuotes).toHaveBeenCalledTimes(1)
  })

  it('cannot open or trade while history is unavailable or exhausted', async () => {
    vi.mocked(fetchStockQuotes).mockRejectedValueOnce(new Error('offline'))
    const game = await startGame()
    game.openStockMarket()
    expect(game.stockMarketOpen).toBe(false)
    await game.loadStockQuotes()
    game.historyComplete = true
    game.openStockMarket()
    expect(game.stockMarketOpen).toBe(false)
    expect(game.canTradeStocks).toBe(false)
  })

  it('does not let another online player open the market', async () => {
    const game = await startGame()
    game.roomCode = '1234'
    game.phase = 'playing'
    game.player.ownerId = 'another-client'
    game.openStockMarket()
    expect(game.stockMarketOpen).toBe(false)
    expect(game.canOpenStockMarket).toBe(false)
  })

  it('automatically wins at exact equality after buying stocks and freezes all game actions', async () => {
    const game = await startGame()
    game.player.cash = 1000000
    const needed = summarize(game.player).totalExpenses / 10
    game.openStockMarket()
    game.tradeStock('buy', '2330', needed - 1)
    expect(game.gameOver).toBe(false)
    game.tradeStock('buy', '2330', 1)
    expect(game.winners).toEqual([{ playerIndex: 0, name: 'A', passiveIncome: 69000, totalExpenses: 69000 }])
    expect(game.gameOver).toBe(true)
    expect(game.stockMarketOpen).toBe(false)
    expect(game.canRoll).toBe(false)
    expect(game.canEndTurn).toBe(false)
    expect(game.canOpenStockMarket).toBe(false)
    expect(game.canTradeStocks).toBe(false)
    const state = JSON.stringify({ players: game.players, turn: game.turn, log: game.log })
    game.roll()
    game.endTurn()
    game.loan(50000)
    game.repay('信用卡', 1000)
    game.openStockMarket()
    game.tradeStock('sell', '2330', 1)
    game.acceptCard()
    game.declineCard()
    game.enterFastTrack()
    expect(JSON.stringify({ players: game.players, turn: game.turn, log: game.log })).toBe(state)
    game.start([{ name: 'New', profession: professions[0] }])
    expect(game.winners).toEqual([])
    expect(game.gameOver).toBe(false)
  })

  it('wins through reduced expenses after a partial bank repayment', async () => {
    const game = await startGame()
    game.loan(50000)
    game.player.stocks = [{ symbol: '2330', shares: 6950, cost: 1, dividend: 10 }]
    expect(summarize(game.player).canFastTrack).toBe(false)
    game.repay('銀行貸款', 25000)
    expect(game.gameOver).toBe(true)
    expect(game.winners[0]?.totalExpenses).toBe(69500)
    expect(game.winners[0]?.passiveIncome).toBe(69500)
  })

  it('declares tied winners only after the whole global event has settled', async () => {
    const game = await startGame()
    for (const p of game.players) {
      p.profession.taxes = 0
      p.profession.otherExpenses = 1000
      p.liabilities = [{ name: '房貸', balance: 10000, monthlyPayment: 500 }]
      p.stocks = [{ symbol: '2330', shares: 100, cost: 1, dividend: 10 }]
    }
    game.player.position = 5
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(5.5 / 15)
    game.roll()
    expect(game.winners.map(w => w.name)).toEqual(['A', 'B'])
    expect(game.players.map(p => p.liabilities[0]?.monthlyPayment)).toEqual([0, 0])
    expect(game.log[0]).toContain('並列獲勝')
  })

  it('can award victory to a non-current player affected by a global event', async () => {
    const game = await startGame()
    const p = game.players[1]!
    p.profession.taxes = 0
    p.profession.otherExpenses = 1000
    p.liabilities = [{ name: '房貸', balance: 10000, monthlyPayment: 500 }]
    p.stocks = [{ symbol: '2330', shares: 100, cost: 1, dividend: 10 }]
    game.player.position = 5
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(5.5 / 15)
    game.roll()
    expect(game.winners.map(w => w.name)).toEqual(['B'])
    expect(game.turn).toBe(0)
  })

  it('wins after purchasing a personal business, but not through salary or cash alone', async () => {
    const game = await startGame()
    game.player.cash = 1000000
    game.loan(50000)
    expect(game.gameOver).toBe(false)
    game.player.stocks = [{ symbol: '2330', shares: 6900, cost: 1, dividend: 10 }]
    game.player.position = 14
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(5.5 / 8)
    game.roll()
    expect(game.gameOver).toBe(false)
    game.acceptCard()
    expect(game.gameOver).toBe(true)
    expect(game.card).toBeNull()
    expect(game.winners[0]?.passiveIncome).toBe(70000)
  })

  it('persists victory online and restores it for non-current clients', async () => {
    const game = await startGame()
    game.roomCode = '5852'
    game.phase = 'playing'
    game.player.ownerId = game.clientId
    game.player.cash = 1000000
    game.openStockMarket()
    game.tradeStock('buy', '2330', 6900)
    const saved: unknown = vi.mocked(updateDoc).mock.calls.at(-1)?.[1]
    expect(saved).toMatchObject({ game: { winners: [{ name: 'A', passiveIncome: 69000, totalExpenses: 69000 }] } })
    game.resetGame()
    await game.createRoom('viewer', 0)
    if (!roomEvents.emit) throw new Error('Missing listener')
    roomEvents.emit({
      exists: () => true, metadata: { hasPendingWrites: false },
      data: () => ({ phase: 'playing', members: [], hostId: 'other',
        ...(typeof saved === 'object' && saved !== null ? saved : {}) }),
    })
    expect(game.gameOver).toBe(true)
    expect(game.winners[0]?.name).toBe('A')
    expect(game.canRoll).toBe(false)
    game.resetGame()
    expect(game.inGame).toBe(false)
  })

  it('rejects empty online names instead of creating an anonymous member', async () => {
    const game = useGameStore()
    vi.mocked(setDoc).mockClear()
    vi.mocked(runTransaction).mockClear()
    await game.createRoom('  ', 0)
    expect(game.error).toBe('請輸入玩家暱稱')
    await game.joinRoom('5852', '', 0)
    expect(game.error).toBe('請輸入玩家暱稱')
    expect(setDoc).not.toHaveBeenCalled()
    expect(runTransaction).not.toHaveBeenCalled()
  })

  it('updates an existing lobby member name and profession when rejoining', async () => {
    const game = useGameStore()
    const members = [
      { id: 'host', name: 'aa', prof: 0 },
      { id: game.clientId, name: '無名氏', prof: 0 },
    ]
    const tx = {
      get: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ phase: 'lobby', members }) }),
      update: vi.fn(), set: vi.fn(), delete: vi.fn(),
    }
    vi.mocked(runTransaction).mockImplementationOnce(async (_db, callback) => callback(tx as Parameters<typeof callback>[0]))
    await game.joinRoom('5852', ' ggg ', 1)
    expect(tx.update).toHaveBeenCalledWith(undefined, { members: [members[0], { id: game.clientId, name: 'ggg', prof: 1 }] })
    expect(game.roomCode).toBe('5852')
    game.leaveRoom()
  })
})

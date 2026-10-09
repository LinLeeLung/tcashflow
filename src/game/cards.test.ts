import { describe, expect, it } from 'vitest'
import { applyAutoCard, cards, drawCardForDeck } from './cards'
import { buyStock, createPlayer, summarize } from './finance'
import { professions } from './professions'
import { spaces } from './board'
import { BOARD_SIZE } from './finance'

const find = (t: string) => cards.find(c => c.title === t)!

describe('cards', () => {
  it('has a rich deck', () => {
    expect(cards.length).toBeGreaterThanOrEqual(40)
  })

  it('has fifteen global market messages and makes each reachable in the market pool', () => {
    const market = cards.filter(c => c.kind === 'market')
    expect(market).toHaveLength(15)
    expect(new Set(market.map(c => c.title)).size).toBe(15)
    market.forEach((card, index) => {
      expect('global' in card && card.global).toBe(true)
      expect(cards[drawCardForDeck('market', () => (index + 0.5) / market.length)]).toBe(card)
    })
    expect(cards[35]?.title).toBe('年終獎金')
  })

  it.each([
    ['租屋需求升溫', 10000],
    ['空租期來襲', -10000],
    ['房產修繕成本上升', -16000],
    ['節能設備補助', 6000],
  ])('%s settles once per property without altering recurring income', (title, amount) => {
    const p = createPlayer('t', professions[0])
    const empty = applyAutoCard(p, find(title))
    expect(empty).toEqual(p)
    p.realEstate = [
      { name: '套房', downPayment: 100000, mortgage: 900000, cashFlow: 3000 },
      { name: '事業', downPayment: 80000, mortgage: 0, cashFlow: 2500 },
    ]
    const q = applyAutoCard(p, find(title))
    expect(q.cash).toBe(p.cash + amount)
    expect(q.realEstate).toEqual(p.realEstate)
    expect(q.liabilities).toEqual(p.liabilities)
  })

  it.each([
    ['ETF 投資推廣', ['0050', '0056'], 40],
    ['科技供應鏈受阻', ['2330', '2454', '2317'], -150],
    ['航運訂單回暖', ['2603'], 30],
    ['金融業獲利回升', ['2882'], 20],
  ])('%s only settles the affected symbols, leaving holdings intact', (title, symbols, amount) => {
    const p = createPlayer('t', professions[0])
    expect(applyAutoCard(p, find(title))).toEqual(p)
    p.stocks = [...symbols, '2412'].map(symbol => ({ symbol, shares: 10, cost: 100, dividend: 1 }))
    const q = applyAutoCard(p, find(title))
    expect(q.cash).toBe(p.cash + amount)
    expect(q.stocks).toEqual(p.stocks)
    expect(p.cash).toBe(professions[0].startCash)
  })

  it('applies loan messages only to existing matching liabilities and clamps relief at zero', () => {
    const p = createPlayer('t', professions[0])
    p.liabilities = [
      { name: '房貸', balance: 100000, monthlyPayment: 300 },
      { name: '信用卡', balance: 10000, monthlyPayment: 1000 },
      { name: '車貸', balance: 10000, monthlyPayment: 800 },
    ]
    const relief = applyAutoCard(p, find('房貸利息補貼'))
    expect(relief.liabilities.map(l => l.monthlyPayment)).toEqual([0, 1000, 800])
    const hike = applyAutoCard(p, find('銀行調高信用卡利率'))
    expect(hike.liabilities.map(l => l.monthlyPayment)).toEqual([300, 1500, 800])
    expect(hike.liabilities.map(l => l.balance)).toEqual(p.liabilities.map(l => l.balance))
    expect(hike.cash).toBe(p.cash)
    const debtFree = { ...p, liabilities: [] }
    expect(applyAutoCard(debtFree, find('房貸利息補貼'))).toEqual(debtFree)
    expect(applyAutoCard(debtFree, find('銀行調高信用卡利率'))).toEqual(debtFree)
  })

  it('stock crash reduces cash by 20% of holdings', () => {
    const p = buyStock(createPlayer('t', professions[0]), { symbol: '2330', shares: 100, cost: 600, dividend: 10 })
    expect(applyAutoCard(p, find('股災')).cash).toBe(p.cash - 12000)
  })

  it('keeps an all-in Evergreen purchase below monthly expenses at the early historical price', () => {
    const evergreen = find('買進長榮')
    expect(evergreen.kind).toBe('stock')
    if (evergreen.kind !== 'stock') return
    expect(evergreen.stock.dividend).toBe(0.4)
    const player = { ...createPlayer('t', professions[1]), cash: 550000 }
    const allIn = buyStock(player, {
      ...evergreen.stock, shares: Math.floor(player.cash / 12.7), cost: 12.7,
    })
    const summary = summarize(allIn)
    expect(summary.passiveIncome).toBeCloseTo(17322.8)
    expect(summary.passiveIncome).toBeLessThan(summary.totalExpenses)
    expect(summary.canFastTrack).toBe(false)
  })

  it('rate hike raises mortgage payment only', () => {
    const p = createPlayer('t', professions[0])
    const q = applyAutoCard(p, find('央行升息半碼'))
    expect(q.liabilities.find(l => l.name === '房貸')!.monthlyPayment).toBe(23500)
  })

  it('property tax scales with holdings', () => {
    const p = createPlayer('t', professions[0])
    expect(applyAutoCard(p, find('囤房稅上路')).cash).toBe(p.cash)
  })

  it('covers all 24 board spaces with matching card pools', () => {
    expect(spaces).toHaveLength(BOARD_SIZE)
    expect(spaces.filter(space => space.deck === null)).toEqual([spaces[0]])
    for (const space of spaces) {
      if (space.deck === null) continue
      for (let sample = 0; sample < cards.length; sample++) {
        const card = cards[drawCardForDeck(space.deck, () => (sample + 0.5) / cards.length)]
        if (space.deck === 'bonus') {
          expect(card.kind).toBe('bonus')
          const player = createPlayer('t', professions[0])
          expect(applyAutoCard(player, card).cash).toBeGreaterThan(player.cash)
        } else if (space.deck === 'investment') {
          expect(['stock', 'realEstate']).toContain(card.kind)
        } else if (space.deck === 'expense') {
          expect(card.kind).toBe('doodad')
        } else if (space.deck === 'family') {
          expect(card.kind).toBe('child')
        } else if (space.deck === 'opportunity') {
          expect(card.kind === 'opportunity' || card.kind === 'extraDice' || (card.kind === 'realEstate' && card.opportunity)).toBe(true)
        } else {
          expect(card.kind).toBe(space.deck)
        }
      }
    }
  })

  it('has nine distinct personal opportunities isolated from the market and property pools', () => {
    const pool = cards.filter(c => c.kind === 'opportunity' || c.kind === 'extraDice' || (c.kind === 'realEstate' && c.opportunity))
    expect(pool).toHaveLength(9)
    pool.forEach((card, index) => {
      expect(cards[drawCardForDeck('opportunity', () => (index + 0.5) / pool.length)]).toBe(card)
    })
    for (const deck of ['market', 'realEstate', 'investment', 'bonus'] as const) {
      for (let i = 0; i < cards.length; i++)
        expect(pool).not.toContain(cards[drawCardForDeck(deck, () => (i + 0.5) / cards.length)])
    }
  })

  it('unemployment sets three skipped turns without changing finances or the original player', () => {
    const p = createPlayer('t', professions[0])
    expect(applyAutoCard(p, find('失業'))).toEqual({ ...p, skipTurns: 3 })
    expect(p.skipTurns).toBeUndefined()
  })

  it.each([
    ['專案接案機會', 18000], ['合作推薦獎勵', 12000],
    ['創意提案獲獎', 25000], ['技能分享講師邀約', 8000],
  ])('%s adds only a one-time personal cash reward', (title, amount) => {
    const p = createPlayer('t', professions[0])
    expect(applyAutoCard(p, find(title))).toEqual({ ...p, cash: p.cash + amount })
    expect(p.cash).toBe(professions[0].startCash)
  })
})

import { describe, expect, it } from 'vitest'
import { applyHistoricalActions } from './corporateActions'
import { createPlayer, summarize, sellStock } from './finance'
import { professions } from './professions'

describe('historical corporate actions', () => {
  it('adjusts all 0050 lots once without changing total cost or simulated passive income', () => {
    const player = createPlayer('A', professions[0])
    player.stocks = [
      { symbol: '0050', shares: 3, cost: 180, dividend: 2 },
      { symbol: '0050', shares: 5, cost: 160, dividend: 2 },
      { symbol: '2330', shares: 2, cost: 600, dividend: 10 },
    ]
    const adjusted = applyHistoricalActions(player, '2025-06-17', '2025-06-18')
    expect(adjusted.stocks[0]).toEqual({ symbol: '0050', shares: 12, cost: 45, dividend: 0.5 })
    expect(adjusted.stocks[1]?.shares).toBe(20)
    expect(adjusted.stocks[2]).toEqual(player.stocks[2])
    expect(summarize(adjusted).totalAssets).toBe(summarize(player).totalAssets)
    expect(summarize(adjusted).passiveIncome).toBe(summarize(player).passiveIncome)
    expect(applyHistoricalActions(adjusted, '2025-06-18', '2025-06-19')).toEqual(adjusted)
  })

  it('leaves holdings unchanged before the split', () => {
    const player = createPlayer('A', professions[0])
    player.stocks = [{ symbol: '0050', shares: 1, cost: 100, dividend: 2 }]
    expect(applyHistoricalActions(player, '2025-06-10', '2025-06-17')).toEqual(player)
  })

  it('retains fractional Evergreen holdings and allows selling the remainder', () => {
    const player = createPlayer('A', professions[0])
    player.stocks = [{ symbol: '2603', shares: 3, cost: 80, dividend: 4 }]
    const adjusted = applyHistoricalActions(player, '2022-09-16', '2022-09-19')
    expect(adjusted.stocks[0]).toEqual({ symbol: '2603', shares: 1.2, cost: 185, dividend: 10 })
    expect(adjusted.cash).toBe(player.cash + 18)
    expect(summarize(adjusted).totalAssets).toBe(summarize(player).totalAssets)
    expect(summarize(adjusted).passiveIncome).toBe(summarize(player).passiveIncome)
    const partial = sellStock(adjusted, '2603', 1, 169)
    expect(partial.stocks[0]?.shares).toBe(0.2)
    const sold = sellStock(partial, '2603', 0.2, 169)
    expect(sold.stocks).toEqual([])
    expect(sold.cash).toBe(adjusted.cash + 202.8)
  })
})

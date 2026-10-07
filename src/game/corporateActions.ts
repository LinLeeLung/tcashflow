import type { Player } from './types'

export function applyHistoricalActions(player: Player, from: string, to: string): Player {
  let result = player
  if (from < '2022-09-19' && to >= '2022-09-19') {
    let returnedCash = 0
    const stocks = result.stocks.map(stock => {
      if (stock.symbol !== '2603') return stock
      returnedCash += stock.shares * 6
      return { ...stock, shares: Math.round(stock.shares * 0.4 * 1e6) / 1e6,
        cost: Math.max(0, stock.cost - 6) / 0.4, dividend: stock.dividend / 0.4 }
    })
    result = { ...result, stocks, cash: Math.round((result.cash + returnedCash) * 100) / 100 }
  }
  if (from < '2025-06-18' && to >= '2025-06-18') {
    result = {
      ...result,
      stocks: result.stocks.map(stock => stock.symbol === '0050'
        ? { ...stock, shares: stock.shares * 4, cost: stock.cost / 4, dividend: stock.dividend / 4 }
        : stock),
    }
  }
  return result
}

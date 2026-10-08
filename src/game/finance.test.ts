import { describe, expect, it } from 'vitest'
import * as f from './finance'
import { professions } from './professions'

const base = () => f.createPlayer('t', professions[0])

describe('finance', () => {
  it('summarizes expenses and cash flow', () => {
    const s = f.summarize(base())
    expect(s.totalExpenses).toBe(12000 + 25000 + 22000 + 8000 + 2000)
    expect(s.monthlyCashFlow).toBe(85000 - s.totalExpenses)
    expect(s.passiveIncome).toBe(0)
  })

  it('payday adds cash flow', () => {
    const p = base()
    expect(f.payday(p).cash).toBe(p.cash + f.summarize(p).monthlyCashFlow)
  })

  it('buys stock, adds passive income, rejects insufficient cash', () => {
    const p = f.buyStock(base(), { symbol: '2330', shares: 100, cost: 600, dividend: 10 })
    expect(p.cash).toBe(150000 - 60000)
    expect(f.summarize(p).passiveIncome).toBe(1000)
    expect(() => f.buyStock(p, { symbol: 'X', shares: 1, cost: 1e9, dividend: 0 })).toThrow(f.InsufficientCashError)
  })

  it('sells stock partially', () => {
    const p = f.buyStock(base(), { symbol: '2330', shares: 100, cost: 600, dividend: 10 })
    const q = f.sellStock(p, '2330', 40, 700)
    expect(q.stocks[0].shares).toBe(60)
    expect(q.cash).toBe(p.cash + 28000)
  })

  it('rejects invalid stock trade quantities and prices without changing cash', () => {
    for (const shares of [0, -1, 0.5, NaN, Infinity]) {
      expect(() => f.buyStock(base(), { symbol: '2330', shares, cost: 10, dividend: 1 })).toThrow()
      expect(() => f.sellStock(base(), '2330', shares, 10)).toThrow()
    }
    for (const price of [0, -1, NaN, Infinity]) {
      expect(() => f.buyStock(base(), { symbol: '2330', shares: 1, cost: price, dividend: 1 })).toThrow()
      expect(() => f.sellStock(base(), '2330', 1, price)).toThrow()
    }
  })

  it('sells across multiple purchase lots and keeps cent precision', () => {
    const p = f.buyStock(f.buyStock(base(), { symbol: 'X', shares: 2, cost: 10.1, dividend: 1 }),
      { symbol: 'X', shares: 3, cost: 10.2, dividend: 1 })
    const sold = f.sellStock(p, 'X', 4, 10.3)
    expect(sold.stocks).toEqual([{ symbol: 'X', shares: 1, cost: 10.2, dividend: 1 }])
    expect(sold.cash).toBe(149990.4)
  })

  it('shows weighted average and total cost only for the remaining selected holdings', () => {
    const p = f.buyStock(f.buyStock(base(), { symbol: '0056', shares: 100, cost: 20, dividend: 0.3 }),
      { symbol: '0056', shares: 300, cost: 30, dividend: 0.3 })
    p.stocks.push({ symbol: '2330', shares: 1, cost: 339, dividend: 10 })
    expect(f.stockHoldingCost(p.stocks, '0056')).toEqual({ shares: 400, totalCost: 11000, averageCost: 27.5 })
    const sold = f.sellStock(p, '0056', 150, 29)
    expect(f.stockHoldingCost(sold.stocks, '0056')).toEqual({ shares: 250, totalCost: 7500, averageCost: 30 })
    expect(f.stockHoldingCost(f.sellStock(sold, '0056', 250, 29).stocks, '0056'))
      .toEqual({ shares: 0, totalCost: 0, averageCost: null })
    expect(f.stockHoldingCost([], '0056')).toEqual({ shares: 0, totalCost: 0, averageCost: null })
  })

  it('calculates adjusted and fractional holding costs without prematurely rounding the average', () => {
    expect(f.stockHoldingCost([{ symbol: '0050', shares: 12, cost: 45, dividend: 0.5 }], '0050'))
      .toEqual({ shares: 12, totalCost: 540, averageCost: 45 })
    expect(f.stockHoldingCost([{ symbol: '2603', shares: 1.2, cost: 185, dividend: 10 }], '2603'))
      .toEqual({ shares: 1.2, totalCost: 222, averageCost: 185 })
    const holding = f.stockHoldingCost([
      { symbol: 'X', shares: 1, cost: 10.01, dividend: 0 },
      { symbol: 'X', shares: 2, cost: 10.02, dividend: 0 },
    ], 'X')
    expect(holding.totalCost).toBe(30.05)
    expect(holding.averageCost).toBeCloseTo(30.05 / 3)
  })

  it('sells all fractional lots without floating-point overselling or residual dust', () => {
    const player = base()
    player.stocks = [
      { symbol: '2603', shares: 1.2, cost: 185, dividend: 10 },
      { symbol: '2603', shares: 2.4, cost: 180, dividend: 10 },
    ]
    const sold = f.sellStock(player, '2603', 3.6, 169)
    expect(sold.stocks).toEqual([])
    expect(sold.cash).toBe(player.cash + 608.4)
    expect(() => f.sellStock(player, '2603', 0.0000001, 169)).toThrow()
  })

  it('real estate buy/sell', () => {
    const r = { name: 'a', downPayment: 100000, mortgage: 900000, cashFlow: 3000 }
    const p = f.buyRealEstate(base(), r)
    expect(f.summarize(p).passiveIncome).toBe(3000)
    const q = f.sellRealEstate(p, 0, 1200000)
    expect(q.cash).toBe(p.cash + 300000)
    expect(q.realEstate).toHaveLength(0)
  })

  it('children raise expenses; repaying removes payment', () => {
    const p = f.haveChild(base())
    expect(f.summarize(p).totalExpenses).toBe(f.summarize(base()).totalExpenses + 5000)
    const q = f.repayLiability(base(), '信用卡', 50000)
    expect(q.liabilities.find(l => l.name === '信用卡')).toBeUndefined()
    expect(q.cash).toBe(100000)
  })

  it('borrow adds cash and payment', () => {
    const p = f.borrow(base(), 100000)
    expect(p.cash).toBe(250000)
    expect(f.summarize(p).totalExpenses).toBe(f.summarize(base()).totalExpenses + 2000)
  })

  it('caps outstanding bank principal at six months of salary for every profession', () => {
    for (const profession of professions) {
      const player = f.createPlayer('t', profession)
      const limit = profession.salary * 6
      expect(f.bankLoanCredit(player)).toEqual({ limit, balance: 0, available: limit })
      const borrowed = f.borrow(f.borrow(player, limit - 50000), 50000)
      expect(f.bankLoanCredit(borrowed)).toEqual({ limit, balance: limit, available: 0 })
      expect(f.summarize(borrowed).totalExpenses).toBe(f.summarize(player).totalExpenses + Math.round(limit * 0.02))
      expect(() => f.borrow(borrowed, 0.01)).toThrow('銀行貸款不可超過月薪 6 倍')
      expect(() => f.borrow(player, limit + 0.01)).toThrow('銀行貸款不可超過月薪 6 倍')
    }
  })

  it('does not increase credit through cash or passive income, and preserves over-limit legacy debt', () => {
    const player = base()
    player.cash = 10000000
    player.stocks = [{ symbol: '2330', shares: 100000, cost: 600, dividend: 10 }]
    player.realEstate = [{ name: 'x', downPayment: 1000000, mortgage: 0, cashFlow: 100000 }]
    expect(f.bankLoanCredit(player).limit).toBe(510000)
    player.liabilities.push({ name: '銀行貸款', balance: 600000, monthlyPayment: 12000 })
    expect(f.bankLoanCredit(player)).toEqual({ limit: 510000, balance: 600000, available: 0 })
    const original = structuredClone(player)
    expect(() => f.borrow(player, 50000)).toThrow('剩餘額度 0')
    expect(player).toEqual(original)
    expect(f.bankLoanCredit(f.repayLiability(player, '銀行貸款', 100000)).available).toBe(10000)
  })

  it('restores credit after partial or full repayment without allowing repeated loans past the cap', () => {
    const borrowed = f.borrow(base(), 510000)
    const partial = f.repayLiability(borrowed, '銀行貸款', 50000)
    expect(f.bankLoanCredit(partial).available).toBe(50000)
    const borrowedAgain = f.borrow(partial, 50000)
    expect(f.bankLoanCredit(borrowedAgain).available).toBe(0)
    expect(() => f.borrow(borrowedAgain, 50000)).toThrow()
    const repaid = f.repayLiability(borrowedAgain, '銀行貸款', 510000)
    expect(f.bankLoanCredit(repaid).available).toBe(510000)
  })

  it('rejects invalid borrowing amounts without changing the player and keeps cent precision', () => {
    const player = base()
    const original = structuredClone(player)
    for (const amount of [0, -1, NaN, Infinity, 0.001, 50000.001, Number.MAX_SAFE_INTEGER])
      expect(() => f.borrow(player, amount)).toThrow('借款金額必須大於零，最多兩位小數')
    expect(player).toEqual(original)
    const borrowed = f.borrow(f.borrow(player, 1000.1), 2000.2)
    expect(borrowed.cash).toBe(153000.3)
    expect(f.bankLoanCredit(borrowed)).toEqual({ limit: 510000, balance: 3000.3, available: 506999.7 })
  })

  it('partially repays bank principal and reduces monthly payment at two percent', () => {
    const p = f.borrow(base(), 100000)
    const partial = f.repayLiability(p, '銀行貸款', 25000)
    expect(partial.cash).toBe(p.cash - 25000)
    expect(partial.liabilities.find(l => l.name === '銀行貸款'))
      .toEqual({ name: '銀行貸款', balance: 75000, monthlyPayment: 1500 })
    expect(f.summarize(partial).monthlyCashFlow).toBe(f.summarize(p).monthlyCashFlow + 500)
    const full = f.repayLiability(partial, '銀行貸款', 75000)
    expect(full.liabilities.some(l => l.name === '銀行貸款')).toBe(false)
    expect(full.cash).toBe(base().cash)
  })

  it('validates repayments, rounds cents, and preserves other debt monthly payments', () => {
    const p = f.borrow(base(), 50000)
    for (const amount of [0, -1, NaN, Infinity, 0.001])
      expect(() => f.repayLiability(p, '銀行貸款', amount)).toThrow()
    expect(() => f.repayLiability({ ...p, cash: 10 }, '銀行貸款', 11)).toThrow(f.InsufficientCashError)
    const q = f.repayLiability(p, '銀行貸款', 1000.25)
    expect(q.cash).toBe(p.cash - 1000.25)
    expect(q.liabilities.find(l => l.name === '銀行貸款'))
      .toEqual({ name: '銀行貸款', balance: 48999.75, monthlyPayment: 980 })
    const other = f.repayLiability(p, '信用卡', 1000)
    expect(other.liabilities.find(l => l.name === '信用卡')?.monthlyPayment)
      .toBe(p.liabilities.find(l => l.name === '信用卡')?.monthlyPayment)
  })

  it('fast track when passive >= expenses', () => {
    const p = { ...base(), realEstate: [{ name: 'x', downPayment: 0, mortgage: 0, cashFlow: 100000 }] }
    expect(f.summarize(p).canFastTrack).toBe(true)
    expect(f.summarize(p).progress).toBe(1)
  })

  it('move wraps and flags payday', () => {
    const r = f.move({ ...base(), position: 22 }, 4)
    expect(r.player.position).toBe(2)
    expect(r.passedPayday).toBe(true)
  })
})

import type { Liability, Player, Profession, RealEstate, Stock, Summary } from './types'

export const BOARD_SIZE = 24

export class InsufficientCashError extends Error {
  constructor() { super('現金不足') }
}

export function createPlayer(name: string, profession: Profession): Player {
  const liabilities: Liability[] = []
  if (profession.homeMortgageBalance > 0)
    liabilities.push({ name: '房貸', balance: profession.homeMortgageBalance, monthlyPayment: profession.homeMortgage })
  if (profession.carLoan > 0)
    liabilities.push({ name: '車貸', balance: profession.carLoan, monthlyPayment: profession.carLoanPayment })
  if (profession.creditCard > 0)
    liabilities.push({ name: '信用卡', balance: profession.creditCard, monthlyPayment: profession.creditCardPayment })
  return {
    name, profession: { ...profession }, cash: profession.startCash,
    stocks: [], realEstate: [], liabilities,
    children: 0, childExpensePerKid: 5000, position: 0, isFastTrack: false,
  }
}

export function summarize(p: Player): Summary {
  const passiveIncome =
    p.stocks.reduce((s, x) => s + x.shares * x.dividend, 0) +
    p.realEstate.reduce((s, x) => s + x.cashFlow, 0)
  const salary = p.profession.salary
  const totalIncome = salary + passiveIncome
  const totalExpenses =
    p.profession.taxes + p.profession.otherExpenses +
    p.liabilities.reduce((s, l) => s + l.monthlyPayment, 0) +
    p.children * p.childExpensePerKid
  const totalAssets =
    p.cash +
    p.stocks.reduce((s, x) => s + x.shares * x.cost, 0) +
    p.realEstate.reduce((s, x) => s + x.downPayment + x.mortgage, 0)
  const totalLiabilities =
    p.liabilities.reduce((s, l) => s + l.balance, 0) +
    p.realEstate.reduce((s, x) => s + x.mortgage, 0)
  return {
    salary, passiveIncome, totalIncome, totalExpenses,
    monthlyCashFlow: totalIncome - totalExpenses,
    totalAssets, totalLiabilities,
    progress: totalExpenses > 0 ? Math.min(1, passiveIncome / totalExpenses) : 1,
    canFastTrack: passiveIncome >= totalExpenses,
  }
}

/** 領薪水：現金 += 月現金流（可為負） */
export function payday(p: Player): Player {
  return { ...p, cash: p.cash + summarize(p).monthlyCashFlow }
}

export function adjustCash(p: Player, amount: number): Player {
  return { ...p, cash: p.cash + amount }
}

export function stockHoldingCost(stocks: readonly Stock[], symbol: string) {
  const lots = stocks.filter(stock => stock.symbol === symbol)
  const shares = Math.round(lots.reduce((total, stock) => total + stock.shares, 0) * 1e6) / 1e6
  const cost = lots.reduce((total, stock) => total + stock.shares * stock.cost, 0)
  return {
    shares,
    totalCost: Math.round(cost * 100) / 100,
    averageCost: shares > 0 ? cost / shares : null,
  }
}

export function buyStock(p: Player, stock: Stock): Player {
  validateStockTrade(stock.shares, stock.cost)
  if (!Number.isFinite(stock.dividend) || stock.dividend < 0) throw new Error('股利設定無效')
  const price = Math.round(stock.shares * stock.cost * 100) / 100
  if (p.cash < price) throw new InsufficientCashError()
  const existing = p.stocks.find(s => s.symbol === stock.symbol && s.cost === stock.cost)
  const stocks = existing
    ? p.stocks.map(s => (s === existing ? { ...s, shares: s.shares + stock.shares } : s))
    : [...p.stocks, stock]
  return { ...p, cash: Math.round((p.cash - price) * 100) / 100, stocks }
}

function validateStockTrade(shares: number, price: number, fractional = false) {
  const validShares = fractional
    ? Number.isFinite(shares) && Number.isSafeInteger(Math.round(shares * 1e6)) && Math.abs(shares * 1e6 - Math.round(shares * 1e6)) < 1e-6
    : Number.isSafeInteger(shares)
  if (!validShares || shares <= 0) throw new Error(fractional ? '賣出股數必須大於零，最多六位小數' : '股數必須是正整數')
  if (!Number.isFinite(price) || price <= 0 || !Number.isSafeInteger(Math.round(shares * price * 100)))
    throw new Error('交易價格或金額無效')
}

export function sellStock(p: Player, symbol: string, shares: number, price: number): Player {
  validateStockTrade(shares, price, true)
  const owned = Math.round(p.stocks.filter(s => s.symbol === symbol).reduce((s, x) => s + x.shares, 0) * 1e6) / 1e6
  if (owned < shares)
    throw new Error('持股不足')
  let remaining = shares
  const stocks = p.stocks
    .map(s => {
      if (s.symbol !== symbol || remaining === 0) return s
      const take = Math.min(s.shares, remaining)
      remaining = Math.round((remaining - take) * 1e6) / 1e6
      return { ...s, shares: Math.round((s.shares - take) * 1e6) / 1e6 }
    })
    .filter(s => s.shares > 0)
  return { ...p, cash: Math.round((p.cash + shares * price) * 100) / 100, stocks }
}

export function buyRealEstate(p: Player, r: RealEstate): Player {
  if (p.cash < r.downPayment) throw new InsufficientCashError()
  return { ...p, cash: p.cash - r.downPayment, realEstate: [...p.realEstate, r] }
}

export function sellRealEstate(p: Player, index: number, salePrice: number): Player {
  const r = p.realEstate[index]
  if (!r) throw new Error('找不到資產')
  return {
    ...p,
    cash: p.cash + salePrice - r.mortgage,
    realEstate: p.realEstate.filter((_, i) => i !== index),
  }
}

export function haveChild(p: Player): Player {
  return { ...p, children: p.children + 1 }
}

/** 還款：扣現金並降低負債餘額，餘額歸零後月付款一併消失 */
export function repayLiability(p: Player, name: string, amount: number): Player {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6)
    throw new Error('還款金額必須大於零，最多兩位小數')
  const l = p.liabilities.find(x => x.name === name)
  if (!l) throw new Error('找不到負債')
  const pay = Math.min(amount, l.balance)
  if (p.cash < pay) throw new InsufficientCashError()
  const liabilities = p.liabilities
    .map(x => {
      if (x !== l) return x
      const balance = Math.round((x.balance - pay) * 100) / 100
      return { ...x, balance, monthlyPayment: x.name === '銀行貸款' ? Math.round(balance * 0.02) : x.monthlyPayment }
    })
    .filter(x => x.balance > 0)
  return { ...p, cash: Math.round((p.cash - pay) * 100) / 100, liabilities }
}

/** 借款：增加現金與負債，月付 = 本金 * 月利率 */
export function borrow(p: Player, amount: number, monthlyRate = 0.02): Player {
  const add = Math.round(amount * monthlyRate)
  const existing = p.liabilities.find(l => l.name === '銀行貸款')
  const liabilities = existing
    ? p.liabilities.map(l => (l === existing ? { ...l, balance: l.balance + amount, monthlyPayment: l.monthlyPayment + add } : l))
    : [...p.liabilities, { name: '銀行貸款', balance: amount, monthlyPayment: add }]
  return { ...p, cash: p.cash + amount, liabilities }
}

export function move(p: Player, steps: number): { player: Player; passedPayday: boolean } {
  const raw = p.position + steps
  return { player: { ...p, position: raw % BOARD_SIZE }, passedPayday: raw >= BOARD_SIZE }
}

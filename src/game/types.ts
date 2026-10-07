export interface Stock {
  symbol: string
  shares: number
  cost: number
  dividend: number // 每股每月股利
}

export interface RealEstate {
  name: string
  downPayment: number
  mortgage: number
  cashFlow: number // 每月淨租金現金流
}

export interface Liability {
  name: string
  balance: number
  monthlyPayment: number
}

export interface Profession {
  title: string
  salary: number
  taxes: number
  homeMortgage: number
  carLoanPayment: number
  creditCardPayment: number
  otherExpenses: number
  startCash: number
  carLoan: number
  creditCard: number
  homeMortgageBalance: number
}

export interface Player {
  name: string
  profession: Profession
  cash: number
  stocks: Stock[]
  realEstate: RealEstate[]
  liabilities: Liability[]
  children: number
  childExpensePerKid: number
  position: number
  isFastTrack: boolean
  ownerId?: string // 連線模式下操作此玩家的 clientId
}

export interface Summary {
  salary: number
  passiveIncome: number
  totalIncome: number
  totalExpenses: number
  monthlyCashFlow: number
  totalAssets: number
  totalLiabilities: number
  progress: number // 被動收入 / 總支出，0~1
  canFastTrack: boolean
}


import type { Player, RealEstate, Stock } from './types'
import { adjustCash, haveChild } from './finance'
import type { CardDeck } from './board'

export type Card =
  | { kind: 'stock'; title: string; desc: string; stock: Stock }
  | { kind: 'realEstate'; title: string; desc: string; asset: RealEstate; opportunity?: boolean }
  | { kind: 'doodad'; title: string; desc: string; cost: number }
  | { kind: 'child'; title: string; desc: string }
  | { kind: 'opportunity'; title: string; desc: string; apply: (p: Player) => Player }
  | { kind: 'extraDice'; title: string; desc: string; dice: 2 | 3 }
  | { kind: 'market' | 'bonus'; title: string; desc: string; global: boolean; apply: (p: Player) => Player }

const n = (x: number) => x.toLocaleString('zh-TW')

const stock = (title: string, symbol: string, shares: number, cost: number, dividend: number): Card => ({
  kind: 'stock', title, desc: `${n(shares)} 股，每股 ${cost} 元，每月每股配息 ${dividend} 元`,
  stock: { symbol, shares, cost, dividend },
})

const estate = (title: string, downPayment: number, mortgage: number, cashFlow: number, opportunity = false): Card => ({
  kind: 'realEstate', title,
  desc: `頭期款 ${n(downPayment)}，貸款 ${n(mortgage)}，月現金流 +${n(cashFlow)}`,
  asset: { name: title, downPayment, mortgage, cashFlow },
  ...(opportunity ? { opportunity: true } : {}),
})

const personalOpportunity = (title: string, amount: number): Card => ({
  kind: 'opportunity', title, desc: `僅目前玩家獲得一次性收入 ${n(amount)} 元；不增加每月收入`,
  apply: p => adjustCash(p, amount),
})

const doodad = (title: string, desc: string, cost: number): Card => ({ kind: 'doodad', title, desc: `${desc}（-${n(cost)}）`, cost })

const bonus = (title: string, desc: string, amount: number, global = false): Card => ({
  kind: 'bonus', title, desc, global, apply: p => adjustCash(p, amount),
})

const mapLiability = (p: Player, name: string, fn: (monthly: number) => number): Player => ({
  ...p,
  liabilities: p.liabilities.map(l => (l.name === name ? { ...l, monthlyPayment: Math.max(0, fn(l.monthlyPayment)) } : l)),
})

// 桌遊事件按購入成本結算現金，不改動歷史股價或持股。
const stockPriceShock = (p: Player, symbols: string[] | null, mult: number): Player => {
  const gain = p.stocks
    .filter(s => !symbols || symbols.includes(s.symbol))
    .reduce((t, s) => t + s.shares * s.cost * (mult - 1), 0)
  return adjustCash(p, Math.round(gain))
}

export const cards: Card[] = [
  stock('買進台積電零股', '2330', 100, 600, 10),
  stock('買進高股息 ETF 0056', '0056', 2000, 35, 0.3),
  stock('買進元大台灣50', '0050', 500, 150, 2),
  stock('買進鴻海', '2317', 1000, 110, 1.5),
  stock('買進聯發科', '2454', 100, 1000, 15),
  stock('買進中華電信', '2412', 1000, 120, 3),
  stock('買進國泰金', '2882', 2000, 55, 1),
  stock('買進長榮', '2603', 1000, 180, 0.4),

  estate('頂下連鎖手搖飲店', 300000, 0, 6000),
  estate('夜市攤位承租', 80000, 0, 2500),
  estate('投幣式自助洗衣店', 250000, 0, 5500),
  estate('無人商店加盟', 150000, 0, 4000),
  estate('雙北老舊公寓（低頭期）', 500000, 4500000, 3000),
  estate('中南部透天厝出租', 400000, 3000000, 4500),
  estate('學區旁套房一間', 600000, 5400000, 6500),

  estate('竹科旁整棟獨立套房大樓', 3000000, 27000000, 45000),
  estate('信義計畫區商辦分戶', 5000000, 20000000, 60000),
  estate('台中七期預售屋轉售', 2500000, 22500000, 30000),
  estate('高雄港區倉儲廠房', 4000000, 16000000, 55000),

  doodad('報稅季補繳', '綜合所得稅一次補繳', 30000),
  doodad('車禍與強制險自負額', '修車與醫療自付', 12000),
  doodad('人體工學椅', '犒賞自己一下', 8000),
  doodad('手機換新', '最新旗艦機', 35000),
  doodad('日本旅遊', '賞櫻五日行', 45000),
  doodad('牙齒矯正', '健保不給付', 60000),
  doodad('颱風淹水修繕', '一樓裝潢損壞', 25000),
  doodad('機車違規罰單', '紅線停車', 3600),
  doodad('追星演唱會', '搶到內場票', 18000),
  doodad('冷氣壞掉', '夏天最痛', 22000),
  { kind: 'child', title: '家裡添丁', desc: '每月支出增加 5,000' },

  { kind: 'market', title: '央行升息半碼', desc: '全體房貸月付增加 1,500', global: true, apply: p => mapLiability(p, '房貸', m => m + 1500) },
  { kind: 'market', title: '央行降息', desc: '全體房貸月付減少 1,000', global: true, apply: p => mapLiability(p, '房貸', m => m - 1000) },
  { kind: 'market', title: 'AI 狂潮', desc: '全體持有台積電、聯發科、鴻海的玩家，按相關持股購入成本 30% 獲得一次性模擬獎勵；不改股價', global: true, apply: p => stockPriceShock(p, ['2330', '2454', '2317'], 1.3) },
  { kind: 'market', title: '股災', desc: '全體玩家按持股購入成本 20% 扣除一次性模擬風險費用；不改股價', global: true, apply: p => stockPriceShock(p, null, 0.8) },
  { kind: 'market', title: '囤房稅上路', desc: '全體玩家每處房產補稅 20,000', global: true, apply: p => adjustCash(p, -20000 * p.realEstate.length) },
  bonus('年終獎金', '獲得 50,000 元', 50000),
  bonus('統一發票特獎', '獲得 100,000 元', 100000),
  bonus('政府普發現金', '全體各領 10,000 元', 10000, true),
  bonus('親友紅包', '獲得 20,000 元', 20000),
  bonus('副業接案', '週末接案收入 15,000 元', 15000),

  { kind: 'market', title: '房貸利息補貼', desc: '全體現有房貸每月付款減少 500，持續生效、最低為 0；無房貸者不受影響', global: true, apply: p => mapLiability(p, '房貸', m => m - 500) },
  { kind: 'market', title: '銀行調高信用卡利率', desc: '全體現有信用卡負債每月付款增加 500，持續生效；無信用卡負債者不受影響', global: true, apply: p => mapLiability(p, '信用卡', m => m + 500) },
  { kind: 'market', title: '租屋需求升溫', desc: '全體玩家每項房產或事業獲得一次性招租獎勵 5,000；不改每月現金流', global: true, apply: p => adjustCash(p, 5000 * p.realEstate.length) },
  { kind: 'market', title: '空租期來襲', desc: '全體玩家每項房產或事業支付一次性空租費用 5,000；不改每月現金流', global: true, apply: p => adjustCash(p, -5000 * p.realEstate.length) },
  { kind: 'market', title: '房產修繕成本上升', desc: '全體玩家每項房產或事業支付一次性修繕費用 8,000', global: true, apply: p => adjustCash(p, -8000 * p.realEstate.length) },
  { kind: 'market', title: '節能設備補助', desc: '全體玩家每項房產或事業獲得一次性設備補助 3,000', global: true, apply: p => adjustCash(p, 3000 * p.realEstate.length) },
  { kind: 'market', title: 'ETF 投資推廣', desc: '全體持有 0050、0056 的玩家，按相關持股購入成本 2% 獲得一次性模擬獎勵；非真實配息、不改股價', global: true, apply: p => stockPriceShock(p, ['0050', '0056'], 1.02) },
  { kind: 'market', title: '科技供應鏈受阻', desc: '全體持有台積電、聯發科、鴻海的玩家，按相關持股購入成本 5% 扣除一次性模擬風險費用；不改股價', global: true, apply: p => stockPriceShock(p, ['2330', '2454', '2317'], 0.95) },
  { kind: 'market', title: '航運訂單回暖', desc: '全體持有長榮的玩家，按持股購入成本 3% 獲得一次性模擬獎勵；不改股價', global: true, apply: p => stockPriceShock(p, ['2603'], 1.03) },
  { kind: 'market', title: '金融業獲利回升', desc: '全體持有國泰金的玩家，按持股購入成本 2% 獲得一次性模擬獎勵；不改股價', global: true, apply: p => stockPriceShock(p, ['2882'], 1.02) },

  personalOpportunity('專案接案機會', 18000),
  personalOpportunity('合作推薦獎勵', 12000),
  personalOpportunity('創意提案獲獎', 25000),
  personalOpportunity('技能分享講師邀約', 8000),
  estate('合夥行動咖啡攤', 60000, 0, 1500, true),
  estate('二手自動販賣機經營權', 40000, 0, 1000, true),
  { kind: 'extraDice', title: '雙骰加速機會', desc: '僅目前玩家立即追加擲 2 顆骰子，合計點數移動；經過發薪日與落點照常結算', dice: 2 },
  { kind: 'extraDice', title: '三骰衝刺機會', desc: '僅目前玩家立即追加擲 3 顆骰子，合計點數移動；經過發薪日與落點照常結算', dice: 3 },
  { kind: 'opportunity', title: '失業', desc: '僅目前玩家接下來停玩 3 回合，不能擲骰、交易或借還款；第四次回合恢復操作，薪資設定不變',
    apply: p => ({ ...p, skipTurns: 3 }) },
]

export function drawCardIndex(rng: () => number = Math.random): number {
  return Math.floor(rng() * cards.length)
}

export function drawCardForDeck(deck: CardDeck, rng: () => number = Math.random): number {
  const indices = cards.flatMap((card, index) => {
    const matches =
      deck === 'investment' ? card.kind === 'stock' || (card.kind === 'realEstate' && !card.opportunity)
      : deck === 'realEstate' ? card.kind === 'realEstate' && !card.opportunity
      : deck === 'opportunity' ? card.kind === 'opportunity' || card.kind === 'extraDice' || (card.kind === 'realEstate' && card.opportunity)
      : deck === 'expense' ? card.kind === 'doodad'
      : deck === 'family' ? card.kind === 'child'
      : card.kind === deck
    return matches ? [index] : []
  })
  if (!indices.length) throw new Error(`找不到 ${deck} 類型的事件卡`)
  return indices[Math.floor(rng() * indices.length)]
}

export function applyAutoCard(p: Player, c: Card): Player {
  if (c.kind === 'doodad') return adjustCash(p, -c.cost)
  if (c.kind === 'child') return haveChild(p)
  if (c.kind === 'market' || c.kind === 'bonus' || c.kind === 'opportunity') return c.apply(p)
  return p
}

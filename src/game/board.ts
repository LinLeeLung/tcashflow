export type CardDeck = 'investment' | 'realEstate' | 'expense' | 'family' | 'market' | 'bonus' | 'opportunity'

interface BoardSpace {
  icon: string
  name: string
  type: 'payday' | 'opportunity' | 'expense' | 'event'
  deck: CardDeck | null
}

export const spaces: BoardSpace[] = [
  { icon: '🏁', name: '發薪日', type: 'payday', deck: null },
  { icon: '📈', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '💡', name: '新點子', type: 'event', deck: 'market' },
  { icon: '🏠', name: '房產市場', type: 'opportunity', deck: 'realEstate' },
  { icon: '🛍️', name: '生活開銷', type: 'expense', deck: 'expense' },
  { icon: '🎁', name: '意外之財', type: 'payday', deck: 'bonus' },
  { icon: '📊', name: '市場消息', type: 'event', deck: 'market' },
  { icon: '🏢', name: '置產機會', type: 'opportunity', deck: 'realEstate' },
  { icon: '💳', name: '帳單日', type: 'expense', deck: 'expense' },
  { icon: '🚀', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '📰', name: '市場事件', type: 'event', deck: 'market' },
  { icon: '☕', name: '日常花費', type: 'expense', deck: 'expense' },
  { icon: '💰', name: '額外收入', type: 'payday', deck: 'bonus' },
  { icon: '📈', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '🏘️', name: '房產市場', type: 'opportunity', deck: 'realEstate' },
  { icon: '🎲', name: '機會事件', type: 'event', deck: 'opportunity' },
  { icon: '🧾', name: '突發支出', type: 'expense', deck: 'expense' },
  { icon: '✨', name: '好運降臨', type: 'payday', deck: 'bonus' },
  { icon: '💹', name: '市場消息', type: 'event', deck: 'market' },
  { icon: '🏦', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '🧸', name: '家庭生活', type: 'expense', deck: 'family' },
  { icon: '🎉', name: '額外收入', type: 'payday', deck: 'bonus' },
  { icon: '📉', name: '市場事件', type: 'event', deck: 'market' },
  { icon: '🔑', name: '新機會', type: 'opportunity', deck: 'investment' },
]

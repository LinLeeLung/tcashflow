export type CardDeck = 'investment' | 'realEstate' | 'expense' | 'family' | 'market' | 'bonus' | 'opportunity'
export type BoardIconName = 'flag' | 'chart' | 'bulb' | 'home' | 'bag' | 'gift' | 'news' | 'building'
  | 'receipt' | 'rocket' | 'coffee' | 'coins' | 'sparkle' | 'trend' | 'bank' | 'family' | 'key'

interface BoardSpace {
  icon: string
  iconName: BoardIconName
  name: string
  type: 'payday' | 'opportunity' | 'expense' | 'event'
  deck: CardDeck | null
}

export const spaces: BoardSpace[] = [
  { icon: '🏁', iconName: 'flag', name: '發薪日', type: 'payday', deck: null },
  { icon: '📈', iconName: 'chart', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '💡', iconName: 'bulb', name: '新點子', type: 'event', deck: 'market' },
  { icon: '🏠', iconName: 'home', name: '房產市場', type: 'opportunity', deck: 'realEstate' },
  { icon: '🛍️', iconName: 'bag', name: '生活開銷', type: 'expense', deck: 'expense' },
  { icon: '🎁', iconName: 'gift', name: '意外之財', type: 'payday', deck: 'bonus' },
  { icon: '📊', iconName: 'news', name: '市場消息', type: 'event', deck: 'market' },
  { icon: '🏢', iconName: 'building', name: '置產機會', type: 'opportunity', deck: 'realEstate' },
  { icon: '💳', iconName: 'receipt', name: '帳單日', type: 'expense', deck: 'expense' },
  { icon: '🚀', iconName: 'rocket', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '📰', iconName: 'news', name: '市場事件', type: 'event', deck: 'market' },
  { icon: '☕', iconName: 'coffee', name: '日常花費', type: 'expense', deck: 'expense' },
  { icon: '💰', iconName: 'coins', name: '額外收入', type: 'payday', deck: 'bonus' },
  { icon: '📈', iconName: 'trend', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '🏘️', iconName: 'home', name: '房產市場', type: 'opportunity', deck: 'realEstate' },
  { icon: '🎲', iconName: 'sparkle', name: '機會事件', type: 'event', deck: 'opportunity' },
  { icon: '🧾', iconName: 'receipt', name: '突發支出', type: 'expense', deck: 'expense' },
  { icon: '✨', iconName: 'sparkle', name: '好運降臨', type: 'payday', deck: 'bonus' },
  { icon: '💹', iconName: 'trend', name: '市場消息', type: 'event', deck: 'market' },
  { icon: '🏦', iconName: 'bank', name: '投資機會', type: 'opportunity', deck: 'investment' },
  { icon: '🧸', iconName: 'family', name: '家庭生活', type: 'expense', deck: 'family' },
  { icon: '🎉', iconName: 'gift', name: '額外收入', type: 'payday', deck: 'bonus' },
  { icon: '📉', iconName: 'trend', name: '市場事件', type: 'event', deck: 'market' },
  { icon: '🔑', iconName: 'key', name: '新機會', type: 'opportunity', deck: 'investment' },
]

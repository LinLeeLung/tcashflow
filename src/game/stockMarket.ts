import { cards } from './cards'

export interface StockQuote {
  symbol: string
  name: string
  price: number
  date: string
}

export const stockCatalogue = cards.flatMap(card => card.kind === 'stock' ? [{
  symbol: card.stock.symbol,
  name: card.title.replace(/^買進/, '').replace(/零股$/, ''),
  dividend: card.stock.dividend,
}] : [])

export function historicalDividend(symbol: string, dividend: number, date: string): number {
  if (symbol === '0050' && date >= '2025-06-18') return dividend / 4
  if (symbol === '2603' && date >= '2022-09-19') return dividend / 0.4
  return dividend
}

function parseDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{7}$/.test(value)) throw new Error('證交所報價日期格式不正確')
  const year = Number(value.slice(0, 3)) + 1911
  const month = Number(value.slice(3, 5))
  const day = Number(value.slice(5))
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
    throw new Error('證交所報價日期無效')
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseStockQuotes(data: unknown): StockQuote[] {
  if (!Array.isArray(data)) throw new Error('證交所行情資料格式不正確')
  const symbols = new Set(stockCatalogue.map(stock => stock.symbol))
  const quotes: StockQuote[] = []
  for (const row of data) {
    if (typeof row !== 'object' || row === null || !('Code' in row) || !symbols.has(row.Code)) continue
    if (!('ClosingPrice' in row) || typeof row.ClosingPrice !== 'string') throw new Error('證交所收盤價格式不正確')
    if (row.ClosingPrice.trim() === '' || row.ClosingPrice === '--' || row.ClosingPrice === '-') continue
    const price = Number(row.ClosingPrice.replace(/,/g, ''))
    if (!Number.isFinite(price) || price <= 0) throw new Error('證交所收盤價無效')
    if (!('Date' in row) || !('Name' in row) || typeof row.Name !== 'string' || !row.Name.trim())
      throw new Error('證交所報價缺少名稱或日期')
    if (quotes.some(quote => quote.symbol === row.Code)) throw new Error('證交所報價出現重複股票')
    quotes.push({ symbol: String(row.Code), name: row.Name.trim(), price, date: parseDate(row.Date) })
  }
  if (!quotes.length) throw new Error('沒有可交易的收盤價，請稍後重試')
  if (quotes.some(quote => quote.date !== quotes[0]?.date)) throw new Error('證交所報價出現混合交易日期')
  return quotes
}

export interface HistoricalQuotes {
  quotes: StockQuote[]
  date: string
  nextDate: string | null
}

export async function fetchStockQuotes(signal: AbortSignal, date: string): Promise<HistoricalQuotes> {
  let response: Response
  try {
    response = await fetch(`/api/quotes?date=${encodeURIComponent(date)}`, { signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('無法連線至行情服務，請確認遊戲伺服器已啟動，再按「重試歷史行情」。', { cause: error })
  }
  const data: unknown = await response.json()
  if (!response.ok) {
    const detail = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`
    throw new Error(`證交所歷史行情載入失敗：${detail}`)
  }
  if (typeof data !== 'object' || data === null || !('quotes' in data) || !('date' in data) || typeof data.date !== 'string'
    || !('nextDate' in data) || (data.nextDate !== null && typeof data.nextDate !== 'string'))
    throw new Error('歷史行情日期資料格式不正確')
  const quotes = parseStockQuotes(data.quotes)
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!validDate(data.date) || quotes.some(quote => quote.date !== data.date) || data.date < date || data.date > '2026-12-31'
    || (typeof data.nextDate === 'string' && (!validDate(data.nextDate) || data.nextDate <= data.date || data.nextDate > '2026-12-31')))
    throw new Error('歷史行情日期與交易日不一致')
  return { quotes, date: data.date, nextDate: data.nextDate }
}

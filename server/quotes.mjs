export const TWSE_URL = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY'
const symbols = ['2330', '0056', '0050', '2317', '2454', '2412', '2882', '2603']
const months = new Map()
const pending = new Map()

export function validateHistoryDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
  const limit = today < '2026-12-31' ? today : '2026-12-31'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== date || date < '2020-01-01' || date > limit)
    throw new Error('歷史日期必須介於 2020-01-01 與已公布的 2026 年日期之間')
  return limit
}

export async function fetchHistoryMonth(month) {
  const cached = months.get(month)
  if (cached && Date.now() < cached.expiresAt) return cached.rows
  if (pending.has(month)) return pending.get(month)
  const task = (async () => {
    const rows = []
    // Two requests at a time avoid flooding the public TWSE service.
    for (let offset = 0; offset < symbols.length; offset += 2) {
      const batch = await Promise.all(symbols.slice(offset, offset + 2).map(async symbol => {
        const url = `${TWSE_URL}?response=json&date=${month.replace('-', '')}01&stockNo=${symbol}`
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) })
        if (!response.ok) throw new Error(`TWSE HTTP ${response.status}`)
        const data = await response.json()
        if (data.stat !== 'OK' || !Array.isArray(data.fields) || !Array.isArray(data.data))
          throw new Error(`TWSE ${symbol}: ${data.stat || 'invalid response'}`)
        const dateIndex = data.fields.indexOf('日期')
        const priceIndex = data.fields.indexOf('收盤價')
        if (dateIndex < 0 || priceIndex < 0) throw new Error('TWSE missing date or closing-price column')
        const name = data.title?.match(new RegExp(`${symbol}\\s+(.+?)\\s+各日成交資訊`))?.[1]?.trim() || symbol
        return data.data.map(row => {
          const match = typeof row[dateIndex] === 'string' && row[dateIndex].match(/^(\d{3})\/(\d{2})\/(\d{2})$/)
          if (!match || typeof row[priceIndex] !== 'string') throw new Error('TWSE invalid historical row')
          return { Date: match[1] + match[2] + match[3], Code: symbol, Name: name, ClosingPrice: row[priceIndex] }
        })
      }))
      rows.push(...batch.flat())
    }
    if (!rows.length) throw new Error('TWSE returned no historical trading days')
    const currentMonth = new Date().toISOString().slice(0, 7)
    months.set(month, { rows, expiresAt: Date.now() + (month < currentMonth ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000) })
    return rows
  })()
  pending.set(month, task)
  try { return await task } finally { pending.delete(month) }
}

const isoDate = row => `${Number(row.Date.slice(0, 3)) + 1911}-${row.Date.slice(3, 5)}-${row.Date.slice(5)}`

export async function fetchTwseData(date = '2020-01-01') {
  const limit = validateHistoryDate(date)
  let month = date.slice(0, 7)
  // A market holiday may carry the next trading day into the next month.
  for (let attempt = 0; attempt < 2 && `${month}-01` <= limit; attempt++) {
    const rows = await fetchHistoryMonth(month)
    const dates = [...new Set(rows.map(isoDate))].filter(day => day <= limit).sort()
    const tradingDate = dates.find(day => day >= date)
    if (tradingDate) {
      const nextDate = dates.find(day => day > tradingDate)
        ?? new Date(Date.parse(`${tradingDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)
      return { quotes: rows.filter(row => isoDate(row) === tradingDate), date: tradingDate, nextDate: nextDate <= limit ? nextDate : null }
    }
    const next = new Date(`${month}-01T00:00:00Z`)
    next.setUTCMonth(next.getUTCMonth() + 1)
    month = next.toISOString().slice(0, 7)
  }
  throw new Error('尚無下一個已公布的歷史交易日；請稍後重試，不會循環或使用未來股價。')
}

export async function serveQuotes(response, date = '2020-01-01') {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  try { validateHistoryDate(date) } catch (error) {
    response.writeHead(400)
    response.end(JSON.stringify({ error: error.message }))
    return
  }
  try {
    const data = await fetchTwseData(date)
    response.writeHead(200)
    response.end(JSON.stringify(data))
  } catch (error) {
    console.error('Failed to fetch TWSE historical prices:', error)
    response.writeHead(502)
    response.end(JSON.stringify({ error: '歷史收盤價暫時無法取得，或尚無下一個已公布交易日，請稍後重試。' }))
  }
}

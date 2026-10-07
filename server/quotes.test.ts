import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

const monthData = (symbol: string, dates = ['109/01/02', '109/01/03', '109/01/06']) => ({
  stat: 'OK', title: `109年01月 ${symbol} 股票 各日成交資訊`,
  fields: ['日期', '收盤價'], data: dates.map((date, i) => [date, String(100 + i)]),
})

describe('historical TWSE proxy', () => {
  it('fetches and caches all eight monthly histories and selects successive trading days', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => ({
      ok: true, json: async () => monthData(new URL(url).searchParams.get('stockNo')!),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchTwseData } = await import('./quotes.mjs')
    const first = await fetchTwseData('2020-01-01')
    expect(first.date).toBe('2020-01-02')
    expect(first.nextDate).toBe('2020-01-03')
    expect(first.quotes).toHaveLength(8)
    const friday = await fetchTwseData('2020-01-03')
    expect(friday.nextDate).toBe('2020-01-06')
    const monday = await fetchTwseData('2020-01-04')
    expect(monday.date).toBe('2020-01-06')
    expect(monday.quotes[0]).toMatchObject({ ClosingPrice: '102' })
    expect(fetchMock).toHaveBeenCalledTimes(8)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('date=20200101')
  })

  it('rejects invalid dates, future dates, and dates outside 2020–2026 without fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { fetchTwseData } = await import('./quotes.mjs')
    for (const date of ['2019-12-31', '2027-01-01', '2020-02-30', 'not-a-date'])
      await expect(fetchTwseData(date)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not cache failed monthly downloads and retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 })
    vi.stubGlobal('fetch', fetchMock)
    const { fetchTwseData } = await import('./quotes.mjs')
    await expect(fetchTwseData()).rejects.toThrow('503')
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true, json: async () => monthData(new URL(url).searchParams.get('stockNo')!),
    }))
    expect((await fetchTwseData()).date).toBe('2020-01-02')
  })

  it('moves to the next month when holidays extend beyond the cached month', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
      ok: true, json: async () => monthData(new URL(url).searchParams.get('stockNo')!,
        url.includes('date=20200101') ? ['109/01/31'] : ['109/02/03', '109/02/04']),
    })))
    const { fetchTwseData } = await import('./quotes.mjs')
    const january = await fetchTwseData('2020-01-31')
    expect(january.nextDate).toBe('2020-02-01')
    expect((await fetchTwseData(january.nextDate!)).date).toBe('2020-02-03')
  })

  it('never provides quotes later than today or past the 2026 boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-12-31T04:00:00Z'))
    try {
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({
        ok: true, json: async () => monthData(new URL(url).searchParams.get('stockNo')!,
          ['115/12/31', '116/01/04']),
      })))
      const { fetchTwseData } = await import('./quotes.mjs')
      const last = await fetchTwseData('2026-12-31')
      expect(last.date).toBe('2026-12-31')
      expect(last.nextDate).toBeNull()
      expect(last.quotes).toHaveLength(8)
    } finally { vi.useRealTimers() }
  })

  it('uses only exact-day prices and omits suspended securities', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      const symbol = new URL(url).searchParams.get('stockNo')!
      return { ok: true, json: async () => monthData(symbol, symbol === '0050' ? ['109/01/02'] : ['109/01/02', '109/01/03']) }
    }))
    const { fetchTwseData } = await import('./quotes.mjs')
    const data = await fetchTwseData('2020-01-03')
    expect(data.quotes).toHaveLength(7)
    expect(data.quotes.some(row => row.Code === '0050')).toBe(false)
  })
})

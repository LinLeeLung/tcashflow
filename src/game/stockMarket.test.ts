import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStockQuotes, historicalDividend, parseStockQuotes } from './stockMarket'

const row = (Code = '2330', ClosingPrice = '1,005.50', Date = '1151006') => ({ Code, Name: '台積電', ClosingPrice, Date })

afterEach(() => vi.unstubAllGlobals())

describe('TWSE closing quotes', () => {
  it('parses prices and converts ROC dates without using catalogue prices', () => {
    expect(parseStockQuotes([row(), row('9999')])).toEqual([
      { symbol: '2330', name: '台積電', price: 1005.5, date: '2026-10-06' },
    ])
  })

  it('omits suspended quotes but rejects snapshots that mix historical dates', () => {
    expect(parseStockQuotes([row(), row('0056', '--')])).toHaveLength(1)
    expect(() => parseStockQuotes([row(), row('0050', '75', '1151005')])).toThrow('混合交易日期')
    expect(() => parseStockQuotes([row('2330', '--')])).toThrow('沒有可交易')
  })

  it('uses action-adjusted simulated dividends for purchases after corporate actions', () => {
    expect(historicalDividend('0050', 2, '2025-06-17')).toBe(2)
    expect(historicalDividend('0050', 2, '2025-06-18')).toBe(0.5)
    expect(historicalDividend('2603', 4, '2022-09-19')).toBe(10)
    expect(historicalDividend('2330', 10, '2026-01-02')).toBe(10)
  })

  it('rejects backwards dates and malformed historical cursors', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const invalid of [
      { date: '2026-10-06', nextDate: '2026-10-05' },
      { date: '2026-10-06', nextDate: '2026-02-30' },
      { date: '2026-10-05', nextDate: '2026-10-06' },
      { date: '2026-10-06', nextDate: '2027-01-01' },
    ]) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ quotes: [row()], ...invalid }) })
      await expect(fetchStockQuotes(new AbortController().signal, '2026-10-06')).rejects.toThrow()
    }
  })

  it('rejects malformed, empty, invalid, and duplicate quote data', () => {
    for (const data of [null, {}, [], [row('2330', '0')], [row('2330', 'NaN')], [row('2330', '10', '1150230')], [row(), row()]])
      expect(() => parseStockQuotes(data)).toThrow()
  })

  it('loads through the same-origin proxy and propagates HTTP errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ quotes: [row()], date: '2026-10-06', nextDate: '2026-10-07' }) })
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    expect((await fetchStockQuotes(controller.signal, '2026-10-06')).quotes).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/quotes?date=2026-10-06', { signal: controller.signal })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({ error: '暫時無法取得' }) })
    await expect(fetchStockQuotes(controller.signal, '2026-10-06')).rejects.toThrow('暫時無法取得')
  })
})

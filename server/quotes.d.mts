import type { ServerResponse } from 'node:http'

export const TWSE_URL: string
export function validateHistoryDate(date: string): string
export function fetchHistoryMonth(month: string): Promise<unknown[]>
export function fetchTwseData(date?: string): Promise<{ quotes: unknown[]; date: string; nextDate: string | null }>
export function serveQuotes(response: ServerResponse, date?: string): Promise<void>

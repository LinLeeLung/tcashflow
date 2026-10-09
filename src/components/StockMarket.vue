<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGameStore } from '../stores/game'
import { historicalDividend, stockCatalogue } from '../game/stockMarket'
import { stockHoldingCost } from '../game/finance'

const g = useGameStore()
const panel = ref<HTMLElement | null>(null)
const selectedSymbol = ref(stockCatalogue[0]?.symbol ?? '')
const quantity = ref<number | string>(1)
const selectedStock = computed(() => stockCatalogue.find(stock => stock.symbol === selectedSymbol.value))
const selectedQuote = computed(() => g.stockQuotes.find(quote => quote.symbol === selectedSymbol.value))
const shares = computed(() => Number(quantity.value))
const validQuantity = computed(() => Number.isFinite(shares.value) && shares.value > 0
  && Number.isSafeInteger(Math.round(shares.value * 1e6))
  && Math.abs(shares.value * 1e6 - Math.round(shares.value * 1e6)) < 1e-6)
const validBuyQuantity = computed(() => validQuantity.value && Number.isSafeInteger(shares.value))
const holdings = computed(() => new Map(stockCatalogue.map(stock => [
  stock.symbol, stockHoldingCost(g.player?.stocks ?? [], stock.symbol),
])))
const owned = (symbol: string) => holdings.value.get(symbol)?.shares ?? 0
const selectedHolding = computed(() => holdings.value.get(selectedSymbol.value))
const averageCost = (symbol: string) => {
  const cost = holdings.value.get(symbol)?.averageCost
  return cost == null ? '—' : '$' + money(cost)
}
const amount = computed(() => selectedQuote.value && validQuantity.value
  ? Math.round(selectedQuote.value.price * shares.value * 100) / 100 : null)
const maximumBuyShares = computed(() => {
  const cash = g.player?.cash ?? 0
  const price = selectedQuote.value?.price
  if (!price || cash <= 0) return 0
  let maximum = Math.floor((cash + 1e-8) / price)
  if (!Number.isSafeInteger(maximum)) return 0
  while (maximum > 0 && Math.round(maximum * price * 100) / 100 > cash) maximum--
  return maximum
})
const canTrade = computed(() => g.canTradeStocks && !g.quotesLoading && !g.quoteError && !!selectedQuote.value && validQuantity.value)
const money = (value: number) => value.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const quoteDate = computed(() => g.stockQuotes[0]?.date ?? '')
function buyWithAvailableCash() {
  if (!canTrade.value || maximumBuyShares.value < 1) return
  g.tradeStock('buy', selectedSymbol.value, maximumBuyShares.value)
}
const quotePrice = (symbol: string) => {
  const quote = g.stockQuotes.find(item => item.symbol === symbol)
  return quote ? '$' + money(quote.price) : '無可用報價'
}

onMounted(() => panel.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
</script>

<template>
  <section ref="panel" class="stock-market finance-panel" aria-labelledby="stock-market-title">
    <div class="stock-market-heading">
      <div><span class="eyebrow">TAIWAN STOCK MARKET</span><h2 id="stock-market-title">📈 台股交易市場</h2></div>
      <button type="button" class="market-close" @click="g.closeStockMarket()">離開市場，返回棋盤 <span aria-hidden="true">→</span></button>
    </div>
    <p v-if="g.cashRecoveryRequired" class="cash-recovery-alert" role="alert">現金危機救援模式：只能賣出持股，或到資產面板借款；現金補回正數後即可恢復正常遊戲。</p>
    <p class="market-description">自由玩法 · 目前玩家：{{ g.player?.name }} · 自己的回合可在擲骰前後買賣，離開後可再次進入。買進 1 股起；減資後的小數持股也可賣出。離開市場後才能擲骰或結束回合。</p>
    <div class="market-source">
      <span>資料來源：台灣證券交易所 · 第 {{ g.round }} 輪 · {{ quoteDate ? `${quoteDate} 歷史收盤價` : '等待歷史行情' }}</span>
    </div>
    <p class="market-disclaimer">這是歷史行情模擬，非真實下單。從 2020 年開始，每完成一輪前進一個交易日；同輪共用價格、不允許刷新換價。0050 分割會同步調整持股及成本。股利為遊戲設定，不計交易費用與稅。</p>
    <p v-if="g.quotesLoading" class="market-loading" role="status">正在取得證交所每日收盤價…</p>
    <div v-if="g.quoteError" class="market-error" role="alert">{{ g.quoteError }}（目前不開放交易；可重試或離開市場。）</div>
    <div class="market-grid">
      <div class="market-table-wrap">
        <table class="market-table">
          <caption class="sr-only">股票收盤價、目前玩家持股與平均購入成本，點選股票以交易</caption>
          <thead><tr><th scope="col">股票 / ETF</th><th scope="col">收盤價</th><th scope="col">持有股數</th><th scope="col">平均成本 / 股</th></tr></thead>
          <tbody>
            <tr v-for="stock in stockCatalogue" :key="stock.symbol" :class="{ 'market-selected': selectedSymbol === stock.symbol }">
              <th scope="row"><button class="stock-select" :aria-pressed="selectedSymbol === stock.symbol" @click="selectedSymbol = stock.symbol"><b>{{ stock.symbol }}</b><span>{{ g.stockQuotes.find(quote => quote.symbol === stock.symbol)?.name ?? stock.name }}</span></button></th>
              <td>{{ quotePrice(stock.symbol) }}</td>
              <td>{{ owned(stock.symbol).toLocaleString('zh-TW') }}</td>
              <td>{{ averageCost(stock.symbol) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="market-order">
        <h3>{{ selectedQuote?.name ?? selectedStock?.name }} <small>{{ selectedSymbol }}</small></h3>
        <div class="market-balance">
          <span>可用現金</span>
          <div class="market-balance-actions">
            <strong>${{ money(g.player?.cash ?? 0) }}</strong>
            <button v-if="!g.cashRecoveryRequired" class="market-all-in" :disabled="!canTrade || maximumBuyShares < 1" :aria-label="`使用現有現金全數買入，最多 ${maximumBuyShares} 股`" @click="buyWithAvailableCash">全數買入</button>
          </div>
        </div>
        <label class="field-label" for="stock-quantity">股數（買進正整數／賣出可含小數）
          <input id="stock-quantity" v-model="quantity" type="number" min="0.000001" step="0.000001" inputmode="decimal" class="form-field" :aria-invalid="!validQuantity" />
        </label>
        <p v-if="!validQuantity" class="market-error" role="alert">股數須大於零，最多六位小數。</p>
        <p v-else-if="!validBuyQuantity" class="market-disclaimer">小數股數僅可賣出，買進請輸入正整數。</p>
        <div class="market-estimate"><span>交易金額</span><b>{{ amount === null ? '—' : '$' + money(amount) }}</b></div>
        <div class="market-estimate"><span>目前持有</span><b>{{ owned(selectedSymbol) }} 股</b></div>
        <div class="market-estimate"><span>平均購入成本 / 股</span><b>{{ averageCost(selectedSymbol) }}</b></div>
        <div class="market-estimate"><span>持股總成本</span><b>${{ money(selectedHolding?.totalCost ?? 0) }}</b></div>
        <p class="market-disclaimer">成本只計目前仍持有的股票；分批買進按股數加權，賣出依先買先賣扣除成本。分割及減資會調整成本，不含股利、消息卡現金收支或交易費用。</p>
        <p class="market-dividend">遊戲每股每月股利：${{ money(historicalDividend(selectedSymbol, selectedStock?.dividend ?? 0, g.marketDate)) }}（模擬值）</p>
        <div class="market-trade-actions">
          <button v-if="!g.cashRecoveryRequired" class="event-accept" :disabled="!canTrade || !validBuyQuantity || amount === null || amount > (g.player?.cash ?? 0)" @click="g.tradeStock('buy', selectedSymbol, shares)">買進</button>
          <button class="event-decline" :disabled="!canTrade || shares > owned(selectedSymbol)" @click="g.tradeStock('sell', selectedSymbol, shares)">賣出</button>
        </div>
        <p v-if="amount !== null && amount > (g.player?.cash ?? 0)" class="market-error">現金不足，請調整股數或使用資產面板借款。</p>
        <p v-if="validQuantity && shares > owned(selectedSymbol)" class="market-disclaimer">目前持股不足以賣出 {{ shares }} 股。</p>
        <p v-if="g.tradeMessage" class="market-result" :class="{ 'market-error': g.tradeMessage.startsWith('⚠') }" role="status">{{ g.tradeMessage }}</p>
      </div>
    </div>
  </section>
</template>

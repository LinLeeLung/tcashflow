import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'
import { serveQuotes } from './server/quotes.mjs'

export default defineConfig({
  plugins: [vue(), tailwindcss(), {
    name: 'twse-quotes',
    configureServer(server) {
      server.middlewares.use('/api/quotes', (request, response) => {
        void serveQuotes(response, new URL(request.url || '/', 'http://localhost').searchParams.get('date') || '2020-01-01')
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/quotes', (request, response) => {
        void serveQuotes(response, new URL(request.url || '/', 'http://localhost').searchParams.get('date') || '2020-01-01')
      })
    },
  }],
  test: { environment: 'node' },
})

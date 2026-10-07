import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveQuotes } from './server/quotes.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'dist')
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '127.0.0.1'
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    response.end('Method not allowed')
    return
  }
  let path
  try {
    path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  } catch {
    response.writeHead(400)
    response.end('Invalid URL')
    return
  }
  if (path === '/api/quotes') {
    await serveQuotes(response, new URL(request.url, 'http://localhost').searchParams.get('date') || '2020-01-01')
    return
  }
  const file = resolve(root, `.${path === '/' ? '/index.html' : path}`)
  if (!file.startsWith(root + sep)) {
    response.writeHead(403)
    response.end('Forbidden')
    return
  }
  try {
    const data = await readFile(file)
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    })
    response.end(request.method === 'HEAD' ? undefined : data)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') {
      response.writeHead(404)
      response.end('Not found; run npm run build before npm start.')
    } else {
      console.error('Failed to serve application:', error)
      response.writeHead(500)
      response.end('Internal server error')
    }
  }
})

server.listen(port, host, () => console.log(`CASHFLOW listening on http://${host}:${port}`))

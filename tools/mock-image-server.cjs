// 本地模拟"云存储图床"，用来在不买云服务的情况下先验证云端图片方案。
//
// 用法：
//   node tools/mock-image-server.cjs
// 然后把 utils/config.js 的 imageBase 改成 http://127.0.0.1:8899/covers/
// 并在微信开发者工具里勾选「不校验合法域名」。
//
// 说明：已有本地封面的地点返回真实图片；没有封面的返回一张按 id 循环选的已有封面，
// 只为验证"每张图都能从网络拿到"，不代表真实景点照片。
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const COVERS = path.join(ROOT, 'assets', 'covers')
const PLACES = require('../utils/data').PLACES

// 用 id 做个稳定散列，让不同地点落到不同的占位图，演示时更容易分辨。
function pickFallback(id) {
  if (!fs.existsSync(COVERS)) return null
  const files = fs.readdirSync(COVERS).filter(f => /\.jpe?g$/i.test(f)).sort()
  if (!files.length) return null
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 9973
  return path.join(COVERS, files[h % files.length])
}

function resolveCover(id) {
  const direct = path.join(COVERS, id + '.jpg')
  if (fs.existsSync(direct)) return { file: direct, real: true }
  const fallback = pickFallback(id)
  return fallback ? { file: fallback, real: false } : null
}

function createServer() {
  return http.createServer((req, res) => {
    const url = (req.url || '').split('?')[0]
    if (url === '/' || url === '/index.html') {
      const rows = PLACES.map(p => {
        const r = resolveCover(p.id)
        return `<li>${p.id} ${r ? (r.real ? '真实封面' : '占位图') : '缺失'}</li>`
      }).join('')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>模拟图床</title>
<h3>模拟图床已启动 · 共 ${PLACES.length} 个地点</h3>
<p>把 <code>utils/config.js</code> 的 imageBase 设为 <code>http://127.0.0.1:8899/covers/</code></p>
<ul>${rows}</ul>`)
      return
    }
    const match = /^\/covers\/([a-z0-9]+)\.jpg$/.exec(url)
    if (!match) { res.writeHead(404); return res.end('not found') }
    const found = resolveCover(match[1])
    if (!found) { res.writeHead(404); return res.end('no image') }
    const buf = fs.readFileSync(found.file)
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store'
    })
    res.end(buf)
  })
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 8899
  const real = PLACES.filter(p => fs.existsSync(path.join(COVERS, p.id + '.jpg'))).length
  createServer().listen(port, '127.0.0.1', () => {
    console.log('模拟图床已启动：http://127.0.0.1:' + port + '/covers/')
    console.log('共 ' + PLACES.length + ' 个地点：' + real + ' 张真实封面，' + (PLACES.length - real) + ' 张占位图')
    console.log('下一步：把 utils/config.js 的 imageBase 改成 http://127.0.0.1:' + port + '/covers/')
    console.log('并在微信开发者工具「本地设置」勾选「不校验合法域名」。')
  })
}

module.exports = { createServer, resolveCover }

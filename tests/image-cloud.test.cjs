// 这组用例把图片地址切到云端，验证"所有景点都能从网络取图"。
// 必须在 require utils/data 之前设置，因为 data.js 装载时就会算好 photo。
process.env.HEYUAN_IMAGE_BASE = 'https://cdn.example.com/covers/'

const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const data = require('../utils/data')
const { createServer } = require('../tools/mock-image-server.cjs')

const BASE = 'https://cdn.example.com/covers/'

test('配置云端地址后，每个景点都有网络封面（不再是 27 个）', () => {
  const withPhoto = data.PLACES.filter(p => p.photo)
  assert.equal(withPhoto.length, data.PLACES.length, '云端模式下应全部有封面')
  withPhoto.forEach(p => assert.ok(p.photo.startsWith(BASE), p.id + ' -> ' + p.photo))
  assert.ok(withPhoto.every(p => p.photo === BASE + p.id + '.jpg'), '文件名约定为 <id>.jpg')
})

test('封面全部搬到云端，包内 /assets/covers 不再被引用', () => {
  data.PLACES.forEach(p => {
    assert.ok(p.images.length >= 1, p.id + ' 应至少有一张')
    p.images.forEach(img => assert.ok(!img.file.startsWith('/assets/covers/'), p.id + ' 仍引用主包封面：' + img.file))
  })
  // 分包副图允许保留本地（不占主包体积）
  const sub = data.PLACES.flatMap(p => p.images).filter(i => i.file.startsWith('/pkg-'))
  assert.ok(sub.length > 0, '分包副图应保留')
})

test('模拟图床能给每个地点返回可用的 JPEG', async () => {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const get = url => new Promise((resolve, reject) => {
    http.get(url, res => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], bytes: Buffer.concat(chunks).length }))
    }).on('error', reject)
  })
  try {
    for (const place of data.PLACES.slice(0, 6)) {
      const res = await get('http://127.0.0.1:' + port + '/covers/' + place.id + '.jpg')
      assert.equal(res.status, 200, place.id)
      assert.match(res.type, /image\/jpeg/, place.id)
      assert.ok(res.bytes > 1000, place.id + ' 返回内容过小')
    }
    const missing = await get('http://127.0.0.1:' + port + '/nope')
    assert.equal(missing.status, 404)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
})

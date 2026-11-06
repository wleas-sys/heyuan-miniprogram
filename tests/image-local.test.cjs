const test = require('node:test')
const assert = require('node:assert/strict')
const data = require('../utils/data')

test('默认不配置云端地址时，图片仍走包内本地文件', () => {
  const withPhoto = data.PLACES.filter(p => p.photo)
  assert.equal(withPhoto.length, 27, '只有登记过封面图的 27 个地点有 photo')
  withPhoto.forEach(p => assert.ok(p.photo.startsWith('/assets/covers/'), p.id))
  assert.equal(data.PLACES.filter(p => /^https?:/.test(p.photo)).length, 0, '默认不应出现网络地址')
})

test('默认模式下图集全部指向包内文件，主包与分包行为不变', () => {
  data.PLACES.forEach(p => p.images.forEach(img => {
    assert.ok(img.file.startsWith('/'), p.id + ':' + img.file)
    assert.ok(!/^https?:/.test(img.file), p.id + ' 不应出现网络地址：' + img.file)
  }))
  // 封面在主包，副图在各自分包
  data.PLACES.filter(p => p.images.length).forEach(p => assert.ok(p.images[0].file.startsWith('/assets/covers/'), p.id))
})

const test = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./harness.cjs')
const planner = require('../utils/planner')

function makeAction(h, type) {
  if (type === 'route') {
    const page = h.page('route-detail', { id: 'city' })
    return { page, run: () => page.use() }
  }
  if (type === 'result') {
    const page = h.page('plan-result', { s: planner.encode(planner.fromRoute('city')) })
    return { page, run: () => page.edit() }
  }
  const page = h.page('plan-create')
  page.generate()
  return { page, run: () => page.adopt(h.event({ id: page.data.results[0].id })) }
}
function failNextDraftRead(h, key) {
  const original = h.wx.getStorageSync
  let pending = true
  h.wx.getStorageSync = function (name) {
    if (name === key && pending) { pending = false; throw new Error('瞬时读取失败') }
    return original(name)
  }
}

test('严格读取只在确实没有草稿时返回空草稿；读取错误与损坏数据均抛错', () => {
  const h = createHarness(), storage = h.module('utils/storage.js')
  assert.equal(storage.getDraft(true).days[0].length, 0)
  h.failures.read = true
  assert.throws(() => storage.getDraft(true), /读取本机数据失败/)
  assert.equal(storage.getDraft().days[0].length, 0)
  h.failures.read = false
  h.memory[storage.KEYS.draft] = { schema: 13, days: 'broken' }
  assert.throws(() => storage.getDraft(true), /本机数据格式异常/)
  assert.equal(h.memory[storage.KEYS.draft].days, 'broken')
})

for (const type of ['route', 'result', 'adopt']) {
  test(type + ' 遇单次读取失败也不覆盖有效草稿；恢复后仍需确认', () => {
    const h = createHarness(), storage = h.module('utils/storage.js')
    const original = planner.fromRoute('weekend')
    original.title = '保留这份两日行程'; original.meal = 88; original.timing.date = '2026-11-07'
    storage.setDraft(original)
    const before = JSON.stringify(h.memory[storage.KEYS.draft])
    const action = makeAction(h, type)
    failNextDraftRead(h, storage.KEYS.draft)
    action.run()
    assert.equal(JSON.stringify(h.memory[storage.KEYS.draft]), before)
    assert.equal(h.count('showModal'), 0)
    assert.equal(h.count('switchTab'), 0)
    assert.match(h.last('showToast').title, /读取本机数据失败/)
    if (type === 'adopt') assert.equal(action.page.data.adopting, false)
    h.replies.push({ confirm: false })
    action.run()
    assert.equal(h.count('showModal'), 1)
    assert.equal(JSON.stringify(h.memory[storage.KEYS.draft]), before)
  })

  test(type + ' 遇损坏草稿先征询、备份后才重建', () => {
    const h = createHarness(), storage = h.module('utils/storage.js')
    h.memory[storage.KEYS.draft] = { schema: 13, days: 'broken', title: '保留原始损坏草稿' }
    const before = JSON.stringify(h.memory[storage.KEYS.draft])
    const action = makeAction(h, type)
    h.replies.push({ confirm: false })
    action.run()
    assert.equal(h.count('showModal'), 1, '要给出可执行的恢复路径')
    assert.equal(JSON.stringify(h.memory[storage.KEYS.draft]), before, '未确认前不得动原数据')
    assert.equal(h.count('switchTab'), 0)
    if (type === 'adopt') assert.equal(action.page.data.adopting, false)

    const retry = makeAction(h, type)
    h.replies.push({ confirm: true })
    retry.run()
    assert.ok(Array.isArray(h.memory['heyuan.v13.draftBackups']), '要先备份原数据')
    assert.equal(h.memory['heyuan.v13.draftBackups'][0].raw.days, 'broken')
    assert.notEqual(JSON.stringify(h.memory[storage.KEYS.draft]), before, '确认后才重建草稿')
    assert.equal(h.count('switchTab'), 1, '重建后进入编辑')
  })

  test(type + ' 首次使用可直接写入；确认后的写入失败不伪报成功', () => {
    const h = createHarness(), storage = h.module('utils/storage.js')
    const first = makeAction(h, type)
    first.run()
    assert.ok(storage.getDraft(true).days.some(day => day.length))
    assert.equal(h.count('showModal'), 0)
    const before = JSON.stringify(h.memory[storage.KEYS.draft])
    const retry = makeAction(h, type === 'route' ? 'adopt' : 'route')
    h.failures.write = true
    h.replies.push({ confirm: true })
    retry.run()
    assert.equal(JSON.stringify(h.memory[storage.KEYS.draft]), before)
    assert.equal(h.count('switchTab'), 1)
    assert.match(h.last('showToast').title, /存储空间不足/)
  })
}


test('确认重建先备份原始损坏草稿，再保存新草稿', () => {
  const raw = { schema: 13, days: 'broken', title: '保留我', extra: { untouched: true } }
  const h = createHarness({ 'heyuan.v13.draft': raw }), storage = h.module('utils/storage.js')
  const recovered = storage.recoverDraft()
  assert.equal(recovered.days[0].length, 0)
  assert.equal(storage.getDraft(true).id, recovered.id)
  const backups = h.memory['heyuan.v13.draftBackups']
  assert.equal(backups.length, 1)
  assert.deepEqual(backups[0].raw, raw)
  assert.ok(Number.isFinite(backups[0].createdAt))
})

test('重建遇读取失败、备份写入失败均不改原草稿', () => {
  for (const failure of ['read', 'write']) {
    const raw = { damaged: true }
    const h = createHarness({ 'heyuan.v13.draft': raw }), storage = h.module('utils/storage.js')
    h.failures[failure] = true
    assert.throws(() => storage.recoverDraft())
    assert.deepEqual(h.memory[storage.KEYS.draft], raw)
    assert.equal(h.memory['heyuan.v13.draftBackups'], undefined)
  }
})

test('新草稿写入失败时原草稿和已成功备份均保留', () => {
  const raw = { damaged: true }
  const h = createHarness({ 'heyuan.v13.draft': raw }), storage = h.module('utils/storage.js')
  const originalWrite = h.wx.setStorageSync
  h.wx.setStorageSync = (key, value) => { if (key === storage.KEYS.draft) throw new Error('草稿写入失败'); originalWrite(key, value) }
  assert.throws(() => storage.recoverDraft(), /草稿写入失败/)
  assert.deepEqual(h.memory[storage.KEYS.draft], raw)
  assert.deepEqual(h.memory['heyuan.v13.draftBackups'][0].raw, raw)
})

test('备份损坏或已达 5 份时拒绝重建，绝不自动清除旧备份', () => {
  for (const backups of [{ corrupted: true }, Array.from({ length: 5 }, (_, i) => ({ createdAt: i, raw: { n: i } }))]) {
    const raw = { damaged: true }
    const h = createHarness({ 'heyuan.v13.draft': raw, 'heyuan.v13.draftBackups': backups }), storage = h.module('utils/storage.js')
    assert.throws(() => storage.recoverDraft(), /备份/)
    assert.deepEqual(h.memory[storage.KEYS.draft], raw)
    assert.deepEqual(h.memory['heyuan.v13.draftBackups'], backups)
  }
})

test('第 5 份备份可正常写入，原有备份内容不变', () => {
  const raw = '原始损坏字符串', old = Array.from({ length: 4 }, (_, i) => ({ createdAt: i, raw: { n: i } }))
  const h = createHarness({ 'heyuan.v13.draft': raw, 'heyuan.v13.draftBackups': old }), storage = h.module('utils/storage.js')
  storage.recoverDraft()
  const backups = h.memory['heyuan.v13.draftBackups']
  assert.equal(backups.length, 5)
  assert.equal(backups[0].raw, raw)
  assert.deepEqual(backups.slice(1), old)
})

test('确实没有草稿时可新建，不制造空备份', () => {
  const h = createHarness(), storage = h.module('utils/storage.js')
  const recovered = storage.recoverDraft()
  assert.equal(storage.getDraft(true).id, recovered.id)
  assert.equal(h.memory['heyuan.v13.draftBackups'], undefined)
})


test('新草稿写入反复失败只保留同一份原始备份，恢复后仍可完成重建', () => {
  const raw = { schema: 13, days: 'broken', title: '同一份待恢复草稿', nested: { keep: [1, 2] } }
  const h = createHarness({ 'heyuan.v13.draft': raw }), storage = h.module('utils/storage.js')
  const originalWrite = h.wx.setStorageSync
  let failDraft = true, backupWrites = 0
  h.wx.setStorageSync = (key, value) => {
    if (key === storage.KEYS.draft && failDraft) throw new Error('第二步草稿写入失败')
    if (key === 'heyuan.v13.draftBackups') backupWrites++
    originalWrite(key, value)
  }
  for (let i = 0; i < 7; i++) {
    assert.throws(() => storage.recoverDraft(), /第二步草稿写入失败/)
    assert.deepEqual(h.memory[storage.KEYS.draft], raw)
    assert.equal(h.memory['heyuan.v13.draftBackups'].length, 1)
    assert.deepEqual(h.memory['heyuan.v13.draftBackups'][0].raw, raw)
  }
  assert.equal(backupWrites, 1)
  const backupBefore = JSON.stringify(h.memory['heyuan.v13.draftBackups'])
  failDraft = false
  const recovered = storage.recoverDraft()
  assert.equal(storage.getDraft(true).id, recovered.id)
  assert.equal(recovered.days[0].length, 0)
  assert.equal(backupWrites, 1)
  assert.equal(JSON.stringify(h.memory['heyuan.v13.draftBackups']), backupBefore)
})

test('备份已满但其中包含当前原始草稿时直接复用，不受数量限制阻断', () => {
  const raw = { damaged: true, retained: '当前草稿' }
  const backups = Array.from({ length: 4 }, (_, i) => ({ createdAt: i, raw: { older: i } }))
  backups.push({ createdAt: 10, raw })
  const h = createHarness({ 'heyuan.v13.draft': raw, 'heyuan.v13.draftBackups': backups }), storage = h.module('utils/storage.js')
  const originalWrite = h.wx.setStorageSync
  h.wx.setStorageSync = (key, value) => {
    if (key === 'heyuan.v13.draftBackups') throw new Error('不应重写既有备份')
    originalWrite(key, value)
  }
  storage.recoverDraft()
  assert.equal(storage.getDraft(true).days[0].length, 0)
  assert.deepEqual(h.memory['heyuan.v13.draftBackups'], backups)
})

test('旧草稿引用了已下线地点时，保留其余地点并自动修复', () => {
  const h = createHarness(), storage = h.module('utils/storage.js')
  const plan = h.module('utils/planner.js').fromRoute('city')
  plan.days[0].push('removed-place')
  h.memory[storage.KEYS.draft] = plan
  const fixed = storage.getDraft(true)
  assert.equal(JSON.stringify(fixed.days[0]), JSON.stringify(plan.days[0].filter(id => id !== 'removed-place')))
  assert.ok(!JSON.stringify(h.memory[storage.KEYS.draft]).includes('removed-place'), '修复结果要写回')
})

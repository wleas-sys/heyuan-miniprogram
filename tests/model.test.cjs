const test = require('node:test')
const assert = require('node:assert/strict')
const model = require('../utils/model')
const planning = require('../utils/planning')
const { getPlace } = require('../utils/data')
const { createHarness } = require('./harness.cjs')

test('特征权重合计为 1，单点得分落在 0–100', () => {
  const sum = Object.values(model.WEIGHTS).reduce((n, value) => n + value, 0)
  assert.ok(Math.abs(sum - 1) < 1e-9)
  const ctx = model.context({ region: '源城区', interest: '人文', crowd: 'family' })
  for (const id of ['konglong', 'wanlvhu', 'xiankeng']) {
    const score = model.placeScore(getPlace(id), ctx).score
    assert.ok(score >= 0 && score <= 100, id + ':' + score)
  }
})

test('兴趣与地域同时命中的地点得分更高', () => {
  const ctx = model.context({ region: '源城区', interest: '人文', crowd: 'family' })
  const konglong = model.placeScore(getPlace('konglong'), ctx).score
  const huoshan = model.placeScore(getPlace('huoshan'), ctx).score
  assert.ok(konglong > huoshan, konglong + ' 应高于 ' + huoshan)
})

test('同行的人只影响强度与偏好，不改变分数上限', () => {
  const friends = model.context({ crowd: 'friends' })
  const parents = model.context({ crowd: 'parents' })
  const huoshan = getPlace('huoshan')
  assert.ok(model.placeScore(huoshan, friends).score > model.placeScore(huoshan, parents).score)
  const konglong = getPlace('konglong')
  assert.ok(model.placeScore(konglong, parents).score > model.placeScore(konglong, friends).score)
})

test('新鲜度随记录次数衰减；去过两次的地点不再排第一', () => {
  const fresh = model.context({ region: '东源县', interest: '山水' })
  const seen = model.context({ region: '东源县', interest: '山水', history: { wanlvhu: 2 } })
  const before = model.placeScore(getPlace('wanlvhu'), fresh).score
  const after = model.placeScore(getPlace('wanlvhu'), seen).score
  assert.ok(after < before - 5, after + ' 应明显低于 ' + before)
  const results = planning.recommend({ region: '东源县', interest: '山水', history: { wanlvhu: 2 } })
  assert.ok(results.length)
  assert.notEqual(results[0].plan.days[0][0], 'wanlvhu')
})

test('推荐结果带可读理由，且不破坏原有硬约束', () => {
  const results = planning.recommend({ days: 2, region: '东源县', interest: '山水', crowd: 'family' })
  assert.ok(results.length)
  for (const item of results) {
    assert.ok(item.reasons.length >= 2 && item.reasons.length <= 4)
    for (const reason of item.reasons) {
      assert.equal(typeof reason.text, 'string')
      assert.ok(reason.text.length > 0)
      assert.ok(Number.isInteger(reason.value))
    }
    assert.match(item.scoreText, /^\d+$/)
    item.plan.days.flat().forEach(id => assert.equal(getPlace(id).region, '东源县'))
    item.plan.days.flat().forEach(id => assert.equal(getPlace(id).category, '山水'))
  }
})

test('跨区行程会给出扣分说明，同区行程不会', () => {
  const same = model.context({ region: '源城区', interest: '人文' })
  const plan = { days: [['konglong'], ['guifengta']] }
  assert.equal(model.evaluate(plan, same).reasons.some(item => item.value < 0), false)
  const cross = { days: [['konglong'], ['huoshan']] }
  const result = model.evaluate(cross, same)
  assert.ok(result.reasons.some(item => item.key === 'cross' && item.value < 0))
})

test('条件页切换同行人会重新出方案，采用后写入本机偏好记录', () => {
  const h = createHarness()
  const page = h.page('plan-create')
  page.chooseCrowd(h.event({ value: 'family' }))
  assert.equal(page.data.form.crowd, 'family')
  assert.equal(page.data.results.length, 0)
  page.generate()
  assert.ok(page.data.results.length)
  assert.ok(page.data.results[0].reasons.length >= 2)
  assert.match(page.data.results[0].scoreText, /^\d+$/)
  page.adopt(h.event({ id: page.data.results[0].id }))
  const counts = h.module('utils/events.js').counts()
  assert.ok(Object.keys(counts).length > 0)
})

test('行为记录只保留允许的事件，可增可减且可清空', () => {
  const h = createHarness()
  const events = h.module('utils/events.js')
  events.record('favorite', 'wanlvhu')
  events.record('add', 'wanlvhu')
  events.record('remove', 'wanlvhu')
  events.record('weird', 'wanlvhu')
  events.record('add', '')
  // 记录来自 vm 沙箱，用同样的普通对象比较，避免跨 context 原型差异。
  const snapshot = () => Object.assign({}, events.counts())
  assert.deepEqual(snapshot(), { wanlvhu: 1 })
  events.record('unfavorite', 'wanlvhu')
  assert.deepEqual(snapshot(), { wanlvhu: 0 })
  assert.equal(events.read().length, 4)
  events.clear()
  assert.deepEqual(snapshot(), {})
})

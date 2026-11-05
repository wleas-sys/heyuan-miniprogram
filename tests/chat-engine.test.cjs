const test = require('node:test')
const assert = require('node:assert/strict')
const engine = require('../utils/chat-engine')

const FORM = { days: 0, date: '', mode: 'drive', pace: 'relaxed', interest: '全部', region: '全部', crowd: 'friends' }

test('一句话里同时听懂天数、同行人、兴趣', () => {
  const patch = engine.parse('两天，带爸妈看温泉')
  assert.equal(patch.days, 2)
  assert.equal(patch.crowd, 'parents')
  assert.equal(patch.interest, '温泉')
})

test('口语化的天数都能认：一日 / 周末 / 三四天 / 一周', () => {
  assert.equal(engine.parse('一日游随便逛逛').days, 1)
  assert.equal(engine.parse('周末去转转').days, 2)
  assert.equal(engine.parse('三天时间').days, 3)
  assert.equal(engine.parse('四到五天都行').days, 5)
  assert.equal(engine.parse('一周太久了').days, 5)
})

test('区县与交通方式能从地名、口语里推出来', () => {
  assert.equal(engine.parse('想去万绿湖').region, '东源县')
  assert.equal(engine.parse('佗城和霍山').region, '龙川县')
  assert.equal(engine.parse('没有车').mode, 'transit')
  assert.equal(engine.parse('我们自己开车').mode, 'drive')
})

test('并列兴趣按更主动的玩法定调，不会两个都塞进去', () => {
  const patch = engine.parse('三天，想看山水和古村')
  assert.equal(patch.days, 3)
  assert.equal(patch.interest, '山水')
})

test('没说天数时先追问，不替用户猜', () => {
  const form = Object.assign({}, FORM)
  const patch = engine.parse('带爸妈泡温泉')
  const said = engine.reply(form, patch, 0)
  assert.match(said.text, /几天/)
  assert.ok(said.chips.length > 0)
})

test('已经有天数才出方案，并如实说明哪些条件是默认补的', () => {
  const form = Object.assign({}, FORM, { days: 2, crowd: 'parents', interest: '温泉' })
  const patch = { days: 2, crowd: 'parents', interest: '温泉' }
  const said = engine.reply(form, patch, 3)
  assert.match(said.text, /2 天/)
  assert.match(said.text, /温泉/)
  assert.match(said.text, /3 个方案/)
  assert.match(said.text, /自驾/)   // 用户没提交通，必须明说是默认
  assert.match(said.text, /轻松/)   // 用户没提节奏，同样明说
})

test('排不出方案时不说"没有"，而是给可点的下一步', () => {
  const form = Object.assign({}, FORM, { days: 3, mode: 'walk' })
  const said = engine.reply(form, { days: 3, mode: 'walk' }, 0)
  assert.match(said.text, /排不出|放宽/)
  assert.ok(said.chips.includes('全河源都看看'))
})

test('没给任何信息时，问候语必须有可点的例子，不能只留一个空白输入框', () => {
  const g = engine.greeting()
  assert.ok(g.text.length > 0)
  assert.ok(g.chips.length >= 3)
})

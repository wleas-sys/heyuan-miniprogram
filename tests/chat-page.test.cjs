const test = require('node:test')
const assert = require('node:assert/strict')
const { createHarness } = require('./harness.cjs')

test('点「发送」按钮也能发出去（tap 事件没有 detail.value）', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()
  page.onInput({ detail: { value: '两天带爸妈看温泉' } })
  page.submit({ detail: {} })          // 模拟按钮 tap：没有 value
  assert.equal(page.data.messages.length, 3, '应发出用户消息并收到回复')
  assert.equal(page.data.messages[1].role, 'user')
  assert.equal(page.data.messages[1].text, '两天带爸妈看温泉')
  assert.equal(page.data.input, '', '发出后应清空输入框')
})

test('输入框回车（confirm 带 value）也能发', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()
  page.submit({ detail: { value: '三日游，想看山水' } })
  assert.equal(page.data.messages.at(-2).text, '三日游，想看山水')
})

test('发送后 busy 必须回到 false，否则按钮会一直置灰', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()
  page.send('两天')
  assert.equal(page.data.busy, false)
})

test('打开对话页先有一句 AI 开场和可点的例子，不是空白输入框', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()
  assert.equal(page.data.messages.length, 1)
  assert.equal(page.data.messages[0].role, 'ai')
  assert.ok(page.data.messages[0].text.length > 0)
  assert.ok(page.data.chips.length >= 3)
})

test('说一句「两天，带爸妈看温泉」就能出方案卡片，并能直接采用', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()

  page.send('两天，带爸妈看温泉')

  const msgs = page.data.messages
  assert.equal(msgs.length, 3, '应有：开场 + 我的话 + AI 回复')
  assert.equal(msgs[1].role, 'user')
  assert.equal(msgs[1].text, '两天，带爸妈看温泉')

  const reply = msgs[2]
  assert.equal(reply.role, 'ai')
  assert.match(reply.text, /2 天/)
  assert.ok(reply.cards.length >= 1, '条件够了就该直接给方案，而不是再问一轮')

  // 采用第一个方案：应写入草稿并进入行程编辑
  const cardId = reply.cards[0].id
  page.use({ currentTarget: { dataset: { id: cardId } } })
  const switched = h.last('switchTab')
  assert.ok(switched, '采用后必须跳到行程页')
  assert.equal(switched.url, '/pages/plan/plan')
})

test('只说兴趣不说天数时先追问，不擅自替用户定天数', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()
  page.send('带爸妈泡温泉')
  const reply = page.data.messages.at(-1)
  assert.equal(reply.role, 'ai')
  assert.match(reply.text, /几天/)
  assert.equal(reply.cards.length, 0)
  assert.ok(reply.chips.length > 0)
})

test('排不出方案时给可点的下一步，而不是把用户堵死', () => {
  const h = createHarness()
  const page = h.load('pages/chat/chat.js')
  page.onLoad()
  page.send('三天，步行')
  const reply = page.data.messages.at(-1)
  assert.equal(reply.role, 'ai')
  assert.ok(reply.chips.length > 0)
})

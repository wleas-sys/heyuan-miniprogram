const test = require('node:test')
const assert = require('node:assert/strict')
const planner = require('../utils/planner')
const { DATA_VERSION } = require('../utils/data')
const { createHarness } = require('./harness.cjs')
const closureNotes = day => day.notes.filter(note => note.includes('恐龙博物馆通常周一闭馆'))

test('修改已采用路线的日期后，周一闭馆提示出现在该日且允许继续编辑', () => {
  const h = createHarness(), storage = h.module('utils/storage.js')
  storage.setDraft(planner.fromRoute('city'))
  const page = h.page('plan')
  page.changeDate(h.event({}, '2026-11-02'))
  assert.equal(closureNotes(page.data.view.days[0]).length, 1)
  assert.match(closureNotes(page.data.view.days[0])[0], /节假日.*馆方公告/)
  assert.equal(page.data.view.complete, true)
  page.changeDate(h.event({}, '2026-11-03'))
  assert.equal(closureNotes(page.data.view.days[0]).length, 0)
})

test('分享恢复与跨日日期均使用同一闭馆提示；不对无日期或其他景点误报', () => {
  const p = planner.fromRoute('weekend')
  p.days = [['guifengta'], ['konglong']]
  // 2027-05-31 is Monday, immediately following Sunday May 30.
  p.timing.date = '2027-05-30'
  let view = planner.describe(planner.decode(planner.encode(p)))
  assert.equal(closureNotes(view.days[0]).length, 0)
  assert.equal(closureNotes(view.days[1]).length, 1)
  assert.equal(view.days[1].dateLabel, '5月31日 周一')
  // Also cover a month boundary where Monday is in the following month.
  p.timing.date = '2026-05-31'
  view = planner.describe(p)
  assert.equal(view.days[1].dateLabel, '6月1日 周一')
  assert.equal(closureNotes(view.days[1]).length, 1)
  p.timing.date = ''
  assert.equal(closureNotes(planner.describe(p).days[1]).length, 0)
  p.timing.date = '2026-11-02'
  p.days = [['guifengta'], ['konglong']]
  view = planner.describe(p)
  assert.equal(closureNotes(view.days[0]).length, 0)
  assert.equal(closureNotes(view.days[1]).length, 0)
})

test('空白旧 dataVersion 回退当前版本，自编码分享可正常恢复', () => {
  for (const dataVersion of ['', '   ', '\t\n', undefined]) {
    const p = Object.assign(planner.fromRoute('city'), { dataVersion })
    const normalized = planner.normalize(p)
    assert.equal(normalized.dataVersion, DATA_VERSION)
    assert.equal(planner.signature(planner.decode(planner.encode(p))), planner.signature(normalized))
  }
  const p = Object.assign(planner.fromRoute('city'), { dataVersion: ' 2026-10-24 ' })
  assert.equal(planner.normalize(p).dataVersion, '2026-10-24')
  assert.match(planner.describe(p).warnings.join(' '), /较早的地点资料/)
})

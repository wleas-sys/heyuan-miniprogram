const test = require('node:test')
const assert = require('node:assert/strict')
const { PLACES } = require('../utils/data')

// 片区（area）词表按区县固定。新增地点必须落进本区县已有的片区键，
// 不能自造县名键（如 "dongyuan"），否则规划页会把同片区误报为「跨片区安排」。
const AREA_BY_REGION = {
  源城区: ['city', 'south'],
  东源县: ['lake', 'east', 'lakeWest', 'northEast'],
  紫金县: ['hotSpring', 'zijin'],
  龙川县: ['longchuan'],
  和平县: ['heping'],
  连平县: ['lianping'],
  江东新区: ['jiangdong']
}

const REQUIRED = ['id', 'name', 'shortName', 'region', 'area', 'category', 'address', 'duration', 'intro', 'suited', 'highlights', 'tags', 'visitTips', 'practical', 'hoursText', 'ticketText']

test('地点 id 唯一且为 ASCII slug（文件名、路由与封面路径都依赖它）', () => {
  const seen = new Set(), dup = []
  for (const p of PLACES) {
    if (seen.has(p.id)) dup.push(p.id)
    seen.add(p.id)
  }
  assert.deepEqual(dup, [], '存在重复 id，会让行程校验报「无效或重复地点」')
  for (const p of PLACES) assert.match(p.id, /^[a-z0-9]+$/, p.id + ' 必须是纯小写字母数字')
})

test('地点名称不重复', () => {
  const seen = new Set(), dup = []
  for (const p of PLACES) {
    if (seen.has(p.name)) dup.push(p.name)
    seen.add(p.name)
  }
  assert.deepEqual(dup, [], '存在同名地点，多半是同一景点被重复录入')
})

test('每个地点字段齐全，region/category 合法', () => {
  const regions = Object.keys(AREA_BY_REGION)
  for (const p of PLACES) {
    for (const key of REQUIRED) {
      assert.ok(p[key] !== undefined && p[key] !== null && p[key] !== '', p.id + ' 缺少 ' + key)
    }
    assert.ok(regions.includes(p.region), p.id + ' 的 region 非法：' + p.region)
    assert.ok(['人文', '山水', '温泉', '休闲'].includes(p.category), p.id + ' 的 category 非法：' + p.category)
    assert.ok(Number.isInteger(p.duration) && p.duration >= 30 && p.duration <= 360, p.id + ' 的时长不合理：' + p.duration)
    assert.ok(Array.isArray(p.highlights) && p.highlights.length > 0, p.id + ' 缺 highlights')
    assert.ok(Array.isArray(p.tags) && p.tags.length > 0, p.id + ' 缺 tags')
    assert.ok(Array.isArray(p.visitTips) && p.visitTips.length > 0, p.id + ' 缺 visitTips')
  }
})

test('每个地点的 area 落在本区县的片区词表内', () => {
  for (const p of PLACES) {
    const allowed = AREA_BY_REGION[p.region]
    assert.ok(allowed.includes(p.area), p.id + ' 的 area「' + p.area + '」不属于 ' + p.region + '，允许：' + allowed.join('/'))
  }
})

test('新增地点未核实的票价与开放信息都显式标注「待核对」，不伪装成确定信息', () => {
  // 原始 27 个有图地点的票价已逐条核对（见 README「已核对的门票资料」），
  // 新增地点多为公开资料估算，必须显式标注来源状态。
  const groups = require('../utils/gallery-packages')
  for (const p of PLACES) {
    if (groups[p.id]) continue
    assert.ok(/待核对|现场|以当天|公告|免费/.test(p.ticketText || ''), p.id + ' 的票价描述需说明来源状态')
    assert.ok(/出发前|现场|确认|公示/.test(p.hoursText || ''), p.id + ' 的开放时间需提示出发前确认')
  }
})

test('价格核实标记格式正确，且不能与「待核对」同时出现', () => {
  const verified = PLACES.filter(p => p.ticketVerified)
  assert.ok(verified.length >= 10, '应有已核实票价的地点，实际 ' + verified.length)
  for (const p of verified) {
    assert.match(p.ticketVerified, /^\d{4}-\d{2}$/, p.id + ' 的核实时间格式应为 YYYY-MM')
    assert.ok(!/待核对/.test(p.ticketText || ''), p.id + ' 标了已核实却仍写「待核对」')
  }
})

test('所有地点都不编造坐标：map 要么为 null，要么带数值经纬度', () => {
  for (const p of PLACES) {
    if (p.map === null || p.map === undefined) continue
    assert.equal(typeof p.map.latitude, 'number', p.id + ' 的 map.latitude 必须是数字')
    assert.equal(typeof p.map.longitude, 'number', p.id + ' 的 map.longitude 必须是数字')
  }
})

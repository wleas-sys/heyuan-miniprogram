// 本地推荐模型：显式特征 + 可调权重，不联网、不调用大模型。
// 这里只把已有地点资料算成分数，不新增事实；权重与强度是经验初值，可整体替换。
const { PLACES, getPlace } = require('./data')

const MODEL_VERSION = 'wanlv-model-1.0'
const PACE_TARGET = { relaxed: 240, standard: 360 }
const PACE_LABEL = { relaxed: '轻松节奏', standard: '充实节奏' }

// 五个地点级特征，权重合计 1。总分 = Σ(特征 × 权重) × 100。
// 初值经手调：新鲜度必须能压过一次「兴趣 + 地域」的惯性，否则去过的地点会一直排第一。
const WEIGHTS = { interest: 0.30, region: 0.22, novelty: 0.26, crowd: 0.14, quality: 0.08 }

// 同行人只决定「强度偏好」，不改变任何硬性筛选条件。
const CROWDS = [
  { key: 'friends', label: '朋友同行', intensity: 3, favor: ['山水', '温泉'], note: '能走能爬，多安排一点' },
  { key: 'family', label: '带孩子', intensity: 2, favor: ['人文', '休闲'], note: '少走路，留出休息' },
  { key: 'parents', label: '带父母', intensity: 1, favor: ['人文', '休闲'], note: '少爬山，时间宽松' },
  { key: 'couple', label: '两个人', intensity: 2, favor: ['山水', '休闲'], note: '慢一点，看风景' }
]

// 步行强度代理值：默认按建议停留时长估算，下列地点按实际游览方式修正。
const INTENSITY_OVERRIDES = {
  wanlvhu: 2, guishan: 3, yuewangshan: 3, xiankeng: 2, shangping: 2, huanglongyan: 2,
  yulinmen: 1, ketianxia: 1, relong: 1, bavaria: 1, chunmuyuan: 1
}

function clamp01(value) { return value < 0 ? 0 : value > 1 ? 1 : value }
function crowdOf(key) { return CROWDS.find(item => item.key === key) || CROWDS[0] }
function areaOfRegion(region) {
  if (!region || region === '全部') return ''
  const place = PLACES.find(item => item.region === region)
  return place ? place.area : ''
}
function intensityOf(place) {
  if (INTENSITY_OVERRIDES[place.id]) return INTENSITY_OVERRIDES[place.id]
  return place.duration >= 240 ? 3 : place.duration >= 150 ? 2 : 1
}

function context(input) {
  const source = input || {}
  const region = source.region || '全部'
  return {
    interest: source.interest || '全部',
    region,
    area: areaOfRegion(region),
    pace: source.pace || 'relaxed',
    crowd: crowdOf(source.crowd),
    history: source.history && typeof source.history === 'object' ? source.history : {}
  }
}

function interestValue(place, ctx) {
  if (ctx.interest === '全部') return 0.72
  if (place.category === ctx.interest) return 1
  const haystack = [place.name, place.shortName].concat(place.tags || []).join(' ')
  return haystack.indexOf(ctx.interest) >= 0 ? 0.65 : 0
}

function regionValue(place, ctx) {
  if (!ctx.region || ctx.region === '全部') return 0.72
  if (place.region === ctx.region) return 1
  if (ctx.area && place.area === ctx.area) return 0.55
  return 0.08
}

function crowdValue(place, ctx) {
  const fit = clamp01(1 - Math.abs(intensityOf(place) - ctx.crowd.intensity) / 3)
  const favor = ctx.crowd.favor.indexOf(place.category) >= 0 ? 1 : 0
  return fit * 0.7 + favor * 0.3
}

function noveltyValue(place, ctx) {
  const seen = ctx.history[place.id] || 0
  return Math.exp(-seen / 2)
}

// 信息确定性：能打开地图、有官方页面、有电话，用户少踩一次空。
function qualityValue(place) {
  return (place.map ? 0.5 : 0) + (place.bookingUrl ? 0.3 : 0) + (place.phone ? 0.2 : 0)
}

function placeScore(place, ctx, weights) {
  const w = weights || WEIGHTS
  const parts = {
    interest: interestValue(place, ctx),
    region: regionValue(place, ctx),
    crowd: crowdValue(place, ctx),
    novelty: noveltyValue(place, ctx),
    quality: qualityValue(place)
  }
  const score = Object.keys(w).reduce((sum, key) => sum + parts[key] * w[key], 0) * 100
  return { score, parts }
}

function visitMinutes(ids) {
  return ids.reduce((sum, id) => { const place = getPlace(id); return sum + (place ? place.duration : 0) }, 0)
}

// 节奏契合：达到目标时最高，超出目标按比例扣，明显不足也不给满分。
function dayPaceFit(ids, ctx) {
  if (!ids.length) return 0
  const target = PACE_TARGET[ctx.pace] || 240
  const total = visitMinutes(ids)
  return total <= target ? 0.6 + 0.4 * total / target : clamp01(1 - (total - target) / target)
}

function stateScore(ids, ctx, weights) {
  if (!ids.length) return 0
  const mean = ids.reduce((sum, id) => {
    const place = getPlace(id)
    return sum + (place ? placeScore(place, ctx, weights).score : 0)
  }, 0) / ids.length / 100
  return mean * 0.6 + dayPaceFit(ids, ctx) * 0.4
}

function buildReasons(plan, ctx, scored, pace, cross, weights) {
  const w = weights || WEIGHTS
  const average = key => scored.reduce((sum, item) => sum + item.parts[key], 0) / scored.length
  const seen = Object.keys(ctx.history).filter(id => ctx.history[id] > 0).length
  const dayCount = plan.days.length
  const hours = Math.round(visitMinutes([].concat.apply([], plan.days)) / dayCount / 30) / 2
  const reasons = [
    { key: 'interest', value: Math.round(average('interest') * w.interest * 100), text: ctx.interest === '全部' ? '没有限定兴趣，按综合表现排序' : '符合你选的「' + ctx.interest + '」' },
    { key: 'region', value: Math.round(average('region') * w.region * 100), text: average('region') >= 0.8 && ctx.region !== '全部' ? '都在' + ctx.region + '，路上更省时间' : average('region') >= 0.5 ? '集中在同一片区，换场不远' : '地点分散在不同区县，路上要留足时间' },
    { key: 'novelty', value: Math.round(average('novelty') * w.novelty * 100), text: seen ? '避开了 ' + seen + ' 个你收藏或安排过的地点' : '没有和你之前收藏、安排过的地点重复' },
    { key: 'crowd', value: Math.round(average('crowd') * w.crowd * 100), text: ctx.crowd.label + '：' + ctx.crowd.note },
    { key: 'pace', value: Math.round(pace * 100 * 0.18), text: '每天游览约 ' + hours + ' 小时，符合' + (PACE_LABEL[ctx.pace] || '轻松节奏') },
    { key: 'quality', value: Math.round(average('quality') * w.quality * 100), text: '优先排了有地图坐标、官方页面的地点，出发前好核对' }
  ]
  const result = reasons.filter(item => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 3)
  // 只在真正跨区时补一条扣分，避免把正常安排说成缺点。
  if (cross > 0) result.push({ key: 'cross', value: -Math.round(cross * 3.5), text: '有 ' + cross + ' 次跨区换场，路上时间要另留' })
  return result
}

function evaluate(plan, ctx, options, weights) {
  const ids = [].concat.apply([], plan.days)
  if (!ids.length) return { score: 0, reasons: [] }
  const scored = ids.map(id => placeScore(getPlace(id), ctx, weights))
  const mean = scored.reduce((sum, item) => sum + item.score, 0) / scored.length
  const pace = plan.days.reduce((sum, day) => sum + dayPaceFit(day, ctx), 0) / plan.days.length
  let cross = 0
  plan.days.slice(1).forEach((day, index) => {
    const before = getPlace(plan.days[index][0]), after = getPlace(day[0])
    if (before && after && before.region !== after.region) cross++
  })
  const bonus = options && options.route ? 3 : 0
  const score = mean * 0.72 + pace * 100 * 0.18 + bonus - cross * 3.5
  return { score: Math.round(score * 10) / 10, reasons: buildReasons(plan, ctx, scored, pace, cross, weights) }
}

module.exports = { MODEL_VERSION, WEIGHTS, CROWDS, PACE_TARGET, context, intensityOf, placeScore, dayPaceFit, stateScore, evaluate }

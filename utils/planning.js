const planner = require('./planner')
const model = require('./model')
const { PLACES, ROUTES, MODES, getPlace } = require('./data')
const OPTIONS = {
  days: [1, 2, 3, 4, 5],
  paces: [{ key: 'relaxed', label: '轻松惬意', desc: '每天游览不超过4小时' }, { key: 'standard', label: '适度充实', desc: '每天游览不超过6小时' }],
  interests: [{ key: '全部', label: '全部偏好' }].concat(Array.from(new Set(PLACES.map(p => p.category))).map(key => ({ key, label: key }))),
  regions: ['全部'].concat(Array.from(new Set(PLACES.map(p => p.region))))
}
const CITY = ['konglong', 'guifengta', 'taiping', 'dongjiangwan', 'kejiagongyuan']
const GROUPS = [['konglong', 'guifengta'], ['konglong', 'guifengta', 'taiping'], ['taiping', 'dongjiangwan'], ['shangping', 'neiguan']]
function recommend(input, options) {
  const settings = options || {}, weights = settings.weights
  const o = Object.assign({ days: 1, date: '', mode: 'drive', pace: 'relaxed', interest: '全部', region: '全部', crowd: 'friends', history: {} }, input)
  o.days = Number(o.days)
  if (!OPTIONS.days.includes(o.days) || !MODES.some(x => x.key === o.mode) || !OPTIONS.paces.some(x => x.key === o.pace) || !OPTIONS.interests.some(x => x.key === o.interest) || !OPTIONS.regions.includes(o.region) || !model.CROWDS.some(x => x.key === o.crowd) || !planner.validDate(o.date)) return []
  if (o.mode === 'walk' && o.days > 1) return []
  const ctx = model.context(o)
  const limit = o.pace === 'relaxed' ? 240 : 360
  const matches = id => { const p = getPlace(id); return p && id !== 'penquan' && (o.region === '全部' || o.region === p.region) && (o.interest === '全部' || o.interest === p.category) && (o.mode !== 'walk' || ['konglong', 'guifengta'].includes(id)) && (o.mode !== 'transit' || CITY.includes(id)) }
  const timing = Object.assign(planner.defaultTiming(), { date: o.date, transfer: o.mode === 'walk' ? 20 : o.mode === 'transit' ? 60 : 45 })
  function fits(day, dayIndex) {
    // The museum normally closes on Monday. Holiday exceptions require checking the notice.
    if (o.date && Number.isInteger(dayIndex) && day.includes('konglong')) {
      const p = o.date.split('-').map(Number), date = new Date(0)
      date.setUTCFullYear(p[0], p[1] - 1, p[2] + dayIndex)
      if (date.getUTCDay() === 1) return false
    }
    if (!day.length || day.length > planner.MAX_STOPS || !day.every(matches)) return false
    if (day.reduce((n, id) => n + getPlace(id).duration, 0) > limit) return false
    const view = planner.describe(Object.assign(planner.emptyPlan(), { days: [day], timing, mode: o.mode }))
    return view.days[0].totalMinutes <= (o.pace === 'relaxed' ? 480 : 540) && !view.days[0].overflowMinutes
  }
  const groups = [], seenGroups = new Set()
  function group(day) { const key = day.join('|'); if (!seenGroups.has(key) && fits(day)) { seenGroups.add(key); groups.push(day) } }
  GROUPS.forEach(group); PLACES.forEach(p => group([p.id]))
  // 同区县任意两点组合：放宽多日行程与一日游的成团空间，仍由 fits() 守住时间上限与地区/兴趣约束。
  const sameRegion = {}
  PLACES.map(p => p.id).filter(matches).forEach(id => { const r = getPlace(id).region; (sameRegion[r] = sameRegion[r] || []).push(id) })
  Object.keys(sameRegion).forEach(r => {
    const ids = sameRegion[r]
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) group([ids[i], ids[j]])
  })
  const candidates = [], seen = new Set()
  function add(days, title, routeId) {
    if (days.length !== o.days || !days.every((d, i) => fits(d, i))) return
    const ids = [].concat.apply([], days)
    if (new Set(ids).size !== ids.length) return
    const key = ids.slice().sort().join('|')
    if (seen.has(key)) return
    seen.add(key)
    const plan = planner.normalize(Object.assign(planner.emptyPlan(), { title, days, mode: o.mode, timing }))
    const v = planner.describe(plan), regions = Array.from(new Set(ids.map(id => getPlace(id).region)))
    // 地点分 + 节奏分 + 跨区扣分都由本地模型给出，参考路线只额外加一点权重。
    const evaluation = model.evaluate(plan, ctx, { route: !!routeId }, weights)
    const score = evaluation.score
    candidates.push({ id: routeId || 'auto-' + ids.join('-'), title, tag: routeId ? '参考路线' : '按条件组合', coverPhoto: getPlace(ids[0]).photo, stopCount: ids.length, plan, score,
      scoreText: String(Math.round(score)), reasons: evaluation.reasons,
      reason: regions.join('、') + ' · 每天游览不超过' + (limit / 60) + '小时；匹配度 ' + Math.round(score) + ' 分，按你选择的范围与兴趣筛选。',
      daySummary: v.days.map(d => ({ label: '第 ' + d.day + ' 天', names: d.places.map(p => p.shortName || p.name), visitMinutes: d.visitMinutes, visitLabel: d.startText + '–' + d.finishText + ' · 含路上预留' })),
      notes: ['站间暂留' + timing.transfer + '分钟，实际路程、班次和开放时间请出发前核对。', '不含出发地往返与跨日住宿接驳。'].concat(o.mode === 'transit' ? ['公交方案仅覆盖城区已整理地点；未接入实时班次。'] : []).concat(ids.includes('shangping') ? ['桃花和采摘有季节性，请确认具体果园与花果情况。'] : []),
      estimateText: v.estimate.text, estimateNote: v.estimate.caption })
  }
  ROUTES.forEach(r => add(r.days, r.title, r.id))
  // Bounded beam search keeps preferences strict and avoids repeating a place.
  let states = [{ days: [], used: [], score: 0 }]
  for (let day = 0; day < o.days; day++) {
    const next = []
    for (const state of states) for (const g of groups) {
      if (!fits(g, day) || g.some(id => state.used.includes(id))) continue
      const last = state.days.length ? getPlace(state.days[state.days.length - 1][0]).region : ''
      const score = state.score + model.stateScore(g, ctx, weights) - (last && last !== getPlace(g[0]).region ? 0.04 : 0)
      next.push({ days: state.days.concat([g]), used: state.used.concat(g), score })
    }
    const distinct = new Set()
    states = next.sort((a, b) => b.score - a.score).filter(s => { const key = s.used.slice().sort().join('|') + ':' + getPlace(s.used[s.used.length - 1]).region; if (distinct.has(key)) return false; distinct.add(key); return true }).slice(0, 60)
  }
  states.forEach(s => add(s.days, (o.region === '全部' ? '河源' : o.region) + o.days + '日参考行程', ''))
  return candidates.sort((a, b) => b.score - a.score).slice(0, settings.limit || 3)
}
module.exports = { OPTIONS, recommend }

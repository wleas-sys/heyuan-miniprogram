// 模型权重调参：不训练、不造标签，只用可解释的产品指标做坐标上升搜索。
// 运行：node tools/tune-model.cjs
const planning = require('../utils/planning')
const model = require('../utils/model')
const { getPlace } = require('../utils/data')

const CURRENT = Object.assign({}, model.WEIGHTS)
const BOUNDS = { interest: [0.20, 0.40], region: [0.12, 0.30], novelty: [0.15, 0.35], crowd: [0.08, 0.22], quality: [0.04, 0.14] }
const STEP = 0.04
const PASSES = 3

// 场景回归：这三条是产品底线，权重怎么调都不能破。
const SCENES = [
  { name: '去过两次的地点不再首推', input: { region: '东源县', interest: '山水', history: { wanlvhu: 2 } }, check: top => top.plan.days[0][0] !== 'wanlvhu' },
  { name: '城区人文优先恐龙博物馆', input: { region: '源城区', interest: '人文', crowd: 'family' }, check: top => top.plan.days.flat().includes('konglong') },
  { name: '带父母时古城优先于爬山', input: { region: '龙川县', crowd: 'parents' }, check: top => top.plan.days[0][0] === 'tuocheng' }
]

function normalize(weights) {
  const total = Object.keys(weights).reduce((sum, key) => sum + weights[key], 0)
  const out = {}
  Object.keys(weights).forEach(key => {
    const value = weights[key] / total
    out[key] = Math.round(value * 1000) / 1000
  })
  return out
}

function clampWeights(weights) {
  const out = normalize(weights)
  Object.keys(BOUNDS).forEach(key => {
    out[key] = Math.min(BOUNDS[key][1], Math.max(BOUNDS[key][0], out[key]))
  })
  return normalize(out)
}

function buildPool() {
  const pool = []
  for (const days of planning.OPTIONS.days) for (const mode of require('../utils/data').MODES) for (const pace of planning.OPTIONS.paces) for (const interest of planning.OPTIONS.interests) for (const region of planning.OPTIONS.regions) {
    const input = { days, mode: mode.key, pace: pace.key, interest: interest.key, region }
    const candidates = planning.recommend(input, { limit: 12 })
    const ctx = model.context(Object.assign({}, input, { crowd: 'friends' }))
    pool.push({ input, ctx, target: pace.key === 'relaxed' ? 240 : 360, candidates })
  }
  return pool
}

function scenesPass(weights) {
  return SCENES.every(scene => {
    const results = planning.recommend(scene.input, { weights, limit: 3 })
    return results.length > 0 && scene.check(results[0])
  })
}

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b)
  const inter = [...A].filter(x => B.has(x)).length
  return 1 - inter / (A.size + B.size - inter)
}

function measure(pool, weights) {
  let fill = 0, cohesion = 0, ready = 0, spread = 0, plans = 0
  const picks = []
  for (const item of pool) {
    const ranked = item.candidates
      .map(candidate => ({ plan: candidate.plan, route: candidate.tag === '参考路线', score: model.evaluate(candidate.plan, item.ctx, { route: candidate.tag === '参考路线' }, weights).score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
    if (!ranked.length) continue
    ranked.forEach(entry => {
      plans++
      const days = entry.plan.days
      const dayFill = days.reduce((sum, day) => sum + Math.min(1, day.reduce((n, id) => n + getPlace(id).duration, 0) / item.target), 0) / days.length
      fill += dayFill
      let cross = 0
      days.slice(1).forEach((day, i) => { if (getPlace(days[i][0]).region !== getPlace(day[0]).region) cross++ })
      cohesion += days.length > 1 ? 1 - cross / (days.length - 1) : 1
      ready += days.flat().filter(id => getPlace(id).map).length / days.flat().length
      picks.push(days.flat())
    })
    if (ranked.length > 1) {
      let pairs = 0, distance = 0
      for (let i = 0; i < ranked.length; i++) for (let j = i + 1; j < ranked.length; j++) { distance += jaccard(ranked[i].plan.days.flat(), ranked[j].plan.days.flat()); pairs++ }
      spread += distance / pairs
    }
  }
  return {
    fill: fill / plans,
    cohesion: cohesion / plans,
    ready: ready / plans,
    spread: spread / pool.length,
    objective: 0.35 * (fill / plans) + 0.25 * (cohesion / plans) + 0.20 * (spread / pool.length) + 0.15 * (ready / plans) + 0.05 * (picks.length ? new Set(picks.flat()).size / picks.flat().length : 0)
  }
}

function scoreWeights(pool, weights) {
  if (!scenesPass(weights)) return { objective: -1, invalid: true }
  return measure(pool, weights)
}

function tune(pool) {
  let best = clampWeights(CURRENT)
  let bestScore = scoreWeights(pool, best)
  const log = []
  for (let pass = 0; pass < PASSES; pass++) {
    let improved = false
    Object.keys(CURRENT).forEach(key => {
      for (const direction of [1, -1]) {
        const candidate = Object.assign({}, best)
        candidate[key] = best[key] + direction * STEP
        const weights = clampWeights(candidate)
        const result = scoreWeights(pool, weights)
        log.push({ weights, objective: result.objective, changed: key + (direction > 0 ? '+' : '-') })
        if (result.objective > bestScore.objective + 1e-9) {
          best = weights; bestScore = result; improved = true
        }
      }
    })
    if (!improved) break
  }
  return { weights: best, score: bestScore, log }
}

const pool = buildPool()
const baseline = scoreWeights(pool, CURRENT)
console.log('条件组合：' + pool.length + ' 组，候选池 ' + pool.reduce((n, item) => n + item.candidates.length, 0) + ' 个方案')

const distribution = [0, 0, 0, 0]
pool.forEach(item => { distribution[Math.min(3, item.candidates.length)]++ })
console.log('候选数分布：0 个 ' + distribution[0] + ' 组 / 1 个 ' + distribution[1] + ' 组 / 2 个 ' + distribution[2] + ' 组 / 3 个及以上 ' + distribution[3] + ' 组')

console.log('\n当前权重 ' + JSON.stringify(CURRENT))
console.log('指标  fill=' + baseline.fill.toFixed(3) + '  cohesion=' + baseline.cohesion.toFixed(3) + '  spread=' + baseline.spread.toFixed(3) + '  ready=' + baseline.ready.toFixed(3) + '  objective=' + baseline.objective.toFixed(4))

console.log('\n单特征敏感性（相对当前，±0.06）')
Object.keys(CURRENT).forEach(key => {
  const row = [key]
  for (const delta of [-0.06, 0.06]) {
    const candidate = Object.assign({}, CURRENT)
    candidate[key] = CURRENT[key] + delta
    const weights = clampWeights(candidate)
    const result = scoreWeights(pool, weights)
    row.push((delta > 0 ? '+' : '') + delta + ' → ' + (result.objective < 0 ? '场景不通过' : result.objective.toFixed(4)))
  }
  console.log('  ' + row[0] + '  ' + row[1] + '   ' + row[2])
})

const result = tune(pool)
console.log('\n调参后 ' + JSON.stringify(result.weights))
console.log('指标  fill=' + result.score.fill.toFixed(3) + '  cohesion=' + result.score.cohesion.toFixed(3) + '  spread=' + result.score.spread.toFixed(3) + '  ready=' + result.score.ready.toFixed(3) + '  objective=' + result.score.objective.toFixed(4))
console.log('搜索次数 ' + result.log.length + '，有效评估 ' + result.log.filter(item => item.objective > -1).length)

const gain = (result.score.objective - baseline.objective) / baseline.objective
const atBound = Object.keys(BOUNDS).filter(key => {
  const value = result.weights[key]
  return Math.abs(value - BOUNDS[key][0]) < 0.011 || Math.abs(value - BOUNDS[key][1]) < 0.011
})
console.log('\n提升 ' + (gain * 100).toFixed(2) + '%；触边权重 ' + (atBound.length ? atBound.join('、') : '无'))
console.log(gain >= 0.015 && !atBound.length ? '结论：可以替换 utils/model.js 的 WEIGHTS。' : '结论：不建议替换。提升不足或权重顶到边界，说明是在拟合这套指标，不是真的更懂用户。')

console.log('\n场景回归（必须在通过后才能采用）')
SCENES.forEach(scene => {
  const results = planning.recommend(scene.input, { weights: result.weights, limit: 3 })
  console.log((scene.check(results[0]) ? 'PASS  ' : 'FAIL  ') + scene.name + '  →  ' + results[0].plan.days.map(day => day.join('+')).join(' / '))
})

// 覆盖率诊断：列出「区县 × 兴趣」每个格子的地点数，标出空格与稀疏格。
// 有解率被数据覆盖卡死，算法无法补救；本脚本输出需要补数据的清单。
// 用法：
//   node tools/coverage.cjs            只输出格子矩阵（快）
//   node tools/coverage.cjs --solve    额外实跑 1200 组条件，输出真实有解率（约 10 秒）
const { PLACES } = require('../utils/data')

const regions = [...new Set(PLACES.map(p => p.region))]
const categories = [...new Set(PLACES.map(p => p.category))]
const cells = {}
for (const p of PLACES) {
  const key = p.region + ' / ' + p.category
  ;(cells[key] = cells[key] || []).push(p.shortName || p.name)
}

let empty = 0, sparse = 0
const lines = []
lines.push('区县 / 兴趣'.padEnd(20) + '地点数  状态')
lines.push('-'.repeat(40))
for (const r of regions) for (const c of categories) {
  const list = cells[r + ' / ' + c] || []
  const n = list.length
  let flag = 'OK'
  if (n === 0) { flag = '空（无解）'; empty++ }
  else if (n <= 2) { flag = '稀疏（建议补到≥3）'; sparse++ }
  lines.push((r + ' / ' + c).padEnd(18) + String(n).padStart(4) + '   ' + flag)
}

const total = regions.length * categories.length
lines.push('-'.repeat(40))
lines.push(`空格子 ${empty} / ${total}（这些组合永远无解，算法救不了）`)
lines.push(`稀疏格 ${sparse}（1–2 个地点，多日行程或一日双点会很局促）`)
lines.push(`有数据的格子 ${total - empty} / ${total} = ${(100 * (1 - empty / total)).toFixed(0)}%（这是一日游覆盖的理论上限，不是实测有解率）`)

console.log(lines.join('\n'))

// 输出待补清单，方便逐条粘贴真实景点
const todo = []
for (const r of regions) for (const c of categories) {
  const n = (cells[r + ' / ' + c] || []).length
  if (n <= 2) todo.push(`- [ ] ${r} / ${c}（现有 ${n} 个，目标 ≥3）`)
}
console.log('\n补数据清单：')
console.log(todo.join('\n'))

if (process.argv.includes('--solve')) {
  const planning = require('../utils/planning')
  const { MODES } = require('../utils/data')
  const t = Date.now()
  let count = 0, nonempty = 0
  const perDays = {}
  for (const days of planning.OPTIONS.days) {
    perDays[days] = { n: 0, ok: 0 }
    for (const mode of MODES)
      for (const pace of planning.OPTIONS.paces)
        for (const interest of planning.OPTIONS.interests)
          for (const region of planning.OPTIONS.regions) {
            count++
            perDays[days].n++
            const ok = planning.recommend({ days, mode: mode.key, pace: pace.key, interest: interest.key, region }).length > 0
            if (ok) { nonempty++; perDays[days].ok++ }
          }
  }
  console.log('\n实测有解率（跑遍全部规划条件）：')
  console.log(`  全部条件 ${nonempty} / ${count} = ${(100 * nonempty / count).toFixed(1)}%`)
  for (const days of planning.OPTIONS.days) {
    const d = perDays[days]
    console.log(`  ${days} 天     ${String(d.ok).padStart(3)} / ${d.n} = ${(100 * d.ok / d.n).toFixed(1)}%`)
  }
  console.log(`  耗时 ${((Date.now() - t) / 1000).toFixed(1)}s`)
} else {
  console.log('\n提示：`node tools/coverage.cjs --solve` 可实跑 1200 组条件得到真实有解率。')
}

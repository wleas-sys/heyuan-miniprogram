const planner = require('./planner')
const { getPlace } = require('./data')
const KEYS = { plans: 'heyuan.v13.plans', draft: 'heyuan.v13.draft', favorites: 'heyuan.v13.favorites' }
function read(key, fallback, strict) { try { const v = wx.getStorageSync(key); return v === '' || v === undefined || v === null ? fallback : v } catch (e) { if (strict) throw new Error('读取本机数据失败，请重试后再保存'); return fallback } }
function write(key, value) { wx.setStorageSync(key, value) }
function corrupt() { return new Error('本机数据格式异常，已停止写入以保留原数据') }
function getPlans(strict) {
  const value = read(KEYS.plans, [], strict)
  if (!Array.isArray(value)) { if (strict) throw corrupt(); return [] }
  if (strict && value.length > 30) throw corrupt()
  return value.reduce((all, p) => { try { all.push(planner.normalize(p)) } catch (e) { if (strict) throw corrupt() } return all }, []).slice(0, 30)
}
function savePlan(plan) {
  const p = planner.normalize(plan)
  if (!planner.describe(p).complete) throw new Error('请先为每一天安排地点')
  const sig = planner.signature(p)
  const list = getPlans(true).filter(item => item.id !== p.id && planner.signature(item) !== sig)
  if (list.length >= 30) throw new Error('已保存 30 份行程，请先删除不需要的行程')
  list.unshift(p); write(KEYS.plans, list); return p
}
function removePlan(id) { write(KEYS.plans, getPlans(true).filter(p => p.id !== id)) }
function getDraft(strict = false) {
  const value = read(KEYS.draft, null, strict)
  if (value === null) return planner.emptyPlan()
  try { return planner.normalize(value) } catch (e) { if (strict) throw corrupt(); return planner.emptyPlan() }
}
// Called only after explicit confirmation on the draft recovery screen.
function recoverDraft() {
  const raw = read(KEYS.draft, null, true)
  if (raw !== null) {
    const key = 'heyuan.v13.draftBackups', backups = read(key, [], true)
    if (!Array.isArray(backups)) throw new Error('草稿备份格式异常，未改动原草稿')
    const serialized = JSON.stringify(raw)
    const alreadyBackedUp = backups.some(item => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'raw') && JSON.stringify(item.raw) === serialized)
    if (!alreadyBackedUp) {
      if (backups.length >= 5) throw new Error('已有 5 份草稿备份，未改动原草稿；请先导出或处理已有备份')
      write(key, [{ createdAt: Date.now(), raw }].concat(backups))
    }
  }
  const plan = planner.emptyPlan()
  write(KEYS.draft, plan)
  return plan
}
function setDraft(plan) { const current = read(KEYS.draft, null, true); if (current !== null) { try { planner.normalize(current) } catch (e) { throw corrupt() } } const p = planner.normalize(plan); p.updatedAt = Date.now(); write(KEYS.draft, p); return p }
function favorites(strict) { const v = read(KEYS.favorites, [], strict); if (strict && (!Array.isArray(v) || v.some(id => !getPlace(id)))) throw corrupt(); return Array.isArray(v) ? Array.from(new Set(v.filter(id => getPlace(id)))) : [] }
function toggleFavorite(id) { if (!getPlace(id)) throw new Error('地点不存在'); const list = favorites(true); const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); else list.push(id); write(KEYS.favorites, list); return list }
function legacyPlans(strict) { const v = read('savedPlans', [], strict); return Array.isArray(v) ? v : [] }
function importLegacy() {
  const nameMap = { '霍山风景区': 'huoshan', '镜花缘风景区': 'jinghuayuan' }
  let imported = 0, skipped = 0
  const known = getPlans(true)
  const sigs = new Set(known.map(p => planner.signature(p)))
  const converted = []
  legacyPlans(true).forEach(old => {
    if (!old || !Array.isArray(old.days) || old.days.length < 1 || old.days.length > 2) { skipped++; return }
    const seen = new Set(), days = [], unsupported = old.days.some(d => !d || !Array.isArray(d.attractions) || d.attractions.length > 4)
    if (unsupported) { skipped++; return }
    let invalid = false
    old.days.forEach(d => days.push(d.attractions.map(a => {
      const key = a && (getPlace(a.id) ? a.id : nameMap[a.name])
      if (!key || seen.has(key)) { invalid = true; return '' }
      seen.add(key); return key
    })))
    if (invalid || days.some(d => !d.length)) { skipped++; return }
    try {
      const p = planner.normalize(Object.assign(planner.emptyPlan(), { title: old.title || '旧版行程', days }))
      const sig = planner.signature(p)
      if (sigs.has(sig)) return
      if (known.length + converted.length >= 30) { skipped++; return }
      converted.push(p); sigs.add(sig); imported++
    } catch (e) { skipped++ }
  })
  if (converted.length) write(KEYS.plans, converted.concat(known))
  return { imported, skipped }
}
module.exports = { KEYS, getPlans, savePlan, removePlan, getDraft, setDraft, recoverDraft, favorites, toggleFavorite, legacyPlans, importLegacy }

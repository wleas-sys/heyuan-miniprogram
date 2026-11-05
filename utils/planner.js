const tickets = require('./tickets')
const { DATA_VERSION, PLACES, MODES, getPlace, getRoute } = require('./data')
const MAX_DAYS = 5
const MAX_STOPS = 4
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
function defaultTiming() { return { date: '', start: 540, end: 1080, lunch: 60, transfer: 30, visits: {}, legs: {} } }
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(label + '格式不正确')
  return value
}
function validDate(value) {
  if (value === '') return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parts = value.split('-').map(Number), year = parts[0], month = parts[1], day = parts[2]
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}
function legKeys(days) { return days.reduce((out, day) => out.concat(day.slice(1).map((key, i) => day[i] + '>' + key)), []) }
function dictionary(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(label + '格式不正确')
  return value
}
function normalizeTiming(value, days) {
  const defaults = defaultTiming()
  if (value === undefined) return defaults
  dictionary(value, '行程时间')
  const keys = Object.keys(defaults)
  if (Object.keys(value).some(key => keys.indexOf(key) < 0)) throw new Error('行程时间含有不支持的字段')
  const timing = Object.assign(defaults, value)
  if (!validDate(timing.date)) throw new Error('请选择真实的出发日期')
  integer(timing.start, 0, 1438, '开始时间')
  integer(timing.end, timing.start + 1, 1439, '结束时间')
  integer(timing.lunch, 0, 180, '午餐休息时长')
  integer(timing.transfer, 0, 360, '交通预留时长')
  const visits = dictionary(timing.visits, '停留时间'), legs = dictionary(timing.legs, '交通时间')
  timing.visits = {}; timing.legs = {}
  days.reduce((out, day) => out.concat(day), []).forEach(key => {
    if (has(visits, key)) timing.visits[key] = integer(visits[key], 15, 720, '停留时间')
  })
  legKeys(days).forEach(key => { if (has(legs, key)) timing.legs[key] = integer(legs[key], 0, 360, '交通时间') })
  return timing
}
function compactTiming(timing, days) {
  if (JSON.stringify(timing) === JSON.stringify(defaultTiming())) return null
  const stops = days.reduce((out, day) => out.concat(day), []), pairs = legKeys(days)
  return [timing.date, timing.start, timing.end, timing.lunch, timing.transfer,
    Object.keys(timing.visits).length ? stops.map(key => has(timing.visits, key) ? timing.visits[key] : null) : [],
    Object.keys(timing.legs).length ? pairs.map(key => has(timing.legs, key) ? timing.legs[key] : null) : []]
}
function readTiming(raw, days) {
  if (!Array.isArray(raw) || raw.length !== 7 || !Array.isArray(raw[5]) || !Array.isArray(raw[6])) throw new Error('分享时间格式不正确')
  const stops = days.reduce((out, day) => out.concat(day), []), pairs = legKeys(days)
  if ((raw[5].length !== 0 && raw[5].length !== stops.length) || (raw[6].length !== 0 && raw[6].length !== pairs.length)) throw new Error('分享时间与行程地点不一致')
  const visits = {}, legs = {}
  raw[5].forEach((minutes, i) => { if (minutes !== null) visits[stops[i]] = integer(minutes, 15, 720, '分享停留时间') })
  raw[6].forEach((minutes, i) => { if (minutes !== null) legs[pairs[i]] = integer(minutes, 0, 360, '分享交通时间') })
  return normalizeTiming({ date: raw[0], start: raw[1], end: raw[2], lunch: raw[3], transfer: raw[4], visits, legs }, days)
}
function timeText(minutes) {
  const day = Math.floor(minutes / 1440), rest = minutes % 1440
  return (day ? (day === 1 ? '次日 ' : '第 ' + (day + 1) + ' 日 ') : '') + String(Math.floor(rest / 60)).padStart(2, '0') + ':' + String(rest % 60).padStart(2, '0')
}
function calendarDate(date, index) {
  if (!date) return null
  const parts = date.split('-').map(Number), d = new Date(0)
  d.setUTCFullYear(parts[0], parts[1] - 1, parts[2] + index)
  return d
}
function dayDate(date, index) {
  const d = calendarDate(date, index)
  if (!d) return '日期未定'
  return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日 周' + '日一二三四五六'[d.getUTCDay()]
}
function formatMinutesText(mins) {
  if (!mins || mins <= 0) return '0分'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h > 0 && m > 0) return h + '小时' + m + '分'
  if (h > 0) return h + '小时'
  return m + '分'
}
function formatMinutesFull(mins) {
  if (!mins || mins <= 0) return '0分钟'
  const h = Math.floor(mins / 60), m = mins % 60
  if (h > 0 && m > 0) return h + '小时' + m + '分钟'
  if (h > 0) return h + '小时'
  return m + '分钟'
}
function schedule(items, timing, index) {
  const visits = items.map(key => has(timing.visits, key) ? timing.visits[key] : getPlace(key).duration)
  const transfers = items.map((key, i) => i ? (has(timing.legs, items[i - 1] + '>' + key) ? timing.legs[items[i - 1] + '>' + key] : timing.transfer) : 0)
  const visitMinutes = visits.reduce((sum, value) => sum + value, 0), travelMinutes = transfers.reduce((sum, value) => sum + value, 0)
  const needsLunch = timing.lunch > 0 && timing.start < 720 && timing.start + visitMinutes + travelMinutes > 720
  let clock = timing.start, lunchDone = false
  const breaks = []
  const places = items.map((key, i) => {
    const travelKey = i ? items[i - 1] + '>' + key : ''
    clock += transfers[i]
    let breakBefore = 0, breakDuring = 0, breakStartText = '', breakEndText = ''
    if (needsLunch && !lunchDone && clock >= 720) {
      breakBefore = timing.lunch
      breaks.push({ startText: timeText(clock), endText: timeText(clock + breakBefore), minutes: breakBefore, beforePlaceId: key, afterPlaceId: i ? items[i - 1] : '', insidePlaceId: '', label: '午餐与休息' })
      clock += breakBefore; lunchDone = true
    }
    const arriveText = timeText(clock)
    // Keep a short stop continuous even when it crosses noon. If there is a
    // following stop, its arrival gets the break; a short final stop can simply
    // finish at lunchtime. Only a long visit needs a break within that visit.
    if (needsLunch && !lunchDone && visits[i] >= 180 && clock < 720 && clock + visits[i] > 720) {
      breakDuring = timing.lunch; breakStartText = timeText(720); breakEndText = timeText(720 + breakDuring)
      breaks.push({ startText: breakStartText, endText: breakEndText, minutes: breakDuring, beforePlaceId: '', afterPlaceId: '', insidePlaceId: key, label: '午餐与休息（此站期间）' })
      lunchDone = true
    }
    clock += visits[i] + breakDuring
    return { arriveText, leaveText: timeText(clock), visitMinutes: visits[i], visitDurationText: formatMinutesFull(visits[i]), travelBefore: transfers[i], travelKey,
      travelConfirmed: i === 0 || has(timing.legs, travelKey), breakBefore, breakDuring, breakStartText, breakEndText }
  })
  const breakMinutes = breaks.reduce((sum, item) => sum + item.minutes, 0)
  const totalMinutes = visitMinutes + travelMinutes + breakMinutes
  const overflowMinutes = Math.max(0, clock - timing.end)
  return {
    places, breaks, dateLabel: dayDate(timing.date, index), startText: timeText(timing.start), finishText: timeText(clock), endText: timeText(timing.end),
    totalMinutes, visitMinutes, travelMinutes, breakMinutes,
    totalDurationText: formatMinutesFull(totalMinutes),
    visitDurationText: formatMinutesText(visitMinutes),
    travelDurationText: formatMinutesText(travelMinutes),
    breakDurationText: formatMinutesText(breakMinutes),
    overflowDurationText: formatMinutesFull(overflowMinutes),
    overflowMinutes, missingTransfers: places.filter(place => !place.travelConfirmed).length
  }
}
function number(value, max) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n) : 0
}
function amount(value, max) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) throw new Error('行程金额格式不正确，请重新填写或重新分享')
  return value
}
function id() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function emptyPlan() { return { schema: 13, dataVersion: DATA_VERSION, id: id(), title: '我的河源行程', mode: 'drive', days: [[]], budget: null, meal: null, lodging: null, transport: null, tickets: {}, timing: defaultTiming(), updatedAt: Date.now() } }
function normalize(input) {
  if (!input || input.schema !== 13 || !Array.isArray(input.days) || input.days.length < 1 || input.days.length > MAX_DAYS) throw new Error('行程格式不受支持')
  const seen = new Set()
  const days = input.days.map(day => {
    if (!Array.isArray(day) || day.length > MAX_STOPS) throw new Error('每天最多安排 4 个地点')
    return day.map(placeId => {
      if (typeof placeId !== 'string' || !getPlace(placeId) || seen.has(placeId)) throw new Error('行程包含无效或重复地点')
      seen.add(placeId)
      return placeId
    })
  })
  const tickets = {}
  if (input.tickets != null && (typeof input.tickets !== 'object' || Array.isArray(input.tickets))) throw new Error('门票金额格式不正确')
  seen.forEach(key => {
    const val = input.tickets && input.tickets[key]
    if (val !== undefined && val !== null && val !== '') tickets[key] = amount(val, 9999)
  })
  return { schema: 13, dataVersion: typeof input.dataVersion === 'string' && input.dataVersion.trim() ? input.dataVersion.trim().slice(0, 16) : DATA_VERSION,
    id: typeof input.id === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(input.id) ? input.id : id(),
    title: typeof input.title === 'string' && input.title.trim() ? Array.from(input.title.trim()).slice(0, 24).join('') : '我的河源行程',
    mode: MODES.some(m => m.key === input.mode) ? input.mode : 'drive', days, timing: normalizeTiming(input.timing, days),
    budget: amount(input.budget, 99999), meal: amount(input.meal, 9999), lodging: amount(input.lodging, 9999), transport: amount(input.transport, 99999), tickets,
    updatedAt: number(input.updatedAt, 9999999999999) || Date.now() }
}
function fromRoute(routeId) {
  const route = getRoute(routeId)
  if (!route) throw new Error('这条路线暂不可用')
  const timing = Object.assign(defaultTiming(), { transfer: route.mode === 'walk' ? 20 : 45 })
  return normalize(Object.assign(emptyPlan(), { title: route.title, mode: route.mode, days: route.days.map(d => d.slice()), timing }))
}
function mutate(plan, fn) { const copy = normalize(JSON.parse(JSON.stringify(plan))); fn(copy); copy.updatedAt = Date.now(); return normalize(copy) }
function addStop(plan, placeId, day) {
  if (!getPlace(placeId)) throw new Error('地点不存在')
  if (!Number.isInteger(day) || !plan.days[day]) throw new Error('请先选择行程日期')
  if (plan.days.some(d => d.indexOf(placeId) >= 0)) throw new Error('这个地点已在行程里')
  if (plan.days[day].length >= MAX_STOPS) throw new Error('这一天已安排 4 个地点，请先调整')
  return mutate(plan, p => p.days[day].push(placeId))
}
function removeStop(plan, day, index) { return mutate(plan, p => { if (p.days[day]) p.days[day].splice(index, 1) }) }
function moveStop(plan, day, index, delta) {
  return mutate(plan, p => { const d = p.days[day]; if (!d || index + delta < 0 || index + delta >= d.length) return; const item = d.splice(index, 1)[0]; d.splice(index + delta, 0, item) })
}
function replaceStop(plan, day, index, placeId) {
  return mutate(plan, p => { if (!p.days[day] || !p.days[day][index]) throw new Error('原地点不存在'); p.days[day][index] = placeId })
}
function signature(plan) {
  const p = normalize(plan)
  return JSON.stringify([p.title, p.mode, p.days, p.budget, p.meal, p.lodging, p.transport, PLACES.map(a => p.tickets[a.id] === undefined ? null : p.tickets[a.id]), compactTiming(p.timing, p.days)])
}
function describe(plan) {
  const p = normalize(plan), warnings = [], scheduleWarnings = [], all = []
  const days = p.days.map((items, index) => {
    const timetable = schedule(items, p.timing, index)
    const places = items.map((key, i) => Object.assign({}, getPlace(key), timetable.places[i], { order: i + 1, index: i, ticketReference: key === 'jinghuayuan' && has(p.tickets, 'wanlvhu') ? tickets.TICKETS.jinghuayuan : tickets.reference(key, p.days), ticketInput: p.tickets[key] === undefined ? '' : String(p.tickets[key]), canUp: i > 0, canDown: i < items.length - 1 }))
    all.push(...places)
    const duration = timetable.visitMinutes
    const areas = Array.from(new Set(places.map(a => a.area)))
    const notes = [], date = calendarDate(p.timing.date, index)
    if (date && date.getUTCDay() === 1 && items.includes('konglong')) notes.push('河源恐龙博物馆通常周一闭馆；这一天请先确认是否开放，节假日安排以馆方公告为准。')
    if (!places.length) notes.push('这一天还没有安排地点。')
    if (areas.length > 1) notes.push('跨片区安排：先查实际交通耗时，再确认能否同日完成。')
    if (p.mode === 'walk' && (areas.length > 1 || areas.some(a => a !== 'city'))) notes.push('步行是否可行尚未确认，请在地图中检查距离。')
    if (duration > 360) notes.push('建议停留已超过 6 小时，尚未计入交通、用餐和排队，建议减少地点。')
    if (items.indexOf('wanlvhu') >= 0 && items.indexOf('jinghuayuan') >= 0) notes.push('请核对万绿湖套票是否已含镜花缘，避免重复购票。')
    if (timetable.overflowMinutes) scheduleWarnings.push('第 ' + (index + 1) + ' 天超出计划结束时间 ' + timetable.overflowMinutes + ' 分钟，请减少地点或调整时长。')
    if (timetable.missingTransfers) scheduleWarnings.push('第 ' + (index + 1) + ' 天有 ' + timetable.missingTransfers + ' 段交通暂按每段 ' + p.timing.transfer + ' 分钟预留，请查地图后填写。')
    return Object.assign({}, timetable, { day: index + 1, index, places, durationText: duration ? (Math.round(duration / 6) / 10) + ' 小时建议停留' : '待安排', notes })
  })
  if (all.length) scheduleWarnings.push('时间表未计入出发地到首站、末站返回住处及跨日交通，请另行预留；开放、排队和交通需出发前确认。')
  if (days.some(day => day.breakMinutes)) scheduleWarnings.push('午休为手动规划中的预留时间，休息地点与景区内用餐条件请自行确认。')
  if (p.days.some(d => !d.length)) warnings.push('还有空白日期，请补充地点或减少天数。')
  const knownTickets = all.filter(a => p.tickets[a.id] !== undefined)
  const ticketTotal = knownTickets.reduce((sum, a) => sum + p.tickets[a.id], 0)
  const subtotal = ticketTotal + p.meal * p.days.length + p.lodging * (p.days.length - 1) + p.transport
  const unknownTickets = all.length - knownTickets.length
  const estimate = tickets.estimate(p)
  if (estimate.unknown) warnings.push(estimate.unknown + ' 项门票或交通尚未计入参考预算，请补充实际金额。')
  if (estimate.hasAssumptions) warnings.push('餐饮或住宿使用预算假设，可在上方填写实际金额替换。')
  if (p.budget !== null && estimate.low > p.budget && subtotal <= p.budget) warnings.push('参考预算已超出所设上限，尚未计入的费用需另留余量。')
  if (p.budget !== null && subtotal > p.budget) warnings.push('已填费用超出预算 ¥' + (subtotal - p.budget) + '。')
  if (p.dataVersion !== DATA_VERSION) warnings.push('这份行程使用较早的地点资料，当前展示已更新，请重新核对出行信息。')
  return { plan: p, days, estimate, count: all.length, subtotal, ticketTotal, unknownTickets, warnings, scheduleWarnings, dateLabel: p.timing.date ? p.timing.date + ' 出发' : '日期待定',
    modeLabel: MODES.find(m => m.key === p.mode).label, complete: all.length > 0 && !p.days.some(d => !d.length),
    fees: [{ label: '已填门票 / 人', value: ticketTotal, text: knownTickets.length ? '¥' + ticketTotal : '未填写' }, { label: '餐饮 / 人', value: p.meal * p.days.length, text: p.meal === null ? '未填写' : '¥' + p.meal * p.days.length }, { label: '住宿 / 人', value: p.lodging * (p.days.length - 1), text: p.days.length === 1 ? '未安排住宿' : p.lodging === null ? '未填写' : '¥' + p.lodging * (p.days.length - 1) }, { label: '全程交通 / 人', value: p.transport || 0, text: p.transport === null ? '未填写' : '¥' + p.transport }] }
}
// The recipient rebuilds the same ordered itinerary without sender storage.
// ASCII/URI-safe payload; length limited and strictly validated before use.
function encode(plan) {
  const p = normalize(plan)
  const compact = [13, p.dataVersion, p.title, p.mode, p.days, p.budget, p.meal, p.lodging, p.transport, p.tickets]
  const timing = compactTiming(p.timing, p.days)
  if (timing) compact.push(timing)
  const token = encodeURIComponent(JSON.stringify(compact))
  if (token.length > 3500) throw new Error('行程内容过长，请缩短名称后再分享')
  return token
}
function decode(value) {
  if (typeof value !== 'string' || value.length > 4000) throw new Error('分享内容无效或过长')
  let raw
  try { raw = JSON.parse(value.charAt(0) === '[' ? value : decodeURIComponent(value)) } catch (e) { throw new Error('分享内容损坏，请让朋友重新分享') }
  if (!Array.isArray(raw) || (raw.length !== 10 && raw.length !== 11) || raw[0] !== 13) throw new Error('暂不支持这份行程的版本')
  if (typeof raw[1] !== 'string' || !raw[1] || raw[1].length > 16 || typeof raw[2] !== 'string' || !raw[2].trim() || Array.from(raw[2]).length > 24 || !MODES.some(m => m.key === raw[3])) throw new Error('分享内容格式不正确，请让朋友重新分享')
  if (raw.slice(5, 9).some(v => v !== null && typeof v !== 'number') || !raw[9] || typeof raw[9] !== 'object' || Array.isArray(raw[9])) throw new Error('分享金额格式不正确，请让朋友重新分享')
  if (Object.keys(raw[9]).some(key => !getPlace(key) || typeof raw[9][key] !== 'number')) throw new Error('分享门票格式不正确，请让朋友重新分享')
  const p = normalize({ schema: raw[0], dataVersion: raw[1], title: raw[2], mode: raw[3], days: raw[4], budget: raw[5], meal: raw[6], lodging: raw[7], transport: raw[8], tickets: raw[9] })
  if (raw.length === 11) p.timing = readTiming(raw[10], p.days)
  if (Object.keys(raw[9]).length !== Object.keys(p.tickets).length) throw new Error('分享门票与行程地点不一致')
  if (!describe(p).complete) throw new Error('分享行程缺少地点')
  return p
}
module.exports = { MAX_DAYS, MAX_STOPS, emptyPlan, normalize, fromRoute, addStop, removeStop, moveStop, replaceStop, describe, signature, encode, decode, defaultTiming, validDate, timeText, formatMinutesFull, formatMinutesText }

const { PLACES, MODES, getPlace } = require('../../utils/data')
const planner = require('../../utils/planner')
const events = require('../../utils/events')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')

const CHECK_ITEMS = [
  { id: 'opening', title: '确认开放与预约', note: '看当天公告，核对入园或开馆时间' },
  { id: 'traffic', title: '查好往返交通', note: '确认入口、停车点或末班车船' },
  { id: 'weather', title: '查看出行天气', note: '按天气准备雨具、防晒与合适的鞋' },
  { id: 'tickets', title: '核对门票与证件', note: '套票包含项目、优惠证件一起检查' },
  { id: 'packing', title: '带好随身物品', note: '饮水、充电设备和个人常用物品' }
]

function guard() {
  if (ui.singlePage()) {
    ui.toast('请先点击底部“前往小程序”')
    return true
  }
  return false
}

function clockText(minutes) {
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0')
}

function minuteFields(view) {
  const timing = view.plan.timing || { lunch: 60, transfer: 30 }, visits = {}, legs = {}
  view.days.forEach(day => day.places.forEach(place => {
    visits[place.id] = String(place.visitMinutes === undefined ? place.duration : place.visitMinutes)
    if (place.travelKey) legs[place.travelKey] = String(place.travelBefore)
  }))
  return { lunch: String(timing.lunch), transfer: String(timing.transfer), visits, legs }
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parts = value.split('-').map(Number), date = new Date(0)
  date.setFullYear(parts[0], parts[1] - 1, parts[2])
  date.setHours(0, 0, 0, 0)
  return date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2]
}

Page(ui.page({
  data: {
    plan: null,
    view: null,
    draftError: '',
    titleInput: '',
    modes: MODES,
    dayOptions: [1, 2, 3, 4, 5],
    activeDay: 0,
    timingOpen: false,
    startTime: '09:00',
    endTime: '18:00',
    minuteFields: { lunch: '60', transfer: '30', visits: {}, legs: {} },
    pickerOpen: false,
    candidates: [],
    replaceIndex: null,
    pickerDay: 0,
    pickerQuery: '',
    pickerRegion: '全部',
    regions: ['全部'].concat(Array.from(new Set(PLACES.map(p => p.region)))),
    budgetOpen: false,
    pendingFees: 0,
    checks: [],
    checkedCount: 0,
    checksAvailable: true,
    failedPhotos: {},
    saved: false,
    checksOpen: false, expandedStop: '',
    undoOpen: false, undoText: '', undoPlan: null, flashId: '',
    daysLiquid: false, leavingId: '', ripples: []
  },

  onShow() {
    ui.tab.call(this, 2, false)
    try {
      this.render(storage.getDraft(true))
      this.setData({ draftError: '' })
    } catch (e) {
      this.setData({ draftError: e.message || '本机草稿暂时无法读取', plan: null, view: null })
      return
    }
    this.loadChecks()
    const app = getApp(), intent = app && app.globalData && app.globalData.editIntent
    if (intent) { app.globalData.editIntent = null; this.setData({ activeDay: 0, expandedStop: '' }); if (intent.message) ui.toast(intent.message) }
  },

  onHide() {
    this.closePicker()
    this.clearTimers()
    if (this.data.undoOpen) this.setData({ undoOpen: false, undoPlan: null })
  },

  onUnload() { this.clearTimers() },

  clearTimers() {
    if (this._undoTimer && typeof clearTimeout === 'function') clearTimeout(this._undoTimer)
    if (this._flashTimer && typeof clearTimeout === 'function') clearTimeout(this._flashTimer)
    if (this._liquidTimer && typeof clearTimeout === 'function') clearTimeout(this._liquidTimer)
    this._undoTimer = null
    this._flashTimer = null
    this._liquidTimer = null
  },

  retryDraft() { this.onShow() },

  recoverDraft() {
    if (guard() || !this.data.draftError) return
    wx.showModal({
      title: '备份原草稿，再新建？',
      content: '会先把原始草稿保存在本机备份中，再创建空白行程。备份失败时不会替换原草稿；已保存行程不受影响。',
      confirmText: '备份并新建',
      success: r => {
        if (!r.confirm || guard()) return
        try { storage.recoverDraft(); this.onShow(); if (!this.data.draftError) ui.toast('已备份原草稿，可以重新安排') }
        catch (e) { ui.fail(e) }
      }
    })
  },

  render(plan, rawTitle) {
    const view = planner.describe(plan)
    this._minuteDirty = {}
    const pendingFees = view.unknownTickets +
      (view.plan.meal === null ? 1 : 0) +
      (view.plan.transport === null ? 1 : 0) +
      (view.plan.days.length > 1 && view.plan.lodging === null ? 1 : 0)
    view.days.forEach(day => {
      day.afterBreaks = (day.breaks || []).filter(item => !item.beforePlaceId && !item.insidePlaceId)
    })
    const timing = view.plan.timing || { start: 540, end: 1080 }
    this.setData({
      plan: view.plan,
      view,
      pendingFees,
      titleInput: rawTitle === undefined ? view.plan.title : rawTitle,
      activeDay: Math.min(this.data.activeDay, view.days.length - 1),
      startTime: clockText(timing.start),
      endTime: clockText(timing.end),
      minuteFields: minuteFields(view),
      saved: false
    })
  },

  checkRoute() {
    return JSON.stringify([this.data.plan.mode, this.data.plan.days, this.data.plan.timing])
  },

  commit(plan, rawTitle) {
    if (this.data.draftError) { ui.toast('请先重新读取草稿'); return false }
    try {
      const before = this.data.plan ? this.checkRoute() : ''
      const saved = storage.setDraft(plan)
      this.render(saved, rawTitle)
      if (before !== this.checkRoute()) this.loadChecks()
      return true
    } catch (e) {
      ui.fail(e)
      return false
    }
  },

  title(e) {
    if (guard()) return this.data.titleInput
    const old = this.data.titleInput, p = Object.assign({}, this.data.plan, { title: e.detail.value })
    if (!this.commit(p, e.detail.value)) return old
  },

  mode(e) {
    if (guard()) return
    const key = e.currentTarget.dataset.key
    if (key === this.data.plan.mode || !MODES.some(item => item.key === key)) return
    const plan = JSON.parse(JSON.stringify(this.data.plan))
    plan.mode = key
    if (plan.timing) plan.timing.legs = {}
    this.commit(plan)
  },

  selectDay(e) {
    this.setData({ activeDay: Number(e.currentTarget.dataset.day) })
  },

  generate() {
    if (!guard()) wx.navigateTo({ url: '/pages/plan-create/plan-create' })
  },

  ripple(e) { ui.ripple.call(this, e, '#previewCta') },
  toggleStop(e) { const id = e.currentTarget.dataset.id; this.setData({ expandedStop: this.data.expandedStop === id ? '' : id }) },
  toggleChecks() { this.setData({ checksOpen: !this.data.checksOpen }) },
  ticketSource(e) { const row = this.data.view.days.reduce((a, d) => a.concat(d.places), []).find(x => x.id === e.currentTarget.dataset.id)?.ticketReference; if (row && row.source) ui.copy(row.source, '票价来源已复制') },
  toggleTiming() {
    this.setData({ timingOpen: !this.data.timingOpen })
  },

  changeDate(e) {
    if (guard()) return
    const date = e.detail.value
    if (!validDate(date)) return ui.toast('日期格式不正确')
    const timing = Object.assign({}, this.data.plan.timing, { date })
    this.commit(Object.assign({}, this.data.plan, { timing }))
  },

  clearDate() {
    if (guard()) return
    const timing = Object.assign({}, this.data.plan.timing, { date: '' })
    this.commit(Object.assign({}, this.data.plan, { timing }))
  },

  changeTime(e) {
    if (guard()) return
    const key = e.currentTarget.dataset.key, value = e.detail.value
    const parts = value.split(':').map(Number), minutes = parts[0] * 60 + parts[1]
    const timing = Object.assign({}, this.data.plan.timing)
    if (key === 'start') {
      if (minutes >= timing.end) return ui.toast('开始时间需早于结束时间')
      timing.start = minutes
    } else {
      if (minutes <= timing.start) return ui.toast('结束时间需晚于开始时间')
      timing.end = minutes
    }
    this.commit(Object.assign({}, this.data.plan, { timing }))
  },

  stageMinutes(e) {
    if (guard()) return
    const { kind, key } = e.currentTarget.dataset, value = e.detail.value
    this._minuteDirty = this._minuteDirty || {}
    this._minuteDirty[kind + ':' + key] = true
    const fields = JSON.parse(JSON.stringify(this.data.minuteFields))
    if (kind === 'base') fields[key] = value
    else fields[kind === 'visit' ? 'visits' : 'legs'][key] = value
    this.setData({ minuteFields: fields })
  },

  minutes(e) {
    if (guard()) return
    const { kind, key } = e.currentTarget.dataset, raw = (e.detail.value || '').trim()
    const fields = minuteFields(this.data.view)
    const previous = kind === 'base' ? fields[key] : fields[kind === 'visit' ? 'visits' : 'legs'][key]
    const dirtyKey = kind + ':' + key
    if (!this._minuteDirty || !this._minuteDirty[dirtyKey]) return previous
    delete this._minuteDirty[dirtyKey]
    const max = kind === 'visit' ? 720 : (key === 'lunch' ? 180 : 360)
    const min = kind === 'visit' ? 15 : 0
    const timing = JSON.parse(JSON.stringify(this.data.plan.timing || planner.defaultTiming()))
    if (raw === '' && kind !== 'base') {
      delete timing[kind === 'visit' ? 'visits' : 'legs'][key]
      if (!this.commit(Object.assign({}, this.data.plan, { timing }))) {
        this.setData({ minuteFields: fields })
        return previous
      }
      const restored = minuteFields(this.data.view)
      return restored[kind === 'visit' ? 'visits' : 'legs'][key]
    }
    const value = raw === '' ? (key === 'lunch' ? 60 : 30) : Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      ui.toast('请输入 ' + min + '–' + max + ' 分钟')
      this.setData({ minuteFields: fields })
      return previous
    }
    if (kind === 'base') timing[key] = value
    else timing[kind === 'visit' ? 'visits' : 'legs'][key] = Number(value)
    if (!this.commit(Object.assign({}, this.data.plan, { timing }))) {
      this.setData({ minuteFields: fields })
      return previous
    }
    return String(Number(value))
  },

  setDays(e) {
    if (guard()) return
    const count = Number(e.currentTarget.dataset.value), p = this.data.plan
    if (count === p.days.length) return
    const change = () => {
      const copy = JSON.parse(JSON.stringify(p))
      while (copy.days.length < count) copy.days.push([])
      if (copy.days.length > count) copy.days = copy.days.slice(0, count)
      if (this.commit(copy)) { this.setData({ activeDay: Math.min(this.data.activeDay, count - 1) }); this.liquidDays() }
    }
    const removedStops = p.days.slice(count).reduce((sum, d) => sum + d.length, 0)
    if (count < p.days.length && removedStops > 0) {
      wx.showModal({
        title: '减少行程天数？',
        content: '减少到 ' + count + ' 天会将第 ' + (count + 1) + ' 天之后的地点从当前草稿移除。',
        confirmText: '确定减少',
        confirmColor: '#A04D38',
        success: r => { if (r.confirm) change() }
      })
    } else {
      change()
    }
  },

  money(e) {
    if (guard()) return
    const key = e.currentTarget.dataset.key, value = e.detail.value.trim()
    if (!['budget', 'meal', 'lodging', 'transport'].includes(key)) return
    const max = key === 'budget' || key === 'transport' ? 99999 : 9999
    const previous = this.data.plan[key] === null ? '' : String(this.data.plan[key])
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) > max)) {
      ui.toast('请输入 0–' + max + ' 的金额')
      return previous
    }
    if (!this.commit(Object.assign({}, this.data.plan, { [key]: value === '' ? null : Number(value) }))) return previous
    return value === '' ? '' : String(Number(value))
  },

  ticket(e) {
    if (guard()) return
    const key = e.currentTarget.dataset.id, value = e.detail.value.trim(), tickets = Object.assign({}, this.data.plan.tickets)
    const previous = tickets[key] === undefined ? '' : String(tickets[key])
    if (value === '') delete tickets[key]
    else if (!/^\d+$/.test(value) || Number(value) > 9999) {
      ui.toast('请输入 0–9999 的金额')
      return previous
    } else tickets[key] = Number(value)
    if (!this.commit(Object.assign({}, this.data.plan, { tickets }))) return previous
    return value === '' ? '' : String(Number(value))
  },

  toggleBudget() {
    this.setData({ budgetOpen: !this.data.budgetOpen })
  },

  openPicker(e) {
    if (guard()) return
    const day = Number(e.currentTarget.dataset.day), rawIndex = e.currentTarget.dataset.index
    const replaceIndex = rawIndex === undefined ? null : Number(rawIndex)
    if (!this.data.plan.days[day]) return
    if (replaceIndex === null && this.data.plan.days[day].length >= planner.MAX_STOPS) {
      return ui.toast('每天最多安排 4 个地点，请先调整')
    }
    this.setData({ pickerDay: day, replaceIndex, pickerQuery: '', pickerRegion: '全部' })
    this.filterCandidates()
    this.setPickerOpen(true)
  },

  filterCandidates() {
    const used = this.data.plan.days.reduce((a, d) => a.concat(d), [])
    const query = this.data.pickerQuery.trim().toLowerCase(), region = this.data.pickerRegion
    this.setData({
      candidates: PLACES.filter(p => used.indexOf(p.id) < 0 &&
        (region === '全部' || p.region === region) &&
        (!query || [p.name, p.shortName, p.region, p.category].join(' ').toLowerCase().indexOf(query) >= 0))
    })
  },

  searchCandidates(e) {
    this.setData({ pickerQuery: e.detail.value })
    this.filterCandidates()
  },

  region(e) {
    this.setData({ pickerRegion: e.currentTarget.dataset.region })
    this.filterCandidates()
  },

  clearSearch() {
    this.setData({ pickerQuery: '', pickerRegion: '全部' })
    this.filterCandidates()
  },

  setPickerOpen(open) {
    this.setData({ pickerOpen: open })
    const tab = typeof this.getTabBar === 'function' && this.getTabBar()
    if (tab) tab.setData({ hidden: open })
  },

  closePicker() {
    this.setPickerOpen(false)
  },

  noop() {},

  choose(e) {
    if (guard()) return
    try {
      const key = e.currentTarget.dataset.id, day = this.data.pickerDay, i = this.data.replaceIndex
      const next = i === null ? planner.addStop(this.data.plan, key, day) : planner.replaceStop(this.data.plan, day, i, key)
      if (this.commit(next)) {
        this.setData({ activeDay: day })
        this.closePicker()
        ui.haptic()
        this.flashStop(key)
      }
    } catch (e) {
      ui.fail(e)
    }
  },

  // 新加入的一站先亮一下，再把页面带过去，避免「点了没反应」的错觉
  flashStop(id) {
    if (this._flashTimer && typeof clearTimeout === 'function') clearTimeout(this._flashTimer)
    this.setData({ flashId: id })
    if (typeof setTimeout !== 'function') return
    this._flashTimer = setTimeout(() => { this._flashTimer = null; this.setData({ flashId: '' }) }, 1200)
    // 等新节点渲染出来再定位，定位失败就保持当前位置
    if (typeof wx !== 'undefined' && typeof wx.pageScrollTo === 'function') setTimeout(() => wx.pageScrollTo({ selector: '#stop-' + id, offsetTop: -120, duration: 260, fail() {} }), 80)
  },

  move(e) {
    if (guard()) return
    const d = e.currentTarget.dataset
    try {
      if (this.commit(planner.moveStop(this.data.plan, Number(d.day), Number(d.index), Number(d.delta)))) ui.haptic()
    } catch (e) {
      ui.fail(e)
    }
  },

  moveDay(e) {
    if (guard()) return
    const from = Number(e.currentTarget.dataset.day), index = Number(e.currentTarget.dataset.index)
    const current = this.data.plan, placeId = current.days[from] && current.days[from][index]
    if (!placeId || current.days.length < 2) return
    const targets = current.days.map((day, i) => i).filter(i => i !== from)
    wx.showActionSheet({
      itemList: targets.map(i => '移至第 ' + (i + 1) + ' 天' + (current.days[i].length >= planner.MAX_STOPS ? '（已满）' : '')),
      success: result => {
        if (guard() || !Number.isInteger(result.tapIndex) || !targets.includes(targets[result.tapIndex])) return
        const target = targets[result.tapIndex], next = JSON.parse(JSON.stringify(this.data.plan)), source = next.days[from]
        if (!source || !next.days[target] || source[index] !== placeId) return ui.toast('行程已变动，请重新选择')
        if (next.days[target].length >= planner.MAX_STOPS) return ui.toast('第 ' + (target + 1) + ' 天已安排 4 站')
        source.splice(index, 1)
        next.days[target].push(placeId)
        if (this.commit(next)) {
          this.setData({ activeDay: target })
          ui.toast('已移至第 ' + (target + 1) + ' 天')
        }
      }
    })
  },

  // 滑钮移动时先拉长、落位再收回，和日数、时间表同一条缓动
  liquidDays() {
    if (typeof setTimeout !== 'function') return
    this.setData({ daysLiquid: true })
    if (this._liquidTimer && typeof clearTimeout === 'function') clearTimeout(this._liquidTimer)
    this._liquidTimer = setTimeout(() => { this._liquidTimer = null; this.setData({ daysLiquid: false }) }, 180)
  },

  // 移除不再弹确认框，改成「先移除、再给 5 秒撤销」，少一次打断
  remove(e) {
    if (guard()) return
    const d = e.currentTarget.dataset, day = Number(d.day), index = Number(d.index)
    const placeId = this.data.plan.days[day] && this.data.plan.days[day][index]
    if (!placeId || this.data.leavingId) return
    let snapshot
    try { snapshot = JSON.parse(JSON.stringify(this.data.plan)) } catch (err) { return ui.fail(err) }
    const place = getPlace(placeId)
    const text = '已移除「' + (place ? (place.shortName || place.name) : '这一站') + '」'
    const finish = () => {
      this.setData({ leavingId: '' })
      if (!this.commit(planner.removeStop(this.data.plan, day, index))) return
      events.record('remove', placeId)
      ui.haptic()
      this.showUndo(text, snapshot)
    }
    // 先让这张卡抽走、露出下面的时间线，再真正删；测试环境没有定时器能力时直接删
    if (typeof setTimeout !== 'function') return finish()
    this.setData({ leavingId: placeId })
    setTimeout(finish, 170)
  },

  showUndo(text, snapshot) {
    this.setData({ undoOpen: true, undoText: text, undoPlan: snapshot })
    if (this._undoTimer && typeof clearTimeout === 'function') clearTimeout(this._undoTimer)
    if (typeof setTimeout !== 'function') return
    this._undoTimer = setTimeout(() => {
      this._undoTimer = null
      this.setData({ undoOpen: false, undoPlan: null })
    }, 5000)
  },

  undoRemove() {
    if (!this.data.undoPlan) return
    const plan = this.data.undoPlan
    this.clearTimers()
    this.setData({ undoOpen: false, undoPlan: null })
    if (this.commit(plan)) { ui.haptic(); ui.toast('已恢复刚才的地点') }
  },

  dismissUndo() {
    this.clearTimers()
    this.setData({ undoOpen: false, undoPlan: null })
  },

  preview() {
    if (guard()) return
    if (!this.data.view.complete) return ui.toast('请为每天至少安排 1 个地点')
    wx.navigateTo({ url: '/pages/plan-result/plan-result?draft=1' })
  },

  save() {
    try {
      storage.savePlan(this.data.plan)
      this.setData({ saved: true })
      ui.haptic('medium')
      ui.toast('行程已保存到“我的”')
    } catch (e) {
      ui.fail(e)
    }
  },

  fresh() {
    if (guard()) return
    wx.showModal({
      title: '新建一份行程？',
      content: '将清空当前草稿。如需保留，请先在下方点击保存。',
      confirmText: '新建',
      success: r => {
        if (r.confirm && this.commit(planner.emptyPlan())) {
          this.setData({ activeDay: 0, budgetOpen: false })
          this.loadChecks()
        }
      }
    })
  },

  loadChecks() {
    try {
      const value = wx.getStorageSync('wanlv.v21.departure.' + this.data.plan.id)
      if (value && (typeof value !== 'object' || Array.isArray(value) || typeof value.routeKey !== 'string' || !Array.isArray(value.items) || value.items.some(id => !CHECK_ITEMS.some(item => item.id === id)))) {
        throw new Error('清单读取失败')
      }
      const changed = !!value && value.routeKey !== this.checkRoute()
      const ids = value && !changed ? value.items : []
      const checks = CHECK_ITEMS.map(item => Object.assign({}, item, { done: ids.indexOf(item.id) >= 0 }))
      this.setData({ checks, checkedCount: checks.filter(item => item.done).length, checksAvailable: true, checksChanged: changed })
    } catch (e) {
      this.setData({ checks: CHECK_ITEMS.map(item => Object.assign({}, item, { done: false })), checkedCount: 0, checksAvailable: false, checksChanged: false })
    }
  },

  toggleCheck(e) {
    if (guard() || !this.data.checksAvailable) return
    const id = e.currentTarget.dataset.id
    const checks = this.data.checks.map(item => Object.assign({}, item, { done: item.id === id ? !item.done : item.done }))
    try {
      storage.setDraft(this.data.plan)
      wx.setStorageSync('wanlv.v21.departure.' + this.data.plan.id, {
        routeKey: this.checkRoute(),
        items: checks.filter(item => item.done).map(item => item.id)
      })
      this.setData({ checks, checkedCount: checks.filter(item => item.done).length, checksChanged: false })
    } catch (e) {
      ui.toast('清单未能保存')
    }
  },

  photoError(e) {
    this.setData({ ['failedPhotos.' + e.currentTarget.dataset.id]: true })
  },

  detail(e) {
    ui.detail(e.currentTarget.dataset.id)
  },

  onShareAppMessage() {
    if (!this.data.view || !this.data.view.complete) return ui.homeShare()
    return {
      title: this.data.plan.title + ' ｜ 万绿智游',
      path: '/pages/plan-result/plan-result?s=' + planner.encode(this.data.plan),
      imageUrl: this.data.view.days[0].places[0].photo
    }
  }
}))

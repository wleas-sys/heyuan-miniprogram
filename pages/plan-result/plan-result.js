const planner = require('../../utils/planner')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
Page(ui.page({
  data: { view: null, error: '', shared: false, fromDraft: false, shareQuery: '', activeDay: 0, budgetOpen: false, pendingFees: 0, saved: false, heroPhoto: '', failedPhotos: {} },
  onLoad(options) {
    try {
      let plan
      if (options.s) plan = planner.decode(options.s)
      else if (options.id) plan = storage.getPlans().find(p => p.id === options.id)
      else if (options.draft === '1') plan = storage.getDraft()
      if (!plan || !planner.describe(plan).complete) throw new Error('没有找到完整行程，请重新打开或创建一份。')
      this.setData({ shared: !!options.s, fromDraft: !options.s && !options.id && options.draft === '1' }); this.render(plan); ui.enableShare()
    } catch (e) { this.setData({ error: e.message }); wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail() {} }) }
  },
  render(plan) {
    const view = planner.describe(plan), firstPhoto = view.days.reduce((all, day) => all.concat(day.places), []).find(place => place.photo)
    const pendingFees = view.unknownTickets + (view.plan.meal === null ? 1 : 0) + (view.plan.transport === null ? 1 : 0) + (view.plan.days.length > 1 && view.plan.lodging === null ? 1 : 0)
    const signature = planner.signature(view.plan)
    this.setData({ view, pendingFees, shareQuery: 's=' + planner.encode(plan), heroPhoto: firstPhoto ? firstPhoto.photo : '', heroId: firstPhoto ? firstPhoto.id : '', activeDay: Math.min(this.data.activeDay, view.days.length - 1), saved: storage.getPlans().some(item => planner.signature(item) === signature) })
  },
  onShow() {
    if (!this.data.fromDraft) return
    const draft = storage.getDraft()
    if (planner.describe(draft).complete) { this.setData({ error: '' }); this.render(draft); ui.enableShare() }
    else { this.setData({ view: null, error: '草稿已调整，请先为每一天安排地点。' }); wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], fail() {} }) }
  },
  selectDay(e) { this.setData({ activeDay: Number(e.currentTarget.dataset.day) }) },
  toggleBudget() { this.setData({ budgetOpen: !this.data.budgetOpen }) },
  save() { try { storage.savePlan(this.data.view.plan); this.setData({ saved: true }); ui.toast('已保存到「我的」') } catch (e) { ui.fail(e) } },
  edit() {
    const plan = this.data.view.plan
    let draft
    try { draft = storage.getDraft(true) } catch (e) { if (!ui.offerRepair(e, () => this.edit())) ui.fail(e); return }
    const go = () => { try { storage.setDraft(plan); ui.editor('已打开编辑草稿') } catch (e) { ui.fail(e) } }
    if (draft.days.some(d => d.length) && planner.signature(draft) !== planner.signature(plan)) wx.showModal({ title: '替换当前草稿？', content: '这份行程将作为新的编辑草稿。原草稿如需保留，请先到“行程”保存。', confirmText: '继续编辑', success: r => { if (r.confirm) go() } })
    else go()
  },
  copy() {
    const view = this.data.view
    const lines = [view.plan.title, view.days.length + ' 天 · ' + view.count + ' 个地点 · ' + view.modeLabel, view.dateLabel]
    view.days.forEach(day => {
      lines.push('', '第 ' + day.day + ' 天 · ' + day.dateLabel, '计划 ' + day.startText + ' 开始，' + day.finishText + ' 结束')
      day.places.forEach(place => {
        if (place.travelKey) lines.push('   路上 ' + place.travelBefore + ' 分钟（' + (place.travelConfirmed ? '自行填写，出发前核对' : '预留，待核对') + '）')
        if (place.breakBefore) lines.push('   用餐 / 休息 ' + place.breakBefore + ' 分钟')
        lines.push(place.arriveText + '–' + place.leaveText + '  ' + place.order + '. ' + place.name + '（停留 ' + place.visitMinutes + ' 分钟）', '   ' + place.address)
        if (place.breakDuring) lines.push('   其中 ' + place.breakStartText + '–' + place.breakEndText + ' 用餐 / 休息，游览时间另计')
      })
      ;(day.breaks || []).filter(b => !b.beforePlaceId && !b.insidePlaceId).forEach(b => lines.push(b.startText + '–' + b.endText + ' 用餐 / 休息'))
      if (day.overflowMinutes) lines.push('⚠ 比期望结束时间晚 ' + day.overflowMinutes + ' 分钟，请调整')
    })
    lines.push('', '参考预算：' + view.estimate.text + ' / 人；' + view.estimate.caption + '；' + view.estimate.assumptions + (this.data.pendingFees ? '；还有 ' + this.data.pendingFees + ' 项未填' : ''), '时间按填写内容推算，非实时导航；不含出发地到首站、末站返回住处及跨日交通。出发前核对开放、预约和实际交通。', '来自万绿智游')
    ui.copy(lines.join('\n'), '行程文字已复制')
  },
  photoError(e) { this.setData({ ['failedPhotos.' + e.currentTarget.dataset.id]: true }) },
  detail(e) { ui.detail(e.currentTarget.dataset.id) },
  navigate(e) { ui.navigate(e.currentTarget.dataset.id) },
  home: ui.home,
  onShareAppMessage() { const view = this.data.view; return view ? { title: view.plan.title + '｜万绿智游', path: '/pages/plan-result/plan-result?' + this.data.shareQuery, imageUrl: this.data.heroPhoto } : ui.homeShare() },
  onShareTimeline() { return this.data.view ? { title: this.data.view.plan.title + '｜万绿智游', query: this.data.shareQuery, imageUrl: this.data.heroPhoto } : ui.homeTimeline() }
}))

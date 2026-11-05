const storage = require('../../utils/storage')
const planner = require('../../utils/planner')
const ui = require('../../utils/ui')
Page(ui.page({
  data: { plans: [], visiblePlans: [], favoriteCount: 0, legacyCount: 0, query: '', draftCount: 0, draftDays: 1, draftTitle: '', failedPhotos: {} },
  onShow() { ui.tab.call(this, 3, false); this.refresh() },
  refresh() {
    const plans = storage.getPlans().map(p => { const view = planner.describe(p), places = view.days.reduce((all, day) => all.concat(day.places), []), cover = places.find(place => place.photo); return Object.assign({}, p, { count: view.count, dateText: ui.formatDate(p.updatedAt), travelDate: view.dateLabel, photo: cover ? cover.photo : '', regionText: Array.from(new Set(places.map(place => place.region))).join(' · '), stopsText: places.map(place => place.shortName || place.name).join(' → ') }) })
    const draft = planner.describe(storage.getDraft())
    this.setData({ plans, favoriteCount: storage.favorites().length, legacyCount: storage.legacyPlans().length, draftCount: draft.count, draftDays: draft.days.length, draftTitle: draft.plan.title }); this.filterPlans()
  },
  search(e) { this.setData({ query: e.detail.value }); this.filterPlans() },
  clearSearch() { this.setData({ query: '' }); this.filterPlans() },
  filterPlans() { const query = this.data.query.trim().toLowerCase(); this.setData({ visiblePlans: this.data.plans.filter(p => !query || [p.title, p.stopsText, p.regionText, p.travelDate].join(' ').toLowerCase().indexOf(query) >= 0) }) },
  open(e) { if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”'); wx.navigateTo({ url: '/pages/plan-result/plan-result?id=' + encodeURIComponent(e.currentTarget.dataset.id) }) },
  remove(e) { const id = e.currentTarget.dataset.id; wx.showModal({ title: '删除这份行程？', content: '删除后无法从已保存列表恢复。当前编辑草稿不会被删除。', confirmText: '删除', confirmColor: '#A04D38', success: r => { if (r.confirm) { try { storage.removePlan(id); this.refresh(); ui.toast('已删除') } catch (e) { ui.fail(e) } } } }) },
  favorites() { getApp().globalData.browseFilter = '收藏'; wx.switchTab({ url: '/pages/attractions/attractions' }) },
  plan() { wx.switchTab({ url: '/pages/plan/plan' }) },
  goFeedback() { wx.navigateTo({ url: '/pages/feedback/feedback' }) },
  about() { wx.navigateTo({ url: '/pages/about/about' }) },
  photoError(e) { this.setData({ ['failedPhotos.' + e.currentTarget.dataset.id]: true }) },
  importLegacy() {
    wx.showModal({ title: '导入旧版行程', content: '只导入能完整识别的 1–2 天路线。旧版价格、评分和时间表不会沿用，旧数据仍保留。', confirmText: '开始导入', success: r => {
      if (!r.confirm) return
      try { const result = storage.importLegacy(); this.refresh(); wx.showModal({ title: '导入完成', content: '新导入 ' + result.imported + ' 份，' + result.skipped + ' 份因格式、地点、天数或保存数量限制未导入。旧数据全部保留，相同内容不会重复添加。', showCancel: false }) } catch (e) { ui.fail(e) }
    } })
  },
  onShareAppMessage: ui.homeShare
}))

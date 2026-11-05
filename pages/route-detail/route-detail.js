const { getRoute, getPlace } = require('../../utils/data')
const planner = require('../../utils/planner')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
Page(ui.page({
  data: { route: null, days: [], stopCount: 0, regions: '', transport: '', coverPhoto: '', coverCredit: '' },
  onLoad(options) {
    const route = getRoute((options || {}).id)
    const days = route ? route.days.map((ids, i) => ({ day: i + 1, places: ids.map(getPlace).filter(Boolean) })) : []
    const places = [].concat.apply([], days.map(d => d.places)), cover = route ? getPlace(route.cover) : null
    this.setData({ route, days, stopCount: places.length, regions: Array.from(new Set(places.map(p => p.region))).join(' / '), transport: route ? ({ drive: '建议先确认往返交通', walk: '适合步行串联', transit: '先查班次，再排时间' }[route.mode] || '按出发地选择交通') : '', coverPhoto: route ? route.photo || (cover && cover.photo) || '' : '', coverCredit: route ? route.photoCredit || (cover && cover.photoCredit) || '' : '' })
    ui.enableShare(!!route)
  },
  preview() {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    if (this.data.coverPhoto) ui.previewPhotos([this.data.coverPhoto], this.data.coverPhoto)
  },
  use() {
    const route = this.data.route
    if (!route) return
    let draft
    try { draft = storage.getDraft(true) } catch (e) { ui.fail(e); return }
    const go = () => { try { storage.setDraft(planner.fromRoute(route.id)); ui.editor('已打开编辑草稿') } catch (e) { ui.fail(e) } }
    if (draft.days.some(d => d.length)) wx.showModal({ title: '用这条路线开始安排？', content: '会替换当前编辑草稿。需要保留原草稿时，请先到“行程”保存。', confirmText: '使用路线', success: r => { if (r.confirm) go() } })
    else go()
  },
  detail(e) { ui.detail(e.currentTarget.dataset.id) },
  home: ui.home,
  onShareAppMessage() { const r = this.data.route; return r ? { title: r.title + '｜万绿智游', path: '/pages/route-detail/route-detail?id=' + r.id, imageUrl: this.data.coverPhoto } : ui.homeShare() },
  onShareTimeline() { const r = this.data.route; return r ? { title: r.title + '｜万绿智游', query: 'id=' + r.id, imageUrl: this.data.coverPhoto } : ui.homeTimeline() }
}))

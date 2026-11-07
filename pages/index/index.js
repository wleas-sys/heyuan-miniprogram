const { ROUTES, PLACES } = require('../../utils/data')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
const featuredIds = ['wanlvhu', 'konglong', 'tuocheng', 'xiankeng', 'huoshan', 'linzhai']
const featured = featuredIds.map(id => PLACES.find(p => p.id === id)).filter(Boolean)
PLACES.forEach(p => { if (featured.length < 6 && !featured.some(f => f.id === p.id)) featured.push(p) })
function card(p) { return Object.assign({}, p, { teaser: (p.highlights || [])[0] || (p.intro || '').split('。')[0] }) }
Page(ui.page({
  data: {
    routes: ROUTES.slice(0, 3).map(r => Object.assign({}, r, { stopCount: r.days.reduce((n, d) => n + d.length, 0) })), routesExpanded: false, routeCount: ROUTES.length,
    places: featured.map(card), hero: PLACES.find(p => p.id === 'wanlvhu') || PLACES[0],
    draftCount: 0, draftDays: 1, draftTitle: '', keyword: '', placeCount: PLACES.length, heroFailed: false,
    scenes: [{ category: '人文', title: '古城与看展', note: '走进河源的故事', icon: 'culture' }, { category: '山水', title: '湖山与户外', note: '留一天给山水', icon: 'landscape' }, { category: '温泉', title: '温泉与休息', note: '放慢周末的脚步', icon: 'spring' }]
  },
  onShow() { ui.tab.call(this, 0); const draft = storage.getDraft(); this.setData({ draftCount: draft.days.reduce((n, d) => n + d.length, 0), draftDays: draft.days.length, draftTitle: draft.title }) },
  toggleRoutes() { const expanded = !this.data.routesExpanded; ui.haptic(); this.setData({ routesExpanded: expanded, routes: (expanded ? ROUTES : ROUTES.slice(0, 3)).map(r => Object.assign({}, r, { stopCount: r.days.reduce((n, d) => n + d.length, 0) })) }) },
  feedback() { if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”'); wx.navigateTo({ url: '/pages/feedback/feedback' }) },
  input(e) { this.setData({ keyword: e.detail.value }) },
  search() {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    getApp().globalData.browseKeyword = this.data.keyword.trim()
    getApp().globalData.browseFilter = '全部'
    wx.switchTab({ url: '/pages/attractions/attractions' })
  },
  goPlaces(e) { getApp().globalData.browseFilter = e.currentTarget.dataset.category || '全部'; wx.switchTab({ url: '/pages/attractions/attractions' }) },
  goPlan() { wx.switchTab({ url: '/pages/plan/plan' }) },
  goCreate() { if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”'); wx.navigateTo({ url: '/pages/plan-create/plan-create', fail: () => ui.toast('暂时无法打开，请重试') }) },
  goChat() { if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”'); wx.navigateTo({ url: '/pages/chat/chat', fail: () => ui.toast('暂时无法打开，请重试') }) },
  photoError(e) {
    const kind = e.currentTarget.dataset.kind, index = Number(e.currentTarget.dataset.index)
    if (kind === 'hero') return this.setData({ heroFailed: true })
    if ((kind === 'places' || kind === 'routes') && Number.isInteger(index) && this.data[kind][index]) this.setData({ [kind + '[' + index + '].photo']: '' })
  },
  goRoute(e) { wx.navigateTo({ url: '/pages/route-detail/route-detail?id=' + e.currentTarget.dataset.id }) },
  goDetail(e) { ui.detail(e.currentTarget.dataset.id) },
  goFood() { wx.navigateTo({ url: '/pages/food/food' }) },
  onShareAppMessage: ui.homeShare,
  onShareTimeline: ui.homeTimeline
}))

const { ROUTES, PLACES } = require('../../utils/data')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
const featuredIds = ['wanlvhu', 'konglong', 'tuocheng', 'xiankeng', 'huoshan', 'linzhai']
const featured = featuredIds.map(id => PLACES.find(p => p.id === id)).filter(Boolean)
PLACES.forEach(p => { if (featured.length < 6 && !featured.some(f => f.id === p.id)) featured.push(p) })
function card(p) { return Object.assign({}, p, { teaser: (p.highlights || [])[0] || (p.intro || '').split('。')[0] }) }
// 路线卡组：收起时每张只露 52rpx 的卡头（互压 1/3），点一下散开
const SHEET_H = 158, DECK_STEP = 52, SHEET_GAP = 16
function routeCards(list) { return list.map(r => Object.assign({}, r, { stopCount: r.days.reduce((n, d) => n + d.length, 0) })) }
function deckOf(count) { return { deckCollapsed: SHEET_H + DECK_STEP * Math.max(0, count - 1), deckSpread: SHEET_H + (SHEET_H + SHEET_GAP) * Math.max(0, count - 1) } }
const firstRoutes = routeCards(ROUTES.slice(0, 3))
Page(ui.page({
  data: {
    routes: firstRoutes, routesExpanded: false, routesSpread: false, routeCount: ROUTES.length, deckCollapsed: deckOf(firstRoutes.length).deckCollapsed, deckSpread: deckOf(firstRoutes.length).deckSpread,
    places: featured.map(card), hero: PLACES.find(p => p.id === 'wanlvhu') || PLACES[0],
    draftCount: 0, draftDays: 1, draftTitle: '', keyword: '', placeCount: PLACES.length, heroFailed: false, ripples: [],
    sceneActive: -1,
    scenes: [{ category: '人文', title: '古城与看展', note: '走进河源的故事', icon: 'culture' }, { category: '山水', title: '湖山与户外', note: '留一天给山水', icon: 'landscape' }, { category: '温泉', title: '温泉与休息', note: '放慢周末的脚步', icon: 'spring' }].map(item => Object.assign({}, item, { count: PLACES.filter(p => p.category === item.category).length }))
  },
  onShow() { ui.tab.call(this, 0); const draft = storage.getDraft(); this.setData({ draftCount: draft.days.reduce((n, d) => n + d.length, 0), draftDays: draft.days.length, draftTitle: draft.title }) },
  toggleRoutes() {
    const expanded = !this.data.routesExpanded
    const list = routeCards(expanded ? ROUTES : ROUTES.slice(0, 3))
    ui.haptic()
    this.setData(Object.assign({ routesExpanded: expanded, routes: list, routesSpread: false }, deckOf(list.length)))
  },
  // 收起时点一下散开看名字，散开后点某张才进入
  routeTap(e) {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    if (!this.data.routesSpread) { ui.haptic(); return this.setData({ routesSpread: true }) }
    this.goRoute(e)
  },
  collapseRoutes() { ui.haptic(); this.setData({ routesSpread: false }) },
  // 场景条：先展开看详情，再点一次进入对应分类
  sceneTap(e) {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    const index = Number(e.currentTarget.dataset.index)
    if (this.data.sceneActive === index) return this.goPlaces(e)
    ui.haptic()
    this.setData({ sceneActive: index })
  },
  feedback() { if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”'); wx.navigateTo({ url: '/pages/feedback/feedback' }) },
  input(e) { this.setData({ keyword: e.detail.value }) },
  clearKeyword() { this.setData({ keyword: '' }) },
  search() {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    getApp().globalData.browseKeyword = this.data.keyword.trim()
    getApp().globalData.browseFilter = '全部'
    wx.switchTab({ url: '/pages/attractions/attractions' })
  },
  goPlaces(e) { getApp().globalData.browseFilter = e.currentTarget.dataset.category || '全部'; wx.switchTab({ url: '/pages/attractions/attractions' }) },
  goPlan() { wx.switchTab({ url: '/pages/plan/plan' }) },
  ripple(e) { ui.ripple.call(this, e, '#heroCta') },
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

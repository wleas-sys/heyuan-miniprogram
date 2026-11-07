const { PLACES } = require('../../utils/data')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
const regions = ['全部地区'].concat(Array.from(new Set(PLACES.map(p => p.region))))
const categories = ['全部'].concat(Array.from(new Set(PLACES.map(p => p.category))))
// 首屏只渲染一页，滚到底再追加，避免 82 张卡片一次性铺开导致首次进入发卡
const PAGE = 24
function searchAll() {
  const query = this.data.keyword.trim().toLowerCase(), saved = storage.favorites()
  const match = (p, haystack) => (!query || haystack.indexOf(query) >= 0) && (this.data.category === '全部' || p.category === this.data.category) && (this.data.region === '全部地区' || p.region === this.data.region) && (!this.data.onlySaved || saved.indexOf(p.id) >= 0)
  let raw = PLACES.filter(p => match(p, [p.name, p.shortName, p.category, p.region].concat(p.tags || []).join(' ').toLowerCase()))
  // 核心字段没命中时，再放宽到地址等长文本，避免用户搜“高新路”之类时一无所获
  if (query && !raw.length) raw = PLACES.filter(p => match(p, [p.name, p.shortName, p.category, p.region, p.address].join(' ').toLowerCase()))
  if (query) {
    // 名称命中排在前面，其余保持原顺序
    raw = raw.slice().sort((a, b) => {
      const aHit = (a.name + a.shortName).toLowerCase().indexOf(query) >= 0 ? 1 : 0
      const bHit = (b.name + b.shortName).toLowerCase().indexOf(query) >= 0 ? 1 : 0
      return bHit - aHit
    })
  }
  return { list: raw.map(p => Object.assign({}, p, { saved: saved.indexOf(p.id) >= 0, teaser: (p.highlights || [])[0] || (p.intro || '').split('。')[0], cardTags: (p.tags || []).slice(0, 2) })), saved }
}
Page(ui.page({
  data: { keyword: '', category: '全部', categories, region: '全部地区', regions, onlySaved: false, list: [], total: 0, hasFilters: false, savedCount: 0, catInto: 'cat-0', regionInto: 'reg-0', poppedId: '', burstId: '', burstDots: [0, 1, 2, 3, 4, 5], loadedPhotos: {}, failedPhotos: {}, switchElastic: false },
  onShow() {
    ui.tab.call(this, 1)
    const global = getApp().globalData, filter = global.browseFilter
    if (filter) {
      this.setData({ category: categories.indexOf(filter) >= 0 ? filter : '全部', region: '全部地区', keyword: '', onlySaved: filter === '收藏' })
      global.browseFilter = null
    }
    if (typeof global.browseKeyword === 'string') { this.setData({ keyword: global.browseKeyword }); global.browseKeyword = null }
    this.refresh()
  },
  onHide() { this.stopTimer() },
  onUnload() { this.stopTimer() },
  onReachBottom() { this.more() },
  stopTimer() {
    if (this._timer && typeof clearTimeout === 'function') clearTimeout(this._timer)
    this._timer = null
  },
  // 筛选条件签名：只有条件真的变了才把分页打回第一页
  signature() { return [this.data.keyword.trim(), this.data.category, this.data.region, this.data.onlySaved].join('|') },
  refresh() {
    const result = searchAll.call(this)
    const sign = this.signature()
    const keep = sign === this._sig && this._shown
    this._sig = sign
    this._shown = keep ? Math.max(PAGE, this._shown) : PAGE
    this._all = result.list
    this.setData({
      list: result.list.slice(0, this._shown), total: result.list.length, savedCount: result.saved.length,
      hasFilters: !!this.data.keyword.trim() || this.data.category !== '全部' || this.data.region !== '全部地区' || this.data.onlySaved
    })
  },
  more() {
    if (!this._all || this.data.list.length >= this._all.length) return
    this._shown = (this._shown || PAGE) + PAGE
    this.setData({ list: this._all.slice(0, this._shown) })
  },
  // 输入时立即回显，过滤延后 180ms，连续打字不会每次都重排整页
  search(e) {
    this.setData({ keyword: e.detail.value })
    this.stopTimer()
    if (typeof setTimeout !== 'function') return this.refresh()
    this._timer = setTimeout(() => { this._timer = null; this.refresh() }, 180)
  },
  category(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ category: value, catInto: 'cat-' + Math.max(0, categories.indexOf(value)) })
    this.refresh(); ui.scrollTop(0)
  },
  changeRegion(e) {
    const value = e.currentTarget.dataset.value
    this.setData({ region: value, regionInto: 'reg-' + Math.max(0, regions.indexOf(value)) })
    this.refresh(); ui.scrollTop(0)
  },
  toggleSaved() {
    this.setData({ onlySaved: !this.data.onlySaved })
    this.refresh(); ui.scrollTop(0); ui.haptic()
    // 滑钮先横向拉长、落位再收回，用两段状态模拟有质量的弹性
    if (typeof setTimeout !== 'function') return
    this.setData({ switchElastic: true })
    if (this._switchTimer && typeof clearTimeout === 'function') clearTimeout(this._switchTimer)
    this._switchTimer = setTimeout(() => { this._switchTimer = null; this.setData({ switchElastic: false }) }, 200)
  },
  clearKeyword() { this.stopTimer(); this.setData({ keyword: '' }); this.refresh() },
  clear() { this.stopTimer(); this.setData({ keyword: '', category: '全部', region: '全部地区', onlySaved: false, catInto: 'cat-0', regionInto: 'reg-0' }); this.refresh() },
  favorite(e) {
    try {
      const id = e.currentTarget.dataset.id
      const wasSaved = storage.favorites().indexOf(id) >= 0
      storage.toggleFavorite(id)
      ui.haptic()
      this.refresh()
      // 只让刚点的那一个书签弹一下，避免整页收藏项一起动
      this.setData({ poppedId: wasSaved ? '' : id, burstId: wasSaved ? '' : id })
      if (this._popTimer && typeof clearTimeout === 'function') clearTimeout(this._popTimer)
      if (typeof setTimeout === 'function') this._popTimer = setTimeout(() => { this._popTimer = null; this.setData({ poppedId: '', burstId: '' }) }, 560)
      ui.toast(wasSaved ? '已取消收藏' : '已收藏，稍后再安排')
    } catch (error) { ui.fail(error) }
  },
  // 图片加载完再淡入；加载失败就退回文字占位，不留白块
  photoLoaded(e) { const id = e.currentTarget.dataset.id; if (id) this.setData({ ['loadedPhotos.' + id]: true }) },
  photoFailed(e) { const id = e.currentTarget.dataset.id; if (id) this.setData({ ['failedPhotos.' + id]: true }) },
  detail(e) { ui.detail(e.currentTarget.dataset.id) },
  onShareAppMessage() { const first = PLACES.find(p => p.photo); return { title: '万绿智游｜找一个想去的地方', path: '/pages/attractions/attractions', imageUrl: first ? first.photo : '' } },
  onShareTimeline() { const first = PLACES.find(p => p.photo); return { title: '万绿智游｜河源目的地手册', imageUrl: first ? first.photo : '' } }
}))

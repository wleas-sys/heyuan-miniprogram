const { PLACES } = require('../../utils/data')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
const regions = ['全部地区'].concat(Array.from(new Set(PLACES.map(p => p.region))))
const categories = ['全部'].concat(Array.from(new Set(PLACES.map(p => p.category))))
Page(ui.page({
  data: { keyword: '', category: '全部', categories, region: '全部地区', regions, onlySaved: false, list: [], hasFilters: false, savedCount: 0 },
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
  refresh() {
    const query = this.data.keyword.trim().toLowerCase(), saved = storage.favorites()
    let rawList = PLACES.filter(p => {
      const coreHaystack = [p.name, p.shortName, p.category, p.region].concat(p.tags || []).join(' ').toLowerCase()
      return (!query || coreHaystack.indexOf(query) >= 0) && (this.data.category === '全部' || p.category === this.data.category) && (this.data.region === '全部地区' || p.region === this.data.region) && (!this.data.onlySaved || saved.indexOf(p.id) >= 0)
    })
    if (query && rawList.length === 0) {
      rawList = PLACES.filter(p => {
        const broadHaystack = [p.name, p.shortName, p.category, p.region, p.address].join(' ').toLowerCase()
        return broadHaystack.indexOf(query) >= 0 && (this.data.category === '全部' || p.category === this.data.category) && (this.data.region === '全部地区' || p.region === this.data.region) && (!this.data.onlySaved || saved.indexOf(p.id) >= 0)
      })
    }
    if (query) {
      rawList.sort((a, b) => {
        const aHit = (a.name + a.shortName).toLowerCase().indexOf(query) >= 0 ? 1 : 0
        const bHit = (b.name + b.shortName).toLowerCase().indexOf(query) >= 0 ? 1 : 0
        return bHit - aHit
      })
    }
    const list = rawList.map(p => Object.assign({}, p, { saved: saved.indexOf(p.id) >= 0, teaser: (p.highlights || [])[0] || (p.intro || '').split('。')[0], cardTags: (p.tags || []).slice(0, 2) }))
    this.setData({ list, savedCount: saved.length, hasFilters: !!query || this.data.category !== '全部' || this.data.region !== '全部地区' || this.data.onlySaved })
  },
  search(e) { this.setData({ keyword: e.detail.value }); this.refresh() },
  category(e) { this.setData({ category: e.currentTarget.dataset.value }); this.refresh() },
  changeRegion(e) { this.setData({ region: e.currentTarget.dataset.value }); this.refresh() },
  toggleSaved() { this.setData({ onlySaved: !this.data.onlySaved }); this.refresh() },
  clearKeyword() { this.setData({ keyword: '' }); this.refresh() },
  clear() { this.setData({ keyword: '', category: '全部', region: '全部地区', onlySaved: false }); this.refresh() },
  favorite(e) { try { const id = e.currentTarget.dataset.id; const wasSaved = storage.favorites().indexOf(id) >= 0; storage.toggleFavorite(id); this.refresh(); ui.toast(wasSaved ? '已取消收藏' : '已收藏，稍后再安排') } catch (error) { ui.fail(error) } },
  detail(e) { ui.detail(e.currentTarget.dataset.id) },
  onShareAppMessage() { const first = PLACES.find(p => p.photo); return { title: '万绿智游｜找一个想去的地方', path: '/pages/attractions/attractions', imageUrl: first ? first.photo : '' } },
  onShareTimeline() { const first = PLACES.find(p => p.photo); return { title: '万绿智游｜河源目的地手册', imageUrl: first ? first.photo : '' } }
}))

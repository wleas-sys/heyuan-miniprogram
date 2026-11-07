const { getPlace } = require('./data')
const galleryPackages = require('./gallery-packages')
function toast(title) { wx.showToast({ title, icon: 'none' }) }
function fail(error) { toast(error && error.message ? error.message : '操作未完成，请重试') }
// 轻触反馈：模拟器、部分安卓机与分享单页没有该能力，静默跳过即可。
function haptic(type) {
  try {
    if (typeof wx !== 'undefined' && typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: type || 'light', fail() {} })
  } catch (e) {}
}
// 筛选条件变化后把页面拉回列表起点，避免停在空白的滚动位置。
function scrollTop(value) {
  try {
    if (typeof wx !== 'undefined' && typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: typeof value === 'number' ? value : 0, duration: 260, fail() {} })
  } catch (e) {}
}
function singlePage() { try { const options = typeof wx.getEnterOptionsSync === 'function' ? wx.getEnterOptionsSync() : typeof wx.getLaunchOptionsSync === 'function' ? wx.getLaunchOptionsSync() : {}; return options.scene === 1154 } catch (e) { return false } }
// Timeline preview can read content, but editing/navigation need the full mini program.
function page(config) {
  const show = config.onShow
  config.data = Object.assign({ singlePage: false }, config.data)
  config.onShow = function () { this.setData({ singlePage: singlePage() }); if (show) return show.apply(this, arguments) }
  const actions = ['favorite', 'add', 'navigate', 'copyAddress', 'call', 'copySource', 'booking', 'home', 'save', 'edit', 'detail', 'use', 'goPlaces', 'goPlan', 'goRoute', 'goDetail', 'goFood', 'toggleSaved', 'copy', 'copyLink', 'favorites', 'plan', 'about', 'remove', 'importLegacy']
  actions.forEach(key => { const action = config[key]; if (typeof action === 'function') config[key] = function () { if (singlePage()) return toast('请先点击底部“前往小程序”'); return action.apply(this, arguments) } })
  return config
}
function enableShare(timeline = true) {
  if (singlePage()) return
  wx.showShareMenu({ menus: timeline ? ['shareAppMessage', 'shareTimeline'] : ['shareAppMessage'],
    success() { if (!timeline) wx.hideShareMenu({ menus: ['shareTimeline'], fail() {} }) }, fail() {} })
}
function tab(selected, timeline = true) { if (typeof this.getTabBar === 'function' && this.getTabBar()) this.getTabBar().setData({ selected, hidden: false }); enableShare(timeline) }
function homeShare() { const p = getPlace('wanlvhu'); return { title: '万绿智游｜安排一趟河源行程', path: '/pages/index/index', imageUrl: p && p.photo || '' } }
function homeTimeline() { const p = getPlace('wanlvhu'); return { title: '万绿智游｜安排一趟河源行程', imageUrl: p && p.photo || '' } }
function copy(text, message) { if (!text) return; wx.setClipboardData({ data: text, success: () => toast(message || '已复制，可粘贴查看'), fail: () => toast('复制失败，请重试') }) }
// Resolve packaged assets to paths understood by the native image viewer.
function previewPhotos(files, current) {
  if (singlePage()) return toast('请先点击底部“前往小程序”')
  if (!Array.isArray(files) || !files.length) return
  const index = Math.max(0, files.indexOf(current)), urls = new Array(files.length)
  let pending = files.length, failed = false
  const open = () => wx.previewImage({ urls, current: urls[index], fail: () => toast('暂时无法打开大图，请重试') })
  files.forEach((src, i) => {
    if (typeof wx.getImageInfo !== 'function') { urls[i] = src; if (--pending === 0) open(); return }
    wx.getImageInfo({ src, success: result => { if (failed) return; urls[i] = result.path || src; if (--pending === 0) open() }, fail: () => { if (!failed) toast('图片暂时无法读取，请稍后重试'); failed = true } })
  })
}
function hasMap(p) {
  const m = p && p.map
  return !!m && Number.isFinite(m.latitude) && Number.isFinite(m.longitude) && m.latitude >= -90 && m.latitude <= 90 && m.longitude >= -180 && m.longitude <= 180
}
function navigate(placeId) {
  const p = getPlace(placeId)
  if (!p) return toast('地点不存在')
  if (!hasMap(p) || typeof wx.openLocation !== 'function') return copy(p.name + ' ' + p.address, '地址已复制，请到地图中搜索')
  wx.openLocation({ latitude: p.map.latitude, longitude: p.map.longitude, name: p.map.name || p.name, address: p.address, scale: 16,
    fail: () => wx.showModal({ title: '暂时无法打开地图', content: '可以复制地点与地址，到地图中搜索并确认入口。', confirmText: '复制地址', success: r => { if (r.confirm) copy(p.name + ' ' + p.address) } }) })
}
function formatDate(ts) { const d = new Date(ts); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') }
function detailPackage(id) { return galleryPackages[id] || 'pkg-detail' }
function detailUrl(id) { return '/' + detailPackage(id) + '/pages/attraction-detail/attraction-detail?id=' + encodeURIComponent(id) }
function detail(id) { wx.navigateTo({ url: detailUrl(id), fail: () => toast('景点暂时无法打开，请重试') }) }
function editor(message) {
  const app = getApp(); if (app && app.globalData) app.globalData.editIntent = { message: typeof message === 'string' ? message : '' }
  wx.switchTab({ url: '/pages/plan/plan', fail: () => toast('草稿已保留，请从底部“行程”打开') })
}
function home() { wx.switchTab({ url: '/pages/index/index' }) }
module.exports = { toast, fail, haptic, scrollTop, singlePage, page, enableShare, tab, homeShare, homeTimeline, copy, previewPhotos, navigate, formatDate, detailPackage, detailUrl, detail, home, editor }

const notes = require('./notes')
const events = require('./events')
const { getPlace, sourcesFor, DATA_VERSION } = require('./data')
const planner = require('./planner')
const storage = require('./storage')
const ui = require('./ui')
function pictures(place) {
  if (!place) return []
  const source = place.images && place.images.length ? place.images : place.photo ? [{ file: place.photo, credit: place.photoCredit || '', subject: place.name, portrait: !!place.photoPortrait }] : []
  return source.filter((p, i, arr) => p.file && arr.findIndex(x => x.file === p.file) === i).map((p, i) => Object.assign({}, p, { portrait: !!p.portrait || (p.height > p.width) || (i === 0 && !!place.photoPortrait), creditText: p.credit || place.photoCredit || '' }))
}
module.exports = function createDetailPage(packageRoot) { return ui.page({
  data: { galleryPending: false, galleryError: false, place: null, photos: [], noteOpen: false, noteText: '', noteError: '', noteStatus: '', previousDraft: '', previousDraftError: '', previousDraftOpen: false, currentPhoto: 0, sources: [], sourcesOpen: false, saved: false, added: false, checkedAt: DATA_VERSION, tips: [], highlights: [] },
  onLoad(options) {
    const place = getPlace((options || {}).id)
    this._galleryTarget = place && ui.detailPackage(place.id) !== packageRoot ? ui.detailUrl(place.id) : ''
    const localPhotos = pictures(place).filter(p => p.file.startsWith('/assets/') || p.file.startsWith('/' + packageRoot + '/'))
    this.setData({ galleryPending: !!this._galleryTarget, place, photos: localPhotos, currentPhoto: 0, sources: place ? sourcesFor(place) : [], tips: place ? (place.visitTips || place.practical || []) : [], highlights: place ? (place.highlights || []) : [] })
    ui.enableShare(!!place)
  },
  onShow() {
    this.refresh()
    if (!this.data.place) return
    if (!ui.singlePage()) {
      this.readNote()
      try { this.setData({ previousDraft: notes.readPreviousDraft(this.data.place.id).text, previousDraftError: '' }) }
      catch (e) { this.setData({ previousDraftError: e.message }) }
    } else this.setData({ noteOpen: false, noteText: '', noteError: '', noteStatus: '', previousDraft: '', previousDraftError: '', previousDraftOpen: false })
    if (this._galleryTarget && !this._galleryRedirectAttempted && !ui.singlePage()) this.openFullGallery()
  },
  openFullGallery() {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”查看完整图集')
    if (!this._galleryTarget || this._galleryRedirecting) return
    this._galleryRedirectAttempted = true
    this._galleryRedirecting = true
    wx.redirectTo({ url: this._galleryTarget, fail: () => { this._galleryRedirecting = false; this.setData({ galleryError: true }); ui.toast('图集暂时无法打开，请重试') } })
  },
  onHide() { this.persistNote() },
  onUnload() { this.persistNote() },
  refresh() { if (!this.data.place) return; const id = this.data.place.id; this.setData({ saved: storage.favorites().indexOf(id) >= 0, added: storage.getDraft().days.some(d => d.indexOf(id) >= 0) }) },
  imageChange(e) { const index = Number(e.detail.current); if (index >= 0 && index < this.data.photos.length) this.setData({ currentPhoto: index }) },
  preview(e) {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    const photos = this.data.photos, index = e && e.currentTarget ? Number(e.currentTarget.dataset.index) : this.data.currentPhoto
    if (!photos.length) return
    ui.previewPhotos(photos.map(p => p.file), (photos[index] || photos[0]).file)
  },
  openNotes() {
    if (ui.singlePage()) return
    if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ selector: '#notes', duration: 250, fail() {} })
  },
  writeNote() { if (!ui.singlePage()) { this.setData({ noteOpen: true, noteStatus: '' }); this.openNotes() } },
  applyNote(value) { this._noteLoaded = true; this._noteBaseline = value; this._noteDirty = false; this.setData({ noteText: value.text, noteError: '' }) },
  readNote() {
    if (ui.singlePage() || !this.data.place) return
    try {
      const value = notes.read(this.data.place.id)
      if (this._noteDirty) {
        if (!this._noteLoaded || !notes.same(value, this._noteBaseline)) this.setData({ noteError: '随手记已在其他页面更新；请先复制当前输入，再重新读取' })
        return
      }
      this.applyNote(value)
    } catch (e) { this.setData({ noteError: e.message }) }
  },
  noteInput(e) {
    if (ui.singlePage()) return
    const text = String(e.detail.value || '').slice(0, 500)
    this._noteDirty = !this._noteLoaded || text !== this._noteBaseline.text
    this.setData({ noteText: text, noteStatus: '' })
  },
  persistNote() {
    if (ui.singlePage() || !this.data.place) return false
    if (!this._noteLoaded) { if (this._noteDirty) this.setData({ noteError: '原记录尚未读取，当前输入未覆盖；请先复制输入再重新读取' }); return false }
    try {
      if (!this._noteDirty) { this.applyNote(notes.read(this.data.place.id)); return true }
      this.applyNote(notes.save(this.data.place.id, this.data.noteText, this._noteBaseline))
      return true
    } catch (e) { this.setData({ noteError: e.message }); return false }
  },
  saveNote() { if (this.persistNote()) this.setData({ noteStatus: this.data.noteText ? '已保存到本机，仅自己可见' : '本机随手记已清空' }) },
  closeNote() { if (this.persistNote()) this.setData({ noteOpen: false }) },
  copyNoteInput() { if (!ui.singlePage() && this.data.noteText) ui.copy(this.data.noteText, '当前输入已复制') },
  reloadNote() {
    if (ui.singlePage() || !this.data.place) return
    const reload = () => { try { this.applyNote(notes.read(this.data.place.id)); this.setData({ noteStatus: '' }) } catch (e) { this.setData({ noteError: e.message }) } }
    if (this._noteDirty) wx.showModal({ title: '重新读取本机随手记？', content: '当前未保存的输入将被替换。如需保留，请先取消并复制当前输入。', confirmText: '重新读取', success: r => { if (r.confirm) reload() } })
    else reload()
  },
  togglePreviousDraft() { if (!ui.singlePage()) this.setData({ previousDraftOpen: !this.data.previousDraftOpen }) },
  deletePreviousDraft() {
    if (ui.singlePage() || !this.data.place || !this.data.previousDraft || this.data.previousDraftError) return
    const id = this.data.place.id, expected = this.data.previousDraft
    wx.showModal({ title: '删除此前保存的本机草稿？', content: '只删除这条本机草稿，删除后无法恢复。', confirmText: '删除', success: r => {
      if (!r.confirm) return
      try { notes.clearPreviousDraft(id, expected); this.setData({ previousDraft: '', previousDraftOpen: false }); ui.toast('本机草稿已删除') } catch (e) { ui.fail(e) }
    } })
  },
  feedback() { if (!ui.singlePage() && this.data.place) wx.navigateTo({ url: '/pages/feedback/feedback?place=' + this.data.place.id }) },
  toggleSources() { this.setData({ sourcesOpen: !this.data.sourcesOpen }) },
  favorite() { if (!this.data.place) return; try { storage.toggleFavorite(this.data.place.id); this.refresh(); events.record(this.data.saved ? 'favorite' : 'unfavorite', this.data.place.id); ui.toast(this.data.saved ? '已收藏这个地点' : '已取消收藏') } catch (e) { ui.fail(e) } },
  add() {
    if (!this.data.place) return
    if (this.data.added) return ui.editor()
    let draft
    try { draft = storage.getDraft(true) } catch (e) { return ui.fail(e) }
    const write = day => { try { storage.setDraft(planner.addStop(draft, this.data.place.id, day)); events.record('add', this.data.place.id); this.refresh(); ui.toast('已加入第 ' + (day + 1) + ' 天') } catch (e) { ui.fail(e) } }
    if (draft.days.length === 1) write(0)
    else wx.showActionSheet({ itemList: draft.days.map((d, i) => '加入第 ' + (i + 1) + ' 天'), success: r => write(r.tapIndex) })
  },
  navigate() { if (this.data.place) ui.navigate(this.data.place.id) },
  copyAddress() { if (this.data.place) ui.copy(this.data.place.name + ' ' + this.data.place.address, '地址已复制') },
  call() { if (!this.data.place) return; const phone = this.data.place.phone; if (phone) wx.makePhoneCall({ phoneNumber: phone, fail: () => ui.toast('未能拨出，可稍后重试') }) },
  copySource(e) { const source = this.data.sources.find(s => s.id === e.currentTarget.dataset.id); if (source) ui.copy(source.url, '来源链接已复制，可粘贴到浏览器') },
  copyPhotoSource(e) {
    if (ui.singlePage()) return ui.toast('请先点击底部“前往小程序”')
    const photo = this.data.photos[Number(e.currentTarget.dataset.index)]
    if (photo && photo.source) ui.copy(photo.source, '图片来源链接已复制')
  },
  booking() { if (this.data.place) ui.copy(this.data.place.bookingUrl, '官方页面链接已复制') },
  home: ui.home,
  onShareAppMessage() { const p = this.data.place; return p ? { title: p.name + '｜万绿智游', path: ui.detailUrl(p.id), imageUrl: p.photo || '' } : ui.homeShare() },
  onShareTimeline() { const p = this.data.place; return p ? { title: p.name + '｜万绿智游', query: 'id=' + p.id, imageUrl: p.photo || '' } : ui.homeTimeline() }
}) }

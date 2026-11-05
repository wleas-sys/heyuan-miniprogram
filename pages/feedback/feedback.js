const ui = require('../../utils/ui')
const { getPlace } = require('../../utils/data')
const LEGACY = 'heyuan.feedbacks'
Page(ui.page({
  data: { place: null, context: '', contactPath: '/pages/index/index', contactTitle: '万绿智游 · 意见与反馈', history: [], historyOpen: false, historyError: '', helpOpen: false, contactOpen: false, isSimulator: false, feedbackSupported: true, feedbackAttempted: false },
  onLoad(options) {
    const place = getPlace(options && options.place)
    this.setData({ place, context: place ? '关于「' + place.name + '」的意见或信息纠错' : '', contactPath: place ? '/pkg-detail/pages/attraction-detail/attraction-detail?id=' + place.id : '/pages/index/index', contactTitle: place ? place.name + ' · 信息反馈' : '万绿智游 · 意见与反馈' })
    try {
      const device = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : typeof wx.getSystemInfoSync === 'function' ? wx.getSystemInfoSync() : {}
      this.setData({ isSimulator: device.platform === 'devtools', feedbackSupported: typeof wx.canIUse !== 'function' || wx.canIUse('button.open-type.feedback') })
    } catch (e) { /* Keep the native entry available if environment detection fails. */ }
    try { const raw = wx.getStorageSync(LEGACY); if (raw && !Array.isArray(raw)) throw new Error('旧记录格式异常'); this.setData({ history: (raw || []).filter(x => x && typeof x.content === 'string').slice(0, 20) }) }
    catch (e) { this.setData({ historyError: '旧版本机记录暂时无法读取，原记录未更改。' }) }
  },
  feedbackTap() {
    if (ui.singlePage()) return
    // Native feedback has no submission receipt callback. A tap is not a successful submission.
    this.setData({ feedbackAttempted: true, helpOpen: this.data.isSimulator || !this.data.feedbackSupported || this.data.helpOpen })
  },
  toggleHelp() { this.setData({ helpOpen: !this.data.helpOpen }) },
  toggleContact() { this.setData({ contactOpen: !this.data.contactOpen }) },
  toggleHistory() { this.setData({ historyOpen: !this.data.historyOpen }) },
  copyContext() { if (!ui.singlePage()) ui.copy(this.data.context, '已复制，可粘贴到反馈内容中') },
  copyLegacy(e) { if (ui.singlePage()) return; const item = this.data.history.find(x => x.id === e.currentTarget.dataset.id); if (item) ui.copy((item.typeLabel || '意见反馈') + '\n' + item.content, '已复制，请在微信反馈页或客服会话中粘贴发送') },
  clearHistory() {
    if (ui.singlePage()) return
    wx.showModal({ title: '清除旧版本机反馈记录？', content: '这些记录没有发送给团队。需要保留的内容请先复制；此操作只清除本机旧记录。', confirmText: '清除记录', success: r => { if (r.confirm) { try { wx.setStorageSync(LEGACY, []); this.setData({ history: [] }); ui.toast('本机旧记录已清除') } catch (e) { ui.fail(e) } } } })
  },
  home: ui.home
}))

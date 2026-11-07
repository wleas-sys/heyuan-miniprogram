const planning = require('../../utils/planning')
const model = require('../../utils/model')
const events = require('../../utils/events')
const { MODES } = require('../../utils/data')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
const DEFAULTS = { days: 1, date: '', mode: 'drive', pace: 'relaxed', interest: '全部', region: '全部', crowd: 'friends' }
const signature = value => JSON.stringify([value.days, value.date, value.mode, value.pace, value.interest, value.region, value.crowd])
Page(ui.page({
  data: {
    form: Object.assign({}, DEFAULTS), modes: MODES, paces: planning.OPTIONS.paces, crowds: model.CROWDS,
    interests: planning.OPTIONS.interests, regions: planning.OPTIONS.regions, regionIndex: 0,
    results: [], generated: false, changed: false, error: '', adopting: false,
    selectedSummary: '', draftCount: 0, emptyMessage: '', relaxLabel: '放宽兴趣与范围，再看看'
  },
  onLoad() { this._candidates = []; this._generation = ''; ui.enableShare() },
  onShow() { const draft = storage.getDraft(); this.setData({ draftCount: draft.days.reduce((sum, day) => sum + day.length, 0) }) },
  guard() { if (ui.singlePage()) { ui.toast('请先点击底部“前往小程序”'); return false } return true },
  update(patch) {
    if (!this.guard() || this.data.adopting) return
    const form = Object.assign({}, this.data.form, patch)
    if (signature(form) === signature(this.data.form)) return
    const changed = this.data.generated || this.data.changed
    this._candidates = []; this._generation = ''
    ui.haptic()
    this.setData({ form, results: [], generated: false, changed, error: '', selectedSummary: '', regionIndex: Math.max(0, this.data.regions.indexOf(form.region)) })
  },
  chooseDays(e) { const days = Number(e.currentTarget.dataset.value); if ([1, 2, 3, 4, 5].includes(days)) this.update({ days }) },
  chooseMode(e) { const mode = e.currentTarget.dataset.value; if (this.data.modes.some(item => item.key === mode)) this.update({ mode }) },
  choosePace(e) { const pace = e.currentTarget.dataset.value; if (this.data.paces.some(item => item.key === pace)) this.update({ pace }) },
  chooseCrowd(e) { const crowd = e.currentTarget.dataset.value; if (this.data.crowds.some(item => item.key === crowd)) this.update({ crowd }) },
  chooseInterest(e) { const interest = e.currentTarget.dataset.value; if (this.data.interests.some(item => item.key === interest)) this.update({ interest }) },
  changeRegion(e) { const index = Number(e.detail.value); if (Number.isInteger(index) && this.data.regions[index]) this.update({ region: this.data.regions[index] }) },
  changeDate(e) { const date = e.detail.value; if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) this.update({ date }) },
  clearDate() { this.update({ date: '' }) },
  generate() {
    if (!this.guard() || this.data.adopting) return
    const options = Object.assign({}, this.data.form, { history: events.counts() })
    try {
      const candidates = planning.recommend(options).slice(0, 3)
      this._candidates = candidates
      this._generation = signature(options)
      const mode = this.data.modes.find(item => item.key === options.mode)
      const pace = this.data.paces.find(item => item.key === options.pace)
      this.setData({
        results: candidates.map((item, index) => ({ id: item.id, number: String(index + 1).padStart(2, '0'), tag: item.tag || '参考方案', title: item.title, reason: item.reason, coverPhoto: item.coverPhoto || '', imageFailed: false, stopCount: item.stopCount, estimateText: item.estimateText, estimateNote: item.estimateNote, notes: item.notes || [], notesOpen: false, scoreText: item.scoreText, reasons: item.reasons || [],
          days: (item.daySummary || []).map(day => ({ label: day.label, names: (day.names || []).join(' → '), visitLabel: day.visitLabel })) })),
        generated: true, changed: false, error: '',
        emptyMessage: options.mode === 'walk' && options.days > 1 ? '现有可步行串联的地点适合一日安排，暂不拆成多天。可以改为步行一日，或换交通方式再规划多日行程。' : '现有地点里，暂时找不到同时满足天数、交通和偏好的组合。可以扩大活动范围、取消兴趣限制，或自己添加地点。',
        relaxLabel: options.mode === 'walk' && options.days > 1 ? '改为步行一日，再看看' : '放宽兴趣与范围，再看看',
        selectedSummary: options.days + ' 天 · ' + (mode ? mode.label : '') + ' · ' + (pace ? pace.label : '') + ' · ' + (options.region === '全部' ? '河源全域' : options.region)
      })
      if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ selector: '#recommendations', duration: 250, fail() {} })
      ui.haptic(candidates.length ? 'light' : 'medium')
    } catch (e) { this._candidates = []; this._generation = ''; this.setData({ results: [], generated: false, changed: false, error: e.message || '暂时无法生成方案，请重试' }) }
  },
  relax() { if (!this.guard()) return; const patch = { interest: '全部', region: '全部' }; if (this.data.form.mode === 'walk' && this.data.form.days > 1) patch.days = 1; this.update(patch); this.generate() },
  adopt(e) {
    if (!this.guard() || this.data.adopting) return
    if (!this._generation || this._generation !== signature(this.data.form)) return ui.toast('条件已变化，请重新生成方案')
    const candidate = (this._candidates || []).find(item => item.id === e.currentTarget.dataset.id)
    if (!candidate) return ui.toast('方案已更新，请重新选择')
    const generation = this._generation
    this.setData({ adopting: true })
    const use = () => {
      if (!this.guard() || generation !== this._generation) { this.setData({ adopting: false }); return }
      try {
        storage.setDraft(candidate.plan)
        const adopted = [].concat.apply([], candidate.plan.days)
        adopted.forEach(id => events.record('adopt', id))
        this.setData({ adopting: false })
        ui.haptic('medium')
        ui.editor('方案已采用，可继续调整')
      } catch (error) { this.setData({ adopting: false }); ui.fail(error) }
    }
    let draft
    try { draft = storage.getDraft(true) } catch (e) { this.setData({ adopting: false }); ui.fail(e); return }
    if (draft.days.some(day => day.length)) wx.showModal({ title: '采用这份行程方案？', content: '会替换当前正在编辑的草稿；已保存的行程不会改变。若要保留草稿，请先返回“行程”保存。', confirmText: '采用方案', cancelText: '暂不替换', success: result => { if (result.confirm) use(); else this.setData({ adopting: false }) }, fail: () => { this.setData({ adopting: false }); ui.toast('未替换草稿，请重试') } })
    else use()
  },
  imageError(e) { const index = this.data.results.findIndex(item => item.id === e.currentTarget.dataset.id); if (index >= 0) this.setData({ ['results[' + index + '].imageFailed']: true }) },
  toggleNotes(e) { const index = this.data.results.findIndex(item => item.id === e.currentTarget.dataset.id); if (index >= 0) this.setData({ ['results[' + index + '].notesOpen']: !this.data.results[index].notesOpen }) },
  goEditor() { if (this.guard()) ui.editor() },
  home: ui.home,
  onShareAppMessage: ui.homeShare,
  onShareTimeline: ui.homeTimeline
}))

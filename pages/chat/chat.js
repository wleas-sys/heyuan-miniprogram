const planning = require('../../utils/planning')
const events = require('../../utils/events')
const storage = require('../../utils/storage')
const ui = require('../../utils/ui')
const engine = require('../../utils/chat-engine')

// days 用 0 表示"还不知道"，区别于用户明确选的 1 天。
const DEFAULTS = { days: 0, date: '', mode: 'drive', pace: 'relaxed', interest: '全部', region: '全部', crowd: 'friends' }
const MODE_LABEL = { drive: '自驾', transit: '公交', walk: '步行' }
// 顶部一行「AI 现在理解成什么」，让人知道说的话有没有被听进去
function summaryOf(form) {
  if (!form || !form.days) return ''
  const parts = [form.days + ' 天']
  if (MODE_LABEL[form.mode]) parts.push(MODE_LABEL[form.mode])
  if (form.interest && form.interest !== '全部') parts.push(form.interest)
  parts.push(form.region && form.region !== '全部' ? form.region : '河源全域')
  return parts.join(' · ')
}

Page(ui.page({
  data: {
    messages: [], chips: [], input: '', busy: false, adopting: false, scrollInto: '', form: DEFAULTS,
    canSend: false, summaryText: '', ripples: []
  },

  onLoad() {
    this._seq = 1
    this._candidates = {}
    this._form = Object.assign({}, DEFAULTS)
    const greeting = engine.greeting()
    this.setData({
      form: Object.assign({}, DEFAULTS),
      messages: [{ id: 'm1', role: 'ai', text: greeting.text }],
      chips: greeting.chips,
      scrollInto: 'm1',
      canSend: false,
      summaryText: ''
    })
    ui.enableShare()
  },

  onInput(e) {
    const value = e.detail.value || ''
    this.setData({ input: value, canSend: !!value.trim() })
  },

  tapChip(e) { this.send(e.currentTarget.dataset.text) },

  ripple(e) { ui.ripple.call(this, e, '#chatSend') },

  // 输入框回车（confirm）会带 detail.value；但点「发送」按钮的 tap 事件没有 value，
  // 必须回落到输入框当前内容，否则按钮点了没反应。
  submit(e) {
    const detail = e && e.detail
    const typed = detail && typeof detail.value === 'string' ? detail.value : ''
    this.send(typed || this.data.input)
  },

  // 一次输入 = 解析条件 + 回一句 + （条件够时）直接给方案
  send(raw) {
    const text = String(raw || '').trim()
    if (!text || this.data.busy || this.data.adopting) return
    if (ui.singlePage()) return ui.toast('请先点击底部"前往小程序"')

    try {
      const patch = engine.parse(text)
      const form = Object.assign({}, this._form, patch)
      this._form = form

      const userMsg = { id: 'm' + (++this._seq), role: 'user', text }
      const messages = this.data.messages.concat([userMsg])
      ui.haptic()
      this.setData({ messages, input: '', canSend: false, busy: true, scrollInto: userMsg.id })

      const reply = engine.reply(form, patch, 0)
      let cards = []
      if (form.days) {
        try {
          const candidates = planning.recommend(Object.assign({}, form, { history: events.counts() })).slice(0, 3)
          cards = candidates.map((item, index) => this.toCard(item, index))
          Object.keys(this._candidates).forEach(key => delete this._candidates[key])
          candidates.forEach(item => { this._candidates[item.id] = item })
        } catch (e) { cards = [] }
        const said = engine.reply(form, patch, cards.length)
        this.pushAi(said.text, said.chips, cards)
      } else {
        this.pushAi(reply.text, reply.chips, [])
      }
    } finally {
      // 任何异常都不能把 busy 卡在 true，否则发送按钮会一直置灰
      if (this.data.busy) this.setData({ busy: false })
    }
  },

  pushAi(text, chips, cards) {
    const id = 'm' + (++this._seq)
    const messages = this.data.messages.concat([{ id, role: 'ai', text, chips: chips || [], cards: cards || [] }])
    this.setData({ messages, chips: chips || [], busy: false, scrollInto: id, form: Object.assign({}, this._form), summaryText: summaryOf(this._form) })
  },

  // 聊长了想重开：清屏但不动已经采用的草稿
  restart() {
    if (this.data.busy || this.data.adopting) return ui.toast('正在整理方案，请稍等一下')
    if (ui.singlePage()) return ui.toast('请先点击底部"前往小程序"')
    if (this.data.messages.length <= 1) return ui.toast('还没开始，直接说一句就行')
    wx.showModal({
      title: '重新开始？',
      content: '会清空当前对话，重新从一句描述开始；已经采用的行程草稿不受影响。',
      confirmText: '重新开始',
      cancelText: '继续聊',
      success: r => {
        if (!r.confirm) return
        this._seq = 1
        this._candidates = {}
        this._form = Object.assign({}, DEFAULTS)
        const greeting = engine.greeting()
        this.setData({
          form: Object.assign({}, DEFAULTS),
          messages: [{ id: 'm1', role: 'ai', text: greeting.text }],
          chips: greeting.chips,
          input: '', canSend: false, busy: false, adopting: false,
          scrollInto: 'm1', summaryText: ''
        })
        ui.haptic()
      }
    })
  },

  toCard(item, index) {
    return {
      id: item.id,
      number: String(index + 1).padStart(2, '0'),
      title: item.title,
      stopCount: item.stopCount,
      reason: item.reason,
      scoreText: item.scoreText,
      coverPhoto: item.coverPhoto || '',
      photoFailed: false,
      days: (item.daySummary || []).map(day => ({ label: day.label, names: (day.names || []).join(' → ') })),
      estimateText: item.estimateText
    }
  },

  photoError(e) {
    const messageId = e.currentTarget.dataset.msg, cardId = e.currentTarget.dataset.card
    const messages = this.data.messages.map(msg => {
      if (msg.id !== messageId || !msg.cards) return msg
      return Object.assign({}, msg, { cards: msg.cards.map(card => card.id === cardId ? Object.assign({}, card, { photoFailed: true }) : card) })
    })
    this.setData({ messages })
  },

  // 采用方案：和「按条件规划」页完全一致，写入草稿后进入行程编辑
  use(e) {
    if (this.data.adopting) return
    const candidate = this._candidates[e.currentTarget.dataset.id]
    if (!candidate) return ui.toast('方案已更新，请重新说说你的想法')
    this.setData({ adopting: true })
    const apply = () => {
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
    if (draft.days.some(day => day.length)) {
      wx.showModal({
        title: '采用这份行程方案？',
        content: '会替换当前正在编辑的草稿；已保存的行程不会改变。若要保留草稿，请先返回"行程"保存。',
        confirmText: '采用方案', cancelText: '暂不替换',
        success: r => { if (r.confirm) apply(); else this.setData({ adopting: false }) },
        fail: () => { this.setData({ adopting: false }); ui.toast('未替换草稿，请重试') }
      })
    } else apply()
  },

  // 有些人不想聊、想直接勾选——留一个出口（界面上暂未挂按钮，保留方法便于后续接入）
  goCreate() { if (!ui.singlePage()) wx.navigateTo({ url: '/pages/plan-create/plan-create' }) },
  home: ui.home,
  onShareAppMessage: ui.homeShare,
  onShareTimeline: ui.homeTimeline
}))

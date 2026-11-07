// 底部页签：跟手 Dock —— 手指经过时按距离放大，松手选中当前那个
const BASE_SCALE = 1
const MAX_LIFT = 0.34
const REACH = 112

Component({
  data: {
    selected: 0,
    hidden: false,
    scales: [BASE_SCALE, BASE_SCALE, BASE_SCALE, BASE_SCALE],
    list: [
      { path: '/pages/index/index', text: '首页', icon: '/assets/icons/discover.svg', selectedIcon: '/assets/icons/discover-active.svg' },
      { path: '/pages/attractions/attractions', text: '景点', icon: '/assets/icons/place.svg', selectedIcon: '/assets/icons/place-active.svg' },
      { path: '/pages/plan/plan', text: '行程', icon: '/assets/icons/trip.svg', selectedIcon: '/assets/icons/trip-active.svg' },
      { path: '/pages/profile/profile', text: '我的', icon: '/assets/icons/profile.svg', selectedIcon: '/assets/icons/profile-active.svg' }
    ]
  },
  lifetimes: {
    ready() { this.measure() }
  },
  methods: {
    measure() {
      if (typeof wx === 'undefined' || typeof wx.createSelectorQuery !== 'function') return
      try {
        wx.createSelectorQuery().in(this).selectAll('.tab').boundingClientRect(rects => {
          if (!rects || rects.length !== this.data.list.length) return
          this._centers = rects.map(rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }))
        }).exec()
      } catch (err) {}
    },
    barStart(e) {
      const touch = e.touches && e.touches[0]
      if (!touch) return
      this._startX = touch.clientX
      this._startY = touch.clientY
      this._dragging = false
    },
    barMove(e) {
      const touch = e.touches && e.touches[0]
      if (!touch || !this._centers) return
      if (!this._dragging && (Math.abs(touch.clientX - this._startX) > 6 || Math.abs(touch.clientY - this._startY) > 6)) this._dragging = true
      if (!this._dragging) return
      const scales = this._centers.map(center => {
        const distance = Math.sqrt(Math.pow(touch.clientX - center.x, 2) + Math.pow(touch.clientY - center.y, 2))
        const ratio = Math.max(0, 1 - distance / REACH)
        return Math.round((BASE_SCALE + MAX_LIFT * ratio) * 100) / 100
      })
      // 只有数值真的变了才 setData，避免每一帧都重排
      if (scales.some((scale, index) => Math.abs(scale - this.data.scales[index]) > 0.02)) this.setData({ scales })
    },
    barEnd(e) {
      const touch = e.changedTouches && e.changedTouches[0]
      const wasDragging = this._dragging
      this._dragging = false
      this.resetScales()
      if (!wasDragging || !touch || !this._centers) return
      let nearest = this.data.selected
      let best = Infinity
      this._centers.forEach((center, index) => {
        const distance = Math.sqrt(Math.pow(touch.clientX - center.x, 2) + Math.pow(touch.clientY - center.y, 2))
        if (distance < best) { best = distance; nearest = index }
      })
      if (nearest === this.data.selected) return
      this._suppressUntil = Date.now() + 600
      this.haptic()
      wx.switchTab({ url: this.data.list[nearest].path, fail() {} })
    },
    resetScales() {
      if (this.data.scales.some(scale => scale !== BASE_SCALE)) this.setData({ scales: this.data.list.map(() => BASE_SCALE) })
    },
    haptic() {
      try { if (typeof wx.vibrateShort === 'function') wx.vibrateShort({ type: 'light', fail() {} }) } catch (err) {}
    },
    go(e) {
      if (this._suppressUntil && Date.now() < this._suppressUntil) return
      const path = e.currentTarget.dataset.path
      const current = this.data.list[this.data.selected]
      // 已经在当前页签：再点一次回到顶部，比原地不动更符合预期
      if (current && current.path === path) {
        try { if (typeof wx.pageScrollTo === 'function') wx.pageScrollTo({ scrollTop: 0, duration: 260, fail() {} }) } catch (err) {}
        return
      }
      // 切换页签给一点触感，点错了也能立刻感知
      this.haptic()
      wx.switchTab({ url: path, fail() {} })
    }
  }
})

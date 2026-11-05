Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      { path: '/pages/index/index', text: '首页', icon: '/assets/icons/discover.svg', selectedIcon: '/assets/icons/discover-active.svg' },
      { path: '/pages/attractions/attractions', text: '景点', icon: '/assets/icons/place.svg', selectedIcon: '/assets/icons/place-active.svg' },
      { path: '/pages/plan/plan', text: '行程', icon: '/assets/icons/trip.svg', selectedIcon: '/assets/icons/trip-active.svg' },
      { path: '/pages/profile/profile', text: '我的', icon: '/assets/icons/profile.svg', selectedIcon: '/assets/icons/profile-active.svg' }
    ]
  },
  methods: {
    go(e) {
      wx.switchTab({ url: e.currentTarget.dataset.path })
    }
  }
})

const { VERSION, DATA_VERSION, SOURCES, PLACES, ROUTES } = require('../../utils/data')
const MEDIA = require('../../utils/media')
const ui = require('../../utils/ui')
Page(ui.page({
  data: {
    version: VERSION, checkedAt: DATA_VERSION, placeCount: PLACES.length, routeCount: ROUTES.length,
    photoCount: MEDIA.length, openSection: '', sources: Object.keys(SOURCES).map(id => Object.assign({ id }, SOURCES[id])), photos: MEDIA.map(photo => Object.assign({}, photo, { thumbnail: '/assets/covers/' + photo.id + '.jpg' }))
  },
  onLoad() { ui.enableShare() },
  toggle(e) { const key = e.currentTarget.dataset.section; this.setData({ openSection: this.data.openSection === key ? '' : key }) },
  copySource(e) { const s = SOURCES[e.currentTarget.dataset.id]; if (s) ui.copy(s.url) },
  copyLink(e) { ui.copy(e.currentTarget.dataset.url) },
  onShareAppMessage: ui.homeShare,
  onShareTimeline() { return Object.assign(ui.homeTimeline(), { title: '万绿智游 V' + VERSION + '｜关于与资料' }) }
}))

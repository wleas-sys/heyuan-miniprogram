const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = require('node:path').resolve(__dirname,'..')
const clone = value => JSON.parse(JSON.stringify(value))

// Run page code and its actual CommonJS dependencies against the same wx object.
// This checks page flows without claiming to emulate WeChat rendering or permissions.
function createHarness(seed = {}) {
  const memory = clone(seed), calls = [], replies = [], cache = new Map()
  const app = { globalData: { browseFilter: null } }
  const failures = {}
  let scene = 1001
  function record(api, options) { calls.push({ api, options }); return options || {} }
  const wx = {
    getStorageSync(key) { if (failures.read) throw new Error('读取失败'); return memory[key] === undefined ? '' : clone(memory[key]) },
    setStorageSync(key, value) { if (failures.write) throw new Error('存储空间不足'); memory[key] = clone(value) },
    getEnterOptionsSync: () => ({ scene }),
    getLaunchOptionsSync: () => ({ scene }),
    showToast(o) { record('showToast', o) },
    showShareMenu(o) { record('showShareMenu', o); if (o.success) o.success({}) },
    hideShareMenu(o) { record('hideShareMenu', o); if (o.success) o.success({}) },
    showModal(o) { record('showModal', o); const reply = replies.shift(); if (reply && o.success) o.success(reply) },
    showActionSheet(o) { record('showActionSheet', o); const reply = replies.shift(); if (reply && o.success) o.success(reply) },
    navigateTo(o) { record('navigateTo', o); if (o.success) o.success({}) },
    switchTab(o) { record('switchTab', o); if (o.success) o.success({}) },
    openLocation(o) { record('openLocation', o); const fn = failures.map ? o.fail : o.success; if (fn) fn({ errMsg: failures.map ? 'openLocation:fail' : 'openLocation:ok' }) },
    setClipboardData(o) { record('setClipboardData', o); const fn = failures.copy ? o.fail : o.success; if (fn) fn({}) },
    getImageInfo(o) { record('getImageInfo', o); const fn = failures.photoInfo ? o.fail : o.success; if (fn) fn({ path: o.src, width: 680, height: 450 }) },
    previewImage(o) { record('previewImage', o); const fn = failures.photo ? o.fail : o.success; if (fn) fn({}) },
    makePhoneCall(o) { record('makePhoneCall', o); const fn = failures.phone ? o.fail : o.success; if (fn) fn({ errMsg: failures.phone ? 'makePhoneCall:fail' : 'makePhoneCall:ok' }) }
  }
  function readModule(relative) {
    const file = path.resolve(root, relative)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }; cache.set(file, module)
    const requireLocal = p => readModule(path.relative(root, path.resolve(path.dirname(file), p + (path.extname(p) ? '' : '.js'))))
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: requireLocal, wx, getApp: () => app, console }, { filename: file })
    return module.exports
  }
  function load(relative, type = 'Page') {
    const file = path.resolve(root, relative)
    let result
    const requireLocal = p => readModule(path.relative(root, path.resolve(path.dirname(file), p + (path.extname(p) ? '' : '.js'))))
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { [type]: x => { result = x }, require: requireLocal, wx, getApp: () => app, console }, { filename: file })
    result.data = clone(result.data || {})
    result.setData = function (patch) {
      Object.entries(patch).forEach(([key, value]) => {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
        let target = this.data
        parts.slice(0, -1).forEach(part => { target = target[part] })
        target[parts.at(-1)] = clone(value)
      })
    }
    result.getTabBar = () => ({ setData(o) { record('tabSelected', o) } })
    return result
  }
  function page(name, options = {}, show = true) { const p = load('pages/' + name + '/' + name + '.js'); if (p.onLoad) p.onLoad(options); if (show && p.onShow) p.onShow(); return p }
  return { memory, calls, replies, failures, app, wx, page, load, module: readModule,
    setScene(value) { scene = value }, last(api) { return calls.filter(c => c.api === api).at(-1)?.options }, count(api) { return calls.filter(c => c.api === api).length },
    event(dataset = {}, value) { return { currentTarget: { dataset }, detail: { value } } }, clone }
}
module.exports = { createHarness, clone }

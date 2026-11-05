const { getPlace } = require('./data')
function key(id) { if (!getPlace(id)) throw new Error('地点不存在'); return 'wanlv.v22.note.' + id }
function read(id) {
  const value = wx.getStorageSync(key(id))
  if (value === '' || value === undefined || value === null) return { text: '', updatedAt: 0 }
  if (!value || typeof value.text !== 'string' || value.text.length > 500 || !Number.isFinite(value.updatedAt)) throw new Error('随手记暂时无法读取，原记录已保留')
  return value
}
function save(id, text, expected) {
  const current = read(id) // Refuse to overwrite unreadable content.
  if (expected && !same(current, expected)) throw new Error('随手记已在其他页面更新，当前输入未覆盖；请先复制输入再重新读取')
  if (typeof text !== 'string' || text.length > 500) throw new Error('随手记最多500字')
  const value = { text, updatedAt: Date.now(), revision: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) }
  wx.setStorageSync(key(id), value)
  return value
}
function same(a, b) { return !!a && !!b && a.text === b.text && a.updatedAt === b.updatedAt && (a.revision || '') === (b.revision || '') }
function previousKey(id) { key(id); return 'wanlv.v22.comment-draft.' + id }
function readPreviousDraft(id) {
  const value = wx.getStorageSync(previousKey(id))
  if (value === '' || value === undefined || value === null) return { text: '', updatedAt: 0 }
  if (!value || typeof value.text !== 'string' || value.text.length > 500 || !Number.isFinite(value.updatedAt)) throw new Error('此前的本机草稿暂时无法读取，原内容已保留')
  return value
}
function clearPreviousDraft(id, expected) {
  if (readPreviousDraft(id).text !== expected) throw new Error('本机草稿已变化，请重新进入后再删除')
  wx.setStorageSync(previousKey(id), { text: '', updatedAt: Date.now() })
}
module.exports = { read, save, same, readPreviousDraft, clearPreviousDraft }

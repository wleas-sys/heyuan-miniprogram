// 本机行为记录：只记「看过什么、收藏什么、加进哪天的行程」，不记个人身份。
// 用于推荐模型的新鲜度特征，最多保留 200 条，超出后丢弃最旧的记录。
const KEY = 'wanlv.v22.events'
const MAX = 200
const KINDS = ['favorite', 'unfavorite', 'add', 'remove', 'adopt']

function read() {
  try {
    const value = wx.getStorageSync(KEY)
    if (!Array.isArray(value)) return []
    return value.filter(item => item && typeof item.id === 'string' && KINDS.indexOf(item.kind) >= 0 && Number.isFinite(item.at))
  } catch (e) { return [] }
}

function write(list) {
  try { wx.setStorageSync(KEY, list.slice(-MAX)) } catch (e) { /* 记录失败不影响主流程 */ }
}

function record(kind, id) {
  if (KINDS.indexOf(kind) < 0 || typeof id !== 'string' || !id) return
  const list = read()
  list.push({ kind, id, at: Date.now() })
  write(list)
}

// 同一地点被反复安排时衰减，上限 6，避免一次误操作把地点永久压下去。
function counts() {
  const map = {}
  read().forEach(item => {
    const delta = item.kind === 'unfavorite' || item.kind === 'remove' ? -1 : 1
    map[item.id] = Math.max(0, Math.min(6, (map[item.id] || 0) + delta))
  })
  return map
}

function clear() { try { wx.setStorageSync(KEY, []) } catch (e) { /* 忽略 */ } }

module.exports = { KEY, KINDS, MAX, read, record, counts, clear }

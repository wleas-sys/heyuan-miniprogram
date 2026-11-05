const ui = require('../../utils/ui')
const DISHES = [
  { id: 'tofu', name: '客家酿豆腐', mark: '酿', type: '正餐', flavor: '豆腐 · 肉馅', intro: '豆腐与肉馅组合的客家家常菜，也是河源常见的客家菜之一。', note: '点单时问份量与馅料；对大豆或肉类有忌口时提前说明。', query: '河源 客家酿豆腐 餐厅' },
  { id: 'chicken', name: '盐焗鸡', mark: '焗', type: '正餐', flavor: '鸡肉 · 盐香', intro: '以咸香风味见长的客家鸡肉菜。不同餐厅的做法、分量会有差别。', note: '先问半只还是整只，再按同行人数点单。', query: '河源 客家盐焗鸡 餐厅' },
  { id: 'fish', name: '新丰江煎焗鱼头', mark: '鲜', type: '正餐', flavor: '鳙鱼头 · 煎焗', intro: '以万绿湖（新丰江水库）的鳙鱼鱼头为食材，是河源地方鱼鲜菜之一。', note: '确认按份还是按斤收费，以及是否另计加工费；鱼的来源以店家说明为准。', query: '河源 新丰江煎焗鱼头 餐厅' },
  { id: 'soup', name: '紫金八刀汤', mark: '汤', type: '正餐', flavor: '猪肉与内脏 · 胡椒', intro: '紫金地方汤菜，使用猪肉及多种内脏部位煮成，常配胡椒调味。', note: '不吃内脏或不习惯胡椒味，可先问店家能否调整。', query: '河源 紫金八刀汤 餐厅' },
  { id: 'noodles', name: '河源米排粉', mark: '粉', type: '早餐小吃', flavor: '米制主食', intro: '米排粉是河源的地方特产。选一碗粉作简餐，也可以留意当地米粉产品。', note: '查店时带上当天所在的区县或街道，优先选择顺路的店。', query: '河源 米粉店' },
  { id: 'snack', name: '铁勺粄', mark: '粄', type: '早餐小吃', flavor: '客家小食 · 香脆', intro: '客家传统小食，以香酥脆爽的口感见长，可作为逛街时的小点心。', note: '现售摊点和出摊时间并不固定，出发前先核对。', query: '河源 铁勺粄' }
]
Page(ui.page({
  data: { dishes: DISHES, category: '全部', categories: ['全部', '正餐', '早餐小吃'], sourcesOpen: false, sources: [
    { name: '河源市政府 · 走进河源（美食介绍）', url: 'https://www.heyuan.gov.cn/zjhy/' },
    { name: '河源市商务局 · 河源地方美食介绍', url: 'https://www.heyuan.gov.cn/hysswbj/gkmlpt/content/0/682/post_682507.html' }
  ] },
  onLoad() { ui.enableShare() },
  selectCategory(e) { const category = e.currentTarget.dataset.category; this.setData({ category, dishes: DISHES.filter(item => category === '全部' || item.type === category) }) },
  copy(e) { ui.copy(e.currentTarget.dataset.query, '搜索词已复制，可到地图中查找') },
  toggleSources() { this.setData({ sourcesOpen: !this.data.sourcesOpen }) },
  copySource(e) { ui.copy(e.currentTarget.dataset.url, '来源链接已复制') },
  onShareAppMessage() { return { title: '来河源，尝尝这些客家味道｜万绿智游', path: '/pages/food/food' } },
  onShareTimeline() { return { title: '来河源，尝尝这些客家味道｜万绿智游' } }
}))

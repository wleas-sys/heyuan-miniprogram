// Sources checked 2026-10-28. Missing prices stay unknown, never assumed free.
const TICKETS = {
  jinghuayuan: { low: 32, high: 40, label: '单景点预订起价 / 公示单票参考', checkedAt: '2026-10-28', source: 'https://www.wanlvhu.cn/bookshow-26-28.html', tariffSource: 'https://www.wanlvhu.cn/ticketservice-21.html', note: '官网预订页32元起，购票须知公示单票40元；不含电瓶车，实际日期以购买页面为准。' },
  konglong: { low: 30, high: 30, label: '成人全票', checkedAt: '2026-10-28', source: 'https://www.heyuan.gov.cn/zwgk/zdlyxx/whjg/tsg/content/post_691096.html', note: '2026-02-14官方公告；儿童、学生及其他优惠另按公告办理。' },
  wanlvhu: { low: 175, high: 198, label: '成人船线套票', checkedAt: '2026-10-28', source: 'https://www.wanlvhu.cn/bookshow-26-2.html', note: '官网列示提前预订175元起、当日198元起；含船票与镜花缘等。日期、航线与包含项目以实际订单为准。' }
}
function planUsesReferenceLakeTicket(days) { return (days || []).some(day => day.includes('wanlvhu') && day.includes('jinghuayuan')) }
function reference(id, days) {
  const ids = [].concat.apply([], days || [])
  if (id === 'jinghuayuan' && ids.includes('wanlvhu') && planUsesReferenceLakeTicket(days)) return { low: 0, high: 0, label: '所选湖区套票包含时不重复计费', source: TICKETS.wanlvhu.source, checkedAt: TICKETS.wanlvhu.checkedAt, note: '此处按上述含镜花缘套票估算；若购买其他票种，请自行填写实际金额。' }
  return TICKETS[id] || null
}
function estimate(plan) {
  const days = plan.days.length, ids = [].concat.apply([], plan.days)
  const rows = ids.map(id => {
    if (Object.prototype.hasOwnProperty.call(plan.tickets, id)) return { id, low: plan.tickets[id], high: plan.tickets[id], label: '你填写的金额', manual: true }
    const ref = id === 'jinghuayuan' && Object.prototype.hasOwnProperty.call(plan.tickets, 'wanlvhu') ? TICKETS.jinghuayuan : reference(id, plan.days)
    return Object.assign({ id, unknown: !ref }, ref || { low: 0, high: 0, label: '票价待核对' })
  })
  // These are editable planning assumptions, not surveyed market quotations.
  const living = [
    { label: '餐饮', low: (plan.meal === null ? 60 : plan.meal) * days, high: (plan.meal === null ? 100 : plan.meal) * days, assumption: plan.meal === null },
    { label: '住宿', low: (plan.lodging === null ? 120 : plan.lodging) * (days - 1), high: (plan.lodging === null ? 220 : plan.lodging) * (days - 1), assumption: days > 1 && plan.lodging === null },
    { label: '交通', low: plan.transport || 0, high: plan.transport || 0, unknown: plan.transport === null }
  ]
  const low = rows.concat(living).reduce((n, x) => n + x.low, 0), high = rows.concat(living).reduce((n, x) => n + x.high, 0)
  const unknown = rows.filter(x => x.unknown).length + (plan.transport === null ? 1 : 0)
  return { low, high, text: low === high ? '¥' + low : '¥' + low + '–' + high, rows, living, unknown, hasAssumptions: living.some(x => x.assumption), caption: (unknown ? '另有 ' + unknown + ' 项未计入；' : '') + '按普通成人出行估算，非完整报价。', assumptions: '未填写时：餐饮按60–100元/人/天、住宿按120–220元/人/晚试算。这是可调整的预算假设，不是实时酒店或餐厅报价；未填写交通不计入。门票含来源页起价信息，实际票价可能超出参考区间。' }
}
module.exports = { TICKETS, reference, estimate }

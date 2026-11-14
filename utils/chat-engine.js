// 本机对话引擎：把用户的一句自然语言拆成规划条件，再生成一句"像人"的回应。
//
// 设计取舍：不联网、只在本地做可解释的关键词映射。
// 这样不会编造景点、价格或营业时间，也不需要后端与内容安全审核，
// 能直接随小程序上架。代价是只认常见说法，认不出时会主动追问。

// 每条规则命中即写入一个条件；同一维度只取最靠前的一条，避免"两天"被"天"重复命中。
const RULES = {
  days: [
    [/(五|5)\s*天|一周|七天/, 5],
    [/(四|4)\s*天/, 4],
    [/(三|3)\s*天/, 3],
    [/(两|二|2)\s*天|周末/, 2],
    [/(一|1)\s*天|一日|当天往返|半天|随便逛逛/, 1]
  ],
  crowd: [
    [/爸妈|父母|老人|长辈|家长|带妈|带爸/, 'parents'],
    [/孩子|娃|小朋友|亲子|小孩|女儿|儿子/, 'family'],
    [/情侣|对象|女朋友|男朋友|爱人|老公|老婆|媳妇/, 'couple'],
    [/朋友|同学|闺蜜|兄弟|同事/, 'friends']
  ],
  interest: [
    [/温泉|泡汤|汤池|泡泉|泡温泉/, '温泉'],
    // 山水排在人文前面：「山水和古村」这类并列说法按更主动的玩法定调更接近本意。
    [/(山水|爬山|登山|看山|山景|湖|溪|风景|自然|瀑布|露营|山)/, '山水'],
    [/古村|古镇|历史|人文|文化|博物馆|围屋|红色|客家|学宫|故居/, '人文'],
    [/休闲|公园|散步|放松|拍照|慢|清静/, '休闲']
  ],
  region: [
    [/源城|市区|老城/, '源城区'],
    [/东源|万绿湖/, '东源县'],
    [/紫金/, '紫金县'],
    [/龙川|佗城|霍山/, '龙川县'],
    [/和平|林寨|热龙/, '和平县'],
    [/连平|内莞/, '连平县'],
    [/江东|古竹/, '江东新区']
  ],
  mode: [
    [/公交|大巴|班车|坐车|公共交通|没有车/, 'transit'],
    [/步行|走路|徒步|逛城区/, 'walk'],
    [/自驾|开车|租车|驾车/, 'drive']
  ],
  pace: [
    [/轻松|悠闲|不赶|慢慢|放松/, 'relaxed'],
    [/充实|紧凑|多逛|多玩|安排满|多去/, 'standard']
  ]
}

const CROWD_TEXT = { parents: '带爸妈', family: '带孩子', couple: '两个人', friends: '和朋友' }
const MODE_TEXT = { drive: '自驾', transit: '公交', walk: '步行' }
const PACE_TEXT = { relaxed: '轻松', standard: '充实' }

// 只返回命中的维度，未命中的保持调用方原值。
function parse(text) {
  const source = String(text || '')
  const patch = {}
  for (const key of Object.keys(RULES)) {
    for (const [re, value] of RULES[key]) {
      if (re.test(source)) { patch[key] = value; break }
    }
  }
  return patch
}

// 把当前条件说成一句人话，让用户确认"你是不是听懂我了"。
function describe(form) {
  const bits = []
  bits.push(form.days + ' 天')
  if (form.region && form.region !== '全部') bits.push(form.region)
  if (form.interest && form.interest !== '全部') bits.push('想看' + form.interest)
  if (form.crowd && CROWD_TEXT[form.crowd] && form.crowd !== 'friends') bits.push(CROWD_TEXT[form.crowd])
  return bits.join(' · ')
}

// 哪些维度是用户没说、我按默认补上的——必须明说，不能假装是用户选的。
function assumed(form, patch) {
  const list = []
  if (!patch.mode) list.push(MODE_TEXT[form.mode])
  if (!patch.pace) list.push(PACE_TEXT[form.pace] + '节奏')
  if (!patch.region || form.region === '全部') list.push('全河源')
  if (!patch.crowd) list.push(CROWD_TEXT[form.crowd])
  return list
}

const GREETING = {
  text: '想去河源玩几天？带谁一起、想看什么，说一句就行。',
  chips: ['两天，带爸妈看温泉', '一日游，随便逛逛', '三天，想看山水和古村']
}

// 没有天数就无法排行程，所以这里必须追问，而不是替用户猜。
function askDays(form, patch) {
  const known = Object.keys(patch).filter(k => k !== 'days')
  const echo = known.length ? '其余的我记下了。' : ''
  return {
    text: '河源 1—5 天都能安排。' + echo + '你这趟大概几天？',
    chips: ['一日往返', '两天', '三天', '四到五天']
  }
}

function reply(form, patch, resultCount) {
  if (!form.days) return askDays(form, patch)
  const guesses = assumed(form, patch)
  const guessText = guesses.length ? '没提到的我先按「' + guesses.join(' · ') + '」安排，不对你说一声就改。' : ''
  if (!resultCount) {
    return {
      text: '按「' + describe(form) + '」这组条件，暂时排不出合适的方案。' + guessText + '要不要放宽范围或换个兴趣？',
      chips: ['全河源都看看', '换成山水', '换成人文', '改成两天']
    }
  }
  return {
    text: '按「' + describe(form) + '」找到 ' + resultCount + ' 个方案。' + guessText,
    chips: ['改成三天', '换成温泉', '换成山水', '带爸妈']
  }
}

module.exports = { parse, describe, assumed, greeting: () => GREETING, reply }

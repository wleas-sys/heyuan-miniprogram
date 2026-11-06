// 景点图片来源开关。
//
// 留空（默认）：使用打进小程序包里的 /assets/covers/<id>.jpg。
//   主包约 1.76MB / 2MB，只剩约 260KB，最多再放 5 张图。
// 填一个以 / 结尾的地址：所有景点图改走网络，包体不再随图片增长。
//   微信云开发云存储：'https://<环境ID>.tcb.qcloud.la/covers/'
//   腾讯云 COS：      'https://<bucket>.cos.ap-guangzhou.myqcloud.com/covers/'
//   自建图床/CDN：     'https://img.example.com/heyuan/covers/'
//
// 约定：云端文件名与本地一致，即 <地点id>.jpg（如 wanlvhu.jpg、yeyuan.jpg）。
//
// 本地联调：先运行 `node tools/mock-image-server.cjs`，再把下面填成
//   'http://127.0.0.1:8899/covers/'
// 并在微信开发者工具「详情 → 本地设置」里勾选「不校验合法域名」。
//
// 正式发布前必须回到后台配置 downloadFile 合法域名，否则 wx.previewImage /
// wx.getImageInfo 取网络图会失败（具体规则以微信官方最新文档为准）。
// 正式上线就改这一行（留空 = 用包内本地图片）
const IMAGE_BASE = ''
// 测试时可用环境变量覆盖，方便在不改文件的前提下验证云端路径
const OVERRIDE = (typeof process !== 'undefined' && process.env && process.env.HEYUAN_IMAGE_BASE) || ''

module.exports = { imageBase: IMAGE_BASE || OVERRIDE }

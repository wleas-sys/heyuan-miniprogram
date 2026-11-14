# 补图上传说明（微信云存储）

本目录的 `covers/` 里有 55 张已压缩封面，文件名就是景点 id，云端统一放在 `covers/<id>.jpg`。

- 53 张来自补图清单的链接（豆包图片 CDN，已下载并压缩）
- 2 张为相近图替代：`beilingxianshui`（贝岭咸水温泉）、`shangpingwenquan`（上坪温泉），找到可核实图片后请替换
- `manifest.csv` 记录了 id、名称、云端路径、来源

## 上传步骤

1. 微信开发者工具 → 云开发 → 开通并创建环境
2. 进入「存储」→ 新建文件夹 `covers`
3. 进入 `covers`，上传本目录 `covers/` 里的全部 55 张图
4. 随便点开一个文件，复制它的 fileID，形如：
   `cloud://你的环境ID.636c-xxxxxx-1250000000/covers/ailang.jpg`
5. 把这段 fileID 发给助手，或自行填写 `utils/cloud-covers.js` 里的 `env` 与 `bucket`

## 代码已就位

- `utils/cloud-covers.js`：`env`、`bucket` 为空时保持现状；填上后这 55 个景点改用 `cloud://` 封面
- `utils/data.js`：云封面优先，未配置时仍走本地图或文字占位
- `app.js`：配置了 env 时自动 `wx.cloud.init`

`cloud://` 图片不需要配置 downloadFile 合法域名。

# tv-covers

随身听书（SSTS）插件「电视伴音」「栏目大全」用的**封面图 + 插件包**仓库。

## 插件安装地址

在随身听书「插件」页点 `+` →「从网址导入」，填下面任意一条即可（推荐第一条）：

| 插件 | 地址 |
| --- | --- |
| **电视伴音 + 栏目大全**（合并版 1.3.0，两个源一个包） | `https://cdn.jsdmirror.com/gh/jackycher/tv-covers@main/plugins/tv-radio-and-cctv.zip` |
| 同上（备用） | `https://gh-proxy.com/https://raw.githubusercontent.com/jackycher/tv-covers/main/plugins/tv-radio-and-cctv.zip` |
| 同上（备用） | `https://ghfast.top/https://raw.githubusercontent.com/jackycher/tv-covers/main/plugins/tv-radio-and-cctv.zip` |
| 只要电视伴音（1.2.5 单源） | `https://gh-proxy.com/https://raw.githubusercontent.com/jackycher/tv-covers/main/plugins/tv-radio.zip` |
| 只要栏目大全（1.0.9 单源） | `https://gh-proxy.com/https://raw.githubusercontent.com/jackycher/tv-covers/main/plugins/cctv-columns.zip` |

> 不要直接用 `cdn.jsdelivr.net/...zip`：jsDelivr 只缓存图片/文本类文件，zip 会 301 跳到
> `raw.githubusercontent.com`，国内网络多半连不上，所以插件包走上面两个 GitHub 加速镜像。

合并版 `manifest.json` 里 `scripts: ["radio.js", "cctvlm.js"]`，一个包注册两个源，
源 ID 固定为「电视伴音」`b4c6d8e0f2a143759687a9b0c1d2e3f5`、
「栏目大全」`f5b8a2c4d6e04719b3a5c7d9e1f2a4b6`，因此收藏与播放历史不会丢。

每个 zip 的解包源码（打包前原样）在同名目录下：`plugins/tv-radio-and-cctv/`、`plugins/tv-radio/`、`plugins/cctv-columns/`，改完重新压缩即成新包；也可以在插件页用「从文件导入 zip」直接装。

## 封面图

所有封面是 **360×480 纯白底竖版**，由 jsDelivr 直链提供（插件里用的就是这套）：

```
https://cdn.jsdelivr.net/gh/jackycher/tv-covers@main/<目录>/<文件名>
```

| 目录 | 内容 | 文件名 |
| --- | --- | --- |
| `ch/` | 综合频道台标 | `1.png` … `17.png`、`5plus.png`、`jilu.png`、`child.png`、`europe.png`、`america.png` |
| `satellite/` | 卫视 / CETV / 凤凰台标 | 台名，如 `湖南卫视.png`、`CETV1.png`、`凤凰资讯.png` |
| `column/` | 栏目大全栏目封面 | `<column_id>.jpg` |
| `data/columns.json` | 栏目清单（id → 名称 / 封面是否存在） | 自动生成 |

## 自动更新

`.github/workflows/daily-covers.yml` 每天北京时间 03:30（UTC 19:30）跑一次
`tools/build_covers.py`：拉取 `zy.api.cntv.cn/lanmu/columnSearch` 全量栏目，
把仓库里还没有的栏目封面下载后转成 360×480 白底竖版存进 `column/`，
并刷新 `data/columns.json`，有变化才提交。也可在 Actions 页面手动 `Run workflow`。

栏目封面转换规则：原图等比缩放进 360×480 画布（四周留 8px 白边），居中，纯白底，不裁不拉伸。

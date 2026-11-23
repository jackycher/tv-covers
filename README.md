# tv-covers

电视伴音 / 央视栏目大全 插件用的封面图仓库，全部是 **360×480 纯白底竖版**，统一由 jsDelivr 提供：

```
https://cdn.jsdelivr.net/gh/jackycher/tv-covers@main/<目录>/<文件名>
```

| 目录 | 内容 | 文件名 |
| --- | --- | --- |
| `cctv/` | CCTV 各频道台标 | `cctv1.png` … `cctv5plus.png`、`cctvjilu.png`、`cctvchild.png`、`cctveurope.png`、`cctvamerica.png` |
| `satellite/` | 卫视 / CETV / 凤凰台标 | 台名，如 `湖南卫视.png`、`CETV1.png`、`凤凰资讯.png` |
| `column/` | 央视栏目大全栏目封面 | `<column_id>.jpg` |
| `data/columns.json` | 栏目清单（id → 名称 / 封面是否存在） | 自动生成 |

## 自动更新

`.github/workflows/daily-covers.yml` 每天北京时间 03:30（UTC 19:30）跑一次
`tools/build_covers.py`：拉取 `zy.api.cntv.cn/lanmu/columnSearch` 全量栏目，
把仓库里还没有的栏目封面下载后转成 360×480 白底竖版存进 `column/`，
并刷新 `data/columns.json`，有变化才提交。也可在 Actions 页面手动 `Run workflow`。

栏目封面转换规则：原图等比缩放进 360×480 画布（四周留 8px 白边），居中，纯白底，不裁不拉伸。

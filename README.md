# RSS论文接收器（RSS Daily Fetcher）

面向 Zotero 7/8 的 RSS 论文接收与翻译插件。

## 核心目标

- 定时从 RSS 获取论文条目并写入 Zotero。
- 所有条目统一归类到目标父集合体系（默认父集合：每日RSS论文）。
- 每次运行把新增条目写入父集合下的时间批次子集合（格式：`YYYYMMDD-HHMM`），不直接挂在父集合。
- 自动将标题翻译并写入 `titleTranslation` 字段（即标题翻译列）。
- 支持定期自动清理目标父集合论文条目，默认 3 天，建议改成1天。
- 不包含“已读删除”功能：建议把感兴趣论文移动到其他集合管理。
- 不包含 PDF 抓取功能：在zotero中双击论文条目即可打开改论文网页，配合 Zotero Connector （安装在浏览器中使用），下载PDF。
- 大模型API功能尚未实现。
- 不支持分类，关键词过滤。
- 要在ZOTERO中打开标题翻译列，否则无法显示翻译结果（论文条目顶部右击选中标题翻译）。
- 当前仅支持翻译标题，RSS接收的论文部分无摘要，因此未进行摘要翻译。
- 内置多种免费翻译API，目前使用谷歌，打开代理，其他API待测试。

- 注意：更新新版本插件时，在安装后运行之前，记得把之前生成的每日RSS论文文件夹全部删除。

## 当前版本

- 插件名：RSS论文接收器
- 版本：1.0.29
- Zotero 兼容范围：7.999 ~ 8.*.*
- 插件 ID：<rssdailytranslator@polygon.org>

## 安装

1. 打开 Zotero。
2. 进入 工具 -> 附加组件。
3. 右上角齿轮 -> 从文件安装附加组件。
4. 选择当前目录下的 `rss-daily-fetcher-1.0.29.xpi`。
5. 安装后重启 Zotero。

## 设置入口

打开 Zotero 设置，进入 `RSS Daily Fetcher`。

## 配置项说明

### 常规

- 启用自动调度：是否启用定时任务，（打开后点击立即执行随后叉掉设置窗口即可，后台自动运行）。
- 调度间隔（分钟）：默认 180。每次调度会生成一个新的批次集合（`YYYYMMDD-HHMM`）。
- 运行互斥锁：当任务执行中再次点击“立即运行”或遇到调度触发时，将提示“已有任务在执行”，并跳过本次重复触发。
- 启用自动清理论文条目：清理延迟（天）默认 3天，建议改成1天。
- 目标父集合名称：默认 `每日RSS论文`。
- 仅翻译英文内容：开启后只翻译英文标题。

### 调度注意事项

- 首次配置完成后（记得点击保存）：
  - 想马上看到结果，请点击“立即运行”；
  - 不点击也可以，插件会按调度间隔自动执行。
- 自动调度是“从当前启动时刻开始计时”，不是按绝对时钟点补跑。
- 关闭 Zotero 期间不会后台执行；重新打开后插件会自启，并按当前设置重新开始计时调度。
- 点击“保存设置”会重新应用调度配置，并重置下一次调度计时。

### 翻译

- API 地址：默认 `https://api.openai.com/v1`。
- API 密钥：可留空（留空时仅尝试免费翻译链路，失败则保留原文）。
- 模型名称：默认 `gpt-4o-mini`。
- Temperature：默认 `0.2`
- 大模型功能尚未测试。
- 优先使用免费翻译 API（失败自动回退）：开启后先走免费链路。

### 重试与缓存

- 最大重试次数。
- 基础延迟时间（分钟）。
- 缓存最大条目数。

### RSS 源列表

- 每行一个 URL。
- 默认内置两个示例源。
- 下面是可选参考源（也可自行添加其他RSS源）：

```text
Harmful Algae：https://rss.sciencedirect.com/publication/science/15689883
湖泊科学-CNKI：https://rss.cnki.net/knavi/rss/FLKX?pcode=CJFD,CCJD
生态学报-CNKI：https://rss.cnki.net/knavi/rss/STXB?pcode=CJFD,CCJD
遥感学报-CNKI：https://rss.cnki.net/knavi/rss/YGXB?pcode=CJFD,CCJD
arXiv1：http://export.arxiv.org/api/query?search_query=all:%22remote+sensing%22&sortBy=submittedDate&sortOrder=descending&max_results=50
arXiv2：http://export.arxiv.org/api/query?search_query=all:%22remote+sensing%22+AND+all:%22deep+learning%22&sortBy=submittedDate&sortOrder=descending&max_results=50
arXiv3：http://export.arxiv.org/api/query?search_query=(ti:%22remote%20sensing%22%20OR%20abs:%22remote%20sensing%22%20OR%20ti:%22hyperspectral%22%20OR%20abs:%22hyperspectral%22%20OR%20ti:%22SAR%22%20OR%20abs:%22SAR%22%20OR%20ti:%22multispectral%22%20OR%20abs:%22multispectral%22)&sortBy=submittedDate&sortOrder=descending&max_results=50
arXiv4：https://export.arxiv.org/api/query?search_query=(all:%20%22remote+sensing%22+OR+all:%22satellite+image%22+OR+all:%22earth+observation%22+OR+all:%22hyperspectral%22+OR+all:%22SAR%22)+AND+(cat:cs.CV+OR+cat:eess.IV+OR+cat:eess.SP+OR+cat:physics.geo-ph)&sortBy=submittedDate&sortOrder=descending&max_results=100
Geophysical Research Letters：https://agupubs.onlinelibrary.wiley.com/feed/19448007/most-recent
Geoscience and Remote Sensing ：https://ieeexplore.ieee.org/rss/TOC6245518.XML
GIScience & Remote Sensing：https://www.tandfonline.com/feed/rss/tgrs20
JAG：https://ieeexplore.ieee.org/rss/TOC4609443.XML
TGRS：https://ieeexplore.ieee.org/rss/TOC36.XML
JAG：https://rss.sciencedirect.com/publication/science/15698432
JOH：https://rss.sciencedirect.com/publication/science/00221694
JRS：https://spj.science.org/action/showFeed?type=etoc&feed=rss&jc=remotesensing
NG：https://www.nature.com/ngeo.rss
RS：https://www.mdpi.com/rss/journal/remotesensing
RSE:https://rss.sciencedirect.com/publication/science/00344257
EI:https://rss.sciencedirect.com/publication/science/1470160X
WRR:https://agupubs.onlinelibrary.wiley.com/feed/19447973/most-recent
WR:https://rss.sciencedirect.com/publication/science/00431354
```

## 按钮功能

- 保存设置：保存并重置调度状态。
- 立即运行：立即抓取、入库、翻译、清理。
- 重试队列：处理失败重试任务。
- 重置状态：清空摘要、队列与缓存状态。

## 数据与行为说明

- 去重策略：优先 DOI，再按标题检索（限制在目标集合范围，避免跨集合误判）。
- 标题翻译：写入 `titleTranslation`，并兼容写入 `extra`。
- 新增批次结构：父集合下直接按运行时间创建批次集合，例如 `20260409-0930`、`20260409-1330`；首次初始化批次会包含已存在条目，后续批次仅包含新增条目。
- 延迟清理逻辑：
  - 条目从 RSS 中消失时先标记缺失时间；
  - 到达清理天数后：若条目在父集合外仍有归属，仅从父集合体系移除，不删除条目本体；
  - 仅当条目只属于父集合体系时才删除条目；
  - 若条目重新出现则自动撤销删除计时。
- 空批次集合清理：清理后会自动删除空的、插件生成的批次集合（命名匹配 `YYYYMMDD-HHMM`）。
- 运行摘要：包含抓取数、创建数、更新数、翻译数、清理统计和错误示例。

## 打包规范

- XPI 命名：`rss-daily-fetcher-<manifest.version>.xpi`。
- 压缩包内部路径必须使用 `/`，不可使用 `\`。
- 包根目录必须直接包含：
  - `manifest.json`
  - `bootstrap.js`
  - `prefs.js`
  - `chrome/...`

## 开发说明

- 代码入口：`addon/chrome/content/scripts/jasminum.js`
- 启动文件：`addon/bootstrap.js`
- 默认配置：`addon/prefs.js`
- 设置页面：`addon/chrome/content/preferences.xhtml`

## 参考与致谢

本项目基于 Jasminum 插件结构组织，并参考以下资料：

- <https://mp.weixin.qq.com/s/k1k9Ye0gtfpfdzOoLZ8XTw>
- <https://mp.weixin.qq.com/s/sYsrNNFyYeW289Yj2bQEAg>
- <https://mp.weixin.qq.com/s/I3GtOxY0wuY8X10-OCpYQA?scene=1&click_id=60>
- <https://github.com/MuiseDestiny/zotero-gpt.git>
- <https://github.com/Star-Learning/PaperStomach.git>

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
- 大模型功能测试。
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

## 项目详细补充

本节内容来自项目详细说明，作为补充。

### 1 父集合体系

- 父集合：由配置项 targetParentCollection 指定，默认是 每日RSS论文
- 批次子集合：父集合下按运行时间创建，命名格式 YYYYMMDD-HHMM，例如 20260410-0910

当前设计中，父集合本身不直接承载条目，条目写入批次子集合。

### 2 受管条目

插件会给条目写入管理元信息（如 sourceKey、managed 标记）。
这些条目会进入后续的比对、更新和清理流程。

### 3 两个数据源

每次运行时插件都会对比两类数据：

- 本次 RSS 抓取结果（外部实时输入）
- 父集合体系中的受管条目（本地存量）

### 4 调度与触发机制

#### 4.1 自动调度

- 启用自动调度后，插件在 Zotero 启动时注册定时任务
- 调度间隔单位为分钟
- 计时方式是“从当前启动时刻开始计时”
- 关闭 Zotero 期间不会后台执行
- 重新打开 Zotero 后，会重新开始下一轮计时

#### 4.2 手动触发

点击 立即运行 会立即执行一次完整流程。

#### 4.3 运行互斥锁

为防止重复点击和并发调度，插件增加了运行互斥锁：

- 若当前已有任务在执行，新触发会被跳过
- 设置页会提示 已有任务在执行，请稍后再试

### 5 批次写入策略（重点）

本项目使用一次性状态位 initialBatchSeeded 控制“首批补历史”行为。

- initialBatchSeeded = false：首批模式
- initialBatchSeeded = true：后续模式

#### 5.1 首批模式

首批会把两类条目写入当次批次子集合：

- 已存在条目（用于初始化视图）
- 本次 RSS 新增条目

#### 5.2 后续模式

后续批次只写入真正新增条目。
已存在条目不会再写入新批次，避免批次间重复堆积。

#### 5.3 重置状态

点击 重置状态 后：

- initialBatchSeeded 会被重置为 false
- 下一次运行会再次进入首批模式

### 6 去重机制

条目入库时的去重优先级：

1. 优先 DOI
2. DOI 不可用时使用标题匹配

去重目标是避免重复创建条目，而不是阻止 RSS 重复抓到同一论文。

这点很重要：

- RSS 每次运行都可能再次返回 A/B 论文（正常）
- 去重生效后会显示 已存在条目，而不是 新增条目

### 7 清理机制（条目 vs 文件夹）

#### 7.1 条目清理规则

清理延迟按天配置（例如 1 天）。

当某条目在本次 RSS 结果中缺失时：

- 第一次缺失：只记录缺失开始时间 missingSince，不立即删除
- 连续缺失达到阈值后，才进入最终清理

最终清理分支：

- 若条目在父集合体系外仍有归属：只从父集合体系移除，不删除条目本体
- 若条目只属于父集合体系：删除条目本体

#### 7.2 文件夹清理规则

文件夹没有独立“按创建时间到期删除”的机制。

批次子集合只有在满足以下条件时才会删除：

- 命名匹配插件批次格式 YYYYMMDD-HHMM
- 集合为空

因此，文件夹删除是条目清理后的联动结果，不是独立时钟驱动。

### 8 典型场景示例

### 场景 A：首次初始化

时间点 09:00：

- 运行后生成 20260410-0900
- 写入历史已存在条目 + 本次新增条目
- initialBatchSeeded 置为 true

### 场景 B：后续正常调度

时间点 09:10：

- 生成 20260410-0910
- 只写入本次新增条目
- 已存在条目不再写入

### 场景 C：条目临时缺失

时间点 10:00：C 条目在 RSS 中消失

- 仅记录 missingSince
- 不立刻删 C

时间点 12:00：C 又出现

- 清除 missingSince
- C 保留

### 场景 D：条目持续缺失并超时

清理延迟设为 1 天，C 连续缺失超过 1 天：

- 若 C 还在其他手工分类里：从插件体系移除，C 本体保留
- 否则删除 C 本体

若某批次子集合因此变空，则该空集合会被自动删除。

### 场景 E：重置状态后的行为

用户点击 重置状态 后下一次运行：

- 重新进入首批模式
- 会再次执行 首批补历史 + 本次新增

### 9 最容易混淆的点

#### 9.1 为什么看到抓取重复

抓取重复是正常的，因为 RSS 每次都返回当前可见论文。
去重只控制“不重复创建条目”。

#### 9.2 为什么文件夹不按天直接删

当前策略是“先判条目，再判文件夹是否为空”。
这是为了数据安全，避免仅因时间到期误删仍有价值的条目。

#### 9.3 为什么关机几天后不会自动补跑

插件依赖 Zotero 进程执行。
关闭期间不会后台运行；再次打开后从当前时刻重新计时调度。

### 10 运行摘要字段说明（常用）

- 抓取条目：本次 RSS 返回总量
- 新增条目：本次真正新建的条目数
- 已存在条目：本次命中去重的条目数
- 更新条目：本次对已有条目补全字段或状态的数量
- 清理标记：首次发现缺失并打标记的数量
- 清理删除：最终删除条目本体的数量
- 清理移出父集合：因外部归属而仅移出插件体系的数量
- 清理空集合：自动删除的空批次集合数量

### 11 推荐使用流程

1. 安装插件后先配置 RSS 源、调度间隔、清理延迟
2. 保存设置
3. 想立刻看到结果时，点一次 立即运行
4. 日常让自动调度运行
5. 定期查看运行摘要，重点关注 新增条目、清理删除、错误数

## 参考与致谢

- <https://mp.weixin.qq.com/s/k1k9Ye0gtfpfdzOoLZ8XTw>
- <https://mp.weixin.qq.com/s/sYsrNNFyYeW289Yj2bQEAg>
- <https://mp.weixin.qq.com/s/I3GtOxY0wuY8X10-OCpYQA?scene=1&click_id=60>
- <https://github.com/MuiseDestiny/zotero-gpt.git>
- <https://github.com/Star-Learning/PaperStomach.git>

# 出图：一套件，不是一页一画

`gpt-image-2`，`https://ai-proxy.cc/v1`（提交任务 → 轮询 → 下载），脚本 `{baseDir}/scripts/gen-images.py`，key 从环境变量读，**不要打印 key**。先出封面当锚点，同一节点其余图全部 `--ref` 封面。图内无字（`{NO_TEXT}`）。

## 生成清单（每个节点 = 一个视觉世界）

| 图 | 数 | 尺寸 | 用处 | prompt 组成 |
|---|---|---|---|---|
| 封面 `{节点}-cover.png` | 1 | 16:9 2k | 封面全出血；结束页降透明度 | `{STYLE}` + 本节点主场面（人物放在下三分之一或一侧，**留出大片平静区域放超大标题**） |
| 背景 `{节点}-bg.png` | **1** | 16:9 2k | 所有正文 / 章节页共用（`assets.bg`） | `{STYLE}` + `{BG_RULE}`（中间 72% 是素净纸面，装饰只在上下边和四角）+ 本世界的边缘道具 |
| 小情境图 `{节点}-spot-01..06.png` | 6 | 4:3 1k | 卡片 / 大图版式 / 对话页 | `{STYLE}` + `{SPOT_RULE}`（**只画人物动作，纯白底，不画本子 / 面板 / 标签 / 任何版式**）+ 该页逐字稿 **插图** 段 |
| 角色剪影 `{节点}-mascot-01..04.png` | 4 | 4:3 1k | `cutout.py` 抠成透明 PNG，`extras` 填空位 | `{STYLE}` + `{MASCOT_RULE}`（全身、纯白底、无地面阴影） |
| 教室实景 `scene/{节点}.png` | 1 | 3:4 2k | `mockup.py` 套壳 | `{SCENE_RULE}`（正面、屏幕纯黑、比例正 16:9）+ 讲台道具（`noref`，不加风格词） |

一个节点 13 张。合集 = 每节点各一套（各自的封面锚点、各自的背景），不共用。

**不生成**：舞台底图 A/B/C 轮换（已废：主题会乱）、每页一张整幅画、章节图（章节页用同一张背景 + 角色剪影）。

## 风格从哪来

`风格提示词.md` 每个节点一节 `## 竞选大会·晴空校园`（标题第一个词 = jobs 的 `style`），内容是**从用户参考图提取**的风格词：配色、笔触、人物、装饰母题、版式气质。不是默认"温暖手绘"。参考图里有的元素（线圈本、彩旗、红幕、金线）要点名写进去。

## jobs.json 写法

```json
[
  {"id":"el-cover","style":"竞选大会","size":"16:9","res":"2k","anchor":true,
   "prompt":"{STYLE}\n\nWide 16:9 poster cover. Five students seen from behind in the lower third raising hands to a bright sky; upper two-thirds open and calm for a large title. {NO_TEXT}",
   "out":"assets/v2/el-cover.png"},
  {"id":"el-bg","style":"竞选大会","size":"16:9","res":"2k",
   "prompt":"{STYLE}\n\n{BG_RULE}Top edge: soft sky gradient with small clouds in the corners. Bottom edge: a low band of lawn and school rooftops. {NO_TEXT}",
   "out":"assets/v2/el-bg.png"},
  {"id":"el-spot-01","style":"竞选大会","size":"4:3","res":"1k",
   "prompt":"{STYLE}\n\n{SPOT_RULE}A girl at a small podium giving a short speech, one hand on her chest. {NO_TEXT}",
   "out":"assets/v2/el-spot-01.png"},
  {"id":"el-mascot-01","style":"竞选大会","size":"4:3","res":"1k",
   "prompt":"{STYLE}\n\n{MASCOT_RULE}Subject: two students side by side, one raising a fist, one holding a clipboard. {NO_TEXT}",
   "out":"assets/v2/el-mascot-01.png"},
  {"id":"scene-election","size":"3:4","res":"2k","noref":true,
   "prompt":"{SCENE_RULE}On the desk: a small wooden ballot box, a stack of folded ballots, a class roster. {NO_TEXT}",
   "out":"assets/scene/election.png"}
]
```

```bash
python3 {baseDir}/scripts/gen-images.py src/jobs.json                 # 已存在的文件跳过，可反复跑
python3 {baseDir}/scripts/gen-images.py src/jobs.json --only tr-spot-02,tr-spot-05   # 重出个别
python3 {baseDir}/scripts/cutout.py --in assets/v2 --glob "*-mascot-*.png" --out assets/v2/cut --trim
```

出图 13×N 张要十几分钟：用 tool 的后台模式跑并轮询日志，**不要开 Terminal 窗口**。

## 出完必查（否则重出）

- 小情境图里出现了本子 / 面板 / 英文字 / 标题栏 → 不是插画是海报，重出（培训节点最容易犯，`{SPOT_RULE}` 已写死"ONLY character"）
- 角色剪影底不是纯白（模型偶尔给黑底）→ `cutout.py` 会按四角取底色，仍要目检边缘
- 背景中间 72% 不素净 → 重出；正文卡片要压在上面
- 实景屏幕不是正 16:9 或有透视 → `mockup.py` 会拉伸页面，重出
- 封面标题区不够空 → 重出；封面要放 96–112pt 的标题

## 用法（`build-ppt.js`）

```js
const { createDeck } = require(require('path').join(
  process.env.PPTGEN_HOME || require('path').join(require('os').homedir(), '.cursor', 'skills', 'pptgen'),
  'scripts', 'theme.js'));
const deck = createDeck({
  title, kicker, footer,
  palette: { paper, card, ink, title, accent, accent2, muted, line, banner, bannerText },   // ≤6 主色，style-bible 里定
  fonts: { title: 'Source Han Sans SC Heavy', body: 'Source Han Sans SC', titleBold: false }, // 典礼感用 'Source Han Serif CN Heavy'
  assets: { cover: A('el-cover.png'), bg: A('el-bg.png') },                                   // 一份课件一张背景
  skin: { titleHighlight: 'FFD54A', bannerStyle: 'pill', stickers: ['star', 'cloud'],
          coverAlign: 'center', coverZoom: 1.12, coverShiftY: 0.55, coverBg: 'BFE0F8', coverTop: 0.85, coverSubBand: '2E86DE' },
});
deck.cover({ title: '班干部【竞选大会】', sub: '班级管理主题班会', tagline: '小岗位 · 大担当', chipLeft: '小学 · 班级管理', chipRight: '24 页 · 含主持稿' });
deck.section({ n: 1, title: '…', sub: '…', mascot: A('cut/el-mascot-01.png') });
const s = deck.page({ title: '九个岗位【各管什么】', lead: '…' });
deck.table(s, header, rows, { colW });               // 或 cards / steps / compare / checklist / interaction / quote / feature / dialogue / timeline / bigNumbers
deck.extras(s, { note: '老师提示…', mascot: A('cut/el-mascot-02.png') });   // 剩余空位放便签 / 角色
deck.banner(s, '看清岗位再报名');
deck.closing({ title: '…', words: ['责任', '公平', '方法', '信任'], thanks: '…' });
await deck.save(OUT);                                 // 密度不达标会抛错；图片裁切在这里落盘
```

所有图片都经 `fitImage()` 真比例裁切（sharp），不要自己 `addImage` 绕过它。

建完跑：

```bash
python3 {baseDir}/scripts/add-animations.py {pptx}
python3 {baseDir}/scripts/qa-density.py {pptx} --json qa/density.json   # FAIL 就回去改页
```

## PPT 正文

- 标题 ← 页方案「页面标题」，关键词用 `【】` 标出强调（会画黄条 / 换色）
- 单元 ← 页方案「信息单元」，逐条落成卡 / 步 / 行；口语补充只从该页逐字稿取短句
- 横幅 ← 页方案「横幅句」
- 不发明页方案和逐字稿都没有的论点
- 内容放 `src/content-{节点}.js`（一个节点一个文件，单文件太大写入会被打断），`build-docs.js` 从同一份内容生成 `逐字稿.md` / `PPT制作方案.md` / `workflow/design-pages.md`，三处天然对齐

## 对不上就停

逐字稿第 N 页、页方案第 N 页、`build-ppt.js` 第 N 页三处不齐：先改方案，再出图排版。不要一边出图一边另编。

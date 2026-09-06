---
name: pptgen
description: >-
  Builds sellable Chinese teacher courseware packs for Xiaohongshu: pick a
  classroom scenario (班干部竞选/培训/聘任, 立规矩, 开学第一课, 家长会, 心理健康课,
  安全教育, 节日班会, 品德励志, 教师成长分享), research demand (ego lite on macOS
  if present; otherwise pasted stats or the Cursor browser — ego is optional), write
  逐字稿 + 风格提示词 + 页方案, generate a unified illustration kit, build an
  editable PPTX on one master frame with dense pages (theme.js + qa-density.py),
  printables, classroom-screen showcase images (mockup.py), note copy, shop
  listing, one outer zip. Use when the user asks for pptgen, 课件, 班会PPT,
  班干部, 家长会PPT, 开学第一课, 心理课, 备课热点, remaking a teacher PPT, 课堂资料包,
  PPT资源包, 商品运营包, 小红书运营资料, 逐字稿, 风格提示词, or PPT制作方案.
  Every deck must pass the density gate and share one frame. Not locked to any
  single course type. Always report absolute paths; pack the zip and list paths (no WeChat).
---

# pptgen

把一个**班主任 / 教师场景**做成能在小红书出单的课件包：可编辑 PPT + 逐页讲稿 + 可打印实物件 + 一体机展示图 + 笔记文案 + 上架信息。

旧名 `psych-lesson-pack`。心理课只是场景之一。`{baseDir}` = 本 skill 目录。用户授权全流程就做完，不要停下来问「要不要继续」。

| 先读 | 文件 |
|---|---|
| 为什么之前会输、市场怎么成交（必读） | [market.md](market.md) · [failures.md](failures.md) |
| Win / Mac 怎么跑、ego 是不是必须 | [platforms.md](platforms.md) |
| 选哪个场景 | [scenarios.md](scenarios.md) |
| 调研看什么 | [research.md](research.md) |
| 什么叫有商业价值的内容 | [content.md](content.md) |
| 页型与密度闸门 | [page-types.md](page-types.md) |
| 视觉宪法（一套课件一个世界） | [visual.md](visual.md) |
| 图文 → 逐字稿 / 风格 / 页方案 | [source-plan.md](source-plan.md) · [prompts.md](prompts.md) |
| 出图套件 + build 用法 | [generate.md](generate.md) |
| 结构不许抄上一份 | [structure.md](structure.md) |
| 心理课族专用 | [psychology.md](psychology.md) |
| 展示图 / 详情 / 上架 | [showcase.md](showcase.md) |
| 笔记文案 / 评论区 / 复盘 | [copy.md](copy.md) |
| 交付清单 / 打包 | [outputs.md](outputs.md) · [packing.md](packing.md) |
| 迭代怎么算 | [iteration.md](iteration.md) |
| 示例：班干部三件套 | [examples/class-cadre.md](examples/class-cadre.md) |

脚本（`{baseDir}/scripts/`）：`gen-images.py` 出图套件（jobs.json，锚点 `--ref`）；`cutout.py` 白底人物抠成透明 PNG；`theme.js` 母版框架 + 皮肤 + 海报式封面 + 11 种页型 + `fitImage` 真比例裁图 + `extras` 空位放便签/角色；`add-animations.py` 单击动画；`qa-density.py` 密度 / 字体 / 框架 / 超框 / 溢出 / 压横幅闸门；`export-slides.py` 逐页 JPEG（Mac Keynote / Win PowerPoint / 两边 LibreOffice）；`mockup.py` 一体机套壳；`pack.py` 打包。发微信的脚本已删除，只报路径。

参考样：仓库里的 [examples/class-cadre.md](examples/class-cadre.md)（班干部三件套，2026-09-06 验收）。早期 004 八仙 / 005 教师节 / 006 中秋不重做。

## 硬闸

1. 没有调研表（藏 / 评 / 档期 / 跟不跟）不许写页表。
2. 场景从 [scenarios.md](scenarios.md) 选或按格式新增；不默认心理课，不把班会做成心理课。
3. **一套课件一个世界**：所有页走 `theme.js` 母版，**一份课件一张背景**（`assets.bg`），字体 ≤2 且**只用思源等开源字体并随包附 `字体/`**，调色板 ≤6，插画是套件（封面 + 背景 + 4:3 小图 + 角色剪影），不是每页一张画。合集每节点一个主题，风格从用户参考图提取。
4. **密度**：正文页 ≥3 信息单元、每单元 3–4 行完整句、≥60 字、一句横幅。`qa-density.py` FAIL 不许打包。版式 ≥6 种，卡片页 ≤35%。
5. 页表、单元、讲稿栏目、实物件字段，禁止从上一份改词接着用。
6. 每包 ≥2 个可打印实物件，班名 / 姓名 / 日期 / 岗位是可编辑文本框。
7. 展示图 16–18 张一体机套壳；商品主图和合集封面等用户模版，不自己渲。
8. 图内无字、文字全部可编辑、无水印；不用影视 IP / 演员脸。**图片一律按真实比例裁切**（`fitImage`），展示图套壳保持页面比例；建完抽查 `ppt/media` 长宽比。
9. 每写完一批文件，对话里列绝对路径。打完 zip 报 zip 的绝对路径。**不发微信**（用户 2026-09-06 明确：以后也不需要）。

## 不做

- 视频、`使用说明.txt`
- 商品主图 / 帖子主图（等 1242×1660 模版）
- 图内烤字、整页 AI 成图当页面（扣子那条路）
- 引流词：私信发文件、加微信、网盘、拉群
- 压缩包放桌面 / 放进项目；运营资料再压 zip
- 为了救急把正课砍瘦

## 输入

1. **场景 + 学段 + 档期**（一句话）。缺省学段：小学三—六年级。
2. **原件**（可选）：别人的 PPT / 图文 / 讲稿。已贴图就直接拆。
3. **合集**：同族 2–3 个节点一起做（例：竞选 + 培训 + 聘任）。

项目：`NNN-短标题/`，和用户的其他课件项目同级。编号在用户点头以前不加。客户文件夹 = PPT 名（合集 = 合集名）；`小红书运营资料/` 放项目一级，不放进客户文件夹。起手先 `npm init -y && npm install pptxgenjs sharp docx`（依赖装在项目里，**不要软链别的项目的 `node_modules`**）。目录规范见 [outputs.md](outputs.md)。Win / Mac 差异见 [platforms.md](platforms.md)。

## 工作流

### 1. 调研 → 选场景（[research.md](research.md) · [scenarios.md](scenarios.md)）

按 [research.md](research.md) 的优先级开浏览器（有 ego lite 用 ego，没有就用用户贴的数字或 Cursor 浏览器），搜 4–6 词，记 藏 / 评 / 「求」数 / 实物件帖 / 头部卖家目录。写 `workflow/brief.md`：场景族、节点、买家一句话、六问、实物件清单、比货架多给的一样东西。写 `workflow/design.md` 第一张表「跟不跟」。没有实数就停，不要编。

### 2. 逐字稿 · 风格词 · 页方案（[source-plan.md](source-plan.md)）

```
{项目}/逐字稿.md          # 每页 讲稿 + **插图**
{项目}/风格提示词.md      # 提示词 1 输出
{项目}/PPT制作方案.md     # 提示词 2 输出：每页 页职责 / 页型 / ≥3 单元 / 横幅 / 情境图 / 实物件
```

写完立刻报三条绝对路径。

### 3. 锁结构（[structure.md](structure.md) · [page-types.md](page-types.md) · [content.md](content.md)）

`workflow/design.md`：跟不跟 → 六问 → 脊柱 → 页表（每格填满）。讲稿栏目重起。实物件字段定下。

### 4. 视觉宪法（[visual.md](visual.md)）

`workflow/style-bible.md`：一句话世界、调色板 ≤6、字体 2 套、人物、母题、禁止项。要能对上 `风格提示词.md`。

### 5. 出图套件（[generate.md](generate.md)）

每节点：封面 1（锚点）→ `--ref` 背景 **1** → 4:3 小情境图 6 → 角色剪影 4（`cutout.py` 抠底）→ 教室实景 1（正面、屏幕纯黑）。图内无字。写 `src/jobs.json`，跑 `gen-images.py`（后台模式，不开终端窗口），出完按 generate.md「出完必查」目检。

### 6. 排版施工

内容写在 `src/content-{节点}.js`（一节点一文件），`build-docs.js` 由它生成逐字稿 / 页方案 / 页表，`src/build-ppt.js` 用 `{baseDir}/scripts/theme.js` 排版：`createDeck({palette, fonts, assets:{cover,bg}, skin})` → `cover（海报式，标题 96–112pt）/ section / page + cards|steps|compare|checklist|table|interaction|quote|feature|dialogue|timeline|bigNumbers + extras + banner / closing`。每页内容逐条从页方案落，`【】` 标关键词；有图就用 feature 图文分栏，无图就 `extras` 放便签 + 角色剪影。

```bash
node src/build-ppt.js
python3 {baseDir}/scripts/add-animations.py {pptx}
python3 {baseDir}/scripts/qa-density.py {pptx} --json qa/density.json   # 必须 PASS（密度 / 字体 / 框架 / 越界 / 溢出 / 压横幅）
```

实物件：`src/build-print.js`（A4 PDF/PNG）+ 可编辑版（pptx/docx）。讲稿：`src/build-docx.js`。

### 7. 视觉 QA

`export-slides.py` 把全页导出到 `qa/slides/{节点}/`（Mac 走 Keynote，Win 走 PowerPoint，都没有就走 LibreOffice）。用 Pillow 拼接成对比图再看（封面并排、任抽 5 页并排）：框架一致、背景中间是纸面、字压图有纸板、无重叠 / 越界 / 太小 / 拉伸、封面标题够大。**每一页都要看完**，用户随手就能翻到没弄好的那页。不过就改页，再跑 6。

```bash
python3 {baseDir}/scripts/export-slides.py {pptx} {项目}/qa/slides/{节点}   # 静默，不弹窗
# 合集连续导几份时加 --keep-app，全部导完不要带这个旗，脚本会退出 Keynote
```

**不许打扰用户的桌面**：只用 `export-slides.py`（禁止 AppleScript 里写 `activate`，禁止 COM 把 PowerPoint 设成可见，禁止开 Terminal / PowerShell 窗口——长任务用 tool 的后台模式跑）。用户看到导出软件弹到前台 = 违规。

某一边看着对不代表另一边对：字体必须是随包的思源（否则被替换、行高变化就错位），行距 / 段距显式写死，末段不留空行，项目符号缩进固定。这些 `theme.js` 已内置，不要绕过它手写文本框。导出前先把 `字体/` 装进**当前这台机器**的系统。

### 8. 展示图与上架物料（[showcase.md](showcase.md)）

`mockup.py` 出 16–18 张套壳图（每节点一张自己的实景；命名 `展示图/{节点}-01..16.jpg`，01 是封面）→ `build-ops.js` 出实物件展示图、商品详情 ×2、注意事项、`发帖文案.md`（含主图文字、商品标题 / 详情、评论回复；展示图路径写真实文件名）。课件改过就全部重出，别只改 PPT。

### 9. 文案（[copy.md](copy.md)）

标题 5 选 1；正文 A（搜索型）+ B（讲述型）各一版；话题；评论区回复；可选免费钩子（一个实物件 PDF 挂「文件」）。

### 10. 迭代（[iteration.md](iteration.md)）

至少两轮，每轮写 `workflow/reviews-iterN.md`，角色各自指出「改哪一页、哪一节」并立刻改。只改对比不算迭代。

### 11. 打包 → 报路径 → 复盘

`pack.py` 出唯一 zip → 对话里给完整文件路径清单（不发微信）→ 24h / 72h 填 `小红书运营资料/复盘.md`（藏 / 评 / 店铺访客 / 搜索词），下一单先读它。

## 每次回复都要带路径

```
逐字稿：
风格提示词：
PPT制作方案：
brief / design / style-bible：
PPT（每节点）：
讲稿：
实物件：
展示图 / 详情 / 注意事项 / 发帖文案：
qa/density.json：
输出全套 zip：
```

## 验收

- [ ] 读过 [market.md](market.md) 和 [failures.md](failures.md)
- [ ] 场景在 [scenarios.md](scenarios.md)，brief 六问答全，比货架多给的一样东西写得出
- [ ] 调研表有 藏 / 评 数据，页表从调研和场景流程长出来，不是上一份换词
- [ ] 逐字稿每页有 **插图**；页方案每页 ≥3 单元 + 横幅
- [ ] 插画是套件，同一锚点；图内无字；一份课件一张背景；风格能对上用户参考图
- [ ] 所有页走 `theme.js` 母版；`qa-density.py` PASS（含溢出 / 压横幅）；`export-slides.py` 逐页看完，无拉伸
- [ ] 封面海报式：标题 96–112pt 横占 ≈88%，副标色带，标签
- [ ] 字体只有思源两套，`字体/` 随包，注意事项写「先安装」
- [ ] ≥2 实物件，可编辑处是文本框
- [ ] 展示图 16–18 张 / 节点；详情 ×2；注意事项；发帖文案含商品标题与评论回复，展示图路径是真实文件名
- [ ] 无引流词、无 3I 论文腔、页数字数实数
- [ ] 每页单击动画
- [ ] 过程中没有弹出 Keynote / PowerPoint / 终端窗口；结束时导出软件已退出
- [ ] 对话里报过完整路径清单；zip 已重新打好（不发微信）

# 交付清单

参考样（结构 / 打包 / 视觉 / 密度）：[examples/class-cadre.md](examples/class-cadre.md)。早期 004 八仙 / 005 教师节 / 006 中秋不重做。
视觉密度参照：[market.md](market.md) 第一节的货架头部卖家；目标是达到并超过它的信息密度，同时保持可编辑。

客户文件夹与 PPT 同名。合集时客户文件夹用合集名，里面每个节点一个 PPT。

## 项目里（不放 zip）

```
NNN-短标题/                          # 编号在用户点头以前不加
  package.json  node_modules/        # pptxgenjs / sharp / docx，在项目里 npm install；不要软链到别的项目
  逐字稿.md                          # build-docs.js 生成；合集：每节点一节
  风格提示词.md                      # 每节点一节 `## 节点·风格名`，从用户参考图提取
  PPT制作方案.md                     # build-docs.js 生成：每页 页职责 / 页型 / 单元 / 横幅 / 情境图
  {客户文件夹名}/                     # 只放买家拿到的东西
    {节点A}.pptx                     # theme.js 母版；已跑 add-animations；不透明图存 JPEG（单份 ≤15 MB）
    {节点A}-主持稿.docx              # 教学设计 / 主持稿 / 发言稿 / 流程单，按场景叫名
    {节点B}.pptx  …
    实物件/
      聘书-可编辑.pptx + 聘书.pdf
      报名表.pdf/.png  投票单.pdf/.png  岗位职责卡.pdf/.png …
    字体/                            # 思源黑体 Regular/Bold/Heavy + 思源宋体 Heavy otf + 开源许可；注意事项写「先安装」
  小红书运营资料/                     # 项目一级，不放进客户文件夹
    展示图/{节点}-01.jpg … 16.jpg     # 01 = 封面；合集三节点平铺在同一个 展示图/ 里
    实物件展示.png
    商品详情-01-资料清单.png
    商品详情-02-课堂怎么走.png
    注意事项页.png
    发帖文案.md                       # 标题 5 选 1、正文 A/B、话题、主图文字、商品标题详情、评论回复；展示图路径写真实文件名
    复盘.md                           # 发后填
  assets/ v2/ ({节点}-cover, -bg, -spot-01..06, -mascot-01..04, cut/)  scene/{节点}.png  print/  v1-rejected/
  qa/ slides/{节点}/ (export-slides.py 导出)  density-{节点}.json  images.log
  workflow/ brief.md  design.md  design-pages.md  style-bible.md  reviews-iter*.md
  src/ jobs.json  content-{节点}.js  content.js  build-ppt.js  build-print.js  build-docx.js  build-docs.js  build-ops.js
```

对话结束必须报出 逐字稿 / 风格提示词 / PPT制作方案 / 客户文件夹 / 小红书运营资料 / zip 的绝对路径。

不做：视频、`使用说明.txt`、商品主图与合集封面（等用户模版）、把运营资料再压成 zip。

## 项目外面：唯一压缩包

`{项目父目录}/{短名}-输出全套.zip`，里面只有：

```
{客户文件夹}/
{客户文件夹}.zip                # 根目录平铺 pptx / docx / 实物件 / 字体
小红书运营资料/
```

脚本见 [packing.md](packing.md)。打完在对话里报 zip 绝对路径；不发微信。用户可能已把旧 zip 解压出来看，重打包后要提醒"解压的是旧版"。

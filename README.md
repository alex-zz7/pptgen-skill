# pptgen-skill

把一个班主任 / 教师场景做成能在小红书出单的课件包：可编辑 PPT + 讲稿 + 可打印实物件 + 一体机展示图 + 笔记文案。

给 **任何能读 Agent Skill 的客户端** 用：Cursor、Claude Code（`claude` CLI）、Codex 等。macOS 和 Windows 同一套脚本。哪个 agent、怎么调研，见 `pptgen/hosts.md`。

## ego-lite 是不是必须的？

**不是。** [ego-lite](https://github.com/citrolabs/ego-lite) 只是调研小红书时的首选浏览器，而且官方目前只有 macOS。本仓库不内置、不 fork 它。

做课件（出图、排版、QA、套壳、打包）不依赖 ego，也不依赖 Cursor。调研按「当前 agent 有什么」降级，见 `pptgen/xhs-browser.md`。

## 装到本机

需要：Node 18+、Python 3.10+、`pip install -r requirements.txt`。视觉 QA 再备一个导出引擎（Mac：Keynote 或 LibreOffice；Win：PowerPoint 或 LibreOffice）。

```bash
git clone https://github.com/alex-zz7/pptgen-skill.git
cd pptgen-skill
pip install -r requirements.txt
```

```bash
./install.sh          # 默认同时装到 Cursor 和 Claude Code
# ./install.sh --cursor
# ./install.sh --claude
```

Windows PowerShell：

```powershell
.\install.ps1         # 同样默认两处都装
# .\install.ps1 -CursorOnly
# .\install.ps1 -Claude
```

装完打开一个**空的课件文件夹**当工作区，新开对话：

```
用 pptgen 做一套小学班干部竞选+培训+聘任，按 skill 全流程走。
```

Claude Code 也可以先 `/pptgen` 再补场景。`{baseDir}` 是 skill 被拷到的目录，不要写死某台机器、某一个客户端的路径。

## 日常怎么用（Cursor 和 Claude Code 一样）

人负责拍板、登录小红书、最后用 WPS/PowerPoint/Keynote 抽查。agent 负责调研表、写稿、出图、排版、打包。

**只做一次：** 装 Node / Python / 导出引擎；跑安装脚本；系统环境变量加 `OPENAI_API_KEY`（出图，不要让 agent 打印）。

**每一单**

1. 在你正在用的那个 agent 里点名 pptgen，说清场景和学段。
2. 调研：有 ego 或可点击浏览器就让它打开小红书，登录墙就在弹出的窗口扫码。Claude Code 在 Windows 上通常没有这两样——它会把搜索词发给你，你用日常已登录的小红书搜完，把藏/评贴回去。
3. 看一眼逐字稿 / 风格词 / 页方案，再让它出图排版。
4. 导出逐页图和套壳前用 WPS / Office 抽几页对一下。
5. 结束看它报的绝对路径和 zip，抽几页对一下。

**不用做的：** 为 Windows 装 ego-lite；自己写 AppleScript；软链别人的 `node_modules`；等 skill 渲 1242×1660 商品主图。

## 仓库里有什么

```
pptgen/                 # 主 skill
xhs-banhui-scan/        # 同伴：小红书跟单选品
requirements.txt
install.sh / install.ps1
```

入口：[`pptgen/SKILL.md`](pptgen/SKILL.md) · 客户端差异：[`pptgen/hosts.md`](pptgen/hosts.md) · 示例：[`pptgen/examples/class-cadre.md`](pptgen/examples/class-cadre.md)

每个课件项目自己 `npm install pptxgenjs sharp docx`。出图走 `gpt-image-2`（`https://ai-proxy.cc/v1`），key 只放环境变量。

改完 GitHub 再跑一次安装脚本，Cursor 和 Claude Code 两侧一起覆盖。不要在客户端目录里直接改一版、仓库里另改一版。

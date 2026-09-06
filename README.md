# pptgen-skill

把一个班主任 / 教师场景做成能在小红书出单的课件包：可编辑 PPT + 讲稿 + 可打印实物件 + 一体机展示图 + 笔记文案。

给 **Cursor / Claude Code** 用。macOS 和 Windows 同一套流程。

## ego-lite 是不是必须的？

**不是。** [ego-lite](https://github.com/citrolabs/ego-lite) 只是调研小红书时的首选浏览器（登录态隔离、点封面进详情不容易 300017）。它官方写得很清楚：

> ego lite runs on macOS today. Windows and Linux are on the roadmap.

Windows 上现在装不上 ego，不是本 skill 的故障。Win 上调研小红书的默认做法是 **Cursor 内置浏览器**：扫码登录 → 搜索 → 点封面进详情 → 记藏/评。过不了风控再改成你自己搜、把数字贴回来。点法见 `pptgen/xhs-browser.md`。

做课件本身（出图、排版、QA、套壳、打包）两边都不需要 ego。详见 `pptgen/platforms.md` 和 `pptgen/research.md`。

本仓库**不内置、不 fork ego-lite**。需要时自己装他们的 app：<https://github.com/citrolabs/ego-lite>

## 装到本机

需要：Node 18+、Python 3.10+、`pip install -r requirements.txt`。视觉 QA 再备一个导出引擎：

| 系统 | 首选 | 后备 |
|---|---|---|
| macOS | Keynote | LibreOffice + `pypdfium2` |
| Windows | Microsoft PowerPoint | LibreOffice + `pypdfium2` |

```bash
git clone https://github.com/alex-zz7/pptgen-skill.git
cd pptgen-skill
```

macOS / Linux：

```bash
./install.sh
```

Windows（PowerShell）：

```powershell
.\install.ps1
```

会把两个 skill 拷到 Cursor 的 skills 目录：

- `pptgen` → `~/.cursor/skills/pptgen`（Win：`%USERPROFILE%\.cursor\skills\pptgen`）
- `xhs-banhui-scan` → 同上一级

Claude Code 用 `./install.sh --claude` 或 `.\install.ps1 -Claude`。

装完在对话里说「用 pptgen 做一套……」即可。`{baseDir}` 就是 skill 目录，不要写死某台机器的绝对路径。

## Windows 用户日常怎么用

装的是 **Cursor + 这个 skill**，不是一个双击就能出 PPT 的软件。人负责拍板和登录，agent 负责调研、写稿、出图、排版、打包。

**只做一次**

1. 装 [Cursor](https://cursor.com)、[Node 18+](https://nodejs.org)、[Python 3.10+](https://www.python.org/downloads/)（安装 Python 时勾上 Add to PATH）。
2. 装导出引擎：有 Microsoft PowerPoint 就够；没有就装 [LibreOffice](https://www.libreoffice.org/)。
3. 克隆本仓库，PowerShell 里：

```powershell
cd pptgen-skill
pip install -r requirements.txt
.\install.ps1
```

4. 系统环境变量里加 `OPENAI_API_KEY`（出图用，不要发给 agent 让它打印出来）。
5. 重开 Cursor，打开一个空文件夹当课件工作区（不要把 skill 仓库本身当项目）。

**每一单**

1. 新开 Agent 对话，说清楚场景和学段，例如：「用 pptgen 做一套小学班干部竞选+培训+聘任，按 skill 全流程走。」
2. 调研时 Cursor 会打开内置浏览器进小红书。弹出登录墙就在这个窗口扫码，扫完回一句「继续」。300012 就自己用日常 Chrome 搜，把藏/评截图贴回去。
3. agent 写出逐字稿 / 风格词 / 页方案后，看一眼再让它继续出图排版。
4. 客户包 `字体/` 出来后，先双击装进 Windows（思源黑体 / 宋体），再让它导出逐页图和套壳，否则 PowerPoint 预览会错位。
5. 结束时它会报绝对路径和 `{短名}-输出全套.zip`。用 WPS 或 PowerPoint 抽几页（尤其表格、大图页）对一下。

**不用做的**

- 不用装 ego-lite（Windows 装不上）。
- 不用自己写 AppleScript / 开 Keynote。
- 不要把 `node_modules` 拷来拷去，每个课件项目让它自己 `npm install`。
- 商品主图仍等你的 1242×1660 模版，skill 不渲。

## 仓库里有什么

```
pptgen/                 # 主 skill（SKILL.md + 流程文档 + scripts/）
xhs-banhui-scan/        # 同伴：小红书跟单选品（可选）
requirements.txt        # pillow / numpy / pypdfium2
install.sh / install.ps1
```

主 skill 入口：[`pptgen/SKILL.md`](pptgen/SKILL.md)。班干部三件套示例：[`pptgen/examples/class-cadre.md`](pptgen/examples/class-cadre.md)。

每个课件项目自己 `npm install pptxgenjs sharp docx`，不要软链别的项目的 `node_modules`。

出图走 `gpt-image-2`（`https://ai-proxy.cc/v1`），key 只放环境变量 `OPENAI_API_KEY`，不要写进仓库、不要打印。

## 和本机正在用的 skill 同步

改完 GitHub 上的文件，再跑一次 `install.sh` / `install.ps1` 覆盖 `~/.cursor/skills/pptgen`。不要在两处各改一版。

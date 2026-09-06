# 平台：macOS 和 Windows 同一套流程

pptgen **不依赖 ego-lite 才能做课件**。ego-lite 只是调研小红书时的首选浏览器，而且 [官方目前只出了 macOS](https://github.com/citrolabs/ego-lite)（Windows / Linux 在他们 roadmap 上）。Win 用户把 skill 装上就能建 PPT、出图、QA、套壳、打包。

`{baseDir}` = 本 skill 目录（Mac 常见 `~/.cursor/skills/pptgen`，Win 常见 `%USERPROFILE%\.cursor\skills\pptgen`）。命令一律 `python3 {baseDir}/scripts/xxx.py`，不要写死 `/Users/…`。

## 1. 运行时（两边都要）

| 工具 | 用途 | 备注 |
|---|---|---|
| Node 18+ | `pptxgenjs` `sharp` `docx` | 每个项目里 `npm install`，不软链别的项目 |
| Python 3.10+ | 出图 / QA / 抠图 / 套壳 / 打包 / 导出 | `pip install pillow numpy pypdfium2` |
| 思源字体 | 标题 Heavy + 正文 Regular/Bold；典礼可加思源宋体 Heavy | 随客户包 `字体/` 分发；**导出前先装进系统** |
| 出图 API | `gpt-image-2` via `https://ai-proxy.cc/v1` | key 只走环境变量 `OPENAI_API_KEY`，不打印 |

## 2. 调研小红书

Windows **就用 Cursor 内置浏览器** 活搜，步骤写在 [xhs-browser.md](xhs-browser.md)：扫码登录 → 搜索 URL → 点封面 → 记藏/评 → Escape。不是「Win 不能调研」。ego-lite 只是 macOS 上更稳的同一个流程。

过不了登录墙或 300012：把搜索词发给用户，他们用自己已登录的浏览器搜，把数字贴回来。禁止 Playwright / 系统 Chrome 硬闯。

## 3. 逐页图导出（视觉 QA + 套壳的输入）

只跑这一条，不要再手写 AppleScript / COM：

```bash
python3 {baseDir}/scripts/export-slides.py {pptx} {项目}/qa/slides/{节点}
```

| 系统 | 第 1 引擎 | 后备 |
|---|---|---|
| macOS | Keynote（`keynote-export.sh`，不 activate、窗口隐藏、导完 quit） | LibreOffice 转 PDF + `pypdfium2` |
| Windows | PowerPoint COM（`WithWindow=$false`，导完 Quit） | 同上 |
| Linux | LibreOffice + `pypdfium2` | — |

用户桌面上不该弹出 Keynote / PowerPoint / 终端窗口。禁止 `activate`，禁止 `tell application "Terminal" to do script`。

导出前把 `字体/` 装进系统，否则光栅化用替代字体，QA 图和买家看到的会对不上。

## 4. 路径和命令

- 路径用 `pathlib` / `path.join`，禁止写死 `/Users/…` 或 `/tmp/…`。临时目录用 `tempfile.gettempdir()`。
- 后台长任务用 agent tool 的后台模式，不要新开 Terminal / PowerShell 窗口。
- `{baseDir}` 解析：skill 自己的目录；项目脚本里 `require(path.join(process.env.PPTGEN_HOME || <skillDir>, 'scripts/theme.js'))`。

## 5. 字体跨平台

正文 `Source Han Sans SC`，标题 `Source Han Sans SC Heavy` 或 `Source Han Serif CN Heavy`。不用苹方 / 兰亭黑 / 微软雅黑 / 楷体当主字体。Windows 没装随包字体 → 行高变、字溢出（见 [failures.md](failures.md) 000）。注意事项页写「先安装 `字体/`」。

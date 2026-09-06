# 这个 skill 跑在哪个 agent 里

pptgen 是一份 **SKILL.md + 脚本**，不是 Cursor 插件。任何能读 skill、能跑 Node/Python 的 agent 都能用：Cursor、Claude Code（`claude` CLI）、Codex、其它兼容 Agent Skills 的客户端。

`{baseDir}` = 这份 `pptgen/` 目录被拷到的位置。不要写死 `~/.cursor/skills`。

## 装到哪里

`install.sh` / `install.ps1` **默认两处都装**（有目录就覆盖，没有就创建）：

| 客户端 | 用户级目录（Mac / Linux） | 用户级目录（Windows） |
|---|---|---|
| Cursor | `~/.cursor/skills/pptgen` | `%USERPROFILE%\.cursor\skills\pptgen` |
| Claude Code | `~/.claude/skills/pptgen` | `%USERPROFILE%\.claude\skills\pptgen` |

只要 Cursor：`./install.sh --cursor` / `.\install.ps1 -CursorOnly`  
只要 Claude Code：`./install.sh --claude` / `.\install.ps1 -Claude`

也可以拷进**当前项目**：`.cursor/skills/pptgen/` 或 `.claude/skills/pptgen/`，只对这个仓库生效。

Codex / 其它客户端：按其文档把 `pptgen/` 整夹放进 skills 目录，或设 `PPTGEN_HOME` 指向这份目录。

## 启动方式

装好后新开一轮对话，用自然语言点名即可，不必依赖 Cursor：

```
用 pptgen 做一套小学班干部竞选+培训+聘任，按 skill 全流程走。
```

Claude Code 也可以 `/pptgen`（skill 名）再补场景。工作区用一个**空的课件项目文件夹**，不要把本 Git 仓库当项目。

## 调研：按「这台 agent 有什么」选打开方式

看什么不变（藏 / 评 / 「求」），怎么打开见 [xhs-browser.md](xhs-browser.md)。检测顺序：

1. PATH 里有 `ego-browser` → ego lite（今天基本只有 macOS）。
2. 当前客户端有**可交互、能点页面**的浏览器（Cursor 的 IDE browser；或用户自己接的浏览器 MCP）→ 用它，点封面，不直跳笔记 URL。
3. 只有 `WebFetch` / `WebSearch`（Claude Code 常见）→ **不要**拿它们当小红书调研。登录墙和 300017 会得到空页，容易误判「没有需求」。
4. 以上都没有 → 把 4–6 个搜索词发给用户，用户用日常已登录的浏览器 / App 搜完，把藏评截图或数字贴回来。

Windows + Claude Code 没有 ego、也没有 Cursor 浏览器，**第 4 档就是默认活搜**，不是故障。不要为了「必须自动点」去开 Playwright。

## 做课件（和哪个 agent 无关）

出图、`theme.js`、QA、`export-slides.py`、套壳、打包都是本机命令，Cursor 和 Claude Code 都是调用同一套脚本。差别只在调研怎么打开网页。

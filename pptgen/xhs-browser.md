# 小红书怎么打开（按 agent 能力，不按「是不是 Cursor」）

调研要的是藏 / 评 / 「求」条数。禁止 Playwright、系统 Chrome 硬闯、直跳 `/explore/<id>`（300012 / 300017）。哪个客户端在跑，见 [hosts.md](hosts.md)。

先检测，再动手：

| 顺序 | 条件 | 怎么打开 |
|---|---|---|
| 1 | `ego-browser` 在 PATH | ego lite。登录闸门 → 搜索 URL → 点封面 → Escape。命令见 `xhs-banhui-scan` |
| 2 | 当前 agent 有可点击的浏览器（Cursor IDE browser，或用户配的浏览器 MCP） | 下面「可点击浏览器」 |
| 3 | 只有 WebFetch / WebSearch | **跳过自动打开**，直接第 4 档。不要把空页写成「没有需求」 |
| 4 | 都没有，或 1–2 过不了登录墙 / 300012 | 把词发给用户，用户自己搜，把数字或截图贴回来 |

Windows + Claude Code 通常直接走 4。Windows + Cursor 通常走 2。macOS 有 ego 走 1。

## 可点击浏览器（Cursor 或同类 MCP）

工具名因客户端而异（Cursor：`browser_navigate` / `browser_snapshot` / `browser_click`；其它 MCP 用它们自己的 navigate / snapshot / click）。规矩一样。

### 1. 登录闸门

1. 看有没有已开的小红书页。
2. 打开 `https://www.xiaohongshu.com/explore`。**第一次扫码要把窗口露给用户**，扫完不要再抢焦点。
3. 看页面：
   - 「扫码登录 / 手机号登录」→ **停**：「请在刚才弹出的浏览器里扫码，扫完回我一声。」
   - 「300012 / IP 存在风险」→ **停**，改走第 4 档。不要换 Playwright。
   - 能看到「发现 / 搜索」且没有登录墙 → 继续。

用户说「继续」后再看一次页面，不要假设扫码成功。

### 2. 搜

同一标签进：

`https://www.xiaohongshu.com/search_result?keyword=` + URL 编码后的词

默认词见 [research.md](research.md)。每词首页最多 20 张卡。搜索卡上的赞只作参考；**藏和评往往要点进详情才准**。

### 3. 点进详情

- 点卡片**封面**，不要点标题，不要把笔记 URL 填进地址栏。
- 详情记：标题、赞、藏、评、正文里「求」几次、有没有「文件」、有没有标价。评论只看老师在问什么。
- Escape 关详情。每词最多点 2 条：互动高的 1 条 + 带「文件」的 1 条。
- 搜完把浏览器还回去，不要留在前台。

## 用户自己搜（Claude Code / 无浏览器时的默认）

发给用户的清单必须具体，不能只说「你去搜一下」：

```
请用已登录的小红书（电脑或 App）搜这些词，每个词把首页里最好的 3 条发我：
- 主题班会ppt
- 班会课件
- （当前档期词）
每条写：标题、收藏、评论、「求课件」大概几条、有没有「文件」附件。
截图也行。看不到已售就写未取到。
```

按贴回来的实数填 `workflow/brief.md`。编数字比不搜更糟。

# 小红书怎么打开（Win / Mac 同一套看什么，打开方式不同）

调研要的是藏 / 评 / 「求」条数，不是某一种浏览器。两边都禁止 Playwright、系统 Chrome 硬闯、直跳 `/explore/<id>`（300012 / 300017）。

## Windows 上怎么搜（这是默认路径）

Windows **没有** ego-lite。活搜走 **Cursor 内置浏览器**（`cursor-ide-browser`：`browser_navigate` / `browser_snapshot` / `browser_click` / `browser_lock` / `browser_press_key`）。和你自己开 Chrome 点小红书是同一类：要登录、要点封面、风控了就停。

### 1. 登录闸门（必须先过）

1. `browser_tabs` 看有没有已开的小红书页。
2. `browser_navigate` 到 `https://www.xiaohongshu.com/explore`。**第一次需要扫码时**把标签露出来（`position: "active"`），扫完立刻不要再抢焦点。
3. `browser_lock` → `browser_snapshot`。
4. 判断：
   - 正文里有「扫码登录 / 手机号登录」→ **停**。回用户：「请在 Cursor 浏览器里扫码登录小红书，扫完回我一声。」不要自己猜已经登录。
   - 出现「300012 / IP 存在风险」→ **停**。不要换 Playwright。把 4–6 个搜索词发给用户，改走「用户自己搜、把数字贴回来」。
   - 能看到「发现 / 搜索」且没有登录墙 → 继续。

用户说「继续」之后再 `browser_snapshot` 确认一次，不要假设扫码一定成功。

### 2. 搜

同一标签进搜索，**不要**新开一堆标签：

`https://www.xiaohongshu.com/search_result?keyword=` + URL 编码后的词

默认词见 [research.md](research.md) / `xhs-banhui-scan`。每词只看首页，最多记 20 张卡。

`browser_snapshot`（必要时再 `browser_cdp` `Runtime.evaluate`）抽卡：`title` / 附近文本 / 是否带「文件」/ 卡片链接。搜索卡上的赞只作参考；**藏和评往往要点进详情才准**。

### 3. 点进详情（和 ego 同一条规矩）

- 点卡片的**封面**（snapshot 里 cover / 图片那个控件），不要点标题文字，不要 `browser_navigate` 到 `/explore/<id>` 或 `/search_result/<id>`。
- 详情里记：标题、赞、**藏**、**评**、正文里「求」出现几次、有没有「文件」、有没有标价。
- 评论只扫前几条里老师在问什么（几年级 / 能改字吗 / 有讲稿吗）。
- `browser_press_key` `Escape` 关掉详情，回到搜索列表。每词最多点 2 条：互动高的 1 条 + 带「文件」的 1 条。
- 全部搜完 `browser_lock` unlock。不要把浏览器留在前台。

### 4. 过不了就降级，不要编

Cursor 浏览器过不了登录墙、一直 300012、或 snapshot 里抽不到卡：

1. 把搜索词和「每条要记：标题、藏、评、『求』、有没有文件」发给用户。
2. 用户用自己日常登录的 Chrome / 小红书 App 搜，把截图或数字贴回来。
3. 按贴回来的实数填 `workflow/brief.md`。网页上看不到的已售写「未取到」。

这不是偷懒：Windows 上这就是和 ego 同等合法的数据来源。编数字比不搜更糟。

## macOS 上怎么搜

`ego-browser` 在 PATH 里 → 用 ego lite（隔离 Space、复用登录态）。步骤仍是：登录闸门 → 搜索 URL → 点封面 → Escape。命令见 `xhs-banhui-scan`。没有 ego 时，**和 Windows 走同一套 Cursor 浏览器**，不要为了「必须用 ego」卡住。

## 不要做

- 用 Playwright / 系统 Chrome 另开一套自动化去撞小红书
- 没登录就硬搜，然后把空页面当成「没有需求」
- 直跳笔记 URL
- 把 Windows 调研写成「做不到」——做得到，只是浏览器换成 Cursor 的

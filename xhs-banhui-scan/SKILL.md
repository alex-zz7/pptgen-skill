---
name: xhs-banhui-scan
description: "搜小红书课件热点并给出可跟单选品。浏览器首选 ego lite（macOS）；没有 ego 时用用户贴的数字/截图或 Cursor 内置浏览器。不用 OpenClaw、不用 Playwright。用户提到搜索热点、跟单、主题班会ppt、班会课件、班干部、家长会、开学第一课、备课热销、发布商品、商品贴纸时必须使用。目的是找正在热的班主任课件场景，交给 pptgen 做成课件包上架。选品看收藏和评论，不看赞。未登录只提醒扫码。"
user-invocable: true
---

# 小红书课件热点跟单

目的：找出**现在**老师在搜、在存、在求分享的 PPT 场景，选出 3—5 个能跟的单，再交给 `pptgen` 按其 `scenarios.md` 做成课件包（班级管理、家长会、开学期末、心理、安全、节日、品德励志、教师分享都算），最后上架商品、笔记贴商品贴纸。

需求信号看**收藏和评论**（「求课件」条数），不看赞；标题里有「模板 / 可编辑 / 可打印 / A4」的实物件帖单独记；点 1–2 个头部卖家主页抄 SKU 目录。

不是去挖某个电影/IP 的周边。某个热片只是题材池里的一种，和教师节、安全、情绪课并列看，不单开一节「只找八仙」。

只看、只记、只出选品。不点赞、不评论、不发布。

**浏览器按优先级：** 1) macOS 已装 ego lite 就用 `ego-browser`（先读 `ego-browser` skill）；2) 用户已经贴了藏/评/截图就直接填表；3) 否则用 Cursor 内置浏览器，点封面进详情。ego lite 官方目前只出 macOS（https://github.com/citrolabs/ego-lite），Windows 装不上不是故障。禁止 `openclaw browser`，禁止 Playwright，禁止系统 Chrome 硬闯（300012）。

`{baseDir}` 是本 skill 目录。

## 触发后先做

1. 登录闸门。未登录就停，让用户在**当前这套浏览器**里扫码（Win = Cursor 浏览器，Mac = ego 或 Cursor）。点法见 `pptgen/xhs-browser.md`。
2. 搜默认词（用户改词则用用户的）。
3. 按题材聚类，填 [templates/report.md](templates/report.md)。核心产出是 **跟单选品表**。
4. `{baseDir}/scripts/render-report.py` 出 pdf。
5. 给报告路径。不发微信。
6. 停在选品。没点名「开做 / 跟这一单」不要开 `pptgen`。
7. 调研结束：`completeTaskSpace`。默认 `{ keep: false }`。

## 怎么开浏览器

先检测 `ego-browser` 在不在 PATH。不在（Windows 上现在一定不在）就跳到下面「没有 ego 时」。

有 ego 时，每一轮 heredoc 先接回同一个 space，不要新开：

```bash
ego-browser nodejs <<'EOF'
const task = await useOrCreateTaskSpace('xhs-banhui-scan')
cliLog('task space id: ' + task.id)
await openOrReuseTab('https://www.xiaohongshu.com/explore', { wait: true, timeout: 30 })
const info = await js(String.raw`(() => {
  const t = document.body.innerText || '';
  return {
    url: location.href,
    loggedIn: t.includes('我') && !/手机号登录|可用 小红书 或 微信 扫码/.test(t),
    risk: /300012|IP存在风险/.test(t),
  };
})()`)
cliLog(info)
EOF
```

| 结果 | 动作 |
| --- | --- |
| 已登录 | 继续搜 |
| 未登录 | `handOffTaskSpace('xhs-banhui-scan')`，回复：「小红书没登录。请在当前浏览器里扫码，扫完回我一声。」停。用户说继续后再 `takeOverTaskSpace` |
| IP 风控 | 停。不要换 Playwright / OpenClaw。请用户自己搜，把藏/评数字贴回来 |
| 用户正在控浏览器 | 停，问继续还是结束。不要自己 `takeOverTaskSpace` |

### 没有 ego 时（Windows 默认走这里）

完整点法：[pptgen/xhs-browser.md](../pptgen/xhs-browser.md)。

1. 用户已贴藏/评/截图 → 直接填 [templates/report.md](templates/report.md)。
2. 否则 Cursor 内置浏览器：`browser_navigate` 搜索 URL → `browser_snapshot` 抽卡 → `browser_click` 点封面（不要 `navigate` 到笔记 URL）→ 详情记藏/评 → `Escape`。
3. 未登录：把 Cursor 浏览器露出来让用户扫码，扫完再继续。
4. 300012 / 抽不到卡：停，把词发给用户，用他们日常浏览器搜完把数字贴回来。

点进笔记：在搜索页用 `js` 找到卡片 `a[href*="<id>"]`，取其 `section` 里 `a.cover` 的中心坐标，`click([x, y])`（点标题链接不一定打开详情）。不要 `goto` 直跳 `/explore/<id>` 或 `/search_result/<id>`（会 300017）。详情页取 `#detail-title`、`#detail-desc`、`.like-wrapper .count`、`.collect-wrapper .count`、`.chat-wrapper .count`、`.comment-item .content`；按 `Escape` 关闭。

抽卡用 `js(...)` 一次返回，结果 `cliLog`。

## 搜什么（跟日历，不跟某个 IP）

默认词按「现在能卖」排，不按旧项目排：

1. 主题班会ppt
2. 班会课件
3. 开学第一课ppt
4. 心理健康课ppt
5. 当前 14 天内的节日/开学档（例：教师节ppt、中秋主题班会、国庆安全教育、白露主题班会）

电影热点只作为第 6 类抽样，搜「开学第一课 + 当下热映名」，用来判断要不要跟，不是主任务。

同一 tab `gotoAndWait`：

`https://www.xiaohongshu.com/search_result?keyword=<urlencoded>`

网页常无「商品」Tab。已售写「未取到」，不要编。

## 抽卡

每词首页最多 20 条：`title author likes nearby href hasFile`。

```js
const data = await js(String.raw`(() => {
  const text = (el) => (el.innerText || '').replace(/\\s+/g, ' ').trim();
  const cards = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/search_result/"]')) {
    const title = text(a);
    if (!title || title === '文件' || title.length < 6 || seen.has(title)) continue;
    seen.add(title);
    const wrap = a.parentElement?.parentElement || a.parentElement;
    const nearby = text(wrap);
    cards.push({
      title: title.slice(0, 90),
      nearby: nearby.slice(0, 160),
      href: a.href.split('?')[0],
      hasFile: nearby.includes('文件'),
    });
  }
  return { title: document.title, cards: cards.slice(0, 20) };
})()`)
cliLog(data)
```

点进：每轮最高赞 1 条 + 「文件」1 条。记赞/藏/评、附件、求分享、有没有标价。

同时记下筛选条、相关搜索。把标题打成题材标签，例如：情绪/立规矩/节日/安全/电影热点/免费大礼包/学科开学第一课。

## 怎么选跟单（给卖货用）

每条候选必须能回答：

- 为什么热（藏、评「求」数、筛选条、档期；赞只作参考）
- 货架上已经很多免费 99+ 的，我们怎么不一样（全流程 + 逐页讲稿 + 可编辑实物件 + 一体机展示图，不卖「99 套打包」）
- pptgen 输入：场景族 / 节点、学段、比货架多给的一样东西（实物件或流程步）
- 上架：商品名、笔记标题钩子、商品贴纸怎么贴（笔记带货，不是做物理贴纸）

砍掉：纯学科课文、纯免费引流包、只有经验没有课件结构、单一 IP 且赞很低。

默认交 3—5 个选品，标「先做 / 可备 / 不做」。

## 报告与交付

目录：当前项目 `workflow/xhs-scan/YYYY-MM-DD-HHmm/`（没有项目就写到用户主目录 `xhs-banhui-scan/YYYY-MM-DD-HHmm/`）

- `report.md` `raw.json` `report.pdf`

报告里浏览器栏写实际用的工具（ego lite / Cursor 浏览器 / 用户粘贴），不要写 OpenClaw。

用户要开做时：把选中的那一行交给 `pptgen`，按 `pptgen/scenarios.md` 选场景族和节点；心理健康课只是其中一族，班会、家长会、仪式都可以做。

交付只给路径，不发微信（2026-09-06 起）。

## 禁止

- 发帖、评论、点赞、关注
- 没点名就开做整套课
- 把任务收成「找某某电影贴纸/周边」
- 编已售
- OpenClaw 浏览器、Playwright、系统 Chrome 硬闯 300012

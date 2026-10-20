# 架构

本文记录**为什么代码是这个形状**，以及哪些约束不能被打破。
决策的来龙去脉在 `design.md`、`p0-findings.md`、`p1-findings.md`、`project-scope-plan.md`。

---

## 1. 分层

```
        shared.ts                    纯类型与常量，无依赖（叶子）
           ↑
   ┌───────┴────────┐
server/*          client/*          两侧互不依赖
   ↑                 ↑
   └───── host.ts ───┘              组装根：装配服务、注册路由、会话钩子
              ↑
        DSH 运行时
```

**硬约束：`client/` 不得 import `server/` 下任何模块。**

曾经违反过：面板为了拿 `SyncState`、`ImportPreview` 去 import `server/controller`。
虽然是 `import type`、产物里零残留，但方向是错的 —— **线上契约类型属于 `shared.ts`**，
否则浏览器半边要为「自己的载荷长什么样」去翻宿主实现。已修正。

`server/` 也不得 import `client/`（构建期从无违反）。

---

## 2. 两个面（这是全项目最核心的概念）

```
编辑面   <DSH_HOME>/yiklek/mcp.json
         <workspace>/.dsh/yiklek/mcp.json
              ↑ 用户在这里改（面板 / 手写）

有效面   <profile>/cordis.patch.yml  的受管理区块
              ↑ DSH 真正加载、模型真正看得见
```

**为什么必须两个：** 实测证明动态挂载的 `dsh-mcp-client` 能握手成功，但它的工具
**永远进不了 agent 的工具表**（`p1-findings.md`）。只有 profile 条目算数。

### 由此产生的三条不变量

1. **区块外逐字节不动。** `patcher.ts` 用文本拼接，从不重新序列化整个文件 ——
   用户的注释、其它插件条目必须原样保留。
2. **写前必须验证。** `assertLoadable()` 拒绝写出任何解析不出顶层数组的文件。
   曾经因为空区块把模板的 `[]` 删掉，导致 profile 起不来。
3. **不允许重复的 `serverName`。** 重复会让 loader 拒绝整个 profile，
   所以：外部条目（用户直接写在 patch 里的）只读、不物化；重复区块收敛成一个。

---

## 3. 座位（seat）

一个面板组件，五个挂载点，只在 `density` 和 `scope` 上不同：

| 座位 | 槽位 | scope | 跟随会话 |
|---|---|---|---|
| 插件页 | `plugins.bundle.config` (keyed) | 全部 | 桥接 |
| 侧边栏页 | `sidebar.panellist` (list, 只放图标) + `main` (keyed) | 当前工作区 + 全局 | 桥接 |
| 会话 tab | `conversation.view` (list) | 当前工作区 + 全局 | 直接 |
| 侧边栏标签 | `sidebar.right.pane.tab` (keyed, 键是**类型 id**) | 当前工作区 + 全局 | 直接 |
| 桥接 | `conversation.session.header.utilities` (list, 渲染 null) | — | 写入方 |

### 不变量

- **四份会漂移，所以只有一个工厂。** 早先四个座位各写一遍，结果侧边栏那份
  漏改了 `scope`，把别的项目的配置也列了出来。
- **`sidebar.panellist` 只放图标。** 行（按钮、tooltip、文字）由侧边栏自己画。
  塞整个面板进去会把面板挤进 278px 宽的侧栏。
- **`sidebar.right.pane.tab` 的键是 tab 类型的 `id`，不是 `kind`。** 且类型必须
  带 `priority: 'builtin'`、guide 条目必须带 `id` + `order`，否则注册无声失效。

---

## 4. 项目隔离

```
所有项目的 server 都在 profile 里（各连一次）
        ↓
agent/created：把「别的项目」的工具对这次会话 deny
```

**为什么不分项目挂载：** agent 的 scope 是独立创建的，不挂在任何工作区 scope 下，
所以「给工作区铸 scope」这条路走不通；而每会话各挂一份，进程数会是
「会话数 × 服务数」。

### 不变量

- **只用 `deny`，不用 `allow`**（`allow` 会把内置工具一起遮掉）。
- **deny 从 patch 文件实时计算，不用缓存。** 缓存只在启动和面板读取时刷新，
  手改 patch 后、没开面板就开会话，会算出过期的 deny —— 隔离形同虚设。
- **失败必须可见。** 注册、连接、写文件这类「必须成功」的动作，不允许 `catch {}`。

---

## 5. 错误策略

| 场景 | 做法 |
|---|---|
| 用户可修复的校验失败 | 返回 `{ ok: false, issues }`，4xx；面板按 `issue.code` 本地化 |
| 程序性错误 / IO 失败 | 抛；`guard()` 转 500 |
| 读取时的容错（文件损坏、不存在） | 返回空文档 + `error` 字段，绝不抛 |

**`server/` 产品代码里 `throw` 的数量是 0** —— 所有面向用户的失败都走返回值。

---

## 6. 并发

多个座位同时开着是常态。写操作带**内容版本**（`revision`）；版本不符时拒绝，
让用户重读后再存，而不是静默覆盖。

---

## 7. 已知的架构妥协

| 妥协 | 原因 | 代价 |
|---|---|---|
| **`panel.tsx` 1020 行** | 一个 `McpPanel` 承担状态、两个对话框、三段渲染 | 最难维护的文件；只有 e2e 护着 |
| **`host.ts` 底部 40 行导出** | 打包成单文件后，测试只能用这个入口 | 组装根同时是测试面 |
| **`patcher.ts` 用文本拼接而非 AST** | 必须保证区块外逐字节不动 | 需要手工处理 `[]`、重复区块、`...` 等边界；已各配回归测试 |

前两项如果重构，收益是「好维护」而非「更正确」。第三项是刻意选择：
AST 往返会重排用户的注释和缩进。

---

## 8. 测试策略

| 层 | 手段 | 为什么这样 |
|---|---|---|
| 纯逻辑（normalize/validate/naming/store/patcher/transfer） | `node --test`，134 条 | 快、无需运行时 |
| 编排（controller） | 驱动真实 `refresh/save/list` | **`tsc` 看不见暂时性死区**，曾因此上过一个崩溃 |
| 上游契约（compat） | 断言 DSH 仍声明 7 个槽位、`tools.restrict`、`agent/created` | 上游改名不会报错，只会静默失效 |
| UI 主流程 | Playwright + 真实 DSH | 服务端再正确，UI 接不上就是零 |
| 请求行为 | e2e 里数 `/list` 次数 | 每秒 1600 次的空转在界面上完全看不出来 |

**教训：断言「存在」不够，要断言「内容」。**
「有个错误横幅 ✅」放过了「显示的是 HTTP 400」；断言具体文案才挖出真正的问题。

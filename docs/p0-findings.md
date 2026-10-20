# P0 探针结论

> 四个只有真机才能回答的问题，全部有答案。**证据是运行记录，不是推断** ——
> 复现方式见本节末。目标 DSH `0.2.1-alpha.2`，Node v25.9.0。

---

## Q1 能否动态挂载官方 MCP 客户端并让工具进 `ctx.tools`？——**能**

链路完整跑通：

```text
loader.import('@deepseek-ai/dsh-mcp-client')   ✅ 返回 { Config, apply, createMcpToolDefinition, inject, name }
ctx.plugin(module, stdioConfig)                ✅ 返回 fiber（有 dispose）
→ 子进程被拉起                                 ✅
→ MCP 握手完整发生                             ✅ 见下
```

**握手证据**（自写探针 server 的 stderr，逐条方法到达）：

```text
[probe-mcp-server] pid=27012 started
[probe-mcp-server] recv method=initialize              id=0
[probe-mcp-server] recv method=notifications/initialized id=(notification)
[probe-mcp-server] recv method=tools/list              id=1
```

**工具注册证据**：

```text
tools.get('mcp__probe__probe_echo')  →  object      ✅ 已注册且可按名解析
```

### ⚠️ 两个必须记住的坑

**坑 1：specifier 必须带作用域。**

```text
'dsh-mcp-client'              → ERR_MODULE_NOT_FOUND: Cannot find package
'@deepseek-ai/dsh-mcp-client' → ✅
```

裸包名解析不到（loader 锚 `ctx.baseUrl`，即 profile 目录）。这条只靠读代码看不出来 ——
wingsky 的常量名恰好是 `OFFICIAL_MCP_CLIENT_SPECIFIER`，值才是答案。

**坑 2：`ctx.tools.all()` 是 scope 过滤的，插件自己的 ctx 里读到 0。**

`dsh-tools` 的 `register()` 实现：

```js
register(definition) {
  return this.layers.effect(this.ctx, (layer) => layer.tools.insert(name, definition), …)
}
```

工具插进的是**调用方 ctx 所属的 scope 层**（`@deepseek-ai/dsh-scope` 的 `ScopedLayers`）。
探针在自己的 ctx 里读 `all()` 得到空数组，但 `get(name)` 能解析到。

**对产品的直接影响：**

| 用途 | 正确做法 | 错误做法 |
|---|---|---|
| 判断某个 server 的工具是否注册 | `ctx.tools.get(name)`（点名） | `ctx.tools.all()` 再过滤 |
| 列出本 server 的工具 | **自己记账**（挂载时记下 `ctx.tools.register` 返回的 disposer 集合） | 依赖 `all()` |

> 好在这不是问题：官方客户端在 `syncTools` 里本来就维护 `Map<publicName, disposer>`，
> 我们只要**照它的做法自己记账**即可，UI 的工具列表从自己的账本读。

---

## Q2 `fiber.dispose()` 是否真的回收 stdio 子进程？——**是**

```text
挂载中   pids: ["27012:27007"]    ← 子进程 27012，父进程 27007（DSH 本体）
dispose 后 pids: []               leaked: false   ✅
```

**结论：`mounter` 可以放心依赖 `fiber.dispose()` 回收子进程，不需要自己补刀。**
但仍要在插件自身 dispose 时遍历账本全部 dispose（否则插件被卸载时会漏）。

---

## Q3 `working-directory/change` 的语义 —— **改的是会话工作目录，不是工作区**

`dsh-working-directory` 的实现：

```js
ctx.sessionProjections.register({
  key: 'workingDirectory',
  init: (header) => header.cwd ?? null,
  apply: (state, event) => event.type === 'working-directory/change' ? event.data.cwd : state,
})
```

```js
commit(agent, directory) {
  const previous = this.get(agent.session)
  if (previous === directory) return
  agent.session.append('working-directory/change', { cwd: directory })
  …
}
```

**所以 `cwd` ≠ `workspace`：**

| | 来源 | 是否变动 |
|---|---|---|
| **workspace** | 会话的 `workspaceId` | 会话绑定的项目 |
| **cwd** | session projection `workingDirectory`，初值 `header.cwd` | **会话中途可变** |

**对设计的影响：项目级配置按「工作区」键，所以 `cwd` 变化不影响它 —— 无需订阅该事件重解析。**
（我原先把它列为「必须订阅的风险」，是过度担心。）

> 若将来想做「跟随 cwd 的 MCP 配置」（像 Claude Code 的 `.mcp.json`），那才需要订阅。
> 你的需求是「工作区级」，用不到。

---

## Q4 能否识别「当前工作区」？—— **分面：会话页能，root 面不能**

这一条推翻了我上一轮的「修正」。准确结论如下。

**① `useWorkspaces` 在所有槽位都有 —— 但它给的是列表，不是「当前」。**

```ts
interface WorkspaceSnapshot {
  readonly items: readonly WorkspaceView[]        // 只是列表
  readonly archivedSessionIds; readonly pinnedSessionIds
  readonly state: 'idle' | 'loading' | 'error'
  readonly phase: WorkspaceListPhase
  readonly error: RemoteFailure | null
}
```

**没有 `current` / `selected` / `active` 字段。**

**② 「当前工作区」必须从会话推导。** 会话带 `workspaceId`：

```ts
// SessionSnapshot
readonly workspaceId?: WorkspaceId
```

**③ 只有 session scope 的槽位拿得到会话。**

```text
conversation.session.header.utilities   useSession + sessionId + useSessions …   → 能精确解析 ✅
plugins.bundle.config   (root)          useWorkspaces + useSessions（无 sessionId） → 只有列表 ❌
sidebar.panellist       (root)          同上                                       → 只有列表 ❌
main                    (keyed, root)   ownerProps: []，无 session 绑定            → 只有列表 ❌
```

**④ 导航服务只暴露动作，没有「当前」读取口。**

```text
uiWorkspace.openSession / startSession / pinSession / pickDirectory …   ← 全是动作
workspaceNavigation.openWorkspace / openSession / startSession          ← 全是动作
```

**结论与设计对策：**

| 入口 | 当前工作区 | 对策 |
|---|---|---|
| **会话页** | 能自动解析 | `sessionId` → `useSession(s => s.workspaceId)` → 在 `workspaces.items` 里查路径 |
| **插件页 / 侧边栏** | 拿不到 | `useWorkspaces` 列出来让用户选；**记住上次选择**（持久化）；只有一个工作区时直接用它 |

**所以「root 面让用户选工作区」这个设计结论是对的 —— 我上一轮基于「有 `useWorkspaces` 就够了」
的修正是错的。** 准确的区分不是「能不能读到工作区」，而是「**能不能读到当前会话**」。

---

## 复现方式

> ⚠️ 下面的路径指向已经删除的 `probe/`。这是当时的执行记录，保留是为了说明如何复现，
> **不是可以直接运行的脚本**。要重跑请先按本文描述把探针写回来。

```bash
# 1. 临时 DSH 环境（不碰你的 profile）
export DSH_HOME=/tmp/mcp-p0-home
rm -rf "$DSH_HOME"
PROBE=/Users/yiguangzheng/projects/dsh/dsh-mcp-panel/probe/plugin
dsh plugin --profile web add "$PROBE"

# 2. 启动（探针会自己把结论写成 JSON）
export DSH_MCP_PROBE_SERVER=/Users/yiguangzheng/projects/dsh/dsh-mcp-panel/probe/mcp-echo-server.mjs
export DSH_MCP_PROBE_REPORT=/tmp/mcp-p0-report.json
cd "$DSH_HOME/profiles/web"
dsh --profile web --host 127.0.0.1 --port 3097 --no-open

# 3. 读结论（探针会在约 24 秒内写完）
cat "$DSH_MCP_PROBE_REPORT"
```

诊断件已删除（一次性产物，不进产品仓库）。当时的三份产物是：

| 文件 | 说明 |
|---|---|
| `mcp-echo-server.mjs` | 零依赖的最小 MCP stdio server，带请求日志 |
| `plugin/lib/host.mjs` | 探针插件，自动跑完 Q1/Q2 并写 JSON 报告 |
| `p0-report.json` / `p0-run.log` | 本次运行的原始证据 |

> 探针是**一次性诊断件**，不是产品代码，已按要求删除。
>
> 代价要说清楚：日后 DSH 升级时，没有现成的探针可以重跑。如果那几个假设
> （动态挂载的工具不可见、`restrict` 行为、热重载路径）在新版本里变了，得照本文重写一遍。
> 本文记录的是**结论和查证方法**，这就够重写，但比保留代码多一道工序。

---

## 对设计文档的改动

| 章节 | 改动 |
|---|---|
| §2.5 | 澄清：所有槽位都有 `useWorkspaces`，但那是**列表**；「当前工作区」只有 session 槽位能自动得到 |
| §3.5 | 重写解析规则（见 Q4 表）；删除「需订阅 `working-directory/change`」的结论（Q3 表明不需要） |
| §6.3 | 明确 root 面用「选择 + 记住上次 + 单工作区自动」，并说明为何不猜 |
| §5.1 | `mounter` 增加一条：**自己记账工具名与 disposer，不依赖 `ctx.tools.all()`** |
| §9 P0 | 标记完成 |

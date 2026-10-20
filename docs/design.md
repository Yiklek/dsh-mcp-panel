# dsh-mcp-panel —— 原始设计方案

> ⚠️ **这是最初的设计稿，不是现状。**
>
> 现状看 [`architecture.md`](architecture.md)；决策的来龙去脉看
> [`p0-findings.md`](p0-findings.md) 与 [`p1-findings.md`](p1-findings.md)。
>
> 本文保留下来是因为它记录了**为什么当初那么想**，其中几条判断被实测推翻了。
> 下文凡是与 `architecture.md` 冲突的地方，以 `architecture.md` 为准。
>
> 已知失效的地方（读之前先知道）：
>
> | 本文描述 | 实际 |
> |---|---|
> | `src/server/merge.ts`、`EffectiveServer`、`shadowedBy` | **已删除**。同名处理改为：与全局同名→不生效；项目之间同名→加 `--<hash8>` 后缀 |
> | `mounter` 动态挂载（`loader.import` → `ctx.plugin`） | **已证伪**。动态挂载的工具进不了 agent 工具表 |
> | `rows.tsx` / `editor.tsx` / `importer.tsx` / `diagnostics.tsx` | 不存在。共用一个 `panel.tsx` |
> | 「三个槽位」 | 实际五个（插件页 / 侧边栏页 / 会话 tab / 侧边栏标签 / 桥接座位） |
> | 「只做全局」 | 项目级已完成 |
> | 导入导出 | 已实现（含预览校验、按格式写回） |

> MCP 管理插件：在一个地方管理 DSH 的**全局 MCP** 与**项目级 MCP**，可在插件页、会话页、
> 侧边栏配置，界面风格与 DSH 一致。

架构在 P1 验收时被纠正过一次，见 [`docs/p1-findings.md`](p1-findings.md)：
动态挂载的 MCP 工具**进不了模型工具表**，只有 loader 实例化的 profile 条目才行 ——
因此 **D3 已撤销**，生效路径改为：

```text
编辑面  <DSH_HOME>/yiklek/mcp.json
          ↓ 保存时物化（受管理区块）
生效面  <profile>/cordis.patch.yml   ← dsh-hmr 监听，改动即时生效
```

真机验收：面板保存 → 无需重启 → agent 工具表出现 `mcp__probe__probe_echo` ✅

**项目级仍缓议**（profile 条目没有工作区维度，见 p1-findings 的 N3）。
P0 结论（`docs/p0-findings.md`）仍然有效。
**目标 DSH**：`0.2.1-alpha.2`（本机 `dsh --version` 实测）。

---

## 1. 目标与范围

### 1.1 要做的

| # | 能力 |
|---|---|
| 1 | **全局 MCP**：`<DSH_HOME>/yiklek/mcp.json` |
| 2 | **项目级 MCP**：`<workspace>/.dsh/yiklek/mcp.json` |
| 3 | **主流格式协议**：能读能写 Anthropic/Claude Desktop、VS Code、Cursor、以及 DSH 原生形状 |
| 4 | **三处入口**：插件页、会话页、侧边栏，共用同一套配置组件 |
| 5 | **样式与 DSH 一致**：只用 DSH 的设计令牌与交互惯例 |
| 6 | **真的能连上**：把配置变成 DSH 里可用的 MCP 工具（`mcp__<name>__<tool>`） |

### 1.2 不做的

- 不实现 MCP 协议本身 —— 复用官方 `@deepseek-ai/dsh-mcp-client`。
- 不碰 `mcp-resources`（资源面由官方 `dsh-mcp-resources` 提供）。
- 不做 MCP 市场/目录的在线拉取（首期内置一份静态推荐表即可）。

### 1.3 与已装第三方 MCP 插件的关系

你的 profile 里当前装着两个第三方 MCP 插件：

| 包 | 作者 |
|---|---|
| `dsh-mcp-panel@0.6.24` | PerryLink |
| `@wingsky-1/dsh-mcp-manager@0.2.9` | wingsky |

**它们与本插件互斥。** 三者都通过 `loader` 挂载官方 `dsh-mcp-client`，会重复连接同一批
server 并争抢 `mcp__<serverName>__<tool>` 命名空间，同时启用必然冲突。

**本插件可用后把它们移除。** 顺序：

```text
1. 装本插件，确认要用的 server 都能连上
2. 再移除那两个
3. ~/.dsh/@wingsky-1/dsh-mcp-manager/mcp.json 里如需保留配置，先导入再删
```

> **本插件的功能范围由 §1.1 定义，不以那两个插件为参照** —— 它们怎么做的不是需求。
> 移除就是移除，不产生「必须做得一样」的义务。

⚠️ **一次性提示**：npm 上的 `dsh-mcp-panel` 属于 PerryLink，所以**不要 publish 到 npm**。
走 GitHub 消费（`github:Yiklek/dsh-mcp-panel#pkg`）完全不受影响。

---

## 2. 上游事实核查

全部为**本机实测**，非推测。这些事实决定架构，所以逐条给出证据。

### 2.1 官方客户端是「一 server 一条目」

`@deepseek-ai/dsh-mcp-client@0.2.1-alpha.2` 的 `Config` 是 **union**：

```ts
// stdio
{ transport: 'stdio', serverName, command, args, env, cwd,
  toolCallTimeoutMs, failOnStartupError, maxInstructionBytes, reconnect }
// streamable-http
{ transport: 'streamable-http', serverName, url, headers,
  toolCallTimeoutMs, failOnStartupError, maxInstructionBytes, reconnect }
```

导出面：`export { Config, apply, createMcpToolDefinition, inject, name }` —— **它不提供 ctx 服务**，
每个 server 就是一次插件挂载。**只有这两种 transport**（`dsh-acp` 对其它类型直接抛
`transport ... is not supported`）—— 所以 **SSE 不在支持范围**，导入时要明确降级策略。

### 2.2 运行时挂载机制（架构核心）

官方与两个第三方插件都是同一条路：

```js
const loader = ctx.get('loader')                        // 宿主 loader 服务
const module = await loader.import('dsh-mcp-client')    // 裸包名只有 loader 能解析（锚 ctx.baseUrl）
const fiber  = ctx.plugin(module, officialConfig)       // 动态挂载，返回 fiber
fiber.dispose()                                         // 卸载
```

> wingsky 的原话（错误信息里）：「宿主未提供 loader 服务，无法按包名解析官方 MCP 客户端——
> 裸包名只有 loader 能解析（锚 ctx.baseUrl）」。

### 2.3 工具命名契约

```
stable identity  = (serverName, rawName)
model-facing name = `mcp__<serverName>__<rawName>`
SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
```

**这条约束直接决定全局/项目级的冲突策略**（见 §3.4）：serverName 必须唯一，
且限 32 字符、仅 `A-Za-z0-9_-`。

### 2.4 配置目录约定已有先例

`@wingsky-1/dsh-mcp-manager` 的落点与你要的路径**是同一套模式**：

```text
它：  <DSH_HOME>/@wingsky-1/dsh-mcp-manager/mcp.json          { "version": 1, "servers": [] }
      <projectRoot>/.dsh/@wingsky-1/dsh-mcp-manager/mcp.json
你：  <DSH_HOME>/yiklek/mcp.json
      <workspace>/.dsh/yiklek/mcp.json
```

`dshHome()` 的实现（实测）：`process.env.DSH_HOME || join(homedir(), '.dsh')` ✓

本机现状：`~/.dsh/yiklek/` **不存在**（首次运行时创建）；`~/.dsh/@wingsky-1/dsh-mcp-manager/mcp.json` 存在。

### 2.5 三个 UI 面的可用槽位

从 DSH 槽位目录实测（`key` / `kind` / `scope`）：

| 面 | 槽位 | kind/scope | 说明 |
|---|---|---|---|
| **插件页** | `plugins.bundle.config` | `keyed` / root | 按**包名**派发到该 bundle 自己的页面（slots-manager 已验证可用） |
| | `plugins.detail.section` | `list` / root | 详情页正文之后的区块 |
| | `plugins.row.config` | `keyed` / root | 某个 bundle 声明的行的配置 |
| **会话页** | `conversation.session.header.utilities` | `list` / **session** | 会话标题右侧工具区，升序 |
| | `conversation.session.header.actions` | `list` / session | 标题相邻的动作 |
| | `sidebar.right.pane.tab(.title)` | `keyed` / session | 右栏标签页 |
| **侧边栏** | `sidebar.panellist` | `list` / root | 全局面板图标（slots-manager 已验证） |
| | `sidebar.footer.action` | `list` / root | 设置旁的栏底动作 |

**所有槽位都拿到 `useWorkspaces`，但那只是「工作区列表」，不是「当前工作区」**：

```text
conversation.session.header.utilities   useWorkspaces + useSession + sessionId + useSessions + useChat …
plugins.bundle.config   (root)          useWorkspaces（无 sessionId）
sidebar.panellist       (root)          useWorkspaces（无 sessionId）
main                    (keyed, root)   useWorkspaces（ownerProps 为空）
```

`WorkspaceSnapshot` 的字段实测为 `items`（列表）/ `state` / `phase` / `error` +
archive/pin 集合 —— **没有 `current` / `selected` / `active`**。

**「当前工作区」只能从会话推导**（会话带 `workspaceId`），而**只有 session scope 的槽位
拿得到会话**。导航服务（`uiWorkspace` / `workspaceNavigation`）只暴露动作
（`openSession` / `openWorkspace` …），没有「当前」读取口。

→ 结论见 §3.5 与 §6.3。P0 实测记录：`docs/p0-findings.md` Q4。

### 2.6 样式契约

`dsh-client-ui-plugin-manager` 用了 38 个设计令牌，实测存在：

```text
背景    --dsw-alias-bg-layer-1 / 2 / 3, --dsw-alias-bg-base, --dsw-alias-bg-module-platform
边框    --dsw-alias-border-l1 / l2 / l3 / l4
文字    --dsw-alias-label-primary / secondary / tertiary / caption
状态    --dsw-alias-state-success-primary / -secondary, -error-primary, -warn-primary / -label / -tertiary
        --dsw-alias-state-business-primary
交互    --dsw-alias-interactive-bg-hover, -hover-danger, --dsw-alias-brand-primary
        --dsw-focus-ring-color, --dsw-focus-ring-width
        --dsw-alias-button-primary-fill / -hover
圆角    --dsw-radius-xs / sm / md / lg / xl
阴影    --dsw-elevation-prominent, --dsw-elevation-stroke-color
字体    --dsw-font-mono
```

**规则：只使用这些令牌，不写死颜色/尺寸。** 这样暗色主题与 DSH 换肤自动跟随。
（slots-manager 里已按此法实现，CSS 里没有一处硬编码色值。）

### 2.7 本地化

约定：`locale/zh.json` + `locale/en.json`，含 `meta.title` / `meta.description`。

---

## 3. 配置模型

### 3.1 文件格式（自有形状）

```jsonc
{
  "version": 1,
  "servers": [
    {
      "name": "github",                 // 逻辑名，映射为 serverName（见 §3.4）
      "enabled": true,
      "transport": "stdio",             // stdio | streamable-http
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." },
      "cwd": "",
      "url": "",                        // transport=streamable-http 时使用
      "headers": {},
      "toolCallTimeoutMs": 60000,
      "failOnStartupError": false
    }
  ]
}
```

> 与 wingsky 同形（`{version, servers}`），但**有意保持字段名与主流格式一致**，
> 以便导入导出时零映射。

### 3.2 路径与优先级

> ⚠️ **当前只实现全局**。项目级（`<workspace>/.dsh/yiklek/mcp.json`）未实现 ——
> profile 条目没有工作区维度，语义待定（见 [`p1-findings.md`](p1-findings.md) 的 N3）。
> 下面的合并规则是**项目级落地时的目标语义**，暂未生效。

```text
全局   <DSH_HOME>/yiklek/mcp.json
项目   <workspace>/.dsh/yiklek/mcp.json
```

**合并规则（按 `name` 归并，跨 scope 同名时全局优先）：**

| 情况 | 结果 |
|---|---|
| 只在全局 | **生效**，来源 `global` |
| 只在项目 | **生效**，来源 `project` |
| **两处同名** | **只有全局生效；项目级那不生效**，并在配置页给出提示（见 §3.4） |
| 生效项 `enabled:false` | 不挂载（`enabled` 是生效范围内的开关，不参与跨 scope 归并） |

> **为什么是「全局优先」而不是「项目覆盖」**：同名时若让项目覆盖，用户在全局看到的配置
> 与实际行为会不一致，而全局正是他更可能以为是准的地方 —— 这种「读到的不是生效的」
> 最伤。改成全局优先后，**全局永远是准的**，项目级的重复项则以「未生效」明确示人。
>
> 项目级定义**保留在文件里**（不自动删除），方便你在移除全局那条后立即启用它。

### 3.3 校验

写盘前必须过校验，错误分两级：

- **阻断**（拒绝保存，指出字段）：`name` 不匹配 `SERVER_NAME_PATTERN`、`transport` 非法、
  stdio 缺 `command`、http 缺 `url`、`url` 非 http(s)、**同一文件内 `name` 重复**、`args`/`env` 类型错误。
- **警告**（可保存，UI 标黄）：`env` 值含疑似明文密钥、`command` 是相对路径、
  `url` 指向 localhost、超时值异常。

> **跨 scope 同名不是校验错误**，是生效规则：两边都能保存，只是项目级那条不生效并带提示
> （§3.4）。这与「同一文件内重名」不同 —— 后者是配置错误，必须阻断。

### 3.4 serverName 与跨 scope 同名

**命名规则极简：`serverName` 就是条目自己的 `name`，任何时候都不改写。**

```text
条目 name: github   →  serverName: github   →  工具名 mcp__github__<tool>
```

不需要后缀、不需要哈希、不需要截断 —— 因为**跨 scope 同名时项目级不生效**（§3.2），
所以同一个 serverName 在任一时刻只会有一个来源，唯一性天然成立。

**校验约束**（沿用官方 `SERVER_NAME_PATTERN`）：

```text
/^[A-Za-z0-9_-]{1,32}$/
```

**同名的两种情形要分开处理：**

| 情形 | 处理 |
|---|---|
| **同一文件内**两条 `name` 相同 | **阻断保存**（校验错误，指出是第几条）—— 这是配置错误，不该被容忍 |
| **跨 scope**（全局 + 项目）同名 | 允许保存；**全局生效，项目级不生效**；配置页提示 |

**配置页的提示（跨 scope 同名）**，落在项目级那一行上：

```text
┌─────────────────────────────────────────────────────────────┐
│ ⚠ github          stdio                    [未生效]          │
│   未生效：与全局的 server「github」同名，全局的定义优先。       │
│   要启用此项，请先删除或重命名全局的那一个。                    │
│   [查看全局项]  [在全局中删除]                       [删除]   │
└─────────────────────────────────────────────────────────────┘
```

要点：

- 状态点用 **warn 色**（`--dsw-alias-state-warn-primary`），不是错误红 —— 它没坏，只是没生效。
- 文案必须说明**为什么**不生效 + **怎么才能生效**，不能只标一个「冲突」。
- 给出直达动作（查看 / 删除全局那条），不让用户自己去翻另一个 scope。
- 全局段里对应的那行标一个 `项目中有同名项` 的徽标，让两边都可见。

### 3.5 工作区解析

项目级配置需要工作区根目录。**DSH 没有「当前工作区」这个全局状态，它只能从会话推导** ——
P0 已实测定论（`docs/p0-findings.md` Q4）。

```text
服务   ctx.get('workspaces')  →  快照服务（items / state / phase / error + archive/pin）
       provider: @deepseek-ai/dsh-api-workspace-controller
       注意：快照里**没有** current / selected / active
钩子   所有槽位都有 useWorkspaces；只有 session 槽位另有 useSession 与 sessionId
会话   会话携带 workspaceId（SessionSnapshot.workspaceId）← 唯一的工作区真相
导航   uiWorkspace / workspaceNavigation 只有动作（openSession/openWorkspace…），无读取口
```

**按入口分别处理：**

| 入口 | scope | 当前工作区 | 做法 |
|---|---|---|---|
| **会话页** | session | ✅ 可自动解析 | `sessionId` → `useSession((s) => s.workspaceId)` → 在 `workspaces.items` 里查到路径 |
| **插件页 / 侧边栏** | root | ❌ 拿不到 | 用 `useWorkspaces` 列出工作区让用户选；**记住上次选择**；**只有一个工作区时直接用它** |

**为什么 root 面不猜**：全局没有任何「当前工作区」状态可读，猜等于编。列出来让用户选、
并记住选择，是唯一诚实的做法；单工作区时自动选中则让常见情况零操作。

> **`cwd` 不是工作区。** `working-directory/change` 改的是会话的工作目录
> （session projection `workingDirectory`，初值 `header.cwd`），与工作区绑定无关。
> 项目级配置按**工作区**键，所以 **cwd 变化不影响它，无需订阅该事件**
> （P0 实测：`docs/p0-findings.md` Q3）。

## 4. 主流格式兼容

### 4.1 字段映射

| 目标字段 | Claude Desktop / Cursor | VS Code | DSH 原生（ACP 形状） |
|---|---|---|---|
| 容器 | `mcpServers: { <name>: {...} }` | `servers: { <name>: {...} }` | `mcpServers: [ {name, ...} ]` 数组 |
| `name` | 对象键 | 对象键 | `name` 字段 |
| stdio 标识 | 无 `type` 或 `type:"stdio"` | `type:"stdio"` | 无 `type` |
| `command`/`args`/`env` | 同名 | 同名 | 同名 |
| `cwd` | 无 | 无 | 无 |
| http 标识 | `type:"http"` / `type:"sse"` | `type:"http"` | `type:"http"` |
| `url` / `headers` | 同名 | 同名 | 同名 |
| SSE | `type:"sse"` | — | **不支持** |

### 4.2 导入行为

1. 自动嗅探格式（`mcpServers` 对象 / `servers` 对象 / `mcpServers` 数组 / 裸数组）。
2. 逐条归一化到 §3.1 形状。
3. **导入前预览**：列出「将新增 / 将覆盖同名 / 将跳过及原因」三栏，用户确认才落盘。
4. `type:"sse"` → **默认跳过**并在预览里说明「DSH 官方客户端不支持 SSE」，同时提供
   「按 streamable-http 尝试导入」的显式勾选（有些 SSE 端点同时支持 streamable-http）。
5. 变量展开：`${env:VAR}` / `${VAR}` 形式**原样保留**，不做求值 —— 求值时机交给连接层
   （wingsky 的 `expandServerEnv` 就是这个职责），避免把密钥写进文件。

### 4.3 导出行为

- 导出为 **Claude Desktop 形状**（`mcpServers` 对象）作为默认，因为它是事实标准。
- 提供「导出当前 scope / 导出合并结果」两个选项。
- **导出默认脱敏**：`env` 与 `headers` 里的值替换为 `${env:KEY}` 占位；需显式勾选才导出明文，
  且勾选时给出红色警示。

---

## 5. 架构

### 5.1 host 侧（Node）

> ⚠️ **本节描述的动态挂载路径已被实测否定。** `loader.import` + `ctx.plugin` 能让 server
> 连上（握手完整），但工具**不会**出现在 agent 的工具表里 —— 只有 loader 实例化的
> profile 条目才会。见 [`p1-findings.md`](p1-findings.md)。
> **正确形态是：`mcp.json` 作为编辑面，保存时物化进 profile 的 patch 层。**
> 下面的模块划分仍适用，`mounter` 的角色从「运行时挂载」改为「生成/同步条目」。

```
src/host.ts                  插件入口；导出 volatile Config（命名空间 = 条目 id = mcp-panel）
src/server/paths.ts          dshHome() / globalConfigFile() / projectConfigFile(root)
src/server/config-store.ts   读、校验、原子写（临时文件 + rename）、文件权限 600
~~src/server/merge.ts~~      已删除（见文首说明）
src/server/normalize.ts      主流格式 ⇄ 内部形状；serverName 分配（§3.4）
src/server/mounter.ts        loader 取模块 → ctx.plugin 挂载 → 账本 → dispose
src/server/health.ts         连通性探测（握手 / tools/list）、tool 计数、错误归集
src/server/api.ts            HTTP 路由：/api/yiklek/mcp/{list,save,import,export,probe}
```

**mounter 账本**（照 wingsky 的做法，但更严）：
> P0 实测（`docs/p0-findings.md` Q1）：`ctx.tools.all()` 是 **scope 过滤**的，在插件自己的
> ctx 里读到空数组；`get(name)` 才能点名解析。因此**工具列表必须自己记账**
> —— 挂载时记下 `ctx.tools.register` 返回的 disposer 集合（官方客户端在 `syncTools`
> 里也是这么做的）。UI 的工具列表从自己的账本读，不要依赖 `all()`。

```ts
// 键 = 分配的 serverName（含 scope 后缀），映射到 { config, fiber }
// 规则：
//   1. 改配置 → 先 dispose 旧的，再挂新的（绝不同名并存）
//   2. 挂载失败 → 不影响其它 server；把错误记进 health，UI 标红
//   3. 插件卸载（ctx.on('dispose')）→ dispose 全部，避免泄漏子进程
```

> ⚠️ **必须做第 3 条**：stdio server 是**子进程**，不 dispose 会留下孤儿进程。

### 5.2 client 侧（浏览器）

```
src/client.ts                入口；注册三个槽位
src/client/panel.tsx         共享配置组件（三处入口复用同一个）
src/client/rows.tsx          单 server 行：状态点、名称、工具名映射、启停、编辑、删除
src/client/editor.tsx        stdio/http 表单 + 原始 JSON 双模编辑
src/client/importer.tsx      导入预览（新增/覆盖/跳过三栏）
src/client/diagnostics.tsx   健康详情：握手结果、工具列表、原始错误（脱敏）
src/client/style.ts          令牌化的 CSS 字符串
```

### 5.3 数据流

> ⚠️ **下面这段是原始设计，已失效。** 现行数据流见 `architecture.md` §2：
> 编辑面（`mcp.json`）↔ 有效面（profile 的 `cordis.patch.yml` 受管理区块），
> 没有「merger」也没有「mounter」。

```
读：  JSON 文件 ──► 校验 ──► 归并(global ⊕ project，全局优先) ──► EffectiveServer[] ──► UI 展示
                                            └─► 同名项标 shadowedBy（不生效，供 UI 提示）
写：  UI 提交 ──► 校验 ──► 原子写盘 ──► 重新归并 ──► mounter 差量应用 ──► 广播状态
连：  active 的 EffectiveServer ──► 官方 Config ──► loader.import ──► ctx.plugin ──► mcp__<name>__* 进 ctx.tools
```

---

## 6. UI 设计

### 6.1 三个入口

| 面 | 槽位 | 形态 | 定位 |
|---|---|---|---|
| **插件页** | `plugins.bundle.config`（keyed = 包名） | 整页 | 主配置台：全局 + 项目级全量管理 |
| **会话页** | `conversation.session.header.utilities` | 按钮 → 浮层面板 | **项目级**为主：当前工作区的 mcp.json |
| **侧边栏** | `sidebar.panellist` | 图标按钮 → 主面板 `main`（keyed） | 快速查看/启停全局 server |

三者**共用同一个 `McpConfigPanel` 组件**，只靠 props 区分：

```ts
interface PanelProps {
  scope: 'global' | 'project' | 'both'   // 插件页 = both；会话页 = project；侧边栏 = global
  workspaceRoot?: string                  // project 时必填
  density: 'page' | 'panel'               // 影响留白与是否显示说明文字
}
```

**为什么共用**：三处要做的事完全一致（看状态、启停、增删改、导入导出），
各自实现会立刻分叉。差异只有 scope 与密度。

### 6.2 页面结构

```
┌─ MCP 服务器 ────────────────────────────── [导入] [导出] [＋ 添加] ┐
│                                                                   │
│  ● 全局（~/.dsh/yiklek/mcp.json）                        2 个启用  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ● github          stdio   12 个工具   mcp__github__*       │   │
│  │   [启用 ✓]                                     [编辑][删除] │   │
│  ├───────────────────────────────────────────────────────────┤   │
│  │ ○ filesystem      stdio   已停用                           │   │
│  │   [启用 ✗]                                     [编辑][删除] │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ● 项目（.dsh/yiklek/mcp.json）                          0 个启用  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ⚠ github          stdio                        [未生效]    │   │
│  │   未生效：与全局的 server「github」同名，全局的定义优先。     │   │
│  │   要启用此项，请先删除或重命名全局的那一个。                  │   │
│  │   [查看全局项] [在全局中删除]                        [删除] │   │
│  └───────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

**要点：**

- **状态点**：`●` 绿=已连接、黄=连接中、红=失败、灰=停用。颜色取
  `--dsw-alias-state-success-primary` / `-warn-primary` / `-error-primary` / `-label-tertiary`。
- **工具名显式展示**（`mcp__github__*`）—— 名字恒等于条目 `name`，所见即所得。
- **失败行可展开**显示原始错误（脱敏后），不把错误藏在 tooltip 里。
- **空态给出口**（「从全局复制」），不是一句「暂无数据」。
- **未生效可见**：与全局同名的项目级行标 `未生效`（warn 色）并说明原因与出路（§3.4）。
- 全局段里被项目引用的行标 `项目中有同名项` 徽标，两边都可见。

### 6.3 全局面如何编辑项目级

插件页与侧边栏是 root scope，**读不到当前会话，因此读不到「当前工作区」**（§3.5）。
设计：

- 顶部是**工作区选择器**（数据来自 `useWorkspaces` 的 `items`）。
- **选择会被记住**（持久化到插件配置），下次自动回填 —— 让重复操作零成本。
- **只有一个工作区时自动选中**，选择器折叠为一行只读展示。
- 未选择且多于一个工作区时，项目段显示引导态：「选择一个工作区以编辑其 MCP 配置」，
  **不猜**。
- 会话页入口不受此限：它用 `sessionId` 直接得到工作区，永远自动正确。

### 6.4 编辑器

双模（与 DSH 的插件配置体验一致）：

- **表单模式**：transport 切换（radio）→ 相应字段组。stdio 显示 `command/args/env/cwd`；
  http 显示 `url/headers`。
- **JSON 模式**：单个 server 的原始对象，带 schema 校验与错误定位。
- `env` / `headers` 用**键值对列表**（不是一个大文本框），值默认 `type="password"`，
  有显隐开关。

### 6.5 样式一致性

- 全部颜色/圆角/间距走 §2.6 的令牌，**零硬编码色值**。
- 复用 DSH 的交互惯例：hover 用 `--dsw-alias-interactive-bg-hover`、
  focus 用 `--dsw-focus-ring-color/width`、危险操作用 `-hover-danger`。
- 滚动条用 `--dsw-alias-scrollbar-bg-l2` / `-hover-l2`。
- 类名带插件前缀（如 `.mcp-`），根元素带 `data-slot="<槽位名>"` 便于测试定位
  （slots-manager 已验证这个做法）。

---

## 7. 持久化与生命周期

### 7.1 启动

```
1. 读全局 mcp.json（不存在则视为空，不报错、不创建）
2. 归并（此刻项目级未知 → 只挂全局）
3. 逐条挂载，单条失败不影响其它
4. 向 client 广播状态快照
```

进入某个工作区（会话建立）：追加该工作区的项目级 server 并挂载。

### 7.2 编辑后的热更新

**差量应用**，不是全量重挂：

| 变化 | 动作 |
|---|---|
| 新增 | 挂载新的 |
| 删除 | dispose 旧的 |
| 改配置 | dispose 旧的 → 挂载新的（**中间若失败，回滚到旧配置并报错**） |
| 改 enabled | 按开关挂载/dispose |

### 7.3 重启后

配置在文件里 → 启动时第 1 步自动恢复 ✓ **这是选择「文件为真相源」而非
「运行时动态挂载」的核心价值**。

### 7.4 ~~已知代价：MCP 生效依赖本插件被启用~~（**已作废**）

> 本节整段建立在「动态挂载可用」这一**错误前提**上。实测表明动态挂载的工具对模型不可见，
> 因此生效路径必须是 profile 条目 —— 而那恰恰意味着 **MCP 不依赖本插件运行**（条目由
> DSH loader 加载）。原「接受的代价」不再存在。见 [`p1-findings.md`](p1-findings.md)。

#### （以下为作废的原文，保留作记录）

**本方案下，MCP 生效依赖本插件被启用。** 若禁用/卸载本插件，所有 MCP 立刻消失 ——
因为它们不是 profile 名册里的条目。

官方原生做法是**每个 server 一条 `cordis.patch.yml` 条目**，那样即使管理器不在也能生效。

**已决定接受这个代价（§8 D3）**，理由：

1. 配置**始终在文件里**（`<DSH_HOME>/yiklek/mcp.json`、`<workspace>/.dsh/yiklek/mcp.json`），
   没丢。装回插件即恢复，不需要重新录入。
2. 双写（文件 + profile 名册）会引入**同步与漂移**问题：改了文件忘了同步名册，
   或反过来，排查成本远高于收益。
3. 「禁用管理插件 ⇒ MCP 停用」在语义上是**自洽的**，不是意外行为。

> 若日后确实需要「即使本插件不在也生效」，正确做法是**把当前生效配置导出为
> `cordis.patch.yml` 片段**交给用户手动落盘（零同步问题），而不是自动双写。
> 本方案不实现，但留了这个出口。

---

## 8. 已定默认（可推翻）

> 这些是我替你定的默认值。**每条都写明了推翻成本** —— 成本低的照做即可，
> 成本高的（R3）请先过一眼。

| # | 决定 | 理由 | 推翻成本 |
|---|---|---|---|
| **D1** | 与已装两个第三方插件**互斥，本插件可用后移除** | §1.3 | — |
| **D2** | **项目与全局同名 → 全局优先，项目不生效**并在面板提示；**项目之间同名 → 加 `--<hash8>` 后缀** | 全局那条是"到处都该跑"的定义，重复定义属于冲突，静默换名运行很危险；两个项目之间无权威关系，加后缀共存 | 低 |
| ~~**D3**~~ | ~~不做「固化为 profile 条目」~~ | ❌ **已撤销**：动态挂载的工具对模型不可见，物化条目是唯一可行路径。见 [`p1-findings.md`](p1-findings.md) | — |
| **D4** | 密钥：只支持 `${env:VAR}` 占位 + 配置文件 `600` 权限，**不引入钥匙串** | 零依赖、跨平台；钥匙串在 Linux 无统一方案 | 低 |
| **D5** | **不做** `/mcp` 斜杠命令 | 你的原始需求只提了三个 UI 位置；命令是额外面 | 低 |

---

## 9. 实施计划（文件级）

### 9.1 仓库骨架

```text
dsh-mcp-panel/
├── package.json              name / main / dsh.client.inject / dsh.bundle.patch / peerDeps
├── cordis.patch.yml          bundle 名册条目
├── tsconfig.json             strict
├── scripts/build.mjs         esbuild：host(node) + client(browser)，external @deepseek-ai/*, react
├── locale/{zh,en}.json       meta.title / meta.description + 全部 UI 文案
├── src/
│   ├── slot.ts               槽位键常量（三处入口）
│   ├── host.ts               插件入口；导出 volatile Config（命名空间 mcp-panel）
│   ├── server/
│   │   ├── paths.ts          dshHome / globalConfigFile / projectConfigFile(root)
│   │   ├── types.ts          McpServerEntry / EffectiveServer / Transport / Scope
│   │   ├── normalize.ts      主流格式 ⇄ 内部形状（serverName 恒等于 name，不分配）
│   │   ├── validate.ts       两级校验（阻断 / 警告）
│   │   ├── store.ts          原子写（tmp + rename）+ 0600 权限 + 读容错
│   │   ├── merge.ts          global ⊕ project（全局优先；标出不生效项）
│   │   ├── mounter.ts        loader.import → ctx.plugin → 账本 → dispose
│   │   ├── health.ts         握手探测、工具列表、错误脱敏
│   │   └── api.ts            /api/yiklek/mcp/{list,save,import,export,probe}
│   └── client/
│       ├── index.ts          注册三个槽位
│       ├── panel.tsx         共享配置面板（props 区分 scope/density）
│       ├── rows.tsx          单行：状态点 / 名称 / 工具名映射 / 启停 / 编辑 / 删除
│       ├── editor.tsx        transport 切换 + 表单 ⇄ JSON 双模
│       ├── importer.tsx      导入预览（新增 / 覆盖 / 跳过三栏）
│       ├── diagnostics.tsx   健康详情
│       ├── hooks.ts          useWorkspaces / useSession 的封装与降级
│       └── style.ts          令牌化 CSS（零硬编码色值）
└── tests/
    ├── unit/{paths,normalize,validate,merge,store}.test.mjs
    ├── e2e/mounter.test.mjs
    ├── unit/compat.test.mjs  上游契约自检
    └── playwright/{harness,panel}.mjs
```

### 9.2 分阶段任务与验收

#### P0 探针 ✅ **已完成**（结论见 `docs/p0-findings.md`）

| 任务 | 验收 |
|---|---|
| 挂一个 stdio server：`loader.import('dsh-mcp-client')` → `ctx.plugin(module, Config)` | `ctx.tools` 里出现 `mcp__<name>__<tool>`，模型能调 |
| 确认 `dispose()` 是否真的杀掉 stdio 子进程 | 卸载后 `ps` 无残留 |
| 确认 `working-directory/change` 的语义（改 cwd 还是 workspace） | 一份结论，回填 §3.5 |
| 确认根槽位里 `useWorkspaces` 取「当前工作区」的实际字段 | 一份结论，定死 §6.3 的实现 |

> **P0 不写产品代码**，只写一个一次性探针脚本 + 记录结论。这一步的产出是**事实**，不是代码。

#### P1 核心骨架（全局可用）

| 任务 | 验收 |
|---|---|
| `paths.ts` + `store.ts` | 读写 `<DSH_HOME>/yiklek/mcp.json`，文件权限 600，目录不存在时创建 |
| `types.ts` + `validate.ts` + `normalize.ts` | 单测覆盖校验矩阵与 serverName 分配（同名/超长/非法字符） |
| `mounter.ts` + 账本 | 单测：新增/删除/改配置的差量行为；失败不影响其它 server |
| `api.ts`（list/save/probe） | HTTP 往返；非法输入返回结构化错误 |
| `host.ts` + `cordis.patch.yml` + 构建 | `dsh --profile web --dump-config` 出现本插件，命名空间注册成功 |
| 插件页 UI（全局段） | 能增删启停，状态点正确，工具名映射显示 |

**P1 完成标志：在插件页加一个全局 stdio server，它能连上且工具出现在模型工具表里。**

#### P2 项目级

| 任务 | 验收 |
|---|---|
| `merge.ts`（global ⊕ project，全局优先） | 单测覆盖：仅全局 / 仅项目 / **同名（项目不生效且带 shadowedBy）** / 生效项 `enabled:false` |
| 工作区解析（`hooks.ts`） | 会话页拿到当前会话工作区；插件页/侧边栏拿到当前选中工作区 |
| 项目段 UI + 切换器 | 项目级 mcp.json 可增删改；顶部显示当前工作区 |
| 跨 scope 同名处理 | 全局 `github` + 项目 `github`：只有全局一份被挂载，工具名 `mcp__github__*`；项目那行在 UI 标 `未生效` 并给出去路；删掉全局那条后项目级自动生效 |

#### P3 格式兼容

| 任务 | 验收 |
|---|---|
| `normalize.ts` 导入方向 | 单测：四种格式（Claude Desktop / VS Code / Cursor / DSH 原生）都能解析 |
| `importer.tsx` 预览三栏 | 新增/覆盖/跳过分别列出，跳过要给出原因 |
| 导出 + 脱敏 | 默认 `mcpServers` 形状；`env`/`headers` 值变 `${env:KEY}` |
| `sse` 处理 | 默认跳过并说明；勾选后按 streamable-http 尝试 |

#### P4 三入口

| 任务 | 验收 |
|---|---|
| 三个槽位注册 | 插件页整页、会话页浮层、侧边栏面板，三处都能打开同一份数据 |
| `panel.tsx` 的 scope 适配 | `both` / `project` / `global` 三种模式行为正确 |
| 侧边栏面板接入 `main`（keyed） | 图标点击后主面板显示 |

#### P5 诊断

| 任务 | 验收 |
|---|---|
| `health.ts` 握手探测 | 失败行可展开看到脱敏后的原始错误 |
| 工具列表 | 每个 server 显示已注册工具名与数量 |
| 错误脱敏 | 路径里的 `$HOME` 替换为 `~`，凭据形状的值不出现 |

#### P6 替代

| 任务 | 验收 |
|---|---|
| 按 §1.3 顺序迁移 | profile 里只剩本插件一个 MCP 管理插件，原 server 全部可用 |

### 9.3 依赖关系

```text
P0 ──► P1 ──► P2 ──► P3
              └────► P4 ──► P5 ──► P6
```

P3 与 P4 可并行（互不依赖）。P0 是硬前置：它确认的两个事实（子进程回收、工作区字段）
分别决定 `mounter.ts` 与 `hooks.ts` 的实现。

---

## 10. 测试计划

沿用 slots-manager 已验证的分层（那套跑通过 52 个单测 + Playwright 真机）。

| 层 | 覆盖 | 命令 |
|---|---|---|
| **单测** | 路径拼装、校验矩阵、serverName 分配、四种格式导入、导出脱敏、归并四组合、原子写 | `pnpm test:unit` |
| **e2e** | 账本差量（新增/删除/改配置/失败隔离）、dispose 是否清理子进程 | `pnpm test:e2e` |
| **契约自检** | 断言 `dsh-mcp-client` 仍是 `union(stdio \| streamable-http)`、`SERVER_NAME_PATTERN` 未变、`loader` 服务仍可用、三个槽位仍存在且 kind/scope 未变 | `pnpm test:unit`（找不到 DSH 时 skip；CI 里由 `DSH_VERSION` 装一份指向它） |
| **Playwright** | 三个入口都能打开面板、增删启停、导入预览、失败态展示 | `pnpm test:playwright` |

**Playwright 约定**（沿用你的既有要求）：

```js
channel: process.env.CI ? undefined : 'msedge'   // 本地 Edge，CI 用自带 Chromium
```

本地**不安装 Chromium**。

**契约自检为什么必须**：本插件依赖四个不归自己管的上游事实（官方 Config 形状、
命名模式、`loader` 服务、三个槽位的 kind/scope）。上游一改，插件会**静默失效**——
面板在但连不上。自检把沉默变成红灯。

---

## 11. 命名

```text
包名     dsh-mcp-panel
仓库     Yiklek/dsh-mcp-panel
目录     /Users/yiguangzheng/projects/dsh/dsh-mcp-panel
命名空间 yiklek          ← 对应 <DSH_HOME>/yiklek/mcp.json
```

消费方式与你的其他插件一致：`github:Yiklek/dsh-mcp-panel#pkg`（CI 产出 `pkg` 分支）。

派生标识（沿用 slots-manager 已验证的规则：**条目 id 即 settings 命名空间**）：

| 用途 | 值 |
|---|---|
| `package.json` name | `dsh-mcp-panel` |
| `cordis.patch.yml` 条目 id | `mcp-panel` |
| settings 命名空间 | `mcp-panel`（= 条目 id） |
| locale 命名空间 | `mcpPanel` |
| 配置目录 | `yiklek` ← **故意与包名不同**：这是用户级命名空间，未来同 owner 的其他插件可共用 |

> 唯一的技术性提示（**不需要改名，只是别踩**）：npm 上的 `dsh-mcp-panel` 属于 PerryLink。
> 因此**不要 `pnpm publish`** —— 走 GitHub 消费不受影响。

## 附：本方案的事实来源

| 结论 | 来源 |
|---|---|
| 官方客户端 Config 形状、transport 白名单 | `@deepseek-ai/dsh-mcp-client@0.2.1-alpha.2` 的 `lib/index.js` |
| 工具命名契约、`SERVER_NAME_PATTERN` | 同上（含其「Naming invariants」注释） |
| `loader.import` + `ctx.plugin` 挂载 | `@wingsky-1/dsh-mcp-manager@0.2.9` 与 `dsh-mcp-panel@0.6.24` 的 host 侧实现 |
| 主流格式字段与拒绝项 | `@deepseek-ai/dsh-acp` 的 `resolveMcpConfigs`（`{name,command,args,env}` / `{name,type:'http',url,headers}`） |
| 配置目录模式 | `@wingsky-1/dsh-mcp-manager` 的 `shared/paths.d.ts` + 本机 `~/.dsh/…/mcp.json` |
| 槽位 kind/scope/**standardProps** | DSH 打包的槽位目录（`dsh-cordis-client-runner` 内嵌） |
| `workspaces` 服务与 `useWorkspaces` | `dsh-api-workspace-controller`（provider）与槽位目录的 `standardProps` |
| 会话的 `cwd` 与 `working-directory/change` | `dsh-api-session-controller` 的事件类型表 |
| 设计令牌 | `dsh-client-ui-plugin-manager` 实际用到的 `--dsw-*` |
| DSH 版本 | 本机 `dsh --version` = `0.2.1-alpha.2` |


---

## 附录：实现期的两条教训（都进了回归测试）

### 1. 裸名反解不出归属 —— 必须把工作区编码进条目 id

项目级条目第一次物化时可能拿到**裸名**（`api`）。若"收编"时靠名字猜归属，它会被并进
**全局** `mcp.json`，于是全局抢占了 `api`、项目被迫改名、deny 算出的名字与实际不一致 ——
**项目隔离形同虚设，且不报错**。

修法：条目 id 记录归属，名字只用于工具前缀。

```yaml
- id: mcp-panel-shared            serverName: shared            # 全局
- id: mcp-panel-<wsid>--api       serverName: api               # 项目（裸名也可反解）
- id: mcp-panel-<wsid>--api       serverName: api--<wsid>       # 同名冲突时加后缀
```

### 2. 读接口必须返回**一次一致的快照**

收编发生在读取过程中。若 UI 先 `GET /list`（触发收编）再 `GET /sync`，第二次已经无事发生，
于是 `adopted` 永远是空 —— **用户永远看不到那条提示**。

修法：`/list` 的响应里直接带上 `sync`，一次请求一个快照。`/sync` 保留但不再被面板使用。

### 3. 日志通道

`ctx.logger.warn` 在 headless profile 里**被完全过滤**。生命周期诊断走
`process.stderr.write`（DSH 自己的启动警告也是这条通道），否则验收时一行都看不到。

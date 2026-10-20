# 项目级 MCP 方案

> 回答 [`p1-findings.md`](p1-findings.md) 里悬着的 **N3**：profile 条目没有工作区维度，
> 项目级怎么做。
>
> **结论：能做，但用的不是「为工作区铸 scope」，而是「全局挂载 + 按 agent 过滤可见性」。**
>
> **状态：核心机制已真机验证 ✓**（P2-a 探针，见 §9 调研记录）。
> 剩下的是实现工作量，不是可行性问题。

---

## 1. 先说清两条走不通的路

### ✗ 路一：为每个工作区铸一个 scope，在里面挂 MCP 客户端

看起来最自然 —— `@deepseek-ai/dsh-scope` 确实提供：

```js
createScope(ctx, key, { parent })   // "Mint a scope under ctx. The scoped context … owns every registration made through it."
```

但 **agent 的 scope 是独立铸的，不挂在任何工作区 scope 下**：

```js
// dsh-agent-loop
this.scope = createScope(loopCtx, this)   // ← 没有传 parent
this.ctx = this.scope.ctx
```

所以工作区 scope 里的注册，agent 继承不到。这条路要改 DSH 本身，不可行。

### ✗ 路二：每个会话各自挂一份 MCP 客户端

```js
agent/created → agent.ctx.plugin('@deepseek-ai/dsh-mcp-client', config)
```

语义正确（注册进该 agent 的 scope），代价是 **N 个会话 × M 个 server = N×M 个进程**。
一个项目 3 个 server、开 5 个会话就是 15 个常驻子进程。不可接受。

---

## 2. 推荐方案：全局挂载 + 按 agent 屏蔽

### 2.1 关键机制

`dsh-tools` 有一个**按 agent 限制可见工具**的 API：

```js
restrict(filter: { allow?: string[]; deny?: string[] }): () => void
  // "Restrict global tools for the calling agent scope.
  //  Restrictions intersect; scoped registrations remain visible."
```

实现里有一句要紧的守卫：

```js
const scope = scopeOf(this.ctx)
if (scope === void 0) throw new Error(
  "tools.restrict() requires a scoped context (agent.ctx): a context-global restriction would mask every agent")
```

→ **必须从 `agent.ctx` 调用**；从插件自己的 ctx 调用会直接报错（这是好事，防止误伤所有 agent）。

⚠️ **只用 `deny`，不要用 `allow`**：`allow` 是「只保留」，会把 `bash`/`read` 等内置工具一起遮掉。
`deny` 是「移除指定的」，可以精确只点名 MCP 工具。

**已真机验证**（§9）：`deny: ['mcp__beta__probe_echo']` →
工具表从 `["mcp__alpha__…","mcp__beta__…"]`(30) 变为 `["mcp__alpha__…"]`(29)，
`alpha`、`bash`、`read` 全部仍在。

### 2.2 结构

```text
profile 条目（全局，一次性）
  ├─ mcp-panel-github        → 全局 server，所有项目可见
  ├─ mcp-panel-files         → 全局 server，所有项目可见
  ├─ mcp-panel-api--a1b2c3d4 → 项目 A 的 server（名字带工作区标识）
  └─ mcp-panel-api--e5f6a7b8 → 项目 B 的 server（同名但不同配置）

所有条目都连一次（每台 server 一个进程，与项目数无关）

agent/created:
  ① root ← agent.session.header.cwd            （会话创建时的工作目录）
  ② 读 <root>/.dsh/yiklek/mcp.json → 该项目允许的 serverName 集合
  ③ 可见 = 全局 servers ∪ 本项目 servers
  ④ deny = 所有 MCP 工具中「属于某个项目、但不属于这个项目」的那些
  ⑤ agent.ctx.tools.restrict({ deny })
```

**代价明确**：所有**已启用**项目 的 server 进程都在跑（即使当前没在用）。
换来的是「进程数与项目数线性相关，与会话数无关」。

### 2.2b 工作区开关（关闭即不启动进程）

常驻的代价由**每个工作区一个开关**兜住：

- 开关在 `<DSH_HOME>/yiklek/state.json` 的 `workspaces[].enabled`
- **关闭的工作区不产生任何 profile 条目** → 它的 MCP 进程根本不会启动
- 该工作区的会话只看到全局 server
- 真机验证：关闭 proj-b 后进程数从 3 降到 2，B 的会话 `visible=["mcp__shared__…"]`

这条也是「不想要某个项目的 server 在后台跑」时唯一的正确做法 ——
因为进程由 loader 启动，`deny` 只能隐藏工具、停不掉服务。

### 2.3 为什么用 `cwd` 而不是 workspaceId

| 来源 | 可得性 |
|---|---|
| `SessionHeader.cwd?: string` | ✅ 「Absolute working directory the session was created in」 |
| `SessionHeader.workspaceId` | ❌ 宿主侧 **没有这个字段**（客户端有，宿主没有） |
| 宿主侧 `workspace` 服务 | ❌ 只有 `workspaceChanges`，没有能列 root 的服务 |

所以项目根只能取会话的工作目录。**已实测**：会话头字段为
`["version","id","createdAt","cwd","isSeeded"]` —— 确实没有 `workspaceId`。

**两个必须处理的细节：**

1. **`cwd` 是 realpath** —— 实测得到 `/private/tmp/...` 而不是 `/tmp/...`。
   工作区标识必须同样走 realpath 归一化，否则同一目录会算出两个哈希。
   （官方工作区记录也是这么做的：*"`path` is the `fs.realpath` canon stamped at create"*）
2. **用 `header.cwd`，不要用实时 cwd** —— 它是**创建时**盖进会话头的，所以会话期间稳定；
   `working-directory/change` 改的是另一个投影，不影响它。这正好就是「工作区级」想要的语义。

> ⚠️ `cwd` ≠ workspace（P0 Q4 已确认：`working-directory/change` 改的是 cwd，与工作区绑定无关）。
> 实践上会话的 cwd 就是它所属工作区的根，所以够用；但**若用户中途 `cd` 到别处**，
> 按 cwd 解析会跟着变。两种语义二选一，见 §5 的决策点 B1。

### 2.4 同名冲突：两种情形，两种处理

这是最容易搞混的一处，所以分开写死：

| 情形 | 处理 | 依据 |
|---|---|---|
| **项目 vs 全局** 同名 | **全局优先；项目的那条不生效**（保留在文件里），面板在该行标「未生效」并说明原因 | D2，你定的 |
| **项目 vs 项目** 同名 | 两个都生效，后注册的加 `--<hash8>` 后缀 | B3，你定的 |

**为什么不同：** 全局那条是"你明确认为到处都该跑"的定义，项目再定义一次属于**冲突**，
静默换名运行一个用户没写过的 server 是危险的 —— 所以不生效、并说清楚。
而两个项目之间没有谁更权威，两条都该跑，只是名字不能相同 —— 所以加后缀。

```text
全局 api        → serverName: api              工具 mcp__api__*
项目 A api      → 不生效（面板提示"与全局同名"）
项目 B / C api  → api--<hashB> / api--<hashC>   工具 mcp__api--<hash>__*
```

后缀 = 工作区路径 sha256 前 8 位（确定性、稳定）。`SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`
允许 `--` ✓；超长时截断保留哈希。UI 里**显式展示**最终工具名。

---

## 3. 配置面（人怎么编辑项目级）

`mcp.json` 的位置不变：`<workspace>/.dsh/yiklek/mcp.json` ✓

面板加回「项目」段，位置沿用设计 §6.3：

- `plugins.bundle.config`（**root scope**）拿不到当前会话 → 取不到「当前工作区」
  （P0 Q4 已确认：`WorkspaceSnapshot` 只有 `items`，没有 current/selected）
- 对策：**选工作区 + 记住上次选择 + 单工作区自动选中**；不在有多个工作区时瞎猜
- 会话页入口（session scope）可以用 `useSession` 精确拿到工作区，自动定位 ✓

## 4. 双向物化

项目级同样要物化进 `<profile>/cordis.patch.yml`，但**带上工作区标识**：

```yaml
# >>> dsh-mcp-panel: managed block — generated from yiklek/mcp.json. …
# 全局
- id: mcp-panel-github
  config: { serverName: github, … }
# 项目 A = /Users/me/proj-a
- id: mcp-panel-api--a1b2c3d4
  config: { serverName: api--a1b2c3d4, … }
# <<< dsh-mcp-panel managed block
```

回读时按 `id` 反解出所属工作区（后缀哈希对应哪条工作区记录，存在
`<DSH_HOME>/yiklek/state.json`），收编语义与全局一致。

---

## 5. 决策点（需要你定）

| # | 问题 | 选项 |
|---|---|---|
| ~~**B1**~~ | ~~项目根取实时 cwd 还是创建时快照~~ | ✅ **无需选择**：宿主只提供 `header.cwd`（创建时快照），且它就是稳定语义 |
| **B2** | 项目 server 的进程**常驻**（本方案）可以接受吗？还是要「按需启动」？（按需要自己做连接池，复杂度高） | 建议先常驻 |
| **B3** | 同名时是否按 §2.4 加 `--<hash8>` 后缀？ | 建议是 |
| **B4** | 项目级需要几条上限？（防止某个仓库的配置把全机拖慢） | 建议单项目 ≤ 8 个 server |

---

## 6. 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| **进程数** | 每个项目每条 server 一个常驻进程 | B4 上限 + UI 显示进程数 |
| **`restrict` 的上游契约** | 它依赖「`deny` 只作用于全局工具」的语义 | 加入契约自检（与现有 compat 测试同层） |
| **cwd 语义漂移** | 用户中途 `cd` | B1 决策；UI 提示当前按哪个路径解析 |
| **工具名变长** | `mcp__api--a1b2c3d4__tool` | 只在冲突时加后缀；UI 展示 |
| **项目配置泄露** | 项目级 `mcp.json` 可能含密钥 | 与全局一致：`600` 权限；导出默认脱敏 |

---

## 7. 验收标准

```text
① 项目 A 的 server 只在项目 A 的会话里可见
   会话 A: agent 工具表含 mcp__api--<hashA>__*
   会话 B: agent 工具表不含它，但含 mcp__api--<hashB>__*

② 全局 server 在两个项目的会话里都可见

③ 内置工具（bash/read/…）在所有会话里都不受影响（deny 只点 MCP 工具名）

④ 面板改项目级配置 → 物化 → 无需重启生效（与全局同路径，hmr）

⑤ 会话结束后 MCP 进程仍然在（常驻语义），数量不随会话数增长
```

## 8. 分期

| 阶段 | 内容 |
|---|---|
| ~~**P2-a**~~ | ✅ **已完成** —— 见 §9 |
| **P2-b** | 项目级解析与物化：`<workspace>/.dsh/yiklek/mcp.json` + 后缀命名 + state.json |
| **P2-c** | `agent/created` 上的 deny 计算与注册 |
| **P2-d** | 面板「项目」段（选工作区 / 记住 / 单工作区自动） |
| **P2-e** | 双向回读与漂移提示 |

P2-a 已通过，P2-b 可以开工。

---

## 附：机制出处

| 结论 | 出处 |
|---|---|
| `createScope(ctx, key, {parent})` 存在 | `@deepseek-ai/dsh-scope` 的 `index.d.ts` |
| agent scope 不挂 parent | `@deepseek-ai/dsh-agent-loop`：`createScope(loopCtx, this)` |
| `tools.restrict({allow,deny})` 存在且需 agent.ctx | `@deepseek-ai/dsh-tools` 的 `index.d.ts` 与实现里的守卫 |
| `deny` 只移除指定工具 | 同上：`allow`=keep only / `deny`=remove |
| `SessionHeader.cwd` 存在、`workspaceId` 不在宿主 | `@deepseek-ai/dsh-session` 的 `types.d.ts` |
| `dsh-mcp-resources` 用 `scopeOf(this.ctx)` 做按作用域注册 | 该包 `lib/index.js` 的 `register()` |


---

## 9. 调研记录（P2-a，真机）

环境：临时 `DSH_HOME`、headless profile、两个 `dsh-mcp-client` 条目
（`serverName` 分别为 `alpha` / `beta`）、探针插件监听 `agent/created`。

### 9.1 输出

```text
[restrict-probe] cwd="/private/tmp/p2a-home/profiles/headless"
[restrict-probe] header keys=["version","id","createdAt","cwd","isSeeded"]
[restrict-probe] has agent.workspaceId=n/a
[restrict-probe] BEFORE mcp=["mcp__alpha__probe_echo","mcp__beta__probe_echo"] total=30
[restrict-probe] restrict({deny:[beta]}) OK
[restrict-probe] AFTER  mcp=["mcp__alpha__probe_echo"] total=29
[restrict-probe] alpha still visible = true
[restrict-probe] builtin bash visible = true
[restrict-probe] builtin read visible = true
[restrict-probe] dispose is function = true
```

### 9.2 结论

| # | 问题 | 结论 |
|---|---|---|
| 1 | `deny` 是否只移除点名工具？ | ✅ 是。总数 30→29，只少了 `mcp__beta__probe_echo` |
| 2 | 未被 deny 的 MCP 工具是否仍在？ | ✅ 是，`alpha` 仍在 |
| 3 | 内置工具是否受影响？ | ✅ 否，`bash` / `read` 都在 |
| 4 | 是否返回 disposer？ | ✅ 是 |
| 5 | 是否泄漏到下一次运行？ | ✅ 否，第二次运行 BEFORE 又是两个都在 |
| 6 | 被 deny 的 server 进程是否停了？ | ❌ **仍在**（2 个进程都起来了）—— `deny` 只隐藏工具，不停服务 |
| 7 | 会话能否拿到工作区 id？ | ❌ 不能，只有 `cwd`（realpath） |
| 8 | `cwd` 是原始路径还是 realpath？ | realpath（`/private/tmp/...`） |

第 6 条就是本方案 §5 里的成本模型，已被证实：**进程数与项目数相关、与会话数无关**。

### 9.3 仍未验证（P2-b 开工时顺手验）

- agent 被销毁后 `restrict` 是否随之释放。探针返回了 disposer，且限制记在 agent 的 scope 层，
  按理随 scope 释放；但这属于「不符合预期就麻烦」的一条，实现时要补一个会话结束的观察。
- 两个 agent 并发时互不影响（同理，scope 层隔离应当成立）。

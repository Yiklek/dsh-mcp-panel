# P1 验收发现：动态挂载的 MCP 工具**进不了模型工具表**（已解决）

> **状态：已解决。** 采纳了「物化 profile 条目」的方案（`mcp.json` 为编辑面，
> `<profile>/cordis.patch.yml` 为生效面），并已在真机端到端验证：
> 面板保存 → 无需重启 → agent 工具表出现 `mcp__probe__probe_echo`。
> 实现与验收见文末「解决方案」一节。

> 这是本次实现最重要的发现，它**推翻了设计中的 D3**（「不做固化为 profile 条目」）。
> 证据来自真机 A/B 对照，不是推断。

---

## 结论

**只有由 loader 实例化的 profile 条目（`cordis.patch.yml` 里的 `dsh-mcp-client`），
其 MCP 工具才会出现在 agent 的工具表里。** 通过 `ctx.plugin(module, config)` 动态挂载
—— 无论挂在插件自己的 ctx 还是 `ctx.root` —— 服务器都能连上、握手完整，但**工具对模型不可见**。

## A/B 对照（同一个 server、同一个官方客户端、同一份配置）

```text
变量只有一个：挂载方式。

官方方式（profile 条目 insert @deepseek-ai/dsh-mcp-client）
  → agent 工具表: mcp=["mcp__probe__probe_echo"]     ✅

本插件方式（loader.import + ctx.plugin 动态挂载）
  → agent 工具表: mcp=[]                              ✗
  → 但 echo server 收到了完整握手：
      recv method=initialize id=0
      recv method=notifications/initialized
      recv method=tools/list id=1
```

两个都跑在**同一个 headless profile**、同一份 `<DSH_HOME>/yiklek/mcp.json`、
同一个探针 server、同一个 `@deepseek-ai/dsh-mcp-client`。

## 机制（已定位到具体代码）

`@deepseek-ai/dsh-scope` 的 `ScopedLayers.effect`：

```js
effect(ctx, action, options) {
  const scope = scopeOf(ctx)                    // ctx[kScope]
  if (scope === void 0) layer = this.global     // ← 全局，所有 agent 可见
  else { … this.scoped.set(scope, layer) }      // ← 仅该 scope 及其后代可见
  …
}
```

`tools.register()` 正是走这条路：

```js
register(definition) {
  return this.layers.effect(this.ctx, (layer) => layer.tools.insert(name, definition), …)
}
```

而 `this.ctx` 经 cordis 的 **tracker**（`Service.tracker`，用于上下文追踪）解析为**调用方 ctx**。
所以可见性取决于**注册方 ctx 有没有 scope 绑定**。

- profile 条目：由 loader 在根处实例化 → 无 scope → **global 层** → 每个 agent 都继承 ✓
- `ctx.plugin(...)` 动态挂载：新 fiber 的 ctx 带 scope → **per-scope 层** → agent 看不到 ✗

> 挂在 `ctx.root` 也**没有**解决 —— 实测同样 `mcp=[]`。所以不是「挂浅一点就行」，
> 而是「必须由 loader 实例化」。具体是哪一层给 fiber ctx 绑了 scope 尚未定位到；
> 但实用规则已经足够明确。

## 这解释了另外两个插件的设计

回头看已装的两个第三方插件，它们的形态现在说得通了：

| 插件 | 它的做法 | 与本次发现的关系 |
|---|---|---|
| `@wingsky-1/dsh-mcp-manager` | 装了官方客户端，但**工具只通过 4 个中间件工具暴露**（`mcp_list`/`mcp_call`/`mcp_detail`/`mcp_search`），而中间件由它自己的 `apply` 注册 | 中间件是**插件自身注册**的（能进 agent 表）；被挂载客户端的工具进不去 —— 所以它绕开了 |
| `dsh-mcp-panel`（PerryLink） | 导出 `appendPatchFragment` / `renderPatchFragment` / `resolvePatchOp` / `renderPatchSuggestion` / `configViewOf` / `deriveTarget` | 它**生成 `cordis.patch.yml` 片段** —— 即把配置物化成真正的 profile 条目。这正是本次发现指向的唯一可行路径 |

## 对设计的影响

### D3 必须撤销

| | 原设计（D3） | 修正后 |
|---|---|---|
| 真相源 | 只有两个 `mcp.json` | 两个 `mcp.json` 是**编辑面**；同时**物化**为 profile 条目 |
| 生效路径 | 插件运行时动态挂载 | DSH loader 加载条目（唯一能让工具进模型表的路径） |
| 「禁用插件 ⇒ MCP 停用」 | 被接受为已知代价 | **不再成立且不需要**：条目独立于插件存在 |

原 §7.4 把「强耦合于本插件」当作可接受的代价 —— 现在看，那个取舍是**建立在错误前提上的**：
动态挂载根本不是一条可用的路径，所以「要不要固化条目」**没有选择余地**。

### 新的架构

```text
编辑面    <DSH_HOME>/yiklek/mcp.json                  （全局）
          <workspace>/.dsh/yiklek/mcp.json            （项目级）
             ↓ 保存时物化
生效面    profile 的 patch 层（受管理区块）
          - insert: @deepseek-ai/dsh-mcp-client × N
             ↓
          DSH loader 实例化 → 工具进 global 层 → agent 可见 ✓
```

需要定的事（下一轮决策）：

| # | 问题 |
|---|---|
| **N1** | 物化写到**哪个** patch 文件？（profile 的 `cordis.patch.yml` 是用户图层 —— 需要受管理的分隔区块，不能覆盖用户内容） |
| **N2** | 保存后**如何生效**？DSH loader 是否 watch patch 文件？否则要提示重启，或用官方 reload 入口 |
| **N3** | 项目级条目怎么办？profile 条目是**全局**的（一个 profile 一份），而项目级配置按工作区分 —— 同一 profile 下多个工作区如何并存？（可能需要按工作区生成不同的 `serverName`，或仅在会话级生效） |
| **N4** | 与「编辑面」的一致性：用户手改 patch 文件后，`mcp.json` 与条目的漂移如何检测与提示 |

**N3 是新的最大风险**：它直接冲击「项目级」这个需求 —— DSH 的 profile 条目没有工作区维度。
P0 曾发现 `working-directory/change` 与工作区绑定无关，当时以为项目级很简单；现在看，
**项目级 MCP 在「profile 条目」这条唯一可行路径上语义并不自然**。这需要先搞清楚 DSH
原生是否支持按工作区/会话提供工具，再决定项目级的实现形态。

## 复现方式

```bash
export DSH_HOME=/tmp/mcp-p1-home
export DEEPSEEK_API_KEY=dummy-for-agent-creation-only   # 仅为触发 agent 创建，不发真实请求

cd "$DSH_HOME/profiles/headless"
# A) 官方方式：把下面这段写进 cordis.patch.yml（注意文件本身是一个 YAML 数组）
#    - insert:
#        - id: official-probe-mcp
#          name: '@deepseek-ai/dsh-mcp-client'
#          config: { transport: stdio, serverName: probe, command: node,
#                    args: [/…/probe/mcp-echo-server.mjs] }
dsh headless "hi" 2>&1 | grep -o 'mcp=\[[^]]*\]'      # → mcp=["mcp__probe__probe_echo"]

# B) 本插件方式：恢复 cordis.patch.yml，改由 mcp.json 驱动
dsh headless "hi" 2>&1 | grep -o 'mcp=\[[^]]*\]'      # → mcp=[]
```

探针脚本：`/tmp/tooltable-probe/lib/host.mjs`（监听 `agent/created`，打印
`agent.ctx.tools.schemas(agent)`）。（该诊断件未收入本仓库：`probe/` 已按要求删除。）

## 仍然有效的成果

本次 P1 的实现**大部分可以保留**，只是生效路径要换：

| 保留 | 说明 |
|---|---|
| `paths` / `store`（原子写 + 0600） | 编辑面存储，测试通过 |
| `normalize`（四种主流格式）/ `validate`（两级） | 与挂载方式无关，25 条单测通过 |
| ~~`merge`（全局优先 + shadowedBy）~~ | 当时 6 条单测通过；**该模块后来被删除** —— 同名处理改成「全局优先→项目不生效 / 项目之间→加后缀」，见 `architecture.md` |
| `api` / `client`（面板 UI + 三入口骨架） | 编辑面 UI，真机验证 10/10 交互通过 |
| `mounter`（账本 + 差量 + dispose） | **生效路径要重写**；但账本的差量/dispose 逻辑对「物化后重载」仍有参考价值 |

`mounter` 已发现的正确行为仍然成立：`fiber.dispose()` 确实回收 stdio 子进程（P0 Q2）。


---

# 解决方案（已实现并验收）

## 架构

```text
编辑面   <DSH_HOME>/yiklek/mcp.json              面板编辑这个
           ↓ 保存时物化（受管理区块）
生效面   <profile>/cordis.patch.yml              模型实际用到的
           ↓ @deepseek-ai/dsh-hmr 监听该文件
         loader 加载条目 → 工具进 global 层 → agent 可见
```

## 关键事实

| 事实 | 来源 |
|---|---|
| 生效面文件路径 = `profileContext.patchPath` | 官方 `@deepseek-ai/dsh-config-editor` 的用法 |
| 写 patch 文件会触发**热重载**（无需重启） | 实测：`@deepseek-ai/dsh-hmr` 用 chokidar 监听 |
| 官方同款做法 | `dsh-config-editor`：「Persist plugin configuration through profile patches and Loader reconciliation」 |
| 受管理区块用**注释标记** 包围，区块外逐字节不动 | 文本级拼接，不用 YAML 往返序列化 |

## 双向语义（单向每条、因此无回写循环）

| 情形 | 处理 |
|---|---|
| 只在 patch 文件里 | **收编**进 `mcp.json`（无论是我方早先写的还是你手写的） |
| 两边都有 | `mcp.json` 胜（它是编辑面）；区块外的同名项会被报告 |
| 只在 `mcp.json` 里 | 保存/刷新时物化进区块 |

收编是幂等的（一旦进了 `mcp.json`，后续就跳过），所以 读→收敛→写 会稳定，不会来回振荡。

## 验收记录（真机）

```text
① 编辑面写入 → 插件自动物化
   cordis.patch.yml 出现受管理区块，含
     - id: mcp-panel-probe
       name: "@deepseek-ai/dsh-mcp-client"
       config: { transport: stdio, serverName: probe, ... }

② 运行中的实例里经面板保存（HTTP API）
   → {"ok":true, patch:{file:…, changed:true}}
   → 无需重启，MCP server 被拉起（完整握手）
   → 面板状态: probe: connected  tools=["mcp__probe__probe_echo"]

③ 一次性运行（headless）
   第一次运行：物化发生，但 profile 已组合完毕 → 本次不生效（mcp=[]）
   第二次运行：mcp=["mcp__probe__probe_echo"]  ✅

   → 面板场景（长驻实例）由 hmr 保证**立即生效**；
     若在面板外手改 mcp.json，则下次启动生效。
```

## 实现中发现并修掉的两个真 bug

| # | 问题 | 后果 |
|---|---|---|
| 1 | profile 模板是「注释 + `[]`」，我只在内容**正好等于** `[]` 时替换占位符 | 带注释的模板被追加列表项 → **YAML 非法 → DSH 起不来**。已修（`stripEmptyArray`）+ 补回归测试 |
| 2 | YAML 标量以 `@` 开头时必须加引号（`@` 是保留指示符） | 生成的 `name: @deepseek-ai/dsh-mcp-client` 解析失败。已修 `scalar()`，测试改为解析后断言 |

## 仍未解决

**N3（项目级）** 依旧悬着：profile 条目没有工作区维度。见正文。

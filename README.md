# dsh-mcp-panel

在 DSH 里管理 MCP 服务器：一份界面管**全局**和**项目级**，支持主流配置格式的导入导出。

> 这是 DSH 的第三方插件，不是 DSH 自带组件。

## 装

```bash
dsh plugin --profile <profile> add github:Yiklek/dsh-mcp-panel#pkg
```

`#pkg` 分支是**构建产物**，安装时不需要工具链。想从源码来：

```bash
git clone https://github.com/Yiklek/dsh-mcp-panel
dsh plugin --profile <profile> add ./dsh-mcp-panel
```

装完**重启**（或刷新页面）。

## 用

面板有五个入口，内容一致：

| 从哪进 | 看到什么 |
|---|---|
| 左栏「插件」→ `dsh-mcp-panel` | 全部工作区 |
| 左栏「MCP 服务器」图标 | 当前工作区 + 全局 |
| 会话页 `对话 / 轨迹 / MCP 服务器` | 当前工作区 + 全局 |
| 右侧边栏「开始」→ MCP 服务器，或 `⌥⌘M` | 全部 + 高亮当前 |
| 会话头部（若该 profile 有该槽位） | 同上 |

## 配置放在哪

```text
全局    <DSH_HOME>/yiklek/mcp.json
项目    <工作区>/.dsh/yiklek/mcp.json
```

`DSH_HOME` 默认 `~/.dsh`。

面板写这两个文件，同时把它们同步进 `<profile>/cordis.patch.yml` 的受管理区块 ——
**只有 profile 条目才让模型看得见工具**，这一条是实测出来的，见
[`docs/architecture.md`](docs/architecture.md) §2。

## 项目级怎么生效

所有项目的 server 都会在 profile 里各连一次（进程数只跟项目数有关），
每个会话再把**别的项目**的工具隐藏掉。所以：

- 一个项目最多 8 个 server，别贪多
- 某个工作区不想让它后台跑 → 面板里「停用此工作区」，它的进程就不会启动
- 项目之间同名 → 后者加 `--<hash8>` 后缀；与全局同名 → 全局优先，项目那条不生效

## 导入导出

支持 Claude Desktop / Cursor（`mcpServers`）、VS Code（`servers` + `type`）、
DSH 原生（`version` + `servers`）以及裸数组。

- 导入是**两段式**：先预览（新增 / 覆盖 / 会被拒绝），确认后才写
- 导出默认脱敏（密钥换成 `${env:VAR}`）
- **保存时按文件原有格式写回** —— 如果你的 `mcp.json` 软链到 `.mcp.json`、还被别的
  工具读着，它不会被改成别的形状

## 已知限制

- 客户端 bundle 变了要**刷新页面**；插件热重载不会重新接管已注册的槽位
- 面板改完若服务器未连上，可能需重启 DSH（profile 组合发生在启动时）
- 一个项目 8 个 server 是建议上限，不是硬限制

## 开发

```bash
pnpm install
pnpm typecheck
pnpm test:unit        # 134 条
pnpm build
```

浏览器检查（需要先起一个实例拿到 token URL）：

```bash
DSH_TOKEN_URL='http://127.0.0.1:3080/?token=…' node tests/playwright/panel.mjs
```

架构与不变量：[`docs/architecture.md`](docs/architecture.md)。
决策过程：[`docs/p0-findings.md`](docs/p0-findings.md)、[`docs/p1-findings.md`](docs/p1-findings.md)、
[`docs/project-scope-plan.md`](docs/project-scope-plan.md)。最初的设计稿（部分已失效）：
[`docs/design.md`](docs/design.md)。

## 许可

MIT

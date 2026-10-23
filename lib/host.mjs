// src/host.ts
import Schema from "@deepseek-ai/schemastery";

// src/shared.ts
var SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
var TRANSPORTS = ["stdio", "streamable-http"];
var NAMESPACE_DIR = "yiklek";
var CONFIG_FILE_NAME = "mcp.json";
var DOC_VERSION = 1;
var API_PREFIX = "/api/yiklek/mcp";
var DEFAULT_TOOL_TIMEOUT_MS = 6e4;
function emptyDocument() {
  return { version: DOC_VERSION, servers: [] };
}
function emptyEntry(name2 = "") {
  return {
    name: name2,
    enabled: true,
    transport: "stdio",
    command: "",
    args: [],
    env: {},
    cwd: "",
    url: "",
    headers: {}
  };
}
function toolPrefixOf(serverName) {
  return `mcp__${serverName}__`;
}
var MAX_PROJECT_SERVERS = 8;

// src/server/api.ts
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store"
  });
  res.end(text);
}
async function readJson(req, limitBytes = 2e6) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = chunk;
    size += buffer.length;
    if (size > limitBytes) throw new Error("Request body too large.");
    chunks.push(buffer);
  }
  if (size === 0) return void 0;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function buildRoutes({ controller, beforeRead, log }) {
  const guard = (handler) => async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log?.(`mcp-panel: ${message}`);
      if (!res.headersSent) sendJson(res, 500, { error: message });
      else res.end();
    }
  };
  return [
    {
      kind: "exact",
      path: `${API_PREFIX}/list`,
      handler: guard(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const candidates = url.searchParams.getAll("workspace").filter((item) => item !== "");
        await beforeRead?.(candidates);
        sendJson(res, 200, controller.list());
      })
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/status`,
      handler: guard(async (_req, res) => {
        await beforeRead?.();
        sendJson(res, 200, {
          status: controller.statusSnapshot(),
          loadError: controller.loadError ?? null
        });
      })
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/sync`,
      handler: guard(async (_req, res) => {
        await beforeRead?.();
        sendJson(res, 200, { sync: controller.syncState() });
      })
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/workspace`,
      handler: guard(async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "POST required." });
          return;
        }
        const body = await readJson(req);
        if (body === void 0 || typeof body.root !== "string" || body.root === "") {
          sendJson(res, 400, { error: "`root` must be a non-empty string." });
          return;
        }
        if (typeof body.enabled !== "boolean") {
          sendJson(res, 400, { error: "`enabled` must be a boolean." });
          return;
        }
        await controller.setWorkspaceEnabled(body.root, body.enabled);
        sendJson(res, 200, { ok: true, root: body.root, enabled: body.enabled });
      })
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/import`,
      handler: guard(async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "POST required." });
          return;
        }
        const body = await readJson(req);
        if (body === void 0 || body.scope !== "global" && body.scope !== "project") {
          sendJson(res, 400, { error: '`scope` must be "global" or "project".' });
          return;
        }
        const scope = body.scope;
        const workspaceRoot = typeof body.workspaceRoot === "string" ? body.workspaceRoot : void 0;
        if (body.commit === true) {
          const result = await controller.applyImport({
            json: body.json,
            scope,
            ...workspaceRoot === void 0 ? {} : { workspaceRoot },
            ...body.allowSseAsHttp === true ? { allowSseAsHttp: true } : {}
          });
          sendJson(res, result.ok ? 200 : 400, result);
          return;
        }
        sendJson(res, 200, {
          preview: controller.previewImport({
            json: body.json,
            scope,
            ...workspaceRoot === void 0 ? {} : { workspaceRoot }
          })
        });
      })
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/export`,
      handler: guard(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const scope = url.searchParams.get("scope") === "project" ? "project" : "global";
        const workspaceRoot = url.searchParams.get("workspace") ?? void 0;
        const redact = url.searchParams.get("redact") !== "false";
        sendJson(res, 200, {
          export: controller.exportConfig({
            scope,
            ...workspaceRoot === void 0 ? {} : { workspaceRoot },
            redact
          })
        });
      })
    },
    {
      kind: "exact",
      path: `${API_PREFIX}/save`,
      handler: guard(async (req, res) => {
        if (req.method !== "POST") {
          sendJson(res, 405, { error: "POST required." });
          return;
        }
        const body = await readJson(req);
        if (body === void 0 || body.scope !== "global" && body.scope !== "project") {
          sendJson(res, 400, { error: '`scope` must be "global" or "project".' });
          return;
        }
        if (!Array.isArray(body.servers)) {
          sendJson(res, 400, { error: "`servers` must be an array." });
          return;
        }
        const result = await controller.save({
          scope: body.scope,
          servers: body.servers,
          ...typeof body.workspaceRoot === "string" ? { workspaceRoot: body.workspaceRoot } : {},
          ...typeof body.revision === "string" ? { revision: body.revision } : {}
        });
        sendJson(res, result.ok ? 200 : 400, result);
      })
    }
  ];
}

// src/server/controller.ts
import { existsSync as existsSync4 } from "node:fs";

// src/server/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";
function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv !== void 0 && fromEnv.trim() !== "") return fromEnv;
  return join(homedir(), ".dsh");
}
function globalConfigFile() {
  return join(dshHome(), NAMESPACE_DIR, CONFIG_FILE_NAME);
}
function projectConfigFile(workspaceRoot) {
  return join(workspaceRoot, ".dsh", NAMESPACE_DIR, CONFIG_FILE_NAME);
}

// src/server/patcher.ts
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync as readFileSync2, renameSync as renameSync2, unlinkSync as unlinkSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { dirname as dirname2 } from "node:path";
import { parse as parseYaml } from "yaml";

// src/server/workspaces.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { dirname, join as join2 } from "node:path";
function canonicalPath(input) {
  try {
    return realpathSync(input);
  } catch {
    return input;
  }
}
function workspaceIdOf(root) {
  return createHash("sha256").update(root).digest("hex").slice(0, 8);
}
function stateFile() {
  return join2(dshHome(), NAMESPACE_DIR, "state.json");
}
function emptyState() {
  return { version: 1, workspaces: [] };
}
function readState(file = stateFile()) {
  if (!existsSync(file)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : [];
    return {
      version: typeof raw.version === "number" ? raw.version : 1,
      // Recompute identity from the root so a hand-edited file still behaves.
      // Dedupe by canonical root: two rows for the same directory (a hand edit, two
      // concurrent registrations) would materialise that workspace's servers twice,
      // so the same MCP server would run as two processes and appear under two names.
      workspaces: [
        ...workspaces.filter((item) => typeof item?.root === "string" && item.root !== "").map((item) => ({
          // Canonicalise on READ, not only on register: a hand-edited registry may
          // hold `/var/...` where the session reports `/private/var/...`, and the
          // mismatch would make `denyToolsFor` silently deny nothing.
          root: canonicalPath(item.root),
          id: workspaceIdOf(canonicalPath(item.root)),
          ...item.suffix === void 0 ? {} : { suffix: item.suffix },
          addedAt: typeof item.addedAt === "number" ? item.addedAt : 0,
          // A registry written before this flag existed counts as enabled.
          enabled: item.enabled !== false
        })).reduce((unique, record) => {
          if (!unique.some((seen) => seen.root === record.root)) unique.push(record);
          return unique;
        }, [])
      ]
    };
  } catch {
    return emptyState();
  }
}
function writeState(state, file = stateFile()) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify(state, null, 2) + "\n", { encoding: "utf8", mode: 384 });
    renameSync(temp, file);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
    }
    throw error;
  }
}
function registerWorkspace(state, root, now = Date.now()) {
  const canonical = canonicalPath(root);
  const existing = state.workspaces.find((item) => item.root === canonical);
  if (existing !== void 0) return { state, record: existing, added: false };
  const record = { root: canonical, id: workspaceIdOf(canonical), addedAt: now, enabled: true };
  const next = { version: state.version, workspaces: [...state.workspaces, record] };
  return { state: next, record, added: true };
}
function findWorkspace(state, root) {
  const canonical = canonicalPath(root);
  return state.workspaces.find((item) => item.root === canonical);
}
function sessionWorkspaceRoot(cwd) {
  if (cwd === void 0 || cwd === "") return void 0;
  return canonicalPath(cwd);
}
function setWorkspaceEnabled(state, root, enabled) {
  const canonical = canonicalPath(root);
  return {
    version: state.version,
    workspaces: state.workspaces.map((item) => item.root === canonical ? { ...item, enabled } : item)
  };
}
function enabledWorkspaces(state) {
  return state.workspaces.filter((item) => item.enabled !== false);
}

// src/server/naming.ts
var MAX_SERVER_NAME = 32;
var ID_PREFIX = "mcp-panel-";
function entryIdFor(serverName) {
  return `${ID_PREFIX}${serverName}`;
}
function projectEntryId(workspaceId, name2) {
  return `${ID_PREFIX}${workspaceId}--${name2}`;
}
function parseEntryId(id) {
  if (!id.startsWith(ID_PREFIX)) return void 0;
  const rest = id.slice(ID_PREFIX.length);
  const match = /^([0-9a-f]{8})--(.+)$/.exec(rest);
  const workspaceId = match?.[1];
  const localName = match?.[2];
  if (workspaceId !== void 0 && localName !== void 0) {
    return { scope: "project", workspaceId, name: localName };
  }
  return { scope: "global", name: rest };
}
function withSuffix(name2, workspaceId) {
  const suffix = `--${workspaceId}`;
  const budget = MAX_SERVER_NAME - suffix.length;
  return `${name2.slice(0, Math.max(1, budget))}${suffix}`;
}
function planEntries(global, workspaces) {
  const claimed = /* @__PURE__ */ new Set();
  const globalNames = /* @__PURE__ */ new Set();
  const materialized = [];
  const renamed = [];
  const shadowed = [];
  const invalid = [];
  const add = (entry, scope, workspaceRoot, serverName) => {
    if (!SERVER_NAME_PATTERN.test(serverName)) {
      invalid.push({ name: entry.name, reason: `"${serverName}" does not match the server-name pattern` });
      return;
    }
    claimed.add(serverName);
    const workspaceId = workspaceRoot === void 0 ? void 0 : workspaceIdOf(workspaceRoot);
    materialized.push({
      entry,
      scope,
      ...workspaceRoot === void 0 ? {} : { workspaceRoot },
      ...workspaceId === void 0 ? {} : { workspaceId },
      serverName,
      id: workspaceId === void 0 ? entryIdFor(serverName) : projectEntryId(workspaceId, entry.name),
      toolPrefix: `mcp__${serverName}__`
    });
    if (serverName !== entry.name) {
      renamed.push({ name: entry.name, serverName, scope, ...workspaceRoot === void 0 ? {} : { workspaceRoot } });
    }
  };
  for (const entry of global.servers) {
    if (entry.enabled === false) continue;
    globalNames.add(entry.name);
    add(entry, "global", void 0, entry.name);
  }
  for (const workspace of workspaces) {
    if (workspace.document === null) continue;
    const workspaceId = workspaceIdOf(workspace.root);
    for (const entry of workspace.document.servers) {
      if (entry.enabled === false) continue;
      if (globalNames.has(entry.name)) {
        shadowed.push({ entry, workspaceRoot: workspace.root, reason: "global-name-taken" });
        continue;
      }
      if (!claimed.has(entry.name)) {
        add(entry, "project", workspace.root, entry.name);
        continue;
      }
      const candidate = withSuffix(entry.name, workspaceId);
      if (!claimed.has(candidate)) {
        add(entry, "project", workspace.root, candidate);
        continue;
      }
      const widened = `${candidate.slice(0, MAX_SERVER_NAME - 3)}_x1`;
      add(entry, "project", workspace.root, widened);
    }
  }
  return { materialized, renamed, shadowed, invalid };
}
function denyToolsFor(plan, knownTools, workspaceRoot) {
  const denied = [];
  for (const item of plan.materialized) {
    if (item.scope === "global") continue;
    if (workspaceRoot !== void 0 && item.workspaceRoot === workspaceRoot) continue;
    denied.push(...knownTools.filter((name2) => name2.startsWith(item.toolPrefix)));
  }
  return [...new Set(denied)];
}
function workspaceIdFromServerName(serverName) {
  const match = /--([0-9a-f]{8})$/.exec(serverName);
  return match === null ? void 0 : match[1];
}
function denyToolsFromPatch(entries, knownTools, workspaceId) {
  const denied = [];
  for (const entry of entries) {
    if (entry.workspaceId === void 0) continue;
    if (workspaceId !== void 0 && entry.workspaceId === workspaceId) continue;
    const prefix = `mcp__${entry.serverName}__`;
    denied.push(...knownTools.filter((name2) => name2.startsWith(prefix)));
  }
  return [...new Set(denied)];
}

// src/server/patcher.ts
var CLIENT_PACKAGE = "@deepseek-ai/dsh-mcp-client";
var REGION_START = "# >>> dsh-mcp-panel: managed block \u2014 generated from mcp.json. Edits here are read back and overwritten; use the MCP panel.";
var REGION_END = "# <<< dsh-mcp-panel: managed block";
function findRegion(text) {
  const start = text.indexOf(REGION_START);
  if (start === -1) return void 0;
  const endMarker = text.indexOf(REGION_END, start);
  if (endMarker === -1) return void 0;
  return { start, end: endMarker + REGION_END.length };
}
function asStringRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") out[key] = item;
    else if (typeof item === "number" || typeof item === "boolean") out[key] = String(item);
  }
  return out;
}
function configToEntry(config) {
  if (config === null || typeof config !== "object") return void 0;
  const raw = config;
  const transport = raw.transport === "streamable-http" || raw.transport === "http" ? "streamable-http" : "stdio";
  const name2 = typeof raw.serverName === "string" ? raw.serverName : "";
  if (name2 === "") return void 0;
  const entry = {
    // `name` is set by the caller from the profile name minus any suffix.
    name: name2,
    enabled: true,
    transport,
    command: typeof raw.command === "string" ? raw.command : "",
    args: Array.isArray(raw.args) ? raw.args.filter((a) => typeof a === "string") : [],
    env: asStringRecord(raw.env),
    cwd: typeof raw.cwd === "string" ? raw.cwd : "",
    url: typeof raw.url === "string" ? raw.url : "",
    headers: asStringRecord(raw.headers)
  };
  if (typeof raw.toolCallTimeoutMs === "number") entry.toolCallTimeoutMs = raw.toolCallTimeoutMs;
  if (typeof raw.failOnStartupError === "boolean") entry.failOnStartupError = raw.failOnStartupError;
  return entry;
}
function readPatchFile(file) {
  if (!existsSync2(file)) return { exists: false, text: "", entries: [] };
  const text = readFileSync2(file, "utf8");
  let parsed;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    return { exists: true, text, error: `Invalid YAML: ${String(error)}`, entries: [] };
  }
  const entries = [];
  const seen = /* @__PURE__ */ new Set();
  const list = Array.isArray(parsed) ? parsed : [];
  for (const row of list) {
    if (row === null || typeof row !== "object") continue;
    const inserts = Array.isArray(row.insert) ? row.insert : [];
    for (const inserted of inserts) {
      if (inserted === null || typeof inserted !== "object") continue;
      const item = inserted;
      if (item.name !== CLIENT_PACKAGE) continue;
      const entry = configToEntry(item.config);
      if (entry === void 0) continue;
      if (seen.has(entry.name)) continue;
      seen.add(entry.name);
      const id = typeof item.id === "string" ? item.id : "";
      entries.push({
        serverName: entry.name,
        id,
        entry,
        ours: id.startsWith("mcp-panel-"),
        origin: parseEntryId(id)
      });
    }
  }
  return { exists: true, text, entries };
}
function groupsOf(materialized) {
  const groups = [];
  const globals = materialized.filter((item) => item.scope === "global");
  if (globals.length > 0) groups.push({ label: "global", items: globals });
  const byRoot = /* @__PURE__ */ new Map();
  for (const item of materialized) {
    if (item.scope !== "project" || item.workspaceRoot === void 0) continue;
    const list = byRoot.get(item.workspaceRoot) ?? [];
    list.push(item);
    byRoot.set(item.workspaceRoot, list);
  }
  for (const [root, items] of byRoot) groups.push({ label: `project: ${root}`, items });
  return groups;
}
function renderManagedBlock(materialized) {
  const lines = [];
  for (const group of groupsOf(materialized)) {
    lines.push(`# ${group.label}`);
    lines.push("- insert:");
    for (const item of group.items) {
      lines.push(`    - id: ${scalar(item.id)}`);
      lines.push(`      name: ${scalar(CLIENT_PACKAGE)}`);
      lines.push("      config:");
      lines.push(...emitConfig(configOf(item)));
    }
  }
  return lines.join("\n");
}
function configOf(item) {
  const entry = item.entry;
  const config = { transport: entry.transport, serverName: item.serverName };
  if (entry.transport === "streamable-http") {
    config.url = entry.url;
    if (Object.keys(entry.headers).length > 0) config.headers = entry.headers;
  } else {
    config.command = entry.command;
    if (entry.args.length > 0) config.args = entry.args;
    if (Object.keys(entry.env).length > 0) config.env = entry.env;
    if (entry.cwd !== "") config.cwd = entry.cwd;
  }
  if (entry.toolCallTimeoutMs !== void 0) config.toolCallTimeoutMs = entry.toolCallTimeoutMs;
  config.failOnStartupError = true;
  return config;
}
function emitConfig(config) {
  const lines = [];
  for (const [key, value] of Object.entries(config)) {
    if (Array.isArray(value)) {
      lines.push(`        ${key}:`);
      for (const item of value) lines.push(`          - ${scalar(item)}`);
    } else if (value !== null && typeof value === "object") {
      lines.push(`        ${key}:`);
      for (const [k, v] of Object.entries(value)) {
        lines.push(`          ${scalar(k)}: ${scalar(v)}`);
      }
    } else {
      lines.push(`        ${key}: ${scalar(value)}`);
    }
  }
  return lines;
}
function scalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  const text = String(value);
  if (text === "") return '""';
  const plainSafe = /^[A-Za-z0-9_./-][A-Za-z0-9_./@-]*$/.test(text);
  const ambiguous = /^(true|false|null|yes|no|on|off|~)$/i.test(text) || /^[-+]?[0-9.]/.test(text);
  if (plainSafe && !ambiguous) return text;
  return JSON.stringify(text);
}
function stripEmptyArray(text) {
  const lines = text.split("\n");
  const meaningful = lines.map((line, index) => ({ line: line.trim(), index })).filter((item) => item.line !== "" && !item.line.startsWith("#"));
  const only = meaningful[0];
  if (meaningful.length === 1 && only !== void 0 && only.line === "[]") {
    lines.splice(only.index, 1);
    return lines.join("\n").replace(/\s*$/, "");
  }
  return text;
}
function buildPatchedText(existing, materialized) {
  const region = findRegion(existing);
  if (materialized.length === 0) {
    if (region === void 0) return existing;
    const head2 = existing.slice(0, region.start);
    const tail = existing.slice(region.end);
    let text = `${head2}${tail}`.replace(/\n{3,}/g, "\n\n");
    if (parseYaml(text) === null || parseYaml(text) === void 0) {
      text = `${text.replace(/\s*$/, "")}
[]
`;
    }
    return text;
  }
  const block = [REGION_START, renderManagedBlock(materialized), REGION_END].join("\n");
  if (region !== void 0) {
    const live = existing.slice(0, region.start) + block + existing.slice(region.end);
    return dropExtraRegions(live);
  }
  const base = stripEmptyArray(existing.replace(/\s*$/, ""));
  const documentEnd = /(^|\n)\.\.\.\s*$/;
  if (documentEnd.test(base)) {
    const head2 = base === "" ? "" : base + "\n";
    return head2.replace(documentEnd, `
${block}
...
`).replace(/^\n/, "");
  }
  const head = base === "" ? "" : base + "\n";
  return `${head}${block}
`;
}
function dropExtraRegions(text) {
  let remaining = text;
  for (; ; ) {
    const first = findRegion(remaining);
    if (first === void 0) return remaining;
    const rest = remaining.slice(first.end);
    const again = findRegion(rest);
    if (again === void 0) return remaining;
    const cutFrom = first.end + again.start;
    const cutTo = first.end + again.end;
    remaining = (remaining.slice(0, cutFrom) + remaining.slice(cutTo)).replace(/\n{3,}/g, "\n\n");
  }
}
function assertLoadable(text) {
  let parsed;
  try {
    parsed = parseYaml(text);
  } catch (error) {
    throw new Error(`refusing to write a patch file that is not valid YAML: ${String(error)}`);
  }
  if (parsed === null || parsed === void 0) {
    throw new Error("refusing to write a patch file with no top-level YAML array");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("refusing to write a patch file that is not a top-level YAML array");
  }
}
function writePatchFile(file, materialized) {
  const present = existsSync2(file);
  if (!present && materialized.length === 0) return { file, created: false, changed: false };
  const existing = present ? readFileSync2(file, "utf8") : "";
  const next = buildPatchedText(existing, materialized);
  assertLoadable(next);
  if (next === existing) return { file, created: false, changed: false };
  mkdirSync2(dirname2(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync2(temp, next, { encoding: "utf8", mode: 384 });
    renameSync2(temp, file);
  } catch (error) {
    try {
      unlinkSync2(temp);
    } catch {
    }
    throw error;
  }
  return { file, created: existing === "", changed: true };
}
function adoptFromPatch(global, projects, patch, workspaceById) {
  const globalNames = new Set(global.servers.map((entry) => entry.name));
  const projectNames = /* @__PURE__ */ new Map();
  for (const [root, document] of projects) projectNames.set(root, new Set(document.servers.map((e) => e.name)));
  let globalDocument = global;
  const projectDocuments = new Map(projects);
  const adopted = [];
  const skipped = [];
  const externals = [];
  for (const item of patch.entries) {
    if (!item.ours) {
      externals.push({ serverName: item.serverName, entry: item.entry });
      continue;
    }
    const origin = item.origin;
    const root = origin?.scope === "project" && origin.workspaceId !== void 0 ? workspaceById.get(origin.workspaceId) : void 0;
    if (root !== void 0 && origin !== void 0) {
      const names = projectNames.get(root) ?? /* @__PURE__ */ new Set();
      const localName = origin.name;
      if (!names.has(localName)) {
        names.add(localName);
        projectNames.set(root, names);
        const document = projectDocuments.get(root) ?? { version: 1, servers: [] };
        const entry = { ...item.entry, name: localName };
        projectDocuments.set(root, { version: document.version, servers: [...document.servers, entry] });
        adopted.push({ name: localName, scope: "project", workspaceRoot: root });
      }
      continue;
    }
    if (globalNames.has(item.entry.name)) continue;
    globalNames.add(item.entry.name);
    globalDocument = { version: global.version, servers: [...globalDocument.servers, item.entry] };
    adopted.push({ name: item.entry.name, scope: "global" });
  }
  return {
    global: globalDocument,
    projects: projectDocuments,
    adopted,
    skipped,
    externals,
    changed: adopted.length > 0
  };
}

// src/server/normalize.ts
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var str = (value, fallback = "") => typeof value === "string" ? value : fallback;
function strArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string" && value !== "") return [value];
  return [];
}
function strRecord(value) {
  const out = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isRecord(item) && typeof item.name === "string" && typeof item.value === "string") {
        out[item.name] = item.value;
      }
    }
    return out;
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (typeof item === "string") out[key] = item;
      else if (typeof item === "number" || typeof item === "boolean") out[key] = String(item);
    }
  }
  return out;
}
var issue = (level, path, code, message, params) => ({ level, path, code, message, ...params === void 0 ? {} : { params } });
function pickTransport(raw, allowSseAsHttp) {
  const declared = str(raw.transport) !== "" ? str(raw.transport) : str(raw.type);
  switch (declared) {
    case "":
      if (str(raw.url) !== "") return { transport: "streamable-http" };
      return { transport: "stdio" };
    case "stdio":
      return { transport: "stdio" };
    case "http":
    case "streamable-http":
    case "streamableHttp":
      return { transport: "streamable-http" };
    case "sse":
      if (allowSseAsHttp) return { transport: "streamable-http" };
      return { skip: "sse" };
    default:
      return { skip: `unsupported transport "${declared}"` };
  }
}
function normalizeEntry(name2, raw, allowSseAsHttp) {
  if (!isRecord(raw)) {
    return { skip: name2, reason: "entry is not an object" };
  }
  const picked = pickTransport(raw, allowSseAsHttp);
  if ("skip" in picked) return { skip: name2, reason: picked.skip };
  const entry = emptyEntry(name2);
  entry.transport = picked.transport;
  entry.enabled = typeof raw.enabled === "boolean" ? raw.enabled : !raw.disabled;
  if (entry.transport === "stdio") {
    if (Array.isArray(raw.command)) {
      const argv = strArray(raw.command);
      entry.command = argv[0] ?? "";
      entry.args = argv.slice(1);
    } else {
      entry.command = str(raw.command);
      entry.args = strArray(raw.args);
    }
    entry.env = strRecord(raw.env);
    entry.cwd = str(raw.cwd);
  } else {
    entry.url = str(raw.url);
    entry.headers = strRecord(raw.headers);
  }
  if (typeof raw.toolCallTimeoutMs === "number") entry.toolCallTimeoutMs = raw.toolCallTimeoutMs;
  if (typeof raw.failOnStartupError === "boolean") entry.failOnStartupError = raw.failOnStartupError;
  return { entry };
}
function detect(raw) {
  if (Array.isArray(raw)) return "bare";
  if (!isRecord(raw)) return "unknown";
  if (Array.isArray(raw.mcpServers)) return "acp";
  if (isRecord(raw.mcpServers)) return "claude";
  if (isRecord(raw.servers)) return "vscode";
  if (Array.isArray(raw.servers)) {
    const first = raw.servers.find(isRecord);
    if (first !== void 0 && (str(first.transport) !== "" || typeof raw.version === "number")) {
      return "ours";
    }
    return "acp";
  }
  return "unknown";
}
function pairsOf(raw, format) {
  if (format === "bare") {
    return raw.map((item, index) => [
      isRecord(item) ? str(item.name, `server-${index + 1}`) : `server-${index + 1}`,
      item
    ]);
  }
  const record = raw;
  if (format === "claude") {
    return Object.entries(record.mcpServers);
  }
  if (format === "vscode") {
    return Object.entries(record.servers);
  }
  return record.servers?.map((item, index) => [
    isRecord(item) ? str(item.name, `server-${index + 1}`) : `server-${index + 1}`,
    item
  ]) ?? record.mcpServers.map((item, index) => [
    isRecord(item) ? str(item.name, `server-${index + 1}`) : `server-${index + 1}`,
    item
  ]);
}
function parseDocument(raw, options = {}) {
  const allowSseAsHttp = options.allowSseAsHttp === true;
  const format = detect(raw);
  const issues = [];
  if (format === "unknown") {
    return {
      document: emptyDocument(),
      format,
      issues: [
        issue(
          "blocking",
          "",
          "format-unknown",
          "Unrecognised MCP configuration: expected mcpServers, servers, or an array."
        )
      ]
    };
  }
  const document = emptyDocument();
  const seen = /* @__PURE__ */ new Map();
  pairsOf(raw, format).forEach(([name2, value], index) => {
    const path = `servers[${index}]`;
    const result = normalizeEntry(name2.trim(), value, allowSseAsHttp);
    if ("skip" in result) {
      issues.push(issue("warning", path, "entry-skipped", `Skipped "${name2}": ${result.reason}`, {
        name: name2,
        reason: result.reason
      }));
      return;
    }
    const previous = seen.get(result.entry.name);
    if (previous !== void 0) {
      issues.push(
        issue("blocking", `${path}.name`, "name-duplicate", `Duplicate name: ${result.entry.name}`, {
          name: result.entry.name
        })
      );
      return;
    }
    seen.set(result.entry.name, index);
    document.servers.push(result.entry);
  });
  const declaredVersion = raw.version;
  if (format === "ours" && typeof declaredVersion === "number") {
    document.version = declaredVersion;
  }
  return { document, format, issues };
}
function envPlaceholder(key) {
  const normalized = key.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `\${env:${normalized === "" ? "VALUE" : normalized}}`;
}
function toExportShape(entry, redact) {
  const out = {};
  if (entry.transport === "streamable-http") {
    out.type = "http";
    out.url = entry.url;
    if (Object.keys(entry.headers).length > 0) {
      out.headers = Object.fromEntries(
        Object.entries(entry.headers).map(([key, value]) => [key, redact ? envPlaceholder(key) : value])
      );
    }
    return out;
  }
  out.command = entry.command;
  if (entry.args.length > 0) out.args = entry.args;
  if (Object.keys(entry.env).length > 0) {
    out.env = Object.fromEntries(
      Object.entries(entry.env).map(([key, value]) => [key, redact ? envPlaceholder(key) : value])
    );
  }
  if (entry.cwd !== "") out.cwd = entry.cwd;
  return out;
}
function exportDocument(entries, options = {}) {
  const redact = options.redact !== false;
  const mcpServers = {};
  for (const entry of entries) {
    if (entry.enabled === false && options.includeDisabled !== true) continue;
    mcpServers[entry.name] = toExportShape(entry, redact);
  }
  return { mcpServers };
}
function serializeInFormat(format, document) {
  if (format === "claude") {
    const mcpServers = {};
    for (const entry of document.servers) mcpServers[entry.name] = toExportShape(entry, false);
    return JSON.stringify({ mcpServers }, null, 2) + "\n";
  }
  if (format === "vscode") {
    const servers = {};
    for (const entry of document.servers) {
      const shape = toExportShape(entry, false);
      if (shape.type !== void 0) delete shape.type;
      servers[entry.name] = {
        type: entry.transport === "stdio" ? "stdio" : "http",
        ...shape
      };
    }
    return JSON.stringify({ servers }, null, 2) + "\n";
  }
  const out = {
    version: typeof document.version === "number" ? document.version : DOC_VERSION,
    servers: document.servers
  };
  return JSON.stringify(out, null, 2) + "\n";
}

// src/server/validate.ts
var issue2 = (level, path, code, message, params) => ({ level, path, code, message, ...params === void 0 ? {} : { params } });
var SECRET_KEY = /(token|secret|password|passwd|credential|api[_-]?key|auth)/i;
var PLACEHOLDER = /^\$\{/;
function looksLikeSecret(value) {
  if (value.length < 16 || PLACEHOLDER.test(value)) return false;
  if (/\s/.test(value)) return false;
  return /^[A-Za-z0-9_\-./+=:]+$/.test(value);
}
function looksRelativeCommand(command) {
  if (command === "") return false;
  if (command.startsWith("/") || /^[A-Za-z]:[\\/]/.test(command)) return false;
  if (command.startsWith(".")) return true;
  return command.includes("/") || command.includes("\\");
}
function validateEntry(entry, path) {
  const issues = [];
  if (!SERVER_NAME_PATTERN.test(entry.name)) {
    issues.push(
      issue2(
        "blocking",
        `${path}.name`,
        "name-invalid",
        "Name must be 1\u201332 characters of letters, digits, underscore or hyphen.",
        { name: entry.name }
      )
    );
  }
  if (!TRANSPORTS.includes(entry.transport)) {
    issues.push(
      issue2("blocking", `${path}.transport`, "transport-invalid", `Unsupported transport: ${String(entry.transport)}`)
    );
    return issues;
  }
  if (entry.transport === "stdio") {
    if (entry.command.trim() === "") {
      issues.push(issue2("blocking", `${path}.command`, "command-required", "A stdio server needs a command."));
    } else if (looksRelativeCommand(entry.command)) {
      issues.push(
        issue2(
          "warning",
          `${path}.command`,
          "command-relative",
          "The command looks relative; it will only resolve from the matching directory.",
          { command: entry.command }
        )
      );
    }
  } else {
    if (entry.url.trim() === "") {
      issues.push(issue2("blocking", `${path}.url`, "url-required", "A streamable-http server needs a URL."));
    } else if (!/^https?:\/\//i.test(entry.url)) {
      issues.push(issue2("blocking", `${path}.url`, "url-invalid", "The URL must start with http:// or https://"));
    }
  }
  for (const [key, value] of [
    ...Object.entries(entry.env),
    ...Object.entries(entry.headers)
  ]) {
    if (SECRET_KEY.test(key) && looksLikeSecret(value)) {
      issues.push(
        issue2(
          "warning",
          `${path}.env.${key}`,
          "secret-inline",
          `"${key}" looks like a literal secret. Prefer \${env:${key}} so it stays out of the file.`,
          { key }
        )
      );
    }
  }
  if (entry.toolCallTimeoutMs !== void 0 && (entry.toolCallTimeoutMs <= 0 || entry.toolCallTimeoutMs > 36e5)) {
    issues.push(
      issue2(
        "warning",
        `${path}.toolCallTimeoutMs`,
        "timeout-odd",
        `Unusual tool-call timeout: ${entry.toolCallTimeoutMs} ms`,
        { timeout: String(entry.toolCallTimeoutMs) }
      )
    );
  }
  return issues;
}
function validateDocument(document) {
  const issues = [];
  if (!Array.isArray(document.servers)) {
    return [issue2("blocking", "servers", "servers-invalid", "`servers` must be an array.")];
  }
  const seen = /* @__PURE__ */ new Map();
  document.servers.forEach((entry, index) => {
    const path = `servers[${index}]`;
    issues.push(...validateEntry(entry, path));
    const previous = seen.get(entry.name);
    if (previous !== void 0) {
      issues.push(
        issue2(
          "blocking",
          `${path}.name`,
          "name-duplicate",
          `Duplicate name in this file: ${entry.name} (also at index ${previous})`,
          { name: entry.name, previous: String(previous) }
        )
      );
    } else {
      seen.set(entry.name, index);
    }
  });
  return issues;
}
function hasBlocking(issues) {
  return issues.some((finding) => finding.level === "blocking");
}

// src/server/transfer.ts
function previewImport(existing, json) {
  const parsed = parseDocument(json, { allowSseAsHttp: false });
  const byName = new Map(existing.servers.map((entry) => [entry.name, entry]));
  const added = [];
  const replaced = [];
  for (const entry of parsed.document.servers) {
    if (byName.has(entry.name)) replaced.push(entry.name);
    else added.push(entry.name);
  }
  const merged = new Map(byName);
  for (const entry of parsed.document.servers) merged.set(entry.name, entry);
  const blocking = validateDocument({ version: 1, servers: [...merged.values()] }).filter((issue3) => issue3.level === "blocking").map((issue3) => ({ path: issue3.path, message: issue3.message }));
  return {
    format: parsed.format,
    added,
    replaced,
    skipped: parsed.issues.filter((issue3) => issue3.code === "entry-skipped" || issue3.level === "blocking").map((issue3) => ({ name: issue3.params?.name ?? "", reason: issue3.message })),
    blocking,
    servers: parsed.document.servers
  };
}
function applyImport(existing, json, allowSseAsHttp = false) {
  const parsed = parseDocument(json, { allowSseAsHttp });
  if (parsed.format === "unknown") {
    return {
      ok: false,
      issues: [{ level: "blocking", path: "", code: "format-unknown", message: "Unrecognised MCP configuration." }],
      servers: existing.servers
    };
  }
  const merged = new Map(existing.servers.map((entry) => [entry.name, entry]));
  for (const entry of parsed.document.servers) merged.set(entry.name, entry);
  return { ok: true, issues: [], servers: [...merged.values()] };
}
function exportConfig(document, redact = true) {
  const exported = exportDocument(document.servers, { redact });
  return {
    format: "claude",
    text: JSON.stringify(exported, null, 2) + "\n",
    omitted: {
      disabled: document.servers.filter((entry) => entry.enabled === false).length,
      timeouts: document.servers.filter((entry) => entry.toolCallTimeoutMs !== void 0).length
    }
  };
}

// src/server/sanitize.ts
function sanitizeError(value) {
  const text = value instanceof Error ? value.message : String(value);
  const cleaned = text.replace(/\b(glpat|xox[abposr]|AKIA|ASIA|AIza|ya29|eyJ)[A-Za-z0-9._-]{6,}/g, "$1\u2026").replace(/\b(ghp_|gho_|github_pat_|sk-)[A-Za-z0-9_-]{8,}/g, "$1\u2026").replace(
    /([A-Za-z0-9_.-]*(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth|token|secret|password|passwd|credential)[A-Za-z0-9_.-]*)(\s*[:=]\s*)(["']?)([^\s,;"'&]{4,})\3/gi,
    "$1$2$3\u2026$3"
  ).replace(/(\/\/[^/\s:@]+):[^/\s@]+@/g, "$1:\u2026@").replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{6,}/gi, "$1 \u2026").replace(/\s+/g, " ").trim().slice(0, 400);
  return cleaned === "" ? "Unknown error." : cleaned;
}

// src/server/store.ts
import { chmodSync, existsSync as existsSync3, mkdirSync as mkdirSync3, readFileSync as readFileSync3, realpathSync as realpathSync2, renameSync as renameSync3, statSync, unlinkSync as unlinkSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { createHash as createHash2 } from "node:crypto";
import { dirname as dirname3 } from "node:path";
function enforcePrivateMode(file) {
  try {
    const mode = statSync(file).mode & 511;
    if (mode !== 384) chmodSync(file, 384);
  } catch {
  }
}
function readDocument(file) {
  if (!existsSync3(file)) return { document: emptyDocument(), exists: false };
  let raw;
  try {
    raw = JSON.parse(readFileSync3(file, "utf8"));
  } catch (error) {
    return { document: emptyDocument(), exists: true, error: `Invalid JSON: ${String(error)}` };
  }
  const parsed = parseDocument(raw);
  if (parsed.format === "unknown") {
    return { document: emptyDocument(), exists: true, error: "Unrecognised MCP configuration shape." };
  }
  return { document: parsed.document, exists: true, format: parsed.format };
}
function writeDocument(file, document, format = "ours") {
  const created = !existsSync3(file);
  let target = file;
  try {
    target = realpathSync2(file);
  } catch {
  }
  mkdirSync3(dirname3(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync3(temp, serializeInFormat(format, document), { encoding: "utf8", mode: 384 });
    renameSync3(temp, target);
  } catch (error) {
    try {
      unlinkSync3(temp);
    } catch {
    }
    throw error;
  }
  enforcePrivateMode(target);
  return { file, created };
}
function revisionOf(file) {
  if (!existsSync3(file)) return "";
  return createHash2("sha256").update(readFileSync3(file)).digest("hex").slice(0, 16);
}

// src/server/controller.ts
var Controller = class {
  constructor(options = {}) {
    this.globalDoc = emptyDocument();
    this.projects = /* @__PURE__ */ new Map();
    this.state = { version: 1, workspaces: [] };
    this.sync = { materialized: [], adopted: [], renamed: [], skipped: [], drift: [] };
    this.plan = { materialized: [], renamed: [], shadowed: [], invalid: [] };
    /** Entries declared directly in the patch file; never adopted, never duplicated. */
    this.externals = [];
    /** Whether the last materialisation actually rewrote the patch file. */
    this.lastWriteChanged = false;
    this.patchPath = options.patchPath;
    this.listTools = options.listTools ?? (() => []);
    this.log = options.log ?? (() => {
    });
  }
  get patchFile() {
    return this.patchPath;
  }
  get loadError() {
    return this.sync.error;
  }
  /** Registered workspaces, in registry order. */
  workspaces() {
    return this.state.workspaces;
  }
  /**
   * Read every editing surface and converge with the effective one.
   *
   * Order: adopt first (so a hand-written patch entry appears in a panel), then
   * materialise (so what the panels hold is what runs). Adoption is idempotent,
   * so repeated calls settle.
   */
  /**
   * Adopt workspaces that hold a project config but were never registered.
   *
   * Registration used to happen only when the panel saved a project config, which
   * made a hand-written `<workspace>/.dsh/yiklek/mcp.json` invisible AND inert —
   * the exact complaint that produced this method. The candidate paths come from
   * the client, which is the only side that knows the Workspace list.
   */
  adoptCandidates(candidates) {
    let changed = false;
    for (const candidate of candidates) {
      if (candidate === "" || !existsSync4(projectConfigFile(candidate))) continue;
      const registered = registerWorkspace(this.state, candidate);
      if (!registered.added) continue;
      this.state = registered.state;
      changed = true;
      this.log(`mcp-panel: adopted workspace ${registered.record.root} (it has a project config)`);
    }
    if (changed) writeState(this.state);
  }
  async refresh(candidates = []) {
    this.state = readState();
    if (candidates.length > 0) this.adoptCandidates(candidates);
    const read = readDocument(globalConfigFile());
    this.globalDoc = read.document;
    this.globalError = read.error;
    this.projects = /* @__PURE__ */ new Map();
    for (const record of this.state.workspaces) {
      this.projects.set(record.root, readDocument(projectConfigFile(record.root)).document);
    }
    if (this.patchPath === void 0) {
      this.sync = {
        materialized: [],
        adopted: [],
        renamed: [],
        skipped: [],
        drift: [],
        error: "This profile exposes no patch file."
      };
      return;
    }
    const patch = readPatchFile(this.patchPath);
    if (patch.error !== void 0) {
      this.sync = { patchFile: this.patchPath, materialized: [], adopted: [], renamed: [], skipped: [], drift: [], error: patch.error };
      return;
    }
    this.adopt(patch);
    await this.materialize();
  }
  /** Fold the patch file back into the editing surfaces. */
  adopt(patch) {
    const byId = /* @__PURE__ */ new Map();
    for (const record of this.state.workspaces) byId.set(record.id, record.root);
    const result = adoptFromPatch(this.globalDoc, this.projects, patch, byId);
    this.externals = result.externals;
    if (result.changed) {
      writeDocument(globalConfigFile(), result.global, readDocument(globalConfigFile()).format ?? "ours");
      this.globalDoc = result.global;
      for (const [root, document] of result.projects) {
        writeDocument(projectConfigFile(root), document, readDocument(projectConfigFile(root)).format ?? "ours");
        this.projects.set(root, document);
      }
      this.log(`mcp-panel: adopted ${result.adopted.map((item) => item.name).join(", ")} from the patch file`);
    }
    this.sync = {
      ...this.patchPath === void 0 ? {} : { patchFile: this.patchPath },
      materialized: [],
      adopted: result.adopted,
      renamed: [],
      skipped: result.skipped,
      drift: result.adopted.filter((item) => item.scope === "project" && item.workspaceRoot !== void 0).map((item) => ({ root: item.workspaceRoot, message: `adopted ${item.name} from the profile patch file` }))
    };
  }
  /** Rewrite the managed region from the editing surfaces. */
  async materialize() {
    if (this.patchPath === void 0) return;
    try {
      this.plan = planEntries(
        this.globalDoc,
        enabledWorkspaces(this.state).map((record) => ({
          root: record.root,
          document: this.projects.get(record.root) ?? null
        }))
      );
      const externalNames = new Set(this.externals.map((item) => item.serverName));
      const materialized = this.plan.materialized.filter((item) => !externalNames.has(item.serverName));
      const result = writePatchFile(this.patchPath, materialized);
      const blocked = this.plan.materialized.length - materialized.length;
      if (blocked > 0) {
        this.log(`mcp-panel: ${blocked} server(s) left alone because the patch file already declares them`);
      }
      this.sync.materialized = materialized.map((item) => item.serverName);
      this.sync.renamed = this.plan.renamed;
      delete this.sync.error;
      if (result.changed) {
        this.log(`mcp-panel: materialised ${this.plan.materialized.length} server(s) into ${result.file}`);
      }
    } catch (error) {
      this.sync.error = `Could not write the profile patch file: ${sanitizeError(error)}`;
      this.sync.materialized = [];
    }
  }
  /** Validate, write one editing surface, then materialise. */
  async save(input) {
    if (input.scope === "project" && (input.workspaceRoot === void 0 || input.workspaceRoot === "")) {
      return {
        ok: false,
        issues: [
          { level: "blocking", path: "", code: "workspace-required", message: "Select a workspace first." }
        ]
      };
    }
    const document = { version: 1, servers: input.servers };
    const issues = validateDocument(document);
    if (hasBlocking(issues)) return { ok: false, issues };
    const target = input.scope === "global" ? globalConfigFile() : projectConfigFile(canonicalPath(input.workspaceRoot));
    if (input.revision !== void 0 && input.revision !== revisionOf(target)) {
      return {
        ok: false,
        conflict: true,
        issues: [
          {
            level: "blocking",
            path: "",
            code: "revision-conflict",
            message: "This configuration changed in another window. Reloading is the safe next step."
          }
        ]
      };
    }
    if (input.scope === "global") {
      writeDocument(globalConfigFile(), document, readDocument(globalConfigFile()).format ?? "ours");
      this.globalDoc = document;
      this.globalError = void 0;
      await this.materialize();
      return {
        ok: true,
        issues,
        file: globalConfigFile(),
        ...this.patchPath === void 0 ? {} : { patch: { file: this.patchPath, changed: this.lastWriteChanged } }
      };
    }
    if (input.servers.length > MAX_PROJECT_SERVERS) {
      return {
        ok: false,
        issues: [
          {
            level: "blocking",
            path: "",
            code: "too-many-servers",
            message: `A workspace may declare at most ${MAX_PROJECT_SERVERS} servers (this one has ${input.servers.length}). Every project server runs on every boot.`,
            params: { max: String(MAX_PROJECT_SERVERS), count: String(input.servers.length) }
          }
        ]
      };
    }
    const root = canonicalPath(input.workspaceRoot);
    const registered = registerWorkspace(this.state, root);
    if (registered.added) {
      this.state = registered.state;
      writeState(this.state);
      this.log(`mcp-panel: registered workspace ${root}`);
    }
    writeDocument(projectConfigFile(root), document, readDocument(projectConfigFile(root)).format ?? "ours");
    this.projects.set(root, document);
    await this.materialize();
    return {
      ok: true,
      issues,
      file: projectConfigFile(root),
      ...this.patchPath === void 0 ? {} : { patch: { file: this.patchPath, changed: this.lastWriteChanged } }
    };
  }
  /** Turn a workspace's servers on or off (off means its processes never start). */
  async setWorkspaceEnabled(root, enabled) {
    this.state = setWorkspaceEnabled(this.state, root, enabled);
    writeState(this.state);
    await this.materialize();
  }
  /**
   * Tool names to deny for a session born in `cwd`.
   *
   * Everything belonging to a DIFFERENT workspace is denied; global servers and
   * this workspace's own stay. Built-in tools are never listed, and `deny` removes
   * exactly the names it carries (P2-a verified).
   */
  denyToolsFor(cwd) {
    const root = cwd === void 0 || cwd === "" ? void 0 : canonicalPath(cwd);
    const tools = this.listTools();
    if (this.patchPath !== void 0) {
      const patch = readPatchFile(this.patchPath);
      if (patch.error === void 0 && patch.entries.length > 0) {
        const entries = patch.entries.map((item) => ({
          serverName: item.serverName,
          ...item.origin?.scope === "project" && item.origin.workspaceId !== void 0 ? { workspaceId: item.origin.workspaceId } : {}
        }));
        const workspaceId = root === void 0 ? void 0 : workspaceIdOf(root);
        return denyToolsFromPatch(entries, tools, workspaceId);
      }
    }
    return denyToolsFor(this.plan, tools, root);
  }
  /**
   * Parse an import without writing anything.
   *
   * Returns the parsed servers plus what applying them would do to the target
   * document, so the UI can show "new / replaced / skipped" before committing —
   * an import that silently overwrote a server would be a bad surprise.
   */
  /** What importing would do to one surface. Delegates to `transfer`. */
  previewImport(input) {
    return previewImport(this.documentFor(input.scope, input.workspaceRoot), input.json);
  }
  /** Apply an import: replace same-named servers, append the rest. */
  async applyImport(input) {
    const plan = applyImport(this.documentFor(input.scope, input.workspaceRoot), input.json, input.allowSseAsHttp === true);
    if (!plan.ok) return { ok: false, issues: plan.issues };
    return this.save({
      scope: input.scope,
      ...input.workspaceRoot === void 0 ? {} : { workspaceRoot: input.workspaceRoot },
      servers: plan.servers
    });
  }
  /** Serialize one editing surface for export. Redacted unless asked otherwise. */
  exportConfig(input) {
    return exportConfig(this.documentFor(input.scope, input.workspaceRoot), input.redact !== false);
  }
  /** The editing document for a scope. */
  documentFor(scope, workspaceRoot) {
    if (scope === "global") return this.globalDoc;
    if (workspaceRoot === void 0) return emptyDocument();
    return this.projects.get(canonicalPath(workspaceRoot)) ?? emptyDocument();
  }
  /** Per-server status, derived from what the loader actually registered. */
  statusSnapshot() {
    const names = this.listTools();
    const now = Date.now();
    const statuses = {};
    for (const item of this.plan.materialized) {
      const tools = names.filter((name2) => name2.startsWith(item.toolPrefix));
      statuses[item.serverName] = tools.length > 0 ? { state: "connected", tools, at: now } : { state: "connecting", tools: [], at: now };
    }
    for (const item of this.plan.shadowed) {
      if (statuses[item.entry.name] !== void 0) continue;
      statuses[item.entry.name] = { state: "disabled", tools: [], at: now };
    }
    for (const entry of this.globalDoc.servers) {
      const key = entry.name;
      if (statuses[key] !== void 0) continue;
      statuses[key] = { state: "disabled", tools: [], at: now };
    }
    return statuses;
  }
  /** Everything the client needs to render the panel. */
  list() {
    const shadowedByWorkspace = /* @__PURE__ */ new Map();
    for (const item of this.plan.shadowed) {
      const list = shadowedByWorkspace.get(item.workspaceRoot) ?? [];
      list.push({ name: item.entry.name, reason: item.reason });
      shadowedByWorkspace.set(item.workspaceRoot, list);
    }
    const projects = this.state.workspaces.map((record) => {
      const document = this.projects.get(record.root) ?? emptyDocument();
      return {
        root: record.root,
        file: projectConfigFile(record.root),
        revision: revisionOf(projectConfigFile(record.root)),
        enabled: record.enabled !== false,
        exists: document.servers.length > 0,
        servers: document.servers,
        renamed: this.plan.renamed.filter((item) => item.scope === "project" && item.workspaceRoot === record.root).map((item) => ({ name: item.name, serverName: item.serverName })),
        shadowed: shadowedByWorkspace.get(record.root) ?? []
      };
    });
    const issues = [
      ...validateDocument(this.globalDoc),
      ...this.globalError === void 0 ? [] : [{ level: "blocking", path: "", code: "file-invalid", message: this.globalError }],
      ...this.sync.error === void 0 ? [] : [{ level: "warning", path: "", code: "patch-unsynced", message: this.sync.error }],
      ...this.plan.invalid.map((item) => ({
        level: "blocking",
        path: "",
        code: "name-invalid",
        message: `${item.name}: ${item.reason}`
      }))
    ];
    return {
      global: {
        file: globalConfigFile(),
        exists: this.globalDoc.servers.length > 0,
        servers: this.globalDoc.servers,
        revision: revisionOf(globalConfigFile())
      },
      projects,
      ...this.patchPath === void 0 ? {} : { patchFile: this.patchPath },
      names: this.plan.materialized.map((item) => ({
        scope: item.scope,
        ...item.workspaceRoot === void 0 ? {} : { workspaceRoot: item.workspaceRoot },
        name: item.entry.name,
        serverName: item.serverName
      })),
      status: this.statusSnapshot(),
      issues,
      sync: this.syncState(),
      externals: this.externals.map((item) => ({
        serverName: item.serverName,
        transport: item.entry.transport,
        command: item.entry.transport === "stdio" ? item.entry.command : item.entry.url
      }))
    };
  }
  syncState() {
    return { ...this.sync };
  }
  async dispose() {
  }
};

// src/host.ts
var name = "mcp-panel";
var inject = [];
var configSchema = Schema.object({
  version: Schema.natural().default(1),
  /**
   * Import `type: "sse"` entries as streamable-http instead of skipping them.
   * Off by default: the official client has no SSE transport (P0-verified).
   */
  allowSseAsHttp: Schema.boolean().default(false)
});
configSchema.meta.volatile = true;
var Config = configSchema;
function apply(ctx) {
  const log = (message) => {
    try {
      process.stderr.write(`dsh-mcp-panel: ${message}
`);
    } catch {
    }
  };
  const profile = ctx.get("profileContext");
  if (profile === void 0 || typeof profile.patchPath !== "string") {
    log("mcp-panel: no `profileContext` service, so the profile patch file is unknown; nothing can be made effective.");
  }
  const controller = new Controller({
    ...profile === void 0 ? {} : { patchPath: profile.patchPath },
    // The tools service's no-argument `schemas()` is documented as the global
    // view, which is exactly what the loader-registered entries land in.
    listTools: () => {
      const tools = ctx.get("tools");
      if (tools === void 0 || typeof tools.schemas !== "function") return [];
      try {
        return tools.schemas().map((schema) => schema.name);
      } catch {
        return [];
      }
    },
    log
  });
  ctx.effect(() => {
    void controller.refresh().catch((error) => {
      log(`mcp-panel: initial load failed: ${String(error)}`);
    });
    return () => {
      void controller.dispose();
    };
  }, "dsh-mcp-panel: reconcile");
  const onAgentCreated = ctx.on;
  onAgentCreated.call(ctx, "agent/created", ({ agent }) => {
    try {
      const cwd = agent.session?.header?.cwd;
      const denied = controller.denyToolsFor(cwd);
      if (denied.length > 0) {
        agent.ctx.tools.restrict({ deny: denied });
        log(`mcp-panel: hid ${denied.length} tool(s) from session ${agent.id} (${cwd ?? "no cwd"})`);
      }
    } catch (error) {
      log(`mcp-panel: could not scope ${agent.id}: ${String(error)}`);
    }
    return void 0;
  });
  ctx.inject(["webServer"], (scoped) => {
    const webServer = scoped.webServer;
    if (webServer === void 0) return;
    const routes = buildRoutes({
      controller,
      log,
      // Re-reading on every request keeps the panel honest after the user edits
      // the patch file by hand; the reconcile is idempotent and cheap.
      beforeRead: async (candidates) => {
        await controller.refresh(candidates ?? []);
      }
    });
    const disposers = routes.map((route) => webServer.register(route));
    return () => {
      for (const dispose of disposers) dispose();
    };
  });
}
export {
  API_PREFIX,
  CLIENT_PACKAGE,
  CONFIG_FILE_NAME,
  Config,
  Controller,
  DEFAULT_TOOL_TIMEOUT_MS,
  MAX_PROJECT_SERVERS,
  NAMESPACE_DIR,
  REGION_END,
  REGION_START,
  SERVER_NAME_PATTERN,
  TRANSPORTS,
  adoptFromPatch,
  apply,
  buildPatchedText,
  buildRoutes,
  canonicalPath,
  denyToolsFor,
  denyToolsFromPatch,
  dshHome,
  emptyDocument,
  emptyEntry,
  entryIdFor,
  envPlaceholder,
  exportDocument,
  findRegion,
  findWorkspace,
  globalConfigFile,
  hasBlocking,
  inject,
  name,
  parseDocument,
  planEntries,
  projectConfigFile,
  readDocument,
  readPatchFile,
  readState,
  registerWorkspace,
  renderManagedBlock,
  sanitizeError,
  serializeInFormat,
  sessionWorkspaceRoot,
  stateFile,
  toolPrefixOf,
  validateDocument,
  validateEntry,
  withSuffix,
  workspaceIdFromServerName,
  workspaceIdOf,
  writeDocument,
  writePatchFile,
  writeState
};

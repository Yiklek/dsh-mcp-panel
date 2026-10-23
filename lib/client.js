window.__ModuleLoader__.load({
  id: 'dsh-mcp-panel',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react2 = __toESM(require("react"), 1);

// src/client/style.ts
var PANEL_CSS = `
.mcp-root {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 1.5;
}
.mcp-head { display: flex; align-items: flex-start; gap: 12px; }
.mcp-head-text { flex: 1; min-width: 0; }
.mcp-title { font-size: 15px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.mcp-subtitle { margin-top: 2px; color: var(--dsw-alias-label-secondary); }
.mcp-actions { display: flex; gap: 8px; flex-shrink: 0; }

.mcp-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent; color: var(--dsw-alias-label-primary);
  font-size: 12px; cursor: pointer;
}
.mcp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mcp-btn:focus-visible { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 1px; }
.mcp-btn[disabled] { opacity: .5; cursor: default; }
.mcp-btn-primary {
  background: var(--dsw-alias-button-primary-fill);
  border-color: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
.mcp-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.mcp-btn-confirming { color: var(--dsw-alias-state-error-primary); font-weight: 600; }
.mcp-btn-danger:hover { background: var(--dsw-alias-interactive-bg-hover-danger); }
.mcp-btn-icon { padding: 4px 6px; }

.mcp-section { border: 1px solid var(--dsw-alias-border-l1); border-radius: var(--dsw-radius-md); overflow: hidden; }
.mcp-section-head {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; background: var(--dsw-alias-bg-layer-2);
  border-bottom: 1px solid var(--dsw-alias-border-l1);
}
.mcp-section-name { font-weight: 600; }
.mcp-section-note { color: var(--dsw-alias-label-tertiary); font-size: 12px; }
.mcp-section-path { margin-left: auto; color: var(--dsw-alias-label-caption); font-family: var(--dsw-font-mono); font-size: 11px; }
.mcp-section-body { background: var(--dsw-alias-bg-layer-1); }

.mcp-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.mcp-row:first-child { border-top: none; }
.mcp-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.mcp-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
.mcp-dot-connected { background: var(--dsw-alias-state-success-primary); }
.mcp-dot-connecting { background: var(--dsw-alias-state-warn-primary); }
.mcp-dot-failed { background: var(--dsw-alias-state-error-primary); }
.mcp-dot-disabled, .mcp-dot-inactive { background: var(--dsw-alias-label-tertiary); }
.mcp-row-main { flex: 1; min-width: 0; }
.mcp-row-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.mcp-row-name { font-family: var(--dsw-font-mono); font-weight: 600; }
.mcp-chip {
  padding: 0 6px; border-radius: var(--dsw-radius-xs);
  background: var(--dsw-alias-bg-layer-3); color: var(--dsw-alias-label-secondary); font-size: 11px;
}
.mcp-chip-warn { background: transparent; color: var(--dsw-alias-state-warn-primary); border: 1px solid var(--dsw-alias-state-warn-primary); }
.mcp-prefix { color: var(--dsw-alias-label-tertiary); font-family: var(--dsw-font-mono); font-size: 11px; }
.mcp-row-note { margin-top: 3px; color: var(--dsw-alias-state-warn-primary); }
.mcp-row-error { margin-top: 3px; color: var(--dsw-alias-state-error-primary); font-family: var(--dsw-font-mono); font-size: 11px; word-break: break-all; }
.mcp-row-tools { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
.mcp-row-actions { display: flex; gap: 6px; flex-shrink: 0; }

.mcp-empty { padding: 20px 12px; text-align: center; color: var(--dsw-alias-label-tertiary); }
.mcp-empty-hint { margin-top: 4px; font-size: 12px; }

.mcp-form { padding: 12px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2); }
.mcp-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
.mcp-label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.mcp-input, .mcp-select, .mcp-textarea {
  padding: 4px 8px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary);
  font-size: 13px; font-family: inherit; width: 100%; box-sizing: border-box;
}
.mcp-textarea { font-family: var(--dsw-font-mono); font-size: 12px; resize: vertical; }
.mcp-input:focus, .mcp-select:focus, .mcp-textarea:focus { outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color); outline-offset: 0; }
.mcp-hint { color: var(--dsw-alias-label-caption); font-size: 11px; }
.mcp-invalid { border-color: var(--dsw-alias-state-error-primary); }
.mcp-issue { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.mcp-issue-warn { color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
.mcp-form-actions { display: flex; gap: 8px; justify-content: flex-end; }
.mcp-kv-row { display: flex; gap: 6px; margin-bottom: 6px; }
.mcp-mono { font-family: var(--dsw-font-mono); }
.mcp-banner {
  padding: 8px 12px; border-radius: var(--dsw-radius-sm);
  border: 1px solid var(--dsw-alias-state-error-primary);
  color: var(--dsw-alias-state-error-primary);
}
.mcp-banner-warn { border-color: var(--dsw-alias-state-warn-primary); color: var(--dsw-alias-state-warn-primary); }
.mcp-loading { padding: 20px; color: var(--dsw-alias-label-tertiary); }
.mcp-banner-ok { border-color: var(--dsw-alias-state-success-primary); color: var(--dsw-alias-state-success-primary); }

.mcp-effective {
  border: 1px dashed var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  padding: 10px 12px;
  background: var(--dsw-alias-bg-layer-1);
}
.mcp-effective-title { font-weight: 600; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; }
.mcp-effective-line { display: flex; gap: 8px; align-items: baseline; margin-top: 3px; font-size: 12px; }
.mcp-effective-line .mcp-label { flex: 0 0 auto; }
.mcp-effective-note { color: var(--dsw-alias-state-warn-primary); }

.mcp-section-switch { margin-left: 8px; }
.mcp-section-foot { padding: 8px 12px; border-top: 1px solid var(--dsw-alias-border-l1); }
.mcp-add-ws { display: flex; justify-content: flex-start; }
.mcp-preview { border-top: 1px dashed var(--dsw-alias-border-l2); padding-top: 8px; margin-bottom: 8px; }
.mcp-check { flex-direction: row; align-items: center; gap: 6px; }
.mcp-row-inert { opacity: .75; }
.mcp-section-current { border-color: var(--dsw-alias-state-business-primary); }
.mcp-chip-current { color: var(--dsw-alias-state-business-primary); }
.mcp-tab-title { font-size: 12px; }

`;

// src/client/panel.tsx
var import_react = require("react");

// src/shared.ts
var API_PREFIX = "/api/yiklek/mcp";
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

// src/client/api.ts
async function request(path, init, options = {}) {
  const response = await fetch(`${API_PREFIX}/${path}`, {
    headers: init?.body === void 0 ? void 0 : { "content-type": "application/json" },
    cache: "no-store",
    ...init
  });
  const text = await response.text();
  let body;
  try {
    body = text === "" ? void 0 : JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response (HTTP ${response.status})`);
  }
  if (!response.ok) {
    if (options.returnBody === true && response.status < 500) return body;
    const message = body !== null && typeof body === "object" && "error" in body ? String(body.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}
var api = {
  list: (workspacePaths = []) => request(
    "list" + (workspacePaths.length === 0 ? "" : "?" + workspacePaths.filter((path) => path !== "").map((path) => "workspace=" + encodeURIComponent(path)).join("&"))
  ),
  status: () => request("status"),
  sync: () => request("sync"),
  save: (scope, servers, workspaceRoot, revision) => request(
    "save",
    {
      method: "POST",
      body: JSON.stringify({
        scope,
        servers,
        ...workspaceRoot === void 0 ? {} : { workspaceRoot },
        ...revision === void 0 ? {} : { revision }
      })
    },
    { returnBody: true }
  ),
  importPreview: (json, scope, workspaceRoot) => request("import", {
    method: "POST",
    body: JSON.stringify({ json, scope, ...workspaceRoot === void 0 ? {} : { workspaceRoot } })
  }),
  importCommit: (json, scope, workspaceRoot, allowSseAsHttp) => request(
    "import",
    {
      method: "POST",
      body: JSON.stringify({
        json,
        scope,
        commit: true,
        ...workspaceRoot === void 0 ? {} : { workspaceRoot },
        ...allowSseAsHttp === true ? { allowSseAsHttp: true } : {}
      })
    },
    { returnBody: true }
  ),
  exportConfig: (scope, workspaceRoot, redact = true) => request(
    `export?scope=${scope}&redact=${redact}${workspaceRoot === void 0 ? "" : `&workspace=${encodeURIComponent(workspaceRoot)}`}`
  ),
  setWorkspaceEnabled: (root, enabled) => request("workspace", { method: "POST", body: JSON.stringify({ root, enabled }) })
};

// src/client/panel.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function describeIssue(t, issue) {
  const key = `issue.${issue.code ?? ""}`;
  const translated = t(key, issue.params);
  return translated === key ? issue.message ?? "Invalid entry" : translated;
}
function KeyValueEditor({
  label,
  value,
  onChange,
  t
}) {
  const rows = Object.entries(value);
  const set = (index, key, val) => {
    const next = {};
    rows.forEach(([k, v], i) => {
      if (i === index) next[key] = val;
      else next[k] = v;
    });
    onChange(next);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: label }),
    rows.map(([key, val], index) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-kv-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "mcp-input mcp-mono",
          value: key,
          placeholder: t("field.key"),
          onChange: (event) => set(index, event.target.value, val)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "mcp-input mcp-mono",
          type: "password",
          value: val,
          placeholder: t("field.value"),
          onChange: (event) => set(index, key, event.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "mcp-btn mcp-btn-icon",
          onClick: () => onChange(Object.fromEntries(rows.filter((_, i) => i !== index))),
          children: "\xD7"
        }
      )
    ] }, `${key}-${index}`)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "mcp-btn", onClick: () => onChange({ ...value, "": "" }), children: [
      "+ ",
      t("field.addRow")
    ] })
  ] });
}
function EntryEditor({
  entry,
  onChange,
  onSave,
  onCancel,
  t
}) {
  const set = (key, value) => onChange({ ...entry, [key]: value });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-form", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("field.name") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "input",
        {
          className: "mcp-input mcp-mono",
          "aria-label": t("field.name"),
          value: entry.name,
          onChange: (e) => set("name", e.target.value)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-hint", children: t("field.nameHint") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("field.transport") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "select",
        {
          className: "mcp-select",
          "aria-label": t("field.transport"),
          value: entry.transport,
          onChange: (e) => set("transport", e.target.value),
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "stdio", children: t("field.transportStdio") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "streamable-http", children: t("field.transportHttp") })
          ]
        }
      )
    ] }),
    entry.transport === "stdio" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("field.command") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "mcp-input mcp-mono",
            "aria-label": t("field.command"),
            value: entry.command,
            onChange: (e) => set("command", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("field.args") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            className: "mcp-textarea",
            "aria-label": t("field.args"),
            rows: 3,
            value: entry.args.join("\n"),
            onChange: (e) => set(
              "args",
              e.target.value.split("\n").map((line) => line.trim()).filter((line) => line !== "")
            )
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(KeyValueEditor, { label: t("field.env"), value: entry.env, onChange: (next) => set("env", next), t }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("field.cwd") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "mcp-input mcp-mono",
            "aria-label": t("field.cwd"),
            value: entry.cwd,
            onChange: (e) => set("cwd", e.target.value)
          }
        )
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("field.url") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            className: "mcp-input mcp-mono",
            "aria-label": t("field.url"),
            value: entry.url,
            placeholder: "https://",
            onChange: (e) => set("url", e.target.value)
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        KeyValueEditor,
        {
          label: t("field.headers"),
          value: entry.headers,
          onChange: (next) => set("headers", next),
          t
        }
      )
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", onClick: onCancel, children: t("action.cancel") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn mcp-btn-primary", onClick: onSave, children: t("action.save") })
    ] })
  ] });
}
function Row({
  server,
  status,
  toolName,
  onToggle,
  onEdit,
  onRemove,
  onSwitch,
  confirmRemove,
  onArmRemove,
  t,
  busy,
  off
}) {
  const state = off === true ? "disabled" : status?.state ?? "connecting";
  const tools = status?.tools ?? [];
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row", "data-server": server.name, "data-state": state, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `mcp-dot mcp-dot-${state}` }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-main", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-line", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-row-name", children: server.name }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip", children: server.transport }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip", children: t(`status.${state}`) }),
        tools.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip", children: t("status.tools", { count: String(tools.length) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-prefix", children: `${toolPrefixOf(toolName ?? server.name)}*` })
      ] }),
      toolName !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-note", children: [
        "\u26A0 ",
        t("hint.renamed", { name: server.name, serverName: toolName })
      ] }),
      status?.error !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-row-error", children: status.error }),
      tools.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-row-tools", children: tools.map((tool) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip mcp-mono", children: tool }, tool)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-actions", children: [
      onSwitch !== void 0 && // A bare ● / ○ is announced as "button" and its meaning is invisible to
      // anyone not looking at the screen; carry the state in words as well.
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "mcp-btn",
          disabled: busy,
          "aria-pressed": off !== true,
          "aria-label": off === true ? t("ws.enable") : t("ws.disable"),
          title: off === true ? t("ws.enable") : t("ws.disable"),
          onClick: () => onSwitch(!(off ?? false)),
          children: off === true ? t("ws.off") : t("ws.on")
        }
      ),
      onToggle !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: "mcp-btn",
          disabled: busy,
          "aria-pressed": server.enabled !== false,
          "aria-label": server.enabled === false ? t("action.enable") : t("action.disable"),
          title: server.enabled === false ? t("action.enable") : t("action.disable"),
          onClick: onToggle,
          children: server.enabled === false ? t("ws.off") : t("ws.on")
        }
      ),
      onEdit !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", disabled: busy, onClick: onEdit, children: t("action.edit") }),
      onRemove !== void 0 && // Deleting drops the entry's env and headers with it, so it takes two
      // presses: the first only arms the button. A stray click used to be
      // enough to lose a server's configuration.
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "button",
        {
          type: "button",
          className: `mcp-btn mcp-btn-danger${confirmRemove === true ? " mcp-btn-confirming" : ""}`,
          disabled: busy,
          onClick: confirmRemove === true ? onRemove : onArmRemove,
          children: confirmRemove === true ? t("action.deleteConfirm") : t("action.delete")
        }
      )
    ] })
  ] });
}
function McpPanel({ density, t, workspaces = [], currentWorkspace, scope = "all" }) {
  const [data, setData] = (0, import_react.useState)(null);
  const [statuses, setStatuses] = (0, import_react.useState)({});
  const [sync, setSync] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const [notice, setNotice] = (0, import_react.useState)(null);
  const [editing, setEditing] = (0, import_react.useState)(null);
  const [picking, setPicking] = (0, import_react.useState)(false);
  const [dialog, setDialog] = (0, import_react.useState)("none");
  const [importText, setImportText] = (0, import_react.useState)("");
  const [importScope, setImportScope] = (0, import_react.useState)({ scope: "global" });
  const [preview, setPreview] = (0, import_react.useState)(null);
  const [exportText, setExportText] = (0, import_react.useState)("");
  const [redact, setRedact] = (0, import_react.useState)(true);
  const [exportOmitted, setExportOmitted] = (0, import_react.useState)({ disabled: 0, timeouts: 0 });
  const [exportScope, setExportScope] = (0, import_react.useState)({ scope: "global" });
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [armedRemove, setArmedRemove] = (0, import_react.useState)(null);
  const mounted = (0, import_react.useRef)(true);
  (0, import_react.useEffect)(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const knownKey = workspaces.map((item) => item.path).filter((path) => path !== "").sort().join("\n");
  const knownPaths = (0, import_react.useMemo)(() => knownKey === "" ? [] : knownKey.split("\n"), [knownKey]);
  const load = (0, import_react.useCallback)(async () => {
    try {
      const next = await api.list(knownPaths);
      if (!mounted.current) return;
      setData(next);
      setStatuses(next.status);
      setSync(next.sync ?? null);
      setError(null);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [knownPaths]);
  (0, import_react.useEffect)(() => {
    void load();
  }, [load]);
  const stillStarting = data === null || Object.values(statuses).some((status) => status.state === "connecting");
  (0, import_react.useEffect)(() => {
    if (!stillStarting) return;
    const timer = setInterval(async () => {
      try {
        const next = await api.status();
        if (mounted.current) setStatuses(next.status);
      } catch {
      }
    }, 2e3);
    return () => clearInterval(timer);
  }, [stillStarting]);
  const persist = (0, import_react.useCallback)(
    async (scope2, servers, workspaceRoot, message) => {
      setBusy(true);
      setNotice(null);
      const revision = scope2 === "global" ? data?.global.revision : data?.projects.find((project) => project.root === workspaceRoot)?.revision;
      try {
        const result = await api.save(scope2, servers, workspaceRoot, revision);
        if (result.ok) {
          setNotice(message);
          await load();
          return true;
        }
        if (result.conflict === true) {
          setError(t("error.conflict"));
          await load();
          return false;
        }
        setError((result.issues ?? []).map((i) => describeIssue(t, i)).join("; ") || t("error.saveRejected"));
        return false;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return false;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [data, load, t]
  );
  const submit = async () => {
    if (editing === null || data === null) return;
    const rows = editing.scope === "global" ? data.global.servers : data.projects.find((p) => p.root === editing.workspaceRoot)?.servers ?? [];
    const withoutOriginal = editing.original === null ? rows : rows.filter((row) => row.name !== editing.original);
    if (withoutOriginal.some((row) => row.name === editing.entry.name)) {
      setError(t("error.nameDuplicate", { name: editing.entry.name }));
      return;
    }
    const ok = await persist(editing.scope, [...withoutOriginal, editing.entry], editing.workspaceRoot, t("notice.saved"));
    if (ok) setEditing(null);
  };
  const runPreview = async () => {
    setError(null);
    setPreview(null);
    let parsed;
    try {
      parsed = JSON.parse(importText);
    } catch (cause) {
      setError(t("import.invalidJson") + ": " + String(cause instanceof Error ? cause.message : cause));
      return;
    }
    setBusy(true);
    try {
      const { preview: result } = await api.importPreview(parsed, importScope.scope, importScope.root);
      setPreview(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const commitImport = async () => {
    if (preview === null) return;
    setBusy(true);
    try {
      const parsed = JSON.parse(importText);
      const result = await api.importCommit(parsed, importScope.scope, importScope.root);
      if (result.ok) {
        setDialog("none");
        setPreview(null);
        setImportText("");
        setNotice(t("notice.imported"));
        await load();
      } else {
        setError((result.issues ?? []).map((i) => describeIssue(t, i)).join("; "));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const loadExport = async (scope2 = exportScope.scope, root = exportScope.root) => {
    setError(null);
    setBusy(true);
    try {
      const { export: result } = await api.exportConfig(scope2, root, redact);
      setExportText(result.text);
      setExportOmitted(result.omitted ?? { disabled: 0, timeouts: 0 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const switchWorkspace = async (root, enabled) => {
    setBusy(true);
    try {
      await api.setWorkspaceEnabled(root, enabled);
      await load();
      setNotice(enabled ? t("notice.wsEnabled") : t("notice.wsDisabled"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const blankProject = (root) => ({
    root,
    file: `${root}/.dsh/yiklek/mcp.json`,
    enabled: true,
    exists: false,
    servers: [],
    renamed: [],
    shadowed: []
  });
  const shownProjects = (0, import_react.useMemo)(() => {
    const projects = data?.projects ?? [];
    const editingRoot = editing?.scope === "project" ? editing.workspaceRoot : void 0;
    const withEditing = editingRoot === void 0 || projects.some((project) => project.root === editingRoot) ? projects : [
      {
        root: editingRoot,
        file: `${editingRoot}/.dsh/yiklek/mcp.json`,
        enabled: true,
        exists: false,
        servers: [],
        renamed: [],
        shadowed: []
      },
      ...projects
    ];
    if (currentWorkspace === void 0) return withEditing;
    const hasCurrent = withEditing.some((project) => project.root === currentWorkspace);
    if (scope === "session") {
      return hasCurrent ? withEditing.filter((project) => project.root === currentWorkspace) : [blankProject(currentWorkspace)];
    }
    return hasCurrent ? withEditing : [blankProject(currentWorkspace), ...withEditing];
  }, [scope, currentWorkspace, data?.projects, editing]);
  if (data === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `mcp-root mcp-${density}`, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-loading", children: error ?? t("meta.title") + "\u2026" }) });
  }
  const registered = new Set(data.projects.map((project) => project.root));
  const addable = workspaces.filter((workspace) => !registered.has(workspace.path));
  const alwaysOn = Object.values(statuses).some((s) => s.state === "connecting");
  const renderRows = (rows, scope2, root, renamed = [], off = false) => rows.map((server, index) => {
    const key = `${scope2}-${root ?? "g"}-${server.name}-${index}`;
    const toolName = renamed.find((r) => r.name === server.name)?.serverName;
    if (editing?.scope === scope2 && editing.original === server.name && editing.workspaceRoot === root) {
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Row, { server, status: statuses[server.name], t, busy: true, onToggle: () => {
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          EntryEditor,
          {
            entry: editing.entry,
            onChange: (next) => setEditing({ ...editing, entry: next }),
            onSave: () => void submit(),
            onCancel: () => setEditing(null),
            t
          }
        )
      ] }, key);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      Row,
      {
        server,
        status: statuses[toolName ?? server.name],
        off,
        ...toolName === void 0 ? {} : { toolName },
        onToggle: () => void persist(
          scope2,
          rows.map((row) => row.name === server.name ? { ...row, enabled: row.enabled === false } : row),
          root,
          t("notice.updated")
        ),
        onEdit: () => setEditing({ scope: scope2, ...root === void 0 ? {} : { workspaceRoot: root }, original: server.name, entry: { ...server } }),
        onArmRemove: () => setArmedRemove(key),
        confirmRemove: armedRemove === key,
        onRemove: () => {
          setArmedRemove(null);
          void persist(scope2, rows.filter((row) => row.name !== server.name), root, t("notice.deleted"));
        },
        t,
        busy
      },
      key
    );
  });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `mcp-root mcp-${density}`, "data-slot": "mcp-panel", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-head-text", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-title", children: t("title") }),
        density === "page" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-subtitle", children: t("subtitle") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", disabled: busy, onClick: () => {
          setDialog("import");
          setImportText("");
        }, children: t("action.import") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", disabled: busy, onClick: () => {
          setDialog("export");
          void loadExport();
        }, children: t("action.export") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "button",
          {
            type: "button",
            className: "mcp-btn mcp-btn-primary",
            disabled: busy,
            onClick: () => setEditing({ scope: "global", original: null, entry: emptyEntry() }),
            children: [
              "+ ",
              t("action.add")
            ]
          }
        )
      ] })
    ] }),
    error !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-banner", children: error }),
    notice !== null && error === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-banner mcp-banner-ok", children: notice }),
    sync?.error != null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-banner", children: sync.error }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "mcp-section", "data-scope": "global", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "mcp-section-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-name", children: t("section.global") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-note", children: t("section.globalNote") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-path", children: data.global.file })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-section-body", children: [
        data.global.servers.length === 0 && editing?.scope !== "global" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-empty", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: t("empty.global") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-empty-hint", children: t("empty.hint") })
        ] }),
        renderRows(data.global.servers, "global", void 0),
        editing?.scope === "global" && editing.original === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          EntryEditor,
          {
            entry: editing.entry,
            onChange: (next) => setEditing({ ...editing, entry: next }),
            onSave: () => void submit(),
            onCancel: () => setEditing(null),
            t
          }
        )
      ] })
    ] }),
    shownProjects.map((project) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "section",
      {
        className: `mcp-section${project.root === currentWorkspace ? " mcp-section-current" : ""}`,
        "data-scope": "project",
        "data-workspace": project.root,
        "data-current": project.root === currentWorkspace ? "true" : void 0,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "mcp-section-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-name", children: t("section.project") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-note", children: project.root }),
            project.root === currentWorkspace && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip mcp-chip-current", children: t("ws.current") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-path", children: project.enabled ? t("ws.on") : t("ws.off") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "mcp-btn mcp-section-switch",
                disabled: busy,
                onClick: () => void switchWorkspace(project.root, !project.enabled),
                children: project.enabled ? t("ws.disable") : t("ws.enable")
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-section-body", children: [
            project.enabled === false && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-empty", children: t("ws.offHint") }),
            (sync?.drift ?? []).filter((item) => item.root === project.root).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-row-note", children: t("drift.adopted", { message: item.message }) }, item.root + item.message)),
            project.enabled !== false && data.projects.length > 0 && project.servers.length === 0 && editing?.workspaceRoot !== project.root && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-empty", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: t("empty.project") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-empty-hint", children: t("empty.hint") })
            ] }),
            renderRows(project.servers, "project", project.root, project.renamed, project.enabled === false),
            project.shadowed.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row mcp-row-inert", "data-server": item.name, "data-state": "inactive", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-dot mcp-dot-inactive" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-main", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-line", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-row-name", children: item.name }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip", children: t("status.inactive") })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-note", children: [
                  "\u26A0 ",
                  t("hint.shadowedByGlobal", { name: item.name })
                ] })
              ] })
            ] }, project.root + item.name)),
            project.enabled !== false && editing?.scope === "project" && editing.workspaceRoot === project.root && editing.original === null && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              EntryEditor,
              {
                entry: editing.entry,
                onChange: (next) => setEditing({ ...editing, entry: next }),
                onSave: () => void submit(),
                onCancel: () => setEditing(null),
                t
              }
            ),
            project.enabled !== false && editing?.workspaceRoot !== project.root && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-section-foot", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                type: "button",
                className: "mcp-btn",
                disabled: busy,
                onClick: () => setEditing({ scope: "project", workspaceRoot: project.root, original: null, entry: emptyEntry() }),
                children: [
                  "+ ",
                  t("action.add")
                ]
              }
            ) })
          ] })
        ]
      },
      project.root
    )),
    addable.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-add-ws", children: picking ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-form", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("ws.pick") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "select",
          {
            className: "mcp-select",
            defaultValue: "",
            onChange: (event) => {
              const path = event.target.value;
              if (path === "") return;
              setPicking(false);
              setEditing({ scope: "project", workspaceRoot: path, original: null, entry: emptyEntry() });
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "\u2014" }),
              addable.map((workspace) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: workspace.path, children: [
                workspace.title,
                " \u2014 ",
                workspace.path
              ] }, workspace.path))
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", onClick: () => setPicking(false), children: t("action.cancel") }) })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "mcp-btn", disabled: busy, onClick: () => setPicking(true), children: [
      "+ ",
      t("ws.add")
    ] }) }),
    data.projects.length === 0 && addable.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-empty", children: t("ws.none") }),
    dialog === "import" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "section",
      {
        className: "mcp-section",
        "data-slot": "mcp-import",
        role: "dialog",
        "aria-label": t("import.title"),
        onKeyDown: (event) => {
          if (event.key === "Escape") setDialog("none");
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "mcp-section-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-name", children: t("import.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-note", children: t("import.hint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-section-body mcp-form", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("import.target") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  className: "mcp-select",
                  value: importScope.scope === "global" ? "global" : importScope.root ?? "",
                  onChange: (event) => {
                    const value = event.target.value;
                    setPreview(null);
                    setImportScope(value === "global" ? { scope: "global" } : { scope: "project", root: value });
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "global", children: t("section.global") }),
                    data.projects.map((project) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: project.root, children: [
                      t("section.project"),
                      " ",
                      project.root
                    ] }, project.root))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("import.paste") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "mcp-textarea",
                  rows: 8,
                  value: importText,
                  placeholder: t("import.placeholder"),
                  onChange: (event) => {
                    setImportText(event.target.value);
                    setPreview(null);
                  }
                }
              )
            ] }),
            preview !== null && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-preview", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-effective-line", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("import.format") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-mono", children: preview.format })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-effective-line", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("import.added") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: preview.added.length === 0 ? "\u2014" : preview.added.join(", ") })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-effective-line", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("import.replaced") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: preview.replaced.length === 0 ? "\u2014" : preview.replaced.join(", ") })
              ] }),
              preview.skipped.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-line mcp-effective-note", children: t("import.skippedLine", { name: item.name, reason: item.reason }) }, item.name + item.reason)),
              (preview.blocking ?? []).map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-line mcp-effective-note", children: t("import.blockedLine", { reason: item.message }) }, item.path + item.message))
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-form-actions", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", onClick: () => {
                setDialog("none");
                setPreview(null);
              }, children: t("action.cancel") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", disabled: busy || importText.trim() === "", onClick: () => void runPreview(), children: t("import.preview") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn mcp-btn-primary", disabled: busy || preview === null, onClick: () => void commitImport(), children: t("import.commit") })
            ] })
          ] })
        ]
      }
    ),
    dialog === "export" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "section",
      {
        className: "mcp-section",
        "data-slot": "mcp-export",
        role: "dialog",
        "aria-label": t("export.title"),
        onKeyDown: (event) => {
          if (event.key === "Escape") setDialog("none");
        },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "mcp-section-head", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-name", children: t("export.title") }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-note", children: t("export.hint") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-section-body mcp-form", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-field", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("import.target") }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  className: "mcp-select",
                  value: exportScope.scope === "global" ? "global" : exportScope.root ?? "",
                  onChange: (event) => {
                    const value = event.target.value;
                    setExportScope(value === "global" ? { scope: "global" } : { scope: "project", root: value });
                    void loadExport(value === "global" ? "global" : "project", value === "global" ? void 0 : value);
                  },
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "global", children: t("section.global") }),
                    data.projects.map((project) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: project.root, children: [
                      t("section.project"),
                      " ",
                      project.root
                    ] }, project.root))
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "mcp-field mcp-check", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: redact,
                  onChange: (event) => {
                    setRedact(event.target.checked);
                    void loadExport();
                  }
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("export.redact") })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { className: "mcp-textarea", rows: 10, readOnly: true, value: exportText }),
            (exportOmitted.disabled > 0 || exportOmitted.timeouts > 0) && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-line mcp-effective-note", children: t("export.omitted", {
              disabled: String(exportOmitted.disabled),
              timeouts: String(exportOmitted.timeouts)
            }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-form-actions", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "mcp-btn", onClick: () => setDialog("none"), children: t("action.close") }) })
          ] })
        ]
      }
    ),
    data.externals !== void 0 && data.externals.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "mcp-section", "data-slot": "mcp-externals", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("header", { className: "mcp-section-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-name", children: t("external.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-section-note", children: t("external.hint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-section-body", children: data.externals.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row mcp-row-inert", "data-server": item.serverName, "data-state": "connected", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-dot mcp-dot-connected" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-row-main", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-row-line", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-row-name", children: item.serverName }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-chip", children: item.transport }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-prefix", children: item.command })
        ] }) })
      ] }, item.serverName)) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { className: "mcp-effective", "data-slot": "mcp-effective", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-title", children: t("effective.title") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-effective-line", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("effective.patchFile") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-prefix", children: sync?.patchFile ?? "\u2014" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mcp-effective-line", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "mcp-label", children: t("effective.materialized") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: sync === null || sync.materialized.length === 0 ? t("effective.none") : sync.materialized.join(", ") })
      ] }),
      sync !== null && sync.adopted.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-line mcp-effective-note", children: t("effective.adopted", { names: sync.adopted.map((a) => a.name).join(", ") }) }),
      sync !== null && sync.skipped.map((item) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-line mcp-effective-note", children: t("effective.skipped", { name: item.name, reason: item.reason }) }, `${item.name}-${item.reason}`)),
      alwaysOn && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mcp-effective-line mcp-effective-note", children: t("effective.reloadHint") })
    ] })
  ] });
}

// locale/zh.json
var zh_default = {
  meta: {
    title: "MCP \u670D\u52A1\u5668",
    description: "\u96C6\u4E2D\u7BA1\u7406 DSH \u7684 MCP \u670D\u52A1\u5668\uFF1A\u5168\u5C40\uFF08DSH_HOME/yiklek/mcp.json\uFF09\u4E0E\u5DE5\u4F5C\u533A\u7EA7\uFF08<workspace>/.dsh/yiklek/mcp.json\uFF09\uFF0C\u652F\u6301\u4E3B\u6D41\u914D\u7F6E\u683C\u5F0F\u7684\u5BFC\u5165\u5BFC\u51FA\u3002"
  },
  title: "MCP \u670D\u52A1\u5668",
  subtitle: "\u8FDE\u63A5\u5916\u90E8 MCP \u670D\u52A1\u5668\uFF0C\u5176\u5DE5\u5177\u4F1A\u4EE5 mcp__<\u540D\u79F0>__<\u5DE5\u5177> \u7684\u5F62\u5F0F\u63D0\u4F9B\u7ED9\u6A21\u578B\u3002",
  section: {
    global: "\u5168\u5C40",
    project: "\u9879\u76EE",
    globalNote: "\u5BF9\u6240\u6709\u5DE5\u4F5C\u533A\u751F\u6548"
  },
  action: {
    add: "\u6DFB\u52A0",
    import: "\u5BFC\u5165",
    export: "\u5BFC\u51FA",
    edit: "\u7F16\u8F91",
    delete: "\u5220\u9664",
    save: "\u4FDD\u5B58",
    cancel: "\u53D6\u6D88",
    close: "\u5173\u95ED",
    deleteConfirm: "\u786E\u8BA4\u5220\u9664",
    enable: "\u542F\u7528",
    disable: "\u505C\u7528"
  },
  field: {
    name: "\u540D\u79F0",
    nameHint: "1\u201332 \u4E2A\u5B57\u7B26\uFF0C\u4EC5\u9650\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u4E0E\u8FDE\u5B57\u7B26",
    transport: "\u4F20\u8F93\u65B9\u5F0F",
    transportStdio: "\u672C\u5730\u8FDB\u7A0B\uFF08stdio\uFF09",
    transportHttp: "\u8FDC\u7A0B\u670D\u52A1\uFF08Streamable HTTP\uFF09",
    command: "\u547D\u4EE4",
    args: "\u53C2\u6570",
    env: "\u73AF\u5883\u53D8\u91CF",
    cwd: "\u5DE5\u4F5C\u76EE\u5F55",
    url: "\u5730\u5740",
    headers: "\u8BF7\u6C42\u5934",
    key: "\u952E",
    value: "\u503C",
    addRow: "\u6DFB\u52A0\u4E00\u9879"
  },
  status: {
    connected: "\u5DF2\u8FDE\u63A5",
    connecting: "\u8FDE\u63A5\u4E2D",
    failed: "\u8FDE\u63A5\u5931\u8D25",
    disabled: "\u5DF2\u505C\u7528",
    inactive: "\u672A\u751F\u6548",
    unknown: "\u672A\u77E5",
    tools: "{count} \u4E2A\u5DE5\u5177"
  },
  empty: {
    global: "\u8FD8\u6CA1\u6709\u5168\u5C40 MCP \u670D\u52A1\u5668",
    project: "\u5F53\u524D\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709 MCP \u670D\u52A1\u5668",
    hint: "\u6DFB\u52A0\u4E00\u4E2A\uFF0C\u6216\u4ECE\u5DF2\u6709\u914D\u7F6E\u5BFC\u5165"
  },
  hint: {
    renamed: "\u8BE5 server \u5728 profile \u91CC\u540D\u4E3A\u300C{serverName}\u300D\uFF0C\u56E0\u4E3A\u300C{name}\u300D\u5DF2\u88AB\u5360\u7528",
    shadowedByGlobal: "\u672A\u751F\u6548\uFF1A\u4E0E\u5168\u5C40\u7684 server\u300C{name}\u300D\u540C\u540D\uFF0C\u5168\u5C40\u7684\u5B9A\u4E49\u4F18\u5148\u3002\u8981\u542F\u7528\u6B64\u9879\uFF0C\u8BF7\u5148\u5220\u9664\u6216\u91CD\u547D\u540D\u5168\u5C40\u7684\u90A3\u4E00\u4E2A\u3002"
  },
  error: {
    nameDuplicate: "\u540C\u4E00\u6587\u4EF6\u5185\u540D\u79F0\u91CD\u590D\uFF1A{name}",
    conflict: "\u8FD9\u4EFD\u914D\u7F6E\u5728\u53E6\u4E00\u4E2A\u7A97\u53E3\u88AB\u6539\u8FC7\uFF0C\u5DF2\u91CD\u65B0\u8F7D\u5165\u3002\u8BF7\u786E\u8BA4\u540E\u518D\u4FDD\u5B58\u3002",
    saveRejected: "\u4FDD\u5B58\u88AB\u62D2\u7EDD"
  },
  notice: {
    saved: "\u5DF2\u4FDD\u5B58\u5E76\u751F\u6548",
    updated: "\u5DF2\u66F4\u65B0\u5E76\u751F\u6548",
    deleted: "\u5DF2\u5220\u9664\u5E76\u751F\u6548",
    wsEnabled: "\u5DE5\u4F5C\u533A\u5DF2\u542F\u7528\uFF0C\u6B63\u5728\u8FDE\u63A5\u2026",
    wsDisabled: "\u5DE5\u4F5C\u533A\u5DF2\u505C\u7528\uFF0C\u5176 MCP \u8FDB\u7A0B\u4E0D\u518D\u542F\u52A8",
    imported: "\u5BFC\u5165\u5B8C\u6210\u5E76\u5DF2\u751F\u6548"
  },
  effective: {
    title: "DSH \u5B9E\u9645\u52A0\u8F7D\u7684\u914D\u7F6E",
    patchFile: "\u914D\u7F6E\u6587\u4EF6",
    materialized: "\u5DF2\u5199\u5165",
    none: "\uFF08\u65E0\uFF09",
    adopted: "\u5DF2\u4ECE\u914D\u7F6E\u6587\u4EF6\u7EB3\u5165\uFF1A{names}",
    skipped: "{name}\uFF1A{reason}",
    reloadHint: "\u6709\u670D\u52A1\u5668\u5C1A\u672A\u8FDE\u4E0A\uFF1A\u82E5\u521A\u4FEE\u6539\u8FC7\uFF0C\u8BF7\u7A0D\u5019\u3002\u4ECD\u672A\u8FDE\u4E0A\u5C31\u5728\u9762\u677F\u91CC\u5173\u6389\u518D\u6253\u5F00\u8BE5 server\uFF0C\u4F1A\u91CD\u65B0\u53D1\u8D77\u8FDE\u63A5\u3002"
  },
  ws: {
    on: "\u5DF2\u542F\u7528",
    off: "\u5DF2\u505C\u7528",
    enable: "\u542F\u7528\u6B64\u5DE5\u4F5C\u533A",
    disable: "\u505C\u7528\u6B64\u5DE5\u4F5C\u533A",
    offHint: "\u6B64\u5DE5\u4F5C\u533A\u5DF2\u505C\u7528\uFF1A\u5B83\u7684 MCP \u670D\u52A1\u5668\u4E0D\u4F1A\u542F\u52A8\uFF0C\u4F1A\u8BDD\u91CC\u4E5F\u770B\u4E0D\u5230\u5B83\u4EEC\u3002",
    add: "\u6DFB\u52A0\u5DE5\u4F5C\u533A",
    pick: "\u9009\u62E9\u5DE5\u4F5C\u533A",
    none: "\u6CA1\u6709\u5DF2\u6CE8\u518C\u7684\u5DE5\u4F5C\u533A",
    current: "\u5F53\u524D\u4F1A\u8BDD"
  },
  import: {
    title: "\u5BFC\u5165 MCP \u914D\u7F6E",
    hint: "\u652F\u6301 Claude Desktop / Cursor / VS Code / DSH \u539F\u751F\u683C\u5F0F",
    target: "\u5BFC\u5165\u5230",
    paste: "\u7C98\u8D34\u914D\u7F6E\u5185\u5BB9",
    placeholder: '{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "\u2026"] } } }',
    format: "\u8BC6\u522B\u5230\u7684\u683C\u5F0F",
    added: "\u5C06\u65B0\u589E",
    replaced: "\u5C06\u8986\u76D6",
    skippedLine: "{name}\uFF1A{reason}",
    preview: "\u9884\u89C8",
    commit: "\u786E\u8BA4\u5BFC\u5165",
    invalidJson: "\u4E0D\u662F\u5408\u6CD5\u7684 JSON",
    blockedLine: "\u26A0 \u4F1A\u88AB\u62D2\u7EDD\uFF1A{reason}"
  },
  export: {
    title: "\u5BFC\u51FA MCP \u914D\u7F6E",
    hint: "Claude Desktop \u5F62\u72B6\uFF08mcpServers \u5BF9\u8C61\uFF09",
    redact: "\u8131\u654F\uFF08\u628A\u6240\u6709\u73AF\u5883\u53D8\u91CF\u548C\u8BF7\u6C42\u5934\u7684\u503C\u66FF\u6362\u4E3A ${env:KEY}\uFF0C\u53D6\u6D88\u52FE\u9009\u53EF\u5BFC\u51FA\u539F\u503C\u505A\u5907\u4EFD\uFF09",
    omitted: "\u6B64\u683C\u5F0F\u65E0\u6CD5\u643A\u5E26\uFF1A{disabled} \u4E2A\u505C\u7528\u7684 server\u3001{timeouts} \u4E2A\u8D85\u65F6\u8BBE\u7F6E \u2014\u2014 \u5BFC\u51FA\u518D\u5BFC\u5165\u4F1A\u4E22\u5931\u8FD9\u4E24\u9879"
  },
  drift: {
    adopted: "\u5DF2\u4ECE\u914D\u7F6E\u6587\u4EF6\u7EB3\u5165\uFF1A{message}"
  },
  external: {
    title: "\u5DF2\u5728 profile \u6587\u4EF6\u4E2D\u76F4\u63A5\u58F0\u660E",
    hint: "\u8FD9\u4E9B\u6761\u76EE\u5199\u5728 cordis.patch.yml \u91CC\uFF0C\u4E0D\u7531\u672C\u63D2\u4EF6\u7BA1\u7406\uFF1B\u5982\u9700\u7BA1\u7406\uFF0C\u8BF7\u628A\u5B83\u4EEC\u79FB\u5230 mcp.json \u540E\u4ECE patch \u6587\u4EF6\u5220\u9664"
  },
  shortcut: {
    noSession: "\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684\u4F1A\u8BDD"
  },
  issue: {
    "name-invalid": "\u540D\u79F0\u4E0D\u5408\u6CD5\uFF1A\u53EA\u80FD\u7528 1\u201332 \u4E2A\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u4E0B\u5212\u7EBF\u6216\u8FDE\u5B57\u7B26",
    "name-duplicate": "\u672C\u6587\u4EF6\u91CC\u6709\u91CD\u540D\uFF1A{name}",
    "transport-invalid": "\u4F20\u8F93\u65B9\u5F0F\u53EA\u80FD\u662F stdio \u6216 streamable-http",
    "command-required": "\u672C\u5730\u8FDB\u7A0B\u5FC5\u987B\u586B\u5199\u547D\u4EE4",
    "command-relative": "\u547D\u4EE4\u770B\u8D77\u6765\u662F\u76F8\u5BF9\u8DEF\u5F84\uFF1A{command}\uFF08\u5EFA\u8BAE\u7528\u7EDD\u5BF9\u8DEF\u5F84\u6216\u5168\u5C40\u547D\u4EE4\uFF09",
    "url-required": "\u8FDC\u7A0B\u670D\u52A1\u5FC5\u987B\u586B\u5199\u5730\u5740",
    "url-invalid": "\u5730\u5740\u5FC5\u987B\u4EE5 http:// \u6216 https:// \u5F00\u5934",
    "secret-inline": "\u300C{key}\u300D\u91CC\u4F3C\u4E4E\u6709\u660E\u6587\u5BC6\u94A5\uFF0C\u5EFA\u8BAE\u6539\u7528 ${env:{key}}",
    "timeout-odd": "\u8D85\u65F6\u65F6\u95F4\u770B\u8D77\u6765\u4E0D\u5BFB\u5E38\uFF1A{timeout} ms",
    "servers-invalid": "\u914D\u7F6E\u91CC\u7684 servers \u5FC5\u987B\u662F\u6570\u7EC4",
    "too-many-servers": "\u4E00\u4E2A\u5DE5\u4F5C\u533A\u6700\u591A {max} \u4E2A server\uFF08\u5F53\u524D {count} \u4E2A\uFF09\u3002\u6BCF\u4E2A\u9879\u76EE\u7EA7 server \u90FD\u4F1A\u5728\u6BCF\u6B21\u542F\u52A8\u65F6\u62C9\u8D77\u8FDB\u7A0B\u3002"
  }
};

// locale/en.json
var en_default = {
  meta: {
    title: "MCP servers",
    description: "Manage DSH MCP servers in one place: global (DSH_HOME/yiklek/mcp.json) and workspace-level (<workspace>/.dsh/yiklek/mcp.json), with import/export for the mainstream config shapes."
  },
  title: "MCP servers",
  subtitle: "Connect external MCP servers; their tools reach the model as mcp__<name>__<tool>.",
  section: {
    global: "Global",
    project: "Project",
    globalNote: "Applies to every workspace"
  },
  action: {
    add: "Add",
    import: "Import",
    export: "Export",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    deleteConfirm: "Confirm delete",
    enable: "Enable",
    disable: "Disable"
  },
  field: {
    name: "Name",
    nameHint: "1\u201332 characters: letters, digits, underscore and hyphen only",
    transport: "Transport",
    transportStdio: "Local process (stdio)",
    transportHttp: "Remote service (Streamable HTTP)",
    command: "Command",
    args: "Arguments",
    env: "Environment",
    cwd: "Working directory",
    url: "URL",
    headers: "Headers",
    key: "Key",
    value: "Value",
    addRow: "Add row"
  },
  status: {
    connected: "Connected",
    connecting: "Connecting",
    failed: "Failed",
    disabled: "Disabled",
    inactive: "Not in effect",
    unknown: "Unknown",
    tools: "{count} tools"
  },
  empty: {
    global: "No global MCP servers yet",
    project: "This workspace has no MCP servers yet",
    hint: "Add one, or import an existing configuration"
  },
  hint: {
    renamed: 'This server is "{serverName}" in the profile because "{name}" was already taken',
    shadowedByGlobal: 'Not in effect: a global server is also named "{name}", and the global definition wins. Delete or rename the global entry first.'
  },
  error: {
    nameDuplicate: "Duplicate name in the same file: {name}",
    conflict: "This configuration changed in another window. It has been reloaded; please review before saving again.",
    saveRejected: "Save rejected"
  },
  notice: {
    saved: "Saved and applied",
    updated: "Updated and applied",
    deleted: "Deleted and applied",
    wsEnabled: "Workspace enabled \u2014 connecting now\u2026",
    wsDisabled: "Workspace disabled; its MCP processes no longer start",
    imported: "Imported and applied"
  },
  effective: {
    title: "What DSH actually loads",
    patchFile: "Config file",
    materialized: "Written",
    none: "(none)",
    adopted: "Picked up from the config file: {names}",
    skipped: "{name}: {reason}",
    reloadHint: "Some servers are not connected yet: if you just changed something, wait a moment. If it stays down, toggle it off and on in the panel to retry \u2014 no restart needed."
  },
  ws: {
    on: "enabled",
    off: "disabled",
    enable: "Enable this workspace",
    disable: "Disable this workspace",
    offHint: "This workspace is switched off: its MCP servers do not start and its sessions cannot see them.",
    add: "Add workspace",
    pick: "Pick a workspace",
    none: "No workspace registered yet",
    current: "current session"
  },
  import: {
    title: "Import MCP configuration",
    hint: "Accepts Claude Desktop / Cursor / VS Code / DSH native",
    target: "Import into",
    paste: "Paste the configuration",
    placeholder: '{ "mcpServers": { "github": { "command": "npx", "args": ["-y", "\u2026"] } } }',
    format: "Detected format",
    added: "Will be added",
    replaced: "Will be replaced",
    skippedLine: "{name}: {reason}",
    preview: "Preview",
    commit: "Import",
    invalidJson: "Not valid JSON",
    blockedLine: "\u26A0 will be rejected: {reason}"
  },
  export: {
    title: "Export MCP configuration",
    hint: "Claude Desktop shape (an mcpServers object)",
    redact: "Redact (replace every env/header value with ${env:KEY}; clear this to export a full backup)",
    omitted: "This format cannot carry: {disabled} disabled server(s), {timeouts} timeout setting(s) \u2014 an export/import round trip loses both"
  },
  drift: {
    adopted: "Picked up from the config file: {message}"
  },
  external: {
    title: "Declared directly in the profile file",
    hint: "These entries live in cordis.patch.yml and are not managed here. To manage one, move it into mcp.json and remove it from the patch file."
  },
  shortcut: {
    noSession: "No session is open"
  },
  issue: {
    "name-invalid": "A name must be 1\u201332 letters, digits, underscore or hyphen",
    "name-duplicate": "Duplicate name in this file: {name}",
    "transport-invalid": "Transport must be stdio or streamable-http",
    "command-required": "A stdio server needs a command",
    "command-relative": "The command looks like a relative path: {command} (prefer an absolute path or a global command)",
    "url-required": "A streamable-http server needs a URL",
    "url-invalid": "The URL must start with http:// or https://",
    "secret-inline": '"{key}" looks like it contains a plaintext secret; prefer ${env:{key}}',
    "timeout-odd": "That timeout looks unusual: {timeout} ms",
    "servers-invalid": "`servers` must be an array",
    "too-many-servers": "A workspace may declare at most {max} servers (this one has {count}). Every project server spawns a process on every boot."
  }
};

// src/client.ts
var name = "mcp-panel";
var inject = ["slots", "locale", "sidebarRightTabs", "sidebarRight", "shortcuts"];
var BUNDLE_KEY = "dsh-mcp-panel";
var BUNDLE_CONFIG_SLOT = "plugins.bundle.config";
var LOCALE_NS = "mcpPanel";
var PANEL_ID = "mcp-panel";
var SIDEBAR_PANELLIST_SLOT = "sidebar.panellist";
var MAIN_SLOT = "main";
var CONVERSATION_VIEW_SLOT = "conversation.view";
var SESSION_HEADER_SLOT = "conversation.session.header.utilities";
var RIGHT_PANE_TAB_SLOT = "sidebar.right.pane.tab";
var RIGHT_PANE_TAB_TITLE_SLOT = "sidebar.right.pane.tab.title";
var TAB_TYPE_ID = "dsh-mcp-panel";
var LAST_WORKSPACE_KEY = "dsh-mcp-panel:last-workspace";
function lastWorkspace() {
  try {
    const value = globalThis.localStorage?.getItem(LAST_WORKSPACE_KEY);
    return typeof value === "string" && value !== "" ? value : void 0;
  } catch {
    return void 0;
  }
}
function useBridgedWorkspace() {
  const [value, setValue] = import_react2.default.useState(() => lastWorkspace());
  import_react2.default.useEffect(() => {
    const timer = setInterval(() => {
      const next = lastWorkspace();
      setValue((previous) => previous === next ? previous : next);
    }, 1500);
    return () => clearInterval(timer);
  }, []);
  return value;
}
function rememberWorkspace(path) {
  if (path === void 0 || path === "") return;
  try {
    if (globalThis.localStorage?.getItem(LAST_WORKSPACE_KEY) !== path) {
      globalThis.localStorage?.setItem(LAST_WORKSPACE_KEY, path);
    }
  } catch {
  }
}
var SHORTCUT_ID = "mcp-panel.open";
function flattenDictionary(source, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flattenDictionary(value, path));
    } else {
      out[path] = String(value);
    }
  }
  return out;
}
function dictionariesOf(source) {
  const { meta, ...rest } = source;
  const flat = flattenDictionary(rest);
  return meta === void 0 ? flat : { ...flat, meta };
}
function interpolate(text, params) {
  if (params === void 0) return text;
  return text.replace(/\{(\w+)\}/g, (_whole, key) => params[key] ?? `{${key}}`);
}
function apply(ctx) {
  const slots = ctx.get("slots");
  const locale = ctx.get("locale");
  const rightPane = ctx;
  if (slots === void 0) {
    ctx.logger?.warn?.("dsh-mcp-panel: the `slots` service is unavailable; the panel will not mount.");
    return;
  }
  ctx.effect(() => {
    locale?.register(LOCALE_NS, {
      zh: dictionariesOf(zh_default),
      en: dictionariesOf(en_default)
    });
    return () => {
    };
  }, "dsh-mcp-panel: dictionaries");
  ctx.effect(() => {
    const style = document.createElement("style");
    style.dataset.dshPlugin = "dsh-mcp-panel";
    style.textContent = PANEL_CSS;
    document.head.append(style);
    return () => style.remove();
  }, "dsh-mcp-panel: styles");
  const bound = locale?.bind(LOCALE_NS);
  const t = (key, params) => {
    const text = bound === void 0 ? key : bound(key, params);
    return interpolate(text, params);
  };
  const workspaceOption = (slotProps) => {
    try {
      const hook = slotProps?.useWorkspaces;
      if (typeof hook !== "function") return [];
      const picked = hook((snapshot) => snapshot.items ?? []);
      if (!Array.isArray(picked)) return [];
      return picked.filter((item) => typeof item?.path === "string" && item.path !== "").map((item) => ({ path: item.path, title: item.title ?? item.path }));
    } catch {
      return [];
    }
  };
  const currentWorkspaceOf = (slotProps) => {
    try {
      const sessionId = slotProps?.sessionId;
      const hook = slotProps?.useWorkspaces;
      if (typeof sessionId !== "string" || typeof hook !== "function") return void 0;
      const path = hook((snapshot) => {
        const item = (snapshot.items ?? []).find(
          (candidate) => Array.isArray(candidate.sessionIds) && candidate.sessionIds.includes(sessionId)
        );
        return item?.path;
      });
      return typeof path === "string" && path !== "" ? path : void 0;
    } catch {
      return void 0;
    }
  };
  const useRememberWorkspace = (path) => {
    import_react2.default.useEffect(() => {
      rememberWorkspace(path);
    }, [path]);
  };
  const seat = (options) => {
    const Component = (slotProps) => {
      const own = currentWorkspaceOf(slotProps);
      if (options.record === true) useRememberWorkspace(own);
      const bridged = useBridgedWorkspace();
      const current = own ?? bridged;
      return McpPanel({
        density: options.density,
        t,
        workspaces: workspaceOption(slotProps),
        scope: options.scope,
        ...current === void 0 ? {} : { currentWorkspace: current }
      });
    };
    return Component;
  };
  const PluginPage = seat({ density: "page", scope: "all" });
  const SidebarPage = seat({ density: "page", scope: "session" });
  const SessionView = seat({ density: "page", scope: "session", record: true });
  const RightPanePage = seat({ density: "panel", scope: "session", record: true });
  const RightPaneTitle = () => {
    const label = t("title");
    return import_react2.default.createElement("span", { className: "mcp-tab-title" }, label);
  };
  const PanelGlyph = ({ size = 16 }) => import_react2.default.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 16 16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.4,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true"
    },
    // A plug: two prongs over a cap, with a lead below.
    import_react2.default.createElement("path", { d: "M5.5 2v2.5M10.5 2v2.5" }),
    import_react2.default.createElement("path", { d: "M3.75 4.5h8.5v3.25a4.25 4.25 0 0 1-8.5 0z" }),
    import_react2.default.createElement("path", { d: "M8 11.75V14" })
  );
  ctx.effect(
    () => slots.inject(
      BUNDLE_CONFIG_SLOT,
      () => slots.register({ name: BUNDLE_CONFIG_SLOT, key: BUNDLE_KEY, locale: LOCALE_NS }, PluginPage)
    ),
    "dsh-mcp-panel: plugin page"
  );
  ctx.effect(
    () => slots.inject(
      SIDEBAR_PANELLIST_SLOT,
      () => slots.register(
        { name: SIDEBAR_PANELLIST_SLOT, id: PANEL_ID, order: 10, label: () => t("title"), locale: LOCALE_NS },
        PanelGlyph
      )
    ),
    "dsh-mcp-panel: sidebar icon"
  );
  ctx.effect(
    () => slots.inject(
      MAIN_SLOT,
      () => slots.register({ name: MAIN_SLOT, key: PANEL_ID, locale: LOCALE_NS }, SidebarPage)
    ),
    "dsh-mcp-panel: sidebar page"
  );
  ctx.effect(
    () => slots.inject(
      SESSION_HEADER_SLOT,
      () => slots.register(
        { name: SESSION_HEADER_SLOT, id: "mcp-panel-workspace", order: 90, label: () => t("title"), locale: LOCALE_NS },
        (slotProps) => {
          const current = currentWorkspaceOf(slotProps);
          useRememberWorkspace(current);
          return null;
        }
      )
    ),
    "dsh-mcp-panel: workspace bridge"
  );
  ctx.effect(() => {
    try {
      return rightPane.sidebarRightTabs.register({
        id: TAB_TYPE_ID,
        kind: PANEL_ID,
        priority: "builtin",
        title: () => t("title"),
        guide: [
          {
            id: TAB_TYPE_ID,
            commandId: SHORTCUT_ID,
            order: 30,
            title: () => t("title"),
            description: () => t("subtitle")
          }
        ]
      });
    } catch (error) {
      console.error("dsh-mcp-panel: right-pane tab type registration failed: " + String(error));
      return () => {
      };
    }
  }, "dsh-mcp-panel: right-pane tab type");
  ctx.effect(
    () => slots.inject(
      RIGHT_PANE_TAB_SLOT,
      () => slots.register({ name: RIGHT_PANE_TAB_SLOT, key: TAB_TYPE_ID, locale: LOCALE_NS }, RightPanePage)
    ),
    "dsh-mcp-panel: right-pane tab body"
  );
  ctx.effect(
    () => slots.inject(
      RIGHT_PANE_TAB_TITLE_SLOT,
      () => slots.register(
        { name: RIGHT_PANE_TAB_TITLE_SLOT, key: TAB_TYPE_ID, locale: LOCALE_NS },
        RightPaneTitle
      )
    ),
    "dsh-mcp-panel: right-pane tab title"
  );
  ctx.effect(() => {
    try {
      return rightPane.shortcuts.register({
        id: SHORTCUT_ID,
        label: () => t("title"),
        aliases: ["mcp", "mcp panel", "mcp servers"],
        defaults: {
          "desktop:macos": { code: "KeyM", modifiers: ["primary", "alt"] },
          "desktop:windows": { code: "KeyM", modifiers: ["primary", "alt"] },
          "desktop:linux": { code: "KeyM", modifiers: ["primary", "alt"] },
          "web:macos": { code: "KeyM", modifiers: ["primary", "alt"] },
          "web:windows": { code: "KeyM", modifiers: ["primary", "alt"] }
        },
        regions: ["page", "editable", "terminal"],
        modals: [],
        resolve: ({ target }) => {
          const tabTarget = rightPane.sidebarRight.commandTarget(target);
          if (tabTarget === void 0) return { status: "blocked", reason: t("shortcut.noSession") };
          return { status: "handled", run: () => rightPane.sidebarRight.openTabFromTarget(PANEL_ID, tabTarget) };
        }
      });
    } catch (error) {
      console.error("dsh-mcp-panel: open shortcut registration failed: " + String(error));
      return () => {
      };
    }
  }, "dsh-mcp-panel: open shortcut");
  ctx.effect(
    () => slots.inject(
      CONVERSATION_VIEW_SLOT,
      () => slots.register(
        { name: CONVERSATION_VIEW_SLOT, id: PANEL_ID, order: 20, label: () => t("title"), locale: LOCALE_NS },
        SessionView
      )
    ),
    "dsh-mcp-panel: session view tab"
  );
}

    return module.exports
  },
});

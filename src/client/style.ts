/**
 * Styles for the panel.
 *
 * Every colour, radius and shadow is a DSH design token (`--dsw-alias-*`,
 * `--dsw-radius-*`, `--dsw-elevation-*`). Nothing is hard-coded, so the panel
 * follows light/dark themes and any future re-skin of the shell for free.
 */
export const PANEL_CSS = `
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

`

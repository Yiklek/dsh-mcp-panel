/**
 * The configuration panel.
 *
 * One component serves every seat it is mounted into; only `density` differs.
 * Three separate implementations would drift immediately, because all three do
 * the same job: list, toggle, edit, delete.
 *
 * There are two kinds of section:
 *
 *   global   servers every session sees
 *   project  servers that only sessions born in that workspace see, and that can
 *            be switched off so their processes never start at all
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  emptyEntry,
  toolPrefixOf,
  type McpServerEntry,
  type ProjectView,
  type ServerStatus,
  type SyncState,
  type Transport,
} from '../shared.js'
import { api, type ImportPreviewView, type ListResponse } from './api.js'

export type Translate = (key: string, params?: Record<string, string>) => string

/**
 * Render a validation issue in the active language.
 *
 * `validate.ts` runs on the host, which has no locale, so its messages are
 * English. Mapping the stable `code` to a dictionary key keeps a Chinese UI from
 * switching to English at the first error, and falls back to the server's message
 * for any code without a translation.
 */
export function describeIssue(t: Translate, issue: { code?: string; message?: string; params?: Record<string, string> }): string {
  const key = `issue.${issue.code ?? ''}`
  const translated = t(key, issue.params)
  // A missing key comes back as the key itself.
  return translated === key ? (issue.message ?? 'Invalid entry') : translated
}

/** One workspace the shell knows about, for the picker. */
export interface WorkspaceOption {
  path: string
  title: string
}

export interface PanelProps {
  /** `page` gives the full frame; `panel` is the denser sidebar variant. */
  density: 'page' | 'panel'
  t: Translate
  /** Workspaces DSH knows about; the panel can register one of them. */
  workspaces?: WorkspaceOption[]
  /**
   * The workspace the surrounding session belongs to.
   *
   * Opening the panel from a session should already be about THAT workspace, not
   * ask the user to pick one they are sitting in.
   */
  currentWorkspace?: string
  /**
   * How much to show.
   *
   *   `all`      every workspace — the plugin page and the sidebar page
   *   `session`  the current workspace plus the global servers, because those are
   *              what actually runs for the session you are looking at
   */
  scope?: 'all' | 'session'
}

/** Editor state: which scope is being written, and the entry under edit. */
interface Editing {
  scope: 'global' | 'project'
  workspaceRoot?: string
  /** The name before the edit, so a rename replaces rather than duplicates. */
  original: string | null
  entry: McpServerEntry
}

function KeyValueEditor({
  label,
  value,
  onChange,
  t,
}: {
  label: string
  value: Record<string, string>
  onChange: (next: Record<string, string>) => void
  t: Translate
}) {
  const rows = Object.entries(value)
  const set = (index: number, key: string, val: string) => {
    const next: Record<string, string> = {}
    rows.forEach(([k, v], i) => {
      if (i === index) next[key] = val
      else next[k] = v
    })
    onChange(next)
  }
  return (
    <div className="mcp-field">
      <span className="mcp-label">{label}</span>
      {rows.map(([key, val], index) => (
        <div className="mcp-kv-row" key={`${key}-${index}`}>
          <input
            className="mcp-input mcp-mono"
            value={key}
            placeholder={t('field.key')}
            onChange={(event) => set(index, event.target.value, val)}
          />
          <input
            className="mcp-input mcp-mono"
            type="password"
            value={val}
            placeholder={t('field.value')}
            onChange={(event) => set(index, key, event.target.value)}
          />
          <button
            type="button"
            className="mcp-btn mcp-btn-icon"
            onClick={() => onChange(Object.fromEntries(rows.filter((_, i) => i !== index)))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="mcp-btn" onClick={() => onChange({ ...value, '': '' })}>
        + {t('field.addRow')}
      </button>
    </div>
  )
}

function EntryEditor({
  entry,
  onChange,
  onSave,
  onCancel,
  t,
}: {
  entry: McpServerEntry
  onChange: (next: McpServerEntry) => void
  onSave: () => void
  onCancel: () => void
  t: Translate
}) {
  const set = <K extends keyof McpServerEntry>(key: K, value: McpServerEntry[K]) =>
    onChange({ ...entry, [key]: value })

  return (
    <div className="mcp-form">
      <div className="mcp-field">
        <span className="mcp-label">{t('field.name')}</span>
        <input
          className="mcp-input mcp-mono"
          aria-label={t('field.name')}
          value={entry.name}
          onChange={(e) => set('name', e.target.value)}
        />
        <span className="mcp-hint">{t('field.nameHint')}</span>
      </div>

      <div className="mcp-field">
        <span className="mcp-label">{t('field.transport')}</span>
        <select
          className="mcp-select"
          aria-label={t('field.transport')}
          value={entry.transport}
          onChange={(e) => set('transport', e.target.value as Transport)}
        >
          <option value="stdio">{t('field.transportStdio')}</option>
          <option value="streamable-http">{t('field.transportHttp')}</option>
        </select>
      </div>

      {entry.transport === 'stdio' ? (
        <>
          <div className="mcp-field">
            <span className="mcp-label">{t('field.command')}</span>
            <input
              className="mcp-input mcp-mono"
              aria-label={t('field.command')}
              value={entry.command}
              onChange={(e) => set('command', e.target.value)}
            />
          </div>
          <div className="mcp-field">
            <span className="mcp-label">{t('field.args')}</span>
            <textarea
              className="mcp-textarea"
              aria-label={t('field.args')}
              rows={3}
              value={entry.args.join('\n')}
              onChange={(e) =>
                set(
                  'args',
                  e.target.value.split('\n').map((line) => line.trim()).filter((line) => line !== ''),
                )
              }
            />
          </div>
          <KeyValueEditor label={t('field.env')} value={entry.env} onChange={(next) => set('env', next)} t={t} />
          <div className="mcp-field">
            <span className="mcp-label">{t('field.cwd')}</span>
            <input
              className="mcp-input mcp-mono"
              aria-label={t('field.cwd')}
              value={entry.cwd}
              onChange={(e) => set('cwd', e.target.value)}
            />
          </div>
        </>
      ) : (
        <>
          <div className="mcp-field">
            <span className="mcp-label">{t('field.url')}</span>
            <input
              className="mcp-input mcp-mono"
              aria-label={t('field.url')}
              value={entry.url}
              placeholder="https://"
              onChange={(e) => set('url', e.target.value)}
            />
          </div>
          <KeyValueEditor
            label={t('field.headers')}
            value={entry.headers}
            onChange={(next) => set('headers', next)}
            t={t}
          />
        </>
      )}

      <div className="mcp-form-actions">
        <button type="button" className="mcp-btn" onClick={onCancel}>
          {t('action.cancel')}
        </button>
        <button type="button" className="mcp-btn mcp-btn-primary" onClick={onSave}>
          {t('action.save')}
        </button>
      </div>
    </div>
  )
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
  off,
}: {
  server: McpServerEntry
  status: ServerStatus | undefined
  /** The profile-level name when it differs from the local one. */
  toolName?: string
  onToggle?: () => void
  onEdit?: () => void
  onRemove?: () => void
  /** Second press of the delete button. Nothing is deleted on the first. */
  confirmRemove?: boolean
  onArmRemove?: () => void
  /** Per-workspace enable switch. */
  onSwitch?: (enabled: boolean) => void
  t: Translate
  busy: boolean
  off?: boolean
}) {
  const state: ServerStatus['state'] = off === true ? 'disabled' : (status?.state ?? 'connecting')
  const tools = status?.tools ?? []

  return (
    <div className="mcp-row" data-server={server.name} data-state={state}>
      <span className={`mcp-dot mcp-dot-${state}`} />
      <div className="mcp-row-main">
        <div className="mcp-row-line">
          <span className="mcp-row-name">{server.name}</span>
          <span className="mcp-chip">{server.transport}</span>
          <span className="mcp-chip">{t(`status.${state}`)}</span>
          {tools.length > 0 && (
            <span className="mcp-chip">{t('status.tools', { count: String(tools.length) })}</span>
          )}
          <span className="mcp-prefix">{`${toolPrefixOf(toolName ?? server.name)}*`}</span>
        </div>
        {toolName !== undefined && <div className="mcp-row-note">⚠ {t('hint.renamed', { name: server.name, serverName: toolName })}</div>}
        {status?.error !== undefined && <div className="mcp-row-error">{status.error}</div>}
        {tools.length > 0 && (
          <div className="mcp-row-tools">
            {tools.map((tool) => (
              <span className="mcp-chip mcp-mono" key={tool}>
                {tool}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mcp-row-actions">
        {onSwitch !== undefined && (
          // A bare ● / ○ is announced as "button" and its meaning is invisible to
          // anyone not looking at the screen; carry the state in words as well.
          <button
            type="button"
            className="mcp-btn"
            disabled={busy}
            aria-pressed={off !== true}
            aria-label={off === true ? t('ws.enable') : t('ws.disable')}
            title={off === true ? t('ws.enable') : t('ws.disable')}
            onClick={() => onSwitch(!(off ?? false))}
          >
            {off === true ? t('ws.off') : t('ws.on')}
          </button>
        )}
        {onToggle !== undefined && (
          <button
            type="button"
            className="mcp-btn"
            disabled={busy}
            aria-pressed={server.enabled !== false}
            aria-label={server.enabled === false ? t('action.enable') : t('action.disable')}
            title={server.enabled === false ? t('action.enable') : t('action.disable')}
            onClick={onToggle}
          >
            {server.enabled === false ? t('ws.off') : t('ws.on')}
          </button>
        )}
        {onEdit !== undefined && (
          <button type="button" className="mcp-btn" disabled={busy} onClick={onEdit}>
            {t('action.edit')}
          </button>
        )}
        {onRemove !== undefined && (
          // Deleting drops the entry's env and headers with it, so it takes two
          // presses: the first only arms the button. A stray click used to be
          // enough to lose a server's configuration.
          <button
            type="button"
            className={`mcp-btn mcp-btn-danger${confirmRemove === true ? ' mcp-btn-confirming' : ''}`}
            disabled={busy}
            onClick={confirmRemove === true ? onRemove : onArmRemove}
          >
            {confirmRemove === true ? t('action.deleteConfirm') : t('action.delete')}
          </button>
        )}
      </div>
    </div>
  )
}

export function McpPanel({ density, t, workspaces = [], currentWorkspace, scope = 'all' }: PanelProps) {
  const [data, setData] = useState<ListResponse | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const [sync, setSync] = useState<SyncState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [picking, setPicking] = useState(false)
  const [dialog, setDialog] = useState<'none' | 'import' | 'export'>('none')
  const [importText, setImportText] = useState('')
  const [importScope, setImportScope] = useState<{ scope: 'global' | 'project'; root?: string }>({ scope: 'global' })
  const [preview, setPreview] = useState<ImportPreviewView | null>(null)
  const [exportText, setExportText] = useState('')
  const [redact, setRedact] = useState(true)
  const [exportOmitted, setExportOmitted] = useState({ disabled: 0, timeouts: 0 })
  /**
   * Export has its OWN target. Sharing the import dialog's selection meant the
   * export silently depended on a choice made in a different dialog.
   */
  const [exportScope, setExportScope] = useState<{ scope: 'global' | 'project'; root?: string }>({ scope: 'global' })
  const [busy, setBusy] = useState(false)
  /** Key of the row whose delete is armed, cleared on any other interaction. */
  const [armedRemove, setArmedRemove] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * The paths have to reach the host on every read: it adopts a workspace whose
   * project config exists but was never registered.
   *
   * Depend on the CONTENT, not on the array. A parent re-render hands us a fresh
   * array every time, so `useMemo(..., [workspaces])` never held: that made `load`
   * a new callback on every render, which re-armed the effect below, which set
   * state, which rendered again — a fetch loop measured at ~1600 requests/second,
   * each one re-reading every config and re-parsing the profile patch file.
   */
  const knownKey = workspaces
    .map((item) => item.path)
    .filter((path) => path !== '')
    .sort()
    .join('\n')
  const knownPaths = useMemo(() => (knownKey === '' ? [] : knownKey.split('\n')), [knownKey])

  const load = useCallback(async () => {
    try {
      const next = await api.list(knownPaths)
      if (!mounted.current) return
      setData(next)
      setStatuses(next.status)
      // The reconciliation state rides along with the data so an adoption made
      // by this very read is visible; a second request would report nothing.
      setSync((next.sync as SyncState | undefined) ?? null)
      setError(null)
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [knownPaths])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while anything is still coming up; stop once every row is settled so an
  // idle panel makes no requests. The loader applies the patch asynchronously,
  // so "connecting" is expected for a moment after a save.
  const stillStarting =
    data === null || Object.values(statuses).some((status) => status.state === 'connecting')
  useEffect(() => {
    if (!stillStarting) return
    const timer = setInterval(async () => {
      try {
        const next = await api.status()
        if (mounted.current) setStatuses(next.status)
      } catch {
        /* a failed status poll is not worth surfacing */
      }
    }, 2000)
    return () => clearInterval(timer)
    // Booleans, not the objects: depending on `statuses` recreated the timer on
    // every poll, so the interval never survived its own tick.
  }, [stillStarting])

  const persist = useCallback(
    async (scope: 'global' | 'project', servers: McpServerEntry[], workspaceRoot: string | undefined, message: string) => {
      setBusy(true)
      setNotice(null)
      // The revision this seat read. Several seats can be open at once; without it
      // the later save silently discarded the other one's change.
      const revision =
        scope === 'global'
          ? data?.global.revision
          : data?.projects.find((project) => project.root === workspaceRoot)?.revision
      try {
        const result = await api.save(scope, servers, workspaceRoot, revision)
        if (result.ok) {
          setNotice(message)
          await load()
          return true
        }
        if (result.conflict === true) {
          setError(t('error.conflict'))
          await load()
          return false
        }
        setError((result.issues ?? []).map((i) => describeIssue(t, i)).join('; ') || t('error.saveRejected'))
        return false
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
        return false
      } finally {
        if (mounted.current) setBusy(false)
      }
    },
    [data, load, t],
  )

  const submit = async () => {
    if (editing === null || data === null) return
    const rows =
      editing.scope === 'global'
        ? data.global.servers
        : (data.projects.find((p) => p.root === editing.workspaceRoot)?.servers ?? [])
    const withoutOriginal = editing.original === null ? rows : rows.filter((row) => row.name !== editing.original)
    if (withoutOriginal.some((row) => row.name === editing.entry.name)) {
      setError(t('error.nameDuplicate', { name: editing.entry.name }))
      return
    }
    const ok = await persist(editing.scope, [...withoutOriginal, editing.entry], editing.workspaceRoot, t('notice.saved'))
    if (ok) setEditing(null)
  }

  const runPreview = async () => {
    setError(null)
    setPreview(null)
    let parsed: unknown
    try {
      parsed = JSON.parse(importText)
    } catch (cause) {
      setError(t('import.invalidJson') + ': ' + String(cause instanceof Error ? cause.message : cause))
      return
    }
    setBusy(true)
    try {
      const { preview: result } = await api.importPreview(parsed, importScope.scope, importScope.root)
      setPreview(result)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const commitImport = async () => {
    if (preview === null) return
    setBusy(true)
    try {
      const parsed = JSON.parse(importText)
      const result = await api.importCommit(parsed, importScope.scope, importScope.root)
      if (result.ok) {
        setDialog('none')
        setPreview(null)
        setImportText('')
        setNotice(t('notice.imported'))
        await load()
      } else {
        setError((result.issues ?? []).map((i) => describeIssue(t, i)).join('; '))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const loadExport = async (scope = exportScope.scope, root = exportScope.root) => {
    setError(null)
    setBusy(true)
    try {
      const { export: result } = await api.exportConfig(scope, root, redact)
      setExportText(result.text)
      setExportOmitted(result.omitted ?? { disabled: 0, timeouts: 0 })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const switchWorkspace = async (root: string, enabled: boolean) => {
    setBusy(true)
    try {
      await api.setWorkspaceEnabled(root, enabled)
      await load()
      setNotice(enabled ? t('notice.wsEnabled') : t('notice.wsDisabled'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  /**
   * The workspaces this seat shows.
   *
   * A session seat is about one workspace: `all` there would list servers that do
   * not run for the conversation on screen, which is exactly the confusing part
   * reported about the session tab.
   */
  /** A row for a workspace that has no config yet, so it is still reachable. */
  const blankProject = (root: string): ProjectView => ({
    root,
    file: `${root}/.dsh/yiklek/mcp.json`,
    enabled: true,
    exists: false,
    servers: [],
    renamed: [],
    shadowed: [],
  })

  const shownProjects = useMemo(() => {
    const projects = data?.projects ?? []

    // A workspace being edited but not registered yet has no row, and the editor
    // for a NEW server renders inside a row — so without this, choosing a
    // workspace in the picker produced no form at all: adding the first server to
    // a project was impossible from the UI.
    const editingRoot = editing?.scope === 'project' ? editing.workspaceRoot : undefined
    const withEditing =
      editingRoot === undefined || projects.some((project) => project.root === editingRoot)
        ? projects
        : [
            {
              root: editingRoot,
              file: `${editingRoot}/.dsh/yiklek/mcp.json`,
              enabled: true,
              exists: false,
              servers: [],
              renamed: [],
              shadowed: [],
            } satisfies ProjectView,
            ...projects,
          ]

    if (currentWorkspace === undefined) return withEditing
    const hasCurrent = withEditing.some((project) => project.root === currentWorkspace)

    if (scope === 'session') {
      // One workspace only. Never fall back to all of them: a session tab that
      // silently lists other workspaces' servers is the confusion this seat was
      // meant to remove.
      return hasCurrent
        ? withEditing.filter((project) => project.root === currentWorkspace)
        : [blankProject(currentWorkspace)]
    }

    // The root-scope seats list everything, but the workspace you are sitting in
    // must be there even before it has a config — otherwise opening the panel from
    // a session shows no trace of that session at all.
    return hasCurrent ? withEditing : [blankProject(currentWorkspace), ...withEditing]
  }, [scope, currentWorkspace, data?.projects, editing])

  if (data === null) {
    return (
      <div className={`mcp-root mcp-${density}`}>
        <div className="mcp-loading">{error ?? t('meta.title') + '…'}</div>
      </div>
    )
  }

  const registered = new Set(data.projects.map((project) => project.root))
  const addable = workspaces.filter((workspace) => !registered.has(workspace.path))
  const alwaysOn = Object.values(statuses).some((s) => s.state === 'connecting')

  const renderRows = (
    rows: McpServerEntry[],
    scope: 'global' | 'project',
    root: string | undefined,
    renamed: Array<{ name: string; serverName: string }> = [],
    off = false,
  ) =>
    rows.map((server, index) => {
      const key = `${scope}-${root ?? 'g'}-${server.name}-${index}`
      const toolName = renamed.find((r) => r.name === server.name)?.serverName
      if (editing?.scope === scope && editing.original === server.name && editing.workspaceRoot === root) {
        return (
          <div key={key}>
            <Row server={server} status={statuses[server.name]} t={t} busy onToggle={() => {}} />
            <EntryEditor
              entry={editing.entry}
              onChange={(next) => setEditing({ ...editing, entry: next })}
              onSave={() => void submit()}
              onCancel={() => setEditing(null)}
              t={t}
            />
          </div>
        )
      }
      return (
        <Row
          key={key}
          server={server}
          status={statuses[toolName ?? server.name]}
          off={off}
          {...(toolName === undefined ? {} : { toolName })}
          onToggle={() =>
            void persist(
              scope,
              rows.map((row) => (row.name === server.name ? { ...row, enabled: row.enabled === false } : row)),
              root,
              t('notice.updated'),
            )
          }
          onEdit={() => setEditing({ scope, ...(root === undefined ? {} : { workspaceRoot: root }), original: server.name, entry: { ...server } })}
          onArmRemove={() => setArmedRemove(key)}
          confirmRemove={armedRemove === key}
          onRemove={() => {
            setArmedRemove(null)
            void persist(scope, rows.filter((row) => row.name !== server.name), root, t('notice.deleted'))
          }}
          t={t}
          busy={busy}
        />
      )
    })

  return (
    <div className={`mcp-root mcp-${density}`} data-slot="mcp-panel">
      <div className="mcp-head">
        <div className="mcp-head-text">
          <div className="mcp-title">{t('title')}</div>
          {density === 'page' && <div className="mcp-subtitle">{t('subtitle')}</div>}
        </div>
        <div className="mcp-actions">
          <button type="button" className="mcp-btn" disabled={busy} onClick={() => { setDialog('import'); setImportText('') }}>
            {t('action.import')}
          </button>
          <button type="button" className="mcp-btn" disabled={busy} onClick={() => { setDialog('export'); void loadExport() }}>
            {t('action.export')}
          </button>
          <button
            type="button"
            className="mcp-btn mcp-btn-primary"
            disabled={busy}
            onClick={() => setEditing({ scope: 'global', original: null, entry: emptyEntry() })}
          >
            + {t('action.add')}
          </button>
        </div>
      </div>

      {error !== null && <div className="mcp-banner">{error}</div>}
      {notice !== null && error === null && <div className="mcp-banner mcp-banner-ok">{notice}</div>}
      {sync?.error != null && <div className="mcp-banner">{sync.error}</div>}

      <section className="mcp-section" data-scope="global">
        <header className="mcp-section-head">
          <span className="mcp-section-name">{t('section.global')}</span>
          <span className="mcp-section-note">{t('section.globalNote')}</span>
          <span className="mcp-section-path">{data.global.file}</span>
        </header>
        <div className="mcp-section-body">
          {data.global.servers.length === 0 && editing?.scope !== 'global' && (
            <div className="mcp-empty">
              <div>{t('empty.global')}</div>
              <div className="mcp-empty-hint">{t('empty.hint')}</div>
            </div>
          )}
          {renderRows(data.global.servers, 'global', undefined)}
          {editing?.scope === 'global' && editing.original === null && (
            <EntryEditor
              entry={editing.entry}
              onChange={(next) => setEditing({ ...editing, entry: next })}
              onSave={() => void submit()}
              onCancel={() => setEditing(null)}
              t={t}
            />
          )}
        </div>
      </section>

      {shownProjects.map((project: ProjectView) => (
        <section
          className={`mcp-section${project.root === currentWorkspace ? ' mcp-section-current' : ''}`}
          data-scope="project"
          data-workspace={project.root}
          data-current={project.root === currentWorkspace ? 'true' : undefined}
          key={project.root}
        >
          <header className="mcp-section-head">
            <span className="mcp-section-name">{t('section.project')}</span>
            <span className="mcp-section-note">{project.root}</span>
            {project.root === currentWorkspace && <span className="mcp-chip mcp-chip-current">{t('ws.current')}</span>}
            <span className="mcp-section-path">
              {project.enabled ? t('ws.on') : t('ws.off')}
            </span>
            <button
              type="button"
              className="mcp-btn mcp-section-switch"
              disabled={busy}
              onClick={() => void switchWorkspace(project.root, !project.enabled)}
            >
              {project.enabled ? t('ws.disable') : t('ws.enable')}
            </button>
          </header>
          <div className="mcp-section-body">
            {project.enabled === false && <div className="mcp-empty">{t('ws.offHint')}</div>}
            {(sync?.drift ?? [])
              .filter((item) => item.root === project.root)
              .map((item) => (
                <div className="mcp-row-note" key={item.root + item.message}>
                  {t('drift.adopted', { message: item.message })}
                </div>
              ))}
            {project.enabled !== false &&
              data.projects.length > 0 &&
              project.servers.length === 0 &&
              editing?.workspaceRoot !== project.root && (
                <div className="mcp-empty">
                  <div>{t('empty.project')}</div>
                  <div className="mcp-empty-hint">{t('empty.hint')}</div>
                </div>
              )}
            {renderRows(project.servers, 'project', project.root, project.renamed, project.enabled === false)}
            {project.shadowed.map((item) => (
              <div className="mcp-row mcp-row-inert" data-server={item.name} data-state="inactive" key={project.root + item.name}>
                <span className="mcp-dot mcp-dot-inactive" />
                <div className="mcp-row-main">
                  <div className="mcp-row-line">
                    <span className="mcp-row-name">{item.name}</span>
                    <span className="mcp-chip">{t('status.inactive')}</span>
                  </div>
                  <div className="mcp-row-note">⚠ {t('hint.shadowedByGlobal', { name: item.name })}</div>
                </div>
              </div>
            ))}
            {project.enabled !== false && editing?.scope === 'project' && editing.workspaceRoot === project.root && editing.original === null && (
              <EntryEditor
                entry={editing.entry}
                onChange={(next) => setEditing({ ...editing, entry: next })}
                onSave={() => void submit()}
                onCancel={() => setEditing(null)}
                t={t}
              />
            )}
            {project.enabled !== false && editing?.workspaceRoot !== project.root && (
              <div className="mcp-section-foot">
                <button
                  type="button"
                  className="mcp-btn"
                  disabled={busy}
                  onClick={() => setEditing({ scope: 'project', workspaceRoot: project.root, original: null, entry: emptyEntry() })}
                >
                  + {t('action.add')}
                </button>
              </div>
            )}
          </div>
        </section>
      ))}

      {addable.length > 0 && (
        <div className="mcp-add-ws">
          {picking ? (
            <div className="mcp-form">
              <div className="mcp-field">
                <span className="mcp-label">{t('ws.pick')}</span>
                <select
                  className="mcp-select"
                  defaultValue=""
                  onChange={(event) => {
                    const path = event.target.value
                    if (path === '') return
                    setPicking(false)
                    setEditing({ scope: 'project', workspaceRoot: path, original: null, entry: emptyEntry() })
                  }}
                >
                  <option value="">—</option>
                  {addable.map((workspace) => (
                    <option value={workspace.path} key={workspace.path}>
                      {workspace.title} — {workspace.path}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mcp-form-actions">
                <button type="button" className="mcp-btn" onClick={() => setPicking(false)}>
                  {t('action.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="mcp-btn" disabled={busy} onClick={() => setPicking(true)}>
              + {t('ws.add')}
            </button>
          )}
        </div>
      )}

      {data.projects.length === 0 && addable.length === 0 && (
        <div className="mcp-empty">{t('ws.none')}</div>
      )}

      {dialog === 'import' && (
        <section
          className="mcp-section"
          data-slot="mcp-import"
          role="dialog"
          aria-label={t('import.title')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDialog('none')
          }}
        >
          <header className="mcp-section-head">
            <span className="mcp-section-name">{t('import.title')}</span>
            <span className="mcp-section-note">{t('import.hint')}</span>
          </header>
          <div className="mcp-section-body mcp-form">
            <div className="mcp-field">
              <span className="mcp-label">{t('import.target')}</span>
              <select
                className="mcp-select"
                value={importScope.scope === 'global' ? 'global' : (importScope.root ?? '')}
                onChange={(event) => {
                  const value = event.target.value
                  setPreview(null)
                  setImportScope(value === 'global' ? { scope: 'global' } : { scope: 'project', root: value })
                }}
              >
                <option value="global">{t('section.global')}</option>
                {data.projects.map((project) => (
                  <option value={project.root} key={project.root}>
                    {t('section.project')} {project.root}
                  </option>
                ))}
              </select>
            </div>
            <div className="mcp-field">
              <span className="mcp-label">{t('import.paste')}</span>
              <textarea
                className="mcp-textarea"
                rows={8}
                value={importText}
                placeholder={t('import.placeholder')}
                onChange={(event) => {
                  setImportText(event.target.value)
                  setPreview(null)
                }}
              />
            </div>
            {preview !== null && (
              <div className="mcp-preview">
                <div className="mcp-effective-line">
                  <span className="mcp-label">{t('import.format')}</span>
                  <span className="mcp-mono">{preview.format}</span>
                </div>
                <div className="mcp-effective-line">
                  <span className="mcp-label">{t('import.added')}</span>
                  <span>{preview.added.length === 0 ? '—' : preview.added.join(', ')}</span>
                </div>
                <div className="mcp-effective-line">
                  <span className="mcp-label">{t('import.replaced')}</span>
                  <span>{preview.replaced.length === 0 ? '—' : preview.replaced.join(', ')}</span>
                </div>
                {preview.skipped.map((item) => (
                  <div className="mcp-effective-line mcp-effective-note" key={item.name + item.reason}>
                    {t('import.skippedLine', { name: item.name, reason: item.reason })}
                  </div>
                ))}
                {(preview.blocking ?? []).map((item) => (
                  <div className="mcp-effective-line mcp-effective-note" key={item.path + item.message}>
                    {t('import.blockedLine', { reason: item.message })}
                  </div>
                ))}
              </div>
            )}
            <div className="mcp-form-actions">
              <button type="button" className="mcp-btn" onClick={() => { setDialog('none'); setPreview(null) }}>
                {t('action.cancel')}
              </button>
              <button type="button" className="mcp-btn" disabled={busy || importText.trim() === ''} onClick={() => void runPreview()}>
                {t('import.preview')}
              </button>
              <button type="button" className="mcp-btn mcp-btn-primary" disabled={busy || preview === null} onClick={() => void commitImport()}>
                {t('import.commit')}
              </button>
            </div>
          </div>
        </section>
      )}

      {dialog === 'export' && (
        <section
          className="mcp-section"
          data-slot="mcp-export"
          role="dialog"
          aria-label={t('export.title')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setDialog('none')
          }}
        >
          <header className="mcp-section-head">
            <span className="mcp-section-name">{t('export.title')}</span>
            <span className="mcp-section-note">{t('export.hint')}</span>
          </header>
          <div className="mcp-section-body mcp-form">
            <div className="mcp-field">
              <span className="mcp-label">{t('import.target')}</span>
              <select
                className="mcp-select"
                value={exportScope.scope === 'global' ? 'global' : (exportScope.root ?? '')}
                onChange={(event) => {
                  const value = event.target.value
                  setExportScope(value === 'global' ? { scope: 'global' } : { scope: 'project', root: value })
                  void loadExport(value === 'global' ? 'global' : 'project', value === 'global' ? undefined : value)
                }}
              >
                <option value="global">{t('section.global')}</option>
                {data.projects.map((project) => (
                  <option value={project.root} key={project.root}>
                    {t('section.project')} {project.root}
                  </option>
                ))}
              </select>
            </div>
            <label className="mcp-field mcp-check">
              <input
                type="checkbox"
                checked={redact}
                onChange={(event) => {
                  setRedact(event.target.checked)
                  void loadExport()
                }}
              />
              <span className="mcp-label">{t('export.redact')}</span>
            </label>
            <textarea className="mcp-textarea" rows={10} readOnly value={exportText} />
            {(exportOmitted.disabled > 0 || exportOmitted.timeouts > 0) && (
              <div className="mcp-effective-line mcp-effective-note">
                {t('export.omitted', {
                  disabled: String(exportOmitted.disabled),
                  timeouts: String(exportOmitted.timeouts),
                })}
              </div>
            )}
            <div className="mcp-form-actions">
              <button type="button" className="mcp-btn" onClick={() => setDialog('none')}>
                {t('action.close')}
              </button>
            </div>
          </div>
        </section>
      )}

      {data.externals !== undefined && data.externals.length > 0 && (
        <section className="mcp-section" data-slot="mcp-externals">
          <header className="mcp-section-head">
            <span className="mcp-section-name">{t('external.title')}</span>
            <span className="mcp-section-note">{t('external.hint')}</span>
          </header>
          <div className="mcp-section-body">
            {data.externals.map((item) => (
              <div className="mcp-row mcp-row-inert" data-server={item.serverName} data-state="connected" key={item.serverName}>
                <span className="mcp-dot mcp-dot-connected" />
                <div className="mcp-row-main">
                  <div className="mcp-row-line">
                    <span className="mcp-row-name">{item.serverName}</span>
                    <span className="mcp-chip">{item.transport}</span>
                    <span className="mcp-prefix">{item.command}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* The effective surface. Without it the panel would look successful while
          the model still sees nothing, which is exactly the P1 trap. */}
      <section className="mcp-effective" data-slot="mcp-effective">
        <div className="mcp-effective-title">{t('effective.title')}</div>
        <div className="mcp-effective-line">
          <span className="mcp-label">{t('effective.patchFile')}</span>
          <span className="mcp-prefix">{sync?.patchFile ?? '—'}</span>
        </div>
        <div className="mcp-effective-line">
          <span className="mcp-label">{t('effective.materialized')}</span>
          <span>
            {sync === null || sync.materialized.length === 0 ? t('effective.none') : sync.materialized.join(', ')}
          </span>
        </div>
        {sync !== null && sync.adopted.length > 0 && (
          <div className="mcp-effective-line mcp-effective-note">
            {t('effective.adopted', { names: sync.adopted.map((a) => a.name).join(', ') })}
          </div>
        )}
        {sync !== null &&
          sync.skipped.map((item) => (
            <div className="mcp-effective-line mcp-effective-note" key={`${item.name}-${item.reason}`}>
              {t('effective.skipped', { name: item.name, reason: item.reason })}
            </div>
          ))}
        {alwaysOn && <div className="mcp-effective-line mcp-effective-note">{t('effective.reloadHint')}</div>}
      </section>
    </div>
  )
}

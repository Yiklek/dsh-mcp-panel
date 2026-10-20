/**
 * dsh-mcp-panel — browser half.
 *
 * Three seats, all rendering the same `McpPanel`:
 *
 *   plugins.bundle.config   this bundle's own page in the sidebar Plugins list
 *   sidebar.panellist+main  an icon in the global panel list and the page it opens
 *   conversation.view       a tab beside 对话 / 轨迹 on the session page
 *
 * They differ only in `density`, because three separate implementations would drift
 * apart the moment one of them changed.
 *
 * `inject` lists SERVICE names, not packages: the packages that must be loaded
 * first are declared in package.json under `dsh.client.inject`. Getting that
 * backwards leaves the plugin stuck in `pending (waiting for services: …)`.
 */
import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { PANEL_CSS } from './client/style.js'
import { McpPanel, type Translate, type WorkspaceOption } from './client/panel.js'
import zh from '../locale/zh.json'
import en from '../locale/en.json'

/** The slice of the shell's `WorkspaceView` this panel reads. */
interface WorkspaceViewLike {
  path: string
  title?: string
}

export const name = 'mcp-panel'
/**
 * Service names, not package names.
 *
 * The right-pane seat needs `sidebarRightTabs`/`sidebarRight`, reached the way the
 * shipped sidebar plugins reach them: the names are injected, so `ctx.<name>` is
 * available in the body. (Wrapping in `ctx.inject` and reading `scoped.get`
 * silently yielded undefined, which cost a long detour here.)
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'shortcuts']

/** Registry key for this bundle's page. Must equal the `name` in package.json. */
const BUNDLE_KEY = 'dsh-mcp-panel'
const BUNDLE_CONFIG_SLOT = 'plugins.bundle.config'
const LOCALE_NS = 'mcpPanel'

/** Our cell id in the sidebar list and the `main` dispatch. The two must match. */
const PANEL_ID = 'mcp-panel'
const SIDEBAR_PANELLIST_SLOT = 'sidebar.panellist'
const MAIN_SLOT = 'main'

/**
 * The view strip in the middle column — the row that holds 对话 / 轨迹.
 *
 * This is where a session-page tab belongs. The right pane
 * (`sidebar.right.pane.tab`) is the auxiliary column BESIDE the transcript, which
 * is a different place and was a wrong turn here.
 */
const CONVERSATION_VIEW_SLOT = 'conversation.view'
/**
 * A session-scope seat that is mounted whenever a session is on screen.
 *
 * The panel itself only mounts when its tab is selected, so the bridge needs a
 * seat that runs earlier — this one renders nothing and only records the
 * workspace.
 */
const SESSION_HEADER_SLOT = 'conversation.session.header.utilities'

/** The auxiliary column beside the transcript. A separate seat, restored on request. */
const RIGHT_PANE_TAB_SLOT = 'sidebar.right.pane.tab'
const RIGHT_PANE_TAB_TITLE_SLOT = 'sidebar.right.pane.tab.title'
/** The right pane names a tab type by its `id`, not by its kind. */
const TAB_TYPE_ID = 'dsh-mcp-panel'
/**
 * Where the session-scope seats record the workspace they belong to.
 *
 * A root-scope seat cannot ask the shell "which session is on screen": no client
 * service publishes that, and `sessions.scopeOf(rootCtx)` is undefined by design.
 * So the bridges run the other way — a session-scope seat writes down its
 * workspace, and the root-scope seats use it as their default.
 */
const LAST_WORKSPACE_KEY = 'dsh-mcp-panel:last-workspace'

/** Read the bridged workspace, if a session has reported one. */
function lastWorkspace(): string | undefined {
  try {
    const value = globalThis.localStorage?.getItem(LAST_WORKSPACE_KEY)
    return typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * The bridged workspace, kept current while a root-scope seat is mounted.
 *
 * A root-scope seat cannot ask the shell which session is on screen, so it reads
 * what a session-scope seat recorded. Polling is deliberate: the record changes
 * when the user switches sessions, and there is no event a root-scope plugin can
 * subscribe to for it.
 */
function useBridgedWorkspace(): string | undefined {
  const [value, setValue] = React.useState<string | undefined>(() => lastWorkspace())
  React.useEffect(() => {
    const timer = setInterval(() => {
      const next = lastWorkspace()
      setValue((previous) => (previous === next ? previous : next))
    }, 1500)
    return () => clearInterval(timer)
  }, [])
  return value
}

/** Record the workspace of the session now on screen. Idempotent and cheap. */
function rememberWorkspace(path: string | undefined): void {
  if (path === undefined || path === '') return
  try {
    if (globalThis.localStorage?.getItem(LAST_WORKSPACE_KEY) !== path) {
      globalThis.localStorage?.setItem(LAST_WORKSPACE_KEY, path)
    }
  } catch {
    /* storage unavailable */
  }
}

/** The shortcut that opens the right-pane tab; the guide entry shows it. */
const SHORTCUT_ID = 'mcp-panel.open'

interface LocaleService {
  register(namespace: string, dictionaries: Record<string, Record<string, unknown>>): () => void
  bind(namespace: string): (key: string, params?: Record<string, string>) => string
}

/**
 * The right pane's faces, contributed by another package.
 *
 * They are not in the base client `Context` type, so the shapes live here and the
 * context is narrowed once.
 */
interface RightPaneFaces {
  sidebarRightTabs: {
    register(definition: {
      id: string
      kind: string
      priority?: 'extension' | 'builtin' | 'fallback'
      title: () => string
      guide?: ReadonlyArray<{
        id: string
        commandId?: string
        order: number
        title: () => string
        description?: () => string
      }>
    }): () => void
  }
  sidebarRight: {
    openTab(kind: string, options?: unknown): void
    commandTarget(element: unknown): unknown
    openTabFromTarget(kind: string, target: unknown): void
  }
  shortcuts: {
    register(definition: {
      id: string
      label: () => string
      aliases?: readonly string[]
      defaults: Record<string, { code: string; modifiers: readonly string[] }>
      regions: readonly string[]
      modals: readonly unknown[]
      resolve: (context: { target: unknown }) =>
        | { status: 'blocked'; reason: string }
        | { status: 'handled'; run: () => void }
    }): () => void
  }
}

/** The slice of the slot service used here. */
interface SlotsService {
  inject(key: string, callback: () => () => void): () => void
  register(
    options: {
      name: string
      /** `keyed` slots dispatch by this. */
      key?: string
      /** `list` slots address entries by this. */
      id?: string
      order?: number
      label?: string | (() => string)
      locale?: string
    },
    component: (props: Record<string, unknown>) => unknown,
  ): () => void
}

/** Flatten a nested dictionary: DSH looks keys up flat (`section.global`). */
function flattenDictionary(source: Record<string, unknown>, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flattenDictionary(value as Record<string, unknown>, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

/** `meta` stays nested; everything else is flattened. */
function dictionariesOf(source: Record<string, unknown>): Record<string, unknown> {
  const { meta, ...rest } = source as { meta?: unknown } & Record<string, unknown>
  const flat = flattenDictionary(rest)
  return meta === undefined ? flat : { ...flat, meta }
}

/** Interpolate `{name}` placeholders, for services whose `t` does not. */
function interpolate(text: string, params?: Record<string, string>): string {
  if (params === undefined) return text
  return text.replace(/\{(\w+)\}/g, (_whole, key: string) => params[key] ?? `{${key}}`)
}

export function apply(ctx: Context): void {
  const slots = ctx.get('slots') as unknown as SlotsService | undefined
  const locale = ctx.get('locale') as unknown as LocaleService | undefined

  const rightPane = ctx as unknown as RightPaneFaces

  if (slots === undefined) {
    ctx.logger?.warn?.('dsh-mcp-panel: the `slots` service is unavailable; the panel will not mount.')
    return
  }

  ctx.effect(() => {
    locale?.register(LOCALE_NS, {
      zh: dictionariesOf(zh as unknown as Record<string, unknown>),
      en: dictionariesOf(en as unknown as Record<string, unknown>),
    })
    return () => {}
  }, 'dsh-mcp-panel: dictionaries')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshPlugin = 'dsh-mcp-panel'
    style.textContent = PANEL_CSS
    document.head.append(style)
    return () => style.remove()
  }, 'dsh-mcp-panel: styles')

  const bound = locale?.bind(LOCALE_NS)
  const t: Translate = (key, params) => {
    const text = bound === undefined ? key : bound(key, params)
    // A missing key comes back as the key itself; interpolate either way so a
    // partially-translated dictionary still renders readable values.
    return interpolate(text, params)
  }

  /**
   * The workspaces DSH knows about, for the project picker.
   *
   * `useWorkspaces` is a hook, so it has to be called inside a component — hence
   * this helper rather than reading it at register time. It is optional: without
   * it the panel still lists and edits everything already registered.
   */
  const workspaceOption = (slotProps: {
    useWorkspaces?: (selector?: (snapshot: { items?: WorkspaceViewLike[] }) => unknown) => unknown
  }): WorkspaceOption[] => {
    try {
      const hook = slotProps?.useWorkspaces
      if (typeof hook !== 'function') return []
      const picked = hook((snapshot) => snapshot.items ?? [])
      if (!Array.isArray(picked)) return []
      return (picked as WorkspaceViewLike[])
        .filter((item) => typeof item?.path === 'string' && item.path !== '')
        .map((item) => ({ path: item.path, title: item.title ?? item.path }))
    } catch {
      /* the picker is a convenience; without it the panel still works */
      return []
    }
  }

  /**
   * The workspace the current session belongs to.
   *
   * The seat hands us `sessionId` directly (it is a standard prop of
   * `conversation.view`), and `useWorkspaces` records which sessions belong to
   * which Workspace — so no snapshot-shape guessing is involved.
   */
  const currentWorkspaceOf = (slotProps: {
    sessionId?: unknown
    useWorkspaces?: (selector?: (snapshot: { items?: WorkspaceViewLike[] }) => unknown) => unknown
  }): string | undefined => {
    try {
      const sessionId = slotProps?.sessionId
      const hook = slotProps?.useWorkspaces
      if (typeof sessionId !== 'string' || typeof hook !== 'function') return undefined
      const path = hook((snapshot) => {
        const item = (snapshot.items ?? []).find((candidate) =>
          Array.isArray((candidate as { sessionIds?: unknown[] }).sessionIds) &&
          ((candidate as { sessionIds?: unknown[] }).sessionIds as unknown[]).includes(sessionId),
        )
        return item?.path
      })
      return typeof path === 'string' && path !== '' ? path : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Record a bridged value after the render commits.
   *
   * This used to write during render, which concurrent rendering may discard —
   * the write would then describe a state the user never saw. An effect runs only
   * for committed renders.
   */
  const useRememberWorkspace = (path: string | undefined): void => {
    React.useEffect(() => {
      rememberWorkspace(path)
    }, [path])
  }

  /**
   * The plugin page: every workspace. This is the management surface — the one
   * place where you see and edit all of them.
   */
  /**
   * One seat's component.
   *
   * The four seats differ only in density and scope; writing them out four times
   * invited exactly the drift that produced the "sidebar shows two projects"
   * bug (one seat kept `scope: 'all'` after the others moved on).
   */
  const seat = (options: { density: 'page' | 'panel'; scope: 'all' | 'session'; record?: boolean }) => {
    const Component = (slotProps: Parameters<typeof workspaceOption>[0]) => {
      const own = currentWorkspaceOf(slotProps as Parameters<typeof currentWorkspaceOf>[0])
      if (options.record === true) useRememberWorkspace(own)
      // A root-scope seat cannot ask the shell which session is on screen, so it
      // falls back to what a session-scope seat recorded.
      const bridged = useBridgedWorkspace()
      const current = own ?? bridged
      return McpPanel({
        density: options.density,
        t,
        workspaces: workspaceOption(slotProps),
        scope: options.scope,
        ...(current === undefined ? {} : { currentWorkspace: current }),
      })
    }
    return Component
  }

  /** Every workspace: the management surface. */
  const PluginPage = seat({ density: 'page', scope: 'all' })
  /** The workspace you are working in, plus the global servers. */
  const SidebarPage = seat({ density: 'page', scope: 'session' })
  const SessionView = seat({ density: 'page', scope: 'session', record: true })
  const RightPanePage = seat({ density: 'panel', scope: 'session', record: true })

  const RightPaneTitle = () => {
    const label = t('title')
    return React.createElement('span', { className: 'mcp-tab-title' }, label)
  }

  /**
   * The sidebar glyph — and ONLY the glyph.
   *
   * The sidebar owner draws the row itself (button, tooltip, label) and calls
   * `renderSlot('sidebar.panellist', { size, active }, { only: id })` for the icon
   * inside it. Registering the panel here once put the whole panel inside the
   * narrow sidebar column instead of the main area.
   */
  const PanelGlyph = ({ size = 16 }: { size?: number; active?: boolean }) =>
    React.createElement(
      'svg',
      {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
      },
      // A plug: two prongs over a cap, with a lead below.
      React.createElement('path', { d: 'M5.5 2v2.5M10.5 2v2.5' }),
      React.createElement('path', { d: 'M3.75 4.5h8.5v3.25a4.25 4.25 0 0 1-8.5 0z' }),
      React.createElement('path', { d: 'M8 11.75V14' }),
    )

  // ① This bundle's page in the Plugins list, keyed by package name.
  ctx.effect(
    () =>
      slots.inject(BUNDLE_CONFIG_SLOT, () =>
        slots.register({ name: BUNDLE_CONFIG_SLOT, key: BUNDLE_KEY, locale: LOCALE_NS }, PluginPage),
      ),
    'dsh-mcp-panel: plugin page',
  )

  // ② An icon in the global panel list. A fresh id adds an entry beside the
  //    shipped ones; reusing a shipped id would REPLACE that occupant.
  ctx.effect(
    () =>
      slots.inject(SIDEBAR_PANELLIST_SLOT, () =>
        slots.register(
          { name: SIDEBAR_PANELLIST_SLOT, id: PANEL_ID, order: 10, label: () => t('title'), locale: LOCALE_NS },
          PanelGlyph,
        ),
      ),
    'dsh-mcp-panel: sidebar icon',
  )

  //    …and the page that icon selects. `main` dispatches by the icon's id.
  ctx.effect(
    () =>
      slots.inject(MAIN_SLOT, () =>
        slots.register({ name: MAIN_SLOT, key: PANEL_ID, locale: LOCALE_NS }, SidebarPage),
      ),
    'dsh-mcp-panel: sidebar page',
  )

  // ③b The bridge: record this session's workspace so the root-scope seats (the
  //     sidebar page, the plugin page) can default to it. Renders nothing.
  ctx.effect(
    () =>
      slots.inject(SESSION_HEADER_SLOT, () =>
        slots.register(
          { name: SESSION_HEADER_SLOT, id: 'mcp-panel-workspace', order: 90, label: () => t('title'), locale: LOCALE_NS },
          (slotProps: Parameters<typeof workspaceOption>[0]) => {
            const current = currentWorkspaceOf(slotProps as Parameters<typeof currentWorkspaceOf>[0])
            useRememberWorkspace(current)
            return null
          },
        ),
      ),
    'dsh-mcp-panel: workspace bridge',
  )

  // ④ The right pane — the auxiliary column BESIDE the transcript. A separate
  //    seat from ③, not a replacement for it.
  //
  //    Two things are easy to get wrong here, both silent:
  //      · `sidebar.right.pane.tab` renders the CONTENT of a tab TYPE, and the key
  //        is that type's `id` — not its kind;
  //      · a definition needs `priority` and its guide entry needs `id` + `order`,
  //        or it is registered but never listed.
  //    Registration is one shot. If it throws, that is a bug and it must be
  //    visible — retrying would only hide it.
  ctx.effect(() => {
    try {
      return rightPane.sidebarRightTabs.register({
        id: TAB_TYPE_ID,
        kind: PANEL_ID,
        priority: 'builtin',
        title: () => t('title'),
        guide: [
          {
            id: TAB_TYPE_ID,
            commandId: SHORTCUT_ID,
            order: 30,
            title: () => t('title'),
            description: () => t('subtitle'),
          },
        ],
      })
    } catch (error) {
      console.error('dsh-mcp-panel: right-pane tab type registration failed: ' + String(error))
      return () => {}
    }
  }, 'dsh-mcp-panel: right-pane tab type')

  ctx.effect(
    () =>
      slots.inject(RIGHT_PANE_TAB_SLOT, () =>
        slots.register({ name: RIGHT_PANE_TAB_SLOT, key: TAB_TYPE_ID, locale: LOCALE_NS }, RightPanePage),
      ),
    'dsh-mcp-panel: right-pane tab body',
  )

  ctx.effect(
    () =>
      slots.inject(RIGHT_PANE_TAB_TITLE_SLOT, () =>
        slots.register(
          { name: RIGHT_PANE_TAB_TITLE_SLOT, key: TAB_TYPE_ID, locale: LOCALE_NS },
          RightPaneTitle,
        ),
      ),
    'dsh-mcp-panel: right-pane tab title',
  )

  //    A way to open it: the same shortcut shape the shipped sidebar plugins use.
  ctx.effect(() => {
    try {
      return rightPane.shortcuts.register({
        id: SHORTCUT_ID,
        label: () => t('title'),
        aliases: ['mcp', 'mcp panel', 'mcp servers'],
        defaults: {
          'desktop:macos': { code: 'KeyM', modifiers: ['primary', 'alt'] },
          'desktop:windows': { code: 'KeyM', modifiers: ['primary', 'alt'] },
          'desktop:linux': { code: 'KeyM', modifiers: ['primary', 'alt'] },
          'web:macos': { code: 'KeyM', modifiers: ['primary', 'alt'] },
          'web:windows': { code: 'KeyM', modifiers: ['primary', 'alt'] },
        },
        regions: ['page', 'editable', 'terminal'],
        modals: [],
          resolve: ({ target }) => {
            const tabTarget = rightPane.sidebarRight.commandTarget(target)
            if (tabTarget === undefined) return { status: 'blocked', reason: t('shortcut.noSession') }
            return { status: 'handled', run: () => rightPane.sidebarRight.openTabFromTarget(PANEL_ID, tabTarget) }
          },
        })
    } catch (error) {
      // Without this the shortcut silently vanishes and the guide entry loses its
      // hint; say so instead.
      console.error('dsh-mcp-panel: open shortcut registration failed: ' + String(error))
      return () => {}
    }
  }, 'dsh-mcp-panel: open shortcut')

  // ③ The session page's own tab: a third cell beside 对话 / 轨迹.
  //    A `list` slot with `{ id, order, label }`; the owner projects `label` into
  //    the tab and renders the component as the tab's content.
  ctx.effect(
    () =>
      slots.inject(CONVERSATION_VIEW_SLOT, () =>
        slots.register(
          { name: CONVERSATION_VIEW_SLOT, id: PANEL_ID, order: 20, label: () => t('title'), locale: LOCALE_NS },
          SessionView,
        ),
      ),
    'dsh-mcp-panel: session view tab',
  )
}

/**
 * Shared plumbing for the browser checks.
 *
 * Two things every run needs and neither is obvious:
 *
 *   1. **Dismiss the first-run dialog.** DSH puts a mask over the whole page
 *      ("开始使用 / 登录或添加 API Key") until it is closed, and the mask
 *      intercepts every click. It is closed with the `aria-label="关闭"` button,
 *      not with any of the named buttons in it.
 *   2. **Navigate to this bundle's page.** Sidebar -> 插件 -> dsh-mcp-panel.
 *
 * Locally the browser is Edge (`channel: 'msedge'`); CI has Playwright's own
 * Chromium, so no channel is passed there.
 */
import { chromium } from '@playwright/test'

export const channel = process.env.CI ? undefined : 'msedge'

export async function openPage() {
  const browser = await chromium.launch({ ...(channel === undefined ? {} : { channel }) })
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
  const url = process.env.DSH_TOKEN_URL
  if (url === undefined) throw new Error('DSH_TOKEN_URL is required (the ?token=… boot URL)')
  await page.goto(url, { waitUntil: 'commit', timeout: 30_000 })
  await page.waitForTimeout(2500)
  return { browser, page, errors }
}

export async function dismissFirstRun(page) {
  for (let round = 0; round < 6; round += 1) {
    let clicked = false
    const close = page.locator('[aria-label="关闭"]').first()
    if ((await close.count()) > 0) {
      await close.click({ timeout: 3000 }).catch(() => {})
      clicked = true
      await page.waitForTimeout(400)
    }
    for (const name of ['继续', '知道了', '稍后配置']) {
      const button = page.getByRole('button', { name, exact: true })
      if (await button.count()) {
        await button.first().click().catch(() => {})
        clicked = true
        await page.waitForTimeout(300)
      }
    }
    if (!clicked) break
  }
  await page.waitForTimeout(500)
}

/**
 * Open the panel.
 *
 * The sidebar icon is the primary route, not the Plugins list: the list page
 * fetches an online catalogue, and in a minimal profile it renders "could not
 * read all plugins" instead of the entries — so a CI run against a scratch
 * profile would fail there for a reason that has nothing to do with this plugin.
 */
export async function openPanel(page) {
  const icon = page.locator('[aria-label="MCP 服务器"]').first()
  if ((await icon.count()) === 0) {
    // Fall back to the Plugins list for profiles where the icon is absent.
    await page.getByText('插件', { exact: true }).first().click()
    await page.waitForTimeout(1200)
    await page.getByText('dsh-mcp-panel').first().click()
  } else {
    await icon.click()
  }
  await page.waitForTimeout(1800)
  await page.waitForSelector('[data-slot="mcp-panel"]', { timeout: 15_000 })
  return page.locator('.mcp-root')
}

/** @deprecated Use {@link openPanel}; kept so older checks keep working. */
export const openPluginPage = openPanel

/** Read the panel's rows: `{ server, state }` per row. */
export async function readRows(page) {
  return page.$$eval('.mcp-row', (rows) =>
    rows.map((row) => ({ server: row.getAttribute('data-server'), state: row.getAttribute('data-state') })),
  )
}

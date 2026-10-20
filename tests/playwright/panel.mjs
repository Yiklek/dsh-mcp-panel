/**
 * Browser check for the MCP panel.
 *
 * Runs against a LIVE dsh instance (`DSH_TOKEN_URL`), because the panel's whole
 * job is to talk to the host. Point `MCP_GLOBAL_FILE` at the profile's
 * `yiklek/mcp.json` to assert what actually reaches disk.
 *
 *   DSH_TOKEN_URL=… MCP_GLOBAL_FILE=… node tests/playwright/panel.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dismissFirstRun, openPanel, openPage, readRows } from './harness.mjs'

const FILE = process.env.MCP_GLOBAL_FILE
const results = []
const check = (label, ok, detail = '') => {
  results.push({ label, ok })
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? '  ' + detail : ''}`)
}
const fileNames = () =>
  FILE === undefined || !existsSync(FILE) ? [] : (JSON.parse(readFileSync(FILE, 'utf8')).servers ?? []).map((s) => s.name)

/** Count calls to this plugin's own API, per route. */
const requests = {}
const { browser, page, errors } = await openPage()
page.on('request', (request) => {
  const match = /\/api\/yiklek\/mcp\/([a-z]+)/.exec(request.url())
  if (match !== null) requests[match[1]] = (requests[match[1]] ?? 0) + 1
})
await dismissFirstRun(page)
const panel = await openPanel(page)

check('panel renders', (await panel.count()) > 0)

// Regression guard. The panel once fetched in a loop — ~1600 requests/second —
// because a callback depended on an array the parent rebuilt on every render.
// Nothing in the UI revealed it; only counting requests does.
{
  const before = requests.list ?? 0
  await page.waitForTimeout(6000)
  const grew = (requests.list ?? 0) - before
  check('an idle panel stops asking', grew <= 2, `${grew} /list calls in 6s while idle`)
}

// ── add ──
await panel.getByRole('button', { name: '+ 添加' }).first().click()
await page.waitForTimeout(400)
await page.locator('.mcp-form .mcp-input').first().fill('added-by-ui')
await page.locator('.mcp-form .mcp-input').nth(1).fill('node')
await page.locator('.mcp-form .mcp-textarea').fill('/tmp/x.mjs')
await panel.getByRole('button', { name: '保存' }).click()
await page.waitForTimeout(2500)
check('add reaches disk', FILE === undefined || fileNames().includes('added-by-ui'), JSON.stringify(fileNames()))
check('add appears in a row', (await readRows(page)).some((r) => r.server === 'added-by-ui'))

// ── validation ──
await panel.getByRole('button', { name: '+ 添加' }).first().click()
await page.waitForTimeout(300)
await page.locator('.mcp-form .mcp-input').first().fill('bad name!!')
await page.locator('.mcp-form .mcp-input').nth(1).fill('node')
await panel.getByRole('button', { name: '保存' }).click()
await page.waitForTimeout(1200)
check('invalid name rejected', (await panel.locator('.mcp-banner').count()) > 0)

// The host validates in English (it has no locale), so the panel maps the issue
// code to a dictionary key. Without that mapping a Chinese UI switches to English
// at the first error — and a template whose placeholder has no matching param
// prints `{name}` literally.
{
  const banner = (await panel.locator('.mcp-banner').first().innerText()).replace(/\s+/g, ' ')
  check(
    'the validation error is in the UI language',
    /名称|不合法|必须|只能/.test(banner) && !/\{\w+\}/.test(banner),
    banner.slice(0, 90),
  )
}
await panel.getByRole('button', { name: '取消' }).first().click()
await page.waitForTimeout(300)

// ── import preview + commit ──
await panel.getByRole('button', { name: '导入' }).first().click()
await page.waitForTimeout(400)
await page.locator('[data-slot="mcp-import"] .mcp-textarea').fill(
  JSON.stringify({ mcpServers: { imported: { command: 'npx', args: ['-y', 'some-server'] } } }),
)
await panel.getByRole('button', { name: '预览' }).click()
await page.waitForTimeout(1500)
const preview = await page.evaluate(() => document.querySelector('[data-slot="mcp-import"]')?.innerText ?? '')
check('import preview names the server', preview.includes('imported'), preview.replace(/\s+/g, ' ').slice(0, 120))
await panel.getByRole('button', { name: '确认导入' }).click()
await page.waitForTimeout(2500)
check('import reaches disk', FILE === undefined || fileNames().includes('imported'))

// ── export ──
await panel.getByRole('button', { name: '导出' }).first().click()
await page.waitForTimeout(1500)
const exported = await page.evaluate(() => document.querySelector('[data-slot="mcp-export"] textarea')?.value ?? '')
check('export emits an mcpServers object', exported.includes('mcpServers'), exported.slice(0, 80).replace(/\s+/g, ' '))
await panel.getByRole('button', { name: '关闭' }).first().click()
await page.waitForTimeout(300)

// ── project level ──
// The whole point of the plugin. The global path above exercises the simple case;
// this one exercises workspace registration, materialisation and the off switch.
// Writes into a real workspace, so it only runs when one is named explicitly:
// a test must not leave files in the user's project directories.
const PROJECT_ROOT = process.env.MCP_PROJECT_ROOT
if (PROJECT_ROOT === undefined) {
  console.log('  · skipping the project-level flow (set MCP_PROJECT_ROOT to include it)')
} else {
  const addWs = panel.getByRole('button', { name: '+ 添加工作区' })
  const hasWs = (await addWs.count()) > 0
  if (!hasWs) {
    check('project section available', false, 'no workspace to add in this profile')
  } else {
    await addWs.first().click()
    await page.waitForTimeout(500)
    const options = await page.locator('[data-slot="mcp-panel"] select option').evaluateAll((els) =>
      els
        .map((el) => ({ value: el.value, text: el.textContent ?? '' }))
        .filter((o) => o.value !== '' && o.value !== 'global' && o.value.startsWith(PROJECT_ROOT)),
    )
    check('a workspace can be chosen', options.length > 0, `${options.length} candidate(s)`)
    if (options.length > 0) {
      await page.locator('[data-slot="mcp-panel"] select').last().selectOption(options[0].value)
      await page.waitForTimeout(600)
      // The editor opens for that workspace; name the server and save.
      await page.locator('.mcp-form .mcp-input').first().fill('project-srv')
      await page.locator('.mcp-form .mcp-input').nth(1).fill('node')
      await page.locator('.mcp-form .mcp-textarea').fill('/tmp/p.mjs')
      await panel.getByRole('button', { name: '保存' }).click()
      await page.waitForTimeout(3000)

      const projectFile = `${options[0].value}/.dsh/yiklek/mcp.json`
      const onDisk = existsSync(projectFile)
        ? JSON.parse(readFileSync(projectFile, 'utf8')).servers.map((srv) => srv.name)
        : []
      check('a project server reaches its own file', onDisk.includes('project-srv'), projectFile + ' → ' + JSON.stringify(onDisk))

      // The effective surface must carry it under a workspace-scoped entry id.
      const patchText = existsSync(process.env.MCP_PATCH_FILE ?? '')
        ? readFileSync(process.env.MCP_PATCH_FILE, 'utf8')
        : ''
      if (patchText !== '') {
        check('the project entry is materialised', /mcp-panel-[0-9a-f]{8}--project-srv/.test(patchText))
      }

      // Switching the workspace off must remove it from the effective surface.
      const off = panel.getByRole('button', { name: '停用此工作区' }).first()
      if ((await off.count()) > 0) {
        await off.click()
        await page.waitForTimeout(3000)
        const after = existsSync(process.env.MCP_PATCH_FILE ?? '') ? readFileSync(process.env.MCP_PATCH_FILE, 'utf8') : ''
        check(
          'switching a workspace off removes its entries',
          after === '' || !/--project-srv/.test(after),
          after === ''
            ? '(no patch file captured — set MCP_PATCH_FILE)'
            : /--project-srv/.test(after)
              ? 'the entry is still materialised'
              : 'the entry is gone',
        )
      }
    }
  }
}

// ── delete ──
for (const name of ['added-by-ui', 'imported']) {
  const row = page.locator(`.mcp-row[data-server="${name}"]`)
  if ((await row.count()) === 0) continue
  // Deleting takes two presses; the first only arms the button.
  const remove = row.locator('.mcp-btn').last()
  await remove.click()
  await page.waitForTimeout(300)
  const armed = await remove.innerText()
  check(`delete needs confirmation (${name})`, /确认|Confirm/.test(armed), armed.trim())
  await remove.click()
  await page.waitForTimeout(2200)
}
check('delete removes both', FILE === undefined || (!fileNames().includes('added-by-ui') && !fileNames().includes('imported')), JSON.stringify(fileNames()))
// Accessibility: every interactive control must be nameable. A bare ● / ○ is
// announced as "button" and its meaning is invisible without sight.
{
  const nameless = await page.evaluate(() => {
    const root = document.querySelector('[data-slot="mcp-panel"]')
    if (!root) return ['(no panel)']
    return [...root.querySelectorAll('button, input, select, textarea')]
      .filter((el) => {
        const label = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()
        return label === ''
      })
      .map((el) => el.tagName + '.' + (el.className || '').toString().split(' ')[0])
  })
  check('every control has an accessible name', nameless.length === 0, JSON.stringify(nameless))
}

check('no console errors', errors.length === 0, errors.slice(0, 2).join(' | '))

const failed = results.filter((r) => !r.ok).length
console.log(`\n  ${results.length - failed}/${results.length} passed`)
await browser.close()
process.exit(failed === 0 ? 0 : 1)

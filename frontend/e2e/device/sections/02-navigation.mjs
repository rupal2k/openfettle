// Checklist 2: the Android back button, the largest system font, and the status bar in both themes.
import { back, sleep, shell, waitFor, appOnTop, screencap, statusBar } from '../lib/device.mjs'

// what the status bar looks like on screen: icons clearly darker (light theme) or lighter (dark) than its background
const bar = async () => { await sleep(800); return statusBar(screencap()) }

export default {
  id: '02-navigation', title: 'Navigation, back button, font size, status bar', fixture: 'trained',
  async run(t) {
    let { app, check } = t
    const p = app.page
    // back: top sheet first, then the route, then out of the app from Home
    await app.go('plan'); await app.go('stats')
    await app.tap(p.locator('.card', { hasText: 'Body weight' }).getByRole('button', { name: 'Log' }))
    const open = await app.sheets()
    back(); await waitFor(async () => !(await app.sheets()), { label: 'the sheet to close', timeout: 4000 }).catch(() => {})
    check('back closes the top sheet', open === 1 && await app.sheets() === 0)
    back(); await waitFor(async () => (await app.route()).startsWith('plan'), { label: 'My Plan', timeout: 4000 }).catch(() => {})
    check('then back goes back a route', (await app.route()).startsWith('plan'), await app.route())
    // every tab change is a history entry, so "exits from Home" means a Home with nothing behind it
    app = await t.relaunch()
    back(); await sleep(1500)
    check('back on Home (nothing behind it) leaves the app', !appOnTop())
    app = await t.relaunch()

    // the largest font the checklist names (1.3): tab labels never split a word
    const saved = shell('settings', 'get', 'system', 'font_scale').trim()
    try {
      shell('settings', 'put', 'system', 'font_scale', '1.3')
      app = await t.relaunch()
      const tabs = await app.page.locator('#tabbar a, #tabbar button').evaluateAll(bs => bs.map(b => {
        const s = b.querySelector('span') || b, lh = parseFloat(getComputedStyle(s).lineHeight) || 16
        return { t: s.textContent.trim(), words: s.textContent.trim().split(/\s+/).length, lines: Math.round(s.getBoundingClientRect().height / lh) }
      }))
      check('tab labels at font size 1.3 never split a word', tabs.length >= 5 && tabs.every(x => x.lines <= x.words), tabs.map(x => `${x.t}:${x.lines}`).join(', '))
    } finally {
      shell('settings', 'put', 'system', 'font_scale', saved === 'null' ? '1.0' : saved)   // the runner checks this again at the end
    }
    app = await t.relaunch()

    // status-bar icons follow the theme
    await app.go('settings')
    await app.tapButton(/^Light/, app.main(), { after: 1000 }); const L = await bar()
    check('light theme: light status bar with dark icons', L.bg > 170 && L.dark < L.bg - 90, JSON.stringify(L))
    await app.tapButton(/^Dark/, app.main(), { after: 1000 }); const D = await bar()
    check('dark theme: dark status bar with light icons', D.bg < 80 && D.light > D.bg + 90, JSON.stringify(D))
  },
}

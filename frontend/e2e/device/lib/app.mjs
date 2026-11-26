// The app side: the debug app's saved state, launching it, and driving its WebView over CDP.
import { chromium } from 'playwright-core'
import { writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PKG, ACTIVITY, adb, adbRaw, shell, sleep, waitFor, wake } from './device.mjs'

const STATE = 'files/openfit-state.json'
const PORT = 9333

// ---- saved state (run-as works on debug builds only, which is the point) ----------------------
export const readState = () => { const raw = adbRaw('exec-out', 'run-as', PKG, 'cat', STATE).toString('utf8'); return raw.trim() ? JSON.parse(raw) : null }
export function hasState() { try { shell('run-as', PKG, 'ls', STATE); return true } catch { return false } }
// The app keeps a copy in the WebView's localStorage and on start uses the file only when the
// file's _ts is at least as new, so a written state is stamped now. null = a fresh install: the
// whole app data goes (pm clear), which takes the notification permission with it.
export function writeState(state) {
  stop()
  if (state == null) { shell('pm', 'clear', '--user', '0', PKG); shell('pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS'); return }
  state = { ...state, _ts: Date.now() }
  const local = join(tmpdir(), `ofreg-state-${process.pid}.json`), tmp = '/data/local/tmp/ofreg-state.json'
  writeFileSync(local, JSON.stringify(state))
  try { adb('push', local, tmp) } finally { rmSync(local, { force: true }) }
  shell('run-as', PKG, 'sh', '-c', `'mkdir -p files && cat ${tmp} > ${STATE}'`)
  shell('rm', '-f', tmp)
}
export const stop = () => shell('am', 'force-stop', PKG)

// ---- launch and connect -------------------------------------------------------------------------
export async function launch(errors = []) {
  wake()
  shell('am', 'start', '-n', ACTIVITY)
  await waitFor(() => /webview_devtools_remote_\d+/.test(shell('cat', '/proc/net/unix')), { timeout: 20000, label: 'the WebView to start' })
  return connect(errors)
}
// errors: one list per section, kept across relaunches and reconnects
export async function connect(errors = []) {
  const sock = shell('cat', '/proc/net/unix').match(/webview_devtools_remote_\d+/)
  if (!sock) throw new Error('the app is not running')
  adb('forward', `tcp:${PORT}`, 'localabstract:' + sock[0])
  const browser = await waitFor(() => chromium.connectOverCDP(`http://127.0.0.1:${PORT}`), { timeout: 15000, label: 'CDP' })
  const page = await waitFor(() => browser.contexts()[0]?.pages().find(p => p.url().startsWith('https://localhost')), { timeout: 15000, label: 'the app page' })
  const app = new App(browser, page, errors)
  await waitFor(() => page.locator('#tabbar').count(), { timeout: 20000, label: 'the tab bar' })
  await app.instrument()
  return app
}

// Counters for what the app asks the phone to do, recorded in the page. They prove the app's
// own calls (navigator.vibrate, a WebAudio beep, the screen wake lock) instead of guessing from
// dumpsys, whose history the CDP connection and other apps also write to.
function instrumentPage() {
  if (window.__ofreg) return
  const R = window.__ofreg = { vibrate: [], beeps: 0, wake: 0, toasts: [] }
  const v = navigator.vibrate?.bind(navigator)
  navigator.vibrate = p => { R.vibrate.push(p); return v ? v(p) : true }
  const AC = window.AudioContext || window.webkitAudioContext
  if (AC) { const o = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { R.beeps++; return o.call(this) } }
  if (navigator.wakeLock) {
    const req = navigator.wakeLock.request.bind(navigator.wakeLock)
    navigator.wakeLock.request = async t => { const s = await req(t); R.wake++; s.addEventListener('release', () => R.wake--); return s }
  }
  const t = document.getElementById('toast')
  if (t) new MutationObserver(() => { const s = t.textContent.trim(); if (s && R.toasts.at(-1) !== s) R.toasts.push(s) }).observe(t, { childList: true, subtree: true, characterData: true })
}

// Console errors that are not faults. Capacitor's bridge logs every plugin rejection, even one the
// app catches: clearCaptures() (lib/mobile.js) lists folders that don't exist until the first
// camera capture or file pick, and handles that; closing the share sheet rejects shareExport(),
// which Settings catches ("share sheet dismissed"); Tesseract (lab OCR) prints its progress
// notes through console.error.
const KNOWN = [/'readdir' failed because file at .*\/(Pictures|picks)\/' does not exist.*OS-PLUG-FILE-0008/, /^\{message: Share canceled\}$/, /^Estimating resolution as \d+$/]

export class App {
  constructor(browser, page, errors = []) {
    this.browser = browser; this.page = page; this.errors = errors
    page.setDefaultTimeout(8000)
    page.on('console', m => m.type() === 'error' && !KNOWN.some(r => r.test(m.text())) && this.errors.push(m.text().slice(0, 200)))
    page.on('pageerror', e => this.errors.push('page error: ' + String(e).slice(0, 200)))
  }
  async close() { await this.browser.close().catch(() => {}) }
  instrument() { return this.page.evaluate(instrumentPage) }
  record() { return this.page.evaluate(() => window.__ofreg) }

  // ---- navigation and reading ----
  async go(route) {
    await this.page.evaluate(h => { location.hash = h }, '#/' + route)
    await waitFor(async () => (await this.page.evaluate(() => location.hash)).startsWith('#/' + route), { label: 'route ' + route })
    await sleep(400)   // first paint after the route change
  }
  route() { return this.page.evaluate(() => location.hash.slice(2)) }
  text(sel = 'body') { return this.page.locator(sel).first().innerText() }
  main() { return this.page.locator('#app') }

  // ---- sheets: the app's bottom sheets are [role=dialog]; the top one is last ----
  sheet() { return this.page.locator('[role=dialog]').last() }
  sheets() { return this.page.locator('[role=dialog]').count() }
  sheetText() { return this.sheet().innerText().catch(() => '') }
  async waitSheet(re, timeout = 8000) {
    return waitFor(async () => { if (!await this.sheets()) return false; const s = await this.sheetText(); return (!re || re.test(s)) && s }, { timeout, label: 'a sheet' + (re ? ' matching ' + re : '') })
  }
  async closeSheets() {
    for (let i = 0; i < 6 && await this.sheets(); i++) { await this.page.keyboard.press('Escape'); await sleep(450) }
  }

  // ---- clicks ----
  // Sheets animate in, and Playwright's actionability wait times out on them; a DOM click is what
  // a tap does once the element is there, so tap() waits for the element and clicks it in the page.
  async tap(locator, { after = 500 } = {}) {
    await locator.first().waitFor({ state: 'attached' })
    await locator.first().evaluate(e => { e.scrollIntoView({ block: 'center' }); e.click() })
    await sleep(after)
  }
  button(name, scope) { return (scope || this.page).getByRole('button', { name, exact: typeof name === 'string' }) }
  tapButton(name, scope, opts) { return this.tap(this.button(name, scope), opts) }
  tapText(text, scope, opts) { return this.tap((scope || this.page).getByText(text, { exact: typeof text === 'string' }), opts) }

  // ---- data the tests compare against ----
  async workoutCount() { await this.go('history'); return +((await this.text('#app')).match(/(\d+) workouts?/)?.[1] ?? 0) }
  async startTodaysWorkout() {
    await this.go('home'); await this.tap(this.page.locator('button.hero'), { after: 1200 })
    if (await this.sheets() && /weigh|weight/i.test(await this.sheetText())) await this.tapText('Start without weighing in', null, { after: 1200 })
    await waitFor(async () => (await this.route()).startsWith('workout'), { label: 'the workout screen' })
  }
  async discardWorkout() {
    await this.tapButton('Discard', this.main())
    await this.tap(this.sheet().getByRole('button', { name: 'Discard', exact: true }), { after: 1000 })
  }
}

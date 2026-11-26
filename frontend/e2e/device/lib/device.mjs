// The phone side: adb, system UI taps, screenshots, settings that a test changes.
// Every call is about the debug app in the phone's main profile (user 0) and nothing else.
import { execFileSync } from 'node:child_process'
import { inflateSync } from 'node:zlib'

export const PKG = 'com.rupal2k.openfit.dbg'
// The suite clears and rewrites this app's data: it must never point at the real app.
if (!PKG.endsWith('.dbg')) throw new Error('the device suite only runs against the debug app')
export const ACTIVITY = PKG + '/com.rupal2k.openfit.MainActivity'
export const USER = '0'
export const TEST_DIR = '/sdcard/Download/OpenFettleTest'
const ADB = process.env.ADB || 'adb'
const env = { ...process.env, MSYS_NO_PATHCONV: '1' }   // Git Bash would rewrite /sdcard paths

// System dumps (alarms, audio, services) list every app on the phone. grepOnPhone filters on the
// phone, so only the lines naming the debug app ever reach this computer.
export const grepOnPhone = (cmd, needle) => adb('shell', `${cmd} | grep -F '${needle.replace(/'/g, '')}' || true`)
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const adb = (...a) => execFileSync(ADB, a, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256e6 })
export const adbRaw = (...a) => execFileSync(ADB, a, { env, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256e6 })
export const shell = (...a) => adb('shell', ...a)

export function device() {
  const lines = adb('devices').trim().split(/\r?\n/).slice(1).filter(l => /\tdevice$/.test(l))
  if (lines.length !== 1) throw new Error(`need exactly one authorised phone, adb sees ${lines.length}`)
  return { serial: lines[0].split('\t')[0], model: shell('getprop', 'ro.product.model').trim() }
}
export const installed = () => shell('pm', 'list', 'packages', '--user', USER, PKG).split(/\r?\n/).some(l => l.trim() === 'package:' + PKG)
export const versionName = () => (shell('dumpsys', 'package', PKG).match(/versionName=(\S+)/) || [])[1]
export const uid = () => shell('cmd', 'package', 'list', 'packages', '-U', '--user', USER, PKG).match(/uid:(\d+)/)[1]
// only the one top line is read (filtered on the phone)
export const topActivity = () => (grepOnPhone('dumpsys activity activities', 'topResumedActivity').match(/topResumedActivity=.*\{\S+ \S+ ([^ }]+)/) || [])[1] || '?'
export const appOnTop = () => topActivity().startsWith(PKG + '/')
export const wake = () => shell('input', 'keyevent', 'KEYCODE_WAKEUP')
export const back = () => shell('input', 'keyevent', '4')

export async function waitFor(fn, { timeout = 10000, every = 300, label = 'condition' } = {}) {
  const end = Date.now() + timeout
  let last
  for (;;) {
    try { last = await fn(); if (last) return last } catch (e) { last = e }
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}` + (last instanceof Error ? ': ' + last.message : ''))
    await sleep(every)
  }
}

// --- system UI (permission dialogs, camera, photo and file pickers): uiautomator only ---------
export function uiDump() {
  try { shell('uiautomator', 'dump', '/sdcard/ofreg-ui.xml') } catch { /* exits non-zero on some screens after writing */ }
  const x = shell('cat', '/sdcard/ofreg-ui.xml'); shell('rm', '-f', '/sdcard/ofreg-ui.xml'); return x
}
const nodeRe = (re, attr) => new RegExp(`${attr}="(${re})"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i')
export function uiFind(re, { attr = '(?:text|content-desc)', xml = uiDump() } = {}) {
  const m = xml.match(nodeRe(re, attr)); return m && { label: m[1], x: (+m[2] + +m[4]) >> 1, y: (+m[3] + +m[5]) >> 1 }
}
export async function uiTap(re, opts = {}) {
  const n = await waitFor(() => uiFind(re, opts), { timeout: opts.timeout ?? 8000, label: `"${re}" on screen` })
  shell('input', 'tap', String(n.x), String(n.y)); await sleep(opts.after ?? 1500); return n.label
}

// --- screenshots -------------------------------------------------------------------------------
export const screencap = () => adbRaw('exec-out', 'screencap', '-p')
// Grey-level spread of the content area (Samsung's edge handle and the status bar cut off).
// A screen blocked by FLAG_SECURE comes back flat black: spread ~0. A normal screen: > 10.
export function contrast(png, crop = { x: 60, y: 300, w: 1020, h: 1600 }) {
  const { width, height, px, bpp } = decodePng(png)
  let n = 0, sum = 0, sq = 0
  for (let y = crop.y; y < Math.min(height, crop.y + crop.h); y += 4)
    for (let x = crop.x; x < Math.min(width, crop.x + crop.w); x += 4) {
      const i = (y * width + x) * bpp, g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      n++; sum += g; sq += g * g
    }
  return Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2))
}
// The status-bar strip of a screenshot: background (median) and the icons (darkest/brightest).
export function statusBar(png, h = 90) {
  const { width, px, bpp } = decodePng(png), g = []
  for (let y = 10; y < h; y += 2) for (let x = 0; x < width; x += 2) { const i = (y * width + x) * bpp; g.push(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) }
  g.sort((a, b) => a - b)
  return { bg: g[g.length >> 1], dark: g[Math.floor(g.length * 0.01)], light: g[Math.floor(g.length * 0.99)] }
}
// Enough PNG for screencap output: 8-bit RGB/RGBA, not interlaced.
function decodePng(buf) {
  let p = 8, width, height, type, idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), kind = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG') }
    else if (kind === 'IDAT') idat.push(data)
    else if (kind === 'IEND') break
    p += 12 + len
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : (() => { throw new Error('unsupported PNG colour type ' + type) })()
  const raw = inflateSync(Buffer.concat(idat)), stride = width * bpp, px = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o - stride + x] : 0, c = y && x >= bpp ? px[o - stride + x - bpp] : 0
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
      px[o + x] = (line[x] + [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]) & 255
    }
  }
  return { width, height, px, bpp }
}

// --- phone settings a section changes: read before, always put back ---------------------------
const SETTINGS = [['system', 'font_scale'], ['global', 'airplane_mode_on'], ['global', 'wifi_on']]
export const readSettings = () => Object.fromEntries(SETTINGS.map(([ns, k]) => [ns + '/' + k, shell('settings', 'get', ns, k).trim()]))
export function restoreSettings(saved) {
  const now = readSettings()
  if (now['system/font_scale'] !== saved['system/font_scale']) shell('settings', 'put', 'system', 'font_scale', saved['system/font_scale'] === 'null' ? '1.0' : saved['system/font_scale'])
  if (now['global/airplane_mode_on'] !== saved['global/airplane_mode_on']) shell('cmd', 'connectivity', 'airplane-mode', saved['global/airplane_mode_on'] === '1' ? 'enable' : 'disable')
  if ((now['global/wifi_on'] !== '0') !== (saved['global/wifi_on'] !== '0')) shell('svc', 'wifi', saved['global/wifi_on'] !== '0' ? 'enable' : 'disable')
}
// Airplane mode alone keeps Wi-Fi on on Samsung phones, so Wi-Fi goes off too; restoreSettings puts both back.
export function setOffline() {
  shell('cmd', 'connectivity', 'airplane-mode', 'enable')
  shell('svc', 'wifi', 'disable')
}

// --- test files in their own folder on the phone ------------------------------------------------
export function pushTestFile(local, name) {
  adb('push', local, `${TEST_DIR}/${name}`)
  shell('am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file://${TEST_DIR}/${name}`)
}
export const removeTestFiles = () => shell('rm', '-rf', TEST_DIR)

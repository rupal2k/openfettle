// The system file picker. It only ever taps our own test files: the file picker is searched for the exact
// test file name and a result is tapped only when every result shown is a test file (ofreg-*).
import { shell, sleep, waitFor, topActivity, uiDump, uiFind, uiTap, back, PKG } from './device.mjs'

const fileNames = xml => [...xml.matchAll(/text="([^"]+\.(?:pdf|json|csv|jpg|png))"/gi)].map(m => m[1])

export async function pickFile(name) {
  await waitFor(() => /documentsui/i.test(topActivity()), { timeout: 10000, label: 'the file picker' })
  await uiTap('[^"]*', { attr: 'resource-id="com\\.google\\.android\\.documentsui:id/option_menu_search"[^>]*(?:text|content-desc)', after: 1000 })
    .catch(() => uiTap('Search', { after: 1000 }))
  shell('input', 'text', name.replace(/\.\w+$/, ''))
  shell('input', 'keyevent', 'KEYCODE_ENTER')
  try {
    const xml = await waitFor(() => { const x = uiDump(), n = fileNames(x); return n.includes(name) && n.every(f => f.startsWith('ofreg-')) && x }, { timeout: 12000, label: `only test files listed for "${name}"` })
    const n = uiFind(name.replace(/[.]/g, '\\.'), { attr: 'text', xml })
    shell('input', 'tap', String(n.x), String(n.y))
    await waitFor(() => topActivity().startsWith(PKG + '/'), { timeout: 10000, label: 'back in the app' })
  } catch (e) {
    // what the picker showed, without naming any file of the user's
    const n = fileNames(uiDump())
    e.message += ` (picker showed test files [${n.filter(f => f.startsWith('ofreg-')).join(', ')}] and ${n.filter(f => !f.startsWith('ofreg-')).length} other file(s))`
    for (let i = 0; i < 3 && !topActivity().startsWith(PKG + '/'); i++) { back(); await sleep(600) }
    throw e
  }
}

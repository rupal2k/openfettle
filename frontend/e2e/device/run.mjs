// Device regression for the OpenFettle debug app (com.rupal2k.openfit.dbg) on a real Android phone.
//   node run.mjs                      every default section
//   node run.mjs 05 09                only sections whose id starts with 05 or 09
//   node run.mjs --with offline,camera,model   add the sections that change the phone (see README)
// Before: saves the debug app's data and the phone settings a section may change. After (always,
// also after a crash): puts both back and deletes the test files from the phone.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dev from './lib/device.mjs'
import { readState, hasState, writeState, launch, connect, stop } from './lib/app.mjs'
import { fixtures } from './lib/fixtures.mjs'
import { prepareFiles } from './lib/files.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const withIx = args.indexOf('--with')
const extras = withIx >= 0 ? args.splice(withIx, 2)[1].split(',') : []
const only = args.filter(a => !a.startsWith('--'))

const sections = []
for (const f of readdirSync(join(HERE, 'sections')).filter(f => f.endsWith('.mjs')).sort())
  sections.push((await import('./sections/' + f)).default)
const chosen = sections.filter(s => (!only.length || only.some(o => s.id.startsWith(o))) && (!s.needs || extras.includes(s.needs)))
const skipped = sections.filter(s => s.needs && !extras.includes(s.needs) && (!only.length || only.some(o => s.id.startsWith(o))))

const now = new Date(), stamp = new Date(now - now.getTimezoneOffset() * 6e4).toISOString().slice(0, 16).replace(/[:T]/g, '-')   // local time
const OUT = join(HERE, 'reports', stamp); mkdirSync(OUT, { recursive: true })
const results = []
let current = ''
const check = (name, ok, info = '') => {
  results.push({ section: current, name, ok: !!ok, info: String(info ?? '').slice(0, 300) })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + String(info).replace(/\s+/g, ' ').slice(0, 160) : ''}`)
  return !!ok
}
// something a person has to check by hand: listed in the report, not counted as a pass
const manual = (name, how) => { results.push({ section: current, name, ok: null, info: how }); console.log(`  MANUAL  ${name}  — ${how}`) }

// ---- setup -----------------------------------------------------------------------------------------
const phone = dev.device()
if (!dev.installed()) throw new Error(`${dev.PKG} is not installed: build and install the debug APK first`)
const want = JSON.parse(readFileSync(join(HERE, '../../package.json'), 'utf8')).version
const version = dev.versionName()
console.log(`${phone.model} (${phone.serial}) · ${dev.PKG} ${version} · report in ${OUT}`)
const savedState = hasState() ? readState() : null
writeFileSync(join(OUT, 'debug-app-state-before.json'), JSON.stringify(savedState))
const savedSettings = dev.readSettings()
dev.shell('pm', 'grant', dev.PKG, 'android.permission.POST_NOTIFICATIONS')
const files = await prepareFiles(OUT)

try {
  current = '00 build'; console.log('\n00 build')
  check('versionName matches frontend/package.json', version === want, `${version} vs ${want}`)
  for (const s of chosen) {
    current = s.id; console.log(`\n${s.id} ${s.title}`)
    const t0 = Date.now()
    writeState(fixtures[s.fixture]())
    let app
    const errors = []
    try {
      app = await launch(errors)
      const t = {
        check, manual, files, phone, out: OUT, get app() { return app },
        relaunch: async () => { await app.close(); stop(); app = await launch(errors); return app },
        reconnect: async () => { await app.close(); app = await connect(errors); return app },   // after a system picker or camera
      }
      await s.run(t)
      const real = errors.filter(e => !(s.ignoreErrors || []).some(r => r.test(e)))   // a section may expect some (offline: failed loads)
      check('no console errors', !real.length, real.join(' / '))
    } catch (e) {
      check('section ran to the end', false, e.message)
      // only of the debug app itself: never a camera view, a picker or another app
      try { if (dev.appOnTop()) writeFileSync(join(OUT, `${s.id}-crash.png`), dev.screencap()) } catch { /* phone gone */ }
    } finally {
      try { await app?.closeSheets() } catch { /* */ }
      await app?.close()
      for (let i = 0; i < 3 && !dev.appOnTop(); i++) { dev.back(); await dev.sleep(500) }   // leave no camera or picker open
      console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
    }
  }
} finally {
  // ---- teardown: always ----
  stop()
  dev.restoreSettings(savedSettings)
  writeState(savedState)
  dev.removeTestFiles()
  rmSync(join(OUT, 'files'), { recursive: true, force: true })   // ~50 MB of generated padding
  try { dev.adb('forward', '--remove', 'tcp:9333') } catch { /* */ }
  dev.shell('input', 'keyevent', 'KEYCODE_HOME')
  const restored = JSON.stringify(dev.readSettings()) === JSON.stringify(savedSettings)
  console.log(`\nteardown: debug app data put back, test files deleted, phone settings ${restored ? 'unchanged' : 'NOT all restored: ' + JSON.stringify(dev.readSettings())}`)
}

// ---- report ----------------------------------------------------------------------------------------
const pass = results.filter(r => r.ok === true).length, fail = results.filter(r => r.ok === false).length, todo = results.filter(r => r.ok === null)
const lines = [`# Device regression ${stamp}`, '', `${phone.model} · ${dev.PKG} ${version} · ${pass} passed, ${fail} failed`, '']
if (skipped.length) lines.push(`Not run (add with --with): ${skipped.map(s => `${s.id} (${s.needs})`).join(', ')}`, '')
if (todo.length) lines.push(`To check by hand: ${todo.map(r => r.name).join('; ')}`, '')
for (const r of results) lines.push(`- ${r.ok === null ? 'MANUAL' : r.ok ? 'PASS' : '**FAIL**'} [${r.section}] ${r.name}${r.info ? ' — ' + r.info.replace(/\s+/g, ' ') : ''}`)
writeFileSync(join(OUT, 'report.md'), lines.join('\n') + '\n')
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 1))
console.log(`\n${pass} passed, ${fail} failed${todo.length ? `, ${todo.length} to check by hand` : ''}${skipped.length ? `; not run: ${skipped.map(s => s.id).join(', ')}` : ''}\n${join(OUT, 'report.md')}`)
process.exit(fail ? 1 : 0)

// Checklist 11: Export opens the share sheet and keeps one cached file; files that aren't a
// backup or are too big are refused; a Strong CSV shows a summary first; Reset everything wipes
// after asking; importing the export restores the data.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { adbRaw, shell, topActivity, back, sleep, waitFor, PKG } from '../lib/device.mjs'
import { pickFile } from '../lib/pickers.mjs'
import { FACTS } from '../lib/fixtures.mjs'

export default {
  id: '11-backup', title: 'Backup, import and reset', fixture: 'trained',
  async run(t) {
    let { app, check, files } = t
    const sheet = () => app.sheet()
    const reconnect = async () => { app = await t.reconnect() }
    const row = name => app.main().locator('.lrow').filter({ hasText: name }).first()
    const toast = re => waitFor(async () => (await app.record()).toasts.find(s => re.test(s)), { timeout: 6000, label: 'a message' }).catch(() => '')
    const importFile = async (rowName, file) => { await app.go('settings'); await app.tap(row(rowName), { after: 600 }); await pickFile(file); await reconnect() }

    // export → the system share sheet; only the latest export is kept in the app's cache
    await app.go('settings')
    await app.tap(row('Export backup'), { after: 1500 })
    if (await app.sheets()) { const go = sheet().getByRole('button', { name: /Export|Share|Continue/ }).last(); if (await go.count()) await app.tap(go, { after: 2000 }) }
    const share = topActivity()
    check('Export opens the system share sheet', /chooser|intentresolver|Resolver|Chooser|sharesheet/i.test(share), share.split('/')[0])
    for (let i = 0; i < 3 && !topActivity().startsWith(PKG + '/'); i++) { back(); await sleep(700) }
    await reconnect()
    const exports = shell('run-as', PKG, 'sh', '-c', `'find cache files -name "openfettle-backup-*" 2>/dev/null'`).trim().split(/\r?\n/).filter(Boolean)
    check('only the latest export is kept in the cache', exports.length === 1, exports.join(', '))
    const raw = adbRaw('exec-out', 'run-as', PKG, 'cat', exports[0])
    const bk = JSON.parse(raw.toString('utf8'))
    check('the export holds the workouts, plan and weigh-ins', bk.workouts?.length === FACTS.workouts && bk.routines?.length === FACTS.routines.length && bk.bodyweight?.length === 1, `${(raw.length / 1024).toFixed(0)} KB`)
    const local = join(files.dir, 'ofreg-backup.json'); writeFileSync(local, raw)
    const backupName = files.push('ofreg-backup.json', local)
    await waitFor(() => (shell('content', 'query', '--uri', 'content://media/external/file', '--projection', '_display_name', '--where', `"_display_name = 'ofreg-backup.json'"`)).includes('ofreg-backup'), { timeout: 20000, label: 'the backup in the media index' })

    // refused files
    await importFile('Import backup', files.notBackup)
    check('a JSON that isn’t an OpenFettle backup gets a clear message', !!await toast(/not an OpenFettle backup|isn.t an? OpenFettle|backup/i), (await app.record()).toasts.at(-1))
    await app.closeSheets()
    await importFile('Import backup', files.bigJson)
    check('a backup over 20 MB is refused', !!await toast(/too (large|big)|20 MB/i), (await app.record()).toasts.at(-1))
    await app.closeSheets()

    // Strong CSV: a summary before anything is written, the unfinished 0-rep set dropped and counted
    await app.go('settings'); await app.tap(row('Import from another app'), { after: 800 })
    if (await app.sheets()) { const st = sheet().getByRole('button', { name: /Strong|CSV|Choose/ }).first(); if (await st.count()) await app.tap(st, { after: 300 }) }
    await pickFile(files.strongCsv); await reconnect()
    const sum = await app.waitSheet(/workout/i).catch(() => '')
    check('Strong CSV: a summary (2 workouts, 3 sets) comes first', /Workouts\s*2\b/.test(sum) && /Sets\s*3\b/.test(sum), sum.replace(/\s+/g, ' ').slice(0, 120))
    check('Strong CSV: the unfinished 0-rep set is left out and counted', /1 set with impossible values .* left out/.test(sum), (sum.match(/[^\n]*left out[^\n]*/) || ['none'])[0])
    await app.closeSheets()
    check('nothing is written before Import', await app.workoutCount() === FACTS.workouts)
    await app.go('settings'); await app.tap(row('Import from another app'), { after: 800 })
    if (await app.sheets()) { const st = sheet().getByRole('button', { name: /Strong|CSV|Choose/ }).first(); if (await st.count()) await app.tap(st, { after: 300 }) }
    await pickFile(files.strongCsv); await reconnect()
    await app.waitSheet(/workout/i)
    await app.tap(sheet().getByRole('button', { name: /^Import/ }).last(), { after: 1500 })
    await app.closeSheets()
    check('Strong CSV: the two workouts are added', await app.workoutCount() === FACTS.workouts + 2)

    // Reset everything: asks first, then wipes
    await app.go('settings'); await app.tap(row('Reset everything'), { after: 800 })
    const ask = await app.sheetText()
    check('Reset everything asks first and says what it deletes', /\?/.test(ask) && /delete|erase|everything/i.test(ask), ask.split('\n')[0])
    await app.tap(sheet().getByRole('button', { name: /Reset|Delete|Erase/ }).last(), { after: 2500 })
    await reconnect()
    check('Reset everything wipes the data', await app.workoutCount() === 0)

    // importing the export puts it all back
    await importFile('Import backup', backupName)
    if (await app.sheets()) { const ok = sheet().getByRole('button', { name: /Import|Restore|Replace|Continue/ }).last(); if (await ok.count()) await app.tap(ok, { after: 2000 }) }
    await app.closeSheets()
    check('importing the backup restores the workouts', await app.workoutCount() === FACTS.workouts)
    await app.go('home')
    check('… and the weigh-in', /70\s*kg/.test(await app.page.locator('.card', { hasText: 'Body weight' }).first().innerText()))
  },
}

// Checklist 8 (photo recognition model): the 93 MB download shows progress, can be cancelled,
// installs, works offline afterwards is covered by 01b. Opt in: node run.mjs --with model
import { waitFor } from '../lib/device.mjs'

export default {
  id: '08b-model', title: 'Food-recognition model download (93 MB)', fixture: 'trained', needs: 'model',
  async run({ app, check }) {
    await app.go('settings')
    const row = () => app.main().locator('.lrow, .card, section').filter({ hasText: 'Food-101' }).first()
    const rowText = async () => (await row().innerText()).replace(/\s+/g, ' ')
    if (/Installed/.test(await rowText())) { await app.tapButton('Delete', app.main(), { after: 1000 }); await app.closeSheets() }
    await app.tapButton(/^Download/, app.main(), { after: 300 })
    const prog = await waitFor(async () => (await app.text('#app')).match(/\d+\s?%|[\d.]+ ?(?:of|\/) ?[\d.]+ ?MB/)?.[0], { timeout: 15000, label: 'progress' }).catch(() => '')
    check('the model download shows progress', !!prog, prog)
    await app.tapButton(/Cancel|Stop/, app.main(), { after: 1500 })
    check('it can be cancelled, and Download comes back', await app.button(/^Download/, app.main()).count() > 0, await rowText())
    await app.tapButton(/^Download/, app.main(), { after: 300 })
    const done = await waitFor(async () => /Installed/.test(await rowText()), { timeout: 600000, every: 3000, label: 'the install' }).catch(() => false)
    check('the model downloads and installs', done, await rowText())
    check('an installed model can be deleted', await app.button('Delete', app.main()).count() > 0)
  },
}

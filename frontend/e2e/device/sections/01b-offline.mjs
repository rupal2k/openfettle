// Checklist 1 (offline). The app's requests go through native HTTP (CapacitorHttp), which a
// WebView-only "offline" can't block, so this turns the phone's network off: airplane mode plus
// Wi-Fi (Samsung keeps Wi-Fi on in airplane mode). Both come back in finally, and the runner
// checks them again at the end. Opt in: node run.mjs --with offline
import { readSettings, restoreSettings, setOffline, sleep } from '../lib/device.mjs'

export default {
  id: '01b-offline', title: 'Offline (turns the phone’s network off)', fixture: 'trained', needs: 'offline',
  async run(t) {
    const saved = readSettings()
    try {
      setOffline(); await sleep(3000)
      let app = await t.relaunch()
      const { check } = t
      t.check('the app opens with the phone offline', /My Plan/.test(await app.text('#tabbar')))
      await app.go('nutrition')
      await app.tap(app.main().getByRole('button', { name: /Add food/ }).first())
      await app.sheet().locator('input').first().fill('banana ' + Date.now().toString(36))
      await sleep(4000)
      const s = await app.sheetText()
      check('offline food search says it needs the internet and offers New food', /internet|offline|connection/i.test(s) && /New food/.test(s), s.replace(/\s+/g, ' ').slice(0, 120))
      await app.closeSheets()
      await app.startTodaysWorkout()
      const imgs = await app.page.evaluate(() => [...document.querySelectorAll('#app img')].map(i => i.complete && i.naturalWidth > 0 ? 'ok' : 'broken').concat([...document.querySelectorAll('.exmedia-off')].map(() => 'placeholder')))
      check('offline workout: pictures are cached or a placeholder, never broken', imgs.length > 0 && !imgs.includes('broken'), imgs.join(','))
      await app.discardWorkout()
    } finally {
      restoreSettings(saved)
    }
  },
}

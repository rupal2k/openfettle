// Checklist 8 (no camera, no model download): targets, online food search with portion units, a
// custom food, and a barcode looked up by typing it. Needs the phone online.
import { shell, waitFor, PKG } from '../lib/device.mjs'

export default {
  id: '08-meals', title: 'My Meals', fixture: 'trained',
  async run({ app, check }) {
    const p = app.page, sheet = () => app.sheet()
    await app.go('nutrition')

    // targets: computed from a profile, then overridable
    await app.tapText('Set your targets', app.main())
    await app.waitSheet(/Your targets/)
    await app.tapButton('Male', sheet(), { after: 200 })
    await sheet().getByLabel('Birth year').fill('1990')
    await sheet().getByLabel('Height (cm)').fill('175')
    await app.tapButton('Maintain', sheet(), { after: 300 })
    const tg = await app.sheetText()
    const kcal = +(tg.match(/([\d,]{4,5})\s*kcal/)?.[1]?.replace(',', '') ?? 0)
    check('the targets sheet calculates calories from the profile', kcal > 1500 && kcal < 3500, `${kcal} kcal`)
    await app.tapButton('Save', sheet(), { after: 800 })
    await app.closeSheets()
    check('the calorie target shows on My Meals', (await app.text('#app')).replace(/,/g, '').includes(String(kcal)), `${kcal} kcal`)

    // a calorie override replaces the calculated number
    await app.tapButton('Targets', app.main())   // the header's target icon
    await app.waitSheet(/Your targets/)
    await sheet().getByLabel('Calorie override').fill('2222')
    await app.tapButton('Save', sheet(), { after: 800 }); await app.closeSheets()
    check('a calorie override replaces the calculated target', /2,?222/.test(await app.text('#app')))

    // online search → portion sheet with units → logged
    await app.tap(app.main().getByRole('button', { name: /Add food/ }).first())
    await sheet().locator('input').first().fill('banana')
    const hit = sheet().locator('button.lrow').filter({ hasText: /kcal/ }).first()
    check('food search (online) finds results', await waitFor(() => hit.count(), { timeout: 15000, label: 'search results' }).catch(() => false))
    const food = (await hit.innerText().catch(() => '')).split('\n')[0]
    await app.tap(hit, { after: 1000 })
    const portion = await app.sheetText()
    const units = ['serving', 'g', 'oz', 'ml'].filter(u => new RegExp(`(^|\\s)${u}(\\s|$)`, 'im').test(portion))
    check('the portion sheet offers units (serving, g, oz, ml)', units.length >= 3, units.join(', '))
    await app.tap(sheet().getByRole('button', { name: /^(Add|Log|Save)/ }).last(), { after: 1000 })
    await app.closeSheets()
    check('the food is logged and counted', (await app.text('#app')).includes(food) && !/Calories\s*0\b/.test(await app.text('#app')), food)

    // custom food
    const name = 'Regression oats ' + Date.now().toString(36)
    await app.tap(app.main().getByRole('button', { name: /Add food/ }).first())
    await app.tapButton('New food', sheet(), { after: 800 })
    const fields = sheet().locator('input')
    await fields.nth(0).fill(name)
    for (let i = 1; i < await fields.count(); i++) {
      const lab = (await fields.nth(i).getAttribute('aria-label')) || (await fields.nth(i).getAttribute('placeholder')) || ''
      if (/kcal|Calories/i.test(lab)) await fields.nth(i).fill('380'); else if (/Protein/i.test(lab)) await fields.nth(i).fill('13')
    }
    await app.tap(sheet().getByRole('button', { name: /^(Save|Add|Create)/ }).last(), { after: 1000 })
    if (await app.sheets()) { const a = sheet().getByRole('button', { name: /^Add/ }).last(); if (await a.count()) await app.tap(a, { after: 1000 }) }
    await app.closeSheets()
    check('a custom food is created and logged', (await app.text('#app')).includes(name))

    // barcode: with camera permission the rear camera preview runs; a typed EAN is looked up
    shell('pm', 'grant', PKG, 'android.permission.CAMERA')
    await app.tap(app.main().getByRole('button', { name: /barcode/i }).first(), { after: 1500 })
    const cam = await waitFor(() => p.evaluate(() => { const v = document.querySelector('[role=dialog] video'); return v && !v.paused && v.readyState >= 2 && v.videoWidth > 0 && { w: v.videoWidth, facing: v.srcObject?.getVideoTracks?.()[0]?.getSettings?.().facingMode } }), { timeout: 8000, label: 'the camera preview' }).catch(() => null)
    check('barcode: the camera preview runs (rear camera)', cam && cam.facing !== 'user', JSON.stringify(cam))
    const code = sheet().locator('input').first()
    check('barcode: the code can also be typed', await code.count() === 1)
    await code.fill('3017620422003'); await code.press('Enter')
    const found = await waitFor(async () => { const s = await app.sheetText(); return /Nutella|hazelnut/i.test(s) && s }, { timeout: 15000, label: 'the product' }).catch(() => '')
    check('a typed EAN is looked up on Open Food Facts', !!found, found.slice(0, 80))
    await app.closeSheets()
  },
}

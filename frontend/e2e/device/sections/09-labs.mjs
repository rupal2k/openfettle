// Checklist 9: Blood tests. Screens with results stay out of screenshots; a digital PDF is read
// on the phone into a review (date, values, decimal comma); saved reports show High/Low, scores,
// SI/US units and a chart per marker; a scanned PDF is read by OCR; an oversized file is refused.
import { screencap, contrast, waitFor, sleep } from '../lib/device.mjs'
import { pickFile } from '../lib/pickers.mjs'

export default {
  id: '09-labs', title: 'Blood tests', fixture: 'trained',
  async run(t) {
    let { app, check, files } = t
    const sheet = () => app.sheet()
    const reconnect = async () => { app = await t.reconnect() }   // the WebView pauses while a picker is on top

    await app.go('stats')
    await app.tap(app.page.getByText('Blood tests', { exact: true }).first(), { after: 1200 })
    check('Blood tests open from My Stats', (await app.route()).startsWith('labs'), await app.route())
    check('Blood tests are blocked from screenshots', await waitFor(() => contrast(screencap()) < 2, { timeout: 4000, label: 'a black screenshot' }).catch(() => false))

    // a digital PDF: read in seconds into a review
    await app.tapButton('Import a PDF', app.main(), { after: 300 })
    const t0 = Date.now()
    await pickFile(files.digitalPdf); await reconnect()
    const rev = await app.waitSheet(/Sample date/, 20000)
    check('a digital PDF is read into a review in seconds', /Save/.test(rev) && Date.now() - t0 < 15000, `${((Date.now() - t0) / 1000).toFixed(1)} s`)
    const date = await sheet().locator('.lab-date input').inputValue()
    check('the review has the report date filled in', /^\d{4}-\d\d-\d\d$/.test(date), date)
    const markers = await sheet().locator('input[inputmode=decimal]').count()
    check('the review lists the report’s markers', markers >= 60, `${markers} values (68 in the report)`)
    const val = sheet().locator('input[inputmode=decimal]').first()
    await val.fill('5,4'); await val.blur(); await sleep(200)
    check('a value can be typed with a decimal comma', /^5[.,]4$/.test(await val.inputValue()), await val.inputValue())
    const pinned = await sheet().evaluate(e => {
      const b = name => [...e.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(name))
      const seen = x => { const r = x?.getBoundingClientRect(); return !!r && r.top >= 0 && r.bottom <= innerHeight }
      return { save: seen(b('Save')), cancel: seen(b('Cancel')) }
    })
    check('Save and Cancel stay on screen in a long review', pinned.save && pinned.cancel, JSON.stringify(pinned))
    await app.tapButton('Cancel', sheet(), { after: 600 })
    check('Cancel asks before throwing the reading away', /Discard this reading\?/.test(await app.sheetText()))
    await app.page.keyboard.press('Escape'); await sleep(500)   // keep it
    await app.tap(sheet().getByRole('button', { name: /^Save/ }), { after: 1500 })
    await app.closeSheets()

    const page = await app.text('#app')
    check('the saved report marks values High or Low against their ranges', /\bHigh\b|\bLow\b/.test(page))
    check('published scores appear (e.g. HOMA-IR)', /HOMA-IR|FIB-4|biological age/i.test(page))
    const units = async () => ((await app.text('#app')).match(/mg\/dL|mmol\/L/g) || []).join(',')
    const u0 = await units()
    await app.tapButton(/mmol/.test(u0.split(',')[0]) ? 'US units' : 'SI units', app.main(), { after: 800 })
    const u1 = await units()
    check('the SI / US switch converts units', u0 && u1 && u0 !== u1, `${u0.slice(0, 30)} → ${u1.slice(0, 30)}`)
    const glucose = () => app.main().locator('.lrow').filter({ hasText: /^Glucose/ }).first()
    await app.tap(glucose(), { after: 1000 })
    check('with one report a marker says so instead of drawing a trend', /One reading so far/.test(await app.sheetText()))
    await app.closeSheets()

    // a scanned PDF of the same report, months later: no text layer, read by OCR on the phone
    await app.tapButton('Import a PDF', app.main(), { after: 300 })
    const t1 = Date.now()
    await pickFile(files.scannedPdf); await reconnect()
    const ocr = await app.waitSheet(/Check the results/, 120000).catch(() => '')
    const rows = await sheet().locator('input[inputmode=decimal]').count()
    const other = +(ocr.match(/(\d+) rows not recognised/)?.[1] ?? 0)
    // the test scan is page 1 of the 3-page report: 22 rows
    check('a scanned PDF is read by OCR into a review that says so', /Read with OCR/.test(ocr) && rows + other >= 20 && rows >= 15, `${((Date.now() - t1) / 1000).toFixed(0)} s: ${rows} recognised + ${other} not recognised (page 1 has 22)`)
    const dateIn = sheet().locator('.lab-date input')
    if (!await dateIn.inputValue()) await dateIn.fill(new Date().toISOString().slice(0, 10))   // OCR may miss the date: the review asks for it
    await app.tap(sheet().getByRole('button', { name: /^Save \d+ results/ }), { after: 1500 })
    await app.closeSheets()
    // a marker both reports have now has two readings: its sheet draws the trend
    let chart = ''
    const markerRows = app.main().locator('button.lrow:has(.lrow-c.chev, svg.lrow-c)').filter({ hasNotText: /^(HOMA|FIB|TyG|Biological)/ })
    for (let i = 0; i < Math.min(30, await markerRows.count()) && !chart; i++) {
      await app.tap(markerRows.nth(i), { after: 700 })
      if (await app.page.locator('[role=dialog] svg polyline').count()) chart = (await app.sheetText()).split('\n')[0]
      await app.closeSheets()
    }
    check('with two reports a marker opens with its chart', !!chart, chart)

    // a file over 25 MB is refused before it is read
    await app.tapButton('Import a PDF', app.main(), { after: 300 })
    await pickFile(files.bigPdf); await reconnect()
    const toasts = await waitFor(async () => (await app.record()).toasts.find(s => /too large/i.test(s)), { timeout: 6000, label: 'the size toast' }).catch(() => '')
    check('a PDF over 25 MB is refused with a message', !!toasts, toasts)

    await app.go('library')
    check('screenshots work again after leaving Blood tests', await waitFor(() => contrast(screencap()) > 10, { timeout: 4000, label: 'a normal screenshot' }).catch(() => false))
  },
}

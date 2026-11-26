// Checklist 8 (camera and photos). Uses the phone's camera for one real photo (deleted by the
// app's own clean-up), taps the system permission dialog, and picks from the OpenFettleTest album
// only. Opt in: node run.mjs --with camera
import { shell, uiTap, uiFind, topActivity, waitFor, sleep, PKG } from '../lib/device.mjs'
import { pickTestPhoto } from '../lib/pickers.mjs'

export default {
  id: '08b-camera', title: 'Camera, barcode permission and photo logging', fixture: 'trained', needs: 'camera',
  async run(t) {
    let { app, check } = t
    const sheet = () => app.sheet()
    const reconnect = async () => { app = await t.reconnect() }
    const preview = () => app.page.evaluate(() => { const i = document.querySelector('[role=dialog] img'); return i && i.complete && i.naturalWidth > 0 ? i.naturalWidth : 0 })

    // camera permission denied: the barcode sheet still takes a typed code
    shell('pm', 'revoke', PKG, 'android.permission.CAMERA')
    app = await t.relaunch()
    await app.go('nutrition')
    await app.tap(app.main().getByRole('button', { name: /barcode/i }).first(), { after: 300 })
    await waitFor(() => /permissioncontroller/i.test(topActivity()), { timeout: 8000, label: 'the permission dialog' })
    check('barcode asks for the camera permission', true)
    await uiTap('Don(?:’|\'|&apos;)t allow|Deny', { after: 1500 })
    await reconnect()
    check('camera denied: the code can still be typed', /code/i.test(await app.sheetText()) && await sheet().locator('input').count() > 0)
    await app.closeSheets()

    // Take photo: the camera app (not the gallery), back with a preview
    shell('pm', 'grant', PKG, 'android.permission.CAMERA')
    await app.tapButton('Log from photo', app.main(), { after: 800 })
    await app.tap(sheet().getByRole('button', { name: /Take photo/ }), { after: 300 })
    const cam = await waitFor(() => { const a = topActivity(); return /camera/i.test(a) && a }, { timeout: 10000, label: 'a camera app' }).catch(() => topActivity())
    check('Take photo opens a camera app, not the gallery', /camera/i.test(cam) && !/photopicker|documentsui/i.test(cam), cam.split('/')[0])
    await uiTap('Take picture|Capture|Shutter|Camera button|Take a photo', { attr: 'content-desc', after: 3000 }).catch(() => shell('input', 'keyevent', 'KEYCODE_CAMERA'))
    if (!topActivity().startsWith(PKG + '/')) await uiTap('OK|Done|Save|Confirm', { after: 2500 }).catch(() => {})
    await waitFor(() => topActivity().startsWith(PKG + '/'), { timeout: 10000, label: 'back in OpenFettle' })
    await reconnect()
    check('the taken photo shows as a preview', await waitFor(preview, { timeout: 10000, label: 'the preview' }).catch(() => 0) > 0)
    await app.tapButton('Retake', sheet(), { after: 300 })
    for (let i = 0; i < 3 && !topActivity().startsWith(PKG + '/'); i++) { shell('input', 'keyevent', '4'); await sleep(800) }   // Retake opens the camera again: come straight back
    await reconnect()
    check('Retake clears the preview', !await preview())
    await app.closeSheets()

    // Choose photo: the system photo picker, the test album only
    await app.tapButton('Log from photo', app.main(), { after: 800 })
    await app.tap(sheet().getByRole('button', { name: /Choose photo/ }), { after: 300 })
    await pickTestPhoto()
    await reconnect()
    check('Choose photo shows the picked image as a preview', await waitFor(preview, { timeout: 10000, label: 'the preview' }).catch(() => 0) > 0)
    check('… with Retake offered', await sheet().getByRole('button', { name: 'Retake' }).count() === 1)
    await app.closeSheets()
  },
}

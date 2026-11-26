// Checklist 12: no sign-in anywhere in the app, and it says where the data lives.
export default {
  id: '12-privacy', title: 'Privacy: no account, data on the phone', fixture: 'trained',
  async run({ app, check }) {
    for (const r of ['home', 'plan', 'stats', 'nutrition', 'library', 'settings']) {
      await app.go(r)
      if (/Sign in|Log in|Create account|Password/i.test(await app.text('#app'))) { check(`no sign-in on ${r}`, false); return }
    }
    check('no sign-in, log-in or account screen on any tab or Settings', true)
    await app.go('settings')
    check('Settings says the data stays on this phone', /stays on this phone|on this device/i.test(await app.text('#app')))
  },
}

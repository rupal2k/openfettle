import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import './index.css'

// Android: a tap on the end-of-day check-in reminder opens the check-in. Registered before the first
// render: the plugin holds a cold-start tap until a listener exists (retainUntilConsumed).
if (MOBILE) {
  import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
    LocalNotifications.addListener('localNotificationActionPerformed', e => {
      if (e?.notification?.extra?.kind !== 'checkin') return
      import('./checkin-sheets.jsx').then(m => m.openCheckinFromReminder()).catch(() => {})
    })).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the mobile build: the native shell already serves everything from disk.
if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}

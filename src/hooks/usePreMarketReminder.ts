import { useEffect } from 'react'
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification'
import { getReminderSettings } from '../lib/db'

const LAST_FIRED_KEY = 'tj_reminder_last_fired'

async function checkAndFire() {
  const settings = getReminderSettings()
  if (!settings.enabled || !settings.time) return

  const now = new Date()

  // Optionally skip weekends (Sat=6, Sun=0)
  if (settings.weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return

  const [hours, minutes] = settings.time.split(':').map(Number)
  if (now.getHours() !== hours || now.getMinutes() !== minutes) return

  // Fire at most once per day
  const todayKey = now.toISOString().slice(0, 10)
  if (localStorage.getItem(LAST_FIRED_KEY) === todayKey) return

  let granted = await isPermissionGranted()
  if (!granted) {
    const result = await requestPermission()
    granted = result === 'granted'
  }
  if (!granted) return

  localStorage.setItem(LAST_FIRED_KEY, todayKey)
  sendNotification({
    title: 'Pre-Market Reminder',
    body: 'Complete your pre-market checklist before trading.',
  })
}

export function usePreMarketReminder() {
  useEffect(() => {
    // Check immediately in case app launched right at reminder time
    void checkAndFire()
    const interval = setInterval(() => { void checkAndFire() }, 60 * 1000)
    return () => clearInterval(interval)
  }, [])
}

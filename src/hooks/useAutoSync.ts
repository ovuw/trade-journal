import { useEffect } from 'react'
import { getSession } from '../lib/supabase'
import { syncTrades } from '../lib/sync'

/**
 * Silently syncs trades with Supabase on app launch.
 * No-op if not signed in or Supabase not configured.
 */
export function useAutoSync() {
  useEffect(() => {
    let cancelled = false

    async function run() {
      const session = await getSession()
      if (!session || cancelled) return
      try {
        await syncTrades(session.user.id)
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('tj:synced'))
        }
      } catch (err) {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('tj:sync-error', {
            detail: err instanceof Error ? err.message : 'Sync failed',
          }))
        }
      }
    }

    // Small delay so the app renders first
    const timer = setTimeout(() => { void run() }, 2000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
}

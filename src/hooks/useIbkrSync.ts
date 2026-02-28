import { useEffect } from 'react'
import { getIbkrConfig } from '../lib/db'
import { syncIbkr } from '../lib/ibkr'

/**
 * Silently imports closed trades from IBKR on app launch.
 * No-op if IBKR config is not set or auto-sync is disabled.
 * Fires custom events on completion/error for the Settings page to consume.
 */
export function useIbkrSync() {
  useEffect(() => {
    let cancelled = false

    async function run() {
      const config = getIbkrConfig()
      if (!config?.flexToken || !config?.queryId || !config.autoSync) return
      try {
        const result = await syncIbkr(config.flexToken, config.queryId)
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('tj:ibkr-synced', { detail: result }))
        }
      } catch (err) {
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('tj:ibkr-error', {
            detail: err instanceof Error ? err.message : 'IBKR sync failed',
          }))
        }
      }
    }

    // Delay so Supabase auto-sync runs first (useAutoSync has a 2s delay)
    const timer = setTimeout(() => { void run() }, 5000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])
}

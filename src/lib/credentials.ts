import { invoke } from '@tauri-apps/api/core'

const cache: Record<string, string> = {}

const CREDENTIAL_KEYS = ['supabase_config', 'anthropic_key', 'ibkr_config']

// Maps old localStorage keys to new credential keys for auto-migration
const MIGRATION_MAP: Record<string, string> = {
  tj_supabase_config: 'supabase_config',
  tj_anthropic_key: 'anthropic_key',
  tj_ibkr_config: 'ibkr_config',
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export async function loadCredentials(): Promise<void> {
  if (!isTauri()) return

  for (const key of CREDENTIAL_KEYS) {
    try {
      const value = await invoke<string | null>('keychain_get', { key })
      if (value != null) {
        cache[key] = value
      } else {
        // Auto-migrate from localStorage if present
        const lsKey = Object.entries(MIGRATION_MAP).find(([, v]) => v === key)?.[0]
        if (lsKey) {
          const lsValue = localStorage.getItem(lsKey)
          if (lsValue) {
            cache[key] = lsValue
            await invoke<void>('keychain_set', { key, value: lsValue })
            localStorage.removeItem(lsKey)
          }
        }
      }
    } catch (err) {
      console.warn(`Failed to load credential "${key}":`, err)
    }
  }
}

export function getCredential(key: string): string | null {
  return cache[key] ?? null
}

export async function setCredential(key: string, value: string): Promise<void> {
  cache[key] = value
  if (!isTauri()) return
  await invoke<void>('keychain_set', { key, value })
}

export async function deleteCredential(key: string): Promise<void> {
  delete cache[key]
  if (!isTauri()) return
  await invoke<void>('keychain_delete', { key })
}

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseConfig } from './db'

export type { Session } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null
let _configKey = ''

export function getSupabaseClient(): SupabaseClient | null {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

  if (envUrl && envUrl !== 'your_supabase_project_url' && envKey) {
    if (!_client) _client = createClient(envUrl, envKey)
    return _client
  }

  const config = getSupabaseConfig()
  if (!config?.url || !config?.anonKey) return null

  const key = `${config.url}::${config.anonKey}`
  if (!_client || _configKey !== key) {
    _client = createClient(config.url, config.anonKey)
    _configKey = key
  }
  return _client
}

export function resetSupabaseClient(): void {
  _client = null
  _configKey = ''
}

export function isSupabaseConfigured(): boolean {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  if (envUrl && envUrl !== 'your_supabase_project_url') return true
  const config = getSupabaseConfig()
  return !!(config?.url && config?.anonKey)
}

export async function testConnection(url: string, anonKey: string): Promise<boolean> {
  try {
    const client = createClient(url, anonKey)
    const { error } = await client.auth.getSession()
    return !error
  } catch {
    return false
  }
}

export async function signIn(email: string, password: string) {
  const client = getSupabaseClient()
  if (!client) throw new Error('Supabase not configured')
  return client.auth.signInWithPassword({ email, password })
}

export async function signOut(): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.auth.signOut()
}

export async function getSession() {
  const client = getSupabaseClient()
  if (!client) return null
  const { data } = await client.auth.getSession()
  return data.session ?? null
}

/**
 * Supabase sync layer — bidirectional trade sync.
 *
 * Requires the trades table to have a user_id column.
 * See tasks/sync_schema.sql for the required Supabase table definition.
 *
 * Sync strategy: last-write-wins based on updated_at timestamp.
 */
import { getSupabaseClient } from './supabase'
import { getTrades, replaceTrades } from './db'
import type { Trade } from '../types'

// Trades stored in Supabase carry an extra user_id field
type RemoteTrade = Trade & { user_id: string }

/** Push one trade to Supabase (upsert). No-op if not configured. */
export async function pushTrade(trade: Trade, userId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').upsert({ ...trade, user_id: userId })
}

/** Delete a trade from Supabase. No-op if not configured. */
export async function deleteSyncedTrade(tradeId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').delete().eq('id', tradeId)
}

/**
 * Full bidirectional sync for all trades.
 * - Pulls all remote trades for the user
 * - Merges with local (newer updated_at wins)
 * - Pushes any local-only trades to Supabase
 * Returns count of records pulled and pushed.
 */
export async function syncTrades(userId: string): Promise<{ pulled: number; pushed: number }> {
  const client = getSupabaseClient()
  if (!client) return { pulled: 0, pushed: 0 }

  const { data: remoteData, error } = await client
    .from('trades')
    .select('*')
    .eq('user_id', userId)

  if (error || !remoteData) return { pulled: 0, pushed: 0 }

  const remote = remoteData as RemoteTrade[]
  const remoteMap = new Map(remote.map(t => [t.id, t]))

  const local = getTrades()
  const localMap = new Map(local.map(t => [t.id, t]))

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()])
  const merged: Trade[] = []
  const toPush: Trade[] = []
  let pulled = 0

  for (const id of allIds) {
    const l = localMap.get(id)
    const r = remoteMap.get(id)

    if (l && r) {
      if (r.updated_at > l.updated_at) {
        // Remote is newer — store as-is (extra user_id field is harmless)
        merged.push(r as unknown as Trade)
        pulled++
      } else {
        merged.push(l)
      }
    } else if (l) {
      // Local-only — needs to be pushed
      merged.push(l)
      toPush.push(l)
    } else if (r) {
      // Remote-only — pull it
      merged.push(r as unknown as Trade)
      pulled++
    }
  }

  // Sort newest first (matches local convention: unshift on save)
  merged.sort((a, b) => b.created_at.localeCompare(a.created_at))
  replaceTrades(merged)

  // Batch push local-only trades
  let pushed = 0
  if (toPush.length > 0) {
    const { error: pushErr } = await client
      .from('trades')
      .upsert(toPush.map(t => ({ ...t, user_id: userId })))
    if (!pushErr) pushed = toPush.length
  }

  return { pulled, pushed }
}

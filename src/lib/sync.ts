/**
 * Supabase sync layer — bidirectional trade sync.
 *
 * Requires the trades table to have a user_id column.
 * See tasks/sync_schema.sql for the required Supabase table definition.
 *
 * Sync strategy: last-write-wins based on updated_at timestamp.
 * Deletions use soft-delete (deleted_at timestamp) so they propagate
 * to all devices on the next sync instead of being pulled back.
 */
import { getSupabaseClient } from './supabase'
import { getTrades, replaceTrades } from './db'
import type { Trade } from '../types'

// Trades stored in Supabase carry extra sync fields
type RemoteTrade = Trade & { user_id: string; deleted_at: string | null }

/**
 * Pure merge of local + remote trade arrays.
 * Strategy: last-write-wins on updated_at. Local-only trades are flagged for push.
 * Exported for testing.
 */
export function mergeTrades(
  local: Trade[],
  remote: Trade[]
): { merged: Trade[]; toPush: Trade[]; pulled: number } {
  const localMap = new Map(local.map(t => [t.id, t]))
  const remoteMap = new Map(remote.map(t => [t.id, t]))
  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()])

  const merged: Trade[] = []
  const toPush: Trade[] = []
  let pulled = 0

  for (const id of allIds) {
    const l = localMap.get(id)
    const r = remoteMap.get(id)
    if (l && r) {
      if (r.updated_at > l.updated_at) {
        merged.push(r)
        pulled++
      } else {
        merged.push(l)
      }
    } else if (l) {
      merged.push(l)
      toPush.push(l)
    } else if (r) {
      merged.push(r)
      pulled++
    }
  }

  merged.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return { merged, toPush, pulled }
}

/** Push one trade to Supabase (upsert). No-op if not configured. */
export async function pushTrade(trade: Trade, userId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').upsert({ ...trade, user_id: userId })
}

/** Soft-delete a trade in Supabase by setting deleted_at. No-op if not configured. */
export async function deleteSyncedTrade(tradeId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').update({ deleted_at: new Date().toISOString() }).eq('id', tradeId)
}

/** Soft-delete multiple trades in Supabase in a single request. No-op if not configured. */
export async function deleteSyncedTrades(tradeIds: string[]): Promise<void> {
  if (tradeIds.length === 0) return
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').update({ deleted_at: new Date().toISOString() }).in('id', tradeIds)
}

/** Soft-delete all trades for a user in Supabase. No-op if not configured. */
export async function deleteAllSyncedTrades(userId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').update({ deleted_at: new Date().toISOString() }).eq('user_id', userId)
}

/**
 * Full bidirectional sync for all trades.
 * - Pulls all remote trades for the user (including soft-deleted)
 * - Removes any local trades that were soft-deleted on another device
 * - Merges active local + active remote (last-write-wins on updated_at)
 * - Pushes any remaining local-only trades to Supabase
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

  // Separate active trades from soft-deleted tombstones
  const deletedIds = new Set(remote.filter(t => t.deleted_at != null).map(t => t.id))
  const activeRemote = remote.filter(t => t.deleted_at == null)

  // Apply remote deletions to local — removes trades deleted on another device
  const localAll = getTrades()
  const local = localAll.filter(t => !deletedIds.has(t.id))
  if (local.length < localAll.length) replaceTrades(local)

  const { merged, toPush, pulled } = mergeTrades(local, activeRemote as unknown as Trade[])
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

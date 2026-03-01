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

/** Delete a trade from Supabase. No-op if not configured. */
export async function deleteSyncedTrade(tradeId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').delete().eq('id', tradeId)
}

/** Delete all trades for a user from Supabase. No-op if not configured. */
export async function deleteAllSyncedTrades(userId: string): Promise<void> {
  const client = getSupabaseClient()
  if (!client) return
  await client.from('trades').delete().eq('user_id', userId)
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
  const local = getTrades()

  const { merged, toPush, pulled } = mergeTrades(local, remote as unknown as Trade[])
  replaceTrades(merged)

  // Batch push local-only trades
  let pushed = 0
  if (toPush.length > 0) {
    // Strip locally-computed fields that aren't in the Supabase schema yet.
    // exit_lots and remaining_qty live in localStorage only until a schema migration is run.
    const { error: pushErr } = await client
      .from('trades')
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .upsert(toPush.map(({ exit_lots, remaining_qty, ...t }) => ({ ...t, user_id: userId })))
    if (!pushErr) pushed = toPush.length
  }

  return { pulled, pushed }
}

/**
 * Supabase Storage helpers for trade screenshots.
 *
 * Requires a public "screenshots" bucket in your Supabase project.
 * Create it at: supabase.com/dashboard → Storage → New bucket → name: "screenshots" → Public: on
 *
 * Storage path layout: {userId}/{tradeId}
 */
import { getSupabaseClient } from './supabase'

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',')
  const mimeMatch = parts[0].match(/:(.*?);/)
  const mime = mimeMatch ? mimeMatch[1] : 'image/png'
  const binary = atob(parts[1] ?? '')
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return new Blob([buffer], { type: mime })
}

/**
 * Upload a screenshot data URL to Supabase Storage.
 * Returns the storage path on success, null on failure or if not configured.
 */
export async function uploadTradeScreenshot(
  tradeId: string,
  dataUrl: string,
  userId: string,
): Promise<string | null> {
  const client = getSupabaseClient()
  if (!client) return null
  try {
    const blob = dataUrlToBlob(dataUrl)
    const path = `${userId}/${tradeId}`
    const { error } = await client.storage
      .from('screenshots')
      .upload(path, blob, { contentType: blob.type, upsert: true })
    return error ? null : path
  } catch {
    return null
  }
}

/**
 * Get a public URL for a screenshot stored in Supabase Storage.
 * Returns null if client is not configured.
 */
export function getStorageScreenshotUrl(storagePath: string): string | null {
  const client = getSupabaseClient()
  if (!client) return null
  const { data } = client.storage.from('screenshots').getPublicUrl(storagePath)
  return data.publicUrl
}

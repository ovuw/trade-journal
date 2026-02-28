import { useState, useEffect } from 'react'

/**
 * Drop-in replacement for useState that persists the value to localStorage.
 * Reads on mount, writes on every change.
 */
export function usePersistentState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored !== null ? (JSON.parse(stored) as T) : defaultValue
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch {
      // Storage full or unavailable — ignore
    }
  }, [key, state])

  return [state, setState]
}
